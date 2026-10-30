// Procedural, real-scale articulated people for Kota Nusantara.
// One SkinnedMesh per person (rigid skinning, one draw call), vertex colours + a tiny shared atlas
// (batik tiles, chest patches). Geometry is cached per outfit variant; one material for everybody.
// Units: metres. Built at a 1.70 m reference and scaled per person (1.55–1.75 m). Faces +Z, feet at y=0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Outfit = 'office_batik' | 'office_white' | 'student_m' | 'student_f' | 'hijab_woman' | 'ojol' | 'vendor' | 'security' | 'technician';
export const OUTFITS: Outfit[] = ['office_batik', 'office_white', 'student_m', 'student_f', 'hijab_woman', 'ojol', 'vendor', 'security', 'technician'];
export type Hair = 'short' | 'side_part' | 'long_tied' | 'hijab';
export const SKIN_TONES = ['#e3b585', '#d29b6c', '#c08552', '#a86f43', '#8f5a34', '#74462a'];

export interface PersonSpec {
  outfit: Outfit; female: boolean; height: number;
  skin: string; hair: Hair; hairColor: string;
  top: string; bottom: string; shoes: string;
  batik: number;               // -1 = plain top, else batik tile 0..3
  sleeves: 'short' | 'long'; tucked: boolean;
  skirt: 'none' | 'knee' | 'long'; tunic: boolean; shorts: boolean; sandals: boolean;
  hijab: string;
  tie?: string; lanyard?: boolean; helmet?: boolean; cap?: string; peakCap?: boolean; towel?: string;
  patch?: 'IT' | 'SATPAM'; jacket?: boolean; epaulettes?: boolean; pocket?: boolean;
}

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
type BoneName = typeof BONES[number];
export type Rig = Record<BoneName, THREE.Bone>;
const BI = Object.fromEntries(BONES.map((n, i) => [n, i])) as Record<BoneName, number>;
const PARENT: Record<BoneName, BoneName | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  upperArmL: 'chest', forearmL: 'upperArmL', handL: 'forearmL', upperArmR: 'chest', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

export interface Person { root: THREE.Group; mesh: THREE.Mesh; rig: Rig; spec: PersonSpec; scale: number; tris: number; bones: THREE.Matrix4[]; bind: THREE.Vector3[] }

// ---------------------------------------------------------------- body dimensions (1.70 m reference)
const REF_H = 1.70;
const LEG = { hipY: 0.89, thigh: 0.41, shin: 0.40, ankle: 0.08 };
const ARM = { upper: 0.29, fore: 0.25 };
interface Body { hipX: number; shX: number; shY: number; chestR: number; waistR: number; pelvisR: number; depth: number; limb: number }
const BODY_M: Body = { hipX: 0.09, shX: 0.182, shY: 1.405, chestR: 0.17, waistR: 0.143, pelvisR: 0.152, depth: 0.62, limb: 1 };
const BODY_F: Body = { hipX: 0.088, shX: 0.163, shY: 1.40, chestR: 0.153, waistR: 0.127, pelvisR: 0.16, depth: 0.66, limb: 0.9 };
const Y = { spine: 1.0, chest: 1.2, neck: 1.44, head: 1.48 };

function bindPositions(B: Body): THREE.Vector3[] {
  const p: Record<BoneName, [number, number, number]> = {
    hips: [0, LEG.hipY, 0], spine: [0, Y.spine, 0], chest: [0, Y.chest, 0], neck: [0, Y.neck, 0], head: [0, Y.head, 0],
    upperArmL: [B.shX, B.shY, 0], forearmL: [B.shX, B.shY - ARM.upper, 0], handL: [B.shX, B.shY - ARM.upper - ARM.fore, 0],
    upperArmR: [-B.shX, B.shY, 0], forearmR: [-B.shX, B.shY - ARM.upper, 0], handR: [-B.shX, B.shY - ARM.upper - ARM.fore, 0],
    thighL: [B.hipX, LEG.hipY, 0], shinL: [B.hipX, LEG.hipY - LEG.thigh, 0], footL: [B.hipX, LEG.ankle, 0],
    thighR: [-B.hipX, LEG.hipY, 0], shinR: [-B.hipX, LEG.hipY - LEG.thigh, 0], footR: [-B.hipX, LEG.ankle, 0],
  };
  return BONES.map(n => new THREE.Vector3(...p[n]));
}

