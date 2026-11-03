// Mode Juri: a 6-stop guided tour for judges and teachers who have five minutes. Each stop puts the game in the
// state where one feature can be tried right away (a real work order, a rack console, a helpdesk shift, the lab
// router, the AI mentor, the class recap). Nothing is scripted to succeed: the player still does the work.
// The player's own save is stashed first and put back on exit (demoGuard.ts also restores it after a crash).
import { DEMO_BACKUP, SAVE_KEYS } from './demoGuard';

export interface DemoStop { title: string; text: string; go: () => void }
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class DemoTour {
  i = -1; active = false;
  private bar = h('div', 'demo-bar');
  constructor(private stops: DemoStop[], private onExit: () => void) { this.bar.style.display = 'none'; document.body.append(this.bar); }
  start() {
    try {
      if (!sessionStorage.getItem(DEMO_BACKUP)) { const b: Record<string, string | null> = {}; for (const k of SAVE_KEYS) b[k] = localStorage.getItem(k); sessionStorage.setItem(DEMO_BACKUP, JSON.stringify(b)); }
    } catch { /* private mode: the tour still runs, the save just is not protected */ }
    this.active = true; document.body.classList.add('demo'); this.goto(0);
  }
  goto(i: number) {
    this.i = Math.max(0, Math.min(this.stops.length - 1, i));
    const s = this.stops[this.i];
    this.bar.style.display = '';
    this.bar.innerHTML = `<div class="db-h"><b>MODE JURI</b><span class="mono">${this.i + 1}/${this.stops.length}</span><button class="db-x" name="demo-min" aria-label="Kecilkan">–</button></div><div class="db-t">${s.title}</div><p>${s.text}</p>`;
    const row = h('div', 'db-row');
    const b = (t: string, n: string, fn: () => void, cls = 'btn') => { const x = h('button', cls, t) as HTMLButtonElement; x.name = n; x.onclick = fn; row.append(x); };
    if (this.i > 0) b('Sebelumnya', 'demo-prev', () => this.goto(this.i - 1));
    if (this.i < this.stops.length - 1) b('Lanjut', 'demo-next', () => this.goto(this.i + 1), 'btn pri');
    b('Keluar mode juri', 'demo-exit', () => this.exit());
    this.bar.append(row);
    (this.bar.querySelector('.db-x') as HTMLButtonElement).onclick = () => this.bar.classList.toggle('min');
    s.go();
  }
  exit() {
    try {
      const b = sessionStorage.getItem(DEMO_BACKUP);
      if (b) { const saved = JSON.parse(b) as Record<string, string | null>; for (const k of SAVE_KEYS) { const v = saved[k]; if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } sessionStorage.removeItem(DEMO_BACKUP); }
    } catch { /* nothing to restore */ }
    this.active = false; this.bar.style.display = 'none'; document.body.classList.remove('demo');
    this.onExit();
  }
}
