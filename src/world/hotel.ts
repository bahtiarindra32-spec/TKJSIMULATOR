// FASE D — BLD_HOTEL_NUSANTARA. Local origin (0,0) = city (220,168). Z local 0 = front, facing north to Sudirman.
import * as THREE from 'three';
import { HOTEL_ORIGIN, LEVELS, ROOF_ELEV, ANCHORS, wx, wz } from '../data/city';
import { TEX, texMat, M, box, cyl, group, mat, addCollider, signTex, facadeTex } from './core';
import * as ND from '../assets/netdevices';

const OX = wx(HOTEL_ORIGIN[0]), OZ = wz(HOTEL_ORIGIN[1]);
const X = (lx: number) => OX + lx, Z = (lz: number) => OZ + lz;

export interface DoorLeaf { piv: THREE.Group; slide: boolean; base: number; swing: number; lw: number; slideDir: number; cx: number; cz: number; y0: number; open: number; want?: boolean; box: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number } }
/** every hinged/sliding door leaf in the hotel; animated by updateDoors() */
export const doorLeaves: DoorLeaf[] = [];
/** open doors when someone is near (auto-closer), hide upper-floor doors during the cutaway view */
export function updateDoors(dt: number, px: number, pz: number, py: number, hideAbove: number | null) {
  for (const d of doorLeaves) {
    const near = Math.abs(py - d.y0) < 1.6 && (px - d.cx) ** 2 + (pz - d.cz) ** 2 < 2.4 * 2.4;
    const tgt = d.slide ? (near ? 1 : 0) : d.want ? 1 : 0;
    d.open += Math.sign(tgt - d.open) * Math.min(Math.abs(tgt - d.open), dt * (d.slide ? 1.6 : 1.9));
    const e = d.open * d.open * (3 - 2 * d.open);
    if (d.slide) { d.piv.rotation.y = d.base; const ch = d.piv.children[0]; ch.position.x = (d.piv.userData.x0 ??= ch.position.x) + d.slideDir * e; }
    else d.piv.rotation.y = d.base + d.swing * e;
    d.piv.visible = hideAbove === null || d.y0 < hideAbove;
  }
}
/** nearest hinged door (sliding lobby doors stay automatic) */
export function nearestDoor(px: number, pz: number, py: number, r = 1.7, yaw?: number): DoorLeaf | null {
  let best: DoorLeaf | null = null, bd = r * r, bs = Infinity;
  for (const d of doorLeaves) {
    if (d.slide || Math.abs(py - d.y0) > 1.2) continue; const q = (px - d.cx) ** 2 + (pz - d.cz) ** 2; if (q >= bd) continue;
    // standing between two doors (corridor between facing rooms): prefer the one in front of the player, not the one behind
    const score = yaw === undefined ? q : q + ((d.cx - px) * -Math.sin(yaw) + (d.cz - pz) * -Math.cos(yaw) < 0 ? 4 : 0);
    if (score < bs) { bs = score; best = d; }
  }
  return best;
}
export function toggleDoor(d: DoorLeaf) {
  // double doors open together
  const v = !d.want;
  for (const o of doorLeaves) if (!o.slide && Math.abs(o.y0 - d.y0) < 0.1 && Math.hypot(o.cx - d.cx, o.cz - d.cz) < 0.05) o.want = v;
}
export function closedDoorBoxes(px: number, pz: number, out: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }[], py?: number) {
  for (const d of doorLeaves) {
    if (Math.abs(px - d.cx) > 4 || Math.abs(pz - d.cz) > 4 || (py !== undefined && Math.abs(py - d.y0) > 2.5)) continue;
    if (d.open < 0.35) { out.push(d.box); continue; }
    // an open hinged leaf is solid too (it used to be walk-through): box around the leaf from the hinge to its free edge
    if (d.slide || d.open < 0.9) continue;
    const th = d.piv.rotation.y, sg = d.piv.children[0].position.x >= 0 ? 1 : -1;
    const hx = d.piv.position.x, hz = d.piv.position.z, fx = hx + sg * d.lw * Math.cos(th), fz = hz - sg * d.lw * Math.sin(th);
    out.push({ minX: Math.min(hx, fx) - 0.03, maxX: Math.max(hx, fx) + 0.03, minZ: Math.min(hz, fz) - 0.03, maxZ: Math.max(hz, fz) + 0.03, minY: d.y0, maxY: d.box.maxY });
  }
}

export interface LevelZone { name: string; level: number; x0: number; x1: number; z0: number; z1: number }
export const hotelZones: LevelZone[] = [];
export const verticalZones: { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: X(15), x1: X(19), z0: Z(12), z1: Z(20) }, // stair
  { x0: X(19), x1: X(23), z0: Z(12), z1: Z(20) }, // lift
];
export const hotelBounds = { x0: X(0), x1: X(30), z0: Z(0), z1: Z(20) };

type Opening = { c: number; w: number; b: number; t: number; kind: 'door' | 'window' | 'curtain' | 'void'; name?: string; mat?: THREE.Material };

const extWallMat = mat('#ece8df', { roughness: 0.8 });
const intWallMat = mat('#ddd5c6', { roughness: 0.92 });
const srvWallMat = mat('#d9dde0', { roughness: 0.9 });
const frameMat = mat('#3a4046', { metalness: 0.6, roughness: 0.4 });
const doorWood = mat('#9a6b43', { roughness: 0.6 });
const doorSteel = mat('#7b858c', { metalness: 0.6, roughness: 0.4 });
const ceilCanvas = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } g.fillStyle = '#c9c6bf'; g.fillRect(0, 0, 128, 4); g.fillRect(0, 0, 4, 128); return c; })();
const ceilCache = new Map<string, THREE.Material>();
function ceilGrid(w: number, d: number) { const k = `${w}x${d}`; if (!ceilCache.has(k)) { const t = new THREE.CanvasTexture(ceilCanvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 0.6, d / 0.6); t.colorSpace = THREE.SRGBColorSpace; ceilCache.set(k, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })); } return ceilCache.get(k)!; }
const winGlass = new THREE.MeshPhysicalMaterial({ color: '#a9cbe0', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, side: THREE.DoubleSide });

/**
 * Axis-aligned wall from (x1,z1) to (x2,z2) in local coords, centered on the line.
 * Openings are along the wall axis (local coordinate of the varying axis).
 */
function wall(parent: THREE.Object3D, x1: number, z1: number, x2: number, z2: number, thick: number, y0: number, h: number, m: THREE.Material, openings: Opening[] = [], name?: string, collide = true) {
  const alongX = z1 === z2;
  const a = Math.min(alongX ? x1 : z1, alongX ? x2 : z2), b = Math.max(alongX ? x1 : z1, alongX ? x2 : z2);
  const c = alongX ? z1 : x1;
  const g = new THREE.Group(); if (name) g.name = name; parent.add(g);
  const piece = (s: number, e: number, yb: number, yt: number, mm = m) => {
    if (e - s < 0.005 || yt - yb < 0.005) return;
    if (alongX) box(g, X(s), y0 + yb, Z(c - thick / 2), e - s, yt - yb, thick, mm);
    else box(g, X(c - thick / 2), y0 + yb, Z(s), thick, yt - yb, e - s, mm);
  };
  const ops = [...openings].sort((p, q) => p.c - q.c);
  let cur = a;
  const solidRuns: [number, number][] = [];
  for (const o of ops) {
    const s = o.c - o.w / 2, e = o.c + o.w / 2;
    piece(cur, s, 0, h);
    if (o.kind !== 'door' && o.kind !== 'void') solidRuns.push([cur, e]); else solidRuns.push([cur, s]);
    piece(s, e, 0, o.b); piece(s, e, o.t, h);
    // fill
    if (o.kind === 'window' || o.kind === 'curtain') {
      piece(s, e, o.b, o.t, winGlass);
      // frame
      if (alongX) { box(g, X(s), y0 + o.b, Z(c - 0.04), 0.05, o.t - o.b, 0.08, frameMat, undefined, false); box(g, X(e - 0.05), y0 + o.b, Z(c - 0.04), 0.05, o.t - o.b, 0.08, frameMat, undefined, false); box(g, X(s), y0 + o.b, Z(c - 0.06), e - s, 0.05, 0.12, frameMat, undefined, false); if (o.kind === 'curtain') for (let m2 = s + 1.2; m2 < e - 0.3; m2 += 1.25) box(g, X(m2), y0 + o.b, Z(c - 0.04), 0.06, o.t - o.b, 0.1, frameMat, undefined, false); }
      else { box(g, X(c - 0.04), y0 + o.b, Z(s), 0.08, o.t - o.b, 0.05, frameMat, undefined, false); box(g, X(c - 0.04), y0 + o.b, Z(e - 0.05), 0.08, o.t - o.b, 0.05, frameMat, undefined, false); box(g, X(c - 0.06), y0 + o.b, Z(s), 0.12, 0.05, e - s, frameMat, undefined, false); }
    } else if (o.kind === 'door') {
      // open door leaf (rotated 80deg) so the passage stays walkable; frame around opening
      const leaf = o.mat ?? doorWood;
      // jambs stick 1 cm into the opening: a jamb face flush with the wall's end face z-fights (flickering stripes in every doorway)
      if (alongX) { box(g, X(s) - 0.04, y0, Z(c - thick / 2 - 0.02), 0.05, o.t, thick + 0.04, frameMat, undefined, false); box(g, X(e) - 0.01, y0, Z(c - thick / 2 - 0.02), 0.05, o.t, thick + 0.04, frameMat, undefined, false); }
      else { box(g, X(c - thick / 2 - 0.02), y0, Z(s) - 0.04, thick + 0.04, o.t, 0.05, frameMat, undefined, false); box(g, X(c - thick / 2 - 0.02), y0, Z(e) - 0.01, thick + 0.04, o.t, 0.05, frameMat, undefined, false); }
      const lw = o.w > 1.5 ? o.w / 2 : o.w;
      const leaves = o.w > 1.5 ? [s, e] : [s];
      const slide = !!o.name?.includes('P01');
      leaves.forEach((hinge, i) => {
        const lt = slide ? 0.02 : 0.045;
        const l = new THREE.Mesh(new THREE.BoxGeometry(lw - 0.01, o.t - 0.02, lt), slide ? winGlass : leaf);
        const piv = new THREE.Group(); piv.name = o.name ? `${o.name}${leaves.length > 1 ? (i ? '_B' : '_A') : ''}` : `DOOR_AUTO_${doorLeaves.length}`;
        l.position.set((i ? -1 : 1) * lw / 2, (o.t - 0.02) / 2, slide ? 0.09 : 0); l.castShadow = true; piv.add(l);
        if (!slide) { // handle on the free edge, both faces
          for (const sz of [-1, 1]) { const hnd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), M.steel); hnd.position.set((i ? -1 : 1) * (lw - 0.1), 1.0, sz * (lt / 2 + 0.03)); piv.add(hnd); }
        } else { const rail = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.06, 0.03), frameMat); rail.position.set(0, o.t - 0.03, 0.09); rail.scale.x = 2; piv.add(rail); }
        const base = alongX ? 0 : -Math.PI / 2;
        if (alongX) piv.position.set(X(hinge), y0, Z(c)); else piv.position.set(X(c), y0, Z(hinge));
        piv.rotation.y = base;
        const cx = alongX ? X(o.c) : X(c), cz = alongX ? Z(c) : Z(o.c);
        doorLeaves.push({ piv, slide, base, swing: (i ? 1 : -1) * 1.55, lw, slideDir: (i ? -1 : 1) * -0.95 * lw, cx, cz, y0, open: 0,
          box: alongX ? { minX: X(s), maxX: X(e), minZ: Z(c) - 0.06, maxZ: Z(c) + 0.06, minY: y0, maxY: y0 + o.t } : { minX: X(c) - 0.06, maxX: X(c) + 0.06, minZ: Z(s), maxZ: Z(e), minY: y0, maxY: y0 + o.t } });
        g.add(piv);
      });
      if (o.name) { const marker = new THREE.Object3D(); marker.name = o.name; marker.position.set(alongX ? X(o.c) : X(c), y0, alongX ? Z(c) : Z(o.c)); g.add(marker); }
    }
    cur = e;
  }
  piece(cur, b, 0, h);
  solidRuns.push([cur, b]);
  if (collide) for (const [s, e] of solidRuns) {
    if (e - s < 0.01) continue;
    if (alongX) addCollider(X(s), X(e), Z(c - thick / 2 - 0.05), Z(c + thick / 2 + 0.05), y0, y0 + h);
    else addCollider(X(c - thick / 2 - 0.05), X(c + thick / 2 + 0.05), Z(s), Z(e), y0, y0 + h);
  }
  return g;
}

