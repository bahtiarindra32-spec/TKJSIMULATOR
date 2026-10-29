import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ZONES, ROADS, ROAD_SPEC, LEVELS, SPAWN, ANCHORS, HOTEL_ORIGIN, wx, wz } from './data/city';
import { colliders, bakeStatic, setBakedVisible, type AABB } from './world/core';
import { buildAutoColliders, buildGrid, resolveCircle, blocked } from './game/physics';
import { createPerson, randomSpec, walkPose, idlePose, WALK_STRIDE } from './assets/people';
import { buildRoads } from './world/roads';
import { buildGround, buildCity } from './world/buildings';
import { buildHotel, updateDoors, closedDoorBoxes, nearestDoor, toggleDoor, blinkMaterials, insideHotel, zoneAt, verticalZones } from './world/hotel';
import { buildStreetProps } from './world/props';
import { Signals, Traffic, Pedestrians } from './game/traffic';
import { MISSIONS } from './game/missions';
import * as ND from './assets/netdevices';
import { hotelAnchorsWorld } from './game/missionSystem';
import { initSwitches, portOf, panelOf } from './pcos/net';
import { createWaypoint, updateWaypoint, createAnchorMarker } from './ui/waypoint';

import { buildWayfinding } from './world/wayfinding';
import { dressL1, l1Lights } from './world/interiorDressing';
import { Minimap } from './ui/minimap';
import { PcOS } from './pcos/os';
import { Noc } from './game/noc';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const $ = (id: string) => document.getElementById(id)!;
const cityX = (x: number) => x + 200, cityZ = (z: number) => z + 150;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.15, 1600);

// sky: late afternoon, sun from WSW
const sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky);
const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(72), THREE.MathUtils.degToRad(-115));
const su = sky.material.uniforms; su.turbidity.value = 7; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.85; su.sunPosition.value.copy(sun);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); Object.assign(sky2.material.uniforms.sunPosition.value, sun); sky2.material.uniforms.turbidity.value = 7; sky2.material.uniforms.rayleigh.value = 1.6; envScene.add(sky2);
scene.environment = pmrem.fromScene(envScene, 0.04).texture; scene.environmentIntensity = 0.55;
scene.fog = new THREE.Fog('#cdbfae', 220, 1400);

const hemi = new THREE.HemisphereLight('#cfe3ff', '#7a6a55', 0.75); scene.add(hemi);
const dir = new THREE.DirectionalLight('#ffd7a8', 2.6);
dir.castShadow = true; dir.shadow.mapSize.set(4096, 4096); dir.shadow.bias = -0.0004; dir.shadow.normalBias = 0.03;
const sc = dir.shadow.camera as THREE.OrthographicCamera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 1; sc.far = 700;
scene.add(dir, dir.target);
const interiorLight = new THREE.PointLight('#fff1dc', 0, 18, 1.4); scene.add(interiorLight);

