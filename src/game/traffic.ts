// Game layer: moving vehicles (left-hand traffic), traffic-light cycle, pedestrians.
import * as THREE from 'three';
import { ROADS, SIGNALISED, wx, wz } from '../data/city';
import { carMesh, CAR_COLORS, type TrafficLight } from '../world/props';
import { makeMotor, spinWheels, CAR_LODS } from '../assets/vehicles';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, pick, rr } from '../world/core';

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

interface Lane { road: string; axis: 'EW' | 'NS'; dir: 1 | -1; c: number; t0: number; t1: number; arterial: boolean; acc: number; x0: number; x1: number; z0: number; z1: number }
interface Vehicle { lane: Lane; t: number; speed: number; max: number; len: number; obj: THREE.Object3D; kind: string; far: boolean; low: THREE.Object3D | null; inst: Inst | null; color: THREE.Color }
/** one InstancedMesh pair (painted body + dark glass/wheels) per car kind: every far car of that kind in 2 draw calls */
interface Inst { body: THREE.InstancedMesh; dark: THREE.InstancedMesh; n: number }

function buildLanes(): Lane[] {
  const lanes: Lane[] = [];
  const mk = (road: string, axis: 'EW' | 'NS', dir: 1 | -1, c: number, t0: number, t1: number, arterial: boolean): Lane => {
    const xa = axis === 'EW' ? [wx(t0), wx(t1)] : [wx(c), wx(c)], za = axis === 'EW' ? [wz(c), wz(c)] : [wz(t0), wz(t1)];
    return { road, axis, dir, c, t0, t1, arterial, acc: 0, x0: Math.min(xa[0], xa[1]), x1: Math.max(xa[0], xa[1]), z0: Math.min(za[0], za[1]), z1: Math.max(za[0], za[1]) };
  };
  for (const r of ROADS) {
    if (r.kind === 'gang') continue;
    const h = r.a[1] === r.b[1]; const c = h ? r.a[1] : r.a[0];
    const t0 = h ? r.a[0] : r.a[1], t1 = h ? r.b[0] : r.b[1];
    // Left-hand traffic: heading +X drives on north (smaller Z); heading +Z drives on east (larger X)
    const offs = r.kind === 'arteri' ? [2.75, 6.25] : [1.75];
    for (const o of offs) {
      if (h) { lanes.push(mk(r.name, 'EW', 1, c - o, t0, t1, r.kind === 'arteri')); lanes.push(mk(r.name, 'EW', -1, c + o, t0, t1, r.kind === 'arteri')); }
      else { lanes.push(mk(r.name, 'NS', 1, c + o, t0, t1, r.kind === 'arteri')); lanes.push(mk(r.name, 'NS', -1, c - o, t0, t1, r.kind === 'arteri')); }
    }
  }
  return lanes;
}
/** squared distance from a point to a lane's centre line (world metres) */
function laneDist2(l: Lane, x: number, z: number) {
  const dx = x < l.x0 ? l.x0 - x : x > l.x1 ? x - l.x1 : 0, dz = z < l.z0 ? l.z0 - z : z > l.z1 ? z - l.z1 : 0;
  return dx * dx + dz * dz;
}

/** Far stand-in for a motorbike + rider: every part merged into one vertex-coloured mesh (+ one for the lamps), so a
 *  bike past the LOD distance costs 2 draw calls instead of ~10. Same shapes and colours, no texture/plate/wheel spin. */
let farMat: THREE.MeshStandardMaterial | null = null;
function mergedFarLod(obj: THREE.Object3D): THREE.Object3D {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const solid: THREE.BufferGeometry[] = [], lamp: THREE.BufferGeometry[] = []; let lampMat: THREE.Material | null = null;
  obj.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return;
    let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count, mc = (m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
    const tinted = !!(m.material as THREE.MeshStandardMaterial).map;   // number plate: plain dark instead of its texture
    const col = new Float32Array(n * 3), src = g.attributes.color as THREE.BufferAttribute | undefined;
    for (let i = 0; i < n; i++) {
      const r = tinted ? 0.08 : src ? src.getX(i) : 1, gg = tinted ? 0.08 : src ? src.getY(i) : 1, b = tinted ? 0.09 : src ? src.getZ(i) : 1;
      col[i * 3] = r * mc.r; col[i * 3 + 1] = gg * mc.g; col[i * 3 + 2] = b * mc.b;
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if ((m.material as THREE.Material).type === 'MeshBasicMaterial') { lamp.push(g); lampMat = m.material as THREE.Material; } else solid.push(g);
  });
  const lo = new THREE.Group(); lo.name = 'LOD_LOW'; lo.visible = false;
  farMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  if (solid.length) { const a = new THREE.Mesh(mergeGeometries(solid)!, farMat); a.castShadow = true; lo.add(a); }
  if (lamp.length && lampMat) { const b = new THREE.Mesh(mergeGeometries(lamp)!, lampMat); lo.add(b); }
  return lo;
}

