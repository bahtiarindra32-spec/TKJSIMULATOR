// Mission chain state for "Hari pertama magang di Nusantara Tech Hotel".
// Pure game state: no Three.js, no DOM (except a guarded localStorage). Serializable.
import { ANCHORS, HOTEL_ORIGIN, wx, wz } from '../data/city';

export type GameKind = 'k3' | 'crimp' | 'ip' | 'subnet' | 'vlan' | 'server' | 'quiz';
import { CP_TAGS } from './missionsF';
export interface MissionDef {
  id: string; no: number; title: string; room: string; place: string;
  brief: string; learn: string; why: string;
  objective: string; objectiveNear: string; anchor: string; game: GameKind; xp: number;
  steps: string[]; doneText: string; cp?: string;
}

export const MENTOR = 'Kak Rani';
export const MENTOR_ROLE = 'Supervisor IT, Nusantara Tech Hotel';

const BASE_CHAIN: MissionDef[] = [
  {
    id: 'm1_k3', no: 1, title: 'K3 Dulu, Baru Kerja', room: 'Workshop TKJ', place: 'Lemari Alat', anchor: 'ANCHOR_WS_TOOLCAB_01', game: 'k3', xp: 100,
    brief: 'Selamat datang di hari pertama magang! Sebelum pegang kabel, siapkan alat dan APD yang benar dulu. Hari ini kita bikin kabel LAN untuk PC baru.',
    learn: 'K3LH & budaya 5R', why: 'Alat yang tepat bikin kerja aman dan cepat. Salah alat = buang waktu atau celaka.',
    objective: 'Pergi ke Lemari Alat di Workshop TKJ', objectiveNear: 'Tekan [F] untuk buka Lemari Alat',
    steps: ['Pilih semua alat & APD untuk bikin kabel LAN', 'Jawab 2 soal K3 singkat'],
    doneText: 'Alat lengkap, APD terpasang, dan kamu tahu cara menjaga workshop tetap aman & rapi.',
  },
  {
    id: 'm2_crimp', no: 2, title: 'Crimping Kabel Straight', room: 'Workshop TKJ', place: 'Meja Crimping', anchor: 'ANCHOR_WS_CRIMPING_01', game: 'crimp', xp: 150,
    brief: 'PC Praktik 1 belum punya kabel. Buat satu kabel straight: kedua ujung pakai urutan warna T568B, lalu cek pakai LAN tester.',
    learn: 'Urutan warna T568B, kabel straight, LAN tester', why: 'Kabel straight dipakai untuk menyambung PC ke switch. Urutan warna standar bikin kabel bisa dipakai di mana saja.',
    objective: 'Pergi ke Meja Crimping di Workshop TKJ', objectiveNear: 'Tekan [F] untuk mulai crimping',
    steps: ['Susun 8 warna kabel ujung A (T568B)', 'Susun 8 warna kabel ujung B (T568B)', 'Tes dengan LAN tester: lampu 1–8 harus urut'],
    doneText: 'Kabel straight T568B jadi dan lolos LAN tester: lampu 1 sampai 8 menyala berurutan di kedua sisi.',
  },
  {
    id: 'm3_ip', no: 3, title: 'Atur IP & Ping Server', room: 'Workshop TKJ', place: 'PC Praktik 1', anchor: 'ANCHOR_WS_PC_01', game: 'ip', xp: 150,
    brief: 'Kabel sudah terpasang ke PC Praktik 1. Sekarang beri IP statis supaya PC bisa ping server praktik 192.168.10.10.',
    learn: 'IPv4, subnet mask, gateway, ping', why: 'Perangkat cuma bisa ngobrol langsung kalau satu jaringan dan IP-nya tidak bentrok.',
    objective: 'Pergi ke PC Praktik 1 di Workshop TKJ', objectiveNear: 'Tekan [F] untuk pakai PC Praktik 1',
    steps: ['Isi IP, subnet mask, dan gateway sesuai lembar kerja', 'Ping server 192.168.10.10 sampai ada Reply'],
    doneText: 'PC Praktik 1 sudah satu jaringan dengan server dan ping-nya dapat Reply 4/4.',
  },
  {
    id: 'm4_subnet', no: 4, title: 'Hitung Subnet untuk Hotel', room: 'Kantor IT', place: 'Meja NOC', anchor: 'ANCHOR_IT_NOC_01', game: 'subnet', xp: 200,
    brief: 'Jaringan hotel 192.168.20.0/24 mau dibagi untuk beberapa lantai. Bantu tim NOC hitung subnet-nya.',
    learn: 'CIDR, subnet mask, network & broadcast, jumlah host', why: 'Subnetting bikin jaringan rapi, hemat alamat, dan gampang diatur per lantai.',
    objective: 'Pergi ke Meja NOC di Kantor IT', objectiveNear: 'Tekan [F] untuk buka soal subnetting',
    steps: [`Jawab 5 soal subnetting (minimal 4 benar)`],
    doneText: 'Kamu bisa menghitung mask, blok, network, broadcast dan jumlah host. Rencana subnet hotel siap.',
  },
  {
    id: 'm5_vlan', no: 5, title: 'Pisahkan Jaringan dengan VLAN', room: 'Ruang Server', place: 'Rak Jaringan', anchor: 'ANCHOR_SRV_NETRACK_01', game: 'vlan', xp: 200,
    brief: 'Tamu hotel tidak boleh bisa mengakses PC kantor dan kamera CCTV. Atur port switch sesuai surat kerja: VLAN 10 Kantor, 20 Wi-Fi Tamu, 30 CCTV.',
    learn: 'VLAN, port access vs trunk', why: 'VLAN memisahkan jaringan di satu switch, jadi tamu tidak bisa mengintip data kantor atau kamera.',
    objective: 'Pergi ke Rak Jaringan di Ruang Server', objectiveNear: 'Tekan [F] untuk atur switch',
    steps: ['Pilih VLAN untuk tiap port sesuai perangkatnya', 'Verifikasi dengan show vlan brief'],
    doneText: 'Kantor, Wi-Fi Tamu dan CCTV sekarang di VLAN terpisah, uplink ke router jadi trunk.',
  },
  {
    id: 'm6_server', no: 6, title: 'Cek UPS & Suhu Ruang Server', room: 'Ruang Server', place: 'Panel UPS', anchor: 'ANCHOR_SRV_UPS_01', game: 'server', xp: 150,
    brief: 'Tugas terakhir hari ini: cek kesehatan ruang server. Suhu udara masuk server harus 18–27 °C, dan UPS harus dalam kondisi normal.',
    learn: 'Monitoring ruang server: suhu & UPS', why: 'Server yang kepanasan bisa mati mendadak. UPS menjaga server tetap hidup saat listrik PLN padam.',
    objective: 'Pergi ke Panel UPS di Ruang Server', objectiveNear: 'Tekan [F] untuk baca panel UPS & suhu',
    steps: ['Tandai suhu tiap rak: aman atau tidak', 'Tentukan status UPS: normal atau perlu dilaporkan'],
    doneText: 'Laporan ruang server lengkap: rak yang suhunya bermasalah dan status UPS sudah kamu catat.',
  },
];


