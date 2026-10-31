// FASE F — Kota Selatan (v9 expansion, city Z 300..600): kampung C/D with bike-sized gangs, ruko rows on
// Jl. Anggrek / Jl. Dahlia / Jl. Kemuning, mid-rise offices & apartments, lapangan bola, Masjid Al-Ikhlas,
// Taman Dahlia, SMK Nusantara, perumahan. No toll road, no market.
// Uses its own RNG so the original district (and everything seeded after it) stays byte-identical.
// Static meshes: auto colliders (physics.buildAutoColliders) + baked per half (west/east) in main.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TOWERS_S, wx, wz, type Tower } from '../data/city';
import { TEX, texMat, M, box, boxC, cyl, group, mat, signTex, gableGeo, addCollider } from './core';
import { facadeMats, WIN_LIT } from './buildings';
import { STREET_LAMP } from './daynight';

let s = 90210;
const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a: number, b: number) => a + rnd() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const WALLS = ['#efe3c2', '#cfe5c6', '#c8dcea', '#f3e08a', '#f0d0b0', '#e4e4e4', '#f2c9c0'].map(c => mat(c));
const RUKO_COL = ['#e8c07d', '#d9d4c7', '#a7c4b5', '#e3a587', '#c9d6df', '#f0e2b6', '#b8b0d0', '#e6cfa1'].map(c => mat(c));
const AWN = ['#2f6fb3', '#c0392b', '#2e8b57', '#d35400'].map(c => mat(c));
const DOORS = ['#6b4226', '#3f5f7a', '#2f6b4f'].map(c => mat(c));
const WIN_D = mat('#2b3a44', { roughness: 0.3 });
const GLASS_D = mat('#41505a', { roughness: 0.2, metalness: 0.3 });
const SHOP_GLOW = mat('#ffe7b8', { emissive: '#ffcf7a', emissiveIntensity: 0.35 });
const SHOP_NAMES = ['SERVIS LAPTOP', 'TOKO KOMPUTER', 'WARUNG KOPI', 'APOTEK', 'LAUNDRY', 'FOTOKOPI', 'BENGKEL MOTOR', 'KONTER PULSA', 'RM SUNDA', 'BAKERY', 'TOKO BANGUNAN', 'KLINIK'];
const SIGN_BG = ['#b71c1c', '#0d47a1', '#1b5e20', '#f9a825', '#4a148c', '#006064'];
// shared sign materials (12): signs repeat along the rows but stay few draw calls
const SIGN_M = SHOP_NAMES.map((n, i) => new THREE.MeshStandardMaterial({ map: signTex(n, SIGN_BG[i % SIGN_BG.length], '#fff', 512, 96, '#ffffff') }));
const SIGN_GEO = new THREE.PlaneGeometry(4.6, 0.8);

/** pedestrian routes (city coords + walk height) for the new sidewalks / gangs / park */
export const SOUTH_PEDS: [number, number, number, number, number][] = [
  [10, 325.5, 190, 325.5, 0.15], [210, 334.5, 390, 334.5, 0.15], [92, 336.3, 184, 336.3, 0.03], [210, 454.5, 314, 454.5, 0.15], [92, 456.3, 184, 456.3, 0.03],
  [28, 337, 28, 443, 0.03], [52, 457, 52, 563, 0.03], [2, 390, 72, 390, 0.03], [189.5, 310, 189.5, 590, 0.15], [210.5, 310, 210.5, 590, 0.15],
  [100, 489, 176, 489, 0.03], [326.3, 460, 326.3, 556, 0.03], [2, 510, 72, 510, 0.03], [86, 340, 86, 560, 0.15],
];

export interface SouthResult { west: THREE.Group; east: THREE.Group; peds: [number, number, number, number, number][] }

