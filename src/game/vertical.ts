// Moving between hotel floors without cuts: a real lift car that rides its shaft (call → doors open →
// step in → doors close → ride with smooth acceleration → doors open → step out), and a walked climb up
// the U-shaped stair (both flights + landing). The camera never fades or blinks; the player only loses
// control while the script walks them in/out or the car moves.
import * as THREE from 'three';
import { HOTEL_ORIGIN, LEVELS, wx, wz } from '../data/city';
import { nearestDoor, type DoorLeaf } from '../world/hotel';

const X = (lx: number) => wx(HOTEL_ORIGIN[0] + lx), Z = (lz: number) => wz(HOTEL_ORIGIN[1] + lz);
const floorY = (lv: number) => LEVELS[lv - 1].elev + 0.12;
const SHAFTS = [20, 22];
const smooth = (k: number) => k * k * k * (k * (k * 6 - 15) + 10);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface Rider { pos: THREE.Vector3; yaw: number; pitch: number; level: number }
interface Landing { a: THREE.Object3D; b: THREE.Object3D; ax: number; bx: number; open: number; want: boolean }
interface Cab { c: number; g: THREE.Group; level: number; y: number; da: THREE.Mesh; db: THREE.Mesh; open: number; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; shown: string }
type LiftPhase = 'call' | 'open' | 'in' | 'turn' | 'close' | 'move' | 'open2' | 'out';
type Ride =
  | { kind: 'lift'; cab: Cab; from: number; to: number; phase: LiftPhase; t: number; dur: number; y0: number; y1: number }
  | { kind: 'stair'; from: number; to: number; pts: THREE.Vector3[]; seg: number; s: number; lenTot: number; done: number };

export class Vertical {
  ride: Ride | null = null;
  private landings = new Map<string, Landing>();
  private cabs: Cab[] = [];
  /** speed the rider is walking at during a scripted walk (for head bob / walk animation) */
  walkSpeed = 0;

