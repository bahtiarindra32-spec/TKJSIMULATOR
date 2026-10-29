// DOM layer for the mission system: tracker, toast, briefing/success/log modals and the 6 minigames.
// Owns no game rules: it reads MissionSystem and calls its actions.
import './mission.css';
import { MissionSystem, MENTOR, MENTOR_ROLE, type MissionDef, type ModalState } from '../game/missionSystem';
import {
  K3_ITEMS, K3_QUESTIONS, checkK3Items, type ChoiceQ,
  T568B, WIRE_LABEL, WIRE_COLOR, isStriped, testCable, type Wire,
  LAB, checkIpConfig, pingLines,
  genSubnetQuiz, SUBNET_PASS, type SubnetQ,
  SWITCH_PORTS, checkVlans, showVlanBrief, type VlanChoice,
  genServerScenario, checkServer, TEMP_MIN, TEMP_MAX, shuffle, mathRng,
} from '../game/missionLogic';
import { QUIZ, type QuizStep } from '../game/missionsF';

type Child = Node | string | number | null | undefined | false | Child[];
type Props = { [k: string]: unknown };
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v as Record<string, string>)) el.style.setProperty(sk.startsWith('--') ? sk : sk.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), sv);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
function addKids(el: Element, kids: Child[]) {
  const add = (c: Child) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
}
/** Replace an element's children (accepts null/false/arrays like h()). */
function put(el: Element, ...kids: Child[]) { el.replaceChildren(); addKids(el, kids); }
const btn = (label: Child, onclick: () => void, cls = 'ms-btn', extra: Props = {}) => h('button', { type: 'button', class: cls, onclick, ...extra }, label);
/** Re-render while keeping keyboard focus on the element with the same data-k. */
function keepFocus(scope: HTMLElement, redraw: () => void) {
  const k = (document.activeElement as HTMLElement | null)?.dataset?.k;
  redraw();
  if (k) scope.querySelector<HTMLElement>(`[data-k="${k}"]`)?.focus({ preventScroll: true });
}
/** Bring the first error into view (long modals on phones). */
function revealError(scope: HTMLElement) {
  requestAnimationFrame(() => scope.querySelector<HTMLElement>('.ms-fb.bad, .bad, .wrong, [aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'auto' }));
}
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export interface MissionUIOptions {
  /** Where to mount (default document.body). */
  root?: HTMLElement;
  /** Show the tracker immediately (default true). Call setHudVisible() to toggle, e.g. only in walk mode. */
  hudVisible?: boolean;
  /** Bind the J key for the mission log (default true). */
  bindKeys?: boolean;
  /** Keep the tracker 8px under this element (e.g. #hud-loc) while it is visible; it follows its height. */
  below?: HTMLElement | null;
}

export class MissionUI {
  private root: HTMLElement;
  private tracker: HTMLElement;
  private toastEl: HTMLElement;
  private overlay: HTMLElement;
  private dialog: HTMLElement;
  private modalKey = '';
  private timers: number[] = [];
  private hadPointerLock = false;
  private lastMsgT = 0;
  private toastT = 0;
  private unsub: (() => void)[] = [];
  private keyHandler = (e: KeyboardEvent) => this.onKeyCapture(e);
  /** A pointer lock requested just before a modal opened can be granted after it: release it again. */
  private lockHandler = () => { if (this.ms.isModalOpen() && document.pointerLockElement) { this.hadPointerLock = true; try { document.exitPointerLock(); } catch { /* ignore */ } } };

  constructor(private ms: MissionSystem, private opts: MissionUIOptions = {}) {
    this.root = opts.root ?? document.body;
    this.tracker = h('section', { class: 'ms-tracker', 'aria-label': 'Misi aktif' });
    this.toastEl = h('div', { class: 'ms-toast', role: 'status', 'aria-live': 'polite' });
    this.dialog = h('div', { class: 'ms-modal', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
    this.overlay = h('div', { class: 'ms-overlay', hidden: true }, this.dialog);
    this.overlay.addEventListener('keydown', e => this.onKeyInside(e));
    this.overlay.addEventListener('pointerdown', e => e.stopPropagation());
    this.root.append(this.tracker, this.toastEl, this.overlay);
    if (opts.hudVisible === false) this.tracker.hidden = true;
    if (opts.bindKeys !== false) window.addEventListener('keydown', this.keyHandler, true);
    document.addEventListener('pointerlockchange', this.lockHandler);
    this.unsub.push(ms.onChange(() => this.sync()), ms.onModalChange(open => this.onModalToggle(open)));
    if (opts.below) {
      const relayout = () => this.layout();
      try { const ro = new ResizeObserver(relayout); ro.observe(opts.below); this.unsub.push(() => ro.disconnect()); } catch { /* old browser */ }
      window.addEventListener('resize', relayout); this.unsub.push(() => window.removeEventListener('resize', relayout));
    }
    this.sync();
  }

  /** Re-position the tracker under opts.below (called automatically on resize). */
  layout() {
    const b = this.opts.below; if (!b) return;
    const r = b.getBoundingClientRect();
    this.tracker.style.top = r.height > 0 ? `${Math.round(r.bottom + 8)}px` : '';
  }

  setHudVisible(v: boolean) { if (this.tracker.hidden === v) { this.tracker.hidden = !v; if (v) this.layout(); } }
  toast(text: string, ms = 3600) {
    this.toastEl.textContent = text; this.toastEl.classList.add('show');
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
  destroy() {
    window.removeEventListener('keydown', this.keyHandler, true);
    document.removeEventListener('pointerlockchange', this.lockHandler);
    this.unsub.forEach(u => u()); this.clearTimers();
    this.tracker.remove(); this.toastEl.remove(); this.overlay.remove();
  }

  // ------------------------------------------------------------------ input gating
  private onModalToggle(open: boolean) {
    if (open) {
      this.hadPointerLock = !!document.pointerLockElement;
      if (document.pointerLockElement) { try { document.exitPointerLock(); } catch { /* ignore */ } }
    } else if (this.hadPointerLock) {
      this.hadPointerLock = false;
      this.toast('Klik layar lagi untuk lanjut jalan.', 2600);
    }
  }
  private typing(t: EventTarget | null) { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); }
  /** Window capture: J toggles the log; while a modal is open no key reaches the game. */
  private onKeyCapture(e: KeyboardEvent) {
    const inside = this.overlay.contains(e.target as Node);
    if (!this.ms.isModalOpen()) {
      if (e.code === 'KeyJ' && !this.typing(e.target) && !e.repeat) { e.preventDefault(); e.stopPropagation(); this.ms.openLog(); }
      return;
    }
    if (inside) return; // handled by onKeyInside (bubbling stops at the overlay)
    e.stopPropagation(); e.preventDefault();
    if (e.code === 'Escape') this.cancel();
    else this.focusFirst();
  }
  private onKeyInside(e: KeyboardEvent) {
    e.stopPropagation(); // never let modal keystrokes reach main.ts (WASD, F, E/Q, Esc)
    if (e.code === 'Escape') { e.preventDefault(); this.cancel(); return; }
    if (e.code === 'KeyJ' && this.ms.getModal()?.type === 'log' && !this.typing(e.target)) { e.preventDefault(); this.ms.closeModal(); return; }
    if (e.key === 'Tab') {
      const f = this.focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  private cancel() { this.ms.closeModal(); }
  private focusables(): HTMLElement[] {
    return Array.from(this.dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')).filter(x => x.offsetParent !== null);
  }
  private focusFirst() {
    const pref = this.dialog.querySelector<HTMLElement>('[data-autofocus]:not([disabled])');
    (pref ?? this.focusables().find(b => !b.classList.contains('ms-x')) ?? this.dialog).focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ sync
  private sync() {
    this.renderTracker();
    const m = this.ms.lastMessage;
    if (m && m.t !== this.lastMsgT) { this.lastMsgT = m.t; this.toast(m.text); }
    const md = this.ms.getModal();
    const key = md ? JSON.stringify(md) : '';
    if (key !== this.modalKey) { this.modalKey = key; this.renderModal(md); }
  }

  private renderTracker() {
    const c = this.ms.current();
    const segs = this.ms.missions.map((mm, i) => h('i', { class: this.ms.isDone(mm.id) ? 'done' : i === this.ms.index ? 'now' : '' }));
    put(this.tracker, 
      h('div', { class: 'ms-tr-top' },
        h('span', { class: 'ms-kicker' }, c.finished ? 'SEMUA MISI SELESAI' : `MISI ${c.step}/${c.total}`),
        h('span', { class: 'ms-xp' }, `${c.xp} XP`)),
      h('div', { class: 'ms-tr-title' }, c.title),
      h('div', { class: 'ms-tr-obj' + (c.near ? ' near' : '') }, h('b', { 'aria-hidden': 'true' }, c.near ? '●' : '▸'), ' ', c.objective),
      h('div', { class: 'ms-tr-bar', 'aria-hidden': 'true' }, segs),
      h('div', { class: 'ms-tr-btns' },
        c.near && c.targetName ? h('button', { type: 'button', class: 'ms-tr-act', onclick: () => this.ms.interact(c.targetName) }, 'Mulai ', h('kbd', null, 'F')) : null,
        h('button', { type: 'button', class: 'ms-tr-log', onclick: () => this.ms.toggleLog() }, 'Buku Misi ', h('kbd', null, 'J'))),
    );
  }

  // ------------------------------------------------------------------ modal frame
  private clearTimers() { this.timers.forEach(t => clearTimeout(t)); this.timers = []; }
  private later(fn: () => void, ms: number) { this.timers.push(window.setTimeout(fn, reducedMotion() ? 0 : ms)); }

  private frame(o: { kicker: string; title: string; body: Child; foot?: Child; wide?: boolean; closeLabel?: string; tone?: string }) {
    const titleId = 'ms-title-' + Math.random().toString(36).slice(2, 7);
    this.dialog.className = 'ms-modal' + (o.wide ? ' wide' : '') + (o.tone ? ' ' + o.tone : '');
    this.dialog.setAttribute('aria-labelledby', titleId);
    put(this.dialog, 
      h('header', { class: 'ms-head' },
        h('div', null, h('div', { class: 'ms-kicker' }, o.kicker), h('h2', { id: titleId }, o.title)),
        h('button', { type: 'button', class: 'ms-x', 'aria-label': o.closeLabel ?? 'Tutup', title: (o.closeLabel ?? 'Tutup') + ' (Esc)', onclick: () => this.cancel() }, '×')),
      h('div', { class: 'ms-body' }, o.body),
      o.foot ? h('footer', { class: 'ms-foot' }, o.foot) : null,
    );
  }

  private renderModal(md: ModalState) {
    this.clearTimers();
    if (!md) { this.overlay.hidden = true; put(this.dialog); return; }
    this.overlay.hidden = false;
    switch (md.type) {
      case 'intro': this.renderIntro(); break;
      case 'briefing': this.renderBriefing(this.ms.mission(md.missionId)!); break;
      case 'success': this.renderSuccess(this.ms.mission(md.missionId)!); break;
      case 'finale': this.renderFinale(); break;
      case 'log': this.renderLog(); break;
      case 'game': {
        const m = this.ms.mission(md.missionId)!;
        ({ k3: () => this.gameK3(m), crimp: () => this.gameCrimp(m), ip: () => this.gameIp(m), subnet: () => this.gameSubnet(m), vlan: () => this.gameVlan(m), server: () => this.gameServer(m), quiz: () => this.gameQuiz(m) })[md.game]();
        break;
      }
    }
    this.dialog.querySelector('.ms-body')?.scrollTo?.(0, 0);
    requestAnimationFrame(() => this.focusFirst());
  }

  private mentor(text: Child) {
    return h('div', { class: 'ms-mentor' },
      h('div', { class: 'ms-avatar', 'aria-hidden': 'true' }, 'KR'),
      h('div', null, h('div', { class: 'ms-mentor-name' }, MENTOR, h('span', null, ' · ', MENTOR_ROLE)), h('p', null, text)));
  }
  private kick(m: MissionDef) { return `MISI ${m.no}/${this.ms.missions.length} · ${m.room.toUpperCase()}`; }

  // ------------------------------------------------------------------ story screens
  private renderIntro() {
    this.frame({
      kicker: 'NUSANTARA TECH HOTEL · HARI 1', title: 'Hari Pertama Magang', closeLabel: 'Lewati',
      body: [
        this.mentor(`Halo! Aku Kak Rani, supervisor IT di sini. Hari ini kamu magang jadi teknisi jaringan. Ada ${this.ms.missions.length} tugas, urut dari dasar (Fase E) sampai lanjut (Fase F). Selesaikan satu per satu, ya.`),
        h('h3', null, 'Cara main'),
        h('ul', { class: 'ms-keys' },
          h('li', null, h('kbd', null, 'W A S D'), ' jalan · ', h('kbd', null, 'Mouse'), ' menoleh'),
          h('li', null, 'Ikuti ', h('b', { class: 'ms-g' }, 'penanda hijau'), ' ke lokasi tugas'),
          h('li', null, 'Sampai di lokasi, tekan ', h('kbd', null, 'F')),
          h('li', null, h('kbd', null, 'J'), ' buka Buku Misi kalau bingung')),
        h('h3', null, 'Tugas hari ini'),
        h('ol', { class: 'ms-chain' }, this.ms.missions.map(m => h('li', null, h('b', null, m.title), h('span', null, ` · ${m.place}, ${m.room}`)))),
      ],
      foot: btn('Mulai hari pertama →', () => this.ms.closeModal(), 'ms-btn primary', { 'data-autofocus': true }),
    });
  }

  private renderBriefing(m: MissionDef) {
    this.frame({
      kicker: this.kick(m), title: m.title, closeLabel: 'Tutup briefing',
      body: [
        this.mentor(m.brief),
        h('div', { class: 'ms-grid2' },
          h('div', { class: 'ms-card' }, h('div', { class: 'ms-label' }, 'LOKASI'), h('p', null, h('b', null, m.place), ` di ${m.room}`), h('p', { class: 'ms-dim' }, 'Ikuti penanda hijau, lalu tekan F.')),
          h('div', { class: 'ms-card' }, h('div', { class: 'ms-label' }, 'HADIAH'), h('p', null, h('b', { class: 'ms-g' }, `+${m.xp} XP`)), h('p', { class: 'ms-dim' }, `Belajar: ${m.learn}`))),
        h('div', { class: 'ms-label' }, 'LANGKAH'),
        h('ol', { class: 'ms-steps' }, m.steps.map(s => h('li', null, s))),
        h('p', { class: 'ms-why' }, h('b', null, 'Kenapa penting? '), m.why),
        m.cp ? h('p', { class: 'ms-dim' }, h('b', null, 'Capaian Pembelajaran: '), m.cp) : null,
      ],
      foot: btn('Siap, gas!', () => this.ms.closeModal(), 'ms-btn primary', { 'data-autofocus': true }),
    });
  }

  private renderSuccess(m: MissionDef) {
    const next = this.ms.missions[m.no] ?? null;
    const mis = this.ms.mistakes(m.id);
    this.frame({
      kicker: this.kick(m), title: 'Misi selesai!', tone: 'success', closeLabel: 'Lanjut',
      body: [
        h('div', { class: 'ms-win' }, h('div', { class: 'ms-check', 'aria-hidden': 'true' }, '✓'), h('div', null, h('div', { class: 'ms-win-title' }, m.title), h('div', { class: 'ms-xpbig' }, `+${m.xp} XP`))),
        h('p', null, m.doneText),
        h('p', { class: 'ms-dim' }, mis === 0 ? 'Sempurna, tanpa salah sekali pun!' : `Sempat salah ${mis}×. Gapapa, dari salah itu kita belajar.`),
        next ? h('div', { class: 'ms-card' }, h('div', { class: 'ms-label' }, 'BERIKUTNYA'), h('p', null, h('b', null, next.title), ` · ${next.place}, ${next.room}`)) : null,
      ],
      foot: btn(next ? 'Lanjut ke misi berikutnya →' : 'Lihat hasil akhir →', () => this.ms.closeModal(), 'ms-btn primary', { 'data-autofocus': true }),
    });
  }

  private renderFinale() {
    const total = this.ms.missions.reduce((a, m) => a + this.ms.mistakes(m.id), 0);
    const rank = total <= 2 ? 'Teknisi Andal' : total <= 6 ? 'Teknisi Muda' : 'Calon Teknisi';
    this.frame({
      kicker: 'NUSANTARA TECH HOTEL · HARI 1 SELESAI', title: 'Magang hari pertama beres!', tone: 'success',
      body: [
        this.mentor(`Kerja bagus! Semua tugas hari ini selesai. Predikat kamu: ${rank}.`),
        h('div', { class: 'ms-win' }, h('div', { class: 'ms-check', 'aria-hidden': 'true' }, '★'), h('div', null, h('div', { class: 'ms-win-title' }, rank), h('div', { class: 'ms-xpbig' }, `${this.ms.xp} / ${this.ms.totalXp} XP`))),
        h('ol', { class: 'ms-chain done' }, this.ms.missions.map(m => h('li', null, h('b', null, '✓ ', m.title), h('span', null, ` · ${m.learn}`)))),
        h('p', { class: 'ms-dim' }, `Total salah: ${total}×. Main lagi untuk dapat predikat lebih tinggi.`),
      ],
      foot: [btn('Main lagi dari awal', () => this.ms.reset(), 'ms-btn'), btn('Jalan-jalan bebas', () => this.ms.closeModal(), 'ms-btn primary', { 'data-autofocus': true })],
    });
  }

  private renderLog() {
    const cur = this.ms.currentMission();
    let confirm = false;
    const resetBtn = btn('Ulang dari awal', () => {
      if (!confirm) { confirm = true; resetBtn.textContent = 'Yakin? Klik lagi untuk hapus progres'; resetBtn.classList.add('danger'); return; }
      this.ms.reset(); this.ms.start();
    }, 'ms-btn ghost');
    this.frame({
      kicker: `BUKU MISI · ${this.ms.xp}/${this.ms.totalXp} XP`, title: cur ? `Sekarang: ${cur.title}` : 'Semua misi selesai',
      body: [
        cur ? h('div', { class: 'ms-card now' },
          h('div', { class: 'ms-label' }, `MISI ${cur.no} · ${cur.place.toUpperCase()}, ${cur.room.toUpperCase()}`),
          h('p', null, h('b', null, 'Yang harus dilakukan: '), this.ms.current().objective, '.'),
          h('ol', { class: 'ms-steps' }, cur.steps.map(s => h('li', null, s))),
          h('p', { class: 'ms-dim' }, 'Ikuti penanda hijau di layar. Angka di penanda = jarak dalam meter.')) : null,
        h('div', { class: 'ms-label' }, 'SEMUA MISI'),
        h('ol', { class: 'ms-log' }, this.ms.missions.map((m, i) => {
          const st = this.ms.isDone(m.id) ? 'done' : i === this.ms.index ? 'now' : 'lock';
          return h('li', { class: st },
            h('span', { class: 'ms-st', 'aria-hidden': 'true' }, st === 'done' ? '✓' : st === 'now' ? '▶' : String(m.no)),
            h('div', null, h('b', null, m.title), h('div', { class: 'ms-dim' }, `${m.place}, ${m.room} · ${m.xp} XP · ${st === 'done' ? 'selesai' : st === 'now' ? 'sedang dikerjakan' : 'terkunci'}`)));
        })),
        h('div', { class: 'ms-label' }, 'KONTROL'),
        h('p', { class: 'ms-dim' }, 'WASD jalan · Mouse menoleh · Shift lari · Spasi lompat · V kamera 1/3 · F interaksi · J buku misi · Esc tutup jendela'),
      ],
      foot: [resetBtn, cur ? btn('Lihat briefing', () => this.ms.openBriefing(), 'ms-btn') : null, btn('Tutup', () => this.ms.closeModal(), 'ms-btn primary', { 'data-autofocus': true })],
    });
  }

  // ------------------------------------------------------------------ helpers for games
  private feedback(kind: 'ok' | 'bad' | 'info', ...kids: Child[]) {
    return h('div', { class: `ms-fb ${kind}`, role: kind === 'bad' ? 'alert' : 'status' }, h('b', { 'aria-hidden': 'true' }, kind === 'ok' ? '✓' : kind === 'bad' ? '!' : 'i'), h('div', null, kids));
  }
  private choiceQuestion(host: HTMLElement, q: ChoiceQ | SubnetQ, missionId: string, onCorrect: () => void, mono = false, nextLabel = 'Lanjut →') {
    const fb = h('div', { class: 'ms-fbslot' });
    const nextBtn = btn(nextLabel, onCorrect, 'ms-btn primary', { hidden: true });
    const choices = q.options.map((o, i) => btn([h('span', { class: 'ms-letter' }, 'ABCD'[i]), h('span', null, o)], () => pickIt(i), 'ms-choice' + (mono ? ' mono' : '')));
    const pickIt = (i: number) => {
      if (i === q.answer) {
        choices.forEach((c, j) => { c.disabled = true; if (j === i) c.classList.add('right'); });
        put(fb, this.feedback('ok', h('b', null, 'Benar! '), q.explain));
        nextBtn.hidden = false; nextBtn.focus();
      } else {
        choices[i].classList.add('wrong'); choices[i].disabled = true;
        this.ms.recordMistake(missionId);
        put(fb, this.feedback('bad', h('b', null, 'Belum tepat. '), 'Coba pilih jawaban lain.'));
      }
    };
    put(host, h('p', { class: 'ms-q' }, q.q), h('div', { class: 'ms-choices' }, choices), fb, h('div', { class: 'ms-row-end' }, nextBtn));
  }
  private terminal(lines: string[], onDone?: () => void, speed = 70) {
    const pre = h('pre', { class: 'ms-term', 'aria-live': 'polite' });
    lines.forEach((ln, i) => this.later(() => {
      const row = h('span', { class: /Reply from|0% loss\)/.test(ln) && !/100%/.test(ln) ? 'ok' : /timed out|100% loss|conflict/.test(ln) ? 'bad' : ln.startsWith('C:\\>') || ln.startsWith('Switch#') ? 'cmd' : '' }, ln + '\n');
      pre.append(row); pre.scrollTop = pre.scrollHeight;
      if (i === lines.length - 1) onDone?.();
    }, i * speed));
    return pre;
  }


  // ------------------------------------------------------------------ data-driven quiz missions (Fase F)
  private gameQuiz(m: MissionDef) {
    const steps: QuizStep[] = QUIZ[m.id] ?? [];
    const body = h('div');
    let i = 0;
    const prog = () => h('div', { class: 'ms-label' }, `SOAL ${i + 1} / ${steps.length}`);
    const next = () => { i++; if (i >= steps.length) finish(); else show(); };
    const show = () => {
      const st = steps[i];
      const host = h('div');
      put(body, prog(), host);
      if (st.type === 'choice') {
        const idx = shuffle(mathRng, st.options.map((_, k) => k));
        this.choiceQuestion(host, { q: st.q, options: idx.map(k => st.options[k]), answer: idx.indexOf(0), explain: st.explain }, m.id, next, false, i === steps.length - 1 ? 'Selesai →' : 'Lanjut →');
      } else this.orderQuestion(host, st, m.id, next);
    };
    const finish = () => {
      put(body, this.feedback('ok', h('b', null, 'Semua benar! '), m.doneText),
        h('div', { class: 'ms-row-end' }, btn('Selesai ✓', () => this.ms.completeGame(m.id), 'ms-btn primary')));
      (body.querySelector('button') as HTMLButtonElement)?.focus();
    };
    show();
    this.frame({ kicker: this.kick(m), title: m.title, body, wide: true, closeLabel: 'Batal', foot: btn('Batal', () => this.cancel(), 'ms-btn ghost') });
  }
  /** click the pieces in the right order; a wrong pick resets the sequence */
  private orderQuestion(host: HTMLElement, st: { q: string; items: string[]; explain: string }, missionId: string, onCorrect: () => void) {
    const pool = shuffle(mathRng, st.items.map((_, k) => k));
    const picked: number[] = [];
    const fb = h('div', { class: 'ms-fbslot' });
    const seq = h('ol', { class: 'ms-steps' });
    const nextBtn = btn('Lanjut →', onCorrect, 'ms-btn primary', { hidden: true });
    const choices = pool.map(k => btn([h('span', null, st.items[k])], () => undefined, 'ms-choice'));
    choices.forEach((c, j) => { const k = pool[j]; c.onclick = () => pick(k, c); });
    const pick = (k: number, el: HTMLButtonElement) => {
      if (k === picked.length) {
        picked.push(k); el.disabled = true; el.classList.add('right'); seq.append(h('li', null, st.items[k]));
        if (picked.length === st.items.length) { put(fb, this.feedback('ok', h('b', null, 'Urutan benar! '), st.explain)); nextBtn.hidden = false; nextBtn.focus(); }
        else put(fb);
      } else {
        this.ms.recordMistake(missionId);
        picked.length = 0; seq.replaceChildren(); choices.forEach(c => { c.disabled = false; c.classList.remove('right'); });
        el.classList.add('wrong'); setTimeout(() => el.classList.remove('wrong'), 600);
        put(fb, this.feedback('bad', h('b', null, 'Urutan belum tepat. '), 'Mulai lagi dari langkah pertama.'));
      }
    };
    put(host, h('p', { class: 'ms-q' }, st.q), h('div', { class: 'ms-choices' }, choices), h('div', { class: 'ms-label' }, 'URUTANMU'), seq, fb, h('div', { class: 'ms-row-end' }, nextBtn));
  }

  // ------------------------------------------------------------------ M1 K3
  private gameK3(m: MissionDef) {
    const body = h('div');
    const sel = new Set<string>();
    const items = shuffle(mathRng, K3_ITEMS);
    const phaseItems = () => {
      const counter = h('span', { class: 'ms-dim' });
      const fb = h('div', { class: 'ms-fbslot' });
      const tiles = items.map(it => {
        const b = btn([h('span', { class: 'ms-tick', 'aria-hidden': 'true' }), it.label], () => {
          if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id);
          b.setAttribute('aria-pressed', String(sel.has(it.id))); b.classList.remove('wrong', 'miss');
          counter.textContent = `Dipilih: ${sel.size}`;
        }, 'ms-tile', { 'aria-pressed': 'false', 'data-id': it.id });
        return b;
      });
      counter.textContent = 'Dipilih: 0';
      const check = btn('Cek pilihan', () => {
        const r = checkK3Items([...sel]);
        tiles.forEach(t => t.classList.remove('wrong', 'miss'));
        if (r.ok) { phaseQuiz(0); return; }
        this.ms.recordMistake(m.id);
        r.extra.forEach(x => tiles.find(t => t.dataset.id === x.id)?.classList.add('wrong'));
        put(fb, this.feedback('bad',
          h('b', null, 'Belum pas. '),
          r.missing.length ? h('div', null, `Masih kurang ${r.missing.length} barang. Petunjuk: ${r.missing[0].why}`) : null,
          ...r.extra.map(x => h('div', null, h('b', null, `${x.label}: `), x.why))));
        revealError(body);
      }, 'ms-btn primary', { 'data-autofocus': true });
      put(body, 
        this.mentor('Kita mau bikin kabel LAN. Pilih SEMUA alat dan APD yang dibutuhkan, dan jangan bawa yang tidak perlu.'),
        h('div', { class: 'ms-tiles', role: 'group', 'aria-label': 'Isi lemari alat' }, tiles),
        fb, h('div', { class: 'ms-row-between' }, counter, check));
    };
    const phaseQuiz = (i: number) => {
      const host = h('div');
      put(body, 
        this.feedback('ok', h('b', null, 'Alat & APD lengkap! '), 'Sekarang 2 soal K3 singkat.'),
        h('div', { class: 'ms-label' }, `SOAL K3 ${i + 1}/${K3_QUESTIONS.length}`), host);
      this.choiceQuestion(host, K3_QUESTIONS[i], m.id, () => i + 1 < K3_QUESTIONS.length ? phaseQuiz(i + 1) : this.ms.completeGame(m.id), false, i + 1 < K3_QUESTIONS.length ? 'Soal berikutnya →' : 'Selesai ✓');
    };
    phaseItems();
    this.frame({ kicker: this.kick(m), title: 'Lemari Alat: siapkan alat & APD', body, closeLabel: 'Batal', foot: btn('Batal', () => this.cancel(), 'ms-btn ghost') });
  }

  // ------------------------------------------------------------------ M2 Crimping
  private gameCrimp(m: MissionDef) {
    const body = h('div');
    const ends: (Wire | null)[][] = [Array(8).fill(null), Array(8).fill(null)];
    let showHelp = false;
    const swatch = (w: Wire) => h('span', { class: 'ms-wire' + (isStriped(w) ? ' striped' : ''), style: { '--wc': WIRE_COLOR[w] } });
    const stepper = (active: number) => h('ol', { class: 'ms-stepper' }, ['Ujung A', 'Ujung B', 'LAN tester'].map((s, i) => h('li', { class: i < active ? 'done' : i === active ? 'now' : '' }, s)));
    const helpCard = () => h('div', { class: 'ms-card help' }, h('div', { class: 'ms-label' }, 'CONTEKAN T568B (PIN 1 → 8)'),
      h('ol', { class: 'ms-ref' }, T568B.map(w => h('li', null, swatch(w), WIRE_LABEL[w]))));

    const editEnd = (e: 0 | 1) => {
      const arr = ends[e];
      const palette = shuffle(mathRng, T568B);
      const slotsEl = h('div', { class: 'ms-pins', role: 'group', 'aria-label': `Pin konektor ujung ${e ? 'B' : 'A'}` });
      const palEl = h('div', { class: 'ms-palette', role: 'group', 'aria-label': 'Pilih warna kabel' });
      const doneBtn = btn(`Crimp ujung ${e ? 'B' : 'A'} ✓`, () => (e === 0 && ends[1].includes(null) ? editEnd(1) : runTester()), 'ms-btn primary');
      const helpBtn = btn(showHelp ? 'Sembunyikan contekan' : 'Lihat contekan', () => { showHelp = !showHelp; editEnd(e); }, 'ms-btn ghost small');
      const draw = () => {
        put(slotsEl, ...arr.map((w, i) => btn([h('span', { class: 'ms-pinno' }, String(i + 1)), w ? swatch(w) : h('span', { class: 'ms-wire empty' }), h('span', { class: 'ms-pinlbl' }, w ? WIRE_LABEL[w] : 'kosong')],
          () => { if (arr[i]) { arr[i] = null; draw(); } }, 'ms-pin' + (w ? ' filled' : ''), { 'aria-label': `Pin ${i + 1}: ${w ? WIRE_LABEL[w] + ' (klik untuk lepas)' : 'kosong'}` })));
        put(palEl, ...palette.map(w => btn([swatch(w), WIRE_LABEL[w]], () => {
          const k = arr.indexOf(null); if (k < 0) return; arr[k] = w; draw();
          const nextP = palEl.querySelector<HTMLButtonElement>('button:not([disabled])'); (nextP ?? doneBtn).focus();
        }, 'ms-wbtn', { disabled: arr.includes(w) })));
        doneBtn.disabled = arr.includes(null);
      };
      draw();
      put(body, 
        stepper(e),
        h('p', { class: 'ms-q' }, `Susun kabel ujung ${e ? 'B' : 'A'} dengan urutan `, h('b', null, 'T568B'), '. Klik warna sesuai urutan: masuk ke pin kosong berikutnya. Klik pin untuk melepas.'),
        h('p', { class: 'ms-dim' }, 'Pegang RJ45 dengan klip menghadap ke bawah: pin 1 di kiri.'),
        h('div', { class: 'ms-rj45' }, slotsEl),
        palEl,
        showHelp ? helpCard() : null,
        h('div', { class: 'ms-row-between' }, h('div', { class: 'ms-row' }, helpBtn, btn('Kosongkan', () => { arr.fill(null); draw(); }, 'ms-btn ghost small')), doneBtn));
    };

    const runTester = () => {
      const r = testCable(ends[0], ends[1]);
      const led = () => h('i', { class: 'ms-led' });
      const master = Array.from({ length: 8 }, led), remote = Array.from({ length: 8 }, led);
      const res = h('div', { class: 'ms-fbslot' });
      put(body, stepper(2),
        h('p', { class: 'ms-q' }, 'LAN tester menyalakan pin satu per satu. Kabel straight yang benar: lampu 1–8 menyala berurutan dan sama di kedua sisi.'),
        h('div', { class: 'ms-tester', 'aria-hidden': 'true' },
          h('div', { class: 'ms-tester-row' }, h('span', null, 'MASTER'), h('div', null, master)),
          h('div', { class: 'ms-tester-row' }, h('span', null, 'REMOTE'), h('div', null, remote)),
          h('div', { class: 'ms-tester-row nums' }, h('span', null, ''), h('div', null, Array.from({ length: 8 }, (_, i) => h('b', null, String(i + 1)))))),
        res);
      r.pins.forEach((p, i) => this.later(() => {
        master.forEach(x => x.classList.remove('on', 'bad')); remote.forEach(x => x.classList.remove('on', 'bad'));
        master[i].classList.add(p.ok ? 'on' : 'bad');
        if (p.farPin) remote[p.farPin - 1].classList.add(p.ok ? 'on' : 'bad');
      }, 200 + i * 420));
      this.later(() => {
        master.forEach(x => x.classList.remove('on', 'bad')); remote.forEach(x => x.classList.remove('on', 'bad'));
        r.pins.forEach((p, i) => { master[i].classList.add(p.ok ? 'on' : 'bad'); if (p.farPin) remote[p.farPin - 1].classList.add(p.ok ? 'on' : 'bad'); });
        if (r.ok) {
          put(res, this.feedback('ok', h('b', null, 'Lulus tes! '), 'Lampu 1–8 menyala urut di kedua sisi dan warnanya sesuai T568B. Kabel straight siap dipakai.'),
            h('div', { class: 'ms-row-end' }, btn('Selesai ✓', () => this.ms.completeGame(m.id), 'ms-btn primary')));
          (res.querySelector('button') as HTMLButtonElement).focus();
          return;
        }
        this.ms.recordMistake(m.id);
        const lines: Child[] = [];
        if (!r.continuityOk) {
          lines.push(h('b', null, 'Lampu tidak urut. '), 'Pin yang bermasalah:');
          lines.push(h('ul', null, r.pins.filter(p => !p.ok).map(p => h('li', null,
            `Pin ${p.pin} (ujung A: ${p.aWire ? WIRE_LABEL[p.aWire] : '–'}) `, p.farPin ? `nyala di pin ${p.farPin} ujung B` : 'tidak nyala'))));
        } else {
          lines.push(h('b', null, 'Lampu urut, tapi warnanya bukan T568B. '), 'Kedua ujung sama sehingga lampu tetap urut, tapi pasangan kabel jadi terpisah (split pair) dan sinyal bisa terganggu. Standar harus diikuti.');
        }
        const badEnds = [0, 1].filter(e => !(e === 0 ? r.aStd : r.bStd).every(Boolean));
        badEnds.forEach(e => {
          const std = e === 0 ? r.aStd : r.bStd;
          const wrongPins = std.map((ok, i) => (ok ? null : i)).filter((x): x is number => x !== null);
          lines.push(h('div', null, h('b', null, `Ujung ${e ? 'B' : 'A'}: `), wrongPins.map(i => `pin ${i + 1} seharusnya ${WIRE_LABEL[T568B[i]]}`).join(', '), '.'));
        });
        put(res, this.feedback('bad', lines),
          h('div', { class: 'ms-row-end' }, btn(badEnds.length === 2 ? 'Potong & ulang kedua ujung' : `Potong & ulang ujung ${badEnds[0] ? 'B' : 'A'}`, () => {
            badEnds.forEach(e => ends[e].fill(null)); editEnd(badEnds[0] as 0 | 1); // A's Crimp button continues to B only if B is empty
          }, 'ms-btn primary')));
        (res.querySelector('button') as HTMLButtonElement | null)?.focus();
      }, 200 + 8 * 420 + 300);
    };

    editEnd(0);
    this.frame({ kicker: this.kick(m), title: 'Meja Crimping: kabel straight T568B', body, wide: true, closeLabel: 'Batal', foot: btn('Batal', () => this.cancel(), 'ms-btn ghost') });
  }

  // ------------------------------------------------------------------ M3 IP & ping
  private gameIp(m: MissionDef) {
    const body = h('div');
    const vals = { ip: '', mask: '', gw: '' };
    const form = () => {
      const field = (key: 'ip' | 'mask' | 'gw', label: string, ph: string) => {
        const id = 'ms-f-' + key;
        const input = h('input', { id, class: 'ms-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: ph, value: vals[key], 'aria-describedby': id + '-err' }) as HTMLInputElement;
        input.addEventListener('input', () => { vals[key] = input.value; input.removeAttribute('aria-invalid'); err.textContent = ''; });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        const err = h('div', { id: id + '-err', class: 'ms-err', role: 'alert' });
        return { el: h('div', { class: 'ms-field' }, h('label', { for: id }, label), input, err), input, err };
      };
      const fIp = field('ip', 'IP Address', 'contoh: 192.168.10.__');
      const fMask = field('mask', 'Subnet Mask', 'contoh: 255.255.___.___');
      const fGw = field('gw', 'Default Gateway', 'IP router');
      const fields = { ip: fIp, mask: fMask, gw: fGw };
      fIp.input.setAttribute('data-autofocus', '');
      const submit = () => {
        const out = checkIpConfig(vals.ip, vals.mask, vals.gw);
        if (out.kind === 'fieldError') { const f = fields[out.field]; f.input.setAttribute('aria-invalid', 'true'); f.err.textContent = out.msg; f.input.focus(); this.ms.recordMistake(m.id); return; }
        ping(out);
      };
      put(body, 
        h('div', { class: 'ms-grid2 ip' },
          h('div', { class: 'ms-card sheet' }, h('div', { class: 'ms-label' }, 'LEMBAR KERJA LAB'),
            h('table', { class: 'ms-table' },
              h('tr', null, h('th', null, 'Server praktik'), h('td', null, `${LAB.server}/24`)),
              h('tr', null, h('th', null, 'Router (gateway)'), h('td', null, LAB.router)),
              h('tr', null, h('th', null, 'Sudah dipakai'), h('td', null, LAB.used.map(u => u.ip.split('.').pop()).map(x => '.' + x).join(', ')))),
            h('p', { class: 'ms-dim' }, 'Tugas: PC Praktik 1 harus bisa ping server. Pilih IP yang satu jaringan, belum dipakai, dan bukan alamat network/broadcast.')),
          h('div', { class: 'ms-card' }, h('div', { class: 'ms-label' }, 'PENGATURAN IPv4 · PC PRAKTIK 1'), fIp.el, fMask.el, fGw.el)),
        h('div', { class: 'ms-row-end' }, btn('Simpan & ping server', submit, 'ms-btn primary')));
    };
    const ping = (out: ReturnType<typeof checkIpConfig>) => {
      const res = h('div', { class: 'ms-fbslot' });
      const finish = () => {
        if (out.kind === 'ok') {
          put(res, this.feedback('ok', h('b', null, 'Reply 4/4! '), out.msg), h('div', { class: 'ms-row-end' }, btn('Selesai ✓', () => this.ms.completeGame(m.id), 'ms-btn primary')));
        } else {
          this.ms.recordMistake(m.id);
          put(res, this.feedback('bad', h('b', null, out.kind === 'conflict' ? 'IP bentrok. ' : 'Ping gagal. '), out.msg), h('div', { class: 'ms-row-end' }, btn('Perbaiki pengaturan', form, 'ms-btn primary')));
        }
        (res.querySelector('button') as HTMLButtonElement).focus();
      };
      put(body, h('div', { class: 'ms-label' }, 'COMMAND PROMPT · PC PRAKTIK 1'), this.terminal(pingLines(vals.ip, vals.mask, vals.gw, out), finish, 90), res);
    };
    form();
    this.frame({ kicker: this.kick(m), title: 'PC Praktik 1: atur IP lalu ping', body, wide: true, closeLabel: 'Batal', foot: btn('Batal', () => this.cancel(), 'ms-btn ghost') });
  }

  // ------------------------------------------------------------------ M4 Subnetting
  private gameSubnet(m: MissionDef) {
    const body = h('div');
    let quiz = genSubnetQuiz(); let score = 0; let firstTry = true;
    const tips = h('details', { class: 'ms-card help' }, h('summary', null, 'Contekan rumus'),
      h('ul', null, h('li', null, 'Blok (lompatan) = 256 − angka terakhir mask. Contoh /26 → mask .192 → blok 64.'),
        h('li', null, 'Jumlah host valid = 2^(32 − prefix) − 2.'), h('li', null, 'Network = kelipatan blok terdekat di bawah IP. Broadcast = network + blok − 1.'),
        h('li', null, 'Jumlah subnet dari /24 = 2^(prefix − 24).')));
    const showQ = (i: number) => {
      const host = h('div'); firstTry = true;
      const dots = h('div', { class: 'ms-dots', 'aria-label': `Soal ${i + 1} dari ${quiz.length}` }, quiz.map((_, j) => h('i', { class: j < i ? 'done' : j === i ? 'now' : '' })));
      put(body, h('div', { class: 'ms-row-between' }, h('div', { class: 'ms-label' }, `SOAL ${i + 1}/${quiz.length} · BENAR ${score}`), dots), host, tips);
      const q = quiz[i];
      this.choiceQuestion(host, q, m.id, () => { if (firstTry) score++; i + 1 < quiz.length ? showQ(i + 1) : result(); }, true, i + 1 < quiz.length ? 'Soal berikutnya →' : 'Lihat hasil →');
      host.querySelectorAll<HTMLButtonElement>('.ms-choice').forEach(b => b.addEventListener('click', () => { if (b.classList.contains('wrong')) firstTry = false; }));
    };
    const result = () => {
      const pass = score >= SUBNET_PASS;
      put(body, pass
        ? this.feedback('ok', h('b', null, `${score}/${quiz.length} benar di percobaan pertama. Lulus! `), 'Rencana subnet hotel siap dipakai tim NOC.')
        : this.feedback('bad', h('b', null, `${score}/${quiz.length} benar di percobaan pertama. `), `Butuh minimal ${SUBNET_PASS}. Coba set soal baru (angkanya beda).`),
        h('div', { class: 'ms-row-end' }, pass ? btn('Selesai ✓', () => this.ms.completeGame(m.id), 'ms-btn primary') : btn('Coba set soal baru', () => { quiz = genSubnetQuiz(); score = 0; showQ(0); }, 'ms-btn primary')));
      (body.querySelector('.ms-row-end button') as HTMLButtonElement).focus();
    };
    put(body, 
      this.mentor('Jaringan hotel 192.168.20.0/24 mau dibagi per lantai. Jawab 5 soal. Yang dihitung hanya jawaban benar di percobaan pertama, minimal 4.'),
      h('div', { class: 'ms-row-end' }, btn('Mulai soal →', () => showQ(0), 'ms-btn primary', { 'data-autofocus': true })), tips);
    this.frame({ kicker: this.kick(m), title: 'Meja NOC: hitung subnet', body, closeLabel: 'Batal', foot: btn('Batal', () => this.cancel(), 'ms-btn ghost') });
  }

  // ------------------------------------------------------------------ M5 VLAN
  private gameVlan(m: MissionDef) {
    const body = h('div');
    const assign: VlanChoice[] = SWITCH_PORTS.map(() => null);
    const choices: { v: VlanChoice; label: string; cls: string }[] = [
      { v: 10, label: '10', cls: 'v10' }, { v: 20, label: '20', cls: 'v20' }, { v: 30, label: '30', cls: 'v30' }, { v: 'trunk', label: 'Trunk', cls: 'vt' }];
    let marks: ReturnType<typeof checkVlans> | null = null; // last verification, kept until that row changes
    const edit = () => {
      const rows = SWITCH_PORTS.map((p, i) => {
        const r = marks && marks.rows[i].got === assign[i] ? marks.rows[i] : null;
        const grp = h('div', { class: 'ms-seg', role: 'radiogroup', 'aria-label': `VLAN port ${p.port}` }, choices.map(c => btn(c.label, () => { assign[i] = c.v; keepFocus(body, edit); },
          `ms-segb ${c.cls}` + (assign[i] === c.v ? ' on' : ''), { role: 'radio', 'aria-checked': String(assign[i] === c.v), 'data-k': `p${i}-${c.v}` })));
        return h('div', { class: 'ms-port' + (r ? (r.ok ? ' ok' : ' bad') : '') },
          h('div', { class: 'ms-port-name' }, h('b', null, `Port ${p.port}`), h('span', null, p.device), r && !r.ok ? h('em', null, r.why) : null), grp);
      });
      const verify = btn('Verifikasi (show vlan brief)', () => run(), 'ms-btn primary', { disabled: assign.some(a => a === null) });
      put(body, 
        h('div', { class: 'ms-card sheet' }, h('div', { class: 'ms-label' }, 'SURAT KERJA'),
          h('div', { class: 'ms-legend' }, h('span', { class: 'v10' }, 'VLAN 10 · Kantor (PC, printer)'), h('span', { class: 'v20' }, 'VLAN 20 · Wi-Fi Tamu (AP)'), h('span', { class: 'v30' }, 'VLAN 30 · CCTV'), h('span', { class: 'vt' }, 'Trunk · kabel ke router (bawa semua VLAN)'))),
        h('div', { class: 'ms-ports' }, rows),
        h('div', { class: 'ms-row-between' }, h('span', { class: 'ms-dim' }, `Diatur: ${assign.filter(a => a !== null).length}/8`), verify));
    };
    const run = () => {
      const r = checkVlans(assign);
      const res = h('div', { class: 'ms-fbslot' });
      const finish = () => {
        if (r.ok) put(res, this.feedback('ok', h('b', null, 'VLAN beres! '), 'Kantor, tamu dan CCTV terpisah. Port trunk tidak muncul di daftar VLAN karena membawa semua VLAN sekaligus.'),
          h('div', { class: 'ms-row-end' }, btn('Selesai ✓', () => this.ms.completeGame(m.id), 'ms-btn primary')));
        else {
          this.ms.recordMistake(m.id);
          put(res, this.feedback('bad', h('b', null, `${r.rows.filter(x => !x.ok).length} port belum sesuai surat kerja. `), 'Lihat port yang merah.'),
            h('div', { class: 'ms-row-end' }, btn('Perbaiki port', () => { marks = r; edit(); revealError(body); }, 'ms-btn primary')));
        }
        (res.querySelector('button') as HTMLButtonElement).focus();
      };
      put(body, h('div', { class: 'ms-label' }, 'CLI SWITCH (mirip Cisco)'), this.terminal(showVlanBrief(assign), finish, 80), res);
    };
    edit();
    this.frame({ kicker: this.kick(m), title: 'Rak Jaringan: atur VLAN di switch', body, wide: true, closeLabel: 'Batal', foot: btn('Batal', () => this.cancel(), 'ms-btn ghost') });
  }

  // ------------------------------------------------------------------ M6 UPS & suhu
  private gameServer(m: MissionDef) {
    const body = h('div');
    const sc = genServerScenario();
    const marks: (boolean | null)[] = [null, null, null, null];
    let ups: boolean | null = null;
    const draw = (res?: ReturnType<typeof checkServer>) => {
      const racks = sc.temps.map((t, i) => {
        const r = res?.temps[i];
        return h('div', { class: 'ms-rack' + (r ? (r.correct ? ' ok' : ' bad') : '') },
          h('div', { class: 'ms-label' }, `RAK ${i + 1} · INTAKE`), h('div', { class: 'ms-temp' }, `${t}`, h('small', null, '°C')),
          h('div', { class: 'ms-seg two', role: 'radiogroup', 'aria-label': `Suhu rak ${i + 1}` },
            btn('Aman', () => { marks[i] = true; keepFocus(body, draw); }, 'ms-segb' + (marks[i] === true ? ' on okc' : ''), { role: 'radio', 'aria-checked': String(marks[i] === true), 'data-k': `r${i}a` }),
            btn('Tidak aman', () => { marks[i] = false; keepFocus(body, draw); }, 'ms-segb' + (marks[i] === false ? ' on badc' : ''), { role: 'radio', 'aria-checked': String(marks[i] === false), 'data-k': `r${i}b` })),
          r && !r.correct ? h('em', null, r.ok ? `${t} °C masih di dalam ${TEMP_MIN}–${TEMP_MAX} °C, jadi aman.` : `${t} °C di luar ${TEMP_MIN}–${TEMP_MAX} °C: ${t > TEMP_MAX ? 'terlalu panas' : 'terlalu dingin'}.`) : null);
      });
      const u = sc.ups;
      const upsWrong = res && !res.upsCorrect;
      const send = btn('Kirim laporan', () => { const r = checkServer(sc, marks, ups); if (r.ok) done(); else { this.ms.recordMistake(m.id); draw(r); revealError(body); } }, 'ms-btn primary', { disabled: marks.includes(null) || ups === null });
      put(body, 
        h('p', { class: 'ms-q' }, 'Batas aman suhu udara masuk server: ', h('b', null, `${TEMP_MIN}–${TEMP_MAX} °C`), '. Tandai tiap rak, lalu baca panel UPS.'),
        h('div', { class: 'ms-racks' }, racks),
        h('div', { class: 'ms-ups' + (upsWrong ? ' bad' : '') },
          h('div', { class: 'ms-lcd' },
            h('div', null, 'UPS-01 STATUS'),
            h('div', { class: u.mode === 'ONLINE' ? 'okc' : 'warnc' }, `MODE  : ${u.mode}`),
            h('div', null, `INPUT : ${u.input} V`),
            h('div', null, `BATT  : ${u.battery} %`),
            h('div', null, `RUNTIME: ${u.runtimeMin} menit`)),
          h('div', null,
            h('p', { class: 'ms-q' }, 'Kondisi UPS?'),
            h('div', { class: 'ms-seg two', role: 'radiogroup', 'aria-label': 'Kondisi UPS' },
              btn('Normal', () => { ups = true; keepFocus(body, draw); }, 'ms-segb' + (ups === true ? ' on okc' : ''), { role: 'radio', 'aria-checked': String(ups === true), 'data-k': 'ua' }),
              btn('Perlu dilaporkan', () => { ups = false; keepFocus(body, draw); }, 'ms-segb' + (ups === false ? ' on badc' : ''), { role: 'radio', 'aria-checked': String(ups === false), 'data-k': 'ub' })),
            upsWrong ? h('em', null, u.ok ? 'MODE ONLINE, input listrik ada, baterai penuh: UPS normal.' : 'MODE ON BATTERY dan input 0 V artinya listrik PLN padam. Server hidup dari baterai yang akan habis, jadi harus segera dilaporkan.') : null)),
        res ? this.feedback('bad', h('b', null, 'Laporan belum tepat. '), 'Perbaiki yang ditandai merah, lalu kirim lagi.') : null,
        h('div', { class: 'ms-row-end' }, send));
    };
    const done = () => {
      const hot = sc.temps.map((t, i) => ({ t, i })).filter(x => x.t < TEMP_MIN || x.t > TEMP_MAX).map(x => `Rak ${x.i + 1} (${x.t} °C)`);
      put(body, this.feedback('ok', h('b', null, 'Laporan tepat! '),
        `Suhu bermasalah: ${hot.join(', ') || 'tidak ada'}. UPS: ${sc.ups.ok ? 'normal (ONLINE)' : `ON BATTERY, sisa sekitar ${sc.ups.runtimeMin} menit. Segera lapor ke supervisor.`}`),
        h('div', { class: 'ms-row-end' }, btn('Selesai ✓', () => this.ms.completeGame(m.id), 'ms-btn primary')));
      (body.querySelector('button') as HTMLButtonElement).focus();
    };
    draw();
    this.frame({ kicker: this.kick(m), title: 'Panel UPS & suhu ruang server', body, wide: true, closeLabel: 'Batal', foot: btn('Batal', () => this.cancel(), 'ms-btn ghost') });
  }
}
