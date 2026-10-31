// Game layer: moving vehicles (left-hand traffic), traffic-light cycle, pedestrians.
import * as THREE from 'three';
import { ROADS, SIGNALISED, wx, wz } from '../data/city';
import { carMesh, motorMesh, CAR_COLORS, type TrafficLight } from '../world/props';
import { makeMotor, spinWheels } from '../assets/vehicles';
import { rand, pick, rr, mat, box } from '../world/core';

type Phase = 'EW_G' | 'EW_Y' | 'ALL_R1' | 'NS_G' | 'NS_Y' | 'ALL_R2';
const CYCLE: [Phase, number][] = [['EW_G', 16], ['EW_Y', 3], ['ALL_R1', 2], ['NS_G', 12], ['NS_Y', 3], ['ALL_R2', 2]];
const CYCLE_LEN = CYCLE.reduce((a, [, d]) => a + d, 0);

export class Signals {
  offsets = new Map<string, number>();
  constructor(public tls: TrafficLight[]) { SIGNALISED.forEach(([x, z], i) => this.offsets.set(`${x}_${z}`, i * 7)); }
  phase(X: number, Z: number, t: number): Phase {
    let u = (t + (this.offsets.get(`${X}_${Z}`) ?? 0)) % CYCLE_LEN;
    for (const [p, d] of CYCLE) { if (u < d) return p; u -= d; }
    return 'EW_G';
  }
  /** state for an axis: 'G' | 'Y' | 'R' */
  state(X: number, Z: number, axis: 'EW' | 'NS', t: number): 'G' | 'Y' | 'R' {
    const p = this.phase(X, Z, t);
    if (p === `${axis}_G`) return 'G'; if (p === `${axis}_Y`) return 'Y'; return 'R';
  }
  update(t: number) {
    for (const tl of this.tls) {
      const s = this.state(tl.X, tl.Z, tl.axis, t);
      tl.lights[0].emissiveIntensity = s === 'R' ? 3 : 0.04;
      tl.lights[1].emissiveIntensity = s === 'Y' ? 3 : 0.04;
      tl.lights[2].emissiveIntensity = s === 'G' ? 3 : 0.04;
    }
  }
}

interface Lane { road: string; axis: 'EW' | 'NS'; dir: 1 | -1; c: number; t0: number; t1: number; arterial: boolean }
interface Vehicle { lane: Lane; t: number; speed: number; max: number; len: number; obj: THREE.Object3D }

function buildLanes(): Lane[] {
  const lanes: Lane[] = [];
  for (const r of ROADS) {
    if (r.kind === 'gang') continue;
    const h = r.a[1] === r.b[1]; const c = h ? r.a[1] : r.a[0];
    const t0 = h ? r.a[0] : r.a[1], t1 = h ? r.b[0] : r.b[1];
    // Left-hand traffic: heading +X drives on north (smaller Z); heading +Z drives on east (larger X)
    const offs = r.kind === 'arteri' ? [2.75, 6.25] : [1.75];
    for (const o of offs) {
      if (h) { lanes.push({ road: r.name, axis: 'EW', dir: 1, c: c - o, t0, t1, arterial: r.kind === 'arteri' }); lanes.push({ road: r.name, axis: 'EW', dir: -1, c: c + o, t0, t1, arterial: r.kind === 'arteri' }); }
      else { lanes.push({ road: r.name, axis: 'NS', dir: 1, c: c + o, t0, t1, arterial: r.kind === 'arteri' }); lanes.push({ road: r.name, axis: 'NS', dir: -1, c: c - o, t0, t1, arterial: r.kind === 'arteri' }); }
    }
  }
  return lanes;
}