// ---------------------------------------------------------------- shared atlas + material
// canvas 256²: left half white (plain), bottom-right 4 batik tiles (64²), top-right patches.
let _mat: THREE.MeshStandardMaterial | null = null;
const PLAIN_UV: [number, number] = [0.25, 0.5];
function drawAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  const tiles = [['#5a3a1e', '#e8d3a8', '#2a1a0c'], ['#22345e', '#e9e2cf', '#0f1a33'], ['#7a2424', '#efd9a6', '#3a0f0f'], ['#2e5e46', '#e8dcb5', '#14301f']];
  tiles.forEach(([base, motif, line], i) => {
    const ox = 128 + 64 * (i % 2), oy = 128 + 64 * Math.floor(i / 2);
    g.save(); g.beginPath(); g.rect(ox, oy, 64, 64); g.clip();
    g.fillStyle = base; g.fillRect(ox, oy, 64, 64);
    if (i % 2 === 0) { // kawung
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        const cx = ox + x * 16, cy = oy + y * 16;
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          g.beginPath(); g.ellipse(cx + Math.cos(a) * 4.6, cy + Math.sin(a) * 4.6, 4.2, 2.4, a, 0, Math.PI * 2);
          g.fillStyle = motif; g.fill(); g.strokeStyle = line; g.lineWidth = 0.9; g.stroke();
        }
        g.fillStyle = line; g.fillRect(cx - 1, cy - 1, 2, 2);
      }
    } else { // parang (diagonal bands)
      for (let k = -6; k < 10; k++) {
        g.save(); g.translate(ox + k * 12, oy); g.rotate(Math.PI / 4);
        g.fillStyle = motif; g.fillRect(0, -2, 100, 5);
        g.strokeStyle = line; g.lineWidth = 1; g.strokeRect(0, -2, 100, 5);
        for (let s = 0; s < 100; s += 8) { g.beginPath(); g.arc(s + 4, 7, 2.2, 0, Math.PI * 2); g.fillStyle = motif; g.fill(); }
        g.restore();
      }
    }
    g.restore();
  });
  // patch "IT" (canvas x128..256, y0..64) and "SATPAM" (y64..128)
  const patch = (y: number, bg: string, fg: string, txt: string, fs: number) => {
    g.fillStyle = bg; g.fillRect(128, y, 128, 64); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(132, y + 4, 120, 56);
    g.fillStyle = fg; g.font = `bold ${fs}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 192, y + 33);
  };
  patch(0, '#f2f2f2', '#1b4f9c', 'IT', 44); patch(64, '#d4a514', '#1a1a1a', 'SATPAM', 26);
  return c;
}
export function peopleMaterial(): THREE.MeshStandardMaterial {
  if (_mat) return _mat;
  const tex = new THREE.CanvasTexture(drawAtlas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  _mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.82, metalness: 0 });
  _mat.name = 'people_atlas';
  return _mat;
}

// ---------------------------------------------------------------- geometry helpers
type Prof = [number, number][]; // [radius, y] with y increasing
function lathe(pts: Prof, segs: number, sx = 1, sz = 1, phiStart = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segs, phiStart, phiLen);
  g.scale(sx, 1, sz); return g;
}
/** limb hanging from its joint (y=0) down to -len, tapered, with rounded caps that overlap neighbours */
function limb(len: number, rTop: number, rMid: number, rBot: number, segs = 8, midAt = 0.4, capTop = 1, sz = 1): THREE.BufferGeometry {
  const pts: Prof = [
    [0, -len - rBot * 0.95], [rBot * 0.72, -len - rBot * 0.68], [rBot, -len],
    [rMid, -len * midAt], [rTop, 0], [rTop * 0.72 * capTop + rTop * (1 - capTop), rTop * 0.68 * capTop], [0, rTop * 0.95 * capTop],
  ];
  return lathe(pts, segs, 1, sz);
}
/** open tube (sleeve, cuff, collar): rim with a visible lip at the bottom */
function shell(pts: Prof, segs: number, sx = 1, sz = 1, lip = 0.006, phiStart = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  const [r0, y0] = pts[0];
  return lathe([[r0 - lip, y0 + 0.004], [r0, y0], ...pts.slice(1)], segs, sx, sz, phiStart, phiLen);
}
function rbox(w: number, h: number, d: number): THREE.BufferGeometry {
  // box with chamfered vertical edges (8-sided prism) – cheap "bevel"
  const c = Math.min(w, d) * 0.22;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + c, -d / 2); s.lineTo(w / 2 - c, -d / 2); s.lineTo(w / 2, -d / 2 + c); s.lineTo(w / 2, d / 2 - c);
  s.lineTo(w / 2 - c, d / 2); s.lineTo(-w / 2 + c, d / 2); s.lineTo(-w / 2, d / 2 - c); s.lineTo(-w / 2, -d / 2 + c);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0); // extrude along +y, centred
  g.scale(1, 1, -1); g.computeVertexNormals();
  return fixWinding(g);
}
function fixWinding(g: THREE.BufferGeometry) {
  // after a mirror scale the winding flips; swap two vertices of every triangle
  const ng = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(ng.attributes)) {
    const a = ng.attributes[name] as THREE.BufferAttribute; const n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) {
      const t = a.array[(i + 1) * n + k]; (a.array as any)[(i + 1) * n + k] = a.array[(i + 2) * n + k]; (a.array as any)[(i + 2) * n + k] = t;
    }
  }
  ng.computeVertexNormals(); return ng;
}
const tmpV = new THREE.Vector3();
function interp(p: Prof, y: number) { // radius at height y
  for (let i = 1; i < p.length; i++) if (y <= p[i][1]) { const [r0, y0] = p[i - 1], [r1, y1] = p[i]; return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0); }
  return p[p.length - 1][0];
}
function cutProfile(p: Prof, y0: number, y1: number, off: number): Prof {
  const out: Prof = [[interp(p, y0) + off, y0]];
  for (const [r, y] of p) if (y > y0 && y < y1) out.push([r > 0 ? r + off : 0, y]);
  const rt = interp(p, y1); out.push([rt > 0.0001 ? rt + off : 0, y1]);
  return out;
}

// ---------------------------------------------------------------- builder
type WeightFn = (v: THREE.Vector3) => [number[], number[]];
class Builder {
  parts: THREE.BufferGeometry[] = [];
  constructor(public P: THREE.Vector3[]) {}
  add(geo: THREE.BufferGeometry, bone: BoneName, color: string | ((v: THREE.Vector3) => string), opts: { uv?: 'batik' | 'patch'; tile?: number; w?: WeightFn; at?: [number, number, number]; rot?: [number, number, number] } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (opts.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...opts.rot)));
    if (opts.at) g.translate(...opts.at);
    const bp = this.P[BI[bone]]; g.translate(bp.x, bp.y, bp.z);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const pos = g.attributes.position, n = pos.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    // uv
    const uvIn = g.attributes.uv as THREE.BufferAttribute | undefined;
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      let u = PLAIN_UV[0], v = PLAIN_UV[1];
      if (opts.uv === 'batik' && uvIn) {
        const t = opts.tile ?? 0, ox = 128 + 64 * (t % 2), oy = 128 + 64 * Math.floor(t / 2);
        u = (ox + 3 + (uvIn.getX(i) % 1) * 58) / 256; v = 1 - (oy + 3 + (1 - (uvIn.getY(i) % 1.0001)) * 58) / 256;
      } else if (opts.uv === 'patch' && uvIn) {
        const oy = (opts.tile ?? 0) * 64; u = (130 + uvIn.getX(i) * 124) / 256; v = 1 - (oy + 2 + (1 - uvIn.getY(i)) * 60) / 256;
      }
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // colour
    const col = new Float32Array(n * 3); const c = new THREE.Color();
    const fixed = typeof color === 'string' ? (opts.uv ? '#ffffff' : color) : null;
    if (fixed) c.set(fixed);
    for (let i = 0; i < n; i++) {
      if (!fixed) c.set((color as (v: THREE.Vector3) => string)(tmpV.fromBufferAttribute(pos, i)));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // skin
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      if (opts.w) {
        const [idx, ws] = opts.w(tmpV.fromBufferAttribute(pos, i));
        for (let k = 0; k < idx.length && k < 4; k++) { si[i * 4 + k] = idx[k]; sw[i * 4 + k] = ws[k]; }
      } else { si[i * 4] = BI[bone]; sw[i * 4] = 1; }
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.parts.push(g);
  }
}

function shade(hex: string, k: number) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

// head profile, chin at y=0 (head bone sits at 1.48, chin 1.47), crown 0.22
const HZ = 1.17, HOFF = 0.012;
const HEAD: Prof = [[0, -0.012], [0.027, -0.007], [0.045, 0.01], [0.057, 0.032], [0.066, 0.06], [0.073, 0.095], [0.076, 0.128], [0.074, 0.156], [0.065, 0.182], [0.047, 0.2], [0.024, 0.211], [0, 0.214]];
function faceZ(x: number, y: number) { const r = interp(HEAD, y); return HZ * Math.sqrt(Math.max(0, r * r - x * x)) + HOFF; }

// ---------------------------------------------------------------- the person geometry
function buildGeometry(s: PersonSpec): THREE.BufferGeometry {
  const B = s.female ? BODY_F : BODY_M;
  const P = bindPositions(B);
  const b = new Builder(P);
  const skin = s.skin, skinD = shade(skin, 0.86), top = s.top, bottom = s.bottom;
  const topUV = s.batik >= 0 ? { uv: 'batik' as const, tile: s.batik } : {};
  const D = B.depth;

  // ---- pelvis / trousers top (hips)
  const pelvis: Prof = [[0, -0.062], [0.06, -0.057], [B.pelvisR * 0.86, -0.03], [B.pelvisR, 0.01], [B.pelvisR * 0.97, 0.05], [B.waistR, 0.115], [B.waistR * 0.94, 0.15], [0, 0.152]];
  b.add(lathe(pelvis, 10, 1, D + 0.02), 'hips', s.skirt !== 'none' ? shade(bottom, 0.9) : bottom);
  // ---- abdomen (spine) and chest (chest bone)
  const abd: Prof = [[B.waistR * 0.95, -0.05], [B.waistR * 1.0, -0.01], [B.waistR * 1.03, 0.08], [B.chestR * 0.93, 0.19], [B.chestR * 0.9, 0.23]];
  b.add(lathe(abd, 10, 1, D + 0.04), 'spine', top, topUV);
  const chestR = B.chestR;
  const chestP: Prof = [[chestR * 0.9, -0.04], [chestR * 0.97, 0.03], [chestR, 0.11], [chestR * 1.0, 0.17], [chestR * 0.98, 0.2], [chestR * 0.87, 0.23], [chestR * 0.56, 0.255], [0.058, 0.268], [0.05, 0.275], [0, 0.276]];
  b.add(lathe(chestP, 10, 1, D), 'chest', top, topUV);
  const chestFrontZ = (y: number) => interp(chestP, y) * D;
  if (s.female && !s.jacket) b.add(lathe([[0, -0.05], [0.05, -0.035], [0.062, 0], [0.045, 0.04], [0, 0.05]], 6, 1, 0.5), 'chest', top, { ...topUV, at: [0, 0.075, chestFrontZ(0.075) - 0.02] });
  // ---- neck
  b.add(limb(0.08, 0.05, 0.048, 0.052, 8, 0.5), 'neck', skinD, { at: [0, 0.07, -0.005] });

  // ---- clothing seams on torso
  if (s.tucked && s.skirt === 'none' && !s.tunic) { // belt line
    b.add(shell([[B.waistR + 0.004, 0.095], [B.waistR + 0.004, 0.13]], 10, 1, D + 0.04, 0.004), 'hips', '#1b1b1b');
    b.add(new THREE.BoxGeometry(0.045, 0.032, 0.01), 'hips', '#c9b26b', { at: [0, 0.112, (B.waistR + 0.004) * (D + 0.04) + 0.004] });
  } else if (!s.tunic) { // untucked shirt hem over the pelvis
    const hemB = s.jacket ? -0.05 : -0.035, ex = s.skirt !== 'none' ? 0.022 : 0;
    b.add(shell([[B.pelvisR + 0.012 + ex, hemB], [B.pelvisR + 0.01 + ex, 0.04], [B.waistR + 0.01 + ex * 0.5, 0.13], [B.waistR + 0.004, 0.16]], 10, 1, D + 0.04 + ex, 0.008), 'hips', top, topUV);
  }
  if (s.tunic) { // long tunic, blends with thighs below the hips
    b.add(shell([[B.pelvisR + 0.075, -0.3], [B.pelvisR + 0.045, -0.1], [B.pelvisR + 0.02, 0.0], [B.waistR + 0.012, 0.12], [B.waistR + 0.006, 0.16]], 10, 1, D + 0.2, 0.008), 'hips', top, { w: skirtWeights(B, LEG.hipY + 0.05, LEG.hipY - 0.3, 0.55) });
  }
  if (s.skirt !== 'none') {
    const yb = s.skirt === 'long' ? -0.82 : -0.44; const rb = s.skirt === 'long' ? 0.25 : 0.2;
    b.add(shell([[rb, yb], [B.pelvisR + 0.035, -0.12], [B.pelvisR + 0.012, 0.0], [B.waistR + 0.006, 0.12], [B.waistR + 0.002, 0.15]], 10, 1, D + 0.18, 0.008), 'hips', bottom, { w: skirtWeights(B, LEG.hipY + 0.05, LEG.hipY + yb, s.skirt === 'long' ? 0.86 : 0.6) });
  }
  // collar
  if (s.hair !== 'hijab' || s.jacket) {
    if (s.jacket) {
      b.add(shell([[0.068, 0.238], [0.07, 0.275], [0.066, 0.305]], 12, 1, 1, 0.004), 'chest', '#1c1c1c');
      b.add(new THREE.BoxGeometry(0.01, 0.27, 0.006), 'chest', '#1c1c1c', { at: [0, 0.1, chestFrontZ(0.1) + 0.003] }); // zip
      for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.02, 0.26, 0.012), 'chest', '#1c1c1c', { at: [sx * chestR * 0.86, 0.09, 0] }); // side panels
    } else if (s.outfit === 'vendor') {
      b.add(shell([[0.064, 0.255], [0.062, 0.272]], 12, 1, 1, 0.003), 'chest', shade(top, 0.85));
    } else {
      b.add(shell([[0.06, 0.24], [0.066, 0.268], [0.073, 0.29]], 12, 1, 1, 0.004), 'chest', top, topUV);
      for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.05, 0.034, 0.006), s.batik >= 0 ? 'chest' : 'chest', top, { ...topUV, at: [sx * 0.03, 0.247, chestFrontZ(0.247) + 0.012], rot: [-0.35, 0, sx * 0.62] });
      b.add(new THREE.BoxGeometry(0.018, s.tucked ? 0.24 : 0.25, 0.005), 'chest', s.batik >= 0 ? '#2a1a0c' : shade(top, 0.93), { at: [0, 0.1, chestFrontZ(0.1) + 0.002] }); // placket
      for (let k = 0; k < 4; k++) b.add(new THREE.BoxGeometry(0.008, 0.008, 0.004), 'chest', '#e8e4dc', { at: [0, 0.2 - k * 0.06, chestFrontZ(0.2 - k * 0.06) + 0.005] });
    }
  }
  if (s.tie) b.add(lathe([[0, -0.0], [0.025, 0.02], [0.022, 0.2], [0.012, 0.24], [0, 0.245]], 4, 1, 0.25), 'chest', s.tie, { at: [0, 0.0, chestFrontZ(0.1) + 0.008] });
  if (s.pocket) b.add(new THREE.BoxGeometry(0.06, 0.07, 0.006), 'chest', shade(top, 0.92), { ...topUV, at: [-chestR * 0.45, 0.1, chestFrontZ(0.1) * 0.93 + 0.003] });
  if (s.patch) b.add(new THREE.BoxGeometry(0.075, 0.04, 0.006), 'chest', '#ffffff', { uv: 'patch', tile: s.patch === 'IT' ? 0 : 1, at: [chestR * 0.45, 0.12, chestFrontZ(0.12) * 0.92 + 0.004] });
  if (s.epaulettes) for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.05, 0.008, 0.11), 'chest', shade(top, 0.6), { at: [sx * (chestR * 0.78), 0.235, 0], rot: [0, 0, sx * -0.35] });
  if (s.lanyard) {
    b.add(shell([[0.075, 0.12], [0.07, 0.2], [0.064, 0.255]], 8, 1, D * 1.5, 0.0, 0, Math.PI * 2), 'chest', '#1f4fa3');
    b.add(new THREE.BoxGeometry(0.055, 0.08, 0.006), 'chest', '#f4f4f4', { at: [0, 0.08, chestFrontZ(0.08) + 0.012] });
  }
  if (s.towel) { b.add(new THREE.BoxGeometry(0.13, 0.016, 0.24), 'chest', s.towel, { at: [-chestR * 0.62, 0.232, 0], rot: [0, 0, 0.3] }); for (const sz of [-1, 1]) b.add(new THREE.BoxGeometry(0.12, 0.2, 0.014), 'chest', s.towel, { at: [-chestR * 0.68, 0.14, sz * (chestFrontZ(0.15) + 0.008)], rot: [-sz * 0.12, 0, 0.1] }); }

  // ---- arms
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const ua = `upperArm${side}` as BoneName, fa = `forearm${side}` as BoneName, ha = `hand${side}` as BoneName;
    const r0 = 0.052 * B.limb + 0.004, r1 = 0.045 * B.limb, r2 = 0.041 * B.limb;
    const long = s.sleeves === 'long';
    const uaY = P[BI[ua]].y;
    b.add(limb(ARM.upper, r0, r1 + 0.003, r2, 7, long ? 0.35 : 0.6, 0.55, 0.95), ua, long ? top : (v: THREE.Vector3) => (v.y > uaY - 0.15 && s.batik < 0 ? top : skin), long ? topUV : {});
    // deltoid / shoulder cap in shirt colour (covers the arm's top cap)
    b.add(lathe([[0, -0.1], [r0 + 0.006, -0.075], [r0 + 0.008, -0.02], [r0 * 0.8 + 0.004, 0.022], [0, 0.036]], 7, 1, 1.0), ua, top, { ...topUV, at: [-sx * 0.004, 0, 0] });
    if (!long) b.add(shell([[r1 + 0.009, -0.16], [r0 + 0.006, -0.09], [r0 + 0.007, -0.06]], 7, 1, 1.0, 0.007), ua, top, topUV); // short sleeve
    b.add(limb(ARM.fore, r2, r2 * 0.92, 0.029 * B.limb, 7, 0.3, 1, 0.92), fa, long ? top : skin, long ? topUV : {});
    if (long) b.add(shell([[0.031 * B.limb + 0.004, -ARM.fore + 0.008], [0.033 * B.limb + 0.004, -ARM.fore + 0.04]], 8, 1, 0.95, 0.004), fa, s.jacket ? '#1c1c1c' : top, s.jacket ? {} : topUV);
    if (s.jacket) b.add(shell([[r1 + 0.004, -0.1], [r1 + 0.005, -0.075]], 8, 1, 0.95, 0.002), ua, '#d9d9d9'); // reflective stripe
    // hand: paddle (width along z) + thumb
    const hk = B.limb;
    b.add(lathe([[0, -0.172 * hk], [0.024, -0.165 * hk], [0.036, -0.14 * hk], [0.044, -0.095 * hk], [0.045, -0.05 * hk], [0.034, -0.012], [0.028, 0.0], [0.026, 0.02], [0, 0.03]], 6, 0.5, 1), ha, skin);
    b.add(limb(0.055, 0.013, 0.011, 0.009, 4, 0.5), ha, skin, { at: [-sx * 0.006, -0.03, 0.028], rot: [-0.5, 0, sx * 0.3] });
  }
  // ---- legs
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const th = `thigh${side}` as BoneName, sh = `shin${side}` as BoneName, ft = `foot${side}` as BoneName;
    const legCol = s.skirt === 'long' ? shade(bottom, 0.8) : bottom;
    const shinCol = s.shorts ? skin : s.skirt === 'knee' ? skin : legCol;
    b.add(limb(LEG.thigh, 0.092 * (s.female ? 1.04 : 1), 0.076, 0.056, 7, 0.45, 1, 0.98), th, legCol, { at: [-sx * 0.006, 0, 0] });
    b.add(limb(LEG.shin, 0.056, 0.05, 0.036, 7, 0.3, 1, 0.98), sh, shinCol);
    if (s.shorts) b.add(shell([[0.068, -0.37], [0.08, -0.15]], 7, 1, 0.98, 0.008), th, bottom);
    else if (s.skirt === 'knee') b.add(shell([[0.042, -LEG.shin + 0.03], [0.046, -LEG.shin + 0.1]], 6, 1, 1, 0.004), sh, '#f2f2f2'); // socks
    else if (s.skirt === 'none') b.add(shell([[0.05, -LEG.shin + 0.01], [0.048, -LEG.shin + 0.045]], 7, 1, 1, 0.005), sh, shade(bottom, 0.85)); // trouser cuff
    // shoe / sandal: lathe along the foot axis, flat sole
    const sandal = s.sandals;
    const shoe = lathe([[0, -0.08], [0.034, -0.074], [0.044, -0.045], [0.047, 0.02], [0.046, 0.09], [0.041, 0.15], [0.028, 0.183], [0, 0.192]], 7, 1, 1);
    shoe.rotateX(Math.PI / 2); shoe.scale(1, sandal ? 0.55 : 0.92, 1); shoe.translate(0, sandal ? -0.06 : -0.038, 0);
    const p = shoe.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.068) p.setY(i, -0.08);
    shoe.computeVertexNormals();
    const shoeCol = s.shoes;
    b.add(shoe, ft, sandal ? (v: THREE.Vector3) => (v.y < 0.008 ? '#3a2f25' : skin) : (v: THREE.Vector3) => (v.y < LEG.ankle - 0.072 ? '#2b2b2b' : shoeCol), {});
    if (sandal) b.add(new THREE.BoxGeometry(0.1, 0.012, 0.03), ft, '#3a2f25', { at: [0, -0.052, 0.07], rot: [0.2, 0, 0] });
  }

  // ---- head
  b.add(lathe(HEAD, 11, 1, HZ), 'head', skin, { at: [0, 0, HOFF] });
  const fy = { eye: 0.104, brow: 0.124, nose: 0.074, mouth: 0.043, ear: 0.096 };
  // nose: tapered wedge
  b.add(lathe([[0, -0.002], [0.012, 0.004], [0.008, 0.03], [0, 0.034]], 5, 1, 1.2), 'head', skinD, { at: [0, fy.nose - 0.004, faceZ(0, fy.nose) - 0.006] });
  for (const sx of [-1, 1]) {
    const ex = sx * 0.03;
    b.add(new THREE.SphereGeometry(0.0085, 5, 3), 'head', '#1a1210', { at: [ex, fy.eye, faceZ(ex, fy.eye) - 0.0035] }); // eye
    b.add(new THREE.BoxGeometry(0.026, 0.0055, 0.006), 'head', s.hair === 'hijab' ? '#2a1d14' : s.hairColor, { at: [sx * 0.031, fy.brow, faceZ(sx * 0.031, fy.brow)], rot: [0, sx * 0.3, sx * -0.12] });
    if (s.hair !== 'hijab') b.add(lathe([[0, -0.026], [0.016, -0.018], [0.02, 0.005], [0.014, 0.022], [0, 0.028]], 5, 0.45, 1), 'head', skinD, { at: [sx * (interp(HEAD, fy.ear) - 0.001), fy.ear, 0.0] });
  }
  b.add(new THREE.BoxGeometry(0.03, 0.0055, 0.006), 'head', shade(skin, 0.62), { at: [0, fy.mouth, faceZ(0, fy.mouth) - 0.001] });

  // ---- hair / hijab / headwear
  const hc = s.hairColor;
  if (s.hair === 'hijab') {
    const off = 0.013;
    b.add(lathe(cutProfile(HEAD, 0.15, 0.214, off), 12, 1, HZ), 'head', s.hijab, { at: [0, 0.004, HOFF] });
    const hood: Prof = [[0.07, -0.035], [0.074, 0.0], ...cutProfile(HEAD, 0.04, 0.16, off).slice(1)];
    b.add(lathe(hood, 12, 1, HZ, 0.66, Math.PI * 2 - 1.32), 'head', s.hijab, { at: [0, 0.004, HOFF] });
    b.add(shell([[0.058, -0.04], [0.068, 0.0], [0.07, 0.03]], 12, 1, HZ, 0.0, -0.7, 1.4), 'head', s.hijab, { at: [0, 0, HOFF] }); // under-chin
    // drape over chest / shoulders
    b.add(shell([[B.shX + 0.06, 0.05], [B.shX + 0.062, 0.15], [B.shX * 0.88 + 0.02, 0.215], [0.1, 0.258], [0.078, 0.29]], 12, 1, 0.74, 0.006), 'chest', s.hijab);
  } else {
    const off = s.hair === 'side_part' ? 0.012 : 0.008;
    b.add(lathe(cutProfile(HEAD, 0.142, 0.214, off), 11, 1, HZ), 'head', hc, { at: [0, s.hair === 'side_part' ? 0.004 : 0.001, HOFF] });
    b.add(lathe(cutProfile(HEAD, s.hair === 'long_tied' ? 0.03 : 0.055, 0.16, off), 7, 1, HZ, Math.PI / 2 - 0.15, Math.PI + 0.3), 'head', hc, { at: [0, 0, HOFF] });
    if (s.hair === 'side_part') b.add(lathe([[0, -0.03], [0.03, -0.02], [0.034, 0.01], [0.02, 0.03], [0, 0.034]], 6, 1, 0.45), 'head', hc, { at: [0.03, 0.198, 0.045], rot: [0.9, 0, -0.5] });
    if (s.hair === 'long_tied') {
      b.add(limb(0.2, 0.03, 0.028, 0.012, 5, 0.5), 'head', hc, { at: [0, 0.135, -0.083 + HOFF], rot: [0.35, 0, 0] });
      b.add(shell([[0.022, -0.01], [0.022, 0.01]], 6, 1, 1, 0.0), 'head', '#c0392b', { at: [0, 0.13, -0.09 + HOFF], rot: [0.35, 0, 0] });
    }
  }
  if (s.cap) { // baseball cap
    b.add(lathe(cutProfile(HEAD, 0.14, 0.214, 0.016), 10, 1, HZ), 'head', s.cap, { at: [0, 0.006, HOFF] });
    b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 10, 1, false, -Math.PI / 2, Math.PI), 'head', shade(s.cap, 0.8), { at: [0, 0.152, HOFF + 0.07], rot: [-0.12, 0, 0] });
  }
  if (s.peakCap) {
    b.add(lathe([[0.08, 0.13], [0.084, 0.16], [0.1, 0.205], [0.095, 0.218], [0, 0.222]], 12, 1, HZ * 0.98), 'head', '#15181c', { at: [0, 0, HOFF] });
    b.add(shell([[0.0815, 0.13], [0.083, 0.152]], 12, 1, HZ * 0.99, 0.0), 'head', '#c9a227', { at: [0, 0, HOFF] });
    b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.007, 10, 1, false, -Math.PI / 2, Math.PI), 'head', '#0b0b0b', { at: [0, 0.133, HOFF + 0.075], rot: [-0.3, 0, 0] });
  }
  if (s.helmet) { // half-face helmet held by the chin strap in the right hand
    b.add(lathe([[0, 0.012], [0.11, 0.0], [0.125, 0.004], [0.13, 0.05], [0.115, 0.11], [0.07, 0.15], [0, 0.162]], 10, 1, 1.12), 'handR', (v: THREE.Vector3) => (v.x > -B.shX - 0.03 ? '#1a1a1a' : '#14a33a'), { at: [-0.03, -0.26, 0.0], rot: [0, 0, Math.PI / 2] });
    b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 4), 'handR', '#111111', { at: [-0.012, -0.1, 0.0] });
  }

  const merged = mergeGeometries(b.parts, false)!;
  b.parts.forEach(p => p.dispose());
  merged.computeBoundingBox(); merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.25);
  return merged;
}

/** skirt / tunic vertices: hips at the waist -> thighs at knee height -> partly shins below the knee.
 *  Works for walking (cloth follows the legs) and sitting (drapes over the knees). */
function skirtWeights(B: Body, yTop: number, _yBot: number, _maxW: number): WeightFn {
  const kneeY = LEG.hipY - LEG.thigh, yHem = LEG.ankle;
  return (v) => {
    const side = THREE.MathUtils.clamp(v.x / (B.pelvisR * 0.9), -1, 1);
    const L = 0.5 + 0.5 * side, R = 1 - L;
    if (v.y >= kneeY) {
      const a = THREE.MathUtils.clamp((yTop - v.y) / (yTop - kneeY), 0, 1); const wt = Math.pow(a, 1.5);
      return [[BI.hips, BI.thighL, BI.thighR], [1 - wt, wt * L, wt * R]];
    }
    const sN = THREE.MathUtils.clamp((kneeY - v.y) / (kneeY - yHem), 0, 1); const ws = 0.7 * Math.min(1, sN * 1.6), wt = 1 - ws;
    return [[BI.thighL, BI.thighR, BI.shinL, BI.shinR], [wt * L, wt * R, ws * L, ws * R]];
  };
}

// ---------------------------------------------------------------- specs
const BATIK_KEYS = [0, 1, 2, 3];
const pickR = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];
export function randomSpec(rng: () => number = Math.random, outfit?: Outfit): PersonSpec {
  const o = outfit ?? pickR(rng, OUTFITS);
  const skin = pickR(rng, SKIN_TONES), hairColor = pickR(rng, ['#151110', '#1d1612', '#2a1e16']);
  const male = (h: number) => 1.62 + rng() * 0.13 + h * 0;
  const fem = () => 1.52 + rng() * 0.1;
  const base: PersonSpec = { outfit: o, female: false, height: male(0), skin, hair: rng() < 0.5 ? 'short' : 'side_part', hairColor, top: '#ffffff', bottom: '#2b2f36', shoes: '#151515', batik: -1, sleeves: 'short', tucked: false, skirt: 'none', tunic: false, shorts: false, sandals: false, hijab: '#ffffff' };
  switch (o) {
    case 'office_batik': return { ...base, batik: pickR(rng, BATIK_KEYS), top: '#ffffff', bottom: pickR(rng, ['#22262d', '#2b2f36', '#3b3a36']) };
    case 'office_white': return { ...base, top: '#f3f3ef', sleeves: 'long', tucked: true, bottom: pickR(rng, ['#1f232a', '#2c3039', '#3a3d44']), tie: rng() < 0.5 ? pickR(rng, ['#8e1f2c', '#1f3d7a', '#3a3a3a']) : undefined, lanyard: rng() < 0.5, pocket: true };
    case 'student_m': return { ...base, height: 1.6 + rng() * 0.12, top: '#f5f5f2', tucked: true, bottom: '#6d7178', pocket: true };
    case 'student_f': {
      const hij = rng() < 0.6;
      return { ...base, female: true, height: fem(), top: '#f5f5f2', bottom: '#6d7178', tucked: false, sleeves: hij ? 'long' : 'short', skirt: hij ? 'long' : 'knee', hair: hij ? 'hijab' : 'long_tied', hijab: '#f4f4f2', pocket: !hij };
    }
    case 'hijab_woman': {
      const tun = pickR(rng, ['#8e4a6b', '#3f6e8c', '#b5835a', '#5b7f5e', '#7a3b3b', '#c9a9a6']);
      return { ...base, female: true, height: fem(), top: tun, bottom: pickR(rng, ['#2d2a33', '#3e3a36', '#1f2633']), sleeves: 'long', tunic: true, skirt: rng() < 0.6 ? 'long' : 'none', hair: 'hijab', hijab: pickR(rng, ['#e8d9c5', '#2c3e50', '#6c3483', '#16a085', '#d8a7a0', '#f0ece4']), shoes: '#4a3a30' };
    }
    case 'ojol': return { ...base, top: '#14a33a', bottom: '#1f2a44', sleeves: 'long', jacket: true, helmet: rng() < 0.6, shoes: '#222222' };
    case 'vendor': return { ...base, top: pickR(rng, ['#c0533a', '#d9b45a', '#6f8fa8', '#8a8f73', '#e2ddd0']), bottom: pickR(rng, ['#3b3f45', '#5b4a3a', '#2f3e52']), shorts: true, sandals: true, cap: rng() < 0.6 ? pickR(rng, ['#2c3e50', '#a93226', '#e5e0d5']) : undefined, towel: rng() < 0.6 ? '#eae6da' : undefined, hair: 'short' };
    case 'security': return { ...base, top: '#1e2a3c', bottom: '#121418', sleeves: 'long', tucked: true, peakCap: true, epaulettes: true, patch: 'SATPAM', hair: 'short', pocket: true };
    case 'technician': return { ...base, top: '#1f2f55', bottom: pickR(rng, ['#2b2f36', '#6b5d47']), patch: 'IT', lanyard: rng() < 0.6, tucked: rng() < 0.4 };
  }
}

// ---------------------------------------------------------------- create
const geoCache = new Map<string, THREE.BufferGeometry>();
export function personGeometry(spec: PersonSpec) {
  const { height, ...k } = spec; const key = JSON.stringify(k);
  let g = geoCache.get(key); if (!g) { g = buildGeometry(spec); geoCache.set(key, g); }
  return g;
}
export function cachedVariantCount() { return geoCache.size; }

// Skinning is done in our own vertex-shader patch with a mat4 uniform array (17 bones) instead of
// THREE.SkinnedMesh: three's bone-texture path kills the GL context on SwiftShader / some weak GPUs.
const SKIN_DECL = `attribute vec4 skinIndex;\nattribute vec4 skinWeight;\nuniform mat4 uBones[${BONES.length}];\n`;
const SKIN_MAT = `mat4 pSkin = skinWeight.x * uBones[int(skinIndex.x)] + skinWeight.y * uBones[int(skinIndex.y)] + skinWeight.z * uBones[int(skinIndex.z)] + skinWeight.w * uBones[int(skinIndex.w)];\n`;
function patchSkin(m: THREE.Material, bones: THREE.Matrix4[], withNormal: boolean) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = { value: bones };
    let v = SKIN_DECL + sh.vertexShader;
    if (withNormal) {
      v = v.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + SKIN_MAT + 'objectNormal = mat3(pSkin) * objectNormal;\n');
      v = v.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = (pSkin * vec4(transformed, 1.0)).xyz;\n');
    } else {
      v = v.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SKIN_MAT + 'transformed = (pSkin * vec4(transformed, 1.0)).xyz;\n');
    }
    sh.vertexShader = v;
  };
  m.customProgramCacheKey = () => 'kn-people-skin-' + (withNormal ? 'n' : 'd');
}

export function createPerson(spec: PersonSpec = randomSpec()): Person {
  const geo = personGeometry(spec);
  const B = spec.female ? BODY_F : BODY_M; const P = bindPositions(B);
  const bones = BONES.map((n) => { const bn = new THREE.Bone(); bn.name = n; return bn; });
  BONES.forEach((n, i) => {
    const par = PARENT[n]; const bn = bones[i];
    if (par) { bones[BI[par]].add(bn); bn.position.copy(P[i]).sub(P[BI[par]]); } else bn.position.copy(P[i]);
  });
  const mats = BONES.map(() => new THREE.Matrix4());
  const material = peopleMaterial().clone(); material.map = peopleMaterial().map; patchSkin(material, mats, true);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patchSkin(depth, mats, false);
  const mesh = new THREE.Mesh(geo, material) as THREE.Mesh;
  mesh.customDepthMaterial = depth;
  mesh.name = 'person_' + spec.outfit; mesh.castShadow = true; mesh.receiveShadow = false;
  const root = new THREE.Group(); root.name = 'NPC_' + spec.outfit; root.add(mesh); root.add(bones[0]);
  const scale = spec.height / REF_H; root.scale.setScalar(scale);
  const rig = Object.fromEntries(BONES.map((n, i) => [n, bones[i]])) as Rig;
  const p: Person = { root, mesh, rig, spec, scale, tris: geo.attributes.position.count / 3, bones: mats, bind: P };
  root.userData.person = p;
  idlePose(p, 0);
  return p;
}
const _world = BONES.map(() => new THREE.Matrix4());
/** push the rig's current rotations to the GPU bone matrices (called by every pose function) */
export function commitPose(p: Person) {
  const r = p.rig;
  for (let i = 0; i < BONES.length; i++) {
    const bn = r[BONES[i]]; bn.updateMatrix();
    const par = PARENT[BONES[i]];
    if (par) _world[i].multiplyMatrices(_world[BI[par]], bn.matrix); else _world[i].copy(bn.matrix);
    const b = p.bind[i];
    p.bones[i].copy(_world[i]).multiply(_tmpM.makeTranslation(-b.x, -b.y, -b.z));
  }
}
const _tmpM = new THREE.Matrix4();

export function triCount(o: THREE.Object3D) {
  let t = 0; o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { const g = m.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return t;
}

// ---------------------------------------------------------------- poses
function resetPose(r: Rig) { for (const n of BONES) r[n].rotation.set(0, 0, 0); r.hips.position.x = 0; r.hips.position.z = 0; }
const FOOT_PTS: [number, number][] = [[-0.075, -0.08], [0.17, -0.08], [0.05, -0.08]]; // heel, toe, ball (z, y) in foot space
/** lowest sole point of a leg relative to the hip joint, sagittal-plane FK */
function legLow(thighX: number, kneeX: number, footX: number) {
  const aT = thighX, aS = aT + kneeX, aF = aS + footX;
  const ky = -LEG.thigh * Math.cos(aT), kz = -LEG.thigh * Math.sin(aT);
  const ay = ky - (LEG.shin) * Math.cos(aS), az = kz - LEG.shin * Math.sin(aS);
  let low = Infinity, lowZ = 0;
  for (const [z, y] of FOOT_PTS) { const yy = ay + y * Math.cos(aF) - z * Math.sin(aF); if (yy < low) { low = yy; lowZ = az + y * Math.sin(aF) + z * Math.cos(aF); } }
  return { low, lowZ, az };
}
function groundHips(r: Rig) {
  const l = legLow(r.thighL.rotation.x, r.shinL.rotation.x, r.footL.rotation.x).low;
  const rr = legLow(r.thighR.rotation.x, r.shinR.rotation.x, r.footR.rotation.x).low;
  r.hips.position.y = -Math.min(l, rr);
}
const TAU = Math.PI * 2;
function g(t: number, c: number, w: number) { let d = ((t - c) % 1 + 1.5) % 1 - 0.5; return Math.exp(-(d * d) / (w * w)); }
function gait(t: number) { // t in [0,1), heel strike at 0. returns hip flexion (+fwd), knee flexion, foot pitch vs ground (+toe down)
  const hip = 0.05 + 0.27 * Math.cos(TAU * (t - 0.04));
  const knee = 0.05 + 0.24 * g(t, 0.14, 0.08) + 1.0 * g(t, 0.72, 0.115);
  const pitch = -0.28 * g(t, 0.0, 0.07) + 0.5 * g(t, 0.57, 0.075) + 0.25 * g(t, 0.66, 0.05) - 0.12 * g(t, 0.93, 0.06);
  return { hip, knee, pitch };
}
function setLeg(r: Rig, side: 'L' | 'R', t: number, amt: number) {
  const { hip, knee, pitch } = gait(t);
  const th = -hip * amt, kn = knee * amt;
  r[`thigh${side}`].rotation.x = th; r[`shin${side}`].rotation.x = kn;
  r[`foot${side}`].rotation.x = -(th + kn) + pitch * amt;
  return hip;
}
/** stride (m per gait cycle at 1.70 m) measured from the stance foot so feet don't skate */
export const WALK_STRIDE = (() => {
  const z = (t: number) => { const { hip, knee } = gait(t); const th = -hip; return legLow(th, knee, 0).az; };
  return (z(0.08) - z(0.45)) / (0.45 - 0.08);
})();

/** walk cycle. phase: 0..1 (advance by distance / (WALK_STRIDE*scale)). amt 0..1 blends from standing. */
export function walkPose(p: Person, phase: number, amt = 1) {
  const r = p.rig; resetPose(r);
  const t = ((phase % 1) + 1) % 1;
  const hl = setLeg(r, 'L', t, amt), hr = setLeg(r, 'R', (t + 0.5) % 1, amt);
  // arms: opposite to the same-side leg, elbows bend more when the arm swings forward
  for (const [side, h, sx] of [['L', hl, 1], ['R', hr, -1]] as const) {
    const a = (h - 0.05) * 0.95 * amt;
    r[`upperArm${side}`].rotation.set(a, 0, sx * 0.075);
    r[`forearm${side}`].rotation.set(-(0.22 + 0.5 * Math.max(0, -a)) * (0.4 + 0.6 * amt), 0, 0);
    r[`hand${side}`].rotation.set(-0.1, 0, 0);
  }
  // torso: pelvis yaw with the forward leg, shoulders counter-rotate, lateral shift over stance foot, bob from ground contact
  r.hips.rotation.y = -0.17 * (hl - hr) * amt;
  r.hips.rotation.z = 0.035 * Math.sin(TAU * (t + 0.1)) * amt;
  r.hips.position.x = 0.022 * Math.cos(TAU * (t - 0.22)) * amt;
  r.spine.rotation.x = 0.05 * amt; r.spine.rotation.z = -r.hips.rotation.z * 0.8;
  r.chest.rotation.y = 0.3 * (hl - hr) * amt;
  r.neck.rotation.y = -0.1 * (hl - hr) * amt; r.neck.rotation.x = -0.03 * amt;
  r.head.rotation.x = -0.02;
  groundHips(r);
  // subtle double-bounce (body lowest just after heel strike)
  r.hips.position.y -= 0.008 * g(t * 2 % 1, 0.12, 0.12) * amt;
  commitPose(p);
}

/** standing idle: breathing + slow weight shift */
export function idlePose(p: Person, time: number) {
  const r = p.rig; resetPose(r);
  const s = Math.sin(time * 0.6), br = Math.sin(time * 1.7);
  r.thighL.rotation.set(-0.02, 0, 0.012 + 0.01 * s); r.thighR.rotation.set(0.02, 0, -0.012 + 0.01 * s);
  r.shinL.rotation.x = 0.04 + 0.03 * Math.max(0, -s); r.shinR.rotation.x = 0.04 + 0.03 * Math.max(0, s);
  r.footL.rotation.x = -(r.thighL.rotation.x + r.shinL.rotation.x); r.footR.rotation.x = -(r.thighR.rotation.x + r.shinR.rotation.x);
  r.footL.rotation.z = -r.thighL.rotation.z; r.footR.rotation.z = -r.thighR.rotation.z;
  r.hips.position.x = 0.012 * s; r.hips.rotation.z = -0.012 * s;
  r.spine.rotation.z = 0.012 * s; r.chest.rotation.x = -0.01 * br; r.spine.rotation.x = 0.015;
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    r[`upperArm${side}`].rotation.set(0.04 + 0.01 * br, 0, sx * (0.085 + 0.006 * br));
    r[`forearm${side}`].rotation.set(-0.16, 0, 0); r[`hand${side}`].rotation.set(-0.08, 0, 0);
  }
  r.head.rotation.y = 0.15 * Math.sin(time * 0.23); r.head.rotation.x = 0.02;
  groundHips(r);
  commitPose(p);
}

/** seated: thighs horizontal, knees ~90°, feet on the floor when the seat allows. seatHeight in world metres above the person's root. */
export function seatedPose(p: Person, seatHeight = 0.45) {
  const r = p.rig; resetPose(r);
  const hipY = seatHeight / p.scale + 0.085;
  r.hips.position.y = hipY; r.hips.position.z = -0.03;
  const d = hipY - LEG.ankle - 0.0; // vertical room for the shin
  const beta = d < LEG.shin ? Math.acos(THREE.MathUtils.clamp(d / LEG.shin, 0, 1)) : 0;
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    r[`thigh${side}`].rotation.set(-Math.PI / 2, 0, sx * 0.04);
    const knee = Math.PI / 2 - beta; r[`shin${side}`].rotation.x = knee;
    r[`foot${side}`].rotation.x = -(-Math.PI / 2 + knee);
    r[`upperArm${side}`].rotation.set(-0.25, 0, sx * 0.1);
    r[`forearm${side}`].rotation.set(-1.0, sx * 0.4, 0);
    r[`hand${side}`].rotation.set(0.1, 0, 0);
  }
  r.spine.rotation.x = -0.02; r.head.rotation.x = 0.04;
  commitPose(p);
}

/** seated typing at a desk: forearms level, palms down, small finger/wrist taps, head tilted to the screen */
export function typingPose(p: Person, time: number, seatHeight = 0.45) {
  seatedPose(p, seatHeight);
  const r = p.rig;
  r.spine.rotation.x = 0.1; r.chest.rotation.x = 0.04; r.neck.rotation.x = 0.06; r.head.rotation.x = 0.12 + 0.02 * Math.sin(time * 0.4);
  for (const [side, sx, ph] of [['L', 1, 0], ['R', -1, 1.7]] as const) {
    r[`upperArm${side}`].rotation.set(-0.42, 0, sx * -0.04);
    r[`forearm${side}`].rotation.set(-1.15, sx * 1.35, 0);
    const tap = Math.max(0, Math.sin(time * 9 + ph)) * Math.max(0, Math.sin(time * 2.3 + ph * 2));
    r[`hand${side}`].rotation.set(0.12 + 0.12 * tap, 0, sx * 0.1);
  }
  commitPose(p);
}

/** crouch (jongkok) blended by k (0 standing .. 1 full crouch); phase/move animate a short crouch-walk.
 *  Full crouch puts the head at ~1.2 m for a 1.70 m person (matches the crouched collision height). */
export function crouchPose(p: Person, phase: number, move: number, k: number, time = 0) {
  const r = p.rig; resetPose(r);
  const t = ((phase % 1) + 1) % 1;
  for (const [side, off, sx] of [['L', 0, 1], ['R', 0.5, -1]] as const) {
    const c = Math.cos(TAU * (t + off)), sn = Math.sin(TAU * (t + off));
    const th = -(1.42 * k) - 0.32 * move * k * c;                 // thigh swings forward/back with the step
    const kn = 2.2 * k + 0.35 * move * k * Math.max(0, sn);        // knee lifts the swinging foot
    r[`thigh${side}`].rotation.set(th, 0, sx * 0.1 * k);
    r[`shin${side}`].rotation.x = kn;
    r[`foot${side}`].rotation.set(-(th + kn), 0, -sx * 0.1 * k);
    r[`upperArm${side}`].rotation.set(-0.45 * k + 0.2 * move * k * c, 0, sx * (0.12 + 0.05 * k));
    r[`forearm${side}`].rotation.set(-0.75 * k - 0.15, 0, 0);
    r[`hand${side}`].rotation.set(-0.1, 0, 0);
  }
  const br = Math.sin(time * 1.7);
  r.spine.rotation.x = 0.42 * k; r.chest.rotation.x = 0.1 * k + 0.01 * br;
  r.neck.rotation.x = -0.3 * k; r.head.rotation.x = -0.18 * k;
  r.hips.rotation.y = 0.08 * move * k * Math.sin(TAU * t);
  groundHips(r);
  commitPose(p);
}

// ---- riding a scooter: two-bone IK for legs (to the floorboard) and arms (to the grips)
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _DOWN = new THREE.Vector3(0, -1, 0);
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _vd = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
function ik2(a: THREE.Vector3, c: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3) {
  const d = _vd.copy(c).sub(a); const D = Math.min(Math.max(d.length(), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3); d.normalize();
  const x = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pp = _vc.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  return out.copy(a).addScaledVector(d, x).addScaledVector(pp, h);
}
/** world (rig-space) rotation of a bone's parent chain, from the bones' current local transforms */
function rigWorld(b: THREE.Object3D, out: THREE.Matrix4) {
  const chain: THREE.Object3D[] = []; for (let q: THREE.Object3D | null = b; q && (q as THREE.Bone).isBone; q = q.parent) chain.unshift(q);
  out.identity(); for (const q of chain) { q.updateMatrix(); out.multiply(q.matrix); } return out;
}
/** aim a bone (rest direction -Y) at `dir` (rig space), given its parent's rig-space rotation */
function aim(b: THREE.Bone, parentQ: THREE.Quaternion, dir: THREE.Vector3) {
  _q1.setFromUnitVectors(_DOWN, _va.copy(dir).normalize());
  b.quaternion.copy(_q3.copy(parentQ).invert()).multiply(_q1);
}
export interface RideTargets { hip: THREE.Vector3; lean: number; ankleL: THREE.Vector3; ankleR: THREE.Vector3; gripL: THREE.Vector3; gripR: THREE.Vector3; look?: number }
/** seated on a scooter. Targets are in the person's root space in metres (person faces +Z, its left = +X). */
export function ridePose(p: Person, T: RideTargets) {
  const r = p.rig, s = 1 / p.scale; resetPose(r);
  r.hips.position.set(T.hip.x * s, T.hip.y * s, T.hip.z * s);
  r.spine.rotation.x = T.lean * 0.7; r.chest.rotation.x = T.lean * 0.3;
  r.neck.rotation.x = -T.lean * 0.55; r.head.rotation.x = -T.lean * 0.25; r.head.rotation.y = T.look ?? 0;
  const B = p.bind, hipQ = new THREE.Quaternion();
  for (const [side, sx, ank] of [['L', 1, T.ankleL], ['R', -1, T.ankleR]] as const) {
    const thigh = r[`thigh${side}`], shin = r[`shin${side}`], foot = r[`foot${side}`];
    const H = new THREE.Vector3().copy(r.hips.position).add(_vb.set(B[BI[`thigh${side}`]].x - B[BI.hips].x, 0, 0));
    const A = ank.clone().multiplyScalar(s);
    const K = ik2(H, A, LEG.thigh, LEG.shin, new THREE.Vector3(sx * 0.25, 0.35, 1), new THREE.Vector3());
    aim(thigh, hipQ, K.clone().sub(H));
    const tq = thigh.quaternion.clone();
    aim(shin, tq, A.clone().sub(K));
    const sq = tq.clone().multiply(shin.quaternion);
    foot.quaternion.copy(sq.invert()).multiply(_q2.setFromEuler(new THREE.Euler(-0.15, 0, 0)));
  }
  // arms: shoulders from the leaned chest, hands to the grips
  for (const [side, sx, grip] of [['L', 1, T.gripL], ['R', -1, T.gripR]] as const) {
    const ua = r[`upperArm${side}`], fa = r[`forearm${side}`], hand = r[`hand${side}`];
    rigWorld(r.chest, _m1);
    const S = new THREE.Vector3().copy(ua.position).applyMatrix4(_m1);
    const chestQ = new THREE.Quaternion().setFromRotationMatrix(_m1);
    const W = grip.clone().multiplyScalar(s);
    const E = ik2(S, W, ARM.upper, ARM.fore, new THREE.Vector3(sx * 1, -0.7, -0.4), new THREE.Vector3());
    aim(ua, chestQ, E.clone().sub(S));
    const uq = chestQ.clone().multiply(ua.quaternion);
    aim(fa, uq, W.clone().sub(E));
    hand.rotation.set(0.15, 0, 0);
  }
  void _m2;
  commitPose(p);
}