const q = (id: string, title: string, room: string, place: string, anchor: string, xp: number, brief: string, learn: string, why: string, steps: string[], doneText: string): MissionDef => ({
  id, no: 0, title, room, place, anchor, game: 'quiz', xp, brief, learn, why, steps, doneText,
  objective: `Pergi ke ${place} di ${room}`, objectiveNear: `Tekan [F] di ${place}`,
});
const EXTRA: Record<string, MissionDef> = {
  m7_wifi: q('m7_wifi', 'Wi-Fi Tamu di Lobi', 'Lobi', 'Meja Resepsionis', 'ANCHOR_LOBBY_RECEPTION_01', 150,
    'Tamu komplain Wi-Fi lobi lemot. Kita pasang access point baru di plafon lobi. Bantu tentukan kanal, standar, keamanan, dan dayanya.',
    'Kanal 2,4 GHz, standar 802.11, WPA2/WPA3, PoE', 'Wi-Fi yang salah kanal saling ganggu, dan SSID tanpa keamanan bikin data tamu gampang disadap.',
    ['Pilih kanal non-overlap', 'Pilih standar & keamanan SSID tamu', 'Tentukan sumber daya AP'], 'AP lobi siap: kanal tidak bentrok, Wi-Fi 6, WPA2/WPA3 + captive portal, daya dari switch PoE.'),
  m8_dhcp: q('m8_dhcp', 'DHCP Server untuk Kamar', 'Kantor IT', 'PC Admin 2', 'ANCHOR_IT_PC_02', 150,
    'Wi-Fi kamar 192.168.40.0/24 belum membagi IP otomatis. Atur DHCP server-nya dan bantu diagnosis laptop tamu yang tidak dapat IP.',
    'DORA, pool DHCP, IP statis vs dinamis, APIPA', 'Tanpa DHCP, ratusan tamu harus isi IP manual. Pool yang salah bikin IP bentrok.',
    ['Urutkan proses DORA', 'Tentukan pool DHCP', 'Diagnosis IP 169.254.x.x'], 'DHCP kamar aktif: pool .100–.200, perangkat penting pakai IP tetap, dan kamu bisa membaca tanda APIPA.'),
  m9_dns: q('m9_dns', 'DNS Intranet Hotel', 'Kantor IT', 'PC Admin 3', 'ANCHOR_IT_PC_03', 150,
    'Karyawan mau buka intranet.nusantara.local, bukan hafal IP. Siapkan record DNS-nya dan bantu troubleshooting.',
    'Fungsi DNS, record A/MX, port 53, nslookup', 'Orang mengingat nama, komputer butuh IP. DNS yang menjembatani keduanya.',
    ['Pilih record yang tepat', 'Jawab soal port & fungsi DNS', 'Diagnosis pakai hasil nslookup'], 'Record DNS intranet siap dan kamu bisa membedakan masalah DNS dengan masalah web server.'),
  m10_nat: q('m10_nat', 'Gateway Internet: NAT & Routing', 'Ruang Server', 'Router Gateway (Rak 1)', 'ANCHOR_SRV_RACK_01', 200,
    'Router baru dari ISP sudah terpasang di rak. Atur supaya semua LAN hotel bisa internet dan bisa menjangkau kantor cabang.',
    'NAT, default route, route statis, routing dinamis', 'Tanpa NAT dan rute yang benar, jaringan lokal tidak bisa keluar ke internet atau ke cabang.',
    ['Pilih fitur untuk berbagi IP publik', 'Tulis default route', 'Susun perintah route statis'], 'Internet hotel jalan lewat NAT, default route ke ISP, dan rute statis ke cabang sudah benar.'),
  m11_sec: q('m11_sec', 'Firewall & Keamanan', 'Ruang Server', 'Firewall (Rak 2)', 'ANCHOR_SRV_RACK_02', 200,
    'Ada percobaan login aneh di server dan tamu masih bisa melihat jaringan kantor. Waktunya pasang aturan keamanan.',
    'Firewall rule, brute force, fail2ban, RADIUS, TLS', 'Satu celah keamanan bisa membocorkan data tamu dan karyawan.',
    ['Buat aturan firewall tamu → kantor', 'Kenali serangan dari log', 'Pilih autentikasi & enkripsi'], 'Tamu terisolasi dari kantor, brute force diblokir, Wi-Fi karyawan pakai RADIUS, dan data login terenkripsi TLS.'),
  m12_voip: q('m12_voip', 'Telepon IP (VoIP)', 'Kantor IT', 'Meja VoIP', 'ANCHOR_IT_PC_04', 150,
    'Telepon resepsionis mau diganti IP phone. Pahami cara kerjanya dan atasi suara putus-putus.',
    'SIP, port 5060, PoE, QoS', 'Telepon kantor modern jalan di atas jaringan data, jadi teknisi jaringan yang mengurusnya.',
    ['Pilih protokol & port VoIP', 'Jelaskan sumber daya IP phone', 'Atasi suara putus-putus'], 'IP phone pakai SIP, dapat daya PoE, dan trafik suara diprioritaskan dengan QoS.'),
  m13_fo: q('m13_fo', 'Backbone Fiber Optic', 'Ruang Server', 'ODF (Rak 3)', 'ANCHOR_SRV_RACK_03', 200,
    'Hotel akan disambung ke gedung cabang lewat fiber optic. Pilih kabelnya, sambung, lalu ukur.',
    'Single-mode vs multimode, fusion splicing, OPM, OTDR', 'Fiber membawa data jarak jauh dengan cepat, tapi sambungan yang buruk bikin redaman tinggi.',
    ['Pilih jenis kabel', 'Urutkan langkah splicing', 'Pilih alat ukur yang tepat'], 'Backbone fiber single-mode tersambung, dan kamu tahu kapan memakai OPM dan OTDR.'),
};
const ORDER = ['m1_k3', 'm2_crimp', 'm3_ip', 'm4_subnet', 'm7_wifi', 'm8_dhcp', 'm9_dns', 'm5_vlan', 'm10_nat', 'm11_sec', 'm12_voip', 'm13_fo', 'm6_server'];
export const MISSIONS_CHAIN: MissionDef[] = ORDER.map((id, i) => ({ ...(BASE_CHAIN.find(m => m.id === id) ?? EXTRA[id]), no: i + 1, cp: CP_TAGS[id] }));