export function buildSouth(world: THREE.Object3D): SouthResult {
  const root = group(world, 'FASE_F_KOTA_SELATAN');
  const west = group(root, 'SELATAN_BARAT'), east = group(root, 'SELATAN_TIMUR');

  // ---------- mid-rise towers
  for (const t of TOWERS_S) tower(east, t);

  // ---------- kampung C / D (bike-sized gangs at X 28 / 52 and EW gangs Z 390 / 510)
  const xs = [5, 12, 19, 30.5, 37.5, 44.5, 54, 61, 68];
  const rowsC = [341, 352, 363, 374, 394, 405, 416, 427], rowsD = [461, 472, 483, 494, 514, 525, 536, 547];
  const roofGeo = gableGeo(6, 8, 2.0, 0.45), roofMat = texMat(TEX.roofTile, 1, 1);
  const kc = group(west, 'KAMPUNG_C_RUMAH'), kd = group(west, 'KAMPUNG_D_RUMAH');
  let hn = 0;
  for (const [g, rows] of [[kc, rowsC], [kd, rowsD]] as [THREE.Group, number[]][]) for (const Z of rows) for (const X of xs) {
    hn++; if (rnd() < 0.06) { // an empty plot here and there: a small yard with a tree / jemuran
      boxC(g, wx(X + 3), 0, wz(Z + 4), 0.1, 1.8, 3, M.wood); continue;
    }
    const nm = `RUMAH_S${String(hn).padStart(3, '0')}`; const h = group(g, nm);
    const tall = rnd() < 0.18;   // some two-storey houses
    const H = tall ? 5.8 : 3.2;
    box(h, wx(X), 0, wz(Z), 6, H, 8, pick(WALLS), `${nm}_WALL`);
    const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.set(wx(X + 3), H, wz(Z + 4)); roof.castShadow = true; roof.receiveShadow = true; roof.name = `${nm}_ROOF`; h.add(roof);
    const doorEast = [19, 44.5, 68].includes(X), doorWest = [30.5, 54].includes(X);
    const wn = () => (rnd() < 0.35 ? WIN_LIT : WIN_D);
    if (doorEast) { box(h, wx(X + 6), 0, wz(Z + 3.55), 0.05, 2.1, 0.9, pick(DOORS), `${nm}_DOOR`); box(h, wx(X + 6), 1.0, wz(Z + 1.2), 0.05, 1.2, 1.0, wn()); }
    else if (doorWest) { box(h, wx(X) - 0.05, 0, wz(Z + 3.55), 0.05, 2.1, 0.9, pick(DOORS), `${nm}_DOOR`); box(h, wx(X) - 0.05, 1.0, wz(Z + 1.2), 0.05, 1.2, 1.0, wn()); }
    else { box(h, wx(X + 2.55), 0, wz(Z) - 0.05, 0.9, 2.1, 0.05, pick(DOORS), `${nm}_DOOR`); box(h, wx(X + 0.8), 1.0, wz(Z) - 0.05, 1.0, 1.2, 0.05, wn()); }
    if (tall) box(h, wx(X + 4.2), 3.9, wz(Z) - 0.05, 1.0, 1.1, 0.05, wn());
    if (rnd() < 0.4) cyl(h, wx(X + 1.2), H + 0.8, wz(Z + 6.5), 0.45, 0.9, mat(pick(['#e67e22', '#3b78c2', '#2c3e50'])));
  }
  // gapura (gate) at the kampung entrances on Anggrek and Dahlia
  for (const [X, Z, nm] of [[28, 336.2, 'GAPURA_03'], [52, 336.2, 'GAPURA_04'], [28, 456.2, 'GAPURA_05'], [52, 456.2, 'GAPURA_06']] as [number, number, string][]) {
    const gp = group(west, nm);
    for (const dx of [-1.9, 1.6]) box(gp, wx(X + dx), 0, wz(Z), 0.3, 4.2, 0.3, mat('#f0ece2'));
    box(gp, wx(X - 1.9), 4.2, wz(Z), 3.8, 0.6, 0.3, mat('#c0392b'));
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), new THREE.MeshStandardMaterial({ map: signTex(Z < 400 ? 'KAMPUNG ANGGREK' : 'KAMPUNG DAHLIA', '#c0392b', '#fff', 512, 72, '#ffffff') }));
    sg.position.set(wx(X - 0.1), 4.5, wz(Z) - 0.02); sg.rotation.y = Math.PI; gp.add(sg);
  }

  // ---------- ruko rows
  rukoRow(west, 'RUKO_ANGGREK', 92, 337, 14, 'N');
  minimarket(west, 'MINIMARKET_02', 164.5, 337, 'N');
  rukoRow(west, 'RUKO_DAHLIA', 92, 457, 16, 'N');
  minimarket(west, 'MINIMARKET_03', 172.5, 457, 'N');
  rukoRow(east, 'RUKO_KEMUNING_S', 327, 543, 16, 'W');           // fronts on Jl. Kemuning, running north from Z 543
  minimarket(east, 'MINIMARKET_04', 327, 557, 'W');
  rukoRow(east, 'RUKO_ANGGREK_TIMUR', 326, 337, 7, 'N');
  // v9.1: bekas lahan cadangan di selatan Jl. Cempaka
  rukoRow(west, 'RUKO_CEMPAKA_S', 92, 247, 18, 'N');
  rukoRow(east, 'RUKO_CEMPAKA_TIMUR', 326, 247, 13, 'N');

  // ---------- lapangan bola + tribun (B-R1)
  {
    const g = group(west, 'PROP_LAPANGAN_BOLA');
    const fx0 = 106, fz0 = 380, FW = 64, FD = 42;
    box(g, wx(fx0 - 3), 0, wz(fz0 - 3), FW + 6, 0.04, FD + 6, texMat(TEX.grass, 6, 4, { color: '#7fbf5f' }), 'LAPANGAN_RUMPUT', false);
    const line = mat('#f5f5f0');
    box(g, wx(fx0), 0.04, wz(fz0), FW, 0.012, 0.15, line, undefined, false); box(g, wx(fx0), 0.04, wz(fz0 + FD), FW, 0.012, 0.15, line, undefined, false);
    box(g, wx(fx0), 0.04, wz(fz0), 0.15, 0.012, FD, line, undefined, false); box(g, wx(fx0 + FW), 0.04, wz(fz0), 0.15, 0.012, FD, line, undefined, false);
    box(g, wx(fx0 + FW / 2), 0.04, wz(fz0), 0.15, 0.012, FD, line, undefined, false);
    for (const [gx, dir] of [[fx0, 1], [fx0 + FW, -1]] as [number, number][]) {
      box(g, wx(Math.min(gx, gx + dir * 10)), 0.04, wz(fz0 + FD / 2 - 9), 10, 0.012, 0.15, line, undefined, false);
      box(g, wx(Math.min(gx, gx + dir * 10)), 0.04, wz(fz0 + FD / 2 + 9), 10, 0.012, 0.15, line, undefined, false);
      box(g, wx(gx + dir * 10), 0.04, wz(fz0 + FD / 2 - 9), 0.15, 0.012, 18, line, undefined, false);
      // goal: 2 posts + crossbar
      for (const dz of [-3.6, 3.6]) cyl(g, wx(gx), 0, wz(fz0 + FD / 2 + dz), 0.07, 2.4, M.white, `PROP_GAWANG_${dir > 0 ? 'B' : 'T'}_POLE`);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.2, 8), M.white); bar.rotation.x = Math.PI / 2; bar.position.set(wx(gx), 2.4, wz(fz0 + FD / 2)); bar.userData.noCollide = true; g.add(bar);
    }
    // tribun (3 steps) along the north side
    const tb = group(g, 'PROP_TRIBUN_01'); const conc = mat('#b9b6ae');
    for (let i = 0; i < 3; i++) box(tb, wx(118), 0, wz(366 + i * 1.1), 40, 0.45 * (3 - i), 1.1, conc);
    box(tb, wx(118), 3.2, wz(365.5), 40, 0.12, 4, mat('#2f6fb3'), undefined, true); tb.children[tb.children.length - 1].userData.noCollide = true;
    for (const x of [118.2, 137.8, 157.6]) box(tb, wx(x), 0, wz(365.5), 0.2, 3.2, 0.2, M.steel);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.1), new THREE.MeshStandardMaterial({ map: signTex('LAPANGAN ANGGREK', '#1b5e20', '#fff', 768, 96, '#ffd200') }));
    sg.position.set(wx(138), 2.6, wz(365.4)); sg.rotation.y = Math.PI; tb.add(sg);
  }

  // ---------- Masjid Al-Ikhlas (D-R1)
  {
    const g = group(east, 'BLD_MASJID_02'); const wm = mat('#f4f0e6'), green = mat('#1f6e8c', { metalness: 0.3, roughness: 0.4 });
    box(g, wx(342), 0, wz(368), 18, 7.5, 18, wm, 'BLD_MASJID_02_MAIN');
    box(g, wx(341.6), 7.5, wz(367.6), 18.8, 0.6, 18.8, mat('#d9c9a3'));
    for (let i = 0; i < 4; i++) for (const side of [0, 1]) box(g, wx(342) + (side ? 18.02 : -0.06), 2, wz(370.5 + i * 3.8), 0.05, 3.4, 1.5, mat('#1f5f4a'));
    cyl(g, wx(351), 8.1, wz(377), 5.6, 1.4, wm, undefined, 28);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), green);
    dome.position.set(wx(351), 9.5, wz(377)); dome.castShadow = true; dome.name = 'BLD_MASJID_02_DOME'; g.add(dome);
    cyl(g, wx(351), 14.9, wz(377), 0.08, 1.6, mat('#d4af37', { metalness: 0.9, roughness: 0.2 }));
    box(g, wx(342), 0, wz(363.5), 18, 0.3, 4.5, texMat(TEX.floorTile, 4, 1), undefined, false);
    for (const x of [342.4, 348.2, 354, 359.4]) cyl(g, wx(x + 0.2), 0.3, wz(363.9), 0.25, 3.9, wm);
    box(g, wx(341.6), 4.2, wz(363.1), 18.8, 0.4, 5, green);
    box(g, wx(350), 0.3, wz(368) - 0.06, 2, 2.8, 0.06, M.wood, 'BLD_MASJID_02_DOOR');
    const mn = group(east, 'BLD_MINARET_02');
    box(mn, wx(363), 0, wz(366), 2.6, 19, 2.6, wm, 'BLD_MINARET_02_SHAFT');
    box(mn, wx(362.6), 14.5, wz(365.6), 3.4, 0.3, 3.4, mat('#d9c9a3'));
    const md = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), green); md.position.set(wx(364.3), 19, wz(367.3)); mn.add(md);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 1), new THREE.MeshStandardMaterial({ map: signTex('MASJID AL-IKHLAS', '#1f5f4a', '#fff', 768, 96, '#d4af37'), emissive: '#ffffff', emissiveIntensity: 0 }));
    sg.position.set(wx(351), 4.0, wz(362.95)); sg.rotation.y = Math.PI; g.add(sg);
    // parking + a pocket garden next to it
    box(east, wx(330), 0, wz(392), 28, 0.03, 18, mat('#5b5f63'), 'PARKIR_MASJID_02', false);
  }

  // ---------- Taman Dahlia (B-R2): jogging loop, trees, gazebo, playground, benches
  const trees: [number, number, number][] = [];
  {
    const g = group(west, 'TAMAN_DAHLIA_PROPS'); const jm = mat('#b0563a', { roughness: 0.95 });
    box(g, wx(99), 0, wz(488), 78, 0.03, 2, jm, undefined, false); box(g, wx(99), 0, wz(552), 78, 0.03, 2, jm, undefined, false);
    box(g, wx(99), 0, wz(488), 2, 0.03, 66, jm, undefined, false); box(g, wx(175), 0, wz(488), 2, 0.03, 66, jm, undefined, false);
    const gz = group(g, 'GAZEBO_03');
    for (const [dx, dz] of [[-1.8, -1.8], [1.6, -1.8], [-1.8, 1.6], [1.6, 1.6]]) box(gz, wx(138 + dx), 0.4, wz(520 + dz), 0.2, 2.6, 0.2, M.wood);
    box(gz, wx(135.5), 0, wz(517.5), 5, 0.4, 5, M.woodLight);
    const gr = new THREE.Mesh(new THREE.ConeGeometry(4, 1.6, 4), mat('#8b3a2a')); gr.rotation.y = Math.PI / 4; gr.position.set(wx(138), 3.8, wz(520)); gr.castShadow = true; gz.add(gr);
    // playground: swing frame + slide
    const pg = group(g, 'PROP_TAMAN_BERMAIN');
    for (const dx of [0, 4]) for (const dz of [0, 2]) box(pg, wx(110 + dx), 0, wz(500 + dz), 0.12, 2.6, 0.12, M.red);
    box(pg, wx(110), 2.5, wz(500), 4.12, 0.12, 0.12, M.red); box(pg, wx(110), 2.5, wz(502), 4.12, 0.12, 0.12, M.red);
    box(pg, wx(111), 0.45, wz(500.7), 0.6, 0.06, 0.4, M.yellow, undefined, false); box(pg, wx(112.6), 0.45, wz(500.7), 0.6, 0.06, 0.4, M.yellow, undefined, false);
    box(pg, wx(118), 0, wz(500), 1.2, 1.8, 1.2, M.blue);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 3.4), M.yellow); sl.rotation.x = -0.5; sl.position.set(wx(118.6), 0.95, wz(502.9)); sl.userData.noCollide = true; pg.add(sl);
    const bm = mat('#6f777d', { metalness: 0.4 });
    for (const [X, Z] of [[125, 490.6], [150, 490.6], [125, 551.4], [150, 551.4]] as [number, number][]) { box(g, wx(X), 0.42, wz(Z), 1.8, 0.06, 0.5, M.woodLight); box(g, wx(X + 0.1), 0, wz(Z + 0.1), 0.08, 0.42, 0.3, bm); box(g, wx(X + 1.6), 0, wz(Z + 0.1), 0.08, 0.42, 0.3, bm); }
    let tries = 0, n = 0;
    while (n < 34 && tries++ < 2000) {
      const X = rr(94, 182), Z = rr(484, 560);
      const onLoop = (Math.abs(Z - 489) < 2.2 || Math.abs(Z - 553) < 2.2) && X > 98 && X < 178 || (Math.abs(X - 100) < 2.2 || Math.abs(X - 176) < 2.2) && Z > 487 && Z < 555;
      if (onLoop || Math.hypot(X - 138, Z - 520) < 6 || (X > 107 && X < 122 && Z > 497 && Z < 506) || trees.some(([a, b]) => Math.hypot(a - X, b - Z) < 4.5)) continue;
      trees.push([X, Z, rr(0.9, 1.35)]); n++;
    }
  }
  // trees around the lapangan, Thamrin south shade trees, edge strips
  for (let X = 98; X < 182; X += 9) { trees.push([X, 361.5, rr(0.8, 1.0)]); trees.push([X, 440, rr(0.8, 1.05)]); }
  for (let Z = 315; Z < 596; Z += 15) { if ([330, 450, 570].some(j => Math.abs(j - Z) < 18)) continue; trees.push([187.7, Z, rr(0.85, 1.1)]); trees.push([212.3, Z, rr(0.85, 1.1)]); }
  for (let X = 6; X < 396; X += 11) { if ([80, 200, 320].some(j => Math.abs(j - X) < 16)) continue; trees.push([X + rr(-1, 1), 588 + rr(-2, 3), rr(0.8, 1.2)]); if (X > 90) trees.push([X + rr(-2, 2), 312 + rr(-3, 3), rr(0.7, 1.1)]); }
  for (const [X, Z] of [[372, 400], [384, 410], [376, 425], [332, 420], [345, 432], [300, 440], [246, 494], [258, 530]] as [number, number][]) trees.push([X, Z, rr(0.8, 1.2)]);
  instTrees(root, trees);

  // ---------- SMK Nusantara (C-R2): U-shaped 3-storey school around a courtyard, flagpole
  {
    const g = group(east, 'BLD_SMK_NUSANTARA'); const wm = mat('#efe9dc'), band = mat('#2bd46b');
    const fm = facadeMats('apt', 96, 14, 11.4, 3.8, 4);
    box(g, wx(216), 0, wz(540), 96, 11.4, 14, fm, 'BLD_SMK_NUSANTARA_MAIN');
    box(g, wx(216), 0, wz(500), 14, 11.4, 40, facadeMats('apt', 14, 40, 11.4, 3.8, 4), 'BLD_SMK_NUSANTARA_WING_B');
    box(g, wx(298), 0, wz(500), 14, 11.4, 40, facadeMats('apt', 14, 40, 11.4, 3.8, 4), 'BLD_SMK_NUSANTARA_WING_T');
    box(g, wx(215.6), 11.4, wz(539.6), 96.8, 0.6, 14.8, band); box(g, wx(215.6), 11.4, wz(499.6), 14.8, 0.6, 40.4, band); box(g, wx(297.6), 11.4, wz(499.6), 14.8, 0.6, 40.4, band);
    // covered walkway along the courtyard side (canopy only, walkable under)
    const cv = box(g, wx(230), 3.4, wz(536.5), 68, 0.15, 3.5, mat('#3d6f8f')); cv.userData.noCollide = true;
    for (let x = 231; x < 298; x += 6) box(g, wx(x), 0, wz(536.7), 0.2, 3.4, 0.2, wm);
    const sgT = signTex('SMK NUSANTARA · TEKNIK KOMPUTER & JARINGAN', '#13202b', '#ffffff', 1536, 160, '#2bd46b');
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.6), new THREE.MeshStandardMaterial({ map: sgT, emissiveMap: sgT, emissive: '#ffffff', emissiveIntensity: 0.2 }));
    sg.position.set(wx(264), 8.8, wz(540) - 0.05); sg.rotation.y = Math.PI; g.add(sg);
    cyl(g, wx(264), 0, wz(515), 0.08, 12, M.metal, 'PROP_TIANG_BENDERA_POLE');
    box(g, wx(264.1), 10.2, wz(515), 1.8, 1.2, 0.03, mat('#d1001f'), undefined, false); box(g, wx(264.1), 9.0, wz(515), 1.8, 1.2, 0.03, M.white, undefined, false);
    box(g, wx(258), 0, wz(511), 12, 0.35, 8, mat('#b9b6ae'), undefined, false); // upacara podium base
    // fence + gate on Jl. Dahlia side of the courtyard
    const fz = 488.5; const fm2 = mat('#4a5560', { metalness: 0.5 });
    box(g, wx(230), 0, wz(fz), 28, 1.3, 0.12, fm2); box(g, wx(270), 0, wz(fz), 28, 1.3, 0.12, fm2);
    box(g, wx(258), 2.6, wz(fz), 12, 0.5, 0.2, mat('#13202b'));
    for (const x of [258, 269.8]) box(g, wx(x), 0, wz(fz - 0.1), 0.25, 3.1, 0.35, mat('#13202b'));
  }

  // ---------- perumahan behind the Kemuning ruko (D-R2)
  {
    const g = group(east, 'PERUMAHAN_KEMUNING');
    const rg = gableGeo(8, 10, 2.4, 0.5), rm = texMat(TEX.roofTile, 1.3, 1.3, { color: '#c46a4a' });
    let i = 0;
    for (const X of [352, 366, 380]) for (const Z of [462, 478, 494, 510, 526]) {
      i++; const nm = `RUMAH_P${String(i).padStart(2, '0')}`; const h = group(g, nm);
      box(h, wx(X), 0, wz(Z), 8, 3.4, 10, pick(WALLS), `${nm}_WALL`);
      const r = new THREE.Mesh(rg, rm); r.position.set(wx(X + 4), 3.4, wz(Z + 5)); r.castShadow = true; r.name = `${nm}_ROOF`; h.add(r);
      box(h, wx(X) - 0.05, 0, wz(Z + 4.5), 0.05, 2.1, 1.0, pick(DOORS), `${nm}_DOOR`);
      box(h, wx(X) - 0.05, 1.0, wz(Z + 1.4), 0.05, 1.2, 1.6, rnd() < 0.4 ? WIN_LIT : WIN_D);
      box(h, wx(X) - 0.05, 1.0, wz(Z + 7.0), 0.05, 1.2, 1.6, rnd() < 0.4 ? WIN_LIT : WIN_D);
      box(h, wx(X) - 2.2, 0, wz(Z + 0.5), 2.2, 0.9, 0.08, mat('#e4e4e4')); // low front fence
    }
  }

  // ---------- city edge: boundary wall beyond Jl. Flamboyan (the bike / player never leave the world)
  {
    const g = group(root, 'TEMBOK_BATAS_SELATAN'); const wm = mat('#c9c4b8');
    box(g, wx(0), 0, wz(598.5), 400, 2.4, 0.4, wm); addCollider(wx(0), wx(400), wz(598.5), wz(598.9), 0, 2.4);   // too long for the auto collider
    for (let X = 0; X <= 400; X += 8) box(g, wx(X) - 0.25, 0, wz(598.4), 0.5, 2.7, 0.6, mat('#b5afa2'));
  }
  // extra lamp posts in the park / lapangan (shared street-lamp material)
  {
    const g = group(west, 'LAMPU_TAMAN_SELATAN'); const pm = mat('#6f777d', { metalness: 0.5, roughness: 0.5 });
    for (const [X, Z] of [[104, 372], [172, 372], [104, 432], [172, 432], [110, 520], [166, 520], [138, 495], [138, 545]] as [number, number][]) {
      cyl(g, wx(X), 0, wz(Z), 0.09, 5.5, pm, 'LAMPU_TAMAN_POLE'); boxC(g, wx(X), 5.5, wz(Z), 0.5, 0.25, 0.5, STREET_LAMP, undefined, false);
    }
  }

  const peds = SOUTH_PEDS;
  return { west, east, peds };
}

