import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ZONES, ROADS, ROAD_SPEC, LEVELS, SPAWN, ANCHORS, HOTEL_ORIGIN, wx, wz } from './data/city';
import { colliders, bakeStatic, setBakedVisible, type AABB } from './world/core';
import { buildAutoColliders, buildGrid, resolveCircle, blocked, queryColliders } from './game/physics';
import { Motors, buildGroundBoxes, VMAX, type Bike } from './game/motor';
import { MOTOR_GRIPS, MOTOR_STEER_PIVOT, MOTOR_STEER_AXIS, vehicleLampMat } from './assets/vehicles';
import { DayNight, type PresetId } from './world/daynight';
import { Ambient } from './game/ambient';
import { HotelNpcs, type TalkCtx } from './game/hotelNpc';
const ambient = new Ambient();
addEventListener('pointerdown', () => ambient.start()); addEventListener('keydown', () => ambient.start());
import { buildSouth, SOUTH_PEDS } from './world/south';
import { Menu, settings, type QChoice } from './ui/menu';
import { createPerson, randomSpec, walkPose, idlePose, typingPose, crouchPose, ridePose, WALK_STRIDE } from './assets/people';
import { buildRoads } from './world/roads';
import { buildGround, buildCity } from './world/buildings';
import { buildHotel, updateDoors, closedDoorBoxes, nearestDoor, toggleDoor, blinkMaterials, insideHotel, zoneAt, verticalZones } from './world/hotel';
import { buildStreetProps, lampLights } from './world/props';
import { Signals, Traffic, Pedestrians } from './game/traffic';
import { MISSIONS } from './game/missions';
import * as ND from './assets/netdevices';
import { hotelAnchorsWorld } from './game/missionSystem';
import { initLinux, linuxQa } from './pcos/linux';
import { initOffice, officeQa } from './pcos/office';
import { edgeQa } from './pcos/edge';
import { initSwitches, portOf, panelOf, adapterOf, envOf, healthy } from './pcos/net';
import { registerClient, AUTH, APS, quality as wifiQuality, servingAp, CLIENTS } from './pcos/wifi';
import { Vertical } from './game/vertical';
import { createWaypoint, updateWaypoint, createAnchorMarker } from './ui/waypoint';

import { buildWayfinding, streetLabel } from './world/wayfinding';
import { dressL1, l1Lights } from './world/interiorDressing';
import { Minimap } from './ui/minimap';
import { PcOS } from './pcos/os';
import { Noc } from './game/noc';
import { setupTouch, touch, isTouch, releaseTouch } from './ui/touch';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GfxTier } from './game/gfxTier';
import { buildHiDetail } from './world/hiDetail';

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
// no service worker is ever registered by this game; remove any left over from an old build/PWA test so it cannot serve stale files
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
const cityX = (x: number) => x + 200, cityZ = (z: number) => z + 150;

