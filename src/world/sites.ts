// Fase 1 "Karier lapangan": four enterable places on empty lots (positions in data/sites.ts).
//   BLD_NUSATEKNIK  small field-tech office: order board, order desk, material shelves, workbench, motor parking
//   BLD_RUMAH_01    customer house: ONT + Wi-Fi router in the front room, smart TV, laptop, power outlets
//   BLD_KOS_01      2-storey kos, 6 rooms: router on the ground floor, one ceiling AP per floor, tenant laptops
//   BLD_WARNET_01   warnet: wall rack with router + 16-port switch, 8 gaming booths, cashier PC
// Same building language as the lab/kampung (pastel plaster, tile/flat roofs, core.ts materials); everything here is
// static and is baked per site by main.ts (bakeStatic), so a site costs a handful of draw calls and is frustum-culled
// as one block. Coordinates are city metres; helpers convert with wx/wz.
import * as THREE from 'three';
import { wx, wz } from '../data/city';
import { SITES, SITE_PCS, SITE_TV, SITE_AP_DEFS, KOS, FLOOR_Y, siteById, type SitePc, type SiteId, type Rect } from '../data/sites';
import { M, box, group, mat, texMat, TEX, signTex, canvasTex, addCollider, gableGeo } from './core';
import * as ND from '../assets/netdevices';

const T = 0.15;   // wall thickness
type P = THREE.Object3D;
/** box from its min corner in city coords */
const B = (p: P, X: number, y: number, Z: number, w: number, h: number, d: number, m: THREE.Material, name?: string, shadow = true) => box(p, wx(X), y, wz(Z), w, h, d, m, name, shadow);
/** decorative / walk-through: never becomes a collider */
const soft = <O extends THREE.Object3D>(o: O) => { o.userData.noCollide = true; return o; };
function put<O extends THREE.Object3D>(p: P, o: O, X: number, y: number, Z: number, rot = 0): O { o.position.set(wx(X), y, wz(Z)); o.rotation.y = rot; p.add(o); return o; }

const GLASS = mat('#8fb6c9', { metalness: 0.2, roughness: 0.12, transparent: true, opacity: 0.4 });
const FRAME = mat('#3b4148', { metalness: 0.4, roughness: 0.5 });
/** one shared material per surface kind (texture repeats once per 2 m: the UVs of each slab are scaled to its size),
 *  so every floor and yard of a site bakes into a single draw call per kind */
let _floorMats: Record<string, THREE.Material> | null = null;
const floorMat = (k: 'tile' | 'paving' | 'concrete') => {
  _floorMats ??= {};
  return (_floorMats[k] ??= k === 'paving' ? texMat(TEX.paving, 1, 1) : k === 'concrete' ? texMat(TEX.concrete, 1, 1) : texMat(TEX.floorTile, 1, 1));
};
/** a horizontal slab with world-scaled UVs (min corner in city coords) */
function slab(p: P, X: number, y: number, Z: number, w: number, h: number, d: number, k: 'tile' | 'paving' | 'concrete', name?: string) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * d / 2);
  const m = new THREE.Mesh(geo, floorMat(k)); m.position.set(wx(X) + w / 2, y + h / 2, wz(Z) + d / 2); m.receiveShadow = true; m.userData.noCollide = true; if (name) m.name = name; p.add(m); return m;
}

/** opening in a wall run: a..b along the run; solid below `sill` and above `top` (door: sill 0) */
interface Open { a: number; b: number; sill: number; top: number; glass?: boolean }
/** a straight wall from a0 to a1 (along X or Z) at c (the other axis, wall occupies c..c+T) */
function wallRun(p: P, axis: 'x' | 'z', a0: number, a1: number, c: number, y0: number, h: number, m: THREE.Material, opens: Open[] = [], t = T) {
  const seg = (s0: number, s1: number, yb: number, hh: number, mm = m) => {
    if (s1 - s0 < 0.01 || hh < 0.01) return;
    s0 -= 0.006; s1 += 0.006;   // overlap neighbours a little: no hairline seams where segments meet
    if (axis === 'x') B(p, s0, yb, c, s1 - s0, hh, t, mm); else B(p, c, yb, s0, t, hh, s1 - s0, mm);
  };
  let cur = a0;
  for (const o of [...opens].sort((u, v) => u.a - v.a)) {
    seg(cur, o.a, y0, h);
    seg(o.a, o.b, y0, o.sill);
    seg(o.a, o.b, y0 + o.top, h - o.top);
    if (o.glass) {
      const g = axis === 'x' ? B(p, o.a, y0 + o.sill, c + t / 2 - 0.02, o.b - o.a, o.top - o.sill, 0.04, GLASS, undefined, false) : B(p, c + t / 2 - 0.02, y0 + o.sill, o.a, 0.04, o.top - o.sill, o.b - o.a, GLASS, undefined, false);
      soft(g);
      // window frame
      if (axis === 'x') { soft(B(p, o.a, y0 + o.sill - 0.05, c - 0.04, o.b - o.a, 0.05, t + 0.08, FRAME)); soft(B(p, (o.a + o.b) / 2 - 0.025, y0 + o.sill, c + t / 2 - 0.03, 0.05, o.top - o.sill, 0.06, FRAME)); }
      else { soft(B(p, c - 0.04, y0 + o.sill - 0.05, o.a, t + 0.08, 0.05, o.b - o.a, FRAME)); soft(B(p, c + t / 2 - 0.03, y0 + o.sill, (o.a + o.b) / 2 - 0.025, 0.06, o.top - o.sill, 0.05, FRAME)); }
    }
    cur = o.b;
  }
  seg(cur, a1, y0, h);
}
const win = (a: number, w = 1.2, sill = 0.95, top = 2.15): Open => ({ a, b: a + w, sill, top, glass: true });
const door = (a: number, b: number, top = 2.15): Open => ({ a, b, sill: 0, top });

