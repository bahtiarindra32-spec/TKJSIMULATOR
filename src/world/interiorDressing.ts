// L1 interior dressing: educational posters, room/door signs, lobby directory, floor finishes, wall accent bands.
import * as THREE from 'three';
import { HOTEL_ORIGIN, wx, wz } from '../data/city';
import { group, box, mat } from './core';

const OX = wx(HOTEL_ORIGIN[0]), OZ = wz(HOTEL_ORIGIN[1]);
const X = (l: number) => OX + l, Z = (l: number) => OZ + l;

function canvasMat(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, emissive = 0) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d')!; draw(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? t : null, emissiveIntensity: emissive });
}
function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 'bold') {
  let fs = size; g.font = `${weight} ${fs}px Arial, sans-serif`;
  while (g.measureText(text).width > maxW && fs > 8) { fs -= 2; g.font = `${weight} ${fs}px Arial, sans-serif`; }
}
/** wall plane: face = direction the poster faces ('N' faces -Z, 'S' +Z, 'E' +X, 'W' -X) */
function onWall(p: THREE.Object3D, m: THREE.Material, w: number, h: number, lx: number, y: number, lz: number, face: 'N' | 'S' | 'E' | 'W', name?: string) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(X(lx), y, Z(lz)); mesh.rotation.y = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[face];
  if (name) mesh.name = name; mesh.userData.noCollide = true; p.add(mesh);
  // thin frame behind
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, h + 0.06), mat('#1d2226'));
  fr.position.copy(mesh.position); fr.rotation.copy(mesh.rotation); fr.translateZ(-0.004); fr.userData.noCollide = true; p.add(fr);
  return mesh;
}

const T568B = [['#ffffff', '#f07c1b', 'Putih-Oranye'], ['#f07c1b', null, 'Oranye'], ['#ffffff', '#2fae4a', 'Putih-Hijau'], ['#2563eb', null, 'Biru'], ['#ffffff', '#2563eb', 'Putih-Biru'], ['#2fae4a', null, 'Hijau'], ['#ffffff', '#8b5a2b', 'Putih-Cokelat'], ['#8b5a2b', null, 'Cokelat']] as const;

