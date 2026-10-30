// Touch controls for phones and tablets: a virtual joystick (left), drag-to-look (right),
// and action buttons that send the same key codes the keyboard does, so every rule stays in one place.
import './touch.css';

export const isTouch = () => matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export interface TouchState { x: number; y: number; run: boolean }
export const touch: TouchState = { x: 0, y: 0, run: false };

/** Ask the browser for real fullscreen (Android Chrome, Samsung Internet, iPad). iPhone Safari has no page fullscreen. */
export function goFullscreen() {
  const d = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement) return;
    if (d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {})).catch(() => {});
    else d.webkitRequestFullscreen?.();
  } catch { /* not allowed here */ }
}

const key = (code: string, type: 'keydown' | 'keyup' = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true }));

export function setupTouch(o: { canvas: HTMLCanvasElement; look: (dx: number, dy: number) => void; active: () => boolean; toast: (s: string, ms?: number) => void }) {
  if (!isTouch()) return;
  document.body.classList.add('touch');
  const root = document.createElement('div'); root.id = 'touchui';
  root.innerHTML = `
    <div class="stick" id="t-stick"><div class="ring"><i></i></div></div>
    <div class="tbtns">
      <button data-k="KeyF" class="big f" id="t-f">F<small>Aksi</small></button>
      <button data-k="Space" class="mid">⤒<small>Lompat</small></button>
      <button data-run class="mid" id="t-run">»<small>Lari</small></button>
      <button data-k="KeyE" class="sm" id="t-e">E<small>Naik</small></button>
      <button data-k="KeyQ" class="sm" id="t-q">Q<small>Turun</small></button>
    </div>
    <div class="ttop">
      <button data-k="KeyT">Kerja</button><button data-k="KeyC">Cek</button><button data-k="KeyR">Wi-Fi</button>
      <button data-k="KeyV">Kamera</button><button data-k="KeyM">Peta</button><button data-k="KeyG" id="t-gfx">Grafik</button><button data-fs>Full</button><button data-k="Escape">Keluar</button>
    </div>`;
  document.body.appendChild(root);
  const stop = (e: Event) => { e.stopPropagation(); };
  root.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
    b.addEventListener('pointerdown', e => {
      stop(e); e.preventDefault(); b.classList.add('on');
      if (b.dataset.k) key(b.dataset.k);
      if (b.dataset.run !== undefined) { touch.run = !touch.run; b.classList.toggle('lock', touch.run); }
      if (b.dataset.fs !== undefined) { if (document.fullscreenElement) document.exitFullscreen?.(); else if (isIOS() && !standalone()) iosHint(true); else goFullscreen(); }
    });
    const up = (e: Event) => { stop(e); b.classList.remove('on'); if (b.dataset.k) key(b.dataset.k, 'keyup'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', () => b.classList.remove('on'));
    b.addEventListener('click', e => e.stopPropagation());
  });

  // joystick: appears where the thumb lands inside the left zone
  const zone = root.querySelector<HTMLElement>('#t-stick')!, ring = zone.querySelector<HTMLElement>('.ring')!, knob = ring.querySelector('i')!;
  let sid: number | null = null, cx = 0, cy = 0;
  const R = 52;
  zone.addEventListener('pointerdown', e => {
    stop(e); e.preventDefault(); if (sid !== null) return;
    sid = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    const r = zone.getBoundingClientRect(); cx = e.clientX; cy = e.clientY;
    ring.style.left = `${cx - r.left}px`; ring.style.top = `${cy - r.top}px`; ring.classList.add('on');
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, l / R), dead = 0.12, k = m < dead ? 0 : (m - dead) / (1 - dead);
    touch.x = l ? (dx / Math.min(l, R)) * k : 0; touch.y = l ? (-dy / Math.min(l, R)) * k : 0;
  });
  const end = (e: PointerEvent) => { if (e.pointerId !== sid) return; sid = null; touch.x = touch.y = 0; knob.style.transform = ''; ring.classList.remove('on'); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  // look: any touch on the 3D view that is not on a control
  const looks = new Map<number, { x: number; y: number }>();
  o.canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  window.addEventListener('pointermove', e => {
    const p = looks.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (o.active()) o.look(dx * 2.1, dy * 2.1);
  });
  const lend = (e: PointerEvent) => looks.delete(e.pointerId);
  window.addEventListener('pointerup', lend); window.addEventListener('pointercancel', lend);
  o.canvas.style.touchAction = 'none';

  // keep the F button labelled with what it will do
  const fb = root.querySelector<HTMLElement>('#t-f small')!;
  setInterval(() => { const row = [...document.querySelectorAll('#iprompt.on .ip-row')].find(r => r.querySelector('kbd')?.textContent === 'F'); const p = row?.textContent?.replace(/^F/, '').trim(); fb.textContent = p ? p.split(' ').slice(0, 2).join(' ').slice(0, 14) : 'Aksi'; root.querySelector('#t-f')!.classList.toggle('ready', !!p);
    // E/Q only make sense at a stair or lift door: show them only when the prompt offers them
    const keys = [...document.querySelectorAll('#iprompt.on kbd')].map(k => k.textContent);
    (root.querySelector('#t-e') as HTMLElement).style.display = keys.includes('E') ? '' : 'none';
    (root.querySelector('#t-q') as HTMLElement).style.display = keys.includes('Q') ? '' : 'none';
    const gl = document.getElementById('btnGfx')?.textContent?.replace(/^Grafik: /, '').replace(' (otomatis)', ''); const gb = root.querySelector('#t-gfx') as HTMLElement; if (gl && gb.textContent !== 'Grafik ' + gl) gb.textContent = 'Grafik ' + gl;
  }, 250);

  // iPhone Safari can't hide its bars for a page; Add to Home Screen opens the game without them
  let hinted = false;
  function iosHint(force = false) {
    if ((hinted && !force) || standalone()) return; hinted = true;
    o.toast('iPhone: tap tombol Bagikan ⬆︎ lalu "Tambah ke Layar Utama". Buka dari ikon itu supaya full layar tanpa search bar.', 9000);
  }
  return { onEnter() { if (isIOS()) iosHint(); else goFullscreen(); } };
}
