import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ZONES, ROADS, ROAD_SPEC, LEVELS, SPAWN, ANCHORS, HOTEL_ORIGIN, wx, wz } from './data/city';
import { colliders, bakeStatic, setBakedVisible, type AABB } from './world/core';
import { buildAutoColliders, buildGrid, resolveCircle, blocked } from './game/physics';
import { createPerson, randomSpec, walkPose, idlePose, typingPose, WALK_STRIDE } from './assets/people';
import { buildRoads } from './world/roads';
import { buildGround, buildCity } from './world/buildings';
import { buildHotel, updateDoors, closedDoorBoxes, nearestDoor, toggleDoor, blinkMaterials, insideHotel, zoneAt, verticalZones } from './world/hotel';
import { buildStreetProps } from './world/props';
import { Signals, Traffic, Pedestrians } from './game/traffic';
import { MISSIONS } from './game/missions';
import * as ND from './assets/netdevices';
import { hotelAnchorsWorld } from './game/missionSystem';
import { initLinux, linuxQa } from './pcos/linux';
import { initSwitches, portOf, panelOf, adapterOf, envOf, healthy } from './pcos/net';
import { registerClient, AUTH, APS, quality as wifiQuality, servingAp, CLIENTS } from './pcos/wifi';
import { Vertical } from './game/vertical';
import { createWaypoint, updateWaypoint, createAnchorMarker } from './ui/waypoint';

import { buildWayfinding } from './world/wayfinding';
import { dressL1, l1Lights } from './world/interiorDressing';
import { Minimap } from './ui/minimap';
import { PcOS } from './pcos/os';
import { Noc } from './game/noc';
import { setupTouch, touch, isTouch } from './ui/touch';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const $ = (id: string) => document.getElementById(id)!;
// ---------- stale-cache guard: if the server has a newer build than this page, reload it once with a cache-busting query ----------
declare const __BUILD__: string;
(window as any).__BUILD__ = __BUILD__;
if (location.protocol.startsWith('http') && __BUILD__ !== 'dev') {
  fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(v => {
    const b = v?.build as string | undefined;
    if (b && b !== __BUILD__ && sessionStorage.getItem('kn-reloaded') !== b) { sessionStorage.setItem('kn-reloaded', b); location.replace(`${location.pathname}?v=${b}`); }
  }).catch(() => { /* offline / file:// */ });
}
const cityX = (x: number) => x + 200, cityZ = (z: number) => z + 150;

