// "Tinggi"/"Sedang" detail layer: extra geometry on the assets that already exist (no new buildings).
//  - facades: floor ledges / spandrel bands, window sills, outdoor AC units with drain pipes, rooftop clutter
//  - streets: manhole covers, curb drain grates, asphalt patches, storm-drain channel (selokan) along gang edges
//  - office interior (L1-L3): desk clutter (mugs, paper stacks, pen cups, plants, cable drops), bins, ceiling AC cassettes, posters
// Everything is InstancedMesh (one draw call per kind) under groups tagged userData.hd = true; GfxTier shows them on Tinggi/Sedang.
import * as THREE from 'three';
import { ROADS, ROAD_SPEC, JUNCTIONS, wx, wz } from '../data/city';

let s = 7351;
const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

class Inst {
  mats: THREE.Matrix4[] = []; cols: THREE.Color[] = [];
  constructor(public name: string, public geo: THREE.BufferGeometry, public mat: THREE.Material, public shadow = false) {}
  add(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, col?: THREE.ColorRepresentation) {
    this.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz)));
    if (col !== undefined) this.cols.push(new THREE.Color(col));
  }
  build(parent: THREE.Object3D, inv?: THREE.Matrix4) {
    if (!this.mats.length) return;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.mats.length); im.name = this.name;
    this.mats.forEach((m, i) => im.setMatrixAt(i, inv ? m.clone().premultiply(inv) : m));
    if (this.cols.length === this.mats.length) this.cols.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = this.shadow; im.receiveShadow = true; im.computeBoundingSphere(); parent.add(im);
  }
}
const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const boxG = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);