export type ModalState =
  | { type: 'intro' }
  | { type: 'briefing'; missionId: string }
  | { type: 'game'; missionId: string; game: GameKind }
  | { type: 'success'; missionId: string }
  | { type: 'finale' }
  | { type: 'log' }
  | null;

export interface SaveData { v: 1; index: number; xp: number; done: string[]; mistakes: Record<string, number>; seenIntro: boolean; briefed: string[] }
export interface CurrentInfo {
  id: string | null; title: string; objective: string; step: number; total: number;
  targetName: string | null; targetPos: { x: number; z: number } | null;
  /** Floor height (m) under the target: 0.42 in the raised-floor server room, else 0.12. */
  targetY: number; place: string; room: string;
  xp: number; totalXp: number; near: boolean; finished: boolean;
}

const SAVE_KEY = 'kotaNusantara.missions.v2';
const NEAR_RADIUS = 1.6;

function storage(): Storage | null {
  try { const s = window.localStorage; const k = '__ms_probe'; s.setItem(k, '1'); s.removeItem(k); return s; } catch { return null; }
}

/** World positions of the hotel ANCHORS (same transform main.ts uses). */
export function hotelAnchorsWorld(): { name: string; x: number; z: number }[] {
  return ANCHORS.map(([name, ax, az]) => ({ name, x: wx(HOTEL_ORIGIN[0] + ax), z: wz(HOTEL_ORIGIN[1] + az) }));
}