export class Traffic {
  vehicles: Vehicle[] = [];
  /** every vehicle built; `vehicles` holds only the active ones (density setting for slow devices) */
  private all: Vehicle[] = [];
  group = new THREE.Group();
  lanes = buildLanes();
  constructor(parent: THREE.Object3D, public signals: Signals) {
    this.group.name = 'GAME_TRAFFIC'; parent.add(this.group);
    for (const lane of this.lanes) {
      const n = lane.arterial ? 6 : 3;
      const L = lane.t1 - lane.t0;
      for (let i = 0; i < n; i++) {
        const r = rand();
        const kind = lane.arterial && r < 0.08 && lane.c % 1 !== 0 ? 'bus' : r < 0.18 ? 'taxi' : r < 0.26 && !lane.arterial ? 'angkot' : r < 0.55 ? 'motor' : 'car';
        // motors: matic scooter with a seated rider (some ojol, some with a pillion)
        const obj = kind === 'motor' ? makeMotor({ rider: true, pillion: 0.28, ojol: 0.22 }) : carMesh(pick(CAR_COLORS), kind as any);
        const len = kind === 'bus' ? 12 : kind === 'motor' ? 1.8 : 4.5;
        const max = (lane.arterial ? rr(11, 14) : rr(7, 9)) * (kind === 'motor' ? 1.1 : 1);
        const v: Vehicle = { lane, t: lane.t0 + ((i + rand() * 0.5) / n) * L, speed: max, max, len, obj };
        this.group.add(obj); this.vehicles.push(v); this.all.push(v);
      }
    }
  }
  /** keep a fraction of each lane's vehicles (1 = all); hidden ones neither move nor collide */
  setDensity(f: number) {
    const byLane = new Map<Lane, Vehicle[]>();
    for (const v of this.all) (byLane.get(v.lane) ?? byLane.set(v.lane, []).get(v.lane)!).push(v);
    this.vehicles = [];
    for (const list of byLane.values()) { const keep = Math.max(1, Math.ceil(list.length * f)); list.forEach((v, i) => { v.obj.visible = i < keep; if (i < keep) this.vehicles.push(v); }); }
  }

  /** render culling: vehicles far from the camera are hidden (still simulated and still solid) */
  cull(cam: THREE.Vector3, d: number) { const d2 = d * d; for (const v of this.vehicles) { const o = v.obj.position; v.obj.visible = (o.x - cam.x) ** 2 + (o.z - cam.z) ** 2 < d2; } }
  /** distance along lane to the next stop line ahead, if signal says stop */
  private stopAhead(v: Vehicle, time: number): number {
    const { lane } = v; let best = Infinity;
    for (const [X, Z] of SIGNALISED) {
      const onAxis = lane.axis === 'EW' ? Math.abs(lane.c - Z) < 10 : Math.abs(lane.c - X) < 10;
      if (!onAxis) continue;
      const jt = lane.axis === 'EW' ? X : Z;
      const half = lane.axis === 'EW' ? (X === 200 ? 13 : 5.5) : 13; // half width of crossing road
      const stopT = jt - lane.dir * (half + 6.6); // behind the zebra
      const d = (stopT - v.t) * lane.dir;
      if (d < -0.5 || d > 60) continue;
      const s = this.signals.state(X, Z, lane.axis, time);
      if (s === 'R' || (s === 'Y' && d > 6)) best = Math.min(best, d);
    }
    return best;
  }

