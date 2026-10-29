// Dev-only showcase for src/assets/netdevices.ts. Build: npx vite build -c dev/vite.devices.config.ts
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as ND from '../src/assets/netdevices';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b3036');
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight('#ffffff', '#55504a', 0.9));
const sun = new THREE.DirectionalLight('#fff6ea', 2.0); sun.position.set(-4, 8, -6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
scene.add(sun);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);

// floor + furniture (showcase only)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), new THREE.MeshStandardMaterial({ color: '#8d9196', roughness: 0.85 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const furn = new THREE.MeshStandardMaterial({ color: '#c8b293', roughness: 0.7 }), wallM = new THREE.MeshStandardMaterial({ color: '#e7e3da', roughness: 0.9 });
function table(x: number, zBack: number, w: number, d: number, h = 0.75) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), furn); top.position.set(x, h - 0.015, zBack - d / 2); top.castShadow = top.receiveShadow = true; g.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, h - 0.03, 0.04), new THREE.MeshStandardMaterial({ color: '#555b61', metalness: 0.6, roughness: 0.4 })); l.position.set(x + sx * (w / 2 - 0.04), (h - 0.03) / 2, zBack - d / 2 + sz * (d / 2 - 0.04)); l.castShadow = true; g.add(l); }
  scene.add(g); return h;
}
const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 0.1), wallM); wall.position.set(0, 1.5, 3.1); wall.receiveShadow = true; scene.add(wall);

// labels
function label(text: string, x: number, y: number, z: number, s = 0.12) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,14,20,0.82)'; g.beginPath(); g.roundRect(0, 0, 512, 96, 18); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.scale.set(s * 5.33, s, 1); sp.position.set(x, y, z); sp.renderOrder = 10; scene.add(sp); return sp;
}
const labels: THREE.Sprite[] = [];
const stats: Record<string, number> = {};
function put(o: THREE.Object3D, x: number, y: number, z: number, ry = 0, lbl = true, ly = 0.15) {
  o.position.set(x, y, z); o.rotation.y = ry; scene.add(o);
  stats[o.name] = ND.triCount(o);
  if (lbl) { const sz = (o.userData.size as number[]) ?? [0.3, 0.3, 0.3]; labels.push(label(o.name, x, y + Math.max(0.02, sz[1]) + ly, z - sz[2] / 2, 0.06 + Math.min(0.08, sz[0] * 0.08))); }
  return o;
}

// ---- A: racks (back on the wall at z=3.05)
put(ND.rack42U('rack42U network 600', { width: 0.6, depth: 1.0, glassDoor: true, populated: 'network' }), -1.5, 0, 3.05);
put(ND.rack42U('rack42U server 800', { width: 0.8, depth: 1.2, glassDoor: false, populated: 'server', doorOpen: 0.9 }), -0.6, 0, 3.05);
put(ND.rack42U('rack42U idf 600', { width: 0.6, depth: 1.0, glassDoor: true, populated: 'idf', doorOpen: 1.6 }), 0.35, 0, 3.05);
put(ND.rack42U('rack42U empty', { width: 0.8, depth: 1.0, glassDoor: true, sidePanels: false, doorOpen: 1.9 }), 1.35, 0, 3.05);
put(ND.wallRack('wallRack 9U', { u: 9 }), 2.4, 1.3, 3.05);

// ---- B: rack devices on a bench
table(0, 0.6, 3.8, 1.25);
const back: THREE.Object3D[] = [ND.server2U('server2U'), ND.server1U('server1U'), ND.upsRack2U('upsRack2U'), ND.switch24('switch24 managed', true), ND.switch24('switch24 unmanaged', false), ND.router1U('router1U')];
back.forEach((o, i) => put(o, -1.55 + i * 0.62, 0.75, 0.6));
const front: THREE.Object3D[] = [ND.patchPanel24('patchPanel24'), ND.cableManager1U('cableManager1U'), ND.odf1U('odf1U'), ND.pdu1U('pdu1U'), ND.blankPanel('blankPanel 2U', 2), ND.rackShelf1U('rackShelf1U')];
front.forEach((o, i) => put(o, -1.55 + i * 0.62, 0.75, -0.2));

// ---- C: workstation
table(-3.6, 0.6, 1.6, 0.8);
put(ND.monitor('monitor winbox', { screen: 'winbox' }), -3.9, 0.75, 0.55);
put(ND.monitor('monitor topology', { screen: 'topology' }), -3.3, 0.75, 0.55, -0.25);
put(ND.keyboard('keyboard'), -3.9, 0.75, 0.1);
put(ND.mouse('mouse'), -3.55, 0.75, 0.04, 0, true, 0.05);
put(ND.laptop('laptop terminal'), -3.0, 0.75, 0.05, 0.35);
put(ND.deskPhone('deskPhone'), -4.25, 0.75, 0.2, 0.3);
put(ND.ont('ont'), -4.25, 0.75, 0.55);
put(ND.pcTower('pcTower'), -2.6, 0, 0.6);
put(ND.upsTower('upsTower'), -2.6, 0, -0.2);
put(ND.floorBox('floorBox'), -2.4, 0, -0.9);

// ---- D: tools table
table(3.6, 0.6, 1.6, 0.8);
put(ND.esdMat('esdMat', { w: 1.2, d: 0.6 }), 3.6, 0.75, 0.25, 0, false);
put(ND.crimpingTool('crimpingTool'), 3.15, 0.752, 0.32, 0.2);
put(ND.cableStripper('cableStripper'), 3.2, 0.752, 0.06, -0.15);
put(ND.punchDownTool('punchDownTool'), 3.55, 0.752, 0.42);
put(ND.lanTester('lanTester'), 3.62, 0.752, 0.18);
put(ND.multimeter('multimeter'), 4.02, 0.752, 0.44);
put(ND.rj45Bag('rj45Bag'), 4.28, 0.752, 0.5);
put(ND.keystoneJacks('keystoneJacks', 6), 3.66, 0.752, -0.07);
put(ND.wireTray('wireTray'), 4.12, 0.752, 0.02, 0, true, 0.1);
put(ND.utpBox('utpBox'), 4.75, 0, 0.5);
put(ND.cableReel('cableReel'), 2.5, 0, 0.0);

