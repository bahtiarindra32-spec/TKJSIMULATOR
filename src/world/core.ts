import * as THREE from 'three';

// ---------- colliders (axis aligned, three.js world coords) ----------
export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }
export const colliders: AABB[] = [];
export function addCollider(minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 100) {
  colliders.push({ minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), minY, maxY });
}

// ---------- seeded random ----------
let seed = 1337;
export function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
export const rr = (a: number, b: number) => a + rand() * (b - a);
export const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

// ---------- canvas textures ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}
function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export const TEX = {
  asphalt: canvasTex(256, 256, g => {
    g.fillStyle = '#34373c'; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 5000, 0.35); noise(g, 256, 256, 2500, 0.12, true);
    g.strokeStyle = 'rgba(20,20,22,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 40; y += Math.random() * 30; g.lineTo(x, y); } g.stroke(); }
  }),
  sidewalk: canvasTex(256, 256, g => {
    g.fillStyle = '#bdb6a6'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
      const s = 170 + Math.random() * 30; g.fillStyle = `rgb(${s + 12},${s + 6},${s - 6})`; g.fillRect(x + 1, y + 1, 30, 30);
    }
    noise(g, 256, 256, 2500, 0.18);
  }),
  concrete: canvasTex(256, 256, g => {
    g.fillStyle = '#a9a69f'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 6000, 0.15); noise(g, 256, 256, 2000, 0.1, true);
    g.strokeStyle = 'rgba(60,60,60,0.35)'; g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  }),
  grass: canvasTex(256, 256, g => {
    g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) { const s = Math.random(); g.fillStyle = s > .5 ? 'rgba(130,160,80,0.5)' : 'rgba(60,85,40,0.5)'; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 2); }
    for (let i = 0; i < 25; i++) { g.fillStyle = 'rgba(140,120,80,0.15)'; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 14, 0, 7); g.fill(); }
  }),
  dirt: canvasTex(256, 256, g => {
    g.fillStyle = '#9b8466'; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 8000, 0.25); noise(g, 256, 256, 3000, 0.15, true);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(100,130,60,0.35)'; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 10, 0, 7); g.fill(); }
  }),
  plaza: canvasTex(256, 256, g => {
    g.fillStyle = '#c9c1b0'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 64) { const o = (y / 16) % 2 ? 32 : 0; const s = 185 + Math.random() * 25; g.fillStyle = `rgb(${s + 10},${s + 4},${s - 10})`; g.fillRect((x + o) % 256 + 1, y + 1, 62, 14); }
    noise(g, 256, 256, 2000, 0.12);
  }),
  paving: canvasTex(128, 128, g => {
    g.fillStyle = '#8e8a84'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 16) { const s = 120 + Math.random() * 30; g.fillStyle = `rgb(${s},${s - 3},${s - 8})`; g.beginPath(); g.moveTo(x + 8, y + 1); g.lineTo(x + 15, y + 5); g.lineTo(x + 15, y + 11); g.lineTo(x + 8, y + 15); g.lineTo(x + 1, y + 11); g.lineTo(x + 1, y + 5); g.fill(); }
    noise(g, 128, 128, 800, 0.2);
  }),
  roofTile: canvasTex(128, 128, g => {
    g.fillStyle = '#a34a2a'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 10) { g.fillStyle = 'rgba(60,20,10,0.45)'; g.fillRect(0, y, 128, 2); for (let x = (y / 10) % 2 * 8; x < 128; x += 16) { g.fillStyle = `rgba(${150 + Math.random() * 40},${60 + Math.random() * 20},40,0.6)`; g.fillRect(x, y + 2, 14, 8); } }
    noise(g, 128, 128, 1500, 0.25);
  }),
  seng: canvasTex(128, 128, g => {
    for (let x = 0; x < 128; x += 8) { const grd = g.createLinearGradient(x, 0, x + 8, 0); grd.addColorStop(0, '#8d9296'); grd.addColorStop(.5, '#c7cbcd'); grd.addColorStop(1, '#7c8185'); g.fillStyle = grd; g.fillRect(x, 0, 8, 128); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60},70,30,${Math.random() * 0.4})`; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 10, 0, 7); g.fill(); }
  }),
  floorTile: canvasTex(256, 256, g => {
    g.fillStyle = '#e6e1d6'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { const s = 222 + Math.random() * 18; g.fillStyle = `rgb(${s},${s - 4},${s - 12})`; g.fillRect(x + 1, y + 1, 62, 62); }
    noise(g, 256, 256, 600, 0.05);
  }),
  carpet: canvasTex(128, 128, g => { g.fillStyle = '#56606c'; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 2500, 0.1); noise(g, 128, 128, 1200, 0.05, true); g.strokeStyle = 'rgba(30,35,40,0.35)'; for (let i = 0; i <= 128; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } }),
  raised: canvasTex(128, 128, g => {
    g.fillStyle = '#c8ccd0'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#8a8f95'; g.lineWidth = 2; for (let i = 0; i <= 128; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    g.fillStyle = '#9aa0a6'; for (let i = 0; i < 40; i++) g.fillRect(70 + (i % 8) * 6, 70 + Math.floor(i / 8) * 6, 3, 3);
  }),
};

/** facade texture: one tile = one bay x one floor */
export function facadeTex(kind: 'glass' | 'glass2' | 'apt' | 'hotel' | 'ruko', seedOffset = 0) {
  return canvasTex(128, 128, g => {
    if (kind === 'glass' || kind === 'glass2') {
      const base = kind === 'glass' ? ['#3d5a73', '#557a96'] : ['#4a5f6a', '#6f8c95'];
      const grd = g.createLinearGradient(0, 0, 128, 128); grd.addColorStop(0, base[1]); grd.addColorStop(1, base[0]);
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,240,210,0.12)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(60, 0); g.lineTo(0, 90); g.fill();
      g.fillStyle = kind === 'glass' ? '#c8ced3' : '#b9b3a6'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 0, 6, 128);
      if (kind === 'glass2') { g.fillRect(62, 0, 4, 128); }
      if ((seedOffset + Math.random()) % 1 > 0.7) { g.fillStyle = 'rgba(255,214,150,0.35)'; g.fillRect(8, 14, 116, 108); }
    } else if (kind === 'apt') {
      g.fillStyle = '#e8dcc3'; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 1500, 0.08);
      g.fillStyle = '#2f3a44'; g.fillRect(16, 36, 96, 54);
      g.fillStyle = '#7a8c99'; g.fillRect(20, 40, 42, 46); g.fillRect(66, 40, 42, 46);
      g.fillStyle = '#d2c3a6'; g.fillRect(8, 96, 112, 8);
      g.fillStyle = 'rgba(80,60,40,0.18)'; g.fillRect(20, 104, 4, 24);
      if (Math.random() > .6) { g.fillStyle = ['#c0392b', '#2980b9', '#f1c40f'][Math.floor(Math.random() * 3)]; g.fillRect(30, 92, 50, 6); }
    } else if (kind === 'hotel') {
      g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 800, 0.06);
      g.fillStyle = '#24323d'; g.fillRect(24, 30, 80, 70);
      g.fillStyle = '#6f8ea3'; g.fillRect(28, 34, 72, 62);
      g.fillStyle = '#a7b9c6'; g.fillRect(28, 34, 72, 10);
      g.fillStyle = '#2bd46b'; g.fillRect(0, 120, 128, 3);
    } else {
      g.fillStyle = '#ddd'; g.fillRect(0, 0, 128, 128);
    }
  });
}

export function signTex(text: string, bg = '#13202b', fg = '#ffffff', w = 1024, h = 160, accent = '#2bd46b') {
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, h - 10, w, 10);
    let fs = Math.floor(h * 0.42);
    g.font = `bold ${fs}px "Segoe UI", Arial, sans-serif`;
    const tw = g.measureText(text).width; if (tw > w * 0.92) { fs = Math.floor(fs * (w * 0.92) / tw); }
    g.fillStyle = fg; g.font = `bold ${fs}px "Segoe UI", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
  }, false);
}

