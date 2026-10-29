// Dev-only showcase for src/assets/vehicles.ts. Build: npx vite build -c dev/vite.vehicles.config.ts
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as VH from '../src/assets/vehicles';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb7c9');
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight('#ffffff', '#6b6458', 1.0));
const sun = new THREE.DirectionalLight('#fff4e2', 2.6); sun.position.set(-12, 20, -8); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 12, bottom: -12, near: 1, far: 80 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 300);
const controls = new OrbitControls(camera, renderer.domElement);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), new THREE.MeshStandardMaterial({ color: '#55595e', roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

function label(text: string, x: number, y: number, z: number, s = 0.5) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,14,20,0.82)'; g.beginPath(); g.roundRect(0, 0, 512, 96, 18); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.scale.set(s * 5.33, s, 1); sp.position.set(x, y, z); sp.renderOrder = 10; scene.add(sp); return sp;
}
const labels: THREE.Sprite[] = []; const stats: Record<string, number> = {};
const items: THREE.Object3D[] = [];
function put(name: string, o: THREE.Object3D, x: number, ry = Math.PI * 0.75) {
  o.position.set(x, 0, 0); o.rotation.y = ry; scene.add(o); items.push(o);
  stats[name] = VH.triCount(o);
  const h = new THREE.Box3().setFromObject(o).max.y; labels.push(label(name, x, h + 0.5, 0, name.length > 12 ? 0.35 : 0.4));
}
// row: motors, cars, bus
put('scooter (parked)', VH.makeMotor({ color: '#b3121b' }), -16);
put('scooter + rider', VH.makeMotor({ color: '#111214', rider: true }), -13.5);
put('ojol + pillion', VH.makeMotor({ color: '#f1f1ef', rider: true, ojol: true, pillion: true }), -11);
put('MPV (Avanza)', VH.makeCar('mpv', '#e5e7eb'), -7);
put('sedan', VH.makeCar('sedan', '#1c1c1c'), -2);
put('hatch (Brio)', VH.makeCar('hatch', '#b71c1c'), 2.5);
put('taxi Bluebird', VH.makeCar('taxi'), 7);
put('mikrolet M01', VH.makeCar('angkot'), 11.5, Math.PI * 1.25);
put('TransJakarta', VH.makeCar('bus'), 19, Math.PI * 1.25);
// scooter + rider for close-up views, at origin-ish
const closeA = VH.makeMotor({ color: '#1f3f8a', rider: true }); closeA.position.set(0, 0, 8); scene.add(closeA); stats['scooter+rider'] = VH.triCount(closeA);
const closeB = VH.makeMotor({ color: '#f1f1ef', rider: true, ojol: true, pillion: true }); closeB.position.set(3, 0, 8); scene.add(closeB); stats['scooter+rider+pillion'] = VH.triCount(closeB);
const ak = VH.makeCar('angkot'); ak.position.set(0, 0, -9); ak.rotation.y = Math.PI / 2; scene.add(ak);
stats['scooter bare'] = VH.triCount(VH.makeMotor({}));
for (const k of ['mpv', 'sedan', 'hatch', 'taxi', 'angkot', 'bus'] as const) stats[k] = VH.triCount(VH.makeCar(k));

const VIEWS: Record<string, [number[], number[], number?]> = {
  overview: [[2, 9, -26], [2, 1, 0], 40],
  motors: [[-13.5, 2.2, -5.5], [-13.5, 0.7, 0], 40],
  cars: [[1, 4, -13], [2, 0.8, 0], 40],
  bus: [[12, 4, -14], [16, 1.6, 0], 42],
  side: [[-4, 1.0, 8], [0, 0.75, 8], 26],      // scooter A side (right side faces -X? see below)
  sideR: [[4, 1.0, 8], [0, 0.75, 8], 26],
  front34: [[-2.2, 1.6, 5.6], [0, 0.8, 8], 32],
  rear34: [[5.5, 1.7, 11.0], [3, 0.8, 8], 32],
  pillion: [[7, 1.1, 8], [3, 0.85, 8], 26],
  angkotL: [[6, 2, -6], [11.5, 1, 0], 40],
  mpvside: [[-7, 1.2, -8], [-7, 0.8, 0], 40],
  carsF: [[-3, 3.2, 11], [1, 0.8, 0], 40],
  busF: [[27, 3.5, 11], [18, 1.6, 0], 42],
  angkotDoor: [[-2.5, 1.7, -3.6], [0, 1.0, -9], 45],
  busDoor: [[13, 2.6, 9], [18.5, 1.6, 0], 45],
  mpvF: [[-10.5, 1.6, 4.2], [-7, 0.8, 0], 40],
};
(window as any).__labels = (on: boolean) => labels.forEach(l => l.visible = on);
(window as any).__setView = (v: string) => { const [p, t, f] = VIEWS[v]; camera.position.set(p[0], p[1], p[2]); controls.target.set(t[0], t[1], t[2]); camera.fov = f ?? 40; camera.updateProjectionMatrix(); controls.update(); renderer.render(scene, camera); };
(window as any).__stats = stats;
(window as any).__spin = (d: number) => { scene.traverse(o => VH.spinWheels(o, d)); renderer.render(scene, camera); };
(window as any).__setView('overview');
const still = location.search.includes('still');
function loop() { controls.update(); renderer.render(scene, camera); if (!still) requestAnimationFrame(loop); }
loop();
(window as any).__ready = true;
