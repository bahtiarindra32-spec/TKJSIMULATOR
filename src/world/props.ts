// FASE E (properti jalan), F1 (spawn), G1 (kendaraan parkir diam)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROADS, ROAD_SPEC, JUNCTIONS, SIGNALISED, SPAWN, wx, wz } from '../data/city';
import { M, box, boxC, cyl, group, mat, addCollider, signTex, rand, rr, pick, texMat, TEX } from './core';
import { makeCar, makeMotor, randomCarKind } from '../assets/vehicles';
import { STREET_LAMP } from './daynight';

function instanced(parent: THREE.Object3D, name: string, geo: THREE.BufferGeometry, m: THREE.Material, mats: THREE.Matrix4[], shadow = true) {
  const im = new THREE.InstancedMesh(geo, m, mats.length); im.name = name;
  mats.forEach((mm, i) => im.setMatrixAt(i, mm)); im.castShadow = shadow; im.receiveShadow = true; parent.add(im); return im;
}
const T = (x: number, y: number, z: number, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
const nearJunction = (X: number, Z: number, pad = 16) => JUNCTIONS.some(([jx, jz]) => Math.abs(jx - X) < pad && Math.abs(jz - Z) < pad);

// ---------- lamp geometries ----------
function lampGeos(double: boolean) {
  const pole = new THREE.CylinderGeometry(0.08, 0.13, 9, 8).translate(0, 4.5, 0);
  const parts: THREE.BufferGeometry[] = [pole];
  const arms = double ? [1, -1] : [1];
  const heads: THREE.BufferGeometry[] = [];
  for (const s of arms) {
    parts.push(new THREE.BoxGeometry(1.8, 0.08, 0.08).translate(s * 0.9, 8.9, 0));
    heads.push(new THREE.BoxGeometry(0.7, 0.12, 0.3).translate(s * 1.8, 8.85, 0));
  }
  return { pole: mergeGeometries(parts)!, head: mergeGeometries(heads)! };
}

export const lampLights: THREE.Vector3[] = [];

export function buildStreetProps(world: THREE.Object3D) {
  const root = group(world, 'FASE_E_PROPERTI_JALAN');
  const poleMat = mat('#6f777d', { metalness: 0.5, roughness: 0.5 });

  // E1 lamps
  {
    const g = group(root, 'E1_LAMPU_JALAN');
    const dbl = lampGeos(true), sgl = lampGeos(false);
    const dM: THREE.Matrix4[] = [], sM: THREE.Matrix4[] = [];
    for (const r of ROADS) {
      if (r.kind === 'gang') continue;
      const h = r.a[1] === r.b[1]; const c = h ? r.a[1] : r.a[0];
      if (r.kind === 'arteri') {
        for (let t = (h ? r.a[0] : r.a[1]) + 15; t < (h ? r.b[0] : r.b[1]); t += 30) { const X = h ? t : c, Z = h ? c : t; if (nearJunction(X, Z, 14)) continue; dM.push(T(wx(X), 0.25, wz(Z), h ? Math.PI / 2 : 0)); lampLights.push(new THREE.Vector3(wx(X), 8.6, wz(Z))); }
      } else {
        let side = 1;
        const off = ROAD_SPEC.kolektor.carriage / 2 + 0.5;
        for (let t = (h ? r.a[0] : r.a[1]) + 17; t < (h ? r.b[0] : r.b[1]); t += 35) {
          side *= -1; const X = h ? t : c + side * off, Z = h ? c + side * off : t;
          if (nearJunction(h ? t : c, h ? c : t, 10)) continue;
          // arm points toward road centre
          const ry = h ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0);
          sM.push(T(wx(X), 0.15, wz(Z), ry)); lampLights.push(new THREE.Vector3(wx(X), 8.6, wz(Z)));
        }
      }
    }
    instanced(g, 'LAMPU_LENGAN_GANDA_POLE', dbl.pole, poleMat, dM); instanced(g, 'LAMPU_LENGAN_GANDA_HEAD', dbl.head, STREET_LAMP, dM, false);
    instanced(g, 'LAMPU_LENGAN_TUNGGAL_POLE', sgl.pole, poleMat, sM); instanced(g, 'LAMPU_LENGAN_TUNGGAL_HEAD', sgl.head, STREET_LAMP, sM, false);
    // area lamps (multi-head)
    for (const [X, Z, nm] of [[265, 211, 'LAMPU_AREA_PARKIR_HOTEL'], [140, 30, 'LAMPU_AREA_TAMAN'], [150, 181, 'LAMPU_AREA_BELAKANG_RUKO']] as [number, number, string][]) {
      const a = group(g, nm); cyl(a, wx(X), 0, wz(Z), 0.15, 12, poleMat);
      for (let k = 0; k < 4; k++) { const ang = k * Math.PI / 2; boxC(a, wx(X) + Math.cos(ang) * 0.6, 11.8, wz(Z) + Math.sin(ang) * 0.6, 0.6, 0.25, 0.6, STREET_LAMP); }
    }
    // gang lamps (low wall/pole lamps every 25 m)
    const gm: THREE.Matrix4[] = [];
    const gangPole = new THREE.CylinderGeometry(0.05, 0.06, 4, 6).translate(0, 2, 0);
    for (const r of ROADS.filter(r => r.kind === 'gang')) {
      const h = r.a[1] === r.b[1]; const len = h ? r.b[0] - r.a[0] : r.b[1] - r.a[1];
      for (let t = 6; t < len; t += 25) { const X = h ? r.a[0] + t : r.a[0] + 1.7, Z = h ? r.a[1] + 1.7 : r.a[1] + t; gm.push(T(wx(X), 0, wz(Z))); }
    }
    instanced(g, 'LAMPU_GANG_POLE', gangPole, poleMat, gm);
    instanced(g, 'LAMPU_GANG_HEAD', new THREE.SphereGeometry(0.18, 8, 6).translate(0, 4.0, 0), STREET_LAMP, gm, false);
  }

  // E2 traffic lights + signs
  const tls: TrafficLight[] = [];
  {
    const g = group(root, 'E2_LAMPU_LALU_LINTAS_RAMBU');
    for (const [X, Z] of SIGNALISED) {
      const V = ROADS.find(r => r.a[0] === X && r.a[1] !== r.b[1] && r.kind !== 'gang')!;
      const hv = ROAD_SPEC[V.kind].carriage / 2 + 0.7, hh = 8.7;
      // corner, which approach it controls, facing direction (toward incoming traffic)
      const corners: [string, number, number, 'EW' | 'NS', number][] = [
        ['NW', X - hv, Z - hh, 'EW', -Math.PI / 2], // eastbound approach (north half), faces west
        ['SE', X + hv, Z + hh, 'EW', Math.PI / 2],  // westbound approach, faces east
        ['NE', X + hv, Z - hh, 'NS', Math.PI],      // southbound approach (east half), faces north
        ['SW', X - hv, Z + hh, 'NS', 0],            // northbound approach, faces south
      ];
      for (const [tag, cx, cz, axis, ry] of corners) {
        const tg = group(g, `TL_${X}_${Z}_${tag}`);
        tg.position.set(wx(cx), 0.15, wz(cz)); tg.rotation.y = ry;
        cyl(tg, 0, 0, 0, 0.09, 5.2, mat('#2c3136', { metalness: 0.5 }));
        box(tg, -0.05, 4.8, 0, 0.1, 0.1, 3.0, mat('#2c3136', { metalness: 0.5 })); // mast arm over lane (local +z)
        const head = new THREE.Group(); head.position.set(0, 4.3, 2.6); tg.add(head);
        boxC(head, 0, 0, 0, 0.36, 1.1, 0.3, mat('#1b1e21'));
        const lights = (['#ff2b2b', '#ffc21a', '#22e06b'] as const).map((col, i) => {
          const m = new THREE.MeshStandardMaterial({ color: '#222', emissive: col, emissiveIntensity: 0.05 });
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), m); l.position.set(0, 0.88 - i * 0.33, -0.16); head.add(l);
          return m;
        });
        // countdown display
        boxC(head, 0, -0.32, -0.15, 0.3, 0.18, 0.02, mat('#090909'));
        // low pedestrian head on pole
        boxC(tg, 0, 2.4, -0.15, 0.25, 0.5, 0.2, mat('#1b1e21'));
        tls.push({ name: tg.name, X, Z, axis, lights });
      }
    }
    // signs (white w/ red border prohibition; blue info) – heights 2.0 m to bottom
    const sign = (nm: string, X: number, Z: number, kind: 'noparking' | 'speed50' | 'crossing' | 'nouturn', ry: number) => {
      const s = group(g, nm); s.position.set(wx(X), 0.15, wz(Z)); s.rotation.y = ry;
      cyl(s, 0, 0, 0, 0.04, 2.6, M.metal);
      const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d')!;
      if (kind === 'crossing') { x.fillStyle = '#1d4fa3'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(64, 14); x.lineTo(114, 110); x.lineTo(14, 110); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(64, 52, 8, 0, 7); x.fill(); x.fillRect(58, 60, 12, 26); x.fillRect(40, 92, 48, 6); }
      else {
        x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.lineWidth = 14; x.strokeStyle = '#d0021b'; x.beginPath(); x.arc(64, 64, 54, 0, 7); x.stroke();
        x.fillStyle = '#111'; x.font = 'bold 56px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
        if (kind === 'noparking') { x.fillText('P', 64, 66); x.strokeStyle = '#d0021b'; x.lineWidth = 10; x.beginPath(); x.moveTo(26, 26); x.lineTo(102, 102); x.stroke(); }
        if (kind === 'speed50') x.fillText('50', 64, 66);
        if (kind === 'nouturn') { x.lineWidth = 8; x.strokeStyle = '#111'; x.beginPath(); x.arc(64, 56, 18, Math.PI, 0); x.lineTo(82, 90); x.stroke(); x.beginPath(); x.moveTo(46, 56); x.lineTo(46, 90); x.stroke(); x.strokeStyle = '#d0021b'; x.lineWidth = 10; x.beginPath(); x.moveTo(26, 26); x.lineTo(102, 102); x.stroke(); }
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const p = new THREE.Mesh(kind === 'crossing' ? new THREE.PlaneGeometry(0.6, 0.6) : new THREE.CircleGeometry(0.3, 24), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.5 }));
      p.position.set(0, 2.3, 0.05); s.add(p);
    };
    const nS = 150 - 8 - 0.4, sS = 150 + 8 + 0.4;
    [40, 120, 245, 290, 350, 385].forEach((X, i) => sign(`RAMBU_DILARANG_PARKIR_0${i + 1}`, X, i % 2 ? sS : nS, 'noparking', i % 2 ? 0 : Math.PI));
    sign('RAMBU_BATAS_50_01', 30, nS, 'speed50', -Math.PI / 2); sign('RAMBU_BATAS_50_02', 370, sS, 'speed50', Math.PI / 2);
    sign('RAMBU_BATAS_50_03', 200 + 8.4, 30, 'speed50', Math.PI); sign('RAMBU_BATAS_50_04', 200 - 8.4, 270, 'speed50', 0);
    // audit: crossing signs now announce the JPO (mid-block zebras removed)
    sign('RAMBU_PENYEBERANGAN_01', 151, nS, 'crossing', Math.PI); sign('RAMBU_PENYEBERANGAN_02', 151, sS, 'crossing', 0);
    sign('RAMBU_PENYEBERANGAN_03', 178, nS, 'crossing', Math.PI); sign('RAMBU_PENYEBERANGAN_04', 178, sS, 'crossing', 0);
    sign('RAMBU_DILARANG_PUTAR_BALIK_01', 120, 150, 'nouturn', -Math.PI / 2); sign('RAMBU_DILARANG_PUTAR_BALIK_02', 280, 150, 'nouturn', Math.PI / 2);
  }

  // E3 power poles + messy cables
  {
    const g = group(root, 'E3_TIANG_LISTRIK');
    const pts: THREE.Vector3[][] = [];
    const lines: [number, number][][] = [];
    const melati: [number, number][] = []; for (let Z = 8; Z < 300; Z += 35) if (!nearJunction(80, Z, 7)) melati.push([80 - 3.5 - 1.6, Z]);
    const cempaka: [number, number][] = []; for (let X = 6; X < 400; X += 35) if (!nearJunction(X, 240, 7)) cempaka.push([X, 240 + 3.5 + 1.6]);
    lines.push(melati, cempaka);
    for (const r of ROADS.filter(r => r.kind === 'gang')) {
      const h = r.a[1] === r.b[1]; const len = h ? r.b[0] - r.a[0] : r.b[1] - r.a[1]; const l: [number, number][] = [];
      for (let t = 2; t <= len; t += 20) l.push(h ? [r.a[0] + t, r.a[1] - 1.8] : [r.a[0] - 1.8, r.a[1] + t]);
      lines.push(l);
    }
    const poleM: THREE.Matrix4[] = [];
    const cableGeos: THREE.BufferGeometry[] = [];
    for (const l of lines) {
      l.forEach(([X, Z]) => poleM.push(T(wx(X), 0, wz(Z))));
      for (let i = 0; i < l.length - 1; i++) {
        const wires = l === melati || l === cempaka ? 3 : 4 + Math.floor(rand() * 3);
        for (let k = 0; k < wires; k++) {
          const a = new THREE.Vector3(wx(l[i][0]) + rr(-0.3, 0.3), 8.6 - k * 0.35, wz(l[i][1]) + rr(-0.3, 0.3));
          const b = new THREE.Vector3(wx(l[i + 1][0]) + rr(-0.3, 0.3), 8.6 - k * 0.35 + rr(-0.3, 0.2), wz(l[i + 1][1]) + rr(-0.3, 0.3));
          const sag = rr(0.4, l === melati || l === cempaka ? 1.0 : 2.4);
          const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -sag, 0)), b]);
          cableGeos.push(new THREE.TubeGeometry(curve, 10, 0.018, 3, false));
          pts.push([a, b]);
        }
      }
    }
    const poleGeo = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.18, 9, 6).translate(0, 4.5, 0), new THREE.BoxGeometry(1.4, 0.1, 0.1).translate(0, 8.6, 0), new THREE.BoxGeometry(1.0, 0.1, 0.1).translate(0, 7.9, 0)])!;
    instanced(g, 'TIANG_LISTRIK_BETON', poleGeo, mat('#a19d95'), poleM);
    const cables = new THREE.Mesh(mergeGeometries(cableGeos)!, mat('#151515', { roughness: 0.6 })); cables.name = 'KABEL_UTILITAS'; g.add(cables);
    const trafo = group(g, 'TRAFO_01'); box(trafo, wx(59), 0, wz(163.5), 2, 1.6, 1.2, mat('#7d8a7f')); box(trafo, wx(59.2), 1.6, wz(163.6), 1.6, 0.6, 1.0, mat('#5b6660'));
    addCollider(wx(59), wx(61), wz(163.5), wz(164.7));
  }

  // E4 halte (audit: placed on the outer edge of the 5 m sidewalk so 3.5 m walkway stays clear)
  {
    const g = group(root, 'E4_HALTE');
    const nOuter = 150 - 13, sOuter = 150 + 13 - 1.5;
    for (const [nm, X0, Z0, faceSouth] of [['HALTE_01', 146, nOuter, true], ['HALTE_02', 146, sOuter, false], ['HALTE_03', 262, nOuter, true], ['HALTE_04', 262, sOuter, false]] as [string, number, number, boolean][]) {
      const h = group(g, nm);
      box(h, wx(X0), 0.15, wz(Z0), 5, 0.12, 1.5, texMat(TEX.plaza, 2, 1));
      for (const x of [0.2, 4.7]) for (const z of [0.2, 1.2]) box(h, wx(X0 + x), 0.27, wz(Z0 + z), 0.1, 2.6, 0.1, mat('#d35400', { metalness: 0.3 }));
      box(h, wx(X0 - 0.2), 2.87, wz(Z0 - 0.2), 5.4, 0.1, 1.9, mat('#e67e22', { metalness: 0.2 }));
      box(h, wx(X0 + 0.5), 0.27, wz(faceSouth ? Z0 + 0.05 : Z0 + 1.35), 4, 1.9, 0.05, M.glass);
      box(h, wx(X0 + 0.8), 0.67, wz(faceSouth ? Z0 + 0.3 : Z0 + 0.8), 3.4, 0.08, 0.4, M.woodLight);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.4), new THREE.MeshStandardMaterial({ map: signTex(nm.replace('_', ' '), '#0d3b66', '#fff', 512, 85, '#f4d35e') }));
      s.position.set(wx(X0 + 2.5), 3.1, wz(faceSouth ? Z0 + 1.71 : Z0 - 0.21)); s.rotation.y = faceSouth ? 0 : Math.PI; h.add(s);
      addCollider(wx(X0), wx(X0 + 5), wz(Z0), wz(Z0 + 1.5), 0, 3);
    }
  }

  // E5 trees, palms, park
  {
    const g = group(root, 'E5_POHON_TAMAN');
    const treeM: THREE.Matrix4[] = [];
    const add = (X: number, Z: number, s = 1) => { treeM.push(T(wx(X), 0, wz(Z), rand() * 6, s)); };
    for (let X = 8; X < 400; X += 15) { if (nearJunction(X, 150, 18)) continue; add(X, 150 - 12.3, rr(0.85, 1.15)); add(X, 150 + 12.3, rr(0.85, 1.15)); }
    // Thamrin shade trees too
    for (let Zt = 8; Zt < 300; Zt += 15) { if (nearJunction(200, Zt, 18)) continue; add(200 - 12.3, Zt, rr(0.85, 1.1)); add(200 + 12.3, Zt, rr(0.85, 1.1)); }
    // park 30 trees, min spacing 4 m, avoiding jogging loop band
    const park: [number, number][] = [];
    let tries = 0;
    while (park.length < 30 && tries++ < 3000) {
      const X = rr(94, 184), Z = rr(10, 48);
      const onLoop = (Math.abs(Z - 15) < 2 || Math.abs(Z - 45) < 2) && X > 99 && X < 181 || (Math.abs(X - 100) < 2 || Math.abs(X - 180) < 2) && Z > 14 && Z < 46;
      const nearGazebo = Math.hypot(X - 115, Z - 30) < 5 || Math.hypot(X - 165, Z - 30) < 5 || Math.hypot(X - 140, Z - 30) < 4;
      if (onLoop || nearGazebo || park.some(([a, b]) => Math.hypot(a - X, b - Z) < 4)) continue;
      park.push([X, Z]); add(X, Z, rr(0.9, 1.4));
    }
    // kampung shade (mango/banana-ish)
    for (let i = 0; i < 14; i++) add(rr(4, 72), pick([184, 200, 221, 244, 259, 290]), rr(0.6, 0.9));
    const trunk = new THREE.CylinderGeometry(0.15, 0.26, 4.6, 7).translate(0, 2.3, 0);
    const canopy = mergeGeometries([
      new THREE.IcosahedronGeometry(2.0, 1).translate(0, 6.2, 0),
      new THREE.IcosahedronGeometry(1.5, 1).translate(1.2, 5.6, 0.4),
      new THREE.IcosahedronGeometry(1.4, 1).translate(-1.0, 5.7, -0.6),
      new THREE.IcosahedronGeometry(1.2, 1).translate(0.2, 7.2, -0.3),
    ])!;
    instanced(g, 'PROP_TREE_TRUNK', trunk, mat('#5b4331'), treeM);
    const canopyIM = instanced(g, 'PROP_TREE_CANOPY', canopy, mat('#ffffff', { roughness: 0.9, flatShading: true }), treeM);
    const greens = ['#3f7a35', '#4c8a3a', '#356b2e', '#5b9441', '#2f5f2a'];
    for (let i = 0; i < treeM.length; i++) canopyIM.setColorAt(i, new THREE.Color(pick(greens)));
    // palms in Sudirman median every 15 m
    const palmM: THREE.Matrix4[] = [];
    for (let X = 7.5; X < 400; X += 15) { if (nearJunction(X, 150, 16) || Math.abs(X - 165) < 3) continue; palmM.push(T(wx(X), 0.25, wz(150), rand() * 6, rr(0.9, 1.1))); }
    const palmTrunk = new THREE.CylinderGeometry(0.14, 0.22, 7, 7).translate(0, 3.5, 0);
    const fronds: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 8; k++) { const f = new THREE.ConeGeometry(0.35, 3.2, 4); f.rotateZ(Math.PI / 2 + 0.5); f.translate(1.5, 6.6, 0); f.rotateY(k * Math.PI / 4); fronds.push(f); }
    instanced(g, 'PROP_PALM_TRUNK', palmTrunk, mat('#7b6650'), palmM);
    instanced(g, 'PROP_PALM_FRONDS', mergeGeometries(fronds)!, mat('#4f8a3c', { flatShading: true }), palmM);
    // jogging loop 2 m: (100,15)-(180,15)-(180,45)-(100,45)
    const jl = group(g, 'JALUR_JOGGING_01'); const jm = mat('#b0563a', { roughness: 0.95 });
    box(jl, wx(99), 0, wz(14), 82, 0.03, 2, jm, undefined, false); box(jl, wx(99), 0, wz(44), 82, 0.03, 2, jm, undefined, false);
    box(jl, wx(99), 0, wz(14), 2, 0.03, 32, jm, undefined, false); box(jl, wx(179), 0, wz(14), 2, 0.03, 32, jm, undefined, false);
    for (const [nm, X, Z] of [['GAZEBO_01', 115, 30], ['GAZEBO_02', 165, 30]] as [string, number, number][]) {
      const gz = group(g, nm);
      box(gz, wx(X - 2), 0, wz(Z - 2), 4, 0.4, 4, M.woodLight);
      for (const [dx, dz] of [[-1.8, -1.8], [1.6, -1.8], [-1.8, 1.6], [1.6, 1.6]]) box(gz, wx(X + dx), 0.4, wz(Z + dz), 0.2, 2.6, 0.2, M.wood);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 4), texMat(TEX.roofTile, 2, 2)); roof.rotation.y = Math.PI / 4; roof.position.set(wx(X), 3.9, wz(Z)); roof.castShadow = true; gz.add(roof);
      addCollider(wx(X - 2), wx(X + 2), wz(Z - 2), wz(Z + 2), 0, 0.4);
    }
    for (const [X, Z, ry] of [[130, 17.5, 0], [150, 17.5, 0], [130, 42.5, Math.PI], [150, 42.5, Math.PI]] as [number, number, number][]) {
      const b = group(g, `BANGKU_TAMAN_${X}_${Z}`); b.position.set(wx(X), 0, wz(Z)); b.rotation.y = ry;
      box(b, -0.9, 0.42, -0.2, 1.8, 0.06, 0.45, M.wood); box(b, -0.9, 0.5, 0.2, 1.8, 0.4, 0.05, M.wood);
      for (const x of [-0.8, 0.7]) box(b, x, 0, -0.2, 0.08, 0.42, 0.45, M.steel);
    }
    // central fountain/plaza in park
    const fp = group(g, 'TAMAN_PLAZA'); cyl(fp, wx(140), 0, wz(30), 3, 0.5, mat('#b7b2a8'), undefined, 24); cyl(fp, wx(140), 0.5, wz(30), 2.6, 0.02, mat('#3d7ea6', { roughness: 0.1, metalness: 0.2 }), undefined, 24); cyl(fp, wx(140), 0, wz(30), 0.3, 1.6, mat('#b7b2a8'));
  }

  // E6 billboard, gapura, pos ronda, gerobak
  {
    const g = group(root, 'E6_PROPERTI_KHAS');
    const ads = ['BELAJAR JARINGAN DI SMK!', 'INTERNET CEPAT 1 GBPS', 'NUSANTARA TECH HOTEL'];
    [[112, 136.5], [230, 136.5], [300, 163.5]].forEach(([X, Z], i) => {
      const b = group(g, `BILLBOARD_0${i + 1}`);
      for (const dx of [-2, 2]) cyl(b, wx(X + dx), 0, wz(Z), 0.18, 8, M.steel);
      box(b, wx(X - 3), 8, wz(Z) - 0.15, 6, 3, 0.3, mat('#2c3136'));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 2.8), new THREE.MeshStandardMaterial({ map: signTex(ads[i], ['#0a3d62', '#b71540', '#13202b'][i], '#fff', 1024, 495, '#f6b93b'), roughness: 0.6 }));
      p.position.set(wx(X), 9.5, wz(Z) + (Z < 150 ? 0.16 : -0.16)); p.rotation.y = Z < 150 ? 0 : Math.PI; b.add(p);
      const p2 = p.clone(); p2.position.z = wz(Z) + (Z < 150 ? -0.16 : 0.16); p2.rotation.y = Z < 150 ? Math.PI : 0; b.add(p2);
    });
    for (const [nm, X] of [['GAPURA_01', 28], ['GAPURA_02', 52]] as [string, number][]) {
      const gp = group(g, nm); const Z = 163.6;
      const pm = mat('#d64541');
      box(gp, wx(X - 1.75), 0, wz(Z), 0.5, 3.5, 0.5, pm); box(gp, wx(X + 1.25), 0, wz(Z), 0.5, 3.5, 0.5, pm);
      box(gp, wx(X - 2.0), 3.5, wz(Z) - 0.05, 4.0, 0.7, 0.6, M.white);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.55), new THREE.MeshStandardMaterial({ map: signTex('KAMPUNG MELATI', '#ffffff', '#b71c1c', 1024, 148, '#b71c1c') }));
      t.position.set(wx(X), 3.85, wz(Z) - 0.07); t.rotation.y = Math.PI; gp.add(t);
      // merah-putih flags
      for (const dx of [-1.5, 1.5]) { cyl(gp, wx(X + dx), 4.2, wz(Z + 0.25), 0.02, 1.2, M.metal); box(gp, wx(X + dx), 4.9, wz(Z + 0.25), 0.6, 0.2, 0.01, M.red, undefined, false); box(gp, wx(X + dx), 4.7, wz(Z + 0.25), 0.6, 0.2, 0.01, M.white, undefined, false); }
      addCollider(wx(X - 1.75), wx(X - 1.25), wz(Z), wz(Z + 0.5)); addCollider(wx(X + 1.25), wx(X + 1.75), wz(Z), wz(Z + 0.5));
    }
    const pr = group(g, 'POS_RONDA_01');
    for (const [dx, dz] of [[0, 0], [2.85, 0], [0, 2.85], [2.85, 2.85]]) box(pr, wx(34 + dx), 0, wz(287 + dz), 0.15, 2.6, 0.15, M.wood);
    box(pr, wx(34), 0.5, wz(287), 3, 0.12, 3, M.woodLight);
    const prr = new THREE.Mesh((() => { const s = new THREE.Shape(); s.moveTo(-1.8, 0); s.lineTo(1.8, 0); s.lineTo(0, 1.0); s.lineTo(-1.8, 0); const geo = new THREE.ExtrudeGeometry(s, { depth: 3.6, bevelEnabled: false }); geo.translate(0, 0, -1.8); return geo; })(), texMat(TEX.roofTile, 1, 1));
    prr.position.set(wx(35.5), 2.6, wz(288.5)); prr.castShadow = true; pr.add(prr);
    box(pr, wx(34.2), 2.0, wz(287.1), 0.2, 0.35, 0.2, M.wood); // kentongan
    addCollider(wx(34), wx(37), wz(287), wz(290), 0, 2.6);
    for (const [nm, X, Z, col, label] of [['GEROBAK_BAKSO_01', 88, 177, '#2f6fb3', 'BAKSO'], ['GEROBAK_NASGOR_01', 150, 181, '#c0392b', 'NASI GORENG'], ['GEROBAK_KOPI_01', 276, 164.2, '#6d4c41', 'KOPI']] as [string, number, number, string, string][]) {
      const gb = group(g, nm); gb.position.set(wx(X), 0, wz(Z));
      box(gb, -0.9, 0.5, -0.45, 1.8, 0.9, 0.9, mat(col)); box(gb, -0.9, 1.4, -0.45, 1.8, 0.05, 0.9, M.white);
      box(gb, -0.85, 1.45, -0.4, 1.7, 0.5, 0.02, M.glass);
      for (const dx of [-0.6, 0.6]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16), M.black); w.position.set(dx, 0.3, 0.47); gb.add(w); }
      cyl(gb, 0.7, 1.45, 0, 0.03, 1.3, M.metal); const um = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 10, 1, true), mat(pick(['#e74c3c', '#f1c40f', '#27ae60']), { side: THREE.DoubleSide })); um.position.set(0.7, 2.9, 0); gb.add(um);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshStandardMaterial({ map: signTex(label, '#fff8e1', '#b71c1c', 512, 96, '#b71c1c') })); s.position.set(0, 1.1, 0.46); gb.add(s);
      addCollider(wx(X - 0.9), wx(X + 0.9), wz(Z - 0.45), wz(Z + 0.45), 0, 1.6);
    }
  }

  // F1 spawn
  const sp = box(world, wx(SPAWN[0]) - 0.15, 0.15, wz(SPAWN[1]) - 0.15, 0.3, 0.3, 0.3, M.spawn, 'SPAWN_PLAYER_01', false);
  sp.userData.spawn = true;

  // C9 parking lines + G1 parked vehicles
  {
    const g = group(root, 'PARKIR_HOTEL');
    box(g, wx(220), 0, wz(195), 90, 0.1, 33, texMat(TEX.asphalt, 10, 4), 'PARKIR_HOTEL_SLAB', false);
    const lm = M.marking;
    for (const [z0] of [[197], [206]]) { for (let i = 0; i <= 18; i++) box(g, wx(225 + i * 2.5) - 0.05, 0.1, wz(z0), 0.1, 0.01, 5, lm, undefined, false); }
  }
  const gv = group(root, 'G1_KENDARAAN_PARKIR');
  // slots 10-12 of the row (X 241.5-243.5) hold the rideable PROP_MOTOR_01..03 (game/motor.ts)
  for (let i = 0; i < 12; i++) { const col = pick(['#c0392b', '#2c3e50', '#ecf0f1', '#2980b9', '#111']); if (i >= 9) continue; /* keep the seeded sequence */ const m = motorMesh(col); m.name = `PARKED_MOTOR_${String(i + 1).padStart(2, '0')}`; m.position.set(wx(232.5 + i * 1.0), 0.17, wz(165)); m.rotation.y = 0; gv.add(m); }
  for (let i = 0; i < 10; i++) { const c = carMesh(pick(CAR_COLORS)); c.name = `PARKED_CAR_${String(i + 1).padStart(2, '0')}`; c.position.set(wx(225 + 1.25 + i * 5), 0.1, wz(199.5)); c.rotation.y = 0; gv.add(c); addCollider(wx(225 + i * 5 + 0.3), wx(225 + i * 5 + 2.2), wz(197.2), wz(201.8), 0, 1.5); }
  return { root, tls };
}

export interface TrafficLight { name: string; X: number; Z: number; axis: 'EW' | 'NS'; lights: THREE.MeshStandardMaterial[] }

export const CAR_COLORS = ['#f2f2f2', '#1c1c1c', '#9aa3aa', '#b71c1c', '#1e3a8a', '#e5e7eb', '#334155', '#f59e0b', '#0f766e'];
/** Car pointing toward -Z (local), origin ground centre. Delegates to src/assets/vehicles.ts.
 *  kind 'car' picks a Jakarta-typical private car (MPV / hatch / sedan). */
export function carMesh(color: string, kind: 'car' | 'taxi' | 'bus' | 'angkot' = 'car') {
  return makeCar(kind === 'car' ? randomCarKind() : kind, color);
}
/** Parked matic scooter without rider (forward -Z, ~1.86 m). */
export function motorMesh(color: string) {
  return makeMotor({ color, rider: false });
}
