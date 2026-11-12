// Gedung Lab Praktik TKJ: a one-storey practice lab in the SMK Nusantara courtyard (Kota Selatan).
// It is NOT part of the Nusantara Tech internship: own room, own rack (SW-LAB + router segment 192.168.70.0/24),
// eight student PCs, a teacher's desk, a tool cabinet and a crimping table. Coordinates are city metres.
import * as THREE from 'three';
import { wx, wz } from '../data/city';
import { M, box, group, mat, addCollider, signTex } from './core';
import * as ND from '../assets/netdevices';
import { mikrotikBox } from './sites';

export const LAB_BOUNDS = { x0: 232, x1: 252, z0: 492, z1: 508 };
const H = 3.6, T = 0.2;
export const insideLab = (x: number, z: number) => { const X = x + 200, Z = z + 150; return X > LAB_BOUNDS.x0 && X < LAB_BOUNDS.x1 && Z > LAB_BOUNDS.z0 && Z < LAB_BOUNDS.z1; };
export interface LabSpots { guru: { x: number; z: number }; rack: { x: number; z: number }; tools: { x: number; z: number }; crimp: { x: number; z: number }; board: THREE.Mesh }

function put<T extends THREE.Object3D>(p: THREE.Object3D, o: T, X: number, y: number, Z: number, rot = 0): T { o.position.set(wx(X), y, wz(Z)); o.rotation.y = rot; p.add(o); return o; }
function wall(p: THREE.Object3D, x0: number, z0: number, w: number, d: number, m: THREE.Material, h = H, y = 0) {
  box(p, wx(x0), y, wz(z0), w, h, d, m); addCollider(wx(x0), wx(x0 + w), wz(z0), wz(z0 + d), y, y + h);
}
function desk(p: THREE.Object3D, x: number, z: number, w: number, d: number, name: string, top: THREE.Material = M.woodLight) {
  const g = group(p, name);
  box(g, wx(x), 0.72, wz(z), w, 0.04, d, top).userData.slab = true;
  for (const [dx, dz] of [[0.03, 0.03], [w - 0.07, 0.03], [0.03, d - 0.07], [w - 0.07, d - 0.07]]) box(g, wx(x + dx), 0, wz(z + dz), 0.04, 0.72, 0.04, M.steel, undefined, false);
  addCollider(wx(x), wx(x + w), wz(z), wz(z + d), 0, 0.8);
  return g;
}
function stool(p: THREE.Object3D, X: number, Z: number) {
  const g = group(p, 'FURN_CHAIR');
  box(g, wx(X - 0.18), 0.44, wz(Z - 0.18), 0.36, 0.05, 0.36, mat('#2c3e50'), undefined, false);
  for (const [dx, dz] of [[-0.15, -0.15], [0.12, -0.15], [-0.15, 0.12], [0.12, 0.12]]) box(g, wx(X + dx), 0, wz(Z + dz), 0.03, 0.44, 0.03, M.steel, undefined, false);
}
/** a student PC on a desk; `face` = the side the student sits on (screen faces them) */
function pcAt(p: THREE.Object3D, cx: number, cz: number, name: string, face: 'S' | 'N') {
  const g = group(p, name), top = 0.76, s = face === 'S' ? 1 : -1, rot = face === 'S' ? Math.PI : 0;
  put(g, ND.monitor(`${name}_MONITOR_1`, { screen: 'winbox' }), cx, top, cz - 0.16 * s, rot);
  put(g, ND.keyboard(`${name}_KEYBOARD`), cx - 0.05, top, cz - 0.01 * s, rot);
  put(g, ND.mouse(`${name}_MOUSE`), cx + 0.3, top, cz, rot);
  put(g, ND.pcTower(`${name}_CPU`), cx + 0.5, 0, cz - 0.3 * s, rot);
  return g;
}

