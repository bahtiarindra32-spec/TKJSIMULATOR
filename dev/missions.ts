// Standalone harness: MissionSystem + MissionUI + waypoint over a plain Three.js grid.
import '../src/style.css';
import * as THREE from 'three';
import { MissionSystem, hotelAnchorsWorld } from '../src/game/missionSystem';
import { MissionUI } from '../src/ui/missionUI';
import { createWaypoint, updateWaypoint, createAnchorMarker } from '../src/ui/waypoint';

const anchors = hotelAnchorsWorld();
const ms = new MissionSystem(anchors);
const ui = new MissionUI(ms);
const wp = createWaypoint();

// ---- tiny scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.getElementById('app')!.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1b2026');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 500);
const c = anchors.find(a => a.name === 'ANCHOR_WS_PC_01')!;
const grid = new THREE.GridHelper(60, 60, '#5a6a78', '#3a4650'); grid.position.set(c.x - 6, 0, c.z + 4); scene.add(grid);
for (const a of anchors) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), new THREE.MeshBasicMaterial({ color: '#56616b' }));
  box.position.set(a.x, 0.45, a.z); scene.add(box);
}
const marker = createAnchorMarker(); scene.add(marker.group);
const player = { x: anchors[19].x - 2, z: anchors[19].z + 3, yaw: Math.PI * 0.75 };

function nearest(): string | null {
  let best = 1.6, nm: string | null = null;
  for (const a of anchors) { const d = Math.hypot(player.x - a.x, player.z - a.z); if (d < best) { best = d; nm = a.name; } }
  return nm;
}
function goto(name: string) {
  const a = anchors.find(x => x.name === name)!;
  player.x = a.x; player.z = a.z + 1.0; player.yaw = 0; // stand 1 m south, facing north (-Z)
}
const $ = (id: string) => document.getElementById(id)!;
for (const a of anchors) {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.anchor = a.name; b.textContent = a.name.replace('ANCHOR_', '');
  b.onclick = () => { goto(a.name); ms.setPlayerPos(player.x, player.z); const handled = ms.interact(a.name); if (!handled) ui.toast(`(main.ts fallback toast) ${a.name}`); };
  $('devAnchors').appendChild(b);
}
ms.missions.forEach((m, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = `Lompat ke Misi ${m.no}`; b.onclick = () => ms.jumpTo(i); $('devJump').appendChild(b); });
$('devSpawn').onclick = () => { player.x = anchors[19].x - 2; player.z = anchors[19].z + 3; player.yaw = Math.PI * 0.75; };
$('devStart').onclick = () => ms.start();
$('devReset').onclick = () => { ms.reset(); ms.start(); };
$('devToggle').onclick = () => $('dev').classList.toggle('closed');

// keyboard like main.ts: WASD move, F interact (main.ts listener is on window, bubble phase)
const keys = new Set<string>();
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyF') { const n = nearest(); if (n && !ms.interact(n)) ui.toast(n); } });
addEventListener('keyup', e => keys.delete(e.code));
ms.onModalChange(open => { if (open) keys.clear(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let last = performance.now();
function frame() {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!ms.isModalOpen()) {
    if (keys.has('KeyA')) player.yaw += 1.8 * dt; if (keys.has('KeyD')) player.yaw -= 1.8 * dt;
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    player.x += -Math.sin(player.yaw) * f * 2.4 * dt; player.z += -Math.cos(player.yaw) * f * 2.4 * dt;
  }
  camera.position.set(player.x, 1.62, player.z); camera.rotation.set(-0.12, player.yaw, 0, 'YXZ');
  ms.setPlayerPos(player.x, player.z);
  const cur = ms.current();
  const tgt = cur.targetPos ? { ...cur.targetPos, y: cur.targetY } : null;
  marker.setTarget(tgt); marker.update(now / 1000);
  updateWaypoint(wp, camera, player, ms.isModalOpen() || !tgt ? null : { x: tgt.x, z: tgt.z, y: tgt.y + 1.3 }, { label: cur.place });
  document.querySelectorAll<HTMLButtonElement>('#devAnchors button').forEach(b => b.classList.toggle('cur', b.dataset.anchor === cur.targetName));
  $('devState').textContent = `misi ${cur.step}/${cur.total} xp ${cur.xp}\nmodal ${JSON.stringify(ms.getModal())}\nnear ${nearest() ?? '-'}\nhint ${ms.hintFor(nearest()) ?? '-'}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
ms.start();
(window as unknown as { __ms: unknown }).__ms = { ms, ui, goto, player };