const fresh = (): SaveData => ({ v: 1, index: 0, xp: 0, done: [], mistakes: {}, seenIntro: false, briefed: [] });

export class MissionSystem {
  readonly missions = MISSIONS_CHAIN;
  private anchors = new Map<string, { x: number; z: number }>();
  private s: SaveData = fresh();
  private modal: ModalState = null;
  private listeners = new Set<() => void>();
  private modalListeners = new Set<(open: boolean) => void>();
  private near = false;
  /** Set by interact() on anchors that are not the current target; UI shows it as a toast. */
  lastMessage: { text: string; t: number } | null = null;
  private persist: boolean;

  constructor(anchors: { name: string; x: number; z: number }[] = hotelAnchorsWorld(), opts: { persist?: boolean } = {}) {
    for (const a of anchors) this.anchors.set(a.name, { x: a.x, z: a.z });
    this.persist = opts.persist ?? true;
    this.load();
  }

  // ---------- queries ----------
  get totalXp() { return this.missions.reduce((a, m) => a + m.xp, 0); }
  get xp() { return this.s.xp; }
  get index() { return this.s.index; }
  isFinished() { return this.s.index >= this.missions.length; }
  mission(id: string) { return this.missions.find(m => m.id === id) ?? null; }
  currentMission(): MissionDef | null { return this.missions[this.s.index] ?? null; }
  isDone(id: string) { return this.s.done.includes(id); }
  mistakes(id: string) { return this.s.mistakes[id] ?? 0; }
  getModal(): ModalState { return this.modal; }
  isModalOpen() { return this.modal !== null; }

