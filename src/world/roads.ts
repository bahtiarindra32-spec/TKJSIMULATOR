// FASE A — Jalan (Streetscape equivalent): asphalt, sidewalks, curbs, median, markings, zebra crossings, gangs, JPO.
import * as THREE from 'three';
import { ROADS, ROAD_SPEC, JUNCTIONS, SIGNALISED, wx, wz, type Road } from '../data/city';
import { TEX, texMat, M, box, flat, group, mat, addCollider, signTex } from './core';

const SW_H = 0.15;

// instanced stripe collector
type Stripe = { x: number; z: number; len: number; w: number; alongX: boolean; y: number };
const stripes: Record<string, Stripe[]> = { white: [], yellow: [] };
function stripe(x: number, z: number, len: number, w: number, alongX: boolean, color: 'white' | 'yellow' = 'white', y = 0.038) {
  stripes[color].push({ x, z, len, w, alongX, y });
}
function flushStripes(parent: THREE.Object3D) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  for (const [color, list] of Object.entries(stripes)) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, color === 'white' ? M.marking : M.markingY, list.length);
    im.name = `MARKA_${color.toUpperCase()}`; im.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    list.forEach((s, i) => {
      m4.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(s.alongX ? s.len : s.w, 1, s.alongX ? s.w : s.len));
      im.setMatrixAt(i, m4);
    });
    parent.add(im);
  }
}

const isH = (r: Road) => r.a[1] === r.b[1];

/** crossing positions along a road (city coords along its axis) with the crossing road's total width */
function crossings(r: Road) {
  const res: { t: number; w: number; name: string }[] = [];
  if (r.kind === 'gang') return res;
  for (const o of ROADS) {
    if (o === r || o.kind === 'gang' || isH(o) === isH(r)) continue;
    const t = isH(r) ? o.a[0] : o.a[1];
    res.push({ t, w: ROAD_SPEC[o.kind].width, name: o.name });
  }
  return res.sort((a, b) => a.t - b.t);
}

