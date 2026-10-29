// Work board of Nusantara Tech's IT team: replayable jobs on the real building network.
//   * Kontrak (work orders): randomized templates (static IP, new desk, DNS record, DHCP renumbering,
//     VLAN move). Every run picks a different segment, subnet, PCs, names and twists.
//   * Shift tiket: 3-5 random trouble tickets with SLA (faults injected into the network sim).
// A job closes only when the network state is really correct AND the player tested it from the affected
// PC (ping / browser). No quizzes: the report is written automatically from what the player did, and
// mistakes have consequences (collateral PCs that break become follow-up complaints).
// Physical work is physical: tools come from the workshop cabinet, cables are fixed at the PC (C),
// switches are configured over a console cable at the server-room rack.
import {
  ENVS, ADAPTERS, SWITCHES, envOf, live, healthy, adapterOf, linkUp, bounce, portOf, outletOf, portName, routerOf, setRouterLan,
  poolProblem, dhcpHousekeeping, isWireless, ipStr, parseIp, networkOf, maskStr, PUBLIC_DNS, type Env, type Switch,
  panelOf, isWired, patchCord, repatch, stormOn, uplinkCarries, outletId,
} from '../pcos/net';
import type { PcOS, PcEvent } from '../pcos/os';
import { SwitchCli } from '../pcos/switchcli';
import './noc.css';

// ---------------------------------------------------------------- helpers
const pick = <T,>(a: T[], r = Math.random) => a[Math.floor(r() * a.length)];
const shuffle = <T,>(a: T[], r = Math.random) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const btn = (txt: string, fn: () => void, cls = 'btn', name = '') => { const b = h('button', cls, txt) as HTMLButtonElement; b.onclick = fn; if (name) b.name = name; return b; };
const mmss = (s: number) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
/** Wall label of a wired desk: true = printed and correct, false = missing/wrong, null = not a wired desk. */
const wallOk = (pc: string) => { const q = panelOf(pc); return q ? q.pp.label.toUpperCase() === outletId(q.sw.level, q.pp.n) : null; };
const hostIp = (env: Env, n: number) => ipStr((networkOf(parseIp(env.gateway)!, env.prefix) + n) >>> 0);

// ---------------------------------------------------------------- faults (tickets)
export type FaultId = 'cable' | 'cablebad' | 'port' | 'vlan' | 'disabled' | 'released' | 'wrongip' | 'conflict' | 'gateway' | 'dns' | 'patch' | 'uplink' | 'loop';
interface FaultDef { cause: string; fix: string; symptom: string; hint: string; cp: string; wired: boolean; rank: number }
export const FAULTS: Record<FaultId, FaultDef> = {
  cable: { cause: 'Konektor RJ45 di PC lepas/longgar', fix: 'konektor dicolok ulang sampai terkunci', symptom: 'Ikon jaringan silang merah, internet mati total.', hint: 'Status adapter "Network cable unplugged" = lapisan fisik. Datangi PC, tekan C, periksa konektor.', cp: 'Fase E · Media transmisi', wired: true, rank: 0 },
  disabled: { cause: 'Adapter jaringan di-disable', fix: 'adapter di-enable lagi', symptom: 'Ikon jaringan hilang, PC tidak terhubung ke mana pun.', hint: 'Buka Network Connections. Adapter abu-abu = Disabled.', cp: 'Fase E · Konfigurasi klien', wired: false, rank: 0 },
  released: { cause: 'Alamat DHCP dilepas (release) dan belum diminta lagi', fix: 'ipconfig /renew', symptom: 'Terhubung tapi tidak dapat alamat IP.', hint: 'ipconfig: IPv4 kosong? Minta alamat lagi ke DHCP server.', cp: 'Fase F · DHCP', wired: false, rank: 0 },
  wrongip: { cause: 'IP statis salah subnet', fix: 'IP disesuaikan dengan subnet ruangan / kembali ke DHCP', symptom: 'Tidak bisa ping gateway, internet mati.', hint: 'Bandingkan IP PC dengan subnet router ruangan.', cp: 'Fase E · Pengalamatan IPv4', wired: false, rank: 0 },
  gateway: { cause: 'Default gateway salah', fix: 'gateway diarahkan ke router segmen', symptom: 'Bisa ping perangkat satu ruangan, tapi internet tidak bisa.', hint: 'ipconfig: Default Gateway harus alamat router segmen ini.', cp: 'Fase F · Routing', wired: false, rank: 1 },
  dns: { cause: 'Server DNS salah', fix: 'DNS diarahkan ke DNS yang benar', symptom: 'ping 8.8.8.8 bisa, tapi situs tidak terbuka.', hint: 'nslookup cari.id gagal? Periksa DNS di IPv4 Properties.', cp: 'Fase F · DNS', wired: false, rank: 1 },
  cablebad: { cause: 'Patch cord rusak (pasangan kabel putus)', fix: 'patch cord diganti yang baru', symptom: 'Kabel terpasang tapi lampu link mati.', hint: 'Konektor terpasang tapi LED mati? Tes pakai LAN tester (ambil di lemari alat).', cp: 'Fase E · Alat ukur jaringan', wired: true, rank: 1 },
  port: { cause: 'Port switch shutdown', fix: 'interface di-no shutdown lewat console', symptom: 'Kabel bagus, tapi lampu link tetap mati.', hint: 'Kabel lolos LAN tester tapi link mati = cek port di switch (rak ruang server L1).', cp: 'Fase F · Konfigurasi switch', wired: true, rank: 1 },
  conflict: { cause: 'IP bentrok dengan perangkat lain', fix: 'IP diganti ke alamat yang kosong / DHCP', symptom: 'Muncul peringatan konflik alamat IP, koneksi kacau.', hint: 'arp -a / ping alamat itu: ada perangkat lain memakai IP yang sama.', cp: 'Fase E · Pengalamatan IPv4', wired: false, rank: 2 },
  patch: { cause: 'Patch cord di rak lantai tercabut dari switch', fix: 'patch cord dari port patch panel outlet itu dicolok lagi ke port switch', symptom: 'Kabel di meja terpasang dan lolos tes, tapi lampu link tetap mati.', hint: 'Kabel meja baik tapi link mati: ke rak lantai itu. Cari port patch panel outlet ini (dari label, atau pakai toner kalau labelnya hilang) dan periksa patch cord-nya.', cp: 'Fase E · Sistem pengkabelan terstruktur', wired: true, rank: 1 },
  uplink: { cause: 'Uplink switch lantai ke MDF terputus', fix: 'uplink dipulihkan', symptom: 'Satu lantai tidak bisa akses apa pun, padahal lampu link di PC menyala.', hint: 'Banyak PC satu lantai kena bersamaan = masalah di uplink switch lantai (rak IDF). Lihat LED uplink Gi1/0/49, lalu show interfaces trunk.', cp: 'Fase F · Trunk & uplink antar-switch', wired: true, rank: 2 },
  loop: { cause: 'Loop: ada kabel yang menyambung dua port switch yang sama (broadcast storm)', fix: 'kabel loop dicabut', symptom: 'Jaringan satu lantai lumpuh total, semua lampu switch berkedip cepat.', hint: 'Semua LED switch berkedip + log MAC flapping di console = loop. Cari kabel yang menyambung dua port switch di rak lantai itu dan cabut.', cp: 'Fase F · Loop & STP', wired: true, rank: 2 },
  vlan: { cause: 'Port switch masuk VLAN yang salah', fix: 'switchport access vlan dikembalikan', symptom: 'Lampu link nyala, tapi PC hanya dapat 169.254.x.x.', hint: 'Link ada tapi DHCP tidak sampai = cek VLAN port di switch (show vlan brief).', cp: 'Fase F · VLAN', wired: true, rank: 2 },
};

// ---------------------------------------------------------------- contract templates
export type TplId = 'static' | 'desk' | 'dns' | 'renum' | 'vlan';
interface TplDef { name: string; rank: number; xp: number; sla: number; cp: string; brief: string[] }
export const TEMPLATES: Record<TplId, TplDef> = {
  static: { name: 'Pasang IP Statis', rank: 0, xp: 120, sla: 420, cp: 'Fase E · Pengalamatan IPv4', brief: ['Beberapa PC butuh alamat tetap (mis. dipakai aplikasi absensi). Alamatnya sudah ditentukan di surat kerja.', 'Di PC: Network Connections › Properties › IPv4 › "Use the following IP address". Isi IP, subnet mask, gateway, DNS persis seperti surat kerja.', 'Uji dari PC itu: ping gateway lalu ping/buka situs. Alamat yang sudah dipakai perangkat lain akan bentrok.'] },
  desk: { name: 'Sambungkan Meja Baru', rank: 0, xp: 170, sla: 780, cp: 'Fase E · Sistem pengkabelan terstruktur', brief: ['Meja baru belum tersambung. Alurnya: PC → patch cord → outlet dinding → kabel horizontal → port patch panel di rak lantai → patch cord → port switch.', 'Ambil 2 patch cord per meja, toner + probe, kabel console, dan laptop teknisi di Lemari Alat (Workshop TKJ, L1).', 'Di meja [C]: pasang patch cord PC → outlet. Label outletnya belum ada, jadi pasang toner di outlet itu.', 'Ke rak lantai itu (L1: ruang server; L2/L3: ruang IDF). Nyalakan probe dan sapu port patch panel: bunyi paling keras = port outlet tadi. Klik port itu, lalu klik port switch di surat kerja untuk memasang patch cord.', 'Console ke switch: enable › conf t › interface gi1/0/N › switchport access vlan V › no shutdown › end › write memory.', 'Kembali ke meja: tempel label outlet sesuai nomor patch panel (mis. L2-07), lalu uji ping/browser dari PC itu.'] },
  dns: { name: 'Nama untuk Server Intranet', rank: 1, xp: 180, sla: 540, cp: 'Fase F · DNS', brief: ['Server aplikasi baru sudah dipasang tim aplikasi. Karyawan mau membukanya pakai nama, bukan IP.', 'Buka router segmen itu dari browser PC (http://alamat-gateway, admin tanpa password) › IP › DNS › tambah record A: nama › IP server.', 'Klien harus memakai DNS router supaya nama lokal terbaca. DNS publik seperti 8.8.8.8 tidak mengenal nama internal.', 'Uji dengan membuka namanya di browser dari PC yang disebut di surat kerja.'] },
  renum: { name: 'Pasang Router Baru & DHCP', rank: 1, xp: 260, sla: 900, cp: 'Fase F · DHCP & pengalamatan', brief: ['Router segmen diganti unit baru yang masih setelan pabrik (192.168.88.1/24, DHCP mati). Jaringan pindah ke subnet baru di surat kerja.', 'PC dengan DHCP akan dapat 169.254.x.x. Untuk bisa membuka router pabrik, beri satu PC IP statis sementara di 192.168.88.0/24.', 'Di WebKonfig ganti dulu IP › Addresses ke alamat LAN baru. Koneksimu ke router akan putus: pindahkan PC tadi ke IP statis di subnet baru, buka lagi router di alamat barunya.', 'Lalu atur IP › DHCP Server (pool, gateway, DNS) dan IP › DNS (upstream + Allow Remote Requests).', 'Kembalikan PC tadi ke DHCP, ipconfig /renew, lalu uji dari setiap PC di surat kerja. PC yang memakai IP statis lama juga harus dipindah.'] },
  vlan: { name: 'Pindahkan Meja ke VLAN Kasir', rank: 2, xp: 220, sla: 720, cp: 'Fase F · VLAN', brief: ['Beberapa meja kantor dipakai tim kasir. Mereka harus masuk VLAN 30 (KASIR) yang punya router dan server POS sendiri.', 'Di rak ruang server L1, console ke switch lantainya: conf t › vlan 30 › name KASIR › interface gi1/0/N › switchport access vlan 30.', 'PC baru pindah subnet setelah minta alamat lagi: ipconfig /renew (atau tunggu klien mencoba ulang).', 'Uji dari setiap PC: harus dapat 192.168.30.x dan bisa membuka server POS 192.168.30.10. Simpan konfigurasi switch: write memory.'] },
};