// ---------------------------------------------------------------- facades
function facades(world: THREE.Object3D, out: THREE.Group) {
  const ledge = new Inst('HD_FACADE_LEDGE', new THREE.BoxGeometry(1, 1, 1), std('#d9d7d0', { roughness: 0.85 }), true);
  const fin = new Inst('HD_FACADE_FIN', new THREE.BoxGeometry(1, 1, 1), std('#9aa3aa', { metalness: 0.5, roughness: 0.4 }), true);
  const sill = new Inst('HD_FACADE_SILL', new THREE.BoxGeometry(1, 1, 1), std('#ecebe6'));
  const acGeo = boxG(0.8, 0.55, 0.3);
  const ac = new Inst('HD_AC_OUTDOOR', acGeo, std('#ececea', { roughness: 0.5 }), true);
  const fan = new Inst('HD_AC_FAN', new THREE.CylinderGeometry(0.19, 0.19, 0.02, 14).rotateX(Math.PI / 2), std('#3c4146', { roughness: 0.6 }));
  const pipe = new Inst('HD_AC_PIPE', new THREE.CylinderGeometry(0.02, 0.02, 1, 5).translate(0, -0.5, 0), std('#f2f2f2'));
  const tank = new Inst('HD_ROOF_TANK', new THREE.CylinderGeometry(0.7, 0.7, 1.6, 14).translate(0, 0.8, 0), std('#ffffff', { roughness: 0.5 }), true);
  const cond = new Inst('HD_ROOF_CONDENSER', boxG(1.2, 0.9, 1.0), std('#c9ccce', { metalness: 0.3, roughness: 0.5 }), true);
  const grill = new Inst('HD_ROOF_CONDENSER_FAN', new THREE.CylinderGeometry(0.38, 0.38, 0.03, 16), std('#2d3134'));
  const mast = new Inst('HD_ROOF_ANTENNA', new THREE.CylinderGeometry(0.03, 0.05, 1, 6).translate(0, 0.5, 0), std('#8d9399', { metalness: 0.7, roughness: 0.3 }), true);
  const dish = new Inst('HD_ROOF_DISH', new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-Math.PI / 2.6), std('#e8e8e8', { side: THREE.DoubleSide }));
  const solar = new Inst('HD_ROOF_SOLAR', new THREE.BoxGeometry(1.0, 0.04, 1.65).rotateX(-0.3), std('#1d2b44', { metalness: 0.6, roughness: 0.25 }), true);
  const bb = new THREE.Box3(), sz = new THREE.Vector3();
  const masses: THREE.Mesh[] = [];
  world.traverse(o => { if ((o as THREE.Mesh).isMesh && /_(MASS|MAIN)$/.test(o.name) && !/HOTEL/.test(o.name)) masses.push(o as THREE.Mesh); });
  world.updateMatrixWorld(true);
  for (const m of masses) {
    bb.setFromObject(m); bb.getSize(sz); if (sz.y < 3 || sz.x < 3 || sz.z < 3) continue;
    const { min, max } = bb, cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
    const tower = sz.y > 30, apt = /APT/.test(m.name) || (!tower && sz.y > 14), shop = !tower && !apt;
    const fh = tower ? 4 : apt ? 3 : 3.5;
    const sides: { ax: 'x' | 'z'; c: number; n: number; a: number; b: number }[] = [
      { ax: 'z', c: min.z, n: -1, a: min.x, b: max.x }, { ax: 'z', c: max.z, n: 1, a: min.x, b: max.x },
      { ax: 'x', c: min.x, n: -1, a: min.z, b: max.z }, { ax: 'x', c: max.x, n: 1, a: min.z, b: max.z },
    ];
    // floor ledges (towers: slim aluminium spandrel bands + vertical fins)
    for (let y = fh; y < sz.y - 0.5; y += fh) {
      for (const sd of sides) {
        const len = sd.b - sd.a + 0.24, mid = (sd.a + sd.b) / 2, dep = tower ? 0.08 : 0.16, hh = tower ? 0.18 : 0.14;
        (tower ? fin : ledge).add(sd.ax === 'z' ? mid : sd.c + sd.n * dep / 2, min.y + y, sd.ax === 'z' ? sd.c + sd.n * dep / 2 : mid, 0, sd.ax === 'z' ? len : dep, hh, sd.ax === 'z' ? dep : len);
      }
    }
    if (tower) for (const sd of sides) for (let t = sd.a + 3; t < sd.b - 1; t += 3)
      fin.add(sd.ax === 'z' ? t : sd.c + sd.n * 0.12, min.y + (sz.y > 40 ? 8 : 0), sd.ax === 'z' ? sd.c + sd.n * 0.12 : t, 0, sd.ax === 'z' ? 0.08 : 0.24, sz.y - (sz.y > 40 ? 8 : 0), sd.ax === 'z' ? 0.24 : 0.08);
    // window sills + split-AC outdoor units on apartments and shop-houses
    if (!tower) for (const sd of sides) {
      const bay = shop ? 5 : 3.5;
      for (let t = sd.a + bay / 2; t < sd.b; t += bay) for (let y = fh; y < sz.y - 1; y += fh) {
        const yy = min.y + y + (shop ? 1.0 : 0.9);
        const px = (o: number) => sd.ax === 'z' ? t : sd.c + sd.n * o, pz = (o: number) => sd.ax === 'z' ? sd.c + sd.n * o : t;
        const rot = sd.ax === 'z' ? (sd.n > 0 ? 0 : Math.PI) : (sd.n > 0 ? Math.PI / 2 : -Math.PI / 2);
        sill.add(px(0.1), yy - 0.08, pz(0.1), 0, sd.ax === 'z' ? 1.6 : 0.2, 0.06, sd.ax === 'z' ? 0.2 : 1.6);
        if (rnd() < (shop ? 0.5 : 0.38)) {
          const off = (rnd() < 0.5 ? -1 : 1) * 1.15;
          const ax = sd.ax === 'z' ? t + off : sd.c + sd.n * 0.2, az = sd.ax === 'z' ? sd.c + sd.n * 0.2 : t + off;
          ac.add(ax, yy - 0.75, az, rot);
          fan.add(ax + (sd.ax === 'x' ? sd.n * 0.16 : 0), yy - 0.47, az + (sd.ax === 'z' ? sd.n * 0.16 : 0), rot);
          pipe.add(ax + (sd.ax === 'z' ? 0.3 : 0), yy - 0.2, az + (sd.ax === 'x' ? 0.3 : 0), 0, 1, 0.6 + rnd() * 0.6);
        }
      }
    }
    // rooftop clutter
    const top = max.y + (tower ? 1.0 : 0), inX = (f: number) => min.x + 1 + (sz.x - 2) * f, inZ = (f: number) => min.z + 1 + (sz.z - 2) * f;
    const nCond = tower ? 4 + Math.floor(rnd() * 4) : apt ? 2 : rnd() < 0.5 ? 1 : 0;
    for (let i = 0; i < nCond; i++) { const x = inX(0.15 + rnd() * 0.7), z = inZ(0.15 + rnd() * 0.7); cond.add(x, top, z, Math.floor(rnd() * 4) * Math.PI / 2); grill.add(x, top + 0.92, z); }
    if (!tower && rnd() < 0.7) tank.add(inX(0.8), top, inZ(0.2), 0, 1, 1, 1);
    if (rnd() < (shop ? 0.6 : 0.4)) { mast.add(inX(0.1), top, inZ(0.85), 0, 1, 3 + rnd() * 4, 1); }
    if (rnd() < 0.5) dish.add(inX(0.3), top + 0.5, inZ(0.9), rnd() * 6);
    if (!tower && sz.x > 6 && rnd() < 0.45) for (let i = 0; i < 3; i++) solar.add(inX(0.25) + i * 1.1, top + 0.45, inZ(0.5), 0);
    void cx; void cz;
  }
  // shop-house fronts on Sudirman (RUKO_01-10, open when n % 3 != 0): goods shelves + display crates + plastic stools
  const shelf = new Inst('HD_SHOP_SHELF', boxG(1.2, 1.8, 0.35), std('#d7d2c8'), true);
  const goods = new Inst('HD_SHOP_GOODS', boxG(0.22, 0.22, 0.2), std('#ffffff', { roughness: 0.6 }));
  const crate = new Inst('HD_SHOP_CRATE', boxG(0.55, 0.32, 0.4), std('#ffffff', { roughness: 0.7 }), true);
  const stool = new Inst('HD_SHOP_STOOL', new THREE.CylinderGeometry(0.15, 0.18, 0.42, 10).translate(0, 0.21, 0), std('#ffffff', { roughness: 0.5 }), true);
  const GC = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#f4f4f4', '#00acc1'];
  for (let n = 1; n <= 10; n++) {
    if (n % 3 === 0) continue;
    const X = 92 + 5 * (n - 1), fz = wz(165);
    for (const sx of [X + 1.05, X + 3.05]) {
      const x = wx(sx) + 0.6; shelf.add(x, 0.15, fz - 0.25, 0);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) if (rnd() < 0.85) goods.add(x - 0.45 + k * 0.3, 0.35 + r * 0.42, fz - 0.33, 0, 1, 0.6 + rnd() * 0.7, 1, GC[Math.floor(rnd() * GC.length)]);
    }
    for (let k = 0; k < 3; k++) if (rnd() < 0.7) crate.add(wx(X + 0.9 + k * 1.3), 0.15, fz - 0.9 - rnd() * 0.3, rnd() * 0.3 - 0.15, 1, 1, 1, ['#d32f2f', '#1976d2', '#388e3c', '#fbc02d'][k % 4]);
    if (rnd() < 0.6) stool.add(wx(X + 4.3), 0.15, fz - 1.1, 0, 1, 1, 1, ['#e53935', '#1e88e5', '#43a047'][n % 3]);
  }
  for (const i of [ledge, fin, sill, ac, fan, pipe, tank, cond, grill, mast, dish, solar, shelf, goods, crate, stool]) i.build(out);
}

