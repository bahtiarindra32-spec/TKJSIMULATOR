// Pure, DOM-free and Three-free rules for the TKJ minigames.
// Everything here is deterministic given its inputs (random generators take an rng()).

export type Rng = () => number;
export const mathRng: Rng = () => Math.random();
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
export function shuffle<T>(r: Rng, a: readonly T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// ---------------------------------------------------------------- M1 K3LH
export interface K3Item { id: string; label: string; ok: boolean; why: string }
export const K3_ITEMS: K3Item[] = [
  { id: 'crimper', label: 'Tang crimping', ok: true, why: 'Alat utama untuk memotong, mengupas dan mengepres konektor RJ45.' },
  { id: 'tester', label: 'LAN tester', ok: true, why: 'Buat ngecek kabel yang sudah jadi, nyambung semua atau tidak.' },
  { id: 'utp', label: 'Kabel UTP', ok: true, why: 'Bahan kabel jaringan yang mau dibuat.' },
  { id: 'rj45', label: 'Konektor RJ45', ok: true, why: 'Kepala kabel yang dipasang di kedua ujung.' },
  { id: 'goggles', label: 'Kacamata pelindung', ok: true, why: 'APD: melindungi mata dari serpihan potongan kabel.' },
  { id: 'solder', label: 'Solder', ok: false, why: 'RJ45 dipasang dengan dipres, bukan disolder.' },
  { id: 'splicer', label: 'Fusion splicer', ok: false, why: 'Itu alat sambung fiber optik, bukan untuk kabel UTP.' },
  { id: 'grinder', label: 'Gerinda', ok: false, why: 'Alat potong logam: berbahaya dan tidak ada gunanya di sini.' },
  { id: 'coffee', label: 'Gelas kopi', ok: false, why: 'K3: jangan bawa minuman ke meja kerja dekat alat listrik.' },
];
export function checkK3Items(selected: string[]) {
  const sel = new Set(selected);
  const missing = K3_ITEMS.filter(i => i.ok && !sel.has(i.id));
  const extra = K3_ITEMS.filter(i => !i.ok && sel.has(i.id));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}
export interface ChoiceQ { q: string; options: string[]; answer: number; explain: string }
export const K3_QUESTIONS: ChoiceQ[] = [
  {
    q: 'Kamu lihat kabel roll (stopkontak) yang kabelnya terkelupas di lantai workshop. Apa yang kamu lakukan?',
    options: ['Pakai aja, asal hati-hati', 'Lilit selotip, lalu langsung dipakai', 'Jangan dipakai, kasih tanda, lapor ke guru/supervisor', 'Cabut dengan menarik kabelnya'],
    answer: 2,
    explain: 'Kabel terkelupas bisa bikin kesetrum atau korsleting. Amankan, beri tanda, dan laporkan supaya diganti.',
  },
  {
    q: 'Praktik selesai. Gimana dengan alat dan potongan kabel?',
    options: ['Biarkan di meja, besok dipakai lagi', 'Buang sampah potongan kabel, kembalikan alat ke tempatnya sesuai label', 'Masukkan semua ke tas sendiri', 'Tumpuk di pojok ruangan'],
    answer: 1,
    explain: 'Budaya 5R (Ringkas, Rapi, Resik, Rawat, Rajin): area bersih dan alat kembali ke tempatnya, jadi gampang dicari dan tidak hilang.',
  },
];

// ---------------------------------------------------------------- M2 Crimping
export type Wire = 'wo' | 'o' | 'wg' | 'bl' | 'wbl' | 'g' | 'wbr' | 'br';
export const T568B: Wire[] = ['wo', 'o', 'wg', 'bl', 'wbl', 'g', 'wbr', 'br'];
export const WIRE_LABEL: Record<Wire, string> = {
  wo: 'Putih-oranye', o: 'Oranye', wg: 'Putih-hijau', bl: 'Biru', wbl: 'Putih-biru', g: 'Hijau', wbr: 'Putih-coklat', br: 'Coklat',
};
export const WIRE_COLOR: Record<Wire, string> = {
  wo: '#f08a24', o: '#f08a24', wg: '#2fa84f', bl: '#2a6fdb', wbl: '#2a6fdb', g: '#2fa84f', wbr: '#8a5a2b', br: '#8a5a2b',
};
export const isStriped = (w: Wire) => w.startsWith('w');

export interface PinResult { pin: number; aWire: Wire | null; bWire: Wire | null; farPin: number | null; ok: boolean }
/** Simulates what a LAN tester shows, plus whether each end follows T568B. */
export function testCable(endA: (Wire | null)[], endB: (Wire | null)[]) {
  const pins: PinResult[] = [];
  for (let i = 0; i < 8; i++) {
    const a = endA[i] ?? null;
    const j = a ? endB.indexOf(a) : -1;
    pins.push({ pin: i + 1, aWire: a, bWire: endB[i] ?? null, farPin: j >= 0 ? j + 1 : null, ok: j === i });
  }
  const continuityOk = pins.every(p => p.ok);
  const aStd = endA.map((w, i) => w === T568B[i]);
  const bStd = endB.map((w, i) => w === T568B[i]);
  const standardOk = aStd.every(Boolean) && bStd.every(Boolean);
  return { pins, continuityOk, standardOk, aStd, bStd, ok: continuityOk && standardOk };
}

// ---------------------------------------------------------------- IPv4 helpers
export function parseIp(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some(n => n > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}
export const ipStr = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
export const prefixToMask = (p: number) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
/** Accepts "255.255.255.0", "/24" or "24". Returns prefix length or null (also null for non-contiguous masks). */
export function parseMask(s: string): number | null {
  const t = s.trim();
  const c = t.match(/^\/?(\d{1,2})$/);
  if (c) { const p = +c[1]; return p >= 0 && p <= 32 ? p : null; }
  const n = parseIp(t); if (n === null) return null;
  for (let p = 0; p <= 32; p++) if (prefixToMask(p) === n) return p;
  return null;
}
export const networkOf = (ip: number, p: number) => (ip & prefixToMask(p)) >>> 0;
export const broadcastOf = (ip: number, p: number) => (networkOf(ip, p) | (~prefixToMask(p) >>> 0)) >>> 0;

// ---------------------------------------------------------------- M3 IP & Ping
export const LAB = {
  server: '192.168.10.10', prefix: 24, router: '192.168.10.1',
  used: [{ ip: '192.168.10.1', who: 'Router lab' }, { ip: '192.168.10.10', who: 'Server praktik' }, { ip: '192.168.10.21', who: 'PC Praktik 2' }],
};
export type IpOutcome =
  | { kind: 'fieldError'; field: 'ip' | 'mask' | 'gw'; msg: string }
  | { kind: 'timeout'; msg: string }
  | { kind: 'conflict'; msg: string }
  | { kind: 'ok'; msg: string };
export function checkIpConfig(ipS: string, maskS: string, gwS: string): IpOutcome {
  const ip = parseIp(ipS);
  if (ip === null) return { kind: 'fieldError', field: 'ip', msg: 'Format IP belum benar. Contoh: 192.168.10.50 (4 angka 0–255 dipisah titik).' };
  const p = parseMask(maskS);
  if (p === null) return { kind: 'fieldError', field: 'mask', msg: 'Format subnet mask belum benar. Contoh: 255.255.255.0' };
  if (p !== LAB.prefix) return { kind: 'fieldError', field: 'mask', msg: `Jaringan lab pakai /24, jadi subnet mask-nya 255.255.255.0 (kamu isi /${p}).` };
  const srv = parseIp(LAB.server)!;
  const net = networkOf(srv, p), bc = broadcastOf(srv, p);
  if (networkOf(ip, p) !== net) {
    return { kind: 'timeout', msg: `IP ${ipStr(ip)} ada di jaringan ${ipStr(networkOf(ip, p))}/24, sedangkan server ada di ${ipStr(net)}/24. Beda jaringan, jadi PC tidak bisa langsung ngobrol dengan server. Pakai 192.168.10.x.` };
  }
  if (ip === net) return { kind: 'fieldError', field: 'ip', msg: `${ipStr(ip)} itu alamat network (angka terakhir 0). Tidak boleh dipakai host.` };
  if (ip === bc) return { kind: 'fieldError', field: 'ip', msg: `${ipStr(ip)} itu alamat broadcast (angka terakhir 255). Tidak boleh dipakai host.` };
  const dup = LAB.used.find(u => parseIp(u.ip) === ip);
  if (dup) return { kind: 'conflict', msg: `IP ${dup.ip} sudah dipakai ${dup.who}. Dua perangkat dengan IP sama = IP conflict. Pilih angka lain.` };
  const gw = parseIp(gwS);
  if (gw === null) return { kind: 'fieldError', field: 'gw', msg: 'Format gateway belum benar. Lihat lembar kerja: IP router lab.' };
  if (gw !== parseIp(LAB.router)) {
    return { kind: 'fieldError', field: 'gw', msg: `Gateway harus IP router lab: ${LAB.router}. Ping ke server sebenarnya bisa karena satu jaringan, tapi tanpa gateway yang benar PC tidak bisa keluar ke jaringan lain/internet.` };
  }
  return { kind: 'ok', msg: 'Satu jaringan dengan server, bukan alamat network/broadcast, tidak bentrok, gateway benar.' };
}
export function pingLines(ipS: string, maskS: string, gwS: string, outcome: IpOutcome): string[] {
  const ip = ipS.trim();
  const p = parseMask(maskS);
  const mask = p !== null ? ipStr(prefixToMask(p)) : maskS;
  const head = [
    'C:\\> ipconfig',
    '',
    'Ethernet adapter Ethernet:',
    `   IPv4 Address. . . . . . . . . . . : ${ip}`,
    `   Subnet Mask . . . . . . . . . . . : ${mask}`,
    `   Default Gateway . . . . . . . . . : ${gwS.trim()}`,
    '',
    `C:\\> ping ${LAB.server}`,
    '',
    `Pinging ${LAB.server} with 32 bytes of data:`,
  ];
  if (outcome.kind === 'ok') {
    return [...head, ...Array.from({ length: 4 }, () => `Reply from ${LAB.server}: bytes=32 time<1ms TTL=128`), '',
      `Ping statistics for ${LAB.server}:`, '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)'];
  }
  if (outcome.kind === 'conflict') {
    return [...head.slice(0, 7), '!! Windows mendeteksi IP address conflict pada jaringan ini.', '', ...head.slice(7), 'Request timed out.', 'Request timed out.', '...'];
  }
  return [...head, ...Array.from({ length: 4 }, () => 'Request timed out.'), '', `Ping statistics for ${LAB.server}:`, '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)'];
}

// ---------------------------------------------------------------- M4 Subnetting
export interface SubnetQ { q: string; options: string[]; answer: number; explain: string }
function opts(r: Rng, correct: string, wrong: string[]): { options: string[]; answer: number } {
  const uniq: string[] = [];
  for (const w of wrong) if (w !== correct && !uniq.includes(w)) uniq.push(w);
  const options = shuffle(r, [correct, ...uniq.slice(0, 3)]);
  return { options, answer: options.indexOf(correct) };
}
export function genSubnetQuiz(r: Rng = mathRng, third = 20): SubnetQ[] {
  const base = `192.168.${third}`;
  const qs: SubnetQ[] = [];
  const prefixes = shuffle(r, [25, 26, 27, 28, 29]);
  const blk = (p: number) => 2 ** (32 - p);
  const maskLast = (p: number) => 256 - blk(p);
  // 1. prefix -> mask
  { const p = prefixes[0];
    const o = opts(r, `255.255.255.${maskLast(p)}`, [25, 26, 27, 28, 29, 30].filter(x => x !== p).map(x => `255.255.255.${maskLast(x)}`).sort(() => r() - 0.5));
    qs.push({ q: `Prefix /${p} itu subnet mask-nya berapa?`, ...o,
      explain: `/${p} = ${p} bit angka 1. Oktet terakhir punya ${p - 24} bit 1 → 256 − ${blk(p)} = ${maskLast(p)}. Jadi 255.255.255.${maskLast(p)}.` }); }
  // 2. hosts per subnet
  { const p = prefixes[1]; const h = blk(p) - 2;
    const o = opts(r, String(h), [String(blk(p)), String(blk(p) - 1), String(blk(p) * 2 - 2), String(blk(p) / 2 - 2)]);
    qs.push({ q: `Berapa jumlah host valid (yang bisa dipakai perangkat) di satu subnet /${p}?`, ...o,
      explain: `Host bit = 32 − ${p} = ${32 - p}. 2^${32 - p} = ${blk(p)} alamat, dikurangi 2 (network & broadcast) = ${h} host.` }); }
  // 3. network address of a host
  { const p = prefixes[2]; const b = blk(p); const n = 1 + Math.floor(r() * (256 / b - 2)); const host = n * b + 1 + Math.floor(r() * (b - 2));
    const net = Math.floor(host / b) * b;
    const o = opts(r, `${base}.${net}`, [`${base}.${net + b}`, `${base}.${net - b}`, `${base}.${host}`, `${base}.${net + 1}`, `${base}.0`].filter(s => +s.split('.')[3] >= 0 && +s.split('.')[3] <= 255));
    qs.push({ q: `IP ${base}.${host}/${p}. Alamat network-nya apa?`, ...o,
      explain: `/${p} → lompatan blok ${b} (256 − ${maskLast(p)}). Kelipatan ${b} terdekat di bawah ${host} adalah ${net}. Jadi network ${base}.${net}.` }); }
  // 4. broadcast of a host
  { const p = prefixes[3]; const b = blk(p); const n = Math.floor(r() * (256 / b - 1)); const host = n * b + 1 + Math.floor(r() * (b - 2));
    const net = Math.floor(host / b) * b; const bc = net + b - 1;
    const o = opts(r, `${base}.${bc}`, [`${base}.${bc - 1}`, `${base}.${net}`, `${base}.255`, `${base}.${bc + b}`, `${base}.${bc + 1}`].filter(s => +s.split('.')[3] >= 0 && +s.split('.')[3] <= 255));
    qs.push({ q: `IP ${base}.${host}/${p}. Alamat broadcast-nya apa?`, ...o,
      explain: `Blok /${p} = ${b}. ${host} ada di blok ${net}–${bc}. Broadcast = alamat terakhir blok = ${base}.${bc}. Host valid ${base}.${net + 1} – ${base}.${bc - 1}.` }); }
  // 5. number of subnets from a /24
  { const p = prefixes[4]; const s = 2 ** (p - 24);
    const o = opts(r, String(s), [String(s * 2), String(s / 2 >= 1 ? s / 2 : s * 4), String(blk(p)), String(blk(p) - 2), String(p - 24)]);
    qs.push({ q: `Jaringan ${base}.0/24 dibagi rata pakai prefix /${p}. Jadi berapa subnet?`, ...o,
      explain: `Bit yang dipinjam = ${p} − 24 = ${p - 24}. 2^${p - 24} = ${s} subnet, masing-masing ${blk(p)} alamat.` }); }
  return qs;
}
export const SUBNET_PASS = 4;

// ---------------------------------------------------------------- M5 VLAN
export type VlanChoice = 10 | 20 | 30 | 'trunk' | null;
export interface Port { port: number; device: string; kind: 'kantor' | 'tamu' | 'cctv' | 'uplink' }
export const SWITCH_PORTS: Port[] = [
  { port: 1, device: 'PC Admin Kantor', kind: 'kantor' },
  { port: 2, device: 'AP Wi-Fi Tamu (Lobi)', kind: 'tamu' },
  { port: 3, device: 'Kamera CCTV Lobi', kind: 'cctv' },
  { port: 4, device: 'PC Resepsionis', kind: 'kantor' },
  { port: 5, device: 'Kamera CCTV Parkir', kind: 'cctv' },
  { port: 6, device: 'AP Wi-Fi Tamu (Lt. 2)', kind: 'tamu' },
  { port: 7, device: 'Printer Kantor', kind: 'kantor' },
  { port: 8, device: 'Uplink ke Router', kind: 'uplink' },
];
export const VLAN_FOR: Record<Port['kind'], VlanChoice> = { kantor: 10, tamu: 20, cctv: 30, uplink: 'trunk' };
export const VLAN_NAME: Record<10 | 20 | 30, string> = { 10: 'KANTOR', 20: 'TAMU-WIFI', 30: 'CCTV' };
export function checkVlans(assign: VlanChoice[]) {
  const rows = SWITCH_PORTS.map((p, i) => {
    const got = assign[i] ?? null, want = VLAN_FOR[p.kind];
    let why = '';
    if (got === want) why = 'Pas.';
    else if (got === null) why = 'Belum diatur (masih VLAN 1 default).';
    else if (p.kind === 'uplink') why = 'Port ke router membawa banyak VLAN sekaligus, jadi harus trunk (802.1Q).';
    else if (got === 'trunk') why = 'Port ke perangkat biasa dibuat access di satu VLAN, bukan trunk.';
    else if (p.kind === 'cctv') why = `CCTV harus VLAN 30. Kalau di VLAN ${got}, kamera bisa dijangkau ${got === 20 ? 'tamu Wi-Fi. Bahaya!' : 'semua PC kantor.'}`;
    else if (p.kind === 'tamu') why = `Wi-Fi tamu harus VLAN 20, terpisah dari ${got === 10 ? 'jaringan kantor (data hotel bisa diintip tamu)' : 'CCTV'}.`;
    else why = 'Perangkat kantor harus VLAN 10.';
    return { ...p, got, want, ok: got === want, why };
  });
  return { rows, ok: rows.every(r => r.ok) };
}
export function showVlanBrief(assign: VlanChoice[]): string[] {
  const portsOf = (v: VlanChoice | 1) => SWITCH_PORTS.filter((_, i) => (v === 1 ? assign[i] == null : assign[i] === v)).map(p => `Fa0/${p.port}`).join(', ');
  const row = (id: string, name: string, ports: string) => `${id.padEnd(5)}${name.padEnd(12)}active    ${ports}`;
  const trunks = SWITCH_PORTS.filter((_, i) => assign[i] === 'trunk').map(p => `Fa0/${p.port}`).join(', ') || '(tidak ada)';
  return ['Switch# show vlan brief', '', 'VLAN Name        Status    Ports', '---- ----------- --------- ------------------------',
    row('1', 'default', portsOf(1)), row('10', 'KANTOR', portsOf(10)), row('20', 'TAMU-WIFI', portsOf(20)), row('30', 'CCTV', portsOf(30)),
    '', `Switch# show interfaces trunk  →  ${trunks}`];
}

// ---------------------------------------------------------------- M6 UPS & suhu
export const TEMP_MIN = 18, TEMP_MAX = 27; // ASHRAE recommended server inlet range (research doc S7)
export const tempOk = (t: number) => t >= TEMP_MIN && t <= TEMP_MAX;
export interface UpsState { mode: 'ONLINE' | 'ON BATTERY'; input: number; battery: number; runtimeMin: number; ok: boolean }
export interface ServerScenario { temps: number[]; ups: UpsState }
export function genServerScenario(r: Rng = mathRng): ServerScenario {
  const temps = Array.from({ length: 4 }, () => 19 + Math.floor(r() * 8)); // 19..26 safe
  const bad = Math.floor(r() * 4);
  temps[bad] = r() < 0.7 ? 28 + Math.floor(r() * 4) : 15 + Math.floor(r() * 3); // 28..31 hot or 15..17 cold
  if (r() < 0.35) { let k = (bad + 1 + Math.floor(r() * 3)) % 4; temps[k] = pick(r, [18, 27]); } // boundary value, still safe
  const onBatt = r() < 0.5;
  const ups: UpsState = onBatt
    ? { mode: 'ON BATTERY', input: 0, battery: 40 + Math.floor(r() * 40), runtimeMin: 6 + Math.floor(r() * 14), ok: false }
    : { mode: 'ONLINE', input: 218 + Math.floor(r() * 6), battery: 100, runtimeMin: 35 + Math.floor(r() * 15), ok: true };
  return { temps, ups };
}
export function checkServer(s: ServerScenario, marks: (boolean | null)[], upsSaysOk: boolean | null) {
  const temps = s.temps.map((t, i) => ({ rack: i + 1, t, ok: tempOk(t), mark: marks[i], correct: marks[i] === tempOk(t) }));
  const upsCorrect = upsSaysOk === s.ups.ok;
  return { temps, upsCorrect, ok: temps.every(x => x.correct) && upsCorrect };
}
