// Noc: the public class (re-exported by src/game/noc.ts). Modal panels and the HUD: work board, surat kerja,
// briefing, berita acara, work report, daily evaluation, wall board, and Pak Nusa (AI mentor + AI complaint voices).
// State and rules: core.ts (NocCore). Physical work: workshop.ts (NocWorkshop).
import { SWITCHES, live, adapterOf } from '../../pcos/net';
import {
  aiReady,
  aiWhyOff,
  aiCfg,
  aiStats,
  chat,
  mentorPrompt,
  offlineMentor,
  plain,
  offlineComplaint,
  aiComplaints,
  offlineNoteFeedback,
  aiNoteFeedback,
  type MentorCtx,
  type NoteCtx,
} from '../../ai/nusa';
import { h, btn, mmss, esc } from './util';
import { FAULTS } from './faults';
import { TEMPLATES, DAY_PHASES, type TplId } from './contracts';
import { RANKS, offerXp, dayEval } from './scoring';
import type { Job } from './types';
import { NocWorkshop } from './workshop';

export class Noc extends NocWorkshop {
  // ---------------------------------------------------------------- Pak Nusa (AI mentor) + AI complaints + note feedback
  /** rewrite each ticket's complaint line in the voice of the person reporting it (offline phrasing first, AI replaces it when it answers) */
  protected voiceComplaints() {
    const list = this.jobs.filter(j => j.kind === 'ticket' && j.status === 'open');
    const line = (j: Job) => j.order.findIndex(x => x.startsWith('Keluhan: '));
    list.forEach((j, i) => {
      const k = line(j);
      if (k >= 0) {
        j.order[k] = `Keluhan: “${offlineComplaint({ id: j.id, who: j.who, place: j.targets[0].pc.label, symptom: j.title }, this.s.seq + i)}”`;
      }
    });
    if (!aiReady() || !list.length) return;
    aiComplaints(list.map(j => ({ id: j.id, who: j.who, place: j.targets[0].pc.label, symptom: j.title })))
      .then(map => {
        for (const j of list) {
          const k = line(j);
          if (k >= 0 && map[j.id] && j.status === 'open') {
            j.order[k] = `Keluhan: “${map[j.id]}”`;
            j.aiVoice = true;
          }
        }
      })
      .catch(() => {
        /* offline phrasing stays */
      });
  }
  mentorCtx(): MentorCtx {
    const j = this.tracked();
    const pc = this.whereNow.pc;
    let pcState: string | null = null;
    if (pc) {
      try {
        const a = adapterOf(pc),
          l = live(a);
        pcState = `adapter ${a.enabled ? 'aktif' : 'disabled'}, kabel ${a.cable ? (a.broken ? 'rusak' : 'terpasang') : 'lepas'}, ${a.dhcp ? 'DHCP' : 'statis'}, IP ${l.ip || '-'}/${l.prefix || '-'}, gateway ${l.gw || '-'}, DNS ${l.dns.join(',') || '-'}${l.apipa ? ' (APIPA)' : ''}`;
      } catch {
        pcState = null;
      }
    }
    return {
      job: j
        ? {
            id: j.id,
            title: j.title,
            kind: j.kind,
            order: j.order,
            faults: j.faults.map(f => ({ id: f, cause: FAULTS[f].cause, fix: FAULTS[f].fix, hint: FAULTS[f].hint, cp: FAULTS[f].cp })),
            log: [...new Set(j.log)],
            next: this.nextHint(j),
          }
        : null,
      pc: pc ? this.pcLabel(pc) : null,
      pcState,
      rack: this.whereNow.rack,
      rank: this.rank(),
      place: this.whereNow.pc ? 'di meja PC' : this.whereNow.rack ? 'di ruang rak' : 'di gedung/kota',
    };
  }
  /** answer a question: AI when a key is set and online, otherwise the offline rule engine */
  async askNusa(q: string): Promise<{ text: string; ai: boolean }> {
    const ctx = this.mentorCtx();
    const tj = this.tracked();
    if (tj) {
      tj.hint = true;
      if (tj.exam !== undefined) this.toast('Catatan: minta bantuan saat uji kenaikan pangkat membuat uji tidak lulus.', 4200);
    } // asking for help counts like a hint (no no-hint XP bonus)
    if (aiReady()) {
      try {
        const a = plain(await chat(mentorPrompt(ctx, this.nusaHist, q)));
        this.nusaHist.push({ role: 'user', content: q }, { role: 'assistant', content: a });
        return { text: a, ai: true };
      } catch {
        /* fall through */
      }
    }
    return { text: offlineMentor(ctx, q), ai: false };
  }
  openNusa() {
    const box = h('div', 'noc-box nusa');
    const mode = aiReady() ? `AI aktif · ${esc(aiCfg.model)}` : `Mode offline (tanpa AI) · ${aiWhyOff()}`;
    box.append(h('h2', '', 'Pak Nusa · Mentor Teknisi'));
    box.append(h('p', 'nusa-mode', `<span class="${aiReady() ? 'on' : 'off'}">●</span> ${mode}`));
    const log = h('div', 'nusa-log');
    const paint = () => {
      log.innerHTML = this.nusaView.length
        ? this.nusaView
            .map(
              m =>
                `<div class="${m.me ? 'me' : 'pn'}">${m.me ? '' : `<b>Pak Nusa</b>${m.ai ? '<i class="ai-tag" title="Dibuat oleh AI, bisa keliru">AI</i>' : '<i class="off-tag">offline</i>'}<br>`}${esc(m.text).replace(/\n/g, '<br>')}</div>`,
            )
            .join('') + (this.nusaBusy ? '<div class="pn typing">Pak Nusa mengetik…</div>' : '')
        : '<div class="pn"><b>Pak Nusa</b><br>Halo! Saya mentor teknisi di sini. Tanya apa saja soal pekerjaanmu. Saya kasih arah diagnosisnya, kamu yang membuktikan di perangkat.</div>';
      log.scrollTop = log.scrollHeight;
    };
    const send = async (q: string) => {
      q = q.trim();
      if (!q || this.nusaBusy) return;
      this.nusaView.push({ me: true, text: q, ai: false });
      this.nusaBusy = true;
      paint();
      const a = await this.askNusa(q);
      this.nusaBusy = false;
      this.nusaView.push({ me: false, text: a.text, ai: a.ai });
      if (this.nusaView.length > 30) this.nusaView.splice(0, this.nusaView.length - 30);
      if (this.modal?.contains(log)) paint();
    };
    const quick = h('div', 'row left nusa-quick');
    for (const [lb, q, id] of [
      ['Aku harus ngapain?', 'Aku harus ngapain sekarang?', 'nusa-q1'],
      ['Kenapa ini terjadi?', 'Kenapa gangguan ini bisa terjadi? Kasih arah diagnosisnya.', 'nusa-q2'],
      ['Jelaskan konsepnya', 'Jelaskan konsep jaringan yang dipakai di pekerjaan ini dengan bahasa sederhana.', 'nusa-q3'],
    ] as [string, string, string][])
      quick.append(btn(lb, () => send(q), 'btn', id));
    const form = h('form', 'nusa-form') as HTMLFormElement;
    const inp = h('input', '') as HTMLInputElement;
    inp.type = 'text';
    inp.placeholder = 'Tulis pertanyaan… (misal: kenapa dapat IP 169.254?)';
    inp.maxLength = 300;
    inp.id = 'nusa-input';
    form.append(
      inp,
      btn('Kirim', () => {}, 'btn pri', 'nusa-send'),
    );
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = inp.value;
      inp.value = '';
      void send(v);
    });
    (form.querySelector('button[name="nusa-send"]') as HTMLButtonElement).type = 'submit';
    box.append(log, quick, form);
    box.append(
      h(
        'p',
        'how',
        'Jawaban berlabel <b>AI</b> dibuat model bahasa (OpenRouter atau AI lokal, sesuai Pengaturan) dan bisa keliru: selalu buktikan di perangkat. Yang dikirim hanya data simulasi game dan pertanyaanmu, tanpa data pribadi. Bertanya ke Pak Nusa dihitung seperti memakai petunjuk.',
      ),
    );
    const rw = h('div', 'row');
    rw.append(btn('Tutup [Esc]', () => this.closeModal(), 'btn', 'nusa-close'));
    box.append(rw);
    this.show(box, false);
    paint();
    setTimeout(() => inp.focus(), 30);
  }
  protected noteCtx(j: Job): NoteCtx {
    const f = j.faults[0];
    return {
      id: j.id,
      title: j.title,
      symptom: j.kind === 'ticket' && f ? FAULTS[f].symptom : (j.order[0] ?? j.title),
      cause: j.kind === 'ticket' ? (j.detail ?? j.faults.map(x => FAULTS[x].cause).join(' + ')) : 'pekerjaan instalasi/konfigurasi sesuai surat kerja',
      fix: j.kind === 'ticket' ? j.faults.map(x => FAULTS[x].fix).join(' + ') : j.order.slice(0, 3).join(' | '),
      log: [...new Set(j.log)],
      tested: j.targets.every(t => t.tested),
    };
  }
  /** the closing-note box inside a job report */
  protected noteBox(j: Job) {
    const wrap = h('div', 'note-box');
    wrap.append(h('p', '', '<b>Catatan penutupan tiket</b> <small>(tulis seperti teknisi sungguhan: gejala, penyebab, tindakan, bukti uji)</small>'));
    const ta = h('textarea', '') as HTMLTextAreaElement;
    ta.id = 'note-text';
    ta.rows = 3;
    ta.maxLength = 800;
    ta.placeholder =
      'Contoh: PC Kasir 2 tidak bisa buka situs. Ternyata DNS diarahkan ke server yang salah. DNS dikembalikan ke otomatis. Tes: nslookup cari.id berhasil, situs terbuka.';
    const prev = this.notes.find(n => n.id === j.id);
    if (prev) ta.value = prev.note;
    const fb = h('div', 'note-fb');
    const run = async () => {
      const note = ta.value.trim();
      if (!note) {
        fb.innerHTML = '<span class="warn">Tulis catatannya dulu.</span>';
        return;
      }
      const i = this.notes.findIndex(n => n.id === j.id);
      const rec = { id: j.id, title: j.title, note, t: Date.now() };
      if (i >= 0) this.notes[i] = rec;
      else this.notes.push(rec);
      if (this.notes.length > 30) this.notes.shift();
      this.save();
      const off = offlineNoteFeedback(this.noteCtx(j), note);
      const chips = (Object.entries(off.parts) as [string, boolean][])
        .map(([k, v]) => `<span class="chip ${v ? 'ok' : 'no'}">${v ? '✔' : '✘'} ${k}</span>`)
        .join(' ');
      fb.innerHTML = `${chips}<div class="nusa-fb"><b>Pak Nusa</b> <i class="off-tag">offline</i><br>${esc(off.text)}</div>`;
      if (aiReady()) {
        fb.insertAdjacentHTML('beforeend', '<div class="nusa-fb typing">Pak Nusa (AI) membaca catatanmu…</div>');
        try {
          const a = await aiNoteFeedback(this.noteCtx(j), note);
          fb.querySelector('.typing')?.remove();
          fb.insertAdjacentHTML(
            'beforeend',
            `<div class="nusa-fb"><b>Pak Nusa</b> <i class="ai-tag" title="Dibuat oleh AI, bisa keliru">AI</i><br>${esc(a).replace(/\n/g, '<br>')}</div>`,
          );
        } catch {
          const t = fb.querySelector('.typing');
          if (t) t.textContent = 'AI tidak bisa dihubungi, pakai umpan balik offline di atas.';
        }
      }
    };
    const rw = h('div', 'row left');
    rw.append(btn('Simpan & minta umpan balik', () => void run(), 'btn', 'note-send'));
    wrap.append(ta, rw, fb);
    return wrap;
  }
  aiInfo() {
    return { ready: aiReady(), model: aiCfg.model, ...aiStats, notes: this.notes.length };
  }
  /** device modules show their panels in the board modal */
  showPanel(el: HTMLElement) {
    this.show(el);
  }
  logLine(s: string) {
    this.logAll(s);
    this.check(false);
  }
  protected renderHud() {
    const open = this.openJobs();
    const done = this.jobs.length - open.length;
    const j = this.tracked();
    this.hud.classList.add('on');
    // contextual: full card when standing still or right after progress; compact strip while walking
    const sig = j ? `${j.id}|${j.targets.map(t => +t.ok + +t.tested).join('')}|${this.nextHint(j)}` : '';
    if (sig !== this.hudSig) {
      this.hudSig = sig;
      this.hudFull = 6;
    }
    this.hudWalk = this.playerMoving ? this.hudWalk + 0.25 : 0;
    this.hudFull = Math.max(0, this.hudFull - 0.25);
    this.hud.classList.toggle('compact', this.hudWalk > 2 && this.hudFull <= 0);
    const bag = [this.inv.tester && 'LAN tester', this.inv.console && 'console', this.inv.laptop && 'laptop', this.inv.patch && `${this.inv.patch}× patch cord`]
      .filter(Boolean)
      .join(' · ');
    if (!j) {
      this.hud.innerHTML = `<b>${this.mode === 'shift' ? `SHIFT ${this.shift}` : 'SURAT KERJA'}</b> · ${done}/${this.jobs.length} selesai<div class="keys"><kbd>T</kbd> Papan kerja</div>`;
      return;
    }
    const left = j.sla - Math.max(0, j.age);
    const rows = j.targets
      .slice(0, 5)
      .map(
        t =>
          `<div class="tg"><i class="st ${t.ok ? (t.tested ? 'ok' : 'part') : 'no'}"></i>${esc(t.pc.label)}${t.ok && !t.tested ? ' <em>uji dari PC ini</em>' : ''}</div>`,
      )
      .join('');
    const g = this.globalProblem(j);
    this.hud.innerHTML = `<div class="top"><b>${this.mode === 'shift' ? `SHIFT ${this.shift}` : 'SURAT KERJA'}</b><span>${done}/${this.jobs.length} selesai</span></div>
      <div class="tk"><span class="pr p-${j.prio}">${j.prio}</span> <b>${j.id}</b> <span class="sla ${left < 0 ? 'late' : left < 60 ? 'warn' : ''}">SLA ${mmss(left)}</span></div>
      <div class="ttl">${esc(j.kind === 'ticket' ? `“${j.title}”` : j.title)}</div>${this.stageBar(j)}${rows}${g ? `<div class="gp"><i class="st no"></i>${esc(g)}</div>` : ''}
      <div class="nx">${esc(this.nextHint(j))}</div>
      ${j.hint && j.kind === 'ticket' ? `<div class="hint">Petunjuk: ${FAULTS[j.faults[0]].hint}</div>` : ''}
      ${bag ? `<div class="bag">Dibawa: ${bag}</div>` : ''}<div class="keys"><kbd>T</kbd> Papan kerja <kbd>J</kbd> Pak Nusa</div>`;
  }

  /** survei → kerja → uji → dokumentasi, read from the real job state */
  stage(j: Job): 0 | 1 | 2 | 3 | 4 {
    const ok = j.targets.every(t => t.ok) && !this.globalProblem(j);
    if (j.status === 'closed') return 4;
    if (j.docReady) return 3;
    if (ok) return 2;
    if (j.surveyed || j.targets.some(t => t.ok)) return 1;
    return 0;
  }
  protected stageBar(j: Job) {
    if (j.tut) return '';
    const n = this.stage(j);
    return `<div class="stg">${['Survei', 'Kerja', 'Uji', 'Dokumentasi'].map((x, i) => `<span class="${i < n ? 'done' : i === n ? 'cur' : ''}">${x}</span>`).join('')}</div>`;
  }
  /** berita acara: written by the technician, signed, then the job closes (live state re-checked first) */
  /** a berita acara is a signed record: every IP it names must match the job's real addressing, and it must say how the work was verified */
  beritaFacts(j: Job, text: string): string {
    const IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    const known = new Set<string>();
    for (const src of [...j.order, ...j.log, j.detail ?? '']) for (const m of src.match(IP) ?? []) known.add(m);
    for (const t of j.targets) {
      const l = live(adapterOf(t.pc.name));
      for (const v of [l.ip, l.gw, ...l.dns]) if (v) known.add(v);
    }
    for (const t of j.targets) {
      const l = live(adapterOf(t.pc.name));
      if (l.ip && l.prefix) {
        const net = l.ip.split('.').slice(0, 3).join('.');
        known.add(`${net}.0`);
        known.add(`${net}.255`);
      }
    }
    const bad = (text.match(IP) ?? []).filter(x => !known.has(x));
    if (bad.length) {
      const l = j.targets[0] ? live(adapterOf(j.targets[0].pc.name)) : null;
      return `Alamat ${bad[0]} tidak cocok dengan hasil kerja di lapangan${l?.ip ? ` (${j.targets[0].pc.label}: IP ${l.ip}, gateway ${l.gw || '-'})` : ''}. Berita acara ditandatangani, jadi isinya harus sesuai fakta.`;
    }
    if (!/\b(ping|tes|tester|uji|diuji|dites|ipconfig|nslookup|cetak|print|browser|buka|wiremap|verifikasi|cek)\b/i.test(text))
      return 'Tulis juga cara kamu membuktikan hasilnya (mis. LAN tester 1–8 lolos, ping gateway berhasil, situs terbuka dari PC).';
    return '';
  }
  signBerita(j: Job, text: string): string {
    if (j.status === 'closed') return 'Sudah ditutup.';
    if (text.trim().length < 25) return 'Tulis uraian penyebab & tindakan minimal satu kalimat (25 huruf).';
    const fact = this.beritaFacts(j, text);
    if (fact) return fact;
    for (const t of j.targets)
      if (!this.targetOk(j, t)) {
        t.ok = false;
        t.tested = false;
        j.docReady = false;
        return `Belum bisa ditandatangani: ${t.pc.label} tidak lagi lolos uji (${t.note || 'cek ulang'}).`;
      }
    if (this.globalProblem(j)) {
      j.docReady = false;
      return 'Belum bisa ditandatangani: masih ada masalah di jaringan.';
    }
    j.berita = text.trim().slice(0, 600);
    j.log.push('Berita acara ditandatangani & diserahkan');
    this.close(j);
    return '';
  }

  // ---------------------------------------------------------------- UI
  /** other modules (the school lab) use the same modal so pause/pointer-lock behave the same */
  present(el: HTMLElement) {
    this.show(el);
  }
  protected show(el: HTMLElement, focusBtn = true) {
    const wasOpen = !!this.modal;
    if (this.modal) this.modal.remove();
    this.modal = h('div', 'noc-modal');
    this.modal.append(el);
    document.body.append(this.modal);
    if (document.pointerLockElement) document.exitPointerLock();
    this.modal.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') this.closeModal();
    });
    if (focusBtn) (this.modal.querySelector('button') as HTMLButtonElement | null)?.focus();
    if (!wasOpen) this.listeners.forEach(f => f(true));
  }
  closeModal() {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.cli = null;
    this.term = null;
    this.sel = null;
    this.probing = false;
    this.listeners.forEach(f => f(false));
  }

  openBoard(msg = '') {
    const box = h('div', 'noc-box');
    const rk = this.rankIndex(),
      nx = RANKS[rk + 1];
    const pct = nx ? Math.round(((this.s.xp - RANKS[rk].xp) / (nx.xp - RANKS[rk].xp)) * 100) : 100;
    box.append(h('h2', '', 'Papan Kerja NOC · Nusantara Tech'));
    box.append(
      h(
        'div',
        'rank',
        `<b>${this.rank()}</b> · ${this.s.xp} XP ${nx ? `· ${nx.xp - this.s.xp} XP lagi ke ${nx.name}` : ''}<div class="bar"><i style="width:${pct}%"></i></div><small>Surat kerja selesai: ${this.s.contracts} · Shift: ${this.s.shifts - (this.mode === 'shift' ? 1 : 0)} · Tiket ditutup: ${this.s.closed} · Bintang: ${this.s.stars}</small>`,
      ),
    );
    if (msg) box.append(h('p', 'msg', msg));
    if (this.mode !== 'idle') {
      const tb = h('table', 'tk-list', '<tr><th>No.</th><th>Prioritas</th><th>Pekerjaan · Lokasi</th><th>SLA</th><th>Status</th><th></th></tr>');
      for (const t of this.jobs) {
        const tr = h('tr', t.id === this.trackedId ? 'cur' : '');
        const left = t.sla - Math.max(0, t.age);
        const st =
          t.status === 'closed'
            ? `Selesai ${'★'.repeat(t.stars ?? 0)} +${t.xp}`
            : t.age < 0
              ? 'Antre'
              : `${t.targets.filter(x => x.ok && x.tested).length}/${t.targets.length} beres`;
        tr.innerHTML = `<td>${t.id}</td><td><span class="pr p-${t.prio}">${t.prio}</span></td><td>${esc(t.title)}<br><small>${esc(t.order[0] ?? '')}</small></td><td>${t.status === 'closed' ? (t.slaMet ? 'Tepat' : 'Telat') : mmss(left)}</td><td>${st}</td>`;
        const td = h('td');
        if (t.status !== 'closed') {
          td.append(
            btn(t.id === this.trackedId ? 'Dilacak' : 'Lacak', () => {
              this.trackedId = t.id;
              this.openBoard();
            }),
          );
          td.append(btn('Surat', () => this.openOrder(t)));
        }
        tr.append(td);
        tb.append(tr);
      }
      box.append(tb);
      box.append(
        h(
          'p',
          'how',
          'Ikuti penanda ke lokasi berikutnya. Perbaiki di PC (Jendela 11: CMD, Network Connections, browser ke router), di kabel [C], atau di rak switch [F]. Pekerjaan selesai saat jaringannya benar-benar normal <b>dan</b> kamu mengujinya dari PC itu.',
        ),
      );
      if (this.mode === 'contract') {
        const rw = h('div', 'row left');
        rw.append(btn('Batalkan surat kerja', () => this.abandon(), 'btn', 'abandon'));
        box.append(rw);
      }
    } else {
      const d = this.s.day,
        nn = d ? d.n : this.s.days + 1;
      const dp = h('div', 'daybox');
      dp.append(
        h(
          'div',
          'day-h',
          `<b>Hari Kerja ${nn}</b><small>${this.s.days} hari selesai · rangkaian ${this.s.streak} · SLA ${Math.round(Math.max(0.7, 1 - (nn - 1) * 0.03) * 100)}%</small>`,
        ),
      );
      dp.append(
        h(
          'ol',
          'day-steps',
          DAY_PHASES.map(
            (p, i) =>
              `<li class="${d && i < d.phase ? 'done' : d && i === d.phase ? 'cur' : ''} ${i === 2 && rk < 1 ? 'lock' : ''}"><b>${p.name}</b><small>${i === 2 && rk < 1 ? 'terbuka di Teknisi Junior' : p.what}</small></li>`,
          ).join(''),
        ),
      );
      const dr = h('div', 'row left');
      dr.append(
        d
          ? btn(`Lanjut: ${DAY_PHASES[d.phase].name}`, () => this.nextPhase(), 'btn pri', 'day-continue')
          : btn(`Mulai Hari ${nn}`, () => this.startDay(), 'btn pri', 'start-day'),
      );
      dp.append(dr);
      box.append(dp);
      this.ensureOffers();
      const ex = this.examFor();
      if (ex > 0) {
        box.append(h('h3', '', `Uji kenaikan pangkat · ${RANKS[ex].name}`));
        box.append(
          h(
            'p',
            'how',
            `XP kamu sudah cukup untuk ${RANKS[ex].name}. Pangkat baru naik setelah lulus uji: satu surat kerja tingkat ${RANKS[ex - 1].name}, SLA 80%, tanpa minta bantuan Pak Nusa, minimal ★★.`,
          ),
        );
        const er = h('div', 'row left');
        const eb = btn(
          'Ikut uji kenaikan pangkat',
          () => {
            this.closeModal();
            this.startExam();
          },
          'btn pri',
          'exam-start',
        );
        eb.disabled = !!d;
        er.append(eb);
        box.append(er);
      }
      box.append(h('h3', '', d ? 'Kerja bebas (setelah hari ini selesai)' : 'Kerja bebas · surat kerja tersedia'));
      const grid = h('div', 'offers');
      this.offers.forEach((o, i) => {
        const c = h(
          'div',
          'offer',
          `<b>${TEMPLATES[o.tpl].name}</b><small>${TEMPLATES[o.tpl].cp} · SLA ${Math.round(TEMPLATES[o.tpl].sla / 60)} menit · ${o.tpl === 'tutor' ? '' : '±'}${offerXp(o.tpl)} XP</small><p>${esc(o.lines[0])}</p>`,
        );
        const ob = btn(
          'Ambil',
          () => {
            this.closeModal();
            this.acceptContract(o.tpl, o.seed);
          },
          'btn',
          `offer-${i}`,
        );
        ob.disabled = !!this.s.day;
        c.append(ob);
        grid.append(c);
      });
      box.append(grid);
      const locked = (Object.keys(TEMPLATES) as TplId[]).filter(t => TEMPLATES[t].rank > rk);
      if (locked.length) box.append(h('p', 'how', `Terbuka nanti: ${locked.map(t => `${TEMPLATES[t].name} (${RANKS[TEMPLATES[t].rank].name})`).join(' · ')}`));
      box.append(h('h3', '', 'Shift helpdesk'));
      box.append(
        h(
          'p',
          'how',
          `Satu shift = ${Math.min(5, 3 + rk)} tiket gangguan acak di PC gedung, masing-masing dengan SLA. Gangguan yang sering lambat kamu tangani akan lebih sering muncul.`,
        ),
      );
    }
    const row = h('div', 'row');
    if (this.mode === 'idle' && !this.s.day) row.append(btn('Mulai Shift', () => this.startShift(), 'btn', 'start-shift'));
    row.append(btn('Tutup [Esc]', () => this.closeModal()));
    box.append(row);
    box.classList.add('mon');
    box.prepend(
      h(
        'div',
        'mon-bar',
        `<span>NOC-MON-01 · ${this.mode === 'idle' ? 'SURAT KERJA' : this.mode === 'shift' ? `SHIFT ${this.shift}` : 'KONTRAK'}</span><span>${this.openJobs().length} terbuka</span>`,
      ),
    );
    this.show(box);
    this.modal?.classList.add('dock');
  }
  /** live queue drawn on the NOC video wall in the L1 IT office (CanvasTexture, 1024x576) */
  drawWall(g: CanvasRenderingContext2D, clock: string) {
    const W = 1024,
      H = 576,
      Y = '#f0c02e';
    g.fillStyle = '#0d0f12';
    g.fillRect(0, 0, W, H);
    g.fillStyle = Y;
    g.fillRect(0, 0, W, 6);
    g.font = '700 30px Bahnschrift, "Arial Narrow", sans-serif';
    g.fillStyle = '#ebe7de';
    g.textAlign = 'left';
    g.fillText('NOC NUSANTARA TECH', 32, 56);
    g.font = '600 22px ui-monospace, Consolas, monospace';
    g.fillStyle = '#8f969d';
    g.textAlign = 'right';
    g.fillText(`${this.mode === 'shift' ? `SHIFT ${this.shift}` : this.mode === 'contract' ? 'KONTRAK' : 'SIAGA'} · ${clock}`, W - 32, 56);
    g.fillStyle = '#2a2e34';
    g.fillRect(32, 76, W - 64, 2);
    const jobs = this.jobs.slice(0, 6);
    g.textAlign = 'left';
    if (!jobs.length) {
      g.font = '600 34px "Segoe UI", Roboto, sans-serif';
      g.fillStyle = '#43c07f';
      g.fillText('Semua layanan normal', 32, 150);
      g.font = '24px "Segoe UI", Roboto, sans-serif';
      g.fillStyle = '#c9c6be';
      g.fillText('Tidak ada tiket terbuka. Ambil surat kerja atau mulai shift di papan kerja [T].', 32, 196);
      return;
    }
    g.font = '600 18px ui-monospace, Consolas, monospace';
    g.fillStyle = '#8f969d';
    g.fillText('NO.', 32, 110);
    g.fillText('PRIO', 170, 110);
    g.fillText('GANGGUAN', 290, 110);
    g.fillText('SLA', 790, 110);
    g.fillText('STATUS', 880, 110);
    jobs.forEach((t, i) => {
      const y = 128 + i * 72,
        left = t.sla - Math.max(0, t.age);
      if (t.id === this.trackedId) {
        g.fillStyle = 'rgba(240,192,46,.08)';
        g.fillRect(24, y, W - 48, 64);
        g.fillStyle = Y;
        g.fillRect(24, y, 5, 64);
      }
      g.fillStyle = '#ebe7de';
      g.font = '600 22px ui-monospace, Consolas, monospace';
      g.fillText(t.id, 32, y + 30);
      g.fillStyle = t.prio === 'Tinggi' ? '#e2574c' : t.prio === 'Sedang' ? Y : '#5bb8d6';
      g.fillRect(170, y + 12, 96, 26);
      g.fillStyle = t.prio === 'Tinggi' ? '#fff' : '#17140a';
      g.font = '700 16px ui-monospace, Consolas, monospace';
      g.fillText(t.prio.toUpperCase(), 178, y + 31);
      let tt = t.title;
      g.font = '22px "Segoe UI", Roboto, sans-serif';
      while (g.measureText(tt).width > 480 && tt.length > 4) tt = tt.slice(0, -2);
      if (tt !== t.title) tt += '…';
      g.fillStyle = '#ebe7de';
      g.fillText(tt, 290, y + 30);
      g.fillStyle = '#8f969d';
      g.font = '17px "Segoe UI", Roboto, sans-serif';
      g.fillText((t.order[0] ?? '').slice(0, 60), 290, y + 54);
      g.font = '600 22px ui-monospace, Consolas, monospace';
      g.fillStyle = t.status === 'closed' ? '#8f969d' : left < 0 ? '#e2574c' : left < 60 ? Y : '#ebe7de';
      g.fillText(t.status === 'closed' ? '--:--' : mmss(left), 790, y + 30);
      const st = t.status === 'closed' ? 'SELESAI' : t.age < 0 ? 'ANTRE' : `${t.targets.filter(x => x.ok && x.tested).length}/${t.targets.length}`;
      g.fillStyle = t.status === 'closed' ? '#43c07f' : '#c9c6be';
      g.fillText(st, 880, y + 30);
    });
  }
  /** Mode Juri: drop whatever is running without a result or a streak penalty (the network keeps its state) */
  demoClear() {
    for (const j of this.openJobs()) j.status = 'closed';
    this.mode = 'idle';
    this.trackedId = null;
    this.jobs = [];
    this.closeModal();
  }
  protected abandon() {
    for (const j of this.openJobs()) j.status = 'closed';
    if (this.s.day) {
      this.s.day = null;
      this.s.streak = 0;
      this.save();
    }
    this.mode = 'idle';
    this.trackedId = null;
    this.jobs = [];
    this.openBoard('Surat kerja dibatalkan. Perubahan yang sudah kamu buat di jaringan tetap ada.');
  }
  openOrder(j: Job) {
    const box = h('div', 'noc-box paper');
    const spk = j.kind === 'contract';
    const cp = spk ? TEMPLATES[j.tpl as TplId].cp : j.kind === 'ticket' ? FAULTS[j.faults[0]].cp : 'Konsekuensi pekerjaan sebelumnya';
    const comp = j.order.filter(x => x.startsWith('Keluhan: '));
    const rest = j.order.filter(x => !x.startsWith('Keluhan: '));
    box.append(
      h(
        'div',
        'pp-head',
        `<div><b>NUSANTARA TECH</b><small>Divisi IT &amp; Jaringan · Gedung Sudirman</small></div><div class="pp-no"><small>${spk ? 'SURAT PERINTAH KERJA' : 'TIKET GANGGUAN'}</small><b>${spk ? 'SPK' : 'TKT'}-${esc(j.id.replace(/^[A-Z]+-/, ''))}</b></div>`,
      ),
    );
    box.append(h('h2', '', esc(j.title)));
    box.append(
      h(
        'table',
        'pp-fields',
        `<tr><th>Prioritas</th><td><span class="pr p-${j.prio}">${j.prio}</span></td><th>Batas waktu (SLA)</th><td class="mono">${mmss(j.sla)}</td></tr><tr><th>Kompetensi</th><td colspan="3">${esc(cp)}</td></tr>`,
      ),
    );
    if (rest.length) box.append(h('div', 'pp-sec', `<small>RINCIAN PEKERJAAN</small>${rest.map(x => `<div class="pp-line">${esc(x)}</div>`).join('')}`));
    if (comp.length)
      box.append(
        h(
          'div',
          'pp-sec',
          `<small>KELUHAN PELAPOR</small>${comp.map(x => `<blockquote>${esc(x.slice(9))}${j.aiVoice ? ' <i class="ai-tag" title="Kalimat keluhan ditulis AI dari gejala aslinya">AI</i>' : ''}</blockquote>`).join('')}`,
        ),
      );
    box.append(
      h(
        'div',
        'pp-sign',
        `<div><small>Diterbitkan oleh</small><b>Kak Rani</b><span>Supervisor NOC</span></div><div><small>Teknisi pelaksana</small><b>${esc(this.playerName() || this.rank())}</b><span>${this.playerName() ? `${esc(this.rank())} · ` : ''}${j.status === 'closed' ? 'sudah dikerjakan' : 'tanda tangan setelah selesai'}</span></div><i class="stamp ${j.status === 'closed' ? 'done' : ''}">${j.status === 'closed' ? 'SELESAI' : 'DITERIMA'}</i>`,
      ),
    );
    const rw = h('div', 'row');
    if (spk) rw.append(btn('Briefing', () => this.openBrief(j)));
    if (j.status === 'open' && j.docReady) {
      const log = [...new Set(j.log)].slice(-8);
      const ba = h(
        'div',
        'pp-sec',
        `<small>BERITA ACARA PEKERJAAN</small><div class="pp-line">Hasil uji: ${j.targets.map(t => esc(t.pc.label) + ' lolos').join(' · ')}</div>${log.map(x => `<div class="pp-line">${esc(x)}</div>`).join('')}<label class="pp-line">Uraian penyebab &amp; tindakan (ditulis teknisi):</label>`,
      );
      const ta = document.createElement('textarea');
      ta.name = 'ba-note';
      ta.rows = 3;
      ta.className = 'ba-note';
      ta.placeholder = 'Contoh: kabel di outlet putus, dibuat patch cord baru T568B, dites LAN tester 1–8, ping gateway berhasil.';
      ta.addEventListener('keydown', e => e.stopPropagation());
      const msg = h('div', 'pp-line', '');
      ba.append(ta, msg);
      box.append(ba);
      rw.append(
        btn(
          'Tanda tangan & serahkan',
          () => {
            const m = this.signBerita(j, ta.value);
            if (m) msg.textContent = m;
            else this.closeModal();
          },
          'btn pri',
          'ba-sign',
        ),
      );
      rw.append(btn('Nanti', () => this.closeModal(), 'btn', 'order-ok'));
    } else rw.append(btn('Mulai kerja', () => this.closeModal(), 'btn pri', 'order-ok'));
    box.append(rw);
    this.show(box);
  }
  protected openBrief(j: Job) {
    const T = TEMPLATES[j.tpl as TplId];
    const box = h('div', 'noc-box paper');
    box.append(
      h(
        'div',
        'pp-head',
        `<div><b>NUSANTARA TECH</b><small>Catatan briefing supervisor</small></div><div class="pp-no"><small>BRIEFING</small><b>${esc(j.id)}</b></div>`,
      ),
    );
    box.append(h('h2', '', `Briefing Kak Rani · ${T.name}`));
    box.append(h('ol', 'pp-brief', T.brief.map(x => `<li>${esc(x)}</li>`).join('')));
    const rw = h('div', 'row');
    rw.append(btn('Lihat surat kerja', () => this.openOrder(j), 'btn pri', 'brief-ok'));
    box.append(rw);
    this.show(box);
  }
  protected openReport(j: Job) {
    const box = h('div', 'noc-box');
    box.append(
      h('h2', '', `Laporan kerja ${j.id} <span class="stars">${'★'.repeat(j.stars!)}${'☆'.repeat(3 - j.stars!)}</span><i class="stamp done mini">SELESAI</i>`),
    );
    const lines: string[] = [];
    lines.push(`<b>Pekerjaan:</b> ${esc(j.title)}`);
    if (j.berita) lines.push(`<b>Berita acara:</b> ${esc(j.berita)}`);
    if (j.kind === 'ticket')
      lines.push(
        `<b>Temuan:</b> ${j.detail ? esc(j.detail) + (j.faults.length > 1 ? ' + ' : '') : ''}${j.faults
          .filter((f, i) => !(i === 0 && j.detail))
          .map(f => `${FAULTS[f].cause} → ${FAULTS[f].fix}`)
          .join(' + ')} <small>(${j.faults.map(f => FAULTS[f].cp).join(' · ')})</small>`,
      );
    if (j.kind === 'contract')
      lines.push(
        `<b>Hasil:</b> ${j.targets
          .map(t =>
            esc(
              `${t.pc.label}: ${(() => {
                const l = live(adapterOf(t.pc.name));
                return `${l.ip}/${l.prefix}${adapterOf(t.pc.name).dhcp ? ' (DHCP)' : ' (statis)'}`;
              })()}`,
            ),
          )
          .join(' · ')}`,
      );
    box.append(h('div', 'order', lines.map(x => `<div>${x}</div>`).join('')));
    const log = [...new Set(j.log)].filter(x => !/berhasil$/.test(x) || true).slice(-14);
    box.append(h('p', '', '<b>Yang kamu kerjakan</b> <small>(dicatat otomatis)</small>'));
    box.append(h('div', 'log', log.length ? log.map(x => `<div>${esc(x)}</div>`).join('') : '<div>-</div>'));
    const crit = [
      `${j.slaMet ? '✔' : '✘'} Waktu ${mmss(Math.max(0, j.age))} dari SLA ${mmss(j.sla)}`,
      `${j.collateral!.length ? '✘' : '✔'} ${
        j.collateral!.length
          ? `Ada ${j.collateral!.length} PC lain yang jadi putus: ${j
              .collateral!.slice(0, 3)
              .map(n => esc(this.pcLabel(n)))
              .join(', ')} (masuk sebagai keluhan susulan)`
          : 'Tidak ada perangkat lain yang terganggu'
      }`,
      `${j.wrong || (j.swTouched && SWITCHES.some(s => s.dirty)) ? '✘' : '✔'} ${j.wrong ? `${j.wrong} material/langkah terbuang` : j.swTouched && SWITCHES.some(s => s.dirty) ? 'Konfigurasi switch belum disimpan (write memory)' : 'Rapi: tanpa material terbuang, konfigurasi tersimpan'}`,
    ];
    box.append(h('div', 'crit', crit.map(x => `<div>${x}</div>`).join('')));
    box.append(this.noteBox(j));
    const before = this.rankIndex();
    let examMsg = '';
    if (!j.reported) {
      this.s.xp += j.xp!;
      j.reported = true;
      if (j.exam !== undefined) {
        const pass = j.stars! >= 2 && !j.hint;
        if (pass) this.s.cert = Math.max(this.s.cert ?? 0, j.exam);
        examMsg = pass
          ? `Lulus uji kenaikan pangkat ${RANKS[j.exam].name}.`
          : `Belum lulus uji kenaikan pangkat (${j.hint ? 'minta bantuan saat uji' : 'nilai di bawah ★★'}). Ulangi dari papan kerja kapan saja.`;
      }
      this.save();
    }
    const up = this.rankIndex() > before;
    if (examMsg) box.append(h('p', 'msg', examMsg));
    box.append(h('p', '', `<b>+${j.xp} XP</b> · total ${this.s.xp} XP`));
    if (up) box.append(h('p', 'msg', `Naik pangkat: <b>${this.rank()}</b>! Surat kerja dan jenis gangguan baru terbuka.`));
    const row = h('div', 'row');
    const allDone = this.jobs.every(x => x.status === 'closed') && !this.pendingReport.length; // later reports still queued: show them first
    row.append(
      btn(
        allDone ? (this.mode === 'shift' ? 'Lihat rekap shift' : 'Kembali ke papan kerja') : 'Lanjut',
        () => (allDone ? this.endWork() : this.closeModal()),
        'btn pri',
        'report-ok',
      ),
    );
    box.append(row);
    this.show(box);
  }
  protected endDay() {
    const d = this.s.day;
    if (!d) return;
    const ev = dayEval(d, this.s.streak);
    const { allSla, avg, bonus } = ev;
    this.s.streak = ev.streak;
    const before = this.rankIndex();
    this.s.xp += bonus;
    this.s.days = d.n;
    this.s.best = Math.max(this.s.best, Math.round(avg * 10));
    this.s.day = null;
    this.save();
    const box = h('div', 'noc-box paper');
    box.append(
      h(
        'div',
        'pp-head',
        `<div><b>NUSANTARA TECH</b><small>Evaluasi harian supervisor</small></div><div class="pp-no"><small>HARI KERJA</small><b>${d.n}</b></div>`,
      ),
    );
    box.append(h('h2', '', `Evaluasi Hari ${d.n}`));
    box.append(
      h(
        'table',
        'pp-fields',
        `<tr><th>Pekerjaan selesai</th><td class="mono">${d.jobs}</td><th>Tepat SLA</th><td class="mono">${d.sla}/${d.jobs}</td></tr><tr><th>Rata-rata bintang</th><td class="mono">${avg.toFixed(1)}</td><th>XP hari ini</th><td class="mono">${d.xp}</td></tr><tr><th>Bonus harian</th><td class="mono">+${bonus}</td><th>Rangkaian hari baik</th><td class="mono">${this.s.streak}</td></tr>`,
      ),
    );
    const note =
      avg >= 2.5 && allSla
        ? 'Kerja rapi dan cepat. Besok beban dan SLA lebih ketat.'
        : avg >= 2
          ? 'Cukup baik. Perhatikan SLA dan jangan sampai ada perangkat lain ikut putus.'
          : 'Hari yang berat. Baca laporan kerja tadi: apa yang memperlambat diagnosis?';
    box.append(h('div', 'pp-sec', `<small>CATATAN KAK RANI</small><blockquote>${note}</blockquote>`));
    if (this.rankIndex() > before) box.append(h('p', 'msg', `Naik pangkat: <b>${this.rank()}</b>!`));
    box.append(
      h(
        'div',
        'pp-sign',
        `<div><small>Supervisor</small><b>Kak Rani</b><span>Supervisor NOC</span></div><div><small>Teknisi</small><b>${esc(this.rank())}</b><span>${this.s.xp} XP</span></div><i class="stamp done">HARI ${d.n}</i>`,
      ),
    );
    const rw = h('div', 'row');
    rw.append(
      btn(
        'Mulai hari berikutnya',
        () => {
          this.closeModal();
          this.startDay();
        },
        'btn pri',
        'day-next',
      ),
    );
    rw.append(btn('Ke papan kerja', () => this.openBoard()));
    box.append(rw);
    this.show(box);
  }
}
