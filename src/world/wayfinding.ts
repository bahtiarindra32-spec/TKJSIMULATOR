// Wayfinding: painted lane arrows (left-hand traffic), street-name plates at every junction, overhead guide signs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROADS, ROAD_SPEC, JUNCTIONS, wx, wz } from '../data/city';
import { group, cyl, box, mat } from './core';

const NICE: Record<string, string> = {
  ROAD_SUDIRMAN: 'Jl. Jend. Sudirman', ROAD_THAMRIN: 'Jl. M.H. Thamrin', ROAD_KEBONJERUK: 'Jl. Kebon Jeruk', ROAD_CEMPAKA: 'Jl. Cempaka',
  ROAD_MELATI: 'Jl. Melati', ROAD_KEMUNING: 'Jl. Kemuning',
};
export const streetLabel = (name: string) => NICE[name] ?? name.replace('ROAD_GANG_', 'Gang ').replace('ROAD_', 'Jl. ');

/** straight arrow shape, length 5 m, pointing +X in local XZ (lies flat) */
function arrowGeo(kind: 'straight' | 'left' | 'straightLeft') {
  const s = new THREE.Shape();
  // shaft
  s.moveTo(-2.5, -0.15); s.lineTo(1.0, -0.15); s.lineTo(1.0, -0.5); s.lineTo(2.5, 0); s.lineTo(1.0, 0.5); s.lineTo(1.0, 0.15); s.lineTo(-2.5, 0.15); s.lineTo(-2.5, -0.15);
  const geos = [new THREE.ShapeGeometry(s)];
  if (kind !== 'straight') {
    const l = new THREE.Shape(); // branch to the driver's left: shape +Y -> world -Z after rotateX(-90deg), i.e. north when travelling +X
    l.moveTo(-0.6, 0.15); l.lineTo(0.0, 0.15); l.lineTo(0.0, 1.0); l.lineTo(0.4, 1.0); l.lineTo(-0.3, 1.9); l.lineTo(-1.0, 1.0); l.lineTo(-0.6, 1.0); l.lineTo(-0.6, 0.15);
    geos.push(new THREE.ShapeGeometry(l));
  }
  const g = mergeGeometries(geos)!;
  g.rotateX(-Math.PI / 2); // shape XY -> world XZ (shape +Y -> world -Z)
  return g;
}