/** Green IT, same look for everyone: cars past ~70 m from the camera already drew as their 2-box stand-in; those
 *  stand-ins are now instanced (2 draw calls per car kind for all of them), bikes get a merged stand-in, and lanes
 *  farther than the draw distance (where nothing can be seen) step their simulation at 4 Hz without touching meshes.
 *  The draw distance itself is unchanged, so nothing appears or disappears closer than before. */
const LOD_IN = 62, LOD_OUT = 72, SLEEP_STEP = 0.25;
export class Traffic {
  vehicles: Vehicle[] = [];
  /** every vehicle built; `vehicles` holds only the active ones (QA speed switch may thin them) */
  private all: Vehicle[] = [];
  private byLane = new Map<Lane, Vehicle[]>();
  private inst = new Map<string, Inst>();
  private awake2 = Infinity;
  /** QA speed switch only: every vehicle uses its far stand-in */
  forceLow = false;
  group = new THREE.Group();
  lanes = buildLanes();
  constructor(parent: THREE.Object3D, public signals: Signals) {
    this.group.name = 'GAME_TRAFFIC'; parent.add(this.group);
    const instGroup = new THREE.Group(); instGroup.name = 'GAME_TRAFFIC_FAR'; parent.add(instGroup);
    for (const lane of this.lanes) {
      const n = lane.arterial ? 6 : 3;
      const L = lane.t1 - lane.t0;
      for (let i = 0; i < n; i++) {
        const r = rand();
        const kind = lane.arterial && r < 0.08 && lane.c % 1 !== 0 ? 'bus' : r < 0.18 ? 'taxi' : r < 0.26 && !lane.arterial ? 'angkot' : r < 0.55 ? 'motor' : 'car';
        // motors: matic scooter with a seated rider (some ojol, some with a pillion)
        const obj = kind === 'motor' ? makeMotor({ rider: true, pillion: 0.28, ojol: 0.22 }) : carMesh(pick(CAR_COLORS), kind as 'car' | 'taxi' | 'bus' | 'angkot');
        const len = kind === 'bus' ? 12 : kind === 'motor' ? 1.8 : 4.5;
        const max = (lane.arterial ? rr(11, 14) : rr(7, 9)) * (kind === 'motor' ? 1.1 : 1);
        const v: Vehicle = { lane, t: lane.t0 + ((i + rand() * 0.5) / n) * L, speed: max, max, len, obj, kind: obj.userData.kind ?? kind, far: false, low: null, inst: null, color: new THREE.Color(1, 1, 1) };
        const lo = obj.userData.lowLod as THREE.Object3D | undefined;
        if (lo) {   // car: its stand-in moves into the per-kind instanced pair; the moving group never shows it
          const ci = CAR_LODS.indexOf(obj as THREE.Group); if (ci >= 0) CAR_LODS.splice(ci, 1);   // the tier LOD pass leaves traffic alone
          const [a, b] = lo.children as THREE.Mesh[]; v.color.copy((a.material as THREE.MeshStandardMaterial).color);
          let I = this.inst.get(v.kind);
          if (!I) {
            const mk = (geo: THREE.BufferGeometry, m: THREE.Material, nm: string) => { const im = new THREE.InstancedMesh(geo, m, 64); im.name = nm; im.count = 0; im.castShadow = true; im.frustumCulled = false; im.visible = false; instGroup.add(im); return im; };
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2 });
            I = { body: mk(a.geometry, bodyMat, `FAR_${v.kind}_BODY`), dark: mk(b.geometry, b.material as THREE.Material, `FAR_${v.kind}_DARK`), n: 0 };
            this.inst.set(v.kind, I);
          }
          v.inst = I; lo.removeFromParent();
        } else { v.low = mergedFarLod(obj); obj.add(v.low); }
        this.group.add(obj); this.vehicles.push(v); this.all.push(v);
      }
    }
    this.indexLanes();
  }
  private indexLanes() { this.byLane.clear(); for (const v of this.vehicles) (this.byLane.get(v.lane) ?? this.byLane.set(v.lane, []).get(v.lane)!).push(v); }
  /** keep a fraction of each lane's vehicles (1 = all); hidden ones neither move nor collide. QA speed switch only. */
  setDensity(f: number) {
    const byLane = new Map<Lane, Vehicle[]>();
    for (const v of this.all) (byLane.get(v.lane) ?? byLane.set(v.lane, []).get(v.lane)!).push(v);
    this.vehicles = [];
    for (const list of byLane.values()) { const keep = Math.max(1, Math.ceil(list.length * f)); list.forEach((v, i) => { v.obj.visible = i < keep; if (i < keep) this.vehicles.push(v); }); }
    this.indexLanes();
  }

  /** render culling + level of detail, once per frame after update(). Vehicles past the draw distance `d` are hidden
   *  (as before); between ~70 m and `d` they draw as the instanced / merged stand-in. */
  cull(cam: THREE.Vector3, d: number) {
    const d2 = d * d; this.awake2 = (d + 20) * (d + 20);
    for (const I of this.inst.values()) I.n = 0;
    for (const v of this.vehicles) {
      const o = v.obj, p = o.position, q = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      if (q >= d2) { if (o.visible) { o.visible = false; o.matrixWorldAutoUpdate = false; } continue; }
      const far = this.forceLow || (v.far ? q > LOD_IN * LOD_IN : q > LOD_OUT * LOD_OUT);
      if (v.inst && far) {
        if (o.visible) { o.visible = false; o.matrixWorldAutoUpdate = false; }
        const I = v.inst; if (I.n >= I.body.instanceMatrix.count) continue;
        o.updateMatrix(); I.body.setMatrixAt(I.n, o.matrix); I.dark.setMatrixAt(I.n, o.matrix); I.body.setColorAt(I.n, v.color); I.n++;
      } else {
        if (!o.visible) { o.visible = true; o.matrixWorldAutoUpdate = true; }
        if (v.low && far !== v.far) { for (const c of o.children) c.visible = c === v.low ? far : !far; }
      }
      v.far = far;
    }
    for (const I of this.inst.values()) {
      for (const im of [I.body, I.dark]) { im.count = I.n; im.visible = I.n > 0; if (I.n) im.instanceMatrix.needsUpdate = true; }
      if (I.n && I.body.instanceColor) I.body.instanceColor.needsUpdate = true;
    }
  }
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

  /** `focus`: the camera. Lanes farther than the draw distance (+20 m) from it are out of sight: they only step their
   *  car-following at 4 Hz and leave their meshes alone until they come back into range. */
  update(dt: number, time: number, player: THREE.Vector3 | null = null, focus: THREE.Vector3 | null = null) {
    for (const [lane, list] of this.byLane) {
      let step = dt, awake = true;
      if (focus && laneDist2(lane, focus.x, focus.z) > this.awake2) { lane.acc += dt; if (lane.acc < SLEEP_STEP) continue; step = lane.acc; awake = false; }
      lane.acc = 0;
      list.sort((a, b) => (a.t - b.t) * lane.dir);
      const L = lane.t1 - lane.t0;
      list.forEach((v, i) => {
        const ahead = list[(i + 1) % list.length];
        let gap = (ahead.t - v.t) * lane.dir; if (gap <= 0) gap += L;
        gap -= (ahead.len + v.len) / 2;
        let stopD = this.stopAhead(v, time) - v.len / 2;
        if (player && awake) { // yield to the player standing in the lane ahead
          const pc = lane.axis === 'EW' ? player.z - wz(lane.c) : player.x - wx(lane.c);
          const pt = lane.axis === 'EW' ? player.x - wx(v.t) : player.z - wz(v.t);
          const ahead = pt * lane.dir;
          if (Math.abs(pc) < 1.6 && ahead > 0 && ahead < 14) stopD = Math.min(stopD, ahead - v.len / 2 - 1.5);
        }
        const free = Math.min(gap - 2.5, stopD - 0.5);
        const target = free < 0 ? 0 : Math.min(v.max, Math.sqrt(Math.max(0, free) * 2 * 4));
        v.speed += THREE.MathUtils.clamp(target - v.speed, -8 * step, 3 * step);
        // a coarse (sleeping) step never jumps through the car ahead
        const mv = awake ? v.speed * step : Math.min(v.speed * step, Math.max(0, gap - 2.5));
        v.t += mv * lane.dir;
        if (v.t > lane.t1) v.t -= L; if (v.t < lane.t0) v.t += L;
        if (!awake) return;
        const x = lane.axis === 'EW' ? v.t : lane.c, z = lane.axis === 'EW' ? lane.c : v.t;
        v.obj.position.set(wx(x), 0.02, wz(z));
        // models face -Z locally
        v.obj.rotation.y = lane.axis === 'EW' ? (lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (lane.dir > 0 ? Math.PI : 0);
        if (v.obj.visible && !v.far) spinWheels(v.obj, v.speed * step);
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
  /** render culling: walkers past the draw distance are hidden (their walk keeps going, so they reappear where they
   *  should be). Hidden walkers skip the pose and drop out of the per-frame matrix update. */
  cull(cam: THREE.Vector3, d: number) {
    const d2 = d * d;
    for (const p of this.peds) {
      const o = p.obj, q = (o.position.x - cam.x) ** 2 + (o.position.z - cam.z) ** 2, vis = q < d2;
      if (vis === o.visible) continue;
      o.visible = vis; o.matrixWorldAutoUpdate = vis;
      if (vis) this.pose(p);
    }
  }
  private pose(p: Ped) {
    const fwd = p.t % 2 < 1;
    p.obj.rotation.y = Math.atan2((p.b.x - p.a.x) * (fwd ? 1 : -1), (p.b.z - p.a.z) * (fwd ? 1 : -1));
    walkPose(p.person, p.phase);
  }
  update(dt: number, _time: number) {
    for (const p of this.peds) {
      p.t += p.sp * dt;
      const u = p.t % 2; const f = u < 1 ? u : 2 - u;
      p.obj.position.lerpVectors(p.a, p.b, f);   // always: cheap, and the bike/cull read it
      p.phase = (p.phase + p.speed * dt / (WALK_STRIDE * p.person.scale)) % 1;
      if (p.obj.visible) this.pose(p);
    }
  }
}
