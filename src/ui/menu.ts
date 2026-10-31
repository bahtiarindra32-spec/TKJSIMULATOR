// Title screen, pause menu, settings / controls / about panels, fade + loading. DOM only, system fonts,
// inline SVG art (no external resources). main.ts owns the game state; this module only renders and calls back.
import './menu.css';

export type QChoice = 'otomatis' | 'tinggi' | 'sedang' | 'rendah' | 'hemat';
export interface Settings { quality: QChoice; sens: number; volume: number; invertY: boolean; third: boolean; autoTime: boolean }
const KEY = 'kotaNusantara.settings.v1';
export const settings: Settings = { quality: 'otomatis', sens: 1, volume: 70, invertY: false, third: false, autoTime: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* ignore */ }
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } }

export interface MenuHooks {
  start(fresh: boolean): void; resume(): void; tour(): void; toMainMenu(): void;
  setQuality(q: QChoice): void; setTime(id: 'pagi' | 'siang' | 'sore' | 'malam'): void; applySettings(): void;
  build: string; touch: boolean;
}

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ff09a"/><stop offset="1" stop-color="#1aa257"/></linearGradient></defs>
<rect x="6" y="30" width="9" height="26" rx="1.5" fill="#2a3a44"/><rect x="18" y="18" width="11" height="38" rx="1.5" fill="#34505f"/><rect x="32" y="8" width="12" height="48" rx="1.5" fill="url(#lg)"/><rect x="47" y="24" width="11" height="32" rx="1.5" fill="#2a3a44"/>
<g fill="#0c1014"><rect x="35" y="13" width="2.4" height="2.4"/><rect x="39" y="13" width="2.4" height="2.4"/><rect x="35" y="19" width="2.4" height="2.4"/><rect x="39" y="19" width="2.4" height="2.4"/><rect x="35" y="25" width="2.4" height="2.4"/><rect x="39" y="25" width="2.4" height="2.4"/></g>
<path d="M10 28 C 18 12, 46 4, 56 20" fill="none" stroke="#5ff09a" stroke-width="1.6" stroke-dasharray="2.5 2.5"/><circle cx="10" cy="28" r="2.6" fill="#ffd400"/><circle cx="56" cy="20" r="2.6" fill="#ffd400"/><circle cx="38" cy="5" r="2.6" fill="#ffd400"/></svg>`;

const ROWS_KB: [string, string][] = [
  ['W A S D', 'Jalan / gas, rem, belok (motor)'], ['Mouse', 'Menoleh (klik layar untuk mengunci kursor)'], ['Shift', 'Lari'], ['Spasi', 'Lompat · rem belakang (motor)'],
  ['X', 'Jongkok'], ['V', 'Kamera orang pertama / ketiga'], ['F', 'Interaksi: pintu, PC, rak, naik/turun motor'], ['E / Q', 'Naik / turun tangga · lift'],
  ['T', 'Papan kerja NOC'], ['C', 'Cek fisik perangkat'], ['R', 'Wi-Fi analyzer · kembalikan motor ke jalan'], ['M', 'Peta'], ['N', 'Ganti waktu: pagi → siang → sore → malam'],
  ['G', 'Kualitas grafik'], ['Esc', 'Jeda / menu'],
];
const ROWS_TOUCH: [string, string][] = [
  ['Joystick kiri', 'Jalan · di motor: dorong = gas, tarik = rem, kiri/kanan = belok (halus)'], ['Geser layar kanan', 'Menoleh'], ['F / Aksi', 'Interaksi · naik/turun motor'],
  ['Lompat · Lari · Jongkok', 'Tombol kanan bawah'], ['Bar atas', 'Kerja, Cek, Wi-Fi, Kamera, Peta, Waktu, Grafik, Layar penuh'], ['Keluar', 'Jeda / menu'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function btn(label: string, id: string, cls = 'mn-btn') { const b = el('button', cls, label); b.type = 'button'; b.id = id; return b; }

export class Menu {
  root = el('div'); pauseEl = el('div'); fadeEl = el('div'); panel = el('div'); ppanel = el('div');
  startBtn!: HTMLButtonElement; newBtn!: HTMLButtonElement; clockEls: HTMLElement[] = [];
  open = true; paused = false; started = false;
  constructor(private h: MenuHooks) {
    // ---- title screen
    this.root.id = 'menu'; this.root.className = 'on';
    this.root.innerHTML = `<div class="mn-shade"></div>
      <header class="mn-top"><span class="mn-tag">PROYEK TKJ <b>/</b> KOTA 001</span><span class="mn-clock" data-clock></span></header>
      <main class="mn-main"><div class="mn-logo">${LOGO}</div>
        <h1 class="mn-title">Kota <span>Nusantara</span></h1>
        <p class="mn-sub">Simulator Teknik Komputer &amp; Jaringan</p>
        <p class="mn-desc">Kota 400 × 600 m bergaya Jakarta. Rawat jaringan Nusantara Tech Hotel &amp; Office, keliling kota naik motor matic, dari Sudirman sampai kampung bergang.</p>
        <nav class="mn-list" aria-label="Menu utama"></nav></main>
      <footer class="mn-foot"><span>Versi ${h.build}</span><span>${h.touch ? 'Ketuk untuk memilih' : '↑ ↓ pilih · Enter mulai'}</span></footer>`;
    const list = this.root.querySelector('.mn-list')!;
    this.startBtn = btn('Mulai', 'enter', 'mn-btn primary'); this.startBtn.innerHTML = '<span>Mulai</span><i>›</i>';
    this.newBtn = btn('Mulai dari Awal', 'mnNew'); this.newBtn.hidden = true;
    const tour = btn('Jelajah Kota', 'mnTour'), set = btn('Pengaturan', 'mnSettings'), ctl = btn('Kontrol', 'mnControls'), about = btn('Tentang', 'mnAbout');
    list.append(this.startBtn, this.newBtn, tour, set, ctl, about);
    this.startBtn.addEventListener('click', () => { this.started ? h.resume() : h.start(true); });
    this.newBtn.addEventListener('click', () => h.start(true));
    tour.addEventListener('click', () => h.tour());
    set.addEventListener('click', () => this.showPanel(this.panel, 'settings'));
    ctl.addEventListener('click', () => this.showPanel(this.panel, 'controls'));
    about.addEventListener('click', () => this.showPanel(this.panel, 'about'));
    this.panel.className = 'mn-panel'; this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
    // ---- pause
    this.pauseEl.id = 'pause';
    this.pauseEl.innerHTML = `<div class="ps-card"><div class="ps-head"><h2>Jeda</h2><span class="mn-clock" data-clock></span></div>
      <div class="ps-list"></div><div class="ps-time"><span>Waktu</span><div class="ps-seg"></div></div></div>`;
    const pl = this.pauseEl.querySelector('.ps-list')!;
    const pr = btn('<span>Lanjutkan</span><i>›</i>', 'psResume', 'mn-btn primary'), ps = btn('Pengaturan', 'psSettings'), pc = btn('Kontrol', 'psControls'), pm = btn('Menu Utama', 'psMenu');
    pl.append(pr, ps, pc, pm);
    pr.addEventListener('click', () => h.resume()); pm.addEventListener('click', () => h.toMainMenu());
    ps.addEventListener('click', () => this.showPanel(this.ppanel, 'settings')); pc.addEventListener('click', () => this.showPanel(this.ppanel, 'controls'));
    const seg = this.pauseEl.querySelector('.ps-seg')!;
    for (const [id, lb] of [['pagi', 'Pagi'], ['siang', 'Siang'], ['sore', 'Sore'], ['malam', 'Malam']] as const) { const b = btn(lb, `time-${id}`, 'seg'); b.addEventListener('click', () => h.setTime(id)); seg.appendChild(b); }
    this.ppanel.className = 'mn-panel'; this.pauseEl.appendChild(this.ppanel);
    document.body.appendChild(this.pauseEl);
    this.fadeEl.id = 'fade'; document.body.appendChild(this.fadeEl);
    this.clockEls = [...document.querySelectorAll<HTMLElement>('[data-clock]')];
    // keyboard navigation inside menus (arrow keys move focus, Esc closes a panel)
    for (const host of [this.root, this.pauseEl]) host.addEventListener('keydown', e => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'ArrowDown' || ke.key === 'ArrowUp') {
        const bs = [...host.querySelectorAll<HTMLButtonElement>('.mn-panel.on button, .mn-panel.on input')].length ? [...host.querySelectorAll<HTMLElement>('.mn-panel.on button, .mn-panel.on input')] : [...host.querySelectorAll<HTMLElement>('.mn-list button:not([hidden]), .ps-list button')];
        const i = bs.indexOf(document.activeElement as HTMLElement); const n = bs[(i + (ke.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]; n?.focus(); e.preventDefault();
      }
    });
  }
  setClock(t: string) { for (const e of this.clockEls) if (e.textContent !== t) e.textContent = t; }
  setTimeActive(label: string) { this.pauseEl.querySelectorAll('.seg').forEach(b => b.classList.toggle('on', b.textContent === label)); }
  /** title screen visible (behind it the city flyover runs) */
  show(on: boolean) {
    this.open = on; this.root.classList.toggle('on', on); document.body.classList.toggle('menu', on);
    this.startBtn.querySelector('span')!.textContent = this.started ? 'Lanjutkan' : 'Mulai'; this.newBtn.hidden = !this.started;
    this.hidePanels();
    if (on && !this.h.touch) setTimeout(() => this.open && this.startBtn.focus({ preventScroll: true }), 60);
  }
  pause(on: boolean) {
    this.paused = on; this.pauseEl.classList.toggle('on', on); document.body.classList.toggle('paused', on); this.hidePanels();
    if (on && !this.h.touch) setTimeout(() => this.paused && (this.pauseEl.querySelector('#psResume') as HTMLElement)?.focus({ preventScroll: true }), 60);
    if (!on) (document.activeElement as HTMLElement | null)?.blur?.();
  }
  panelOpen() { return this.panel.classList.contains('on') || this.ppanel.classList.contains('on'); }
  hidePanels() { this.panel.classList.remove('on'); this.ppanel.classList.remove('on'); this.root.classList.remove('sub'); this.pauseEl.classList.remove('sub'); }
  /** fade to black, run fn at the darkest point, fade back */
  fade(fn: () => void, instant = false) {
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return; }
    this.fadeEl.classList.add('on'); setTimeout(() => { fn(); requestAnimationFrame(() => setTimeout(() => this.fadeEl.classList.remove('on'), 60)); }, 320);
  }
  showPanel(host: HTMLElement, kind: 'settings' | 'controls' | 'about') {
    const S = settings, h = this.h;
    host.innerHTML = '';
    const head = el('div', 'pn-head'); const back = btn('‹ Kembali', 'pnBack', 'pn-back'); back.addEventListener('click', () => { this.hidePanels(); ((host === this.panel ? this.root.querySelector('#mnSettings') : this.pauseEl.querySelector('#psSettings')) as HTMLElement)?.focus(); });
    head.append(el('h3', '', kind === 'settings' ? 'Pengaturan' : kind === 'controls' ? 'Kontrol' : 'Tentang'), back); host.appendChild(head);
    const body = el('div', 'pn-body'); host.appendChild(body);
    if (kind === 'settings') {
      const row = (label: string, ctl: HTMLElement, hint = '') => { const r = el('div', 'pn-row'); const l = el('div', 'pn-l', `<b>${label}</b>${hint ? `<small>${hint}</small>` : ''}`); r.append(l, ctl); body.appendChild(r); };
      const seg = (opts: [string, string][], cur: () => string, set: (v: string) => void, name: string) => {
        const g = el('div', 'pn-seg'); for (const [v, lb] of opts) { const b = btn(lb, `${name}-${v}`, 'seg'); b.addEventListener('click', () => { set(v); saveSettings(); g.querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); }); if (cur() === v) b.classList.add('on'); g.appendChild(b); } return g; };
      row('Kualitas grafik', seg([['otomatis', 'Otomatis'], ['tinggi', 'Tinggi'], ['sedang', 'Sedang'], ['rendah', 'Rendah'], ['hemat', 'Hemat']], () => S.quality, v => { S.quality = v as QChoice; h.setQuality(S.quality); }, 'q'), 'Otomatis menurunkan grafik bila FPS rendah');
      const range = (min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string, name: string) => {
        const w = el('label', 'pn-range'); const i = el('input') as HTMLInputElement; i.type = 'range'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(get()); i.name = name;
        const o = el('output', '', fmt(get())); i.addEventListener('input', () => { set(+i.value); o.textContent = fmt(+i.value); saveSettings(); h.applySettings(); }); w.append(i, o); return w; };
      row('Sensitivitas kamera', range(0.3, 2.5, 0.05, () => S.sens, v => (S.sens = v), v => `${v.toFixed(2)}×`, 'sens'));
      row('Volume suara', range(0, 100, 5, () => S.volume, v => (S.volume = v), v => `${v}%`, 'vol'));
      row('Balik sumbu Y', seg([['0', 'Normal'], ['1', 'Terbalik']], () => (S.invertY ? '1' : '0'), v => { S.invertY = v === '1'; h.applySettings(); }, 'inv'));
      row('Kamera awal', seg([['0', 'Orang pertama'], ['1', 'Orang ketiga']], () => (S.third ? '1' : '0'), v => { S.third = v === '1'; h.applySettings(); }, 'cam'), 'V mengganti kamera kapan saja');
      row('Siklus siang-malam', seg([['1', 'Otomatis'], ['0', 'Berhenti']], () => (S.autoTime ? '1' : '0'), v => { S.autoTime = v === '1'; h.applySettings(); }, 'auto'), '1 hari = 24 menit · N untuk lompat waktu');
    } else if (kind === 'controls') {
      const sec = (title: string, rows: [string, string][]) => { body.appendChild(el('h4', '', title)); const t = el('div', 'pn-keys'); for (const [k, d] of rows) t.appendChild(el('div', 'pn-key', `<kbd>${k}</kbd><span>${d}</span>`)); body.appendChild(t); };
      if (h.touch) { sec('Layar sentuh', ROWS_TOUCH); sec('Keyboard', ROWS_KB); } else { sec('Keyboard & mouse', ROWS_KB); sec('Layar sentuh', ROWS_TOUCH); }
    } else {
      body.appendChild(el('div', 'pn-about', `<p><b>Kota Nusantara</b> adalah game simulasi untuk siswa SMK jurusan <b>Teknik Komputer &amp; Jaringan (TKJ)</b>. Kamu bekerja sebagai teknisi di Nusantara Tech Hotel &amp; Office: memasang dan menguji kabel, mengonfigurasi switch, router, Wi-Fi, DHCP/DNS, dan melayani tiket dari papan kerja NOC.</p>
        <p>Kotanya fiktif bergaya Jakarta: simpang Sudirman–Thamrin, perkantoran, ruko, masjid, taman, lapangan, SMK Nusantara, dan kampung bergang yang bisa dijelajahi jalan kaki atau naik motor matic.</p>
        <p class="pn-dim">Dibangun dengan Three.js · seluruh grafis prosedural, tanpa aset luar · Versi ${h.build}</p>`));
    }
    host.classList.add('on'); (host === this.panel ? this.root : this.pauseEl).classList.add('sub');
    if (!h.touch) setTimeout(() => back.focus({ preventScroll: true }), 30);
  }
}