// ---------- world ----------
const world = new THREE.Group(); world.name = 'KOTA_NUSANTARA'; scene.add(world);
buildGround(world);
buildRoads(world);
buildCity(world);
const hotel = buildHotel(world);
// usable computers (collected before static baking merges meshes)
const PCS: { name: string; label: string; p: THREE.Vector3 }[] = [];
hotel.updateMatrixWorld(true);
hotel.traverse(o => { const m = /^PROP_(L\d)_(PC|LAPTOP)_((?:[A-Z]+_)?\d+)$/.exec(o.name); if (m) PCS.push({ name: o.name, label: `${m[2] === 'PC' ? 'PC' : 'Laptop'} ${m[3].replace(/_/g, ' ')} · ${m[1]}`, p: new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()) }); });
const pcos = new PcOS();
const RACK = hotelAnchorsWorld().find(a => a.name === 'ANCHOR_SRV_NETRACK_01')!;
const CABINET = hotelAnchorsWorld().find(a => a.name === 'ANCHOR_WS_TOOLCAB_01')!;
initSwitches(PCS.map(c => c.name));
// IDF wall racks of the office floors (one access switch + patch panel each); the player stands in front of them
const IDFS = [2, 3].map(lv => { const o = hotel.getObjectByName(`PROP_L${lv}_IDF_RACK_01`); const c = o ? new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()) : new THREE.Vector3(); return { id: `IDF-L${lv}`, level: lv, x: c.x, y: c.y, z: c.z - 0.9 }; });
const noc = new Noc(pcos, PCS.map(c => ({ name: c.name, label: c.label, x: c.p.x, y: c.p.y, z: c.p.z, level: +(/_L(\d)_/.exec(c.name)?.[1] ?? 1) })), RACK, CABINET, IDFS);
const { tls } = buildStreetProps(world);
buildWayfinding(world);
dressL1(hotel);
l1Lights(scene);
const signals = new Signals(tls);
const gameLayer = new THREE.Group(); gameLayer.name = 'GAME_LAYER'; scene.add(gameLayer);
const traffic = new Traffic(gameLayer, signals);
const peds = new Pedestrians(gameLayer);
// The old linear quiz chain is retired: all work now comes from the NOC work board (game/noc.ts).
const missions = { isModalOpen: () => false, hintFor: (_a: string | null): string | null => null, interact: (_a: string | null) => false, onModalChange: (_f: (o: boolean) => void) => {}, setPlayerPos: (_x: number, _z: number) => {}, current: () => ({ targetPos: null as { x: number; z: number } | null, targetY: 0, place: '' }), start: () => {} };
const missionUI = { setHudVisible: (_v: boolean) => {} };
const waypoint = createWaypoint();
const missionMarker = createAnchorMarker(); gameLayer.add(missionMarker.group);
buildAutoColliders(world); buildGrid();
const zoneOverlay = world.getObjectByName('ZONE_OVERLAY')!;
// render batches: one per region; hotel per level so the cutaway can hide upper floors
const batches = new THREE.Group(); batches.name = 'RENDER_BATCHES'; scene.add(batches);
const hotelBatches = new Map<string, THREE.Object3D>();
for (const lvName of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'ROOF', 'EXTERIOR']) { const b = bakeStatic(hotel.getObjectByName(lvName)!, `BATCH_${lvName}`, o => o.name.startsWith('DOOR_')); batches.add(b); hotelBatches.set(lvName, b); }
for (const n of ['FASE_A_JALAN', 'FASE_C_GEDUNG_KOTA', 'FASE_E_PROPERTI_JALAN']) batches.add(bakeStatic(world.getObjectByName(n)!, `BATCH_${n}`, o => o.name.startsWith('TL_')));
batches.add(bakeStatic(world.getObjectByName('FASE_B_TANAH_ZONA')!, 'BATCH_FASE_B', o => o.name === 'ZONE_OVERLAY'));
const upperParts = ['L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'ROOF', 'EXTERIOR'].map(n => hotelBatches.get(n)!);

// ---------- views ----------
interface View { id: string; label: string; loc: string; pos: [number, number, number]; target: [number, number, number]; cutaway?: boolean }
const H = (lx: number, lz: number, y: number): [number, number, number] => [HOTEL_ORIGIN[0] + lx, y, HOTEL_ORIGIN[1] + lz];
const VIEWS: View[] = [
  { id: 'overview', label: 'Ikhtisar', loc: 'Ikhtisar kota dari arah barat laut', pos: [-70, 210, -60], target: [215, 0, 165] },
  { id: 'simpang', label: 'Simpang Sudirman', loc: 'Simpang Sudirman × Thamrin: lampu lalu lintas, zebra cross, JPO', pos: [150, 26, 115], target: [205, 2, 152] },
  { id: 'hotel', label: 'Hotel', loc: 'Nusantara Tech Hotel & Office, 8 lantai, menghadap Jl. Sudirman', pos: [212, 9, 128], target: [236, 14, 175] },
  { id: 'denah', label: 'Denah Lantai 1', loc: 'Potongan lantai 1: lobi, Kantor IT, Workshop TKJ, Ruang Server', pos: H(15, -16, 30), target: H(15, 10, 0), cutaway: true },
  { id: 'lobi', label: 'Lobi', loc: 'Lobi: meja resepsionis dan papan nama gedung', pos: H(2.2, 1.2, 1.7), target: H(9, 8, 1.1) },
  { id: 'workshop', label: 'Workshop TKJ', loc: 'Workshop TKJ: meja praktik, meja crimping, papan tulis', pos: H(29.3, 0.8, 2.2), target: H(23.5, 7, 0.8) },
  { id: 'server', label: 'Ruang Server', loc: 'Ruang Server: 4 rak server, rak jaringan, UPS, AC presisi', pos: H(28.8, 13, 1.9), target: H(25, 17.5, 1.2) },
  { id: 'ruko', label: 'Ruko & Pasar', loc: 'Deretan ruko, pasar, dan masjid di sisi selatan Sudirman', pos: [118, 22, 148], target: [138, 4, 196] },
  { id: 'kampung', label: 'Kampung', loc: 'Kampung Melati: gang 3 m dan kabel listrik semrawut', pos: [8, 9, 168], target: [40, 2, 198] },
  { id: 'taman', label: 'Taman Kota', loc: 'Taman kota: jalur jogging, gazebo, air mancur', pos: [96, 22, 2], target: [140, 0, 32] },
];

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 0.5; controls.maxDistance = 700;

let mode: 'orbit' | 'walk' = 'orbit';
let activeView = 'overview';
let tween: { from: THREE.Vector3; to: THREE.Vector3; tf: THREE.Vector3; tt: THREE.Vector3; t: number } | null = null;
const toW = (p: [number, number, number]) => new THREE.Vector3(wx(p[0]), p[1], wz(p[2]));
let cutaway = false;
function setCutaway(on: boolean) { cutaway = on; upperParts.forEach(o => (o.visible = !on)); }
function goView(id: string, instant = false) {
  const v = VIEWS.find(v => v.id === id)!;
  if (mode === 'walk') exitWalk();
  activeView = id; setCutaway(!!v.cutaway);
  document.body.classList.toggle('viewing', id !== 'overview');
  $('hudLoc').textContent = v.loc; $('hudHint').textContent = '';
  $('locText').textContent = v.loc;
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.id === id));
  const narrow = window.innerWidth < 720 && id === 'overview';
  const to = toW(narrow ? [-20, 300, -80] : v.pos), tt = toW(narrow ? [205, 0, 120] : v.target);
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(to); controls.target.copy(tt); tween = null; }
  else tween = { from: camera.position.clone(), to, tf: controls.target.clone(), tt, t: 0 };
  const interior = ['lobi', 'workshop', 'server'].includes(id);
  controls.minDistance = interior ? 0.2 : 2; controls.maxDistance = interior ? 8 : 700;
  controls.enabled = true;
}
const nav = $('views');
for (const v of VIEWS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = v.label; b.dataset.id = v.id; b.onclick = () => goView(v.id); nav.appendChild(b); }