// ---------- renderer / scene ----------
const QS = new URLSearchParams(location.search);
const QA0 = QS.has('qa');
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
// ---------- day / night (1 game day = 24 real minutes; N or the menu jumps pagi/siang/sore/malam) ----------
const dn = new DayNight({ renderer, scene, sky, hemi, dir, sun, vehicleLamp: vehicleLampMat() }, QS.has('t') ? +QS.get('t')! : 16.5);
// night extras on Tinggi only: 4 real point lights that follow the street lamps nearest the camera + the bike's headlight spot.
// They always exist (constant light count = no shader recompiles); visible only on Tinggi, intensity 0 by day.
const nightLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight('#ffc77a', 0, 30, 1.5); l.visible = false; scene.add(l); return l; });
const headSpot = new THREE.SpotLight('#fff1d6', 0, 42, 0.42, 0.55, 1.3); headSpot.visible = false; scene.add(headSpot, headSpot.target);
// cheap headlight on every quality level: an additive light pool on the road ahead of the ridden bike
const headBeam = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 118, 4, 32, 70, 70); gr.addColorStop(0, 'rgba(255,240,205,0.95)'); gr.addColorStop(0.45, 'rgba(255,232,190,0.45)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false }));
  m.name = 'MOTOR_LAMPU_SOROT'; m.renderOrder = 2; m.visible = false; scene.add(m); return m;
})();
let nightPickT = 0; const lastShadowFocus = new THREE.Vector3(1e9, 0, 0);

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
{ // office devices (printers, desk IP phones) + NAS: positions before the static batches merge the meshes
  const pos = (n: string) => { const o = hotel.getObjectByName(n); return o ? new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()) : null; };
  const printers = [2, 3].map(lv => ({ lv, c: pos(`PROP_L${lv}_PRINTER_01`) })).filter(x => x.c).map(x => ({ id: `PRN-L${x.lv}`, level: x.lv, x: x.c!.x, z: x.c!.z }));
  const phones: { id: string; level: number; x: number; z: number; pc: string }[] = [];
  hotel.traverse(o => { const m = /^PROP_L([23])_IPPHONE_\d+$/.exec(o.name); if (!m) return; const lv = +m[1]; const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); const near = PCS.filter(p => new RegExp(`_L${lv}_`).test(p.name)).sort((a, b) => Math.hypot(a.p.x - c.x, a.p.z - c.z) - Math.hypot(b.p.x - c.x, b.p.z - c.z))[0]; if (near && Math.hypot(near.p.x - c.x, near.p.z - c.z) < 2.5 && !phones.some(q => q.pc === near.name)) phones.push({ id: o.name, level: lv, x: c.x, z: c.z, pc: near.name }); });
  initOffice({ printers, phones, pcs: PCS.map(c => ({ name: c.name, level: +(/_L(\d)_/.exec(c.name)?.[1] ?? 1) })) }, { show: el => noc.showPanel(el), close: () => noc.closeModal(), ext: e => noc.extEvent(e as never), log: s => noc.logLine(s), toast: (s, ms) => toast(s, ms) });
}
for (const [k, an] of [['RACK1', 'ANCHOR_SRV_RACK_01'], ['RACK2', 'ANCHOR_SRV_RACK_02'], ['RACK3', 'ANCHOR_SRV_RACK_03']]) { const a = hotelAnchorsWorld().find(x => x.name === an); if (a) noc.PLACES[k] = { name: k, label: an === 'ANCHOR_SRV_RACK_01' ? 'Rak 1 · Router edge' : an === 'ANCHOR_SRV_RACK_02' ? 'Rak 2 · srv-nusa' : 'Rak 3 · NAS', x: a.x, y: 1.4, z: a.z, level: 1 }; }
noc.onApVisual = ap => { const o = hotel.getObjectByName(`PROP_L${ap.level}_CORRIDOR_AP_${ap.lx}`); if (o) o.visible = ap.mounted; };
const { tls } = buildStreetProps(world);
buildWayfinding(world);
dressL1(hotel);
l1Lights(scene);
const signals = new Signals(tls);
const gameLayer = new THREE.Group(); gameLayer.name = 'GAME_LAYER'; scene.add(gameLayer);
const traffic = new Traffic(gameLayer, signals);
const peds = new Pedestrians(gameLayer, SOUTH_PEDS);
const hotelNpcs = new HotelNpcs(gameLayer, PCS);
const vertical = new Vertical(hotel, gameLayer);
// The old linear quiz chain is retired: all work now comes from the NOC work board (game/noc.ts).
const missions = { isModalOpen: () => false, hintFor: (_a: string | null): string | null => null, interact: (_a: string | null) => false, onModalChange: (_f: (o: boolean) => void) => {}, setPlayerPos: (_x: number, _z: number) => {}, current: () => ({ targetPos: null as { x: number; z: number } | null, targetY: 0, place: '' }), start: () => {} };
const missionUI = { setHudVisible: (_v: boolean) => {} };
const waypoint = createWaypoint();
const missionMarker = createAnchorMarker(); gameLayer.add(missionMarker.group);
const south = buildSouth(world);   // v9: Kota Selatan (own RNG, built after the seeded systems)
buildAutoColliders(world); buildGrid();
// rideable Motor Matic: flat ground boxes (asphalt 0.02, kerbs 0.17, sidewalks 0.15, parking slabs) + bike-only walls
const motors = new Motors(gameLayer);
buildGroundBoxes(['FASE_A_JALAN', 'FASE_B_TANAH_ZONA', 'FASE_E_PROPERTI_JALAN', 'PARKIR_MOTOR_01', 'FASE_F_KOTA_SELATAN'].map(n => world.getObjectByName(n)!).filter(Boolean), o => o.name === 'JPO_01' || o.name === 'ZONE_OVERLAY');
{
  const hb = { x0: wx(HOTEL_ORIGIN[0]), x1: wx(HOTEL_ORIGIN[0] + 30), z0: wz(HOTEL_ORIGIN[1]), z1: wz(HOTEL_ORIGIN[1] + 20) };
  motors.walls.push({ minX: hb.x0 - 0.1, maxX: hb.x1 + 0.1, minZ: hb.z0 - 0.1, maxZ: hb.z1 + 0.1, minY: -1, maxY: 40 }); // no riding into the hotel (lobby, lift, stairs)
  const jpo = world.getObjectByName('JPO_01');
  for (const st of jpo?.children ?? []) { const q = st.userData.stair; if (q) motors.walls.push({ minX: q.x0, maxX: q.x1, minZ: q.z0, maxZ: q.z1, minY: -1, maxY: 8 }); }
  for (const w of [[-210, -199.5, -160, 460], [199.5, 210, -160, 460], [-210, 210, -160, -149.5], [-210, 210, 448.2, 460]]) motors.walls.push({ minX: w[0], maxX: w[1], minZ: w[2], maxZ: w[3], minY: -1, maxY: 40 });
}
motors.settle();
const zoneOverlay = world.getObjectByName('ZONE_OVERLAY')!;
// render batches: one per region; hotel per level so the cutaway can hide upper floors
const batches = new THREE.Group(); batches.name = 'RENDER_BATCHES'; scene.add(batches);
const hotelBatches = new Map<string, THREE.Object3D>();
// graphics tiers: small baked props go into DETAIL sub-batches (hidden on Hemat / outdoor ones on Rendah); network gear never does
const GEAR_RE = /(PC|MONITOR|OUTLET|PANEL|PATCH|RACK|SW|AP_|ROUTER|PRN|PHONE|NAS|SERVER|LABEL|NIC|CABLE|KABEL|IDF|MDF|UPS|ONT|DOOR|LIFT|STAIR|TANGGA|CHAIR|KURSI|DESK|MEJA|TABLE|SOFA|BED|RANJANG|SHELF|RAK|LEMARI|CABINET|COUNTER)/i;
const OUT_DETAIL = { max: 0.9, tier: 'out' as const, keep: /(SIGN|RAMBU|TL_|HALTE|ZEBRA|BENCH|BANGKU|KURSI|CHAIR|MEJA|TABLE|GEROBAK|TENDA|WARUNG|KIOS|POT_|PAGAR|FENCE|RAIL)/i };
for (const lvName of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'ROOF', 'EXTERIOR']) { const b = bakeStatic(hotel.getObjectByName(lvName)!, `BATCH_${lvName}`, o => /^(DOOR_|LIFT_|PROP_L\d_CORRIDOR_AP_)/.test(o.name), { max: lvName === 'EXTERIOR' || lvName === 'ROOF' ? 0.9 : 0.35, tier: lvName === 'EXTERIOR' || lvName === 'ROOF' ? 'out' : 'in', keep: GEAR_RE }); batches.add(b); hotelBatches.set(lvName, b); }
for (const n of ['FASE_A_JALAN', 'FASE_C_GEDUNG_KOTA', 'FASE_E_PROPERTI_JALAN']) batches.add(bakeStatic(world.getObjectByName(n)!, `BATCH_${n}`, o => o.name.startsWith('TL_'), n === 'FASE_A_JALAN' ? undefined : OUT_DETAIL));
batches.add(bakeStatic(world.getObjectByName('FASE_B_TANAH_ZONA')!, 'BATCH_FASE_B', o => o.name === 'ZONE_OVERLAY'));
// south district: two halves so looking north (or from the old district) frustum-culls them
batches.add(bakeStatic(south.west, 'BATCH_SELATAN_BARAT', undefined, OUT_DETAIL)); batches.add(bakeStatic(south.east, 'BATCH_SELATAN_TIMUR', undefined, OUT_DETAIL));
batches.add(bakeStatic(world.getObjectByName('FASE_F_KOTA_SELATAN')!, 'BATCH_SELATAN_LAIN', undefined, OUT_DETAIL));
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
  { id: 'selatan', label: 'Kota Selatan', loc: 'Kota Selatan: ruko Jl. Anggrek, Lapangan Anggrek, kampung bergang, perkantoran', pos: [70, 70, 300], target: [170, 0, 400] },
  { id: 'smk', label: 'SMK Nusantara', loc: 'SMK Nusantara (TKJ), Taman Dahlia, dan apartemen di Jl. Dahlia', pos: [200, 40, 470], target: [262, 4, 525] },
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
/** crouch (jongkok): X toggles; k eases 0 (standing) .. 1 (crouched) for camera height, speed and pose */
const crouch = { on: false, k: 0 };
const CROUCH_TOP = 1.25, STAND_TOP = 1.75, EYE_STAND = 1.62, EYE_CROUCH = 1.05;
/** the Motor Matic the player is riding (null = on foot) */
let riding: Bike | null = null;
let camRoll = 0; const camTgt = new THREE.Vector3();
let mountT = 1, wantDismount = false, chaseYaw = 0, camDistR = 4, rideShake = 0, hitToastT = 0;
const rideLook = { yaw: 0, pitch: -0.16, idle: 0 };
const WALK_HINTS = 'WASD jalan · Mouse menoleh · Shift lari · Spasi lompat · X jongkok · V kamera · F interaksi · T papan kerja · C cek fisik · R Wi-Fi analyzer · E/Q tangga/lift · M peta · Esc keluar';
const RIDE_HINTS = 'W gas · S rem / mundur pelan · A/D belok · Spasi rem belakang · Mouse lihat sekeliling · V kamera · F turun · R kembalikan ke jalan · Esc keluar';
missions.onModalChange(open => { if (open) keys.clear(); });
noc.toast = (s, ms) => toast(s, ms);
noc.onModal(open => { if (open) keys.clear(); else last = performance.now(); });
const uiBlocked = () => missions.isModalOpen() || pcos.isOpen() || noc.isModalOpen() || liftPanel.isOpen() || menu.paused;
/** true once the player has entered the city this session: entering again resumes where they left off */
let started = false, tourMode = false;
function enterWalk(fresh = !started) {
  (document.activeElement as HTMLElement | null)?.blur?.();     // a focused menu button must never catch the next Space/Enter
  menu.show(false); menu.pause(false); tourMode = false; document.body.classList.remove('tour');
  mode = 'walk'; document.body.classList.add('entered'); document.body.classList.remove('viewing'); setCutaway(false); controls.enabled = false; tween = null;
  if (fresh) {
    if (riding) forceDismount();
    player.pos.set(wx(SPAWN[0]), 0.15, wz(SPAWN[1])); player.yaw = Math.PI; player.pitch = -0.02; player.level = 1; player.vy = 0; player.ground = true; vel.set(0, 0);
    crouch.on = false; crouch.k = 0; document.body.classList.remove('riding', 'crouching'); thirdPerson = settings.third;
    $('hints').textContent = WALK_HINTS;
  } else {
    // resume exactly where the player was: on foot, crouched, or on the bike
    document.body.classList.toggle('crouching', crouch.on); document.body.classList.toggle('riding', !!riding);
    if (riding) { speedo.classList.add('on'); motors.engine.start(); mountT = 1; chaseYaw = riding.yaw; }
    $('hints').textContent = riding ? RIDE_HINTS : WALK_HINTS;
  }
  keys.clear(); last = performance.now();
  document.querySelectorAll('#views button').forEach(b => b.classList.remove('active'));
  if (!isTouch()) { try { renderer.domElement.requestPointerLock?.(); } catch { /* ignore */ } }
  touchUi?.onEnter();
  missionUI.setHudVisible(true); noc.setHudVisible(true);
  missions.start();
  if (fresh && !started && (!QS.has('qa') || QS.has('tutor'))) setTimeout(() => { if (mode === 'walk') noc.maybeStartTutorial(); }, 900);
  started = true; menu.started = true;
}
function exitWalk() {
  // the player's state is kept (position, crouch, the bike they sit on) so "Lanjutkan" resumes it
  if (riding) { riding.speed = 0; motors.engine.stop(); speedo.classList.remove('on'); }
  document.body.classList.remove('crouching', 'riding');
  mode = 'orbit'; document.body.classList.remove('entered'); controls.enabled = true;
  $('hints').textContent = 'Klik/tarik untuk memutar · roda untuk zoom';
  if (document.pointerLockElement) document.exitPointerLock();
  missionUI.setHudVisible(false); noc.setHudVisible(false);
  prompt.hide(); $('hudHint').textContent = '';   // the walk prompt ([F] Buka pintu…) used to stay on screen over the orbit views
}
// ---------- title screen / pause ----------
const menu = new Menu({
  build: __BUILD__, touch: TOUCH0,
  start: fresh => menu.fade(() => enterWalk(fresh), QA),
  resume: () => { if (mode === 'walk' && menu.paused) resumeGame(); else menu.fade(() => enterWalk(false), QA); },
  tour: () => menu.fade(() => { menu.show(false); tourMode = true; document.body.classList.add('tour'); goView('overview', true); }, QA),
  toMainMenu: () => toMainMenu(),
  setQuality: q => setQualityChoice(q),
  setTime: id => { dn.goTo(id as PresetId); menu.setTimeActive(id[0].toUpperCase() + id.slice(1)); },
  applySettings: () => applySettings(),
});
function openPause() {
  if (mode !== 'walk' || menu.paused) return;
  keys.clear(); releaseTouch(); drag = false; motors.engine.on = false; motors.engine.update(0, 0);
  if (document.pointerLockElement) document.exitPointerLock();
  prompt.hide(); menu.pause(true);
}
function resumeGame() {
  menu.pause(false); keys.clear(); last = performance.now();
  if (mode === 'walk' && !isTouch()) { try { renderer.domElement.requestPointerLock?.(); } catch { /* ignore */ } }
}
function toMainMenu() { menu.pause(false); menu.fade(() => { if (mode === 'walk') exitWalk(); showMenu(); }, QA); }
function showMenu() { tourMode = false; document.body.classList.remove('tour', 'viewing'); goView('overview', true); setCutaway(false); menu.show(true); }
function applySettings() { dn.auto = settings.autoTime; motors.engine.vol = settings.volume / 100; ambient.vol = settings.volume / 100 * 0.8; }
function setQualityChoice(q: QChoice) { if (q === 'otomatis') { autoQ = true; fpsW.warm = 4; applyQuality(qName, 'start'); } else { autoQ = false; applyQuality(q, 'manual'); } }