export const RANKS = [{ xp: 0, name: 'Magang' }, { xp: 500, name: 'Teknisi Junior' }, { xp: 1500, name: 'Teknisi' }, { xp: 3000, name: 'Network Engineer' }];
const PRIO = { Tinggi: 240, Sedang: 420, Rendah: 600 } as const;
type Prio = keyof typeof PRIO;
const WHO: Record<string, { who: string[]; prio: Prio[] }> = {
  lab: { who: ['Siswa praktik', 'Guru produktif', 'Asisten lab'], prio: ['Sedang', 'Rendah', 'Sedang'] },
  office: { who: ['Staf keuangan', 'Manajer kantor', 'Staf HRD', 'Admin marketing'], prio: ['Tinggi', 'Tinggi', 'Sedang', 'Sedang'] },
  kasir: { who: ['Kasir', 'Supervisor kasir'], prio: ['Tinggi', 'Tinggi'] },
  guest: { who: ['Tamu hotel', 'Tamu VIP', 'Tamu bisnis'], prio: ['Sedang', 'Tinggi', 'Tinggi'] },
  none: { who: ['Staf'], prio: ['Sedang'] },
};

// ---------------------------------------------------------------- jobs
export interface PcInfo { name: string; label: string; x: number; y: number; z: number; level: number }
type Mode = 'any' | 'dhcp' | 'static' | 'browse' | 'env';
interface Target { pc: PcInfo; mode: Mode; ip?: string; mask?: string; gw?: string; dns?: string; browse?: string; env?: string; ok: boolean; tested: boolean; note: string }
export interface Job {
  id: string; kind: 'ticket' | 'contract' | 'follow'; tpl: TplId | FaultId | 'follow'; title: string; who: string; prio: Prio;
  sla: number; age: number; status: 'open' | 'closed'; targets: Target[]; faults: FaultId[]; order: string[];
  envId: string; sw?: string; vlanName?: string; record?: { name: string; ip: string }; router?: { ip: string; prefix: number; start: string; end: string };
  wrong: number; log: string[]; snap: string[]; hint: boolean; swPort?: Record<string, number>; detail?: string; xp?: number; stars?: number; slaMet?: boolean; collateral?: string[]; reported?: boolean; swTouched?: boolean;
  /** legacy alias for the HUD/waypoint code: the next place to go */
  pc: PcInfo;
}
type Item = 'tester' | 'console' | 'laptop' | 'patch' | 'toner';
const ITEM_NAME: Record<Item, string> = { toner: 'Toner generator + probe', tester: 'LAN tester', console: 'Kabel console USB–RJ45', laptop: 'Laptop teknisi', patch: 'Patch cord Cat6 (1 m)' };

interface Save { v: 1; xp: number; shifts: number; closed: number; slaMet: number; seq: number; contracts: number; stars: number; seen: string[]; mastery: Partial<Record<string, { ok: number; miss: number }>> }
const KEY = 'kotaNusantara.noc.v1';
const fresh = (): Save => ({ v: 1, xp: 0, shifts: 0, closed: 0, slaMet: 0, seq: 0, contracts: 0, stars: 0, seen: [], mastery: {} });

interface Offer { tpl: TplId; seed: number; title: string; lines: string[]; envLabel: string }

export class Noc {
  private s: Save = fresh();
  jobs: Job[] = [];
  mode: 'idle' | 'contract' | 'shift' = 'idle';
  shift = 0; trackedId: string | null = null;
  offers: Offer[] = [];
  inv = { tester: false, console: false, laptop: false, toner: false, patch: 0 };
  /** PC whose wall outlet has the toner generator plugged in */
  toneAt: string | null = null;
  private probing = false;
  private sel: { sw: string; pp?: number; swp?: number } | null = null;
  private audio: AudioContext | null = null;
  private patchStock = 6;
  private noCord = new Set<string>();
  private modal: HTMLElement | null = null;
  private cli: SwitchCli | null = null;
  private pendingReport: Job[] = [];
  private hud: HTMLElement;
  private listeners = new Set<(open: boolean) => void>();
  private hudT = 0; private chkT = 0; private hkT = 0;
  readonly CABINET: PcInfo; readonly RACKP: PcInfo; readonly RACKS: Record<string, PcInfo> = {};
  toast: (s: string, ms?: number) => void = () => {};
  get tickets() { return this.jobs; }
  get active() { return this.mode !== 'idle'; }