/** a desk with a collider (top at 0.76 above the floor y0) */
function desk(p: P, X: number, Z: number, w: number, d: number, y0: number, name: string, top: THREE.Material = M.woodLight) {
  const g = group(p, name);
  soft(B(g, X, y0 + 0.72, Z, w, 0.04, d, top));
  for (const [dx, dz] of [[0.03, 0.03], [w - 0.07, 0.03], [0.03, d - 0.07], [w - 0.07, d - 0.07]]) soft(B(g, X + dx, y0, Z + dz, 0.04, 0.72, 0.04, M.steel, undefined, false));
  addCollider(wx(X), wx(X + w), wz(Z), wz(Z + d), y0, y0 + 0.8);
  return g;
}
function chair(p: P, X: number, Z: number, y0: number, m: THREE.Material = mat('#2c3e50')) {
  const g = soft(group(p, 'FURN_CHAIR'));
  B(g, X - 0.2, y0 + 0.44, Z - 0.2, 0.4, 0.06, 0.4, m, undefined, false);
  for (const [dx, dz] of [[-0.17, -0.17], [0.14, -0.17], [-0.17, 0.14], [0.14, 0.14]]) B(g, X + dx, y0, Z + dz, 0.03, 0.44, 0.03, M.steel, undefined, false);
  return g;
}
/** ceiling lamp strip (emissive) */
const lamp = (p: P, X: number, Z: number, y: number, w = 1.2, d = 0.25) => soft(B(p, X - w / 2, y - 0.04, Z - d / 2, w, 0.035, d, M.lampOn, undefined, false));
/** wall power outlet (stopkontak) plate; side = which wall face it sits on */
function outlet(p: P, name: string, X: number, Z: number, y: number, face: 'N' | 'S' | 'E' | 'W') {
  const g = soft(group(p, name)); const w = 0.08, h = 0.12, t = 0.015;
  const plate = mat('#f4f4f2'), hole = mat('#2a2d31');
  if (face === 'N' || face === 'S') { const z = face === 'N' ? Z : Z - t; B(g, X - w / 2, y, z, w, h, t, plate, undefined, false); for (const k of [0, 1]) B(g, X - 0.012, y + 0.03 + k * 0.05, face === 'N' ? z + t : z - 0.002, 0.024, 0.024, 0.002, hole, undefined, false); }
  else { const x = face === 'W' ? X : X - t; B(g, x, y, Z - w / 2, t, h, w, plate, undefined, false); for (const k of [0, 1]) B(g, face === 'W' ? x + t : x - 0.002, y + 0.03 + k * 0.05, Z - 0.012, 0.002, 0.024, 0.024, hole, undefined, false); }
  return g;
}
/** a sign board with text (own material: one draw call) */
function sign(p: P, name: string, text: string, X: number, y: number, Z: number, w: number, h: number, rot: number, bg = '#13202b', fg = '#ffffff', accent = '#2bd46b') {
  const t = signTex(text, bg, fg, 1024, Math.round(1024 * h / w), accent);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.6 }));
  m.position.set(wx(X), y, wz(Z)); m.rotation.y = rot; m.name = name; p.add(m); return m;
}
/** consumer Wi-Fi router (white, three antennas) */
function homeRouter(name: string, color = '#f1f2f0') {
  const g = new THREE.Group(); g.name = name; const body = mat(color, { roughness: 0.5 }), dark = mat('#26292d');
  box(g, -0.11, 0, -0.075, 0.22, 0.035, 0.15, body);
  box(g, -0.09, 0.0352, -0.07, 0.12, 0.001, 0.008, mat('#38ff5c', { emissive: '#38ff5c', emissiveIntensity: 1.2 }), undefined, false);
  for (const x of [-0.09, 0, 0.09]) box(g, x - 0.006, 0.03, 0.06, 0.012, 0.17, 0.008, dark);
  return g;
}
/**
 * MikroTik desktop router (Fase 2): small white box, the port side faces -z with ether1..N labels, PWR/USR LEDs and a
 * link LED per port. RB951Ui-2HnD 113×138×29 mm, 5 ports (ether5 PoE out); hAP lite 113×89×28 mm, 4 ports (MikroTik
 * spec sheets in notes/research-grow.md §1 [2][3]). Origin: bottom centre.
 */
export function mikrotikBox(name: string, ports: 4 | 5, model: string) {
  const g = new THREE.Group(); g.name = name;
  const W = 0.113, H = ports === 5 ? 0.029 : 0.028, D = ports === 5 ? 0.138 : 0.089;
  const body = mat('#f3f4f2', { roughness: 0.45 });
  box(g, -W / 2, 0, -D / 2, W, H, D, body);
  // front (port side) decal: 1024 px across the 113 mm face
  const PX = 1024, PY = Math.round(PX * H / W);
  const tex = canvasTex(PX, PY, c => {
    c.fillStyle = '#f3f4f2'; c.fillRect(0, 0, PX, PY);
    const pw = 118, ph = 104, gap = 14, x0 = PX - 24 - ports * pw - (ports - 1) * gap, y0 = PY - ph - 34;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (let i = 0; i < ports; i++) {
      const x = x0 + i * (pw + gap);
      c.fillStyle = '#1b1d20'; c.fillRect(x, y0, pw, ph);
      c.fillStyle = '#0a0b0c'; c.fillRect(x + 16, y0 + 18, pw - 32, ph - 40); c.fillRect(x + 40, y0 + ph - 22, pw - 80, 14);
      c.fillStyle = '#c9a43a'; for (let k = 0; k < 8; k++) c.fillRect(x + 22 + k * 10, y0 + 20, 5, 12);
      c.fillStyle = '#38ff5c'; c.beginPath(); c.arc(x + 14, y0 - 12, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#26292d'; c.font = 'bold 30px Arial, sans-serif'; c.fillText(`ether${i + 1}`, x + pw / 2 + 8, y0 - 6);
      if (ports === 5 && i === 4) { c.font = 'bold 20px Arial, sans-serif'; c.fillText('PoE out', x + pw / 2, PY - 10); }
      if (i === 0) { c.font = 'bold 20px Arial, sans-serif'; c.fillText('Internet', x + pw / 2, PY - 10); }
    }
    c.textAlign = 'left';
    c.fillStyle = '#26292d'; c.font = 'bold 44px Arial, sans-serif'; c.fillText('MikroTik', 24, 62);
    c.font = '24px Arial, sans-serif'; c.fillText(model, 24, 96);
    c.fillStyle = '#1b1d20'; c.beginPath(); c.arc(60, PY - 52, 26, 0, Math.PI * 2); c.fill();          // DC jack
    c.fillStyle = '#9aa1a8'; c.beginPath(); c.arc(60, PY - 52, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#26292d'; c.font = 'bold 20px Arial, sans-serif'; c.fillText('PWR', 116, PY - 64); c.fillText('USR', 116, PY - 20);
    c.fillStyle = '#38ff5c'; c.beginPath(); c.arc(176, PY - 71, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2f8bff'; c.beginPath(); c.arc(176, PY - 27, 8, 0, Math.PI * 2); c.fill();
  }, false);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.08, roughness: 0.5 }));
  face.position.set(0, H / 2, -D / 2 - 0.0005); face.rotation.y = Math.PI; face.name = `${name}_FRONT`; g.add(face);
  // glowing power LED (a lit dot that reads from across the room)
  box(g, -W / 2 + 0.018, H * 0.55, -D / 2 - 0.0012, 0.0022, 0.0022, 0.001, mat('#38ff5c', { emissive: '#38ff5c', emissiveIntensity: 1.6 }), `${name}_LED_PWR`, false);
  box(g, -W / 2 + 0.006, H + 0.0002, -D / 2 + 0.01, 0.03, 0.0004, 0.012, mat('#d8dad7'), undefined, false);   // label sticker on top
  return g;
}
/** flat-panel smart TV on a low cabinet; screen faces the yaw direction */
function smartTv(name: string) {
  const g = new THREE.Group(); g.name = name;
  box(g, -0.55, 0.06, -0.03, 1.1, 0.64, 0.05, mat('#111316', { roughness: 0.35 }));
  const scr = box(g, -0.53, 0.08, -0.034, 1.06, 0.6, 0.004, mat('#0e1a24', { emissive: '#2a6fd1', emissiveIntensity: 0.45, roughness: 0.25 }), name + '_SCREEN', false); void scr;
  box(g, -0.15, 0, -0.1, 0.3, 0.02, 0.18, mat('#1c1e21'));
  box(g, -0.03, 0.02, -0.02, 0.06, 0.06, 0.03, mat('#1c1e21'));
  return g;
}
/** ONT drop-cable termination box on the wall (roset / OTP) */
function roset(p: P, name: string, X: number, y: number, Z: number) { const g = soft(group(p, name)); B(g, X, y, Z - 0.06, 0.035, 0.12, 0.12, mat('#f3f3f1')); B(g, X + 0.035, y + 0.05, Z - 0.005, 0.004, 0.02, 0.01, mat('#2fa64a')); return g; }

