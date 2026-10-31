// North-up minimap (M toggles the large map). City coords: X east 0..CITY_W, Z south 0..CITY_D (v9: 400 x 600).
import { ROADS, ROAD_SPEC, ZONES, TOWERS, TOWERS_S, HOTEL_ORIGIN, CITY_W, CITY_D } from '../data/city';
import { streetLabel } from '../world/wayfinding';

const ZONE_FILL: Record<string, string> = { park: '#3f6b3a', plaza: '#5d6670', paving: '#6c6258', dirt: '#6b5b45', kampung: '#7a5a44', lot: '#4c4f46' };

export class Minimap {
  el: HTMLDivElement; cv: HTMLCanvasElement; base: HTMLCanvasElement; big = false;
  constructor() {
    this.el = document.createElement('div'); this.el.id = 'minimap';
    this.el.innerHTML = '<canvas width="400" height="300"></canvas><div class="mm-legend"><span class="mm-me"></span> Kamu <span class="mm-tg"></span> Tujuan misi · <b>M</b> peta besar</div>';
    this.cv = this.el.querySelector('canvas')!;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', () => this.toggle());
    this.base = document.createElement('canvas'); this.base.width = CITY_W * 2; this.base.height = CITY_D * 2;
    this.drawBase();
  }
  toggle() { this.big = !this.big; this.el.classList.toggle('big', this.big); this.cv.width = this.big ? 440 : 400; this.cv.height = this.big ? 600 : 300; }
  private drawBase() {
    const g = this.base.getContext('2d')!; const s = 2;
    g.fillStyle = '#26302a'; g.fillRect(0, 0, CITY_W * s, CITY_D * s);
    for (const z of ZONES) { g.fillStyle = ZONE_FILL[z.ground]; g.fillRect(z.x[0] * s, z.z[0] * s, (z.x[1] - z.x[0]) * s, (z.z[1] - z.z[0]) * s); }
    g.fillStyle = '#8f99a3'; for (const t of [...TOWERS, ...TOWERS_S]) g.fillRect(t.x * s, t.z * s, t.w * s, t.d * s);
    for (const r of ROADS) {
      const sp = ROAD_SPEC[r.kind]; const h = r.a[1] === r.b[1];
      g.fillStyle = r.kind === 'gang' ? '#9a948a' : '#1c1f22';
      const w = (r.kind === 'gang' ? 3 : sp.carriage) * s;
      if (h) g.fillRect(r.a[0] * s, r.a[1] * s - w / 2, (r.b[0] - r.a[0]) * s, w); else g.fillRect(r.a[0] * s - w / 2, r.a[1] * s, w, (r.b[1] - r.a[1]) * s);
      if (r.kind === 'arteri') { g.fillStyle = '#cfd5c8'; if (h) g.fillRect(r.a[0] * s, r.a[1] * s - 1, (r.b[0] - r.a[0]) * s, 2); else g.fillRect(r.a[0] * s - 1, r.a[1] * s, 2, (r.b[1] - r.a[1]) * s); }
    }
    // hotel
    g.fillStyle = '#2bd46b'; g.fillRect(HOTEL_ORIGIN[0] * s, HOTEL_ORIGIN[1] * s, 30 * s, 20 * s);
    g.fillStyle = '#0d1a12'; g.font = 'bold 15px Arial'; g.fillText('HOTEL', HOTEL_ORIGIN[0] * s + 9, HOTEL_ORIGIN[1] * s + 25);
    // street names
    g.fillStyle = '#f1ede4'; g.font = 'bold 14px Arial'; g.textBaseline = 'middle';
    for (const r of ROADS) {
      if (r.kind === 'gang') continue; const h = r.a[1] === r.b[1]; const t = streetLabel(r.name);
      g.save();
      if (h) { g.translate(30 * s, r.a[1] * s - (r.kind === 'arteri' ? 22 : 13)); } else { g.translate(r.a[0] * s + (r.kind === 'arteri' ? 22 : 13), 30 * s); g.rotate(Math.PI / 2); }
      g.fillText(t, 0, 0); g.restore();
    }
    // v9 landmarks in the south district
    g.font = 'bold 13px Arial'; g.fillStyle = '#e8f5e9';
    for (const [t, x, z] of [['LAPANGAN', 124, 404], ['MASJID', 340, 380], ['TAMAN DAHLIA', 116, 524], ['SMK NUSANTARA', 236, 550], ['KAMPUNG C', 14, 386], ['KAMPUNG D', 14, 506]] as [string, number, number][]) g.fillText(t, x * s, z * s);
    g.fillStyle = '#d0693f'; g.font = 'bold 22px Arial'; g.fillText('U', CITY_W * s - 22, 18);
  }
  /** px, pz in city coords; heading radians (0 = north, clockwise); target city coords */
  update(px: number, pz: number, heading: number, target: { x: number; z: number } | null) {
    const g = this.cv.getContext('2d')!;
    const W = this.cv.width, H = this.cv.height;
    const zoom = this.big ? 1 : 3; // canvas px per metre at display
    const s = 2;
    const bs = Math.min(W / CITY_W, H / CITY_D), bx = (W - CITY_W * bs) / 2, by = (H - CITY_D * bs) / 2;
    g.fillStyle = '#26302a'; g.fillRect(0, 0, W, H);
    g.save();
    if (this.big) { g.drawImage(this.base, 0, 0, CITY_W * s, CITY_D * s, bx, by, CITY_W * bs, CITY_D * bs); }
    else { g.translate(W / 2, H / 2); g.scale(zoom / s, zoom / s); g.translate(-px * s, -pz * s); g.drawImage(this.base, 0, 0); }
    g.restore();
    const toScreen = (x: number, z: number) => this.big ? [bx + x * bs, by + z * bs] : [W / 2 + (x - px) * zoom, H / 2 + (z - pz) * zoom];
    if (target) {
      let [tx, ty] = toScreen(target.x, target.z);
      const off = tx < 8 || ty < 8 || tx > W - 8 || ty > H - 8;
      tx = Math.min(W - 10, Math.max(10, tx)); ty = Math.min(H - 10, Math.max(10, ty));
      g.fillStyle = '#ffd400'; g.strokeStyle = '#2a2300'; g.lineWidth = 3;
      g.beginPath(); g.arc(tx, ty, off ? 8 : 10, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#2a2300'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', tx, ty + 1);
    }
    const [mx, my] = toScreen(px, pz);
    g.save(); g.translate(mx, my); g.rotate(heading);
    g.fillStyle = '#4fc3ff'; g.strokeStyle = '#05202c'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