// ---- E: wall items
put(ND.wallAP('wallAP'), 3.0, 1.5, 3.05);
put(ND.wallNetworkOutlet('wallNetworkOutlet', { cable: true, drop: 0.3 }), 3.3, 0.3, 3.05);
put(ND.odpBox('odpBox'), 3.75, 1.4, 3.05);
put(ND.signPlate('sign k3', { kind: 'k3' }), 4.35, 1.6, 3.05);
put(ND.signPlate('sign apar', { kind: 'apar' }), 4.75, 1.6, 3.05);
put(ND.signPlate('sign electric', { kind: 'electric' }), 4.35, 1.3, 3.05);
put(ND.signPlate('sign nofood', { kind: 'nofood' }), 4.75, 1.3, 3.05);
put(ND.signPlate('sign server', { kind: 'server', w: 0.4, h: 0.15 }), 5.4, 1.6, 3.05);
put(ND.apar('apar', { bracket: true }), 5.4, 0.9, 3.05 - 0.09);
put(ND.apar('apar floor'), 5.8, 0, 2.6);

// ---- F: NOC + overhead
put(ND.nocVideoWall('nocVideoWall'), -4.2, 0, 3.05);
put(ND.cableTray('cableTray', { length: 3, hangers: true }), -0.3, 2.35, 2.3);
const ceil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), new THREE.MeshStandardMaterial({ color: '#f0eeea' })); ceil.position.set(-1.6, 2.65, -0.9); scene.add(ceil);
put(ND.ceilingAP('ceilingAP'), -1.6, 2.64, -0.9, 0, true, -0.25);

// views: front faces -Z, so cameras sit at negative z looking +z
const VIEWS: Record<string, [number[], number[]]> = {
  overview: [[0.5, 3.6, -5.5], [0, 1.0, 1.2]],
  racks: [[-0.4, 1.6, -1.2], [-0.4, 1.2, 2.2]],
  rackClose: [[-1.5, 1.82, 1.35], [-1.5, 1.72, 2.2]],
  rackNet: [[-1.3, 1.5, 0.6], [-1.5, 1.35, 2.2]],
  rackIdf: [[0.55, 1.75, 1.0], [0.35, 1.45, 2.2]],
  bench: [[0, 1.6, -1.6], [0, 0.8, 0.2]],
  switch: [[0.32, 0.86, -0.05], [0.32, 0.77, 0.35]],
  router: [[1.55, 0.86, -0.02], [1.55, 0.77, 0.37]],
  patch: [[-1.4, 0.86, -0.72], [-1.45, 0.76, -0.32]],
  servers: [[-1.2, 1.0, -0.6], [-1.2, 0.77, 0.0]],
  tools: [[3.6, 1.35, -0.5], [3.65, 0.75, 0.25]],
  toolsClose: [[3.45, 1.05, -0.12], [3.45, 0.76, 0.25]],
  workstation: [[-3.6, 1.35, -1.0], [-3.6, 0.9, 0.3]],
  wall: [[4.2, 1.4, 1.2], [4.2, 1.2, 3.0]],
  noc: [[-4.2, 1.7, -0.6], [-4.2, 1.5, 3.0]],
  misc: [[-1.6, 1.4, -2.2], [-1.6, 1.3, 0]],
  desk2: [[-4.1, 1.05, -0.2], [-4.2, 0.78, 0.35]],
  ap: [[-1.25, 1.75, -1.35], [-1.6, 2.6, -0.9]],
  floor: [[-2.3, 0.75, -1.6], [-2.5, 0.15, -0.4]],
  wall2: [[3.15, 1.0, 1.3], [3.15, 0.95, 3.0]],
  ont: [[-4.25, 0.98, 0.15], [-4.25, 0.77, 0.48]],
  utp: [[4.35, 0.85, -0.55], [4.72, 0.2, 0.3]],
  reel: [[2.75, 0.62, -0.7], [2.5, 0.15, -0.05]],
  tray: [[4.1, 1.05, -0.25], [4.12, 0.76, 0.1]],
  dmm: [[4.05, 0.98, 0.18], [4.03, 0.76, 0.42]],
  crimp: [[3.2, 0.92, 0.12], [3.18, 0.755, 0.3]],
};
function setView(n: string) { const v = VIEWS[n]; camera.position.fromArray(v[0]); controls.target.fromArray(v[1]); controls.update(); render(); }
function render() { renderer.render(scene, camera); }
(window as any).__setView = setView; (window as any).__views = Object.keys(VIEWS); (window as any).__stats = stats;
(window as any).__labels = (v: boolean) => { labels.forEach(l => (l.visible = v)); render(); };
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); render(); });
setView(location.hash.slice(1) || 'overview');
let t0 = performance.now();
if (!location.search.includes('still')) renderer.setAnimationLoop(() => { const t = (performance.now() - t0) / 1000; ND.blinkMats.forEach((m, i) => (m.emissiveIntensity = 1.0 + 0.5 * Math.max(0, Math.sin(t * 8 + i * 1.7)))); controls.update(); render(); });
(window as any).__ready = true;
document.getElementById('hud')!.textContent = `netdevices showcase · ${Object.keys(stats).length} items · tris ${Object.values(stats).reduce((a, b) => a + b, 0)} · drag to orbit`;