export function buildWayfinding(world: THREE.Object3D) {
  const root = group(world, 'WAYFINDING');
  const paint = mat('#f4f4ee', { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const straight = arrowGeo('straight'), sl = arrowGeo('straightLeft');
  const mats: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const r of ROADS) {
    if (r.kind === 'gang') continue;
    const h = r.a[1] === r.b[1]; const c = h ? r.a[1] : r.a[0];
    const t0 = h ? r.a[0] : r.a[1], t1 = h ? r.b[0] : r.b[1];
    const offs = r.kind === 'arteri' ? [2.75, 6.25] : [1.75];
    for (const dir of [1, -1] as const) for (const o of offs) {
      // lane centre (left-hand traffic: +X on north side, +Z on east side)
      const lc = h ? c - dir * o : c + dir * o;
      // heading angle: arrow geometry points +X
      const yaw = h ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      q.setFromAxisAngle(up, yaw);
      const crossings = JUNCTIONS.filter(([jx, jz]) => (h ? Math.abs(jz - c) < 1 : Math.abs(jx - c) < 1)).map(([jx, jz]) => (h ? jx : jz));
      for (const jt of crossings) {
        // arrow 22 m before each junction (behind the stop line), outer lane may turn left (left-hand traffic: left turn = kerb side)
        const at = jt - dir * 24;
        if (at < t0 + 4 || at > t1 - 4) continue;
        const outer = o === Math.max(...offs);
        const pos = h ? new THREE.Vector3(wx(at), 0.043, wz(lc)) : new THREE.Vector3(wx(lc), 0.043, wz(at));
        mats.push({ geo: outer ? sl : straight, m: new THREE.Matrix4().compose(pos, q, one) });
        const at2 = jt - dir * 44;
        if (at2 > t0 + 4 && at2 < t1 - 4) mats.push({ geo: straight, m: new THREE.Matrix4().compose(h ? new THREE.Vector3(wx(at2), 0.043, wz(lc)) : new THREE.Vector3(wx(lc), 0.043, wz(at2)), q, one) });
      }
    }
  }
  const merged = mergeGeometries(mats.map(({ geo, m }) => geo.clone().applyMatrix4(m)))!;
  const arrows = new THREE.Mesh(merged, paint); arrows.name = 'ARROW_LANE_MARKINGS'; arrows.receiveShadow = true; root.add(arrows);

  // street-name plates at junction corners (green plate, white text: Indonesian guide-sign colours)
  const plateCache = new Map<string, THREE.MeshStandardMaterial>();
  const plateMat = (text: string) => {
    if (!plateCache.has(text)) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const g = cv.getContext('2d')!;
      g.fillStyle = '#0b6b3a'; g.fillRect(0, 0, 512, 96); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(6, 6, 500, 84);
      g.fillStyle = '#fff'; let fs = 52; g.font = `bold ${fs}px Arial, sans-serif`; const w = g.measureText(text).width; if (w > 470) { fs = Math.floor(fs * 470 / w); g.font = `bold ${fs}px Arial, sans-serif`; }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      plateCache.set(text, new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    }
    return plateCache.get(text)!;
  };
  const poleM = mat('#5d656b', { metalness: 0.5, roughness: 0.5 });
  for (const [X, Z] of JUNCTIONS) {
    const hr = ROADS.find(r => r.a[1] === r.b[1] && r.a[1] === Z && X >= r.a[0] && X <= r.b[0]);
    const vr = ROADS.find(r => r.a[0] === r.b[0] && r.a[0] === X && Z >= r.a[1] && Z <= r.b[1]);
    if (!hr || !vr || hr.kind === 'gang' || vr.kind === 'gang') continue;
    const hv = ROAD_SPEC[vr.kind].width / 2 - 1.0, hh = ROAD_SPEC[hr.kind].width / 2 - 1.0;
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      const g = group(root, `PAPAN_NAMA_JALAN_${X}_${Z}_${sx > 0 ? 'SE' : 'NW'}`);
      const px = wx(X + sx * hv), pz = wz(Z + sz * hh);
      cyl(g, px, 0.15, pz, 0.05, 3.2, poleM);
      // plate along the horizontal street (readable from both sides) and plate along the vertical street
      for (const [text, ry, y] of [[streetLabel(hr.name), 0, 3.05], [streetLabel(vr.name), Math.PI / 2, 2.7]] as [string, number, number][]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), plateMat(text)); p.position.set(px, y, pz); p.rotation.y = ry; g.add(p);
        const b = p.clone(); b.rotation.y = ry + Math.PI; b.position.add(new THREE.Vector3(Math.sin(ry) * -0.01, 0, Math.cos(ry) * -0.01)); g.add(b);
      }
    }
  }

  // overhead guide signs (green, white text) on Sudirman approaches toward the hotel
  const guide = (name: string, X: number, Zpole: number, dirSign: 1 | -1, lines: string[]) => {
    // dirSign +1: pole on north kerb, arm reaches south over eastbound lanes, panel faces west (toward drivers heading +X)
    const g = group(root, name);
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 384; const x = cv.getContext('2d')!;
    x.fillStyle = '#0b6b3a'; x.fillRect(0, 0, 1024, 384); x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(10, 10, 1004, 364);
    x.fillStyle = '#fff'; x.font = 'bold 66px Arial, sans-serif'; x.textBaseline = 'middle';
    lines.forEach((l, i) => x.fillText(l, 40, 75 + i * 117));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    cyl(g, wx(X), 0.15, wz(Zpole), 0.18, 7.4, poleM);
    const zA = Zpole, zB = Zpole + dirSign * 9;
    box(g, wx(X) - 0.1, 7.0, wz(Math.min(zA, zB)), 0.2, 0.25, 9, poleM, undefined, false);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    p.position.set(wx(X) - dirSign * 0.15, 6.2, wz(Zpole + dirSign * 5.5)); p.rotation.y = dirSign > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(p);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.1), mat('#7d868c', { metalness: 0.5 })); back.position.copy(p.position).add(new THREE.Vector3(dirSign * 0.02, 0, 0)); back.rotation.y = p.rotation.y + Math.PI; g.add(back);
  };
  guide('RAMBU_PETUNJUK_01', 150, 137.5, 1, ['\u2191 Nusantara Tech Hotel 70 m', '\u2191 Simpang Jl. M.H. Thamrin', '\u2190 Taman Kota']);
  guide('RAMBU_PETUNJUK_02', 290, 162.5, -1, ['\u2191 Nusantara Tech Hotel 40 m', '\u2191 Pasar & Masjid', '\u2191 Kampung Melati']);
  return root;
}
