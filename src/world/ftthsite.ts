// Fase 3 FTTH (chunk B1a): the outside plant that feeds BLD_RUMAH_01, drawn from data/ftthsite.ts (the netsim takes its
// span lengths from the same numbers). Built into the house group, so main.ts bakes it with the house (BATCH_BLD_RUMAH_01):
// plain-coloured parts merge into the house's existing per-finish meshes, the one label atlas is one extra draw call and
// the four ONT LED overlays (one userData.live mesh with a 4-pixel texture) one more. Everything is named PROP_FTTH_*.
//   PROP_FTTH_TIANG_01      concrete pole 7.5 m on the kerb of Jl. Flamboyan, steel bands, drop clamp, service loop
//   PROP_FTTH_ODP_FLB_01    ODP 1:8 box on the pole (label + port table), grommets, drop tails
//   PROP_FTTH_TIANG_02      the next pole west (the neighbours' drops run there)
//   PROP_FTTH_DROP_RUMAH    drop cable: ODP → up the pole → clamp → sagging span → house hook → down the wall → roset
//   PROP_FTTH_RISER / _HANDHOLE_*  distribution: riser pipe on the pole, duct hand-holes at the pole and the ODC
//   PROP_FTTH_ODC_FLB       green ODC cabinet on its plinth at the back of the sidewalk
//   PROP_FTTH_ONT_LEDS      PON / LOS / INTERNET / LAN1 overlays on the existing ONT top (one mesh, 4-px texture; updateFtthLeds)
import * as THREE from 'three';
import { wx, wz } from '../data/city';
import { FTTH_RUMAH as F, WALK_Y, type P3 } from '../data/ftthsite';
import { box, cyl, group, mat, canvasTex } from './core';

type Led = 'off' | 'green' | 'green-blink' | 'red' | 'red-blink';
const soft = <O extends THREE.Object3D>(o: O) => { o.userData.noCollide = true; return o; };
const W = (p: P3) => new THREE.Vector3(wx(p[0]), p[1], wz(p[2]));

// finishes chosen to match ones the house already bakes (default 0.85 rough / the fence bars' 0.5 metal), so the plain
// parts add no draw call: bakeStatic merges plain materials per finish and moves the colour into the vertices
const POLE = mat('#a8a39a');
const STEEL = mat('#80878e', { metalness: 0.5, roughness: 0.5 });
const CABLE = mat('#151515');
const ODP_BODY = mat('#3b4045');
const ODC_GREEN = mat('#2f6b45');
const ODC_DARK = mat('#1f4a30');
const CONCRETE = mat('#9e998f');