/** a PC or laptop set on its desk; returns the group the PC list points at */
function pcSet(p: P, pc: SitePc, deskY: number, screen: ND.ScreenKind = 'status') {
  const g = group(p, pc.name);
  const fx = -Math.sin(pc.yaw), fz = -Math.cos(pc.yaw), rx = fz, rz = -fx;   // screen facing (toward the user) and the user's right
  const at = (f: number, r: number): [number, number] => [pc.X + fx * f + rx * r, pc.Z + fz * f + rz * r];
  if (pc.kind === 'laptop') { const [x, z] = at(-0.06, 0); put(g, ND.laptop(`${pc.name}_BODY`, { screen }), x, deskY, z, pc.yaw); const [mx, mz] = at(0.12, 0.3); put(g, ND.mouse(`${pc.name}_MOUSE`), mx, deskY, mz, pc.yaw); return g; }
  { const [x, z] = at(-0.18, 0); put(g, ND.monitor(`${pc.name}_MONITOR_1`, { screen }), x, deskY, z, pc.yaw); }
  { const [x, z] = at(0.06, -0.05); put(g, ND.keyboard(`${pc.name}_KEYBOARD`), x, deskY, z, pc.yaw); }
  { const [x, z] = at(0.08, 0.32); put(g, ND.mouse(`${pc.name}_MOUSE`), x, deskY, z, pc.yaw); }
  { const [x, z] = at(-0.15, 0.62); put(g, ND.pcTower(`${pc.name}_CPU`), x, deskY - 0.76, z, pc.yaw); }
  return g;
}

/** floor, roof slab, ceiling lamps shared by every building; returns the root group */
function shell(parent: P, id: SiteId, floorKind: 'tile' | 'concrete') {
  const s = siteById(id), r = s.rect, W = r.x1 - r.x0, D = r.z1 - r.z0;
  const g = group(parent, s.bld);
  slab(g, r.x0, 0, r.z0, W, FLOOR_Y, D, floorKind, `${s.bld}_LANTAI`);
  for (const l of s.lots) slab(g, l.x0, 0, l.z0, l.x1 - l.x0, FLOOR_Y - 0.005, l.z1 - l.z0, 'paving', `${s.bld}_HALAMAN`);
  return { g, s, r, W, D };
}
/** the four outer walls of one storey: front wall gets the door + windows, the rest windows */
function outerWalls(g: P, r: Rect, front: 'N' | 'S', y0: number, h: number, m: THREE.Material, frontOpens: Open[], backOpens: Open[] = [], sideOpens: Open[] = []) {
  const zf = front === 'N' ? r.z0 : r.z1 - T, zb = front === 'N' ? r.z1 - T : r.z0;
  wallRun(g, 'x', r.x0, r.x1, zf, y0, h, m, frontOpens);
  wallRun(g, 'x', r.x0, r.x1, zb, y0, h, m, backOpens);
  wallRun(g, 'z', r.z0 + T, r.z1 - T, r.x0, y0, h, m, sideOpens);
  wallRun(g, 'z', r.z0 + T, r.z1 - T, r.x1 - T, y0, h, m, sideOpens);
}
/** flat concrete roof with a parapet (collides, so a third-person camera stops under it) */
function flatRoof(g: P, r: Rect, y: number, m: THREE.Material, trim: THREE.Material) {
  B(g, r.x0 - 0.3, y, r.z0 - 0.3, r.x1 - r.x0 + 0.6, 0.3, r.z1 - r.z0 + 0.6, mat('#8d8f8c'));
  for (const [x, z, w, d] of [[r.x0 - 0.3, r.z0 - 0.3, r.x1 - r.x0 + 0.6, 0.15], [r.x0 - 0.3, r.z1 + 0.15, r.x1 - r.x0 + 0.6, 0.15], [r.x0 - 0.3, r.z0 - 0.3, 0.15, r.z1 - r.z0 + 0.6], [r.x1 + 0.15, r.z0 - 0.3, 0.15, r.z1 - r.z0 + 0.6]] as const) B(g, x, y + 0.3, z, w, 0.45, d, m);
  soft(B(g, r.x0 - 0.32, y + 0.7, r.z0 - 0.32, r.x1 - r.x0 + 0.64, 0.06, r.z1 - r.z0 + 0.64, trim, undefined, false));
}

