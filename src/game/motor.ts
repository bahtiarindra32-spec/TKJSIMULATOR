// Rideable "Motor Matic" (1:1 matic scooter): parked bikes, arcade-but-believable riding physics,
// substepped collision (no tunnelling), ground following (roads 0.02, kerbs/sidewalks 0.15-0.17), recovery.
// Rendering adapter: RideMotor groups from assets/vehicles.ts. Rules/state live here, input comes from main.ts.
import * as THREE from 'three';
import { ROADS, ROAD_SPEC, wx, wz } from '../data/city';
import type { AABB } from '../world/core';
import { queryColliders } from './physics';
import { makeRideableMotor, MOTOR_STEER_AXIS, MOTOR_WHEELBASE, MOTOR_ZF, MOTOR_ZR, type RideMotor } from '../assets/vehicles';

/** parked spots (city coords). 01-03: the motor row in front of the hotel, next to the player spawn. 04-05: hotel car park. */
export const BIKE_SPOTS = [
  { id: 'PROP_MOTOR_01', X: 241.5, Z: 165, yaw: 0, color: '#b3121b' },
  { id: 'PROP_MOTOR_02', X: 242.5, Z: 165, yaw: 0, color: '#f1f1ef' },
  { id: 'PROP_MOTOR_03', X: 243.5, Z: 165, yaw: 0, color: '#1f3f8a' },
  { id: 'PROP_MOTOR_04', X: 276.5, Z: 199.5, yaw: Math.PI, color: '#111214' },
  { id: 'PROP_MOTOR_05', X: 277.7, Z: 199.5, yaw: Math.PI, color: '#6c7176' },
];

export const VMAX = 85 / 3.6;          // top speed 85 km/h
const VREV = 1.3;                      // slow reverse (paddling backwards) m/s
const A0 = 3.3;                        // launch acceleration m/s² (0-60 km/h ≈ 7 s)
const BRAKE = 7.0, REAR = 4.2;         // S = both brakes, Space = rear brake
const ROLL = 0.22, AERO = 0.0062;      // coasting losses
const ALAT = 7.2;                      // max lateral acceleration (≈ 39° lean)
const STEP = 0.22;                     // highest kerb the bike rolls up
const R = 0.34;                        // collision circle radius (3 circles along the bike)
const CIRCLES = [MOTOR_ZF + 0.02, 0, MOTOR_ZR - 0.02];
const G = 9.81;

export interface Bike {
  id: string; m: RideMotor; pos: THREE.Vector3; yaw: number; speed: number; steer: number; lean: number; pitch: number; vy: number;
  ridden: boolean; steerIn: number; leanV: number; stopT: number; stuckT: number; noProgT: number; hit: number; spinF: number; spinR: number; braking: boolean; footDown: number;
}
export interface BikeInput { throttle: number; brake: number; rear: boolean; steer: number }

// ---------------------------------------------------------------- ground (flat boxes: asphalt, kerbs, sidewalks, slabs)
const GC = 8;
const ground = new Map<string, AABB[]>();
const gk = (i: number, j: number) => `${i},${j}`;
/** collect walkable flat boxes (< 0.25 m tall, bottom near 0) under the given roots */
export function buildGroundBoxes(roots: THREE.Object3D[], skip: (o: THREE.Object3D) => boolean) {
  const box = new THREE.Box3(); let n = 0;
  const visit = (o: THREE.Object3D) => {
    if (skip(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      const h = box.max.y - box.min.y;
      if (h < 0.25 && box.min.y < 0.25 && box.max.y < 0.45 && box.max.x - box.min.x > 0.1 && box.max.z - box.min.z > 0.1 && box.max.x - box.min.x < 500) {
        const c: AABB = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y };
        const i0 = Math.floor(c.minX / GC), i1 = Math.floor(c.maxX / GC), j0 = Math.floor(c.minZ / GC), j1 = Math.floor(c.maxZ / GC);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) <= 3000) { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = gk(i, j); (ground.get(k) ?? ground.set(k, []).get(k)!).push(c); } n++; }
      }
    }
    for (const ch of o.children) visit(ch);
  };
  for (const r of roots) { r.updateMatrixWorld(true); visit(r); }
  return n;
}
/** ground height under (x,z) reachable from ref (≤ STEP up); wall = a flat top there is too high to roll onto */
export function groundAt(x: number, z: number, ref: number) {
  const l = ground.get(gk(Math.floor(x / GC), Math.floor(z / GC)));
  let h = 0, wall = false;
  if (l) for (const c of l) {
    if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
    if (c.maxY <= ref + STEP) { if (c.maxY > h) h = c.maxY; } else wall = true;
  }
  return { h, wall };
}