// ---------- walking ----------
const player = { pos: new THREE.Vector3(wx(SPAWN[0]), 0.15, wz(SPAWN[1])), yaw: Math.PI, pitch: 0, level: 1, vy: 0, ground: true, phase: 0 };
// smoothed view + velocity (player.yaw/pitch are the mouse targets)
const view = { yaw: Math.PI, pitch: 0, head: new THREE.Vector3(), bodyYaw: Math.PI };
const vel = new THREE.Vector2();
let ride: { from: number; to: number; n: number; t: number; dur: number; lift: boolean; ax: number; az: number } | null = null;
// player avatar (seen in third-person view; V toggles)
let thirdPerson = false;
const avatar = createPerson(randomSpec(() => 0.42, 'student_m'));
avatar.root.name = 'PLAYER_AVATAR'; avatar.root.visible = false;
avatar.root.traverse(o => { (o as THREE.Mesh).frustumCulled = false; }); scene.add(avatar.root);
const keys = new Set<string>();
missions.onModalChange(open => { if (open) keys.clear(); });
noc.toast = (s, ms) => toast(s, ms);
noc.onModal(open => { if (open) keys.clear(); else last = performance.now(); });
const uiBlocked = () => missions.isModalOpen() || pcos.isOpen() || noc.isModalOpen();
function enterWalk() {
  mode = 'walk'; document.body.classList.add('entered'); document.body.classList.remove('viewing'); setCutaway(false); controls.enabled = false; tween = null;
  player.pos.set(wx(SPAWN[0]), 0.15, wz(SPAWN[1])); player.yaw = Math.PI; player.pitch = -0.02; player.level = 1;
  $('hints').textContent = 'WASD jalan · Mouse menoleh · Shift lari · Spasi lompat · V kamera · F interaksi · T papan kerja · C cek fisik · E/Q tangga · M peta · Esc keluar';
  document.querySelectorAll('#views button').forEach(b => b.classList.remove('active'));
  try { renderer.domElement.requestPointerLock?.(); } catch { /* ignore */ }
  missionUI.setHudVisible(true); noc.setHudVisible(true);
  missions.start();
}
function exitWalk() {
  mode = 'orbit'; document.body.classList.remove('entered'); controls.enabled = true;
  $('hints').textContent = 'Klik/tarik untuk memutar · roda untuk zoom';
  if (document.pointerLockElement) document.exitPointerLock();
  missionUI.setHudVisible(false); noc.setHudVisible(false);
}
$('enter').onclick = enterWalk;
$('btnBack').onclick = () => goView('overview');
window.addEventListener('keydown', e => {
  if (pcos.isOpen() || noc.isModalOpen()) return;
  if ((e.target as HTMLElement)?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
  keys.add(e.code);
  if (e.code === 'Escape' && mode === 'walk') goView('overview');
  if (e.code === 'KeyZ') toggleZones();
  if (e.code === 'KeyM' && mode === 'walk') minimap.toggle();
  if (e.code === 'KeyG') setQuality(!quality);
  if (mode === 'walk' && (e.code === 'KeyE' || e.code === 'KeyQ')) changeFloor(e.code === 'KeyE' ? 1 : -1);
  if (mode === 'walk' && e.code === 'KeyF') interact();
  if (mode === 'walk' && e.code === 'KeyT' && !missions.isModalOpen()) noc.openBoard();
  if (mode === 'walk' && e.code === 'KeyC' && !missions.isModalOpen()) { const m = noc.physical(nearPc?.name ?? null, nearRack()); if (m) toast(m, 5200); }
  if (mode === 'walk' && e.code === 'Space') { e.preventDefault(); if (player.ground && !missions.isModalOpen()) { player.vy = 4.4; player.ground = false; } }
  if (mode === 'walk' && e.code === 'KeyV') { thirdPerson = !thirdPerson; toast(thirdPerson ? 'Kamera orang ketiga (V untuk ganti)' : 'Kamera orang pertama (V untuk ganti)', 1800); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => { if (mode === 'walk' && !uiBlocked() && !document.pointerLockElement) renderer.domElement.requestPointerLock?.(); });
let drag = false, lx = 0, ly = 0;
renderer.domElement.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('pointerup', () => (drag = false));
window.addEventListener('pointermove', e => {
  if (mode !== 'walk') return;
  if (uiBlocked()) return;
  let dx = 0, dy = 0;
  if (document.pointerLockElement) { dx = e.movementX; dy = e.movementY; } else if (drag) { dx = e.clientX - lx; dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; }
  if (ride) return;
  player.yaw -= dx * 0.0022; player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.0022, -1.3, 1.3);
});

const RADIUS = 0.32;
function feetHeight(x: number, z: number, prevY: number): number {
  if (insideHotel(x, z)) {
    const base = LEVELS[player.level - 1].elev + 0.12;
    if (player.level === 1 && x > wx(HOTEL_ORIGIN[0] + 23) && z > wz(HOTEL_ORIGIN[1] + 12)) return base + 0.3; // raised floor
    return base;
  }
  // JPO stairs & deck
  const jpo = world.getObjectByName('JPO_01');
  if (jpo) {
    for (const st of jpo.children) {
      const s = st.userData.stair; if (!s) continue;
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.rise * (x - s.x0) / (s.x1 - s.x0) + 0.15;
    }
    if (prevY > 3 && x > wx(163.75) && x < wx(166.25) && z > wz(137) && z < wz(163)) return 5.75;
  }
  // sidewalk height approximation
  for (const r of ROADS) {
    if (r.kind === 'gang') continue;
    const h = r.a[1] === r.b[1]; const c = h ? r.a[1] : r.a[0]; const s = ROAD_SPEC[r.kind];
    const o = Math.abs((h ? cityZ(z) : cityX(x)) - c);
    if (o < s.carriage / 2) return 0.02;
  }
  return 0.15;
}
const vehicleBoxes: AABB[] = [];
function collide(p: THREE.Vector3, feet: number) {
  vehicleBoxes.length = 0;
  for (const v of traffic.vehicles) {
    const o = v.obj.position; if (Math.abs(o.x - p.x) > 10 || Math.abs(o.z - p.z) > 10) continue;
    const ew = v.lane.axis === 'EW', half = v.len / 2, w = v.len > 10 ? 1.3 : v.len < 2.5 ? 0.45 : 0.95;
    vehicleBoxes.push({ minX: o.x - (ew ? half : w), maxX: o.x + (ew ? half : w), minZ: o.z - (ew ? w : half), maxZ: o.z + (ew ? w : half), minY: 0, maxY: 3 });
  }
  closedDoorBoxes(p.x, p.z, vehicleBoxes);
  resolveCircle(p, feet, RADIUS, vehicleBoxes);
}
function inVertical(x: number, z: number) {
  if (insideHotel(x, z) && cityZ(z) > HOTEL_ORIGIN[1] + 10.3 && cityZ(z) < HOTEL_ORIGIN[1] + 12.2 && cityX(x) > HOTEL_ORIGIN[0] + 15.5 && cityX(x) < HOTEL_ORIGIN[0] + 23) return true; // standing at the stair/lift doors
  return verticalZones.some(v => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1); }
function changeFloor(d: number) {
  if (!insideHotel(player.pos.x, player.pos.z) || !inVertical(player.pos.x, player.pos.z)) { toast('Naik/turun lantai hanya di tangga atau lift (core gedung).'); return; }
  const n = THREE.MathUtils.clamp(player.level + d, 1, 8); if (n === player.level) return;
  if (ride) return;
  const inLift = player.pos.x > wx(HOTEL_ORIGIN[0] + 19);
  // arrive in the corridor in front of the stair door (local X17) or lift doors (X20/22), facing north
  const ax = wx(HOTEL_ORIGIN[0] + (inLift ? (player.pos.x > wx(HOTEL_ORIGIN[0] + 21) ? 22 : 20) : 17)), az = wz(HOTEL_ORIGIN[1] + 11.0);
  const floors = Math.abs(n - player.level);
  ride = { from: player.level, to: n, n, t: 0, dur: inLift ? 1.6 + floors * 0.9 : 0.9 + floors * 0.6, lift: inLift, ax, az };
  keys.clear(); vel.set(0, 0);
  liftUI.show(inLift, player.level, n > player.level);
}
// ---------- lift / stair ride: doors close, floor counter runs, doors open on the new floor ----------
const liftUI = (() => {
  const st = document.createElement('style');
  st.textContent = `#liftov{position:fixed;inset:0;z-index:40;pointer-events:none;opacity:0;transition:opacity .35s}#liftov.on{opacity:1}
#liftov .ld{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(90deg,#8d959c,#c9cfd4 45%,#9aa2a8);transition:transform .7s cubic-bezier(.6,0,.3,1);box-shadow:inset 0 0 40px rgba(0,0,0,.35)}
#liftov .ld.l{left:0;transform:translateX(-100%)}#liftov .ld.r{right:0;transform:translateX(100%)}#liftov.closed .ld.l,#liftov.closed .ld.r{transform:none}
#liftov .panel{position:absolute;left:50%;top:18%;transform:translateX(-50%);background:#101418;color:#ff5a3c;font:700 44px/1 ui-monospace,monospace;padding:14px 26px;border-radius:8px;border:2px solid #333;text-align:center;min-width:120px;box-shadow:0 0 24px rgba(255,90,60,.25)}
#liftov .panel small{display:block;font:600 12px/1.6 system-ui,sans-serif;color:#bbb;letter-spacing:.12em}
#liftov.stair{background:rgba(10,12,14,.82)}#liftov.stair .ld{display:none}#liftov.stair .panel{color:#f2f2f2;border-color:#444;box-shadow:none}`;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.id = 'liftov';
  ov.innerHTML = '<div class="ld l"></div><div class="ld r"></div><div class="panel"><small>LIFT</small><span>1</span></div>';
  document.body.appendChild(ov);
  const num = ov.querySelector('span')!, cap = ov.querySelector('small')!;
  return {
    show(lift: boolean, from: number, up: boolean) {
      ov.className = lift ? '' : 'stair'; cap.textContent = lift ? (up ? 'LIFT ▲' : 'LIFT ▼') : (up ? 'NAIK TANGGA' : 'TURUN TANGGA');
      num.textContent = 'L' + from; void ov.offsetWidth; ov.classList.add('on'); if (lift) setTimeout(() => ov.classList.add('closed'), 30);
    },
    floor(n: number) { num.textContent = 'L' + n; },
    open() { ov.classList.remove('closed'); setTimeout(() => ov.classList.remove('on'), 650); },
  };
})();
function updateRide(dt: number) {
  if (!ride) return;
  ride.t += dt;
  const doorT = ride.lift ? 0.7 : 0.3; // doors close / fade before moving
  const k = THREE.MathUtils.clamp((ride.t - doorT) / (ride.dur - doorT * 2), 0, 1), e = k * k * (3 - 2 * k);
  const lv = ride.from + (ride.to - ride.from) * e;
  liftUI.floor(Math.round(lv));
  if (k > 0) { player.pos.x = ride.ax; player.pos.z = ride.az; player.yaw = 0; view.yaw = 0; }
  player.pos.y = THREE.MathUtils.lerp(LEVELS[ride.from - 1].elev, LEVELS[ride.to - 1].elev, e) + 0.12;
  if (ride.t >= ride.dur) {
    player.level = ride.to; player.pos.y = LEVELS[ride.to - 1].elev + 0.12; player.vy = 0; player.ground = true;
    liftUI.open();
    toast(`Lantai ${ride.to} · ${ride.to === 1 ? 'Lobi & TKJ' : ride.to <= 3 ? 'Kantor' : 'Kamar hotel'}`);
    ride = null;
  }
}
let nearAnchor: string | null = null;
let nearPc: (typeof PCS)[number] | null = null;
let camDist = 2;
pcos.onClose = () => { keys.clear(); last = performance.now(); };
function interact() {
  if (uiBlocked()) return;
  const rk = nearRack();
  if (rk && rk !== 'MDF' && !nearPc) { keys.clear(); noc.openRack(rk); return; }
  const door = nearestDoor(player.pos.x, player.pos.z, player.pos.y);
  if (door && !(nearAnchor && noc.anchorHint(nearAnchor)) && (!nearPc || Math.hypot(door.cx - player.pos.x, door.cz - player.pos.z) < Math.hypot(nearPc.p.x - player.pos.x, nearPc.p.z - player.pos.z))) { toggleDoor(door); return; }
  if (!nearAnchor && nearPc) { keys.clear(); if (document.pointerLockElement) document.exitPointerLock(); pcos.open(nearPc.name, nearPc.label); return; }
  if (!nearAnchor) return;
  if (noc.interactAnchor(nearAnchor)) return;
  const m = MISSIONS[nearAnchor]; toast(m ? `${m.title}: ${m.desc}` : nearAnchor, 5000);
}
let toastT = 0;
function toast(s: string, ms = 2600) { const t = $('toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('show'), ms); }
function toggleZones() { zoneOverlay.visible = !zoneOverlay.visible; $('btnZones').classList.toggle('on', zoneOverlay.visible); }
$('btnZones').onclick = toggleZones;
const minimap = new Minimap();
// ---------- post-processing (ambient occlusion makes contact/solidity readable); G toggles ----------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 });
gtao.blendIntensity = 0.85;
composer.addPass(gtao); composer.addPass(new OutputPass());
let quality = window.innerWidth > 720 && !new URLSearchParams(location.search).has('low');
function setQuality(q: boolean) { quality = q; toast(q ? 'Grafik: Tinggi (AO aktif)' : 'Grafik: Ringan'); }

function nearRack(): string | null {
  if (player.level === 1 && Math.hypot(player.pos.x - RACK.x, player.pos.z - RACK.z) < 2.2) return 'MDF';
  for (const d of IDFS) if (player.level === d.level && Math.hypot(player.pos.x - d.x, player.pos.z - (d.z + 0.9)) < 2.2) return d.id;
  return null;
}
function updateWalk(dt: number) {
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.2 : 1;
  if (keys.has('ArrowLeft')) player.yaw += 1.8 * dt; if (keys.has('ArrowRight')) player.yaw -= 1.8 * dt;
  if (keys.has('ArrowUp')) player.pitch = Math.min(1.3, player.pitch + dt); if (keys.has('ArrowDown')) player.pitch = Math.max(-1.3, player.pitch - dt);
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  // smooth look (mouse sets targets; view eases toward them) and smooth acceleration
  const sm = 1 - Math.exp(-dt * 22);
  if (Math.abs(player.yaw - view.yaw) > 2.5) view.yaw = player.yaw;
  view.yaw += (player.yaw - view.yaw) * sm; view.pitch += (player.pitch - view.pitch) * sm;
  const fwd = new THREE.Vector3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const want = ride ? new THREE.Vector3() : fwd.multiplyScalar(f).add(right.multiplyScalar(s));
  if (want.lengthSq() > 0) want.normalize().multiplyScalar(2.4 * run);
  const rate = !player.ground ? 2.5 : want.lengthSq() > 0 ? 11 : 13;
  const ka = 1 - Math.exp(-dt * rate);
  vel.x += (want.x - vel.x) * ka; vel.y += (want.z - vel.y) * ka;
  if (vel.lengthSq() < 1e-4 && want.lengthSq() === 0) vel.set(0, 0);
  const mv = ride ? new THREE.Vector3() : new THREE.Vector3(vel.x * dt, 0, vel.y * dt);
  const steps = Math.ceil(mv.length() / 0.2) || 1;
  for (let i = 0; i < steps && !ride; i++) {
    player.pos.x += mv.x / steps; player.pos.z += mv.z / steps;
    if (!insideHotel(player.pos.x, player.pos.z)) player.level = 1;
    const target = feetHeight(player.pos.x, player.pos.z, player.pos.y);
    if (!player.ground || target < player.pos.y - 0.6) {
      // airborne: jump arc or walking off a ledge
      if (player.ground) { player.ground = false; player.vy = 0; }
      player.vy -= 13 * dt / steps; player.pos.y += player.vy * dt / steps;
      if (player.pos.y <= target) { player.pos.y = target; player.vy = 0; player.ground = true; }
    } else player.pos.y += (target - player.pos.y) * Math.min(1, 12 * dt) + (Math.abs(target - player.pos.y) < 0.05 ? target - player.pos.y : 0);
    collide(player.pos, player.pos.y);
  }
  if (!ride && !player.ground && mv.lengthSq() === 0) { // keep gravity running while standing still mid-air
    const target = feetHeight(player.pos.x, player.pos.z, player.pos.y);
    if (player.pos.y <= target) { player.pos.y = target; player.vy = 0; player.ground = true; }
  }
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -200, 200); player.pos.z = THREE.MathUtils.clamp(player.pos.z, -150, 150);
  // avatar pose
  const moving = mv.lengthSq() > 1e-7;
  if (thirdPerson && moving && vel.lengthSq() > 0.05) {
    const hd = Math.atan2(-vel.x, -vel.y); let dd = hd - view.bodyYaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    view.bodyYaw += dd * (1 - Math.exp(-dt * 10));
  } else if (!thirdPerson) view.bodyYaw = view.yaw;
  avatar.root.position.copy(player.pos); avatar.root.rotation.y = view.bodyYaw + Math.PI;
  if (thirdPerson) {
    if (!player.ground) walkPose(avatar, 0.3, 0.9);
    else if (moving) { player.phase = (player.phase + mv.length() / (WALK_STRIDE * avatar.scale)) % 1; walkPose(avatar, player.phase, Math.min(1, vel.length() / 1.2)); }
    else idlePose(avatar, performance.now() / 1000);
  }
  avatar.root.visible = thirdPerson;
  const eyeY = player.pos.y + 1.62;
  if (!thirdPerson) {
    camera.position.set(player.pos.x, eyeY + (moving && player.ground ? Math.sin(player.phase * Math.PI * 4) * 0.02 * Math.min(1, vel.length() / 2.4) : 0), player.pos.z);
    camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
  } else {
    // over-the-shoulder orbit camera that stops before walls/ceilings
    const indoor = insideHotel(player.pos.x, player.pos.z);
    const wantD = indoor ? 2.3 : 3.6, pitch = THREE.MathUtils.clamp(view.pitch, -1.0, 0.9);
    view.head.lerp(new THREE.Vector3(player.pos.x, player.pos.y + 1.72, player.pos.z), view.head.distanceTo(player.pos) > 4 ? 1 : 1 - Math.exp(-dt * 18));
    const head = view.head;
    const back = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(view.yaw) * Math.cos(pitch));
    const side = new THREE.Vector3(Math.cos(view.yaw), 0, -Math.sin(view.yaw)).multiplyScalar(0.35);
    let d = 0.3; const q = new THREE.Vector3();
    const ceil = indoor ? LEVELS[player.level - 1].elev + LEVELS[player.level - 1].h - 0.35 : 1e9;
    while (d < wantD) { q.copy(head).addScaledVector(back, d + 0.1).add(side); if (blocked(q.x, q.z, q.y, 0.12) || q.y > ceil || q.y < player.pos.y + 0.2) break; d += 0.1; }
    camDist += (d - camDist) * Math.min(1, (d < camDist ? 20 : 5) * dt);
    camera.position.copy(head).addScaledVector(back, camDist).add(side);
    camera.position.y = Math.max(camera.position.y, player.pos.y + 0.25);
    camera.rotation.set(pitch, view.yaw, 0, 'YXZ');
  }
  // anchors nearby
  nearAnchor = null;
  if (insideHotel(player.pos.x, player.pos.z) && player.level === 1) {
    let best = 1.6;
    for (const [nm, ax, az] of ANCHORS) { const d = Math.hypot(player.pos.x - wx(HOTEL_ORIGIN[0] + ax), player.pos.z - wz(HOTEL_ORIGIN[1] + az)); if (d < best) { best = d; nearAnchor = nm; } }
  }
  nearPc = null;
  if (insideHotel(player.pos.x, player.pos.z)) {
    let best = 1.5;
    for (const c of PCS) { if (Math.abs(c.p.y - (player.pos.y + 0.9)) > 1.2) continue; const d = Math.hypot(player.pos.x - c.p.x, player.pos.z - c.p.z); if (d < best) { best = d; nearPc = c; } }
    // an anchor with no active mission step does not hide the computer in front of you
    if (nearPc && nearAnchor && !noc.anchorHint(nearAnchor)) nearAnchor = null;
  }
  const dr = insideHotel(player.pos.x, player.pos.z) ? nearestDoor(player.pos.x, player.pos.z, player.pos.y) : null;
  if (dr && !(nearAnchor && noc.anchorHint(nearAnchor)) && (!nearPc || Math.hypot(dr.cx - player.pos.x, dr.cz - player.pos.z) < Math.hypot(nearPc.p.x - player.pos.x, nearPc.p.z - player.pos.z))) { $('hudHint').textContent = dr.want ? '[F] Tutup pintu' : '[F] Buka pintu'; return; }
  const nh = noc.hintAt(nearPc?.name ?? null, nearRack());
  $('hudHint').textContent = (nh ? nh + ' · ' : '') + (nearPc && !nearAnchor ? `[F] Nyalakan ${nearPc.label}` : nearAnchor ? (noc.anchorHint(nearAnchor) ?? `[F] ${MISSIONS[nearAnchor]?.title ?? nearAnchor}`) : inVertical(player.pos.x, player.pos.z) && insideHotel(player.pos.x, player.pos.z) ? '[E] naik · [Q] turun lantai' : '') + '';
}

function locationName(x: number, z: number): string {
  if (insideHotel(x, z)) { const zn = zoneAt(x, z, player.level); return `BLD_HOTEL_NUSANTARA · L${player.level}${zn ? ' · ' + zn : ''}`; }
  const X = cityX(x), Z = cityZ(z);
  for (const r of ROADS) {
    const h = r.a[1] === r.b[1]; const c = h ? r.a[1] : r.a[0]; const half = ROAD_SPEC[r.kind].width / 2;
    const t = h ? X : Z, t0 = h ? r.a[0] : r.a[1], t1 = h ? r.b[0] : r.b[1];
    if (Math.abs((h ? Z : X) - c) <= half && t >= t0 && t <= t1) return r.name.replace('ROAD_', 'Jl. ').replace('_', ' ');
  }
  const zn = ZONES.find(zz => X >= zz.x[0] && X <= zz.x[1] && Z >= zz.z[0] && Z <= zz.z[1]);
  return zn ? zn.name : 'Kota Nusantara';
}

// ---------- GLB export ----------
$('btnExport').onclick = () => {
  toast('Menyiapkan GLB…');
  setTimeout(() => {
    setBakedVisible(world, true);
    new GLTFExporter().parse(world, res => {
      setBakedVisible(world, false);
      const blob = new Blob([res as ArrayBuffer], { type: 'model/gltf-binary' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kota-nusantara.glb'; a.click();
      toast('GLB terunduh: nama objek (ROAD_, BLD_, PROP_, ANCHOR_…) ikut tersimpan.');
    }, err => { setBakedVisible(world, false); toast('Gagal ekspor: ' + String(err)); }, { binary: true, onlyVisible: true });
  }, 50);
};

// ---------- loop ----------
let last = performance.now(), elapsed = 0;
const tmp = new THREE.Vector3();
const lightBasis = new THREE.Matrix4(), lightBasisT = new THREE.Matrix4(), ZERO3 = new THREE.Vector3(), UP3 = new THREE.Vector3(0, 1, 0), sunNeg = new THREE.Vector3();
let paused = false, fixedDt = 0, skipRender = false;
function frame() {
  const now = performance.now(); const dt = fixedDt || Math.min((now - last) / 1000, 0.05); last = now; elapsed += dt; const t = elapsed;
  if (mode === 'orbit') {
    if (tween) { tween.t = Math.min(1, tween.t + dt / 1.6); const e = 1 - Math.pow(1 - tween.t, 3); camera.position.lerpVectors(tween.from, tween.to, e); controls.target.lerpVectors(tween.tf, tween.tt, e); if (tween.t >= 1) tween = null; }
    controls.update();
  }
  { const wantNear = mode === 'walk' ? 0.15 : activeView === 'overview' ? 3 : 0.6; if (camera.near !== wantNear) { camera.near = wantNear; camera.updateProjectionMatrix(); } }
  noc.update(dt);
  updateDoors(dt, mode === 'walk' ? player.pos.x : 1e6, mode === 'walk' ? player.pos.z : 1e6, player.pos.y, cutaway ? LEVELS[1].elev - 0.5 : null);
  if (mode !== 'walk') { /* orbit */ } else if (!uiBlocked()) { updateRide(dt); updateWalk(dt); }
  else { camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); }
  signals.update(t); traffic.update(dt, t, mode === 'walk' ? player.pos : null); peds.update(dt, t);
  for (const m of ND.blinkMats) { const b = (m.userData.base ??= m.emissiveIntensity) as number; m.emissiveIntensity = b * (0.88 + (Math.sin(t * 17 + b * 13) > 0.5 ? 0.25 : 0)); }
  for (const m of blinkMaterials) m.emissiveIntensity = 0.75 + Math.sin(t * 9) * 0.15 + (Math.sin(t * 23) > 0.6 ? 0.25 : 0);
  // shadows follow focus
  const focus = mode === 'walk' ? camera.position : controls.target;
  tmp.copy(focus).setY(0);
  { // snap the shadow frustum to whole shadow-map texels in light space -> no shimmering/blinking shadows while moving
    const ext0 = mode === 'walk' ? 60 : 130, texel = (2 * ext0) / dir.shadow.mapSize.x;
    lightBasis.lookAt(ZERO3, sunNeg.copy(sun).negate(), UP3); lightBasisT.copy(lightBasis).transpose();
    tmp.applyMatrix4(lightBasisT); tmp.x = Math.round(tmp.x / texel) * texel; tmp.y = Math.round(tmp.y / texel) * texel; tmp.applyMatrix4(lightBasis);
  }
  dir.target.position.copy(tmp); dir.position.copy(tmp).add(sun.clone().multiplyScalar(320));
  const ext = mode === 'walk' ? 60 : 130; if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
  const inside = insideHotel(camera.position.x, camera.position.z) && camera.position.y < 30;
  interiorLight.intensity = inside ? 3 : 0; interiorLight.position.copy(camera.position).add(new THREE.Vector3(0, 1.2, 0));
  hemi.intensity = inside ? 1.25 : 0.75;
  // HUD
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  const hdg = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360;
  ($('needle') as HTMLElement).style.transform = `rotate(${-hdg}deg)`;
  const card = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'][Math.round(hdg / 45) % 8];
  $('heading').textContent = `ARAH ${card} ${hdg.toFixed(0).padStart(3, '0')}°`;
  const px = mode === 'walk' ? player.pos.x : controls.target.x, pz = mode === 'walk' ? player.pos.z : controls.target.z;
  $('xyz').textContent = `X ${cityX(px).toFixed(1)} · Z ${cityZ(pz).toFixed(1)}`;
  $('floor').textContent = mode === 'walk' && insideHotel(px, pz) ? `LANTAI ${player.level}` : '';
  if (mode === 'walk') $('hudLoc').textContent = locationName(px, pz);
  if (mode === 'walk') {
    const onL1 = player.level === 1;
    missions.setPlayerPos(onL1 ? player.pos.x : 1e6, onL1 ? player.pos.z : 1e6);
    const cur = missions.current();
    const tk = noc.tracked();
    if (tk && !uiBlocked()) {
      const same = player.level === tk.pc.level, fy = tk.pc.y - 1.0;
      missionMarker.setTarget(same ? { x: tk.pc.x, z: tk.pc.z, y: fy } : null); missionMarker.update(t);
      updateWaypoint(waypoint, camera, { x: player.pos.x, z: player.pos.z }, { x: tk.pc.x, z: tk.pc.z, y: fy + 1.3 }, { label: same ? `${tk.id} · ${tk.pc.label}` : `${tk.pc.level > player.level ? 'Naik' : 'Turun'} ke Lantai ${tk.pc.level} · ${tk.id}` });
    } else {
    const tgt = cur.targetPos && !missions.isModalOpen() ? { x: cur.targetPos.x, z: cur.targetPos.z, y: cur.targetY } : null;
    missionMarker.setTarget(tgt); missionMarker.update(t);
    updateWaypoint(waypoint, camera, { x: player.pos.x, z: player.pos.z }, tgt && { x: tgt.x, z: tgt.z, y: tgt.y + 1.3 }, { label: onL1 ? cur.place : `Turun ke Lantai 1 · ${cur.place}` });
    }
  } else { missionMarker.setTarget(null); updateWaypoint(waypoint, camera, null, null); }
  if (mode === 'walk') minimap.update(cityX(player.pos.x), cityZ(player.pos.z), hdg * Math.PI / 180, missionTarget());
  if (!skipRender) { if (quality) composer.render(); else renderer.render(scene, camera); }
  if (!paused) requestAnimationFrame(frame);
}

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); });
function missionTarget(): { x: number; z: number } | null { const tk = noc.tracked(); if (tk) return { x: cityX(tk.pc.x), z: cityZ(tk.pc.z) }; const c = missions.current(); return c.targetPos ? { x: cityX(c.targetPos.x), z: cityZ(c.targetPos.z) } : null; }

