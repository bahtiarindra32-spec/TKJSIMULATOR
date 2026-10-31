// Procedural, real-scale Indonesian street vehicles (no external files).
// Convention (same as the old props.ts meshes): forward = -Z, right = +X, up = +Y,
// origin = ground level, centre of the vehicle footprint. Units = metres.
// Wheels are separate meshes, listed in group.userData.wheels (spin them with spinWheels()).
// Geometry is built once per variant (template) and shared; per-instance variety comes from
// shared, cached materials (paint colour, plate texture, rider outfit preset).
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V2 = [number, number];
type V3 = [number, number, number];
type Cls = 'paint' | 'matte' | 'metal' | 'glass' | 'lamp';

// deterministic PRNG so the city looks the same every load
let seed = 20261028;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pickR = <T>(a: T[]): T => a[Math.floor(rnd() * a.length) % a.length];

// ---------------------------------------------------------------- palette & materials
const C = {
  black: '#16181b', trim: '#24272c', rubber: '#0f1012', seat: '#1c1c1e', grey: '#80868c', darkGrey: '#3a3f45',
  chrome: '#dfe3e7', alu: '#aab1b7', tyre: '#161616', rim: '#c4c9ce', rimDark: '#26292d', rimBlack: '#1b1d20',
  lampF: '#f3f7fa', lampR: '#c8141e', amber: '#ff9a1f', interior: '#1a1c1f', seam: '#0b0c0d', white: '#f2f2f0',
};
const matCache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined; if (!m) { m = make(); matCache.set(key, m); } return m;
}
export function paintMat(color: string, kind: 'car' | 'moto' = 'car') {
  return cached(`paint|${kind}|${color}`, () => new THREE.MeshStandardMaterial({ color, vertexColors: true, metalness: kind === 'car' ? 0.5 : 0.25, roughness: kind === 'car' ? 0.32 : 0.38 }));
}
const clsMat = (cls: Exclude<Cls, 'paint'>) => cached(`cls|${cls}`, () => {
  switch (cls) {
    case 'matte': return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
    case 'metal': return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.9 });
    case 'glass': return new THREE.MeshStandardMaterial({ color: '#16212b', vertexColors: true, roughness: 0.06, metalness: 0.55 });
    case 'lamp': return new THREE.MeshBasicMaterial({ vertexColors: true });
  }
});
/** shared lamp material of every vehicle (head/tail lights): main.ts brightens it at night */
export const vehicleLampMat = () => clsMat('lamp') as THREE.MeshBasicMaterial;
const wheelMat = () => cached('wheel', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }));

// ---------------------------------------------------------------- geometry kit
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

class Kit {
  parts: Partial<Record<Cls, THREE.BufferGeometry[]>> = {};
  add(cls: Cls, color: string, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    const geo = g.index ? g.toNonIndexed() : g;
    if (m) geo.applyMatrix4(m);
    for (const a of Object.keys(geo.attributes)) if (a !== 'position' && a !== 'normal') geo.deleteAttribute(a);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.clearGroups();
    const col = new THREE.Color(color), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (this.parts[cls] ??= []).push(geo);
    return this;
  }
  box(cls: Cls, color: string, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    return this.add(cls, color, new THREE.BoxGeometry(w, h, d), M4(x, y, z, rx, ry, rz));
  }
  /** cylinder along an axis */
  cyl(cls: Cls, color: string, r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', seg = 10, rTop = r) {
    const g = new THREE.CylinderGeometry(rTop, r, len, seg);
    if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    return this.add(cls, color, g, M4(x, y, z));
  }
  /** capsule (or cylinder when cap=false) between two points; sx/sz scale its cross-section */
  seg(cls: Cls, color: string, a: V3, b: V3, r: number, radial = 8, sx = 1, sz = 1, cap = true) {
    const A = v3(a), B = v3(b), d = B.clone().sub(A), L = Math.max(0.001, d.length());
    const g = cap ? new THREE.CapsuleGeometry(r, L, 2, radial) : new THREE.CylinderGeometry(r, r, L, radial);
    g.scale(sx, 1, sz);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return this.add(cls, color, g, new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  }
  sphere(cls: Cls, color: string, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ws = 10, hs = 7, phiS = 0, phiL = Math.PI * 2, thS = 0, thL = Math.PI, rx = 0) {
    return this.add(cls, color, new THREE.SphereGeometry(r, ws, hs, phiS, phiL, thS, thL), M4(x, y, z, rx, 0, 0, sx, sy, sz));
  }
  /** side profile drawn in (z, y), extruded across X (width centred on xc); optional width taper(z,y) */
  prof(cls: Cls, color: string, pts: V2[], width: number, xc = 0, bevel = 0.02, taper?: (z: number, y: number) => number) {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const depth = Math.max(0.002, width - 2 * bevel);
    let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: bevel > 0.015 ? 2 : 1, curveSegments: 4 });
    g.rotateY(-Math.PI / 2); g.translate(depth / 2 + xc, 0, 0);
    if (taper) {
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const s = taper(p.getZ(i), p.getY(i)); p.setX(i, xc + (p.getX(i) - xc) * s); }
    }
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = toCreasedNormals(g, 0.62);
    return this.add(cls, color, g);
  }
  build() {
    const out: Partial<Record<Cls, THREE.BufferGeometry>> = {};
    for (const k of Object.keys(this.parts) as Cls[]) { const g = mergeGeometries(this.parts[k]!, false)!; g.computeBoundingSphere(); out[k] = g; }
    return out;
  }
}

// ---------------------------------------------------------------- loft (car / bus bodies)
interface LoftSpec { stations: number[]; ring: (z: number) => V2[]; classify: (z: number, seg: number, x: number, y: number) => [Cls, string] }
/** Lofts a closed body: ring(z) gives the right half (bottom centre -> top centre); mirrored for the left. */
function loft(kit: Kit, spec: LoftSpec) {
  const st = spec.stations, S = st.length;
  const rings = st.map(z => spec.ring(z));
  const N = rings[0].length, R = 2 * N - 2;
  const pos = new Float32Array(S * R * 3);
  st.forEach((z, i) => {
    const r = rings[i]; const full: V2[] = [...r, ...r.slice(1, -1).reverse().map(([x, y]) => [-x, y] as V2)];
    full.forEach(([x, y], j) => { const k = (i * R + j) * 3; pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; });
  });
  const idx: number[] = [];
  const at = (i: number, j: number) => i * R + (j % R);
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < R; j++) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); idx.push(a, c, b, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  // orientation check: a right-side vertex mid-body must point +X
  const mi = Math.floor(S / 2), chk = at(mi, Math.floor(N / 2));
  const flip = nrm.getX(chk) < 0;
  const buckets = new Map<string, { cls: Cls; color: string; p: number[]; n: number[] }>();
  const push = (b: { p: number[]; n: number[] }, v: number) => { b.p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); const s = flip ? -1 : 1; b.n.push(nrm.getX(v) * s, nrm.getY(v) * s, nrm.getZ(v) * s); };
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < R; j++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const segIdx = j < N - 1 ? j : 2 * N - 3 - j;
    const xm = (pos[a * 3] + pos[b * 3] + pos[c * 3] + pos[d * 3]) / 4, ym = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[d * 3 + 1]) / 4;
    const [cls, color] = spec.classify((st[i] + st[i + 1]) / 2, segIdx, xm, ym);
    const key = cls + color; let bk = buckets.get(key); if (!bk) { bk = { cls, color, p: [], n: [] }; buckets.set(key, bk); }
    const tri = flip ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const v of tri) push(bk, v);
  }
  for (const bk of buckets.values()) {
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
    kit.add(bk.cls, bk.color, gg);
  }
}
const lerpPts = (pts: V2[], z: number) => {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return y0 + (y1 - y0) * (z - z0) / (z1 - z0 || 1); }
  return pts[pts.length - 1][1];
};
const inR = (z: number, r?: V2) => !!r && z >= r[0] && z <= r[1];