const posterT568B = () => canvasMat(600, 840, (g, W, H) => {
  g.fillStyle = '#f7f6f0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1e3a5f'; g.fillRect(0, 0, W, 120); g.fillStyle = '#fff'; fitText(g, 'URUTAN WARNA T568B', W - 40, 50); g.textAlign = 'center'; g.fillText('URUTAN WARNA T568B', W / 2, 62);
  g.font = '24px Arial'; g.fillText('Kabel straight: kedua ujung T568B', W / 2, 102);
  T568B.forEach(([base, stripe, label], i) => {
    const y = 150 + i * 78;
    g.fillStyle = base; g.fillRect(70, y, 140, 52); g.strokeStyle = '#333'; g.lineWidth = 2; g.strokeRect(70, y, 140, 52);
    if (stripe) { g.fillStyle = stripe; for (let k = 0; k < 140; k += 28) g.fillRect(70 + k, y, 14, 52); }
    g.fillStyle = '#111'; g.textAlign = 'left'; g.font = 'bold 30px Arial'; g.fillText(`${i + 1}`, 30, y + 36); g.font = '28px Arial'; g.fillText(label, 235, y + 36);
  });
  g.fillStyle = '#555'; g.font = '22px Arial'; g.textAlign = 'center'; g.fillText('Pin 1 di kiri, klip RJ45 menghadap bawah', W / 2, H - 40);
});
const posterOSI = () => canvasMat(600, 840, (g, W, H) => {
  g.fillStyle = '#0f1b26'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2bd46b'; g.textAlign = 'center'; fitText(g, '7 LAPISAN OSI', W - 40, 54); g.fillText('7 LAPISAN OSI', W / 2, 70);
  const L = [['7', 'Application', 'HTTP, DNS'], ['6', 'Presentation', 'TLS, JPEG'], ['5', 'Session', 'RPC'], ['4', 'Transport', 'TCP, UDP'], ['3', 'Network', 'IP, ICMP'], ['2', 'Data Link', 'Ethernet, VLAN'], ['1', 'Physical', 'UTP, Fiber']];
  const cols = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6'];
  L.forEach(([n, a, b], i) => { const y = 120 + i * 100; g.fillStyle = cols[i]; g.fillRect(40, y, W - 80, 84); g.fillStyle = '#0f1b26'; g.textAlign = 'left'; g.font = 'bold 40px Arial'; g.fillText(n, 62, y + 56); g.font = 'bold 32px Arial'; g.fillText(a, 120, y + 40); g.font = '24px Arial'; g.fillText(b, 120, y + 72); });
});
const posterK3 = () => canvasMat(600, 840, (g, W, H) => {
  g.fillStyle = '#ffd400'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.fillRect(20, 20, W - 40, H - 40); g.fillStyle = '#fff8d6'; g.fillRect(36, 36, W - 72, H - 72);
  g.fillStyle = '#b71c1c'; g.textAlign = 'center'; fitText(g, 'K3LH DI WORKSHOP', W - 100, 50); g.fillText('K3LH DI WORKSHOP', W / 2, 110);
  g.fillStyle = '#111'; g.font = '30px Arial'; g.textAlign = 'left';
  ['1. Matikan listrik sebelum bongkar', '2. Pakai gelang & alas anti-statis', '3. Kacamata saat potong fiber', '4. Rapikan kabel, jangan melintang', '5. Tahu letak APAR & jalur evakuasi'].forEach((l, i) => { fitText(g, l, W - 120, 30, 'normal'); g.fillText(l, 64, 210 + i * 92); });
  g.fillStyle = '#0f7a3a'; g.fillRect(60, H - 200, W - 120, 120); g.fillStyle = '#fff'; g.textAlign = 'center'; fitText(g, 'BUDAYA 5R', W - 160, 44); g.fillText('BUDAYA 5R', W / 2, H - 150); g.font = '26px Arial'; g.fillText('Ringkas · Rapi · Resik · Rawat · Rajin', W / 2, H - 105);
});
const posterTopo = () => canvasMat(900, 600, (g, W, H) => {
  g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, W, H); g.fillStyle = '#13202b'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillText('TOPOLOGI JARINGAN GEDUNG', W / 2, 55);
  const node = (x: number, y: number, t: string, c: string) => { g.fillStyle = c; g.fillRect(x - 85, y - 30, 170, 60); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText(t, x, y + 8); };
  g.strokeStyle = '#334'; g.lineWidth = 4; const L = (a: number[], b: number[]) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
  L([450, 130], [450, 240]); L([450, 240], [180, 360]); L([450, 240], [450, 360]); L([450, 240], [720, 360]); L([180, 360], [120, 500]); L([180, 360], [260, 500]); L([720, 360], [720, 500]);
  node(450, 130, 'INTERNET / ISP', '#7b1fa2'); node(450, 240, 'ROUTER (NAT)', '#c62828'); node(180, 360, 'SWITCH CORE', '#1565c0'); node(450, 360, 'SERVER', '#2e7d32'); node(720, 360, 'SWITCH L4-L8', '#1565c0');
  node(120, 500, 'VLAN 10 Kantor', '#455a64'); node(300, 500, 'VLAN 30 CCTV', '#455a64'); node(720, 500, 'VLAN 20 Wi-Fi', '#455a64');
});
const signMat = (text: string, bg = '#1e2a33', fg = '#ffffff', accent = '#2bd46b') => canvasMat(768, 160, (g, W, H) => {
  g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = accent; g.fillRect(0, H - 12, W, 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, text, W - 50, 70); g.fillText(text, W / 2, H / 2 - 4);
}, 0.25);
const directoryMat = () => canvasMat(600, 800, (g, W, H) => {
  g.fillStyle = '#2b2420'; g.fillRect(0, 0, W, H); g.fillStyle = '#e9d8a6'; g.textAlign = 'left';
  g.font = 'bold 44px Arial'; g.fillText('DIREKTORI GEDUNG', 40, 80); g.fillRect(40, 100, W - 80, 4);
  const rows = [['Lt 4–8', 'Kamar Hotel 401–808'], ['Lt 2–3', 'Kantor & Ruang Rapat'], ['Lt 1', 'Lobi · Lounge'], ['Lt 1', 'Kantor IT & NOC  →'], ['Lt 1', 'Workshop TKJ  →'], ['Lt 1', 'Ruang Server (lorong) →'], ['Atap', 'Antena & Parabola']];
  rows.forEach(([a, b], i) => { g.font = 'bold 32px Arial'; g.fillStyle = '#e9d8a6'; g.fillText(a, 40, 180 + i * 85); g.font = '30px Arial'; g.fillStyle = '#fff'; fitText(g, b, 360, 30, 'normal'); g.fillText(b, 190, 180 + i * 85); });
  g.fillStyle = '#2bd46b'; g.font = 'bold 26px Arial'; g.fillText('Wi-Fi Tamu: NusaHotel-Guest', 40, H - 40);
});
const clockMat = () => canvasMat(256, 256, (g) => {
  g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.lineWidth = 10; g.strokeStyle = '#222'; g.stroke();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.fillStyle = '#222'; g.fillRect(128 + Math.sin(a) * 96 - 3, 128 - Math.cos(a) * 96 - 10, 6, 20); }
  g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 50, 128 + 20); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 10, 128 - 85); g.stroke();
});