/** one canvas for both labels: left 0..360 = ODP door (0.30 × 0.42 m), right 512..1024 × 0..256 = ODC plate (0.5 × 0.25 m) */
function labelAtlas() {
  return canvasTex(1024, 512, g => {
    g.fillStyle = '#2b3035'; g.fillRect(0, 0, 360, 512);
    // ODP door: owner sticker, id, ratio, port table, laser warning
    g.fillStyle = '#e8e9e4'; g.fillRect(18, 18, 324, 120);
    g.fillStyle = '#0e3a7c'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('NusaFiber', 180, 58);
    g.fillStyle = '#13202b'; g.font = 'bold 40px Arial, sans-serif'; g.fillText('ODP-FLB-01', 180, 104);
    g.font = 'bold 22px Arial, sans-serif'; g.fillText('PASSIVE SPLITTER 1:8 · ODC-FLB', 180, 130);
    const ports: [string, string, string][] = [['1', 'No. 17 Hendra', '#2fa64a'], ['2', 'No. 15', '#2fa64a'], ['3', 'No. 13', '#2fa64a'], ['4', 'kosong', '#d9d9d9'], ['5', 'kosong', '#d9d9d9'], ['6', 'kosong', '#d9d9d9'], ['7', 'belum aktif', '#777'], ['8', 'belum aktif', '#777']];
    g.textAlign = 'left';
    ports.forEach(([n, who, c], i) => {
      const y = 160 + i * 34;
      g.fillStyle = c; g.fillRect(24, y, 26, 26);
      g.fillStyle = '#111'; g.font = 'bold 20px Arial, sans-serif'; g.fillText(n, 31, y + 20);
      g.fillStyle = '#e8e9e4'; g.font = '22px Arial, sans-serif'; g.fillText(`PORT ${n}  ${who}`, 62, y + 21);
    });
    g.fillStyle = '#f0c02e'; g.fillRect(18, 446, 324, 50);
    g.fillStyle = '#111'; g.font = 'bold 20px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('AWAS SINAR LASER', 180, 468); g.fillText('JANGAN MENATAP KONEKTOR', 180, 490);
    // ODC plate
    g.fillStyle = '#eef0ec'; g.fillRect(512, 0, 512, 256);
    g.fillStyle = '#0e3a7c'; g.fillRect(512, 0, 512, 60);
    g.fillStyle = '#fff'; g.font = 'bold 40px Arial, sans-serif'; g.fillText('NusaFiber', 768, 44);
    g.fillStyle = '#13202b'; g.font = 'bold 56px Arial, sans-serif'; g.fillText('ODC-FLB', 768, 124);
    g.font = 'bold 24px Arial, sans-serif'; g.fillText('Optical Distribution Cabinet · 1:4', 768, 162);
    g.fillText('Feeder dari STO · 4 km', 768, 194);
    g.fillStyle = '#c62828'; g.font = 'bold 22px Arial, sans-serif'; g.fillText('BAHAYA: SINAR LASER · DILARANG MEMBUKA', 768, 236);
  }, false);
}
/** a plane mapped to a pixel rectangle of the 1024×512 atlas (px y from the top) */
function atlasPlane(m: THREE.Material, w: number, h: number, px: [number, number, number, number]) {
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv as THREE.BufferAttribute;
  const [x0, y0, x1, y1] = px;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 1024, 1 - (y0 + (1 - uv.getY(i)) * (y1 - y0)) / 512);
  return new THREE.Mesh(geo, m);
}
/** sagging cable between two points (parabola, sag at mid-span) */
function sagPts(a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 18) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0))); }
  return out;
}
const tube = (pts: THREE.Vector3[], r: number, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), seg, r, 5, false);

/** a concrete pole with two steel bands at the ODP and a top cap; returns nothing (merged by the bake) */
function pole(p: THREE.Object3D, name: string, X: number, Z: number) {
  const g = group(p, name);
  cyl(g, wx(X), WALK_Y, wz(Z), F.pole.rBase, F.pole.h, POLE, `${name}_BETON`, 12, F.pole.rTop);
  soft(cyl(g, wx(X), WALK_Y + F.pole.h, wz(Z), F.pole.rTop + 0.01, 0.06, CONCRETE, undefined, 12));
  // drop clamp bracket (S-clamp + hook ring) facing the house
  const cy = WALK_Y + F.clampY;
  soft(box(g, wx(X) - 0.03, cy - 0.04, wz(Z) + F.pole.rTop - 0.01, 0.06, 0.08, 0.12, STEEL, undefined, false));
  soft(cyl(g, wx(X), cy - 0.05, wz(Z), F.pole.rTop + 0.012, 0.03, STEEL, undefined, 12));
  // concrete foot collar on the sidewalk
  soft(cyl(g, wx(X), WALK_Y - 0.02, wz(Z), F.pole.rBase + 0.07, 0.1, CONCRETE, undefined, 12));
  return g;
}

/** the ONT LED overlays: one 4×1 texture (PON, LOS, INTERNET, LAN1) on one merged mesh, so the LEDs cost one draw call */
export interface FtthLeds { tex: THREE.DataTexture; data: Uint8Array }
const LED_ORDER = ['pon', 'los', 'inet', 'lan'] as const;