// ---------------------------------------------------------------- streets
function streets(out: THREE.Group) {
  const iron = std('#2a2b2c', { metalness: 0.6, roughness: 0.55 });
  const man = new Inst('HD_ROAD_MANHOLE', new THREE.CylinderGeometry(0.4, 0.4, 0.02, 20), iron);
  const ring = new Inst('HD_ROAD_MANHOLE_RING', new THREE.TorusGeometry(0.42, 0.035, 4, 24).rotateX(Math.PI / 2), std('#6b6e70', { metalness: 0.4 }));
  const grate = new Inst('HD_ROAD_GRATE', new THREE.BoxGeometry(0.42, 0.02, 0.9), iron);
  const bars = new Inst('HD_ROAD_GRATE_BAR', new THREE.BoxGeometry(0.035, 0.03, 0.82), std('#101112', { metalness: 0.5 }));
  const patch = new Inst('HD_ROAD_PATCH', new THREE.BoxGeometry(1, 0.006, 1), std('#1d1f22', { roughness: 0.95 }));
  const stain = new Inst('HD_ROAD_OILSTAIN', new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), std('#16171a', { roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false }));
  const ditch = new Inst('HD_GANG_SELOKAN', new THREE.BoxGeometry(1, 0.05, 0.35), std('#3a3d3b', { roughness: 0.9 }));
  const slab = new Inst('HD_GANG_SELOKAN_TUTUP', new THREE.BoxGeometry(0.42, 0.06, 0.5), std('#9b9a94', { roughness: 0.95 }));
  const nearJ = (x: number, z: number, p: number) => JUNCTIONS.some(([jx, jz]) => Math.abs(jx - x) < p && Math.abs(jz - z) < p);
  for (const r of ROADS) {
    const spec = ROAD_SPEC[r.kind], h = r.a[1] === r.b[1];
    const c = h ? r.a[1] : r.a[0], t0 = h ? Math.min(r.a[0], r.b[0]) : Math.min(r.a[1], r.b[1]), t1 = h ? Math.max(r.a[0], r.b[0]) : Math.max(r.a[1], r.b[1]);
    const P = (t: number, o: number) => h ? [wx(t), wz(c + o)] : [wx(c + o), wz(t)];
    const carr = spec.carriage / 2, pad = r.kind === 'gang' ? 4 : 16;
    if (r.kind === 'gang') {   // open drain along one edge with concrete covers every few metres
      for (let t = t0 + 2; t < t1 - 2; t += 1) { if (nearJ(h ? t : c, h ? c : t, 3)) continue; const [x, z] = P(t, carr + 0.18); ditch.add(x, 0.03, z, h ? 0 : Math.PI / 2, 1.0, 1, 1); if (Math.floor(t) % 4 === 0) slab.add(x, 0.05, z, h ? Math.PI / 2 : 0); }
      continue;
    }
    for (let t = t0 + 6; t < t1 - 6; t += 9) {
      const X = h ? t : c, Z = h ? c : t; if (nearJ(X, Z, pad)) continue;
      for (const side of [-1, 1]) {            // curb inlet grates both sides
        if ((Math.round(t / 9) + side) % 2) continue;
        const [x, z] = P(t, side * (carr - 0.3)); grate.add(x, 0.02, z, h ? Math.PI / 2 : 0);
        for (let b = -3; b <= 3; b++) bars.add(x + (h ? 0 : b * 0.055), 0.03, z + (h ? b * 0.055 : 0), h ? Math.PI / 2 : 0);
      }
      if (Math.round(t / 9) % 4 === 0) { const [x, z] = P(t + 3, (rnd() - 0.5) * carr); man.add(x, 0.025, z); ring.add(x, 0.025, z); }
      if (rnd() < 0.35) { const [x, z] = P(t + rnd() * 6, (rnd() - 0.5) * carr * 1.6); patch.add(x, 0.024, z, rnd() * 0.3, 1 + rnd() * 2.5, 1, 0.8 + rnd() * 1.6); }
      if (rnd() < 0.45) { const [x, z] = P(t + rnd() * 6, (rnd() < 0.5 ? -1 : 1) * spec.lane * (0.5 + (spec.lanesPerDir > 1 ? rnd() : 0))); stain.add(x, 0.026, z, 0, 0.6 + rnd(), 1, 0.4 + rnd() * 0.8); }
    }
  }
  for (const i of [man, ring, grate, bars, patch, stain, ditch, slab]) i.build(out);
}