// =================================================================================================
function buildNusaTeknik(parent: P) {
  const { g, r } = shell(parent, 'nusateknik', 'tile');
  const h = 3.4, wm = mat('#e8e2d4'), accent = mat('#1f5f8b');
  outerWalls(g, r, 'S', 0, h, wm, [win(51.2, 2.2), win(54.2, 2.2), door(57.4, 58.6, 2.3), win(60, 2.2), win(63, 2.2)], [win(60.5, 1.4, 1.4, 2.2)], [win(121.5, 1.6)]);
  flatRoof(g, r, h, wm, accent);
  // facade band + sign
  soft(B(g, r.x0 - 0.05, h - 0.75, r.z1, r.x1 - r.x0 + 0.1, 0.6, 0.06, accent, undefined, false));
  sign(g, 'PROP_NUSATEKNIK_PAPAN_NAMA', 'NUSA TEKNIK · JASA INSTALASI JARINGAN & CCTV', 58, h - 0.45, r.z1 + 0.08, 9, 0.5, 0, '#1f5f8b', '#ffffff', '#f0c02e');
  // canopy over the door
  B(g, 56.6, 2.55, 128, 2.8, 0.1, 1.2, mat('#3b4148'));
  // interior lamps
  for (const x of [53, 58, 63]) for (const z of [121, 125]) lamp(g, x, z, h);
  // order board (whiteboard with the day's work orders) on the north wall
  const bt = signTex('PAPAN ORDER · NUSA TEKNIK', '#f4f4f0', '#13202b', 1024, 512, '#1f5f8b');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.3), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }));
  board.position.set(wx(55), 1.75, wz(r.z0 + T) + 0.02); board.name = 'PROP_NUSATEKNIK_PAPAN_ORDER'; g.add(board);
  soft(B(g, 53.4, 1.05, r.z0 + T, 3.2, 0.05, 0.08, M.steel));
  for (let k = 0; k < 6; k++) soft(B(g, 53.8 + k * 0.45, 1.6 + (k % 2) * 0.35, r.z0 + T + 0.01, 0.3, 0.22, 0.01, mat(['#fff3a8', '#ffd2d2', '#cfe8ff'][k % 3]), undefined, false));
  // order desk (meja order) with the office PC and the phone
  const od = desk(g, 52.4, 121.6, 2.0, 0.8, FLOOR_Y, 'PROP_NUSATEKNIK_MEJA_ORDER', M.wood);
  put(od, ND.monitor('PROP_NUSATEKNIK_MEJA_ORDER_MONITOR', { screen: 'status' }), 53.2, FLOOR_Y + 0.76, 122.2, 0);   // the admin sits north of the desk
  put(od, ND.keyboard('PROP_NUSATEKNIK_MEJA_ORDER_KB'), 53.2, FLOOR_Y + 0.76, 121.9, 0);
  put(od, ND.deskPhone('PROP_NUSATEKNIK_MEJA_ORDER_TELEPON'), 54.0, FLOOR_Y + 0.76, 122.0, 0);
  chair(g, 53.2, 123.0, FLOOR_Y); chair(g, 53.4, 120.9, FLOOR_Y, mat('#1f5f8b'));
  // material cabinet (lemari material): open steel shelving on the west wall with stock
  const lm = group(g, 'PROP_NUSATEKNIK_LEMARI_MATERIAL');
  const steel = mat('#8d949a', { metalness: 0.4, roughness: 0.5 });
  for (const zz of [118.3, 122.1]) B(lm, 50.2, FLOOR_Y, zz, 0.55, 2.0, 0.04, steel);
  for (const y of [0.1, 0.6, 1.1, 1.6, 1.98]) soft(B(lm, 50.2, FLOOR_Y + y, 118.3, 0.55, 0.03, 3.84, steel, undefined, false));
  addCollider(wx(50.15), wx(50.8), wz(118.25), wz(122.2), 0, 2.2);
  put(lm, ND.cableReel('PROP_NUSATEKNIK_REEL_UTP'), 50.48, FLOOR_Y + 0.13, 118.9, Math.PI / 2);
  put(lm, ND.utpBox('PROP_NUSATEKNIK_KARDUS_UTP_1'), 50.48, FLOOR_Y + 0.63, 119.0, Math.PI / 2);
  put(lm, ND.utpBox('PROP_NUSATEKNIK_KARDUS_UTP_2'), 50.48, FLOOR_Y + 0.63, 119.5, Math.PI / 2);
  for (let k = 0; k < 4; k++) put(lm, ND.ont(`PROP_NUSATEKNIK_STOK_ONT_${k + 1}`), 50.48, FLOOR_Y + 1.13, 119.0 + k * 0.32, Math.PI / 2);
  put(lm, ND.rj45Bag('PROP_NUSATEKNIK_RJ45'), 50.48, FLOOR_Y + 1.63, 119.2, Math.PI / 2);
  for (let k = 0; k < 3; k++) put(lm, homeRouter(`PROP_NUSATEKNIK_STOK_ROUTER_${k + 1}`), 50.48, FLOOR_Y + 0.63, 120.5 + k * 0.45, Math.PI / 2);
  put(lm, ND.cableReel('PROP_NUSATEKNIK_REEL_DROP'), 50.48, FLOOR_Y + 0.13, 120.8, Math.PI / 2);
  sign(g, 'PROP_NUSATEKNIK_LABEL_LEMARI', 'LEMARI MATERIAL', 50.82, 2.35, 120.2, 1.2, 0.22, Math.PI / 2, '#13202b', '#ffffff', '#f0c02e');
  // workbench (meja kerja) on the north wall east: crimping, tester, meter
  const wb = desk(g, 61.2, r.z0 + T + 0.05, 2.4, 0.8, FLOOR_Y, 'PROP_NUSATEKNIK_MEJA_KERJA', mat('#a7b0b6'));
  put(wb, ND.esdMat('PROP_NUSATEKNIK_ESD', { w: 1.8, d: 0.6, color: 'blue' }), 62.4, FLOOR_Y + 0.761, 118.65, 0);
  put(wb, ND.crimpingTool('PROP_NUSATEKNIK_TANG_CRIMP'), 61.9, FLOOR_Y + 0.764, 118.6, 0);
  put(wb, ND.lanTester('PROP_NUSATEKNIK_LAN_TESTER'), 62.5, FLOOR_Y + 0.764, 118.6, 0);
  put(wb, ND.multimeter('PROP_NUSATEKNIK_MULTIMETER'), 63.1, FLOOR_Y + 0.764, 118.6, 0);
  chair(g, 62.4, 119.6, FLOOR_Y);
  // waiting bench + water dispenser near the door, APAR on the wall
  B(g, 63.6, FLOOR_Y, 126.9, 1.8, 0.45, 0.5, mat('#5d6a74'), 'PROP_NUSATEKNIK_BANGKU');
  B(g, 50.4, FLOOR_Y, 126.6, 0.35, 1.1, 0.35, mat('#e9eef2'), 'PROP_NUSATEKNIK_DISPENSER');
  put(g, ND.apar('PROP_NUSATEKNIK_APAR', { bracket: true }), 65.84, FLOOR_Y + 0.35, 126.0, Math.PI / 2);
  outlet(g, 'PROP_NUSATEKNIK_STOPKONTAK_01', 54.0, r.z0 + T, FLOOR_Y + 0.3, 'N');
  outlet(g, 'PROP_NUSATEKNIK_STOPKONTAK_02', 62.0, r.z0 + T, FLOOR_Y + 1.0, 'N');
  // second staff desk (survey reports), stock cartons, a K3 notice and a plant: a working office, not an empty hall
  const sd = desk(g, 58.6, 121.8, 1.6, 0.8, FLOOR_Y, 'PROP_NUSATEKNIK_MEJA_STAF');
  put(sd, ND.laptop('PROP_NUSATEKNIK_MEJA_STAF_LAPTOP', { screen: 'topology' }), 59.4, FLOOR_Y + 0.76, 122.3, Math.PI);
  chair(g, 59.4, 123.2, FLOOR_Y);
  const kardus = mat('#b08a5a');
  for (const [x, z, y, w] of [[51.0, 124.6, 0, 0.6], [51.0, 125.3, 0, 0.6], [51.05, 124.65, 0.45, 0.5]] as const) B(g, x, FLOOR_Y + y, z, w, 0.45, 0.6, kardus, 'PROP_NUSATEKNIK_KARDUS_MATERIAL');
  put(g, ND.signPlate('PROP_NUSATEKNIK_RAMBU_K3', { kind: 'k3' }), r.x0 + T + 0.01, 1.7, 125.0, -Math.PI / 2);
  B(g, 65.2, FLOOR_Y, 119.0, 0.4, 0.45, 0.4, M.pot, 'PROP_NUSATEKNIK_POT'); soft(B(g, 65.15, FLOOR_Y + 0.45, 118.95, 0.5, 0.6, 0.5, M.plant));
  // front door: dark aluminium frame + an open glass leaf
  for (const x of [57.33, 58.6]) soft(B(g, x, FLOOR_Y, r.z1 - T - 0.02, 0.07, 2.3, T + 0.04, FRAME));
  soft(B(g, 57.33, 2.3 + FLOOR_Y - 0.15, r.z1 - T - 0.02, 1.34, 0.07, T + 0.04, FRAME));
  soft(B(g, 57.4, FLOOR_Y, r.z1 - T - 0.95, 0.04, 2.1, 0.9, GLASS));
  // parking lines + sign
  for (let k = 0; k < 6; k++) soft(B(g, 60.4 + k * 1.2, FLOOR_Y - 0.004, 130.8, 0.06, 0.006, 3.6, M.marking, undefined, false));
  sign(g, 'PROP_NUSATEKNIK_PARKIR_MOTOR', 'PARKIR MOTOR TEKNISI', 64.1, 2.4, 128.08, 2.0, 0.3, 0, '#13202b', '#ffffff', '#f0c02e');
  return g;
}

