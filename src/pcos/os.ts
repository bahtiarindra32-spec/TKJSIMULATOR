// "Jendela 11": a Windows 11 lookalike shell for in-game PCs (own branding, same layout & behaviour).
import './pcos.css';
import { ENVS, type Env, type Adapter, adapterOf, envOf, live, ping, resolve, hopsTo, onSegment, conflict, maskStr, parseIp, parseMask, ipStr, INTERNET, mediaOk, bounce, releaseLease, routerOf, setRouterLan, poolProblem, networkOf as netOf, PUBLIC_DNS } from './net';
import { networkOf, broadcastOf, prefixToMask } from '../game/missionLogic';

type Attrs = Record<string, any>;
function h(tag: string, a: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, String(v));
  }
  for (const c of kids) if (c != null && c !== false) e.append(c as any);
  return e;
}
const svg = (s: string) => { const d = document.createElement('span'); d.innerHTML = s; d.style.display = 'contents'; return d; };

// ---------------------------------------------------------------- icons (drawn here; lookalike, not copies)
const I = {
  logo: `<svg viewBox="0 0 24 24"><defs><linearGradient id="jl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#29c5f6"/><stop offset="1" stop-color="#0a64d8"/></linearGradient></defs><rect x="2" y="2" width="9.3" height="9.3" rx="1.6" fill="url(#jl)"/><rect x="12.7" y="2" width="9.3" height="9.3" rx="1.6" fill="url(#jl)"/><rect x="2" y="12.7" width="9.3" height="9.3" rx="1.6" fill="url(#jl)"/><rect x="12.7" y="12.7" width="9.3" height="9.3" rx="4.6" fill="url(#jl)"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/></svg>`,
  cmd: `<svg viewBox="0 0 32 32"><rect x="2" y="5" width="28" height="22" rx="3" fill="#2b2b2b"/><rect x="2" y="5" width="28" height="5" rx="2" fill="#4a4a4a"/><path d="M8 15l4 3-4 3" stroke="#fff" stroke-width="2" fill="none"/><path d="M14 22h8" stroke="#fff" stroke-width="2"/></svg>`,
  gear: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#5e6b7a"/><circle cx="16" cy="16" r="8" fill="none" stroke="#dfe6ee" stroke-width="3" stroke-dasharray="4 2.3"/><circle cx="16" cy="16" r="4" fill="#dfe6ee"/></svg>`,
  web: `<svg viewBox="0 0 32 32"><defs><linearGradient id="jw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d6a0"/><stop offset=".55" stop-color="#1b9de2"/><stop offset="1" stop-color="#0b4fa8"/></linearGradient></defs><path d="M16 3a13 13 0 1 0 12.6 16.2c-2.6 3-7.8 3.6-10.8 1.2-2.4-2-2.2-5.8.8-6.8 2.6-.8 6.4.4 9.8 2.6A13 13 0 0 0 16 3z" fill="url(#jw)"/></svg>`,
  note: `<svg viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="26" rx="2" fill="#fff" stroke="#5aa0d8" stroke-width="2"/><path d="M10 10h12M10 15h12M10 20h8" stroke="#5aa0d8" stroke-width="2"/></svg>`,
  folder: `<svg viewBox="0 0 32 32"><path d="M3 8a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#f4c24c"/><path d="M3 12h26v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#ffd767"/></svg>`,
  net: `<svg viewBox="0 0 48 48"><rect x="6" y="8" width="30" height="22" rx="2" fill="#3b82c4"/><rect x="9" y="11" width="24" height="16" fill="#9fd0f5"/><rect x="16" y="30" width="10" height="4" fill="#5c6f80"/><rect x="11" y="34" width="20" height="3" fill="#5c6f80"/><path d="M36 26h6v12h-8" stroke="#3a3a3a" stroke-width="2.4" fill="none"/><rect x="38" y="34" width="8" height="8" rx="1" fill="#4d4d4d"/></svg>`,
  run: `<svg viewBox="0 0 32 32"><rect x="3" y="7" width="26" height="18" rx="2" fill="#e8eef6" stroke="#6a8fb8" stroke-width="2"/><path d="M8 18l5-5M8 13h5v5" stroke="#2f6fb5" stroke-width="2" fill="none"/></svg>`,
  pc: `<svg viewBox="0 0 32 32"><rect x="3" y="5" width="26" height="17" rx="2" fill="#2f6fb5"/><rect x="5" y="7" width="22" height="13" fill="#8fc9f2"/><rect x="12" y="23" width="8" height="3" fill="#5c6f80"/><rect x="8" y="26" width="16" height="2" fill="#5c6f80"/></svg>`,
  power: `<svg viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.8"><path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/></svg>`,
  user: `<svg viewBox="0 0 64 64"><circle cx="32" cy="24" r="12" fill="#fff"/><path d="M10 58c2-12 11-18 22-18s20 6 22 18" fill="#fff"/></svg>`,
  eth: `<svg viewBox="0 0 16 16" fill="none" stroke="#222" stroke-width="1.2"><rect x="2" y="2" width="12" height="9" rx="1"/><path d="M5 11v3h6v-3M6 5v2M8 5v2M10 5v2"/></svg>`,
  wifi: `<svg viewBox="0 0 16 16" fill="none" stroke="#222" stroke-width="1.3"><path d="M1.5 6a9.5 9.5 0 0 1 13 0M3.8 8.6a6 6 0 0 1 8.4 0M6 11a2.8 2.8 0 0 1 4 0"/><circle cx="8" cy="13.2" r=".9" fill="#222"/></svg>`,
  globe: `<svg viewBox="0 0 16 16" fill="none" stroke="#222" stroke-width="1.1"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>`,
  noNet: `<svg viewBox="0 0 16 16" fill="none" stroke="#222" stroke-width="1.1"><circle cx="7" cy="7" r="5.2"/><path d="M1.8 7h10.4M7 1.8c1.7 1.7 1.7 8.7 0 10.4M7 1.8c-1.7 1.7-1.7 8.7 0 10.4"/><circle cx="12" cy="12" r="3.4" fill="#c42b1c" stroke="none"/><path d="M10.6 10.6l2.8 2.8M13.4 10.6l-2.8 2.8" stroke="#fff"/></svg>`,
  vol: `<svg viewBox="0 0 16 16" fill="none" stroke="#222" stroke-width="1.2"><path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4"/></svg>`,
  info: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#1976d2"/><path d="M16 14v9" stroke="#fff" stroke-width="3"/><circle cx="16" cy="9.5" r="2" fill="#fff"/></svg>`,
  warn: `<svg viewBox="0 0 32 32"><path d="M16 3l14 25H2z" fill="#f2c111"/><path d="M16 12v8" stroke="#222" stroke-width="3"/><circle cx="16" cy="24" r="1.8" fill="#222"/></svg>`,
  err: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#d13438"/><path d="M11 11l10 10M21 11L11 21" stroke="#fff" stroke-width="3"/></svg>`,
};
const OSNAME = 'Jendela', CORP = 'Nusa Corporation', BUILD = '10.0.22631.4317';

interface Win { id: string; el: HTMLElement; body: HTMLElement; title: string; icon: string; task: boolean; onClose?: () => void; focusEl?: () => HTMLElement | null }
interface PcState { a: Adapter; readonly env: Env; signed: boolean; notes: string; history: string[] }

export interface PcEvent { type: 'ping' | 'ipset' | 'browse' | 'cmd' | 'cfg'; pc: string; detail: any }

export class PcOS {
  readonly root: HTMLElement;
  private mon!: HTMLElement;
  private wins: Win[] = [];
  private z = 20;
  private pcs = new Map<string, PcState>();
  private cur: PcState | null = null;
  private curName = '';
  private label = '';
  private taskMid!: HTMLElement;
  private trayNet!: HTMLElement;
  private clockEl!: HTMLElement;
  private startEl!: HTMLElement;
  private ntfEl!: HTMLElement;
  private clockT = 0;
  onClose: (() => void) | null = null;
  onEvent: ((e: PcEvent) => void) | null = null;

  constructor() {
    this.root = h('div', { id: 'pcos' });
    document.body.append(this.root);
    this.root.addEventListener('keydown', e => this.keys(e));
    this.root.addEventListener('contextmenu', e => e.preventDefault());
  }
  isOpen() { return this.root.classList.contains('open'); }
  state(name: string) {
    let s = this.pcs.get(name);
    if (!s) { const a = adapterOf(name); s = { a, get env() { return envOf(name); }, signed: false, notes: '', history: [] }; this.pcs.set(name, s); }
    return s;
  }
  /** for missions/tests */
  adapter(name: string) { return this.state(name).a; }

  open(pcName: string, label: string) {
    this.cur = this.state(pcName); this.curName = pcName; this.label = label;
    this.root.innerHTML = ''; this.wins = [];
    this.buildDesktop();
    this.root.classList.add('open');
    if (!this.cur.signed) this.lockScreen();
    this.clockT = window.setInterval(() => this.tick(), 1000); this.tick();
  }
  close() {
    this.root.classList.remove('open'); clearInterval(this.clockT);
    for (const w of [...this.wins]) w.onClose?.();
    this.root.innerHTML = ''; this.wins = [];
    this.onClose?.();
  }
  private emit(type: PcEvent['type'], detail: any) { this.onEvent?.({ type, pc: this.curName, detail }); }