// ---------------------------------------------------------------- generated engine sound (Web Audio, no files)
class Engine {
  ctx: AudioContext | null = null; gain: GainNode | null = null; o1: OscillatorNode | null = null; o2: OscillatorNode | null = null; lp: BiquadFilterNode | null = null;
  on = false;
  /** master volume 0..1 (settings) */
  vol = 0.7;
  start() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
        const c = new AC(); this.ctx = c;
        this.gain = c.createGain(); this.gain.gain.value = 0;
        this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 520; this.lp.Q.value = 2.5;
        this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
        const g2 = c.createGain(); g2.gain.value = 0.45;
        this.o1.connect(this.lp); this.o2.connect(g2).connect(this.lp); this.lp.connect(this.gain).connect(c.destination);
        this.o1.start(); this.o2.start();
      }
      void this.ctx.resume?.(); this.on = true;
    } catch { this.ctx = null; }
  }
  update(speed: number, throttle: number) {
    if (!this.ctx || !this.gain || !this.o1 || !this.o2 || !this.lp) return;
    const t = this.ctx.currentTime, v = Math.abs(speed) / VMAX;
    // CVT matic: revs jump with throttle, then rise slowly with road speed
    const rpm = 1500 + 3600 * Math.min(1, throttle * 0.55 + v * 0.75);
    const f = rpm / 60;                                       // single cylinder 4-stroke: firing at rpm/120, harmonics
    this.o1.frequency.setTargetAtTime(f, t, 0.06); this.o2.frequency.setTargetAtTime(f / 2, t, 0.06);
    this.lp.frequency.setTargetAtTime(380 + 900 * Math.min(1, throttle * 0.6 + v * 0.6), t, 0.08);
    this.gain.gain.setTargetAtTime(this.on && !document.hidden ? (0.035 + 0.035 * throttle) * this.vol / 0.7 : 0, t, 0.05);
  }
  stop() { this.on = false; if (this.ctx && this.gain) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); }
}