goView('overview', true);
requestAnimationFrame(() => { frame(); const l = $('loading'); l.style.opacity = '0'; setTimeout(() => l.remove(), 600); });

// test hooks (used by automated playtest)
(window as any).__kota = {
  goView: (id: string) => goView(id, true), enterWalk, keys, player, renderer, scene, world,
  teleport: (X: number, Z: number, level = 1, yaw = Math.PI) => { player.pos.set(wx(X), LEVELS[level - 1].elev + 0.12, wz(Z)); player.level = level; player.yaw = yaw; },
  // automated playtest on software GL: pause the rAF loop so real input events get dispatched, then advance fixed steps
  pause: (v: boolean) => { const was = paused; paused = v; if (was && !v) { last = performance.now(); requestAnimationFrame(frame); } },
  step: (n = 1, dt = 1 / 30) => { fixedDt = dt; for (let i = 0; i < n; i++) { skipRender = i < n - 1; frame(); } skipRender = false; fixedDt = 0; },
  state: () => ({ mode, body: document.body.className, x: cityX(player.pos.x), z: cityZ(player.pos.z), y: player.pos.y, lv: player.level, loc: $('hudLoc').textContent, hint: $('hudHint').textContent, toast: $('toast').textContent }),
  near: (X: number, Z: number, r = 1.5) => colliders.filter(c => wx(X) > c.minX - r && wx(X) < c.maxX + r && wz(Z) > c.minZ - r && wz(Z) < c.maxZ + r && c.minY < 2 && c.maxY > 0.4).map(c => [c.minX + 200, c.maxX + 200, c.minZ + 150, c.maxZ + 150, c.minY, c.maxY].map(v => +v.toFixed(2))),
  solidAudit: (rootName = 'FASE_C_GEDUNG_KOTA') => {
    const out: string[] = []; const bx = new THREE.Box3(); let checked = 0;
    const root = world.getObjectByName(rootName) ?? world;
    root.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || (m as any).isInstancedMesh) return;
      let skip = false; for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q.userData.noCollide || /^(DOOR_|GROUND|ZONE_|SKYLINE|ROAD_|SIDEWALK|MARK|ZEBRA|KERB|LANE_|ARROW_)/.test(q.name)) skip = true;
      if (skip) return;
      bx.setFromObject(m); const h = bx.max.y - bx.min.y, w = bx.max.x - bx.min.x, d = bx.max.z - bx.min.z;
      if (h < 1.2 || bx.min.y > 1.0 || Math.min(w, d) < 0.3) return;
      checked++; const y = bx.min.y + 0.9, cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2;
      const pts = [[cx, cz], [bx.min.x + w * 0.15, bx.min.z + d * 0.15], [bx.max.x - w * 0.15, bx.max.z - d * 0.15], [bx.min.x + w * 0.15, bx.max.z - d * 0.15], [bx.max.x - w * 0.15, bx.min.z + d * 0.15]];
      const miss = pts.filter(([x, z]) => !blocked(x, z, y, 0)).length;
      if (miss) out.push(`${o.name || o.parent?.name + '/?'} miss=${miss} @${cityX(cx).toFixed(0)},${cityZ(cz).toFixed(0)} ${w.toFixed(1)}x${d.toFixed(1)}x${h.toFixed(1)}`);
    });
    out.unshift('checked ' + checked); return out;
  },
  liftPos: () => ({ x: HOTEL_ORIGIN[0] + 21.5, z: HOTEL_ORIGIN[1] + 15 }),
  cam: () => ({ y: camera.position.y, py: player.pos.y, pitch: view.pitch }),
  doorTest: () => {
    const d = nearestDoor(player.pos.x, player.pos.z, player.pos.y, 50); if (!d) return 'none';
    toggleDoor(d); for (let i = 0; i < 90; i++) updateDoors(1 / 60, 1e6, 1e6, 0, null);
    const o1 = d.open; toggleDoor(d); for (let i = 0; i < 90; i++) updateDoors(1 / 60, 1e6, 1e6, 0, null);
    return `opened=${o1.toFixed(2)} closed=${d.open.toFixed(2)} total=${(window as any).__doorCount ?? '?'}`;
  },
  portOf: (n: string) => { const q = portOf(n); return q && { sw: q.sw.name, n: q.port.n, vlan: q.port.vlan, home: q.sw.level === 1 ? 10 : 20 }; },
  panelOf: (n: string) => { const q = panelOf(n); return q && { sw: q.sw.name, pp: q.pp.n, label: q.pp.label, patch: q.pp.patch, hang: q.pp.hang, lv: q.sw.level }; },
  nearRack: () => nearRack(), idfs: () => IDFS.map(d => ({ ...d, x: d.x + 200, z: d.z + 150 })),
  noc, missions, pcos, pcs: () => PCS.map(c => ({ name: c.name, x: c.p.x + 200, z: c.p.z + 150, y: c.p.y })), nearPc: () => nearPc?.name ?? null,
  look: (pitch: number) => { player.pitch = pitch; },
  /** QA: walkability grid of a hotel level (local metres, -1..31 x -1..21). 0 blocked, 1 standable+reachable from seed, 2 standable but unreachable */
  reach: (lv: number, seedX = 1, seedZ = 11, st = 0.2) => {
    const feet = LEVELS[lv - 1].elev + 0.12, x0 = -1, z0 = -1, W = Math.round(32 / st), H = Math.round(22 / st);
    const g = new Uint8Array(W * H), q = new THREE.Vector3();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const cx = wx(HOTEL_ORIGIN[0] + x0 + (i + 0.5) * st), cz = wz(HOTEL_ORIGIN[1] + z0 + (j + 0.5) * st);
      q.set(cx, feet, cz); resolveCircle(q, feet, RADIUS, []);
      g[j * W + i] = Math.hypot(q.x - cx, q.z - cz) < 0.01 ? 2 : 0;
    }
    const si = Math.floor((seedX - x0) / st), sj = Math.floor((seedZ - z0) / st), stack = [sj * W + si];
    if (g[stack[0]] !== 2) return { err: 'seed blocked', W, H };
    g[stack[0]] = 1;
    while (stack.length) { const k = stack.pop()!; const i = k % W, j = (k / W) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue; const n = b * W + a; if (g[n] === 2) { g[n] = 1; stack.push(n); } } }
    return { W, H, st, x0, z0, data: Array.from(g).join('') };
  },
  stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, colliders: colliders.length, vehicles: traffic.vehicles.length, peds: peds.peds.length }),
};
