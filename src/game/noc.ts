// NOC helpdesk shift: procedural trouble tickets injected into the PC network simulation.
// Loop: start shift at the NOC -> tickets arrive (priority + SLA) -> go to the PC -> diagnose ->
// fix (in the PC OS, or physically with C at the PC / at the server rack) -> verify from that PC
// (ping or browser) -> short report (root cause) -> XP, rank, mastery. Faults the player keeps
// getting wrong come back more often.
import { ENVS, envForPc, live, onSegment, ping, resolve, ipStr, parseIp, type Adapter, type Env } from '../pcos/net';
import type { PcOS, PcEvent } from '../pcos/os';
import './noc.css';

export type FaultId = 'cable' | 'port' | 'disabled' | 'released' | 'wrongip' | 'conflict' | 'gateway' | 'dns';
interface FaultDef { cause: string; symptom: string; hint: string; cp: string; hard: boolean; wired: boolean; rank: number }

export const FAULTS: Record<FaultId, FaultDef> = {
  cable: { cause: 'Kabel UTP lepas/longgar di PC', symptom: 'Ikon jaringan silang merah, internet mati total.', hint: 'Lihat status adapter: "Network cable unplugged" = masalah fisik. Cek kabel di PC [C].', cp: 'Fase E · Media & alat ukur', hard: false, wired: true, rank: 0 },
  disabled: { cause: 'Adapter jaringan di-disable', symptom: 'Ikon jaringan hilang, PC tidak terhubung ke mana pun.', hint: 'Buka Network Connections. Adapter abu-abu = Disabled.', cp: 'Fase E · Konfigurasi klien', hard: false, wired: false, rank: 0 },
  released: { cause: 'Alamat DHCP terlepas (perlu renew)', symptom: 'Terhubung tapi tidak dapat alamat IP.', hint: 'ipconfig: IPv4 kosong? Coba ipconfig /renew.', cp: 'Fase F · Layanan DHCP', hard: false, wired: false, rank: 0 },
  wrongip: { cause: 'IP statis salah subnet', symptom: 'Tidak bisa ping gateway, internet mati.', hint: 'Bandingkan IP PC dengan subnet ruangan. Pakai DHCP atau IP yang benar.', cp: 'Fase E · Pengalamatan IPv4', hard: false, wired: false, rank: 0 },
  gateway: { cause: 'Default gateway salah', symptom: 'Bisa ping PC/printer satu ruangan, tapi internet tidak bisa.', hint: 'ipconfig: cek Default Gateway, harus alamat router ruangan (.1).', cp: 'Fase F · Routing', hard: true, wired: false, rank: 1 },
  dns: { cause: 'Server DNS salah', symptom: 'ping 8.8.8.8 bisa, tapi situs tidak terbuka (nama tidak ditemukan).', hint: 'nslookup cari.id gagal? Periksa DNS di IPv4 Properties.', cp: 'Fase F · Layanan DNS', hard: true, wired: false, rank: 1 },
  port: { cause: 'Port switch shutdown', symptom: 'Kabel sudah dicek bagus, tapi lampu link tetap mati.', hint: 'Kabel baik + link mati = cek port di switch rak server (Lantai 1) [C].', cp: 'Fase F · Perangkat jaringan', hard: true, wired: true, rank: 1 },
  conflict: { cause: 'IP bentrok dengan perangkat lain', symptom: 'Koneksi putus-nyambung, muncul peringatan alamat IP.', hint: 'arp -a / ping alamat itu: ada perangkat lain memakai IP yang sama.', cp: 'Fase E · Pengalamatan IPv4', hard: true, wired: false, rank: 2 },
};