function slab(parent: THREE.Object3D, y: number, m: THREE.Material, hole = true, name?: string) {
  const g = new THREE.Group(); if (name) g.name = name; parent.add(g);
  const rects: [number, number, number, number][] = hole ? [[0, 0, 30, 12], [0, 12, 15, 8], [23, 12, 7, 8]] : [[0, 0, 30, 20]];
  for (const [x, z, w, d] of rects) { box(g, X(x), y - 0.2, Z(z), w, 0.2, d, m, undefined, false); box(g, X(x), y - 0.23, Z(z), w, 0.03, d, ceilGrid(w, d), undefined, false); }
  // ceiling underside of the slab above is the next slab
  return g;
}
function zone(level: number, name: string, x0: number, x1: number, z0: number, z1: number) {
  hotelZones.push({ name, level, x0: X(x0), x1: X(x1), z0: Z(z0), z1: Z(z1) });
}

// ---------- props ----------
/** place a netdevices object at hotel-local coords; rot = yaw (0: front faces north/-Z, PI: faces south, -PI/2: faces east, PI/2: faces west) */
function put<T extends THREE.Object3D>(p: THREE.Object3D, o: T, lx: number, y: number, lz: number, rot = 0): T {
  o.position.set(X(lx), y, Z(lz)); o.rotation.y = rot; p.add(o); return o;
}
let devN = 0;
function desk(p: THREE.Object3D, y: number, x: number, z: number, w: number, d: number, name?: string, top = M.woodLight) {
  const g = new THREE.Group(); if (name) g.name = name; p.add(g);
  box(g, X(x), y + 0.72, Z(z), w, 0.04, d, top).userData.slab = true; // desk top is solid (no walking or crouching through it)
  for (const [dx, dz] of [[0.03, 0.03], [w - 0.07, 0.03], [0.03, d - 0.07], [w - 0.07, d - 0.07]]) box(g, X(x + dx), y, Z(z + dz), 0.04, 0.72, 0.04, M.steel, undefined, false);
  box(g, X(x + 0.05), y + 0.3, Z(z + 0.02), w - 0.1, 0.4, 0.02, mat('#d6d2c8'), undefined, false); // modesty panel (front edge)
  return g;
}
type Face = 'N' | 'S' | 'E' | 'W';
const FACE_YAW: Record<Face, number> = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
const chairGeo = (() => {
  const seat = new THREE.BoxGeometry(0.48, 0.07, 0.46); seat.translate(0, 0, 0);
  const back = new THREE.BoxGeometry(0.44, 0.52, 0.05);
  const star = new THREE.BoxGeometry(0.3, 0.03, 0.05); star.translate(0.15, 0, 0);
  return { seat, back, star, caster: new THREE.SphereGeometry(0.028, 8, 6), lift: new THREE.CylinderGeometry(0.025, 0.03, 0.34, 10), arm: new THREE.BoxGeometry(0.05, 0.03, 0.26), armPost: new THREE.BoxGeometry(0.03, 0.2, 0.03), leg: new THREE.CylinderGeometry(0.016, 0.014, 0.44, 8), slat: new THREE.BoxGeometry(0.4, 0.06, 0.025) };
})();
/** chair whose sitter looks toward `face` (N = -Z). office: 5-star swivel with armrests; cafe: 4-leg wood */
function chair(p: THREE.Object3D, y: number, cx: number, cz: number, face: Face = 'N', m = M.fabric, kind: 'office' | 'cafe' = 'office') {
  const g = new THREE.Group(); g.name = 'FURN_CHAIR'; g.position.set(X(cx), y, Z(cz)); g.rotation.y = FACE_YAW[face]; p.add(g);
  const add = (geo: THREE.BufferGeometry, mm: THREE.Material, x: number, yy: number, z: number, rx = 0, ry = 0) => { const o = new THREE.Mesh(geo, mm); o.position.set(x, yy, z); o.rotation.set(rx, ry, 0); o.castShadow = true; g.add(o); return o; };
  if (kind === 'office') {
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; add(chairGeo.star, M.black, 0, 0.06, 0, 0, a); add(chairGeo.caster, M.black, Math.cos(a) * 0.29, 0.028, -Math.sin(a) * 0.29); }
    add(chairGeo.lift, M.steel, 0, 0.24, 0);
    add(chairGeo.seat, m, 0, 0.45, 0);
    add(chairGeo.back, m, 0, 0.78, 0.25, -0.12);
    add(chairGeo.armPost, M.black, 0, 0.5, 0.29).scale.set(1, 0.6, 1);
    for (const sx of [-0.26, 0.26]) { add(chairGeo.armPost, M.black, sx, 0.58, 0.04); add(chairGeo.arm, M.black, sx, 0.69, 0.02); }
  } else {
    const wood = M.wood;
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) add(chairGeo.leg, wood, lx, 0.22, lz);
    add(chairGeo.seat, m, 0, 0.47, 0).scale.set(0.9, 1, 0.9);
    for (const sy of [0.62, 0.74, 0.86]) add(chairGeo.slat, wood, 0, sy, 0.2);
    for (const sx of [-0.19, 0.19]) add(chairGeo.leg, wood, sx, 0.68, 0.2).scale.set(1, 0.95, 1);
  }
  return g;
}
function pc(p: THREE.Object3D, y: number, cx: number, cz: number, name: string, screens = 1, kinds: ND.ScreenKind[] = ['winbox']) {
  const g = new THREE.Group(); g.name = name; p.add(g);
  const top = y + 0.76;
  for (let i = 0; i < screens; i++) {
    const ox = (i - (screens - 1) / 2) * 0.58;
    put(g, ND.monitor(`${name}_MONITOR_${i + 1}`, { screen: kinds[i % kinds.length] }), cx + ox, top, cz - 0.16, Math.PI + (screens > 1 ? -Math.sign(ox) * 0.18 : 0));
  }
  put(g, ND.keyboard(`${name}_KEYBOARD`), cx - 0.05, top, cz - 0.01, Math.PI);
  put(g, ND.mouse(`${name}_MOUSE`), cx + 0.3, top, cz + 0.0, Math.PI);
  put(g, ND.pcTower(`${name}_CPU`), cx + 0.5, y, cz - 0.3, Math.PI);
  return g;
}
const ledTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const gg = c.getContext('2d')!;
  gg.fillStyle = '#15181c'; gg.fillRect(0, 0, 64, 256);
  for (let u = 0; u < 42; u++) {
    const y = 4 + u * 5.9; gg.fillStyle = u % 7 === 0 ? '#2a2f35' : '#1f2328'; gg.fillRect(4, y, 56, 5);
    if (Math.random() > 0.35) { for (let k = 0; k < 6; k++) { gg.fillStyle = Math.random() > .25 ? '#2bd46b' : (Math.random() > .5 ? '#ffb020' : '#3fa0ff'); gg.fillRect(8 + k * 4, y + 2, 2, 1.5); } }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const rackFront = new THREE.MeshStandardMaterial({ map: ledTex, emissiveMap: ledTex, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.4 });
export const blinkMaterials: THREE.MeshStandardMaterial[] = [rackFront];
function rack(p: THREE.Object3D, y: number, x: number, z: number, name: string, w = 0.6, d = 1.0, h = 2.0, _frontNorth = true, populated: 'server' | 'network' | 'idf' | undefined = 'server', doorOpen = 0) {
  const g = new THREE.Group(); g.name = name; p.add(g);
  if (h >= 1.9) put(g, ND.rack42U(`${name}_CABINET`, { width: w >= 0.8 ? 0.8 : 0.6, depth: d >= 1.2 ? 1.2 : 1.0, populated, doorOpen }), x + w / 2, y, z + d, 0);
  else put(g, ND.wallRack(`${name}_CABINET`, { u: 12, populated: true, doorOpen }), x + w / 2, y + 0.4, z + d, 0);
  addCollider(X(x), X(x + w), Z(z), Z(z + d), y, y + h);
  return g;
}
function plant(p: THREE.Object3D, y: number, cx: number, cz: number, s = 1) {
  cyl(p, X(cx), y, Z(cz), 0.22 * s, 0.4 * s, M.pot, undefined, 10, 0.26 * s);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s, 0), M.plant); leaves.position.set(X(cx), y + 0.85 * s, Z(cz)); leaves.scale.y = 1.4; leaves.castShadow = true; p.add(leaves);
}
const sofaLegM = mat('#2a2017', { roughness: 0.6 });
const roundedBox = (w: number, h: number, d: number, r: number) => {
  const sh = new THREE.Shape(); const x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r * 0.6, bevelEnabled: true, bevelSize: r * 0.6, bevelThickness: r * 0.6, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r * 0.6) / 2); return g;
};
/** upholstered sofa: legs, base, seat cushions, back cushions, arms (backSide = side the backrest is on) */
function sofa(p: THREE.Object3D, y: number, x: number, z: number, w: number, d: number, m = M.leather, backSide: 'N' | 'S' | 'W' | 'E' = 'W') {
  const g = new THREE.Group(); p.add(g);
  const alongX = backSide === 'N' || backSide === 'S'; const len = alongX ? w : d, dep = alongX ? d : w;
  const add = (geo: THREE.BufferGeometry, lx: number, ly: number, lz: number, mm: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, mm); mesh.castShadow = true; mesh.receiveShadow = true;
    // local frame: u along sofa length, v depth (0 = back), mapped to world
    const cx = X(x) + (alongX ? lx : (backSide === 'W' ? lz : w - lz)), cz = Z(z) + (alongX ? (backSide === 'N' ? lz : d - lz) : lx);
    mesh.position.set(cx, y + ly, cz); if (!alongX) mesh.rotation.y = Math.PI / 2; g.add(mesh);
  };
  const legGeo = new THREE.CylinderGeometry(0.025, 0.02, 0.1, 8);
  for (const u of [0.08, len - 0.08]) for (const v of [0.08, dep - 0.08]) add(legGeo, u, 0.05, v, sofaLegM);
  add(roundedBox(len, 0.18, dep, 0.04), len / 2, 0.19, dep / 2, m);
  const nSeat = Math.max(1, Math.round((len - 0.3) / 0.62)), cw = (len - 0.3) / nSeat;
  for (let i = 0; i < nSeat; i++) {
    add(roundedBox(cw - 0.02, 0.14, dep - 0.22, 0.05), 0.15 + cw * (i + 0.5), 0.35, 0.2 + (dep - 0.22) / 2, m);
    add(roundedBox(cw - 0.03, 0.42, 0.16, 0.06), 0.15 + cw * (i + 0.5), 0.6, 0.12, m);
  }
  add(roundedBox(len, 0.48, 0.12, 0.04), len / 2, 0.52, 0.06, m);
  for (const u of [0.075, len - 0.075]) add(roundedBox(0.15, 0.36, dep, 0.05), u, 0.46, dep / 2, m);
  return g;
}
function label(text: string, w: number, h: number, bg = '#13202b', fg = '#ffffff', accent = '#2bd46b') {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTex(text, bg, fg, 1024, Math.round(1024 * h / w), accent), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
}
/** underside of what is above a level: the next slab's ceiling grid (top of slab y+h+0.12, 0.2 slab + 0.03 grid) or the roof slab */
const ceilY = (y: number, h: number) => (y + h >= ROOF_ELEV - 0.01 ? ROOF_ELEV - 0.2 : y + h + 0.12 - 0.23);
/** flush lamp panels just under the ceiling (they used to sit at y+h-0.03, i.e. inside the slab above, so no lamp was ever visible) */
function lampAt(p: THREE.Object3D, y: number, h: number, x: number, z: number, w = 0.6, d = 0.6) { box(p, X(x), ceilY(y, h) - 0.025, Z(z), w, 0.02, d, M.lampOn, undefined, false); }
function ceilingLights(p: THREE.Object3D, y: number, h: number, x0: number, x1: number, z0: number, z1: number, step = 2.5) {
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) lampAt(p, y, h, x - 0.3, z - 0.3);
}

