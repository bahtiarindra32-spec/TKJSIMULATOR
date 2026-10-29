/**
 * netdevices.ts — procedural, merged, cache-shared network equipment & TKJ tools for Kota Nusantara.
 * Plain three.js (r186). No external assets; every texture is a canvas drawn once and shared module-wide.
 *
 * CONVENTIONS (all builders):
 *  - Units are real-world metres. Every builder returns a THREE.Group whose .name = the passed name.
 *  - Origin = bottom-centre-BACK of the object; the object extends toward -Z; its FRONT faces -Z (north).
 *    (So x ∈ [-W/2, W/2], y ∈ [0, H], z ∈ [-D, 0].)  Exceptions are marked [origin: ...] below.
 *  - Small loose items (tools, desk items) are [origin: bottom-centre] unless noted. Every printed label / top decal
 *    reads upright for a viewer standing on the -Z side looking toward +Z (the same side the fronts face).
 *    Desk input devices assume the user sits at -Z facing +Z (monitor screens face -Z; keyboard spacebar edge,
 *    laptop palm rest and mouse tail point to -Z; their cables run off toward +Z).
 *  - group.userData = { size: [W,H,D], kind, frontZ?, u? } — frontZ is the local z of the 19" ear plane.
 *  - Geometry is merged per material and cached per variant: a second call costs only a few Mesh objects.
 *    Do NOT dispose the shared geometries/materials when removing one instance.
 *  - `blinkMats` lists LED/emissive panel materials (shared by all instances). Pulse e.g.
 *      blinkMats.forEach((m,i)=> m.emissiveIntensity = 0.8 + 0.6*Math.max(0, Math.sin(t*9+i*1.7)));
 *
 * RACK-MOUNT (19" = 482.6 mm ears, body 440 mm, 1U = 44.45 mm, device height = nU*44.45-0.8 mm):
 *  switch24(name, managed=true)      0.4826 x 0.0436 x 0.25   24xRJ45 (2 rows) + 4 SFP + console, rack ears
 *  router1U(name)                    0.4826 x 0.0436 x 0.23   "NusaRouter" 10xGbE + SFP+, colour LCD
 *  patchPanel24(name)                0.4826 x 0.0436 x 0.12   24 keystones, numbered, rear IDC block
 *  cableManager1U(name)              0.4826 x 0.0436 x 0.07   5 D-rings
 *  odf1U(name)                       0.4826 x 0.0436 x 0.20   fibre patch panel, 12 SC (blue) adapters
 *  blankPanel(name, u=1)             0.4826 x u*0.0445 x 0.01 vented blanking plate
 *  pdu1U(name)                       0.4826 x 0.0436 x 0.06   8 universal sockets + lit switch
 *  rackShelf1U(name)                 0.4826 x 0.0436 x 0.35   cantilever shelf (vented tray)
 *  server1U(name) / server2U(name)   0.4826 x 0.0436|0.0881 x 0.70|0.75
 *  upsRack2U(name)                   0.4826 x 0.0881 x 0.60   LCD load/battery
 *  placeInRack(rack, device, uBottom) mounts any rack device into a rack42U()/wallRack() group (U1 = bottom).
 *
 * CABINETS:
 *  rack42U(name, {width:0.6|0.8, depth:1.0|1.2, glassDoor=true, populated?:'server'|'network'|'idf',
 *                 doorOpen=0.45 rad, sidePanels=true})   W x 2.045 x D. Door is a child Group
 *                 `${name}_door` pivoting on its hinge (viewer's left = +X) — animate door.rotation.y (negative = open).
 *  wallRack(name, {u:9|12})          0.60 x (u*0.0445+0.11) x 0.45   wall-mount IDF cabinet (origin back = wall)
 *
 * WIRELESS / ACCESS:
 *  ceilingAP(name)        Ø0.20 x 0.039     [origin: TOP-centre, hangs down to y=-0.039] LED ring underneath
 *  wallAP(name)           0.086 x 0.150 x 0.03   wall-plate AP (back on wall)
 *  ont(name)              0.18 x 0.032 x 0.13 (+pigtail)   desk ONT with LEDs, yellow fibre pigtail out the back
 *  odpBox(name)           0.24 x 0.32 x 0.09    wall/pole ODP fibre box with drop cables below
 *  upsTower(name)         0.17 x 0.25 x 0.42    LCD load/battery
 *
 * TOOLS (origin bottom-centre, lying flat, length along X unless noted):
 *  crimpingTool 0.20 L · lanTester (main + remote) 0.24 x 0.03 x 0.07 · rj45Bag 0.14 x 0.02 x 0.15 ·
 *  utpBox 0.36 x 0.36 x 0.21 (+cable on floor, origin bottom-centre-back) · cableReel Ø0.30 x 0.20 (axis X, standing) ·
 *  punchDownTool 0.21 L · cableStripper 0.15 L · multimeter 0.09 x 0.04 x 0.18 (+leads) · keystoneJacks(name,n=6) ·
 *  wireTray 0.28 x 0.045 x 0.18 parts organiser · esdMat(name,{w=0.6,d=0.5,color='blue'|'green'})
 *
 * WORKSTATION / ROOM:
 *  monitor(name,{screen:'winbox'|'terminal'|'topology'})  0.54 x 0.45 x 0.18 (24")   pcTower 0.20 x 0.42 x 0.42
 *  keyboard 0.44 x 0.03 x 0.14 · mouse 0.065 x 0.038 x 0.11 · laptop(name,{screen}) 0.33 x 0.24 x 0.30 open
 *  deskPhone 0.20 x 0.10 x 0.20 (VoIP) · wallNetworkOutlet(name,{cable=true}) 0.086 x 0.086 x 0.01 (+cord to floor)
 *  cableTray(name,{length=3,width=0.3,cables=true}) [origin: bottom-centre, length along X]  · floorBox 0.16 x 0.10 x 0.16
 *  nocVideoWall(name,{stand=true}) 2x2 55" (2.45 x 2.27 x 0.45)   apar(name,{bracket=false}) Ø0.15 x 0.56
 *  signPlate(name,{kind:'k3'|'apar'|'electric'|'nofood'|'server'|'custom', text?, w=0.30, h=0.20}) (back on wall)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- constants
export const RACK_U = 0.04445;
export const RACK_EAR_W = 0.4826;
export const RACK_BODY_W = 0.44;
const U1H = RACK_U - 0.0008; // real device height of 1U
const FONT = 'Arial, Helvetica, "DejaVu Sans", sans-serif';
const MONO = '"DejaVu Sans Mono", Consolas, "Courier New", monospace';

// ---------------------------------------------------------------- deterministic rng
let _seed = 20261027;
const rnd = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };
const reseed = (s: number) => { _seed = s; };

// ---------------------------------------------------------------- materials (module-wide cache)
export const blinkMats: THREE.MeshStandardMaterial[] = [];
const matCache = new Map<string, THREE.Material>();
function sm(key: string, p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) { m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...p }); m.name = 'nd_' + key; matCache.set(key, m); }
  return m;
}
function pm(key: string, p: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  let m = matCache.get(key) as THREE.MeshPhysicalMaterial | undefined;
  if (!m) { m = new THREE.MeshPhysicalMaterial(p); m.name = 'nd_' + key; matCache.set(key, m); }
  return m;
}
const MT = {
  get chassis() { return sm('chassis', { color: '#2a2d31', metalness: 0.3, roughness: 0.55 }); },
  get chassisLight() { return sm('chassisL', { color: '#b9bec3', metalness: 0.25, roughness: 0.5 }); },
  get chassisMid() { return sm('chassisM', { color: '#3b4046', metalness: 0.3, roughness: 0.55 }); },
  get rack() { return sm('rack', { color: '#1b1d20', metalness: 0.35, roughness: 0.62 }); },
  get rackEdge() { return sm('rackE', { color: '#26292d', metalness: 0.4, roughness: 0.5 }); },
  get zinc() { return sm('zinc', { color: '#bfc5ca', metalness: 0.8, roughness: 0.32 }); },
  get steel() { return sm('steel', { color: '#8e969d', metalness: 0.85, roughness: 0.3 }); },
  get steelDark() { return sm('steelD', { color: '#4a5056', metalness: 0.8, roughness: 0.35 }); },
  get chrome() { return sm('chrome', { color: '#e3e6e8', metalness: 1, roughness: 0.15 }); },
  get galv() { return sm('galv', { color: '#a9b0b4', metalness: 0.75, roughness: 0.45 }); },
  get black() { return sm('black', { color: '#141618', roughness: 0.55 }); },
  get rubber() { return sm('rubber', { color: '#1d1f21', roughness: 0.9 }); },
  get hole() { return sm('hole', { color: '#050506', roughness: 1 }); },
  get plasticW() { return sm('plasW', { color: '#eceeef', roughness: 0.45 }); },
  get plasticG() { return sm('plasG', { color: '#9aa1a8', roughness: 0.5 }); },
  get plasticD() { return sm('plasD', { color: '#2b2e33', roughness: 0.5 }); },
  get gold() { return sm('gold', { color: '#d9b45a', metalness: 1, roughness: 0.3 }); },
  get copper() { return sm('copper', { color: '#c7743f', metalness: 1, roughness: 0.35 }); },
  get red() { return sm('red', { color: '#c8282b', roughness: 0.35 }); },
  get redGloss() { return sm('redG', { color: '#d0191c', roughness: 0.22, metalness: 0.1 }); },
  get yellow() { return sm('yellow', { color: '#f0b81a', roughness: 0.45 }); },
  get blue() { return sm('blue', { color: '#1f5fbf', roughness: 0.45 }); },
  get orange() { return sm('orange', { color: '#e8701a', roughness: 0.45 }); },
  get wood() { return sm('wood', { color: '#b88a58', roughness: 0.8 }); },
  get cardboard() { return sm('card', { color: '#b98d5a', roughness: 0.95 }); },
  get clear() { return pm('clear', { color: '#e8f4ff', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false }); },
  get bag() { return pm('bag', { color: '#f2f8ff', roughness: 0.25, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }); },
  get glass() { return pm('glass', { color: '#6f8a99', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }); },
  get screenOff() { return sm('scrOff', { color: '#07090b', roughness: 0.18, metalness: 0.2 }); },
  get ledG() { const m = sm('ledG', { color: '#1d3', emissive: '#22ff55', emissiveIntensity: 1.6 }); return m; },
  get ledB() { return sm('ledB', { color: '#28f', emissive: '#3a8bff', emissiveIntensity: 1.8 }); },
  get ledR() { return sm('ledR', { color: '#f22', emissive: '#ff2a2a', emissiveIntensity: 1.6 }); },
};
const CORD: Record<string, string> = { blue: '#1d63c9', yellow: '#f0c020', red: '#cf2e2a', green: '#2b9a48', grey: '#8e959c', white: '#e6e8ea', black: '#1a1b1d', orange: '#ee7d1f', fiber: '#f3d21c', aqua: '#1fb5c9', purple: '#7b3fb5' };
const cordMat = (c: string) => sm('cord_' + c, { color: CORD[c] ?? c, roughness: 0.5 });

// ---------------------------------------------------------------- canvas painter
type DrawFn = (p: Painter) => void;
class Painter {
  g: CanvasRenderingContext2D; e: CanvasRenderingContext2D | null = null; eUsed = false;
  constructor(public cv: HTMLCanvasElement, public ecv: HTMLCanvasElement | null, public S: number, public Wm: number, public Hm: number) {
    this.g = cv.getContext('2d')!;
    if (ecv) { this.e = ecv.getContext('2d')!; this.e.fillStyle = '#000'; this.e.fillRect(0, 0, ecv.width, ecv.height); }
  }
  X(u: number) { return u * this.S; }
  Y(v: number) { return (this.Hm - v) * this.S; }
  fill(c: string) { this.g.fillStyle = c; this.g.fillRect(0, 0, this.cv.width, this.cv.height); }
  rect(u: number, v: number, w: number, h: number, c: string | CanvasGradient, ctx = this.g) { ctx.fillStyle = c; ctx.fillRect(this.X(u), this.Y(v + h), w * this.S, h * this.S); }
  srect(u: number, v: number, w: number, h: number, c: string, lw = 0.0004) { const g = this.g; g.strokeStyle = c; g.lineWidth = Math.max(1, lw * this.S); g.strokeRect(this.X(u), this.Y(v + h), w * this.S, h * this.S); }
  rrect(u: number, v: number, w: number, h: number, r: number, c: string | CanvasGradient, ctx = this.g, stroke = false) {
    const x = this.X(u), y = this.Y(v + h), W = w * this.S, H = h * this.S, R = Math.min(r * this.S, W / 2, H / 2);
    ctx.beginPath(); ctx.moveTo(x + R, y); ctx.arcTo(x + W, y, x + W, y + H, R); ctx.arcTo(x + W, y + H, x, y + H, R); ctx.arcTo(x, y + H, x, y, R); ctx.arcTo(x, y, x + W, y, R); ctx.closePath();
    if (stroke) { ctx.strokeStyle = c as string; ctx.lineWidth = Math.max(1, 0.0005 * this.S); ctx.stroke(); } else { ctx.fillStyle = c; ctx.fill(); }
  }
  vgrad(v0: number, v1: number, c0: string, c1: string) { const gr = this.g.createLinearGradient(0, this.Y(v0), 0, this.Y(v1)); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
  text(t: string, u: number, v: number, size: number, c: string, align: CanvasTextAlign = 'left', weight = 'bold', font = FONT, ctx = this.g) {
    ctx.font = `${weight} ${Math.max(6, size * this.S)}px ${font}`; ctx.fillStyle = c; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, this.X(u), this.Y(v));
  }
  circle(u: number, v: number, r: number, c: string | CanvasGradient, ctx = this.g) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(this.X(u), this.Y(v), Math.max(0.6, r * this.S), 0, Math.PI * 2); ctx.fill(); }
  ring(u: number, v: number, r: number, c: string, lw: number, ctx = this.g) { ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, lw * this.S); ctx.beginPath(); ctx.arc(this.X(u), this.Y(v), r * this.S, 0, Math.PI * 2); ctx.stroke(); }
  line(pts: [number, number][], c: string, lw: number, ctx = this.g) { ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, lw * this.S); ctx.beginPath(); pts.forEach(([u, v], i) => i ? ctx.lineTo(this.X(u), this.Y(v)) : ctx.moveTo(this.X(u), this.Y(v))); ctx.stroke(); }
  /** LED: lit = draws bright dot on map + glow on emissive map */
  led(u: number, v: number, r: number, c: string, lit = true, square = false) {
    if (square) this.rect(u - r, v - r * 0.7, r * 2, r * 1.4, lit ? c : '#2c2f2c'); else this.circle(u, v, r, lit ? c : '#2c2f2c');
    if (lit) {
      this.circle(u - r * 0.25, v + r * 0.25, r * 0.4, 'rgba(255,255,255,0.75)');
      if (this.e) { this.eUsed = true; const e = this.e; const gr = e.createRadialGradient(this.X(u), this.Y(v), 0, this.X(u), this.Y(v), r * 2.2 * this.S); gr.addColorStop(0, c); gr.addColorStop(0.45, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); e.fillStyle = gr; e.beginPath(); e.arc(this.X(u), this.Y(v), r * 2.2 * this.S, 0, 7); e.fill(); }
    }
  }
  /** self-lit rectangle (LCD, screen) — drawn to both map and emissive map with given strength 0..1 */
  glowRect(u: number, v: number, w: number, h: number, c: string, k = 1) {
    this.rect(u, v, w, h, c);
    if (this.e) { this.eUsed = true; this.e.globalAlpha = k; this.rect(u, v, w, h, c, this.e); this.e.globalAlpha = 1; }
  }
  /** copy the whole map to the emissive map (screens) */
  emitAll(k = 1) { if (!this.e) return; this.eUsed = true; this.e.globalAlpha = k; this.e.drawImage(this.cv, 0, 0); this.e.globalAlpha = 1; }
  noise(n: number, a: number, light = false) { const g = this.g; for (let i = 0; i < n; i++) { const v = light ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${rnd() * a})`; g.fillRect(rnd() * this.cv.width, rnd() * this.cv.height, 1 + rnd() * 2, 1 + rnd() * 2); } }
  /** RJ45 jack seen from the front. flip=true -> latch notch at top (bottom-row jacks of a switch) */
  rj45(u: number, v: number, w: number, h: number, flip = false, shield = '#a7aeb5', cavity = '#0b0c0d') {
    if (shield) { this.rect(u, v, w, h, shield); this.rect(u, v + h - h * 0.08, w, h * 0.08, 'rgba(255,255,255,0.35)'); this.rect(u, v, w, h * 0.08, 'rgba(0,0,0,0.35)'); }
    const ix = u + w * 0.1, iw = w * 0.8, iy = v + h * 0.12, ih = h * 0.76;
    const nh = ih * 0.28, nw = iw * 0.42;
    // main cavity (body) + latch notch
    const bodyV = flip ? iy : iy + nh;
    this.rect(ix, bodyV, iw, ih - nh, cavity);
    this.rect(u + w / 2 - nw / 2, flip ? iy + ih - nh : iy, nw, nh + 0.0002, cavity);
    // depth shading
    this.rect(ix, bodyV + (ih - nh) * 0.55, iw, (ih - nh) * 0.45, 'rgba(255,255,255,0.05)');
    // 8 gold contacts on the side opposite to the notch
    const cy = flip ? bodyV + 0.0002 : bodyV + (ih - nh) - 0.0018;
    for (let k = 0; k < 8; k++) this.rect(ix + iw * (0.12 + k * 0.105), cy, iw * 0.045, 0.0016, '#d8b04a');
  }
  sfp(u: number, v: number, w: number, h: number) {
    this.rect(u, v, w, h, '#b9c0c6'); this.rect(u + w * 0.08, v + h * 0.15, w * 0.84, h * 0.7, '#0c0d0e');
    this.rect(u + w * 0.08, v + h * 0.15, w * 0.84, h * 0.12, '#30343a');
  }
  screw(u: number, v: number, r: number) { this.circle(u, v, r, '#8b939a'); this.circle(u, v, r * 0.8, '#c6ccd1'); this.line([[u - r * 0.6, v], [u + r * 0.6, v]], '#4c5258', r * 0.25); this.line([[u, v - r * 0.6], [u, v + r * 0.6]], '#4c5258', r * 0.25); }
  vents(u: number, v: number, w: number, h: number, sw: number, sh: number, gap: number, c = '#0d0e10') { for (let y = v; y + sh <= v + h + 1e-6; y += sh + gap) for (let x = u; x + sw <= u + w + 1e-6; x += sw + gap) this.rrect(x, y, sw, sh, Math.min(sw, sh) / 2, c); }
  hexGrid(u: number, v: number, w: number, h: number, r: number, c: string) { const g = this.g; g.fillStyle = c; const dx = r * 1.9, dy = r * 1.65; let row = 0; for (let y = v + r; y < v + h - r * 0.5; y += dy, row++) for (let x = u + r + (row % 2) * dx / 2; x < u + w - r * 0.5; x += dx) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; const px = this.X(x + Math.cos(a) * r * 0.82), py = this.Y(y + Math.sin(a) * r * 0.82); k ? g.lineTo(px, py) : g.moveTo(px, py); } g.fill(); } }
}

const texCache = new Map<string, { map: THREE.CanvasTexture; emi: THREE.CanvasTexture | null }>();
function canvasPair(key: string, Wm: number, Hm: number, S: number, draw: DrawFn, emissive = true, repeat = false) {
  let t = texCache.get(key);
  if (t) return t;
  const w = Math.max(4, Math.round(Wm * S)), h = Math.max(4, Math.round(Hm * S));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ecv = emissive ? document.createElement('canvas') : null; if (ecv) { ecv.width = w; ecv.height = h; }
  const p = new Painter(cv, ecv, S, Wm, Hm);
  draw(p);
  const mk = (c: HTMLCanvasElement, srgb: boolean) => { const tx = new THREE.CanvasTexture(c); if (srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; if (repeat) tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; return tx; };
  t = { map: mk(cv, true), emi: ecv && p.eUsed ? mk(ecv, true) : null };
  texCache.set(key, t);
  return t;
}
/** cached textured material. Wm,Hm = physical size of the decal in metres, S = px per metre */
function decalMat(key: string, Wm: number, Hm: number, S: number, draw: DrawFn, o: { rough?: number; metal?: number; emi?: number; blink?: boolean; transparent?: boolean; alphaTest?: number; repeat?: boolean; side?: THREE.Side; color?: string } = {}) {
  let m = matCache.get('decal_' + key) as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  const t = canvasPair(key, Wm, Hm, S, draw, true, o.repeat);
  m = new THREE.MeshStandardMaterial({ map: t.map, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.2, color: o.color ?? '#ffffff', transparent: o.transparent ?? false, alphaTest: o.alphaTest ?? 0, side: o.side ?? THREE.FrontSide });
  if (t.emi) { m.emissiveMap = t.emi; m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = o.emi ?? 1.2; if (o.blink !== false) blinkMats.push(m); }
  m.name = 'nd_decal_' + key;
  matCache.set('decal_' + key, m);
  return m;
}

// ---------------------------------------------------------------- geometry builder (merge per material)
export type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };
type Face = '-z' | '+z' | '+y' | '-y' | '+x' | '-x';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)); }

class B {
  buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  get M() { return this.stack[this.stack.length - 1]; }
  push(m: THREE.Matrix4) { this.stack.push(this.M.clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  at(m: THREE.Matrix4, fn: () => void) { this.push(m); fn(); this.pop(); }
  geo(g: THREE.BufferGeometry, mat: THREE.Material, local?: THREE.Matrix4) {
    let gg = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    if (!gg.attributes.normal) gg.computeVertexNormals();
    gg.morphAttributes = {};
    const full = local ? this.M.clone().multiply(local) : this.M;
    gg.applyMatrix4(full);
    let arr = this.buckets.get(mat); if (!arr) { arr = []; this.buckets.set(mat, arr); }
    arr.push(gg);
    return gg;
  }
  /** box: (x,z) centre, y = bottom */
  box(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, uvScale?: [number, number]) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uvScale) scaleUV(g, uvScale[0], uvScale[1]);
    return this.geo(g, mat, _m.makeTranslation(x, y + h / 2, z).clone());
  }
  /** box rotated (centre x,y,z) */
  boxR(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
    return this.geo(new THREE.BoxGeometry(w, h, d), mat, T(x, y, z, rx, ry, rz));
  }
  /** plane centred at x,y,z facing `face` */
  plane(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, face: Face = '-z', uv?: [number, number, number, number]) {
    const g = new THREE.PlaneGeometry(w, h);
    if (uv) { const a = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1])); }
    const r: Record<Face, [number, number]> = { '+z': [0, 0], '-z': [0, Math.PI], '+x': [0, Math.PI / 2], '-x': [0, -Math.PI / 2], '+y': [-Math.PI / 2, 0], '-y': [Math.PI / 2, 0] };
    const [rx, ry] = r[face];
    return this.geo(g, mat, T(x, y, z, rx, ry, 0));
  }
  /** cylinder centred at (x,y,z) along axis */
  cyl(mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, axis: 'x' | 'y' | 'z' = 'y', seg = 16, rTop?: number, open = false, theta0 = 0, thetaL = Math.PI * 2) {
    const g = new THREE.CylinderGeometry(rTop ?? r, r, h, seg, 1, open, theta0, thetaL);
    const rot = axis === 'y' ? T(x, y, z) : axis === 'x' ? T(x, y, z, 0, 0, -Math.PI / 2) : T(x, y, z, Math.PI / 2, 0, 0);
    return this.geo(g, mat, rot);
  }
  sphere(mat: THREE.Material, x: number, y: number, z: number, r: number, sx = 1, sy = 1, sz = 1, ws = 16, hs = 10, phiL = Math.PI * 2, thetaL = Math.PI) {
    const g = new THREE.SphereGeometry(r, ws, hs, 0, phiL, 0, thetaL); g.scale(sx, sy, sz);
    return this.geo(g, mat, T(x, y, z));
  }
  torus(mat: THREE.Material, x: number, y: number, z: number, R: number, r: number, rx = 0, ry = 0, seg = 24, arc = Math.PI * 2) {
    return this.geo(new THREE.TorusGeometry(R, r, 6, seg, arc), mat, T(x, y, z, rx, ry, 0));
  }
  tube(mat: THREE.Material, pts: THREE.Vector3[], r: number, segs = 24, radial = 6, tension = 0.5) {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', tension);
    return this.geo(new THREE.TubeGeometry(c, segs, r, radial, false), mat);
  }
  /** flat extrusion: shape in (x, -z) plane, extruded upward from y0 by depth */
  flat(mat: THREE.Material, shape: THREE.Shape, y0: number, depth: number, bevel = 0, curveSeg = 8) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, depth - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: curveSeg });
    g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0);
    return this.geo(g, mat);
  }
  /** side extrusion: shape in (forward=-z, up=y) profile, extruded along +X from x0 */
  side(mat: THREE.Material, shape: THREE.Shape, x0: number, width: number, bevel = 0) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, width - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8 });
    g.rotateY(Math.PI / 2); // shape x -> -z, extrusion -> +x
    g.translate(x0 + bevel, 0, 0);
    return this.geo(g, mat);
  }
  lathe(mat: THREE.Material, pts: [number, number][], x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', seg = 16) {
    const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
    const rot = axis === 'y' ? T(x, y, z) : axis === 'x' ? T(x, y, z, 0, 0, -Math.PI / 2) : T(x, y, z, Math.PI / 2, 0, 0);
    return this.geo(g, mat, rot);
  }
  /** include already-built parts with a transform */
  parts(parts: Part[], m: THREE.Matrix4) {
    const full = this.M.clone().multiply(m);
    for (const p of parts) { const g = p.geo.clone(); g.applyMatrix4(full); let arr = this.buckets.get(p.mat); if (!arr) { arr = []; this.buckets.set(p.mat, arr); } arr.push(g); }
  }
  build(): Part[] {
    const out: Part[] = [];
    for (const [mat, arr] of this.buckets) {
      const g = arr.length === 1 ? arr[0] : mergeGeometries(arr, false);
      if (!g) continue; g.computeBoundingSphere(); g.computeBoundingBox(); out.push({ geo: g, mat });
    }
    // opaque first, transparent last
    out.sort((a, b) => Number(a.mat.transparent) - Number(b.mat.transparent));
    return out;
  }
}
function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) { const a = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv); }

const partCache = new Map<string, Part[]>();
function cached(key: string, fn: (b: B) => void): Part[] {
  let p = partCache.get(key);
  if (!p) { const b = new B(); reseed(hash(key)); fn(b); p = b.build(); partCache.set(key, p); }
  return p;
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (Math.abs(h) % 2147483646) + 1; }
function inst(name: string, parts: Part[], ud: Record<string, unknown> = {}) {
  const g = new THREE.Group(); g.name = name;
  parts.forEach((p, i) => {
    const m = new THREE.Mesh(p.geo, p.mat); m.name = `${name}_${(p.mat.name || 'm').replace('nd_', '')}`;
    m.castShadow = !p.mat.transparent; m.receiveShadow = true; g.add(m);
  });
  g.userData = { ...ud };
  return g;
}
/** triangle count of a group (for budgets) */
export function triCount(o: THREE.Object3D) { let n = 0; o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** cylinder from point a to point b (radius ra at a, rb at b) */
function rod(b: B, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, ra: number, rb: number, seg = 8) {
  const d = c.clone().sub(a), L = d.length(); const g = new THREE.CylinderGeometry(rb, ra, L, seg); g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.geo(g, mat, new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
}
function rrShape(x0: number, y0: number, w: number, h: number, r: number) {
  const s = new THREE.Shape(); r = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0); return s;
}
function rrPath(x0: number, y0: number, w: number, h: number, r: number) { const s = rrShape(x0, y0, w, h, r); const p = new THREE.Path(s.getPoints(4)); return p; }

// =================================================================================================
// 19" RACK DEVICES
// =================================================================================================
type RackOpts = { full?: boolean; handles?: boolean; body?: THREE.Material; earMat?: THREE.Material; noBody?: boolean };
/**
 * Generic 19" chassis. Panel decal covers the 0.436 body face (or the full 0.4826 incl. ears when full=true).
 * Local frame: back at z=0, ear plane at z=-D.
 */
function rackChassis(b: B, U: number, D: number, panel: THREE.Material, o: RackOpts = {}) {
  const H = U * RACK_U - 0.0008;
  const body = o.body ?? MT.chassis, ear = o.earMat ?? body;
  if (!o.noBody) b.box(body, 0, 0, (-D + 0.0025) / 2, RACK_BODY_W, H, D - 0.0025);
  for (const s of [-1, 1]) {
    b.box(ear, s * 0.23065, 0, -D + 0.00125, 0.0213, H, 0.0025);              // ear plate
    b.box(ear, s * 0.2208, 0.003, -D + 0.018, 0.0016, H - 0.006, 0.03);        // ear flange along the body side
    // mounting screws: lowest and highest hole
    for (const y of [0.00635, H - 0.0059]) { b.cyl(MT.chrome, s * 0.2325, y, -D - 0.0012, 0.0036, 0.0024, 'z', 12); b.box(MT.steelDark, s * 0.2325, y - 0.0003, -D - 0.0025, 0.0042, 0.0006, 0.0003); }
    if (o.handles) {
      const hx = s * 0.2335, y0 = Math.min(0.008, H * 0.2), y1 = H - y0;
      b.cyl(MT.steelDark, hx, y0, -D - 0.012, 0.0032, 0.024, 'z', 8); b.cyl(MT.steelDark, hx, y1, -D - 0.012, 0.0032, 0.024, 'z', 8);
      b.cyl(MT.chrome, hx, (y0 + y1) / 2, -D - 0.024, 0.0045, y1 - y0 + 0.006, 'y', 10);
    }
  }
  const pw = o.full ? RACK_EAR_W : 0.436;
  b.plane(panel, 0, H / 2, -D - 0.0004, pw, H, '-z');
  if (!o.full) { // crisp top/bottom lips -> reads as a bevel
    b.box(MT.chassisMid, 0, H - 0.0011, -D - 0.0006, 0.436, 0.0011, 0.0016);
    b.box(MT.chassisMid, 0, 0, -D - 0.0006, 0.436, 0.0011, 0.0016);
  }
  // top cover seam lines (read as panels when viewed from above)
  if (!o.noBody) { b.box(MT.hole, 0, H - 0.0001, -D + 0.08, RACK_BODY_W - 0.004, 0.0003, 0.0012); b.box(MT.hole, 0, H - 0.0001, -D * 0.55, RACK_BODY_W - 0.004, 0.0003, 0.0012); }
  return H;
}
const plateBg = (p: Painter, c: string) => { p.fill(c); p.noise(Math.round(p.cv.width * p.cv.height / 30), 0.05); p.noise(Math.round(p.cv.width * p.cv.height / 60), 0.04, true); };
const earSlots = (p: Painter, H: number) => { for (const u of [0.0088, RACK_EAR_W - 0.0088]) for (const v of [0.00635, H - 0.00635]) p.rrect(u - 0.0045, v - 0.0026, 0.009, 0.0052, 0.0026, '#050505'); };

// ---------- switch ----------
/** port rect (panel u from viewer-left, v from bottom) on the 0.436 switch face */
function swPort(i: number) { const col = Math.floor(i / 2), row = i % 2; return { u: 0.118 + col * 0.0145 + (col >= 6 ? 0.007 : 0), v: row === 0 ? 0.0232 : 0.0072, w: 0.0128, h: 0.0128, flip: row === 0 }; }
function switchPanel(managed: boolean) {
  return decalMat(managed ? 'sw_m' : 'sw_u', 0.436, U1H, 4200, p => {
    const dark = managed; const H = U1H;
    plateBg(p, dark ? '#25282c' : '#c7ccd1');
    p.rect(0, H - 0.0012, 0.436, 0.0012, dark ? '#3a3e44' : '#e2e5e8');
    const txt = dark ? '#e9ecef' : '#1c2024', sub = dark ? '#9aa3ab' : '#4b535a';
    p.text('NusaSwitch', 0.006, 0.0265, 0.0058, txt, 'left', 'bold');
    p.text(managed ? 'SG-2428M' : 'SG-1024D', 0.006, 0.0195, 0.0036, sub, 'left', 'bold');
    p.text(managed ? 'L2+ Managed' : 'Unmanaged', 0.006, 0.0138, 0.0028, sub, 'left', 'normal');
    p.rect(0.006, 0.0085, 0.044, 0.0009, '#2b8fd6');
    const sys: [string, string][] = [['PWR', '#3dff6a'], ['SYS', '#3dff6a'], ['FAN', managed ? '#3dff6a' : '#3dff6a']];
    sys.forEach(([l, c], k) => { const v = 0.033 - k * 0.0095; p.led(0.0605, v, 0.0011, c, true); p.text(l, 0.0632, v - 0.0009, 0.0027, sub, 'left', 'bold'); });
    if (managed) {
      p.text('CONSOLE', 0.0960, 0.0352, 0.0024, sub, 'center', 'bold');
      p.rj45(0.0896, 0.0175, 0.0128, 0.0128, true, '#4b8fd0');
      p.circle(0.096, 0.011, 0.0011, '#060606'); p.text('RST', 0.096, 0.0057, 0.0022, sub, 'center', 'bold');
    }
    // port block frames
    for (const [u0, u1] of [[0.1155, 0.2075], [0.2145, 0.3065]]) p.rrect(u0, 0.0055, u1 - u0, 0.0328, 0.0008, dark ? '#16181b' : '#9da4ab');
    for (let i = 0; i < 24; i++) {
      const q = swPort(i); p.rj45(q.u, q.v, q.w, q.h, q.flip);
      const lv = q.flip ? q.v + q.h + 0.0012 : q.v - 0.0011;
      const link = rnd() < 0.9, act = link && rnd() < 0.55;
      p.led(q.u + 0.0022, lv, 0.00075, '#38ff5c', link, true); p.led(q.u + q.w - 0.0022, lv, 0.00075, '#ffb020', act, true);
      if (q.flip) p.text(String(i + 1), q.u + q.w / 2, 0.0207, 0.0021, dark ? '#c3c9ce' : '#2a2e33', 'center', 'bold');
      else p.text(String(i + 1), q.u + q.w / 2, 0.0005 + 0.0024, 0.0021, dark ? '#c3c9ce' : '#2a2e33', 'center', 'bold');
    }
    // SFP
    p.text('SFP 25-28', 0.334, 0.0372, 0.0026, sub, 'center', 'bold');
    for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) { const u = 0.318 + c * 0.0168, v = r ? 0.0072 : 0.0218; p.sfp(u, v, 0.0148, 0.0118); p.led(u + 0.0074, r ? v - 0.001 : v + 0.0128, 0.0007, '#38ff5c', c + r < 2, true); }
    // legend + model badge
    p.text(managed ? '24-Port Gigabit' : '24-Port Gigabit', 0.428, 0.0302, 0.0032, txt, 'right', 'bold');
    p.text(managed ? 'Managed Switch' : 'Desktop/Rack Switch', 0.428, 0.0252, 0.0026, sub, 'right', 'normal');
    p.led(0.364, 0.0135, 0.0008, '#38ff5c', true, true); p.text('1000M LINK/ACT', 0.3665, 0.0127, 0.0022, sub, 'left', 'bold');
    p.led(0.364, 0.0085, 0.0008, '#ffb020', true, true); p.text('10/100M', 0.3665, 0.0077, 0.0022, sub, 'left', 'bold');
    p.text('PoE+', 0.428, 0.0077, 0.0026, '#f0a020', 'right', 'bold');
  }, { metal: 0.35, rough: 0.5, emi: 1.4 });
}
function switchParts(managed = true) {
  return cached('switch24_' + managed, b => {
    const D = 0.25;
    rackChassis(b, 1, D, switchPanel(managed), { body: managed ? MT.chassis : MT.chassisLight });
    // rear: power inlet + fan grille
    b.box(MT.black, 0.17, 0.008, 0.0006, 0.028, 0.02, 0.0015);
    b.cyl(MT.hole, -0.15, 0.0218, 0.0005, 0.016, 0.0012, 'z', 20);
  });
}
export function switch24(name: string, managed = true) {
  return inst(name, switchParts(managed), { kind: 'switch24', size: [RACK_EAR_W, U1H, 0.25], frontZ: -0.25, u: 1, managed });
}

// ---------- router ----------
function rtPort(i: number) { return { u: 0.094 + i * 0.0152, v: 0.0142, w: 0.0134, h: 0.0128 }; }
function routerParts() {
  return cached('router1U', b => {
    const D = 0.23;
    const panel = decalMat('router', 0.436, U1H, 4200, p => {
      const H = U1H; plateBg(p, '#d3d7da');
      p.rect(0, H - 0.0012, 0.436, 0.0012, '#eef0f2');
      p.rrect(0.004, 0.004, 0.282, 0.0356, 0.001, '#2a2e33');
      // colour LCD
      p.rrect(0.008, 0.0085, 0.040, 0.0265, 0.0008, '#0d0f12');
      p.glowRect(0.0095, 0.010, 0.037, 0.0235, '#0b2a4a', 0.9);
      p.glowRect(0.0095, 0.0285, 0.037, 0.005, '#2a6fd1', 1);
      p.text('NusaRouter', 0.0105, 0.0297, 0.0034, '#ffffff', 'left', 'bold', FONT, p.g); if (p.e) p.text('NusaRouter', 0.0105, 0.0297, 0.0034, '#ffffff', 'left', 'bold', FONT, p.e);
      const lines: [string, string][] = [['CPU  7%', '#7cf3a8'], ['TEMP 41°C', '#ffd36a'], ['UP 12d 04h', '#cfe3ff'], ['ether1  1G', '#7cf3a8']];
      lines.forEach(([t, c], k) => { p.text(t, 0.0105, 0.0245 - k * 0.0042, 0.0031, c, 'left', 'bold', MONO, p.g); if (p.e) p.text(t, 0.0105, 0.0245 - k * 0.0042, 0.0031, c, 'left', 'bold', MONO, p.e); });
      // usb + console
      p.text('USB', 0.0585, 0.031, 0.0024, '#aab2b9', 'center'); p.rect(0.0525, 0.0218, 0.012, 0.0052, '#9aa1a8'); p.rect(0.0535, 0.0228, 0.010, 0.002, '#101112');
      p.text('SERIAL', 0.0775, 0.031, 0.0024, '#aab2b9', 'center'); p.rj45(0.0710, 0.0142, 0.0128, 0.0128, false, '#4b8fd0');
      for (let i = 0; i < 10; i++) {
        const q = rtPort(i); p.rj45(q.u, q.v, q.w, q.h, false);
        p.led(q.u + 0.0025, q.v + q.h + 0.0016, 0.0008, '#38ff5c', i < 6 || i === 8, true);
        p.led(q.u + q.w - 0.0025, q.v + q.h + 0.0016, 0.0008, '#ffb020', i % 3 === 0, true);
        p.text(String(i + 1), q.u + q.w / 2, 0.0087, 0.0026, '#d7dce0', 'center');
      }
      p.text('ether1 = WAN', 0.094, 0.0055, 0.0022, '#f0a020', 'left', 'bold');
      p.sfp(0.250, 0.0152, 0.0158, 0.0118); p.text('SFP+', 0.258, 0.0087, 0.0026, '#d7dce0', 'center'); p.led(0.258, 0.0295, 0.0008, '#38ff5c', true, true);
      p.text('NusaRouter', 0.300, 0.0232, 0.0078, '#1f2429', 'left', 'bold');
      p.text('CR-1009  Cloud Router · 9x GbE + SFP+', 0.300, 0.0148, 0.0028, '#4a535b', 'left', 'normal');
      p.rect(0.300, 0.0108, 0.11, 0.0008, '#c8282b');
      [['PWR', '#38ff5c'], ['FAN', '#38ff5c'], ['USR', '#3a8bff']].forEach(([l, c], k) => { p.led(0.304 + k * 0.016, 0.0058, 0.0009, c, true); p.text(l, 0.307 + k * 0.016, 0.0049, 0.0024, '#4a535b', 'left'); });
    }, { metal: 0.3, rough: 0.45, emi: 1.3 });
    rackChassis(b, 1, D, panel, { body: MT.chassisLight });
    b.box(MT.black, 0.17, 0.008, 0.0006, 0.028, 0.02, 0.0015);
  });
}
export function router1U(name: string) { return inst(name, routerParts(), { kind: 'router1U', size: [RACK_EAR_W, U1H, 0.23], frontZ: -0.23, u: 1 }); }

// ---------- patch panel ----------
function ppPort(i: number) { const g = Math.floor(i / 6), k = i % 6; const u = 0.0368 + g * (6 * 0.0158 + 0.010) + k * 0.0158; return { u, v: 0.0105, w: 0.0145, h: 0.0175, cu: u + 0.00725, cv: 0.0105 + 0.0025 + 0.00625 }; }
function patchParts() {
  return cached('patch24', b => {
    const D = 0.12, H = U1H;
    const panel = decalMat('patch24', RACK_EAR_W, H, 4200, p => {
      plateBg(p, '#191a1d'); earSlots(p, H);
      p.rect(0, H - 0.0009, RACK_EAR_W, 0.0009, '#2e3135');
      for (let i = 0; i < 24; i++) {
        const q = ppPort(i);
        p.rrect(q.u, q.v, q.w, q.h, 0.0012, '#d9dbdd'); p.rect(q.u, q.v + q.h - 0.002, q.w, 0.002, '#f2f3f4');
        p.rj45(q.u + 0.0011, q.v + 0.0025, 0.0123, 0.0125, false, '', '#0c0d0e');
        p.text(String(i + 1), q.u + q.w / 2, 0.0315, 0.0032, '#f1f3f5', 'center', 'bold');
      }
      for (let g = 0; g < 4; g++) { const u = 0.0368 + g * (6 * 0.0158 + 0.010); p.rect(u, 0.0035, 6 * 0.0158 - 0.0013, 0.0052, '#eceae2'); p.text(['LAB-A 01-06', 'LAB-A 07-12', 'LAB-B 13-18', 'AP / CCTV'][g], u + 0.002, 0.0048, 0.0029, '#2b4f8a', 'left', 'bold', MONO); }
      p.text('CAT6', 0.0225, 0.0365, 0.0029, '#f0a020', 'center', 'bold'); p.text('UTP', 0.4601, 0.0365, 0.0029, '#f0a020', 'center', 'bold');
    }, { metal: 0.3, rough: 0.5 });
    rackChassis(b, 1, D, panel, { full: true, noBody: true, body: MT.black });
    b.box(MT.black, 0, 0, -D + 0.00125, 0.44, H, 0.0025);
    // rear keystone/IDC block + cable support bar
    for (let g = 0; g < 4; g++) { const u = 0.0368 + g * (6 * 0.0158 + 0.010) + 3 * 0.0158; b.box(MT.plasticW, RACK_EAR_W / 2 - u, 0.009, -D + 0.0025 + 0.017, 6 * 0.0158 - 0.002, 0.024, 0.034); b.box(MT.blue, RACK_EAR_W / 2 - u, 0.033, -D + 0.022, 6 * 0.0158 - 0.004, 0.002, 0.02); }
    b.box(MT.rack, 0, 0.0, -0.01, 0.43, 0.004, 0.02); b.box(MT.rack, 0.205, 0, -D / 2, 0.003, 0.012, D - 0.01); b.box(MT.rack, -0.205, 0, -D / 2, 0.003, 0.012, D - 0.01);
  });
}
export function patchPanel24(name: string) { return inst(name, patchParts(), { kind: 'patchPanel24', size: [RACK_EAR_W, U1H, 0.12], frontZ: -0.12, u: 1 }); }

// ---------- cable manager ----------
function managerParts() {
  return cached('cablemgr', b => {
    const D = 0.07, H = U1H;
    const panel = decalMat('cablemgr', RACK_EAR_W, H, 3000, p => { plateBg(p, '#1a1b1e'); earSlots(p, H); p.rect(0, H - 0.0009, RACK_EAR_W, 0.0009, '#2e3135'); p.rect(0, 0, RACK_EAR_W, 0.0009, '#0e0f10'); }, { metal: 0.3 });
    b.plane(panel, 0, H / 2, -D + 0.0002 - 0.0004, RACK_EAR_W, H, '-z');
    b.box(MT.black, 0, 0, -D + 0.0012 + 0.0002, RACK_EAR_W, H, 0.0024);
    for (const s of [-1, 1]) for (const y of [0.00635, H - 0.0059]) b.cyl(MT.chrome, s * 0.2325, y, -D - 0.001, 0.0036, 0.0024, 'z', 12);
    // 5 D-rings (plastic) sticking out 6 cm in the front
    for (let k = 0; k < 5; k++) {
      const x = -0.18 + k * 0.09, f = -D - 0.058;
      b.box(MT.plasticD, x, H - 0.004, (-D + f) / 2, 0.014, 0.003, -f - D);           // top arm
      b.box(MT.plasticD, x, 0.001, (-D + f) / 2, 0.014, 0.003, -f - D);               // bottom arm
      b.box(MT.plasticD, x, 0.001, f + 0.0015, 0.014, H - 0.002, 0.003);               // front bar
      b.box(MT.plasticD, x, H * 0.5 - 0.004, -D - 0.004, 0.02, 0.008, 0.008);          // root boss
    }
    b.box(MT.rack, 0, 0, -D / 2, 0.40, 0.002, D - 0.004);
  });
}
export function cableManager1U(name: string) { return inst(name, managerParts(), { kind: 'cableManager1U', size: [RACK_EAR_W, U1H, 0.07], frontZ: -0.07, u: 1 }); }

// ---------- ODF (fibre patch panel) ----------
function odfPort(i: number) { return { u: 0.105 + i * 0.0225, v: 0.0135, w: 0.0105, h: 0.0145 }; }
function odfParts() {
  return cached('odf1U', b => {
    const D = 0.2, H = U1H;
    const panel = decalMat('odf', RACK_EAR_W, H, 4200, p => {
      plateBg(p, '#1c1e21'); earSlots(p, H);
      p.text('ODF', 0.025, 0.026, 0.0068, '#ffffff', 'left', 'bold'); p.text('12C SC/UPC', 0.025, 0.0175, 0.003, '#9aa3ab', 'left', 'bold'); p.text('FIBER OPTIC', 0.025, 0.012, 0.0026, '#f3d21c', 'left', 'bold');
      for (let i = 0; i < 12; i++) { const q = odfPort(i); p.rect(q.u - 0.003, q.v - 0.0015, q.w + 0.006, q.h + 0.003, '#0b0c0d'); p.text(String(i + 1).padStart(2, '0'), q.u + q.w / 2, 0.0335, 0.0029, '#f1f3f5', 'center', 'bold'); }
      p.text('CORE  1-12  →  OLT PON-1', 0.38, 0.0335, 0.0027, '#f3d21c', 'center', 'bold', MONO);
      p.rect(0.38 - 0.05, 0.004, 0.10, 0.006, '#eceae2'); p.text('FEEDER NSA-01', 0.38, 0.0055, 0.0029, '#2b4f8a', 'center', 'bold', MONO);
    }, { metal: 0.3 });
    rackChassis(b, 1, D, panel, { full: true, body: MT.chassis });
    for (let i = 0; i < 12; i++) {
      const q = odfPort(i), x = RACK_EAR_W / 2 - (q.u + q.w / 2), y = q.v + q.h / 2;
      b.box(MT.blue, x, y - q.h / 2, -D - 0.006, q.w, q.h, 0.012);
      b.box(MT.hole, x, y - 0.002, -D - 0.0122, 0.0045, 0.004, 0.0004);
      if (i >= 4) b.box(MT.red, x, y - 0.0035, -D - 0.0155, 0.0075, 0.007, 0.007); // dust caps on unused cores
    }
  });
}
export function odf1U(name: string) { return inst(name, odfParts(), { kind: 'odf1U', size: [RACK_EAR_W, U1H, 0.2], frontZ: -0.2, u: 1 }); }

// ---------- blanking panel ----------
function blankParts(u: number) {
  return cached('blank' + u, b => {
    const H = u * RACK_U - 0.0008;
    const panel = decalMat('blank' + u, RACK_EAR_W, H, 3000, p => { plateBg(p, '#1b1d20'); earSlots(p, H); p.vents(0.06, H * 0.25, 0.36, H * 0.5, 0.012, 0.0028, 0.0035, '#060607'); }, { metal: 0.3 });
    rackChassis(b, u, 0.012, panel, { full: true, noBody: true, body: MT.rack });
    b.box(MT.rack, 0, 0, -0.012 + 0.00125, RACK_EAR_W, H, 0.0025);
    b.box(MT.rack, 0, 0, -0.006, RACK_EAR_W - 0.01, 0.0015, 0.01);
  });
}
export function blankPanel(name: string, u = 1) { return inst(name, blankParts(u), { kind: 'blankPanel', size: [RACK_EAR_W, u * RACK_U - 0.0008, 0.012], frontZ: -0.012, u }); }

// ---------- PDU ----------
function pduParts() {
  return cached('pdu1U', b => {
    const D = 0.06, H = U1H;
    const panel = decalMat('pdu', RACK_EAR_W, H, 4200, p => {
      plateBg(p, '#17181a'); earSlots(p, H);
      p.rrect(0.026, 0.008, 0.018, 0.028, 0.002, '#0b0b0c'); p.glowRect(0.029, 0.0115, 0.012, 0.021, '#d21a1a', 0.9); p.rect(0.029, 0.022, 0.012, 0.0005, '#7a0b0b'); p.text('I', 0.035, 0.026, 0.004, '#fff', 'center'); if (p.e) p.text('I', 0.035, 0.026, 0.004, '#ffd0d0', 'center', 'bold', FONT, p.e);
      p.text('NusaPDU', 0.05, 0.026, 0.0045, '#fff', 'left'); p.text('16A 250V~', 0.05, 0.019, 0.003, '#9aa3ab', 'left'); p.text('8 OUTLET', 0.05, 0.013, 0.003, '#9aa3ab', 'left');
      for (let k = 0; k < 8; k++) {
        const cu = 0.118 + k * 0.042, cv = H / 2;
        p.rrect(cu - 0.0185, cv - 0.0185, 0.037, 0.037, 0.004, '#0a0a0b');
        p.circle(cu, cv, 0.0165, '#1e2023'); p.circle(cu, cv, 0.0148, '#121315');
        p.circle(cu - 0.0095, cv, 0.0022, '#000'); p.circle(cu + 0.0095, cv, 0.0022, '#000');
        p.rect(cu - 0.003, cv + 0.0135, 0.006, 0.0025, '#b9c0c6'); p.rect(cu - 0.003, cv - 0.016, 0.006, 0.0025, '#b9c0c6');
      }
    }, { metal: 0.25, emi: 1.4 });
    rackChassis(b, 1, D, panel, { full: true, body: MT.black });
  });
}
export function pdu1U(name: string) { return inst(name, pduParts(), { kind: 'pdu1U', size: [RACK_EAR_W, U1H, 0.06], frontZ: -0.06, u: 1 }); }

// ---------- shelf ----------
function shelfParts() {
  return cached('shelf1U', b => {
    const D = 0.35, H = U1H;
    const panel = decalMat('shelf', RACK_EAR_W, H, 3000, p => { plateBg(p, '#1b1d20'); earSlots(p, H); p.vents(0.04, 0.006, 0.40, H - 0.012, 0.0035, 0.0035, 0.0028, '#08090a'); }, { metal: 0.3 });
    // ears full 1U, front lip only 14 mm so whatever sits on the shelf stays visible
    for (const s of [-1, 1]) { b.box(MT.rack, s * 0.23065, 0, -D + 0.00125, 0.0213, H, 0.0025); b.plane(panel, s * 0.23065, H / 2, -D - 0.0004, 0.0213, H, '-z', s > 0 ? [0, 0, 0.0213 / RACK_EAR_W, 1] : [1 - 0.0213 / RACK_EAR_W, 0, 1, 1]); }
    b.box(MT.rack, 0, 0, -D + 0.00125, 0.44, 0.014, 0.0025);
    b.plane(panel, 0, 0.007, -D - 0.0004, 0.44, 0.014, '-z', [0.0213 / RACK_EAR_W, 0, 1 - 0.0213 / RACK_EAR_W, 0.014 / H]);
    for (const s of [-1, 1]) for (const y of [0.00635, H - 0.0059]) b.cyl(MT.chrome, s * 0.2325, y, -D - 0.001, 0.0036, 0.0024, 'z', 12);
    b.box(MT.rack, 0, 0, -D / 2, 0.44, 0.002, D - 0.003);                   // tray
    b.box(MT.rack, 0.2195, 0, -D / 2, 0.001, 0.025, D - 0.003); b.box(MT.rack, -0.2195, 0, -D / 2, 0.001, 0.025, D - 0.003);
    b.box(MT.rack, 0, 0, -0.008, 0.44, 0.02, 0.0015);
    for (let k = 0; k < 9; k++) b.box(MT.hole, -0.16 + k * 0.04, 0.0021, -D / 2, 0.006, 0.0002, D * 0.7); // vent slots
  });
}
export function rackShelf1U(name: string) { return inst(name, shelfParts(), { kind: 'rackShelf1U', size: [RACK_EAR_W, U1H, 0.35], frontZ: -0.35, u: 1, shelfTopY: 0.002 }); }

// ---------- servers ----------
function server1UParts() {
  return cached('server1U', b => {
    const D = 0.70;
    const panel = decalMat('srv1u', 0.436, U1H, 4200, p => {
      const H = U1H; plateBg(p, '#24272b'); p.rect(0, H - 0.001, 0.436, 0.001, '#3b3f45');
      // control cluster
      p.circle(0.014, 0.024, 0.0045, '#111'); p.ring(0.014, 0.024, 0.0038, '#3a8bff', 0.0007); p.led(0.014, 0.024, 0.0016, '#3a8bff'); if (p.e) { p.e.strokeStyle = '#3a8bff'; p.e.lineWidth = 0.0009 * p.S; p.e.beginPath(); p.e.arc(p.X(0.014), p.Y(0.024), 0.0038 * p.S, 0, 7); p.e.stroke(); }
      p.led(0.026, 0.030, 0.0009, '#38ff5c'); p.led(0.026, 0.024, 0.0009, '#38ff5c'); p.led(0.026, 0.018, 0.0009, '#ffb020', false);
      p.rect(0.008, 0.007, 0.012, 0.005, '#9aa1a8'); p.rect(0.009, 0.008, 0.010, 0.002, '#0c0c0d');
      p.text('NusaServ R1', 0.031, 0.0335, 0.0029, '#d5dade', 'left', 'bold');
      p.rrect(0.031, 0.0065, 0.022, 0.0068, 0.001, '#3d5fa8'); p.text('VGA', 0.042, 0.0084, 0.0026, '#cfe0ff', 'center');
      // 8 x 2.5" carriers (2 rows x 4)
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const u = 0.06 + c * 0.0725, v = r ? 0.0035 : 0.0222;
        p.rrect(u, v, 0.0710, 0.0175, 0.0008, '#141517');
        p.rect(u + 0.002, v + 0.002, 0.048, 0.0135, '#2c3035'); p.vents(u + 0.0028, v + 0.0028, 0.046, 0.012, 0.0022, 0.0022, 0.0012, '#0a0b0c');
        p.rrect(u + 0.052, v + 0.0025, 0.0165, 0.0125, 0.001, '#b9bfc5'); p.rect(u + 0.054, v + 0.0048, 0.0125, 0.0018, '#6c747b');
        p.led(u + 0.0525 + 0.0018, v + 0.0153, 0.0007, '#38ff5c', true, true); p.led(u + 0.0525 + 0.0058, v + 0.0153, 0.0007, '#3a8bff', (r + c) % 3 === 0, true);
      }
      p.hexGrid(0.354, 0.0035, 0.078, 0.0365, 0.0024, '#0b0c0d');
    }, { metal: 0.35, emi: 1.4 });
    rackChassis(b, 1, D, panel, { handles: true });
    b.box(MT.black, 0.15, 0.006, 0.0006, 0.06, 0.03, 0.0015); b.box(MT.black, -0.15, 0.006, 0.0006, 0.06, 0.03, 0.0015);
  });
}
export function server1U(name: string) { return inst(name, server1UParts(), { kind: 'server1U', size: [RACK_EAR_W, U1H, 0.7], frontZ: -0.7, u: 1 }); }

function server2UParts() {
  return cached('server2U', b => {
    const D = 0.75, H = 2 * RACK_U - 0.0008;
    const panel = decalMat('srv2u', RACK_EAR_W, H, 3600, p => {
      plateBg(p, '#202327'); earSlots(p, H);
      // visible drive bays behind bezel (12 x 3.5")
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const u = 0.045 + c * 0.1, v = 0.004 + r * 0.0275; p.rrect(u, v, 0.098, 0.026, 0.001, '#15171a'); p.led(u + 0.09, v + 0.02, 0.0008, '#38ff5c', true, true); }
      // ear controls
      p.circle(0.0105, H - 0.018, 0.004, '#0b0b0c'); p.led(0.0105, H - 0.018, 0.0018, '#3a8bff');
      p.led(0.0105, H - 0.030, 0.0009, '#38ff5c'); p.led(0.0105, H - 0.037, 0.0009, '#38ff5c'); p.led(0.0105, H - 0.044, 0.0009, '#ffb020', false);
      p.rect(0.005, 0.012, 0.011, 0.005, '#9aa1a8'); p.rect(0.006, 0.013, 0.009, 0.002, '#0c0c0d');
      p.rrect(RACK_EAR_W - 0.017, H - 0.034, 0.013, 0.022, 0.001, '#0b0f14'); p.glowRect(RACK_EAR_W - 0.0158, H - 0.032, 0.0106, 0.018, '#103a6a', 0.9);
      p.text('OK', RACK_EAR_W - 0.0105, H - 0.025, 0.0035, '#7cf3a8', 'center', 'bold', MONO, p.g); if (p.e) p.text('OK', RACK_EAR_W - 0.0105, H - 0.025, 0.0035, '#7cf3a8', 'center', 'bold', MONO, p.e);
      p.led(RACK_EAR_W - 0.0105, 0.012, 0.0012, '#3a8bff');
    }, { metal: 0.35, emi: 1.3 });
    rackChassis(b, 2, D, panel, { full: true, handles: false });
    // honeycomb bezel
    const bz = decalMat('srv2u_bezel', 0.405, H - 0.008, 3000, p => {
      const W = 0.405, h = H - 0.008;
      p.fill('#3c4249');
      p.rect(0, 0, W, h, p.vgrad(0, h, '#2b3036', '#4a5159'));
      p.hexGrid(0.004, 0.004, W - 0.008, h - 0.008, 0.0042, '#0d0f11');
      p.rrect(W / 2 - 0.06, h / 2 - 0.007, 0.12, 0.014, 0.002, '#1b1f24');
      p.text('NusaServ', W / 2, h / 2 - 0.0028, 0.0085, '#e6ebef', 'center', 'bold');
      p.glowRect(W / 2 - 0.05, h / 2 - 0.0062, 0.1, 0.0009, '#3a8bff', 1);
      p.text('R2 · 2U', W - 0.008, 0.007, 0.004, '#aeb6bd', 'right', 'bold');
    }, { metal: 0.45, rough: 0.4, emi: 1.0 });
    b.box(MT.chassisMid, 0, 0.004, -D - 0.01, 0.405, H - 0.008, 0.018);
    b.plane(bz, 0, H / 2, -D - 0.0192, 0.405, H - 0.008, '-z');
    b.box(MT.chrome, 0.193, 0.03, -D - 0.021, 0.004, H - 0.06, 0.003);   // bezel latch
    b.box(MT.black, 0.15, 0.006, 0.0006, 0.06, 0.03, 0.0015); b.box(MT.black, -0.15, 0.006, 0.0006, 0.06, 0.03, 0.0015);
  });
}
export function server2U(name: string) { return inst(name, server2UParts(), { kind: 'server2U', size: [RACK_EAR_W, 2 * RACK_U - 0.0008, 0.77], frontZ: -0.75, u: 2 }); }

// ---------- UPS ----------
function upsLCD(p: Painter, u: number, v: number, w: number, h: number, load = 38, batt = 100) {
  p.rrect(u - 0.002, v - 0.002, w + 0.004, h + 0.004, 0.0015, '#0a0b0c');
  p.glowRect(u, v, w, h, '#1d5fae', 0.85);
  const t = (s: string, uu: number, vv: number, sz: number, al: CanvasTextAlign = 'left') => { p.text(s, uu, vv, sz, '#e8f3ff', al, 'bold', MONO, p.g); if (p.e) p.text(s, uu, vv, sz, '#e8f3ff', al, 'bold', MONO, p.e); };
  const s = h / 0.03;
  t('ONLINE', u + w * 0.05, v + h * 0.78, 0.0042 * s); t('230V', u + w * 0.95, v + h * 0.78, 0.0042 * s, 'right');
  t('LOAD', u + w * 0.05, v + h * 0.46, 0.0032 * s); t(load + '%', u + w * 0.95, v + h * 0.46, 0.0032 * s, 'right');
  t('BATT', u + w * 0.05, v + h * 0.12, 0.0032 * s); t(batt + '%', u + w * 0.95, v + h * 0.12, 0.0032 * s, 'right');
  for (let k = 0; k < 10; k++) {
    const on1 = k < Math.round(load / 10), on2 = k < Math.round(batt / 10);
    p.glowRect(u + w * (0.3 + k * 0.045), v + h * 0.47, w * 0.035, h * 0.12, on1 ? '#e8f3ff' : '#2a63a8', on1 ? 1 : 0.3);
    p.glowRect(u + w * (0.3 + k * 0.045), v + h * 0.13, w * 0.035, h * 0.12, on2 ? '#e8f3ff' : '#2a63a8', on2 ? 1 : 0.3);
  }
}
function upsRackParts() {
  return cached('upsRack2U', b => {
    const D = 0.6, H = 2 * RACK_U - 0.0008;
    const panel = decalMat('upsr', RACK_EAR_W, H, 3600, p => {
      plateBg(p, '#1b1d20'); earSlots(p, H);
      p.vents(0.03, 0.008, 0.13, H - 0.016, 0.0038, 0.0038, 0.0026, '#070708');
      p.vents(0.32, 0.008, 0.13, H - 0.016, 0.0038, 0.0038, 0.0026, '#070708');
      p.rrect(0.17, 0.006, 0.142, H - 0.012, 0.003, '#2a2d31');
      upsLCD(p, 0.18, 0.043, 0.07, 0.033);
      p.text('NusaPower', 0.258, 0.068, 0.0062, '#ffffff', 'left', 'bold'); p.text('RT 3000VA', 0.258, 0.059, 0.0042, '#9aa3ab', 'left', 'bold'); p.text('Online Double Conversion', 0.258, 0.052, 0.0028, '#9aa3ab', 'left', 'normal');
      [['ON', '#2a2d31'], ['OFF', '#2a2d31'], ['▲', '#2a2d31'], ['▼', '#2a2d31']].forEach(([l], k) => { const u = 0.19 + k * 0.016; p.circle(u, 0.024, 0.0052, '#111214'); p.circle(u, 0.024, 0.0044, '#3a3e44'); p.text(l, u, 0.0123, 0.0028, '#cfd5da', 'center'); });
      [['#38ff5c', true], ['#ffb020', false], ['#ff3030', false]].forEach(([c, on], k) => p.led(0.265 + k * 0.012, 0.024, 0.0014, c as string, on as boolean));
      p.text('LINE  BATT  FAULT', 0.277, 0.0123, 0.0026, '#9aa3ab', 'center');
    }, { metal: 0.3, emi: 1.25 });
    rackChassis(b, 2, D, panel, { full: true, handles: true, body: MT.black });
  });
}
export function upsRack2U(name: string) { return inst(name, upsRackParts(), { kind: 'upsRack2U', size: [RACK_EAR_W, 2 * RACK_U - 0.0008, 0.6], frontZ: -0.6, u: 2 }); }

/** Mount a rack device (any builder above) into a rack42U()/wallRack() group. uBottom = 1-based U slot of its lowest U. */
export function placeInRack(rack: THREE.Object3D, device: THREE.Object3D, uBottom: number) {
  const r = rack.userData as { frontRailZ: number; u1Y: number };
  const d = device.userData as { frontZ: number };
  device.position.set(0, r.u1Y + (uBottom - 1) * RACK_U + 0.0004, r.frontRailZ - 0.0025 - (d.frontZ ?? 0));
  rack.add(device); return device;
}

// =================================================================================================
// CABINETS
// =================================================================================================
type DevKey = 'switchM' | 'switchU' | 'router' | 'patch' | 'mgr' | 'odf' | 'blank1' | 'blank2' | 'pdu' | 'shelf' | 'srv1' | 'srv2' | 'ups2';
const RD: Record<DevKey, () => { p: Part[]; d: number }> = {
  switchM: () => ({ p: switchParts(true), d: 0.25 }), switchU: () => ({ p: switchParts(false), d: 0.25 }),
  router: () => ({ p: routerParts(), d: 0.23 }), patch: () => ({ p: patchParts(), d: 0.12 }), mgr: () => ({ p: managerParts(), d: 0.07 }),
  odf: () => ({ p: odfParts(), d: 0.2 }), blank1: () => ({ p: blankParts(1), d: 0.012 }), blank2: () => ({ p: blankParts(2), d: 0.012 }),
  pdu: () => ({ p: pduParts(), d: 0.06 }), shelf: () => ({ p: shelfParts(), d: 0.35 }), srv1: () => ({ p: server1UParts(), d: 0.7 }),
  srv2: () => ({ p: server2UParts(), d: 0.75 }), ups2: () => ({ p: upsRackParts(), d: 0.6 }),
};
function railMat(mirror: boolean, units: number) {
  const W = 0.028, H = units * RACK_U;
  return decalMat(`rail_${mirror ? 'R' : 'L'}_${units}`, W, H, 2000, p => {
    p.fill('#b4bbc1'); p.noise(Math.round(p.cv.width * p.cv.height / 6), 0.08); p.noise(Math.round(p.cv.width * p.cv.height / 10), 0.06, true);
    const hu = mirror ? W - 0.0085 : 0.0085, tu = mirror ? 0.0075 : W - 0.0068;
    p.rect(mirror ? 0 : W - 0.0006, 0, 0.0006, H, 'rgba(0,0,0,0.25)');
    for (let k = 0; k < units; k++) {
      const v0 = k * RACK_U;
      for (const o of [0.00635, 0.022225, 0.0381]) { p.rect(hu - 0.0048, v0 + o - 0.0048, 0.0096, 0.0096, '#0a0a0b'); p.rect(hu - 0.0048, v0 + o + 0.0036, 0.0096, 0.0012, 'rgba(255,255,255,0.18)'); }
      p.rect(mirror ? 0.0 : W - 0.012, v0, 0.012, 0.0005, 'rgba(20,20,20,0.6)');
      p.text(String(k + 1), tu, v0 + 0.018, 0.0062, '#1d2126', 'center', 'bold');
    }
  }, { metal: 0.75, rough: 0.35, blink: false });
}
function perfMat() {
  return decalMat('perf', 0.01, 0.01732, 6000, p => {
    p.fill('#202326'); p.noise(400, 0.08, true);
    p.g.globalCompositeOperation = 'destination-out';
    for (const [u, v] of [[0, 0], [0.01, 0], [0, 0.01732], [0.01, 0.01732], [0.005, 0.00866]]) p.circle(u, v, 0.0036, '#000');
    p.g.globalCompositeOperation = 'source-over';
  }, { repeat: true, transparent: true, side: THREE.DoubleSide, metal: 0.4, rough: 0.55, blink: false });
}
function rackTopMat(W: number, D: number) {
  return decalMat(`racktop_${W}_${D}`, W, D, 500, p => {
    p.fill('#1d1f22'); p.noise(3000, 0.06, true);
    const fans = D > 1.1 ? 4 : 2;
    for (let k = 0; k < fans; k++) {
      const cu = W / 2 + (fans === 4 ? (k % 2 ? 0.12 : -0.12) : 0), cv = fans === 4 ? (k < 2 ? D * 0.38 : D * 0.62) : D * (0.35 + k * 0.3);
      p.circle(cu, cv, 0.065, '#0b0c0d'); for (let r = 0.012; r < 0.065; r += 0.012) p.ring(cu, cv, r, '#3a3e43', 0.0025);
      for (let a = 0; a < 4; a++) p.line([[cu, cv], [cu + Math.cos(a * Math.PI / 2 + 0.785) * 0.065, cv + Math.sin(a * Math.PI / 2 + 0.785) * 0.065]], '#3a3e43', 0.003);
      for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.circle(cu + du * 0.06, cv + dv * 0.06, 0.003, '#8b939a');
    }
    p.rrect(W / 2 - 0.1, D * 0.08, 0.2, 0.05, 0.01, '#050506'); // cable entry with brush
    for (let x = W / 2 - 0.095; x < W / 2 + 0.095; x += 0.004) p.line([[x, D * 0.085], [x + 0.002, D * 0.125]], '#2a2c2f', 0.0012);
  }, { metal: 0.35, rough: 0.6, blink: false });
}
/** door parts in hinge-local frame: hinge at x=0,z=0; door spans x∈[-w,0], z∈[-0.022,0] */
function doorParts(w: number, h: number, glass: boolean) {
  return cached(`door_${w}_${h}_${glass}`, b => {
    const t = 0.022, st = 0.045;
    b.box(MT.rackEdge, -st / 2, 0, -t / 2, st, h, t); b.box(MT.rackEdge, -w + st / 2, 0, -t / 2, st, h, t);
    b.box(MT.rackEdge, -w / 2, 0, -t / 2, w - 2 * st, 0.06, t); b.box(MT.rackEdge, -w / 2, h - 0.06, -t / 2, w - 2 * st, 0.06, t);
    const iw = w - 2 * st, ih = h - 0.12;
    if (glass) {
      b.plane(MT.glass, -w / 2, h / 2, -t * 0.55, iw + 0.004, ih + 0.004, '-z');
      // silk-screened border on the glass (reads as tempered glass edge)
      b.box(MT.black, -w / 2, 0.06, -t * 0.55 - 0.001, iw, 0.012, 0.0005); b.box(MT.black, -w / 2, h - 0.072, -t * 0.55 - 0.001, iw, 0.012, 0.0005);
    } else {
      b.plane(perfMat(), -w / 2, h / 2, -t * 0.5, iw, ih, '-z', [0, 0, iw / 0.01, ih / 0.01732]);
      b.box(MT.rackEdge, -w / 2, h / 2 - 0.02, -t / 2, iw, 0.04, 0.006); // stiffener
    }
    // swing handle with lock
    const hx = -w + 0.024;
    b.box(MT.black, hx, h * 0.5 - 0.09, -t - 0.006, 0.024, 0.18, 0.012); b.box(MT.chrome, hx, h * 0.5 - 0.075, -t - 0.0125, 0.012, 0.11, 0.004); b.cyl(MT.chrome, hx, h * 0.5 + 0.06, -t - 0.012, 0.006, 0.004, 'z', 14); b.box(MT.hole, hx, h * 0.5 + 0.0585, -t - 0.0143, 0.001, 0.004, 0.0004);
    for (const y of [0.15, h * 0.5, h - 0.15]) b.cyl(MT.steel, 0.006, y, -0.004, 0.006, 0.07, 'y', 10);
  });
}
function cordPlug(b: B, x: number, y: number, zf: number, col: string, fiber = false) {
  const cm = cordMat(col);
  if (fiber) { b.box(MT.blue, x, y - 0.0035, zf - 0.009, 0.0072, 0.007, 0.018); b.cyl(cm, x, y, zf - 0.024, 0.0018, 0.014, 'z', 6, 0.0012); return; }
  b.box(MT.clear, x, y - 0.0041, zf - 0.003, 0.0117, 0.0082, 0.006);
  b.box(cm, x, y - 0.0057, zf - 0.013, 0.0128, 0.0114, 0.016);
  b.cyl(cm, x, y, zf - 0.025, 0.0042, 0.009, 'z', 8, 0.0032);
}
/** patch cord between two port faces (both faces at the same zf, cable runs in front) */
function patchCord(b: B, ax: number, ay: number, bx: number, by: number, zf: number, col: string, via: THREE.Vector3[], fiber = false) {
  cordPlug(b, ax, ay, zf, col, fiber); cordPlug(b, bx, by, zf, col, fiber);
  const pts = [V(ax, ay, zf - 0.028), V(ax, ay + (via[0].y - ay) * 0.15, zf - 0.034), ...via, V(bx, by + (via[via.length - 1].y - by) * 0.15, zf - 0.034), V(bx, by, zf - 0.028)];
  b.tube(cordMat(col), pts, fiber ? 0.0015 : 0.0028, 10 + via.length * 6, fiber ? 4 : 5, 0.5);
}

type RackOptions = { width?: 0.6 | 0.8; depth?: 1.0 | 1.2; glassDoor?: boolean; populated?: 'server' | 'network' | 'idf' | null; doorOpen?: number; sidePanels?: boolean };
function rackFrameParts(W: number, D: number, side: boolean) {
  return cached(`rackframe_${W}_${D}_${side}`, b => {
    const y0 = 0.125, topY = y0 + 42 * RACK_U, H = 2.045, zfr = -D + 0.12, zrr = -0.13;
    // posts
    for (const sx of [-1, 1]) for (const zz of [-D + 0.0175, -0.0175]) b.box(MT.rack, sx * (W / 2 - 0.0175), 0.075, zz, 0.035, H - 0.08, 0.035);
    // base + top frames
    for (const yy of [0.075, topY + 0.005]) {
      b.box(MT.rack, 0, yy, -D + 0.02, W, 0.04, 0.04); b.box(MT.rack, 0, yy, -0.02, W, 0.04, 0.04);
      b.box(MT.rack, W / 2 - 0.02, yy, -D / 2, 0.04, 0.04, D - 0.08); b.box(MT.rack, -W / 2 + 0.02, yy, -D / 2, 0.04, 0.04, D - 0.08);
    }
    b.box(MT.rack, 0, 0.075, -D / 2, W - 0.08, 0.002, D - 0.08); // floor plate
    b.box(MT.rack, 0, H - 0.0055, -D / 2, W, 0.005, D);
    b.plane(rackTopMat(W, D), 0, H + 0.0003, -D / 2, W, D, '+y');
    // logo plate on the top front beam
    const logo = decalMat('racklogo', 0.12, 0.022, 3000, p => { p.fill('#141517'); p.text('NusaRack', 0.06, 0.0075, 0.012, '#d9dde0', 'center', 'bold'); }, { metal: 0.5, blink: false });
    b.plane(logo, 0, topY + 0.025, -D - 0.0003, 0.12, 0.022, '-z');
    // casters + levelling feet
    for (const sx of [-1, 1]) for (const zz of [-D + 0.06, -0.06]) {
      const x = sx * (W / 2 - 0.06);
      b.box(MT.steel, x, 0.069, zz, 0.06, 0.006, 0.06); b.cyl(MT.steel, x, 0.06, zz, 0.012, 0.012, 'y', 10);
      b.box(MT.steelDark, x - 0.012, 0.028, zz + 0.008, 0.003, 0.034, 0.03); b.box(MT.steelDark, x + 0.012, 0.028, zz + 0.008, 0.003, 0.034, 0.03);
      b.cyl(MT.rubber, x, 0.03, zz + 0.008, 0.03, 0.02, 'x', 16); b.cyl(MT.steel, x, 0.03, zz + 0.008, 0.008, 0.026, 'x', 8);
      const fz = zz + (zz < -D / 2 ? 0.075 : -0.075);
      b.cyl(MT.zinc, x, 0.04, fz, 0.006, 0.07, 'y', 8); b.cyl(MT.black, x, 0.009, fz, 0.022, 0.012, 'y', 14); b.cyl(MT.zinc, x, 0.07, fz, 0.011, 0.008, 'y', 6);
    }
    // 19" rails (front + rear), L profile, with U-numbered hole texture
    for (const zr of [zfr, zrr]) {
      for (const s of [-1, 1]) {
        const xin = s * 0.224, xout = s * 0.252, cx = (xin + xout) / 2;
        b.box(MT.zinc, cx, y0, zr + 0.001, 0.028, 42 * RACK_U, 0.002);
        b.plane(railMat(s > 0, 42), cx, y0 + 21 * RACK_U, zr - 0.0003, 0.028, 42 * RACK_U, '-z');
        b.box(MT.zinc, xout, y0, zr + 0.018, 0.002, 42 * RACK_U, 0.036);
        // brackets to the frame
        for (const yy of [y0 + 0.01, y0 + 21 * RACK_U, topY - 0.04]) b.box(MT.rack, (xout + s * (W / 2 - 0.035)) / 2, yy, zr + 0.025, Math.abs(W / 2 - 0.035 - Math.abs(xout)), 0.03, 0.02);
      }
    }
    // side rails tying front/rear rail brackets
    for (const s of [-1, 1]) for (const yy of [y0 + 0.01, topY - 0.04]) b.box(MT.rack, s * (W / 2 - 0.04), yy, -D / 2, 0.01, 0.03, D - 0.08);
    // vertical cable organisers (800 wide)
    if (W > 0.7) {
      for (const s of [-1, 1]) {
        const cx = s * 0.318;
        b.box(MT.black, cx, y0, zfr + 0.012, 0.11, 42 * RACK_U, 0.002);
        for (let k = 0; k < 42; k++) for (const ex of [-0.05, 0.05]) {
          b.box(MT.plasticD, cx + ex, y0 + k * RACK_U + 0.012, zfr - 0.03, 0.007, 0.02, 0.085);
          b.box(MT.plasticD, cx + ex - Math.sign(ex) * 0.006, y0 + k * RACK_U + 0.012, zfr - 0.0705, 0.01, 0.02, 0.004);
        }
      }
    }
    // side panels
    if (side) for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.001);
      b.box(MT.rack, x, 0.115, -D / 2, 0.0016, 1.89, D - 0.06);
      b.box(MT.rackEdge, x + s * 0.0013, 0.17, -D / 2, 0.0012, 1.78, D - 0.16);
      b.cyl(MT.chrome, x + s * 0.003, 1.05, -D + 0.12, 0.009, 0.004, 'x', 14); b.box(MT.hole, x + s * 0.0052, 1.049, -D + 0.12, 0.0004, 0.002, 0.008);
      b.box(MT.hole, x + s * 0.0021, 1.0, -0.16, 0.0006, 0.1, 0.03);
    }
    // rear perforated door (closed)
    b.plane(perfMat(), 0, 0.12 + 0.94, -0.011, W - 0.07, 1.84, '+z', [0, 0, (W - 0.07) / 0.01, 1.84 / 0.01732]);
    b.box(MT.rackEdge, 0, 0.12, -0.011, W - 0.01, 0.05, 0.02); b.box(MT.rackEdge, 0, 1.96, -0.011, W - 0.01, 0.05, 0.02);
    b.box(MT.rackEdge, W / 2 - 0.03, 0.12, -0.011, 0.04, 1.89, 0.02); b.box(MT.rackEdge, -W / 2 + 0.03, 0.12, -0.011, 0.04, 1.89, 0.02);
    b.box(MT.black, -W / 2 + 0.04, 1.0, 0.0, 0.022, 0.16, 0.01);
  });
}
type Slot = [DevKey, number];
function rackLayout(kind: 'server' | 'network' | 'idf'): Slot[] {
  if (kind === 'network') return [['patch', 41], ['mgr', 40], ['switchM', 39], ['patch', 38], ['mgr', 37], ['switchM', 36], ['blank1', 35], ['router', 33], ['odf', 32], ['blank1', 31], ['srv1', 28], ['srv1', 27], ['blank2', 25], ['pdu', 3], ['ups2', 1]];
  if (kind === 'server') return [['patch', 41], ['mgr', 40], ['switchM', 39], ['srv2', 37], ['srv2', 35], ['srv2', 33], ['srv1', 31], ['srv1', 30], ['srv1', 29], ['blank2', 27], ['srv2', 22], ['srv2', 20], ['blank1', 19], ['pdu', 3], ['ups2', 1]];
  return [['patch', 41], ['mgr', 40], ['switchU', 39], ['router', 37], ['shelf', 35], ['odf', 33], ['blank2', 30], ['pdu', 3], ['ups2', 1]];
}
function rackContentParts(W: number, D: number, kind: 'server' | 'network' | 'idf', y0: number, zfr: number) {
  return cached(`rackcontent_${W}_${D}_${kind}`, b => {
    const yU = (u: number) => y0 + (u - 1) * RACK_U + 0.0004;
    const zMount = (d: number) => zfr - 0.0025 + d;
    for (const [k, u] of rackLayout(kind)) { const r = RD[k](); b.parts(r.p, T(0, yU(u), zMount(r.d))); }
    const zf = zfr - 0.0025 - 0.0004; // device panel face
    const ppX = (i: number) => RACK_EAR_W / 2 - ppPort(i).cu, ppY = (u: number) => yU(u) + ppPort(0).cv;
    const swX = (i: number) => { const q = swPort(i); return 0.218 - (q.u + q.w / 2); }, swY = (u: number, i: number) => { const q = swPort(i); return yU(u) + q.v + q.h / 2; };
    const run = (uP: number, uM: number, uS: number, n: number, colour: (i: number) => string) => {
      const ym = yU(uM) + U1H / 2;
      for (let i = 0; i < n; i++) {
        const xa = ppX(i), ya = ppY(uP), xb = swX(i), yb = swY(uS, i), sag = (i % 5) * 0.0015;
        patchCord(b, xa, ya, xb, yb, zf, colour(i), [V(xa * 0.75 + xb * 0.25, ym + 0.008, zf - 0.044 - sag), V(xa * 0.25 + xb * 0.75, ym - 0.006, zf - 0.046 - sag)]);
      }
    };
    const colA = (i: number) => i < 12 ? 'blue' : i < 18 ? 'yellow' : i < 21 ? 'green' : 'red';
    const colB = (i: number) => i < 12 ? 'white' : i < 18 ? 'blue' : 'purple';
    if (kind === 'network') {
      run(41, 40, 39, 22, colA); run(38, 37, 36, 20, colB);
      // router -> switch uplinks (red), routed up the right-hand side
      for (const [ri, us] of [[1, 39], [2, 36]] as [number, number][]) {
        const q = rtPort(ri), xr = 0.218 - (q.u + q.w / 2), yr = yU(33) + q.v + q.h / 2, xs = swX(22), ys = swY(us, 22);
        const sx = -0.178 - ri * 0.007; patchCord(b, xr, yr, xs, ys, zf, 'red', [V(xr, yr + 0.03, zf - 0.05), V(sx + 0.03, yr + 0.05, zf - 0.062), V(sx, yr + 0.085, zf - 0.068), V(sx, ys - 0.04, zf - 0.068), V(xs - 0.012, ys + 0.016, zf - 0.05)]);
      }
      // ODF -> router SFP+ (yellow duplex fibre)
      for (let c = 0; c < 2; c++) {
        const oq = odfPort(c), xo = RACK_EAR_W / 2 - (oq.u + oq.w / 2), yo = yU(32) + oq.v + oq.h / 2, xs = 0.218 - 0.258 + c * 0.004, ys = yU(33) + 0.0211;
        patchCord(b, xo, yo, xs, ys, zf, 'fiber', [V(xo - 0.02, yo - 0.02, zf - 0.07), V(xs + 0.03, ys - 0.03, zf - 0.07)], true);
      }
    } else if (kind === 'server') {
      run(41, 40, 39, 16, i => i < 8 ? 'blue' : i < 12 ? 'green' : 'yellow');
    } else {
      run(41, 40, 39, 12, i => i < 8 ? 'blue' : 'yellow');
      const q = rtPort(1), xr = 0.218 - (q.u + q.w / 2), yr = yU(37) + q.v + q.h / 2, xs = swX(23), ys = swY(39, 23);
      patchCord(b, xr, yr, xs, ys, zf, 'red', [V(xr - 0.02, yr + 0.02, zf - 0.06), V(xs - 0.03, ys - 0.02, zf - 0.06)]);
      // ONT on the shelf
      b.parts(ontParts(), T(0.06, yU(35) + 0.002, zfr + 0.24));
      const oq = odfPort(0), xo = RACK_EAR_W / 2 - (oq.u + oq.w / 2), yo = yU(33) + oq.v + oq.h / 2;
      b.tube(cordMat('fiber'), [V(xo, yo, zf - 0.024), V(xo, yo + 0.01, zf - 0.06), V(0.17, yU(35) + 0.03, zf - 0.06), V(0.15, yU(35) + 0.04, zfr + 0.06), V(0.12, yU(35) + 0.02, zfr + 0.25)], 0.0015, 30, 4);
      cordPlug(b, xo, yo, zf, 'fiber', true);
    }
  });
}
export function rack42U(name: string, o: RackOptions = {}) {
  const W = o.width ?? 0.6, D = o.depth ?? 1.0, glass = o.glassDoor ?? true, side = o.sidePanels ?? true;
  const y0 = 0.125, zfr = -D + 0.12;
  const parts = [...rackFrameParts(W, D, side)];
  const g = inst(name, parts, { kind: 'rack42U', size: [W, 2.045, D], frontRailZ: zfr, rearRailZ: -0.13, u1Y: y0, units: 42 });
  if (o.populated) { const c = inst(name + '_content', rackContentParts(W, D, o.populated, y0, zfr)); g.add(c); }
  const door = inst(name + '_door', doorParts(W - 0.01, 1.88, glass)); door.position.set(W / 2 - 0.005, 0.12, -D); door.rotation.y = -(o.doorOpen ?? 0.45); g.add(door);
  return g;
}

/** Wall-mount IDF cabinet: 600 wide x 450 deep, back on the wall. Optional populated patch/switch/router. */
export function wallRack(name: string, o: { u?: 9 | 12; populated?: boolean; doorOpen?: number } = {}) {
  const u = o.u ?? 9, W = 0.6, D = 0.45, H = u * RACK_U + 0.11, y0 = 0.055, zfr = -D + 0.07;
  const frame = cached(`wallrack_${u}`, b => {
    b.box(MT.rack, 0, 0, -D / 2, W, 0.03, D); b.box(MT.rack, 0, H - 0.03, -D / 2, W, 0.03, D);
    b.box(MT.rack, 0, 0, -0.008, W, H, 0.016);
    for (const s of [-1, 1]) b.box(MT.rack, s * (W / 2 - 0.001), 0.03, -D / 2, 0.002, H - 0.06, D);
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.box(MT.hole, s * (W / 2 + 0.0002), H * 0.3 + k * 0.012, -D / 2, 0.0004, 0.004, 0.14);
    b.plane(rackTopMat(W, D), 0, H + 0.0003, -D / 2, W, D, '+y');
    for (const s of [-1, 1]) {
      const cx = s * 0.238; b.box(MT.zinc, cx, y0, zfr + 0.001, 0.028, u * RACK_U, 0.002);
      b.plane(railMat(s > 0, u), cx, y0 + u * RACK_U / 2, zfr - 0.0003, 0.028, u * RACK_U, '-z');
      b.box(MT.zinc, s * 0.252, y0, zfr + 0.03, 0.002, u * RACK_U, 0.06);
    }
    const logo = decalMat('racklogo', 0.12, 0.022, 3000, p => { p.fill('#141517'); p.text('NusaRack', 0.06, 0.0075, 0.012, '#d9dde0', 'center', 'bold'); }, { metal: 0.5, blink: false });
    b.plane(logo, 0, H - 0.015, -D - 0.0003, 0.12, 0.022, '-z');
  });
  const g = inst(name, frame, { kind: 'wallRack', size: [W, H, D], frontRailZ: zfr, u1Y: y0, units: u });
  if (o.populated ?? true) {
    const content = cached(`wallrack_c_${u}`, b => {
      const yU = (k: number) => y0 + (k - 1) * RACK_U + 0.0004, zm = (d: number) => zfr - 0.0025 + d;
      const top = u;
      const sl: Slot[] = [['patch', top], ['mgr', top - 1], ['switchU', top - 2], ['router', top - 4], ['pdu', 1]];
      for (const [k, uu] of sl) { const r = RD[k](); b.parts(r.p, T(0, yU(uu), zm(r.d))); }
      const zf = zfr - 0.0029, ym = yU(top - 1) + U1H / 2;
      for (let i = 0; i < 12; i++) { const xa = RACK_EAR_W / 2 - ppPort(i).cu, ya = yU(top) + ppPort(0).cv, q = swPort(i), xb = 0.218 - (q.u + q.w / 2), yb = yU(top - 2) + q.v + q.h / 2; patchCord(b, xa, ya, xb, yb, zf, i < 8 ? 'blue' : 'yellow', [V(xa * 0.75 + xb * 0.25, ym + 0.008, zf - 0.044), V(xa * 0.25 + xb * 0.75, ym - 0.006, zf - 0.046)]); }
    });
    g.add(inst(name + '_content', content));
  }
  const door = inst(name + '_door', doorParts(W - 0.01, H - 0.01, true)); door.position.set(W / 2 - 0.005, 0.005, -D); door.rotation.y = -(o.doorOpen ?? 0.35); g.add(door);
  return g;
}

// =================================================================================================
// WIRELESS / ACCESS / POWER
// =================================================================================================
/** '+y' plane readable from -Z (image top toward +Z) */
const TOPUV: [number, number, number, number] = [1, 1, 0, 0];

function ontParts() {
  return cached('ont', b => {
    const W = 0.18, D = 0.13;
    b.flat(MT.plasticW, rrShape(-W / 2, 0, W, D, 0.014), 0.004, 0.028, 0.002);
    for (const [x, z] of [[-0.07, -0.015], [0.07, -0.015], [-0.07, -0.115], [0.07, -0.115]]) b.cyl(MT.rubber, x, 0.002, z, 0.006, 0.004, 'y', 10);
    const top = decalMat('ont_top', 0.165, 0.115, 3000, p => {
      p.fill('#f4f5f6'); p.rect(0, 0, 0.165, 0.115, p.vgrad(0, 0.115, '#e9ebed', '#fbfbfc'));
      p.rrect(0.006, 0.006, 0.153, 0.032, 0.004, '#d9dde1');
      const leds: [string, string, boolean][] = [['POWER', '#38ff5c', true], ['PON', '#38ff5c', true], ['LOS', '#ff3030', false], ['INTERNET', '#38ff5c', true], ['LAN1', '#38ff5c', true], ['LAN2', '#38ff5c', true], ['LAN3', '#38ff5c', false], ['LAN4', '#38ff5c', false], ['WLAN', '#38ff5c', true], ['WPS', '#ffb020', false]];
      leds.forEach(([l, c, on], k) => { const u = 0.014 + k * 0.0152; p.circle(u, 0.027, 0.0034, '#b9bfc5'); p.led(u, 0.027, 0.0026, c, on); p.text(l, u, 0.0135, 0.0034, '#3c434a', 'center', 'bold'); });
      p.text('NusaFiber', 0.0825, 0.078, 0.016, '#0e3a7c', 'center', 'bold'); p.text('GPON ONT  ·  NF-609', 0.0825, 0.062, 0.0065, '#4f5861', 'center', 'bold');
      for (let k = 0; k < 14; k++) p.rect(0.03 + k * 0.0075, 0.098, 0.004, 0.011, '#c9ced3');
    }, { rough: 0.7, metal: 0.0, emi: 1.5, color: '#e6e8ea' });
    b.plane(top, 0, 0.0322, -D / 2, 0.165, 0.115, '+y', TOPUV);
    const back = decalMat('ont_back', 0.16, 0.022, 4000, p => {
      p.fill('#dfe2e5');
      p.rrect(0.006, 0.004, 0.012, 0.012, 0.001, '#0b0b0c'); p.text('PON', 0.012, 0.0185, 0.0028, '#555', 'center');
      for (let k = 0; k < 4; k++) { p.rj45(0.03 + k * 0.0155, 0.003, 0.013, 0.0125, false, '#d9b44a'); p.text('LAN' + (k + 1), 0.0365 + k * 0.0155, 0.0185, 0.0026, '#555', 'center'); }
      p.rj45(0.095, 0.004, 0.011, 0.01, false, '#8d959c'); p.text('TEL', 0.1005, 0.0185, 0.0026, '#555', 'center');
      p.circle(0.118, 0.009, 0.0012, '#111'); p.text('RST', 0.118, 0.0185, 0.0026, '#555', 'center');
      p.circle(0.135, 0.009, 0.0045, '#111'); p.circle(0.135, 0.009, 0.0012, '#b9c0c6'); p.text('12V', 0.135, 0.0185, 0.0026, '#555', 'center');
      p.rrect(0.146, 0.006, 0.008, 0.007, 0.001, '#222');
    }, { rough: 0.4 });
    b.plane(back, 0, 0.017, 0.0003, 0.16, 0.022, '+z');
    // green SC/APC connector + yellow pigtail out the back, coiling on the desk
    b.box(sm('scapc', { color: '#2fa64a', roughness: 0.45 }), 0.0675, 0.0055, 0.006, 0.009, 0.009, 0.012);
    b.cyl(cordMat('fiber'), 0.0675, 0.01, 0.016, 0.0028, 0.012, 'z', 8, 0.002);
    const pts = [V(0.0675, 0.01, 0.022), V(0.07, 0.009, 0.05), V(0.05, 0.003, 0.09), V(0.0, 0.0022, 0.11), V(-0.05, 0.0022, 0.1), V(-0.06, 0.0022, 0.06), V(-0.02, 0.0022, 0.05), V(0.03, 0.0022, 0.075), V(0.02, 0.0022, 0.12), V(-0.04, 0.0022, 0.17), V(-0.09, 0.0022, 0.21)];
    b.tube(cordMat('fiber'), pts, 0.0016, 60, 5);
    // power cable
    b.tube(cordMat('black'), [V(-0.0455, 0.009, 0.004), V(-0.045, 0.006, 0.04), V(-0.07, 0.002, 0.08), V(-0.12, 0.002, 0.1)], 0.0018, 16, 5);
  });
}
export function ont(name: string) { return inst(name, ontParts(), { kind: 'ont', size: [0.18, 0.032, 0.13] }); }

export function ceilingAP(name: string) {
  const parts = cached('ceilingAP', b => {
    b.cyl(MT.plasticG, 0, -0.002, 0, 0.06, 0.004, 'y', 32);
    b.lathe(MT.plasticW, [[0, -0.039], [0.084, -0.039], [0.094, -0.036], [0.0995, -0.028], [0.1, -0.012], [0.098, -0.006], [0.09, -0.004], [0, -0.004]], 0, 0, 0, 'y', 40);
    const under = decalMat('ap_under', 0.17, 0.17, 2400, p => {
      p.fill('#f3f4f5'); const c = 0.085;
      const gr = p.g.createRadialGradient(p.X(c), p.Y(c), 0, p.X(c), p.Y(c), 0.085 * p.S); gr.addColorStop(0, '#fbfbfb'); gr.addColorStop(1, '#e4e6e8'); p.circle(c, c, 0.085, gr);
      p.ring(c, c, 0.058, '#cfd3d6', 0.004);
      // LED ring (cyan-blue, glows)
      p.ring(c, c, 0.058, '#30a0ff', 0.0022);
      if (p.e) { p.eUsed = true; p.e.shadowColor = '#3aa0ff'; p.e.shadowBlur = 0.01 * p.S; p.ring(c, c, 0.058, '#5ab8ff', 0.003, p.e); p.e.shadowBlur = 0; }
      p.text('NusaAir', c, c - 0.004, 0.014, '#9aa2a9', 'center', 'bold'); p.text('Wi-Fi 6  AX3000', c, c - 0.016, 0.0055, '#aeb5bb', 'center', 'normal');
      p.led(c, c + 0.024, 0.002, '#38ff5c');
    }, { rough: 0.45, metal: 0, emi: 1.6 });
    b.geo(new THREE.CircleGeometry(0.085, 48), under, T(0, -0.0392, 0, Math.PI / 2, 0, 0));
    b.cyl(MT.steelDark, 0, 0.0, 0.03, 0.005, 0.002, 'y', 8); // ceiling screw
  });
  return inst(name, parts, { kind: 'ceilingAP', size: [0.2, 0.039, 0.2], origin: 'top-centre' });
}

export function wallAP(name: string) {
  const parts = cached('wallAP', b => {
    const W = 0.086, H = 0.15, D = 0.03;
    b.box(MT.plasticW, 0, 0, -0.003, W + 0.004, H + 0.004, 0.006);
    b.side(MT.plasticW, rrShape(0.004, 0.004, D - 0.004, H - 0.008, 0.008), -W / 2, W, 0.002);
    const face = decalMat('wallap', W - 0.004, H - 0.012, 3000, p => {
      const w = W - 0.004, h = H - 0.012; p.fill('#f5f6f7'); p.rect(0, 0, w, h, p.vgrad(0, h, '#e8eaec', '#fafbfb'));
      p.rrect(w / 2 - 0.015, h - 0.012, 0.03, 0.004, 0.002, '#cfd5da'); p.glowRect(w / 2 - 0.013, h - 0.0112, 0.026, 0.0024, '#38ff5c', 1);
      p.text('NusaAir', w / 2, h * 0.6, 0.009, '#8e979f', 'center', 'bold'); p.text('W6 in-wall AP', w / 2, h * 0.52, 0.0045, '#a5adb4', 'center', 'normal');
      for (let k = 0; k < 3; k++) p.g.beginPath(), p.g.strokeStyle = '#b5bcc2', p.g.lineWidth = 0.0012 * p.S, p.g.arc(p.X(w / 2), p.Y(h * 0.68), (0.004 + k * 0.004) * p.S, -Math.PI * 0.75, -Math.PI * 0.25), p.g.stroke();
      for (let k = 0; k < 2; k++) { p.rj45(0.012 + k * 0.032, 0.008, 0.016, 0.0155, false, '#c8ced3'); p.text(['LAN1', 'PASS'][k], 0.02 + k * 0.032, 0.0275, 0.0035, '#7a838c', 'center'); }
    }, { rough: 0.4, metal: 0, emi: 1.5 });
    b.plane(face, 0, H / 2, -D - 0.0023, W - 0.004, H - 0.012, '-z');
  });
  return inst(name, parts, { kind: 'wallAP', size: [0.09, 0.154, 0.03] });
}

export function odpBox(name: string) {
  const parts = cached('odpBox', b => {
    const W = 0.24, H = 0.32, D = 0.09, body = sm('odp', { color: '#3a3f44', roughness: 0.6 }), cover = sm('odpc', { color: '#2c3034', roughness: 0.55 });
    b.box(MT.galv, 0, H + 0.005, -0.004, 0.05, 0.05, 0.008); b.box(MT.galv, 0, -0.05, -0.004, 0.05, 0.05, 0.008); // mounting tabs
    b.box(body, 0, 0, -D * 0.4, W, H, D * 0.8);
    b.box(cover, 0, 0.008, -D * 0.8 - 0.009, W - 0.016, H - 0.016, 0.018);
    for (let k = 0; k < 5; k++) b.box(cover, 0, 0.03 + k * 0.065, -D - 0.0018, W - 0.05, 0.004, 0.004);
    for (const s of [-1, 1]) { b.box(MT.black, s * (W / 2 - 0.002), H * 0.25, -D * 0.75, 0.006, 0.03, 0.02); b.box(MT.black, s * (W / 2 - 0.002), H * 0.7, -D * 0.75, 0.006, 0.03, 0.02); }
    const lbl = decalMat('odp_label', 0.16, 0.11, 2600, p => {
      p.fill('#f7f3e2'); p.rect(0, 0.083, 0.16, 0.027, '#f2c230');
      p.text('ODP-NSA-FA/01', 0.08, 0.0905, 0.0145, '#151515', 'center', 'bold', MONO);
      p.text('KAP 8 CORE · SPL 1:8', 0.008, 0.068, 0.0085, '#202020', 'left', 'bold');
      p.text('FEEDER: ODC-NSA-01', 0.008, 0.055, 0.0075, '#303030', 'left', 'normal');
      p.text('PORT 1-8 → PELANGGAN', 0.008, 0.043, 0.0075, '#303030', 'left', 'normal');
      p.rect(0.008, 0.008, 0.026, 0.026, '#111'); for (let i = 0; i < 40; i++) p.rect(0.008 + Math.floor(rnd() * 8) * 0.00325, 0.008 + Math.floor(rnd() * 8) * 0.00325, 0.00325, 0.00325, '#f7f3e2');
      p.text('AWAS KABEL FIBER OPTIK', 0.042, 0.022, 0.0068, '#b0161b', 'left', 'bold'); p.text('JANGAN DIBUKA', 0.042, 0.012, 0.0068, '#b0161b', 'left', 'bold');
    }, { rough: 0.6, metal: 0 });
    b.plane(lbl, 0, H * 0.55, -D - 0.0042, 0.16, 0.11, '-z');
    // glands + drop cables going down
    for (let k = 0; k < 4; k++) {
      const x = -0.075 + k * 0.05;
      b.cyl(MT.black, x, -0.006, -D * 0.45, 0.009, 0.014, 'y', 12);
      b.tube(cordMat('black'), [V(x, -0.012, -D * 0.45), V(x, -0.12, -D * 0.45 - 0.01), V(x * 1.3, -0.35, -D * 0.4 - 0.02 * k), V(x * 1.6, -0.6, -0.03)], 0.0028, 20, 5);
    }
    b.cyl(MT.black, 0.08, H + 0.003, -D * 0.45, 0.011, 0.016, 'y', 12);
    b.tube(cordMat('black'), [V(0.08, H + 0.01, -D * 0.45), V(0.08, H + 0.12, -D * 0.45), V(0.1, H + 0.35, -0.03)], 0.0055, 12, 6);
  });
  return inst(name, parts, { kind: 'odpBox', size: [0.24, 0.32, 0.09], note: 'drop cables hang ~0.6 m below, feeder rises 0.35 m above' });
}

export function upsTower(name: string) {
  const parts = cached('upsTower', b => {
    const W = 0.17, H = 0.25, D = 0.42;
    b.box(MT.black, 0, 0.008, -D / 2 + 0.008, W, H - 0.008, D - 0.016);
    b.side(sm('upsfront', { color: '#1b1d20', roughness: 0.45, metalness: 0.1 }), rrShape(D - 0.026, 0.004, 0.026, H - 0.004, 0.012), -W / 2, W, 0.002);
    const face = decalMat('ups_front', W - 0.02, H - 0.03, 2600, p => {
      const w = W - 0.02, h = H - 0.03; p.fill('#1d1f22'); p.rect(0, 0, w, h, p.vgrad(0, h, '#141517', '#2a2d31'));
      p.text('NusaPower', w / 2, h - 0.022, 0.014, '#ffffff', 'center', 'bold'); p.text('1500VA · LINE-INTERACTIVE', w / 2, h - 0.032, 0.0055, '#9aa3ab', 'center', 'bold');
      upsLCD(p, w / 2 - 0.035, h - 0.085, 0.07, 0.04, 42, 100);
      p.circle(w / 2, 0.075, 0.012, '#0c0d0e'); p.ring(w / 2, 0.075, 0.0095, '#38ff5c', 0.0012); if (p.e) { p.eUsed = true; p.ring(w / 2, 0.075, 0.0095, '#38ff5c', 0.002, p.e); }
      p.ring(w / 2, 0.076, 0.004, '#d5dade', 0.0012); p.rect(w / 2 - 0.0006, 0.076, 0.0012, 0.0055, '#d5dade');
      p.led(w / 2 - 0.03, 0.075, 0.0018, '#38ff5c'); p.led(w / 2 + 0.03, 0.075, 0.0018, '#ffb020', false);
      for (let k = 0; k < 6; k++) p.rrect(0.02, 0.012 + k * 0.006, w - 0.04, 0.0025, 0.001, '#060607');
    }, { rough: 0.45, emi: 1.3 });
    b.plane(face, 0, 0.004 + (H - 0.004) / 2, -D - 0.0023, W - 0.02, H - 0.03, '-z');
    for (const x of [-0.06, 0.06]) for (const z of [-0.04, -0.38]) b.box(MT.rubber, x, 0, z, 0.03, 0.008, 0.03);
    const back = decalMat('ups_back', 0.15, 0.2, 2000, p => { p.fill('#141518'); for (let k = 0; k < 4; k++) { const v = 0.04 + k * 0.035; p.rrect(0.03, v - 0.014, 0.028, 0.028, 0.003, '#060606'); p.circle(0.044, v, 0.0115, '#25272a'); p.circle(0.039, v, 0.002, '#000'); p.circle(0.049, v, 0.002, '#000'); } p.circle(0.105, 0.16, 0.03, '#090909'); for (let r = 0.006; r < 0.03; r += 0.006) p.ring(0.105, 0.16, r, '#2c2f33', 0.0015); p.rect(0.08, 0.04, 0.05, 0.03, '#2a2d31'); p.text('AC IN', 0.105, 0.03, 0.006, '#aaa', 'center'); }, { blink: false });
    b.plane(back, 0, H / 2, 0.0003, 0.15, 0.2, '+z');
  });
  return inst(name, parts, { kind: 'upsTower', size: [0.17, 0.25, 0.42] });
}

// =================================================================================================
// TOOLS (small, real scale)
// =================================================================================================
function poly(pts: [number, number][]) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; }
/** handle grip outline along a straight centre line from (x0,y0) to (x1,y1) with half-width hw and a rounded end */
function gripShape(x0: number, y0: number, x1: number, y1: number, hw0: number, hw1: number) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, ang = Math.atan2(dy, dx);
  const s = new THREE.Shape();
  s.moveTo(x0 + nx * hw0, y0 + ny * hw0); s.lineTo(x1 + nx * hw1, y1 + ny * hw1);
  s.absarc(x1, y1, hw1, ang + Math.PI / 2, ang - Math.PI / 2, true);
  s.lineTo(x0 - nx * hw0, y0 - ny * hw0); s.closePath(); return s;
}
function plierHandles(b: B, grip: THREE.Material, grip2: THREE.Material, xHead: number, len: number, spread: number) {
  for (const s of [-1, 1]) {
    const x0 = xHead, y0 = s * 0.006, x1 = xHead + len, y1 = s * spread;
    b.flat(MT.steelDark, gripShape(x0 - 0.004, y0 * 0.6, x1, y1, 0.004, 0.0035), 0.005, 0.006, 0.0005);
    const t0 = 0.12; const gx0 = x0 + (x1 - x0) * t0, gy0 = y0 + (y1 - y0) * t0;
    b.flat(grip, gripShape(gx0, gy0, x1, y1, 0.0062, 0.0072), 0.001, 0.016, 0.0028);
    const gx1 = x0 + (x1 - x0) * 0.26, gy1 = y0 + (y1 - y0) * 0.26;
    b.flat(grip2, gripShape(gx0 - 0.002, gy0, gx1, gy1, 0.0068, 0.0068), 0.0005, 0.017, 0.003);
  }
}
export function crimpingTool(name: string) {
  const parts = cached('crimper', b => {
    const steel = sm('crimpsteel', { color: '#3c4248', metalness: 0.8, roughness: 0.32 });
    const head = poly([[-0.105, -0.011], [-0.097, -0.019], [-0.035, -0.019], [-0.028, -0.01], [-0.028, 0.01], [-0.035, 0.019], [-0.097, 0.019], [-0.105, 0.011]]);
    for (const [x0, w] of [[-0.090, 0.0125], [-0.074, 0.0105], [-0.060, 0.0085]] as [number, number][]) head.holes.push(rrPath(x0, -0.0045, w, 0.009, 0.001));
    head.holes.push(rrPath(-0.1, 0.009, 0.05, 0.0035, 0.0015)); // stripping/cutting slot
    b.flat(steel, head, 0.004, 0.009, 0.0006);
    // dies (gold-ish teeth) visible in the cavities
    for (const [x0, w] of [[-0.090, 0.0125], [-0.074, 0.0105], [-0.060, 0.0085]] as [number, number][]) b.box(MT.gold, x0 + w / 2, 0.0055, 0.0035, w - 0.002, 0.006, 0.0012);
    b.box(MT.chrome, -0.075, 0.0128, -0.0108, 0.05, 0.0005, 0.0018); // blade edge
    for (const z of [-0.011, 0.011]) { b.cyl(MT.chrome, -0.04, 0.0085, z, 0.0042, 0.0115, 'y', 14); b.cyl(MT.hole, -0.04, 0.0143, z, 0.0012, 0.0004, 'y', 6); }
    b.box(MT.chrome, -0.022, 0.006, 0, 0.012, 0.006, 0.006); // ratchet
    plierHandles(b, MT.red, MT.black, -0.03, 0.135, 0.031);
    // return spring (coil) between handles
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 64; i++) { const t = i / 64, a = t * Math.PI * 2 * 7; pts.push(V(-0.012 + Math.cos(a) * 0.0026, 0.009 + Math.sin(a) * 0.0026, -0.007 + t * 0.014)); }
    b.tube(MT.chrome, pts, 0.0005, 128, 4);
    // printed label on head
    const lbl = decalMat('crimp_lbl', 0.045, 0.012, 6000, p => { p.fill('#3c4248'); p.text('8P · 6P · 4P', 0.0225, 0.0045, 0.0045, '#e4e8eb', 'center', 'bold'); }, { metal: 0.6, rough: 0.4, blink: false });
    b.plane(lbl, -0.068, 0.0131, 0.0135, 0.04, 0.009, '+y', TOPUV);
  });
  return inst(name, parts, { kind: 'crimpingTool', size: [0.21, 0.017, 0.07] });
}

export function cableStripper(name: string) {
  const parts = cached('stripper', b => {
    const jaw = poly([[-0.07, -0.004], [-0.06, -0.011], [-0.03, -0.013], [-0.022, -0.008], [-0.022, 0.008], [-0.03, 0.013], [-0.06, 0.011], [-0.07, 0.004]]);
    [0.0010, 0.0013, 0.0016, 0.002].forEach((r, k) => jaw.holes.push(new THREE.Path().absarc(-0.062 + k * 0.009, 0, r + 0.0006, 0, Math.PI * 2, false)));
    b.flat(MT.steel, jaw, 0.0045, 0.0075, 0.0005);
    b.box(MT.hole, -0.046, 0.0121, 0, 0.044, 0.0002, 0.0006);
    b.cyl(MT.chrome, -0.026, 0.0085, 0, 0.0045, 0.0095, 'y', 14);
    const lbl = decalMat('strip_lbl', 0.04, 0.008, 6000, p => { p.fill('#8e969d'); ['10', '12', '14', '16'].forEach((t, k) => p.text(t, 0.006 + k * 0.009, 0.0025, 0.003, '#202326', 'center', 'bold')); }, { metal: 0.8, rough: 0.35, blink: false });
    b.plane(lbl, -0.052, 0.0122, 0.0072, 0.04, 0.0055, '+y', TOPUV);
    plierHandles(b, MT.yellow, MT.black, -0.022, 0.12, 0.026);
  });
  return inst(name, parts, { kind: 'cableStripper', size: [0.17, 0.017, 0.06] });
}

export function punchDownTool(name: string) {
  const parts = cached('punch', b => {
    const R = 0.0145, y = R;
    b.lathe(MT.yellow, [[0, 0], [0.009, 0.001], [0.0135, 0.006], [R, 0.016], [R, 0.105], [0.013, 0.118], [0.009, 0.125], [0.0065, 0.128], [0, 0.128]], -0.09, y, 0, 'x', 20);
    for (let k = 0; k < 4; k++) b.cyl(MT.black, -0.078 + k * 0.01, y, 0, R + 0.0006, 0.005, 'x', 20);
    b.cyl(MT.black, -0.0925, y, 0, 0.007, 0.006, 'x', 12);                    // impact selector
    b.cyl(MT.chrome, 0.045, y, 0, 0.0055, 0.016, 'x', 12);                    // collar
    b.box(MT.steel, 0.07, y - 0.0035, 0, 0.034, 0.007, 0.0028);              // blade
    b.box(MT.steel, 0.088, y - 0.006, 0, 0.004, 0.0035, 0.0028);              // hook tip
    b.box(MT.steel, 0.0865, y + 0.0024, 0, 0.006, 0.0012, 0.0022);
    const lbl = decalMat('punch_lbl', 0.06, 0.012, 5000, p => { p.fill('#f0b81a'); p.text('NusaTools 110/88', 0.03, 0.0045, 0.0048, '#1b1b1b', 'center', 'bold'); }, { rough: 0.5, blink: false });
    b.geo(new THREE.CylinderGeometry(R + 0.0003, R + 0.0003, 0.05, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), lbl, T(-0.016, y, 0, 0, 0, -Math.PI / 2));
  });
  return inst(name, parts, { kind: 'punchDownTool', size: [0.185, 0.029, 0.029] });
}

export function lanTester(name: string) {
  const parts = cached('lantester', b => {
    const body = sm('tester', { color: '#1c2531', roughness: 0.55 });
    b.flat(body, rrShape(-0.125, -0.035, 0.11, 0.07, 0.008), 0, 0.03, 0.003);
    b.flat(body, rrShape(0.012, -0.035, 0.06, 0.07, 0.008), 0, 0.026, 0.003);
    const main = decalMat('tester_main', 0.098, 0.06, 4000, p => {
      p.fill('#1c2632'); p.rect(0, 0.046, 0.098, 0.014, '#f07a1a');
      p.text('NusaTest', 0.006, 0.0505, 0.0068, '#ffffff', 'left', 'bold'); p.text('LAN CABLE TESTER', 0.092, 0.0505, 0.0042, '#1c2632', 'right', 'bold');
      for (let k = 0; k < 9; k++) { const u = 0.012 + k * 0.0095; p.led(u, 0.034, 0.0022, k === 8 ? '#ffb020' : '#38ff5c', k === 3 || k === 8); p.text(k === 8 ? 'G' : String(k + 1), u, 0.0255, 0.004, '#cfd6dd', 'center', 'bold'); }
      p.rrect(0.01, 0.006, 0.03, 0.012, 0.003, '#0b0f14'); p.rrect(0.024, 0.0075, 0.013, 0.009, 0.002, '#3a4656'); p.text('OFF  ON  S', 0.025, 0.0015, 0.0034, '#cfd6dd', 'center', 'bold');
      p.text('RJ45 · RJ11', 0.088, 0.008, 0.004, '#9fb0c2', 'right', 'bold');
    }, { rough: 0.45, emi: 1.6 });
    b.plane(main, -0.07, 0.0302, 0, 0.098, 0.06, '+y', TOPUV);
    const rem = decalMat('tester_rem', 0.05, 0.06, 4000, p => {
      p.fill('#1c2632'); p.rect(0, 0.046, 0.05, 0.014, '#f07a1a'); p.text('REMOTE', 0.025, 0.0505, 0.0055, '#1c2632', 'center', 'bold');
      for (let k = 0; k < 9; k++) { const u = 0.007 + (k % 5) * 0.009, v = k < 5 ? 0.034 : 0.019; p.led(u, v, 0.002, k === 8 ? '#ffb020' : '#38ff5c', k === 3 || k === 8); p.text(k === 8 ? 'G' : String(k + 1), u, v - 0.0075, 0.0036, '#cfd6dd', 'center', 'bold'); }
    }, { rough: 0.45, emi: 1.6 });
    b.plane(rem, 0.042, 0.0262, 0, 0.05, 0.06, '+y', TOPUV);
    // jacks on the -Z edge and a short grey cable between the units
    for (const [x, h] of [[-0.1, 0.03], [-0.04, 0.03], [0.042, 0.026]] as [number, number][]) b.box(MT.hole, x, h / 2 - 0.006, -0.0352, 0.0118, 0.012, 0.0008);
    b.box(MT.hole, -0.075, 0.013, -0.0352, 0.009, 0.008, 0.0008);
    for (const x of [-0.04, 0.042]) { b.box(MT.clear, x, 0.011, -0.038, 0.0115, 0.008, 0.006); b.box(cordMat('grey'), x, 0.0095, -0.048, 0.0125, 0.011, 0.016); }
    b.tube(cordMat('grey'), [V(-0.04, 0.015, -0.056), V(-0.04, 0.008, -0.075), V(-0.02, 0.003, -0.1), V(0.02, 0.003, -0.1), V(0.042, 0.008, -0.075), V(0.042, 0.015, -0.056)], 0.0028, 30, 5);
  });
  return inst(name, parts, { kind: 'lanTester', size: [0.2, 0.03, 0.17] });
}

function rj45Conn(b: B, m: THREE.Matrix4) {
  b.at(m, () => {
    b.box(MT.clear, 0, 0, 0, 0.0117, 0.0081, 0.021);
    b.boxR(MT.clear, 0, 0.0088, 0.002, 0.0045, 0.001, 0.013, 0.12, 0, 0);
    b.box(MT.gold, 0, 0.0076, -0.0085, 0.0085, 0.0006, 0.003);
    for (let k = 0; k < 8; k++) b.box(MT.hole, -0.0037 + k * 0.00106, 0.0081, -0.0085, 0.0002, 0.0002, 0.0032);
  });
}
export function rj45Bag(name: string) {
  const parts = cached('rj45bag', b => {
    b.box(MT.bag, 0, 0, -0.005, 0.09, 0.014, 0.13);
    b.box(MT.blue, 0, 0.0141, -0.062, 0.088, 0.0012, 0.004); b.box(MT.blue, 0, 0.0141, -0.055, 0.088, 0.0012, 0.0025);
    const lbl = decalMat('bag_lbl', 0.05, 0.03, 5000, p => { p.fill('#ffffff'); p.rect(0, 0.022, 0.05, 0.008, '#1f5fbf'); p.text('RJ45 CAT6', 0.025, 0.0245, 0.0055, '#fff', 'center', 'bold'); p.text('8P8C · 100 pcs', 0.025, 0.014, 0.0042, '#222', 'center', 'bold'); p.text('NusaCable', 0.025, 0.006, 0.004, '#1f5fbf', 'center', 'bold'); }, { rough: 0.7, blink: false });
    b.plane(lbl, 0.012, 0.0143, 0.03, 0.05, 0.03, '+y', TOPUV);
    for (let i = 0; i < 16; i++) { const x = -0.035 + (i % 4) * 0.022 + (rnd() - 0.5) * 0.008, z = -0.045 + Math.floor(i / 4) * 0.026 + (rnd() - 0.5) * 0.01; rj45Conn(b, T(x, 0.0012 + (i % 2) * 0.0025, z, 0, rnd() * Math.PI * 2, 0)); }
    for (let i = 0; i < 5; i++) rj45Conn(b, T(0.06 + rnd() * 0.04, 0, -0.04 + i * 0.022, 0, rnd() * Math.PI * 2, 0));
  });
  return inst(name, parts, { kind: 'rj45Bag', size: [0.15, 0.015, 0.14] });
}

function keystoneFace() { return decalMat('keyface', 0.0145, 0.016, 8000, p => { p.fill('#f1f2f3'); p.rj45(0.0012, 0.0018, 0.0121, 0.0124, false, '', '#101112'); }, { rough: 0.45, blink: false }); }
function keystone(b: B, m: THREE.Matrix4, colour: THREE.Material) {
  b.at(m, () => {
    b.box(colour, 0, 0, -0.014, 0.0145, 0.016, 0.028);
    b.plane(keystoneFace(), 0, 0.008, -0.0283, 0.0145, 0.016, '-z');
    b.box(colour, 0, 0.016, -0.019, 0.006, 0.0018, 0.008);
    const pc = [MT.blue, MT.orange, sm('idcG', { color: '#2b9a48', roughness: 0.5 }), sm('idcBr', { color: '#7a4a28', roughness: 0.5 })];
    for (let k = 0; k < 4; k++) b.box(pc[k], -0.0045 + (k % 2) * 0.009, 0.0035 + Math.floor(k / 2) * 0.007, -0.0005, 0.005, 0.005, 0.003);
  });
}
export function keystoneJacks(name: string, n = 6) {
  const parts = cached('keystones' + n, b => {
    for (let i = 0; i < n; i++) {
      const x = (i % 3 - 1) * 0.03 + (rnd() - 0.5) * 0.01, z = Math.floor(i / 3) * 0.035 - 0.015, ry = (rnd() - 0.5) * 1.2;
      const col = i % 4 === 3 ? MT.blue : MT.plasticW;
      if (i % 2) keystone(b, T(x, 0.00725, z, 0, ry, Math.PI / 2), col); else keystone(b, T(x, 0, z + 0.014, 0, ry, 0), col);
    }
  });
  return inst(name, parts, { kind: 'keystoneJacks', size: [0.1, 0.018, 0.08] });
}

export function utpBox(name: string) {
  const parts = cached('utpbox', b => {
    const W = 0.36, H = 0.36, D = 0.21;
    const front = decalMat('utp_front', W, H, 1400, p => {
      p.fill('#f6f7f8'); p.rect(0, H - 0.07, W, 0.07, '#1d4f9c'); p.rect(0, H - 0.078, W, 0.008, '#f2c230');
      p.text('NusaCable', 0.02, H - 0.045, 0.03, '#ffffff', 'left', 'bold'); p.text('NETWORK CABLE', W - 0.02, H - 0.045, 0.016, '#cfe0ff', 'right', 'bold');
      p.text('UTP CAT6', 0.02, 0.2, 0.058, '#1d4f9c', 'left', 'bold');
      p.text('23 AWG · 4 PAIR · SOLID COPPER', 0.02, 0.168, 0.0155, '#333', 'left', 'bold');
      p.text('305 m', 0.02, 0.105, 0.05, '#e8701a', 'left', 'bold'); p.text('/ 1000 ft', 0.02, 0.088, 0.013, '#e8701a', 'left', 'bold');
      p.text('250 MHz · PVC CM · BIRU', 0.02, 0.068, 0.013, '#555', 'left', 'normal');
      p.circle(0.27, 0.13, 0.055, '#e8edf4'); p.ring(0.27, 0.13, 0.055, '#1d4f9c', 0.004); p.text('PULL', 0.27, 0.098, 0.014, '#1d4f9c', 'center', 'bold');
      for (let k = 0; k < 4; k++) p.rect(0.02 + k * 0.05, 0.025, 0.04, 0.02, ['#1f5fbf', '#e8701a', '#2b9a48', '#7a4a28'][k]);
      p.text('PAIR', 0.23, 0.03, 0.014, '#555', 'left', 'bold');
    }, { rough: 0.9, metal: 0, blink: false });
    const sideM = decalMat('utp_side', D, H, 1400, p => {
      p.fill('#1d4f9c'); p.rect(0, 0.06, D, 0.006, '#f2c230');
      p.g.save(); p.g.translate(p.X(0.12), p.Y(0.2)); p.g.rotate(-Math.PI / 2); p.g.font = `bold ${0.06 * p.S}px ${FONT}`; p.g.fillStyle = '#ffffff'; p.g.textAlign = 'center'; p.g.fillText('CAT6', 0, 0); p.g.restore();
      p.text('305 m', D / 2, 0.025, 0.022, '#f2c230', 'center', 'bold');
    }, { rough: 0.9, metal: 0, blink: false });
    const topM = decalMat('utp_top', W, D, 1400, p => { p.fill('#eef0f2'); p.rect(0, D / 2 - 0.002, W, 0.004, '#c9a77c'); p.rrect(W / 2 - 0.05, D / 2 - 0.015, 0.1, 0.03, 0.015, '#2a2016'); p.text('NusaCable · UTP CAT6 · 305m', W / 2, 0.03, 0.014, '#1d4f9c', 'center', 'bold'); }, { rough: 0.9, metal: 0, blink: false });
    b.box(MT.cardboard, 0, 0, -D / 2, W, H, D);
    b.plane(front, 0, H / 2, -D - 0.0004, W, H, '-z'); b.plane(front, 0, H / 2, 0.0004, W, H, '+z');
    b.plane(sideM, W / 2 + 0.0004, H / 2, -D / 2, D, H, '+x'); b.plane(sideM, -W / 2 - 0.0004, H / 2, -D / 2, D, H, '-x');
    b.plane(topM, 0, H + 0.0004, -D / 2, W, D, '+y', TOPUV);
    // reel-ex grommet & cable
    const gx = -0.09, gy = 0.13, z0 = -D - 0.001;
    b.torus(MT.black, gx, gy, z0, 0.012, 0.004, 0, 0, 20); b.cyl(MT.hole, gx, gy, z0 + 0.003, 0.009, 0.002, 'z', 16);
    const pts: THREE.Vector3[] = [V(gx, gy, z0 + 0.004), V(gx, gy, z0 - 0.03), V(gx - 0.01, gy - 0.06, z0 - 0.08), V(gx - 0.03, 0.004, z0 - 0.15)];
    const c = V(gx - 0.12, 0.0035, z0 - 0.3);
    for (let i = 0; i <= 26; i++) { const t = i / 26, a = -Math.PI / 2 - 0.4 + t * Math.PI * 2 * 1.7, r = 0.1 + 0.02 * Math.sin(t * 9); pts.push(V(c.x + Math.cos(a) * r, 0.0035 + 0.004 * Math.max(0, Math.sin(t * Math.PI * 3.4)), c.z + Math.sin(a) * r * 0.85)); }
    pts.push(V(c.x - 0.25, 0.0033, c.z - 0.08));
    b.tube(cordMat('blue'), pts, 0.003, 160, 6);
  });
  return inst(name, parts, { kind: 'utpBox', size: [0.36, 0.36, 0.21], note: 'loose cable coils ~0.5 m in front' });
}

export function cableReel(name: string) {
  const parts = cached('cablereel', b => {
    const R = 0.15, Wd = 0.2, y = R;
    const flange = decalMat('reel_flange', 0.3, 0.3, 1200, p => {
      const c = 0.15; p.fill('#b88a58'); p.circle(c, c, 0.15, '#c39563');
      for (let r = 0.02; r < 0.15; r += 0.006 + rnd() * 0.006) p.ring(c, c, r, `rgba(110,70,35,${0.15 + rnd() * 0.2})`, 0.0015);
      p.circle(c, c, 0.022, '#2a1c10'); p.circle(c, c, 0.016, '#0c0805');
      p.text('NusaCable', c, c + 0.075, 0.022, '#1d4f9c', 'center', 'bold'); p.text('UTP CAT6 · 500 m', c, c - 0.07, 0.016, '#1d4f9c', 'center', 'bold');
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; p.circle(c + Math.cos(a) * 0.045, c + Math.sin(a) * 0.045, 0.004, '#5a3c20'); }
    }, { rough: 0.85, metal: 0, blink: false });
    for (const s of [-1, 1]) {
      b.cyl(MT.wood, s * (Wd / 2 - 0.006), y, 0, R, 0.012, 'x', 40);
      b.geo(new THREE.CircleGeometry(R - 0.001, 40), flange, T(s * (Wd / 2 + 0.0002), y, 0, 0, s * Math.PI / 2, 0));
    }
    const wind = decalMat('reel_wind', 0.05, 0.05, 2000, p => {
      p.fill('#1d4f9c'); for (let k = 0; k < 8; k++) { const v = k * 0.00625; p.rect(0, v, 0.05, 0.00625, p.vgrad(v, v + 0.00625, '#163e7c', '#3a78d4')); p.rect(0, v + 0.0045, 0.05, 0.0008, 'rgba(255,255,255,0.35)'); }
      p.text('NusaCable CAT6 23AWG', 0.002, 0.012, 0.004, 'rgba(255,255,255,0.5)', 'left', 'bold');
    }, { repeat: true, rough: 0.5, metal: 0, blink: false });
    const cg = new THREE.CylinderGeometry(0.118, 0.118, Wd - 0.024, 48, 1, true); const ua = cg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < ua.count; i++) ua.setXY(i, ua.getY(i) * (Wd - 0.024) / 0.05, ua.getX(i) * 0.74 / 0.05);
    b.geo(cg, wind, T(0, y, 0, 0, 0, -Math.PI / 2));
    b.tube(cordMat('blue'), [V(0.03, y + 0.118, 0), V(0.035, y + 0.11, -0.06), V(0.04, y + 0.03, -0.14), V(0.05, 0.004, -0.2), V(0.1, 0.0032, -0.35), V(0.16, 0.0032, -0.42)], 0.003, 50, 6);
  });
  return inst(name, parts, { kind: 'cableReel', size: [0.2, 0.3, 0.3], origin: 'bottom-centre (axle along X)' });
}

export function multimeter(name: string) {
  const parts = cached('multimeter', b => {
    const W = 0.078, H = 0.165;
    b.flat(MT.yellow, rrShape(-0.045, -0.09, 0.09, 0.18, 0.012), 0, 0.036, 0.004);
    const face = decalMat('dmm_face', W, H, 4000, p => {
      p.fill('#2b2e32');
      // display near the far (+Z) end (image top)
      p.rrect(0.006, 0.112, W - 0.012, 0.045, 0.003, '#111');
      p.glowRect(0.009, 0.115, W - 0.018, 0.039, '#9fb59a', 0.18);
      p.text('230.4', W - 0.012, 0.123, 0.0185, '#14181a', 'right', 'bold', MONO);
      p.text('AC', 0.012, 0.145, 0.0055, '#14181a', 'left', 'bold'); p.text('V', W - 0.012, 0.145, 0.007, '#14181a', 'right', 'bold'); p.text('AUTO', 0.012, 0.118, 0.0045, '#14181a', 'left', 'bold');
      ['HOLD', 'RANGE', 'SEL', 'LIGHT'].forEach((t, k) => { p.rrect(0.006 + k * 0.0172, 0.098, 0.015, 0.008, 0.002, '#4a4f55'); p.text(t, 0.0135 + k * 0.0172, 0.0995, 0.003, '#e8e8e8', 'center', 'bold'); });
      const cu = W / 2, cv = 0.064;
      p.circle(cu, cv, 0.03, '#202326');
      const marks = ['OFF', 'V~', 'V⎓', 'mV', 'Ω', '•))', '⊣⊢', 'A', 'mA', 'Hz'];
      marks.forEach((t, k) => { const a = Math.PI / 2 + 0.3 - k * (Math.PI * 2 - 0.6) / marks.length; p.text(t, cu + Math.cos(a) * 0.027, cv + Math.sin(a) * 0.027 - 0.0017, 0.0042, k === 1 ? '#f2c230' : '#e8e8e8', 'center', 'bold'); });
      p.text('NusaMeter DM-21', W / 2, 0.0365, 0.0045, '#f2c230', 'center', 'bold');
      [['10A', '#d02828'], ['mA', '#d02828'], ['COM', '#222'], ['VΩ', '#d02828']].forEach(([t, c], k) => { const u = 0.012 + k * 0.018; p.circle(u, 0.016, 0.0058, c as string); p.circle(u, 0.016, 0.0034, '#050505'); p.text(t as string, u, 0.0045, 0.0036, '#e8e8e8', 'center', 'bold'); });
    }, { rough: 0.5, emi: 0.9, blink: false });
    // decal (TOPUV): u -> x = W/2 - u, v -> z = v - H/2
    b.plane(face, 0, 0.0362, 0, W, H, '+y', TOPUV);
    const dx = (u: number) => W / 2 - u, dz = (v: number) => v - H / 2;
    b.cyl(MT.black, dx(W / 2), 0.039, dz(0.064), 0.019, 0.006, 'y', 28);
    b.box(MT.black, dx(W / 2), 0.042, dz(0.064), 0.008, 0.004, 0.034);
    b.box(MT.plasticW, dx(W / 2), 0.0461, dz(0.064) + 0.011, 0.0018, 0.0003, 0.012);
    // leads (VΩ red, COM black) with probes
    const jack = (k: number) => V(dx(0.012 + k * 0.018), 0.037, dz(0.016));
    for (const [k, col, side] of [[3, 'red', -1], [2, 'black', 1]] as [number, string, number][]) {
      const j = jack(k); b.cyl(cordMat(col), j.x, j.y + 0.008, j.z, 0.004, 0.016, 'y', 10);
      const end = V(j.x + side * 0.12, 0.006, j.z - 0.14);
      b.tube(cordMat(col), [V(j.x, j.y + 0.016, j.z), V(j.x, j.y + 0.03, j.z - 0.02), V(j.x + side * 0.03, 0.02, j.z - 0.08), V(j.x + side * 0.08, 0.004, j.z - 0.1), V(j.x + side * 0.15, 0.004, j.z - 0.06), end], 0.0016, 40, 5);
      const dir = V(side * 0.6, 0, -0.8).normalize(), p1 = end.clone().addScaledVector(dir, 0.085), p2 = p1.clone().addScaledVector(dir, 0.03);
      rod(b, cordMat(col), end, p1, 0.0062, 0.0045, 10); rod(b, MT.chrome, p1, p2, 0.0012, 0.0005, 6);
    }
  });
  return inst(name, parts, { kind: 'multimeter', size: [0.09, 0.046, 0.18], note: 'leads extend ~0.25 m toward -Z' });
}

export function wireTray(name: string) {
  const parts = cached('wiretray', b => {
    const W = 0.28, D = 0.18, H = 0.045, t = 0.002, base = sm('trayblue', { color: '#2f6fb3', roughness: 0.4 });
    b.box(base, 0, 0, 0, W, t, D);
    b.box(base, 0, 0, -D / 2 + t / 2, W, H, t); b.box(base, 0, 0, D / 2 - t / 2, W, H, t); b.box(base, -W / 2 + t / 2, 0, 0, t, H, D); b.box(base, W / 2 - t / 2, 0, 0, t, H, D);
    for (const x of [-W / 6, W / 6]) b.box(base, x, 0, 0, t, H * 0.85, D - 2 * t);
    b.box(base, 0, 0, 0, W - 2 * t, H * 0.85, t);
    // contents: connectors, keystones, cable ties, screws
    for (let i = 0; i < 9; i++) rj45Conn(b, T(-W / 3 + (rnd() - 0.5) * 0.06, t + 0.001 + (i % 3) * 0.004, -D / 4 + (rnd() - 0.5) * 0.05, rnd(), rnd() * 6, rnd() * 0.5));
    for (let i = 0; i < 3; i++) keystone(b, T(-0.02 + i * 0.022, t + 0.00725, -D / 4 + (i - 1) * 0.012, 0, rnd(), Math.PI / 2), i === 1 ? MT.blue : MT.plasticW);
    for (let i = 0; i < 8; i++) b.torus(i % 2 ? MT.black : MT.plasticW, W / 3 + (rnd() - 0.5) * 0.04, t + 0.002 + i * 0.0012, -D / 4 + (rnd() - 0.5) * 0.04, 0.018 + rnd() * 0.008, 0.0012, Math.PI / 2, 0, 20);
    for (let i = 0; i < 20; i++) { const x = -W / 3 + (rnd() - 0.5) * 0.06, z = D / 4 + (rnd() - 0.5) * 0.05; b.cyl(MT.chrome, x, t + 0.002, z, 0.0022, 0.0012, 'y', 8); }
    for (let i = 0; i < 4; i++) b.cyl(i % 2 ? MT.red : MT.blue, (rnd() - 0.5) * 0.06, t + 0.006 + i * 0.001, D / 4 + (rnd() - 0.5) * 0.04, 0.012, 0.01, 'x', 14);  // velcro rolls / tape
    for (let i = 0; i < 6; i++) b.boxR(MT.plasticW, W / 3 + (rnd() - 0.5) * 0.05, t + 0.003, D / 4 + (rnd() - 0.5) * 0.05, 0.016, 0.004, 0.022, 0, rnd() * 3, 0); // cable clips
  });
  return inst(name, parts, { kind: 'wireTray', size: [0.28, 0.2, 0.2] });
}

export function esdMat(name: string, o: { w?: number; d?: number; color?: 'blue' | 'green' } = {}) {
  const w = o.w ?? 0.6, d = o.d ?? 0.5, col = o.color ?? 'blue';
  const parts = cached(`esd_${w}_${d}_${col}`, b => {
    const base = col === 'blue' ? '#2f6fb8' : '#2f8a57';
    const top = decalMat('esd_' + col, 0.2, 0.2, 1500, p => {
      p.fill(base); p.noise(2500, 0.08); p.noise(1200, 0.05, true);
      for (let k = 0; k <= 8; k++) { p.rect(k * 0.025 - 0.0004, 0, 0.0008, 0.2, 'rgba(255,255,255,0.22)'); p.rect(0, k * 0.025 - 0.0004, 0.2, 0.0008, 'rgba(255,255,255,0.22)'); }
    }, { repeat: true, rough: 0.92, metal: 0, blink: false });
    b.box(MT.rubber, 0, 0, 0, w, 0.0018, d);
    b.plane(top, 0, 0.0021, 0, w, d, '+y', [0, 0, w / 0.2, d / 0.2]);
    const logo = decalMat('esd_logo', 0.12, 0.04, 2000, p => { p.fill(base); p.rrect(0.002, 0.002, 0.116, 0.036, 0.004, '#f2c230'); p.text('⏚ ESD SAFE', 0.06, 0.016, 0.016, '#1b1b1b', 'center', 'bold'); }, { rough: 0.9, metal: 0, blink: false });
    b.plane(logo, w / 2 - 0.075, 0.0023, d / 2 - 0.03, 0.12, 0.04, '+y', TOPUV);
    // ground snap + coiled cord + wrist strap
    const sx = -w / 2 + 0.025, sz = d / 2 - 0.025;
    b.cyl(MT.chrome, sx, 0.0035, sz, 0.006, 0.003, 'y', 14);
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * Math.PI * 2 * 18; pts.push(V(sx + 0.01 + t * 0.2 + 0, 0.008 + Math.sin(a) * 0.004, sz + 0.02 + Math.cos(a) * 0.004 + Math.sin(t * Math.PI) * 0.04)); }
    b.tube(sm('esdcord', { color: '#1e1f22', roughness: 0.5 }), [V(sx, 0.005, sz), V(sx + 0.005, 0.008, sz + 0.012), ...pts.slice(1)], 0.0014, 360, 4);
    b.torus(sm('esdband', { color: '#1d4f9c', roughness: 0.8 }), sx + 0.24, 0.006, sz + 0.03, 0.03, 0.005, Math.PI / 2, 0, 28);
    b.box(MT.chrome, sx + 0.21, 0.004, sz + 0.03, 0.012, 0.006, 0.014);
  });
  return inst(name, parts, { kind: 'esdMat', size: [w, 0.002, d], origin: 'bottom-centre' });
}

// =================================================================================================
// SCREENS (canvas, px coordinates, top-left origin)
// =================================================================================================
export type ScreenKind = 'winbox' | 'terminal' | 'topology' | 'traffic' | 'status' | 'alerts';
function screenMat(kind: ScreenKind, emi = 1.0) {
  return decalMat('scr_' + kind, 1024, 576, 1, p => { SCREENS[kind](p.g, 1024, 576); p.emitAll(1); }, { rough: 0.22, metal: 0.1, emi, blink: false });
}
const F = (g: CanvasRenderingContext2D, size: number, weight = 'normal', mono = false) => { g.font = `${weight} ${size}px ${mono ? MONO : FONT}`; };
function tx(g: CanvasRenderingContext2D, t: string, x: number, y: number, c: string, size = 13, weight = 'normal', mono = false, align: CanvasTextAlign = 'left') { F(g, size, weight, mono); g.fillStyle = c; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(t, x, y); }
function win(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, active = true) {
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 4, y + 4, w, h);
  g.fillStyle = '#f0f0f0'; g.fillRect(x, y, w, h);
  g.fillStyle = active ? '#d6dbe3' : '#e4e6ea'; g.fillRect(x, y, w, 22); g.strokeStyle = '#8f98a3'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  tx(g, title, x + 8, y + 15, '#1b1f24', 12, 'bold');
  ['#e7e7e7', '#e7e7e7', '#d9534f'].forEach((c, k) => { g.fillStyle = c; g.fillRect(x + w - 66 + k * 21, y + 3, 18, 16); });
}
const SCREENS: Record<ScreenKind, (g: CanvasRenderingContext2D, W: number, H: number) => void> = {
  winbox(g, W, H) {
    g.fillStyle = '#c3c9d1'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e9ecf0'; g.fillRect(0, 0, W, 26); tx(g, 'admin@192.168.88.1 (NusaRouter) - WinBox (64bit) v3.40 on CR-1009', 10, 18, '#1b1f24', 13, 'bold');
    g.fillStyle = '#dde1e6'; g.fillRect(0, 26, W, 26); tx(g, '↶  ↷   ☐ Safe Mode        Session: 192.168.88.1', 10, 44, '#333', 12);
    g.fillStyle = '#ffffff'; g.fillRect(0, 52, 26, H - 52); g.fillStyle = '#1e3f73'; g.fillRect(0, 52, 26, H - 52);
    g.save(); g.translate(18, H - 12); g.rotate(-Math.PI / 2); tx(g, 'RouterOS WinBox', 0, 0, '#cfe0ff', 15, 'bold'); g.restore();
    g.fillStyle = '#f4f5f7'; g.fillRect(26, 52, 150, H - 52);
    const menu = ['Quick Set', 'CAPsMAN', 'Interfaces', 'Wireless', 'Bridge', 'PPP', 'Switch', 'Mesh', 'IP', 'IPv6', 'Routing', 'System', 'Queues', 'Files', 'Log', 'RADIUS', 'Tools', 'New Terminal', 'Dot1X', 'Make Supout.rif'];
    const ic = ['#e8701a', '#2b9a48', '#1f5fbf', '#1f5fbf', '#7b3fb5', '#2b9a48', '#1f5fbf', '#e8701a', '#c8282b', '#c8282b', '#2b9a48', '#555', '#e8b923', '#555', '#555', '#7b3fb5', '#c8282b', '#111', '#1f5fbf', '#555'];
    menu.forEach((m, k) => { const y = 62 + k * 24; if (k === 2) { g.fillStyle = '#cfe0f7'; g.fillRect(28, y - 2, 146, 22); } g.fillStyle = ic[k]; g.fillRect(34, y + 3, 13, 13); tx(g, m, 54, y + 14, '#1b1f24', 13); if (k === 8 || k === 9 || k === 10 || k === 11) tx(g, '▸', 166, y + 14, '#555', 11, 'normal', false, 'right'); });
    // Interface list
    win(g, 190, 64, 600, 250, 'Interface List');
    tx(g, 'Interface   Ethernet   EoIP Tunnel   IP Tunnel   GRE Tunnel   VLAN   VRRP   Bonding   LTE', 198, 104, '#333', 12);
    g.fillStyle = '#e4e7eb'; g.fillRect(194, 112, 592, 24); ['+', '−', '✔', '✖', '▭', '⚲'].forEach((s, k) => tx(g, s, 205 + k * 26, 130, ['#2b9a48', '#c8282b', '#2b9a48', '#c8282b', '#555', '#555'][k], 15, 'bold'));
    g.fillStyle = '#ffffff'; g.fillRect(194, 138, 592, 172);
    const cols = [['Name', 200], ['Type', 345], ['Actual MTU', 450], ['L2 MTU', 530], ['Tx', 600], ['Rx', 690]] as [string, number][];
    g.fillStyle = '#e9ecf0'; g.fillRect(194, 138, 592, 20); cols.forEach(([c, x]) => tx(g, c, x, 153, '#222', 12, 'bold'));
    const rows = [['R  ether1-WAN', 'Ethernet', '1500', '1598', '12.4 Mbps', '48.9 Mbps'], ['R  ether2-LAB-A', 'Ethernet', '1500', '1598', '33.1 Mbps', '6.2 Mbps'], ['R  ether3-LAB-B', 'Ethernet', '1500', '1598', '21.7 Mbps', '4.8 Mbps'], ['R  ether4-SERVER', 'Ethernet', '1500', '1598', '8.3 Mbps', '1.9 Mbps'], ['X  ether5', 'Ethernet', '1500', '1598', '0 bps', '0 bps'], ['R  bridge-LAN', 'Bridge', '1500', '1598', '61.2 Mbps', '12.9 Mbps'], ['R  vlan10-GURU', 'VLAN', '1500', '1594', '3.2 Mbps', '0.7 Mbps'], ['R  wlan1', 'Wireless', '1500', '1600', '15.0 Mbps', '2.2 Mbps']];
    rows.forEach((r, k) => { const y = 174 + k * 17; if (k === 1) { g.fillStyle = '#3875d7'; g.fillRect(195, y - 13, 590, 17); } r.forEach((c, j) => tx(g, c, cols[j][1], y, k === 1 ? '#fff' : k === 4 ? '#999' : '#111', 12, 'normal')); });
    // Address list
    win(g, 190, 330, 290, 200, 'Address List', false);
    g.fillStyle = '#fff'; g.fillRect(194, 356, 282, 170); g.fillStyle = '#e9ecf0'; g.fillRect(194, 356, 282, 18); tx(g, 'Address', 200, 369, '#222', 12, 'bold'); tx(g, 'Network', 320, 369, '#222', 12, 'bold'); tx(g, 'Interface', 410, 369, '#222', 12, 'bold');
    [['10.10.10.2/30', '10.10.10.0', 'ether1'], ['192.168.10.1/24', '192.168.10.0', 'ether2'], ['192.168.20.1/24', '192.168.20.0', 'ether3'], ['192.168.30.1/24', '192.168.30.0', 'ether4'], ['172.16.0.1/24', '172.16.0.0', 'vlan10']].forEach((r, k) => r.forEach((c, j) => tx(g, c, [200, 320, 410][j], 390 + k * 18, '#111', 12)));
    // Terminal
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(504, 334, 500, 230);
    g.fillStyle = '#0c0c0c'; g.fillRect(500, 330, 500, 230); g.fillStyle = '#d6dbe3'; g.fillRect(500, 330, 500, 22); tx(g, 'Terminal <1>', 508, 345, '#111', 12, 'bold');
    const term: [string, string][] = [['  MMM      MMM       KKK                          TTTTTTTTTTT      KKK', '#3a8bff'], ['  MMMM    MMMM       KKK    NusaRouter OS 7.15    TTT  (c) TKJ', '#3a8bff'], ['', ''], ['[admin@NusaRouter] > ip address print', '#7cf3a8'], ['Flags: D - DYNAMIC', '#ddd'], [' #   ADDRESS            NETWORK        INTERFACE', '#fff'], [' 0   10.10.10.2/30      10.10.10.0     ether1-WAN', '#ddd'], [' 1   192.168.10.1/24    192.168.10.0   ether2-LAB-A', '#ddd'], ['[admin@NusaRouter] > ping 8.8.8.8 count=3', '#7cf3a8'], ['  SEQ HOST          SIZE TTL TIME  STATUS', '#fff'], ['    0 8.8.8.8         56 117 14ms', '#ddd'], ['    1 8.8.8.8         56 117 13ms', '#ddd'], ['[admin@NusaRouter] > █', '#7cf3a8']];
    term.forEach(([t, c], k) => tx(g, t, 506, 370 + k * 14.5, c, 12, 'normal', true));
  },
  terminal(g, W, H) {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b3036'; g.fillRect(0, 0, W, 28); tx(g, 'COM3 - PuTTY  ·  NusaSwitch SG-2428M console 9600 8N1', 12, 19, '#e6e6e6', 13, 'bold');
    const L: [string, string][] = [
      ['SW-LAB-A>enable', '#e6edf3'], ['SW-LAB-A#configure terminal', '#e6edf3'], ['Enter configuration commands, one per line.  End with CNTL/Z.', '#8b949e'],
      ['SW-LAB-A(config)#vlan 10', '#e6edf3'], ['SW-LAB-A(config-vlan)#name GURU', '#e6edf3'], ['SW-LAB-A(config-vlan)#exit', '#e6edf3'],
      ['SW-LAB-A(config)#interface range gi0/1 - 12', '#e6edf3'], ['SW-LAB-A(config-if-range)#switchport mode access', '#e6edf3'], ['SW-LAB-A(config-if-range)#switchport access vlan 10', '#e6edf3'], ['SW-LAB-A(config-if-range)#end', '#e6edf3'],
      ['SW-LAB-A#show vlan brief', '#7ee787'], ['', ''],
      ['VLAN Name                 Status    Ports', '#ffffff'], ['---- -------------------- --------- -------------------------------', '#8b949e'],
      ['1    default              active    Gi0/13, Gi0/14, Gi0/15, Gi0/16', '#e6edf3'], ['10   GURU                 active    Gi0/1, Gi0/2, Gi0/3, Gi0/4, Gi0/5', '#e6edf3'], ['20   SISWA                active    Gi0/17, Gi0/18, Gi0/19, Gi0/20', '#e6edf3'], ['99   MANAGEMENT           active    Gi0/24', '#e6edf3'],
      ['', ''], ['SW-LAB-A#ping 192.168.10.1', '#7ee787'], ['Sending 5, 100-byte ICMP Echos to 192.168.10.1, timeout is 2 seconds:', '#e6edf3'], ['!!!!!', '#7ee787'], ['Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms', '#e6edf3'], ['SW-LAB-A#█', '#7ee787']];
    L.forEach(([t, c], k) => tx(g, t, 14, 50 + k * 21.5, c, 16, 'normal', true));
  },
  topology(g, W, H) {
    g.fillStyle = '#081420'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80,140,200,0.08)'; for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    tx(g, 'TOPOLOGI JARINGAN · KOTA NUSANTARA', 24, 38, '#e8f3ff', 24, 'bold'); tx(g, 'LIVE  10:42:07 WIB', W - 24, 38, '#7cf3a8', 18, 'bold', true, 'right');
    const N: Record<string, [number, number, string, string]> = { inet: [512, 90, 'INTERNET', '#7cb7ff'], isp: [512, 165, 'ISP · 10.10.10.1', '#7cb7ff'], rt: [512, 245, 'NusaRouter CR-1009', '#ffd36a'], core: [512, 325, 'CORE SW', '#7cf3a8'], d1: [200, 410, 'SW LAB-A', '#7cf3a8'], d2: [420, 410, 'SW LAB-B', '#7cf3a8'], d3: [640, 410, 'SW HOTEL', '#7cf3a8'], d4: [850, 410, 'SW RUKO', '#ff6b6b'], srv: [830, 245, 'SERVER · DNS/DHCP', '#c9a7ff'], olt: [200, 245, 'OLT · ODP', '#ffd36a'] };
    const E: [string, string, boolean][] = [['inet', 'isp', true], ['isp', 'rt', true], ['rt', 'core', true], ['core', 'd1', true], ['core', 'd2', true], ['core', 'd3', true], ['core', 'd4', false], ['rt', 'srv', true], ['rt', 'olt', true]];
    for (const [a, b2, up] of E) { const A = N[a], Bn = N[b2]; g.strokeStyle = up ? '#2bd46b' : '#ff4040'; g.lineWidth = up ? 4 : 3; g.setLineDash(up ? [] : [10, 8]); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(Bn[0], Bn[1]); g.stroke(); }
    g.setLineDash([]);
    for (const k in N) { const [x, y, l, c] = N[k]; g.fillStyle = '#0f2233'; g.strokeStyle = c; g.lineWidth = 2.5; g.beginPath(); g.roundRect(x - 80, y - 20, 160, 40, 8); g.fill(); g.stroke(); tx(g, l, x, y + 6, c, 14, 'bold', false, 'center'); }
    for (let i = 0; i < 6; i++) { const x = 130 + i * 140, y = 500; g.strokeStyle = '#2bd46b'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 18); g.lineTo(i < 2 ? 200 : i < 4 ? 420 : 640, 430); g.stroke(); g.fillStyle = '#123'; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); g.strokeStyle = '#7cb7ff'; g.stroke(); tx(g, 'AP-0' + (i + 1), x, y + 36, '#9fc3e8', 12, 'bold', false, 'center'); }
    g.fillStyle = 'rgba(255,64,64,0.15)'; g.fillRect(770, 470, 230, 80); g.strokeStyle = '#ff4040'; g.strokeRect(770, 470, 230, 80); tx(g, '⚠ LINK DOWN', 785, 497, '#ff6b6b', 17, 'bold'); tx(g, 'CORE gi0/4 → SW RUKO', 785, 520, '#ffd0d0', 13); tx(g, 'cek kabel / konektor RJ45', 785, 539, '#ffd0d0', 13);
  },
  traffic(g, W, H) {
    g.fillStyle = '#0a121b'; g.fillRect(0, 0, W, H);
    tx(g, 'TRAFFIC · ether1-WAN · 24 JAM', 24, 38, '#e8f3ff', 22, 'bold');
    tx(g, '↓ 482 Mbps', W - 190, 40, '#2bd46b', 24, 'bold', false, 'right'); tx(g, '↑ 126 Mbps', W - 24, 40, '#3a8bff', 24, 'bold', false, 'right');
    const x0 = 70, y0 = 70, w = W - 100, h = H - 130;
    g.strokeStyle = 'rgba(160,190,220,0.15)'; g.lineWidth = 1;
    for (let k = 0; k <= 5; k++) { const y = y0 + h * k / 5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); tx(g, `${(5 - k) * 200}`, x0 - 10, y + 5, '#7f93a8', 13, 'normal', true, 'right'); }
    for (let k = 0; k <= 12; k++) { const x = x0 + w * k / 12; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke(); tx(g, `${String(k * 2).padStart(2, '0')}:00`, x, y0 + h + 20, '#7f93a8', 12, 'normal', true, 'center'); }
    const series = (amp: number, base: number, ph: number) => { const pts: [number, number][] = []; for (let i = 0; i <= 120; i++) { const t = i / 120; const day = Math.max(0, Math.sin((t - 0.28) * Math.PI * 1.15)); const v = base + amp * day + 40 * Math.sin(t * 60 + ph) * rnd(); pts.push([x0 + w * t, y0 + h - Math.min(980, v) / 1000 * h]); } return pts; };
    const din = series(620, 90, 0), dout = series(180, 30, 2);
    const grd = g.createLinearGradient(0, y0, 0, y0 + h); grd.addColorStop(0, 'rgba(43,212,107,0.55)'); grd.addColorStop(1, 'rgba(43,212,107,0.05)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(x0, y0 + h); din.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(x0 + w, y0 + h); g.fill();
    g.strokeStyle = '#2bd46b'; g.lineWidth = 2; g.beginPath(); din.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.strokeStyle = '#3a8bff'; g.lineWidth = 2.5; g.beginPath(); dout.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.strokeStyle = '#ffb020'; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(x0, y0 + h * 0.3); g.lineTo(x0 + w, y0 + h * 0.3); g.stroke(); g.setLineDash([]); tx(g, '95th = 700 Mbps', x0 + w - 6, y0 + h * 0.3 - 6, '#ffb020', 13, 'bold', true, 'right');
    tx(g, 'Mbps', 18, y0 - 8, '#7f93a8', 13, 'bold');
  },
  status(g, W, H) {
    g.fillStyle = '#0b1218'; g.fillRect(0, 0, W, H);
    tx(g, 'STATUS PERANGKAT', 24, 38, '#e8f3ff', 22, 'bold'); tx(g, '23 UP · 1 DOWN', W - 24, 38, '#7cf3a8', 20, 'bold', false, 'right');
    const hd = ['PERANGKAT', 'IP', 'UPTIME', 'CPU', 'PING', 'STATUS'], xs = [24, 270, 450, 610, 720, 850];
    g.fillStyle = '#16222d'; g.fillRect(16, 56, W - 32, 30); hd.forEach((h2, k) => tx(g, h2, xs[k], 77, '#8fb3d1', 14, 'bold'));
    const rows: [string, string, string, number, string, boolean][] = [['NusaRouter CR-1009', '192.168.88.1', '12d 04:11', 7, '1 ms', true], ['CORE-SW SG-2428M', '192.168.99.2', '45d 10:02', 12, '1 ms', true], ['SW-LAB-A', '192.168.99.11', '45d 09:58', 9, '2 ms', true], ['SW-LAB-B', '192.168.99.12', '30d 01:20', 14, '2 ms', true], ['SW-HOTEL-L1', '192.168.99.21', '8d 22:40', 21, '3 ms', true], ['SW-RUKO', '192.168.99.31', '—', 0, 'timeout', false], ['AP-LOBBY NusaAir', '192.168.50.11', '3d 06:13', 18, '4 ms', true], ['SRV-DNS/DHCP', '192.168.30.10', '60d 02:01', 31, '1 ms', true], ['OLT-NSA-01', '10.20.0.2', '90d 13:45', 23, '2 ms', true], ['NVR-CCTV', '192.168.40.5', '20d 11:30', 44, '2 ms', true], ['UPS NusaPower RT3000', '192.168.99.250', '120d 00:12', 0, '1 ms', true]];
    rows.forEach((r, k) => {
      const y = 112 + k * 40; g.fillStyle = k % 2 ? '#0f1922' : '#0b1218'; g.fillRect(16, y - 24, W - 32, 40);
      tx(g, r[0], xs[0], y, '#e6edf3', 16, 'bold'); tx(g, r[1], xs[1], y, '#c9d6e2', 15, 'normal', true); tx(g, r[2], xs[2], y, '#c9d6e2', 15, 'normal', true);
      g.fillStyle = '#1d2a36'; g.fillRect(xs[3], y - 12, 80, 10); g.fillStyle = r[3] > 40 ? '#ffb020' : '#2bd46b'; g.fillRect(xs[3], y - 12, r[3] * 0.8, 10); tx(g, r[3] + '%', xs[3] + 86, y - 2, '#c9d6e2', 12, 'normal', true);
      tx(g, r[4], xs[4], y, r[5] ? '#c9d6e2' : '#ff6b6b', 15, 'normal', true);
      g.fillStyle = r[5] ? '#1f7a3f' : '#8a1e1e'; g.beginPath(); g.roundRect(xs[5], y - 18, 110, 24, 12); g.fill(); tx(g, r[5] ? '● UP' : '● DOWN', xs[5] + 55, y - 1, '#ffffff', 14, 'bold', false, 'center');
    });
  },
  alerts(g, W, H) {
    g.fillStyle = '#0a1016'; g.fillRect(0, 0, W, H);
    tx(g, 'PETA LAYANAN & ALARM', 24, 38, '#e8f3ff', 22, 'bold');
    // simple city map
    g.fillStyle = '#101c26'; g.fillRect(16, 56, 600, 500);
    g.strokeStyle = '#2a3b4a'; g.lineWidth = 14; [[16, 200, 616, 200], [16, 420, 616, 420], [180, 56, 180, 556], [440, 56, 440, 556]].forEach(([a, b2, c, d]) => { g.beginPath(); g.moveTo(a, b2); g.lineTo(c, d); g.stroke(); });
    g.strokeStyle = '#f3d21c'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(60, 120); g.lineTo(180, 200); g.lineTo(440, 200); g.lineTo(560, 330); g.stroke(); g.setLineDash([]);
    const pins: [number, number, string, string][] = [[300, 140, 'HOTEL', '#2bd46b'], [520, 300, 'RUKO', '#ff4040'], [110, 330, 'SMK', '#2bd46b'], [300, 500, 'TAMAN · AP', '#2bd46b'], [560, 480, 'ODP-FA/01', '#ffb020']];
    for (const [x, y, l, c] of pins) { g.fillStyle = c; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); tx(g, l, x + 16, y + 5, '#e6edf3', 14, 'bold'); }
    const al: [string, string, string][] = [['10:41', 'CRIT', 'SW-RUKO tidak merespon ping'], ['10:38', 'WARN', 'ODP-FA/01 redaman -27.8 dBm'], ['10:20', 'INFO', 'AP-LOBBY 42 klien terhubung'], ['09:55', 'WARN', 'UPS ruang server: load 71%'], ['09:12', 'INFO', 'Backup config router OK'], ['08:30', 'INFO', 'DHCP lease LAB-A: 36/50']];
    al.forEach(([t, s, m], k) => { const y = 92 + k * 76; const c = s === 'CRIT' ? '#ff4040' : s === 'WARN' ? '#ffb020' : '#3a8bff'; g.fillStyle = '#121c25'; g.fillRect(632, y - 26, 376, 66); g.fillStyle = c; g.fillRect(632, y - 26, 6, 66); tx(g, `${t}  ${s}`, 648, y, c, 15, 'bold', true); tx(g, m, 648, y + 24, '#d6e2ee', 14); });
  },
};

// =================================================================================================
// WORKSTATION
// =================================================================================================
export function monitor(name: string, o: { screen?: ScreenKind } = {}) {
  const sk = o.screen ?? 'winbox';
  const parts = cached('monitor_' + sk, b => {
    const dark = sm('monbody', { color: '#1c1e21', roughness: 0.45, metalness: 0.2 });
    b.flat(dark, rrShape(-0.11, 0.0, 0.22, 0.17, 0.03), 0, 0.012, 0.003);
    b.box(MT.steelDark, 0, 0.01, -0.06, 0.05, 0.31, 0.022);
    b.box(dark, 0, 0.21, -0.052, 0.14, 0.14, 0.03);               // VESA hump
    b.box(dark, 0, 0.11, -0.077, 0.54, 0.325, 0.012);
    b.box(MT.black, 0, 0.11, -0.0835, 0.54, 0.009, 0.001);        // chin
    b.plane(screenMat(sk), 0, 0.11 + 0.009 + 0.3125 / 2, -0.0835, 0.532, 0.2995 + 0.0, '-z');
    b.cyl(MT.ledB, -0.25, 0.1145, -0.0837, 0.0012, 0.0004, 'z', 8);
    const logo = decalMat('monlogo', 0.06, 0.008, 4000, p => { p.fill('#141618'); p.text('NusaView', 0.03, 0.0058, 0.0055, '#8c949b', 'center', 'bold'); }, { blink: false, metal: 0.3 });
    b.plane(logo, 0, 0.1145, -0.0838, 0.06, 0.008, '-z');
  });
  return inst(name, parts, { kind: 'monitor', size: [0.54, 0.435, 0.17], screen: sk });
}

export function pcTower(name: string) {
  const parts = cached('pctower', b => {
    const W = 0.2, H = 0.42, D = 0.42, body = sm('pcbody', { color: '#1e2125', metalness: 0.45, roughness: 0.45 });
    b.box(body, 0, 0.012, -D / 2, W, H - 0.012, D);
    for (const x of [-0.07, 0.07]) for (const z of [-0.04, -0.38]) b.cyl(MT.rubber, x, 0.006, z, 0.012, 0.012, 'y', 10);
    const front = decalMat('pc_front', W, H - 0.012, 2000, p => {
      const w = W, h = H - 0.012; p.fill('#16181b'); p.rect(0, 0, w, h, p.vgrad(0, h, '#121315', '#24272b'));
      p.rrect(0.02, 0.03, w - 0.04, h - 0.11, 0.006, '#0d0e10'); p.hexGrid(0.024, 0.034, w - 0.048, h - 0.118, 0.0035, '#222529');
      p.text('NusaPC', w / 2, 0.016, 0.011, '#c9d0d6', 'center', 'bold');
      p.circle(w / 2, h - 0.04, 0.011, '#0a0a0b'); p.ring(w / 2, h - 0.04, 0.009, '#3a8bff', 0.0014); if (p.e) { p.eUsed = true; p.ring(w / 2, h - 0.04, 0.009, '#3a8bff', 0.0024, p.e); }
      p.led(w / 2 + 0.03, h - 0.04, 0.0015, '#ff4040', true);
      for (let k = 0; k < 2; k++) { p.rect(0.04 + k * 0.018, h - 0.072, 0.012, 0.0048, '#1f5fbf'); p.rect(0.041 + k * 0.018, h - 0.0712, 0.01, 0.0018, '#0a0a0b'); }
      p.rrect(0.082, h - 0.0725, 0.009, 0.0035, 0.0017, '#9aa1a8'); p.circle(0.125, h - 0.07, 0.0026, '#5aa83a'); p.circle(0.14, h - 0.07, 0.0026, '#d06aa8');
    }, { rough: 0.5, metal: 0.2, emi: 1.4 });
    b.plane(front, 0, 0.012 + (H - 0.012) / 2, -D - 0.0004, W, H - 0.012, '-z');
    const sideM = decalMat('pc_side', D, H - 0.012, 1000, p => { p.fill('#1e2125'); p.noise(3000, 0.05, true); p.vents(0.25, 0.18, 0.12, 0.16, 0.004, 0.004, 0.003, '#08090a'); p.rrect(0.03, 0.03, 0.08, 0.05, 0.004, '#f2f2f2'); p.text('LAB TKJ', 0.07, 0.062, 0.012, '#1d4f9c', 'center', 'bold'); p.text('PC-03', 0.07, 0.044, 0.014, '#c8282b', 'center', 'bold'); }, { rough: 0.45, metal: 0.4, blink: false });
    b.plane(sideM, W / 2 + 0.0004, 0.012 + (H - 0.012) / 2, -D / 2, D, H - 0.012, '+x');
    const back = decalMat('pc_back', W, H - 0.012, 1500, p => {
      p.fill('#1a1c1f'); p.rect(0.02, 0.012, 0.16, 0.085, '#26292d'); p.circle(0.1, 0.055, 0.035, '#0b0b0c'); for (let r = 0.008; r < 0.035; r += 0.007) p.ring(0.1, 0.055, r, '#3a3d42', 0.0015); p.rect(0.03, 0.03, 0.02, 0.014, '#0a0a0a');
      p.rect(0.03, 0.23, 0.045, 0.16, '#2d3035'); for (let k = 0; k < 4; k++) p.rect(0.035, 0.36 - k * 0.012, 0.012, 0.0055, '#1f5fbf'); p.rj45(0.05, 0.26, 0.015, 0.013, false, '#a7aeb5'); p.rect(0.035, 0.24, 0.035, 0.008, '#3d5fa8');
      for (let k = 0; k < 7; k++) p.rect(0.1, 0.13 + k * 0.02, 0.08, 0.012, '#2d3035');
    }, { blink: false });
    b.plane(back, 0, 0.012 + (H - 0.012) / 2, 0.0004, W, H - 0.012, '+z');
  });
  return inst(name, parts, { kind: 'pcTower', size: [0.2, 0.42, 0.42] });
}

function keyboardTex(key: string, w: number, h: number, dark = true) {
  return decalMat(key, w, h, 2600, p => {
    p.fill(dark ? '#17191c' : '#c9cdd1');
    const rows: [string[], number[]][] = [
      [['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
      [['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Bksp'], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]],
      [['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'], [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5]],
      [['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'], [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25]],
      [['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'], [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75]],
      [['Ctrl', 'Win', 'Alt', '', 'Alt', 'Fn', 'Ctrl'], [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.5]]];
    const main = w > 0.3 ? 0.29 : w * 0.94, unit = main / 15, rowH = Math.min(unit, (h - 0.006) / 6.3), x0 = (w > 0.3 ? 0.006 : (w - main) / 2);
    rows.forEach(([ks, ws], r) => {
      let x = x0; const v = h - 0.004 - (r + 1) * rowH - (r ? rowH * 0.25 : 0);
      ks.forEach((k, i) => {
        const kw = ws[i] * unit; p.rrect(x + 0.0006, v + 0.0006, kw - 0.0012, rowH - 0.0012, 0.0012, dark ? '#2c3035' : '#f4f5f6');
        p.rect(x + 0.0012, v + rowH - 0.0028, kw - 0.0024, 0.0012, dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)');
        if (k) p.text(k, x + 0.0022, v + rowH - 0.0058, k.length > 1 ? rowH * 0.26 : rowH * 0.4, dark ? '#d9dee3' : '#2a2e33', 'left', 'bold');
        x += ws[i] * unit;
      });
    });
    if (w > 0.3) { // nav + numpad
      const nx = 0.302, unit2 = unit;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { const v = h - 0.004 - (r + 2) * rowH - rowH * 0.25; p.rrect(nx + 0.04 + c * unit2 + 0.0006, v + 0.0006, unit2 - 0.0012, rowH - 0.0012, 0.0012, dark ? '#2c3035' : '#f4f5f6'); p.text(['7', '8', '9', '+', '4', '5', '6', '+', '1', '2', '3', 'Ent', '0', '0', '.', 'Ent', 'Num', '/', '*', '-'][(r * 4 + c + 16) % 20], nx + 0.042 + c * unit2, v + rowH * 0.45, rowH * 0.35, dark ? '#d9dee3' : '#2a2e33', 'left', 'bold'); }
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const v = h - 0.004 - (r + 2) * rowH - rowH * 0.25; p.rrect(nx - 0.004 + c * unit2 * 0.95 + 0.0006, v + 0.0006, unit2 * 0.95 - 0.0012, rowH - 0.0012, 0.0012, dark ? '#2c3035' : '#f4f5f6'); }
      for (let c = 0; c < 3; c++) p.led(nx + 0.05 + c * 0.012, h - 0.008, 0.0012, '#38ff5c', c !== 2);
    }
  }, { rough: 0.6, metal: 0.05, emi: 1.0, blink: false });
}
export function keyboard(name: string) {
  const parts = cached('keyboard', b => {
    b.flat(sm('kbd', { color: '#202327', roughness: 0.5 }), rrShape(-0.22, 0, 0.44, 0.14, 0.008), 0, 0.02, 0.002);
    b.plane(keyboardTex('kbd_keys', 0.43, 0.13), 0, 0.0202, -0.07, 0.43, 0.13, '+y', TOPUV);
    b.box(MT.rubber, -0.2, -0.004, -0.008, 0.03, 0.006, 0.01); b.box(MT.rubber, 0.2, -0.004, -0.008, 0.03, 0.006, 0.01);
    b.tube(cordMat('black'), [V(0.1, 0.012, 0.0), V(0.1, 0.006, 0.05), V(0.06, 0.003, 0.15)], 0.0018, 12, 5);
  });
  return inst(name, parts, { kind: 'keyboard', size: [0.44, 0.02, 0.14], note: 'user sits at -Z (spacebar edge toward -Z)' });
}
export function mouse(name: string) {
  const parts = cached('mouse', b => {
    const shell = sm('mouse', { color: '#1d1f22', roughness: 0.35 });
    b.sphere(shell, 0, 0.004, -0.055, 0.032, 1, 1.05, 1.7, 24, 10, Math.PI * 2, Math.PI / 2);
    b.cyl(shell, 0, 0.0, -0.055, 0.032, 0.004, 'y', 24).scale(1, 1, 1);
    b.box(MT.hole, 0, 0.026, -0.03, 0.0008, 0.012, 0.05);
    b.cyl(MT.rubber, 0, 0.033, -0.03, 0.0065, 0.004, 'x', 16);
    b.tube(cordMat('black'), [V(0, 0.01, 0.0), V(0, 0.006, 0.03), V(0.03, 0.003, 0.12)], 0.0015, 10, 5);
  });
  return inst(name, parts, { kind: 'mouse', size: [0.065, 0.038, 0.11], note: 'buttons toward +Z (user at -Z)' });
}
export function laptop(name: string, o: { screen?: ScreenKind } = {}) {
  const sk = o.screen ?? 'terminal';
  const parts = cached('laptop_' + sk, b => {
    const W = 0.33, D = 0.23, alu = sm('alu', { color: '#5c636b', metalness: 0.7, roughness: 0.35 });
    b.flat(alu, rrShape(-W / 2, 0, W, D, 0.01), 0, 0.017, 0.002);
    const deck = decalMat('lap_deck', W - 0.016, D - 0.016, 2400, p => {
      const w = W - 0.016, h = D - 0.016; p.fill('#4f565e');
      const kb = keyboardTex('lap_keys', 0.27, 0.11);
      p.rrect(0.015, 0.098, 0.27, 0.11, 0.004, '#1a1c1f');
      const img = (kb.map as THREE.CanvasTexture).image as HTMLCanvasElement; p.g.drawImage(img, p.X(0.015), p.Y(0.208), 0.27 * p.S, 0.11 * p.S);
      p.rrect(w / 2 - 0.05, 0.012, 0.1, 0.07, 0.006, '#59616a'); p.rrect(w / 2 - 0.05, 0.012, 0.1, 0.07, 0.006, '#454b52', p.g, true);
      p.text('NusaBook', 0.02, 0.02, 0.006, '#c8ced3', 'left', 'bold');
    }, { rough: 0.4, metal: 0.4, blink: false });
    b.plane(deck, 0, 0.0172, -D / 2, W - 0.016, D - 0.016, '+y', TOPUV);
    // lid, tilted back 18 deg about the hinge line at z=-0.008
    b.push(T(0, 0.016, -0.008, 0.32, 0, 0));
    b.box(alu, 0, 0, 0.003, W, 0.22, 0.006);
    b.plane(MT.black, 0, 0.11, -0.0001, W - 0.004, 0.216, '-z');
    b.plane(screenMat(sk, 0.95), 0, 0.114, -0.0003, W - 0.018, 0.185, '-z');
    b.pop();
    b.cyl(MT.black, 0, 0.012, -0.006, 0.006, W - 0.06, 'x', 12);
  });
  return inst(name, parts, { kind: 'laptop', size: [0.33, 0.235, 0.3], screen: sk });
}
export function deskPhone(name: string) {
  const parts = cached('deskphone', b => {
    const body = sm('phone', { color: '#26292d', roughness: 0.45 });
    const prof = poly([[0, 0], [0.2, 0], [0.2, 0.024], [0.185, 0.03], [0.0, 0.078], [0, 0]]);
    b.side(body, prof, -0.11, 0.22, 0.002);
    const ang = Math.atan2(0.078 - 0.03, 0.185);
    const face = decalMat('phone_face', 0.15, 0.17, 3000, p => {
      p.fill('#1e2124');
      p.rrect(0.015, 0.11, 0.12, 0.05, 0.003, '#0b0c0d'); p.glowRect(0.018, 0.113, 0.114, 0.044, '#a9c9a0', 0.25);
      p.text('10:42', 0.024, 0.146, 0.0085, '#16301a', 'left', 'bold', MONO); p.text('Sel 27/10', 0.128, 0.146, 0.0055, '#16301a', 'right', 'bold');
      p.text('101 · LAB TKJ', 0.024, 0.132, 0.0065, '#16301a', 'left', 'bold'); p.text('SIP Registered ✓', 0.024, 0.121, 0.0055, '#16301a', 'left', 'normal');
      for (let k = 0; k < 4; k++) p.rrect(0.017 + k * 0.03, 0.098, 0.026, 0.008, 0.002, '#3a3e43');
      p.circle(0.075, 0.075, 0.016, '#3a3e43'); p.circle(0.075, 0.075, 0.007, '#2a2d31');
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
      keys.forEach((k, i) => { const u = 0.03 + (i % 3) * 0.035, v = 0.043 - Math.floor(i / 3) * 0.011; p.rrect(u, v, 0.028, 0.009, 0.002, '#41464c'); p.text(k, u + 0.014, v + 0.0025, 0.006, '#eef2f5', 'center', 'bold'); });
      p.rrect(0.008, 0.06, 0.018, 0.008, 0.002, '#7a1f1f'); p.rrect(0.124, 0.06, 0.018, 0.008, 0.002, '#1f6a33');
      p.text('NusaVoice', 0.135, 0.004, 0.006, '#7d868f', 'right', 'bold'); p.led(0.135, 0.165, 0.002, '#ff3030', true);
    }, { rough: 0.5, emi: 1.2 });
    const fg = new THREE.PlaneGeometry(0.15, 0.17); fg.rotateX(-Math.PI / 2); fg.rotateY(Math.PI); fg.rotateX(-ang);
    fg.translate(-0.03, (0.03 + 0.078) / 2 + 0.0034, -0.0925);
    b.geo(fg, face);
    // handset on the left (+X) part of the slope
    b.push(T(0.075, (0.03 + 0.078) / 2 + 0.014, -0.095, -ang, 0, 0));
    const hs = sm('handset', { color: '#222528', roughness: 0.4 });
    b.box(hs, 0, -0.008, 0, 0.03, 0.016, 0.12);
    for (const z of [-0.072, 0.072]) { b.cyl(hs, 0, -0.004, z, 0.022, 0.044, 'x', 20); b.box(hs, 0, -0.026, z, 0.044, 0.022, 0.044); }

    b.pop();
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 140; i++) { const t = i / 140, a = t * Math.PI * 2 * 24; const cx = 0.1 + 0.03 * Math.sin(t * Math.PI), cy = 0.05 - t * 0.045, cz = -0.17 + t * 0.12; pts.push(V(cx + Math.cos(a) * 0.004, Math.max(0.003, cy + Math.sin(a) * 0.004), cz)); }
    b.tube(cordMat('black'), pts, 0.0011, 400, 4);
    b.tube(cordMat('grey'), [V(-0.05, 0.03, 0.0), V(-0.05, 0.015, 0.03), V(-0.06, 0.003, 0.12)], 0.0026, 10, 5);
  });
  return inst(name, parts, { kind: 'deskPhone', size: [0.22, 0.1, 0.2] });
}

export function wallNetworkOutlet(name: string, o: { cable?: boolean; drop?: number } = {}) {
  const cable = o.cable ?? true, drop = o.drop ?? 0.3;
  const parts2 = cached(`outlet2_${cable}_${drop}`, b => {
    b.side(MT.plasticW, rrShape(0, 0, 0.009, 0.086, 0.002), -0.043, 0.086, 0.0012);
    const face = decalMat('outlet', 0.08, 0.08, 5000, p => {
      p.fill('#f3f4f2'); p.rect(0, 0, 0.08, 0.08, p.vgrad(0, 0.08, '#e9eae8', '#fbfbfa'));
      for (let k = 0; k < 2; k++) { const u = 0.012 + k * 0.032; p.rrect(u - 0.002, 0.022, 0.02, 0.026, 0.002, '#e2e3e0'); p.rj45(u + 0.0015, 0.027, 0.013, 0.014, false, '', '#141516'); p.text('LAN ' + (k + 1), u + 0.008, 0.016, 0.0045, '#5a6168', 'center', 'bold'); }
      p.rect(0.022, 0.058, 0.036, 0.009, '#ffffff'); p.srect(0.022, 0.058, 0.036, 0.009, '#b9bdc1'); p.text('TKJ-A12', 0.04, 0.0605, 0.0055, '#1d4f9c', 'center', 'bold', MONO);
    }, { rough: 0.45, metal: 0, blink: false });
    b.plane(face, 0, 0.043, -0.0093, 0.08, 0.08, '-z');
    if (cable) {
      const x = 0.08 / 2 - 0.02, y = 0.034, zf = -0.0093;
      b.box(MT.clear, x, y - 0.0041, zf - 0.003, 0.0117, 0.0082, 0.006); b.box(cordMat('blue'), x, y - 0.0057, zf - 0.013, 0.0128, 0.0114, 0.016); b.cyl(cordMat('blue'), x, y, zf - 0.025, 0.0042, 0.009, 'z', 8, 0.0032);
      b.tube(cordMat('blue'), [V(x, y, zf - 0.028), V(x, y - 0.01, zf - 0.05), V(x + 0.01, y - drop * 0.4, zf - 0.07), V(x + 0.02, y - drop + 0.03, zf - 0.08), V(x + 0.03, y - drop + 0.0035, zf - 0.16), V(x + 0.05, y - drop + 0.0035, zf - 0.4)], 0.0028, 40, 5);
    }
  });
  return inst(name, parts2, { kind: 'wallNetworkOutlet', size: [0.086, 0.086, 0.0093], note: cable ? `patch cord drops ${drop} m below the plate then runs 0.4 m toward -Z` : '' });
}

export function cableTray(name: string, o: { length?: number; width?: number; cables?: boolean; hangers?: boolean } = {}) {
  const L = o.length ?? 3, w = o.width ?? 0.3, cables = o.cables ?? true, hangers = o.hangers ?? false;
  const parts = cached(`tray_${L}_${w}_${cables}_${hangers}`, b => {
    for (const s of [-1, 1]) {
      const z = s * w / 2;
      b.box(MT.galv, 0, 0, z, L, 0.08, 0.002);
      b.box(MT.galv, 0, 0.078, z - s * 0.008, L, 0.002, 0.016); b.box(MT.galv, 0, 0, z - s * 0.012, L, 0.002, 0.024);
      for (let x = -L / 2 + 0.5; x < L / 2; x += 1) b.box(MT.steelDark, x, 0.03, z + s * 0.002, 0.03, 0.02, 0.002); // splice plates
    }
    for (let x = -L / 2 + 0.125; x < L / 2; x += 0.25) { b.box(MT.galv, x, 0.004, 0, 0.025, 0.012, w - 0.004); for (let k = -2; k <= 2; k++) b.box(MT.hole, x, 0.0161, k * w / 6, 0.012, 0.0002, 0.006); }
    if (cables) {
      const cols = ['blue', 'blue', 'blue', 'grey', 'blue', 'yellow', 'blue', 'grey', 'blue', 'white', 'blue', 'red', 'blue', 'green'];
      cols.forEach((c, k) => {
        const z = -w * 0.3 + (k % 7) * w * 0.1 + (k >= 7 ? w * 0.03 : 0), yb = 0.019 + (k >= 7 ? 0.0055 : 0);
        const pts: THREE.Vector3[] = []; for (let x = -L / 2; x <= L / 2 + 1e-6; x += 0.125) { const onRung = Math.abs(((x + L / 2 - 0.125) / 0.25) % 1) < 0.01; pts.push(V(x, yb - (onRung ? 0 : 0.002), z + Math.sin(x * 3 + k) * 0.003)); }
        b.tube(cordMat(c), pts, 0.0028, Math.round(L * 12), 5);
      });
      for (let x = -L / 2 + 0.375; x < L / 2; x += 0.75) b.torus(MT.black, x, 0.024, -w * 0.02, 0.105, 0.0012, 0, Math.PI / 2, 24, Math.PI); // cable ties
    }
    if (hangers) for (const x of [-L / 2 + 0.3, L / 2 - 0.3]) { b.box(MT.steelDark, x, -0.03, 0, 0.04, 0.03, w + 0.12); for (const s of [-1, 1]) b.cyl(MT.zinc, x, 0.2, s * (w / 2 + 0.04), 0.005, 0.46, 'y', 8); }
  });
  return inst(name, parts, { kind: 'cableTray', size: [L, 0.08, w], origin: 'bottom-centre, length along X' + (hangers ? ', rods rise 0.43 m' : '') });
}

export function floorBox(name: string) {
  const parts = cached('floorbox', b => {
    const S = 0.16, ss = sm('brushed', { color: '#b7bcc0', metalness: 0.85, roughness: 0.35 });
    b.box(ss, 0, 0, -S / 2, S, 0.006, S);
    b.box(MT.hole, 0, 0.0061, -S / 2, S - 0.02, 0.0002, S - 0.02);
    const plate = decalMat('floorbox', 0.13, 0.13, 3500, p => {
      p.fill('#26292d');
      for (let k = 0; k < 2; k++) { const u = 0.035 + k * 0.06, v = 0.085; p.circle(u, v, 0.022, '#e9eae8'); p.circle(u, v, 0.019, '#d4d6d3'); p.circle(u - 0.0095, v, 0.0022, '#111'); p.circle(u + 0.0095, v, 0.0022, '#111'); }
      for (let k = 0; k < 2; k++) { const u = 0.025 + k * 0.06; p.rrect(u - 0.002, 0.018, 0.04, 0.03, 0.002, '#e9eae8'); p.rj45(u + 0.012, 0.022, 0.014, 0.015, false, '', '#111'); p.text('LAN ' + (k + 1), u + 0.018, 0.0105, 0.0055, '#d9dde0', 'center', 'bold'); }
    }, { rough: 0.5, blink: false });
    b.plane(plate, 0, 0.0064, -S / 2, 0.13, 0.13, '+y', TOPUV);
    // lid hinged at the back, open ~100 deg
    b.push(T(0, 0.006, -0.004, 1.75, 0, 0));
    b.box(ss, 0, 0, -S / 2 + 0.004, S - 0.004, 0.005, S - 0.008);
    b.box(MT.rubber, 0, -0.002, -S / 2 + 0.004, S - 0.03, 0.002, S - 0.03);
    b.pop();
    b.box(MT.rubber, 0.04, 0.006, -S + 0.008, 0.03, 0.004, 0.012); // cable outlet brush
  });
  return inst(name, parts, { kind: 'floorBox', size: [0.16, 0.16, 0.16], origin: 'bottom-centre-back (sits on the floor surface, lid opens upward at the back)' });
}

// =================================================================================================
// NOC / SAFETY
// =================================================================================================
export function nocVideoWall(name: string, o: { stand?: boolean; header?: boolean } = {}) {
  const stand = o.stand ?? true, header = o.header ?? true;
  const parts = cached(`noc_${stand}_${header}`, b => {
    const dw = 1.215, dh = 0.683, gap = 0.004, y0 = 0.8, z = -0.09;
    const kinds: ScreenKind[] = ['topology', 'traffic', 'status', 'alerts'];
    const body = sm('nocbody', { color: '#121416', roughness: 0.4, metalness: 0.3 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const cx = (c ? -1 : 1) * (dw + gap) / 2, by = y0 + (1 - r) * (dh + gap);
      b.box(body, cx, by, z, dw, dh, 0.03);
      b.box(body, cx, by + dh * 0.25, z + 0.03, dw * 0.6, dh * 0.5, 0.03);
      b.plane(screenMat(kinds[r * 2 + c], 0.9), cx, by + dh / 2, z - 0.0153, dw - 0.008, dh - 0.008, '-z');
    }
    // mounting frame
    b.box(MT.steelDark, 0, y0 + 0.15, z + 0.06, 2.3, 0.05, 0.03); b.box(MT.steelDark, 0, y0 + 1.15, z + 0.06, 2.3, 0.05, 0.03);
    if (stand) {
      for (const x of [-0.6, 0.6]) { b.box(MT.rack, x, 0, z + 0.08, 0.08, y0 + 1.37, 0.05); b.box(MT.rack, x, 0, -0.22, 0.09, 0.05, 0.44); b.box(MT.rubber, x, 0, -0.02, 0.09, 0.01, 0.04); b.box(MT.rubber, x, 0, -0.42, 0.09, 0.01, 0.04); }
      b.box(MT.rack, 0, 0.35, z + 0.08, 1.2, 0.06, 0.04);
    } else b.box(MT.steelDark, 0, y0 + 0.2, -0.015, 0.8, 0.9, 0.03);
    if (header) {
      const hm = decalMat('noc_header', 1.6, 0.11, 640, p => { p.fill('#071019'); p.glowRect(0, 0.0, 1.6, 0.006, '#2bd46b', 1); p.text('NETWORK OPERATION CENTER · KOTA NUSANTARA', 0.8, 0.04, 0.05, '#e8f3ff', 'center', 'bold'); if (p.e) p.text('NETWORK OPERATION CENTER · KOTA NUSANTARA', 0.8, 0.04, 0.05, '#bfe0ff', 'center', 'bold', FONT, p.e); }, { emi: 1.1, blink: false });
      b.box(body, 0, y0 + 2 * dh + gap + 0.04, z, 1.62, 0.12, 0.03);
      b.plane(hm, 0, y0 + 2 * dh + gap + 0.1, z - 0.0153, 1.6, 0.11, '-z');
    }
  });
  return inst(name, parts, { kind: 'nocVideoWall', size: [2.434, 0.8 + 1.37 + 0.16, 0.44], screens: ['topology', 'traffic', 'status', 'alerts'] });
}

export function apar(name: string, o: { bracket?: boolean } = {}) {
  const bracket = o.bracket ?? false;
  const parts = cached('apar_' + bracket, b => {
    const R = 0.075, H = 0.42;
    b.cyl(MT.black, 0, 0.006, 0, R + 0.002, 0.012, 'y', 32);
    b.cyl(MT.redGloss, 0, 0.012 + (H - 0.012) / 2, 0, R, H - 0.012, 'y', 32);
    b.sphere(MT.redGloss, 0, H, 0, R, 1, 0.55, 1, 32, 8, Math.PI * 2, Math.PI / 2);
    b.cyl(MT.steel, 0, H + 0.05, 0, 0.02, 0.03, 'y', 16);
    b.box(MT.black, 0, H + 0.064, 0, 0.03, 0.03, 0.05);
    b.boxR(MT.black, 0, H + 0.098, -0.03, 0.026, 0.008, 0.11, 0.18, 0, 0);    // lever
    b.boxR(MT.steelDark, 0, H + 0.075, -0.035, 0.022, 0.006, 0.1, -0.05, 0, 0); // carry handle
    b.torus(MT.yellow, 0.018, H + 0.08, -0.005, 0.009, 0.0015, 0, Math.PI / 2, 16); // safety pin ring
    b.cyl(MT.chrome, 0, H + 0.075, -0.035, 0.018, 0.012, 'z', 20);              // gauge housing
    const gauge = decalMat('apar_gauge', 0.032, 0.032, 6000, p => { p.fill('#ffffff'); const c = 0.016; p.g.lineWidth = 0.004 * p.S; [['#d02828', Math.PI * 1.1, Math.PI * 1.45], ['#2b9a48', Math.PI * 1.45, Math.PI * 1.75], ['#d02828', Math.PI * 1.75, Math.PI * 1.9]].forEach(([col, a0, a1]) => { p.g.strokeStyle = col as string; p.g.beginPath(); p.g.arc(p.X(c), p.Y(c), 0.011 * p.S, a0 as number, a1 as number); p.g.stroke(); }); p.line([[c, c], [c + 0.002, c + 0.01]], '#111', 0.0012); p.text('kg/cm²', c, 0.006, 0.0035, '#333', 'center'); }, { rough: 0.3, blink: false });
    b.geo(new THREE.CircleGeometry(0.0155, 24), gauge, T(0, H + 0.075, -0.0412, 0, Math.PI, 0));
    // hose to nozzle clipped at the side
    b.tube(MT.black, [V(0.012, H + 0.06, 0.02), V(0.05, H + 0.05, 0.05), V(R + 0.012, H - 0.05, 0.03), V(R + 0.012, 0.18, 0.02), V(R + 0.008, 0.12, 0.0)], 0.0065, 30, 8);
    b.cyl(MT.black, R + 0.008, 0.1, 0.0, 0.009, 0.05, 'y', 12, 0.007);
    b.box(MT.steelDark, R - 0.002, 0.16, 0.0, 0.01, 0.012, 0.02);
    const lbl = decalMat('apar_label', 0.2, 0.22, 1600, p => {
      p.fill('#f7f7f5'); p.rect(0, 0.18, 0.2, 0.04, '#d0191c'); p.text('APAR', 0.1, 0.19, 0.03, '#ffffff', 'center', 'bold');
      p.text('DRY CHEMICAL POWDER', 0.1, 0.163, 0.012, '#111', 'center', 'bold'); p.text('3 KG · KELAS A B C', 0.1, 0.147, 0.012, '#d0191c', 'center', 'bold');
      const st = ['1. TARIK PIN', '2. ARAHKAN NOZZLE', '3. TEKAN TUAS', '4. SAPUKAN KE API'];
      st.forEach((s, k) => { p.rrect(0.02, 0.112 - k * 0.022, 0.16, 0.018, 0.003, '#eceae3'); p.text(s, 0.03, 0.117 - k * 0.022, 0.0105, '#111', 'left', 'bold'); });
      p.text('NusaSafe · Exp 10/2027', 0.1, 0.01, 0.009, '#555', 'center', 'bold');
    }, { rough: 0.4, blink: false });
    b.geo(new THREE.CylinderGeometry(R + 0.0006, R + 0.0006, 0.22, 24, 1, true, Math.PI - 0.75, 1.5), lbl, T(0, 0.15 + 0.11, 0));
    if (bracket) { b.box(MT.steelDark, 0, 0.32, R + 0.01, 0.06, 0.12, 0.004); b.box(MT.steelDark, 0, 0.32, R + 0.004, 0.09, 0.02, 0.012); }
  });
  return inst(name, parts, { kind: 'apar', size: [0.17, 0.53, 0.17], origin: 'bottom-centre' + (bracket ? ' (bracket plate behind at z=+0.085: mount against wall)' : '') });
}

export type SignKind = 'k3' | 'apar' | 'electric' | 'nofood' | 'server' | 'custom';
export function signPlate(name: string, o: { kind?: SignKind; text?: string; w?: number; h?: number } = {}) {
  const kind = o.kind ?? 'k3', w = o.w ?? 0.3, h = o.h ?? 0.2, text = o.text ?? '';
  const key = `sign_${kind}_${w}_${h}_${text}`;
  const parts = cached(key, b => {
    const m = decalMat(key, w, h, 1600, p => {
      const cx = w / 2, cy = h / 2, s = Math.min(w, h);
      if (kind === 'k3') {
        p.fill('#ffffff'); p.rect(0, 0, w, h * 0.22, '#2b9a48');
        const gx = w * 0.2, gy = h * 0.6, R = s * 0.26;
        p.g.fillStyle = '#2b9a48'; p.g.beginPath(); for (let k = 0; k < 34; k++) { const a = k / 34 * Math.PI * 2, rr2 = k % 2 ? R : R * 0.86; const X = p.X(gx + Math.cos(a) * rr2), Y = p.Y(gy + Math.sin(a) * rr2); k ? p.g.lineTo(X, Y) : p.g.moveTo(X, Y); } p.g.closePath(); p.g.fill();
        p.circle(gx, gy, R * 0.72, '#ffffff'); p.rect(gx - R * 0.14, gy - R * 0.5, R * 0.28, R, '#2b9a48'); p.rect(gx - R * 0.5, gy - R * 0.14, R, R * 0.28, '#2b9a48');
        p.text('AREA K3', w * 0.68, h * 0.62, s * 0.2, '#1a1a1a', 'center', 'bold');
        p.text('WAJIB PAKAI APD', w * 0.68, h * 0.42, s * 0.075, '#2b9a48', 'center', 'bold');
        p.text('UTAMAKAN KESELAMATAN DAN KESEHATAN KERJA', cx, h * 0.075, s * 0.05, '#ffffff', 'center', 'bold');
      } else if (kind === 'apar') {
        p.fill('#d0191c'); p.rect(s * 0.04, s * 0.04, w - s * 0.08, h - s * 0.08, '#d0191c'); p.srect(s * 0.04, s * 0.04, w - s * 0.08, h - s * 0.08, '#ffffff', s * 0.012);
        const ex = w * 0.25; p.rrect(ex - s * 0.07, h * 0.18, s * 0.14, h * 0.5, s * 0.05, '#ffffff'); p.rect(ex - s * 0.03, h * 0.68, s * 0.06, h * 0.08, '#ffffff'); p.line([[ex, h * 0.74], [ex + s * 0.14, h * 0.8], [ex + s * 0.2, h * 0.7]], '#ffffff', s * 0.025);
        p.text('APAR', w * 0.66, h * 0.55, s * 0.24, '#ffffff', 'center', 'bold'); p.text('ALAT PEMADAM', w * 0.66, h * 0.33, s * 0.07, '#ffffff', 'center', 'bold'); p.text('API RINGAN', w * 0.66, h * 0.22, s * 0.07, '#ffffff', 'center', 'bold');
      } else if (kind === 'electric') {
        p.fill('#f2c230'); p.g.fillStyle = '#111'; p.g.beginPath(); p.g.moveTo(p.X(w * 0.22), p.Y(h * 0.88)); p.g.lineTo(p.X(w * 0.4), p.Y(h * 0.3)); p.g.lineTo(p.X(w * 0.04), p.Y(h * 0.3)); p.g.closePath(); p.g.fill();
        p.g.fillStyle = '#f2c230'; p.g.beginPath(); p.g.moveTo(p.X(w * 0.22), p.Y(h * 0.78)); p.g.lineTo(p.X(w * 0.355), p.Y(h * 0.35)); p.g.lineTo(p.X(w * 0.085), p.Y(h * 0.35)); p.g.closePath(); p.g.fill();
        p.line([[w * 0.235, h * 0.7], [w * 0.19, h * 0.52], [w * 0.25, h * 0.52], [w * 0.2, h * 0.39]], '#111', s * 0.03);
        p.text('AWAS!', w * 0.7, h * 0.66, s * 0.17, '#111', 'center', 'bold'); p.text('TEGANGAN', w * 0.7, h * 0.46, s * 0.11, '#111', 'center', 'bold'); p.text('TINGGI', w * 0.7, h * 0.3, s * 0.11, '#111', 'center', 'bold');
        p.rect(0, 0, w, h * 0.12, '#111'); p.text('BAHAYA LISTRIK', cx, h * 0.035, s * 0.07, '#f2c230', 'center', 'bold');
      } else if (kind === 'nofood') {
        p.fill('#ffffff'); const gx = w * 0.22, gy = h * 0.55, R = s * 0.3; p.circle(gx, gy, R, '#d0191c'); p.circle(gx, gy, R * 0.8, '#ffffff');
        p.rrect(gx - R * 0.35, gy - R * 0.45, R * 0.4, R * 0.75, R * 0.08, '#333'); p.rect(gx + R * 0.15, gy - R * 0.45, R * 0.08, R * 0.9, '#333');
        p.line([[gx - R * 0.57, gy + R * 0.57], [gx + R * 0.57, gy - R * 0.57]], '#d0191c', R * 0.18);
        p.text('DILARANG', w * 0.68, h * 0.62, s * 0.13, '#d0191c', 'center', 'bold'); p.text('MAKAN & MINUM', w * 0.68, h * 0.44, s * 0.09, '#1a1a1a', 'center', 'bold'); p.text('di ruang server / lab', w * 0.68, h * 0.3, s * 0.06, '#555', 'center', 'normal');
      } else if (kind === 'server') {
        p.fill('#0f2a44'); p.rect(0, 0, w, h * 0.16, '#f2c230'); p.text('RUANG SERVER', cx, h * 0.62, s * 0.16, '#ffffff', 'center', 'bold'); p.text('AKSES TERBATAS · HANYA PETUGAS', cx, h * 0.38, s * 0.07, '#cfe0ff', 'center', 'bold'); p.text('AUTHORIZED PERSONNEL ONLY', cx, h * 0.05, s * 0.06, '#0f2a44', 'center', 'bold');
      } else {
        p.fill('#ffffff'); p.rect(0, 0, w, h * 0.14, '#1d4f9c'); p.text(text || 'LAB TKJ', cx, h * 0.5, s * 0.16, '#1d4f9c', 'center', 'bold');
      }
      for (const [u, v] of [[0.012, 0.012], [w - 0.012, 0.012], [0.012, h - 0.012], [w - 0.012, h - 0.012]]) p.screw(u, v, 0.0045);
    }, { rough: 0.45, metal: 0.1, blink: false });
    b.box(sm('signedge', { color: '#d9dcdf', roughness: 0.4, metalness: 0.4 }), 0, 0, -0.0015, w, h, 0.003);
    b.plane(m, 0, h / 2, -0.0031, w, h, '-z');
  });
  return inst(name, parts, { kind: 'signPlate', size: [w, h, 0.003], sign: kind });
}