  current(): CurrentInfo {
    const m = this.currentMission();
    const total = this.missions.length;
    if (!m) return { id: null, title: 'Magang hari 1 selesai!', objective: 'Semua misi beres. Bebas jalan-jalan keliling kota.', step: total, total, targetName: null, targetPos: null, targetY: 0, place: '', room: '', xp: this.s.xp, totalXp: this.totalXp, near: false, finished: true };
    const pos = this.anchors.get(m.anchor) ?? null;
    return {
      id: m.id, title: m.title, objective: this.near ? m.objectiveNear : m.objective,
      step: this.s.index + 1, total, targetName: m.anchor, targetPos: pos ? { ...pos } : null, targetY: m.anchor.startsWith('ANCHOR_SRV_') ? 0.42 : 0.12,
      place: m.place, room: m.room, xp: this.s.xp, totalXp: this.totalXp, near: this.near, finished: false,
    };
  }
  /** True only for the current mission's target anchor. */
  canInteract(anchorName: string | null) {
    const m = this.currentMission();
    return !!m && !!anchorName && m.anchor === anchorName && !this.isModalOpen();
  }
  /** Text for the HUD [F] hint near an anchor, or null if the anchor is not part of the chain. */
  hintFor(anchorName: string | null): string | null {
    if (!anchorName) return null;
    const m = this.currentMission();
    if (m && m.anchor === anchorName) return `[F] ${m.place}: ${m.title} (Misi ${m.no})`;
    const other = this.missions.find(x => x.anchor === anchorName);
    if (other) return this.isDone(other.id) ? `${other.place} · Misi ${other.no} selesai ✓` : `${other.place} · nanti di Misi ${other.no}`;
    return null;
  }

  // ---------- per-frame ----------
  /** Optional: call each frame with the player's world x,z so the objective switches to "Tekan [F]" when close. */
  setPlayerPos(x: number, z: number) {
    const t = this.current().targetPos;
    const n = !!t && Math.hypot(x - t.x, z - t.z) < NEAR_RADIUS;
    if (n !== this.near) { this.near = n; this.emit(); }
  }

