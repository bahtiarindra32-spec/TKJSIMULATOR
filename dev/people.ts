// Dev-only showcase for src/assets/people.ts. Build: npx vite build -c dev/vite.people.config.ts
// ?view=front|side|walk|close|poses|back
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as PP from '../src/assets/people';

const view = new URLSearchParams(location.search).get('view') ?? 'front';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !location.search.includes('noshadow'); renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb3c4');
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight('#ffffff', '#6a6258', 0.9));
const sun = new THREE.DirectionalLight('#fff4e5', 2.2); sun.position.set(4, 9, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 0.5, far: 40 }); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#b9b4aa' })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// height ruler: lines at 0.5 m steps
for (let h = 0.5; h <= 2.0; h += 0.5) { const l = new THREE.Mesh(new THREE.BoxGeometry(30, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: h === 1.5 ? '#c0392b' : '#555' })); l.position.set(0, h, -0.6); scene.add(l); }
const cam = new THREE.PerspectiveCamera(20, innerWidth / innerHeight, 0.1, 200);
const people: PP.Person[] = [];
const NOPPL = location.search.includes('noppl');
let rng = 7; const r = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };
const info: string[] = [];
function add(spec: PP.PersonSpec, x: number, z: number, ry: number) { const p = PP.createPerson(spec); if (NOPPL) p.root.visible = false; p.root.position.set(x, 0, z); p.root.rotation.y = ry; scene.add(p.root); people.push(p); info.push(`${spec.outfit}${spec.female ? ' F' : ''} h=${spec.height.toFixed(2)} tris=${p.tris}`); return p; }
const specs: PP.PersonSpec[] = [];
for (const o of PP.OUTFITS) specs.push(PP.randomSpec(r, o));
specs.push({ ...PP.randomSpec(r, 'student_f'), skirt: 'knee', hair: 'long_tied', sleeves: 'short' });
specs.push({ ...PP.randomSpec(r, 'student_f'), skirt: 'long', hair: 'hijab', sleeves: 'long' });
specs.push(PP.randomSpec(r, 'hijab_woman'));
if (location.search.includes('one')) specs.length = 1;
const half = new URLSearchParams(location.search).get('half');
if (half === '1') specs.splice(6); else if (half === '2') specs.splice(0, 6);
const n = specs.length, gap = 0.9;
let time = 0; let animate: (t: number) => void = () => {};
if (view === 'front' || view === 'back' || view === 'side' || view === 'close') {
  specs.forEach((s, i) => { const p = add(s, (i - (n - 1) / 2) * gap, 0, view === 'side' ? Math.PI / 2 : view === 'back' ? Math.PI : 0); PP.idlePose(p, 0); });
  if (view === 'close') { cam.fov = 18; cam.position.set(-2.7, 1.45, 4.2); cam.lookAt(-2.7, 1.1, 0); }
  else { cam.position.set(0, 1.0, n * 2.1); cam.lookAt(0, 0.86, 0); }
} else if (view === 'walk') {
  const s = specs[0];
  for (let k = 0; k < 8; k++) { const p = add({ ...s }, (k - 3.5) * 0.95, 0, Math.PI / 2); PP.walkPose(p, k / 8); }
  const s2 = specs[4];
  for (let k = 0; k < 8; k++) { const p = add({ ...s2 }, (k - 3.5) * 0.95, -2.5, Math.PI / 2); PP.walkPose(p, k / 8); }
  cam.position.set(0, 1.3, 21); cam.lookAt(0, 0.6, -1.2);
  info.push('stride(ref)=' + PP.WALK_STRIDE.toFixed(3));
} else if (view === 'walkfront') {
  for (let k = 0; k < 6; k++) { const p = add({ ...specs[k] }, (k - 2.5) * 0.9, 0, 0.4); PP.walkPose(p, k / 6); }
  cam.position.set(0, 1.3, 14); cam.lookAt(0, 0.9, 0);
} else if (view === 'poses') {
  const chairM = new THREE.MeshStandardMaterial({ color: '#555' });
  const ps = [specs[1], specs[8], specs[4]];
  ps.forEach((s, i) => {
    const x = (i - 1) * 1.6;
    const p1 = add({ ...s }, x - 0.4, 0, Math.PI / 2); PP.seatedPose(p1, 0.45);
    const p2 = add({ ...s }, x + 0.45, 0, Math.PI / 2); PP.typingPose(p2, 1.0, 0.45);
    for (const xx of [x - 0.4, x + 0.45]) { const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), chairM); seat.position.set(xx - 0.05, 0.43, 0); scene.add(seat); }
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.6), chairM); desk.position.set(x + 0.45 + 0.42, 0.74, 0); scene.add(desk);
  });
  cam.position.set(1.5, 1.6, 9); cam.lookAt(0, 0.6, 0);
}
cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
const tris = people.map(p => p.tris);
document.getElementById('hud')!.textContent = `view=${view}  variants=${PP.cachedVariantCount()}  maxTris=${Math.max(...tris)}\n` + info.join('\n');
if (location.search.includes('asmesh')) people.forEach(p => { const m = new THREE.Mesh(p.mesh.geometry, p.mesh.material); p.root.add(m); p.mesh.visible = false; });
if (location.search.includes('f32')) people.forEach(p => { const g = p.mesh.geometry; const a = g.attributes.skinIndex; g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(Array.from(a.array as any), 4)); });
if (location.search.includes('basic')) people.forEach(p => p.mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true }));
if (location.search.includes('nomap')) people.forEach(p => p.mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true }));
if (location.search.includes('plainmat')) people.forEach(p => p.mesh.material = new THREE.MeshStandardMaterial({ color: '#ccc' }));
renderer.render(scene, cam);
(window as any).__ppl = { ready: true, info, tris, gl: !!renderer.getContext() };
function loop() { renderer.render(scene, cam); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