// ---------------------------------------------------------------- office interior
function canvasPoster(text: string, sub: string, bg: string) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 360; const g = cv.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 256, 360); g.fillStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(200, 70, 90, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; text.split('\n').forEach((l, i) => g.fillText(l, 128, 170 + i * 40));
  g.font = '18px sans-serif'; g.fillText(sub, 128, 300);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function interior(hotel: THREE.Object3D) {
  hotel.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  for (const lvName of ['L1', 'L2', 'L3']) {
    const L = hotel.getObjectByName(lvName); if (!L) continue;
    const inv = L.matrixWorld.clone().invert();
    const g = new THREE.Group(); g.name = `HD_${lvName}_INTERIOR`; g.userData.hd = true; L.add(g);
    const mug = new Inst('HD_MUG', new THREE.CylinderGeometry(0.042, 0.038, 0.1, 12).translate(0, 0.05, 0), std('#ffffff', { roughness: 0.35 }));
    const paper = new Inst('HD_PAPER_STACK', boxG(0.23, 0.035, 0.31), std('#f4f3ee', { roughness: 0.95 }));
    const folder = new Inst('HD_FOLDER', boxG(0.25, 0.03, 0.33), std('#ffffff'));
    const pens = new Inst('HD_PEN_CUP', new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10).translate(0, 0.05, 0), std('#30353a'));
    const pot = new Inst('HD_DESK_PLANT_POT', new THREE.CylinderGeometry(0.06, 0.045, 0.09, 10).translate(0, 0.045, 0), std('#c96f43'));
    const leaf = new Inst('HD_DESK_PLANT', new THREE.IcosahedronGeometry(0.09, 0).translate(0, 0.16, 0), std('#3f8f45', { flatShading: true }));
    const cable = new Inst('HD_CABLE_DROP', new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, 0), std('#141516'));
    const bin = new Inst('HD_BIN', new THREE.CylinderGeometry(0.13, 0.11, 0.32, 12, 1, true).translate(0, 0.16, 0), std('#5f6870', { side: THREE.DoubleSide }));
    const desks: THREE.Object3D[] = [];
    L.traverse(o => { if (/^PROP_L\d_(DESK|WS_DESK)_\d+$/.test(o.name) || /^PROP_L1_.*DESK/.test(o.name)) desks.push(o); });
    for (const d of desks) {
      bb.setFromObject(d); if (bb.isEmpty()) continue;
      const top = bb.max.y, w = bb.max.x - bb.min.x, dp = bb.max.z - bb.min.z; if (w < 0.6 || dp < 0.4) continue;
      const along = w >= dp, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const end = (f: number, o = 0) => along ? [cx + (w / 2 - f), cz + o] : [cx + o, cz + (dp / 2 - f)];
      const [mx, mz] = end(0.17, 0.12); mug.add(mx, top, mz, 0, 1, 1, 1);
      const [px, pz] = end(w > 2 ? 0.5 : 0.3, -0.12); if (rnd() < 0.8) { paper.add(px, top, pz, rnd() * 0.4 - 0.2, 1, 0.6 + rnd() * 1.2, 1); if (rnd() < 0.5) folder.add(px + 0.02, top + 0.05, pz, rnd() * 0.5, 1, 1, 1); }
      const [qx, qz] = end(-(w > dp ? w : dp) + 0.18, 0.15); if (rnd() < 0.6) pens.add(qx, top, qz); else { pot.add(qx, top, qz); leaf.add(qx, top, qz, rnd() * 3); }
      const [kx, kz] = along ? [cx, bb.max.z - 0.05] : [bb.max.x - 0.05, cz]; cable.add(kx + 0.1, top, kz, 0, 1, top - (bb.min.y + 0.02), 1);
      const [bx, bz] = end(0.2, 0.2); bin.add(bx, bb.min.y, bz);
    }
    for (const i of [mug, paper, folder, pens, pot, leaf, cable, bin]) i.build(g, inv);
    if (lvName !== 'L1') {
      // ceiling cassette AC units over the open office + motivational posters on the corridor wall
      const lb = new THREE.Box3().setFromObject(L.getObjectByName(`PROP_${lvName}_PRINTER_01`) ?? L);
      const floorY = lb.min.y;
      const cas = new Inst('HD_AC_CASSETTE', boxG(0.84, 0.12, 0.84), std('#f3f3f1'));
      const vent = new Inst('HD_AC_CASSETTE_GRILL', boxG(0.5, 0.01, 0.5), std('#c9cbcc'));
      const fromLocal = (x: number, z: number) => { const v = new THREE.Vector3(x, 0, z); return v; };
      void fromLocal;
      const ref = L.getObjectByName(`PROP_${lvName}_DESK_01`), ref2 = L.getObjectByName(`PROP_${lvName}_DESK_12`);
      if (ref && ref2) {
        const a = new THREE.Box3().setFromObject(ref), b = new THREE.Box3().setFromObject(ref2);
        const x0 = Math.min(a.min.x, b.min.x), x1 = Math.max(a.max.x, b.max.x), z0 = Math.min(a.min.z, b.min.z) - 3, z1 = Math.max(a.max.z, b.max.z) + 1;
        const ceil = a.min.y + 2.88;
        for (let x = x0 + 1; x < x1; x += 4) for (let z = z0 + 1; z < z1; z += 4) { cas.add(x, ceil - 0.12, z); vent.add(x, ceil - 0.125, z); }
        void floorY;
        const posters = [['KERJA\nCERDAS', 'Nusantara Tech', '#1565c0'], ['K3\nUTAMA', 'Utamakan keselamatan', '#c62828'], ['HEMAT\nLISTRIK', 'Matikan PC saat pulang', '#2e7d32'], ['JAGA\nPASSWORD', 'Jangan dibagi ke siapa pun', '#6a1b9a']];
        const zw = Math.max(a.max.z, b.max.z) + 1.55;
        posters.forEach(([t, s2, c], i) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshStandardMaterial({ map: canvasPoster(t, s2, c), roughness: 0.6 }));
          m.name = `HD_POSTER_${i}`; m.position.set(x0 + 1.2 + i * 2.6, a.min.y + 1.55, zw); m.rotation.y = Math.PI; m.applyMatrix4(inv); g.add(m);
        });
      }
      cas.build(g, inv); vent.build(g, inv);
    }
  }
}

/** build the detail layer; returns the outdoor root (indoor parts live inside each hotel level so floor culling hides them) */
export function buildHiDetail(scene: THREE.Object3D, world: THREE.Object3D, hotel: THREE.Object3D) {
  const out = new THREE.Group(); out.name = 'HIDETAIL'; out.userData.hd = true; scene.add(out);
  facades(world, out); streets(out); interior(hotel);
  return out;
}