// ---------------------------------------------------------------- textures (plates, signs)
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const LET = 'ABCDEFGHJKLMNPRSTUVWXYZ';
function plateText() {
  const n = String(1000 + Math.floor(rnd() * 8999));
  const k = 1 + Math.floor(rnd() * 3); let s = ''; for (let i = 0; i < k; i++) s += LET[Math.floor(rnd() * LET.length)];
  return `B ${n} ${s}`;
}
const platePools: Record<string, THREE.Material[]> = {};
/** Indonesian plate: private = black with white text, public transport = yellow with black text */
function plateMat(kind: 'black' | 'yellow') {
  const pool = platePools[kind] ??= [];
  if (pool.length < 10) {
    const txt = plateText(), exp = `0${1 + Math.floor(rnd() * 9)}.${27 + Math.floor(rnd() * 4)}`;
    const bg = kind === 'black' ? '#121212' : '#f2c518', fg = kind === 'black' ? '#f4f4f4' : '#111';
    const tex = canvasTex(256, 84, g => {
      g.fillStyle = bg; g.fillRect(0, 0, 256, 84); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(5, 5, 246, 74);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 40px "DejaVu Sans", Arial, sans-serif'; g.fillText(txt, 128, 34, 236);
      g.font = 'bold 15px "DejaVu Sans", Arial, sans-serif'; g.fillText(exp, 128, 66);
    });
    pool.push(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2 }));
    return pool[pool.length - 1];
  }
  return pickR(pool);
}
function signMat(key: string, text: string, bg: string, fg: string, w = 512, h = 128, sub?: string) {
  return cached(`sign|${key}`, () => new THREE.MeshStandardMaterial({
    map: canvasTex(w, h, g => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${Math.floor(h * (sub ? 0.48 : 0.62))}px "DejaVu Sans", Arial, sans-serif`; g.fillText(text, w / 2, sub ? h * 0.38 : h / 2, w * 0.92);
      if (sub) { g.font = `bold ${Math.floor(h * 0.24)}px "DejaVu Sans", Arial, sans-serif`; g.fillText(sub, w / 2, h * 0.78, w * 0.92); }
    }), roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.08,
  }));
}
/** plates: list of [w, h, x, y, z, facing(+1 rear/-1 front), tiltX] merged into one geometry with uvs */
function plateGeo(list: [number, number, number, number, number, 1 | -1, number][]) {
  return mergeGeometries(list.map(([w, h, x, y, z, f, tilt]) => {
    const g = new THREE.PlaneGeometry(w, h); if (f < 0) g.rotateY(Math.PI); g.rotateX(tilt * f); g.translate(x, y, z); return g;
  }), false)!;
}

// ---------------------------------------------------------------- wheels
type WheelStyle = 'alloy' | 'steel' | 'bus' | 'moto';
const wheelCache = new Map<string, THREE.BufferGeometry>();
function wheelGeo(r: number, w: number, style: WheelStyle) {
  const key = `${r}|${w}|${style}`; let g = wheelCache.get(key); if (g) return g;
  const k = new Kit();
  const rr = style === 'moto' ? r * 0.7 : style === 'bus' ? r * 0.56 : r * 0.66;
  const hw = w / 2;
  const prof = [[rr, -hw * 0.82], [r * 0.9, -hw], [r * 0.985, -hw * 0.62], [r, 0], [r * 0.985, hw * 0.62], [r * 0.9, hw], [rr, hw * 0.82]].map(([a, b]) => new THREE.Vector2(a, b));
  const tyre = new THREE.LatheGeometry(prof, style === 'bus' ? 14 : 12); tyre.rotateZ(Math.PI / 2);
  k.add('matte', C.tyre, tyre);
  const rimCol = style === 'alloy' ? C.rimDark : style === 'moto' ? C.rimBlack : style === 'bus' ? '#9aa0a6' : C.rimBlack;
  k.cyl('matte', rimCol, rr, w * 0.8, 0, 0, 0, 'x', 12);
  if (style === 'alloy' || style === 'moto') {
    const n = 5; const sc = style === 'moto' ? C.rimBlack : C.rim;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; k.add('matte', sc, new THREE.BoxGeometry(w * 0.84, rr * 0.86, r * 0.09), M4(0, Math.cos(a) * rr * 0.47, Math.sin(a) * rr * 0.47, a)); }
    const lip = new THREE.TorusGeometry(rr * 0.95, rr * 0.06, 3, style === 'moto' ? 8 : 10); lip.rotateY(Math.PI / 2);
    for (const s of [-1, 1]) k.add('matte', style === 'moto' ? '#8c9399' : C.rim, lip.clone(), M4(s * w * 0.4, 0, 0));
    k.cyl('matte', style === 'moto' ? C.alu : C.rim, rr * 0.22, w * 0.86, 0, 0, 0, 'x', 6);
  } else if (style === 'steel') {
    k.cyl('matte', '#b9bec3', rr * 0.72, w * 0.84, 0, 0, 0, 'x', 12); // hubcap
    k.cyl('matte', '#6d7378', rr * 0.2, w * 0.88, 0, 0, 0, 'x', 8);
  } else {
    k.cyl('matte', '#c7ccd0', rr * 0.55, w * 0.86, 0, 0, 0, 'x', 12);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.cyl('matte', '#555b60', 0.018, w * 0.9, 0, Math.cos(a) * rr * 0.38, Math.sin(a) * rr * 0.38, 'x', 5); }
  }
  g = k.build().matte!; wheelCache.set(key, g); return g;
}

// ---------------------------------------------------------------- templates & instancing
interface Template {
  geos: Partial<Record<Cls, THREE.BufferGeometry>>;
  wheels: { r: number; w: number; style: WheelStyle; x: number; y: number; z: number; front?: boolean }[];
  plates?: { geo: THREE.BufferGeometry; kind: 'black' | 'yellow' };
  signs?: { geo: THREE.BufferGeometry; mat: () => THREE.Material }[];
  len: number; tris?: number;
}
const templates = new Map<string, Template>();
function instance(t: Template, paint: THREE.Material, name: string) {
  const g = new THREE.Group(); g.name = name;
  for (const cls of Object.keys(t.geos) as Cls[]) {
    const m = new THREE.Mesh(t.geos[cls]!, cls === 'paint' ? paint : clsMat(cls)); m.name = `${name}_${cls}`;
    m.castShadow = cls !== 'lamp'; m.receiveShadow = cls === 'paint' || cls === 'matte'; g.add(m);
  }
  if (t.plates) { const m = new THREE.Mesh(t.plates.geo, plateMat(t.plates.kind)); m.name = `${name}_PLAT`; g.add(m); }
  for (const s of t.signs ?? []) { const m = new THREE.Mesh(s.geo, s.mat()); m.castShadow = true; g.add(m); }
  const wheels: THREE.Mesh[] = [];
  for (const w of t.wheels) {
    const m = new THREE.Mesh(wheelGeo(w.r, w.w, w.style), wheelMat()); m.position.set(w.x, w.y, w.z); m.userData.r = w.r; m.castShadow = true; m.name = `${name}_RODA`;
    g.add(m); wheels.push(m);
  }
  g.userData.wheels = wheels; g.userData.len = t.len;
  return g;
}
/** advance wheel rotation for a vehicle that moved `dist` metres forward (-Z local) */
export function spinWheels(obj: THREE.Object3D, dist: number) {
  const ws = obj.userData.wheels as THREE.Object3D[] | undefined; if (!ws || dist === 0) return;
  for (const w of ws) w.rotation.x -= dist / (w.userData.r || 0.3);
}
export function triCount(o: THREE.Object3D) { let n = 0; o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); }

// ================================================================= CARS / BUS
interface BodySpec {
  L: number; HW: number; m: number; n: number; tumble: number; crown: number; hoodCrown: number;
  r: number; tw: number; axles: number[]; arch: number; wheelStyle: WheelStyle; dualRear?: boolean;
  yb: V2[]; belt: V2[]; top: V2[]; step: number;
  win: { ws?: V2; rear?: V2; side?: V2; pillars?: V2[]; frontAll?: number; rearAll?: number };
  seams?: number[];
  lampF: { d: number; segs: number[]; minX: number; maxY?: number };
  lampR: { d: number; segs: number[]; minX: number };
  grille?: { d: number; segs: number[]; maxX: number; color?: string };
  stripe?: { segs: number[]; color: string; zMin?: number };
  doorOpen?: { z: V2; side: -1 | 1; segs: number[] };
  doors?: { zs: V2[]; side: -1 | 1 };
  roofColor?: string; topBand?: { yMin: number; color: string; cls: Cls }; rearMinY?: number;
}
function bodyAt(s: BodySpec, z: number) {
  const u = Math.min(1, Math.abs(z) / (s.L / 2));
  const f = Math.pow(Math.max(0, 1 - Math.pow(u, s.n)), 1 / s.m);
  const hw = s.HW * f;
  let yb = lerpPts(s.yb, z);
  const R = s.r + s.arch;
  for (const za of s.axles) { const dz = z - za; if (Math.abs(dz) < R) yb = Math.max(yb, s.r + Math.sqrt(R * R - dz * dz) * 0.92); }
  const bl = lerpPts(s.belt, z);
  yb = Math.min(yb, bl - 0.08);
  const yt = Math.max(lerpPts(s.top, z), bl + 0.02);
  const cab = THREE.MathUtils.clamp((yt - bl - 0.1) / 0.3, 0, 1);
  return { hw, yb, bl, yt, cab, f };
}
function buildBody(kit: Kit, s: BodySpec) {
  const half = s.L / 2;
  const zs: number[] = [];
  for (let z = -half; z <= half + 1e-6; z += s.step) zs.push(z);
  for (const u of [0.8, 0.88, 0.93, 0.965, 0.988]) { zs.push(-half * u, half * u); }
  const R = s.r + s.arch;
  for (const za of s.axles) for (let k = -4; k <= 4; k++) zs.push(za + (k / 4) * R * 0.98);
  const w = s.win; for (const r of [w.ws, w.rear, w.side, ...(w.pillars ?? []), s.doorOpen?.z, ...(s.doors?.zs ?? [])]) if (r) zs.push(r[0], r[1]);
  if (w.frontAll !== undefined) zs.push(w.frontAll); if (w.rearAll !== undefined) zs.push(w.rearAll);
  for (const sm of s.seams ?? []) zs.push(sm - 0.012, sm + 0.012);
  zs.push(-half + s.lampF.d, half - s.lampR.d); if (s.grille) zs.push(-half + s.grille.d);
  zs.push(-half, half);
  const stations = [...new Set(zs.map(z => Math.round(THREE.MathUtils.clamp(z, -half, half) * 1000) / 1000))].sort((a, b) => a - b)
    .filter((z, i, a) => i === 0 || z - a[i - 1] > 0.004);
  loft(kit, {
    stations,
    ring: z => {
      const { hw, yb, bl, yt, cab } = bodyAt(s, z);
      const h = bl - yb;
      const ytt = yt - 0.07 * cab;
      const hwG = hw * (0.955 - s.tumble * cab);
      const hwB = hw * 0.965;
      return [[0, yb], [hw * 0.93, yb], [hw * 0.99, yb + 0.16 * h], [hw, yb + 0.58 * h], [hw * 0.99, bl - 0.035], [hwB, bl + 0.004],
        [hwB + (hwG - hwB) * 0.5, bl + 0.52 * (ytt - bl)], [hwG, ytt], [hwG * 0.78, yt - 0.012], [0, yt + (cab > 0.5 ? s.crown : s.hoodCrown)]];
    },
    classify: (z, seg, x, y) => {
      const ax = Math.abs(x) / s.HW; const b = bodyAt(s, z);
      if (z < -half + s.lampF.d && s.lampF.segs.includes(seg) && ax > s.lampF.minX && (s.lampF.maxY === undefined || y < s.lampF.maxY)) return ['lamp', C.lampF];
      if (z > half - s.lampR.d && s.lampR.segs.includes(seg) && ax > s.lampR.minX) return ['lamp', C.lampR];
      if (s.grille && z < -half + s.grille.d && s.grille.segs.includes(seg) && ax < s.grille.maxX) return ['matte', s.grille.color ?? C.black];
      if (s.doorOpen && Math.sign(x) === s.doorOpen.side && inR(z, s.doorOpen.z) && s.doorOpen.segs.includes(seg)) return ['matte', C.interior];
      if (s.doors && Math.sign(x) === s.doors.side && s.doors.zs.some(r => inR(z, r)) && seg >= 2 && seg <= 6 && y < 2.95) {
        const r = s.doors.zs.find(r => inR(z, r))!; const edge = Math.min(z - r[0], r[1] - z) < 0.06 || Math.abs(z - (r[0] + r[1]) / 2) < 0.02;
        return edge || seg === 2 ? ['matte', C.trim] : ['glass', '#ffffff'];
      }
      if (s.topBand && y > s.topBand.yMin && seg >= 5) return [s.topBand.cls, s.topBand.color];
      if (seg >= 5) {
        const up = y > b.bl + 0.03;
        if (w.frontAll !== undefined && z < w.frontAll && up) return ['glass', '#ffffff'];
        if (w.rearAll !== undefined && z > w.rearAll && up && y > (s.rearMinY ?? 0)) return ['glass', '#ffffff'];
        if (seg >= 7 && (inR(z, w.ws) || inR(z, w.rear))) return ['glass', '#ffffff'];
        if (seg <= 6 && inR(z, w.side) && b.cab > 0.8 && !(w.pillars ?? []).some(p => inR(z, p))) return ['glass', '#ffffff'];
        if (seg === 5 && inR(z, w.ws) && b.cab > 0.5) return ['glass', '#ffffff'];
      }
      if (s.stripe && s.stripe.segs.includes(seg) && z > (s.stripe.zMin ?? -99)) return ['matte', s.stripe.color];
      if (seg === 1 && (z < -half + 0.22 || z > half - 0.2)) return ['matte', C.trim];
      if (seg >= 2 && seg <= 5 && (s.seams ?? []).some(sm => Math.abs(z - sm) < 0.012)) return ['matte', C.seam];
      if (seg === 0) return ['matte', C.black];
      if (s.roofColor && seg === 8 && b.cab > 0.9) return ['matte', s.roofColor];
      return ['paint', '#ffffff'];
    },
  });
  // underbody so nothing is see-through between the axles
  kit.box('matte', C.black, s.HW * 2 - 0.5, 0.16, Math.abs(s.axles[s.axles.length - 1] - s.axles[0]), 0, s.r * 0.75, (s.axles[0] + s.axles[s.axles.length - 1]) / 2);
  const wheels: Template['wheels'] = [];
  s.axles.forEach((za, i) => {
    const wide = s.dualRear && i > 0; const tw = wide ? s.tw * 1.8 : s.tw;
    for (const sx of [-1, 1]) wheels.push({ r: s.r, w: tw, style: s.wheelStyle, x: sx * (s.HW - tw / 2 - 0.03), y: s.r, z: za, front: i === 0 });
  });
  return wheels;
}
function mirrors(kit: Kit, s: BodySpec, z: number, color: [Cls, string]) {
  const b = bodyAt(s, z);
  for (const sx of [-1, 1]) {
    const x = sx * (b.hw * 0.96);
    kit.seg('matte', C.black, [x, b.bl + 0.03, z + 0.05], [x + sx * 0.12, b.bl + 0.08, z + 0.07], 0.018, 5);
    kit.box(color[0], color[1], 0.15, 0.1, 0.06, x + sx * 0.17, b.bl + 0.1, z + 0.08, 0, sx * 0.25, 0);
    kit.box('glass', '#ffffff', 0.13, 0.08, 0.01, x + sx * 0.17, b.bl + 0.1, z + 0.115, 0, sx * 0.25, 0);
  }
}
function handles(kit: Kit, s: BodySpec, zs: number[]) {
  for (const z of zs) { const b = bodyAt(s, z); for (const sx of [-1, 1]) kit.box('metal', C.alu, 0.02, 0.025, 0.13, sx * (b.hw * 0.99 + 0.006), b.bl - 0.09, z); }
}

const SPECS: Record<string, BodySpec> = {
  // Toyota Avanza / Daihatsu Xenia style low MPV: 4.40 x 1.73 x 1.70 m, WB 2.75, 185/65R15
  mpv: {
    L: 4.4, HW: 0.865, m: 2.6, n: 5, tumble: 0.12, crown: 0.03, hoodCrown: 0.03, r: 0.31, tw: 0.19, axles: [-1.37, 1.38], arch: 0.05, wheelStyle: 'alloy', step: 0.11,
    yb: [[-2.2, 0.45], [-1.95, 0.29], [1.95, 0.29], [2.2, 0.47]],
    belt: [[-2.2, 0.78], [-1.7, 0.9], [-0.9, 0.99], [1.9, 1.06], [2.2, 1.05]],
    top: [[-2.2, 0.78], [-2.05, 0.9], [-1.35, 1.03], [-1.25, 1.06], [-0.5, 1.62], [0.2, 1.68], [1.95, 1.66], [2.15, 1.62], [2.2, 1.5]],
    win: { ws: [-1.25, -0.5], side: [-0.48, 1.9], pillars: [[0.28, 0.38], [1.12, 1.24]], rearAll: 2.06 },
    seams: [-0.95, 0.33, 1.02],
    lampF: { d: 0.3, segs: [3, 4], minX: 0.45 }, lampR: { d: 0.12, segs: [3, 4, 5], minX: 0.62 },
    grille: { d: 0.07, segs: [2, 3], maxX: 0.5 },
  },
  // Toyota Vios / Limo style sedan: 4.42 x 1.73 x 1.48 m, WB 2.55
  sedan: {
    L: 4.42, HW: 0.86, m: 2.6, n: 5, tumble: 0.16, crown: 0.03, hoodCrown: 0.035, r: 0.31, tw: 0.19, axles: [-1.3, 1.25], arch: 0.05, wheelStyle: 'alloy', step: 0.11,
    yb: [[-2.21, 0.42], [-1.95, 0.29], [1.95, 0.29], [2.21, 0.46]],
    belt: [[-2.21, 0.7], [-1.6, 0.84], [0, 0.94], [1.7, 0.99], [2.21, 0.96]],
    top: [[-2.21, 0.7], [-2.05, 0.8], [-1.0, 0.95], [-0.9, 0.97], [-0.12, 1.44], [0.95, 1.46], [1.7, 1.03], [2.1, 1.0], [2.21, 0.93]],
    win: { ws: [-0.9, -0.12], rear: [0.98, 1.68], side: [-0.82, 1.3], pillars: [[0.3, 0.4]] },
    seams: [-0.93, 0.35, 1.08],
    lampF: { d: 0.3, segs: [3, 4], minX: 0.45 }, lampR: { d: 0.16, segs: [3, 4], minX: 0.5 },
    grille: { d: 0.07, segs: [2, 3], maxX: 0.5 },
  },
  // Honda Brio / Toyota Agya style city hatch: 3.80 x 1.68 x 1.50 m, WB 2.40
  hatch: {
    L: 3.8, HW: 0.835, m: 2.4, n: 4.5, tumble: 0.15, crown: 0.03, hoodCrown: 0.035, r: 0.29, tw: 0.175, axles: [-1.17, 1.2], arch: 0.05, wheelStyle: 'alloy', step: 0.105,
    yb: [[-1.9, 0.42], [-1.7, 0.28], [1.7, 0.28], [1.9, 0.46]],
    belt: [[-1.9, 0.72], [-1.35, 0.86], [0, 0.95], [1.6, 1.0], [1.9, 1.0]],
    top: [[-1.9, 0.72], [-1.75, 0.83], [-0.98, 0.95], [-0.9, 0.97], [-0.12, 1.45], [1.3, 1.48], [1.7, 1.42], [1.9, 1.2]],
    win: { ws: [-0.9, -0.12], side: [-0.82, 1.08], pillars: [[0.26, 0.36]], rearAll: 1.68 },
    seams: [-0.92, 0.31, 1.0],
    lampF: { d: 0.28, segs: [3, 4], minX: 0.45 }, lampR: { d: 0.14, segs: [4, 5, 6], minX: 0.55 },
    grille: { d: 0.07, segs: [2, 3], maxX: 0.5 },
  },
  // Jakarta Mikrolet (Suzuki Carry / Daihatsu Gran Max minivan): 4.10 x 1.66 x 1.92 m
  angkot: {
    L: 4.1, HW: 0.83, m: 3, n: 7, tumble: 0.05, crown: 0.02, hoodCrown: 0.02, r: 0.28, tw: 0.17, axles: [-1.2, 1.1], arch: 0.05, wheelStyle: 'steel', step: 0.12,
    yb: [[-2.05, 0.45], [-1.92, 0.32], [1.92, 0.32], [2.05, 0.45]],
    belt: [[-2.05, 0.92], [-1.9, 1.0], [2.05, 1.03]],
    top: [[-2.05, 0.95], [-1.98, 1.1], [-1.82, 1.84], [-1.6, 1.9], [1.95, 1.92], [2.05, 1.8]],
    win: { frontAll: -1.82, side: [-1.8, 1.88], pillars: [[-1.12, -1.02], [-0.06, 0.04], [0.92, 1.0]], rearAll: 1.96 },
    seams: [-1.1, 1.92],
    lampF: { d: 0.1, segs: [3], minX: 0.55 }, lampR: { d: 0.08, segs: [3, 4], minX: 0.65 },
    grille: { d: 0.07, segs: [2, 3], maxX: 0.45, color: '#2a2f35' },
    stripe: { segs: [4], color: '#f08a1c' },
    doorOpen: { z: [-1.0, -0.25], side: -1, segs: [1, 2, 3, 4, 5, 6] },
  },
  // TransJakarta single bus (high floor, 12 m): 12.0 x 2.50 x 3.40 m
  bus: {
    L: 12, HW: 1.25, m: 4, n: 14, tumble: 0.03, crown: 0.04, hoodCrown: 0.02, r: 0.5, tw: 0.28, axles: [-3.5, 2.6], arch: 0.07, wheelStyle: 'bus', dualRear: true, step: 0.16,
    yb: [[-6, 0.62], [-5.75, 0.42], [5.75, 0.42], [6, 0.62]],
    belt: [[-6, 1.25], [-5.85, 1.42], [6, 1.5]],
    top: [[-6, 1.25], [-5.94, 3.2], [-5.6, 3.38], [5.8, 3.4], [6, 3.1]],
    win: { frontAll: -5.86, side: [-5.6, 5.4], pillars: [[-4.3, -4.18], [-0.6, -0.48], [0.75, 0.87], [3.4, 3.52], [4.65, 4.77]], rearAll: 5.93 },
    lampF: { d: 0.07, segs: [2, 3], minX: 0.62 }, lampR: { d: 0.06, segs: [3, 4], minX: 0.7 },
    grille: { d: 0.07, segs: [2], maxX: 0.5, color: '#20262c' },
    stripe: { segs: [3], color: '#f57c00', zMin: -5.9 },
    doors: { zs: [[-3.0, -1.9], [-0.25, 0.85]], side: 1 },
    topBand: { yMin: 2.85, color: '#eef1f3', cls: 'matte' }, rearMinY: 2.0,
  },
};

function carTemplate(kind: 'mpv' | 'sedan' | 'hatch' | 'taxi' | 'angkot' | 'bus'): Template {
  let t = templates.get(kind); if (t) return t;
  const s = SPECS[kind === 'taxi' ? 'sedan' : kind];
  const k = new Kit();
  const wheels = buildBody(k, s);
  const half = s.L / 2;
  const signs: Template['signs'] = [];
  const pl: [number, number, number, number, number, 1 | -1, number][] = [];
  if (kind === 'bus') {
    // front destination display, roof A/C pod, rabbit-ear mirrors, bumpers
    k.box('matte', '#15181b', 2.0, 0.32, 0.04, 0, 3.12, -half - 0.005);
    signs.push({ geo: new THREE.PlaneGeometry(1.9, 0.26).rotateY(Math.PI).translate(0, 3.12, -half - 0.03), mat: () => signMat('tjdest', '1  BLOK M - KOTA', '#111', '#ff9d1c', 1024, 140) });
    k.box('matte', '#dfe3e6', 1.7, 0.28, 3.6, 0, 3.52, 1.2);
    k.box('matte', '#dfe3e6', 1.5, 0.18, 2.0, 0, 3.47, -3.2);
    k.box('matte', '#2b3036', 2.2, 0.22, 0.06, 0, 0.6, -half + 0.0);
    k.box('matte', '#2b3036', 2.0, 0.22, 0.06, 0, 0.62, half - 0.0);
    for (const sx of [-1, 1]) {
      k.seg('matte', C.black, [sx * 1.2, 2.9, -5.75], [sx * 1.45, 2.85, -6.25], 0.025, 5);
      k.seg('matte', C.black, [sx * 1.45, 2.85, -6.25], [sx * 1.45, 2.3, -6.3], 0.025, 5);
      k.box('matte', C.black, 0.12, 0.4, 0.08, sx * 1.45, 2.15, -6.3);
      // TransJakarta wordmark on both sides
      const lw = sx > 0 ? 1.5 : 2.6;
      signs.push({ geo: new THREE.PlaneGeometry(lw, lw * 0.13).rotateY(sx * Math.PI / 2).translate(sx * 1.256, 0.98, sx > 0 ? -1.07 : -1.0), mat: () => signMat('tjlogo', 'TransJakarta', '#1d5fbf', '#ffffff', 768, 100) });
    }
    k.box('lamp', '#ff3a2a', 0.18, 0.5, 0.03, -1.05, 1.0, half + 0.01); k.box('lamp', '#ff3a2a', 0.18, 0.5, 0.03, 1.05, 1.0, half + 0.01);
    pl.push([0.43, 0.135, 0, 0.72, -half - 0.08, -1, 0], [0.43, 0.135, 0, 0.72, half + 0.08, 1, 0]);
    t = { geos: k.build(), wheels, len: 12, plates: { geo: plateGeo(pl), kind: 'yellow' }, signs };
  } else {
    const b0 = bodyAt(s, s.win.ws ? s.win.ws[0] + 0.12 : -half + 0.45);
    mirrors(k, s, s.win.ws ? s.win.ws[0] + 0.1 : -half + 0.35, ['paint', '#ffffff']);
    if (kind !== 'angkot') handles(k, s, [(s.seams![0] + s.seams![1]) / 2 + 0.25, (s.seams![1] + s.seams![2]) / 2 + 0.2]);
    else handles(k, s, [-1.35]);
    void b0;
    // bumpers: darker lower lip front & rear
    const br = bodyAt(s, half - 0.1);
    // amber side repeaters + fog lamps
    if (kind !== 'angkot') for (const sx of [-1, 1]) k.box('lamp', C.amber, 0.02, 0.025, 0.06, sx * (bodyAt(s, s.axles[0] + 0.55).hw + 0.004), bodyAt(s, s.axles[0] + 0.55).bl - 0.12, s.axles[0] + 0.55);
    // wiper arms
    if (s.win.ws) { const b = bodyAt(s, s.win.ws[0] + 0.04); for (const sx of [-0.25, 0.25]) k.seg('matte', C.black, [sx - 0.15, b.yt + 0.02, s.win.ws[0] + 0.03], [sx + 0.3, b.yt + 0.12, s.win.ws[0] + 0.18], 0.01, 4, 1, 1, false); }
    const plateY = (z: number) => bodyAt(s, z).yb + 0.2;
    pl.push([0.43, 0.135, 0, plateY(-half + 0.05), -half - 0.02, -1, 0]);
    pl.push([0.43, 0.135, 0, kind === 'sedan' || kind === 'taxi' ? br.bl - 0.16 : br.yb + 0.24, half + 0.012, 1, 0]);
    if (kind === 'mpv') { // roof rails
      const b = bodyAt(s, 0.5);
      for (const sx of [-1, 1]) {
        k.box('matte', C.black, 0.04, 0.03, 2.2, sx * b.hw * 0.6, b.yt + 0.035, 0.75);
        for (const z of [-0.3, 1.8]) k.box('matte', C.black, 0.05, 0.05, 0.1, sx * b.hw * 0.6, b.yt + 0.01, z);
      }
      k.box('matte', C.black, 0.6, 0.05, 0.12, 0, bodyAt(s, 2.1).yt + 0.01, 2.1); // spoiler
    }
    if (kind === 'taxi') { // Blue Bird-style roof lamp
      const b = bodyAt(s, 0.35);
      k.box('matte', C.black, 0.5, 0.03, 0.18, 0, b.yt + 0.02, 0.35);
      const geo = new THREE.BoxGeometry(0.56, 0.17, 0.2).translate(0, b.yt + 0.12, 0.35);
      const side = cached('taxiSide', () => new THREE.MeshStandardMaterial({ color: '#f5f5f2', roughness: 0.5, emissive: '#fffbe8', emissiveIntensity: 0.15 }));
      const face = signMat('bluebird', 'BLUEBIRD', '#f6f6f2', '#1565c0', 512, 150);
      signs.push({ geo, mat: () => cached('taxiArr', () => [side, side, side, side, face, face] as unknown as THREE.Material) });
      for (const sx of [-1, 1]) signs.push({ geo: new THREE.PlaneGeometry(0.62, 0.14).rotateY(sx * Math.PI / 2).translate(sx * (bodyAt(s, 0.75).hw + 0.004), 0.68, 0.75), mat: () => signMat('taxidoor', 'TAXI  1500 111', '#3d9be0', '#ffffff', 512, 110) });
    }
    if (kind === 'angkot') {
      // "M 01" route placard on the roof front + side route board; open doorway step & bench
      const b = bodyAt(s, -1.65);
      k.box('matte', C.black, 0.6, 0.04, 0.12, 0, b.yt + 0.02, -1.65);
      signs.push({ geo: new THREE.BoxGeometry(0.7, 0.22, 0.06).translate(0, b.yt + 0.15, -1.65), mat: () => signMat('m01', 'M01', '#ffffff', '#0d47a1', 256, 90) });
      signs.push({ geo: new THREE.PlaneGeometry(1.1, 0.16).rotateY(-Math.PI / 2).translate(-(bodyAt(s, 0.9).hw + 0.006), 1.75, 0.9), mat: () => signMat('m01side', 'M01  SENEN - KP. MELAYU', '#ffffff', '#0d47a1', 768, 110) });
      k.box('matte', '#5b4636', 0.12, 0.42, 2.2, 0.62, 0.62, 0.9); // bench (right)
      k.box('matte', '#5b4636', 0.12, 0.42, 1.0, -0.62, 0.62, 1.35); // bench (left, behind door)
      k.box('matte', C.trim, 0.25, 0.04, 0.75, -0.72, 0.4, -0.62); // step
      k.box('matte', C.black, 1.5, 0.04, 0.6, 0, 1.97, 0.6); // roof vent
    }
    t = { geos: k.build(), wheels, len: s.L, plates: { geo: plateGeo(pl), kind: kind === 'taxi' || kind === 'angkot' ? 'yellow' : 'black' }, signs };
  }
  templates.set(kind, t); return t;
}

export type CarKind = 'mpv' | 'sedan' | 'hatch' | 'taxi' | 'angkot' | 'bus';
export const CAR_PAINTS = ['#f2f2f2', '#1c1c1c', '#9aa3aa', '#b71c1c', '#1e3a8a', '#e5e7eb', '#334155', '#7c838a', '#0f766e', '#d9d4c7'];
export function makeCar(kind: CarKind, color?: string) {
  const t = carTemplate(kind);
  const col = kind === 'taxi' ? '#3d9be0' : kind === 'angkot' ? '#4bb0e6' : kind === 'bus' ? '#1d5fbf' : (color ?? pickR(CAR_PAINTS));
  const g = instance(t, paintMat(col), `VEH_${kind.toUpperCase()}`);
  g.userData.kind = kind; return g;
}
/** generic private car: Jakarta mix (MPVs dominate) */
export function randomCarKind(): 'mpv' | 'sedan' | 'hatch' { const r = rnd(); return r < 0.5 ? 'mpv' : r < 0.78 ? 'hatch' : 'sedan'; }

// ================================================================= MOTORBIKES
// Honda BeAT / Vario style matic scooter: 1.86 x 0.68 x 1.08 m, seat 0.74 m, WB 1.256, 14" wheels.
const ZF = -0.63, ZR = 0.63, RF = 0.25, RR = 0.255;
/** scooter geometry; k = body, s = steering assembly (bars, cover, mirrors, fork, front fender). Traffic bikes pass the same kit twice. */
function scooterParts(k: Kit, s: Kit) {
  const P = 'paint', W = '#ffffff';
  const rearTaper = (z: number) => 1 - 0.38 * THREE.MathUtils.smoothstep(z, 0.35, 0.98);
  // front fender hugging the front wheel
  const arc = (r: number, a0: number, a1: number, n = 8): V2[] => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [ZF - Math.cos(a) * r, RF + Math.sin(a) * r]; });
  s.prof(P, W, [...arc(0.305, 0.45, 1.95), ...arc(0.275, 1.95, 0.45)], 0.13, 0, 0.012);
  // front apron / leg shield (body colour) with V headlight
  const apronTaper = (z: number, y: number) => 1 - 0.25 * THREE.MathUtils.smoothstep(y, 0.75, 1.0) - 0.2 * THREE.MathUtils.smoothstep(-z, 0.5, 0.64);
  k.prof(P, W, [[-0.5, 0.42], [-0.585, 0.6], [-0.615, 0.78], [-0.595, 0.93], [-0.5, 0.99], [-0.41, 0.97], [-0.375, 0.72], [-0.345, 0.44], [-0.4, 0.36]], 0.38, 0, 0.03, apronTaper);
  k.prof('matte', C.trim, [[-0.405, 0.94], [-0.37, 0.72], [-0.34, 0.44], [-0.32, 0.44], [-0.35, 0.72], [-0.385, 0.94]], 0.33, 0, 0.01); // inner cover
  k.prof('lamp', C.lampF, [[-0.618, 0.74], [-0.64, 0.82], [-0.618, 0.9], [-0.6, 0.9], [-0.62, 0.82], [-0.598, 0.74]], 0.2, 0, 0.006, (z, y) => 1 - 0.45 * THREE.MathUtils.smoothstep(0.9 - y, 0, 0.16));
  for (const sx of [-1, 1]) k.box('lamp', C.amber, 0.05, 0.03, 0.04, sx * 0.13, 0.9, -0.6, 0, 0, sx * 0.3);
  k.box('matte', C.black, 0.12, 0.05, 0.03, 0, 0.62, -0.598, -0.25); // horn grille
  // handlebar cover, meter, bars, grips, levers, mirrors
  s.prof(P, W, [[-0.56, 0.97], [-0.52, 1.05], [-0.42, 1.08], [-0.35, 1.05], [-0.36, 0.98], [-0.45, 0.95]], 0.44, 0, 0.025, (z, y) => 1 - 0.3 * THREE.MathUtils.smoothstep(-z, 0.4, 0.56));
  s.box('matte', '#0d1418', 0.18, 0.012, 0.1, 0, 1.083, -0.43, -0.3);
  s.cyl('metal', C.chrome, 0.011, 0.6, 0, 1.0, -0.4, 'x', 6);
  for (const sx of [-1, 1]) {
    s.cyl('matte', C.rubber, 0.019, 0.12, sx * 0.29, 1.0, -0.4, 'x', 8);
    s.seg('matte', C.alu, [sx * 0.2, 1.01, -0.43], [sx * 0.31, 1.02, -0.47], 0.008, 4, 1, 1, false); // brake lever
    s.seg('matte', C.black, [sx * 0.19, 1.05, -0.46], [sx * 0.26, 1.24, -0.49], 0.009, 4, 1, 1, false); // mirror stalk
    s.sphere('matte', C.black, 0.06, sx * 0.28, 1.27, -0.49, 1.3, 0.75, 0.3, 8, 5);
    s.box('glass', W, 0.13, 0.07, 0.008, sx * 0.28, 1.27, -0.468);
  }
  // fork + front disc & caliper
  for (const sx of [-1, 1]) k.seg('metal', C.alu, [sx * 0.072, RF, ZF], [sx * 0.065, 0.72, -0.52], 0.02, 6, 1, 1, false);
  s.cyl('metal', '#c9ced3', 0.11, 0.006, -0.06, RF, ZF, 'x', 14);
  s.box('matte', C.darkGrey, 0.03, 0.08, 0.06, -0.075, RF + 0.08, ZF + 0.07, 0.6);
  // floorboard with rubber mat, side skirts
  k.prof('matte', C.rubber, [[-0.36, 0.33], [0.03, 0.33], [0.03, 0.36], [-0.36, 0.36]], 0.3, 0, 0.005);
  k.prof(P, W, [[-0.36, 0.24], [0.06, 0.22], [0.1, 0.33], [-0.39, 0.335]], 0.29, 0, 0.012);
  // rear body under the seat, tapering to the tail
  k.prof(P, W, [[0.04, 0.3], [-0.02, 0.45], [-0.09, 0.62], [0.1, 0.705], [0.6, 0.735], [0.84, 0.79], [0.925, 0.745], [0.89, 0.62], [0.7, 0.52], [0.36, 0.44], [0.14, 0.3]], 0.31, 0, 0.035, z => rearTaper(z));
  k.prof('matte', C.trim, [[0.2, 0.47], [0.62, 0.53], [0.66, 0.6], [0.24, 0.55]], 0.326, 0, 0.004, z => rearTaper(z)); // side vent strip
  // seat (stepped for the pillion)
  k.prof('matte', C.seat, [[-0.1, 0.7], [-0.125, 0.74], [-0.06, 0.765], [0.24, 0.768], [0.36, 0.792], [0.66, 0.805], [0.73, 0.785], [0.71, 0.735], [0.1, 0.705]], 0.28, 0, 0.03, z => rearTaper(z));
  // tail light + rear grab rail
  k.prof('lamp', C.lampR, [[0.83, 0.812], [0.978, 0.752], [0.955, 0.672], [0.915, 0.68], [0.935, 0.745], [0.82, 0.795]], 0.2, 0, 0.01, z => rearTaper(z));
  for (const sx of [-1, 1]) { k.seg('matte', C.black, [sx * 0.135, 0.79, 0.5], [sx * 0.11, 0.81, 0.82], 0.014, 5); k.box('lamp', C.amber, 0.03, 0.025, 0.04, sx * 0.1, 0.72, 0.93); }
  k.seg('matte', C.black, [-0.11, 0.81, 0.82], [0.11, 0.81, 0.82], 0.014, 5);
  // rear mudguard / plate holder
  k.prof('matte', C.black, [[0.88, 0.63], [0.975, 0.56], [0.99, 0.42], [0.96, 0.42], [0.945, 0.55], [0.86, 0.6]], 0.15, 0, 0.008);
  k.prof('matte', C.black, [[0.45, 0.5], [0.75, 0.52], [0.85, 0.42], [0.82, 0.38], [0.68, 0.45], [0.45, 0.45]], 0.12, 0, 0.006); // inner fender
  // CVT / engine unit on the left, air filter, rear shock
  k.prof('matte', '#4b5157', [[0.04, 0.27], [0.1, 0.39], [0.58, 0.36], [0.69, 0.29], [0.65, 0.18], [0.16, 0.2]], 0.09, -0.115, 0.02);
  k.prof('matte', C.darkGrey, [[0.15, 0.41], [0.2, 0.47], [0.5, 0.45], [0.52, 0.38]], 0.09, -0.12, 0.01);
  k.seg('metal', C.alu, [-0.135, 0.3, 0.62], [-0.135, 0.6, 0.5], 0.022, 6);
  k.cyl('matte', C.darkGrey, 0.07, 0.12, 0.0, 0.26, 0.15, 'x', 10); // crankcase
  // muffler on the right with heat shield
  k.seg('matte', C.darkGrey, [0.04, 0.22, 0.17], [0.15, 0.28, 0.4], 0.02, 6);
  k.seg('matte', '#2a2d31', [0.155, 0.31, 0.38], [0.155, 0.345, 0.84], 0.055, 10, 1, 1);
  k.prof('metal', C.chrome, [[0.42, 0.33], [0.42, 0.39], [0.76, 0.41], [0.8, 0.36], [0.76, 0.32]], 0.012, 0.212, 0.004);
  k.cyl('metal', C.chrome, 0.02, 0.06, 0.16, 0.345, 0.88, 'z', 8);
  // pillion footpegs (folded out), centre stand
  for (const sx of [-1, 1]) k.box('matte', C.black, 0.07, 0.025, 0.045, sx * 0.2, 0.4, 0.25);
  k.seg('matte', C.black, [-0.1, 0.18, 0.25], [0.1, 0.18, 0.25], 0.015, 5, 1, 1, false);
  // plates (Indonesian bike plate ~25 x 10.5 cm): front on the apron bottom, rear on the holder
}
const scooterPlates = () => plateGeo([[0.24, 0.085, 0, 0.5, -0.565, -1, 0.35], [0.25, 0.088, 0, 0.485, 0.995, 1, -0.2]]);
function scooterTemplate(): Template {
  let t = templates.get('scooter'); if (t) return t;
  const k = new Kit(); scooterParts(k, k);
  const plates = scooterPlates();
  t = {
    geos: k.build(), len: 1.86, plates: { geo: plates, kind: 'black' },
    wheels: [{ r: RF, w: 0.085, style: 'moto', x: 0, y: RF, z: ZF, front: true }, { r: RR, w: 0.095, style: 'moto', x: 0, y: RR, z: ZR }],
  };
  templates.set('scooter', t); return t;
}

// ---------------------------------------------------------------- riders
interface Outfit { jacket: string; helmet: string; pants: string; skin: string; shoes: string; ojol?: boolean }
const JACKETS = ['#2d3436', '#1e3a5f', '#5b2333', '#3c6382', '#6b6f73', '#8e2a2a', '#25594b', '#3d3b6e', '#1d1d1f', '#7a5c3a'];
const HELMETS = ['#141414', '#f2f3f5', '#b3202a', '#22313f', '#d9a520', '#2e5fa8', '#5f6a72'];
const PANTS = ['#2a3038', '#323843', '#1d232a', '#3e536e', '#4a4239'];
const SKINS = ['#a8704b', '#bf875f', '#8b5a3a', '#c99a72'];
const OJOL_GREEN = '#00a651';
const OUTFITS: Outfit[] = [];
for (let i = 0; i < 12; i++) OUTFITS.push({ jacket: JACKETS[i % JACKETS.length], helmet: HELMETS[(i * 3) % HELMETS.length], pants: PANTS[(i * 2) % PANTS.length], skin: SKINS[i % SKINS.length], shoes: i % 3 ? '#1b1b1b' : '#e8e8e8' });
OUTFITS.push({ jacket: OJOL_GREEN, helmet: OJOL_GREEN, pants: '#22272e', skin: SKINS[1], shoes: '#1b1b1b', ojol: true }, { jacket: OJOL_GREEN, helmet: OJOL_GREEN, pants: '#2f3640', skin: SKINS[2], shoes: '#1b1b1b', ojol: true });

/** two-bone IK: middle joint for chain a -> c with lengths l1,l2, bending toward `pole` */
function ik(a: V3, c: V3, l1: number, l2: number, pole: V3): V3 {
  const A = v3(a), Cc = v3(c), d = Cc.clone().sub(A); const D = Math.min(d.length(), l1 + l2 - 1e-3); const dir = d.normalize();
  const x = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = v3(pole).normalize(); p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  const m = A.add(dir.multiplyScalar(x)).add(p.multiplyScalar(h)); return [m.x, m.y, m.z];
}
interface Pose { hip: V3; lean: number; ankle: V3; toe: V3; kneePole: V3; wrist: V3; hand: V3; elbowPole: V3; headFwd?: number }
const DRIVER: Pose = { hip: [0, 0.84, 0.1], lean: 0.24, ankle: [0.13, 0.455, -0.17], toe: [0.14, 0.395, -0.31], kneePole: [0.35, 0.4, -1], wrist: [0.275, 1.03, -0.345], hand: [0.29, 1.0, -0.405], elbowPole: [1, -0.7, 0.5] };
const PILLION: Pose = { hip: [0, 0.885, 0.44], lean: 0.02, ankle: [0.205, 0.465, 0.24], toe: [0.215, 0.42, 0.12], kneePole: [0.7, 0.5, -1], wrist: [0.18, 0.955, 0.25], hand: [0.19, 0.925, 0.17], elbowPole: [1, -0.4, 0.6] };

const riderCache = new Map<string, THREE.BufferGeometry>();
function riderGeo(pose: Pose, o: Outfit, key: string) {
  let g = riderCache.get(key); if (g) return g;
  const k = new Kit(); const Mt: Cls = 'matte';
  const [hx, hy, hz] = pose.hip;
  const sh: V3 = [hx, hy + 0.48 * Math.cos(pose.lean), hz - 0.48 * Math.sin(pose.lean)];
  // pelvis + torso (jacket), collar, neck, head, helmet with visor
  k.sphere(Mt, o.pants, 0.13, hx, hy, hz + 0.01, 1.15, 0.75, 1.0, 10, 6);
  k.seg(Mt, o.jacket, [hx, hy + 0.06, hz], [sh[0], sh[1] - 0.05, sh[2]], 0.14, 10, 1.25, 0.8);
  if (o.ojol) { // reflective band + logo panel on the back
    const bz = (hz + sh[2]) / 2 + 0.115, by = (hy + sh[1]) / 2 + 0.03;
    k.box(Mt, '#d7e3df', 0.3, 0.035, 0.02, hx, by - 0.08, bz + 0.005, -pose.lean);
    k.box(Mt, '#ffffff', 0.16, 0.08, 0.02, hx, by + 0.06, bz - 0.01, -pose.lean);
  }
  const neckTop: V3 = [sh[0], sh[1] + 0.12, sh[2] - 0.03];
  k.seg(Mt, o.skin, [sh[0], sh[1] - 0.02, sh[2]], neckTop, 0.045, 6);
  const hc: V3 = [sh[0], sh[1] + 0.2, sh[2] - 0.045];
  k.sphere(Mt, o.skin, 0.093, hc[0], hc[1], hc[2], 1, 1.13, 1.06, 10, 7);
  const hm: V3 = [hc[0], hc[1] + 0.03, hc[2] + 0.012];
  k.sphere(Mt, o.helmet, 0.138, hm[0], hm[1], hm[2], 1, 0.98, 1.1, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
  // SNI half-face: sides/back shell down to the jaw, face open; smoked visor over the opening; brow trim
  k.sphere(Mt, o.helmet, 0.138, hm[0], hm[1], hm[2], 1, 0.98, 1.1, 10, 3, Math.PI * 1.5 + 0.8, Math.PI * 2 - 1.6, Math.PI * 0.42, Math.PI * 0.3);
  k.sphere(Mt, '#34414b', 0.146, hm[0], hm[1], hm[2], 1, 0.98, 1.1, 8, 3, Math.PI * 1.5 - 0.85, 1.7, Math.PI * 0.4, Math.PI * 0.31);
  k.sphere(Mt, C.black, 0.144, hm[0], hm[1], hm[2], 1, 0.98, 1.1, 8, 1, Math.PI * 1.5 - 0.9, 1.8, Math.PI * 0.38, Math.PI * 0.04);
  for (const s of [-1, 1]) {
    const hip: V3 = [hx + s * 0.1, hy - 0.01, hz];
    const ank: V3 = [s * pose.ankle[0], pose.ankle[1], pose.ankle[2]];
    const knee = ik(hip, ank, 0.43, 0.42, [s * pose.kneePole[0], pose.kneePole[1], pose.kneePole[2]]);
    k.seg(Mt, o.pants, hip, knee, 0.072, 7);
    k.seg(Mt, o.pants, knee, ank, 0.054, 6);
    k.seg(Mt, o.shoes, [ank[0], ank[1] - 0.03, ank[2] + 0.03], [s * pose.toe[0], pose.toe[1], pose.toe[2]], 0.045, 6, 1.05, 1);
    const shoulder: V3 = [sh[0] + s * 0.175, sh[1] - 0.03, sh[2]];
    const wr: V3 = [s * pose.wrist[0], pose.wrist[1], pose.wrist[2]];
    const elbow = ik(shoulder, wr, 0.29, 0.27, [s * pose.elbowPole[0], pose.elbowPole[1], pose.elbowPole[2]]);
    k.sphere(Mt, o.jacket, 0.065, shoulder[0], shoulder[1], shoulder[2], 1, 1, 1, 7, 4);
    k.seg(Mt, o.jacket, shoulder, elbow, 0.053, 6);
    k.seg(Mt, o.jacket, elbow, wr, 0.045, 6);
    k.seg(Mt, pose === DRIVER ? '#2a2a2a' : o.skin, wr, [s * pose.hand[0], pose.hand[1], pose.hand[2]], 0.037, 6, 1, 1.25); // glove / hand
  }
  g = k.build().matte!; riderCache.set(key, g); return g;
}

export interface MotorOpts { rider?: boolean; pillion?: boolean | number; ojol?: boolean | number; color?: string }
export const MOTOR_PAINTS = ['#111214', '#f1f1ef', '#b3121b', '#1f3f8a', '#6c7176', '#2b2b2b', '#e8e6e0', '#8a1c22', '#0f5c7a'];
/** matic scooter; rider/pillion optional. pillion/ojol may be probabilities (0..1). */
export function makeMotor(opts: MotorOpts = {}) {
  const t = scooterTemplate();
  const g = instance(t, paintMat(opts.color ?? pickR(MOTOR_PAINTS), 'moto'), 'VEH_MOTOR');
  g.userData.kind = 'motor';
  if (opts.rider) {
    const ojol = typeof opts.ojol === 'number' ? rnd() < opts.ojol : !!opts.ojol;
    const oi = ojol ? 12 + Math.floor(rnd() * 2) : Math.floor(rnd() * 12);
    const rm = new THREE.Mesh(riderGeo(DRIVER, OUTFITS[oi], `d${oi}`), clsMat('matte')); rm.name = 'PENGENDARA'; rm.castShadow = true; g.add(rm);
    const pil = typeof opts.pillion === 'number' ? rnd() < opts.pillion : !!opts.pillion;
    if (pil) { const pi = Math.floor(rnd() * 12); const pm = new THREE.Mesh(riderGeo(PILLION, OUTFITS[(pi + 5) % 12], `p${pi}`), clsMat('matte')); pm.name = 'PEMBONCENG'; pm.castShadow = true; g.add(pm); }
  }
  return g;
}

// ================================================================= RIDEABLE SCOOTER ("Motor Matic")
// Same 1:1 matic scooter as traffic (length 1.86 m, wheelbase 1.26 m, seat 0.74-0.80 m), but split so the
// steering assembly (bars, cover, mirrors, fork, front fender, front wheel) turns about the head axis, plus a
// side stand and a brake-light overlay. Hierarchy: root (ground point, yaw) > lean (roll/pitch about the
// contact line) > body meshes, steer (pivot on the head axis) > front wheel; rear wheel; stand; brake lamp.
export const MOTOR_STEER_PIVOT = new THREE.Vector3(0, 0.72, -0.52);
export const MOTOR_STEER_AXIS = new THREE.Vector3(0, 0.47, 0.11).normalize();
export const MOTOR_GRIPS: [V3, V3] = [[-0.29, 1.0, -0.4], [0.29, 1.0, -0.4]];
export const MOTOR_WHEELBASE = ZR - ZF, MOTOR_RF = RF, MOTOR_RR = RR, MOTOR_ZF = ZF, MOTOR_ZR = ZR;
interface RideTemplate { body: Partial<Record<Cls, THREE.BufferGeometry>>; steer: Partial<Record<Cls, THREE.BufferGeometry>>; plates: THREE.BufferGeometry; stand: THREE.BufferGeometry; brake: THREE.BufferGeometry }
let rideT: RideTemplate | null = null;
function rideTemplate(): RideTemplate {
  if (rideT) return rideT;
  const k = new Kit(), s = new Kit(); scooterParts(k, s);
  const steer = s.build(); for (const g of Object.values(steer)) g!.translate(-MOTOR_STEER_PIVOT.x, -MOTOR_STEER_PIVOT.y, -MOTOR_STEER_PIVOT.z);
  const st = new Kit(); // side stand on the left, folded down to the ground (stand-mounted parking lean ~5°)
  st.seg('matte', C.black, [-0.1, 0.24, 0.06], [-0.27, 0.025, -0.02], 0.014, 6, 1, 1, false);
  st.box('matte', C.black, 0.06, 0.012, 0.035, -0.275, 0.012, -0.025);
  const br = new Kit(); // brake light glow (shown while braking)
  br.prof('lamp', '#ff2a2a', [[0.835, 0.815], [0.985, 0.754], [0.962, 0.668], [0.92, 0.676], [0.94, 0.743], [0.825, 0.798]], 0.205, 0, 0.012, z => 1 - 0.38 * THREE.MathUtils.smoothstep(z, 0.35, 0.98));
  rideT = { body: k.build(), steer, plates: scooterPlates(), stand: st.build().matte!, brake: br.build().lamp! };
  return rideT;
}
export interface RideMotor { root: THREE.Group; lean: THREE.Group; steer: THREE.Group; wheelF: THREE.Mesh; wheelR: THREE.Mesh; stand: THREE.Mesh; brake: THREE.Mesh }
export function makeRideableMotor(color: string, name: string): RideMotor {
  const t = rideTemplate(); const paint = paintMat(color, 'moto');
  const root = new THREE.Group(); root.name = name; root.userData.kind = 'motor_ride';
  const lean = new THREE.Group(); lean.name = `${name}_LEAN`; root.add(lean);
  const mk = (geos: Partial<Record<Cls, THREE.BufferGeometry>>, parent: THREE.Object3D, tag: string) => {
    for (const cls of Object.keys(geos) as Cls[]) { const m = new THREE.Mesh(geos[cls]!, cls === 'paint' ? paint : clsMat(cls)); m.name = `${name}_${tag}_${cls}`; m.castShadow = cls !== 'lamp'; m.receiveShadow = cls === 'paint' || cls === 'matte'; parent.add(m); }
  };
  mk(t.body, lean, 'BODI');
  const steer = new THREE.Group(); steer.name = `${name}_SETANG`; steer.position.copy(MOTOR_STEER_PIVOT); lean.add(steer);
  mk(t.steer, steer, 'SETANG');
  const plate = new THREE.Mesh(t.plates, plateMat('black')); plate.name = `${name}_PLAT`; lean.add(plate);
  const wheelF = new THREE.Mesh(wheelGeo(RF, 0.085, 'moto'), wheelMat()); wheelF.name = `${name}_RODA_DEPAN`; wheelF.castShadow = true; wheelF.userData.r = RF;
  wheelF.position.set(0, RF, ZF).sub(MOTOR_STEER_PIVOT); steer.add(wheelF);
  const wheelR = new THREE.Mesh(wheelGeo(RR, 0.095, 'moto'), wheelMat()); wheelR.name = `${name}_RODA_BELAKANG`; wheelR.castShadow = true; wheelR.userData.r = RR;
  wheelR.position.set(0, RR, ZR); lean.add(wheelR);
  const stand = new THREE.Mesh(t.stand, clsMat('matte')); stand.name = `${name}_STANDAR`; stand.castShadow = true; lean.add(stand);
  const brake = new THREE.Mesh(t.brake, clsMat('lamp')); brake.name = `${name}_LAMPU_REM`; brake.visible = false; lean.add(brake);
  root.traverse(o => { (o as THREE.Mesh).frustumCulled = true; });
  return { root, lean, steer, wheelF, wheelR, stand, brake };
}
