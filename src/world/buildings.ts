// FASE B (tanah + zona) and FASE C (gedung kota, massa sederhana, tidak bisa dimasuki)
import * as THREE from 'three';
import { ZONES, TOWERS, KAMPUNG_HOUSES, wx, wz } from '../data/city';
import { TEX, texMat, M, box, boxC, cyl, flat, group, mat, addCollider, facadeTex, signTex, gableGeo, rand, rr, pick } from './core';

export function buildGround(world: THREE.Object3D) {
  const root = group(world, 'FASE_B_TANAH_ZONA');
  // B1 ground 400 x 300 at -0.05
  flat(root, wx(0), wz(0), 400, 300, -0.05, texMat(TEX.grass, 400 / 12, 300 / 12), 'GROUND_CITY');
  // outer land (beyond the city) – darker, fades into fog
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), mat('#6b7656'));
  outer.position.y = -0.12; outer.receiveShadow = true; outer.name = 'GROUND_OUTER'; root.add(outer);
  // distant Jakarta skyline silhouettes beyond the city edge (background depth only, not enterable)
  const sk = group(root, 'SKYLINE_LATAR');
  const skyMats = [mat('#5f6c78', { roughness: 0.6, metalness: 0.2 }), mat('#6b7782', { roughness: 0.6, metalness: 0.2 }), mat('#56626d', { roughness: 0.6, metalness: 0.2 }), mat('#74797c')];
  for (let i = 0; i < 110; i++) {
    const ang = rand() * Math.PI * 2, r = rr(480, 1100);
    const x = Math.cos(ang) * r * 1.2, z = Math.sin(ang) * r;
    if (Math.abs(x) < 260 && Math.abs(z) < 200) continue;
    const near = r < 650; const h = near ? rr(10, 35) : rr(25, 90) * (rand() > 0.85 ? 1.5 : 1);
    const w = rr(14, 36), d = rr(14, 36);
    box(sk, x - w / 2, 0, z - d / 2, w, h, d, pick(skyMats), undefined, false);
  }

  // B2/B3 zones: real ground finish per zone + a toggleable debug overlay (key Z)
  const overlay = group(root, 'ZONE_OVERLAY'); overlay.visible = false;
  ZONES.forEach((z, zi) => {
    const w = z.x[1] - z.x[0], d = z.z[1] - z.z[0];
    const tex = { park: TEX.grass, plaza: TEX.plaza, paving: TEX.paving, dirt: TEX.dirt, kampung: TEX.dirt, lot: TEX.dirt }[z.ground];
    const sc = { park: 12, plaza: 8, paving: 4, dirt: 10, kampung: 14, lot: 10 }[z.ground];
    const m = flat(root, wx(z.x[0]), wz(z.z[0]), w, d, -0.03 + (z.ground === 'park' ? 0 : 0.008), (() => { const zm = texMat(tex, w / sc, d / sc).clone(); zm.polygonOffset = true; zm.polygonOffsetFactor = -1 - zi * 0.05; zm.polygonOffsetUnits = -2 - zi; return zm; })(), z.name);
    m.userData.zone = z.name;
    const ov = flat(overlay, wx(z.x[0]), wz(z.z[0]), w, d, 0.3, new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.35, depthWrite: false }), `${z.name}_OVERLAY`);
    ov.renderOrder = 2;
  });
  return root;
}

function facadeMats(kind: 'glass' | 'glass2' | 'apt', w: number, d: number, h: number, floorH: number, bay: number) {
  const mk = (len: number) => {
    const t = facadeTex(kind, rand()); t.repeat.set(Math.max(1, Math.round(len / bay)), Math.max(1, Math.round(h / floorH)));
    return new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'apt' ? 0.85 : 0.25, metalness: kind === 'apt' ? 0 : 0.35, envMapIntensity: 1 });
  };
  const roof = mat('#8d8f8c');
  const sx = mk(d), sz = mk(w);
  return [sx, sx, roof, roof, sz, sz];
}