// ---------- renderer / scene ----------
const QS = new URLSearchParams(location.search);
const TOUCH0 = isTouch();
const renderer = new THREE.WebGLRenderer({ antialias: !TOUCH0, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH0 ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.info.autoReset = false;
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
const PCS: { name: string; label: string; p: THREE.Vector3; o: THREE.Object3D }[] = [];
hotel.updateMatrixWorld(true);
hotel.traverse(o => { const m = /^PROP_(L\d)_(PC|LAPTOP)_((?:[A-Z]+_)?\d+)$/.exec(o.name); if (m) PCS.push({ name: o.name, label: `${m[2] === 'PC' ? 'PC' : 'Laptop'} ${m[3].replace(/_/g, ' ')} · ${m[1]}`, p: new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()), o }); });
const pcos = new PcOS();
const RACK = hotelAnchorsWorld().find(a => a.name === 'ANCHOR_SRV_NETRACK_01')!;
const CABINET = hotelAnchorsWorld().find(a => a.name === 'ANCHOR_WS_TOOLCAB_01')!;
initSwitches(PCS.map(c => c.name));
initLinux();
// hotel-room laptops are Wi-Fi clients; guests already logged in to the captive portal
for (const c of PCS) { const lv = +(/_L(\d)_/.exec(c.name)?.[1] ?? 1); if (lv >= 4) { registerClient(c.name, c.p.x, c.p.y, c.p.z, lv); AUTH.add(adapterOf(c.name).mac); } }
// IDF wall racks of the office floors (one access switch + patch panel each); the player stands in front of them
const IDFS = [2, 3, 4, 5, 6, 7, 8].map(lv => { const o = hotel.getObjectByName(`PROP_L${lv}_IDF_RACK_01`); const c = o ? new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()) : new THREE.Vector3(); return { id: `IDF-L${lv}`, level: lv, x: c.x, y: c.y, z: c.z - 0.9 }; });
const noc = new Noc(pcos, PCS.map(c => ({ name: c.name, label: c.label, x: c.p.x, y: c.p.y, z: c.p.z, level: +(/_L(\d)_/.exec(c.name)?.[1] ?? 1) })), RACK, CABINET, IDFS);
noc.onApVisual = ap => { const o = hotel.getObjectByName(`PROP_L${ap.level}_CORRIDOR_AP_${ap.lx}`); if (o) o.visible = ap.mounted; };
const { tls } = buildStreetProps(world);
buildWayfinding(world);
dressL1(hotel);
l1Lights(scene);
const signals = new Signals(tls);
const gameLayer = new THREE.Group(); gameLayer.name = 'GAME_LAYER'; scene.add(gameLayer);
const traffic = new Traffic(gameLayer, signals);
const peds = new Pedestrians(gameLayer);
const vertical = new Vertical(hotel, gameLayer);
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
for (const lvName of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'ROOF', 'EXTERIOR']) { const b = bakeStatic(hotel.getObjectByName(lvName)!, `BATCH_${lvName}`, o => /^(DOOR_|LIFT_|PROP_L\d_CORRIDOR_AP_)/.test(o.name)); batches.add(b); hotelBatches.set(lvName, b); }
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
/** true while the player is under script control (lift, stair walk, sitting down at a PC) */
let ride = false;
/** sitting down at / standing up from a PC: the camera glides, the OS opens when seated */
let seat: { phase: 'sit' | 'seated' | 'stand'; t: number; fp: THREE.Vector3; fyaw: number; fpitch: number; tp: THREE.Vector3; tyaw: number; tpitch: number; pc: { name: string; label: string }; foot: THREE.Vector3 } | null = null;
const fx = { fov: 55, roll: 0, dip: 0, dipV: 0, wasGround: true, sway: 0 };
// player avatar (seen in third-person view; V toggles)
let thirdPerson = false;
const avatar = createPerson(randomSpec(() => 0.42, 'student_m'));
avatar.root.name = 'PLAYER_AVATAR'; avatar.root.visible = false;
avatar.root.traverse(o => { (o as THREE.Mesh).frustumCulled = false; }); scene.add(avatar.root);
const keys = new Set<string>();
missions.onModalChange(open => { if (open) keys.clear(); });
noc.toast = (s, ms) => toast(s, ms);
noc.onModal(open => { if (open) keys.clear(); else last = performance.now(); });
const uiBlocked = () => missions.isModalOpen() || pcos.isOpen() || noc.isModalOpen() || liftPanel.isOpen();
function enterWalk() {
  mode = 'walk'; document.body.classList.add('entered'); document.body.classList.remove('viewing'); setCutaway(false); controls.enabled = false; tween = null;
  player.pos.set(wx(SPAWN[0]), 0.15, wz(SPAWN[1])); player.yaw = Math.PI; player.pitch = -0.02; player.level = 1;
  $('hints').textContent = 'WASD jalan · Mouse menoleh · Shift lari · Spasi lompat · V kamera · F interaksi · T papan kerja · C cek fisik · R Wi-Fi analyzer · E/Q tangga/lift · M peta · Esc keluar';
  document.querySelectorAll('#views button').forEach(b => b.classList.remove('active'));
  if (!isTouch()) { try { renderer.domElement.requestPointerLock?.(); } catch { /* ignore */ } }
  touchUi?.onEnter();
  missionUI.setHudVisible(true); noc.setHudVisible(true);
  missions.start();
  if (!QS.has('qa') || QS.has('tutor')) setTimeout(() => { if (mode === 'walk') noc.maybeStartTutorial(); }, 900);
}
function exitWalk() {
  mode = 'orbit'; document.body.classList.remove('entered'); controls.enabled = true;
  $('hints').textContent = 'Klik/tarik untuk memutar · roda untuk zoom';
  if (document.pointerLockElement) document.exitPointerLock();
  missionUI.setHudVisible(false); noc.setHudVisible(false);
}
$('enter').onclick = enterWalk;
const touchUi = setupTouch({ canvas: renderer.domElement, toast: (m, ms) => toast(m, ms), active: () => mode === 'walk' && !uiBlocked() && !ride, look: (dx, dy) => { player.yaw -= dx * 0.0022; player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.0022, -1.3, 1.3); } });
$('btnBack').onclick = () => goView('overview');
window.addEventListener('keydown', e => {
  if (pcos.isOpen() || noc.isModalOpen()) return;
  if (liftPanel.isOpen()) { if (!e.repeat) liftPanel.key(e.code); e.preventDefault(); return; }
  if ((e.target as HTMLElement)?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
  keys.add(e.code);
  if (e.code === 'Escape' && mode === 'walk') goView('overview');
  if (e.code === 'KeyZ') toggleZones();
  if (e.code === 'KeyM' && mode === 'walk') minimap.toggle();
  if (e.code === 'KeyG') setQuality();
  if (mode === 'walk' && (e.code === 'KeyE' || e.code === 'KeyQ')) changeFloor(e.code === 'KeyE' ? 1 : -1);
  if (mode === 'walk' && e.code === 'KeyF') interact();
  if (mode === 'walk' && e.code === 'KeyR' && !uiBlocked()) noc.setAnalyzer(!noc.analyzerOn);
  if (mode === 'walk' && e.code === 'KeyT' && !missions.isModalOpen()) noc.openBoard();
  if (mode === 'walk' && e.code === 'KeyC' && !missions.isModalOpen()) { const m = noc.physical(nearPc?.name ?? null, nearRack()); if (m) toast(m, 5200); }
  if (mode === 'walk' && e.code === 'Space') { e.preventDefault(); if (player.ground && !missions.isModalOpen()) { player.vy = 4.4; player.ground = false; } }
  if (mode === 'walk' && e.code === 'KeyV') { thirdPerson = !thirdPerson; toast(thirdPerson ? 'Kamera orang ketiga (V untuk ganti)' : 'Kamera orang pertama (V untuk ganti)', 1800); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => { if (mode === 'walk' && !isTouch() && !uiBlocked() && !document.pointerLockElement) renderer.domElement.requestPointerLock?.(); });
let drag = false, lx = 0, ly = 0;
renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && mode === 'walk') return; drag = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('pointerup', () => (drag = false));
window.addEventListener('pointermove', e => {
  if (mode !== 'walk' || e.pointerType === 'touch') return;
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
    if (player.level === 1 && x > wx(HOTEL_ORIGIN[0] + 23) && z > wz(HOTEL_ORIGIN[1] + 12)) return base + 0.3 * THREE.MathUtils.clamp((z - wz(HOTEL_ORIGIN[1] + 12)) / 1.2, 0, 1); // raised floor, ramp at the door
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
  vertical.closedBoxes(player.level, vehicleBoxes);
  resolveCircle(p, feet, RADIUS, vehicleBoxes);
}
function inVertical(x: number, z: number) {
  if (insideHotel(x, z) && cityZ(z) > HOTEL_ORIGIN[1] + 10.3 && cityZ(z) < HOTEL_ORIGIN[1] + 12.2 && cityX(x) > HOTEL_ORIGIN[0] + 15.5 && cityX(x) < HOTEL_ORIGIN[0] + 23) return true; // standing at the stair/lift doors
  return verticalZones.some(v => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1); }
const atLift = () => player.pos.x > wx(HOTEL_ORIGIN[0] + 19);
function changeFloor(d: number, target?: number) {
  if (vertical.busy() || seat) return;
  if (!insideHotel(player.pos.x, player.pos.z) || !inVertical(player.pos.x, player.pos.z)) { toast('Naik/turun lantai hanya di depan pintu tangga atau lift (core gedung).'); return; }
  if (atLift() && target === undefined) { liftPanel.open(d); return; }
  keys.clear(); vel.set(0, 0);
  const err = vertical.start(player, d > 0 ? 1 : -1, target);
  if (err && err !== 'busy') toast(err);
}
/** lift hall panel: pick the destination floor (1-8 keys, tap, or E/Q = one floor up/down) */
const liftPanel = (() => {
  const el = document.createElement('div'); el.id = 'liftpanel'; document.body.appendChild(el);
  let on = false;
  const close = () => { on = false; el.classList.remove('on'); };
  const go = (lv: number) => { close(); changeFloor(lv > player.level ? 1 : -1, lv); };
  return {
    isOpen: () => on,
    open(d: number) {
      keys.clear(); vel.set(0, 0); on = true; if (document.pointerLockElement) document.exitPointerLock();
      el.innerHTML = `<div class="lp-h">LIFT · kamu di lantai ${player.level}</div><div class="lp-g"></div><div class="lp-f">Tekan 1–8 atau ketuk lantai tujuan · E/Q = satu lantai · Esc batal</div>`;
      const g = el.querySelector('.lp-g')!;
      for (let lv = LEVELS.length; lv >= 1; lv--) {
        const b = document.createElement('button'); b.type = 'button'; b.name = `lift-${lv}`; b.textContent = String(lv);
        b.title = lv === 1 ? 'Lobi · Workshop · Ruang Server' : lv <= 3 ? 'Kantor' : 'Hotel';
        if (lv === player.level) b.className = 'cur'; else if (lv === player.level + d) b.className = 'sug';
        b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (lv !== player.level) go(lv); });
        b.addEventListener('click', e => e.stopPropagation());
        g.appendChild(b);
      }
      const x = document.createElement('button'); x.type = 'button'; x.className = 'lp-x'; x.name = 'lift-cancel'; x.textContent = 'Batal';
      x.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); close(); }); el.appendChild(x);
      el.classList.add('on');
    },
    key(code: string) {
      if (code === 'Escape') { close(); return true; }
      const m = /^(?:Digit|Numpad)([1-8])$/.exec(code); if (m) { if (+m[1] !== player.level) go(+m[1]); return true; }
      if (code === 'KeyE' || code === 'KeyQ') { const to = player.level + (code === 'KeyE' ? 1 : -1); if (to >= 1 && to <= LEVELS.length) go(to); else { close(); toast(code === 'KeyE' ? 'Ini lantai paling atas.' : 'Ini lantai paling bawah.'); } return true; }
      return true;
    },
  };
})();
const liftInd = (() => { const e = document.createElement('div'); e.id = 'liftind'; document.body.appendChild(e); return e; })();
let nearAnchor: string | null = null;
let nearPc: (typeof PCS)[number] | null = null;
let camDist = 2;
pcos.onClose = () => {
  keys.clear(); last = performance.now();
  if (seat) { seat.phase = 'stand'; seat.t = 0; seat.fp = seat.tp.clone(); seat.fyaw = seat.tyaw; seat.fpitch = seat.tpitch; seat.tp = new THREE.Vector3(player.pos.x, player.pos.y + 1.62, player.pos.z); seat.tpitch = -0.08; }
};
/** walk the camera down into the chair in front of a PC, then open its OS */
function sitAt(pc: (typeof PCS)[number]) {
  keys.clear(); vel.set(0, 0); if (document.pointerLockElement) document.exitPointerLock();
  const q = new THREE.Quaternion(); pc.o.getWorldQuaternion(q);
  const toMe = new THREE.Vector3(player.pos.x - pc.p.x, 0, player.pos.z - pc.p.z);
  let n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0);
  if (n.lengthSq() < 1e-4) n = toMe.clone(); n.normalize(); if (n.dot(toMe) < 0) n.negate();
  if (toMe.lengthSq() > 1e-4 && n.dot(toMe.clone().normalize()) < 0.35) n.copy(toMe).normalize();   // laptops/odd rotations: sit on the side you came from
  const floor = player.pos.y, eye = pc.p.clone().addScaledVector(n, 0.66); eye.y = floor + 1.2;
  const yaw = Math.atan2(n.x, n.z), pitch = Math.atan2(pc.p.y - eye.y, 0.66);
  seat = { phase: 'sit', t: 0, fp: camera.position.clone(), fyaw: view.yaw, fpitch: view.pitch, tp: eye, tyaw: view.yaw + Math.atan2(Math.sin(yaw - view.yaw), Math.cos(yaw - view.yaw)), tpitch: pitch, pc, foot: pc.p.clone().addScaledVector(n, 0.78).setY(floor) };
}
function updateSeat(dt: number) {
  if (!seat) return;
  const S = seat, dur = S.phase === 'sit' ? 0.62 : S.phase === 'stand' ? 0.5 : 1;
  if (S.phase !== 'seated') S.t = Math.min(1, S.t + dt / dur);
  const k = S.t, e = k * k * (3 - 2 * k);
  const p = S.phase === 'seated' ? S.tp : new THREE.Vector3().lerpVectors(S.fp, S.tp, e);
  if (S.phase !== 'seated') p.y += Math.sin(Math.PI * k) * (S.phase === 'sit' ? 0.05 : 0.04);
  const yaw = S.phase === 'seated' ? S.tyaw : S.fyaw + (S.tyaw - S.fyaw) * e, pitch = S.phase === 'seated' ? S.tpitch : S.fpitch + (S.tpitch - S.fpitch) * e;
  camera.position.copy(p); camera.rotation.set(pitch, yaw, 0, 'YXZ');
  avatar.root.visible = thirdPerson && S.phase !== 'seated';
  if (thirdPerson) { avatar.root.position.copy(S.phase === 'stand' ? new THREE.Vector3().lerpVectors(S.foot, player.pos, e) : S.foot); avatar.root.rotation.y = S.tyaw + Math.PI; typingPose(avatar, performance.now() / 1000); }
  if (S.phase === 'sit' && S.t >= 1) { S.phase = 'seated'; pcos.open(S.pc.name, S.pc.label); }
  else if (S.phase === 'stand' && S.t >= 1) { player.yaw = view.yaw = S.tyaw; player.pitch = view.pitch = S.tpitch; seat = null; }
}
function nearSpot() {
  for (const sp of noc.spots()) if (sp.level === player.level && Math.hypot(player.pos.x - sp.x, player.pos.z - sp.z) < 1.5) return sp;
  return null;
}
function interact() {
  if (uiBlocked() || ride) return;
  const sp = nearSpot(); if (sp) { noc.useSpot(sp.id); return; }
  const rk = nearRack();
  if (rk && rk !== 'MDF' && !nearPc) { keys.clear(); noc.openRack(rk); return; }
  const door = nearestDoor(player.pos.x, player.pos.z, player.pos.y);
  if (door && !(nearAnchor && noc.anchorHint(nearAnchor)) && (!nearPc || Math.hypot(door.cx - player.pos.x, door.cz - player.pos.z) < Math.hypot(nearPc.p.x - player.pos.x, nearPc.p.z - player.pos.z))) { toggleDoor(door); return; }
  if (!nearAnchor && nearPc) { sitAt(nearPc); return; }
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
// ---------- graphics quality: automatic low mode for phones / slow GPUs, G or the Grafik button cycles ----------
type QName = 'tinggi' | 'sedang' | 'rendah' | 'hemat';
interface QProfile { label: string; pr: number; ao: boolean; shadow: number; far: number; fog: [number, number]; traffic: number; peds: number }
const QUALITY: Record<QName, QProfile> = {
  tinggi: { label: 'Tinggi', pr: 2, ao: true, shadow: 4096, far: 1600, fog: [220, 1400], traffic: 1, peds: 1 },
  sedang: { label: 'Sedang', pr: 1.5, ao: false, shadow: 2048, far: 900, fog: [160, 850], traffic: 0.6, peds: 0.67 },
  rendah: { label: 'Rendah', pr: 1, ao: false, shadow: 0, far: 420, fog: [90, 400], traffic: 0.35, peds: 0.34 },
  hemat: { label: 'Hemat', pr: 0.7, ao: false, shadow: 0, far: 260, fog: [55, 250], traffic: 0.2, peds: 0.34 },
};
const QORDER: QName[] = ['tinggi', 'sedang', 'rendah', 'hemat'];
let qName: QName = (QORDER as string[]).includes(QS.get('q') ?? '') ? QS.get('q') as QName : QS.has('low') || TOUCH0 ? 'rendah' : window.innerWidth <= 720 ? 'sedang' : 'tinggi';
let quality = false;              // true = post-processing (AO) on
let autoQ = !QS.has('q');         // the FPS watchdog may lower quality until the player picks one
function applyQuality(n: QName, why: 'start' | 'manual' | 'auto' = 'manual') {
  const Q = QUALITY[n], prevShadow = renderer.shadowMap.enabled; qName = n; quality = Q.ao;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pr)); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
  const sh = Q.shadow > 0; renderer.shadowMap.enabled = sh; dir.castShadow = sh;
  if (sh && dir.shadow.mapSize.x !== Q.shadow) { dir.shadow.mapSize.set(Q.shadow, Q.shadow); dir.shadow.map?.dispose(); (dir.shadow as { map: THREE.WebGLRenderTarget | null }).map = null; }
  if (prevShadow !== sh) scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true)); });
  farBase = Q.far; (scene.fog as THREE.Fog).near = Q.fog[0]; (scene.fog as THREE.Fog).far = Q.fog[1];
  traffic.setDensity(Q.traffic); peds.setDensity(Q.peds);
  const b = document.getElementById('btnGfx'); if (b) b.textContent = `Grafik: ${Q.label}${autoQ ? ' (otomatis)' : ''}`;
  if (why === 'manual') toast(`Grafik: ${Q.label}${Q.ao ? ' (AO + bayangan)' : Q.shadow ? ' (bayangan, tanpa AO)' : ' (tanpa bayangan, jarak pandang pendek)'}`);
  if (why === 'auto') toast(`FPS rendah: grafik diturunkan otomatis ke ${Q.label}. Tekan G / tombol Grafik untuk mengganti.`, 4200);
}
function setQuality(_q?: boolean) { autoQ = false; applyQuality(QORDER[(QORDER.indexOf(qName) + 1) % QORDER.length]); }
let farBase = 1600;
/** FPS watchdog: after a warm-up, if the average frame rate stays low, step quality down one level */
const fpsW = { t: 0, n: 0, warm: 4 };
function watchFps(realDt: number) {
  if (!autoQ || paused || fixedDt || mode !== 'walk' || uiBlocked() || document.hidden) { fpsW.t = fpsW.n = 0; return; }
  if (fpsW.warm > 0) { fpsW.warm -= realDt; return; }
  fpsW.t += realDt; fpsW.n++;
  if (fpsW.t >= 4) { const fps = fpsW.n / fpsW.t; fpsW.t = fpsW.n = 0; const i = QORDER.indexOf(qName); if (fps < 24 && i < QORDER.length - 1) { applyQuality(QORDER[i + 1], 'auto'); fpsW.warm = 3; } }
}
/** inside the hotel only the floors around the camera can be seen: hide the others (big draw-call saving on every quality level) */
const LEVEL_GROUPS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'ROOF'].map((n, i) => ({ lv: i + 1, batch: hotelBatches.get(n)!, group: hotel.getObjectByName(n)! }));
let cullKey = '';
function cullHotel() {
  const inside = mode === 'walk' && insideHotel(camera.position.x, camera.position.z) && camera.position.y < 27;
  let lvCam = 1; LEVELS.forEach((L, i) => { if (camera.position.y >= L.elev - 0.2) lvCam = i + 1; });
  const key = inside ? `in${lvCam}` : cutaway ? 'cut' : 'out';
  if (key === cullKey) return; cullKey = key;
  for (const g of LEVEL_GROUPS) { const vis = !inside || Math.abs(g.lv - lvCam) <= 1; g.group.visible = vis; g.batch.visible = vis && !(cutaway && g.lv >= 2); }
  if (!inside && cutaway) setCutaway(true);
}

