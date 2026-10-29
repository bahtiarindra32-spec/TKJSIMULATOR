// Guest Wi-Fi on the hotel floors (L4–L8): radio model, association and captive portal. Pure TS, no DOM.
// Three ceiling APs per hotel corridor (local X5/X15/X25, Z11) broadcast SSID "Nusantara-Guest" on 2.4 GHz.
// Signal = EIRP − path loss (log-distance, n≈3.2) − walls (drywall 5 dB, exterior 10 dB) − floor slabs (18 dB).
// Two APs on overlapping channels (|Δch| < 5) that a client hears at similar strength share airtime: the
// link gets slow and lossy. That is why the plan uses only channels 1, 6 and 11 and staggers them per floor.
import { HOTEL_ORIGIN, LEVELS } from '../data/city';

export type TxPower = 'Tinggi' | 'Sedang' | 'Rendah';
export const TXDBM: Record<TxPower, number> = { Tinggi: 20, Sedang: 14, Rendah: 8 };
export const SSID_GUEST = 'Nusantara-Guest';
export const CHANNELS = Array.from({ length: 13 }, (_, i) => i + 1);   // Indonesia: 2.4 GHz channels 1–13
export interface Ap {
  id: string; level: number; lx: number; lz: number; ly?: number; ch: number; power: TxPower; radio: boolean;
  adopted: boolean; mounted: boolean; mac: string; ssid: string; ext?: boolean;
}
export const APS: Ap[] = [];
const hex = (n: number) => (n & 255).toString(16).padStart(2, '0');
export const AP_X = [5, 15, 25];
export const defaultCh = (lv: number, i: number) => [1, 6, 11][(i + lv) % 3];
for (let lv = 4; lv <= 8; lv++) AP_X.forEach((x, i) => APS.push({
  id: `AP-L${lv}-${String(x).padStart(2, '0')}`, level: lv, lx: x, lz: 11, ch: defaultCh(lv, i), power: 'Sedang', radio: true, adopted: true, mounted: true,
  mac: ['b4', 'fb', 'e4', hex(lv), hex(x), hex(lv * 7 + x)].join(':'), ssid: SSID_GUEST,
}));
/** neighbours' Wi-Fi heard through the windows (a ruko and a house next door) */
export const EXT: Ap[] = [
  { id: 'IndiHome-7F2A', level: 0, lx: -16, lz: 6, ly: 14, ch: 6, power: 'Rendah', radio: true, adopted: true, mounted: true, mac: '9c:a2:f4:7f:2a:01', ssid: 'IndiHome-7F2A', ext: true },
  { id: 'RUKO_SEJAHTERA', level: 0, lx: 45, lz: 15, ly: 20, ch: 11, power: 'Rendah', radio: true, adopted: true, mounted: true, mac: '50:c7:bf:11:3e:90', ssid: 'RUKO_SEJAHTERA', ext: true },
];
export const apById = (id: string) => APS.find(a => a.id === id) ?? EXT.find(a => a.id === id) ?? null;

// ---------------------------------------------------------------- radio
/** wall lines on a hotel floor (local coords) and their loss in dB */
const WALLS: [number, number, number, number, number][] = [
  [0, 10, 30, 10, 5], [0, 12, 30, 12, 5],
  ...[5, 10, 15, 20, 25].map(x => [x, 0, x, 10, 5] as [number, number, number, number, number]),
  ...[5, 10, 12.5, 15, 19, 21, 23, 26.5].map(x => [x, 12, x, 20, 5] as [number, number, number, number, number]),
  [0, 0, 30, 0, 10], [0, 20, 30, 20, 10], [0, 0, 0, 20, 10], [30, 0, 30, 20, 10],
];
function cross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
  const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return u > 0 && u < 1 && v >= 0 && v <= 1;
}
const apY = (ap: Ap) => ap.ext ? ap.ly! : LEVELS[ap.level - 1].elev + LEVELS[ap.level - 1].h - 0.25;
let onlineFn: (ap: Ap) => boolean = () => true;
export function setApOnlineFn(f: (ap: Ap) => boolean) { onlineFn = f; }
/** AP powered, patched and radiating */
export const apUp = (ap: Ap) => ap.ext || (ap.mounted && ap.adopted && ap.radio && onlineFn(ap));
/** received signal (dBm) of an AP at a point (hotel-local x/z, world height y) */
export function rssiAt(ap: Ap, lx: number, lz: number, y: number, level: number): number {
  const d = Math.max(1, Math.hypot(ap.lx - lx, ap.lz - lz, apY(ap) - y));
  let loss = 40 + 32 * Math.log10(d);
  for (const [x1, z1, x2, z2, db] of WALLS) if (cross(ap.lx, ap.lz, lx, lz, x1, z1, x2, z2)) loss += db;
  if (!ap.ext) loss += Math.abs(ap.level - level) * 18;
  return Math.round(TXDBM[ap.power] + 3 - loss);
}
export interface Heard { ap: Ap; rssi: number }
/** every network a radio hears at this spot, strongest first (−92 dBm noise floor) */
export function heardAt(lx: number, lz: number, y: number, level: number): Heard[] {
  const out: Heard[] = [];
  for (const ap of [...APS, ...EXT]) { if (!apUp(ap)) continue; const r = rssiAt(ap, lx, lz, y, level); if (r > -92) out.push({ ap, rssi: r }); }
  return out.sort((a, b) => b.rssi - a.rssi);
}
export const overlap = (a: number, b: number) => Math.abs(a - b) < 5;
export const pctOf = (rssi: number) => Math.max(0, Math.min(100, Math.round(2 * (rssi + 100))));
export const barsOf = (rssi: number) => (rssi >= -60 ? 4 : rssi >= -67 ? 3 : rssi >= -75 ? 2 : rssi >= -85 ? 1 : 0);