// =================================================================================================
function buildRumah(parent: P) {
  const { g, r } = shell(parent, 'rumah', 'tile');
  const h = 3.2, wm = mat('#efe3c2'), trim = mat('#8a5a35');
  // outer walls: front (north) has the door and two windows
  outerWalls(g, r, 'N', 0, h, wm, [win(114.7, 1.1), door(116.2, 117.2, 2.15), win(118.6, 1.6), win(121.6, 1.6)], [win(115.4, 1.0, 1.3, 2.1), win(121, 1.0, 1.3, 2.1)], [win(587.4, 1.0)]);
  // inner partition z=585 (ruang tamu | kamar + dapur) and x=119 (kamar | dapur)
  wallRun(g, 'x', r.x0 + T, r.x1 - T, 585, 0, h, M.wallInt, [door(117.5, 118.4), door(120.2, 121.1)]);
  wallRun(g, 'z', 585 + T, r.z1 - T, 119, 0, h, M.wallInt);
  // ceiling + tiled gable roof
  B(g, r.x0, h, r.z0, r.x1 - r.x0, 0.12, r.z1 - r.z0, M.wallInt).userData.slab = true;   // ceiling (stops the third-person camera)
  const roof = new THREE.Mesh(gableGeo(r.x1 - r.x0, r.z1 - r.z0, 2.2, 0.6), texMat(TEX.roofTile, 1, 1)); roof.position.set(wx((r.x0 + r.x1) / 2), h + 0.12, wz((r.z0 + r.z1) / 2)); roof.castShadow = true; roof.receiveShadow = true; roof.name = 'BLD_RUMAH_01_ATAP'; g.add(roof);
  soft(B(g, r.x0 - 0.6, h - 0.1, r.z0 - 0.62, r.x1 - r.x0 + 1.2, 0.22, 0.08, trim, undefined, false));
  // teras canopy, door leaf (open, inside) and house number
  B(g, 115.6, 2.6, 578.6, 2.4, 0.08, 1.4, mat('#9aa0a3'));
  soft(B(g, 117.22, FLOOR_Y, r.z0 + T, 0.95, 2.05, 0.05, mat('#6b4226')));   // door leaf opened flat against the inside of the front wall
  sign(g, 'PROP_RUMAH_01_NOMOR', 'No. 17 · Kel. Hendra', 119.4, 2.45, r.z0 - 0.02, 1.4, 0.26, Math.PI, '#f4f1ea', '#13202b', '#8a5a35');
  // low front fence with a gate and a carport opening
  // low front fence: a plastered kerb wall, steel bars and a top rail (see-through, like a real pagar)
  const fence = mat('#e9e9e4'), bar = mat('#3b4148', { metalness: 0.5, roughness: 0.5 });
  for (const [a, b] of [[111.6, 115.6], [118.0, 124.2]] as const) {
    B(g, a, 0, 576.0, b - a, 0.45, 0.14, fence, 'PROP_RUMAH_01_PAGAR');
    soft(B(g, a, 1.08, 576.04, b - a, 0.05, 0.06, bar, undefined, false));
    for (let x = a + 0.2; x < b - 0.1; x += 0.3) soft(B(g, x, 0.45, 576.05, 0.025, 0.63, 0.025, bar, undefined, false));
    addCollider(wx(a), wx(b), wz(576.0), wz(576.14), 0, 1.1);
  }
  for (const x of [111.6, 115.5, 118, 124.1]) B(g, x, 0, 575.95, 0.2, 1.2, 0.24, mat('#d8d4cc'));
  // ceiling lamps
  for (const [x, z] of [[119, 582.6], [116.6, 588.6], [121.4, 588.6]]) lamp(g, x, z, h, 0.5, 0.5);

  // ---- front room: ONT on a small cabinet where the fibre drop enters, the family's Wi-Fi router beside it
  B(g, r.x0 + T, FLOOR_Y, 580.35, 0.5, 0.65, 1.3, mat('#8a5a35'), 'PROP_RUMAH_01_BUFET');
  put(g, ND.ont('PROP_RUMAH_01_ONT'), 114.5, FLOOR_Y + 0.65, 580.85, -Math.PI / 2);
  put(g, homeRouter('PROP_RUMAH_01_ROUTER_WIFI'), 114.48, FLOOR_Y + 0.65, 581.35, -Math.PI / 2);
  roset(g, 'PROP_RUMAH_01_ROSET', r.x0 + T, FLOOR_Y + 1.25, 580.75);
  soft(B(g, r.x0 + T + 0.01, FLOOR_Y + 0.68, 580.72, 0.012, 0.58, 0.012, mat('#f2c230'), undefined, false));   // yellow drop/patch cord down the wall
  outlet(g, 'PROP_RUMAH_01_STOPKONTAK_01', r.x0 + T, 581.9, FLOOR_Y + 0.75, 'W');
  // smart TV on its cabinet against the east wall, sofa facing it, coffee table
  B(g, 123.25, FLOOR_Y, 581.6, 0.6, 0.5, 2.0, mat('#5b4636'), 'PROP_RUMAH_01_MEJA_TV');
  put(g, smartTv(SITE_TV.name), SITE_TV.X, FLOOR_Y + 0.5, SITE_TV.Z, Math.PI / 2);
  outlet(g, 'PROP_RUMAH_01_STOPKONTAK_02', r.x1 - T, 583.9, FLOOR_Y + 0.35, 'E');
  const sofa = mat('#3d4f63');
  B(g, 116.6, FLOOR_Y, 581.5, 0.9, 0.42, 2.2, sofa, 'PROP_RUMAH_01_SOFA'); B(g, 116.6, FLOOR_Y + 0.42, 581.5, 0.25, 0.45, 2.2, sofa);
  B(g, 118.3, FLOOR_Y, 582.1, 1.3, 0.4, 0.8, mat('#a8805a'), 'PROP_RUMAH_01_MEJA_TAMU');
  soft(B(g, 117.9, FLOOR_Y + 0.002, 581.3, 3.4, 0.01, 2.6, mat('#8c3b3b', { roughness: 1 }), 'PROP_RUMAH_01_KARPET', false));
  // ---- bedroom (kamar depan in the order): bed, wardrobe, study desk with the family laptop
  B(g, r.x0 + T, FLOOR_Y, 588.6, 1.6, 0.45, 3.1, mat('#e7e1d6'), 'PROP_RUMAH_01_RANJANG'); B(g, r.x0 + T, FLOOR_Y + 0.45, 591.4, 1.6, 0.5, 0.3, mat('#8a5a35'));
  B(g, r.x0 + T, FLOOR_Y, 585.4, 0.6, 2.0, 1.5, mat('#9c7a54'), 'PROP_RUMAH_01_LEMARI');
  desk(g, 116.8, 591.05, 1.4, 0.8, FLOOR_Y, 'PROP_RUMAH_01_MEJA_BELAJAR');
  chair(g, 117.5, 590.4, FLOOR_Y);
  outlet(g, 'PROP_RUMAH_01_STOPKONTAK_03', 118.5, r.z1 - T, FLOOR_Y + 0.3, 'S');
  // ---- kitchen
  B(g, 119.2 + T, FLOOR_Y, 591.2, 4.5, 0.85, 0.6, mat('#d8d4cc'), 'PROP_RUMAH_01_DAPUR_MEJA');
  B(g, 122.8, FLOOR_Y, 588.2, 0.8, 1.7, 0.7, mat('#e9eef2'), 'PROP_RUMAH_01_KULKAS');
  outlet(g, 'PROP_RUMAH_01_STOPKONTAK_04', 121.0, r.z1 - T, FLOOR_Y + 1.1, 'S');
  // motor-friendly carport: a parked family scooter is not needed; a plant pot and a clothes line instead
  B(g, 113.0, 0, 577.2, 0.4, 0.5, 0.4, M.pot); soft(B(g, 113.0, 0.5, 577.2, 0.4, 0.35, 0.4, M.plant));
  return g;
}