const touchUi = setupTouch({ canvas: renderer.domElement, toast: (m, ms) => toast(m, ms), active: () => mode === 'walk' && !uiBlocked() && !ride, look: (dx, dy) => lookBy(dx, dy) });
function lookBy(dx: number, dy: number) {
  const k = 0.0022 * settings.sens; dy *= settings.invertY ? -1 : 1;
  if (riding) { rideLook.yaw -= dx * k; rideLook.pitch = THREE.MathUtils.clamp(rideLook.pitch - dy * k, -0.6, 0.45); rideLook.idle = 0; return; }
  player.yaw -= dx * k; player.pitch = THREE.MathUtils.clamp(player.pitch - dy * k, -1.3, 1.3);
}
$('btnBack').onclick = () => menu.fade(() => showMenu(), QA); $('btnBack').textContent = '← Menu';
window.addEventListener('keydown', e => {
  if (pcos.isOpen() || noc.isModalOpen()) return;
  if (liftPanel.isOpen()) { if (!e.repeat) liftPanel.key(e.code); e.preventDefault(); return; }
  if (menu.open || menu.paused) {   // menus own the keyboard (their buttons get Enter/Space); Esc backs out one level
    if (e.code === 'Escape' && !e.repeat) { if (menu.panelOpen()) menu.hidePanels(); else if (menu.paused) resumeGame(); }
    return;
  }
  const tg = e.target as HTMLElement | null;
  if (tg && (tg.tagName === 'BUTTON' || tg.tagName === 'INPUT')) {
    // in the city a still-focused button (Mulai, a toolbar button…) must not swallow the key or be "clicked" by Space/Enter:
    // that used to re-run Mulai on Space -> the player was put back at the spawn point instead of jumping
    if (mode === 'walk') { tg.blur(); if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') return;
  }
  keys.add(e.code);
  if (e.code === 'Escape' && !e.repeat) { if (mode === 'walk') { keys.delete('Escape'); openPause(); return; } if (tourMode) { menu.fade(() => showMenu(), QA); return; } }
  if (e.code === 'KeyN' && !e.repeat) { const l = dn.next(); toast(`Waktu: ${l}`, 1500); }
  if (e.code === 'KeyZ') toggleZones();
  if (e.code === 'KeyM' && mode === 'walk') minimap.toggle();
  if (e.code === 'KeyG') setQuality();
  if (mode === 'walk' && (e.code === 'KeyE' || e.code === 'KeyQ') && !riding) changeFloor(e.code === 'KeyE' ? 1 : -1);
  if (mode === 'walk' && e.code === 'KeyF' && !e.repeat) interact();
  if (mode === 'walk' && e.code === 'KeyR' && !uiBlocked() && !e.repeat) { if (riding) { motors.resetToRoad(riding, rideDyn(riding)); } else noc.setAnalyzer(!noc.analyzerOn); }
  if (mode === 'walk' && e.code === 'KeyT' && !missions.isModalOpen()) noc.openBoard();
  if (mode === 'walk' && e.code === 'KeyC' && !missions.isModalOpen() && !riding) { const m = noc.physical(nearPc?.name ?? null, nearRack()); if (m) toast(m, 5200); }
  if (mode === 'walk' && e.code === 'KeyH' && riding && !e.repeat) ambient.horn(1);
  if (mode === 'walk' && e.code === 'KeyX' && !e.repeat && !riding && !uiBlocked()) setCrouch(!crouch.on);
  if (mode === 'walk' && e.code === 'Space') { e.preventDefault(); if (!riding && !missions.isModalOpen() && !e.repeat && crouch.on) setCrouch(false); else if (!riding && player.ground && !missions.isModalOpen() && !crouch.on) { player.vy = 4.4; player.ground = false; } }
  if (mode === 'walk' && e.code === 'KeyV') { thirdPerson = !thirdPerson; toast(thirdPerson ? 'Kamera orang ketiga (V untuk ganti)' : 'Kamera orang pertama (V untuk ganti)', 1800); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
// focus loss (alt-tab, notification, app switch): nothing may stay held, no throttle stuck open
function releaseInput() { keys.clear(); releaseTouch(); drag = false; motors.engine.on = false; }
window.addEventListener('blur', releaseInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseInput(); });
renderer.domElement.addEventListener('click', () => { if (mode === 'walk' && !isTouch() && !uiBlocked() && !document.pointerLockElement) renderer.domElement.requestPointerLock?.(); });
// Esc while the mouse is locked is eaten by the browser (it only unlocks): treat losing the lock in the city as "pause"
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  // our own exits (lift panel, PC, NOC dialogs) happen while that UI is already open: those never pause
  if (mode !== 'walk' || uiBlocked() || seat || menu.paused) return;
  setTimeout(() => { if (mode === 'walk' && !document.pointerLockElement && !uiBlocked() && !seat && !menu.paused && document.hasFocus()) openPause(); }, 90);
});
let drag = false, lx = 0, ly = 0;
renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && mode === 'walk') return; drag = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('pointerup', () => (drag = false));
window.addEventListener('pointermove', e => {
  if (mode !== 'walk' || e.pointerType === 'touch') return;
  if (uiBlocked()) return;
  let dx = 0, dy = 0;
  if (document.pointerLockElement) { dx = e.movementX; dy = e.movementY; } else if (drag) { dx = e.clientX - lx; dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; }
  if (ride) return;
  lookBy(dx, dy);
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
  closedDoorBoxes(p.x, p.z, vehicleBoxes, feet);
  vertical.closedBoxes(player.level, vehicleBoxes);
  if (insideHotel(p.x, p.z)) hotelNpcs.boxes(player.level, p.x, p.z, vehicleBoxes);
  for (const b of motors.bikes) if (!b.ridden && Math.abs(b.pos.x - p.x) < 6 && Math.abs(b.pos.z - p.z) < 6) motors.boxesOf(b, vehicleBoxes);
  resolveCircle(p, feet, RADIUS, vehicleBoxes, crouch.on ? CROUCH_TOP : STAND_TOP);
}
/** traffic as solid boxes around a point */
function trafficBoxes(x: number, z: number, range: number, out: AABB[]) {
  for (const v of traffic.vehicles) {
    const o = v.obj.position; if (Math.abs(o.x - x) > range || Math.abs(o.z - z) > range) continue;
    const ew = v.lane.axis === 'EW', half = v.len / 2, w = v.len > 10 ? 1.3 : v.len < 2.5 ? 0.45 : 0.95;
    out.push({ minX: o.x - (ew ? half : w), maxX: o.x + (ew ? half : w), minZ: o.z - (ew ? w : half), maxZ: o.z + (ew ? w : half), minY: 0, maxY: 3 });
  }
}
/** everything that moves and can stop the bike: traffic, pedestrians, the other (parked) bikes */
const rideBoxes: AABB[] = [];
function rideDyn(b: Bike) {
  rideBoxes.length = 0; trafficBoxes(b.pos.x, b.pos.z, 14, rideBoxes);
  for (const pd of peds.peds) { const o = pd.obj.position; if (Math.abs(o.x - b.pos.x) < 12 && Math.abs(o.z - b.pos.z) < 12) rideBoxes.push({ minX: o.x - 0.24, maxX: o.x + 0.24, minZ: o.z - 0.24, maxZ: o.z + 0.24, minY: 0, maxY: 1.8 }); }
  for (const o of motors.bikes) if (o !== b && Math.abs(o.pos.x - b.pos.x) < 8 && Math.abs(o.pos.z - b.pos.z) < 8) motors.boxesOf(o, rideBoxes);
  return rideBoxes;
}
const circleHits = (c: AABB, x: number, z: number, r: number) => { const nx = Math.min(Math.max(x, c.minX), c.maxX), nz = Math.min(Math.max(z, c.minZ), c.maxZ); return (x - nx) ** 2 + (z - nz) ** 2 < r * r; };
/** room to stand up here? (anything between crouched head height and standing head height above the circle) */
function canStand() {
  const feet = player.pos.y, x = player.pos.x, z = player.pos.z, r = RADIUS - 0.03;
  const hit = (c: AABB) => c.minY < feet + 1.8 && c.maxY > feet + CROUCH_TOP && c.maxY >= feet + 0.35 && circleHits(c, x, z, r);
  for (const c of queryColliders(x, z)) if (hit(c)) return false;
  const dyn: AABB[] = []; trafficBoxes(x, z, 10, dyn); closedDoorBoxes(x, z, dyn, feet); vertical.closedBoxes(player.level, dyn);
  for (const c of dyn) if (hit(c)) return false;
  return true;
}
function setCrouch(on: boolean, quiet = false) {
  if (on === crouch.on) return true;
  if (on) {
    if (riding || seat || vertical.busy() || !player.ground) return false;
    crouch.on = true; if (!quiet) toast(isTouch() ? 'Jongkok · ketuk Jongkok lagi untuk berdiri' : 'Jongkok · tekan X lagi untuk berdiri', 1500);
  } else {
    if (!canStand()) { if (!quiet) toast('Tidak bisa berdiri: ada halangan di atas kepala.', 2000); return false; }
    crouch.on = false;
  }
  document.body.classList.toggle('crouching', crouch.on);
  return true;
}
/** sitting / riding / lifts need the player upright: stand up (or say why not) */
function standForAction(): boolean { if (!crouch.on) return true; if (setCrouch(false, true)) return true; toast('Tidak bisa berdiri di sini: ada halangan di atas kepala.', 2000); return false; }
function inVertical(x: number, z: number) {
  if (insideHotel(x, z) && cityZ(z) > HOTEL_ORIGIN[1] + 10.3 && cityZ(z) < HOTEL_ORIGIN[1] + 12.2 && cityX(x) > HOTEL_ORIGIN[0] + 15.5 && cityX(x) < HOTEL_ORIGIN[0] + 23) return true; // standing at the stair/lift doors
  return verticalZones.some(v => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1); }
const atLift = () => player.pos.x > wx(HOTEL_ORIGIN[0] + 19);
function changeFloor(d: number, target?: number) {
  if (vertical.busy() || seat || riding) return;
  if (!insideHotel(player.pos.x, player.pos.z) || !inVertical(player.pos.x, player.pos.z)) { toast('Naik/turun lantai hanya di depan pintu tangga atau lift (core gedung).'); return; }
  if (!standForAction()) return;
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
const camSolids: AABB[] = [];
pcos.onClose = () => {
  keys.clear(); last = performance.now();
  if (seat) { seat.phase = 'stand'; seat.t = 0; seat.fp = seat.tp.clone(); seat.fyaw = seat.tyaw; seat.fpitch = seat.tpitch; seat.tp = new THREE.Vector3(player.pos.x, player.pos.y + 1.62, player.pos.z); seat.tpitch = -0.08; }
};
/** walk the camera down into the chair in front of a PC, then open its OS */
function sitAt(pc: (typeof PCS)[number]) {
  if (!standForAction()) return;
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
  let best: ReturnType<typeof noc.spots>[number] | null = null, bd = 1e9;
  for (const sp of noc.spots()) { const d = Math.hypot(player.pos.x - sp.x, player.pos.z - sp.z); if (sp.level === player.level && d < (sp.r ?? 1.5) && d < bd) { bd = d; best = sp; } }
  // a desk phone next to a PC: whichever is closer wins
  if (best && best.r && nearPc && Math.hypot(nearPc.p.x - player.pos.x, nearPc.p.z - player.pos.z) < bd) return null;
  return best;
}
function npcCtx(): TalkCtx {
  const j = noc.jobs.find(x => x.id === noc.trackedId && x.status !== 'closed') ?? noc.jobs.find(x => x.status !== 'closed');
  return { job: j ? { title: j.title, who: j.who, next: noc.nextHint(j), pcs: j.targets.map(t => t.pc.name), faults: j.faults, levels: j.targets.map(t => t.pc.level) } : null };
}
function nearNpcNow() {
  if (ride || riding || seat || !insideHotel(player.pos.x, player.pos.z)) return null;
  if (nearAnchor && noc.anchorHint(nearAnchor)) return null;
  const n = hotelNpcs.nearest(player.pos, player.level, 1.7); if (!n) return null;
  if (nearPc && !n.pc && Math.hypot(nearPc.p.x - player.pos.x, nearPc.p.z - player.pos.z) < Math.hypot(n.p.root.position.x - player.pos.x, n.p.root.position.z - player.pos.z)) return null;
  return n;
}
function talkNpc(n: NonNullable<ReturnType<typeof nearNpcNow>>) { toast(`${hotelNpcs.title(n)}: "${hotelNpcs.talk(n, npcCtx(), n.pc ?? nearPc?.name ?? null)}"`, 6500); }
function interact() {
  if (uiBlocked() || ride) return;
  if (riding) { requestDismount(); return; }
  const nb = nearBike(); if (nb) { mount(nb); return; }
  const sp = nearSpot(); if (sp) { noc.useSpot(sp.id); return; }
  const rk = nearRack();
  if (rk && rk !== 'MDF' && !nearPc) { keys.clear(); noc.openRack(rk); return; }
  { const nn = nearNpcNow(); if (nn) { talkNpc(nn); return; } }
  const door = nearestDoor(player.pos.x, player.pos.z, player.pos.y, 1.7, player.yaw);
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
composer.addPass(gtao);
composer.addPass(new OutputPass());
const hiDetail = buildHiDetail(scene, world, hotel);
const gfx = new GfxTier([world, batches, hiDetail]); gfx.collect();
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
const QDESC: Record<QName, string> = {
  tinggi: ' · AO, bayangan tajam, lampu malam, pohon & detail penuh, lalu lintas ramai',
  sedang: ' · bayangan, pohon 80%, detail kecil tetap ada',
  rendah: ' · tanpa bayangan, pohon 55%, detail kecil luar ruangan disembunyikan',
  hemat: ' · material sederhana, pohon 30%, tanpa detail kecil, jarak pandang pendek',
};
let qName: QName = (QORDER as string[]).includes(QS.get('q') ?? '') ? QS.get('q') as QName : QS.has('low') || TOUCH0 ? 'rendah' : window.innerWidth <= 720 ? 'sedang' : 'tinggi';
let quality = false;              // true = post-processing (AO) on
let autoQ = !QS.has('q');         // the FPS watchdog may lower quality until the player picks one
if (!QA0 && !QS.has('q') && !QS.has('low') && settings.quality !== 'otomatis') { qName = settings.quality; autoQ = false; }
function applyQuality(n: QName, why: 'start' | 'manual' | 'auto' = 'manual') {
  const Q = QUALITY[n], prevShadow = renderer.shadowMap.enabled; qName = n; quality = Q.ao;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pr)); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
  const sh = Q.shadow > 0; renderer.shadowMap.enabled = sh; dir.castShadow = sh;
  if (sh && dir.shadow.mapSize.x !== Q.shadow) { dir.shadow.mapSize.set(Q.shadow, Q.shadow); dir.shadow.map?.dispose(); (dir.shadow as { map: THREE.WebGLRenderTarget | null }).map = null; }
  if (prevShadow !== sh) scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true)); });
  farBase = Q.far; (scene.fog as THREE.Fog).near = Q.fog[0]; (scene.fog as THREE.Fog).far = Q.fog[1];
  for (const l of nightLights) l.visible = n === 'tinggi'; headSpot.visible = n === 'tinggi'; renderer.shadowMap.needsUpdate = true;
  traffic.setDensity(Q.traffic); peds.setDensity(Q.peds);
  gfx.apply(n);
  const b = document.getElementById('btnGfx'); if (b) b.textContent = `Grafik: ${Q.label}${autoQ ? ' (otomatis)' : ''}`;
  if (why === 'manual') toast(`Grafik: ${Q.label}${QDESC[n]}`);
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
let cullKey = '', cullLv = 1;
function cullHotel() {
  const inside = mode === 'walk' && insideHotel(camera.position.x, camera.position.z) && camera.position.y < 27;
  // hysteresis: the level only changes 0.35 m past a floor line, so head bob on the stairs / the lift crossing a slab
  // no longer flips the culled set every few frames (floors popping in and out = blinking)
  const cy = camera.position.y;
  while (cullLv < LEVELS.length && cy >= LEVELS[cullLv].elev + 0.35) cullLv++;
  while (cullLv > 1 && cy < LEVELS[cullLv - 1].elev - 0.35) cullLv--;
  const lvCam = cullLv;
  // in the stair/lift core (or riding) the open shaft shows two floors up and down
  const span = vertical.busy() || verticalZones.some(v => camera.position.x > v.x0 && camera.position.x < v.x1 && camera.position.z > v.z0 && camera.position.z < v.z1) ? 2 : 1;
  const key = inside ? `in${lvCam}:${span}` : cutaway ? 'cut' : 'out';
  if (key === cullKey) return; cullKey = key;
  // from outside, upper floors keep only their baked shell (walls/windows/furniture); the loose dynamic bits (doors, lift
  // doors, APs) of L2-L8 cannot be seen from the street and cost ~400 draw calls
  for (const g of LEVEL_GROUPS) { const vis = !inside || Math.abs(g.lv - lvCam) <= span; g.group.visible = vis && (inside || cutaway || g.lv === 1); g.batch.visible = vis && !(cutaway && g.lv >= 2); }
  if (!inside && cutaway) setCutaway(true);
}