// ---------- levels ----------
function buildL1(root: THREE.Object3D) {
  const L = group(root, 'L1');
  const y = 0, h = 4.0;
  // D2 slab + walls
  const fl = group(L, 'L1_FLOOR');
  box(fl, X(0), y, Z(0), 30, 0.12, 20, texMat(TEX.floorTile, 30 / 2.4, 20 / 2.4), 'L1_SLAB');
  // raised floor 0.3 m; the first 1.2 m inside the door is a ramp so the door opening keeps its full 2.1 m headroom
  box(fl, X(23), y + 0.12, Z(13.2), 7, 0.3, 6.8, texMat(TEX.raised, 7 / 1.2, 6.8 / 1.2), 'L1_SERVER_RAISED_FLOOR');
  { const len = Math.hypot(1.2, 0.3), rp = new THREE.Mesh(new THREE.BoxGeometry(7, 0.04, len), texMat(TEX.raised, 7 / 1.2, 1)); rp.position.set(X(26.5), y + 0.12 + 0.15 - 0.02, Z(12.6)); rp.rotation.x = -Math.atan2(0.3, 1.2); rp.receiveShadow = true; rp.name = 'L1_SERVER_RAMP'; rp.userData.noCollide = true; fl.add(rp);
    const nose = mat('#d8b31f', { roughness: 0.6 }); box(fl, X(23), y + 0.12 + 0.3, Z(13.17), 7, 0.012, 0.05, nose, undefined, false); }
  box(fl, X(14), y + 0.121, Z(0), 8, 0.01, 10, texMat(TEX.carpet, 4, 5), undefined, false); // carpet only in IT office; workshop keeps tile (ESD-friendly vinyl look)
  box(fl, X(22), y + 0.121, Z(0), 8, 0.01, 10, texMat(TEX.floorTile, 8 / 1.2, 10 / 1.2, { color: '#dfe6ea' }), undefined, false);
  // ext walls with D3/D4 openings (audit: lobby curtain wall trimmed to X1-5.4 / X8.6-13 so it does not collide with the 3 m main door at X5.5-8.5)
  wall(L, 0, 0, 30, 0, 0.25, y, h, extWallMat, [
    { c: 3.2, w: 4.4, b: 0.05, t: 3.2, kind: 'curtain', name: 'WIN_L1_01' },
    { c: 7, w: 3.0, b: 0, t: 2.4, kind: 'door', name: 'DOOR_L1_P01' },
    { c: 10.8, w: 4.4, b: 0.05, t: 3.2, kind: 'curtain', name: 'WIN_L1_02' },
    { c: 15.5, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_07' }, { c: 18, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_08' }, { c: 20.5, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_09' },
    { c: 23.5, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_10' }, { c: 26, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_11' }, { c: 28.5, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_12' },
  ], 'L1_WALL_FRONT');
  wall(L, 0, 0, 0, 20, 0.25, y, h, extWallMat, [
    { c: 3, w: 2, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_03' }, { c: 8, w: 2, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_04' },
    { c: 14, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_05' }, { c: 18, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_06' },
  ], 'L1_WALL_WEST');
  wall(L, 0, 20, 30, 20, 0.25, y, h, extWallMat, [
    { c: 3, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_13' }, { c: 7, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_14' },
  ], 'L1_WALL_SOUTH');
  wall(L, 30, 0, 30, 20, 0.25, y, h, extWallMat, [
    { c: 5, w: 1.5, b: 0.9, t: 2.4, kind: 'window', name: 'WIN_L1_15' },
    { c: 11, w: 1.2, b: 0, t: 2.1, kind: 'door', name: 'DOOR_L1_P02', mat: doorSteel },
  ], 'L1_WALL_EAST');
  // partitions S1..S11
  wall(L, 14, 0, 14, 10, 0.12, y, h, intWallMat, [], 'L1_S1');
  wall(L, 22, 0, 22, 10, 0.12, y, h, intWallMat, [], 'L1_S2');
  wall(L, 14, 10, 30, 10, 0.12, y, h, intWallMat, [{ c: 18, w: 1.0, b: 0, t: 2.1, kind: 'door', name: 'DOOR_L1_P03' }, { c: 26, w: 1.8, b: 0, t: 2.1, kind: 'door', name: 'DOOR_L1_P04' }], 'L1_S3');
  wall(L, 10, 12, 23, 12, 0.12, y, h, intWallMat, [
    { c: 11.25, w: 0.9, b: 0, t: 2.1, kind: 'door', name: 'DOOR_L1_P05' }, { c: 13.75, w: 0.9, b: 0, t: 2.1, kind: 'door', name: 'DOOR_L1_P06' },
    { c: 17, w: 1.2, b: 0, t: 2.1, kind: 'door', name: 'DOOR_L1_P07', mat: doorSteel }, { c: 20, w: 1.1, b: 0, t: 2.1, kind: 'void', name: 'DOOR_L1_P08' }, { c: 22, w: 1.1, b: 0, t: 2.1, kind: 'void', name: 'DOOR_L1_P09' },
  ], 'L1_S4');
  for (const [nm, x] of [['L1_S5', 10], ['L1_S6', 12.5], ['L1_S7', 15], ['L1_S8', 19], ['L1_S9', 21]] as [string, number][]) wall(L, x, 12, x, 20, 0.12, y, h, intWallMat, [], nm);
  wall(L, 23, 12, 23, 20, 0.2, y, h, srvWallMat, [], 'L1_S10');
  wall(L, 23, 12, 30, 12, 0.2, y, h, srvWallMat, [{ c: 26.5, w: 1.0, b: 0, t: 2.1, kind: 'door', name: 'DOOR_L1_P10', mat: doorSteel }], 'L1_S11');
  // lift doors (stainless) on S4 at P08/P09 – shown closed-looking panels set back
  liftLanding(L, y, 1);
  // D5 zones
  for (const [n, x0, x1, z0, z1] of [['L1_LOBI', 0, 14, 0, 12], ['L1_LOUNGE', 0, 10, 12, 20], ['L1_IT_OFFICE', 14, 22, 0, 10], ['L1_WORKSHOP', 22, 30, 0, 10], ['L1_CORRIDOR', 14, 30, 10, 12], ['L1_TOILET_M', 10, 12.5, 12, 20], ['L1_TOILET_F', 12.5, 15, 12, 20], ['L1_STAIR', 15, 19, 12, 20], ['L1_LIFT', 19, 23, 12, 20], ['L1_SERVER', 23, 30, 12, 20]] as [string, number, number, number, number][]) zone(1, n, x0, x1, z0, z1);
  ceilingLights(L, y, h, 0, 14, 0, 12, 3); ceilingLights(L, y, h, 14, 30, 0, 10, 2.6); ceilingLights(L, y, h, 0, 10, 12, 20, 3); ceilingLights(L, y, h, 23, 30, 12, 20, 2.3);
  lampAt(L, y, h, 14, 10.7, 16, 0.6);

  // D6 lobby + lounge
  const lob = group(L, 'L1_LOBI_PROPS');
  const rec = group(lob, 'PROP_L1_RECEPTION_01');
  box(rec, X(5), y, Z(7.6), 6, 1.1, 0.8, mat('#3b2f2a', { roughness: 0.5 }));
  box(rec, X(4.95), y + 1.1, Z(7.55), 6.1, 0.05, 0.9, mat('#efe9df', { roughness: 0.3 }));
  box(rec, X(5), y + 0.2, Z(7.58), 6, 0.06, 0.02, M.green, undefined, false);
  pc(rec, y + 0.38, 6.5, 8.3, 'PROP_L1_RECEPTION_PC_01'); pc(rec, y + 0.38, 9.5, 8.3, 'PROP_L1_RECEPTION_PC_02');
  addCollider(X(5), X(11), Z(7.6), Z(8.4), 0, 1.2);
  box(lob, X(4.5), y, Z(11.5), 5.6, 2.8, 0.3, mat('#5b4636', { roughness: 0.6 })); // feature wall behind reception (stops short of the toilet door P05)
  const sg = label('NUSANTARA TECH HOTEL & OFFICE', 4, 0.8); sg.name = 'PROP_L1_SIGNAGE_01';
  sg.position.set(X(14) - 0.08, y + 2.4 + 0.4, Z(4)); sg.rotation.y = -Math.PI / 2; lob.add(sg);
  for (const z0 of [2, 6]) {
    const s = group(lob, `PROP_L1_SOFASET_${z0 === 2 ? '01' : '02'}`);
    sofa(s, y, 1, z0, 0.8, 2, M.leather, 'W');
    box(s, X(2.1), y, Z(z0 + 0.6), 0.9, 0.42, 0.8, mat('#c9a77c'));
    sofa(s, y, 3.2, z0 - 0.1, 0.8, 0.8, M.fabric2, 'E'); sofa(s, y, 3.2, z0 + 1.3, 0.8, 0.8, M.fabric2, 'E');
    addCollider(X(1), X(4), Z(z0), Z(z0 + 2.1), 0, 0.9);
  }
  for (let i = 0; i < 4; i++) { box(lob, X(0.2), y + 0.45, Z(9.0 + i * 0.6), 0.5, 0.06, 0.5, M.fabric); }
  for (const [px, pz] of [[0.8, 0.8], [4.5, 0.8], [9.5, 0.8], [13, 11]]) plant(lob, y, px, pz);
  const trol = group(lob, 'PROP_L1_LUGGAGE_TROLLEY_01');
  box(trol, X(10.6), y + 0.1, Z(2.6), 0.8, 0.05, 0.6, mat('#c9a227', { metalness: 0.8, roughness: 0.3 }));
  for (const dx of [0, 0.75]) cyl(trol, X(10.6 + dx + 0.02), y, Z(2.9), 0.02, 1.8, mat('#c9a227', { metalness: 0.8, roughness: 0.3 }));
  box(trol, X(10.65), y + 0.15, Z(2.7), 0.5, 0.5, 0.35, mat('#7b2d26'));
  for (const [cx, cz, nm] of [[13.5, 0.3, 'PROP_L1_CCTV_01'], [0.3, 11.5, 'PROP_L1_CCTV_02']] as [number, number, string][]) { const c = box(lob, X(cx - 0.1), y + 3.0, Z(cz - 0.06), 0.2, 0.12, 0.12, M.white, nm); c.castShadow = false; }
  // lobby rug
  box(lob, X(1.5), y + 0.125, Z(4.5), 9, 0.01, 1.2, mat('#7b2d26'), undefined, false);
  // lounge
  const lg = group(L, 'L1_LOUNGE_PROPS');
  const cafe = group(lg, 'PROP_L1_CAFE_COUNTER_01');
  box(cafe, X(1), y, Z(18.6), 4, 1.05, 0.8, mat('#2f3a40')); box(cafe, X(0.95), y + 1.05, Z(18.55), 4.1, 0.05, 0.9, M.woodLight);
  box(cafe, X(1.4), y + 1.1, Z(18.8), 0.35, 0.45, 0.35, M.steel); // espresso machine
  for (let i = 0; i < 5; i++) {
    const cx = 2 + (i % 3) * 3, cz = 13.8 + Math.floor(i / 3) * 2.8;
    const t = group(lg, `PROP_L1_LOUNGE_TABLE_0${i + 1}`);
    box(t, X(cx - 0.4), y + 0.72, Z(cz - 0.4), 0.8, 0.04, 0.8, M.woodLight); cyl(t, X(cx), y, Z(cz), 0.05, 0.72, M.steel);
    chair(t, y, cx - 0.7, cz, 'E', M.fabric2, 'cafe'); chair(t, y, cx + 0.7, cz, 'W', M.fabric2, 'cafe');
  }
  plant(lg, y, 9.3, 12.7); plant(lg, y, 9.3, 19.3);

  // D7 IT office
  const it = group(L, 'L1_IT_OFFICE_PROPS');
  let n = 1;
  for (const z0 of [3.0, 6.0]) for (const x0 of [15.0, 17.2, 19.4]) {
    const nm = `PROP_L1_PC_ITOFFICE_0${n++}`;
    desk(it, y, x0, z0, 1.4, 0.7, `${nm}_DESK`); pc(it, y, x0 + 0.7, z0 + 0.35, nm); chair(it, y, x0 + 0.7, z0 + 1.1, 'N');
    addCollider(X(x0), X(x0 + 1.4), Z(z0), Z(z0 + 0.7), 0, 0.8);
  }
  desk(it, y, 14.2, 8.6, 3.0, 0.8, 'PROP_L1_NOC_DESK_01', mat('#2b2f33')); pc(it, y, 15.7, 9.0, 'PROP_L1_NOC_SCREENS_01', 3, ['topology', 'traffic', 'alerts']); put(it, ND.deskPhone('PROP_L1_NOC_PHONE_01'), 14.6, y + 0.76, 9.05, Math.PI); chair(it, y, 15.7, 9.85, 'N');
  // NOC wall display on S1 (dashboard)
  put(it, ND.nocVideoWall('PROP_L1_NOC_VIDEOWALL_01', { stand: false, header: true }), 14.07, y + 1.05, 6.4, -Math.PI / 2);
  const nr = group(it, 'PROP_L1_NETRACK_WALL_01'); put(nr, ND.wallRack('PROP_L1_NETRACK_WALL_01_CABINET', { u: 12, populated: true, doorOpen: 0.5 }), 14.07, y + 1.15, 1.1, -Math.PI / 2);
  put(it, ND.wallNetworkOutlet('PROP_L1_OUTLET_IT_01', { cable: true }), 16.4, y + 0.35, 0.13, Math.PI);
  put(it, ND.wallNetworkOutlet('PROP_L1_OUTLET_IT_02', { cable: true }), 18.6, y + 0.35, 0.13, Math.PI);
  desk(it, y, 20.6, 8.1, 0.8, 0.6, 'PROP_L1_PRINTER_TABLE_01'); box(it, X(20.7), y + 0.76, Z(8.2), 0.6, 0.35, 0.45, mat('#e4e4e0'), 'PROP_L1_PRINTER_01');
  box(it, X(21.5), y, Z(7.05), 0.4, 1.8, 0.9, mat('#8d949a', { metalness: 0.4 }), 'PROP_L1_CABINET_01');
  box(it, X(17.5), y + 2.6, Z(0.15), 1.0, 0.3, 0.22, M.white, 'PROP_L1_AC_ITOFFICE_01');
  put(it, ND.ceilingAP('PROP_L1_AP_ITOFFICE_01'), 18, y + 3.77, 5);
  const cctvm = label('CCTV  CAM01 CAM02 CAM03 CAM04', 1.0, 0.6, '#101418', '#9fd3ff', '#3fa0ff'); cctvm.position.set(X(20), y + 2.0, Z(10) - 0.08); cctvm.rotation.y = Math.PI; cctvm.name = 'PROP_L1_CCTV_MONITOR_01'; it.add(cctvm);

  // D8 Workshop TKJ
  const ws = group(L, 'L1_WORKSHOP_PROPS');
  n = 1;
  for (const z0 of [2.5, 5.5]) for (const x0 of [23.0, 26.6]) {
    const nm = `PROP_L1_PC_WORKSHOP_0${n++}`;
    desk(ws, y, x0, z0, 2.4, 0.9, `${nm}_DESK`, mat('#cfd6db'));
    pc(ws, y, x0 + 0.6, z0 + 0.45, nm); chair(ws, y, x0 + 0.6, z0 + 1.25, 'N'); chair(ws, y, x0 + 1.8, z0 + 1.25, 'N');
    // practice kit on desk: small switch + router + coil of UTP
    put(ws, ND.esdMat(`${nm}_ESD_MAT`, { w: 1.0, d: 0.55, color: 'blue' }), x0 + 1.75, y + 0.761, z0 + 0.58, Math.PI);
    put(ws, ND.switch24(`${nm}_TRAINER_SWITCH`, true), x0 + 1.65, y + 0.762, z0 + 0.08, Math.PI);
    put(ws, ND.router1U(`${nm}_TRAINER_ROUTER`), x0 + 1.65, y + 0.806, z0 + 0.08, Math.PI);
    put(ws, ND.laptop(`${nm}_LAPTOP`, { screen: 'terminal' }), x0 + 1.95, y + 0.762, z0 + 0.62, Math.PI);
    addCollider(X(x0), X(x0 + 2.4), Z(z0), Z(z0 + 0.9), 0, 0.8);
  }
  const ct = desk(ws, y, 23.0, 8.4, 1.8, 0.8, 'PROP_L1_CRIMPING_TABLE_01', mat('#a7b0b6'));
  // crimping station: student stands on the north side (z ~ 8.1) facing south, tools laid out on an ESD mat
  put(ct, ND.esdMat('PROP_L1_CRIMPING_ESD_MAT', { w: 1.6, d: 0.7, color: 'green' }), 23.9, y + 0.761, 8.8, 0);
  put(ct, ND.crimpingTool('PROP_L1_CRIMPING_TOOL_01'), 23.75, y + 0.764, 8.75, 0);
  put(ct, ND.lanTester('PROP_L1_LAN_TESTER_01'), 24.25, y + 0.764, 8.8, 0);
  put(ct, ND.rj45Bag('PROP_L1_RJ45_BOX_01'), 24.6, y + 0.764, 8.95, 0);
  put(ct, ND.cableStripper('PROP_L1_STRIPPER_01'), 23.4, y + 0.764, 8.7, 0);
  put(ct, ND.keystoneJacks('PROP_L1_KEYSTONE_01', 6), 24.55, y + 0.764, 8.6, 0);
  put(ct, ND.punchDownTool('PROP_L1_PUNCHDOWN_01'), 23.2, y + 0.764, 9.0, 0);
  put(ws, ND.utpBox('PROP_L1_UTP_ROLL_01'), 23.25, y + 0.12, 9.85, 0);
  put(ws, ND.cableReel('PROP_L1_CABLE_REEL_01'), 22.6, y + 0.12, 7.3, Math.PI / 2);
  // tool cabinet against the east wall, opened from inside the workshop (front faces west)
  const tc = group(ws, 'PROP_L1_TOOLCAB_01');
  const red = mat('#b3261e', { metalness: 0.35, roughness: 0.45 }), dk = mat('#1f2326', { metalness: 0.4 });
  box(tc, X(29.35), y + 0.12, Z(7.85), 0.6, 1.1, 1.3, red);
  for (let k = 0; k < 6; k++) { box(tc, X(29.33), y + 0.2 + k * 0.17, Z(7.92), 0.02, 0.14, 1.16, mat('#c8352c', { metalness: 0.35, roughness: 0.4 }), undefined, false); box(tc, X(29.31), y + 0.27 + k * 0.17, Z(8.2), 0.02, 0.02, 0.6, dk, undefined, false); }
  box(tc, X(29.35), y + 1.22, Z(7.85), 0.6, 0.03, 1.3, mat('#3a3f44', { metalness: 0.5 }));
  // pegboard with tools above it
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), new THREE.MeshStandardMaterial({ map: signTex('', '#c9a66b', '#c9a66b', 256, 180), roughness: 0.8 }));
  peg.position.set(X(29.87), y + 1.85, Z(8.5)); peg.rotation.y = -Math.PI / 2; tc.add(peg);
  put(tc, ND.multimeter('PROP_L1_MULTIMETER_01'), 29.55, y + 1.255, 8.0, Math.PI / 2);
  put(tc, ND.lanTester('PROP_L1_LAN_TESTER_02'), 29.6, y + 1.255, 8.55, Math.PI / 2);
  put(tc, ND.wireTray('PROP_L1_PARTS_TRAY_01'), 29.6, y + 1.255, 9.0, Math.PI / 2);
  put(tc, ND.signPlate('PROP_L1_SIGN_APD_01', { kind: 'k3', text: 'WAJIB APD', w: 0.4, h: 0.28 }), 29.86, y + 2.45, 8.5, -Math.PI / 2);
  box(ws, X(29.4), y, Z(5.2), 0.4, 2.0, 1.0, mat('#7b858c', { metalness: 0.5 }), 'PROP_L1_PARTSRACK_01');
  for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) box(ws, X(29.38), y + 0.3 + k * 0.45, Z(5.25 + j * 0.24), 0.02, 0.15, 0.2, mat(['#2f80ed', '#27ae60', '#f39c12', '#ecf0f1'][j]), undefined, false);
  const wb = label('PRAKTIK: CRIMPING T568B · STRAIGHT vs CROSS · TES LAN', 2.4, 1.2, '#f7f7f2', '#1e3a5f', '#2f80ed'); wb.position.set(X(22.1) + 0.02, y + 1.0 + 0.6, Z(4.2)); wb.rotation.y = Math.PI / 2; wb.name = 'PROP_L1_WHITEBOARD_01'; ws.add(wb);
  put(ws, ND.cableTray('PROP_L1_CABLE_TRAY_01', { length: 7.4, width: 0.3, cables: true, hangers: true }), 26.0, y + 3.35, 4.5, 0);
  put(ws, ND.ceilingAP('PROP_L1_AP_WORKSHOP_01'), 26, y + 3.77, 7.6);
  box(ws, X(25.5), y + 2.6, Z(0.15), 1.0, 0.3, 0.22, M.white, 'PROP_L1_AC_WORKSHOP_01');
  put(ws, ND.apar('PROP_L1_APAR_WORKSHOP_01', { bracket: true }), 22.2, y + 0.75, 9.5, -Math.PI / 2);
  box(ws, X(26.8), y + 0.74, Z(8.6), 0.5, 0.3, 0.4, mat('#e4e4e0'), 'PROP_L1_PRINTER_02');

  // D9 Server room
  const sr = group(L, 'L1_SERVER_PROPS');
  const sy = y + 0.42;
  for (let i = 0; i < 4; i++) rack(sr, sy, 24.0 + i * 0.6, 17.0, `PROP_L1_SERVER_RACK_0${i + 1}`, 0.6, 1.0, 2.0, true, i === 3 ? 'idf' : 'server', 0);
  rack(sr, sy, 26.4, 17.0, 'PROP_L1_NETRACK_01', 0.6, 1.0, 2.0, true, 'network', 0.9);
  // UPS cabinet: rack-mount UPS modules + battery packs
  const upsG = group(sr, 'PROP_L1_UPS_01');
  const upsCab = put(upsG, ND.rack42U('PROP_L1_UPS_01_CABINET', { width: 0.6, depth: 1.0, doorOpen: 0 }), 28.3, sy, 18.0, 0);
  for (let u = 1; u <= 15; u += 2) ND.placeInRack(upsCab, ND.upsRack2U(`PROP_L1_UPS_MODULE_${u}`), u);
  ND.placeInRack(upsCab, ND.pdu1U('PROP_L1_UPS_PDU_01'), 18);
  ND.placeInRack(upsCab, ND.blankPanel('PROP_L1_UPS_BLANK_01', 4), 20);
  group(sr, 'PROP_L1_UPS_02');
  put(sr, ND.signPlate('PROP_L1_SIGN_SERVER_01', { kind: 'server', text: 'RUANG SERVER · AKSES TERBATAS', w: 0.7, h: 0.25 }), 26.0, y + 2.0, 12.07, Math.PI);
  put(sr, ND.signPlate('PROP_L1_SIGN_NOFOOD_01', { kind: 'nofood', w: 0.3, h: 0.3 }), 24.5, y + 1.6, 12.07, Math.PI);
  box(sr, X(29.1), sy, Z(13.3), 0.6, 1.9, 0.9, mat('#e7e9ea'), 'PROP_L1_PRECISION_AC_01'); /* stands on the raised floor (at Z12.55 it hung in the air over the door ramp) */ box(sr, X(29.1), sy, Z(18.05), 0.6, 1.9, 0.9, mat('#e7e9ea'), 'PROP_L1_PRECISION_AC_02');
  put(sr, ND.cableTray('PROP_L1_SRV_CABLE_TRAY_01', { length: 5.0, width: 0.4, cables: true, hangers: true }), 26.4, sy + 2.25, 17.5, 0);
  put(sr, ND.apar('PROP_L1_APAR_SERVER_01', { bracket: true }), 23.2, sy + 0.75, 12.6, -Math.PI / 2);
  box(sr, X(29.4), sy + 2.28, Z(12.25), 0.15, 0.1, 0.1, M.white, 'PROP_L1_CCTV_03');
  box(sr, X(27.1), y + 1.3, Z(11.85), 0.15, 0.2, 0.04, mat('#1d2024'), 'PROP_L1_ACCESS_PANEL_01');
  box(sr, X(27.13), y + 1.42, Z(11.84), 0.06, 0.03, 0.01, M.screenG, undefined, false);
  const srvSign = label('RUANG SERVER · AKSES TERBATAS', 1.6, 0.3, '#7a1010', '#fff', '#f1c40f'); srvSign.position.set(X(26.5), y + 2.35, Z(11.88)); srvSign.rotation.y = Math.PI; L.add(srvSign);

  // D10 toilets, stair, lift
  const tl = group(L, 'L1_CORE_PROPS');
  for (const [x0, tag] of [[10, 'M'], [12.5, 'F']] as [number, string][]) {
    for (let i = 0; i < 2; i++) { box(tl, X(x0 + 0.6), y, Z(18.6 - i * 1.6), 0.4, 0.42, 0.6, M.white, `PROP_L1_WC_${tag}_0${i + 1}`); /* 0.6 deep: ends at the cubicle partition instead of poking through it (flush faces z-fought) */ box(tl, X(x0 + 0.1), y, Z(17.6 - i * 1.6), 2.3, 2.0, 0.05, mat('#9fb4c2')); }
    box(tl, X(x0 + 0.15), y + 0.8, Z(13.3), 0.5, 0.1, 0.6, M.white, `PROP_L1_SINK_${tag}_01`);
    box(tl, X(x0 + 0.07), y + 1.2, Z(13.2), 0.02, 0.8, 0.8, mat('#cfe3ee', { metalness: 0.9, roughness: 0.05 }));
    const s = label(tag === 'M' ? 'PRIA' : 'WANITA', 0.6, 0.18, tag === 'M' ? '#1e4f8a' : '#8a1e5a', '#fff', '#fff'); s.position.set(X(x0 + 1.25), y + 2.3, Z(11.93)); s.rotation.y = Math.PI; tl.add(s);
  }
  buildStair(tl, y, h, 'L1_STAIR_U');
  const exitSign = label('EXIT  TANGGA DARURAT', 0.9, 0.22, '#0f7a3a', '#fff', '#fff'); exitSign.position.set(X(17), y + 2.35, Z(11.93)); exitSign.rotation.y = Math.PI; tl.add(exitSign);

  // D11 anchors
  const an = group(L, 'L1_ANCHORS');
  for (const [nm, ax, az] of ANCHORS) { const m = box(an, X(ax - 0.1), y + 0.9, Z(az - 0.1), 0.2, 0.2, 0.2, M.anchor, nm, false); m.userData.anchor = true; m.userData.noCollide = true; m.visible = false; }
  return L;
}