// ---------------------------------------------------------------- the bikes
const tmpA = new THREE.Vector3();
export class Motors {
  bikes: Bike[] = [];
  group = new THREE.Group();
  engine = new Engine();
  /** static, bike-only walls (hotel shell, JPO stairs, city edge) */
  walls: AABB[] = [];
  private extra: AABB[] = [];
  constructor(parent: THREE.Object3D) {
    this.group.name = 'GAME_MOTOR_MATIC'; parent.add(this.group);
    for (const s of BIKE_SPOTS) {
      const m = makeRideableMotor(s.color, s.id);
      const b: Bike = { id: s.id, m, pos: new THREE.Vector3(wx(s.X), 0, wz(s.Z)), yaw: s.yaw, speed: 0, steer: 0.35, lean: 0.09, pitch: 0, vy: 0, ridden: false, steerIn: 0, leanV: 0, stopT: 0, stuckT: 0, noProgT: 0, hit: 0, spinF: 0, spinR: 0, braking: false, footDown: 0 };
      this.group.add(m.root); this.bikes.push(b);
    }
  }
  /** call once ground boxes exist: drop parked bikes onto the surface under them */
  settle() { for (const b of this.bikes) { b.pos.y = this.groundUnder(b, 0.5).y; this.render(b, 0); } }
  fwd(b: Bike, out = new THREE.Vector3()) { return out.set(-Math.sin(b.yaw), 0, -Math.cos(b.yaw)); }
  /** solid footprint of a bike for others (walking player, other bikes): three boxes along its length */
  boxesOf(b: Bike, out: AABB[]) {
    const f = this.fwd(b, tmpA); const r = 0.3;
    for (const z of CIRCLES) { const x = b.pos.x - f.x * z, zz = b.pos.z - f.z * z; out.push({ minX: x - r, maxX: x + r, minZ: zz - r, maxZ: zz + r, minY: b.pos.y, maxY: b.pos.y + 1.15 }); }
  }
  nearest(x: number, z: number, maxD = 1.7) {
    let best: Bike | null = null, bd = maxD;
    for (const b of this.bikes) { if (b.ridden) continue; const d = Math.hypot(b.pos.x - x, b.pos.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  private groundUnder(b: Bike, ref: number) {
    const f = this.fwd(b, tmpA);
    const gF = groundAt(b.pos.x + f.x * -MOTOR_ZF, b.pos.z + f.z * -MOTOR_ZF, ref), gR = groundAt(b.pos.x + f.x * -MOTOR_ZR, b.pos.z + f.z * -MOTOR_ZR, ref);
    return { y: Math.max(gF.h, gR.h), hF: gF.h, hR: gR.h, wallF: gF.wall, wallR: gR.wall };
  }
  /** push the bike's three circles out of solids; returns the total correction */
  private resolve(b: Bike, extra: AABB[], out: THREE.Vector3) {
    out.set(0, 0, 0); const feet = b.pos.y; const f = this.fwd(b, tmpA); let worst = 0;
    for (let pass = 0; pass < 3; pass++) {
      for (const z of CIRCLES) {
        let cx = b.pos.x - f.x * z, cz = b.pos.z - f.z * z;
        const lists = [queryColliders(cx, cz), extra, this.walls];
        for (const list of lists) for (const c of list) {
          if (c.maxY < feet + 0.28 || c.minY > feet + 1.6) continue;
          const nx = Math.min(Math.max(cx, c.minX), c.maxX), nz = Math.min(Math.max(cz, c.minZ), c.maxZ);
          let dx = cx - nx, dz = cz - nz; const d2 = dx * dx + dz * dz;
          if (d2 >= R * R) continue;
          let px: number, pz: number;
          if (d2 > 1e-10) { const d = Math.sqrt(d2); px = dx / d * (R - d); pz = dz / d * (R - d); }
          else { // centre inside the box: leave by the shallowest face
            const pen = [cx - c.minX + R, c.maxX - cx + R, cz - c.minZ + R, c.maxZ - cz + R]; const k = pen.indexOf(Math.min(...pen));
            px = k === 0 ? -pen[0] : k === 1 ? pen[1] : 0; pz = k === 2 ? -pen[2] : k === 3 ? pen[3] : 0; dx = px; dz = pz;
          }
          if (pass === 2) worst = Math.max(worst, Math.hypot(px, pz));
          b.pos.x += px; b.pos.z += pz; cx += px; cz += pz; out.x += px; out.z += pz;
        }
      }
    }
    return worst;
  }
  /** one physics step for the ridden bike */
  update(b: Bike, inp: BikeInput, dt: number, dyn: AABB[]) {
    const prevX = b.pos.x, prevZ = b.pos.z;
    b.hit = 0;
    const n = Math.max(1, Math.ceil((Math.abs(b.speed) * dt) / 0.08)), h = dt / n;
    const corr = new THREE.Vector3(), f = new THREE.Vector3();
    this.extra = dyn;
    let worst = 0;
    b.braking = inp.brake > 0.05 || inp.rear;
    // steering input smoothing (keyboard is digital, touch is analog: both ramp the same way)
    { const u = THREE.MathUtils.clamp(inp.steer, -1, 1), cur = b.steerIn;
      const rate = Math.abs(u) < 0.02 ? 3.6 : Math.sign(u) !== Math.sign(cur) && Math.abs(cur) > 0.05 ? 6.0 : 2.4;   // centre gently, reverse quickly, build up smoothly
      const d = u - cur, mx = rate * dt; b.steerIn = cur + THREE.MathUtils.clamp(d * (1 - Math.exp(-dt * 9)) + Math.sign(d) * Math.min(Math.abs(d), mx * 0.25), -mx, mx); }
    for (let i = 0; i < n; i++) {
      // ---- longitudinal
      const v = b.speed;
      if (inp.brake > 0.05) {
        if (v > 0) { b.speed = Math.max(0, v - BRAKE * inp.brake * h); b.stopT = 0; }
        else { b.stopT += h; if (b.stopT > 0.3 || v < -0.01) b.speed = Math.max(-VREV, v - 1.1 * inp.brake * h); }   // stopped: keep holding = slow reverse
      } else b.stopT = 0;
      if (inp.throttle > 0.02) {
        if (b.speed < -0.05) b.speed = Math.min(0, b.speed + BRAKE * h);
        else if (inp.brake <= 0.05) b.speed += A0 * inp.throttle * Math.max(0, 1 - (b.speed / VMAX) ** 2) * h;
      }
      if (inp.rear) b.speed -= Math.sign(b.speed) * Math.min(Math.abs(b.speed), REAR * h);
      if (inp.throttle <= 0.02 || b.speed < 0) { const loss = (ROLL + AERO * b.speed * b.speed) * h; b.speed -= Math.sign(b.speed) * Math.min(Math.abs(b.speed), loss); }
      if (Math.abs(b.speed) < 0.02 && inp.throttle <= 0.02 && inp.brake <= 0.05) b.speed = 0;
      // ---- steering (v9 smoothing): the wheel follows the smoothed input exponentially, never snaps;
      // the wheel angle is limited by speed so lateral acceleration stays believable (speed-sensitive steer)
      const sp = Math.abs(b.speed);
      const maxSteer = Math.min(0.62, Math.atan((MOTOR_WHEELBASE * ALAT) / Math.max(0.01, sp * sp)));
      const target = THREE.MathUtils.clamp(b.steerIn, -1, 1) * maxSteer * (1 - 0.18 * Math.min(1, sp / VMAX));
      b.steer += (target - b.steer) * (1 - Math.exp(-h * (sp < 2 ? 10 : 7)));
      const yawRate = (b.speed * Math.tan(b.steer)) / MOTOR_WHEELBASE;
      b.yaw += yawRate * h;
      // lean: critically-damped spring toward the physical lean angle -> eases in and out, no wobble
      const leanT = THREE.MathUtils.clamp(Math.atan((b.speed * yawRate) / G), -0.62, 0.62);
      const KL = 55, CL = 2 * Math.sqrt(KL) * 0.95;
      b.leanV += (KL * (leanT - b.lean) - CL * b.leanV) * h; b.lean += b.leanV * h;
      // ---- move
      this.fwd(b, f);
      const ox = b.pos.x, oz = b.pos.z;
      b.pos.x += f.x * b.speed * h; b.pos.z += f.z * b.speed * h;
      // ---- ground: kerbs up to STEP roll over, higher tops are walls
      const g = this.groundUnder(b, b.pos.y);
      if ((g.wallF && b.speed > 0) || (g.wallR && b.speed < 0)) {
        b.pos.x = ox; b.pos.z = oz; if (Math.abs(b.speed) > 3) b.hit = Math.max(b.hit, Math.abs(b.speed)); b.speed = -b.speed * 0.1;
      } else {
        const ty = g.y;
        if (ty >= b.pos.y - 0.005) { if (ty - b.pos.y > 0.04) b.hit = Math.max(b.hit, 0.01); b.pos.y = ty; b.vy = 0; }
        else { b.vy -= G * h; b.pos.y += b.vy * h; if (b.pos.y <= ty) { b.pos.y = ty; b.vy = 0; } }
        const pT = Math.atan2(g.hF - g.hR, MOTOR_WHEELBASE);
        b.pitch += (pT - b.pitch) * (1 - Math.exp(-h * 14));
      }
      // ---- solids
      worst = this.resolve(b, dyn, corr);
      const cl = corr.length();
      if (cl > 1e-5) {
        const nx = corr.x / cl, nz = corr.z / cl;
        const vn = (f.x * nx + f.z * nz) * b.speed;
        if (vn < 0) {
          const head = Math.abs(f.x * nx + f.z * nz);
          if (head > 0.45) { if (Math.abs(b.speed) > 3) b.hit = Math.max(b.hit, Math.abs(b.speed)); b.speed = Math.abs(b.speed) > 4 ? -b.speed * 0.15 : 0; }
          else b.speed *= 1 - 0.6 * head;                     // scrape along the wall
        }
      }
      b.spinF += (b.speed * h) / 0.25; b.spinR += (b.speed * h) / 0.255;
    }
    // ---- never leave the world / fall through it
    if (!Number.isFinite(b.pos.x + b.pos.z + b.pos.y + b.yaw + b.speed)) { this.resetToRoad(b); return; }
    if (b.pos.y < -0.5) b.pos.y = this.groundUnder(b, 0.5).y;
    // ---- stuck: still overlapping after resolution, or wedged with throttle open
    b.stuckT = worst > 0.03 ? b.stuckT + dt : 0;
    const moved = Math.hypot(b.pos.x - prevX, b.pos.z - prevZ);
    b.noProgT = inp.throttle > 0.5 && moved < 0.05 * dt ? b.noProgT + dt : 0;
    if (b.stuckT > 0.75) this.resetToRoad(b);
    // a stopped rider puts the left foot down
    b.footDown += ((Math.abs(b.speed) < 0.7 && inp.throttle < 0.1 ? 1 : 0) - b.footDown) * (1 - Math.exp(-dt * 8));
  }
  /** rendering adapter */
  render(b: Bike, _dt: number) {
    const m = b.m;
    m.root.position.copy(b.pos); m.root.rotation.y = b.yaw;
    const parked = !b.ridden && Math.abs(b.speed) < 0.01;
    m.lean.rotation.set(b.pitch, 0, b.lean, 'YXZ');
    m.steer.quaternion.setFromAxisAngle(MOTOR_STEER_AXIS, b.steer);
    m.wheelF.rotation.x = -b.spinF; m.wheelR.rotation.x = -b.spinR;
    m.stand.visible = parked; m.brake.visible = b.ridden && b.braking;
  }
  /** park where it stands: side stand down, bars turned left, slight lean onto the stand */
  park(b: Bike) { b.ridden = false; b.speed = 0; b.vy = 0; b.steer = 0.35; b.lean = 0.09; b.steerIn = 0; b.leanV = 0; b.braking = false; b.footDown = 0; this.render(b, 0); }
  mount(b: Bike) { b.ridden = true; b.steer = 0; b.lean = 0; b.steerIn = 0; b.leanV = 0; b.speed = 0; b.stopT = 0; b.stuckT = 0; b.noProgT = 0; b.footDown = 1; this.render(b, 0); }
  /** does a bike footprint fit here? */
  fits(b: Bike, dyn: AABB[]) { const sx = b.pos.x, sz = b.pos.z; const c = new THREE.Vector3(); this.resolve(b, dyn, c); const ok = c.lengthSq() < 1e-6; b.pos.x = sx; b.pos.z = sz; return ok; }
  /** recovery: put the bike on the nearest road lane (left-hand traffic heading), clear of anything solid */
  resetToRoad(b: Bike, dyn: AABB[] = this.extra) {
    const X = b.pos.x + 200, Z = b.pos.z + 150; const cands: { X: number; Z: number; yaw: number; d: number }[] = [];
    for (const r of ROADS) {
      if (r.kind === 'gang') continue;
      const hz = r.a[1] === r.b[1], c = hz ? r.a[1] : r.a[0], spec = ROAD_SPEC[r.kind];
      const off = r.kind === 'arteri' ? 6.25 : 1.75;
      const t0 = (hz ? r.a[0] : r.a[1]) + 4, t1 = (hz ? r.b[0] : r.b[1]) - 4;
      const t = THREE.MathUtils.clamp(hz ? X : Z, t0, t1);
      const side = (hz ? Z : X) < c ? -1 : 1;
      void spec;
      for (const dt of [0, 3, -3, 6, -6, 10, -10, 15, -15, 22, -22]) {
        const tt = THREE.MathUtils.clamp(t + dt, t0, t1);
        if (hz) cands.push({ X: tt, Z: c + side * off, yaw: side < 0 ? -Math.PI / 2 : Math.PI / 2, d: Math.hypot(tt - X, c + side * off - Z) });
        else cands.push({ X: c + side * off, Z: tt, yaw: side > 0 ? Math.PI : 0, d: Math.hypot(c + side * off - X, tt - Z) });
      }
    }
    cands.sort((a, b2) => a.d - b2.d);
    for (const k of cands) {
      b.pos.set(wx(k.X), 0.5, wz(k.Z)); b.yaw = k.yaw;
      b.pos.y = this.groundUnder(b, 0.3).y;
      if (this.fits(b, dyn)) break;
    }
    b.speed = 0; b.vy = 0; b.steer = 0; b.lean = 0; b.steerIn = 0; b.leanV = 0; b.pitch = 0; b.stuckT = 0; b.noProgT = 0; b.hit = -1;
  }
}