function nearRack(): string | null {
  if (player.level === 1 && Math.hypot(player.pos.x - RACK.x, player.pos.z - RACK.z) < 2.2) return 'MDF';
  for (const d of IDFS) if (player.level === d.level && Math.hypot(player.pos.x - d.x, player.pos.z - (d.z + 0.9)) < 2.2) return d.id;
  return null;
}
function updateWalk(dt: number) {
  ride = vertical.busy();
  if (ride && crouch.on) { crouch.on = false; document.body.classList.remove('crouching'); }
  crouch.k += ((crouch.on ? 1 : 0) - crouch.k) * (1 - Math.exp(-dt * 10)); if (Math.abs(crouch.k - (crouch.on ? 1 : 0)) < 0.002) crouch.k = crouch.on ? 1 : 0;
  const ck = crouch.k;
  const run = !crouch.on && (keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run) ? 2.2 : 1;
  if (!ride) { if (keys.has('ArrowLeft')) player.yaw += 1.8 * dt; if (keys.has('ArrowRight')) player.yaw -= 1.8 * dt; }
  if (keys.has('ArrowUp')) player.pitch = Math.min(1.3, player.pitch + dt); if (keys.has('ArrowDown')) player.pitch = Math.max(-1.3, player.pitch - dt);
  const f = ride ? 0 : THREE.MathUtils.clamp((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touch.y, -1, 1), s = ride ? 0 : THREE.MathUtils.clamp((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.x, -1, 1);
  // smooth look: the mouse sets targets, the view eases toward them (shortest way round, no snapping)
  const sm = 1 - Math.exp(-dt * 24);
  view.yaw += Math.atan2(Math.sin(player.yaw - view.yaw), Math.cos(player.yaw - view.yaw)) * sm; view.pitch += (player.pitch - view.pitch) * sm;
  const fwd = new THREE.Vector3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const want = ride ? new THREE.Vector3() : fwd.multiplyScalar(f).add(right.multiplyScalar(s));
  if (want.lengthSq() > 0) { const mag = Math.min(1, want.length()); want.normalize().multiplyScalar(2.4 * run * mag * (1 - 0.55 * ck)); }   // crouch-walk ≈ 1.1 m/s
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
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -200, 200); player.pos.z = THREE.MathUtils.clamp(player.pos.z, -150, 448);
  // avatar pose (a scripted walk in the lift/stairs animates too)
  const scriptedWalk = ride ? vertical.walkSpeed * dt : 0;
  const moving = mv.lengthSq() > 1e-7 || scriptedWalk > 0;
  const speed = ride ? vertical.walkSpeed : vel.length();
  if (thirdPerson && moving && !ride && vel.lengthSq() > 0.05) {
    const hd = Math.atan2(-vel.x, -vel.y); let dd = hd - view.bodyYaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    view.bodyYaw += dd * (1 - Math.exp(-dt * 10));
  } else if (!thirdPerson || ride) view.bodyYaw = view.yaw;
  avatar.root.position.copy(player.pos); avatar.root.rotation.y = view.bodyYaw + Math.PI;
  if (moving) { const ph0 = player.phase; player.phase = (player.phase + (scriptedWalk || mv.length()) / (WALK_STRIDE * avatar.scale)) % 1; if (!ride && player.ground && ((ph0 < 0.5) !== (player.phase < 0.5))) ambient.step(crouch.on); }
  if (thirdPerson) {
    if (!player.ground && !ride) walkPose(avatar, 0.3, 0.9);
    else if (ck > 0.02) crouchPose(avatar, player.phase, moving ? Math.min(1, speed / 1.0) : 0, ck, performance.now() / 1000);
    else if (moving) walkPose(avatar, player.phase, Math.min(1, speed / 1.2));
    else idlePose(avatar, performance.now() / 1000);
  }
  avatar.root.visible = thirdPerson;
  // camera feel: head bob + sway while walking, a dip when landing, wider FOV when running, slight lean on strafe
  const amt = (moving && (player.ground || ride) ? Math.min(1, speed / 2.4) : 0) * (1 - 0.5 * ck);
  fx.dipV += (-fx.dip * 90 - fx.dipV * 14) * dt; fx.dip += fx.dipV * dt;
  const running = run > 1 && moving && !ride;
  const wantFov = running ? 61 : 55; fx.fov += (wantFov - fx.fov) * (1 - Math.exp(-dt * 6));
  if (Math.abs(camera.fov - fx.fov) > 0.01) { camera.fov = fx.fov; camera.updateProjectionMatrix(); }
  fx.roll += ((ride ? 0 : -s * 0.012) - fx.roll) * (1 - Math.exp(-dt * 8));
  const bobY = Math.sin(player.phase * Math.PI * 4) * 0.026 * amt, bobX = Math.sin(player.phase * Math.PI * 2) * 0.016 * amt;
  const eyeY = player.pos.y + EYE_STAND + (EYE_CROUCH - EYE_STAND) * ck + fx.dip;
  if (!thirdPerson) {
    camera.position.set(player.pos.x + Math.cos(view.yaw) * bobX, eyeY + bobY, player.pos.z - Math.sin(view.yaw) * bobX);
    camera.rotation.set(view.pitch, view.yaw, fx.roll, 'YXZ');
  } else {
    // over-the-shoulder orbit camera that stops before walls/ceilings (and stays inside the lift car)
    const indoor = insideHotel(player.pos.x, player.pos.z);
    const inCar = vertical.ride?.kind === 'lift' && player.pos.z > wz(HOTEL_ORIGIN[1] + 12.2);
    const wantD = inCar ? 0.9 : indoor ? 2.3 : 3.6, pitch = THREE.MathUtils.clamp(view.pitch, -1.0, 0.9);
    view.head.lerp(new THREE.Vector3(player.pos.x, player.pos.y + 1.72 - 0.58 * ck, player.pos.z), view.head.distanceTo(player.pos) > 4 ? 1 : 1 - Math.exp(-dt * 18));
    const head = view.head;
    const back = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(view.yaw) * Math.cos(pitch));
    const side = new THREE.Vector3(Math.cos(view.yaw), 0, -Math.sin(view.yaw)).multiplyScalar(0.35);
    let d = 0.3; const q = new THREE.Vector3();
    const ceil = indoor ? player.pos.y + 2.25 : 1e9;
    // closed doors / closed lift landing doors count as walls for the camera too (it used to slide through a closed door into the room behind)
    camSolids.length = 0; if (indoor) { closedDoorBoxes(head.x, head.z, camSolids, player.pos.y); vertical.closedBoxes(player.level, camSolids); }
    // 0.22 m clearance: the near plane's corners reach ~0.22 m from the eye, so a closer wall gets clipped open
    while (d < wantD) { q.copy(head).addScaledVector(back, d + 0.1).add(side); if (blocked(q.x, q.z, q.y, 0.22, camSolids) || q.y > ceil || q.y < player.pos.y + 0.2) break; d += 0.1; }
    camDist = d < camDist ? d : camDist + (d - camDist) * Math.min(1, 5 * dt);   // pull in at once (no frame inside a wall), ease back out
    camera.position.copy(head).addScaledVector(back, camDist).add(side);
    camera.position.y = Math.max(camera.position.y, player.pos.y + 0.25) + fx.dip * 0.5;
    if (inCar) { // keep the camera inside the car (its walls are not colliders; outside them the near plane cut the car open)
      const cx = wx(HOTEL_ORIGIN[0] + (player.pos.x > wx(HOTEL_ORIGIN[0] + 21) ? 22 : 20));
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, cx - 0.62, cx + 0.62);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, wz(HOTEL_ORIGIN[1] + 12.45), wz(HOTEL_ORIGIN[1] + 13.62));
      camera.position.y = Math.min(camera.position.y, player.pos.y + 2.1);
    }
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
  const dr = !ride && !sp && insideHotel(player.pos.x, player.pos.z) ? nearestDoor(player.pos.x, player.pos.z, player.pos.y, 1.7, player.yaw) : null;
  const nb = ride || sp ? null : nearBike();
  if (ride) hint = '';
  else if (nb) { hint = '[F] Naik motor'; at = new THREE.Vector3(nb.pos.x, nb.pos.y + 1.35, nb.pos.z); }
  else if (!sp && nearNpcNow()) { const n = nearNpcNow()!; hint = `[F] Ngobrol dengan ${n.name}`; at = n.p.root.position.clone().setY(n.p.root.position.y + (n.kind === 'type' ? 1.45 : 1.9)); }
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