export function buildRoads(world: THREE.Object3D) {
  const root = group(world, 'FASE_A_JALAN');
  const sidewalkMatCache = new Map<string, THREE.Material>();
  const swMat = (len: number, w: number) => {
    const k = `${len.toFixed(1)}_${w}`;
    if (!sidewalkMatCache.has(k)) sidewalkMatCache.set(k, texMat(TEX.sidewalk, len / 2, w / 2));
    return sidewalkMatCache.get(k)!;
  };
  const curbPaint = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d')!;
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 32, 8); g.fillStyle = '#1b1b1b'; g.fillRect(32, 0, 32, 8);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const curbMat = (len: number) => { const t = curbPaint.clone(); t.needsUpdate = true; t.repeat.set(len / 2, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }); };

  for (const r of ROADS) {
    const g = group(root, r.name);
    const spec = ROAD_SPEC[r.kind];
    const h = isH(r);
    const c = h ? r.a[1] : r.a[0]; // axis constant (city)
    const t0 = h ? r.a[0] : r.a[1], t1 = h ? r.b[0] : r.b[1];

    if (r.kind === 'gang') {
      // A6: 3 m concrete/paving, no sidewalk/markings
      const len = t1 - t0;
      const m = texMat(TEX.concrete, h ? len / 4 : 0.75, h ? 0.75 : len / 4);
      if (h) box(g, wx(t0), 0, wz(c - 1.5), len, 0.03, 3, m, undefined, false);
      else box(g, wx(c - 1.5), 0, wz(t0), 3, 0.03, len, m, undefined, false);
      // drainage gutter on one side (selokan) – kampung detail
      const gm = mat('#4a4a44');
      if (h) box(g, wx(t0), 0.0, wz(c + 1.5), len, 0.035, 0.35, gm, undefined, false);
      else box(g, wx(c + 1.5), 0.0, wz(t0), 0.35, 0.035, len, gm, undefined, false);
      continue;
    }

    // segments between crossings
    const cr = crossings(r);
    const cuts: [number, number][] = [];
    let start = t0;
    for (const x of cr) { cuts.push([start, x.t - x.w / 2]); start = x.t + x.w / 2; }
    cuts.push([start, t1]);

    const half = spec.width / 2, carr = spec.carriage / 2, sw = spec.sidewalk;
    for (const [a, b] of cuts) {
      const len = b - a; if (len <= 0.01) continue;
      const am = texMat(TEX.asphalt, h ? len / 8 : carr * 2 / 8, h ? carr * 2 / 8 : len / 8);
      // asphalt
      if (h) box(g, wx(a), 0, wz(c - carr), len, 0.02, carr * 2, am, undefined, false);
      else box(g, wx(c - carr), 0, wz(a), carr * 2, 0.02, len, am, undefined, false);
      // sidewalks both sides + curbs
      for (const side of [-1, 1]) {
        const off0 = side < 0 ? c - half : c + carr; // min edge along cross-axis
        if (h) {
          box(g, wx(a), 0, wz(off0), len, SW_H, sw, swMat(len, sw), undefined, false);
          box(g, wx(a), 0, wz(side < 0 ? c - carr - 0.2 : c + carr), len, SW_H + 0.02, 0.2, r.kind === 'arteri' ? curbMat(len) : M.curb, undefined, false);
        } else {
          box(g, wx(off0), 0, wz(a), sw, SW_H, len, swMat(len, sw), undefined, false);
          box(g, wx(side < 0 ? c - carr - 0.2 : c + carr), 0, wz(a), 0.2, SW_H + 0.02, len, r.kind === 'arteri' ? curbMat(len) : M.curb, undefined, false);
        }
      }
      // median (arteri)
      if (spec.median) {
        const mm = texMat(TEX.grass, 1, len / 4);
        if (h) { box(g, wx(a), 0, wz(c - 1), len, 0.25, 2, curbMat(len), undefined, false); flat(g, wx(a), wz(c - 0.8), len, 1.6, 0.26, mm); addCollider(wx(a), wx(b), wz(c - 1), wz(c + 1), 0, 0.6); }
        else { box(g, wx(c - 1), 0, wz(a), 2, 0.25, len, curbMat(len), undefined, false); flat(g, wx(c - 0.8), wz(a), 1.6, len, 0.26, texMat(TEX.grass, len / 4, 1)); addCollider(wx(c - 1), wx(c + 1), wz(a), wz(b), 0, 0.6); }
      }
      // markings
      const along = (t: number, o: number) => (h ? [wx(t), wz(c + o)] : [wx(c + o), wz(t)]) as [number, number];
      const solid = (o: number) => { const [x, z] = along((a + b) / 2, o); stripe(x, z, len, 0.15, h); };
      const dashed = (o: number) => { for (let t = a + 2; t < b - 3; t += 9) { const [x, z] = along(t + 1.5, o); stripe(x, z, 3, 0.12, h); } };
      if (r.kind === 'arteri') {
        for (const s of [-1, 1]) { solid(s * 7.7); solid(s * 1.3); dashed(s * 4.5); }
      } else {
        solid(3.3); solid(-3.3); dashed(0);
      }
    }
  }

  // junction squares + corner sidewalks
  const jroot = group(root, 'JUNCTIONS');
  for (const [X, Z] of JUNCTIONS) {
    const H = ROADS.find(r => isH(r) && r.a[1] === Z && r.kind !== 'gang')!;
    const V = ROADS.find(r => !isH(r) && r.a[0] === X && r.kind !== 'gang')!;
    const sh = ROAD_SPEC[H.kind], sv = ROAD_SPEC[V.kind];
    const wv = sv.width / 2, whh = sh.width / 2;
    const jg = group(jroot, `JUNCTION_${X}_${Z}`);
    box(jg, wx(X - wv), 0, wz(Z - whh), wv * 2, 0.026, whh * 2, texMat(TEX.asphalt, wv / 4, whh / 4), undefined, false);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx < 0 ? X - wv : X + sv.carriage / 2, cz = sz < 0 ? Z - whh : Z + sh.carriage / 2;
      box(jg, wx(cx), 0, wz(cz), sv.sidewalk, SW_H, sh.sidewalk, swMat(sv.sidewalk, sh.sidewalk), undefined, false);
    }
  }

  // A5 zebra crossings: 4 legs at the 3 Sudirman junctions + mid-block X=140, X=260 (total 14)
  const zebra = (X: number, Z: number, alongX: boolean, carriage: number) => {
    // stripes parallel to traffic, 4 m long (crossing width), across the carriageway
    for (let o = -carriage / 2 + 0.5; o <= carriage / 2 - 0.4; o += 1.0) {
      if (alongX) stripe(wx(X), wz(Z + o), 4, 0.5, true, 'white', 0.04);
      else stripe(wx(X + o), wz(Z), 4, 0.5, false, 'white', 0.04);
    }
  };
  let zebraCount = 0;
  for (const [X, Z] of SIGNALISED) {
    const V = ROADS.find(r => !isH(r) && r.a[0] === X && r.kind !== 'gang')!;
    const sv = ROAD_SPEC[V.kind];
    const dX = sv.width / 2 + 2 + 2, dZ = ROAD_SPEC.arteri.width / 2 + 2 + 2;
    zebra(X - dX, Z, true, 16); zebra(X + dX, Z, true, 16);              // across Sudirman (W, E legs)
    zebra(X, Z - dZ, false, sv.carriage); zebra(X, Z + dZ, false, sv.carriage); // across crossing road (N, S legs)
    zebraCount += 4;
    // stop lines on left-lane approaches (left-hand traffic)
    stripe(wx(X - dX - 2.6), wz(Z - 4.5), 0.4, 6.6, true); // eastbound on north half
    stripe(wx(X + dX + 2.6), wz(Z + 4.5), 0.4, 6.6, true); // westbound on south half
    const lane = sv.carriage / 2;
    stripe(wx(X + lane / 2), wz(Z - dZ - 2.6), 0.4, lane - 0.4, false); // southbound on east half
    stripe(wx(X - lane / 2), wz(Z + dZ + 2.6), 0.4, lane - 0.4, false); // northbound on west half
  }
  // audit: mid-block zebras at X=140/260 removed (not allowed on divided 4-lane arterial <300 m from junction); JPO_01 serves crossing.
  root.userData.zebraCount = zebraCount; // 12

  // C9 driveway + E? Driveway hotel from ROAD_CEMPAKA at X=270 to parking (Z=228), width 6
  const dw = group(root, 'DRIVEWAY_HOTEL_01');
  box(dw, wx(267), 0, wz(228), 6, 0.17, 240 - 3.5 - 228, texMat(TEX.asphalt, 1, 1.5), undefined, false);

  // A7 JPO_01 over Sudirman at X=165 (audit: stairs 15.5 m run for 5.5 m rise = 19.5 deg <= 20, width 2 m)
  const jpo = group(root, 'JPO_01');
  const steelBlue = mat('#3b6f8f', { metalness: 0.5, roughness: 0.45 });
  const deckY = 5.5, zN = 137, zS = 163;
  box(jpo, wx(163.75), deckY, wz(zN), 2.5, 0.25, zS - zN, mat('#8c8f93'), 'JPO_01_DECK');
  for (const s of [0, 2.4]) box(jpo, wx(163.75 + s), deckY + 0.25, wz(zN), 0.1, 1.1, zS - zN, steelBlue);
  box(jpo, wx(163.4), deckY + 2.8, wz(zN), 3.2, 0.08, zS - zN, mat('#d9dde0', { metalness: 0.3 }));
  for (let z = zN + 0.5; z <= zS; z += 6) for (const s of [0, 2.4]) box(jpo, wx(163.75 + s), deckY + 0.25, wz(z), 0.1, 2.6, 0.1, steelBlue);
  for (const z of [138, 150, 162]) box(jpo, wx(164.6), 0, wz(z - 0.4), 0.8, deckY, 0.8, mat('#9b9a95'));
  addCollider(wx(164.6), wx(165.4), wz(149.6), wz(150.4), 0, deckY);
  // rail colliders (only block at deck height) + stair side rails
  addCollider(wx(166.15), wx(166.4), wz(zN), wz(zS), deckY, deckY + 1.5);
  addCollider(wx(163.6), wx(163.85), wz(zN + 2), wz(zS - 2), deckY, deckY + 1.5);
  addCollider(wx(163.6), wx(166.4), wz(zN - 0.3), wz(zN), deckY, deckY + 1.5);
  addCollider(wx(163.6), wx(166.4), wz(zS), wz(zS + 0.3), deckY, deckY + 1.5);
  for (const [zs, name] of [[zN, 'JPO_01_STAIR_N'], [zS - 2, 'JPO_01_STAIR_S']] as [number, string][]) {
    const st = group(jpo, name);
    const steps = 32, run = 15.5, x0 = 165 - run;
    for (let i = 0; i < steps; i++) box(st, wx(x0 + (run * i) / steps), (deckY * (i + 1)) / steps - 0.2, wz(zs), run / steps + 0.02, 0.2, 2, mat('#8c8f93'), undefined, false);
    const len = Math.hypot(run, deckY), ang = Math.atan2(deckY, run);
    for (const o of [0, 2]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), steelBlue); rail.position.set(wx(x0 + run / 2), deckY / 2 + 1.0, wz(zs + o)); rail.rotation.z = ang; st.add(rail); }
    const str = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 2), mat('#6f7276')); str.position.set(wx(x0 + run / 2), deckY / 2 - 0.35, wz(zs + 1)); str.rotation.z = ang; str.castShadow = true; st.add(str);
    st.userData.stair = { x0: wx(x0), x1: wx(165), z0: wz(zs), z1: wz(zs + 2), rise: deckY };
    addCollider(wx(x0 + 1.5), wx(165), wz(zs) - 0.15, wz(zs), 0.6, deckY + 1.5); addCollider(wx(x0 + 1.5), wx(165), wz(zs + 2), wz(zs + 2) + 0.15, 0.6, deckY + 1.5);
  }
  const jpoSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.8), new THREE.MeshStandardMaterial({ map: signTex('JPO SUDIRMAN', '#1f5f8b', '#fff', 512, 64, '#2bd46b') }));
  jpoSign.position.set(wx(163.7), deckY - 0.25, wz(150)); jpoSign.rotation.y = -Math.PI / 2; jpo.add(jpoSign);
  const jpoSign2 = jpoSign.clone(); jpoSign2.position.x = wx(166.3); jpoSign2.rotation.y = Math.PI / 2; jpo.add(jpoSign2);

  flushStripes(root);
  return root;
}