  constructor(hotel: THREE.Object3D, parent: THREE.Object3D) {
    for (let lv = 1; lv <= LEVELS.length; lv++) for (const c of SHAFTS) {
      const a = hotel.getObjectByName(`LIFT_DOOR_L${lv}_${c}_A`), b = hotel.getObjectByName(`LIFT_DOOR_L${lv}_${c}_B`);
      if (a && b) this.landings.set(`${lv}_${c}`, { a, b, ax: a.position.x, bx: b.position.x, open: 0, want: false });
    }
    const wall = new THREE.MeshStandardMaterial({ color: '#b9c0c6', metalness: 0.75, roughness: 0.32 });
    const floorM = new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: 0.8 });
    const light = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e6', emissiveIntensity: 1.6 });
    const rail = new THREE.MeshStandardMaterial({ color: '#d7dde2', metalness: 0.9, roughness: 0.2 });
    const doorM = new THREE.MeshStandardMaterial({ color: '#a7afb6', metalness: 0.8, roughness: 0.3 });
    const B = (g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, name = '') => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = false; o.receiveShadow = true; if (name) o.name = name; g.add(o); return o; };
    for (const c of SHAFTS) {
      // car interior 1.76 × 1.6 m, front (door side) at local Z12.25, local origin = shaft centre / car floor
      const g = new THREE.Group(); g.name = `LIFT_CAR_${c}`; g.userData.noCollide = true;
      const z0 = 12.22, z1 = 13.86, zc = (z0 + z1) / 2, dz = z1 - z0;
      B(g, 1.8, 0.08, dz, 0, -0.04, Z(zc) - Z(0), floorM);
      B(g, 1.8, 2.4, 0.04, 0, 1.2, Z(z1) - Z(0), wall);                              // back
      B(g, 0.04, 2.4, dz, -0.9, 1.2, Z(zc) - Z(0), wall); B(g, 0.04, 2.4, dz, 0.9, 1.2, Z(zc) - Z(0), wall);
      B(g, 1.8, 0.05, dz, 0, 2.4, Z(zc) - Z(0), wall);
      B(g, 1.2, 0.02, 0.9, 0, 2.37, Z(zc) - Z(0), light);                             // light panel
      B(g, 0.36, 2.4, 0.04, -0.72, 1.2, Z(z0) - Z(0), wall); B(g, 0.36, 2.4, 0.04, 0.72, 1.2, Z(z0) - Z(0), wall); // front returns
      B(g, 1.8, 0.3, 0.04, 0, 2.25, Z(z0) - Z(0), wall);
      B(g, 1.4, 0.04, 0.04, 0, 0.92, Z(z1) - Z(0) - 0.06, rail);                      // handrail
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const panel = B(g, 0.22, 0.5, 0.02, 0.62, 1.35, Z(z0) - Z(0) + 0.04, new THREE.MeshStandardMaterial({ color: '#202428', metalness: 0.5, roughness: 0.4 }));
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.09), new THREE.MeshBasicMaterial({ map: tex }));
      disp.position.set(0.62, 1.52, Z(z0) - Z(0) + 0.052); g.add(disp); void panel;
      for (let k = 0; k < 8; k++) { const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10), new THREE.MeshStandardMaterial({ color: '#e8eef2', emissive: '#7fd0ff', emissiveIntensity: 0.2 })); btn.rotation.x = Math.PI / 2; btn.position.set(0.58 + (k % 2) * 0.08, 1.2 + Math.floor(k / 2) * 0.055, Z(z0) - Z(0) + 0.055); g.add(btn); }
      const da = B(g, 0.54, 2.08, 0.03, -0.27, 1.04, Z(z0) - Z(0) + 0.02, doorM), db = B(g, 0.54, 2.08, 0.03, 0.27, 1.04, Z(z0) - Z(0) + 0.02, doorM);
      g.position.set(X(c), floorY(1), Z(0));
      parent.add(g);
      const cab: Cab = { c, g, level: 1, y: floorY(1), da, db, open: 0, tex, cv, shown: '' };
      this.cabs.push(cab); this.drawDisplay(cab, '', 1);
    }
  }
  busy() { return !!this.ride; }
  /** hall indicator / HUD text */
  hud(): string {
    const r = this.ride; if (!r) return '';
    if (r.kind === 'stair') return `${r.to > r.from ? 'NAIK' : 'TURUN'} TANGGA · L${r.to}`;
    const lv = this.carLevel(r.cab);
    return r.phase === 'call' ? `Menunggu lift… lift di L${lv}` : `LIFT ${r.to > r.from ? '▲' : '▼'} L${lv}`;
  }
  private carLevel(cab: Cab) { let best = 1, bd = 1e9; LEVELS.forEach((L, i) => { const d = Math.abs(L.elev + 0.12 - cab.y); if (d < bd) { bd = d; best = i + 1; } }); return best; }
  private drawDisplay(cab: Cab, arrow: string, lv: number) {
    const key = arrow + lv; if (cab.shown === key) return; cab.shown = key;
    const g = cab.cv.getContext('2d')!; g.fillStyle = '#0a0c0e'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#ff5a3c'; g.font = 'bold 44px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${arrow}${lv}`, 64, 34);
    cab.tex.needsUpdate = true;
  }

  /** E/Q in front of the lift or stair doors. Returns '' or a reason it cannot start. */
  start(p: Rider, dir: 1 | -1): string {
    if (this.ride) return 'busy';
    const to = THREE.MathUtils.clamp(p.level + dir, 1, LEVELS.length); if (to === p.level) return dir > 0 ? 'Ini lantai paling atas.' : 'Ini lantai paling bawah.';
    const lx = p.pos.x - X(0);
    if (lx > 19) {
      const c = lx > 21 ? 22 : 20, cab = this.cabs.find(k => k.c === c)!;
      const y0 = cab.y, y1 = floorY(p.level), fl = Math.abs(this.carLevel(cab) - p.level);
      this.ride = { kind: 'lift', cab, from: p.level, to, phase: 'call', t: 0, dur: fl ? 1.6 + fl * 1.05 : 0, y0, y1 };
      return '';
    }
    this.ride = this.stairRide(p, to);
    return '';
  }
  private stairRide(p: Rider, to: number): Ride {
    const up = to > p.level, base = up ? p.level : to, a = floorY(base), h = LEVELS[base - 1].h;
    const P = (lx: number, y: number, lz: number) => new THREE.Vector3(X(lx), y, Z(lz));
    // flight 1 (west, +Z, rises h/2) → landing → flight 2 (east, −Z, rises h/2), as built by buildStair()
    const climb = [P(17, a, 11.25), P(17, a, 12.35), P(15.8, a, 12.45), P(15.8, a, 12.6), P(15.8, a + h / 2, 18.0), P(15.8, a + h / 2, 19.1), P(18.2, a + h / 2, 19.1), P(18.2, a + h / 2, 18.0), P(18.2, a + h, 12.6), P(18.2, a + h, 12.4), P(17, a + h, 12.3), P(17, a + h, 11.1)];
    const path = up ? climb : climb.reverse();
    const pts = [p.pos.clone(), ...path];
    let lenTot = 0; for (let i = 1; i < pts.length; i++) lenTot += pts[i].distanceTo(pts[i - 1]);
    for (const lv of [p.level, to]) this.openDoorAt(X(17), Z(12), floorY(lv));
    return { kind: 'stair', from: p.level, to, pts, seg: 1, s: 0, lenTot, done: 0 };
  }
  private openDoorAt(x: number, z: number, y: number) { const d: DoorLeaf | null = nearestDoor(x, z, y, 1.2); if (d && !d.want) for (const o of [d]) o.want = true; }

  /** advance; moves the rider. Returns true while the rider is under script control. */
  update(dt: number, p: Rider): boolean {
    this.animateDoors(dt);
    const r = this.ride; this.walkSpeed = 0;
    if (!r) return false;
    if (r.kind === 'stair') return this.updStair(dt, r, p);
    const cab = r.cab, L = (lv: number) => this.landings.get(`${lv}_${cab.c}`)!;
    r.t += dt;
    const face = (yaw: number, rate = 5) => { p.yaw += wrap(yaw - p.yaw) * (1 - Math.exp(-dt * rate)); };
    const walkTo = (x: number, z: number, sp = 1.35) => { const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz); if (d < 0.02) return true; const k = Math.min(d, sp * dt); p.pos.x += dx / d * k; p.pos.z += dz / d * k; this.walkSpeed = sp; face(Math.atan2(-dx, -dz), 7); return false; };
    const cx = X(cab.c);
    switch (r.phase) {
      case 'call': {
        if (r.dur > 0) { const k = Math.min(1, r.t / r.dur); cab.y = THREE.MathUtils.lerp(r.y0, r.y1, smooth(k)); }
        face(Math.PI); // look at the doors
        this.drawDisplay(cab, r.y1 > r.y0 ? '▲' : r.y1 < r.y0 ? '▼' : '', this.carLevel(cab));
        if (r.t >= r.dur) { cab.y = r.y1; cab.level = r.from; L(r.from).want = true; r.phase = 'open'; r.t = 0; this.drawDisplay(cab, '', r.from); }
        break;
      }
      case 'open': face(Math.PI); if (L(r.from).open > 0.97) { r.phase = 'in'; r.t = 0; } break;
      case 'in': if (walkTo(cx, Z(13.0))) { r.phase = 'turn'; r.t = 0; L(r.from).want = false; } break;
      case 'turn': face(0, 4.5); if (r.t > 0.5 && L(r.from).open < 0.02) { r.phase = 'move'; r.t = 0; const fl = Math.abs(r.to - r.from); r.dur = 2.2 + fl * 1.1; r.y0 = cab.y; r.y1 = floorY(r.to); } break;
      case 'move': {
        face(0, 3);
        const k = Math.min(1, r.t / r.dur); cab.y = THREE.MathUtils.lerp(r.y0, r.y1, smooth(k));
        this.drawDisplay(cab, r.to > r.from ? '▲' : '▼', this.carLevel(cab));
        if (k >= 1) { cab.y = r.y1; cab.level = r.to; p.level = r.to; L(r.to).want = true; r.phase = 'open2'; r.t = 0; this.drawDisplay(cab, '', r.to); }
        break;
      }
      case 'open2': face(0, 3); if (L(r.to).open > 0.97) { r.phase = 'out'; r.t = 0; } break;
      case 'out': if (walkTo(cx, Z(10.9), 1.45)) { L(r.to).want = false; this.ride = null; p.level = r.to; } break;
      default: break;
    }
    cab.g.position.y = cab.y;
    p.pos.y = this.ride && (r.phase === 'call' || r.phase === 'open') ? floorY(r.from) : cab.y;
    return true;
  }
  private updStair(dt: number, r: Extract<Ride, { kind: 'stair' }>, p: Rider): boolean {
    let step = 1.75 * dt;
    while (step > 0 && r.seg < r.pts.length) {
      const a = r.pts[r.seg - 1], b = r.pts[r.seg], len = a.distanceTo(b) || 1e-6;
      const left = len - r.s;
      if (step < left) { r.s += step; step = 0; }
      else { step -= left; r.s = 0; r.seg++; r.done += len; }
    }
    if (r.seg >= r.pts.length) { const e = r.pts[r.pts.length - 1]; p.pos.copy(e); p.level = r.to; this.ride = null; return true; }
    const a = r.pts[r.seg - 1], b = r.pts[r.seg], len = a.distanceTo(b) || 1e-6;
    p.pos.lerpVectors(a, b, r.s / len);
    // look along the walk, a little up/down on the flights
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
    if (Math.hypot(dx, dz) > 0.05) p.yaw += wrap(Math.atan2(-dx, -dz) - p.yaw) * (1 - Math.exp(-dt * 6));
    p.pitch += (THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 0.6, -0.35, 0.35) - p.pitch) * (1 - Math.exp(-dt * 4));
    this.walkSpeed = 1.75;
    p.level = (p.pos.y - floorY(Math.min(r.from, r.to))) > (LEVELS[Math.min(r.from, r.to) - 1].h * 0.5) ? Math.max(r.from, r.to) : Math.min(r.from, r.to);
    return true;
  }
  private animateDoors(dt: number) {
    for (const [key, d] of this.landings) {
      const tgt = d.want ? 1 : 0; d.open += Math.sign(tgt - d.open) * Math.min(Math.abs(tgt - d.open), dt / 0.9);
      const e = smooth(d.open);
      d.a.position.x = d.ax - 0.5 * e; d.b.position.x = d.bx + 0.5 * e;
      const [lv, c] = key.split('_').map(Number);
      const cab = this.cabs.find(k => k.c === c)!;
      if (Math.abs(cab.y - floorY(lv)) < 0.02) cab.open = d.open;
    }
    for (const cab of this.cabs) { const e = smooth(cab.open); cab.da.position.x = -0.27 - 0.5 * e; cab.db.position.x = 0.27 + 0.5 * e; }
  }
  /** colliders for landing doors that are not (fully) open on the rider's floor */
  closedBoxes(level: number, out: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }[]) {
    for (const [key, d] of this.landings) {
      const [lv, c] = key.split('_').map(Number); if (lv !== level || d.open > 0.95) continue;
      const y = floorY(lv); out.push({ minX: X(c - 0.6), maxX: X(c + 0.6), minZ: Z(12.04), maxZ: Z(12.16), minY: y, maxY: y + 2.1 });
    }
  }
  /** QA */
  state() { return { ride: this.ride ? { kind: this.ride.kind, phase: this.ride.kind === 'lift' ? this.ride.phase : 'walk', to: this.ride.to } : null, cabs: this.cabs.map(c => ({ c: c.c, y: +c.y.toFixed(2), open: +c.open.toFixed(2) })) }; }
}