function nearRack(): string | null {
  if (player.level === 1 && Math.hypot(player.pos.x - RACK.x, player.pos.z - RACK.z) < 2.2) return 'MDF';
  for (const d of IDFS) if (player.level === d.level && Math.hypot(player.pos.x - d.x, player.pos.z - (d.z + 0.9)) < 2.2) return d.id;
  return null;
}
function updateWalk(dt: number) {
  ride = vertical.busy();
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run ? 2.2 : 1;
  if (!ride) { if (keys.has('ArrowLeft')) player.yaw += 1.8 * dt; if (keys.has('ArrowRight')) player.yaw -= 1.8 * dt; }
  if (keys.has('ArrowUp')) player.pitch = Math.min(1.3, player.pitch + dt); if (keys.has('ArrowDown')) player.pitch = Math.max(-1.3, player.pitch - dt);
  const f = ride ? 0 : THREE.MathUtils.clamp((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touch.y, -1, 1), s = ride ? 0 : THREE.MathUtils.clamp((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.x, -1, 1);
  // smooth look: the mouse sets targets, the view eases toward them (shortest way round, no snapping)
  const sm = 1 - Math.exp(-dt * 24);
  view.yaw += Math.atan2(Math.sin(player.yaw - view.yaw), Math.cos(player.yaw - view.yaw)) * sm; view.pitch += (player.pitch - view.pitch) * sm;
  const fwd = new THREE.Vector3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const want = ride ? new THREE.Vector3() : fwd.multiplyScalar(f).add(right.multiplyScalar(s));
  if (want.lengthSq() > 0) { const mag = Math.min(1, want.length()); want.normalize().multiplyScalar(2.4 * run * mag); }
  // acceleration: quick to start, a short glide to stop, little control in the air
  const rate = !player.ground ? 2.5 : want.lengthSq() > 0 ? 9 : 11;
  const ka = 1 - Math.exp(-dt * rate);
  vel.x += (want.x - vel.x) * ka; vel.y += (want.z - vel.y) * ka;
  if (vel.lengthSq() < 1e-4 && want.lengthSq() === 0) vel.set(0, 0);
  if (ride) vel.set(0, 0);
  const mv = ride ? new THREE.Vector3() : new THREE.Vector3(vel.x * dt, 0, vel.y * dt);
  const steps = Math.ceil(mv.length() / 0.2) || 1;
  for (let i = 0; i < steps && !ride; i++) {
    player.pos.x += mv.x / steps; player.pos.z += mv.z / steps;
    if (!insideHotel(player.pos.x, player.pos.z)) player.level = 1;
    const target = feetHeight(player.pos.x, player.pos.z, player.pos.y);
    if (!player.ground || target < player.pos.y - 0.6) {
      if (player.ground) { player.ground = false; player.vy = 0; }
      player.vy -= 13 * dt / steps; player.pos.y += player.vy * dt / steps;
      if (player.pos.y <= target) { fx.dipV = Math.min(fx.dipV, -Math.min(1.6, Math.abs(player.vy) * 0.35)); player.pos.y = target; player.vy = 0; player.ground = true; }
    } else player.pos.y += (target - player.pos.y) * Math.min(1, 12 * dt) + (Math.abs(target - player.pos.y) < 0.05 ? target - player.pos.y : 0);
    collide(player.pos, player.pos.y);
  }
  if (!ride && !player.ground && mv.lengthSq() === 0) {
    const target = feetHeight(player.pos.x, player.pos.z, player.pos.y);
    if (player.pos.y <= target) { player.pos.y = target; player.vy = 0; player.ground = true; }
  }
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -200, 200); player.pos.z = THREE.MathUtils.clamp(player.pos.z, -150, 150);
  // avatar pose (a scripted walk in the lift/stairs animates too)
  const scriptedWalk = ride ? vertical.walkSpeed * dt : 0;
  const moving = mv.lengthSq() > 1e-7 || scriptedWalk > 0;
  const speed = ride ? vertical.walkSpeed : vel.length();
  if (thirdPerson && moving && !ride && vel.lengthSq() > 0.05) {
    const hd = Math.atan2(-vel.x, -vel.y); let dd = hd - view.bodyYaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    view.bodyYaw += dd * (1 - Math.exp(-dt * 10));
  } else if (!thirdPerson || ride) view.bodyYaw = view.yaw;
  avatar.root.position.copy(player.pos); avatar.root.rotation.y = view.bodyYaw + Math.PI;
  if (moving) player.phase = (player.phase + (scriptedWalk || mv.length()) / (WALK_STRIDE * avatar.scale)) % 1;
  if (thirdPerson) {
    if (!player.ground && !ride) walkPose(avatar, 0.3, 0.9);
    else if (moving) walkPose(avatar, player.phase, Math.min(1, speed / 1.2));
    else idlePose(avatar, performance.now() / 1000);
  }
  avatar.root.visible = thirdPerson;
  // camera feel: head bob + sway while walking, a dip when landing, wider FOV when running, slight lean on strafe
  const amt = moving && (player.ground || ride) ? Math.min(1, speed / 2.4) : 0;
  fx.dipV += (-fx.dip * 90 - fx.dipV * 14) * dt; fx.dip += fx.dipV * dt;
  const running = run > 1 && moving && !ride;
  const wantFov = running ? 61 : 55; fx.fov += (wantFov - fx.fov) * (1 - Math.exp(-dt * 6));
  if (Math.abs(camera.fov - fx.fov) > 0.01) { camera.fov = fx.fov; camera.updateProjectionMatrix(); }
  fx.roll += ((ride ? 0 : -s * 0.012) - fx.roll) * (1 - Math.exp(-dt * 8));
  const bobY = Math.sin(player.phase * Math.PI * 4) * 0.026 * amt, bobX = Math.sin(player.phase * Math.PI * 2) * 0.016 * amt;
  const eyeY = player.pos.y + 1.62 + fx.dip;
  if (!thirdPerson) {
    camera.position.set(player.pos.x + Math.cos(view.yaw) * bobX, eyeY + bobY, player.pos.z - Math.sin(view.yaw) * bobX);
    camera.rotation.set(view.pitch, view.yaw, fx.roll, 'YXZ');
  } else {
    // over-the-shoulder orbit camera that stops before walls/ceilings (and stays inside the lift car)
    const indoor = insideHotel(player.pos.x, player.pos.z);
    const inCar = vertical.ride?.kind === 'lift' && player.pos.z > wz(HOTEL_ORIGIN[1] + 12.2);
    const wantD = inCar ? 0.9 : indoor ? 2.3 : 3.6, pitch = THREE.MathUtils.clamp(view.pitch, -1.0, 0.9);
    view.head.lerp(new THREE.Vector3(player.pos.x, player.pos.y + 1.72, player.pos.z), view.head.distanceTo(player.pos) > 4 ? 1 : 1 - Math.exp(-dt * 18));
    const head = view.head;
    const back = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(view.yaw) * Math.cos(pitch));
    const side = new THREE.Vector3(Math.cos(view.yaw), 0, -Math.sin(view.yaw)).multiplyScalar(0.35);
    let d = 0.3; const q = new THREE.Vector3();
    const ceil = indoor ? player.pos.y + 2.25 : 1e9;
    while (d < wantD) { q.copy(head).addScaledVector(back, d + 0.1).add(side); if (blocked(q.x, q.z, q.y, 0.12) || q.y > ceil || q.y < player.pos.y + 0.2) break; d += 0.1; }
    camDist += (d - camDist) * Math.min(1, (d < camDist ? 20 : 5) * dt);
    camera.position.copy(head).addScaledVector(back, camDist).add(side);
    camera.position.y = Math.max(camera.position.y, player.pos.y + 0.25) + fx.dip * 0.5;
    camera.rotation.set(pitch, view.yaw, 0, 'YXZ');
  }
  // what is in reach
  nearAnchor = null;
  if (insideHotel(player.pos.x, player.pos.z) && player.level === 1) {
    let best = 1.6;
    for (const [nm, ax, az] of ANCHORS) { const d = Math.hypot(player.pos.x - wx(HOTEL_ORIGIN[0] + ax), player.pos.z - wz(HOTEL_ORIGIN[1] + az)); if (d < best) { best = d; nearAnchor = nm; } }
  }
  nearPc = null;
  if (insideHotel(player.pos.x, player.pos.z)) {
    let best = 1.5;
    for (const c of PCS) { if (Math.abs(c.p.y - (player.pos.y + 0.9)) > 1.2) continue; const d = Math.hypot(player.pos.x - c.p.x, player.pos.z - c.p.z); if (d < best) { best = d; nearPc = c; } }
    if (nearPc && nearAnchor && !noc.anchorHint(nearAnchor)) nearAnchor = null;
  }
  let hint = '', at: THREE.Vector3 | null = null;
  const sp = ride ? null : nearSpot();
  const dr = !ride && !sp && insideHotel(player.pos.x, player.pos.z) ? nearestDoor(player.pos.x, player.pos.z, player.pos.y) : null;
  if (ride) hint = '';
  else if (sp) { hint = sp.hint; at = new THREE.Vector3(sp.x, LEVELS[sp.level - 1].elev + LEVELS[sp.level - 1].h - 0.4, sp.z); }
  else if (dr && !(nearAnchor && noc.anchorHint(nearAnchor)) && (!nearPc || Math.hypot(dr.cx - player.pos.x, dr.cz - player.pos.z) < Math.hypot(nearPc.p.x - player.pos.x, nearPc.p.z - player.pos.z))) { hint = dr.want ? '[F] Tutup pintu' : '[F] Buka pintu'; at = new THREE.Vector3(dr.cx, dr.y0 + 1.45, dr.cz); if (inVertical(player.pos.x, player.pos.z)) hint += atLift() ? ' · [E] Panggil lift (pilih lantai)' : ' · [E] Naik tangga · [Q] Turun tangga'; }
  else {
    const rk = nearRack(), nh = noc.hintAt(nearPc?.name ?? null, rk);
    const vert = inVertical(player.pos.x, player.pos.z) && insideHotel(player.pos.x, player.pos.z);
    const main = nearPc && !nearAnchor ? `[F] Nyalakan ${nearPc.label}` : nearAnchor ? (noc.anchorHint(nearAnchor) ?? `[F] ${MISSIONS[nearAnchor]?.title ?? nearAnchor}`) : vert ? (atLift() ? '[E] Panggil lift (pilih lantai)' : '[E] Naik tangga · [Q] Turun tangga') : '';
    hint = (nh ? nh + ' · ' : '') + main;
    if (nearPc && !nearAnchor) at = nearPc.p.clone().setY(nearPc.p.y + 0.35);
    else if (nearAnchor) { const a = ANCHORS.find(x => x[0] === nearAnchor)!; at = new THREE.Vector3(wx(HOTEL_ORIGIN[0] + a[1]), player.pos.y + 1.5, wz(HOTEL_ORIGIN[1] + a[2])); }
    else if (rk) { const d = IDFS.find(x => x.id === rk); at = d ? new THREE.Vector3(d.x, player.pos.y + 1.5, d.z + 0.9) : null; }
    else if (vert) at = player.pos.x > wx(HOTEL_ORIGIN[0] + 19) ? new THREE.Vector3(wx(HOTEL_ORIGIN[0] + 21), player.pos.y + 1.15, wz(HOTEL_ORIGIN[1] + 11.9)) : new THREE.Vector3(wx(HOTEL_ORIGIN[0] + 17), player.pos.y + 1.6, wz(HOTEL_ORIGIN[1] + 12));
  }
  $('hudHint').textContent = hint;
  prompt.show(hint, at);
}
/** floating key prompt next to the thing you can use ("[F] Buka pintu") */
const prompt = (() => {
  const el = document.createElement('div'); el.id = 'iprompt'; document.body.appendChild(el);
  let last = '', sx = -1, sy = -1; const v = new THREE.Vector3();
  return {
    show(text: string, at: THREE.Vector3 | null) {
      if (!text || uiBlocked()) { el.classList.remove('on'); last = ''; return; }
      if (text !== last) {
        last = text; el.innerHTML = '';
        for (const part of text.split(' · ').slice(0, 3)) {
          const m = /^\[(\w+)\]\s*(.*)$/.exec(part.trim());
          const row = document.createElement('div'); row.className = 'ip-row';
          if (m) { const k = document.createElement('kbd'); k.textContent = m[1]; row.append(k, document.createTextNode(m[2])); } else row.textContent = part;
          el.appendChild(row);
        }
      }
      let x = window.innerWidth / 2, y = window.innerHeight * 0.62;
      if (at) { v.copy(at).project(camera); if (v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95) { x = (v.x + 1) / 2 * window.innerWidth; y = (1 - v.y) / 2 * window.innerHeight; } }
      x = THREE.MathUtils.clamp(x, 140, window.innerWidth - 140); y = THREE.MathUtils.clamp(y, 80, window.innerHeight - 140);
      if (sx < 0 || !el.classList.contains('on')) { sx = x; sy = y; } else { sx += (x - sx) * 0.35; sy += (y - sy) * 0.35; }
      el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
      el.classList.add('on');
    },
    hide() { el.classList.remove('on'); last = ''; },
  };
})();

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
    setBakedVisible(world, true); for (const g of LEVEL_GROUPS) g.group.visible = true; cullKey = '';
    new GLTFExporter().parse(world, res => {
      setBakedVisible(world, false);
      const blob = new Blob([res as ArrayBuffer], { type: 'model/gltf-binary' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kota-nusantara.glb'; a.click();
      toast('GLB terunduh: nama objek (ROAD_, BLD_, PROP_, ANCHOR_…) ikut tersimpan.');
    }, err => { setBakedVisible(world, false); toast('Gagal ekspor: ' + String(err)); }, { binary: true, onlyVisible: true });
  }, 50);
};