function tower(parent: THREE.Object3D, t: Tower) {
  const g = group(parent, t.name);
  const fh = t.style === 'apt' ? 3.0 : 4.0;
  box(g, wx(t.x), 0, wz(t.z), t.w, t.h, t.d, facadeMats(t.style, t.w, t.d, t.h, fh, t.style === 'apt' ? 3.5 : 3), `${t.name}_MASS`);
  const p = mat('#a7a9a6');
  box(g, wx(t.x), t.h, wz(t.z), t.w, 1.0, 0.3, p); box(g, wx(t.x), t.h, wz(t.z + t.d - 0.3), t.w, 1.0, 0.3, p);
  box(g, wx(t.x), t.h, wz(t.z), 0.3, 1.0, t.d, p); box(g, wx(t.x + t.w - 0.3), t.h, wz(t.z), 0.3, 1.0, t.d, p);
  box(g, wx(t.x + t.w * 0.3), t.h, wz(t.z + t.d * 0.3), t.w * 0.35, 3, t.d * 0.35, mat('#bfc3c4'));
  if (t.style === 'apt') {
    for (let y = 3; y < t.h; y += 3) box(g, wx(t.x - 0.6), y - 0.15, wz(t.z - 0.6), t.w + 1.2, 0.18, t.d + 1.2, mat('#d8ccb0'), undefined, false);
    cyl(g, wx(t.x + 4), t.h, wz(t.z + 4), 1.2, 2.2, mat('#3b78c2'));
  } else {
    box(g, wx(t.x - 0.4), 0, wz(t.z - 0.4), t.w + 0.8, 6, t.d + 0.8, mat('#cfc6b4', { roughness: 0.8 }));
    box(g, wx(t.x + t.w * 0.3), 0, wz(t.z - 0.45), t.w * 0.4, 4, 0.05, SHOP_GLOW);
  }
  addCollider(wx(t.x - 0.5), wx(t.x + t.w + 0.5), wz(t.z - 0.5), wz(t.z + t.d + 0.5));
}