  constructor(private pcos: PcOS, private pcs: PcInfo[], readonly rack: { x: number; z: number }, cabinet: { x: number; z: number } = rack, idfs: { id: string; level: number; x: number; y: number; z: number }[] = []) {
    try { const raw = localStorage.getItem(KEY); if (raw) this.s = { ...fresh(), ...JSON.parse(raw) }; } catch { /* private mode */ }
    this.CABINET = { name: 'CABINET', label: 'Lemari Alat · Workshop TKJ', x: cabinet.x, y: 1.0, z: cabinet.z, level: 1 };
    this.RACKP = { name: 'RACK', label: 'Rak MDF · Ruang Server L1', x: rack.x, y: 1.4, z: rack.z, level: 1 };
    this.RACKS.MDF = this.RACKP;
    for (const d of idfs) this.RACKS[d.id] = { name: d.id, label: `Rak IDF · Lantai ${d.level}`, x: d.x, y: d.y, z: d.z, level: d.level };
    this.hud = h('div'); this.hud.id = 'noc-hud'; document.body.append(this.hud);
    const prev = pcos.onEvent;
    pcos.onEvent = e => { prev?.(e); this.onPc(e); };
    for (const p of pcs) adapterOf(p.name);
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* ignore */ } }
  get xp() { return this.s.xp; }
  get stats() { return { ...this.s }; }
  rankIndex() { let i = 0; RANKS.forEach((r, k) => { if (this.s.xp >= r.xp) i = k; }); return i; }
  rank() { return RANKS[this.rankIndex()].name; }
  isModalOpen() { return !!this.modal; }
  onModal(f: (open: boolean) => void) { this.listeners.add(f); }
  setHudVisible(v: boolean) { this.hud.style.display = v ? '' : 'none'; }
  private openJobs() { return this.jobs.filter(j => j.status !== 'closed'); }
  tracked(): Job | null {
    const j = this.jobs.find(x => x.id === this.trackedId && x.status !== 'closed') ?? this.openJobs()[0] ?? null;
    if (j) j.pc = this.nextStop(j);
    return j;
  }
  private wired() { return this.pcs.filter(p => !isWireless(p.name) && isWired(p.name)); }
  private rackOf(swName?: string): PcInfo { const sw = SWITCHES.find(s => s.name === swName); return (sw && this.RACKS[sw.rack]) || this.RACKP; }
  private rackName(swName?: string) { const sw = SWITCHES.find(s => s.name === swName); return !sw || sw.level === 1 ? 'rak MDF ruang server L1' : `rak IDF lantai ${sw.level}`; }
  private pcLabel(name: string) { return this.pcs.find(p => p.name === name)?.label ?? name; }

  // ---------------------------------------------------------------- next stop / guidance
  private needs(j: Job): Item[] {
    const need: Item[] = [];
    const isC = j.kind === 'contract';
    const physical = (isC && (j.tpl === 'desk' || j.tpl === 'vlan')) || j.faults.some(f => f === 'port' || f === 'vlan' || f === 'cablebad');
    if (isC && j.tpl === 'desk') { const want = j.targets.filter(t => this.noCord.has(t.pc.name)).length + j.targets.filter(t => this.unpatched(j, t.pc.name) && !panelOf(t.pc.name)!.pp.hang).length; if (want && this.inv.patch < want) need.push('patch'); if (!this.inv.toner && j.targets.some(t => this.unpatched(j, t.pc.name) && !panelOf(t.pc.name)!.pp.label)) need.push('toner'); }
    else if (j.faults.includes('cablebad') && this.inv.patch < 1) need.push('patch');
    if (((isC && (j.tpl === 'desk' || j.tpl === 'vlan')) || j.faults.some(f => f === 'port' || f === 'vlan')) && !this.inv.console) need.push('console');
    if (((isC && (j.tpl === 'desk' || j.tpl === 'vlan')) || j.faults.some(f => f === 'port' || f === 'vlan')) && !this.inv.laptop) need.push('laptop');
    return physical ? need : [];
  }
  private switchPending(j: Job) {
    if (j.kind !== 'contract') return false;
    if (j.tpl === 'vlan') return !!this.vlanProblem(j);
    if (j.tpl === 'desk') return j.targets.some(t => this.unpatched(j, t.pc.name) || portOf(t.pc.name)?.port.shutdown || envOf(t.pc.name).id !== j.envId);
    return false;
  }
  /** desk job: the PC's panel port is not yet patched to the switch port of the work order */
  private unpatched(j: Job, pc: string) { const q = panelOf(pc); return !!j.swPort && !!q && q.pp.patch !== j.swPort[pc]; }
  private needsTone(j: Job) { return j.targets.find(t => this.unpatched(j, t.pc.name) && !panelOf(t.pc.name)!.pp.label && this.toneAt !== t.pc.name) ?? null; }
  private labelMissing(j: Job) { return j.kind === 'contract' && j.tpl === 'desk' ? j.targets.find(t => wallOk(t.pc.name) === false) ?? null : null; }
  nextStop(j: Job): PcInfo {
    if (j.kind === 'contract' && this.needs(j).length) return this.CABINET;
    if (j.kind === 'contract' && j.tpl === 'desk' && j.targets.some(t => this.noCord.has(t.pc.name))) return j.targets.find(t => this.noCord.has(t.pc.name))!.pc;
    if (j.kind === 'contract' && j.tpl === 'desk' && this.needsTone(j)) return this.needsTone(j)!.pc;
    if (j.kind === 'contract' && this.switchPending(j)) return this.rackOf(j.sw);
    if (this.labelMissing(j)) return this.labelMissing(j)!.pc;
    return (j.targets.find(t => !(t.ok && t.tested)) ?? j.targets[0]).pc;
  }
  nextHint(j: Job): string {
    const n = this.needs(j);
    if (j.kind === 'contract' && n.length) return `Ambil di Lemari Alat: ${n.map(i => ITEM_NAME[i]).join(', ')}`;
    if (j.kind === 'contract' && j.tpl === 'desk' && j.targets.some(t => this.noCord.has(t.pc.name))) return 'Pasang patch cord PC → outlet di meja baru [C]';
    if (j.kind === 'contract' && j.tpl === 'desk' && this.needsTone(j)) return `${this.needsTone(j)!.pc.label}: pasang toner di outlet [C]`;
    if (j.kind === 'contract' && j.tpl === 'desk' && j.targets.some(t => this.unpatched(j, t.pc.name))) return `Di ${this.rackName(j.sw)} [F]: cari port patch panel pakai probe, patch ke port switch`;
    if (j.kind === 'contract' && this.switchPending(j)) return `Konfigurasi switch lewat console di ${this.rackName(j.sw)} [F]`;
    if (this.labelMissing(j)) return `${this.labelMissing(j)!.pc.label}: tempel label outlet sesuai nomor patch panel [C]`;
    if (j.kind === 'contract' && j.tpl === 'renum' && this.routerProblem(j)) return `Konfigurasi router: ${this.routerProblem(j)}`;
    if (j.kind === 'contract' && j.tpl === 'dns' && this.recordProblem(j)) return 'Tambahkan record DNS di router segmen';
    const t = j.targets.find(x => !x.ok);
    if (t) return `${t.pc.label}: ${t.note || 'belum sesuai surat kerja'}`;
    const u = j.targets.find(x => !x.tested);
    if (u) return `Uji dari ${u.pc.label}: ${u.mode === 'browse' ? `buka ${u.browse}` : 'ping / buka situs'}`;
    return 'Selesai';
  }

  // ---------------------------------------------------------------- contract offers
  private ensureOffers() {
    if (this.offers.length) return;
    const rk = this.rankIndex();
    const ids = (Object.keys(TEMPLATES) as TplId[]).filter(t => TEMPLATES[t].rank <= rk);
    const order = shuffle(ids);
    while (order.length < 3) order.push(pick(ids));
    this.offers = order.slice(0, 3).map(tpl => this.preview(tpl, Math.floor(Math.random() * 1e9)));
  }
  private preview(tpl: TplId, seed: number): Offer {
    const r = mulberry(seed);
    const env = this.pickEnv(tpl, r);
    const t = TEMPLATES[tpl];
    const lines: Record<TplId, string> = {
      static: `${env.label}: beberapa PC butuh alamat IP tetap.`,
      desk: `${env.label}: meja baru belum tersambung ke jaringan.`,
      dns: `${env.label}: server aplikasi baru perlu nama domain lokal.`,
      renum: `${env.label}: router diganti unit baru, jaringan pindah subnet.`,
      vlan: 'Kantor: beberapa meja dipindah ke jaringan kasir (VLAN 30).',
    };
    return { tpl, seed, title: t.name, lines: [lines[tpl]], envLabel: env.label };
  }
  private pickEnv(tpl: TplId, r: () => number): Env {
    if (tpl === 'vlan') return ENVS.office;
    if (tpl === 'desk') return r() < 0.5 ? ENVS.lab : ENVS.office;
    return r() < 0.5 ? ENVS.lab : ENVS.office;
  }
  private pcsIn(env: Env, healthyOnly = true) {
    return this.wired().filter(p => envOf(p.name) === env && (!healthyOnly || healthy(adapterOf(p.name))));
  }
  private freeIp(env: Env, r: () => number, lo = 21, hi = 89, avoid: string[] = []) {
    const used = new Set<string>([...env.hosts.map(x => x.ip), ...avoid]);
    for (const a of ADAPTERS.values()) { const l = live(a); if (l.ip) used.add(l.ip); }
    for (let k = 0; k < 200; k++) { const ip = hostIp(env, lo + Math.floor(r() * (hi - lo + 1))); if (!used.has(ip)) return ip; }
    return hostIp(env, lo);
  }
  private newJob(kind: Job['kind'], tpl: Job['tpl'], title: string, who: string, prio: Prio, sla: number, envId: string): Job {
    return { id: `${kind === 'contract' ? 'SPK' : 'TKT'}-${String(++this.s.seq).padStart(4, '0')}`, kind, tpl, title, who, prio, sla, age: 0, status: 'open', targets: [], faults: [], order: [], envId, wrong: 0, log: [], snap: [], hint: this.rankIndex() === 0, pc: this.CABINET };
  }
  private target(pc: PcInfo, mode: Mode, extra: Partial<Target> = {}): Target { return { pc, mode, ok: false, tested: false, note: '', ...extra }; }

  /** Accept a work order (QA can pass a template and a seed). */
  acceptContract(tpl: TplId, seed = Math.floor(Math.random() * 1e9)): Job | null {
    if (this.mode !== 'idle') { this.toast('Selesaikan pekerjaan yang sedang berjalan dulu.'); return null; }
    const r = mulberry(seed);
    const env = this.pickEnv(tpl, r);
    const rk = this.rankIndex();
    const T = TEMPLATES[tpl];
    const j = this.newJob('contract', tpl, T.name, pick(WHO[env.id].who, r), 'Sedang', T.sla, env.id);
    const avail = shuffle(this.pcsIn(env), r);
    if (tpl === 'static') {
      const n = rk === 0 ? 2 : 3;
      const used: string[] = [];
      for (const pc of avail.slice(0, n)) {
        const ip = this.freeIp(env, r, 21, 89, used); used.push(ip);
        j.targets.push(this.target(pc, 'static', { ip, mask: maskStr(env.prefix), gw: env.gateway, dns: env.gateway }));
      }
      j.order = [`Segmen: ${env.label} · router ${env.gateway}/${env.prefix}`, ...j.targets.map(t => `${t.pc.label} → IP ${t.ip} · mask ${t.mask} · gateway ${t.gw} · DNS ${t.dns}`)];
      if (rk >= 1 && r() < 0.5) { const t = pick(j.targets, r); adapterOf(t.pc.name).cable = false; }
    } else if (tpl === 'desk') {
      const n = rk === 0 ? 1 : 2;
      const lv = avail[0]?.level;
      j.swPort = {};
      for (const pc of avail.filter(p => p.level === lv).slice(0, n)) {
        const a = adapterOf(pc.name), q = panelOf(pc.name)!, sw = q.sw;
        // the desk is new: no cord at the desk, outlet not labelled, panel port not patched, its old switch port freed
        const old = q.pp.patch; a.cable = false; this.noCord.add(pc.name);
        q.pp.label = ''; patchCord(sw, q.pp.n, null); q.pp.hang = false; bounce(a);
        if (old) { sw.ports[old - 1].desc = ''; sw.ports[old - 1].shutdown = true; }
        const used = new Set(Object.values(j.swPort));
        const free = sw.ports.filter(p => !p.pc && p.n <= 44 && !sw.loop?.includes(p.n) && !used.has(p.n) && !sw.panel.some(x => x.patch === p.n));
        const port = pick(free.filter(p => p.n > 24).length ? free.filter(p => p.n > 24) : free, r);
        port.shutdown = true; port.desc = ''; port.vlan = rk >= 1 && r() < 0.6 ? 1 : env.vlan;
        j.swPort[pc.name] = port.n;
        j.targets.push(this.target(pc, 'dhcp'));
      }
      j.sw = panelOf(j.targets[0].pc.name)!.sw.name;
      j.order = [...j.targets.map(t => `${t.pc.label}: outlet belum berlabel. Cari port patch panelnya dengan toner, lalu patch ke ${j.sw} ${portName(j.swPort![t.pc.name])}.`), `Port switch harus aktif dan masuk VLAN ${env.vlan} (${env.label}). PC memakai DHCP.`, 'Tempel label outlet sesuai nomor port patch panel (format L2-07).'];
    } else if (tpl === 'dns') {
      const names = ['absensi', 'presensi', 'inventaris', 'helpdesk', 'elearning', 'arsip', 'perpus', 'cuti', 'gaji', 'tiket'];
      const nm = pick(names.filter(x => !env.hosts.some(hh => hh.name === `srv-${x}`)), r) ?? `app${Math.floor(r() * 90 + 10)}`;
      const ip = this.freeIp(env, r, 30, 60);
      env.hosts.push({ ip, name: `srv-${nm}`, mac: `52-54-00-${Math.floor(r() * 90 + 10)}-00-${Math.floor(r() * 90 + 10)}`, ttl: 64, web: 'intranet' });
      const fqdn = `${nm}.${env.suffix}`;
      j.record = { name: fqdn, ip };
      for (const pc of avail.slice(0, 2)) j.targets.push(this.target(pc, 'browse', { browse: fqdn }));
      if (r() < 0.6 && j.targets.length) { const a = adapterOf(j.targets[1 % j.targets.length].pc.name); a.dnsAuto = false; a.dns1 = '8.8.8.8'; a.dns2 = ''; if (!a.dhcp) a.dns1 = '8.8.8.8'; }
      j.order = [`Server srv-${nm} sudah aktif di ${ip} (segmen ${env.label}).`, `Buat nama ${fqdn} → ${ip} di DNS router ${env.gateway}.`, `Pastikan ${j.targets.map(t => t.pc.label).join(' dan ')} bisa membuka http://${fqdn}`];
    } else if (tpl === 'renum') {
      const second = () => 10 + Math.floor(r() * 80);
      let base: string;
      do { const k = r(); base = k < 0.45 ? `10.${second()}.${Math.floor(r() * 100)}.0` : k < 0.8 ? `192.168.${40 + Math.floor(r() * 50)}.0` : `172.${16 + Math.floor(r() * 15)}.${Math.floor(r() * 200)}.0`; } while (Object.values(ENVS).some(e => e.net === base) || base.startsWith('192.168.88.') || base.startsWith('192.168.1.'));
      const prefix = rk >= 2 && r() < 0.4 ? 25 : 24;
      const b = parseIp(base)!;
      const gwOff = r() < 0.75 ? 1 : (prefix === 24 ? 254 : 126);
      const gw = ipStr(b + gwOff);
      const start = ipStr(b + (prefix === 24 ? 100 : 40)), end = ipStr(b + (prefix === 24 ? 199 : 100));
      // the factory-reset router + the server team already moved their boxes
      const offs = env.hosts.map(x => parseIp(x.ip)! - networkOf(parseIp(env.gateway)!, env.prefix));
      setRouterLan(env, '192.168.88.1', 24);
      env.dhcp = null; env.leases.clear(); env.dnsSrv = { allow: false, upstream: [], records: env.dnsSrv.records };
      env.hosts.forEach((x, i) => { if (x.web !== 'router') { let o = offs[i]; if (o === gwOff) o = 2; if (prefix === 25 && o > 120) o = 3 + i; x.ip = ipStr(b + o); } });
      j.router = { ip: gw, prefix, start, end };
      const dh = shuffle(avail.filter(p => adapterOf(p.name).dhcp), r).slice(0, 3);
      for (const pc of dh) j.targets.push(this.target(pc, 'dhcp'));
      for (const p of this.wired()) if (envOf(p.name) === env && !adapterOf(p.name).dhcp && !j.targets.some(t => t.pc.name === p.name)) j.targets.push(this.target(p, 'any', { note: 'masih memakai IP statis subnet lama' }));
      j.order = [`Router baru (setelan pabrik 192.168.88.1/24, admin tanpa password, DHCP mati).`, `LAN baru: ${gw}/${prefix} · DHCP pool ${start} – ${end} · gateway ${gw} · DNS ${gw}`, `DNS router: upstream 8.8.8.8 dan Allow Remote Requests aktif.`, `Uji dari: ${j.targets.map(t => t.pc.label).join(', ')}`];
    } else if (tpl === 'vlan') {
      const lv = r() < 0.5 ? 2 : 3;
      const onFloor = avail.filter(p => p.level === lv);
      const n = rk >= 3 ? 3 : 2;
      for (const pc of (onFloor.length >= n ? onFloor : avail).slice(0, n)) j.targets.push(this.target(pc, 'env', { env: 'kasir' }));
      j.sw = portOf(j.targets[0].pc.name)!.sw.name; j.vlanName = 'KASIR';
      j.order = [`Pindahkan ke VLAN 30 "KASIR" di ${j.sw}: ${j.targets.map(t => `${t.pc.label} (${portName(portOf(t.pc.name)!.port.n)})`).join(', ')}`, 'PC harus dapat 192.168.30.x dari router kasir dan bisa membuka server POS 192.168.30.10.', 'Simpan konfigurasi switch setelah selesai.'];
    }
    if (!j.targets.length) { this.toast('Tidak ada PC yang cocok untuk pekerjaan ini sekarang.'); return null; }
    this.patchStock = 6;
    j.snap = this.snapshot();
    this.jobs = [j]; this.mode = 'contract'; this.trackedId = j.id;
    this.offers = [];
    this.save();
    if (!this.s.seen.includes(tpl)) { this.s.seen.push(tpl); this.save(); this.openBrief(j); }
    else this.openOrder(j);
    return j;
  }

  // ---------------------------------------------------------------- shift & ticket generation
  startShift(rand = Math.random, force?: FaultId[]) {
    if (this.mode === 'shift') { this.openBoard(); return; }
    if (this.mode !== 'idle') { this.toast('Selesaikan surat kerja yang sedang berjalan dulu.'); return; }
    const rk = this.rankIndex();
    const n = force?.length ?? Math.min(5, 3 + rk);
    this.shift = ++this.s.shifts; this.mode = 'shift'; this.jobs = [];
    const used = new Set<string>(), busySw = new Set<string>();
    for (let i = 0; i < n; i++) {
      const wide = force && (force[i] === 'uplink' || force[i] === 'loop');
      const pool = this.pcs.filter(p => !used.has(p.name) && (rk > 0 || p.level <= 3) && !(force && p.level > 3) && envOf(p.name).id !== 'none' && healthy(adapterOf(p.name))
        && !(wide && (busySw.has(portOf(p.name)?.sw.name ?? '-') || !portOf(p.name) || (force![i] === 'uplink' && !portOf(p.name)!.sw.uplink))));
      if (!pool.length) break;
      const pc = pick(pool, rand); used.add(pc.name);
      const env = envOf(pc.name);
      const swn = portOf(pc.name)?.sw.name ?? '';
      const f = force ? force[i] : this.pickFault(pc.name, rk, rand, undefined, busySw.has(swn));
      if (swn) busySw.add(swn);
      const faults: FaultId[] = [f];
      if (!force && rk >= 2 && rand() < 0.35) { const g = this.pickFault(pc.name, rk, rand, f); if (g !== f && g !== 'disabled' && f !== 'disabled' && FAULTS[g].wired === FAULTS[f].wired) faults.push(g); }
      const wi = Math.floor(rand() * WHO[env.id].who.length);
      const prio = WHO[env.id].prio[wi];
      const t = this.newJob('ticket', f, FAULTS[f].symptom, WHO[env.id].who[wi], prio, PRIO[prio], env.id);
      t.age = -i * 25; t.faults = faults; t.targets = [this.target(pc, 'any')];
      if (f === 'uplink' || f === 'loop') {
        const sw = portOf(pc.name)!.sw;
        const mate = shuffle(this.pcs.filter(p => !used.has(p.name) && portOf(p.name)?.sw === sw && healthy(adapterOf(p.name))), rand)[0];
        if (mate) { used.add(mate.name); t.targets.push(this.target(mate, 'any')); }
        t.order = [`${t.who} · Lantai ${sw.level}: ${t.targets.map(x => x.pc.label).join(', ')} (dan PC lain di lantai itu)`, `Keluhan: “${FAULTS[f].symptom}”`];
      } else t.order = [`${t.who} · ${pc.label}${isWired(pc.name) ? ` · outlet ${outletOf(pc.name)}` : ''}`, `Keluhan: “${FAULTS[f].symptom}”`];
      this.inject(t);
      this.jobs.push(t);
    }
    this.patchStock = 6;
    const snap = this.snapshot(); for (const j of this.jobs) j.snap = snap;
    this.trackedId = this.jobs[0]?.id ?? null;
    this.save();
    this.openBoard(`Shift ${this.shift} dimulai. ${this.jobs.length} tiket masuk ke antrean NOC.`);
  }
  private pickFault(pc: string, rk: number, rand: () => number, not?: FaultId, swBusy = false): FaultId {
    const env = envOf(pc);
    const sw = portOf(pc)?.sw;
    const ids = (Object.keys(FAULTS) as FaultId[]).filter(id => FAULTS[id].rank <= rk && id !== not && !(FAULTS[id].wired && isWireless(pc)) && !(id === 'released' && !adapterOf(pc).dhcp) && !(id === 'conflict' && env.hosts.length < 2)
      && !((id === 'uplink' || id === 'loop') && (swBusy || !sw || not !== undefined)) && !(id === 'uplink' && !sw?.uplink) && !(id === 'patch' && !isWired(pc)));
    const w = ids.map(id => { const m = this.s.mastery[id] ?? { ok: 0, miss: 0 }; return Math.max(0.3, 1 + m.miss * 1.5 - Math.min(m.ok, 4) * 0.2); });
    let r = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }
  /** Break the PC so the fault really exists in the simulation. */
  private inject(t: Job) {
    const name = t.targets[0].pc.name;
    const a = adapterOf(name), env = envOf(name), p = portOf(name);
    const mask = maskStr(env.prefix);
    const staticGood = () => { a.dhcp = false; a.ip = this.freeIp(env, Math.random, 150, 190); a.mask = mask; a.gw = env.gateway; a.dns1 = env.gateway; a.dns2 = ''; a.dnsAuto = false; a.lease = undefined; };
    for (const f of t.faults) {
      if (f === 'cable') { a.cable = false; bounce(a); }
      else if (f === 'cablebad') { a.broken = true; bounce(a); }
      else if (f === 'port' && p) p.port.shutdown = true;
      else if (f === 'vlan' && p) { p.port.vlan = pick([99, 40, 1]); if (!p.sw.vlans.has(40) && p.port.vlan === 40) p.sw.vlans.set(40, 'CCTV'); if (p.port.vlan === 99) p.sw.vlans.delete(99); }
      else if (f === 'disabled') a.enabled = false;
      else if (f === 'released') { a.dhcp = true; a.lease = { ip: '', t: Date.now(), prefix: 0, gw: '', dns: [], env: env.id, server: '' }; }
      else if (f === 'wrongip') { a.dhcp = false; a.ip = `192.168.1.${20 + Math.floor(Math.random() * 200)}`; a.mask = '255.255.255.0'; a.gw = '192.168.1.1'; a.dns1 = '192.168.1.1'; a.dns2 = ''; a.dnsAuto = false; }
      else if (f === 'gateway') { staticGood(); a.gw = hostIp(env, 254) === env.gateway ? hostIp(env, 253) : hostIp(env, 254); }
      else if (f === 'dns') { a.dnsAuto = false; a.dns1 = '10.10.10.53'; a.dns2 = ''; }
      else if (f === 'conflict') { staticGood(); a.ip = pick(env.hosts.filter(x => x.web !== 'router')).ip; }
      else if (f === 'patch') { const q = panelOf(name)!; patchCord(q.sw, q.pp.n, null); if (Math.random() < 0.5) q.pp.label = ''; }
      else if (f === 'uplink' && p?.sw.uplink) {
        const sw = p.sw, v = pick(['fiber', 'shut', 'trunk'] as const);
        if (v === 'fiber') { sw.uplink!.cable = false; t.detail = 'Konektor LC patch fiber uplink di rak IDF tidak terkunci → dipasang ulang sampai "klik"'; }
        else if (v === 'shut') { sw.upPort.shutdown = true; t.detail = 'Port uplink Gi1/0/49 di-shutdown → no shutdown'; }
        else { sw.uplink!.allowed = [...sw.vlans.keys()].filter(x => x !== p.port.vlan).sort((x, y) => x - y); t.detail = `VLAN ${p.port.vlan} tidak diizinkan lewat trunk uplink Gi1/0/49 → switchport trunk allowed vlan add ${p.port.vlan}`; }
        sw.dirty = false;
      }
      else if (f === 'loop' && p) {
        const sw = p.sw;
        const free = sw.ports.filter(x => !x.pc && x.n <= 44 && !sw.panel.some(q => q.patch === x.n));
        const k = Math.floor(Math.random() * Math.max(1, free.length - 1));
        const [x1, x2] = [free[k], free[k + 1] ?? free[0]];
        for (const x of [x1, x2]) { x.shutdown = false; x.vlan = p.port.vlan; }
        sw.loop = [x1.n, x2.n]; t.detail = `Kabel patch menyambung ${portName(x1.n)} ke ${portName(x2.n)} di switch yang sama → kabel dicabut`;
      }
    }
    a.arp.clear();
  }
  private snapshot() { return this.pcs.filter(p => healthy(adapterOf(p.name))).map(p => p.name); }

  // ---------------------------------------------------------------- checks
  private routerProblem(j: Job): string {
    const env = ENVS[j.envId as keyof typeof ENVS], R = j.router!;
    if (env.gateway !== R.ip || env.prefix !== R.prefix) return `alamat LAN harus ${R.ip}/${R.prefix}`;
    if (!env.dhcp) return 'DHCP server belum aktif';
    if (poolProblem(env)) return `pool DHCP: ${poolProblem(env)}`;
    if (env.dhcp.start !== R.start || env.dhcp.end !== R.end) return `pool harus ${R.start} – ${R.end}`;
    if (env.dhcp.gw !== R.ip) return 'gateway DHCP harus alamat router';
    if (env.dhcp.dns[0] !== R.ip) return 'DNS DHCP harus alamat router';
    if (!env.dnsSrv.allow || !env.dnsSrv.upstream.some(u => PUBLIC_DNS.includes(u))) return 'DNS router: upstream & Allow Remote Requests';
    return '';
  }
  private recordProblem(j: Job) {
    const env = ENVS[j.envId as keyof typeof ENVS];
    const rec = env.dnsSrv.records.find(x => x.name === j.record!.name || `${x.name}.${env.suffix}` === j.record!.name);
    return !rec ? 'record belum ada' : rec.ip !== j.record!.ip ? 'record menunjuk IP yang salah' : '';
  }
  private vlanProblem(j: Job): string {
    const sw = SWITCHES.find(s => s.name === j.sw)!;
    if (!sw.vlans.has(30)) return 'VLAN 30 belum dibuat';
    if (sw.vlans.get(30) !== 'KASIR') return 'nama VLAN 30 harus KASIR';
    if (sw.uplink && !uplinkCarries(sw, 30)) return 'trunk uplink Gi1/0/49 belum membawa VLAN 30';
    for (const t of j.targets) { const p = portOf(t.pc.name)!.port; if (p.vlan !== 30) return `${portName(p.n)} belum di VLAN 30`; if (p.shutdown) return `${portName(p.n)} shutdown`; }
    return '';
  }
  private targetOk(j: Job, t: Target): boolean {
    const a = adapterOf(t.pc.name), env = envOf(t.pc.name);
    const good = healthy(a, env);
    const l = live(a, env);
    t.note = '';
    if (j.kind !== 'contract') { if (!good) t.note = 'belum normal'; return good; }
    if (j.tpl === 'desk' && this.noCord.has(t.pc.name)) { t.note = 'belum ada patch cord di meja'; return false; }
    if (j.tpl === 'desk' && this.unpatched(j, t.pc.name)) { const q = panelOf(t.pc.name)!; t.note = q.pp.patch ? `patch panel tersambung ke ${portName(q.pp.patch)}, surat kerja minta ${portName(j.swPort![t.pc.name])}` : 'outlet belum di-patch ke switch'; return false; }
    if (j.tpl === 'desk' && wallOk(t.pc.name) === false) { t.note = 'label outlet belum ada / belum sesuai patch panel'; return false; }
    if (t.mode === 'static') {
      const ok = !a.dhcp && a.ip === t.ip && a.mask === t.mask && a.gw === t.gw && l.dns[0] === t.dns;
      if (!ok) t.note = a.dhcp ? 'masih DHCP' : a.ip !== t.ip ? `IP harus ${t.ip}` : a.mask !== t.mask ? `mask harus ${t.mask}` : a.gw !== t.gw ? `gateway harus ${t.gw}` : `DNS harus ${t.dns}`;
      else if (!good) t.note = 'konfigurasi benar tapi belum terhubung';
      return ok && good;
    }
    if (t.mode === 'dhcp') {
      if (!a.dhcp) { t.note = 'harus memakai DHCP'; return false; }
      if (j.tpl === 'renum') { const R = j.router!; const n = parseIp(l.ip); if (!l.ok || n === null || n < parseIp(R.start)! || n > parseIp(R.end)!) { t.note = l.apipa ? 'dapat 169.254.x.x (APIPA)' : 'belum dapat IP dari pool baru'; return false; } }
      if (env.id !== j.envId) { t.note = 'port belum di VLAN yang benar'; return false; }
      if (!good) t.note = l.apipa ? 'dapat 169.254.x.x (APIPA)' : !l.ok ? 'belum ada link / IP' : 'belum terhubung penuh';
      return good;
    }
    if (t.mode === 'env') {
      if (env.id !== t.env) { t.note = env.id === 'none' ? 'VLAN port belum aktif' : `masih di ${env.label}`; return false; }
      if (!good) t.note = l.ok && !l.apipa && envOf(t.pc.name).id === 'kasir' ? 'perlu minta IP baru (ipconfig /renew)' : 'belum dapat IP 192.168.30.x';
      return good;
    }
    if (t.mode === 'browse') {
      if (this.recordProblem(j)) { t.note = 'nama belum terdaftar di DNS'; return good && false; }
      if (!good) { t.note = 'PC belum terhubung'; return false; }
      return true;
    }
    if (!good) t.note = t.note || 'belum terhubung';
    return good;
  }
  private globalProblem(j: Job) {
    if (j.kind !== 'contract') return '';
    if (j.tpl === 'renum') return this.routerProblem(j);
    if (j.tpl === 'dns') return this.recordProblem(j);
    if (j.tpl === 'vlan') return this.vlanProblem(j);
    return '';
  }

  // ---------------------------------------------------------------- events from the PCs, console & hands
  private logAll(s: string, pc?: string) { for (const j of this.openJobs()) { if (pc && j.kind !== 'contract' && !j.targets.some(t => t.pc.name === pc)) continue; if (j.log[j.log.length - 1] !== s) j.log.push(s); if (j.log.length > 60) j.log.shift(); } }
  private onPc(e: PcEvent) {
    const lbl = this.pcLabel(e.pc);
    if (e.type === 'ipset') this.logAll(`${lbl}: IPv4 ${e.detail.dhcp ? 'diatur ke DHCP' : `statis ${e.detail.ip}/${e.detail.prefix} gw ${e.detail.gw || '-'} dns ${(e.detail.dns ?? []).join(', ') || '-'}`}`, e.pc);
    if (e.type === 'cmd' && /^(ipconfig|ping|nslookup|tracert|arp)/i.test(e.detail?.line ?? '')) this.logAll(`${lbl}: ${String(e.detail.line).slice(0, 48)}`, e.pc);
    if (e.type === 'cfg') {
      const d = e.detail, r = routerOf(ENVS[d.env as keyof typeof ENVS])?.name ?? 'router';
      this.logAll(d.kind === 'lan' ? `${r}: alamat LAN → ${d.ip}/${d.prefix}` : d.kind === 'dhcp' ? (d.on ? `${r}: DHCP pool ${d.start} – ${d.end}, gw ${d.gw}, dns ${d.dns.join(', ')}` : `${r}: DHCP server dimatikan`) : d.kind === 'dns' ? `${r}: DNS upstream ${d.upstream.join(', ') || '-'} · remote ${d.allow ? 'ya' : 'tidak'}` : d.kind === 'dnsrec' ? `${r}: record ${d.name} → ${d.ip}` : `${r}: record ${d.name} dihapus`);
    }
    if (e.type === 'ping' && e.detail?.ok && e.detail?.target !== '127.0.0.1') this.logAll(`${lbl}: ping ${e.detail.name || e.detail.target} berhasil`, e.pc);
    if (e.type === 'browse') this.logAll(`${lbl}: buka ${String(e.detail.url).replace(/^https?:\/\//, '').replace(/\/$/, '')}`, e.pc);
    const test = (e.type === 'ping' && e.detail?.ok && e.detail?.target !== '127.0.0.1') || e.type === 'browse';
    if (!test) return;
    for (const j of this.openJobs()) for (const t of j.targets) {
      if (t.pc.name !== e.pc) continue;
      if (t.mode === 'browse') { const host = (() => { try { return new URL(e.detail?.url ?? '').hostname; } catch { return ''; } })(); const short = t.browse!.split('.')[0]; if (e.type !== 'browse' || (host !== t.browse && host !== short)) continue; }
      if (this.targetOk(j, t)) { t.ok = true; t.tested = true; }
    }
    this.check(true);
  }

  // ---------------------------------------------------------------- physical work
  hintAt(nearPc: string | null, nearRack: string | null): string | null {
    if (nearPc && !isWireless(nearPc)) return '[C] Cek fisik kabel & outlet';
    if (nearRack && nearRack !== 'MDF') return `[F] ${this.RACKS[nearRack]?.label ?? 'Rak IDF'} (patch panel · switch)`;
    return null;
  }
  /** C key: physical inspection at a PC, or a rack. Opens a panel; returns null (no toast). */
  physical(nearPc: string | null, nearRack: string | null | boolean): string | null {
    if (nearPc) { this.openPhysical(nearPc); return null; }
    if (nearRack) { this.openRack(typeof nearRack === 'string' ? nearRack : 'MDF'); return null; }
    return null;
  }
  /** F at an anchor this board owns. */
  interactAnchor(name: string | null): boolean {
    if (name === 'ANCHOR_WS_TOOLCAB_01') { this.openCabinet(); return true; }
    if (name === 'ANCHOR_SRV_NETRACK_01') { this.openRack('MDF'); return true; }
    if (name === 'ANCHOR_IT_NOC_01') { this.openBoard(); return true; }
    return false;
  }
  anchorHint(name: string | null): string | null {
    if (name === 'ANCHOR_WS_TOOLCAB_01') return '[F] Lemari Alat (ambil/kembalikan alat)';
    if (name === 'ANCHOR_SRV_NETRACK_01') return '[F] Rak MDF (patch panel · switch · console)';
    if (name === 'ANCHOR_IT_NOC_01') return '[F] Papan kerja NOC';
    return null;
  }

  openCabinet() {
    const box = h('div', 'noc-box');
    box.append(h('h2', '', 'Lemari Alat · Workshop TKJ'));
    box.append(h('p', 'how', 'Ambil alat yang dibutuhkan pekerjaan. Patch cord habis pakai (diganti stoknya tiap pekerjaan baru).'));
    const list = h('div', 'inv');
    const row = (it: Item, have: boolean | number, take: () => void, put: () => void, extra = '') => {
      const r = h('div', 'inv-row', `<span><b>${ITEM_NAME[it]}</b> ${extra}</span>`);
      r.append(btn(it === 'patch' ? 'Ambil 1' : have ? 'Kembalikan' : 'Ambil', () => { if (it !== 'patch' && have) put(); else take(); this.openCabinet(); }, 'btn', `take-${it}`));
      list.append(r);
    };
    row('toner', this.inv.toner, () => { this.inv.toner = true; }, () => { this.inv.toner = false; if (this.toneAt) { this.toast('Toner generator ikut diambil dari outlet.'); this.toneAt = null; } }, this.inv.toner ? '· dibawa' : '');
    row('tester', this.inv.tester, () => { this.inv.tester = true; }, () => { this.inv.tester = false; }, this.inv.tester ? '· dibawa' : '');
    row('console', this.inv.console, () => { this.inv.console = true; }, () => { this.inv.console = false; }, this.inv.console ? '· dibawa' : '');
    row('laptop', this.inv.laptop, () => { this.inv.laptop = true; }, () => { this.inv.laptop = false; }, this.inv.laptop ? '· dibawa' : '');
    row('patch', this.inv.patch, () => { if (this.patchStock > 0) { this.patchStock--; this.inv.patch++; } else this.toast('Stok patch cord habis.'); }, () => {}, `· dibawa ${this.inv.patch} · stok ${this.patchStock}`);
    box.append(list);
    const j = this.tracked();
    if (j) { const n = this.needs(j); box.append(h('p', n.length ? 'msg warn' : 'msg', n.length ? `Untuk ${j.id} masih perlu: ${n.map(i => ITEM_NAME[i]).join(', ')}` : `Alat untuk ${j.id} sudah lengkap.`)); }
    const rw = h('div', 'row'); rw.append(btn('Tutup [Esc]', () => this.closeModal())); box.append(rw);
    this.show(box);
  }

  openPhysical(pc: string) {
    const a = adapterOf(pc), p = portOf(pc);
    const box = h('div', 'noc-box');
    box.append(h('h2', '', `Cek fisik · ${esc(this.pcLabel(pc))}`));
    if (isWireless(pc)) { box.append(h('p', '', 'Laptop tamu memakai Wi-Fi. Tidak ada kabel di sini; periksa dari sisi sistem operasi (ipconfig, Network Connections).')); const rw = h('div', 'row'); rw.append(btn('Tutup [Esc]', () => this.closeModal())); box.append(rw); this.show(box); return; }
    const cord = !this.noCord.has(pc);
    const led = linkUp(a);
    const pic = h('div', 'phys');
    pic.innerHTML = `<div class="nic"><div class="jack ${cord ? (a.cable ? 'in' : 'loose') : 'empty'}"><i class="led l1 ${led ? 'on' : ''}"></i><i class="led l2 ${led && a.enabled ? 'blink' : ''}"></i></div><small>NIC belakang PC</small></div>
      <div class="cord ${cord ? '' : 'none'}"></div>
      <div class="outlet"><div class="jack in"></div><small>Outlet ${outletOf(pc)}</small></div>`;
    box.append(pic);
    const state = !cord ? 'Belum ada patch cord dari outlet ke PC.' : !a.cable ? 'Konektor RJ45 di PC tidak terkunci (keluar setengah).' : 'Konektor terpasang dan terkunci.';
    const lbl = panelOf(pc)?.pp.label ?? '';
    box.append(h('p', '', `${state}<br>LED link: <b>${led ? 'hijau menyala' : 'mati'}</b> · Label outlet: ${lbl ? `<b>${esc(lbl)}</b>` : '<i>tidak ada (belum dipasang / pudar)</i>'}${this.toneAt === pc ? '<br>🔊 Toner generator terpasang di outlet ini (nada berjalan di kabel horizontal ke patch panel).' : ''}`));
    void p;
    const out = h('div', 'tester-out');
    const acts = h('div', 'row left');
    const job = this.openJobs().find(j => j.targets.some(t => t.pc.name === pc));
    if (!cord) acts.append(btn('Pasang patch cord', () => {
      if (this.inv.patch < 1) { out.innerHTML = '<p class="msg warn">Kamu tidak membawa patch cord. Ambil di Lemari Alat (Workshop TKJ).</p>'; return; }
      this.inv.patch--; this.noCord.delete(pc); a.cable = true; a.broken = false; bounce(a);
      this.logAll(`${this.pcLabel(pc)}: patch cord dipasang outlet ${outletOf(pc)} → PC`, pc); this.openPhysical(pc);
    }, 'btn pri', 'phys-install'));
    if (cord) acts.append(btn('Cabut & colok ulang konektor', () => {
      const was = a.cable; a.cable = true; bounce(a);
      this.logAll(`${this.pcLabel(pc)}: konektor dicolok ulang${was ? '' : ' (tadi longgar)'}`, pc);
      this.openPhysical(pc); this.toast(was ? 'Konektor dicabut dan dipasang lagi. Klik terkunci.' : 'Ketemu: konektor longgar. Sekarang terkunci, "klik".', 3200);
    }, 'btn', 'phys-reseat'));
    if (cord) acts.append(btn('Tes kabel (LAN tester)', () => {
      if (!this.inv.tester) { out.innerHTML = '<p class="msg warn">Kamu tidak membawa LAN tester. Ambil di Lemari Alat (Workshop TKJ).</p>'; return; }
      const bad = a.broken ? [3, 6] : [];
      const leds = (side: string) => [1, 2, 3, 4, 5, 6, 7, 8].map(n => `<i class="tl ${bad.includes(n) ? '' : 'on'}" style="animation-delay:${n * 0.18}s">${n}</i>`).join('');
      out.innerHTML = `<div class="tester"><div><small>Unit utama</small>${leds('m')}</div><div><small>Unit remote</small>${leds('r')}</div></div><p>${a.broken ? 'Lampu 3 dan 6 tidak menyala: pasangan hijau putus. Patch cord rusak, ganti yang baru.' : 'Lampu 1–8 menyala berurutan di kedua unit: kabel baik (straight T568B).'}</p>`;
      this.logAll(`${this.pcLabel(pc)}: tes LAN tester → ${a.broken ? 'pin 3 & 6 putus' : 'kabel baik'}`, pc);
    }, 'btn', 'phys-test'));
    if (cord) acts.append(btn('Ganti patch cord', () => {
      if (this.inv.patch < 1) { out.innerHTML = '<p class="msg warn">Kamu tidak membawa patch cord cadangan. Ambil di Lemari Alat.</p>'; return; }
      const wasted = !a.broken;
      this.inv.patch--; a.broken = false; a.cable = true; bounce(a);
      if (wasted && job) job.wrong++;
      this.logAll(`${this.pcLabel(pc)}: patch cord diganti${wasted ? ' (kabel lama sebenarnya baik)' : ''}`, pc);
      this.openPhysical(pc); this.toast(wasted ? 'Patch cord diganti, padahal yang lama baik. Lain kali tes dulu.' : 'Patch cord baru terpasang. LED link menyala.', 3500);
    }, 'btn', 'phys-replace'));
    acts.append(btn(this.toneAt === pc ? 'Lepas toner dari outlet' : 'Pasang toner di outlet', () => {
      if (this.toneAt === pc) { this.toneAt = null; this.logAll(`${this.pcLabel(pc)}: toner dilepas dari outlet`, pc); this.openPhysical(pc); return; }
      if (!this.inv.toner) { out.innerHTML = '<p class="msg warn">Kamu tidak membawa toner + probe. Ambil di Lemari Alat (Workshop TKJ).</p>'; return; }
      const moved = this.toneAt && this.toneAt !== pc; this.toneAt = pc;
      this.logAll(`${this.pcLabel(pc)}: toner dipasang di outlet${lbl ? ` ${lbl}` : ' (tanpa label)'}`, pc);
      this.openPhysical(pc); this.toast(`${moved ? 'Toner dipindah ke outlet ini. ' : ''}Toner menyala. Sekarang bawa probe ke rak lantai ini dan sapu port patch panel.`, 4200);
    }, 'btn', 'phys-tone'));
    const lab = h('div', 'row left');
    const inp = h('input', 'lbl-in') as HTMLInputElement; inp.name = 'phys-label-in'; inp.placeholder = `L${panelOf(pc)?.sw.level ?? 1}-07`; inp.maxLength = 6; inp.value = lbl;
    inp.addEventListener('keydown', e => e.stopPropagation());
    lab.append(h('span', '', 'Label outlet:'), inp, btn('Tempel label', () => {
      const v = inp.value.trim().toUpperCase();
      if (!/^L\d-\d{2}$/.test(v)) { out.innerHTML = '<p class="msg warn">Format label: L&lt;lantai&gt;-&lt;nomor port patch panel 2 digit&gt;, mis. L2-07.</p>'; return; }
      const q = panelOf(pc); if (!q) return;
      q.pp.label = v; this.logAll(`${this.pcLabel(pc)}: label outlet ditempel "${v}"`, pc); this.openPhysical(pc);
    }, 'btn', 'phys-label'));
    box.append(acts, lab, out);
    const rw = h('div', 'row'); rw.append(btn('Tutup [Esc]', () => this.closeModal())); box.append(rw);
    this.show(box);
  }

  // ---------------------------------------------------------------- racks: patch panel, probe, uplink, console
  /** Toner probe reading at a panel port: 1 = loud (the toned run), crosstalk on neighbours, weaker when the
   *  run is patched to a live switch port (the port loads the tone, as in real life). */
  toneAt_(sw: Switch, n: number) {
    if (!this.toneAt || !this.inv.toner) return 0;
    const q = panelOf(this.toneAt); if (!q || q.sw !== sw) return 0;
    const d = Math.abs(q.pp.n - n);
    let v = d === 0 ? 1 : d === 1 ? 0.22 : d === 2 ? 0.07 : 0;
    const pp = sw.panel[n - 1];
    if (d === 0 && pp.patch && !sw.ports[pp.patch - 1].shutdown) v *= 0.55;
    return v;
  }
  private beep(v: number) {
    try {
      if (!v) return;
      this.audio ??= new AudioContext();
      const o = this.audio.createOscillator(), g = this.audio.createGain(), t = this.audio.currentTime;
      o.type = 'square'; o.frequency.setValueAtTime(980, t); o.frequency.setValueAtTime(1180, t + 0.12); o.frequency.setValueAtTime(980, t + 0.24);
      g.gain.setValueAtTime(0.18 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(g).connect(this.audio.destination); o.start(t); o.stop(t + 0.37);
    } catch { /* no audio */ }
  }
  private probeText(v: number) { return v >= 0.5 ? `🔊🔊🔊 Nada keras (${Math.round(v * 100)}%): ini kabel outlet yang di-toner` : v >= 0.15 ? `🔉 Samar (${Math.round(v * 100)}%): induksi dari kabel sebelah` : v > 0 ? `🔈 Sangat samar (${Math.round(v * 100)}%)` : '… sunyi'; }

  openRack(id = 'MDF') {
    const R = this.RACKS[id] ?? this.RACKP;
    const sws = SWITCHES.filter(s => s.rack === id);
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', R.label));
    box.append(h('p', 'how', 'Atas: patch panel (nomor = nomor outlet di meja). Bawah: port switch. LED hijau = connected, kuning = inactive (VLAN tidak ada), abu = tidak ada link, gelap = shutdown, oranye berkedip = badai broadcast. Klik port patch panel lalu klik port switch untuk memasang patch cord.'));
    const tone = h('div', 'tone', this.probing ? (this.inv.toner ? 'Probe menyala. Sapu (arahkan kursor / klik) port patch panel.' : 'Kamu tidak membawa probe.') : '');
    for (const sw of sws) {
      const card = h('div', 'swcard');
      const storm = stormOn(sw);
      const upSt = !sw.uplink ? '' : sw.upPort.shutdown ? 'off' : !sw.uplink.cable ? 'nolink' : 'up';
      card.append(h('div', 'swhead', `<b>${sw.name}</b> <small>C2960X-48 · Lantai ${sw.level} · ${sw.ip}${sw.uplink ? ' · uplink fiber ke MDF' : ' · inti (MDF): uplink fiber dari IDF L2 & L3 di modul SFP'}</small>`));
      card.append(h('div', 'pp-title', `Patch panel PP-L${sw.level} · Cat6 48 port`));
      const pp = h('div', 'ports pp');
      for (const q of sw.panel) {
        const isSel = this.sel?.sw === sw.name && this.sel.pp === q.n;
        const b = btn(String(q.n), () => {
          if (this.probing) { const v = this.toneAt_(sw, q.n); tone.textContent = `PP-${q.n}: ${this.probeText(v)}`; this.beep(v); this.logProbe(sw, q.n, v); }
          this.sel = { sw: sw.name, pp: q.n }; if (!this.probing) this.openRack(id); else this.renderSel(sw, info, acts, id);
        }, `ppb ${q.patch ? 'used' : q.hang ? 'hang' : ''} ${isSel ? 'sel' : ''}`, `pp-${sw.name}-${q.n}`);
        b.title = `PP-${q.n}${q.patch ? ` → ${portName(q.patch)}` : q.hang ? ' · patch cord tergantung' : ' · kosong'}`;
        b.addEventListener('mouseenter', () => { if (!this.probing) return; const v = this.toneAt_(sw, q.n); tone.textContent = `PP-${q.n}: ${this.probeText(v)}`; this.beep(v); });
        pp.append(b);
      }
      card.append(pp);
      card.append(h('div', 'pp-title', `Switch ${sw.name}`));
      const ports = h('div', 'ports');
      for (const p of sw.ports) {
        const a = p.pc ? ADAPTERS.get(p.pc) : undefined;
        const inLoop = !!sw.loop?.includes(p.n);
        const st = p.shutdown ? 'off' : storm ? 'storm' : inLoop ? 'up' : !a || !linkUp(a) ? 'nolink' : !sw.vlans.has(p.vlan) ? 'inact' : 'up';
        const isSel = this.sel?.sw === sw.name && this.sel.swp === p.n;
        const b = btn(String(p.n), () => this.clickSwitchPort(sw, p.n, id), `pl ${st} ${inLoop ? 'loopc' : ''} ${isSel ? 'sel' : ''}`, `swp-${sw.name}-${p.n}`);
        b.title = `${portName(p.n)} ${p.desc}`;
        ports.append(b);
      }
      card.append(ports);
      if (sw.uplink) {
        const up = h('div', 'uplink', `<i class="pl ${upSt}">49</i> <b>Uplink Gi1/0/49</b> (SFP 1000BASE-LX, fiber ke MDF) · ${sw.uplink.cable ? 'konektor LC terkunci' : '<b>konektor LC fiber tidak terkunci</b>'} · LED ${upSt === 'up' ? 'hijau' : 'mati'}`);
        up.append(btn('Cabut & pasang ulang fiber', () => {
          const was = sw.uplink!.cable; sw.uplink!.cable = true;
          this.logAll(`${sw.name}: patch fiber uplink dipasang ulang${was ? '' : ' (tadi longgar)'}`); this.check(false);
          this.toast(was ? 'Fiber dicabut dan dipasang lagi. Konektor LC sudah terkunci dari tadi.' : 'Ketemu: konektor LC fiber longgar. Sekarang terkunci, LED uplink hijau.', 3500); this.openRack(id);
        }, 'btn', `uplink-reseat-${sw.name}`));
        card.append(up);
      }
      const info = h('div', 'ppinfo'), acts = h('div', 'row left');
      if (this.sel?.sw === sw.name) this.renderSel(sw, info, acts, id);
      card.append(info, acts);
      const rw = h('div', 'row left');
      rw.append(btn(this.probing ? 'Matikan probe' : 'Nyalakan probe toner', () => { if (!this.inv.toner && !this.probing) { this.toast('Kamu tidak membawa toner + probe. Ambil di Lemari Alat (Workshop TKJ).', 3500); return; } this.probing = !this.probing; this.openRack(id); }, 'btn', `probe-${sw.name}`));
      rw.append(btn('Colok console & buka terminal', () => this.openConsole(sw, id), 'btn', `console-${sw.name}`));
      card.append(rw);
      box.append(card);
    }
    box.append(tone);
    const rw = h('div', 'row'); rw.append(btn('Tutup [Esc]', () => this.closeModal())); box.append(rw);
    this.show(box);
  }
  private logProbe(sw: Switch, n: number, v: number) { if (v >= 0.5) this.logAll(`${sw.name.replace('SW-', 'PP-')}: probe toner berbunyi keras di port ${n}`); }
  private renderSel(sw: Switch, info: HTMLElement, acts: HTMLElement, id: string) {
    info.innerHTML = ''; acts.innerHTML = '';
    const S = this.sel; if (!S || S.sw !== sw.name) return;
    if (S.pp) {
      const q = sw.panel[S.pp - 1];
      info.innerHTML = `<b>PP-${q.n}</b> · ${q.patch ? `patch cord → <b>${portName(q.patch)}</b> (${esc(sw.ports[q.patch - 1].desc || 'tanpa deskripsi')})` : q.hang ? 'patch cord <b>tergantung</b>, ujung switch-nya tidak tercolok' : 'belum ada patch cord'}${q.patch ? '' : ' · klik port switch tujuan untuk memasang patch cord'}`;
      if (q.patch) acts.append(btn('Cabut patch cord dari switch', () => {
        const from = q.patch!; patchCord(sw, q.n, null);
        this.logAll(`${sw.name.replace('SW-', 'PP-')}: patch cord PP-${q.n} dicabut dari ${portName(from)}`); this.check(false); this.openRack(id);
      }, 'btn', 'pp-unplug'));
    } else if (S.swp) {
      const p = sw.ports[S.swp - 1];
      const from = sw.panel.find(x => x.patch === p.n);
      const loop = sw.loop?.includes(p.n) ? sw.loop.find(x => x !== p.n)! : null;
      info.innerHTML = `<b>${portName(p.n)}</b> · ${esc(p.desc || 'tanpa deskripsi')} · ${loop ? `<b>kabel patch ke ${portName(loop)}</b>: port switch disambung ke port switch, bukan ke patch panel!` : from ? `patch cord dari PP-${from.n}` : 'kosong'}`;
      if (loop) acts.append(btn('Cabut kabel ini', () => {
        sw.loop = null; this.inv.patch++;
        this.logAll(`${sw.name}: kabel loop ${portName(p.n)} ↔ ${portName(loop)} dicabut`); this.check(false);
        this.toast('Kabel loop dicabut. LED berhenti berkedip liar; badai broadcast berhenti.', 3500); this.openRack(id);
      }, 'btn pri', 'loop-remove'));
    }
  }
  private clickSwitchPort(sw: Switch, n: number, id: string) {
    const S = this.sel;
    if (S?.sw === sw.name && S.pp && !sw.panel[S.pp - 1].patch) {
      const q = sw.panel[S.pp - 1];
      if (!q.hang && this.inv.patch < 1) { this.toast('Kamu tidak membawa patch cord. Ambil di Lemari Alat (Workshop TKJ).', 3500); return; }
      const hadHang = q.hang;
      const err = patchCord(sw, q.n, n);
      if (err) { this.toast(err, 3000); this.sel = { sw: sw.name, swp: n }; this.openRack(id); return; }
      if (!hadHang) this.inv.patch--;
      this.logAll(`${sw.name.replace('SW-', 'PP-')}: patch cord PP-${q.n} → ${portName(n)}`); this.check(false);
      this.sel = { sw: sw.name, swp: n }; this.openRack(id); return;
    }
    this.sel = { sw: sw.name, swp: n }; this.openRack(id);
  }
  openConsole(sw: Switch, rackId = sw.rack) {
    if (!this.inv.console || !this.inv.laptop) { this.toast(`Butuh ${!this.inv.laptop ? 'laptop teknisi' : ''}${!this.inv.laptop && !this.inv.console ? ' dan ' : ''}${!this.inv.console ? 'kabel console' : ''}. Ambil di Lemari Alat (Workshop TKJ).`, 4200); return; }
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', `Laptop teknisi → console ${sw.name}`));
    this.cli = new SwitchCli(sw, (line, s) => { for (const j of this.openJobs()) if (j.sw === s.name || j.faults.some(f => f === 'port' || f === 'vlan' || f === 'uplink' || f === 'loop')) j.swTouched = true; this.logAll(`${s.name}: ${line}`); this.check(false); });
    box.append(this.cli.root);
    const rw = h('div', 'row');
    rw.append(btn('Cabut console', () => { this.cli = null; this.openRack(rackId); }, 'btn', 'console-close'));
    box.append(rw);
    this.show(box, false);
    this.cli.focus();
  }
  /** QA hook: type into the open console. */
  consoleType(line: string) { this.cli?.type(line); }

  // ---------------------------------------------------------------- closing jobs
  private check(fromTest: boolean) {
    for (const j of this.openJobs()) {
      for (const t of j.targets) { const ok = this.targetOk(j, t); if (!ok) { t.ok = false; t.tested = false; } else t.ok = true; }
      if (j.targets.every(t => t.ok && t.tested) && !this.globalProblem(j)) this.close(j);
    }
    void fromTest;
  }
  private close(j: Job) {
    j.status = 'closed';
    j.slaMet = j.age <= j.sla;
    const busy = new Set(this.openJobs().flatMap(x => x.targets.map(t => t.pc.name)));
    j.collateral = j.snap.filter(n => !busy.has(n) && !j.targets.some(t => t.pc.name === n) && !healthy(adapterOf(n)));
    const swDirty = j.swTouched && SWITCHES.some(s => s.dirty);
    let stars = 3; if (!j.slaMet) stars--; if (j.collateral.length) stars--; if (j.wrong > 0 || swDirty) stars--;
    j.stars = Math.max(1, stars);
    const base = j.kind === 'contract' ? TEMPLATES[j.tpl as TplId].xp : j.kind === 'follow' ? 60 : 100 + (j.faults.some(f => FAULTS[f].rank > 0) ? 50 : 0) + (j.faults.length > 1 ? 60 : 0);
    j.xp = Math.round(base * (j.stars === 3 ? 1.3 : j.stars === 2 ? 1 : 0.7)) + (j.hint ? 0 : 20);
    this.s.closed++; if (j.slaMet) this.s.slaMet++; this.s.stars += j.stars; if (j.kind === 'contract') this.s.contracts++;
    for (const f of j.faults) { const m = this.s.mastery[f] ?? { ok: 0, miss: 0 }; if (j.stars >= 2) m.ok++; else m.miss++; this.s.mastery[f] = m; }
    if (j.kind === 'contract') { const m = this.s.mastery[j.tpl] ?? { ok: 0, miss: 0 }; if (j.stars >= 2) m.ok++; else m.miss++; this.s.mastery[j.tpl] = m; }
    // consequences: everything that used to work and is broken now becomes a complaint
    for (const n of j.collateral.slice(0, 4)) {
      if (this.jobs.some(x => x.status !== 'closed' && x.targets.some(t => t.pc.name === n))) continue;
      const pc = this.pcs.find(p => p.name === n)!; const env = envOf(n);
      const f = this.newJob('follow', 'follow', 'Keluhan susulan: tadi normal, sekarang putus', pick(WHO[env.id]?.who ?? ['Staf']), 'Tinggi', 300, env.id);
      f.targets = [this.target(pc, 'any')]; f.order = [`${pc.label} terputus setelah pekerjaan ${j.id}.`, 'Cari tahu apa yang berubah dan perbaiki.']; f.snap = this.snapshot();
      this.jobs.push(f);
    }
    this.pendingReport.push(j);
    if (this.trackedId === j.id) this.trackedId = this.openJobs()[0]?.id ?? null;
    this.toast(`${j.id} terverifikasi. Laporan kerja dibuat otomatis.`, 3200);
    this.save();
  }

  update(dt: number) {
    if (this.mode === 'idle') { this.hud.innerHTML = ''; this.hud.classList.remove('on'); }
    this.hkT += dt; if (this.hkT > 60) { this.hkT = 0; dhcpHousekeeping(); }
    if (this.mode === 'idle') return;
    for (const j of this.openJobs()) j.age += dt;
    this.chkT -= dt; if (this.chkT <= 0) { this.chkT = 0.4; this.check(false); }
    if (this.pendingReport.length && !this.modal && !this.pcos.isOpen()) this.openReport(this.pendingReport.shift()!);
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.25; this.renderHud(); }
  }
  private renderHud() {
    const open = this.openJobs();
    const done = this.jobs.length - open.length;
    const j = this.tracked();
    this.hud.classList.add('on');
    const bag = [this.inv.tester && 'LAN tester', this.inv.console && 'console', this.inv.laptop && 'laptop', this.inv.patch && `${this.inv.patch}× patch cord`].filter(Boolean).join(' · ');
    if (!j) { this.hud.innerHTML = `<b>${this.mode === 'shift' ? `SHIFT ${this.shift}` : 'SURAT KERJA'}</b> · ${done}/${this.jobs.length} selesai<br><small>[T] Papan kerja</small>`; return; }
    const left = j.sla - Math.max(0, j.age);
    const rows = j.targets.slice(0, 5).map(t => `<div class="tg">${t.ok ? (t.tested ? '✅' : '🟡') : '⬜'} ${esc(t.pc.label)}${t.ok && !t.tested ? ' · <i>uji dari PC ini</i>' : ''}</div>`).join('');
    const g = this.globalProblem(j);
    this.hud.innerHTML = `<div class="top"><b>${this.mode === 'shift' ? `SHIFT ${this.shift}` : 'SURAT KERJA'}</b><span>${done}/${this.jobs.length} selesai</span></div>
      <div class="tk"><span class="pr p-${j.prio}">${j.prio}</span> <b>${j.id}</b> <span class="sla ${left < 0 ? 'late' : left < 60 ? 'warn' : ''}">SLA ${mmss(left)}</span></div>
      <div class="ttl">${esc(j.kind === 'ticket' ? `“${j.title}”` : j.title)}</div>${rows}${g ? `<div class="gp">⬜ ${esc(g)}</div>` : ''}
      <div class="nx">➜ ${esc(this.nextHint(j))}</div>
      ${j.hint && j.kind === 'ticket' ? `<div class="hint">Petunjuk: ${FAULTS[j.faults[0]].hint}</div>` : ''}
      ${bag ? `<small>Dibawa: ${bag}</small><br>` : ''}<small>[T] Papan kerja</small>`;
  }

  // ---------------------------------------------------------------- UI
  private show(el: HTMLElement, focusBtn = true) {
    const wasOpen = !!this.modal;
    if (this.modal) this.modal.remove();
    this.modal = h('div', 'noc-modal'); this.modal.append(el); document.body.append(this.modal);
    if (document.pointerLockElement) document.exitPointerLock();
    this.modal.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.closeModal(); });
    if (focusBtn) (this.modal.querySelector('button') as HTMLButtonElement | null)?.focus();
    if (!wasOpen) this.listeners.forEach(f => f(true));
  }
  closeModal() { if (!this.modal) return; this.modal.remove(); this.modal = null; this.cli = null; this.sel = null; this.probing = false; this.listeners.forEach(f => f(false)); }

  openBoard(msg = '') {
    const box = h('div', 'noc-box');
    const rk = this.rankIndex(), nx = RANKS[rk + 1];
    const pct = nx ? Math.round(((this.s.xp - RANKS[rk].xp) / (nx.xp - RANKS[rk].xp)) * 100) : 100;
    box.append(h('h2', '', 'Papan Kerja NOC · Nusantara Tech'));
    box.append(h('div', 'rank', `<b>${this.rank()}</b> · ${this.s.xp} XP ${nx ? `· ${nx.xp - this.s.xp} XP lagi ke ${nx.name}` : ''}<div class="bar"><i style="width:${pct}%"></i></div><small>Surat kerja selesai: ${this.s.contracts} · Shift: ${this.s.shifts - (this.mode === 'shift' ? 1 : 0)} · Tiket ditutup: ${this.s.closed} · Bintang: ${this.s.stars}</small>`));
    if (msg) box.append(h('p', 'msg', msg));
    if (this.mode !== 'idle') {
      const tb = h('table', 'tk-list', '<tr><th>No.</th><th>Prioritas</th><th>Pekerjaan · Lokasi</th><th>SLA</th><th>Status</th><th></th></tr>');
      for (const t of this.jobs) {
        const tr = h('tr', t.id === this.trackedId ? 'cur' : '');
        const left = t.sla - Math.max(0, t.age);
        const st = t.status === 'closed' ? `Selesai ${'★'.repeat(t.stars ?? 0)} +${t.xp}` : t.age < 0 ? 'Antre' : `${t.targets.filter(x => x.ok && x.tested).length}/${t.targets.length} beres`;
        tr.innerHTML = `<td>${t.id}</td><td><span class="pr p-${t.prio}">${t.prio}</span></td><td>${esc(t.title)}<br><small>${esc(t.order[0] ?? '')}</small></td><td>${t.status === 'closed' ? (t.slaMet ? 'Tepat' : 'Telat') : mmss(left)}</td><td>${st}</td>`;
        const td = h('td');
        if (t.status !== 'closed') { td.append(btn(t.id === this.trackedId ? 'Dilacak' : 'Lacak', () => { this.trackedId = t.id; this.openBoard(); })); td.append(btn('Surat', () => this.openOrder(t))); }
        tr.append(td); tb.append(tr);
      }
      box.append(tb);
      box.append(h('p', 'how', 'Ikuti penanda ke lokasi berikutnya. Perbaiki di PC (Jendela 11: CMD, Network Connections, browser ke router), di kabel [C], atau di rak switch [F]. Pekerjaan selesai saat jaringannya benar-benar normal <b>dan</b> kamu mengujinya dari PC itu.'));
      if (this.mode === 'contract') { const rw = h('div', 'row left'); rw.append(btn('Batalkan surat kerja', () => this.abandon(), 'btn', 'abandon')); box.append(rw); }
    } else {
      this.ensureOffers();
      box.append(h('h3', '', 'Surat kerja tersedia'));
      const grid = h('div', 'offers');
      this.offers.forEach((o, i) => {
        const c = h('div', 'offer', `<b>${TEMPLATES[o.tpl].name}</b><small>${TEMPLATES[o.tpl].cp} · SLA ${Math.round(TEMPLATES[o.tpl].sla / 60)} menit · ${TEMPLATES[o.tpl].xp} XP</small><p>${esc(o.lines[0])}</p>`);
        c.append(btn('Ambil', () => { this.closeModal(); this.acceptContract(o.tpl, o.seed); }, 'btn pri', `offer-${i}`));
        grid.append(c);
      });
      box.append(grid);
      const locked = (Object.keys(TEMPLATES) as TplId[]).filter(t => TEMPLATES[t].rank > rk);
      if (locked.length) box.append(h('p', 'how', `Terbuka nanti: ${locked.map(t => `${TEMPLATES[t].name} (${RANKS[TEMPLATES[t].rank].name})`).join(' · ')}`));
      box.append(h('h3', '', 'Shift helpdesk'));
      box.append(h('p', 'how', `Satu shift = ${Math.min(5, 3 + rk)} tiket gangguan acak di PC gedung, masing-masing dengan SLA. Gangguan yang sering lambat kamu tangani akan lebih sering muncul.`));
    }
    const row = h('div', 'row');
    if (this.mode === 'idle') row.append(btn('Mulai Shift', () => this.startShift(), 'btn', 'start-shift'));
    row.append(btn('Tutup [Esc]', () => this.closeModal()));
    box.append(row);
    this.show(box);
  }
  private abandon() {
    for (const j of this.openJobs()) j.status = 'closed';
    this.mode = 'idle'; this.trackedId = null; this.jobs = [];
    this.openBoard('Surat kerja dibatalkan. Perubahan yang sudah kamu buat di jaringan tetap ada.');
  }
  openOrder(j: Job) {
    const box = h('div', 'noc-box');
    box.append(h('h2', '', `${j.kind === 'contract' ? 'Surat Perintah Kerja' : 'Tiket'} ${j.id} · ${esc(j.title)}`));
    box.append(h('div', 'order', j.order.map(x => `<div>• ${esc(x)}</div>`).join('')));
    box.append(h('p', 'how', `SLA ${mmss(j.sla)} · ${j.kind === 'contract' ? TEMPLATES[j.tpl as TplId].cp : j.kind === 'ticket' ? FAULTS[j.faults[0]].cp : 'Konsekuensi pekerjaan sebelumnya'}`));
    const rw = h('div', 'row');
    if (j.kind === 'contract') rw.append(btn('Briefing', () => this.openBrief(j)));
    rw.append(btn('Mulai kerja', () => this.closeModal(), 'btn pri', 'order-ok'));
    box.append(rw);
    this.show(box);
  }
  private openBrief(j: Job) {
    const T = TEMPLATES[j.tpl as TplId];
    const box = h('div', 'noc-box');
    box.append(h('h2', '', `Briefing Kak Rani · ${T.name}`));
    box.append(h('div', 'brief', T.brief.map((x, i) => `<p><b>${i + 1}.</b> ${esc(x)}</p>`).join('')));
    const rw = h('div', 'row'); rw.append(btn('Lihat surat kerja', () => this.openOrder(j), 'btn pri', 'brief-ok')); box.append(rw);
    this.show(box);
  }
  private openReport(j: Job) {
    const box = h('div', 'noc-box');
    box.append(h('h2', '', `Laporan kerja ${j.id} ${'★'.repeat(j.stars!)}${'☆'.repeat(3 - j.stars!)}`));
    const lines: string[] = [];
    lines.push(`<b>Pekerjaan:</b> ${esc(j.title)}`);
    if (j.kind === 'ticket') lines.push(`<b>Temuan:</b> ${j.detail ? esc(j.detail) + (j.faults.length > 1 ? ' + ' : '') : ''}${j.faults.filter((f, i) => !(i === 0 && j.detail)).map(f => `${FAULTS[f].cause} → ${FAULTS[f].fix}`).join(' + ')} <small>(${j.faults.map(f => FAULTS[f].cp).join(' · ')})</small>`);
    if (j.kind === 'contract') lines.push(`<b>Hasil:</b> ${j.targets.map(t => esc(`${t.pc.label}: ${(() => { const l = live(adapterOf(t.pc.name)); return `${l.ip}/${l.prefix}${adapterOf(t.pc.name).dhcp ? ' (DHCP)' : ' (statis)'}`; })()}`)).join(' · ')}`);
    box.append(h('div', 'order', lines.map(x => `<div>${x}</div>`).join('')));
    const log = [...new Set(j.log)].filter(x => !/berhasil$/.test(x) || true).slice(-14);
    box.append(h('p', '', '<b>Yang kamu kerjakan</b> <small>(dicatat otomatis)</small>'));
    box.append(h('div', 'log', log.length ? log.map(x => `<div>${esc(x)}</div>`).join('') : '<div>-</div>'));
    const crit = [
      `${j.slaMet ? '✔' : '✘'} Waktu ${mmss(Math.max(0, j.age))} dari SLA ${mmss(j.sla)}`,
      `${j.collateral!.length ? '✘' : '✔'} ${j.collateral!.length ? `Ada ${j.collateral!.length} PC lain yang jadi putus: ${j.collateral!.slice(0, 3).map(n => esc(this.pcLabel(n))).join(', ')} (masuk sebagai keluhan susulan)` : 'Tidak ada perangkat lain yang terganggu'}`,
      `${j.wrong || (j.swTouched && SWITCHES.some(s => s.dirty)) ? '✘' : '✔'} ${j.wrong ? `${j.wrong} material/langkah terbuang` : j.swTouched && SWITCHES.some(s => s.dirty) ? 'Konfigurasi switch belum disimpan (write memory)' : 'Rapi: tanpa material terbuang, konfigurasi tersimpan'}`,
    ];
    box.append(h('div', 'crit', crit.map(x => `<div>${x}</div>`).join('')));
    const before = this.rankIndex();
    if (!j.reported) { this.s.xp += j.xp!; j.reported = true; this.save(); }
    const up = this.rankIndex() > before;
    box.append(h('p', '', `<b>+${j.xp} XP</b> · total ${this.s.xp} XP`));
    if (up) box.append(h('p', 'msg', `Naik pangkat: <b>${this.rank()}</b>! Surat kerja dan jenis gangguan baru terbuka.`));
    const row = h('div', 'row');
    const allDone = this.jobs.every(x => x.status === 'closed');
    row.append(btn(allDone ? (this.mode === 'shift' ? 'Lihat rekap shift' : 'Kembali ke papan kerja') : 'Lanjut', () => (allDone ? this.endWork() : this.closeModal()), 'btn pri', 'report-ok'));
    box.append(row);
    this.show(box);
  }
  private endWork() {
    const xp = this.jobs.reduce((a, t) => a + (t.xp ?? 0), 0), st = this.jobs.reduce((a, t) => a + (t.stars ?? 0), 0);
    const msg = this.mode === 'shift' ? `Shift ${this.shift} selesai: ${this.jobs.length} tiket, ${this.jobs.filter(t => t.slaMet).length} tepat SLA, ${st} bintang, +${xp} XP.` : `Surat kerja selesai: ${st} bintang, +${xp} XP. Ambil surat kerja berikutnya atau mulai shift.`;
    this.mode = 'idle'; this.trackedId = null; this.jobs = [];
    this.openBoard(msg);
  }
}

/** Small seeded RNG so a work order is reproducible from its seed. */
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