// ---------- loop ----------
let last = performance.now(), elapsed = 0, frameCount = 0;
const tmp = new THREE.Vector3();
const lightBasis = new THREE.Matrix4(), lightBasisT = new THREE.Matrix4(), ZERO3 = new THREE.Vector3(), UP3 = new THREE.Vector3(0, 1, 0), sunNeg = new THREE.Vector3();
/** ?qa: automated playtest starts paused (frames only advance through __kota.step), so software GL is not flooded with frames */
const QA = new URLSearchParams(location.search).has('qa');
let paused = QA, fixedDt = 0, skipRender = false, anaT = 0;
function frame() {
  const now = performance.now(); const realDt = (now - last) / 1000; const dt = fixedDt || Math.min(realDt, 0.05); last = now; elapsed += dt; const t = elapsed;
  watchFps(Math.min(realDt, 1));
  if (mode === 'orbit') {
    if (tween) { tween.t = Math.min(1, tween.t + dt / 1.6); const e = 1 - Math.pow(1 - tween.t, 3); camera.position.lerpVectors(tween.from, tween.to, e); controls.target.lerpVectors(tween.tf, tween.tt, e); if (tween.t >= 1) tween = null; }
    controls.update();
  }
  { const wantNear = mode === 'walk' ? 0.15 : activeView === 'overview' ? 3 : 0.6, wantFar = mode === 'walk' ? farBase : Math.max(farBase, 1600); if (camera.near !== wantNear || camera.far !== wantFar) { camera.near = wantNear; camera.far = wantFar; camera.updateProjectionMatrix(); } }
  cullHotel();
  noc.playerMoving = vel.lengthSq() > 0.04 || keys.size > 0; noc.update(dt);
  updateDoors(dt, mode === 'walk' ? player.pos.x : 1e6, mode === 'walk' ? player.pos.z : 1e6, player.pos.y, cutaway ? LEVELS[1].elev - 0.5 : null);
  if (mode !== 'walk') { /* orbit */ }
  else if (seat) { updateSeat(dt); prompt.hide(); }
  else if (!uiBlocked()) { vertical.update(dt, player); updateWalk(dt); }
  else prompt.hide();
  { const tx = mode === 'walk' ? vertical.hud() : ''; if (liftInd.textContent !== tx) liftInd.textContent = tx; liftInd.classList.toggle('on', !!tx); }
  if (mode === 'walk' && noc.analyzerOn) { anaT -= dt; if (anaT <= 0) { anaT = 0.25; const inH = insideHotel(player.pos.x, player.pos.z); noc.renderAnalyzer(cityX(player.pos.x) - HOTEL_ORIGIN[0], cityZ(player.pos.z) - HOTEL_ORIGIN[1], player.pos.y + 1.2, inH ? player.level : 1, locationName(player.pos.x, player.pos.z).replace('BLD_HOTEL_NUSANTARA · ', '')); } }
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
  if (!skipRender) { frameCount++; renderer.info.reset(); if (quality) composer.render(); else renderer.render(scene, camera); }
  if (!paused) requestAnimationFrame(frame);
}

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); });
applyQuality(qName, 'start');
$('btnGfx').onclick = () => setQuality();
function missionTarget(): { x: number; z: number } | null { const tk = noc.tracked(); if (tk) return { x: cityX(tk.pc.x), z: cityZ(tk.pc.z) }; const c = missions.current(); return c.targetPos ? { x: cityX(c.targetPos.x), z: cityZ(c.targetPos.z) } : null; }