/** build the fibre plant of the house into the house group `g`; returns the four live LED materials */
export function buildFtthRumah(g: THREE.Object3D): FtthLeds {
  const root = group(g, 'PROP_FTTH_RUMAH');
  const P = F.pole, px = wx(P.X), pz = wz(P.Z);
  const labels = new THREE.MeshStandardMaterial({ map: labelAtlas(), roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.06 });
  labels.emissiveMap = labels.map;

  // ---- pole 1 with the ODP, and the next pole west for the neighbours' drops
  pole(root, 'PROP_FTTH_TIANG_01', P.X, P.Z);
  const WEST_X = 92;
  pole(root, 'PROP_FTTH_TIANG_02', WEST_X, P.Z);
  // steel bands holding the ODP
  const odpY = WALK_Y + F.odp.y, rAt = P.rBase - (P.rBase - P.rTop) * (F.odp.y / P.h);
  for (const dy of [-0.12, 0.12]) soft(cyl(root, px, odpY + dy - 0.015, pz, rAt + 0.008, 0.03, STEEL, undefined, 12));
  // ODP box on the house side (+Z)
  const odp = group(root, 'PROP_FTTH_ODP_FLB_01');
  const oz = pz + rAt + 0.02, ow = F.odp.w, oh = F.odp.h, od = F.odp.d;
  box(odp, px - ow / 2, odpY - oh / 2, oz, ow, oh, od, ODP_BODY, 'PROP_FTTH_ODP_FLB_01_BODY');
  soft(box(odp, px - ow / 2 - 0.01, odpY + oh / 2, oz - 0.01, ow + 0.02, 0.025, od + 0.03, ODP_BODY, undefined, false));   // rain lip
  const door = soft(atlasPlane(labels, ow - 0.02, oh - 0.02, [0, 0, 360, 512]));
  door.position.set(px, odpY, oz + od + 0.002); door.name = 'PROP_FTTH_ODP_FLB_01_LABEL'; odp.add(door);
  // 8 cable grommets along the bottom; ports 1–3 carry drop tails
  const gx = (n: number) => px - ow / 2 + 0.03 + (n - 1) * ((ow - 0.06) / 7), gyB = odpY - oh / 2;
  for (let n = 1; n <= 8; n++) soft(cyl(odp, gx(n), gyB - 0.025, oz + od / 2, 0.011, 0.025, n <= 3 ? CABLE : STEEL, undefined, 8));

  const cables: THREE.BufferGeometry[] = [];
  const clampY = WALK_Y + F.clampY, faceZ = (y: number) => pz + (P.rBase - (P.rBase - P.rTop) * ((y - WALK_Y) / P.h)) + 0.012;
  // each drop tail: out of its grommet, a small U under the box, then up the pole face to the clamp
  const upPole = (n: number, dx: number) => {
    const x0 = gx(n), z0 = oz + od / 2;
    return [new THREE.Vector3(x0, gyB - 0.04, z0), new THREE.Vector3(x0, gyB - 0.22, z0 + 0.02), new THREE.Vector3(px + dx, gyB - 0.3, faceZ(odpY - 0.5) + 0.01),
      new THREE.Vector3(px + dx, odpY + oh / 2 + 0.3, faceZ(odpY + 0.6)), new THREE.Vector3(px + dx, clampY - 0.9, faceZ(clampY - 0.9)), new THREE.Vector3(px + dx * 0.5, clampY - 0.06, faceZ(clampY) + 0.02)];
  };
  // house drop (port 1): up the pole, service loop, span to the house hook, down the wall into the roset
  const up1 = upPole(1, -0.035);
  cables.push(tube(up1, 0.008, 40));
  const coilY = clampY - 0.55;
  for (let k = 0; k < 3; k++) cables.push(new THREE.TorusGeometry(0.2 + k * 0.012, 0.006, 4, 20).rotateX(Math.PI / 2).translate(px + 0.02, coilY - k * 0.03, faceZ(coilY) + 0.18));
  const clamp = new THREE.Vector3(px, clampY - 0.05, faceZ(clampY) + 0.1), hook = W(F.houseHook), entry = W(F.wallEntry);
  cables.push(tube(sagPts(clamp, hook, F.sag), 0.008, 36));
  const inside = W(F.wallInside), roset = W(F.roset);
  cables.push(tube([hook, hook.clone().add(new THREE.Vector3(0, -0.15, -0.012)), entry.clone().add(new THREE.Vector3(0, 0.1, -0.012)), entry.clone().add(new THREE.Vector3(0, 0, -0.012))], 0.006, 12));
  cables.push(tube([inside, inside.clone().add(new THREE.Vector3(-0.08, 0, 0.02)), new THREE.Vector3(roset.x + 0.012, roset.y, inside.z + 0.15), new THREE.Vector3(roset.x + 0.012, roset.y, roset.z - 0.07)], 0.004, 12));
  // the neighbours' drops (ports 2, 3): up the pole and west to pole 2
  for (const [n, dx, s] of [[2, 0.0, 0.45], [3, 0.035, 0.6]] as [number, number, number][]) {
    cables.push(tube(upPole(n, dx), 0.006, 40));
    cables.push(tube(sagPts(new THREE.Vector3(px - 0.02, clampY - 0.05, faceZ(clampY) + 0.06), new THREE.Vector3(wx(WEST_X) + 0.1, clampY - 0.05 - (n - 2) * 0.05, faceZ(clampY) + 0.06), s), 0.006, 30));
  }
  // house hook on the outside of the west wall + wall bushing
  soft(box(root, hook.x - 0.03, hook.y - 0.03, hook.z - 0.06, 0.06, 0.06, 0.06, STEEL, 'PROP_FTTH_HOOK_RUMAH', false));
  soft(cyl(root, entry.x, entry.y - 0.03, entry.z - 0.01, 0.016, 0.06, mat('#e8e8e4'), 'PROP_FTTH_WALL_BUSHING', 8)).rotation.x = Math.PI / 2;

  // ---- distribution: riser pipe on the east side of pole 1 into the ODP, hand-holes over the duct at the pole and the ODC
  const riser = group(root, 'PROP_FTTH_RISER');
  const rx = px + P.rBase + 0.03;
  soft(cyl(riser, rx, WALK_Y, pz, 0.024, F.odp.y - oh / 2 - 0.35, STEEL, 'PROP_FTTH_RISER_PIPE', 10));
  cables.push(tube([new THREE.Vector3(rx, gyB - 0.35, pz), new THREE.Vector3(rx, gyB - 0.15, pz + 0.05), new THREE.Vector3(gx(8), gyB - 0.06, oz + od / 2)], 0.009, 10));
  for (const [nm, X] of [['PROP_FTTH_HANDHOLE_TIANG', P.X + 0.75], ['PROP_FTTH_HANDHOLE_ODC', F.odc.X - F.odc.w / 2 - 0.55]] as [string, number][]) {
    soft(box(root, wx(X) - 0.3, WALK_Y - 0.01, pz - 0.3, 0.6, 0.035, 0.6, CONCRETE, nm, false));
    soft(box(root, wx(X) - 0.05, WALK_Y + 0.025, pz - 0.015, 0.1, 0.008, 0.03, STEEL, undefined, false));
  }

  // ---- ODC cabinet: plinth, green body with two doors and a roof, label plate toward the road (−Z)
  const odc = group(root, 'PROP_FTTH_ODC_FLB');
  const C = F.odc, cx0 = wx(C.X - C.w / 2), cz0 = wz(C.Z0);
  box(odc, cx0 - 0.05, WALK_Y, cz0 - 0.05, C.w + 0.1, 0.18, C.d + 0.1, CONCRETE, 'PROP_FTTH_ODC_FLB_PLINTH');
  box(odc, cx0, WALK_Y + 0.18, cz0, C.w, C.h, C.d, ODC_GREEN, 'PROP_FTTH_ODC_FLB_BODY');
  soft(box(odc, cx0 - 0.04, WALK_Y + 0.18 + C.h, cz0 - 0.05, C.w + 0.08, 0.05, C.d + 0.1, ODC_DARK, undefined, false));
  soft(box(odc, cx0 + C.w / 2 - 0.006, WALK_Y + 0.24, cz0 - 0.004, 0.012, C.h - 0.12, 0.006, ODC_DARK, undefined, false));   // door seam
  for (const s of [-1, 1]) soft(box(odc, cx0 + C.w / 2 + s * 0.08 - 0.012, WALK_Y + 0.18 + C.h * 0.5, cz0 - 0.02, 0.024, 0.12, 0.02, STEEL, undefined, false));   // handles
  for (const s of [0.12, C.w - 0.16]) soft(box(odc, cx0 + s, WALK_Y + 0.18 + C.h - 0.16, cz0 - 0.004, 0.04, 0.08, 0.004, ODC_DARK, undefined, false));          // louvres
  const plate = soft(atlasPlane(labels, 0.5, 0.25, [512, 0, 1024, 256]));
  plate.position.set(wx(C.X) - 0.26, WALK_Y + 0.18 + C.h * 0.72, cz0 - 0.004); plate.rotation.y = Math.PI; plate.name = 'PROP_FTTH_ODC_FLB_LABEL'; odc.add(plate);

  const cm = new THREE.Mesh(mergeAll(cables), CABLE); cm.name = 'PROP_FTTH_DROP_RUMAH'; cm.castShadow = true; soft(cm); root.add(cm);

  // ---- ONT LED overlays: same transform as PROP_RUMAH_01_ONT (world/sites.ts), LED row of its top decal
  const ontG = group(root, 'PROP_FTTH_ONT_LEDS'); soft(ontG);
  ontG.position.copy(W(F.ont)); ontG.rotation.y = -Math.PI / 2;
  const data = new Uint8Array(4 * 4), tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const ledM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 1.8, roughness: 0.4 }); ledM.userData.live = true;
  // decal LED k sits at x = 0.0825 − (0.014 + 0.0152 k), z = −0.0955 (ONT local, TOPUV-flipped decal): PON k1, LOS k2, INTERNET k3, LAN1 k4
  const discs = [1, 2, 3, 4].map((k, i) => {
    const d = new THREE.CircleGeometry(0.0031, 12).rotateX(-Math.PI / 2).translate(0.0825 - (0.014 + 0.0152 * k), 0.0328, -0.0955);
    const uv = d.attributes.uv as THREE.BufferAttribute; for (let j = 0; j < uv.count; j++) uv.setXY(j, (i + 0.5) / 4, 0.5);
    return d;
  });
  const lm = new THREE.Mesh(mergeAll(discs), ledM); lm.name = 'PROP_FTTH_ONT_LED_PON_LOS_INET_LAN1'; lm.castShadow = false; ontG.add(lm);
  const leds: FtthLeds = { tex, data };
  updateFtthLeds(leds, { pon: 'green', los: 'off', inet: true, lan: true }, 0);
  return leds;
}