  update(dt: number, time: number, player: THREE.Vector3 | null = null) {
    // per lane ordering for car-following
    const byLane = new Map<Lane, Vehicle[]>();
    for (const v of this.vehicles) { (byLane.get(v.lane) ?? byLane.set(v.lane, []).get(v.lane)!).push(v); }
    for (const [lane, list] of byLane) {
      list.sort((a, b) => (a.t - b.t) * lane.dir);
      const L = lane.t1 - lane.t0;
      list.forEach((v, i) => {
        const ahead = list[(i + 1) % list.length];
        let gap = (ahead.t - v.t) * lane.dir; if (gap <= 0) gap += L;
        gap -= (ahead.len + v.len) / 2;
        let stopD = this.stopAhead(v, time) - v.len / 2;
        if (player) { // yield to the player standing in the lane ahead
          const pc = lane.axis === 'EW' ? player.z - wz(lane.c) : player.x - wx(lane.c);
          const pt = lane.axis === 'EW' ? player.x - wx(v.t) : player.z - wz(v.t);
          const ahead = pt * lane.dir;
          if (Math.abs(pc) < 1.6 && ahead > 0 && ahead < 14) stopD = Math.min(stopD, ahead - v.len / 2 - 1.5);
        }
        const free = Math.min(gap - 2.5, stopD - 0.5);
        const target = free < 0 ? 0 : Math.min(v.max, Math.sqrt(Math.max(0, free) * 2 * 4));
        v.speed += THREE.MathUtils.clamp(target - v.speed, -8 * dt, 3 * dt);
        v.t += v.speed * dt * lane.dir;
        if (v.t > lane.t1) v.t -= L; if (v.t < lane.t0) v.t += L;
        const x = lane.axis === 'EW' ? v.t : lane.c, z = lane.axis === 'EW' ? lane.c : v.t;
        v.obj.position.set(wx(x), 0.02, wz(z));
        // models face -Z locally
        v.obj.rotation.y = lane.axis === 'EW' ? (lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (lane.dir > 0 ? Math.PI : 0);
        spinWheels(v.obj, v.speed * dt);
      });
    }
  }
}

// --- pedestrians on sidewalks ---
import { createPerson, randomSpec, walkPose, WALK_STRIDE, type Person, type Outfit } from '../assets/people';
interface Ped { obj: THREE.Group; a: THREE.Vector3; b: THREE.Vector3; t: number; sp: number; person: Person; speed: number; phase: number }
// street mix (weights by repetition): office workers, SMK students, hijab women, ojol, vendors, satpam, IT technicians
const PED_MIX: Outfit[] = ['office_batik', 'office_batik', 'office_white', 'office_white', 'student_m', 'student_m', 'student_f', 'student_f', 'hijab_woman', 'hijab_woman', 'hijab_woman', 'ojol', 'ojol', 'vendor', 'vendor', 'security', 'technician', 'technician'];
export class Pedestrians {
  peds: Ped[] = [];
  private all: Ped[] = [];
  /** keep a fraction of the walkers (1 = all) */
  setDensity(f: number) { const keep = Math.max(1, Math.ceil(3 * f)); this.peds = this.all.filter((p, i) => { const on = i % 3 < keep; p.obj.visible = on; return on; }); }
  group = new THREE.Group();
  constructor(parent: THREE.Object3D, extra: [number, number, number, number, number][] = []) {
    this.group.name = 'GAME_PEDESTRIANS'; parent.add(this.group);
    const routes: [number, number, number, number][] = [
      [10, 139.5, 190, 139.5], [210, 139.5, 390, 139.5], [10, 160.5, 190, 160.5], [212, 160.5, 390, 160.5],
      [189.5, 10, 189.5, 140], [210.5, 160, 210.5, 290], [189.5, 160, 189.5, 290], [210.5, 10, 210.5, 140],
      [28, 166, 28, 233], [52, 166, 52, 233], [2, 198, 72, 198], [130, 199.5, 180, 199.5], [100, 15, 180, 15], [100, 45, 180, 45],
      [222, 162.5, 255, 162.5], [92, 163.5, 184, 163.5],
    ];
    for (const [x0, z0, x1, z1] of routes) for (let k = 0; k < 3; k++) {
      const person = createPerson(randomSpec(rand, pick(PED_MIX)));
      const g = person.root;
      const a = new THREE.Vector3(wx(x0), 0.15, wz(z0)), b = new THREE.Vector3(wx(x1), 0.15, wz(z1));
      const off = rr(-0.8, 0.8); const perp = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(off);
      a.add(perp); b.add(perp);
      if (z0 > 160 && z0 < 240 && x0 < 80) { a.y = b.y = 0.03; }
      if (x0 >= 100 && z0 <= 45) { a.y = b.y = 0.03; }
      this.group.add(g);
      const speed = rr(0.9, 1.4) * (person.spec.female ? 0.95 : 1);
      const pd: Ped = { obj: g, a, b, t: rand(), sp: speed / a.distanceTo(b), person, speed, phase: rand() };
      this.peds.push(pd); this.all.push(pd);
    }
    // v9 south district: own RNG (the old district's walkers keep their seeded look/positions)
    let sd = 777; const r2 = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
    for (const [x0, z0, x1, z1, y] of extra) for (let k = 0; k < 3; k++) {
      const person = createPerson(randomSpec(r2, PED_MIX[Math.floor(r2() * PED_MIX.length)]));
      const a = new THREE.Vector3(wx(x0), y, wz(z0)), b = new THREE.Vector3(wx(x1), y, wz(z1));
      const perp = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar((r2() - 0.5) * 1.0); a.add(perp); b.add(perp);
      this.group.add(person.root);
      const speed = 0.9 + r2() * 0.5;
      const pd: Ped = { obj: person.root, a, b, t: r2(), sp: speed / a.distanceTo(b), person, speed, phase: r2() };
      this.peds.push(pd); this.all.push(pd);
    }
  }
  /** render culling: walkers far from the camera are hidden (still simulated) */
  cull(cam: THREE.Vector3, d: number) { const d2 = d * d; for (const p of this.peds) { const o = p.obj.position; p.obj.visible = (o.x - cam.x) ** 2 + (o.z - cam.z) ** 2 < d2; } }
  update(dt: number, time: number) {
    for (const p of this.peds) {
      p.t += p.sp * dt;
      const u = p.t % 2; const f = u < 1 ? u : 2 - u; const fwd = u < 1;
      p.obj.position.lerpVectors(p.a, p.b, f);
      const d = fwd ? p.b.clone().sub(p.a) : p.a.clone().sub(p.b);
      p.obj.rotation.y = Math.atan2(d.x, d.z);
      p.phase = (p.phase + p.speed * dt / (WALK_STRIDE * p.person.scale)) % 1;
      if (p.obj.visible) walkPose(p.person, p.phase);
    }
  }
}