// ---------- materials ----------
const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string | number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = String(color) + JSON.stringify(Object.keys(opts).map(k => [k, (opts as any)[k]?.uuid ?? (opts as any)[k]]));
  let m = cache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }); cache.set(key, m); }
  return m;
}
export function texMat(tex: THREE.Texture, rx: number, ry: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, ...opts });
}

export const M = {
  white: mat('#f2f0ea'), wall: mat('#ece7dc'), wallInt: mat('#f4f1ea'), dark: mat('#22262b'), black: mat('#111316', { roughness: 0.4 }),
  metal: mat('#9aa3aa', { metalness: 0.7, roughness: 0.35 }), steel: mat('#5d666e', { metalness: 0.6, roughness: 0.45 }),
  wood: mat('#8a5a35', { roughness: 0.7 }), woodLight: mat('#c9a77c', { roughness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#9fc4d8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  curb: mat('#d8d4cc'), yellow: mat('#f2c230'), red: mat('#c0392b'), green: mat('#2bd46b'), blue: mat('#2f6fb3'),
  screen: mat('#0e1a24', { emissive: '#1d6fa5', emissiveIntensity: 0.6, roughness: 0.3 }),
  screenG: mat('#0e1a24', { emissive: '#2bd46b', emissiveIntensity: 0.5, roughness: 0.3 }),
  plant: mat('#3f7a3a'), pot: mat('#7a4b32'), fabric: mat('#3d4f63'), fabric2: mat('#9c6b3c'), leather: mat('#2c2c2c', { roughness: 0.5 }),
  marking: mat('#f5f5f0', { roughness: 0.6 }), markingY: mat('#f2c230', { roughness: 0.6 }),
  anchor: mat('#ffd400', { emissive: '#ffb400', emissiveIntensity: 0.9, transparent: true, opacity: 0.55 }), spawn: mat('#22c55e', { emissive: '#22c55e', emissiveIntensity: 0.6 }),
  lampOn: mat('#fff4d6', { emissive: '#ffd99a', emissiveIntensity: 1.6 }),
};

// ---------- geometry helpers ----------
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
/** Box from min corner in world coords (x,y,z) with size (w,h,d). */
export function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], name?: string, shadow = true) {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.scale.set(w, h, d); mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh); return mesh;
}
/** Box centered at (cx,cy-base,cz) */
export function boxC(parent: THREE.Object3D, cx: number, y: number, cz: number, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], name?: string, shadow = true) {
  return box(parent, cx - w / 2, y, cz - d / 2, w, h, d, m, name, shadow);
}
export function cyl(parent: THREE.Object3D, cx: number, y: number, cz: number, r: number, h: number, m: THREE.Material, name?: string, seg = 12, rTop?: number) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop ?? r, r, h, seg), m);
  mesh.position.set(cx, y + h / 2, cz); mesh.castShadow = true; mesh.receiveShadow = true;
  if (name) mesh.name = name; parent.add(mesh); return mesh;
}
export function group(parent: THREE.Object3D, name: string) { const g = new THREE.Group(); g.name = name; parent.add(g); return g; }