// =================================================================================================
function buildKos(parent: P) {
  const { g, r } = shell(parent, 'kos', 'tile');
  const st = KOS.storey, up = KOS.upper, wm = mat('#cfe5c6'), trim = mat('#2f6b4f'), S2 = KOS.stair;
  // ---- ground floor shell: entrance door + windows on the street side
  outerWalls(g, r, 'S', 0, st, wm, [win(132.6, 1.6), door(135, 136.2, 2.15), win(137.2, 1.6), win(141.8, 0.9, 1.6, 2.2)], [win(133.4, 1.0, 1.4, 2.2), win(137.4, 1.0, 1.4, 2.2), win(145.4, 0.8, 1.6, 2.2)], [win(306.2, 1.0, 1.3, 2.2)]);
  // ---- upper floor shell (sits on the slab, walls from the slab bottom to the roof)
  outerWalls(g, r, 'S', st, st, wm, [win(132.6, 1.6, 1.1, 2.3), win(136.6, 1.6, 1.1, 2.3), win(146, 1.0, 1.1, 2.3)], [win(133.4, 1.0, 1.55, 2.35), win(137.4, 1.0, 1.55, 2.35), win(145.4, 0.8, 1.7, 2.35)], [win(306.2, 1.0, 1.45, 2.35)]);
  soft(B(g, r.x0 - 0.05, st - 0.05, r.z1, r.x1 - r.x0 + 0.1, 0.25, 0.08, trim, undefined, false));   // floor band
  flatRoof(g, r, st * 2, wm, trim);
  sign(g, 'PROP_KOS_01_PAPAN_NAMA', 'KOS MAWAR · PUTRA · TERIMA BULANAN', 140, st + 0.55, r.z1 + 0.1, 5.2, 0.6, 0, '#2f6b4f', '#ffffff', '#f0c02e');
  B(g, 134.2, 2.55, 316, 2.8, 0.1, 1.1, mat('#3b4148'));   // canopy
  // ---- upper slab with the stair opening (collides: the upper floor stands on it, the ground floor ceiling stops cameras)
  const slabM = mat('#d8d4cc');
  for (const [x0, x1, z0, z1] of [[r.x0, r.x1, r.z0, S2.z0], [r.x0, S2.x0, S2.z0, r.z1], [S2.x1, r.x1, S2.z0, r.z1]]) {
    const s = B(g, x0, st, z0, x1 - x0, 0.15, z1 - z0, slabM); s.userData.slab = true;
    slab(g, x0, up - 0.002, z0, x1 - x0, 0.004, z1 - z0, 'tile');
  }
  // ---- stair along the south wall, west -> east: 16 risers of 0.2 m, treads 0.25 m (walk-through: kosFeet gives the height)
  const stairM = mat('#b9b4aa');
  for (let i = 0; i < S2.steps; i++) soft(B(g, S2.x0 + i * 0.25, 0, S2.z0, 0.25, FLOOR_Y + (i + 1) * (st / S2.steps), S2.z1 - S2.z0, stairM, i === 0 ? 'PROP_KOS_01_TANGGA' : undefined));
  // stair side wall (north side of the flight): full height on the ground floor, a 1 m rail on the upper floor
  B(g, S2.x0 + 0.4, 0, S2.z0 - 0.12, S2.x1 - S2.x0 - 0.4, up + 1.0, 0.12, M.wallInt);
  B(g, S2.x0 - 0.12, up, S2.z0, 0.12, 1.0, S2.z1 - S2.z0, trim);          // upper rail at the top of the opening (west)
  B(g, S2.x1, 0, S2.z0, 0.15, st, S2.z1 - S2.z0 + 0.05, M.wallInt);      // closes the high end of the flight from the ground floor
  // ---- rooms (north half, 4 m wide) and the corridor wall at z 309, on both floors
  const rooms = KOS.roomX;
  for (const [fl, y0] of [[0, 0], [1, st]] as const) {
    const fy = fl ? up : FLOOR_Y;
    wallRun(g, 'x', r.x0 + T, r.x1 - T, 309, y0, st, M.wallInt, [door(133.4, 134.2), door(137.4, 138.2), door(141.4, 142.2), door(145.6, 146.4)]);
    for (const x of [136, 140, 144]) wallRun(g, 'z', r.z0 + T, 309, x, y0, st, M.wallInt);
    // corridor lamps
    for (const x of [134, 142, 146]) lamp(g, x, 310.1, y0 + st - (fl ? 0 : 0.0), 0.8, 0.2);
    lamp(g, 136, 313.5, y0 + st, 1.0, 0.25);
    rooms.forEach((a, i) => {
      const k = i + 1 + fl * 3, locked = KOS.locked.includes(k);
      B(g, a + 1.6, y0 + 2.32, 309 + T, 0.4, 0.14, 0.012, mat('#2f6b4f'), `PROP_KOS_01_NOMOR_K${k}`, false);   // room number plate (plain: keeps the batch to one draw call)
      if (locked) {
        B(g, a + 1.4, fy, 309.03, 0.8, 2.05, 0.08, mat('#6b4226'), `PROP_KOS_01_PINTU_K${k}_TERKUNCI`);
        B(g, a + 1.6, fy + 1.35, 309 + T + 0.075, 0.4, 0.12, 0.012, M.red, `PROP_KOS_01_INFO_K${k}_KOSONG`, false);   // red 'kosong' plate on the locked door
        return;
      }
      soft(B(g, a + 2.2, fy, 308.2, 0.05, 2.05, 0.8, mat('#6b4226')));                                        // door leaf, open into the room
      B(g, a + 0.15, fy, r.z0 + T, 1.0, 0.45, 2.0, mat(['#e7e1d6', '#d6e2ea', '#ead6d6'][i % 3]), `PROP_KOS_01_KASUR_K${k}`);
      B(g, a + 3.25, fy, 306.6, 0.6, 1.9, 1.2, mat('#9c7a54'), `PROP_KOS_01_LEMARI_K${k}`);
      desk(g, a + 2.55, r.z0 + T + 0.02, 1.3, 0.6, fy, `PROP_KOS_01_MEJA_K${k}`);
      chair(g, a + 3.2, 305.35, fy);
      outlet(g, `PROP_KOS_01_STOPKONTAK_K${k}`, a + 2.3, r.z0 + T, fy + 0.3, 'N');
      lamp(g, a + 2, 306.5, y0 + st, 0.4, 0.4);
    });
    // bathroom bay (east, north half): a basin and a water tub
    B(g, 146.6, fy, r.z0 + T, 1.2, 0.7, 0.8, mat('#9fc4d8'), `PROP_KOS_01_BAK_MANDI_${fl + 1}`);
  }
  // ---- upper floor south side: drying area (jemuran) and a shared table
  const jm = mat('#9aa3aa', { metalness: 0.4, roughness: 0.5 });
  for (const x of [133.0, 136.6]) { B(g, x, up, 312.4, 0.05, 1.5, 0.05, jm, 'PROP_KOS_01_JEMURAN'); B(g, x, up, 314.0, 0.05, 1.5, 0.05, jm); }
  for (const z of [312.6, 313.2, 313.8]) soft(B(g, 133.0, up + 1.45, z, 3.65, 0.02, 0.02, jm, undefined, false));
  for (const [x, z, c] of [[133.6, 312.62, '#c0392b'], [134.5, 313.22, '#2f6fb3'], [135.6, 312.62, '#f0c02e'], [134.9, 313.82, '#ecf0f1']] as const) soft(B(g, x, up + 0.85, z - 0.01, 0.55, 0.6, 0.02, mat(c), undefined, false));
  B(g, 138.2, up, 313.2, 1.2, 0.74, 0.7, M.woodLight, 'PROP_KOS_01_MEJA_BERSAMA');
  // ---- ground floor common room: the router on a wall shelf, a bench, the motor parking out front
  B(g, r.x0 + T, FLOOR_Y + 1.45, 312.6, 0.3, 0.03, 0.8, M.woodLight, 'PROP_KOS_01_RAK_ROUTER');
  put(g, mikrotikBox('PROP_KOS_01_ROUTER', 4, 'hAP lite · RB941-2nD'), 132.3, FLOOR_Y + 1.48, 313.0, -Math.PI / 2);
  outlet(g, 'PROP_KOS_01_STOPKONTAK_ROUTER', r.x0 + T, 313.6, FLOOR_Y + 1.6, 'W');
  soft(B(g, r.x0 + T + 0.01, FLOOR_Y + 1.48, 313.25, 0.01, 1.7, 0.012, mat('#2f6fb3'), undefined, false));   // LAN cables up the wall to the APs
  B(g, 137.4, FLOOR_Y, 314.9, 2.0, 0.45, 0.5, mat('#5d6a74'), 'PROP_KOS_01_BANGKU');
  sign(g, 'PROP_KOS_01_INFO_WIFI', 'WI-FI: KOS_MAWAR · TANYA PENJAGA', 132.17, FLOOR_Y + 1.9, 311.8, 1.1, 0.2, Math.PI / 2, '#f4f1ea', '#13202b', '#2f6b4f');
  // ceiling APs (one per floor) in the corridors
  for (const d of SITE_AP_DEFS.filter(x => x.site === 'kos')) put(g, ND.ceilingAP(`PROP_KOS_01_${d.id.replace(/-/g, '_')}`), d.X, (d.floor === 2 ? st * 2 : st) - 0.001, d.Z, 0);
  // motor parking lines in the yard
  for (let k = 0; k < 7; k++) soft(B(g, 141 + k * 1.2, FLOOR_Y - 0.004, 317.4, 0.06, 0.006, 3.2, M.marking, undefined, false));
  return g;
}