export const RANKS = [{ xp: 0, name: 'Magang' }, { xp: 500, name: 'Teknisi Junior' }, { xp: 1500, name: 'Teknisi' }, { xp: 3000, name: 'Network Engineer' }];
const PRIO = { Tinggi: 240, Sedang: 420, Rendah: 600 } as const;
type Prio = keyof typeof PRIO;
const WHO: Record<Env['id'], { who: string[]; prio: Prio[] }> = {
  lab: { who: ['Siswa praktik', 'Guru produktif', 'Asisten lab'], prio: ['Sedang', 'Rendah', 'Sedang'] },
  office: { who: ['Staf keuangan', 'Manajer kantor', 'Staf HRD', 'Admin marketing'], prio: ['Tinggi', 'Tinggi', 'Sedang', 'Sedang'] },
  guest: { who: ['Tamu hotel', 'Tamu VIP', 'Tamu bisnis'], prio: ['Sedang', 'Tinggi', 'Tinggi'] },
};

export interface PcInfo { name: string; label: string; x: number; y: number; z: number; level: number }
export interface Ticket {
  id: string; pc: PcInfo; faults: FaultId[]; who: string; prio: Prio; sla: number; age: number;
  status: 'open' | 'fixed' | 'closed'; wrong: number; port: string; hint: boolean; xp?: number; slaMet?: boolean; report?: boolean;
}
interface Save { v: 1; xp: number; shifts: number; closed: number; slaMet: number; seq: number; mastery: Partial<Record<FaultId, { ok: number; miss: number }>> }
const KEY = 'kotaNusantara.noc.v1';
const fresh = (): Save => ({ v: 1, xp: 0, shifts: 0, closed: 0, slaMet: 0, seq: 0, mastery: {} });
const pick = <T,>(a: T[], r = Math.random) => a[Math.floor(r() * a.length)];
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const mmss = (s: number) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;

/** Full connectivity from this adapter: valid address, gateway answers, DNS resolves, internet answers. */
export function healthy(a: Adapter, env: Env) {
  const l = live(a, env);
  if (!l.ok || !onSegment(l, env)) return false;
  if (ping(a, env, l.gw || '0.0.0.0', true).kind !== 'reply') return false;
  const r = resolve(a, env, 'cari.id');
  return !!r && r !== 'timeout' && ping(a, env, r.ip, true).kind === 'reply';
}

export class Noc {
  private s: Save = fresh();
  tickets: Ticket[] = [];
  shift = 0; active = false; trackedId: string | null = null;
  private modal: HTMLElement | null = null;
  private pendingReport: Ticket[] = [];
  private hud: HTMLElement;
  private listeners = new Set<(open: boolean) => void>();
  private hudT = 0;
  toast: (s: string, ms?: number) => void = () => {};