function mergeAll(gs: THREE.BufferGeometry[]) {
  // TubeGeometry/TorusGeometry are indexed with the same attributes, so a plain concatenation works
  let nV = 0, nI = 0; for (const x of gs) { nV += x.attributes.position.count; nI += x.index!.count; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), idx = new Uint32Array(nI);
  let v = 0, i = 0;
  for (const x of gs) {
    pos.set(x.attributes.position.array as Float32Array, v * 3); nor.set(x.attributes.normal.array as Float32Array, v * 3); uv.set(x.attributes.uv.array as Float32Array, v * 2);
    const ix = x.index!.array; for (let k = 0; k < ix.length; k++) idx[i + k] = ix[k] + v;
    v += x.attributes.position.count; i += ix.length; x.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const OFF = [0x3a, 0x3e, 0x43], GREEN = [0x38, 0xff, 0x5c], RED = [0xff, 0x30, 0x30];
/** the colour an LED shows now; blinking LEDs toggle at 2 Hz on the clock t (s) */
function ledRgb(l: Led, t: number) {
  const on = l === 'green' || l === 'red' || ((l === 'green-blink' || l === 'red-blink') && Math.floor(t * 4) % 2 === 0);
  return !on ? OFF : l.startsWith('green') ? GREEN : RED;
}
/** drive the ONT LEDs from the netsim (main.ts calls this a few times a second); uploads the 4-pixel texture only on change */
export function updateFtthLeds(leds: FtthLeds, s: { pon: Led; los: Led; inet: boolean; lan: boolean }, t: number) {
  const want: Record<(typeof LED_ORDER)[number], Led> = { pon: s.pon, los: s.los, inet: s.inet ? 'green' : 'off', lan: s.lan ? 'green' : 'off' };
  let changed = false;
  LED_ORDER.forEach((k, i) => {
    const c = ledRgb(want[k], t);
    for (let j = 0; j < 3; j++) if (leds.data[i * 4 + j] !== c[j]) { leds.data[i * 4 + j] = c[j]; changed = true; }
    leds.data[i * 4 + 3] = 255;
  });
  if (changed) leds.tex.needsUpdate = true;
}
/** the current LED colours as words (QA / UI) */
export function ftthLedColours(leds: FtthLeds) {
  const name = (i: number) => { const r = leds.data[i * 4], g = leds.data[i * 4 + 1]; return g === 0xff ? 'green' : r === 0xff ? 'red' : 'off'; };
  return { pon: name(0), los: name(1), inet: name(2), lan: name(3) };
}

// ------------------------------------------------------------------------------------------------ chunk B1b: ladder + VFL glow
// Dynamic, not baked (they come and go): the borrowed ladder leaning on the ODP pole (one merged mesh) and up to four red
// VFL leak points (sprites). Added to the game layer by main.ts; both are hidden until the field toolkit shows them.
export interface FtthFx { ladder: THREE.Mesh; glows: THREE.Sprite[]; setLadder(on: boolean): void; setGlows(pts: P3[]): void }
/** where the ladder foot stands and where its top rests (city X/Z, y up): on the house side of the pole, under the ODP */
export const LADDER = { footZ: 0.95, topY: 3.75, w: 0.42 } as const;
export function buildFtthFx(parent: THREE.Object3D): FtthFx {
  const P = F.pole, X = wx(P.X), Z = wz(P.Z);
  const foot = new THREE.Vector3(X, WALK_Y, Z + LADDER.footZ), top = new THREE.Vector3(X, WALK_Y + LADDER.topY, Z + P.rTop + 0.06);
  const len = foot.distanceTo(top), tilt = Math.atan2(foot.z - top.z, top.y - foot.y);
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.05, len, 0.03).translate((s * LADDER.w) / 2, len / 2, 0));
  for (let y = 0.28; y < len - 0.1; y += 0.3) parts.push(new THREE.CylinderGeometry(0.014, 0.014, LADDER.w, 6).rotateZ(Math.PI / 2).translate(0, y, 0));
  for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.07, 0.04, 0.06).translate((s * LADDER.w) / 2, 0.02, 0));   // rubber feet
  const g = mergeAll(parts);
  const ladder = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.6, roughness: 0.45 }));
  ladder.name = 'PROP_FTTH_TANGGA'; ladder.userData.noCollide = true; ladder.castShadow = true;
  ladder.position.copy(foot); ladder.rotation.x = -tilt; ladder.visible = false;
  parent.add(ladder);
  // the red leak: a small radial sprite (world light, not UI). main.ts hides it from the AO normal pass (a sprite drawn with
  // the pass's override material is a flat quad and leaves a dark sliver)
  const tex = canvasTex(64, 64, c => {
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,235,230,1)'); gr.addColorStop(0.2, 'rgba(255,30,20,1)'); gr.addColorStop(0.5, 'rgba(230,0,0,0.45)'); gr.addColorStop(1, 'rgba(200,0,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  }, false);
  const glows: THREE.Sprite[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffffff', depthWrite: false, transparent: true, toneMapped: false }));
    s.name = `FX_FTTH_VFL_GLOW_${i}`; s.scale.setScalar(0.42); s.visible = false; s.renderOrder = 5; s.userData.noCollide = true;
    parent.add(s); glows.push(s);
  }
  return {
    ladder, glows,
    setLadder(on) { ladder.visible = on; },
    setGlows(pts) { glows.forEach((s, i) => { const p = pts[i]; s.visible = !!p; if (p) s.position.copy(W(p)); }); },
  };
}