export function buildCity(world: THREE.Object3D) {
  const root = group(world, 'FASE_C_GEDUNG_KOTA');

  // C1-C3 + C9 annex: towers / apartments
  for (const t of TOWERS) {
    const g = group(root, t.name);
    const fh = t.style === 'apt' ? 3.0 : 4.0;
    const podium = t.style !== 'apt' && t.h >= 36;
    box(g, wx(t.x), 0, wz(t.z), t.w, t.h, t.d, facadeMats(t.style, t.w, t.d, t.h, fh, t.style === 'apt' ? 3.5 : 3), `${t.name}_MASS`);
    // roof parapet + mechanical
    const p = mat('#a7a9a6');
    box(g, wx(t.x), t.h, wz(t.z), t.w, 1.0, 0.3, p); box(g, wx(t.x), t.h, wz(t.z + t.d - 0.3), t.w, 1.0, 0.3, p);
    box(g, wx(t.x), t.h, wz(t.z), 0.3, 1.0, t.d, p); box(g, wx(t.x + t.w - 0.3), t.h, wz(t.z), 0.3, 1.0, t.d, p);
    box(g, wx(t.x + t.w * 0.3), t.h, wz(t.z + t.d * 0.3), t.w * 0.35, 3, t.d * 0.35, mat('#bfc3c4'));
    if (t.h >= 48) { cyl(g, wx(t.x + t.w * 0.8), t.h, wz(t.z + t.d * 0.75), 0.15, 8, M.steel); boxC(g, wx(t.x + t.w * 0.8), t.h + 8, wz(t.z + t.d * 0.75), 0.4, 0.4, 0.4, mat('#ff3b30', { emissive: '#ff2a1a', emissiveIntensity: 1.5 })); }
    if (podium) {
      // stone podium base 2 floors with dark glass entrance
      box(g, wx(t.x - 0.4), 0, wz(t.z - 0.4), t.w + 0.8, 8, t.d + 0.8, mat('#cfc6b4', { roughness: 0.8 }));
      box(g, wx(t.x + t.w * 0.3), 0, wz(t.z + t.d + 0.41), t.w * 0.4, 4.5, 0.05, M.glass);
      box(g, wx(t.x + t.w * 0.25), 4.6, wz(t.z + t.d + 0.4), t.w * 0.5, 0.3, 3, mat('#e0e0e0'));
    }
    if (t.style === 'apt') {
      // balconies strips + water tank on roof
      for (let y = 3; y < t.h; y += 3) box(g, wx(t.x - 0.6), y - 0.15, wz(t.z - 0.6), t.w + 1.2, 0.18, t.d + 1.2, mat('#d8ccb0'), undefined, false);
      cyl(g, wx(t.x + 4), t.h, wz(t.z + 4), 1.2, 2.2, mat('#3b78c2'));
    }
    addCollider(wx(t.x - 0.5), wx(t.x + t.w + 0.5), wz(t.z - 0.5), wz(t.z + t.d + 0.5));
  }

  // C4 ruko, minimarket, bank — fronts at Z=165 facing north to Sudirman
  const rk = group(root, 'ZONE_RUKO_BUILDINGS');
  const rukoColors = ['#e8c07d', '#d9d4c7', '#a7c4b5', '#e3a587', '#c9d6df', '#f0e2b6', '#b8b0d0', '#e6cfa1', '#9fbfcf', '#e2b4a4'];
  const shopNames = ['TOKO KOMPUTER', 'SERVIS HP', 'APOTEK', 'FOTOKOPI', 'WARNET', 'BENGKEL', 'TOKO EMAS', 'KONTER PULSA', 'RM PADANG', 'TOKO LISTRIK'];
  for (let n = 1; n <= 10; n++) {
    const X = 92 + 5 * (n - 1), Z = 165;
    const g = group(rk, `RUKO_${String(n).padStart(2, '0')}`);
    const wm = mat(rukoColors[n - 1]);
    box(g, wx(X), 0, wz(Z), 5, 10.5, 12, wm, `RUKO_${String(n).padStart(2, '0')}_MASS`);
    // rolling door 3.5 x 2.6 (front at Z=165 => world z = wz(165), facing -z)
    const rd = texMat(TEX.seng, 1, 1, { color: '#b9bec2', metalness: 0.4, roughness: 0.5 });
    box(g, wx(X + 0.75), 0.15, wz(Z) - 0.06, 3.5, 2.6, 0.06, n % 3 === 0 ? rd : M.dark);
    if (n % 3 !== 0) { // open shop: interior glow + goods
      box(g, wx(X + 0.75), 0.15, wz(Z) - 0.02, 3.5, 2.6, 0.03, mat('#ffe7b8', { emissive: '#ffcf7a', emissiveIntensity: 0.35 }));
    }
    // canopy/awning + signboard
    box(g, wx(X + 0.1), 3.0, wz(Z) - 1.4, 4.8, 0.1, 1.4, mat(pick(['#2f6fb3', '#c0392b', '#2e8b57', '#d35400'])));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshStandardMaterial({ map: signTex(shopNames[n - 1], pick(['#b71c1c', '#0d47a1', '#1b5e20', '#f9a825', '#4a148c']), '#fff', 512, 96, '#ffffff') }));
    sign.position.set(wx(X + 2.5), 3.6, wz(Z) - 0.05); sign.rotation.y = Math.PI; g.add(sign);
    // windows floors 2 & 3 (width 3)
    for (const y of [4.6, 8.0]) {
      box(g, wx(X + 1), y, wz(Z) - 0.04, 3, 1.5, 0.05, mat('#41505a', { roughness: 0.2, metalness: 0.3 }));
      box(g, wx(X + 0.9), y - 0.12, wz(Z) - 0.25, 3.2, 0.12, 0.25, mat('#e5e1d8'));
    }
    // AC outdoor unit & water tank on roof
    box(g, wx(X + 3.6), 7.0, wz(Z) - 0.5, 0.8, 0.55, 0.3, mat('#e9e9e6'));
    cyl(g, wx(X + 2.5), 10.5, wz(Z + 9), 0.6, 1.2, mat(pick(['#e67e22', '#3b78c2'])));
    addCollider(wx(X), wx(X + 5), wz(Z), wz(Z + 12));
  }
  {
    const g = group(rk, 'MINIMARKET_01');
    box(g, wx(148), 0, wz(165), 12, 4.5, 12, mat('#f4f4f2'), 'MINIMARKET_01_MASS');
    box(g, wx(148), 3.4, wz(165) - 0.12, 12, 1.1, 0.12, mat('#d81f26'));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.8), new THREE.MeshStandardMaterial({ map: signTex('NUSAMART 24 JAM', '#d81f26', '#fff', 768, 96, '#ffd200'), emissive: '#ffffff', emissiveIntensity: 0.15, emissiveMap: signTex('NUSAMART 24 JAM', '#d81f26', '#fff', 768, 96, '#ffd200') }));
    s.position.set(wx(154), 3.95, wz(165) - 0.14); s.rotation.y = Math.PI; g.add(s);
    box(g, wx(149), 0.1, wz(165) - 0.05, 10, 3.0, 0.05, mat('#fff2d0', { emissive: '#ffe8b0', emissiveIntensity: 0.5 }));
    box(g, wx(153), 0.1, wz(165) - 0.1, 2, 2.4, 0.05, M.glass, 'MINIMARKET_01_DOOR');
    addCollider(wx(148), wx(160), wz(165), wz(177));
  }
  {
    const g = group(rk, 'BANK_01');
    box(g, wx(168), 0, wz(165), 14, 8, 12, mat('#dfe3e6'), 'BANK_01_MASS');
    for (let i = 0; i < 5; i++) box(g, wx(168.6 + i * 3.1), 0, wz(165) - 0.6, 0.6, 8, 0.6, mat('#f5f5f5'));
    box(g, wx(169), 0.1, wz(165) - 0.05, 12, 6.5, 0.05, mat('#46606f', { roughness: 0.15, metalness: 0.4 }));
    box(g, wx(174), 0.1, wz(165) - 0.1, 2, 2.5, 0.06, M.glass, 'BANK_01_DOOR');
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 1), new THREE.MeshStandardMaterial({ map: signTex('BANK NUSANTARA', '#0a3d62', '#fff', 768, 96, '#f6b93b') }));
    s.position.set(wx(175), 7.0, wz(165) - 0.65); s.rotation.y = Math.PI; g.add(s);
    addCollider(wx(168), wx(182), wz(165), wz(177));
  }

  // C5 masjid + minaret
  {
    const g = group(root, 'BLD_MASJID_01');
    const wm = mat('#f3efe4');
    box(g, wx(102), 0, wz(210), 16, 7, 16, wm, 'BLD_MASJID_01_MAIN');
    box(g, wx(101.6), 7, wz(209.6), 16.8, 0.6, 16.8, mat('#d9c9a3'));
    // arched windows (dark green insets)
    for (let i = 0; i < 4; i++) for (const side of [0, 1]) box(g, wx(102) + (side ? 16.02 : -0.06), 2, wz(212 + i * 3.6), 0.05, 3.2, 1.4, mat('#1f5f4a'));
    // drum + dome d=10
    cyl(g, wx(110), 7.6, wz(218), 5.2, 1.5, wm, undefined, 32);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2e7d5b', { metalness: 0.3, roughness: 0.4 }));
    dome.position.set(wx(110), 9.1, wz(218)); dome.castShadow = true; dome.name = 'BLD_MASJID_01_DOME'; g.add(dome);
    cyl(g, wx(110), 14.1, wz(218), 0.08, 1.6, mat('#d4af37', { metalness: 0.9, roughness: 0.2 }));
    // serambi X102-118 Z206-210, 4 columns, roof
    box(g, wx(102), 0, wz(206), 16, 0.3, 4, texMat(TEX.floorTile, 4, 1));
    for (const x of [102.4, 107.4, 112.4, 117.2]) cyl(g, wx(x + 0.2), 0.3, wz(206.4), 0.25, 3.8, wm);
    box(g, wx(101.6), 4.1, wz(205.6), 16.8, 0.4, 4.6, mat('#2e7d5b'));
    box(g, wx(109), 0.3, wz(210) - 0.06, 2, 2.8, 0.06, M.wood, 'BLD_MASJID_01_DOOR');
    // tempat wudhu taps along west wall
    for (let i = 0; i < 5; i++) cyl(g, wx(101.7), 0.8, wz(214 + i * 1.5), 0.04, 0.3, M.metal);
    addCollider(wx(101.6), wx(118.4), wz(205.6), wz(226.4));
    const mn = group(root, 'BLD_MINARET_01');
    box(mn, wx(120), 0, wz(210), 2.5, 16, 2.5, wm, 'BLD_MINARET_01_SHAFT');
    box(mn, wx(119.6), 12, wz(209.6), 3.3, 0.3, 3.3, mat('#d9c9a3'));
    cyl(mn, wx(121.25), 16, wz(211.25), 1.0, 1.0, wm, undefined, 16);
    const md = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2e7d5b', { metalness: 0.3 }));
    md.position.set(wx(121.25), 17, wz(211.25)); mn.add(md);
    // loudspeakers (TOA) on minaret
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const s = cyl(mn, wx(121.25) + Math.cos(r) * 1.4, 13.2, wz(211.25) + Math.sin(r) * 1.4, 0.18, 0.5, M.white, undefined, 8, 0.32); s.rotation.z = Math.PI / 2; s.rotation.y = -r; }
    addCollider(wx(120), wx(122.5), wz(210), wz(212.5));
  }

  // C6 pasar: kios A1-A6, B1-B6, los, warung
  {
    const g = group(root, 'ZONE_PASAR_BUILDINGS');
    const seng = (w: number, d: number) => texMat(TEX.seng, w / 2, d / 2, { metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide });
    const kiosColors = ['#2f6fb3', '#2e8b57', '#d35400', '#8e44ad', '#16a085', '#c0392b'];
    const goods = ['#e74c3c', '#f1c40f', '#27ae60', '#e67e22', '#ecf0f1', '#8e5a2b'];
    for (const [row, Z0] of [['A', 195], ['B', 212]] as [string, number][]) {
      for (let n = 1; n <= 6; n++) {
        const X0 = 132 + 8 * (n - 1);
        const k = group(g, `KIOS_${row}${n}`);
        box(k, wx(X0), 0, wz(Z0), 3, 2.6, 0.1, mat(kiosColors[n - 1]));            // back wall (north)
        box(k, wx(X0), 0, wz(Z0), 0.1, 2.6, 3, mat(kiosColors[n - 1]));
        box(k, wx(X0 + 2.9), 0, wz(Z0), 0.1, 2.6, 3, mat(kiosColors[n - 1]));
        box(k, wx(X0 + 0.1), 0, wz(Z0 + 2.2), 2.8, 0.9, 0.7, M.woodLight);           // counter facing south
        for (let i = 0; i < 6; i++) box(k, wx(X0 + 0.3 + i * 0.42), 0.9, wz(Z0 + 2.3), 0.35, 0.25, 0.45, mat(goods[(i + n) % goods.length]), undefined, false);
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.8), seng(3.6, 3.8));
        roof.rotation.x = -Math.PI / 2 + 0.17; roof.position.set(wx(X0 + 1.5), 2.95, wz(Z0 + 1.5)); roof.castShadow = true; roof.receiveShadow = true; k.add(roof);
        addCollider(wx(X0), wx(X0 + 3), wz(Z0), wz(Z0 + 3));
      }
    }
    const los = group(g, 'LOS_PASAR_01');
    for (let i = 0; i < 6; i++) { const x = 130 + i * 10; cyl(los, wx(Math.min(x, 180)), 0, wz(202.2), 0.12, 3.5, M.steel); cyl(los, wx(Math.min(x, 180)), 0, wz(207.8), 0.12, 3.5, M.steel); }
    const lr = new THREE.Mesh(new THREE.PlaneGeometry(50.6, 6.6), seng(50, 6.6)); lr.rotation.x = -Math.PI / 2; lr.position.set(wx(155), 3.55, wz(205)); lr.castShadow = true; los.add(lr);
    // tables + baskets under los
    for (let i = 0; i < 8; i++) { box(los, wx(132 + i * 6), 0, wz(203.5), 2.2, 0.8, 1.2, M.woodLight); for (let j = 0; j < 3; j++) cyl(los, wx(132.4 + i * 6 + j * 0.7), 0.8, wz(204.1), 0.25, 0.25, mat(pick(goods)), undefined, 10); }
    // warung 3x4x2.8
    for (const [nm, X, Z] of [['WARUNG_01', 86, 170], ['WARUNG_02', 86, 182], ['WARUNG_03', 86, 215]] as [string, number, number][]) {
      const w = group(g, nm);
      box(w, wx(X), 0, wz(Z), 3, 2.6, 4, mat(pick(['#e1b866', '#6fa8a0', '#d77a5b'])), `${nm}_MASS`);
      box(w, wx(X) - 0.6, 0.0, wz(Z + 0.5), 0.6, 0.9, 3, M.woodLight);            // counter facing Melati (west)
      const r = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), seng(4.6, 4.6)); r.rotation.x = -Math.PI / 2; r.rotation.y = 0.15; r.position.set(wx(X + 1.0), 2.85, wz(Z + 2)); r.castShadow = true; w.add(r);
      const tarp = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.6), mat('#1e6fd9', { side: THREE.DoubleSide })); tarp.position.set(wx(X) - 1.4, 2.3, wz(Z + 2)); tarp.rotation.set(-Math.PI / 2 + 0.35, 0, Math.PI / 2, 'YXZ'); w.add(tarp);
      // sachet strips
      for (let i = 0; i < 6; i++) box(w, wx(X) - 0.05, 1.3, wz(Z + 0.6 + i * 0.5), 0.02, 0.9, 0.12, mat(pick(['#e74c3c', '#f1c40f', '#27ae60', '#3498db'])), undefined, false);
      addCollider(wx(X) - 0.6, wx(X + 3), wz(Z), wz(Z + 4));
    }
  }

  // C7/C8 rumah kampung (52)
  {
    const g = group(root, 'KAMPUNG_HOUSES');
    const wallColors = ['#efe3c2', '#cfe5c6', '#c8dcea', '#f3e08a', '#f0d0b0', '#e4e4e4'];
    const roofGeo = gableGeo(6, 8, 2.0, 0.45);
    const roofMat = texMat(TEX.roofTile, 1, 1);
    KAMPUNG_HOUSES.forEach(([X, Z], i) => {
      const nm = `RUMAH_K${String(i + 1).padStart(2, '0')}`;
      const h = group(g, nm);
      const wm = mat(wallColors[i % wallColors.length]);
      box(h, wx(X), 0, wz(Z), 6, 3.2, 8, wm, `${nm}_WALL`);
      const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.set(wx(X + 3), 3.2, wz(Z + 4)); roof.castShadow = true; roof.receiveShadow = true; roof.name = `${nm}_ROOF`; h.add(roof);
      // door faces the nearest gang/road: decide by x position inside the cell
      const doorEast = [19, 44.5, 68, 26, 64].includes(X) ;
      const doorWest = [5, 30.5, 54, 5, 43].includes(X) && !doorEast;
      const dm = mat(pick(['#6b4226', '#3f5f7a', '#2f6b4f']));
      const wn = mat('#2b3a44', { roughness: 0.3 });
      if (doorEast) { box(h, wx(X + 6), 0, wz(Z + 3.55), 0.05, 2.1, 0.9, dm, `${nm}_DOOR`); box(h, wx(X + 6), 1.0, wz(Z + 1.2), 0.05, 1.2, 1.0, wn); box(h, wx(X + 6), 1.0, wz(Z + 5.8), 0.05, 1.2, 1.0, wn); }
      else if (doorWest) { box(h, wx(X) - 0.05, 0, wz(Z + 3.55), 0.05, 2.1, 0.9, dm, `${nm}_DOOR`); box(h, wx(X) - 0.05, 1.0, wz(Z + 1.2), 0.05, 1.2, 1.0, wn); box(h, wx(X) - 0.05, 1.0, wz(Z + 5.8), 0.05, 1.2, 1.0, wn); }
      else { box(h, wx(X + 2.55), 0, wz(Z) - 0.05, 0.9, 2.1, 0.05, dm, `${nm}_DOOR`); box(h, wx(X + 0.8), 1.0, wz(Z) - 0.05, 1.0, 1.2, 0.05, wn); box(h, wx(X + 4.2), 1.0, wz(Z) - 0.05, 1.0, 1.2, 0.05, wn); }
      // teras floor + potted plants / jemuran / motor on some
      if (rand() > 0.5) cyl(h, wx(X + rr(0.5, 5.5)), 0, wz(Z) - 0.5, 0.25, 0.4, M.pot);
      if (rand() > 0.6) { // satellite dish / tandon on roof
        cyl(h, wx(X + 1.2), 4.0, wz(Z + 6.5), 0.45, 0.9, mat(pick(['#e67e22', '#3b78c2', '#2c3e50'])));
      }
      addCollider(wx(X), wx(X + 6), wz(Z), wz(Z + 8));
    });
  }

  // Reserve lots: construction hoarding (for later enterable buildings)
  const res = group(root, 'LAHAN_CADANGAN');
  const fence = mat('#e9e9e4');
  const hoard = (x0: number, z0: number, x1: number, z1: number) => {
    box(res, wx(x0), 0, wz(z0), x1 - x0, 2.2, 0.08, fence); box(res, wx(x0), 0, wz(z1), x1 - x0, 2.2, 0.08, fence);
    box(res, wx(x0), 0, wz(z0), 0.08, 2.2, z1 - z0, fence); box(res, wx(x1), 0, wz(z0), 0.08, 2.2, z1 - z0, fence);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshStandardMaterial({ map: signTex('LAHAN CADANGAN · SEGERA DIBANGUN', '#f6b93b', '#1e272e', 1024, 160, '#1e272e') }));
    s.position.set(wx((x0 + x1) / 2), 1.2, wz(z0) - 0.06); s.rotation.y = Math.PI; res.add(s);
  };
  hoard(327, 166, 395, 232); hoard(93, 251, 395, 297);

  return root;
}