// ---------------------------------------------------------------- clients (hotel-room laptops)
export interface Client { pc: string; lx: number; lz: number; y: number; level: number; room: string; guest: string; want: string | null }
export const CLIENTS = new Map<string, Client>();
const SURNAMES = ['SIREGAR', 'WIJAYA', 'NASUTION', 'HARTONO', 'PRATAMA', 'SANTOSO', 'LUBIS', 'KUSUMA', 'TANJUNG', 'SAPUTRA', 'HALIM', 'GINTING', 'SIMATUPANG', 'RAHMAN', 'SETIAWAN'];
/** world x/z of the laptop (three.js units) */
export function registerClient(pc: string, x: number, y: number, z: number, level: number) {
  const room = /_(\d{3})$/.exec(pc)?.[1] ?? '';
  const k = [...pc].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);
  CLIENTS.set(pc, { pc, lx: x + 200 - HOTEL_ORIGIN[0], lz: z + 150 - HOTEL_ORIGIN[1], y, level, room, guest: SURNAMES[k % SURNAMES.length], want: SSID_GUEST });
}
/** captive-portal sessions (client MAC) */
export const AUTH = new Set<string>();

export interface Quality { ap: Ap; rssi: number; pct: number; ch: number; cci: number; cciAp: Ap | null; busy: boolean; weak: boolean; ok: boolean }
/** the AP a laptop is associated with right now (strongest AP of its SSID), or null */
export function servingAp(pc: string): Ap | null {
  const c = CLIENTS.get(pc); if (!c || !c.want) return null;
  const best = heardAt(c.lx, c.lz, c.y, c.level).find(h => h.ap.ssid === c.want && !h.ap.ext);
  return best && best.rssi >= -86 ? best.ap : null;
}
/** link quality at the laptop: weak signal, or another AP on an overlapping channel heard nearly as loud */
export function quality(pc: string): Quality | null {
  const c = CLIENTS.get(pc); if (!c) return null;
  const all = heardAt(c.lx, c.lz, c.y, c.level);
  const me = all.find(h => h.ap.ssid === c.want && !h.ap.ext); if (!me || me.rssi < -86) return null;
  const rivals = all.filter(h => h.ap !== me.ap && overlap(h.ap.ch, me.ap.ch));
  const top = rivals[0] ?? null;
  const cci = top ? top.rssi : -100;
  const busy = cci >= -80 && cci >= me.rssi - 20;
  const weak = me.rssi < -70;
  return { ap: me.ap, rssi: me.rssi, pct: pctOf(me.rssi), ch: me.ap.ch, cci, cciAp: top?.ap ?? null, busy, weak, ok: !busy && !weak };
}
/** a channel the WLC would call clean at this AP: no overlapping AP heard above −80 dBm at the AP itself */
export function channelClean(ap: Ap): boolean {
  const y = apY(ap) - 0.3;
  return !heardAt(ap.lx, ap.lz, y, ap.level).some(h => h.ap !== ap && overlap(h.ap.ch, ap.ch) && h.rssi >= -80);
}