function buildStair(p: THREE.Object3D, y: number, h: number, name: string) {
  // U-shaped two-flight stair in X15-19, Z12-20: flight 1 up along +Z on west half (X15.2-16.4), landing at Z18.6-20, flight 2 back along -Z on east half (X17.6-18.8)
  const g = new THREE.Group(); g.name = name; p.add(g);
  const steps = 12, run = 6.0 / steps * 0.9, rise = h / 2 / steps;
  const sm = mat('#b7b2a8');
  for (let i = 0; i < steps; i++) box(g, X(15.2), y + rise * (i + 1) - 0.18, Z(12.6 + i * run), 1.2, 0.18, run + 0.02, sm, undefined, false);
  box(g, X(15.2), y + h / 2 - 0.2, Z(12.6 + steps * run), 3.6, 0.2, 20 - (12.6 + steps * run) - 0.1, sm, undefined, false);
  for (let i = 0; i < steps; i++) box(g, X(17.6), y + h / 2 + rise * (i + 1) - 0.18, Z(12.6 + (steps - 1 - i) * run), 1.2, 0.18, run + 0.02, sm, undefined, false);
  box(g, X(16.45), y, Z(12.6), 1.1, h, 0.08, mat('#d9d5cc')); // spine wall
  box(g, X(16.45), y, Z(12.6), 0.08, h, steps * run, mat('#d9d5cc'));
  box(g, X(17.47), y, Z(12.6), 0.08, h, steps * run, mat('#d9d5cc'));
}