  constructor(private pcos: PcOS, private pcs: PcInfo[], readonly rack: { x: number; z: number }) {
    try { const raw = localStorage.getItem(KEY); if (raw) this.s = { ...fresh(), ...JSON.parse(raw) }; } catch { /* private mode */ }
    this.hud = h('div', '', ''); this.hud.id = 'noc-hud'; document.body.append(this.hud);
    const prev = pcos.onEvent;
    pcos.onEvent = e => { prev?.(e); this.onPc(e); };
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* ignore */ } }
  get xp() { return this.s.xp; }
  rankIndex() { let i = 0; RANKS.forEach((r, k) => { if (this.s.xp >= r.xp) i = k; }); return i; }
  rank() { return RANKS[this.rankIndex()].name; }
  isModalOpen() { return !!this.modal; }
  onModal(f: (open: boolean) => void) { this.listeners.add(f); }
  setHudVisible(v: boolean) { this.hud.style.display = v ? '' : 'none'; }
  tracked() { return this.tickets.find(t => t.id === this.trackedId && t.status !== 'closed') ?? null; }

  // ---------- shift & ticket generation ----------
  startShift(rand = Math.random, force?: FaultId[]) {
    if (this.active) { this.openBoard(); return; }
    const rk = this.rankIndex();
    const n = force?.length ?? Math.min(5, 3 + rk);
    this.shift = ++this.s.shifts; this.active = true; this.tickets = [];
    const used = new Set<string>();
    for (let i = 0; i < n; i++) {
      const pool = this.pcs.filter(p => !used.has(p.name) && (rk > 0 || p.level <= 3) && !(force && p.level > 3));
      const pc = pick(pool, rand); used.add(pc.name);
      const envId = envForPc(pc.name), env = ENVS[envId];
      const f = force ? force[i] : this.pickFault(env, rk, rand);
      const faults: FaultId[] = [f];
      if (!force && rk >= 2 && rand() < 0.35) { const g = this.pickFault(env, rk, rand, f); if (g !== f && !(g === 'disabled' || f === 'disabled')) faults.push(g); }
      const wi = Math.floor(rand() * WHO[envId].who.length);
      const prio = WHO[envId].prio[wi];
      const t: Ticket = { id: `TKT-${String(++this.s.seq).padStart(4, '0')}`, pc, faults, who: WHO[envId].who[wi], prio, sla: PRIO[prio], age: -i * 25, status: 'open', wrong: 0, port: `Gi1/0/${(Math.abs([...pc.name].reduce((a, c) => a * 31 + c.charCodeAt(0), 3)) % 24) + 1}`, hint: rk === 0 };
      this.inject(t);
      this.tickets.push(t);
    }
    this.trackedId = this.tickets[0].id;
    this.save();
    this.openBoard(`Shift ${this.shift} dimulai. ${n} tiket masuk ke antrean NOC.`);
  }
  private pickFault(env: Env, rk: number, rand: () => number, not?: FaultId): FaultId {
    const ids = (Object.keys(FAULTS) as FaultId[]).filter(id => FAULTS[id].rank <= rk && id !== not && !(FAULTS[id].wired && env.wireless) && !(id === 'released' && !env.dhcp) && !(id === 'conflict' && env.hosts.length < 2));
    const w = ids.map(id => { const m = this.s.mastery[id] ?? { ok: 0, miss: 0 }; return Math.max(0.3, 1 + m.miss * 1.5 - Math.min(m.ok, 4) * 0.2); });
    let r = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }
  /** Break the PC's adapter so the fault really exists in the simulation. */
  private inject(t: Ticket) {
    const a = this.pcos.adapter(t.pc.name), env = ENVS[envForPc(t.pc.name)];
    const base = parseIp(env.net)!;
    const host = (n: number) => ipStr((base + n) >>> 0);
    const mask = ipStr((0xffffffff << (32 - env.prefix)) >>> 0);
    const staticGood = () => { a.dhcp = false; a.ip = host(150 + Math.floor(Math.random() * 40)); a.mask = mask; a.gw = env.gateway; a.dns1 = env.dns[0]; a.dns2 = ''; a.dnsAuto = false; };
    for (const f of t.faults) {
      if (f === 'cable') a.cable = false;
      else if (f === 'port') a.portDown = true;
      else if (f === 'disabled') a.enabled = false;
      else if (f === 'released') { a.dhcp = true; a.lease = { ip: '', t: Date.now() }; }
      else if (f === 'wrongip') { a.dhcp = false; a.ip = `192.168.1.${20 + Math.floor(Math.random() * 200)}`; a.mask = '255.255.255.0'; a.gw = '192.168.1.1'; a.dns1 = '192.168.1.1'; a.dns2 = ''; a.dnsAuto = false; }
      else if (f === 'gateway') { staticGood(); a.gw = host(254); }
      else if (f === 'dns') { if (a.dhcp) { a.dnsAuto = false; a.dns1 = '10.10.10.53'; a.dns2 = ''; } else { a.dns1 = '10.10.10.53'; } }
      else if (f === 'conflict') { staticGood(); a.ip = pick(env.hosts.filter(x => x.ip !== env.gateway)).ip; }
    }
    a.arp.clear();
  }

  // ---------- physical checks (C key) ----------
  /** Returns a message for the toast, or null when there is nothing physical to check here. */
  physical(nearPc: string | null, nearRack: boolean): string | null {
    if (!this.active) return null;
    if (nearPc) {
      const t = this.tickets.find(x => x.pc.name === nearPc && x.status !== 'closed');
      if (!t) return null;
      const a = this.pcos.adapter(nearPc);
      if (ENVS[envForPc(nearPc)].wireless) { t.wrong++; return 'Laptop tamu memakai Wi-Fi, tidak ada kabel untuk dicek. (−10 XP: langkah tidak perlu)'; }
      if (!a.cable) { a.cable = true; a.arp.clear(); return 'Ketemu! Konektor RJ45 longgar. Kabel dicolok ulang sampai "klik", LED link menyala hijau.'; }
      if (a.portDown) return 'Kabel dan konektor bagus (LAN tester 1-8 lengkap), tapi LED link tetap mati. Masalahnya di sisi switch.';
      t.wrong++; return 'Kabel terpasang baik dan LED link menyala. Masalahnya bukan di fisik. (−10 XP)';
    }
    if (nearRack) {
      const ts = this.tickets.filter(x => x.status !== 'closed' && this.pcos.adapter(x.pc.name).portDown);
      if (!ts.length) { const any = this.tickets.some(x => x.status !== 'closed'); if (any) { const t = this.tracked(); if (t) t.wrong++; } return 'Semua port switch yang terpakai up/up. Tidak ada port yang shutdown.'; }
      for (const t of ts) { this.pcos.adapter(t.pc.name).portDown = false; }
      return `show interfaces status → ${ts.map(t => `${t.port} (${t.pc.label})`).join(', ')}: administratively down. Diketik: interface ${ts[0].port} → no shutdown. Port kembali up.`;
    }
    return null;
  }
  hintAt(nearPc: string | null, nearRack: boolean): string | null {
    if (!this.active) return null;
    if (nearPc && this.tickets.some(x => x.pc.name === nearPc && x.status !== 'closed')) return '[C] Cek kabel fisik';
    if (nearRack && this.tickets.some(x => x.status !== 'closed')) return '[C] Cek port switch (konsol)';
    return null;
  }

  // ---------- verification ----------
  private onPc(e: PcEvent) {
    const t = this.tickets.find(x => x.pc.name === e.pc && x.status !== 'closed');
    if (!t) return;
    const ok = (e.type === 'ping' && e.detail?.ok && e.detail?.target !== '127.0.0.1') || e.type === 'browse';
    if (ok && this.isHealthy(t)) this.close(t);
  }
  isHealthy(t: Ticket) { return healthy(this.pcos.adapter(t.pc.name), ENVS[envForPc(t.pc.name)]); }
  private close(t: Ticket) {
    t.status = 'closed';
    t.slaMet = t.age <= t.sla;
    let xp = 100 + (t.faults.some(f => FAULTS[f].hard) ? 50 : 0) + (t.faults.length > 1 ? 60 : 0) + (!t.hint ? 20 : 0);
    if (t.slaMet) xp += 50; else xp = Math.round(xp * 0.5);
    xp = Math.max(20, xp - t.wrong * 10);
    t.xp = xp; this.s.closed++; if (t.slaMet) this.s.slaMet++;
    this.pendingReport.push(t);
    const next = this.tickets.find(x => x.status !== 'closed');
    if (this.trackedId === t.id) this.trackedId = next?.id ?? null;
    this.toast(`${t.id} terverifikasi dari PC. Isi laporan untuk menutup tiket.`, 3500);
    this.save();
  }

  update(dt: number) {
    if (!this.active) { this.hud.innerHTML = ''; this.hud.classList.remove('on'); return; }
    for (const t of this.tickets) if (t.status !== 'closed') {
      t.age += dt;
      if (t.status === 'open' && t.age > 0 && this.isHealthy(t)) t.status = 'fixed';
      else if (t.status === 'fixed' && !this.isHealthy(t)) t.status = 'open';
    }
    if (this.pendingReport.length && !this.modal && !this.pcos.isOpen()) this.openReport(this.pendingReport.shift()!);
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.25; this.renderHud(); }
  }
  private renderHud() {
    const done = this.tickets.filter(t => t.status === 'closed').length;
    const t = this.tracked();
    this.hud.classList.add('on');
    if (!t) { this.hud.innerHTML = `<b>SHIFT ${this.shift}</b> · ${done}/${this.tickets.length} tiket<br><small>[T] Papan tiket</small>`; return; }
    const left = t.sla - Math.max(0, t.age);
    const st = t.status === 'fixed' ? '<span class="ok">Sudah normal · uji ping/browser dari PC itu</span>' : t.age < 0 ? '<span>Antre…</span>' : '<span class="bad">Belum beres</span>';
    this.hud.innerHTML = `<div class="top"><b>SHIFT ${this.shift}</b><span>${done}/${this.tickets.length} selesai</span></div>
      <div class="tk"><span class="pr p-${t.prio}">${t.prio}</span> <b>${t.id}</b> <span class="sla ${left < 0 ? 'late' : left < 60 ? 'warn' : ''}">SLA ${mmss(left)}</span></div>
      <div>${t.pc.label}</div><div class="sym">“${FAULTS[t.faults[0]].symptom}”</div><div>${st}</div>
      ${t.hint ? `<div class="hint">Petunjuk: ${FAULTS[t.faults[0]].hint}</div>` : ''}<small>[T] Papan tiket</small>`;
  }

  // ---------- UI ----------
  private show(el: HTMLElement) {
    this.closeModal(); this.modal = h('div', 'noc-modal'); this.modal.append(el); document.body.append(this.modal);
    if (document.pointerLockElement) document.exitPointerLock();
    this.modal.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.closeModal(); });
    (this.modal.querySelector('button') as HTMLButtonElement | null)?.focus();
    this.listeners.forEach(f => f(true));
  }
  closeModal() { if (!this.modal) return; this.modal.remove(); this.modal = null; this.listeners.forEach(f => f(false)); }

  openBoard(msg = '') {
    const box = h('div', 'noc-box');
    const rk = this.rankIndex(), nx = RANKS[rk + 1];
    const pct = nx ? Math.round(((this.s.xp - RANKS[rk].xp) / (nx.xp - RANKS[rk].xp)) * 100) : 100;
    box.append(h('h2', '', 'Papan Tiket NOC · Helpdesk Nusantara Tech'));
    box.append(h('div', 'rank', `<b>${this.rank()}</b> · ${this.s.xp} XP ${nx ? `· ${nx.xp - this.s.xp} XP lagi ke ${nx.name}` : ''}<div class="bar"><i style="width:${pct}%"></i></div><small>Shift selesai: ${this.s.shifts - (this.active ? 1 : 0)} · Tiket ditutup: ${this.s.closed} · Tepat SLA: ${this.s.slaMet}</small>`));
    if (msg) box.append(h('p', 'msg', msg));
    if (this.active) {
      const tb = h('table', 'tk-list', '<tr><th>Tiket</th><th>Prioritas</th><th>Pelapor · Lokasi</th><th>Keluhan</th><th>SLA</th><th>Status</th><th></th></tr>');
      for (const t of this.tickets) {
        const tr = h('tr', t.id === this.trackedId ? 'cur' : '');
        const left = t.sla - Math.max(0, t.age);
        tr.innerHTML = `<td>${t.id}</td><td><span class="pr p-${t.prio}">${t.prio}</span></td><td>${t.who}<br><small>${t.pc.label}</small></td><td>${FAULTS[t.faults[0]].symptom}</td><td>${t.status === 'closed' ? (t.slaMet ? 'Tepat' : 'Telat') : mmss(left)}</td><td>${t.status === 'closed' ? `Selesai +${t.xp}` : t.status === 'fixed' ? 'Perlu uji' : t.age < 0 ? 'Antre' : 'Terbuka'}</td>`;
        const td = h('td'); if (t.status !== 'closed') { const b = h('button', 'btn', t.id === this.trackedId ? 'Dilacak' : 'Lacak') as HTMLButtonElement; b.onclick = () => { this.trackedId = t.id; this.openBoard(); }; td.append(b); }
        tr.append(td); tb.append(tr);
      }
      box.append(tb);
      box.append(h('p', 'how', 'Datangi PC yang dilacak (ikuti penanda). Diagnosis pakai CMD/Network Connections, perbaiki, lalu <b>uji dari PC itu</b> (ping atau buka browser). Masalah fisik: tekan <b>C</b> di dekat PC atau di rak switch ruang server Lantai 1. Langkah yang tidak perlu mengurangi XP.'));
    } else {
      box.append(h('p', 'how', `Satu shift = ${Math.min(5, 3 + rk)} tiket gangguan nyata di PC gedung, tiap tiket punya batas waktu (SLA). Gangguan yang sering kamu salah tebak akan lebih sering muncul.`));
      const m = h('div', 'mastery', '<b>Penguasaan</b>');
      for (const id of Object.keys(FAULTS) as FaultId[]) { const f = FAULTS[id]; const s = this.s.mastery[id] ?? { ok: 0, miss: 0 }; m.append(h('div', f.rank > rk ? 'locked' : '', `${f.cause} <small>${f.rank > rk ? `terbuka di ${RANKS[f.rank].name}` : `benar ${s.ok} · salah ${s.miss}`}</small>`)); }
      box.append(m);
    }
    const row = h('div', 'row');
    if (!this.active) { const b = h('button', 'btn pri', 'Mulai Shift') as HTMLButtonElement; b.onclick = () => this.startShift(); row.append(b); }
    const c = h('button', 'btn', 'Tutup [Esc]') as HTMLButtonElement; c.onclick = () => this.closeModal(); row.append(c);
    box.append(row);
    this.show(box);
  }

  private openReport(t: Ticket) {
    const box = h('div', 'noc-box');
    box.append(h('h2', '', `Laporan ${t.id} · ${t.pc.label}`));
    box.append(h('p', '', `Keluhan: “${FAULTS[t.faults[0]].symptom}”<br>Apa <b>penyebab utama</b> yang kamu temukan?`));
    const others = (Object.keys(FAULTS) as FaultId[]).filter(f => !t.faults.includes(f)).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [t.faults[0], ...others].sort(() => Math.random() - 0.5);
    const list = h('div', 'opts');
    for (const o of opts) {
      const b = h('button', 'btn opt', FAULTS[o].cause) as HTMLButtonElement;
      b.onclick = () => {
        const right = t.faults.includes(o);
        for (const f of t.faults) { const m = this.s.mastery[f] ?? { ok: 0, miss: 0 }; if (right) m.ok++; else m.miss++; this.s.mastery[f] = m; }
        if (right) t.xp! += 30;
        const before = this.rankIndex();
        this.s.xp += t.xp!; t.report = true; this.save();
        const up = this.rankIndex() > before;
        this.openResult(t, right, up);
      };
      list.append(b);
    }
    box.append(list);
    this.show(box);
  }
  private openResult(t: Ticket, right: boolean, up: boolean) {
    const box = h('div', 'noc-box');
    box.append(h('h2', '', right ? 'Laporan tepat ✔' : 'Penyebabnya kurang tepat'));
    box.append(h('p', '', `Penyebab sebenarnya: <b>${t.faults.map(f => FAULTS[f].cause).join(' + ')}</b><br><small>${t.faults.map(f => FAULTS[f].cp).join(' · ')}</small>`));
    box.append(h('p', '', `SLA ${t.slaMet ? 'terpenuhi (+50)' : 'terlewat (XP ×0,5)'} · Langkah tidak perlu: ${t.wrong} (−${t.wrong * 10}) ${right ? '· Laporan tepat (+30)' : ''}<br><b>+${t.xp} XP</b> · total ${this.s.xp} XP`));
    if (up) box.append(h('p', 'msg', `Naik pangkat: <b>${this.rank()}</b>! Jenis gangguan baru terbuka di shift berikutnya.`));
    const row = h('div', 'row');
    const allDone = this.tickets.every(x => x.status === 'closed' && x.report);
    const b = h('button', 'btn pri', allDone ? 'Lihat rekap shift' : 'Lanjut') as HTMLButtonElement;
    b.onclick = () => (allDone ? this.endShift() : this.closeModal());
    row.append(b); box.append(row);
    this.show(box);
  }
  private endShift() {
    this.active = false;
    const xp = this.tickets.reduce((a, t) => a + (t.xp ?? 0), 0), met = this.tickets.filter(t => t.slaMet).length;
    this.trackedId = null;
    this.openBoard(`Shift ${this.shift} selesai: ${this.tickets.length} tiket, ${met} tepat SLA, +${xp} XP. Mulai shift baru kapan saja di NOC atau lewat [T].`);
  }
}