  // ---------- actions ----------
  /** Call when the player enters walk mode. Opens the intro (first time) or the pending briefing. */
  start() {
    if (this.isModalOpen()) return;
    if (!this.s.seenIntro) return this.setModal({ type: 'intro' });
    const m = this.currentMission();
    if (m && !this.s.briefed.includes(m.id)) this.setModal({ type: 'briefing', missionId: m.id });
  }
  /** Returns true when the anchor belongs to the mission chain (handled here; main.ts should skip its own toast). */
  interact(anchorName: string | null): boolean {
    if (!anchorName || this.isModalOpen()) return false;
    const m = this.currentMission();
    if (m && m.anchor === anchorName) {
      if (!this.s.briefed.includes(m.id)) this.setModal({ type: 'briefing', missionId: m.id });
      else this.setModal({ type: 'game', missionId: m.id, game: m.game });
      return true;
    }
    const other = this.missions.find(x => x.anchor === anchorName);
    if (other) {
      const now = m ? `Sekarang: ${m.objective}.` : 'Semua misi sudah selesai.';
      this.message(this.isDone(other.id) ? `${other.place}: Misi ${other.no} sudah selesai ✓. ${now}` : `${other.place} dipakai nanti di Misi ${other.no}. ${now}`);
      return true;
    }
    return false;
  }
  openLog() { if (!this.isModalOpen()) this.setModal({ type: 'log' }); }
  toggleLog() { if (this.modal?.type === 'log') this.closeModal(); else this.openLog(); }
  openBriefing() { const m = this.currentMission(); if (m) this.setModal({ type: 'briefing', missionId: m.id }); }
  /** Closes whatever is open. Closing intro/briefing marks them as seen. */
  closeModal() {
    const md = this.modal;
    if (md?.type === 'intro') {
      this.s.seenIntro = true; this.save();
      const m = this.currentMission();
      if (m && !this.s.briefed.includes(m.id)) { this.setModal({ type: 'briefing', missionId: m.id }); return; }
    }
    if (md?.type === 'briefing') { if (!this.s.briefed.includes(md.missionId)) this.s.briefed.push(md.missionId); this.save(); }
    if (md?.type === 'success') { this.advance(); return; }
    this.setModal(null);
  }
  recordMistake(missionId: string) { this.s.mistakes[missionId] = (this.s.mistakes[missionId] ?? 0) + 1; this.save(); this.emit(); }
  /** Called by the minigame UI when the player solved it. */
  completeGame(missionId: string) {
    const m = this.currentMission();
    if (!m || m.id !== missionId || this.isDone(missionId)) return;
    this.s.done.push(m.id); this.s.xp += m.xp; this.save();
    this.setModal({ type: 'success', missionId: m.id });
  }
  private advance() {
    this.s.index = Math.min(this.missions.length, this.s.index + 1); this.near = false; this.save();
    const m = this.currentMission();
    if (m) this.setModal({ type: 'briefing', missionId: m.id });
    else this.setModal({ type: 'finale' });
  }
  reset() {
    this.s = fresh(); this.near = false; this.save();
    this.setModal(null);
  }
  /** Debug/test helper: jump to a mission index (keeps XP of missions before it). */
  jumpTo(index: number) {
    this.s.index = Math.max(0, Math.min(this.missions.length, index));
    this.s.done = this.missions.slice(0, this.s.index).map(m => m.id);
    this.s.xp = this.missions.slice(0, this.s.index).reduce((a, m) => a + m.xp, 0);
    this.s.seenIntro = true; this.near = false; this.save(); this.setModal(null);
  }

  // ---------- events ----------
  onChange(cb: () => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  onModalChange(cb: (open: boolean) => void) { this.modalListeners.add(cb); return () => this.modalListeners.delete(cb); }
  serialize(): SaveData { return JSON.parse(JSON.stringify(this.s)); }

  private message(text: string) { this.lastMessage = { text, t: Date.now() }; this.emit(); }
  private setModal(m: ModalState) {
    const was = this.modal !== null; this.modal = m;
    if (was !== (m !== null)) this.modalListeners.forEach(cb => cb(m !== null));
    this.emit();
  }
  private emit() { this.listeners.forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); }
  private load() {
    if (!this.persist) return;
    const st = storage(); if (!st) return;
    try {
      const raw = st.getItem(SAVE_KEY); if (!raw) return;
      const d = JSON.parse(raw) as Partial<SaveData>;
      if (d && d.v === 1 && typeof d.index === 'number') this.s = { ...fresh(), ...d, done: d.done ?? [], mistakes: d.mistakes ?? {}, briefed: d.briefed ?? [] } as SaveData;
    } catch { /* corrupt save: start fresh */ }
  }
  private save() {
    if (!this.persist) return;
    const st = storage(); if (!st) return;
    try { st.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* quota / sandbox: ignore */ }
  }
}