goView('overview', true);
requestAnimationFrame(() => { if (!QA) frame(); const l = $('loading'); l.style.opacity = '0'; setTimeout(() => l.remove(), 600); });

// test hooks (used by automated playtest)
(window as any).__kota = {
  goView: (id: string) => goView(id, true), enterWalk, keys, player, renderer, scene, world,
  teleport: (X: number, Z: number, level = 1, yaw = Math.PI) => { player.pos.set(wx(X), LEVELS[level - 1].elev + 0.12, wz(Z)); player.level = level; player.yaw = yaw; },
  // automated playtest on software GL: pause the rAF loop so real input events get dispatched, then advance fixed steps
  pause: (v: boolean) => { const was = paused; paused = v; if (was && !v) { last = performance.now(); requestAnimationFrame(frame); } },
  step: (n = 1, dt = 1 / 30, render = true) => { fixedDt = dt; for (let i = 0; i < n; i++) { skipRender = !render || i < n - 1; frame(); } skipRender = false; fixedDt = 0; },
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
  vertical: () => vertical.state(), seat: () => seat && { phase: seat.phase, t: seat.t }, prompt: () => { const e = document.getElementById('iprompt')!; return e.classList.contains('on') ? e.innerText.replace(/\n+/g, ' | ') : ''; },
  wifi: { APS, CLIENTS, quality: wifiQuality, servingAp, AUTH, env: (n: string) => envOf(n).id, healthy: (n: string) => healthy(adapterOf(n)) },
  fov: () => camera.fov,
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
  noc, missions, pcos, linux: linuxQa, anchors: () => hotelAnchorsWorld().map(a => ({ name: a.name, x: a.x + 200, z: a.z + 150 })), pcs: () => PCS.map(c => ({ name: c.name, x: c.p.x + 200, z: c.p.z + 150, y: c.p.y })), nearPc: () => nearPc?.name ?? null,
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
  perf: () => ({ frames: frameCount, quality: qName, auto: autoQ, pr: renderer.getPixelRatio(), ao: quality, shadows: renderer.shadowMap.enabled, far: camera.far }),
  setQ: (n: QName) => { autoQ = false; applyQuality(n, 'start'); },
  stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, colliders: colliders.length, vehicles: traffic.vehicles.length, peds: peds.peds.length }),
};