// =================================================================================================
function buildWarnet(parent: P) {
  const { g, r } = shell(parent, 'warnet', 'concrete');
  const h = 3.4, wm = mat('#dfe3e6'), accent = mat('#c0392b');
  // shop front: big tinted glass either side of the glass door
  outerWalls(g, r, 'S', 0, h, wm, [{ a: 344.6, b: 350.9, sill: 0.4, top: 2.6, glass: true }, door(351.4, 352.6, 2.4), { a: 353.1, b: 359.4, sill: 0.4, top: 2.6, glass: true }]);
  flatRoof(g, r, h, wm, accent);
  soft(B(g, r.x0 - 0.05, h - 0.8, r.z1, r.x1 - r.x0 + 0.1, 0.7, 0.08, accent, undefined, false));
  sign(g, 'PROP_WARNET_01_PAPAN_NAMA', 'WARNET SINAR · GAME ONLINE · 24 JAM', 352, h - 0.45, r.z1 + 0.13, 9.5, 0.55, 0, '#c0392b', '#ffffff', '#f0c02e');
  // dark interior walls + lamps
  const dark = mat('#2b3138');
  soft(B(g, r.x0 + T, 2.9, r.z0 + T, r.x1 - r.x0 - 2 * T, 0.02, r.z1 - r.z0 - 2 * T, mat('#1f242a'), undefined, false));
  for (const x of [347, 352, 357]) for (const z of [306, 310.5, 314.5]) lamp(g, x, z, 2.9, 1.0, 0.18);
  // booths: west wall (4) and north wall (4); partitions between them
  for (const pc of SITE_PCS.filter(p => p.site === 'warnet' && !/KASIR/.test(p.name))) {
    const west = pc.yaw < 0;
    const dx = west ? 344.2 : pc.X - 0.95, dz = west ? pc.Z - 0.95 : 303.2, w = west ? 0.8 : 1.9, d = west ? 1.9 : 0.8;
    desk(g, dx, dz, w, d, FLOOR_Y, `${pc.name}_DESK`, dark);
    pcSet(g, pc, FLOOR_Y + 0.76);
    const [cx, cz] = west ? [345.55, pc.Z] : [pc.X, 304.55];
    chair(g, cx, cz, FLOOR_Y, mat('#8c1c1c'));
    put(g, ND.wallNetworkOutlet(`${pc.name}_OUTLET`, { cable: true }), west ? r.x0 + T + 0.02 : pc.X + 0.7, 0.35, west ? pc.Z + 0.7 : r.z0 + T + 0.02, west ? -Math.PI / 2 : Math.PI);
  }
  for (let k = 1; k <= 4; k++) B(g, r.x0 + T, FLOOR_Y, 304.05 + k * 2 - 0.02 - (k === 4 ? 0.1 : 0), 1.2, 1.3, 0.04, dark, 'PROP_WARNET_01_SEKAT');
  for (let k = 0; k <= 4; k++) B(g, 347.05 + k * 2 - 0.02 - (k === 4 ? 0.1 : 0), FLOOR_Y, r.z0 + T, 0.04, 1.3, 1.2, dark, 'PROP_WARNET_01_SEKAT');
  // cable trunking along the walls at desk height
  soft(B(g, r.x0 + T, FLOOR_Y + 0.3, 303.5, 0.06, 0.06, 9, mat('#e9e9e4'), undefined, false));
  soft(B(g, 345, FLOOR_Y + 0.3, r.z0 + T, 12.5, 0.06, 0.06, mat('#e9e9e4'), undefined, false));
  // wall rack in the north-east corner: router (top) + 16-port switch + patch panel; front faces south
  const rk = put(g, ND.wallRack('PROP_WARNET_01_RAK_DINDING', { u: 9, populated: false, doorOpen: 1.2 }), 358.6, FLOOR_Y + 1.25, r.z0 + T, Math.PI);
  ND.placeInRack(rk, ND.patchPanel24('PROP_WARNET_01_PATCH_PANEL'), 8);
  ND.placeInRack(rk, ND.switch16('PROP_WARNET_01_SW_16PORT'), 6);
  // MikroTik RB951Ui-2HnD (desktop box) on a 1U cantilever shelf where the 1U router used to sit; port side to the front
  const shelf = ND.placeInRack(rk, ND.rackShelf1U('PROP_WARNET_01_ROUTER_SHELF'), 3);
  const rtr = mikrotikBox('PROP_WARNET_01_ROUTER', 5, 'RB951Ui-2HnD');
  rtr.position.set(0, (shelf.userData as { shelfTopY?: number }).shelfTopY ?? 0.002, -0.35 + 0.012 + 0.138 / 2); shelf.add(rtr);
  soft(B(g, 358.45, FLOOR_Y + 1.7, r.z0 + T + 0.02, 0.3, 1.0, 0.06, mat('#2f6fb3'), undefined, false));   // cable bundle into the rack
  addCollider(wx(358.25), wx(358.95), wz(r.z0 + T), wz(r.z0 + T + 0.5), FLOOR_Y + 1.2, FLOOR_Y + 1.8);
  sign(g, 'PROP_WARNET_01_LABEL_RAK', 'RAK JARINGAN · SW-WARNET', 358.6, FLOOR_Y + 2.15, r.z0 + T + 0.01, 1.0, 0.16, 0, '#13202b', '#ffffff', '#2bd46b');
  // cashier counter by the door (billing PC faces the cashier standing north of it)
  B(g, 355.4, FLOOR_Y, 312.6, 4.3, 1.0, 0.6, mat('#5b4636'), 'PROP_WARNET_01_MEJA_KASIR');
  const kasir = SITE_PCS.find(p => /KASIR/.test(p.name))!;
  pcSet(g, kasir, FLOOR_Y + 1.0, 'status');
  chair(g, kasir.X, 311.9, FLOOR_Y, mat('#2c3e50'));
  sign(g, 'PROP_WARNET_01_LABEL_KASIR', 'KASIR · BILLING · Rp5.000/JAM', 357.5, 2.3, r.z1 - T - 0.01, 2.2, 0.3, Math.PI, '#f4f1ea', '#13202b', '#c0392b');
  put(g, ND.apar('PROP_WARNET_01_APAR', { bracket: true }), 359.84, FLOOR_Y + 0.35, 309.0, Math.PI / 2);
  // AC units on the east wall
  for (const z of [306, 311]) B(g, r.x1 - T - 0.25, 2.35, z, 0.25, 0.3, 0.9, mat('#f4f4f2'), 'PROP_WARNET_01_AC');
  outlet(g, 'PROP_WARNET_01_STOPKONTAK_KASIR', r.x1 - T, 313.6, FLOOR_Y + 1.1, 'E');
  // motor parking lines
  for (let k = 0; k < 6; k++) soft(B(g, 340.6 + k * 1.2, FLOOR_Y - 0.004, 318.6, 0.06, 0.006, 3.4, M.marking, undefined, false));
  return g;
}