export function buildLabTkj(parent: THREE.Object3D): { group: THREE.Group; pcs: { name: string; label: string; o: THREE.Object3D }[]; spots: LabSpots } {
  const L = group(parent, 'BLD_LAB_PRAKTIK_TKJ');
  const { x0, x1, z0, z1 } = LAB_BOUNDS;
  const wm = mat('#e8e2d4'), trim = mat('#2bd46b'), glass = mat('#9cc3d6', { metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.45 });
  // floor (vinyl) and roof
  const fl = box(L, wx(x0), 0.005, wz(z0), x1 - x0, 0.02, z1 - z0, mat('#c9ccc7', { roughness: 0.9 }), 'LAB_FLOOR', false); fl.userData.noCollide = true;
  box(L, wx(x0 - 0.4), H, wz(z0 - 0.4), x1 - x0 + 0.8, 0.3, z1 - z0 + 0.8, mat('#6f7a80'), 'LAB_ROOF');
  box(L, wx(x0 - 0.4), H + 0.3, wz(z0 - 0.4), x1 - x0 + 0.8, 0.12, z1 - z0 + 0.8, trim, 'LAB_ROOF_TRIM', false);
  // walls: north, south and west solid with window bands; east wall has the door opening (z 499.1 - 500.9)
  for (const [zz, nm] of [[z0, 'N'], [z1 - T, 'S']] as [number, string][]) {
    wall(L, x0, zz, x1 - x0, T, wm, 1.0);                                     // sill
    wall(L, x0, zz, x1 - x0, T, wm, 0.9, H - 0.9);                            // lintel
    for (let x = x0; x <= x1 - T; x += 4) wall(L, x, zz, T, T, wm, H - 1.9, 1.0);  // mullions
    const g = box(L, wx(x0), 1.0, wz(zz + 0.08), x1 - x0, H - 1.9, 0.04, glass, `LAB_WINDOW_${nm}`, false); addCollider(wx(x0), wx(x1), wz(zz), wz(zz + T), 1.0, H - 0.9); void g;
  }
  wall(L, x0, z0, T, z1 - z0, wm);
  wall(L, x1 - T, z0, T, 499.1 - z0, wm); wall(L, x1 - T, 500.9, T, z1 - 500.9, wm); wall(L, x1 - T, 499.1, T, 1.4, wm, H - 2.3, 2.3);
  // sign over the door and a door step
  const st = signTex('LAB PRAKTIK TKJ · SMK NUSANTARA', '#13202b', '#ffffff', 1024, 128, '#2bd46b');
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.75), new THREE.MeshStandardMaterial({ map: st, emissiveMap: st, emissive: '#ffffff', emissiveIntensity: 0.25 }));
  sg.position.set(wx(x1) + 0.03, 2.95, wz(500)); sg.rotation.y = Math.PI / 2; sg.name = 'LAB_SIGN'; L.add(sg);
  // ceiling lamps
  for (let x = x0 + 3; x < x1 - 1; x += 4.5) for (const z of [496, 504]) { const lp = box(L, wx(x), H - 0.04, wz(z), 1.2, 0.03, 0.3, M.lampOn, undefined, false); lp.userData.noCollide = true; }

  // teacher desk + whiteboard on the west wall
  desk(L, 233.6, 498.4, 1.8, 0.8, 'PROP_LAB_MEJA_GURU', M.wood);
  put(L, ND.laptop('PROP_LAB_GURU_LAPTOP', { screen: 'terminal' }), 234.5, 0.762, 498.8, -Math.PI / 2);
  stool(L, 233.1, 498.8);
  const bt = signTex('JOBSHEET · LAB PRAKTIK TKJ', '#f4f4f0', '#13202b', 1024, 512, '#2bd46b');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }));
  board.position.set(wx(x0 + T) + 0.02, 1.75, wz(500)); board.rotation.y = Math.PI / 2; board.name = 'PROP_LAB_PAPAN_TULIS'; L.add(board);
  box(L, wx(x0 + T), 0.92, wz(497.8), 0.06, 0.06, 4.4, M.steel, undefined, false);

  // eight student desks: four along the north wall (sit facing north), four along the south wall (sit facing south)
  const pcs: { name: string; label: string; o: THREE.Object3D }[] = [];
  let n = 1;
  for (const row of ['N', 'S'] as const) for (const xs of [236.6, 239.6, 242.6, 245.6]) {
    const nm = `PROP_LAB_PC_${String(n).padStart(2, '0')}`;
    const dz = row === 'N' ? z0 + T + 0.2 : z1 - T - 0.2 - 0.9;
    desk(L, xs, dz, 2.2, 0.9, `${nm}_DESK`, mat('#cfd6db'));
    const pz = row === 'N' ? dz + 0.45 : dz + 0.45, face = row === 'N' ? 'S' : 'N';
    const g = pcAt(L, xs + 0.7, pz, nm, face);
    stool(L, xs + 0.7, row === 'N' ? dz + 1.3 : dz - 0.4);
    put(L, ND.wallNetworkOutlet(`${nm}_OUTLET`, { cable: true }), xs + 1.6, 0.35, row === 'N' ? z0 + T + 0.02 : z1 - T - 0.02, row === 'N' ? Math.PI : 0);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshStandardMaterial({ map: signTex(`MEJA ${n}`, '#13202b', '#ffffff', 256, 72, '#f0c02e') }));
    lb.position.set(wx(xs + 1.1), 1.35, wz(row === 'N' ? z0 + T + 0.01 : z1 - T - 0.01)); lb.rotation.y = row === 'N' ? 0 : Math.PI; L.add(lb);
    pcs.push({ name: nm, label: `PC Lab ${String(n).padStart(2, '0')} · Meja ${n}`, o: g });
    n++;
  }
  // rack in the north-east corner, front facing south
  const rk = put(L, ND.rack42U('PROP_LAB_RACK_01', { populated: 'idf' }), 250.6, 0, 492.25, Math.PI);
  void rk; addCollider(wx(250.25), wx(250.95), wz(492.2), wz(493.3), 0, 2.1);
  // Fase 2: the lab hAP lite (RB941-2nD) on a wall shelf on the solid east wall just south of the rack (clear of the
  // north window band), ports facing the room (west); ether1 runs to SW-LAB, ether2 is patched to the desk of a student
  // doing the MikroTik step (src/game/labmt.ts)
  box(L, wx(x1 - T - 0.32), 1.08, wz(493.6), 0.32, 0.03, 0.7, M.wood, 'PROP_LAB_RAK_DINDING');
  put(L, mikrotikBox('PROP_LAB_MIKROTIK_01', 4, 'hAP lite · RB941-2nD'), x1 - T - 0.16, 1.11, 493.95, Math.PI / 2);
  // tool cabinet south of the door and the crimping table in the middle aisle
  box(L, wx(251.1), 0, wz(502.6), 0.6, 1.9, 1.8, mat('#8d949a', { metalness: 0.4 }), 'PROP_LAB_LEMARI_ALAT'); addCollider(wx(251.1), wx(251.8), wz(502.6), wz(504.4), 0, 1.9);
  const ct = desk(L, 247.0, 500.2, 2.0, 0.8, 'PROP_LAB_MEJA_CRIMPING', mat('#a7b0b6'));
  put(ct, ND.esdMat('PROP_LAB_CRIMPING_ESD', { w: 1.6, d: 0.6, color: 'green' }), 248.0, 0.761, 500.6, 0);
  put(ct, ND.crimpingTool('PROP_LAB_CRIMPING_TOOL'), 247.7, 0.764, 500.55, 0);
  put(ct, ND.lanTester('PROP_LAB_LAN_TESTER'), 248.3, 0.764, 500.6, 0);
  return { group: L, pcs, spots: { guru: { x: wx(235.2), z: wz(499.0) }, rack: { x: wx(250.5), z: wz(494.3) }, tools: { x: wx(250.6), z: wz(503.5) }, crimp: { x: wx(248.0), z: wz(501.6) }, board } };
}