/** landing doors of both lift shafts (two sliding stainless panels each, animated by game/vertical.ts),
 *  a hall-call panel between the shafts and a floor indicator above each door */
function liftLanding(L: THREE.Object3D, y: number, lv: number) {
  for (const c of [20, 22]) {
    for (const [side, x0] of [['A', c - 0.56], ['B', c]] as [string, number][]) {
      const d = box(L, X(x0), y + 0.12, Z(12.1), 0.56, 2.08, 0.04, M.metal, `LIFT_DOOR_L${lv}_${c}_${side}`);
      d.userData.noCollide = true; d.userData.x0 = d.position.x;
    }
    box(L, X(c - 0.6), y + 0.12 + 2.08, Z(12.08), 1.2, 0.06, 0.06, M.steel, undefined, false); // header
    const ind = box(L, X(c - 0.14), y + 2.32, Z(11.92), 0.28, 0.12, 0.02, mat('#101418', { emissive: '#ff5a3c', emissiveIntensity: 0.35 }), `LIFT_IND_L${lv}_${c}`);
    ind.userData.noCollide = true;
  }
  const call = box(L, X(20.9), y + 1.05, Z(11.92), 0.2, 0.32, 0.02, M.steel, `LIFT_CALL_L${lv}`); call.userData.noCollide = true;
  for (const [k, dy] of [[0, 0.08], [1, -0.08]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 14), mat('#e8eef2', { emissive: '#7fd0ff', emissiveIntensity: 0.25 })); b.rotation.x = Math.PI / 2; b.position.set(X(21), y + 1.21 + dy, Z(11.91)); b.name = `LIFT_BTN_L${lv}_${k ? 'DN' : 'UP'}`; L.add(b); }
}