/** Ground-level flat plane (horizontal) from min corner. */
export function flat(parent: THREE.Object3D, x: number, z: number, w: number, d: number, y: number, m: THREE.Material, name?: string) {
  const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(x + w / 2, y, z + d / 2); mesh.receiveShadow = true;
  if (name) mesh.name = name; parent.add(mesh); return mesh;
}

/** Gable roof prism geometry, ridge along Z, width w (X), depth d (Z), height h. Origin at base center. */
export function gableGeo(w: number, d: number, h: number, overhang = 0.4) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const shape = new THREE.Shape(); shape.moveTo(-W, 0); shape.lineTo(W, 0); shape.lineTo(0, h); shape.lineTo(-W, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: D * 2, bevelEnabled: false });
  geo.translate(0, 0, -D);
  // planar UVs for tiling
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getY(i)) * 0.5, pos.getZ(i) * 0.5);
  geo.computeVertexNormals();
  return geo;
}

// ---------- static batching (render copy; originals stay in the scene graph, hidden, for naming/GLB export) ----------
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** detail: small meshes (largest side < max m) go into a child group 'DETAIL' (userData.tier) that the graphics tiers can hide.
 *  Anything under an object whose name matches keep (network gear, outlets, labels...) always stays in the main batch. */
export interface BakeDetail { max: number; tier: 'in' | 'out'; keep?: RegExp }
const _bb = new THREE.Box3(), _sz = new THREE.Vector3();
export function bakeStatic(src: THREE.Object3D, name: string, skip: (o: THREE.Object3D) => boolean = () => false, detail?: BakeDetail) {
  src.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const dBuckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const visit = (o: THREE.Object3D, kept: boolean) => {
    if (skip(o) || !o.visible) return;   // hidden subtrees (car LOD stand-ins, already-baked originals) are not baked
    kept ||= !!(detail?.keep && detail.keep.test(o.name));
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as any).isInstancedMesh && !Array.isArray(m.material) && m.visible) {
      let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      let small = false;
      if (detail && !kept) { g.computeBoundingBox(); _bb.copy(g.boundingBox!).getSize(_sz); small = Math.max(_sz.x, _sz.y, _sz.z) < detail.max; }
      const B = small ? dBuckets : buckets;
      const b = B.get(m.material) ?? { geos: [], cast: false };
      b.geos.push(g); b.cast ||= m.castShadow; B.set(m.material, b);
      m.visible = false; m.userData.baked = true;
    }
    for (const c of o.children) visit(c, kept);
  };
  visit(src, false);
  const emit = (B: typeof buckets, out: THREE.Object3D) => {
    for (const [material, b] of B) {
      const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material); mesh.castShadow = b.cast; mesh.receiveShadow = true; out.add(mesh);
    }
  };
  const out = new THREE.Group(); out.name = name; emit(buckets, out);
  if (detail && dBuckets.size) { const d = new THREE.Group(); d.name = 'DETAIL'; d.userData.tier = detail.tier; emit(dBuckets, d); out.add(d); }
  return out;
}
/** make baked originals visible again (for GLB export) */
export function setBakedVisible(root: THREE.Object3D, v: boolean) { root.traverse(o => { if (o.userData.baked) o.visible = v; }); }