export function dressL1(hotel: THREE.Object3D) {
  const L1 = hotel.getObjectByName('L1')!;
  const D = group(L1, 'L1_DRESSING');
  const y0 = 0;
  // floors: lobby marble inlay, corridor runner, lounge timber
  const marble = canvasMat(512, 512, (g) => { g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, 512, 512); g.strokeStyle = 'rgba(120,110,95,0.35)'; for (let i = 0; i < 18; i++) { g.lineWidth = 1 + Math.random() * 2; g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 160; y += Math.random() * 90; g.lineTo(x, y); } g.stroke(); } g.strokeStyle = 'rgba(80,70,60,0.5)'; g.lineWidth = 3; g.strokeRect(0, 0, 512, 512); });
  (marble.map as THREE.Texture).wrapS = (marble.map as THREE.Texture).wrapT = THREE.RepeatWrapping; (marble.map as THREE.Texture).repeat.set(14 / 1.2, 12 / 1.2); marble.roughness = 0.25; marble.metalness = 0.05;
  box(D, X(0.15), y0 + 0.121, Z(0.15), 13.8, 0.008, 11.8, marble, 'L1_LOBI_MARMER', false);
  const wood = canvasMat(256, 256, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#8a6240' : '#7a5636'; g.fillRect(0, i * 16, 256, 16); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, i * 16, 256, 1); } });
  (wood.map as THREE.Texture).wrapS = (wood.map as THREE.Texture).wrapT = THREE.RepeatWrapping; (wood.map as THREE.Texture).repeat.set(4, 4);
  box(D, X(0.15), y0 + 0.121, Z(12.1), 9.8, 0.008, 7.75, wood, 'L1_LOUNGE_PARKET', false);
  // wall accent bands (painted dado) in workshop and IT office — signals the room identity
  const green = mat('#2f7d55', { roughness: 0.8 }), blue = mat('#2d5d8c', { roughness: 0.8 });
  box(D, X(22.07), y0 + 0.9, Z(0.2), 0.01, 0.12, 9.7, green, undefined, false); box(D, X(22.2), y0 + 0.9, Z(9.93), 7.6, 0.12, 0.01, green, undefined, false);
  box(D, X(14.07), y0 + 0.9, Z(0.2), 0.01, 0.12, 9.7, blue, undefined, false); box(D, X(14.2), y0 + 0.9, Z(9.93), 7.6, 0.12, 0.01, blue, undefined, false);
  // posters
  onWall(D, posterT568B(), 0.6, 0.84, 23.6, 1.65, 9.93, 'N', 'PROP_L1_POSTER_T568B');
  onWall(D, posterOSI(), 0.6, 0.84, 28.4, 1.65, 9.93, 'N', 'PROP_L1_POSTER_OSI');
  onWall(D, posterK3(), 0.6, 0.84, 22.07, 1.65, 8.1, 'E', 'PROP_L1_POSTER_K3LH');
  onWall(D, posterTopo(), 1.5, 1.0, 14.07, 1.75, 4.6, 'E', 'PROP_L1_POSTER_TOPOLOGI');
  onWall(D, clockMat(), 0.35, 0.35, 15.4, 2.55, 9.93, 'N', 'PROP_L1_JAM_DINDING');
  onWall(D, clockMat(), 0.35, 0.35, 26.0, 2.75, 9.93, 'N');
  onWall(D, directoryMat(), 0.9, 1.2, 13.93, 1.55, 9.2, 'W', 'PROP_L1_DIREKTORI');
  // corridor door signs (face south into corridor for Z10 wall, north for Z12 wall)
  onWall(D, signMat('KANTOR IT · NOC'), 1.2, 0.25, 18, 2.4, 10.07, 'S');
  onWall(D, signMat('WORKSHOP TKJ'), 1.2, 0.25, 26, 2.4, 10.07, 'S');
  onWall(D, signMat('LIFT', '#1e2a33', '#fff', '#c9a227'), 0.7, 0.2, 21, 2.45, 11.93, 'N');
  // room identity signs visible from the lobby end of the corridor
  onWall(D, signMat('→ IT · WORKSHOP · SERVER', '#13202b', '#ffffff', '#ffd400'), 1.8, 0.3, 14.3, 2.7, 11.0, 'W');
  return D;
}

/** interior light rig for L1 (kept outside the exported world) */
export function l1Lights(scene: THREE.Object3D) {
  const g = new THREE.Group(); g.name = 'L1_LIGHT_RIG'; scene.add(g);
  const spots: [number, number, string, number][] = [[4, 4, '#fff1dc', 1], [10, 6, '#fff1dc', 1], [4, 9.5, '#fff1dc', 0.8], [5, 16, '#ffe0b8', 0.9], [18, 5, '#eef4ff', 1], [24.5, 4, '#f4f8ff', 1], [28, 6, '#f4f8ff', 1], [22, 11, '#fff7ea', 0.6], [26.5, 16, '#cfe4ff', 0.9], [12.5, 16, '#f4f8ff', 0.5]];
  for (const [lx, lz, c, k] of spots) { const l = new THREE.PointLight(c, 5 * k, 10, 1.6); l.position.set(X(lx), 3.55, Z(lz)); g.add(l); }
  return g;
}