function upperShell(L: THREE.Object3D, lv: number, kind: 'office' | 'hotel') {
  const { elev: y, h } = LEVELS[lv - 1];
  const tag = `L${lv}`;
  slab(L, y + 0.12, texMat(kind === 'office' ? TEX.carpet : TEX.floorTile, 12, 8), true, `${tag}_SLAB`);
  box(L, X(0), y, Z(0), 30, 0.12, 20, mat('#9a968e'), undefined, false).visible = false;
  // ext walls with windows
  const front: Opening[] = kind === 'hotel'
    ? [2.5, 7.5, 12.5, 17.5, 22.5, 27.5].map((c, i) => ({ c, w: 1.8, b: 0.8, t: 2.6, kind: 'window', name: `WIN_${tag}_${String(i + 1).padStart(2, '0')}` }) as Opening)
    : [2.5, 5.5, 8.5, 11.5, 14.5, 17.5, 20.5, 23.5, 26.5].map((c, i) => ({ c, w: 2.2, b: 0.8, t: 2.6, kind: 'window', name: `WIN_${tag}_${String(i + 1).padStart(2, '0')}` }) as Opening);
  wall(L, 0, 0, 30, 0, 0.25, y, h, extWallMat, front, `${tag}_WALL_FRONT`);
  wall(L, 0, 20, 30, 20, 0.25, y, h, extWallMat, kind === 'hotel' ? [{ c: 2.5, w: 1.5, b: 0.8, t: 2.4, kind: 'window' }, { c: 7.5, w: 1.5, b: 0.8, t: 2.4, kind: 'window' }] : [{ c: 3, w: 2, b: 0.8, t: 2.4, kind: 'window' }, { c: 7, w: 2, b: 0.8, t: 2.4, kind: 'window' }], `${tag}_WALL_SOUTH`);
  wall(L, 0, 0, 0, 20, 0.25, y, h, extWallMat, [{ c: 3, w: 1.6, b: 0.8, t: 2.4, kind: 'window' }, { c: 8, w: 1.6, b: 0.8, t: 2.4, kind: 'window' }, { c: 16, w: 1.6, b: 0.8, t: 2.4, kind: 'window' }], `${tag}_WALL_WEST`);
  wall(L, 30, 0, 30, 20, 0.25, y, h, extWallMat, [{ c: 3, w: 1.6, b: 0.8, t: 2.4, kind: 'window' }, { c: 7, w: 1.6, b: 0.8, t: 2.4, kind: 'window' }], `${tag}_WALL_EAST`);
  // core identical to L1: toilets/stair/lift + IDF/storage
  wall(L, 10, 12, 10, 20, 0.12, y, h, intWallMat, [], `${tag}_CORE_W`);
  wall(L, 12.5, 12, 12.5, 20, 0.12, y, h, intWallMat, [], `${tag}_TOILET_SPLIT`);
  wall(L, 15, 12, 15, 20, 0.12, y, h, intWallMat, [], `${tag}_STAIR_W`);
  wall(L, 19, 12, 19, 20, 0.12, y, h, intWallMat, [], `${tag}_LIFT_W`);
  wall(L, 21, 12, 21, 20, 0.12, y, h, intWallMat, [], `${tag}_LIFT_SPLIT`);
  wall(L, 23, 12, 23, 20, 0.12, y, h, intWallMat, [], `${tag}_LIFT_E`);
  wall(L, 26.5, 12, 26.5, 20, 0.12, y, h, intWallMat, [], `${tag}_IDF_E`);
  liftLanding(L, y, lv);
  buildStair(L, y, h, `${tag}_STAIR_U`);
  // IDF rack (per floor) — TKJ: distribution switch per floor
  rack(L, y + 0.12, 23.4, 18.6, `PROP_${tag}_IDF_RACK_01`, 0.6, 0.8, 1.2);
  box(L, X(24.3), y + 0.12, Z(19.0), 0.35, 0.6, 0.6, mat('#2b2f33'), `PROP_${tag}_IDF_UPS_01`);
  for (const [n, x0, x1, z0, z1] of [[`${tag}_TOILET_M`, 10, 12.5, 12, 20], [`${tag}_TOILET_F`, 12.5, 15, 12, 20], [`${tag}_STAIR`, 15, 19, 12, 20], [`${tag}_LIFT`, 19, 23, 12, 20], [`${tag}_IDF`, 23, 26.5, 12, 20]] as [string, number, number, number, number][]) zone(lv, n, x0, x1, z0, z1);
  return { y, h };
}