/** row of 5 m ruko; local front faces -Z at z=0, shops run +X. face 'N': origin (X0,Z0) = NW corner. 'W': front on X0, running north from Z0. */
function rukoRow(parent: THREE.Object3D, name: string, X0: number, Z0: number, n: number, face: 'N' | 'W') {
  const g = group(parent, name);
  g.position.set(wx(X0), 0, wz(Z0)); if (face === 'W') g.rotation.y = Math.PI / 2;
  const rd = texMat(TEX.seng, 1, 1, { color: '#b9bec2', metalness: 0.4, roughness: 0.5 });
  for (let i = 0; i < n; i++) {
    const x = i * 5; const r = group(g, `${name}_${String(i + 1).padStart(2, '0')}`);
    const floors = rnd() < 0.3 ? 2 : 3, H = floors === 3 ? 10.5 : 7.2;
    box(r, x, 0, 0, 5, H, 12, pick(RUKO_COL), `${name}_${String(i + 1).padStart(2, '0')}_MASS`);
    const open = rnd() < 0.7;
    box(r, x + 0.75, 0.15, -0.06, 3.5, 2.6, 0.06, open ? M.dark : rd);
    if (open) box(r, x + 0.75, 0.15, -0.02, 3.5, 2.6, 0.03, SHOP_GLOW);
    const awn = box(r, x + 0.1, 3.0, -1.4, 4.8, 0.1, 1.4, pick(AWN)); awn.userData.noCollide = true;
    const sg = new THREE.Mesh(SIGN_GEO, pick(SIGN_M)); sg.position.set(x + 2.5, 3.6, -0.05); sg.rotation.y = Math.PI; r.add(sg);
    for (const y of floors === 3 ? [4.6, 8.0] : [4.6]) { box(r, x + 1, y, -0.04, 3, 1.5, 0.05, rnd() < 0.35 ? WIN_LIT : GLASS_D); box(r, x + 0.9, y - 0.12, -0.25, 3.2, 0.12, 0.25, mat('#e5e1d8'), undefined, false); }
    box(r, x + 3.6, H - 3.4, -0.5, 0.8, 0.55, 0.3, mat('#e9e9e6'));
    cyl(r, x + 2.5, H, 9, 0.6, 1.2, mat(pick(['#e67e22', '#3b78c2'])));
  }
}
function minimarket(parent: THREE.Object3D, name: string, X0: number, Z0: number, face: 'N' | 'W') {
  const g = group(parent, name);
  g.position.set(wx(X0), 0, wz(Z0)); if (face === 'W') g.rotation.y = Math.PI / 2;
  box(g, 0, 0, 0, 12, 4.5, 12, mat('#f4f4f2'), `${name}_MASS`);
  box(g, 0, 3.4, -0.12, 12, 1.1, 0.12, mat('#d81f26'));
  const t = signTex('NUSAMART 24 JAM', '#d81f26', '#fff', 768, 96, '#ffd200');
  const s = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.8), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.25 })); s.position.set(6, 3.95, -0.14); s.rotation.y = Math.PI; g.add(s);
  box(g, 1, 0.1, -0.05, 10, 3.0, 0.05, mat('#fff2d0', { emissive: '#ffe8b0', emissiveIntensity: 0.5 }));
  box(g, 5, 0.1, -0.1, 2, 2.4, 0.05, M.glass, `${name}_DOOR`);
}
/** one instanced trunk (named TRUNK -> auto colliders) + one instanced canopy for every south tree */
function instTrees(parent: THREE.Object3D, list: [number, number, number][]) {
  const g = group(parent, 'E5_POHON_SELATAN');
  const trunk = new THREE.CylinderGeometry(0.15, 0.26, 4.6, 7).translate(0, 2.3, 0);
  const canopy = mergeGeometries([
    new THREE.IcosahedronGeometry(2.0, 1).translate(0, 6.2, 0), new THREE.IcosahedronGeometry(1.5, 1).translate(1.2, 5.6, 0.4),
    new THREE.IcosahedronGeometry(1.4, 1).translate(-1.0, 5.7, -0.6), new THREE.IcosahedronGeometry(1.2, 1).translate(0.2, 7.2, -0.3),
  ])!;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const ti = new THREE.InstancedMesh(trunk, mat('#5b4331'), list.length); ti.name = 'PROP_TREE_S_TRUNK';
  const ci = new THREE.InstancedMesh(canopy, mat('#ffffff', { roughness: 0.9, flatShading: true }), list.length); ci.name = 'PROP_TREE_S_CANOPY';
  const greens = ['#3f7a35', '#4c8a3a', '#356b2e', '#5b9441', '#2f5f2a'].map(c => new THREE.Color(c));
  list.forEach(([X, Z, sc], i) => { m4.compose(new THREE.Vector3(wx(X), 0, wz(Z)), q.setFromEuler(e.set(0, rnd() * 6, 0)), new THREE.Vector3(sc, sc, sc)); ti.setMatrixAt(i, m4); ci.setMatrixAt(i, m4); ci.setColorAt(i, pick(greens)); });
  for (const im of [ti, ci]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im); }
}