// ---------- Motor Matic: mount, ride, dismount ----------
const speedo = (() => { const e = document.createElement('div'); e.id = 'speedo'; e.innerHTML = '<div class="sp-v"><b>0</b><small>km/j</small></div><div class="sp-bar"><i></i></div><div class="sp-g">N</div>'; document.body.appendChild(e); return e; })();
function nearBike() {
  if (riding || seat || vertical.busy() || player.level !== 1 || insideHotel(player.pos.x, player.pos.z) || player.pos.y > 1) return null;
  return motors.nearest(player.pos.x, player.pos.z, 1.7);
}
function mount(b: Bike) {
  if (!standForAction()) return;
  riding = b; motors.mount(b); mountT = 0; wantDismount = false;
  vel.set(0, 0); player.vy = 0; player.ground = true;
  chaseYaw = b.yaw; rideLook.yaw = 0; rideLook.pitch = -0.16; rideLook.idle = 0; camDistR = 2.5; camRoll = 0; camTgt.set(b.pos.x, b.pos.y + 1.3, b.pos.z);
  b.m.lean.add(avatar.root); avatar.root.position.set(0, 0, 0); avatar.root.rotation.set(0, Math.PI, 0);
  motors.engine.start();
  document.body.classList.add('riding'); speedo.classList.add('on');
  $('hints').textContent = RIDE_HINTS;
  toast(isTouch() ? 'Naik motor · joystick = belok & gas/rem' : 'Naik motor · W gas · S rem · A/D belok · Spasi rem belakang · F turun', 3200);
}
/** where the rider can step off: beside the bike first, then behind/in front; never inside a wall, car or the hotel */
function dismountSpot(b: Bike): THREE.Vector3 | null {
  const f = motors.fwd(b), r = new THREE.Vector3(-f.z, 0, f.x);
  const dyn: AABB[] = []; trafficBoxes(b.pos.x, b.pos.z, 10, dyn); closedDoorBoxes(b.pos.x, b.pos.z, dyn, b.pos.y);
  for (const o of motors.bikes) if (Math.abs(o.pos.x - b.pos.x) < 6 && Math.abs(o.pos.z - b.pos.z) < 6) motors.boxesOf(o, dyn);
  const tries: [number, number][] = [[-0.85, 0.1], [0.85, 0.1], [-0.85, 0.55], [0.85, 0.55], [-0.85, -0.4], [0.85, -0.4], [0, -1.65], [0, 1.6], [-1.25, 0], [1.25, 0], [-1.25, 0.9], [1.25, 0.9], [0, -2.1], [0, 2.05]];
  const q = new THREE.Vector3();
  for (const [sx, sz] of tries) {
    q.copy(b.pos).addScaledVector(r, sx).addScaledVector(f, -sz);
    if (insideHotel(q.x, q.z) || Math.abs(q.x) > 199 || q.z < -149 || q.z > 447.5) continue;
    const feet = feetHeight(q.x, q.z, b.pos.y + 0.2);
    if (Math.abs(feet - b.pos.y) > 0.35) continue;
    const t = q.clone(); t.y = feet; resolveCircle(t, feet, RADIUS + 0.03, dyn);
    if (Math.hypot(t.x - q.x, t.z - q.z) > 1e-4) continue;
    if (blocked(q.x, q.z, feet + 1.0, RADIUS) || blocked(q.x, q.z, feet + 0.5, RADIUS)) continue;
    // the step-off path from the seat must not pass through a wall either
    const m = b.pos.clone().lerp(q, 0.5); if (blocked(m.x, m.z, feet + 0.8, 0.05)) continue;
    return q.setY(feet);
  }
  return null;
}
function endRide(b: Bike, at: THREE.Vector3 | null) {
  motors.park(b); riding = null; wantDismount = false; motors.engine.stop();
  scene.add(avatar.root); avatar.root.rotation.set(0, 0, 0); avatar.root.scale.setScalar(avatar.scale);
  const p = at ?? b.pos.clone();
  player.pos.copy(p); player.level = 1; player.vy = 0; player.ground = true; vel.set(0, 0);
  player.yaw = view.yaw = view.bodyYaw = b.yaw; player.pitch = view.pitch = -0.05;
  view.head.set(player.pos.x, player.pos.y + 1.72, player.pos.z);
  document.body.classList.remove('riding'); speedo.classList.remove('on');
  $('hints').textContent = WALK_HINTS;
  if (Math.abs(camera.fov - 55) > 0.01) { camera.fov = fx.fov = 55; camera.updateProjectionMatrix(); }
}
function requestDismount() {
  const b = riding; if (!b) return;
  if (Math.abs(b.speed) > 0.6) { if (!wantDismount) toast('Mengerem untuk turun…', 1400); wantDismount = true; return; }
  const at = dismountSpot(b);
  if (!at) { wantDismount = false; toast('Tidak ada ruang untuk turun di sini. Geser motornya sedikit.', 2600); return; }
  endRide(b, at);
}
/** leaving walk mode while riding (Esc): park the bike where it is */
function forceDismount() { const b = riding; if (!b) return; b.speed = 0; endRide(b, dismountSpot(b)); }
const _grip = new THREE.Vector3(), _q = new THREE.Quaternion();
const RIDE_HIP = new THREE.Vector3(0, 0.86, -0.17);
function gripRig(i: 0 | 1, steer: number, out: THREE.Vector3) {
  const g = MOTOR_GRIPS[i]; out.set(g[0], g[1], g[2]).sub(MOTOR_STEER_PIVOT).applyQuaternion(_q.setFromAxisAngle(MOTOR_STEER_AXIS, steer)).add(MOTOR_STEER_PIVOT);
  out.z += 0.04; out.y += 0.015;                       // wrist sits just behind the grip
  return out.set(-out.x, out.y, -out.z);               // bike space (fwd -Z, right +X) -> rider space (fwd +Z, left +X)
}
function updateRide(dt: number) {
  const b = riding!;
  const kW = keys.has('KeyW') || keys.has('ArrowUp'), kS = keys.has('KeyS') || keys.has('ArrowDown');
  const kA = keys.has('KeyA') || keys.has('ArrowLeft'), kD = keys.has('KeyD') || keys.has('ArrowRight');
  let thr = THREE.MathUtils.clamp((kW ? 1 : 0) + Math.max(0, touch.y), 0, 1), brk = THREE.MathUtils.clamp((kS ? 1 : 0) + Math.max(0, -touch.y), 0, 1);
  const steer = THREE.MathUtils.clamp((kA ? 1 : 0) - (kD ? 1 : 0) - touch.x, -1, 1);
  if (wantDismount && (kW || touch.y > 0.3)) wantDismount = false;          // rider changed their mind
  let rear = keys.has('Space');
  if (wantDismount) { thr = 0; if (b.speed > 0) brk = 1; else { brk = 0; rear = true; } }   // brake to a stop in either direction (S at a standstill would reverse)
  if (mountT < 1) { mountT = Math.min(1, mountT + dt / 0.35); thr = 0; }
  motors.update(b, { throttle: thr, brake: brk, rear, steer }, dt, rideDyn(b));
  motors.render(b, dt);
  if (wantDismount && Math.abs(b.speed) < 0.6) { wantDismount = false; requestDismount(); if (!riding) return; }
  player.pos.copy(b.pos); player.level = 1;
  // rider: hands on the grips (they turn with the bars), feet on the floorboard, left foot down when stopped
  const fd = b.footDown;
  avatar.root.visible = thirdPerson;
  if (thirdPerson) ridePose(avatar, { hip: RIDE_HIP, lean: 0.3 + 0.06 * Math.min(1, Math.abs(b.speed) / VMAX), ankleL: new THREE.Vector3(0.13 + 0.25 * fd, 0.43 - 0.35 * fd, 0.16 - 0.1 * fd), ankleR: new THREE.Vector3(-0.13, 0.43, 0.16), gripL: gripRig(0, b.steer, new THREE.Vector3()), gripR: gripRig(1, b.steer, _grip), look: THREE.MathUtils.clamp(rideLook.yaw * 0.5, -0.6, 0.6) });
  // feedback
  hitToastT -= dt;
  if (b.hit > 3) { rideShake = Math.min(0.25, b.hit * 0.02); if (hitToastT <= 0) { toast(b.hit > 8 ? 'Tabrakan keras! Motor terpental.' : 'Tabrakan! Hati-hati.', 1500); hitToastT = 1.5; } }
  else if (b.hit > 0 && b.hit < 0.1) rideShake = Math.max(rideShake, 0.03);   // kerb bump
  else if (b.hit === -1) { toast('Motor dikembalikan ke jalan terdekat.', 2200); chaseYaw = b.yaw; camDistR = 2; }
  rideShake *= Math.exp(-dt * 8);
  // camera: chase cam that lags the bike's heading, free look with mouse/drag that recentres when riding; or rider's eyes (V)
  rideLook.idle += dt;
  if (rideLook.idle > 1.4 && Math.abs(b.speed) > 1.5) { rideLook.yaw *= Math.exp(-dt * 2.2); rideLook.pitch += (-0.16 - rideLook.pitch) * (1 - Math.exp(-dt * 2)); }
  // chase camera: follows the heading with a speed-dependent lag (lazy when slow, tighter when fast), rolls a little into the lean
  chaseYaw += Math.atan2(Math.sin(b.yaw - chaseYaw), Math.cos(b.yaw - chaseYaw)) * (1 - Math.exp(-dt * (2.4 + 1.6 * Math.min(1, Math.abs(b.speed) / 10))));
  camRoll += (b.lean * 0.2 - camRoll) * (1 - Math.exp(-dt * 4));
  const wantFov = 55 + 9 * Math.min(1, Math.abs(b.speed) / VMAX); fx.fov += (wantFov - fx.fov) * (1 - Math.exp(-dt * 4));
  if (Math.abs(camera.fov - fx.fov) > 0.01) { camera.fov = fx.fov; camera.updateProjectionMatrix(); }
  const shake = Math.sin(elapsed * 61) * rideShake * 0.4;
  if (!thirdPerson) {
    b.m.root.updateMatrixWorld(true);   // from the root: its world matrix is otherwise one frame stale (camera lag / wrong spot)
    const head = new THREE.Vector3(0, 1.5, 0.04).applyMatrix4(b.m.lean.matrixWorld);
    camera.position.copy(head); camera.position.y += shake;
    camera.rotation.set(THREE.MathUtils.clamp(rideLook.pitch + 0.1, -1.0, 0.6), b.yaw + rideLook.yaw, b.lean * 0.55, 'YXZ');
  } else {
    const yaw = chaseYaw + rideLook.yaw, pitch = THREE.MathUtils.clamp(rideLook.pitch, -0.6, 0.45);
    camTgt.lerp(new THREE.Vector3(b.pos.x, b.pos.y + 1.3, b.pos.z), camTgt.distanceTo(b.pos) > 6 ? 1 : 1 - Math.exp(-dt * 14));
    const target = camTgt.clone();
    const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const wantD = 4.2 + Math.abs(b.speed) * 0.05; let d = 0.5; const q = new THREE.Vector3();
    while (d < wantD) { q.copy(target).addScaledVector(back, d + 0.15); if (blocked(q.x, q.z, q.y, 0.22) || q.y < b.pos.y + 0.25) break; d += 0.15; }
    camDistR = d < camDistR ? d : camDistR + (d - camDistR) * Math.min(1, 3 * dt);
    camera.position.copy(target).addScaledVector(back, camDistR); camera.position.y = Math.max(camera.position.y, b.pos.y + 0.35) + shake;
    camera.lookAt(target.x, target.y + 0.15, target.z); camera.rotateZ(camRoll);
  }
  // HUD
  const kmh = Math.round(Math.abs(b.speed) * 3.6);
  const vb = speedo.querySelector('b')!; if (vb.textContent !== String(kmh)) vb.textContent = String(kmh);
  (speedo.querySelector('.sp-bar i') as HTMLElement).style.width = `${Math.min(100, (Math.abs(b.speed) / VMAX) * 100).toFixed(1)}%`;
  const gear = b.speed < -0.05 ? 'R' : wantDismount ? 'P' : b.braking ? 'REM' : kmh > 0 ? 'D' : 'N'; const ge = speedo.querySelector('.sp-g')!; if (ge.textContent !== gear) ge.textContent = gear;
  let hint = '', at: THREE.Vector3 | null = null;
  if (Math.abs(b.speed) < 0.6) { hint = '[F] Turun'; at = new THREE.Vector3(b.pos.x, b.pos.y + 1.95, b.pos.z); }
  if (b.noProgT > 2.5) hint = (hint ? hint + ' · ' : '') + '[R] Kembalikan motor ke jalan';
  $('hudHint').textContent = hint; prompt.show(hint, at);
  motors.engine.on = !document.hidden && document.hasFocus();
  motors.engine.update(b.speed, thr);
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
    if (Math.abs((h ? Z : X) - c) <= half && t >= t0 && t <= t1) return streetLabel(r.name);
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

// ---------- night extras: lamp point lights (Tinggi), the bike headlight ----------
function updateNightExtras(dt: number) {
  const night = dn.night, hi = qName === 'tinggi';
  nightPickT -= dt;
  if (hi && night > 0.3) {
    if (nightPickT <= 0) {
      nightPickT = 0.4; const c = camera.position;
      const near = lampLights.map(p => ({ p, d: (p.x - c.x) ** 2 + (p.z - c.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, nightLights.length);
      nightLights.forEach((l, i) => { const n = near[i]; if (n) l.position.copy(n.p).setY(7.6); });
    }
    const k = THREE.MathUtils.smoothstep(night, 0.3, 0.8) * 22; for (const l of nightLights) l.intensity = k;
  } else for (const l of nightLights) l.intensity = 0;
  const b = riding && mode === 'walk' ? riding : null;
  const on = !!b && night > 0.25;
  headBeam.visible = on;
  if (b && on) {
    const f = motors.fwd(b); (headBeam.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (night - 0.25) * 2) * 0.55;
    headBeam.position.set(b.pos.x + f.x * 7.2, b.pos.y + 0.035, b.pos.z + f.z * 7.2); headBeam.rotation.y = b.yaw;
  }
  headSpot.intensity = hi && on ? 60 * Math.min(1, (night - 0.25) * 2) : 0;
  if (b && hi) { const f = motors.fwd(b); headSpot.position.set(b.pos.x + f.x * 0.7, b.pos.y + 0.95, b.pos.z + f.z * 0.7); headSpot.target.position.set(b.pos.x + f.x * 14, b.pos.y, b.pos.z + f.z * 14); }
}

// ---------- loop ----------
let last = performance.now(), elapsed = 0, frameCount = 0, flyA = 2.3, clockT = 0;
const tmp = new THREE.Vector3();
const lightBasis = new THREE.Matrix4(), lightBasisT = new THREE.Matrix4(), ZERO3 = new THREE.Vector3(), UP3 = new THREE.Vector3(0, 1, 0), sunNeg = new THREE.Vector3();
/** ?qa: automated playtest starts paused (frames only advance through __kota.step), so software GL is not flooded with frames */
const QA = new URLSearchParams(location.search).has('qa');
let paused = QA, fixedDt = 0, skipRender = false, anaT = 0;
function frame() {
  const now = performance.now(); const realDt = (now - last) / 1000; const dt0 = fixedDt || Math.min(realDt, 0.05); const dt = menu.paused ? 0 : dt0; last = now; elapsed += dt; const t = elapsed;
  watchFps(Math.min(realDt, 1));
  if (mode === 'orbit' && menu.open) {
    // title screen: slow flyover around the hotel / Kota Selatan, time of day visible
    flyA += dt0 * 0.045; const R = window.innerWidth < window.innerHeight ? 240 : 185;
    camera.position.set(wx(225) + Math.cos(flyA) * R, 78 + Math.sin(flyA * 0.7) * 14, wz(250) + Math.sin(flyA) * R * 1.15);
    controls.target.set(wx(220), 6, wz(240)); camera.lookAt(controls.target);
  } else if (mode === 'orbit') {
    if (tween) { tween.t = Math.min(1, tween.t + dt / 1.6); const e = 1 - Math.pow(1 - tween.t, 3); camera.position.lerpVectors(tween.from, tween.to, e); controls.target.lerpVectors(tween.tf, tween.tt, e); if (tween.t >= 1) tween = null; }
    controls.update();
  }
  { const fg = scene.fog as THREE.Fog, Qf = QUALITY[qName].fog, fn = mode === 'walk' ? Qf[0] : Math.max(Qf[0], 220), ff = mode === 'walk' ? Qf[1] : Math.max(Qf[1], 1300); if (fg.near !== fn || fg.far !== ff) { fg.near = fn; fg.far = ff; } }
  { const wantNear = mode === 'walk' ? 0.15 : activeView === 'overview' ? 3 : 0.6, wantFar = mode === 'walk' ? farBase : Math.max(farBase, 1600); if (camera.near !== wantNear || camera.far !== wantFar) { camera.near = wantNear; camera.far = wantFar; camera.updateProjectionMatrix(); } }
  cullHotel();
  noc.playerMoving = vel.lengthSq() > 0.04 || keys.size > 0; noc.update(dt);
  updateDoors(dt, mode === 'walk' ? player.pos.x : 1e6, mode === 'walk' ? player.pos.z : 1e6, player.pos.y, cutaway ? LEVELS[1].elev - 0.5 : null);
  if (mode !== 'walk') { /* orbit */ }
  else if (seat) { updateSeat(dt); prompt.hide(); }
  else if (!uiBlocked()) { if (riding) updateRide(dt); else { vertical.update(dt, player); updateWalk(dt); } }
  else { prompt.hide(); if (riding) { motors.engine.on = false; motors.engine.update(0, 0); } }
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
  // day/night: interiors keep their indoor light level at any hour
  gfx.update(dt || 0.016);
  dn.indoor = inside && mode === 'walk'; dn.update(dt, fixedDt || Math.min(realDt, 0.1), camera.position, camera.far); hotelNpcs.update(dt, t, inside && mode === 'walk', mode === 'walk' && !inside && Math.hypot(player.pos.x - wx(HOTEL_ORIGIN[0] + 15), player.pos.z - wz(HOTEL_ORIGIN[1] + 10)) < 70, player.level, seat?.pc.name ?? null, player.pos); ambient.update(Math.min(realDt, 0.1), dn.hour, inside && mode === 'walk', mode === 'walk' && !menu.paused);
  if (!renderer.shadowMap.autoUpdate && lastShadowFocus.distanceToSquared(tmp) > 144) { lastShadowFocus.copy(tmp); renderer.shadowMap.needsUpdate = true; }
  updateNightExtras(dt0);
  { const cd = mode === 'walk' ? Math.min(farBase * 0.4, 240) : 700; traffic.cull(camera.position, cd); peds.cull(camera.position, mode === 'walk' ? Math.min(farBase * 0.25, 120) : 260); }
  clockT -= dt0; if (clockT <= 0) { clockT = 0.5; const ct = `${dn.clock()} · ${dn.label()}`; const ce = $('clock'); if (ce.textContent !== ct) ce.textContent = ct; menu.setClock(ct); menu.setTimeActive(dn.label()); }
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
function lampMatI() { return (lampLights.length, (world.getObjectByName('LAMPU_LENGAN_GANDA_HEAD') as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined)?.emissiveIntensity ?? -1; }
function missionTarget(): { x: number; z: number } | null { const tk = noc.tracked(); if (tk) return { x: cityX(tk.pc.x), z: cityZ(tk.pc.z) }; const c = missions.current(); return c.targetPos ? { x: cityX(c.targetPos.x), z: cityZ(c.targetPos.z) } : null; }

goView('overview', true);
applySettings();
if (QA && !QS.has('menu')) menu.show(false); else menu.show(true);   // ?qa skips the title screen (?qa&menu keeps it for screenshots)
requestAnimationFrame(() => { if (!QA) frame(); const l = $('loading'); l.classList.add('done'); $('ldSub').textContent = 'Siap'; setTimeout(() => { l.style.opacity = '0'; setTimeout(() => l.remove(), 520); }, QA ? 0 : 260); });

// test hooks (used by automated playtest)
(window as any).__kota = {
  goView: (id: string) => goView(id, true), enterWalk, keys, player, renderer, scene, world,
  teleport: (X: number, Z: number, level = 1, yaw = Math.PI) => { player.pos.set(wx(X), LEVELS[level - 1].elev + 0.12, wz(Z)); player.level = level; player.yaw = yaw; },
  // automated playtest on software GL: pause the rAF loop so real input events get dispatched, then advance fixed steps
  pause: (v: boolean) => { const was = paused; paused = v; if (was && !v) { last = performance.now(); requestAnimationFrame(frame); } },
  step: (n = 1, dt = 1 / 30, render = true) => { fixedDt = dt; for (let i = 0; i < n; i++) { skipRender = !render || i < n - 1; frame(); } skipRender = false; fixedDt = 0; },
  /** QA: Motor Matic + crouch */
  motor: () => riding && { id: riding.id, x: riding.pos.x + 200, z: riding.pos.z + 150, y: riding.pos.y, yaw: riding.yaw, speed: riding.speed, kmh: Math.abs(riding.speed) * 3.6, steer: riding.steer, lean: riding.lean, pitch: riding.pitch, stuck: riding.stuckT, noProg: riding.noProgT, want: wantDismount, engine: motors.engine.on, speedo: speedo.innerText.replace(/\s+/g, ' ') },
  bikes: () => motors.bikes.map(b => ({ id: b.id, x: +(b.pos.x + 200).toFixed(3), z: +(b.pos.z + 150).toFixed(3), y: +b.pos.y.toFixed(3), yaw: +b.yaw.toFixed(3), ridden: b.ridden, speed: b.speed })),
  bikeTo: (id: string, X: number, Z: number, yaw: number) => { const b = motors.bikes.find(q => q.id === id)!; b.pos.set(wx(X), 0.5, wz(Z)); b.yaw = yaw; b.pos.y = 0; motors.settle(); return b.pos.y; },
  bikeSpeed: (v: number) => { if (riding) { riding.speed = v; mountT = 1; } return !!riding; },
  keysHeld: () => [...keys],
  /** QA only: a test beam (no mesh) to check the stand-up ceiling test where the city has no natural 1.3-1.7 m overhead */
  qaBeam: (X: number, Z: number, lv: number, y0: number, y1: number, w: number, d: number) => { const f = LEVELS[lv - 1].elev + 0.12; colliders.push({ minX: wx(X - w / 2), maxX: wx(X + w / 2), minZ: wz(Z - d / 2), maxZ: wz(Z + d / 2), minY: f + y0, maxY: f + y1 }); buildGrid(); },
  crouch: () => ({ on: crouch.on, k: crouch.k, canStand: canStand(), eye: camera.position.y - player.pos.y, third: thirdPerson }),
  lowOverheads: (X: number, Z: number, r = 6, lv = 1) => { const feet = LEVELS[lv - 1].elev + 0.12; return colliders.filter(c => wx(X) > c.minX - r && wx(X) < c.maxX + r && wz(Z) > c.minZ - r && wz(Z) < c.maxZ + r && c.minY > feet + CROUCH_TOP && c.minY < feet + 1.75 && c.maxY > feet + 1.3).map(c => [c.minX + 200, c.maxX + 200, c.minZ + 150, c.maxZ + 150, c.minY, c.maxY].map(v => +v.toFixed(2))); },
  state: () => ({ mode, riding: riding?.id ?? null, crouch: crouch.on, body: document.body.className, x: cityX(player.pos.x), z: cityZ(player.pos.z), y: player.pos.y, lv: player.level, loc: $('hudLoc').textContent, hint: $('hudHint').textContent, toast: $('toast').textContent }),
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
  why: () => ({ ui: uiBlocked(), ride: !!ride, riding: !!riding, sp: nearSpot()?.id ?? null, rk: nearRack(), nb: !!nearBike(), nn: nearNpcNow()?.name ?? null, pc: nearPc?.name ?? null, an: nearAnchor }),
  gfx: () => gfx.stats(),
  npcs: () => hotelNpcs.list.filter(n => n.p.root.visible).map(n => ({ name: n.name, role: n.role, kind: n.kind, level: n.level, pc: n.pc ?? null, x: n.p.root.position.x + 200, z: n.p.root.position.z + 150, y: n.p.root.position.y })),
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
  noc, missions, pcos, linux: linuxQa, office: officeQa, edge: edgeQa, swPort: (pc: string) => portOf(pc)?.port.n ?? null, anchors: () => hotelAnchorsWorld().map(a => ({ name: a.name, x: a.x + 200, z: a.z + 150 })), pcs: () => PCS.map(c => ({ name: c.name, x: c.p.x + 200, z: c.p.z + 150, y: c.p.y })), nearPc: () => nearPc?.name ?? null,
  look: (pitch: number) => { player.pitch = pitch; },
  /** QA: is a point (city coords) inside a static collider (r = padding) */
  blockedAt: (X: number, Z: number, y: number, r = 0) => blocked(wx(X), wz(Z), y, r),
  /** QA: camera pose + view (city coords) and a fixed look direction for screenshot probes */
  camPose: () => ({ x: cityX(camera.position.x), z: cityZ(camera.position.z), y: camera.position.y, near: camera.near, far: camera.far, third: thirdPerson }),
  setThird: (v: boolean) => { thirdPerson = v; },
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
  daynight: { get: () => ({ hour: dn.hour, night: dn.night, label: dn.label(), clock: dn.clock(), auto: dn.auto, exposure: renderer.toneMappingExposure, shadowAuto: renderer.shadowMap.autoUpdate, hemi: hemi.intensity, dir: dir.intensity, lamp: lampMatI() }), set: (h: number) => { dn.setHour(h); dn.apply(camera.position, camera.far); }, next: () => dn.next(), preset: (id: PresetId) => dn.goTo(id) },
  menu: { open: () => menu.open, paused: () => menu.paused, started: () => started, show: () => showMenu(), pause: () => openPause(), resume: () => resumeGame(), mainMenu: () => { menu.pause(false); if (mode === 'walk') exitWalk(); showMenu(); } },
  bounds: () => ({ minX: 0, maxX: 400, minZ: 0, maxZ: 600 }),
  steerIn: () => riding?.steerIn ?? null,
  perf: () => ({ frames: frameCount, quality: qName, auto: autoQ, pr: renderer.getPixelRatio(), ao: quality, shadows: renderer.shadowMap.enabled, far: camera.far }),
  setQ: (n: QName) => { autoQ = false; applyQuality(n, 'start'); },
  stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, colliders: colliders.length, vehicles: traffic.vehicles.length, peds: peds.peds.length }),
};