function buildOffice(root: THREE.Object3D, lv: number) {
  const tag = `L${lv}`;
  const L = group(root, tag);
  const { y, h } = upperShell(L, lv, 'office');
  const yy = y + 0.12;
  // meeting rooms
  wall(L, 8, 0, 8, 6, 0.12, y, h, intWallMat, [], `${tag}_MEET_A_E`);
  wall(L, 0, 6, 8, 6, 0.12, y, h, M.glass, [{ c: 4, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_MEET_A` }], `${tag}_MEET_A_S`);
  wall(L, 22, 0, 22, 6, 0.12, y, h, intWallMat, [], `${tag}_MEET_B_W`);
  wall(L, 22, 6, 30, 6, 0.12, y, h, M.glass, [{ c: 26, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_MEET_B` }], `${tag}_MEET_B_S`);
  wall(L, 0, 10, 30, 10, 0.12, y, h, intWallMat, [{ c: 8, w: 1.8, b: 0, t: 2.1, kind: 'door' }, { c: 21, w: 1.8, b: 0, t: 2.1, kind: 'door' }], `${tag}_WALL_Z10`);
  wall(L, 0, 12, 23, 12, 0.12, y, h, intWallMat, [{ c: 5, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_PANTRY` }, { c: 11.25, w: 0.9, b: 0, t: 2.1, kind: 'door' }, { c: 13.75, w: 0.9, b: 0, t: 2.1, kind: 'door' }, { c: 17, w: 1.2, b: 0, t: 2.1, kind: 'door', mat: doorSteel }, { c: 20, w: 1.1, b: 0, t: 2.1, kind: 'void' }, { c: 22, w: 1.1, b: 0, t: 2.1, kind: 'void' }], `${tag}_CORRIDOR_S`);
  wall(L, 23, 12, 30, 12, 0.12, y, h, intWallMat, [{ c: 24.75, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_IDF` }, { c: 28.25, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_STORAGE` }], `${tag}_IDF_N`);
  // 12 workstations
  let n = 1;
  // bench of back-to-back desks: row A (z6.9-7.6) faces south-sitters on the north side, row B (z7.6-8.3) north-facing sitters
  const flipped = new Set<number>();
  for (const z0 of [6.9, 7.6]) for (const x0 of [9.0, 10.6, 12.2, 15.6, 17.2, 18.8]) {
    const rowA = z0 < 7;
    desk(L, yy, x0, z0, 1.4, 0.7, `PROP_${tag}_DESK_${String(n).padStart(2, '0')}`);
    const g = pc(L, yy, x0 + 0.7, z0 + 0.35, `PROP_${tag}_PC_${String(n).padStart(2, '0')}`);
    if (rowA) { g.rotation.y = Math.PI; g.position.set(2 * X(x0 + 0.7), 0, 2 * Z(z0 + 0.35)); flipped.add(n); chair(L, yy, x0 + 0.7, z0 - 0.4, 'S', M.fabric2); put(L, ND.deskPhone(`PROP_${tag}_IPPHONE_${String(n).padStart(2, '0')}`), x0 + 0.2, yy + 0.76, z0 + 0.3, 0); }
    else chair(L, yy, x0 + 0.7, z0 + 0.98, 'N', M.fabric2);
    n++;
  }
  for (let i = 0; i < 2; i++) { const x0 = i ? 23 : 1; desk(L, yy, x0, 2.2, 6, 1.4, `PROP_${tag}_MEETING_TABLE_${i ? 'B' : 'A'}`, M.wood); for (let k = 0; k < 4; k++) { chair(L, yy, x0 + 0.9 + k * 1.4, 1.75, 'S'); chair(L, yy, x0 + 0.9 + k * 1.4, 4.05, 'N'); } }
  // second open-office block between the meeting rooms (x8-22, z0-6) + network endpoints
  for (const z0 of [0.9, 3.3]) for (const x0 of [9.2, 10.8, 12.4, 16.2, 17.8, 19.4]) {
    desk(L, yy, x0, z0, 1.4, 0.7, `PROP_${tag}_DESK_${String(n).padStart(2, '0')}`);
    pc(L, yy, x0 + 0.7, z0 + 0.35, `PROP_${tag}_PC_${String(n++).padStart(2, '0')}`); chair(L, yy, x0 + 0.7, z0 + 1.05, 'N', M.fabric2);
  }
  for (let k = 1; k < n; k++) { if (flipped.has(k)) continue; const d = L.getObjectByName(`PROP_${tag}_DESK_${String(k).padStart(2, '0')}`); if (!d) continue; const bb = new THREE.Box3().setFromObject(d); put(L, ND.deskPhone(`PROP_${tag}_IPPHONE_${String(k).padStart(2, '0')}`), bb.min.x - OX + 1.2, yy + 0.76, bb.min.z - OZ + 0.3, Math.PI); }
  for (const [x, z] of [[11, 3], [19, 3], [11, 8], [19, 8], [4, 3], [26, 3], [5, 16]] as [number, number][]) put(L, ND.ceilingAP(`PROP_${tag}_AP_${x}_${z}`), x, y + h - 0.23, z);
  printer(L, yy, 14.4, 5.2, `PROP_${tag}_PRINTER_01`);
  for (const x of [9.5, 13, 16.5, 20]) put(L, ND.wallNetworkOutlet(`PROP_${tag}_OUTLET_${x}`), x, yy + 0.35, 9.93);
  for (const [i, x0] of [[0, 1], [1, 23]] as [number, number][]) { wallTV(L, yy + 1.4, i ? 22.08 : 7.92, 2.9, i ? -Math.PI / 2 : Math.PI / 2, 1.6, `PROP_${tag}_MEET_TV_${i ? 'B' : 'A'}`); put(L, ND.floorBox(`PROP_${tag}_MEET_FLOORBOX_${i ? 'B' : 'A'}`), x0 + 3, yy, 3.2); put(L, ND.deskPhone(`PROP_${tag}_MEET_CONFPHONE_${i ? 'B' : 'A'}`), x0 + 3, yy + 0.76, 2.7, Math.PI); }
  cctv(L, y + h - 0.23, 0.4, 11, -Math.PI / 2, `PROP_${tag}_CCTV_W`); cctv(L, y + h - 0.23, 29.6, 11, Math.PI / 2, `PROP_${tag}_CCTV_E`);
  shelfUnit(L, yy, 26.7, 18.9, 3.1, 0.5, `PROP_${tag}_STORAGE_SHELF`);
  // pantry X0-10 Z12-20
  box(L, X(0.2), yy, Z(19.2), 5, 0.9, 0.6, mat('#3c4a52'), `PROP_${tag}_PANTRY_COUNTER`); box(L, X(5.4), yy, Z(19.1), 0.7, 1.8, 0.7, mat('#e8e8e8'), `PROP_${tag}_FRIDGE`);
  desk(L, yy, 3, 15, 2.4, 1.0, `PROP_${tag}_DINING_TABLE`, M.woodLight);
  ceilingLights(L, y, h, 0, 30, 0, 10, 3);
  for (const [nm, x0, x1, z0, z1] of [[`${tag}_OPEN_OFFICE`, 0, 30, 6, 10], [`${tag}_MEETING_A`, 0, 8, 0, 6], [`${tag}_MEETING_B`, 22, 30, 0, 6], [`${tag}_CORRIDOR`, 0, 30, 10, 12], [`${tag}_PANTRY`, 0, 10, 12, 20], [`${tag}_STORAGE`, 26.5, 30, 12, 20]] as [string, number, number, number, number][]) zone(lv, nm, x0, x1, z0, z1);
  return L;
}

// ---- small network/room devices not in the ND library ----
function cctv(p: THREE.Object3D, y: number, lx: number, lz: number, yaw: number, name: string) {
  const g = new THREE.Group(); g.name = name; g.position.set(X(lx), y, Z(lz)); g.rotation.y = yaw; p.add(g);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), M.white); base.position.y = -0.01; g.add(base);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), M.white); arm.position.set(0, -0.06, 0); g.add(arm);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), M.white); body.position.set(0, -0.13, -0.06); body.rotation.x = 0.35; g.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), M.black); lens.rotation.x = Math.PI / 2 + 0.35; lens.position.set(0, -0.17, -0.16); g.add(lens);
  return g;
}
function printer(p: THREE.Object3D, y: number, lx: number, lz: number, name: string) {
  const g = group(p, name);
  box(g, X(lx - 0.3), y, Z(lz - 0.3), 0.6, 0.75, 0.6, mat('#3a3f44'));
  box(g, X(lx - 0.28), y + 0.75, Z(lz - 0.28), 0.56, 0.32, 0.5, mat('#e9eaec'));
  box(g, X(lx - 0.25), y + 1.07, Z(lz - 0.25), 0.5, 0.06, 0.42, mat('#d0d3d6'));
  box(g, X(lx + 0.1), y + 1.0, Z(lz - 0.31), 0.14, 0.06, 0.02, mat('#0e1a24', { emissive: '#2bd46b', emissiveIntensity: 0.4 }), undefined, false);
  return g;
}
/** flat TV on a wall; yaw = direction the screen faces (0 = -Z) */
function wallTV(p: THREE.Object3D, y: number, lx: number, lz: number, yaw: number, w: number, name: string, screen: ND.ScreenKind = 'topology') {
  const g = new THREE.Group(); g.name = name; g.position.set(X(lx), y, Z(lz)); g.rotation.y = yaw; p.add(g);
  const h = w * 0.5625;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.05), M.black); frame.position.set(0, 0, -0.03); g.add(frame);
  const scr = ND.monitor(`${name}_PANEL`, { screen }); scr.visible = false; // keep library screen material warm
  const fm = mat('#10202c', { emissive: '#1d5a7a', emissiveIntensity: 0.55 }); fm.polygonOffset = true; fm.polygonOffsetFactor = -1; fm.polygonOffsetUnits = -2;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fm); face.position.set(0, 0, -0.062);   // 7 mm proud of the bezel (was 2 mm: z-fought at a distance) face.rotation.y = Math.PI; g.add(face);
  return g;
}
function shelfUnit(p: THREE.Object3D, y: number, lx: number, lz: number, w: number, d: number, name: string, boxes = true) {
  const g = group(p, name);
  for (const [dx, dz] of [[0, 0], [w - 0.04, 0], [0, d - 0.04], [w - 0.04, d - 0.04]]) box(g, X(lx + dx), y, Z(lz + dz), 0.04, 1.9, 0.04, M.steel, undefined, false);
  for (let k = 0; k < 4; k++) box(g, X(lx), y + 0.15 + k * 0.55, Z(lz), w, 0.03, d, M.steel, undefined, false);
  if (boxes) for (let k = 0; k < 4; k++) for (let m = 0; m < Math.floor(w / 0.45); m++) if ((k + m) % 3 !== 2) box(g, X(lx + 0.05 + m * 0.45), y + 0.18 + k * 0.55, Z(lz + 0.05), 0.38, 0.28, d - 0.1, mat(k % 2 ? '#c49a6c' : '#b7865a'), undefined, false);
  addCollider(X(lx), X(lx + w), Z(lz), Z(lz + d), y, y + 1.9);
  return g;
}

/**
 * Hotel room (5 m wide). front: rooms x01-x06 between corridor wall z=10 and window wall z=0 (depth 10);
 * back: x07/x08 between corridor wall z=12 and window wall z=20 (depth 8). Layout from the corridor:
 * entry vestibule (wardrobe) beside the bathroom, then the bedroom with the bed headboard on the side wall,
 * TV opposite the bed, work desk at the window with an in-wall AP + RJ45 outlet + IPTV set-top box (TKJ mission points).
 */
function hotelRoom(L: THREE.Object3D, lv: number, y: number, h: number, x0: number, back: boolean, no: string) {
  const tag = `L${lv}`, yy = y + 0.12, D = back ? 8 : 10;
  const zc = back ? 12 : 10, s = back ? 1 : -1;            // corridor wall z and direction into the room
  const zd = (d: number) => zc + s * d;                     // depth from corridor -> local z
  const zmin = (d0: number, d1: number) => Math.min(zd(d0), zd(d1));
  const r = group(L, `${tag}_ROOM_${no}_PROPS`);
  // bathroom partition: wall along X at depth 3 (x0..x0+2.6) + wall along Z at x0+2.6 (depth 0..3) with bath door
  wall(L, x0, zd(3), x0 + 2.6, zd(3), 0.1, y, h, mat('#dfe8ec'), [], `${tag}_BATH_${no}_A`);
  wall(L, x0 + 2.6, zmin(0, 3), x0 + 2.6, zmin(0, 3) + 3, 0.1, y, h, mat('#dfe8ec'), [{ c: zd(1.6), w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_BATH_${no}` }], `${tag}_BATH_${no}_B`);
  // bathroom fixtures (inside x0..x0+2.6, depth 0..3)
  box(r, X(x0 + 0.15), yy, Z(zmin(0.2, 0.85)), 0.4, 0.42, 0.65, M.white, `PROP_${tag}_WC_${no}`);
  box(r, X(x0 + 1.0), yy + 0.82, Z(zmin(0.1, 0.55)), 0.6, 0.1, 0.45, M.white, `PROP_${tag}_SINK_${no}`); box(r, X(x0 + 1.05), yy, Z(zmin(0.15, 0.5)), 0.5, 0.82, 0.35, M.wood, undefined, false);
  box(r, X(x0 + 1.05), yy + 1.2, Z(back ? zc + 0.07 : zc - 0.09), 0.5, 0.7, 0.02, mat('#cfe3ea', { metalness: 0.9, roughness: 0.05 }), undefined, false); // mirror
  box(r, X(x0 + 0.1), yy, Z(zmin(1.95, 2.9)), 1.2, 0.05, 0.95, mat('#cfd8dc'), `PROP_${tag}_SHOWER_${no}`);
  box(r, X(x0 + 1.3), yy, Z(zmin(1.95, 2.9)), 0.02, 2.0, 0.95, winGlass, undefined, false);
  // vestibule: wardrobe against the room-side wall x0+5
  box(r, X(x0 + 4.38), yy, Z(zmin(0.4, 2.4)), 0.55, 2.0, 2.0, M.wood, `PROP_${tag}_WARDROBE_${no}`);
  // bed: headboard on wall x0 (west), 1.8 wide x 2.0 long, centre at depth D-2.4
  const bc = D - 2.4;
  box(r, X(x0 + 0.06), yy, Z(zmin(bc - 1.0, bc + 1.0)), 0.1, 1.15, 2.0, M.wood, `PROP_${tag}_HEADBOARD_${no}`);
  box(r, X(x0 + 0.16), yy, Z(zmin(bc - 0.9, bc + 0.9)), 2.0, 0.45, 1.8, M.white, `PROP_${tag}_BED_${no}`);
  box(r, X(x0 + 0.16), yy + 0.45, Z(zmin(bc - 0.92, bc + 0.92)), 2.02, 0.12, 1.84, mat('#f3efe6'), undefined, false);
  box(r, X(x0 + 1.55), yy + 0.58, Z(zmin(bc - 0.95, bc + 0.95)), 0.45, 0.02, 1.9, mat('#7b2d26'), undefined, false); // runner
  for (const o of [-0.45, 0.45]) box(r, X(x0 + 0.22), yy + 0.57, Z(zd(bc + o) - 0.3), 0.35, 0.14, 0.6, M.white, undefined, false); // pillows
  for (const o of [-1.35, 1.35]) { box(r, X(x0 + 0.1), yy, Z(zd(bc + o) - 0.22), 0.45, 0.52, 0.44, M.wood, undefined, false); box(r, X(x0 + 0.2), yy + 0.52, Z(zd(bc + o) - 0.08), 0.16, 0.3, 0.16, mat('#f5e6c8', { emissive: '#ffcf7a', emissiveIntensity: 0.4 }), undefined, false); }
  // TV + IPTV STB on the opposite wall (x0+5), screen faces -X (west, toward the bed)
  wallTV(r, yy + 1.25, x0 + 4.92, zd(bc), Math.PI / 2, 1.1, `PROP_${tag}_TV_${no}`);
  box(r, X(x0 + 4.45), yy, Z(zd(bc) - 0.7), 0.5, 0.55, 1.4, M.wood, `PROP_${tag}_TV_CONSOLE_${no}`);
  box(r, X(x0 + 4.55), yy + 0.55, Z(zd(bc) - 0.1), 0.2, 0.04, 0.2, M.black, `PROP_${tag}_IPTV_STB_${no}`);
  // work desk at the window wall + chair facing the window
  const dz0 = back ? 20 - 0.62 : 0.12;
  desk(r, yy, x0 + 2.8, dz0, 1.4, 0.5, `PROP_${tag}_WORKDESK_${no}`, M.wood);
  chair(r, yy, x0 + 3.5, back ? 20 - 1.15 : 0.95, back ? 'S' : 'N', M.fabric2);
  put(r, ND.laptop(`PROP_${tag}_LAPTOP_${no}`, { screen: 'winbox' }), x0 + 3.5, yy + 0.76, back ? 20 - 0.4 : 0.38, back ? 0 : Math.PI);
  // network: in-room wall-plate AP + RJ45 outlet beside the desk (mission points)
  put(r, ND.wallAP(`PROP_${tag}_WALLAP_${no}`), x0 + 4.4, yy + 0.35, back ? 20 - 0.13 : 0.13, back ? 0 : Math.PI);
  put(r, ND.wallNetworkOutlet(`PROP_${tag}_OUTLET_${no}`), x0 + 2.6, yy + 0.35, back ? 20 - 0.13 : 0.13, back ? 0 : Math.PI);
  box(r, X(x0 + 0.08), yy + 2.3, Z(zd(bc) - 0.45), 0.22, 0.3, 0.9, mat('#eef0ee'), `PROP_${tag}_AC_${no}`, false); // split AC above the headboard
  // room number plate on the corridor side
  const pl = label(no, 0.3, 0.12, '#2b2f33', '#e9d8a6', '#c9a227'); pl.position.set(X(x0 + 4.55), yy + 1.5, Z(zc + (back ? -0.07 : 0.07))); if (back) pl.rotation.y = Math.PI; L.add(pl);
}