  private keys(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      const t = e.target as HTMLElement;
      if (this.startEl?.classList.contains('show')) { this.startEl.classList.remove('show'); return; }
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { (t as HTMLInputElement).blur(); return; }
      if (!this.wins.length) this.close();
    }
  }

  // ---------------------------------------------------------------- shell
  private lockScreen() {
    const d = new Date();
    const pw = h('input', { type: 'password', placeholder: 'PIN / Password' }) as HTMLInputElement;
    const go = () => { this.cur!.signed = true; lock.remove(); this.notify('Selamat datang', `Kamu masuk sebagai siswa di ${this.cur!.a.host}.`); };
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const lock = h('div', { class: 'lock' },
      h('div', { class: 'av', html: I.user }),
      h('h2', {}, 'Siswa TKJ'),
      h('div', { class: 'pw' }, pw, h('button', { onclick: go, title: 'Sign in' }, '→')),
      h('div', { class: 'hint' }, 'Akun lab tanpa password. Tekan Enter untuk masuk.'),
      h('div', { class: 'clock' }, h('b', {}, d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })), d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })),
    );
    this.mon.append(lock); setTimeout(() => pw.focus(), 50);
  }
  private buildDesktop() {
    this.mon = h('div', { class: 'mon' });
    const bloom = h('div', { class: 'bloom' }); for (let i = 0; i < 6; i++) { const p = h('i'); p.style.transform = `rotate(${-75 + i * 30}deg)`; bloom.append(p); }
    this.mon.append(bloom);
    const icons = h('div', { class: 'icons' },
      this.dicon(I.pc, 'This PC', () => this.openSettings('system')),
      this.dicon(I.cmd, 'Command Prompt', () => this.openCmd()),
      this.dicon(I.net, 'Network Connections', () => this.openNcpa()),
      this.dicon(I.web, 'Tepi', () => this.openBrowser()),
      this.dicon(I.note, 'Notepad', () => this.openNotepad()),
      this.dicon(I.folder, 'Lembar Kerja', () => this.openNotepad('LEMBAR KERJA TKJ\r\n\r\n1. Cek konfigurasi IP: ipconfig /all\r\n2. Uji koneksi ke gateway & server: ping\r\n3. Cek DNS: nslookup cari.id\r\n4. Lacak rute: tracert cari.id\r\n5. Atur IP statis lewat Network Connections > Ethernet > Properties > IPv4\r\n')),
    );
    this.mon.append(icons);
    this.mon.addEventListener('mousedown', e => { if (e.target === this.mon || e.target === icons) { this.startEl.classList.remove('show'); } });
    // taskbar
    this.taskMid = h('div', { class: 'mid' });
    const startBtn = h('div', { class: 'tbi', title: 'Start', onclick: () => this.toggleStart() }, svg(I.logo));
    const searchBtn = h('div', { class: 'tbi search', onclick: () => { this.toggleStart(true); setTimeout(() => (this.startEl.querySelector('input') as HTMLInputElement)?.focus(), 60); } }, svg(I.search), 'Search');
    this.taskMid.append(startBtn, searchBtn);
    for (const [ic, nm, fn] of [[I.folder, 'File Explorer', () => this.openNotepad()], [I.web, 'Tepi', () => this.openBrowser()], [I.cmd, 'Command Prompt', () => this.openCmd()], [I.gear, 'Settings', () => this.openSettings('network')]] as [string, string, () => void][]) {
      this.taskMid.append(h('div', { class: 'tbi pinned', title: nm, 'data-app': nm, onclick: () => { const w = this.wins.find(x => x.title.includes(nm)); if (w) this.toggleMin(w); else fn(); } }, svg(ic)));
    }
    this.trayNet = h('div', { class: 'ti', title: '', onclick: () => this.openSettings('network') });
    this.clockEl = h('div', { class: 'clk' });
    const tray = h('div', { class: 'tray' }, h('div', { class: 'ti', style: { fontSize: '12px' } }, '^'), h('div', { class: 'ti' }, this.trayNet, svg(I.vol)), h('div', { class: 'ti' }, this.clockEl));
    const tb = h('div', { class: 'tb' }, this.taskMid, tray);
    this.startEl = this.buildStart();
    this.ntfEl = h('div', { class: 'ntf' });
    const leave = h('button', { class: 'leave', onclick: () => this.close() }, '✕ Tinggalkan PC (Esc)');
    this.mon.append(tb, this.startEl, this.ntfEl, leave);
    this.root.append(this.mon);
    this.refreshTray();
  }
  private dicon(ic: string, name: string, fn: () => void) { return h('div', { class: 'di', ondblclick: fn, title: name }, svg(ic), name); }
  private buildStart() {
    const inp = h('input', { placeholder: 'Search for apps, settings, and documents' }) as HTMLInputElement;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = inp.value.trim(); inp.value = ''; this.startEl.classList.remove('show'); if (!this.runCommand(v)) this.openBrowser(`cari.id/search?q=${encodeURIComponent(v)}`); } });
    const pin = (ic: string, nm: string, fn: () => void) => h('div', { class: 'pin', onclick: () => { this.startEl.classList.remove('show'); fn(); } }, svg(ic), nm);
    const pmenu = h('div', { class: 'pmenu' },
      h('div', { onclick: () => { this.cur!.signed = false; this.close(); } }, 'Sign out'),
      h('div', { onclick: () => { this.cur!.signed = false; this.close(); } }, 'Shut down'),
      h('div', { onclick: () => { this.cur!.signed = false; this.open(this.curName, this.label); } }, 'Restart'));
    return h('div', { class: 'start' },
      h('div', { class: 'sbox' }, svg(I.search), inp),
      h('h4', {}, 'Pinned'),
      h('div', { class: 'pins' },
        pin(I.web, 'Tepi', () => this.openBrowser()), pin(I.cmd, 'Command Prompt', () => this.openCmd()), pin(I.gear, 'Settings', () => this.openSettings('network')),
        pin(I.net, 'Network Connections', () => this.openNcpa()), pin(I.note, 'Notepad', () => this.openNotepad()), pin(I.run, 'Run', () => this.openRun()),
        pin(I.pc, 'This PC', () => this.openSettings('system')), pin(I.folder, 'File Explorer', () => this.openNotepad())),
      h('h4', {}, 'Recommended'),
      h('div', { style: { padding: '0 44px', color: '#555', fontSize: '12px' } }, 'Tips: ketik "cmd" atau "ncpa.cpl" di kotak Search lalu Enter.'),
      h('div', { class: 'foot' }, h('div', { class: 'user' }, h('i'), 'Siswa TKJ'), h('div', { class: 'pwr', onclick: (e: Event) => { e.stopPropagation(); pmenu.classList.toggle('show'); } }, svg(I.power))),
      pmenu);
  }
  private toggleStart(force?: boolean) { const s = force ?? !this.startEl.classList.contains('show'); this.startEl.classList.toggle('show', s); }
  private tick() {
    const d = new Date();
    if (this.clockEl) this.clockEl.innerHTML = `${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}<br>${d.toLocaleDateString('en-GB')}`;
  }
  private status(): 'none' | 'local' | 'internet' {
    const s = this.cur!; const l = live(s.a, s.env);
    if (!l.ok) return 'none';
    return ping(s.a, s.env, '8.8.8.8', true).kind === 'reply' ? 'internet' : 'local';
  }
  refreshTray() {
    if (!this.trayNet || !this.cur) return;
    const st = this.status(), wl = this.cur.env.wireless;
    this.trayNet.innerHTML = st === 'none' ? I.noNet : st === 'internet' ? (wl ? I.wifi : I.eth) : I.globe;
    this.trayNet.title = st === 'none' ? 'Not connected' : st === 'internet' ? `${wl ? 'Wi-Fi Tamu' : 'Network'}\nInternet access` : 'Network\nNo internet';
  }
  notify(title: string, msg: string) {
    this.ntfEl.innerHTML = ''; this.ntfEl.append(h('b', {}, title), msg); this.ntfEl.classList.add('show');
    clearTimeout((this.ntfEl as any)._t); (this.ntfEl as any)._t = setTimeout(() => this.ntfEl.classList.remove('show'), 5000);
  }
  /** Run dialog / Start search commands */
  private runCommand(v: string) {
    const c = v.toLowerCase().trim();
    if (['cmd', 'cmd.exe', 'command prompt'].includes(c)) this.openCmd();
    else if (['ncpa.cpl', 'control netconnections', 'network connections'].includes(c)) this.openNcpa();
    else if (['notepad', 'notepad.exe'].includes(c)) this.openNotepad();
    else if (['tepi', 'msedge', 'browser'].includes(c)) this.openBrowser();
    else if (c.startsWith('ms-settings') || c === 'settings' || c === 'control') this.openSettings('network');
    else if (c === 'run') this.openRun();
    else return false;
    return true;
  }

  // ---------------------------------------------------------------- window manager
  private win(o: { title: string; icon: string; w: number; h: number; body: HTMLElement; dark?: boolean; task?: boolean; dialog?: boolean; noMax?: boolean; onClose?: () => void; focusEl?: () => HTMLElement | null }): Win {
    const mw = this.mon.clientWidth || innerWidth, mh = (this.mon.clientHeight || innerHeight) - 48;
    const W = Math.min(o.w, mw - 20), H = Math.min(o.h, mh - 20);
    const off = (this.wins.length % 6) * 26;
    const el = h('div', { class: `win${o.dark ? ' dark' : ''}`, style: { width: `${W}px`, height: `${H}px`, left: `${Math.max(4, (mw - W) / 2 - 60 + off)}px`, top: `${Math.max(4, (mh - H) / 2 - 30 + off)}px` } });
    const w: Win = { id: Math.random().toString(36).slice(2), el, body: o.body, title: o.title, icon: o.icon, task: o.task !== false && !o.dialog, onClose: o.onClose, focusEl: o.focusEl };
    const close = () => this.closeWin(w);
    const bar = h('div', { class: 'tbar' }, h('div', { class: 'tt' }, svg(o.icon), o.title),
      !o.dialog && h('div', { class: 'cb', title: 'Minimize', onclick: () => this.toggleMin(w) }, '—'),
      !o.dialog && !o.noMax && h('div', { class: 'cb', title: 'Maximize', onclick: () => el.classList.toggle('max') }, '▢'),
      h('div', { class: 'cb x', title: 'Close', onclick: close }, '✕'));
    bar.addEventListener('dblclick', () => { if (!o.dialog && !o.noMax) el.classList.toggle('max'); });
    bar.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.cb') || el.classList.contains('max')) return;
      const sx = e.clientX, sy = e.clientY, l0 = el.offsetLeft, t0 = el.offsetTop;
      const mv = (ev: MouseEvent) => { el.style.left = `${l0 + ev.clientX - sx}px`; el.style.top = `${Math.max(0, t0 + ev.clientY - sy)}px`; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    const rz = h('div', { class: 'rz' });
    rz.addEventListener('mousedown', (e: MouseEvent) => {
      e.stopPropagation(); const sx = e.clientX, sy = e.clientY, w0 = el.offsetWidth, h0 = el.offsetHeight;
      const mv = (ev: MouseEvent) => { el.style.width = `${Math.max(260, w0 + ev.clientX - sx)}px`; el.style.height = `${Math.max(140, h0 + ev.clientY - sy)}px`; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    const body = h('div', { class: 'wbody' }, o.body);
    el.append(bar, body); if (!o.dialog) el.append(rz);
    el.addEventListener('mousedown', () => this.focus(w), true);
    this.mon.append(el); this.wins.push(w); this.focus(w);
    if (w.task) {
      const pinned = this.taskMid.querySelector(`[data-app="${o.title.split(' - ').pop()}"]`) as HTMLElement | null;
      const btn = pinned ?? h('div', { class: 'tbi', title: o.title, onclick: () => this.toggleMin(w) }, svg(o.icon));
      if (!pinned) this.taskMid.append(btn);
      (w as any).btn = btn; (w as any).pinned = !!pinned; btn.classList.add('run');
    }
    return w;
  }
  private focus(w: Win) {
    w.el.style.zIndex = String(++this.z);
    for (const x of this.wins) { x.el.classList.toggle('inactive', x !== w); (x as any).btn?.classList.toggle('act', x === w); }
    setTimeout(() => w.focusEl?.()?.focus(), 0);
  }
  private toggleMin(w: Win) {
    const top = Number(w.el.style.zIndex) === this.z && !w.el.classList.contains('min');
    if (top) { w.el.classList.add('min'); (w as any).btn?.classList.remove('act'); } else { w.el.classList.remove('min'); this.focus(w); }
  }
  private closeWin(w: Win) {
    w.onClose?.(); w.el.remove(); this.wins = this.wins.filter(x => x !== w);
    const b = (w as any).btn as HTMLElement | undefined;
    if (b) { if ((w as any).pinned) { if (!this.wins.some(x => (x as any).btn === b)) b.classList.remove('run', 'act'); } else b.remove(); }
    const top = this.wins.filter(x => !x.el.classList.contains('min')).sort((a, b2) => Number(b2.el.style.zIndex) - Number(a.el.style.zIndex))[0];
    if (top) this.focus(top);
  }
  msgBox(title: string, text: string, kind: 'info' | 'warn' | 'err' = 'info', buttons: string[] = ['OK']): Promise<string> {
    return new Promise(res => {
      let w: Win;
      const btns = buttons.map((b, i) => h('button', { class: `btn${i === 0 ? ' def' : ''}`, onclick: () => { this.closeWin(w); res(b); } }, b));
      const body = h('div', {}, h('div', { class: 'mb' }, h('div', { class: 'ic', html: I[kind] , style: { width: '32px' } }), h('div', { style: { whiteSpace: 'pre-wrap', maxWidth: '380px' } }, text)), h('div', { class: 'mbf' }, ...btns));
      w = this.win({ title, icon: I[kind], w: 460, h: 190, body, dialog: true, onClose: () => res('Cancel'), focusEl: () => btns[0] });
      w.el.style.height = 'auto';
    });
  }

  // ---------------------------------------------------------------- Command Prompt
  openCmd() {
    const s = this.cur!; const out = h('div'); const inp = h('input', { spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
    const prm = h('span', {}, 'C:\\Users\\siswa>');
    const inRow = h('div', { class: 'in' }, prm, inp);
    const term = h('div', { class: 'cmd' }, out, inRow);
    let cwd = 'C:\\Users\\siswa', busy: { stop: () => void } | null = null, hi = s.history.length;
    const print = (t = '') => { for (const ln of t.split('\n')) out.append(h('div', { class: 'ln' }, ln)); term.scrollTop = term.scrollHeight; };
    print(`${OSNAME} Nusantara [Version ${BUILD}]\n(c) ${CORP}. All rights reserved.\n`);
    term.addEventListener('mouseup', () => { if (!getSelection()?.toString()) inp.focus(); });
    const w = this.win({ title: 'Command Prompt', icon: I.cmd, w: 860, h: 470, body: term, dark: true, focusEl: () => inp, onClose: () => busy?.stop() });
    const done = () => { busy = null; inRow.style.display = ''; prm.textContent = `${cwd}>`; term.scrollTop = term.scrollHeight; inp.focus(); this.refreshTray(); };
    const seq = (lines: (string | (() => string))[], gap = 1000, first = 0): Promise<void> => new Promise(res => {
      let i = 0, t = 0; inRow.style.display = 'none';
      const stop = () => { clearTimeout(t); print('Control-C\n^C'); res(); };
      busy = { stop };
      const step = () => { if (i >= lines.length) { busy = null; res(); return; } const l = lines[i++]; const txt = typeof l === 'function' ? l() : l; if (txt !== '\u0000') print(txt); t = window.setTimeout(step, i === 1 ? first : (txt === '' ? 0 : gap)); };
      t = window.setTimeout(step, first);
    });
    inp.addEventListener('keydown', async e => {
      if (e.key === 'ArrowUp') { if (hi > 0) inp.value = s.history[--hi]; e.preventDefault(); return; }
      if (e.key === 'ArrowDown') { if (hi < s.history.length - 1) inp.value = s.history[++hi]; else { hi = s.history.length; inp.value = ''; } e.preventDefault(); return; }
      if (e.key === 'Tab') { e.preventDefault(); return; }
      if (e.key !== 'Enter') return;
      const raw = inp.value; inp.value = '';
      print(`${cwd}>${raw}`);
      if (raw.trim()) { s.history.push(raw); hi = s.history.length; }
      inRow.style.display = 'none';
      await this.exec(raw.trim(), { print, seq, setBusy: (f: (() => void) | null) => { busy = f ? { stop: f } : null; }, cls: () => { out.innerHTML = ''; }, exit: () => this.closeWin(w), cwd: () => cwd, cd: (p: string) => { cwd = p; } });
      if (w.el.isConnected) { print(''); done(); }
    });
    term.addEventListener('keydown', e => { if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && busy && !getSelection()?.toString()) { e.preventDefault(); busy.stop(); } });
    // Ctrl+C while busy (input hidden): listen on the window body
    w.el.tabIndex = -1; w.el.addEventListener('keydown', e => { if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && busy) { e.preventDefault(); busy.stop(); } });
    return w;
  }

  private async exec(line: string, t: { print: (s?: string) => void; seq: (l: (string | (() => string))[], gap?: number, first?: number) => Promise<void>; setBusy: (f: (() => void) | null) => void; cls: () => void; exit: () => void; cwd: () => string; cd: (p: string) => void }) {
    const s = this.cur!; const a = s.a, env = s.env;
    if (!line) return;
    const parts = line.split(/\s+/); const cmd = parts[0].toLowerCase(); const args = parts.slice(1); const al = args.map(x => x.toLowerCase());
    this.emit('cmd', { line });
    const adName = env.wireless ? 'Wi-Fi' : 'Ethernet';
    const adHead = `${env.wireless ? 'Wireless LAN adapter' : 'Ethernet adapter'} ${adName}:`;
    const l = live(a, env);
    const mm = a.mac.split('-'); const ll6 = `fe80::${(parseInt(mm[0], 16) ^ 2).toString(16).padStart(2, '0')}${mm[1]}:${mm[2]}ff:fe${mm[3]}:${mm[4]}${mm[5]}%12`.replace(/::0+/, '::');
    const dot = (k: string) => { if (k === 'Connection-specific DNS Suffix') return '   Connection-specific DNS Suffix  . : '; let x = k; for (let i = k.length; i < 34; i++) x += i % 2 === 0 ? '.' : ' '; return `   ${x}: `; };
    const fmtDate = (d: Date) => d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).replace(' at ', ' ');
    switch (cmd) {
      case 'cls': t.cls(); return;
      case 'exit': t.exit(); return;
      case 'help': t.print('For more information on a specific command, type HELP command-name\nARP            Displays and modifies the IP-to-Physical address translation tables.\nCLS            Clears the screen.\nDATE           Displays the date.\nDIR            Displays a list of files and subdirectories in a directory.\nECHO           Displays messages.\nEXIT           Quits the CMD.EXE program (command interpreter).\nGETMAC         Displays the MAC address of network adapters.\nHOSTNAME       Prints the name of the current host.\nIPCONFIG       Displays all current TCP/IP network configuration values.\nNETSH          Network shell (interface ip show config).\nNSLOOKUP       Queries the DNS for host name resolution.\nPING           Sends ICMP ECHO_REQUEST packets to network hosts.\nROUTE          Displays the network routing table (route print).\nTIME           Displays the system time.\nTRACERT        Traces the route to a destination.\nVER            Displays the Jendela version.\nWHOAMI         Displays the current user.'); return;
      case 'ver': t.print(`\n${OSNAME} Nusantara [Version ${BUILD}]`); return;
      case 'hostname': t.print(a.host); return;
      case 'whoami': t.print(`${a.host.toLowerCase()}\\siswa`); return;
      case 'echo': t.print(args.length ? line.slice(5) : 'ECHO is on.'); return;
      case 'date': t.print(`${new Date().toLocaleDateString('en-US', { weekday: 'short' })} ${new Date().toLocaleDateString('en-US')}`); return;
      case 'time': t.print(new Date().toLocaleTimeString('en-GB')); return;
      case 'cd': if (!args.length) t.print(t.cwd()); else if (args[0] === '..') t.cd(t.cwd().split('\\').slice(0, -1).join('\\') || 'C:\\'); else if (args[0] === '\\') t.cd('C:\\'); else t.print('The system cannot find the path specified.'); return;
      case 'dir': t.print(` Volume in drive C has no label.\n Volume Serial Number is 6A1E-90F2\n\n Directory of ${t.cwd()}\n\n${new Date().toLocaleDateString('en-GB')}  07:12    <DIR>          .\n${new Date().toLocaleDateString('en-GB')}  07:12    <DIR>          Desktop\n${new Date().toLocaleDateString('en-GB')}  07:12    <DIR>          Documents\n${new Date().toLocaleDateString('en-GB')}  07:12    <DIR>          Downloads\n               0 File(s)              0 bytes\n               4 Dir(s)  182.404.112.384 bytes free`); return;
      case 'getmac': t.print(`\nPhysical Address    Transport Name\n=================== ==========================================================\n${a.mac.toUpperCase()}   ${l.ok ? '\\Device\\Tcpip_{6D1A2F44-0B9C-4E2B-9C11-3F0A7B5E21D4}' : 'Media disconnected'}`); return;
      case 'ipconfig': return this.ipconfig(al, t, { adHead, adName, l, ll6, dot, fmtDate });
      case 'ping': return this.cmdPing(args, t);
      case 'tracert': return this.cmdTracert(args, t);
      case 'nslookup': return this.cmdNslookup(args, t);
      case 'arp': {
        if (!al.includes('-a') && !al.includes('/a') && !al.includes('-g')) { t.print('\nDisplays and modifies the IP-to-Physical address translation tables used by\naddress resolution protocol (ARP).\n\nARP -a [inet_addr] [-N if_addr] [-v]\nARP -d inet_addr [if_addr]\n\n  -a            Displays current ARP entries.'); return; }
        if (al.includes('-d')) { a.arp.clear(); return; }
        if (!l.ok) { t.print('No ARP Entries Found.'); return; }
        const p = l.prefix, bc = ipStr(broadcastOf(parseIp(l.ip)!, p));
        const rows = [...a.arp.entries()].map(([ip, mac]) => `  ${ip.padEnd(22)}${mac.padEnd(22)}dynamic`);
        t.print(`\nInterface: ${l.ip} --- 0xc\n  Internet Address      Physical Address      Type\n${rows.length ? rows.join('\n') + '\n' : ''}  ${bc.padEnd(22)}ff-ff-ff-ff-ff-ff     static\n  224.0.0.22            01-00-5e-00-00-16     static\n  224.0.0.251           01-00-5e-00-00-fb     static\n  239.255.255.250       01-00-5e-7f-ff-fa     static`);
        return;
      }
      case 'route': {
        if (al[0] !== 'print') { t.print('\nManipulates network routing tables.\n\nROUTE [-f] [-p] [-4|-6] command [destination]\n   command   PRINT  Prints a route'); return; }
        if (!l.ok) { t.print('===========================================================================\nIPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331\n==========================================================================='); return; }
        const net = ipStr(networkOf(parseIp(l.ip)!, l.prefix)), mk = maskStr(l.prefix);
        t.print(`===========================================================================\nIPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n${l.gw ? `          0.0.0.0          0.0.0.0  ${l.gw.padStart(14)}  ${l.ip.padStart(14)}     25\n` : ''}        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331\n${net.padStart(17)}  ${mk.padStart(15)}         On-link  ${l.ip.padStart(14)}    281\n${l.ip.padStart(17)}  255.255.255.255         On-link  ${l.ip.padStart(14)}    281\n===========================================================================\nPersistent Routes:\n  None`);
        return;
      }
      case 'netsh': {
        if (al.join(' ').startsWith('interface ip show config') || al.join(' ').startsWith('int ip show config')) {
          t.print(`\nConfiguration for interface "${adName}"\n    DHCP enabled:                         ${a.dhcp ? 'Yes' : 'No'}\n    IP Address:                           ${l.ip || '-'}\n    Subnet Prefix:                        ${l.ok ? `${ipStr(networkOf(parseIp(l.ip)!, l.prefix))}/${l.prefix} (mask ${maskStr(l.prefix)})` : '-'}\n    Default Gateway:                      ${l.gw || '-'}\n    Gateway Metric:                       0\n    InterfaceMetric:                      25\n    ${a.dhcp && a.dnsAuto ? 'DNS servers configured through DHCP:' : 'Statically Configured DNS Servers:'}  ${l.dns.join('\n                                          ') || 'None'}`);
        } else t.print('The following command was not found: ' + args.join(' ') + '.');
        return;
      }
      default:
        t.print(`'${parts[0]}' is not recognized as an internal or external command,\noperable program or batch file.`);
    }
  }

  private ipconfig(al: string[], t: any, c: any) {
    const s = this.cur!, a = s.a, env = s.env; let l = c.l;
    const head = `\n${OSNAME} IP Configuration\n`;
    const disc = !a.enabled ? null : !mediaOk(a);
    const sum = (full: boolean) => {
      l = live(a, env);
      if (!a.enabled) return '';
      const lines = [`\n${c.adHead}\n`];
      if (disc) { lines.push(`${c.dot('Media State')}Media disconnected`, `${c.dot('Connection-specific DNS Suffix')}`); if (full) lines.push(`${c.dot('Description')}${env.adapter}`, `${c.dot('Physical Address')}${a.mac.toUpperCase()}`, `${c.dot('DHCP Enabled')}${a.dhcp ? 'Yes' : 'No'}`, `${c.dot('Autoconfiguration Enabled')}Yes`); return lines.join('\n'); }
      lines.push(`${c.dot('Connection-specific DNS Suffix')}${a.dhcp && l.ok && !l.apipa ? env.suffix : ''}`);
      if (full) lines.push(`${c.dot('Description')}${env.adapter}`, `${c.dot('Physical Address')}${a.mac.toUpperCase()}`, `${c.dot('DHCP Enabled')}${a.dhcp ? 'Yes' : 'No'}`, `${c.dot('Autoconfiguration Enabled')}Yes`);
      lines.push(`${c.dot('Link-local IPv6 Address')}${c.ll6}${full ? '(Preferred)' : ''}`);
      if (l.ok) {
        const dup = conflict(l, env, a);
        lines.push(`${c.dot(l.apipa ? 'Autoconfiguration IPv4 Address' : 'IPv4 Address')}${l.ip}${full ? (dup ? '(Duplicate)' : '(Preferred)') : ''}`, `${c.dot('Subnet Mask')}${maskStr(l.prefix)}`);
        if (full && a.dhcp && !l.apipa && a.lease) { lines.push(`${c.dot('Lease Obtained')}${c.fmtDate(new Date(a.lease.t))}`, `${c.dot('Lease Expires')}${c.fmtDate(new Date(a.lease.t + (env.dhcp?.lease ?? 8) * 3600e3))}`); }
      }
      lines.push(`${c.dot('Default Gateway')}${l.ok ? l.gw : ''}`);
      if (full) {
        if (a.dhcp && l.ok && !l.apipa) lines.push(`${c.dot('DHCP Server')}${a.lease?.server ?? env.gateway}`);
        lines.push(`${c.dot('DNS Servers')}${l.dns.length ? l.dns.join('\n' + ' '.repeat(39)) : (l.ok ? 'fec0:0:0:ffff::1%1' : '')}`, `${c.dot('NetBIOS over Tcpip')}Enabled`);
      }
      return lines.join('\n');
    };
    const global = () => `\n   Host Name . . . . . . . . . . . . : ${a.host}\n   Primary Dns Suffix  . . . . . . . : \n   Node Type . . . . . . . . . . . . : Hybrid\n   IP Routing Enabled. . . . . . . . : No\n   WINS Proxy Enabled. . . . . . . . : No${a.dhcp && l.ok && !l.apipa ? `\n   DNS Suffix Search List. . . . . . : ${env.suffix}` : ''}`;
    const sw = al[0] ?? '';
    if (sw === '/?' || sw === '-?') { t.print('\nUSAGE:\n    ipconfig [/allcompartments] [/? | /all |\n                                 /renew [adapter] | /release [adapter] |\n                                 /flushdns | /displaydns | /registerdns ]\n\nwhere\n    /?               Display this help message\n    /all             Display full configuration information.\n    /release         Release the IPv4 address for the specified adapter.\n    /renew           Renew the IPv4 address for the specified adapter.\n    /flushdns        Purges the DNS Resolver cache.'); return; }
    if (sw === '' ) { t.print(head + sum(false)); return; }
    if (sw === '/all') { t.print(head + global() + '\n' + sum(true)); return; }
    if (sw === '/flushdns') { t.print(head + '\nSuccessfully flushed the DNS Resolver Cache.'); return; }
    if (sw === '/release' || sw === '/renew') {
      if (!a.enabled) { t.print(head + '\nThe operation failed as no adapter is in the state permissible for\nthis operation.'); return; }
      if (disc) { t.print(head + `\nNo operation can be performed on ${c.adName} while it has its media disconnected.`); return; }
      if (!a.dhcp) { t.print(head + '\nThe operation failed as no adapter is in the state permissible for\nthis operation.'); return; }
      if (sw === '/release') { releaseLease(a); a.lease = { ip: '', t: Date.now(), prefix: 0, gw: '', dns: [], env: env.id, server: '' }; a.arp.clear(); this.emit('cmd', { line: 'ipconfig /release', release: true }); this.refreshTray(); t.print(head + sum(false)); return; }
      return t.seq(['\u0000'], 0, 1200).then(() => { bounce(a); live(a, s.env); this.emit('cmd', { line: 'ipconfig /renew', renew: true }); this.refreshTray(); t.print(head + sum(false)); });
    }
    t.print(`\nError: unrecognized or incomplete command line.\n\nUSAGE:\n    ipconfig [/? | /all | /renew [adapter] | /release [adapter] | /flushdns]`);
  }

  private parseTarget(t: any, raw: string | undefined, kind: 'ping' | 'tracert'): { ip: string; name: string } | null {
    const s = this.cur!;
    if (!raw) return null;
    const r = resolve(s.a, s.env, raw);
    if (r === null || r === 'timeout') { t.print(kind === 'ping' ? `Ping request could not find host ${raw}. Please check the name and try again.` : `Unable to resolve target system name ${raw}.`); return null; }
    return { ip: r.ip, name: parseIp(raw) !== null ? '' : raw };
  }
  private async cmdPing(args: string[], t: any) {
    const s = this.cur!;
    let n = 4, cont = false, size = 32; const rest: string[] = [];
    for (let i = 0; i < args.length; i++) { const x = args[i].toLowerCase(); if (x === '-n' || x === '/n') n = Math.max(1, Math.min(50, parseInt(args[++i]) || 4)); else if (x === '-t' || x === '/t') cont = true; else if (x === '-l' || x === '/l') size = Math.max(0, Math.min(65500, parseInt(args[++i]) || 32)); else rest.push(args[i]); }
    if (!rest.length) { t.print('\nUsage: ping [-t] [-a] [-n count] [-l size] [-f] [-i TTL] [-v TOS]\n            [-r count] [-s count] [[-j host-list] | [-k host-list]]\n            [-w timeout] [-R] [-S srcaddr] [-c compartment] [-p]\n            [-4] [-6] target_name\n\nOptions:\n    -t             Ping the specified host until stopped.\n                   To see statistics and continue - type Control-Break;\n                   To stop - type Control-C.\n    -n count       Number of echo requests to send.\n    -l size        Send buffer size.'); return; }
    const tg = this.parseTarget(t, rest[0], 'ping'); if (!tg) return;
    t.print(`\nPinging ${tg.name ? `${tg.name} [${tg.ip}]` : tg.ip} with ${size} bytes of data:`);
    let sent = 0, recv = 0; const times: number[] = []; let anyOk = false;
    const one = () => {
      sent++;
      const r = ping(s.a, s.env, tg.ip);
      if (r.kind === 'reply') { recv++; anyOk = true; const ms = r.ms(); times.push(ms); return `Reply from ${r.ip}: bytes=${size} time${ms < 1 ? '<1' : '=' + ms}ms TTL=${r.ttl}`; }
      if (r.kind === 'unreach') { recv++; return `Reply from ${r.from}: Destination host unreachable.`; }
      if (r.kind === 'general') return 'PING: transmit failed. General failure.';
      return 'Request timed out.';
    };
    const count = cont ? 1e6 : n;
    const lines: (() => string)[] = Array.from({ length: Math.min(count, 2000) }, () => one);
    void tg;
    let stopped = false;
    await new Promise<void>(res => {
      let i = 0, tm = 0;
      t.setBusy(() => { clearTimeout(tm); stopped = true; t.setBusy(null); res(); });
      const step = () => { if (i >= lines.length) { t.setBusy(null); res(); return; } t.print(lines[i++]()); tm = window.setTimeout(step, 900); };
      step();
    });
    const lost = sent - recv;
    t.print(`\nPing statistics for ${tg.ip}:\n    Packets: Sent = ${sent}, Received = ${recv}, Lost = ${lost} (${Math.round((lost / Math.max(1, sent)) * 100)}% loss),${times.length ? `\nApproximate round trip times in milli-seconds:\n    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((x, y) => x + y, 0) / times.length)}ms` : ''}${stopped ? '\nControl-C\n^C' : ''}`);
    this.emit('ping', { target: tg.ip, name: tg.name, ok: anyOk, sent, recv });
  }
  private async cmdTracert(args: string[], t: any) {
    const s = this.cur!;
    const target = args.filter(x => !x.startsWith('-'))[0];
    if (!target) { t.print('\nUsage: tracert [-d] [-h maximum_hops] [-j host-list] [-w timeout]\n               [-R] [-S srcaddr] [-4] [-6] target_name'); return; }
    const l = live(s.a, s.env);
    if (!l.ok) { t.print('Unable to contact IP driver. General failure.'); return; }
    const tg = this.parseTarget(t, target, 'tracert'); if (!tg) return;
    t.print(`\nTracing route to ${tg.name ? `${tg.name} [${tg.ip}]` : tg.ip}\nover a maximum of 30 hops:\n`);
    const ok = ping(s.a, s.env, tg.ip).kind === 'reply';
    const hops = hopsTo(s.a, s.env, tg.ip);
    const lines: string[] = [];
    const ms = (base: number) => { const v = base + Math.round(Math.random() * 3); return v < 1 ? '<1 ms' : `${v} ms`; };
    if (ok) hops.forEach((hp, i) => { const b = i === 0 ? 0 : i * 4 + 2; lines.push(`  ${String(i + 1).padStart(2)}  ${ms(b).padStart(6)}  ${ms(b).padStart(6)}  ${ms(b).padStart(6)}  ${hp}`); });
    else {
      const gwOk = l.gw && ping(s.a, s.env, l.gw, true).kind === 'reply';
      let k = 1;
      if (gwOk && hops.length > 1) lines.push(`  ${String(k++).padStart(2)}  ${ms(0).padStart(6)}  ${ms(0).padStart(6)}  ${ms(0).padStart(6)}  ${l.gw}`);
      if (ping(s.a, s.env, tg.ip).kind === 'unreach') lines.push(`  ${String(k++).padStart(2)}  ${l.ip} reports: Destination host unreachable.`);
      else for (; k <= 30; k++) lines.push(`  ${String(k).padStart(2)}     *        *        *     Request timed out.`);
    }
    lines.push('', 'Trace complete.');
    await t.seq(lines, ok ? 450 : 260, 300);
  }
  private async cmdNslookup(args: string[], t: any) {
    const s = this.cur!; const l = live(s.a, s.env);
    const name = args.filter(x => !x.startsWith('-'))[0];
    const dns = l.ok ? l.dns[0] : '';
    const dnsHost = s.env.hosts.find(x => x.ip === dns);
    const srvName = dnsHost ? `${dnsHost.name}.${s.env.suffix}` : dns === '8.8.8.8' || dns === '8.8.4.4' ? 'dns.google' : dns === '1.1.1.1' || dns === '1.0.0.1' ? 'one.one.one.one' : 'UnKnown';
    if (!dns) { t.print(`*** Default servers are not available\nServer:  UnKnown\nAddress:  127.0.0.1\n${name ? `\n*** UnKnown can't find ${name}: No response from server` : ''}`); return; }
    const reach = ping(s.a, s.env, dns, true).kind === 'reply';
    if (!reach) { await t.seq([`DNS request timed out.\n    timeout was 2 seconds.\nServer:  UnKnown\nAddress:  ${dns}\n`, name ? `DNS request timed out.\n    timeout was 2 seconds.\n*** Request to UnKnown timed-out` : '\u0000'], 2000, 2000); return; }
    if (!name) { t.print(`Default Server:  ${srvName}\nAddress:  ${dns}`); return; }
    const r = resolve(s.a, s.env, name);
    const head = `Server:  ${srvName}\nAddress:  ${dns}\n`;
    if (r === null || r === 'timeout') { t.print(`${head}\n*** ${srvName} can't find ${name}: Non-existent domain`); return; }
    const local = s.env.hosts.some(x => x.ip === r.ip);
    t.print(`${head}\n${local ? '' : 'Non-authoritative answer:\n'}Name:    ${local && !name.includes('.') ? `${name}.${s.env.suffix}` : name}\nAddress:  ${r.ip}`);
  }

  // ---------------------------------------------------------------- Network Connections (ncpa.cpl)
  openNcpa() {
    const s = this.cur!; const a = s.a, env = s.env;
    const items = h('div', { class: 'items' });
    const body = h('div', { class: 'ncpa' }, h('div', { class: 'bar' }, h('span', { onclick: () => this.openStatus() }, 'View status of this connection'), h('span', { onclick: () => this.openProps() }, 'Change settings of this connection'), h('span', { onclick: () => { a.enabled = !a.enabled; if (a.enabled) bounce(a); render(); this.refreshTray(); } }, 'Disable / Enable this network device')), items);
    const render = () => {
      items.innerHTML = '';
      const st = !a.enabled ? 'Disabled' : !mediaOk(a) ? 'Network cable unplugged' : (() => { const x = this.status(); return x === 'internet' ? env.suffix : x === 'local' ? 'Unidentified network' : live(a, env).apipa ? 'Unidentified network' : 'Unidentified network'; })();
      const nm = env.wireless ? 'Wi-Fi' : 'Ethernet';
      const card = h('div', { class: 'adp', tabindex: '0' }, h('div', { html: I.net, style: { opacity: a.enabled ? '1' : '.45', filter: a.enabled ? '' : 'grayscale(1)' } }), h('div', {}, h('b', {}, nm), h('small', {}, st), h('small', {}, env.adapter)));
      card.addEventListener('click', () => card.classList.add('sel'));
      card.addEventListener('dblclick', () => (a.enabled ? this.openStatus() : (a.enabled = true, bounce(a), render(), this.refreshTray())));
      card.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault(); card.classList.add('sel');
        const r = this.mon.getBoundingClientRect();
        const m = h('div', { class: 'ctx', style: { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` } },
          h('div', { onclick: () => { a.enabled = !a.enabled; if (a.enabled) bounce(a); render(); this.refreshTray(); } }, a.enabled ? 'Disable' : 'Enable'),
          h('div', { onclick: () => this.openStatus() }, 'Status'),
          h('div', { onclick: () => this.openProps() }, h('b', {}, 'Properties')));
        this.mon.append(m); const off = () => { m.remove(); removeEventListener('mousedown', off2, true); }; const off2 = (ev: Event) => { if (!m.contains(ev.target as Node)) off(); else setTimeout(off, 0); }; addEventListener('mousedown', off2, true);
      });
      items.append(card);
    };
    render();
    const w = this.win({ title: 'Network Connections', icon: I.net, w: 720, h: 380, body });
    (w as any).refresh = render;
    return w;
  }
  private refreshNcpa() { for (const w of this.wins) (w as any).refresh?.(); this.refreshTray(); }

  openStatus() {
    const s = this.cur!; const a = s.a, env = s.env;
    if (!a.enabled) { this.msgBox('Network Connections', 'This network device is disabled.', 'info'); return; }
    const st = this.status(); const l = live(a, env);
    const nm = env.wireless ? 'Wi-Fi' : 'Ethernet';
    let w: Win;
    const body = h('div', { class: 'dlg' }, h('div', { class: 'tabs' }, h('span', {}, 'General')),
      h('fieldset', {}, h('legend', {}, 'Connection'),
        h('div', { class: 'row' }, 'IPv4 Connectivity:', h('span', {}, !mediaOk(a) ? 'No network access' : st === 'internet' ? 'Internet' : st === 'local' ? 'No Internet access' : 'No network access')),
        h('div', { class: 'row' }, 'IPv6 Connectivity:', h('span', {}, 'No network access')),
        h('div', { class: 'row' }, 'Media State:', h('span', {}, mediaOk(a) ? 'Enabled' : 'Media disconnected')),
        h('div', { class: 'row' }, 'Duration:', h('span', {}, '00:42:17')),
        h('div', { class: 'row' }, 'Speed:', h('span', {}, env.wireless ? '573.5 Mbps' : '1.0 Gbps')),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.openDetails() }, 'Details...'), '')),
      h('fieldset', {}, h('legend', {}, 'Activity'), h('div', { class: 'row' }, h('span', {}, 'Bytes:'), h('span', {}, l.ok ? '1.284.533   |   9.442.871' : '0   |   0'))),
      h('div', { class: 'row', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn', onclick: () => { this.closeWin(w); this.openProps(); } }, 'Properties'), h('button', { class: 'btn', onclick: () => { a.enabled = false; this.closeWin(w); this.refreshNcpa(); } }, 'Disable'), h('button', { class: 'btn', onclick: () => this.diagnose() }, 'Diagnose')),
      h('div', { class: 'btns' }, h('button', { class: 'btn def', onclick: () => this.closeWin(w) }, 'Close')));
    w = this.win({ title: `${nm} Status`, icon: I.net, w: 380, h: 470, body, dialog: true });
  }
  private diagnose() {
    const s = this.cur!; const l = live(s.a, s.env);
    let msg = 'Troubleshooting couldn\'t identify the problem.';
    if (!mediaOk(s.a)) msg = 'Problem found: An Ethernet cable is not properly plugged in or might be broken.';
    else if (l.apipa) msg = 'Problem found: Ethernet doesn\'t have a valid IP configuration (DHCP server tidak menjawab).';
    else if (l.ok && conflict(l, s.env, s.a)) msg = `Problem found: The IP address ${l.ip} is already in use by another device on the network.`;
    else if (l.ok && !onSegment(l, s.env, s.a)) msg = 'Problem found: Ethernet doesn\'t have a valid IP configuration (IP tidak satu jaringan dengan segmen ini).';
    else if (l.ok && ping(s.a, s.env, '8.8.8.8', true).kind !== 'reply') msg = 'Problem found: The default gateway is not available.';
    else if (l.ok && (!l.dns.length || resolve(s.a, s.env, 'cari.id') === 'timeout')) msg = 'Problem found: Your computer appears to be correctly configured, but the device or resource (DNS server) is not responding.';
    this.msgBox('Network Diagnostics', msg, msg.startsWith('Problem') ? 'warn' : 'info');
  }
  private openDetails() {
    const s = this.cur!; const a = s.a, env = s.env; const l = live(a, env);
    const rows: [string, string][] = [
      ['Connection-specific DN...', a.dhcp && l.ok && !l.apipa ? env.suffix : ''], ['Description', env.adapter], ['Physical Address', a.mac.toUpperCase()], ['DHCP Enabled', a.dhcp ? 'Yes' : 'No'],
      ['IPv4 Address', l.ip], ['IPv4 Subnet Mask', l.ok ? maskStr(l.prefix) : ''],
      ...(a.dhcp && l.ok && !l.apipa && a.lease ? [['Lease Obtained', new Date(a.lease.t).toLocaleString('en-US')], ['Lease Expires', new Date(a.lease.t + (env.dhcp?.lease ?? 8) * 3600e3).toLocaleString('en-US')]] as [string, string][] : []),
      ['IPv4 Default Gateway', l.ok ? l.gw : ''], ['IPv4 DHCP Server', a.dhcp && l.ok && !l.apipa ? (a.lease?.server ?? env.gateway) : ''], ['IPv4 DNS Server', l.dns.join(', ')], ['IPv4 WINS Server', ''], ['NetBIOS over Tcpip En...', 'Yes'],
    ];
    let w: Win;
    const tbl = h('div', { class: 'list', style: { height: '260px' } }, h('div', { style: { fontWeight: '600', background: '#f3f3f3' } }, h('span', { style: { width: '160px', display: 'inline-block' } }, 'Property'), 'Value'), ...rows.map(([k, v]) => h('div', {}, h('span', { style: { width: '160px', display: 'inline-block' } }, k), v)));
    const body = h('div', { class: 'dlg' }, 'Network Connection Details:', tbl, h('div', { class: 'btns' }, h('button', { class: 'btn def', onclick: () => this.closeWin(w) }, 'Close')));
    w = this.win({ title: 'Network Connection Details', icon: I.net, w: 420, h: 400, body, dialog: true });
  }
  openProps() {
    const s = this.cur!; const env = s.env;
    let w: Win;
    const comps = ['Client for Nusa Networks', 'File and Printer Sharing for Nusa Networks', 'QoS Packet Scheduler', 'Internet Protocol Version 4 (TCP/IPv4)', 'Nusa Network Adapter Multiplexor Protocol', 'LLDP Protocol Driver', 'Internet Protocol Version 6 (TCP/IPv6)', 'Link-Layer Topology Discovery Responder'];
    let sel = 3;
    const desc = h('div', { style: { minHeight: '44px' } });
    const list = h('div', { class: 'list' });
    const draw = () => {
      list.innerHTML = '';
      comps.forEach((c, i) => { const d = h('div', { class: i === sel ? 'sel' : '' }, h('input', { type: 'checkbox', checked: i !== 4 ? 'checked' : null }), c); d.addEventListener('click', () => { sel = i; draw(); }); d.addEventListener('dblclick', () => { if (i === 3) this.openIPv4(); }); list.append(d); });
      desc.textContent = sel === 3 ? 'Transmission Control Protocol/Internet Protocol. The default wide area network protocol that provides communication across diverse interconnected networks.' : sel === 0 ? 'Allows your computer to access resources on a Nusa network.' : '';
    };
    draw();
    const body = h('div', { class: 'dlg' }, h('div', { class: 'tabs' }, h('span', {}, 'Networking'), h('span', { style: { background: '#f0f0f0' } }, 'Sharing')),
      'Connect using:', h('div', { style: { border: '1px solid #c8c8c8', background: '#fff', padding: '4px 6px', margin: '4px 0 6px', display: 'flex', alignItems: 'center', gap: '6px' } }, h('span', { html: I.net, style: { width: '18px', height: '18px', display: 'inline-block' } }), env.adapter),
      h('div', { style: { textAlign: 'right' } }, h('button', { class: 'btn' }, 'Configure...')),
      'This connection uses the following items:', list,
      h('div', { class: 'row' }, h('button', { class: 'btn' }, 'Install...'), h('button', { class: 'btn' }, 'Uninstall'), h('button', { class: 'btn', onclick: () => { if (sel === 3) this.openIPv4(); else this.msgBox('Properties', 'Tidak ada pengaturan untuk komponen ini di simulasi.', 'info'); } }, 'Properties')),
      h('fieldset', {}, h('legend', {}, 'Description'), desc),
      h('div', { class: 'btns' }, h('button', { class: 'btn def', onclick: () => this.closeWin(w) }, 'OK'), h('button', { class: 'btn', onclick: () => this.closeWin(w) }, 'Cancel')));
    w = this.win({ title: `${env.wireless ? 'Wi-Fi' : 'Ethernet'} Properties`, icon: I.net, w: 380, h: 500, body, dialog: true });
  }
  private ipField(val: string, nextFocus?: () => void) {
    const parts = (val || '').split('.');
    const box = h('div', { class: 'ipf' });
    const ins: HTMLInputElement[] = [];
    for (let i = 0; i < 4; i++) {
      const inp = h('input', { maxlength: '3', value: parts[i] ?? '' }) as HTMLInputElement;
      inp.addEventListener('keydown', e => {
        if (e.key === '.' || e.key === ' ') { e.preventDefault(); if (inp.value && i < 3) { ins[i + 1].focus(); ins[i + 1].select(); } }
        else if (e.key === 'Backspace' && !inp.value && i > 0) { ins[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length && i < 3) ins[i + 1].focus();
        else if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && i > 0) ins[i - 1].focus();
        else if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
      });
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '');
        if (+inp.value > 255) { const bad = inp.value; inp.value = '255'; this.msgBox('IP Address Error', `${bad} is not a valid entry. Please specify a value between 0 and 255.`, 'err'); }
        if (inp.value.length === 3) { if (i < 3) { ins[i + 1].focus(); ins[i + 1].select(); } else nextFocus?.(); }
      });
      ins.push(inp); box.append(inp); if (i < 3) box.append(h('span', {}, '.'));
    }
    return {
      el: box, ins,
      get: () => (ins.every(x => x.value === '') ? '' : ins.map(x => x.value || '0').join('.')),
      set: (v: string) => { const p = v.split('.'); ins.forEach((x, i) => (x.value = p[i] ?? '')); },
      enable: (on: boolean) => { box.classList.toggle('dis', !on); ins.forEach(x => (x.disabled = !on)); },
    };
  }
  openIPv4() {
    const s = this.cur!; const a = s.a, env = s.env;
    if (this.wins.some(x => x.title.startsWith('Internet Protocol Version 4'))) return;
    let w: Win;
    const l = live(a, env);
    const ip = this.ipField(a.dhcp ? '' : a.ip), mk = this.ipField(a.dhcp ? '' : (parseMask(a.mask) !== null ? maskStr(parseMask(a.mask)!) : a.mask)), gw = this.ipField(a.dhcp ? '' : a.gw);
    const d1 = this.ipField(a.dnsAuto ? '' : a.dns1), d2 = this.ipField(a.dnsAuto ? '' : a.dns2);
    void l;
    const rAuto = h('input', { type: 'radio', name: 'ipm' }) as HTMLInputElement, rMan = h('input', { type: 'radio', name: 'ipm' }) as HTMLInputElement;
    const dAuto = h('input', { type: 'radio', name: 'dnm' }) as HTMLInputElement, dMan = h('input', { type: 'radio', name: 'dnm' }) as HTMLInputElement;
    rAuto.checked = a.dhcp; rMan.checked = !a.dhcp; dAuto.checked = a.dhcp && a.dnsAuto; dMan.checked = !(a.dhcp && a.dnsAuto);
    const rows: HTMLElement[] = [];
    const row = (lab: string, f: { el: HTMLElement }) => { const r = h('div', { class: 'row' }, lab, f.el); rows.push(r); return r; };
    const dRows: HTMLElement[] = [];
    const drow = (lab: string, f: { el: HTMLElement }) => { const r = h('div', { class: 'row' }, lab, f.el); dRows.push(r); return r; };
    const sync = () => {
      const man = rMan.checked;
      if (man) { dMan.checked = true; dAuto.disabled = true; } else dAuto.disabled = false;
      [ip, mk, gw].forEach(f => f.enable(man)); rows.forEach(r => r.classList.toggle('dis', !man));
      const dm = dMan.checked; [d1, d2].forEach(f => f.enable(dm)); dRows.forEach(r => r.classList.toggle('dis', !dm));
      (dAuto.parentElement as HTMLElement).classList.toggle('dis', dAuto.disabled);
    };
    [rAuto, rMan, dAuto, dMan].forEach(r => r.addEventListener('change', sync));
    // Windows auto-fills a classful mask when the mask box gets focus and is empty
    mk.ins[0].addEventListener('focus', () => { if (mk.get() === '' && ip.get()) { const f = +ip.ins[0].value; mk.set(f < 128 ? '255.0.0.0' : f < 192 ? '255.255.0.0' : '255.255.255.0'); mk.ins[0].select(); } });
    const valid = h('input', { type: 'checkbox' });
    const ok = async () => {
      if (rMan.checked) {
        const ipS = ip.get(), mS = mk.get(), gS = gw.get();
        if (!ipS || parseIp(ipS) === null) { await this.msgBox('Microsoft TCP/IP'.replace('Microsoft', 'Nusa'), 'The adapter requires at least one IP address. Please enter one.', 'err'); return; }
        if (!mS) { await this.msgBox('Nusa TCP/IP', 'The adapter requires a subnet mask for each IP address you enter. Please enter a subnet mask.', 'err'); return; }
        const p = parseMask(mS);
        if (p === null || p < 1 || p > 30) { await this.msgBox('Nusa TCP/IP', 'The subnet mask you have entered is invalid. Please enter a valid subnet mask.', 'err'); return; }
        const n = parseIp(ipS)!, first = n >>> 24;
        if (first === 0 || first === 127 || first >= 224) { await this.msgBox('Nusa TCP/IP', `IP addresses starting with ${first} are not valid because they are reserved for ${first === 127 ? 'loopback addresses' : 'other purposes'}. Please specify some other valid value between 1 and 223.`, 'err'); return; }
        if (n === networkOf(n, p)) { await this.msgBox('Nusa TCP/IP', 'The combination of IP address and subnet mask is invalid. All of the bits in the host address portion of the IP address are set to 0. Please enter a valid combination of IP address and subnet mask.', 'err'); return; }
        if (n === broadcastOf(n, p)) { await this.msgBox('Nusa TCP/IP', 'The combination of IP address and subnet mask is invalid. All of the bits in the host address portion of the IP address are set to 1. Please enter a valid combination of IP address and subnet mask.', 'err'); return; }
        if (gS && parseIp(gS) !== null && networkOf(parseIp(gS)!, p) !== networkOf(n, p)) {
          const ans = await this.msgBox('Nusa TCP/IP', 'The default gateway is not on the same network segment (subnet) that is defined by the IP address and subnet mask. Do you want to save this configuration?', 'warn', ['Yes', 'No']);
          if (ans !== 'Yes') return;
        }
        if (a.dhcp) releaseLease(a); a.dhcp = false; a.ip = ipS; a.mask = ipStr(prefixToMask(p)); a.gw = gS; a.lease = undefined;
      } else { const was = a.dhcp; a.dhcp = true; if (!was) a.lease = undefined; }
      a.dnsAuto = !dMan.checked; a.dns1 = dMan.checked ? d1.get() : ''; a.dns2 = dMan.checked ? d2.get() : '';
      a.arp.clear();
      this.closeWin(w); this.refreshNcpa();
      const nl = live(a, env);
      if (nl.ok && conflict(nl, env, a)) this.notify(`${OSNAME} Network`, `Jendela mendeteksi konflik alamat IP: ${nl.ip} sudah dipakai perangkat lain di jaringan ini.`);
      this.emit('ipset', { dhcp: a.dhcp, ip: nl.ip, prefix: nl.prefix, gw: nl.gw, dns: nl.dns, onSegment: onSegment(nl, env, a) });
      if ((valid as HTMLInputElement).checked) this.diagnose();
    };
    const body = h('div', { class: 'dlg' },
      h('div', { class: 'tabs' }, h('span', {}, 'General'), a.dhcp ? h('span', { style: { background: '#f0f0f0' } }, 'Alternate Configuration') : null),
      h('div', { style: { margin: '2px 0 6px' } }, 'You can get IP settings assigned automatically if your network supports this capability. Otherwise, you need to ask your network administrator for the appropriate IP settings.'),
      h('label', { class: 'r' }, rAuto, 'Obtain an IP address automatically'),
      h('fieldset', {}, h('legend', {}, h('label', { class: 'r', style: { margin: 0 } }, rMan, 'Use the following IP address:')), row('IP address:', ip), row('Subnet mask:', mk), row('Default gateway:', gw)),
      h('label', { class: 'r' }, dAuto, 'Obtain DNS server address automatically'),
      h('fieldset', {}, h('legend', {}, h('label', { class: 'r', style: { margin: 0 } }, dMan, 'Use the following DNS server addresses:')), drow('Preferred DNS server:', d1), drow('Alternate DNS server:', d2)),
      h('div', { class: 'row' }, h('label', { class: 'r' }, valid, 'Validate settings upon exit'), h('button', { class: 'btn', onclick: () => this.msgBox('Advanced TCP/IP Settings', 'Pengaturan lanjutan (multiple IP, WINS) tidak dipakai di lab ini.', 'info') }, 'Advanced...')),
      h('div', { class: 'btns' }, h('button', { class: 'btn def', onclick: ok }, 'OK'), h('button', { class: 'btn', onclick: () => this.closeWin(w) }, 'Cancel')));
    w = this.win({ title: 'Internet Protocol Version 4 (TCP/IPv4) Properties', icon: I.net, w: 420, h: 520, body, dialog: true, focusEl: () => (rMan.checked ? ip.ins[0] : null) });
    sync();
  }

  // ---------------------------------------------------------------- Settings
  openSettings(page: 'network' | 'system' = 'network') {
    const ex = this.wins.find(x => x.title === 'Settings'); if (ex) this.closeWin(ex);
    const s = this.cur!; const a = s.a, env = s.env;
    const main = h('main');
    const navs: [string, string][] = [['system', 'System'], ['bt', 'Bluetooth & devices'], ['network', 'Network & internet'], ['pers', 'Personalization'], ['apps', 'Apps'], ['acc', 'Accounts'], ['time', 'Time & language'], ['upd', 'Jendela Update']];
    const nav = h('nav', {}, h('div', { class: 'me' }, h('i'), h('div', {}, h('b', {}, 'Siswa TKJ'), h('div', { style: { fontSize: '12px', color: '#555' } }, 'Local Account'))));
    const show = (p: string) => {
      nav.querySelectorAll('.n').forEach(n => n.classList.toggle('on', (n as HTMLElement).dataset.p === p));
      main.innerHTML = '';
      const l = live(a, env); const st = this.status(); const nm = env.wireless ? 'Wi-Fi' : 'Ethernet';
      if (p === 'network') {
        main.append(h('h1', {}, 'Network & internet'),
          h('div', { class: 'card', style: { padding: '20px 16px' } }, h('div', { html: st === 'none' ? I.noNet : env.wireless ? I.wifi : I.eth, style: { width: '40px', height: '40px' } }), h('div', { class: 'grow' }, h('b', { style: { fontSize: '16px' } }, nm), h('small', {}, !a.enabled ? 'Disabled' : !mediaOk(a) ? 'Not connected' : st === 'internet' ? 'Connected, secured' : 'No internet'))),
          h('div', { class: 'card' }, h('div', { class: 'grow' }, h('b', {}, `${nm} properties`), h('div', { class: 'kv', style: { marginTop: '10px' } },
            h('b', {}, 'IP assignment:'), h('span', {}, a.dhcp ? 'Automatic (DHCP)' : 'Manual'),
            h('b', {}, 'DNS server assignment:'), h('span', {}, a.dhcp && a.dnsAuto ? 'Automatic (DHCP)' : 'Manual'),
            h('b', {}, 'Link speed (Receive/Transmit):'), h('span', {}, env.wireless ? '573/573 (Mbps)' : '1000/1000 (Mbps)'),
            h('b', {}, 'IPv4 address:'), h('span', {}, l.ip || '—'),
            h('b', {}, 'IPv4 DNS servers:'), h('span', {}, l.dns.join(', ') || '—'),
            h('b', {}, 'Manufacturer:'), h('span', {}, env.adapter.split(' ')[0].replace('(R)', '')),
            h('b', {}, 'Description:'), h('span', {}, env.adapter),
            h('b', {}, 'Physical address (MAC):'), h('span', {}, a.mac.toUpperCase()))),
            h('button', { class: 'btn11', onclick: () => this.openIPv4() }, 'Edit')),
          h('div', { class: 'card', onclick: () => this.openNcpa(), style: { cursor: 'default' } }, h('div', { class: 'grow' }, h('b', {}, 'Advanced network settings'), h('small', {}, 'More network adapter options · View all network adapters, network reset')), '›'),
          h('div', { class: 'card', onclick: () => this.diagnose() }, h('div', { class: 'grow' }, h('b', {}, 'Network troubleshooter'), h('small', {}, 'Diagnose and fix network problems')), '›'));
      } else if (p === 'system') {
        main.append(h('h1', {}, 'System › About'),
          h('div', { class: 'card' }, h('div', { html: I.pc, style: { width: '48px', height: '48px' } }), h('div', { class: 'grow' }, h('b', { style: { fontSize: '16px' } }, a.host), h('small', {}, this.label))),
          h('div', { class: 'card' }, h('div', { class: 'grow kv' },
            h('b', {}, 'Device name'), h('span', {}, a.host), h('b', {}, 'Processor'), h('span', {}, 'Intel(R) Core(TM) i5-12400   2.50 GHz'), h('b', {}, 'Installed RAM'), h('span', {}, '8,00 GB (7,74 GB usable)'),
            h('b', {}, 'System type'), h('span', {}, '64-bit operating system, x64-based processor'),
            h('b', {}, 'Edition'), h('span', {}, `${OSNAME} 11 Pro Education`), h('b', {}, 'Version'), h('span', {}, '23H2'), h('b', {}, 'OS build'), h('span', {}, BUILD.split('.').slice(2).join('.')),
            h('b', {}, 'Network'), h('span', {}, env.label))));
      } else main.append(h('h1', {}, navs.find(n => n[0] === p)![1]), h('div', { class: 'card' }, h('div', { class: 'grow' }, 'Halaman ini tidak dipakai di simulasi TKJ. Buka System atau Network & internet.')));
    };
    for (const [id, nm] of navs) { const d = h('div', { class: 'n', 'data-p': id }, nm); d.addEventListener('click', () => show(id)); nav.append(d); }
    const body = h('div', { class: 'set' }, nav, main);
    const w = this.win({ title: 'Settings', icon: I.gear, w: 900, h: 600, body });
    (w as any).refresh = () => show((nav.querySelector('.n.on') as HTMLElement)?.dataset.p ?? page);
    show(page);
    return w;
  }

  // ---------------------------------------------------------------- Notepad / Run
  openNotepad(text?: string) {
    const s = this.cur!;
    const ta = h('textarea', { spellcheck: 'false' }) as HTMLTextAreaElement; ta.value = text ?? s.notes;
    if (text === undefined) ta.addEventListener('input', () => { s.notes = ta.value; });
    const body = h('div', { class: 'np' }, h('div', { class: 'menu' }, 'File', 'Edit', 'View'), ta);
    return this.win({ title: `${text ? 'lembar-kerja.txt' : 'Untitled'} - Notepad`, icon: I.note, w: 640, h: 420, body, focusEl: () => ta });
  }
  openRun() {
    let w: Win;
    const inp = h('input', { value: '' }) as HTMLInputElement;
    const go = () => { const v = inp.value.trim(); if (!v) return; if (this.runCommand(v)) this.closeWin(w); else this.msgBox(v, `${OSNAME} cannot find '${v}'. Make sure you typed the name correctly, and then try again.`, 'err'); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const body = h('div', { class: 'run' }, h('div', { style: { display: 'flex', gap: '10px' } }, h('span', { html: I.run, style: { width: '32px', height: '32px', flex: 'none' } }), `Type the name of a program, folder, document, or Internet resource, and ${OSNAME} will open it for you.`), h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, 'Open:', inp),
      h('div', { class: 'btns', style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } }, h('button', { class: 'btn def', onclick: go }, 'OK'), h('button', { class: 'btn', onclick: () => this.closeWin(w) }, 'Cancel')));
    w = this.win({ title: 'Run', icon: I.run, w: 400, h: 200, body, dialog: true, focusEl: () => inp });
  }

  // ---------------------------------------------------------------- Browser "Tepi"
  openBrowser(url?: string) {
    const s = this.cur!;
    const addr = h('input', { spellcheck: 'false', placeholder: 'Search or enter web address' }) as HTMLInputElement;
    const page = h('div', { class: 'page' });
    const tab = h('div', { class: 'tabb' }, 'New tab');
    const hist: string[] = []; let hi = -1;
    const body = h('div', { class: 'brw' }, h('div', { class: 'tabsb' }, tab),
      h('div', { class: 'nav' }, h('div', { class: 'nb', onclick: () => { if (hi > 0) go(hist[--hi], false); } }, '←'), h('div', { class: 'nb', onclick: () => { if (hi < hist.length - 1) go(hist[++hi], false); } }, '→'), h('div', { class: 'nb', onclick: () => go(hist[hi] ?? '', false) }, '⟳'), addr),
      page);
    const w = this.win({ title: 'Tepi', icon: I.web, w: 1000, h: 640, body, focusEl: () => (hist.length ? null : addr) });
    const set = (title: string, el: HTMLElement) => { tab.textContent = title; page.innerHTML = ''; page.append(el); };
    const err = (title: string, code: string, tips: string[], host: string) => set(host, h('div', { class: 'err' }, h('div', { html: I.noNet, style: { width: '64px', height: '64px' } }), h('h1', {}, title), h('ul', {}, ...tips.map(x => h('li', {}, x))), h('code', {}, code)));
    const go = (raw: string, push = true) => {
      let u = raw.trim();
      if (!u) { set('New tab', this.newTab(q => go(q))); addr.value = ''; return; }
      if (!/^[a-z]+:\/\//i.test(u)) { if (!/[.:]/.test(u) || /\s/.test(u)) u = `http://cari.id/search?q=${encodeURIComponent(u)}`; else u = `http://${u}`; }
      let url: URL; try { url = new URL(u); } catch { return; }
      addr.value = url.href.replace(/\/$/, '');
      if (push) { hist.splice(hi + 1); hist.push(url.href); hi = hist.length - 1; }
      const host = url.hostname;
      const l = live(s.a, s.env);
      if (!l.ok) { err('You\'re not connected', 'ERR_INTERNET_DISCONNECTED', ['Check the network cables, modem, and router', 'Reconnect to Wi-Fi', 'Run Network Diagnostics'], host); return; }
      const r = resolve(s.a, s.env, host);
      if (r === 'timeout') { err('Hmmm… your Internet access is blocked', 'DNS_PROBE_FINISHED_NO_INTERNET', ['Checking the network cables, modem, and router', 'Checking the DNS server settings', 'Running Network Diagnostics'], host); return; }
      if (r === null) { err('Hmmm… can\'t reach this page', 'DNS_PROBE_FINISHED_NXDOMAIN', [`Check if there is a typo in ${host}.`, 'If spelling is correct, try running Network Diagnostics.', l.dns.length ? `DNS server ${l.dns[0]} tidak mengenal nama ini.` : 'Belum ada DNS server yang diatur.'], host); return; }
      const pr = ping(s.a, s.env, r.ip, true);
      if (pr.kind !== 'reply') { err('Hmmm… can\'t reach this page', 'ERR_CONNECTION_TIMED_OUT', [`${host} took too long to respond.`, 'Checking the connection', 'Checking the proxy and the firewall', 'Running Network Diagnostics'], host); return; }
      const allHosts = Object.values(ENVS).flatMap(e => e.hosts);
      const web = allHosts.find(x => x.ip === r.ip)?.web ?? Object.values(INTERNET).find(x => x.ip === r.ip)?.web;
      this.emit('browse', { url: url.href, ip: r.ip, web });
      if (!web) { err('Hmmm… can\'t reach this page', 'ERR_CONNECTION_REFUSED', [`${host} refused to connect.`, 'Perangkat ini tidak menjalankan web server.'], host); return; }
      set(host, this.site(web, r.ip, url, q => go(q)));
    };
    addr.addEventListener('keydown', e => { if (e.key === 'Enter') go(addr.value); });
    addr.addEventListener('focus', () => addr.select());
    go(url ?? '');
    return w;
  }
  private newTab(search: (q: string) => void) {
    const q = h('input', { placeholder: 'Search the web', style: { width: '520px', maxWidth: '80%', height: '44px', borderRadius: '22px', border: '1px solid #ddd', padding: '0 20px', font: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,.08)' } }) as HTMLInputElement;
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) search(q.value); });
    return h('div', { class: 'web', style: { textAlign: 'center', paddingTop: '120px', background: 'linear-gradient(180deg,#eef5fb,#fff)', height: '100%' } }, h('div', { style: { fontSize: '30px', fontWeight: '600', color: '#0b4fa8', marginBottom: '22px' } }, 'cari'), q,
      h('div', { style: { marginTop: '40px', display: 'flex', gap: '18px', justifyContent: 'center', color: '#333', fontSize: '12px' } }, ...['cari.id', 'smk.sch.id', `${this.cur!.env.gateway}`].map(x => h('div', { style: { cursor: 'pointer', padding: '10px 14px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e5e5' }, onclick: () => search(x) }, x))));
  }
  private site(kind: string, ip: string, url: URL, go: (u: string) => void): HTMLElement {
    const s = this.cur!; const env = s.env;
    if (kind === 'search') {
      const q = url.searchParams.get('q') ?? '';
      const res = q ? [[`Pengertian ${q} - Modul TKJ`, 'smk.sch.id', `Materi ${q} untuk kelas X dan XI Teknik Komputer dan Jaringan.`], [`${q} adalah… | Ensiklopedia Jaringan`, 'cari.id', `Penjelasan singkat tentang ${q}, contoh konfigurasi, dan troubleshooting.`]] : [];
      const box = h('input', { value: q, style: { width: '560px', maxWidth: '80%', height: '40px', borderRadius: '20px', border: '1px solid #ddd', padding: '0 18px', font: 'inherit' } }) as HTMLInputElement;
      box.addEventListener('keydown', e => { if (e.key === 'Enter') go(`cari.id/search?q=${encodeURIComponent(box.value)}`); });
      return h('div', { class: 'web', style: { padding: '24px 40px' } }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px' } }, h('b', { style: { fontSize: '24px', color: '#0b4fa8' } }, 'cari'), box),
        ...res.map(([t, d, x]) => h('div', { style: { margin: '24px 0 0', maxWidth: '640px' } }, h('div', { style: { fontSize: '12px', color: '#555' } }, d), h('a', { style: { fontSize: '18px', color: '#1a0dab', cursor: 'pointer' }, onclick: () => go(d) }, t), h('div', { style: { color: '#444' } }, x))),
        !q && h('p', { style: { color: '#555', marginTop: '30px' } }, `Terhubung ke internet lewat gateway ${env.gateway}.`));
    }
    if (kind === 'school') return h('div', { class: 'web' }, h('div', { style: { background: '#0b4fa8', color: '#fff', padding: '18px 40px', fontSize: '22px', fontWeight: '600' } }, 'SMK Nusantara · Teknik Komputer dan Jaringan'), h('div', { style: { padding: '24px 40px', maxWidth: '760px' } }, h('h2', {}, 'Pengumuman'), h('p', {}, 'Uji kompetensi TKJ: siapkan materi pengalamatan IP, subnetting, VLAN, dan konfigurasi router.'), h('p', {}, 'Lab TKJ dibuka pukul 07.00–15.00 WIB.')));
    if (kind === 'blocked') return h('div', { class: 'err' }, h('div', { html: I.warn, style: { width: '64px', height: '64px' } }), h('h1', {}, 'Situs diblokir oleh kebijakan jaringan'), h('ul', {}, h('li', {}, `${url.hostname} masuk daftar blokir pada router ${env.gateway} (filter konten jam belajar).`), h('li', {}, 'Hubungi admin jaringan jika situs ini dibutuhkan untuk tugas.')), h('code', {}, 'BLOCKED_BY_ADMINISTRATOR'));
    if (kind === 'server') return h('div', { class: 'web', style: { maxWidth: '820px', margin: '24px auto', border: '1px solid #ccc' } }, h('div', { style: { background: '#d14836', color: '#fff', padding: '14px 18px', fontSize: '22px', fontWeight: '700' } }, 'Debian-style Default Page'), h('div', { style: { padding: '14px 18px' } }, h('h2', { style: { textAlign: 'center' } }, 'It works!'), h('p', {}, `Ini halaman default web server di srv-praktik (${ip}). Kalau kamu bisa melihat halaman ini, berarti PC kamu sudah bisa berkomunikasi dengan server di jaringan lab.`), h('p', {}, 'Konfigurasi utama ada di /etc/apache2/apache2.conf, dokumen web di /var/www/html.')));
    if (kind === 'printer') return h('div', { class: 'wf' }, h('aside', {}, h('div', { class: 'on' }, 'Status'), h('div', {}, 'Network'), h('div', {}, 'Supplies')), h('main', {}, h('h3', {}, 'Printer L2 · Embedded Web Server'), h('table', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Value')), ...[['Status', 'Ready'], ['IP Address', ip], ['Subnet Mask', maskStr(24)], ['Gateway', '192.168.20.1'], ['Toner Black', '62%'], ['Pages printed', '18.204']].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))))));
    if (kind === 'pos') return h('div', { class: 'web' }, h('div', { style: { background: '#0f7a4a', color: '#fff', padding: '16px 40px', fontSize: '22px', fontWeight: '700' } }, 'KasirKu POS · srv-pos'), h('div', { style: { padding: '20px 40px' } }, h('h2', {}, 'Server POS online'), h('p', {}, `Terminal kasir ini terhubung ke server POS ${ip}. Transaksi QRIS dan struk tersinkron.`)));
    if (kind === 'intranet') { const hostN = Object.values(ENVS).flatMap(e => e.hosts).find(x => x.ip === ip)?.name ?? url.hostname; return h('div', { class: 'web' }, h('div', { style: { background: '#5b2a86', color: '#fff', padding: '16px 40px', fontSize: '22px', fontWeight: '700' } }, `${hostN} · Intranet Nusantara Tech`), h('div', { style: { padding: '20px 40px' } }, h('h2', {}, 'Aplikasi internal berjalan'), h('p', {}, `Kamu membuka ${url.hostname} (${ip}). Nama ini diterjemahkan oleh DNS server jaringanmu.`))); }
    const renv = Object.values(ENVS).find(e => routerOf(e)?.ip === ip) ?? env;
    return this.routerUi(renv, ip);
  }

  // ---------------------------------------------------------------- router WebKonfig (editable)
  private routerUi(env: Env, ip: string): HTMLElement {
    const s = this.cur!;
    const r = routerOf(env)!;
    const wrap = h('div', { style: { height: '100%' } });
    const user = h('input', { value: 'admin' }) as HTMLInputElement, pass = h('input', { type: 'password' }) as HTMLInputElement;
    const msg = h('div', { style: { color: '#c00', minHeight: '16px' } });
    let page = 'dhcp';
    const inp = (v: string, w = '150px') => { const e = h('input', { value: v, spellcheck: 'false', style: { width: w } }) as HTMLInputElement; return e; };
    const row = (label: string, el: HTMLElement) => h('label', { class: 'frow' }, h('span', {}, label), el);
    const note = (t: string, ok = false) => h('div', { class: ok ? 'fok' : 'ferr' }, t);
    const reachable = () => ping(s.a, s.env, r.ip, true).kind === 'reply';
    const lost = () => { wrap.innerHTML = ''; wrap.append(h('div', { class: 'err' }, h('div', { html: I.noNet, style: { width: '64px', height: '64px' } }), h('h1', {}, 'Koneksi ke router terputus'), h('ul', {}, h('li', {}, `Router sekarang beralamat ${r.ip}/${env.prefix}.`), h('li', {}, `PC ini memakai ${live(s.a, s.env).ip || 'alamat lain'}, jadi tidak satu subnet lagi dengan router.`), h('li', {}, 'Sesuaikan IP PC (atau ipconfig /renew setelah DHCP benar), lalu buka lagi alamat router yang baru.')), h('code', {}, 'ERR_CONNECTION_RESET'))); };
    const render = () => {
      if (!reachable()) { lost(); return; }
      wrap.innerHTML = '';
      const nav = ['Interfaces', 'IP › Addresses', 'IP › DHCP Server', 'IP › DNS', 'IP › Routes'];
      const ids = ['if', 'addr', 'dhcp', 'dns', 'routes'];
      const main = h('main', {}, h('h3', {}, `RuteOS WebKonfig · ${r.name}`));
      wrap.append(h('div', { class: 'wf' }, h('aside', {}, ...nav.map((x, i) => h('div', { class: ids[i] === page ? 'on' : '', style: { cursor: 'pointer' }, onclick: () => { page = ids[i]; render(); } }, x))), main));
      if (page === 'if') main.append(h('table', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Type'), h('th', {}, 'Running')), h('tr', {}, h('td', {}, 'ether1-isp'), h('td', {}, 'Ethernet'), h('td', {}, 'R')), h('tr', {}, h('td', {}, env.wireless ? 'wlan-tamu' : `vlan${env.vlan}-lan`), h('td', {}, env.wireless ? 'Wireless' : 'VLAN'), h('td', {}, 'R'))));
      if (page === 'routes') main.append(h('table', {}, h('tr', {}, h('th', {}, 'Dst. Address'), h('th', {}, 'Gateway'), h('th', {}, 'Distance')), h('tr', {}, h('td', {}, '0.0.0.0/0'), h('td', {}, '100.64.12.1 (ether1-isp)'), h('td', {}, '1')), h('tr', {}, h('td', {}, `${env.net}/${env.prefix}`), h('td', {}, `vlan${env.vlan}-lan (connected)`), h('td', {}, '0'))));
      if (page === 'addr') {
        const a1 = inp(`${r.ip}/${env.prefix}`, '170px'); a1.name = 'lan-addr';
        const out = h('div');
        const apply = () => {
          const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(a1.value.trim());
          const n = m ? parseIp(m[1]) : null, p = m ? +m[2] : 0;
          if (!m || n === null || p < 8 || p > 30) { out.replaceChildren(note('invalid value for argument address (contoh: 192.168.10.1/24)')); return; }
          const nw = netOf(n, p), bc = (nw | (~(0xffffffff << (32 - p)) >>> 0)) >>> 0;
          if (n === nw || n === bc) { out.replaceChildren(note('alamat itu adalah network/broadcast, pilih alamat host')); return; }
          setRouterLan(env, m[1], p);
          this.emit('cfg', { kind: 'lan', env: env.id, ip: m[1], prefix: p });
          render();
        };
        main.append(h('table', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'Network'), h('th', {}, 'Interface')), h('tr', {}, h('td', {}, `${r.ip}/${env.prefix}`), h('td', {}, env.net), h('td', {}, env.wireless ? 'wlan-tamu' : `vlan${env.vlan}-lan`)), h('tr', {}, h('td', {}, '100.64.12.2/30'), h('td', {}, '100.64.12.0'), h('td', {}, 'ether1-isp'))),
          h('p', {}, h('b', {}, 'Ubah alamat LAN')), row('Address', a1), h('button', { class: 'btn', name: 'apply-addr', onclick: apply }, 'Apply'), out,
          h('p', { class: 'fnote' }, 'Mengubah alamat LAN memindahkan subnet seluruh segmen ini. PC yang memakai alamat lama akan terputus sampai disesuaikan.'));
      }
      if (page === 'dhcp') {
        const d = env.dhcp ?? (env as any)._dhcpOff ?? { start: '', end: '', gw: r.ip, dns: [r.ip], lease: 8 };
        const on = h('input', { type: 'checkbox', name: 'dhcp-on' }) as HTMLInputElement; on.checked = !!env.dhcp;
        const st = inp(d.start); st.name = 'dhcp-start'; const en = inp(d.end); en.name = 'dhcp-end';
        const gw = inp(d.gw); gw.name = 'dhcp-gw'; const dn = inp(d.dns.join(', '), '220px'); dn.name = 'dhcp-dns'; const ls = inp(String(d.lease), '60px'); ls.name = 'dhcp-lease';
        const out = h('div');
        const apply = () => {
          const dns = dn.value.split(/[,\s]+/).filter(Boolean);
          const cand = { start: st.value.trim(), end: en.value.trim(), gw: gw.value.trim(), dns, lease: Math.max(1, Math.min(168, parseInt(ls.value) || 8)) };
          if (!on.checked) { (env as any)._dhcpOff = cand; env.dhcp = null; this.emit('cfg', { kind: 'dhcp', env: env.id, on: false }); render(); return; }
          if (parseIp(cand.gw) === null || dns.some(x => parseIp(x) === null) || !dns.length) { out.replaceChildren(note('gateway / DNS server harus alamat IPv4 yang valid')); return; }
          const prob = poolProblem(env, cand);
          if (prob) { out.replaceChildren(note(`ditolak: ${prob}`)); return; }
          env.dhcp = cand; (env as any)._dhcpOff = undefined;
          this.emit('cfg', { kind: 'dhcp', env: env.id, on: true, ...cand });
          render();
        };
        const leases = [...env.leases.entries()].map(([mac, lip]) => { const ad = [...this.pcs.values()].find(p => p.a.mac === mac)?.a; return [lip, mac.toUpperCase(), ad?.host ?? '-', 'bound']; });
        main.append(h('p', {}, h('b', {}, `DHCP Server · vlan${env.vlan}-lan`)), row('Enabled', on), row('Address pool (awal)', st), row('Address pool (akhir)', en), row('Gateway (option 3)', gw), row('DNS servers (option 6)', dn), row('Lease time (jam)', ls),
          h('button', { class: 'btn', name: 'apply-dhcp', onclick: apply }, 'Apply'), out,
          !env.dhcp ? note('DHCP server sedang mati: klien akan dapat 169.254.x.x (APIPA).') : poolProblem(env) ? note(`DHCP tidak membagi alamat: ${poolProblem(env)}`) : note(`Aktif · interface ${r.ip}/${env.prefix}`, true),
          h('p', {}, h('b', {}, 'Leases')), h('table', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'MAC Address'), h('th', {}, 'Host Name'), h('th', {}, 'Status')), ...leases.map(x => h('tr', {}, ...x.map(c => h('td', {}, c))))));
      }
      if (page === 'dns') {
        const up = inp(env.dnsSrv.upstream.join(', '), '220px'); up.name = 'dns-up';
        const al = h('input', { type: 'checkbox', name: 'dns-allow' }) as HTMLInputElement; al.checked = env.dnsSrv.allow;
        const rn = inp('', '200px'); rn.name = 'rec-name'; rn.placeholder = 'nama (mis. absensi.kantor.local)';
        const ri = inp('', '130px'); ri.name = 'rec-ip'; ri.placeholder = 'alamat IP';
        const out = h('div');
        const apply = () => {
          const ups = up.value.split(/[,\s]+/).filter(Boolean);
          if (ups.some(x => parseIp(x) === null)) { out.replaceChildren(note('server upstream harus alamat IPv4')); return; }
          env.dnsSrv.upstream = ups; env.dnsSrv.allow = al.checked;
          this.emit('cfg', { kind: 'dns', env: env.id, upstream: ups, allow: al.checked }); render();
        };
        const add = () => {
          const nm = rn.value.trim().toLowerCase(), rip = ri.value.trim();
          if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(nm)) { out.replaceChildren(note('nama record tidak valid')); return; }
          if (parseIp(rip) === null) { out.replaceChildren(note('alamat record tidak valid')); return; }
          env.dnsSrv.records = env.dnsSrv.records.filter(x => x.name !== nm); env.dnsSrv.records.push({ name: nm, ip: rip });
          this.emit('cfg', { kind: 'dnsrec', env: env.id, name: nm, ip: rip }); render();
        };
        main.append(h('p', {}, h('b', {}, 'IP › DNS (forwarder)')), row('Servers (upstream)', up), row('Allow Remote Requests', al), h('button', { class: 'btn', name: 'apply-dns', onclick: apply }, 'Apply'), out,
          h('p', {}, h('b', {}, 'Static (record A)')), h('table', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Address'), h('th', {}, '')),
            ...env.dnsSrv.records.map(x => h('tr', {}, h('td', {}, x.name), h('td', {}, x.ip), h('td', {}, h('button', { class: 'btn', onclick: () => { env.dnsSrv.records = env.dnsSrv.records.filter(y => y !== x); this.emit('cfg', { kind: 'dnsdel', env: env.id, name: x.name }); render(); } }, 'Hapus'))))),
          row('Name', rn), row('Address', ri), h('button', { class: 'btn', name: 'add-rec', onclick: add }, 'Tambah record'),
          h('p', { class: 'fnote' }, `Nama pendek juga dikenali dengan akhiran domain ${env.suffix}. Klien harus memakai DNS router ini (${r.ip}) supaya record lokal terbaca.`));
      }
    };
    const login = () => {
      if (user.value !== 'admin' || pass.value !== '') { msg.textContent = 'ERROR: wrong username or password'; return; }
      render();
    };
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    wrap.append(h('div', { class: 'login' }, h('div', { style: { fontSize: '18px', fontWeight: '700', marginBottom: '10px', color: '#2e3b4e' } }, 'RuteOS WebKonfig'), h('div', {}, `Router ${r.name} (${ip})`), h('br'), 'Login:', user, 'Password:', pass, msg, h('button', { class: 'btn', name: 'login', onclick: login }, 'Login'), h('p', { style: { color: '#777' } }, 'Default: admin / (kosong)')));
    return wrap;
  }
}