export interface SitesBuilt { groups: Record<SiteId, THREE.Group>; pcs: { name: string; label: string; o: THREE.Object3D }[] }
/** build all four places under one parent; the PC list feeds main.ts PCS (PcOS, nearPc) */
export function buildSites(parent: P): SitesBuilt {
  const root = group(parent, 'FASE1_LOKASI');
  const groups = { nusateknik: buildNusaTeknik(root), rumah: buildRumah(root), kos: buildKos(root), warnet: buildWarnet(root) } as Record<SiteId, THREE.Group>;
  // laptops on the tenant/family desks (warnet PCs were placed with their booths)
  for (const pc of SITE_PCS.filter(p => p.kind === 'laptop')) pcSet(groups[pc.site], pc, (pc.floor === 2 ? KOS.upper : FLOOR_Y) + 0.76, 'terminal');
  const pcs: SitesBuilt['pcs'] = [];
  for (const pc of SITE_PCS) { const o = groups[pc.site].getObjectByName(pc.name); if (o) pcs.push({ name: pc.name, label: pc.label, o }); }
  root.updateMatrixWorld(true);
  return { groups, pcs };
}
/** is a world (three.js) point inside one of the site buildings */
export function insideSite(x: number, z: number) { const X = x + 200, Z = z + 150; return SITES.some(s => X > s.rect.x0 && X < s.rect.x1 && Z > s.rect.z0 && Z < s.rect.z1); }