function buildHotelFloor(root: THREE.Object3D, lv: number) {
  const tag = `L${lv}`;
  const L = group(root, tag);
  const { y, h } = upperShell(L, lv, 'hotel');
  const yy = y + 0.12;
  wall(L, 0, 10, 30, 10, 0.12, y, h, intWallMat, [0, 5, 10, 15, 20, 25].map((x, i) => ({ c: x + 3.8, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_${lv}0${i + 1}` }) as Opening), `${tag}_CORRIDOR_N`);
  for (const x of [5, 10, 15, 20, 25]) wall(L, x, 0, x, 10, 0.12, y, h, intWallMat, [], `${tag}_ROOM_SPLIT_${x}`);
  wall(L, 0, 12, 23, 12, 0.12, y, h, intWallMat, [{ c: 3.8, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_${lv}07` }, { c: 8.8, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_${lv}08` }, { c: 11.25, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_HK` }, { c: 13.75, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_TOILET` }, { c: 17, w: 1.2, b: 0, t: 2.1, kind: 'door', mat: doorSteel }, { c: 20, w: 1.1, b: 0, t: 2.1, kind: 'void' }, { c: 22, w: 1.1, b: 0, t: 2.1, kind: 'void' }], `${tag}_CORRIDOR_S`);
  wall(L, 23, 12, 30, 12, 0.12, y, h, intWallMat, [{ c: 24.75, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_IDF` }, { c: 28.25, w: 0.9, b: 0, t: 2.1, kind: 'door', name: `DOOR_${tag}_LINEN` }], `${tag}_IDF_N`);
  wall(L, 5, 12, 5, 20, 0.12, y, h, intWallMat, [], `${tag}_BACKROOM_SPLIT`);
  for (let i = 0; i < 6; i++) hotelRoom(L, lv, y, h, i * 5, false, `${lv}0${i + 1}`);
  hotelRoom(L, lv, y, h, 0, true, `${lv}07`); hotelRoom(L, lv, y, h, 5, true, `${lv}08`);
  // housekeeping (x10-12.5) + linen (x26.5-30): shelves; corridor: ceiling APs + IP CCTV at both ends
  shelfUnit(L, yy, 10.15, 18.9, 2.2, 0.5, `PROP_${tag}_HK_SHELF`);
  shelfUnit(L, yy, 26.7, 18.9, 3.1, 0.5, `PROP_${tag}_LINEN_SHELF`);
  for (const x of [5, 15, 25]) put(L, ND.ceilingAP(`PROP_${tag}_CORRIDOR_AP_${x}`), x, y + h - 0.23, 11);
  cctv(L, y + h - 0.23, 0.4, 11, -Math.PI / 2, `PROP_${tag}_CCTV_W`); cctv(L, y + h - 0.23, 29.6, 11, Math.PI / 2, `PROP_${tag}_CCTV_E`);
  put(L, ND.apar(`PROP_${tag}_APAR`), 14.4, yy, 11.94, Math.PI);
  for (const [nm, x0, x1, z0, z1] of [[`${tag}_CORRIDOR`, 0, 30, 10, 12], [`${tag}_HOUSEKEEPING`, 10, 12.5, 12, 20], [`${tag}_TOILET`, 12.5, 15, 12, 20], [`${tag}_LINEN`, 26.5, 30, 12, 20]] as [string, number, number, number, number][]) zone(lv, nm, x0, x1, z0, z1);
  for (let i = 0; i < 6; i++) zone(lv, `${tag}_ROOM_${lv}0${i + 1}`, i * 5, i * 5 + 5, 0, 10);
  zone(lv, `${tag}_ROOM_${lv}07`, 0, 5, 12, 20); zone(lv, `${tag}_ROOM_${lv}08`, 5, 10, 12, 20);
  for (let x = 2.5; x < 30; x += 5) lampAt(L, y, h, x - 0.3, 10.7);
  return L;
}

function buildRoof(root: THREE.Object3D) {
  const R = group(root, 'ROOF');
  const y = ROOF_ELEV;
  box(R, X(0), y - 0.2, Z(0), 30, 0.25, 20, mat('#8f8c86'), 'ROOF_SLAB');
  // parapets stand 1 cm proud of the slab edge (flush faces z-fought along the whole roof line)
  for (const [x, z, w, d] of [[-0.01, -0.01, 30.02, 0.21], [-0.01, 19.8, 30.02, 0.21], [-0.01, -0.01, 0.21, 20.02], [29.8, -0.01, 0.21, 20.02]]) box(R, X(x), y, Z(z), w, 1.0, d, extWallMat);
  box(R, X(15), y, Z(12), 8, 3.0, 7.9, extWallMat, 'ROOF_MACHINE_ROOM');
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), mat('#f0f0f0', { side: THREE.DoubleSide }));
  dish.position.set(X(6), y + 1.4, Z(6)); dish.rotation.x = -Math.PI / 2 - 0.6; dish.name = 'PROP_ROOF_PARABOLA_01'; R.add(dish); cyl(R, X(6), y, Z(6), 0.05, 1.2, M.steel);
  cyl(R, X(24), y, Z(4), 0.06, 4.0, M.steel, 'PROP_ROOF_ANTENNA_01'); for (let k = 0; k < 3; k++) box(R, X(23.6), y + 2.5 + k * 0.5, Z(3.98), 0.8, 0.04, 0.04, M.steel, undefined, false);
  cyl(R, X(26), y, Z(14), 0.8, 2.0, mat('#3b78c2'), 'PROP_ROOF_TANDON_01', 20);
  for (let i = 0; i < 3; i++) box(R, X(3.55 + i * 3), y, Z(14.8), 0.9, 0.8, 0.4, mat('#e9e9e6'), `PROP_ROOF_AC_0${i + 1}`);
  // lightning rod + aviation light
  cyl(R, X(15.5), y + 3, Z(19.5), 0.03, 1.5, M.metal);
}

function buildExterior(root: THREE.Object3D) {
  const E = group(root, 'EXTERIOR');
  // facade cladding frames: vertical fins on upper floors for a recognisable silhouette
  const fin = mat('#2f3b44', { metalness: 0.5, roughness: 0.4 });
  for (let x = 0; x <= 30; x += 5) box(E, X(x - 0.15), 4.0, Z(-0.45), 0.3, 22.4, 0.35, fin);
  box(E, X(-0.3), 4.0 - 0.15, Z(-0.5), 30.6, 0.3, 0.6, mat('#2bd46b', { emissive: '#1a8f47', emissiveIntensity: 0.6 })); // green band (brand)
  box(E, X(-0.3), ROOF_ELEV + 0.85, Z(-0.3), 30.6, 0.4, 20.6, mat('#2f3b44', { metalness: 0.4 }));
  // D16 canopy
  const can = group(E, 'KANOPI_01'); box(can, X(4), 3.6, Z(-4), 6, 0.2, 4, mat('#2f3b44', { metalness: 0.4 })); for (const x of [4.2, 9.6]) cyl(can, X(x), 0.15, Z(-3.8), 0.1, 3.45, M.metal);
  box(can, X(4.2), 3.58, Z(-3.8), 5.6, 0.02, 3.6, M.lampOn, undefined, false);
  const fs = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshStandardMaterial({ map: signTex('NUSANTARA TECH HOTEL & OFFICE', '#13202b', '#ffffff', 1536, 205, '#2bd46b'), emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: signTex('NUSANTARA TECH HOTEL & OFFICE', '#13202b', '#ffffff', 1536, 205, '#2bd46b') }));
  fs.position.set(X(7.5), 4.8, Z(-0.66)); fs.rotation.y = Math.PI; fs.name = 'SIGNAGE_FACADE_01'; E.add(fs);
  const pm = group(E, 'PARKIR_MOTOR_01'); box(pm, X(12), 0, Z(-5), 12, 0.17, 4, texMat(TEX.paving, 3, 1));
  const gh = group(E, 'GENSET_HOUSE_01'); box(gh, X(31), 0, Z(15), 4, 3, 4, mat('#b9bcb8'), 'GENSET_HOUSE_01_MASS'); for (let i = 0; i < 6; i++) box(gh, X(35) + 0.01, 0.8 + i * 0.3, Z(15.6), 0.02, 0.15, 2.8, mat('#6d726f'), undefined, false);
  cyl(gh, X(34), 3, Z(18), 0.12, 1.2, M.steel); addCollider(X(31), X(35), Z(15), Z(19));
  // planters along front
  for (const x of [1, 13.5, 25.5]) { box(E, X(x), 0, Z(-1.6), 3.5, 0.5, 1, mat('#7f7a70')); for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), M.plant); b.position.set(X(x + 0.6 + k * 1.15), 0.85, Z(-1.1)); b.castShadow = true; E.add(b); } addCollider(X(x), X(x + 3.5), Z(-1.6), Z(-0.6), 0, 0.6); }
}

export function buildHotel(world: THREE.Object3D) {
  const root = group(world, 'BLD_HOTEL_NUSANTARA');
  buildL1(root);
  buildOffice(root, 2); buildOffice(root, 3);
  for (let lv = 4; lv <= 8; lv++) buildHotelFloor(root, lv);
  buildRoof(root);
  buildExterior(root);
  // wall/ceiling/desk-top gear never blocks walking (outlets, APs, phones, CCTV, TVs, laptops, floor boxes)
  root.traverse(o => { if (/OUTLET|WALLAP|_AP_|IPPHONE|PHONE|LAPTOP|FLOORBOX|CCTV|_TV_|IPTV|_AC_/.test(o.name)) o.userData.noCollide = true; });
  // upper floors outer skin tint (facade texture overlay for distance read)
  void facadeTex;
  return root;
}

export function levelAt(px: number, pz: number, py: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) if (py >= LEVELS[i].elev - 0.5) return i + 1;
  return 1;
}
export function insideHotel(px: number, pz: number) { return px > hotelBounds.x0 && px < hotelBounds.x1 && pz > hotelBounds.z0 && pz < hotelBounds.z1; }
export function zoneAt(px: number, pz: number, lv: number) { return hotelZones.find(z => z.level === lv && px >= z.x0 && px <= z.x1 && pz >= z.z0 && pz <= z.z1)?.name; }
