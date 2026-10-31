// NPC di dalam hotel: resepsionis + satpam + tamu di lobi L1, karyawan duduk mengetik di PC kantor L1-L3,
// orang ngobrol di pantry L2/L3, tamu jalan di koridor kamar L4-L8. Hanya lantai pemain yang di-update/ditampilkan.
import * as THREE from 'three';
import { createPerson, randomSpec, walkPose, idlePose, typingPose, WALK_STRIDE, type Person } from '../assets/people';
import { LEVELS, HOTEL_ORIGIN, wx, wz } from '../data/city';

type Outfit = Parameters<typeof randomSpec>[1];
export type Role = 'resepsionis' | 'satpam' | 'tamu' | 'karyawan' | 'teknisi';
export interface TalkCtx { job: { title: string; who: string; next: string; pcs: string[]; faults: string[]; levels: number[] } | null }
export interface Npc { p: Person; level: number; kind: 'type' | 'idle' | 'walk'; role: Role; name: string; said: number; talkT: number; pc?: string; seatYaw?: number; aside?: boolean; a?: THREE.Vector3; b?: THREE.Vector3; t: number; sp: number; phase: number }

export class HotelNpcs {
  group = new THREE.Group(); list: Npc[] = []; private seed = 4242;
  private r = () => ((this.seed = (this.seed * 16807) % 2147483647) - 1) / 2147483646;
  constructor(parent: THREE.Object3D, pcs: { name: string; p: THREE.Vector3; o: THREE.Object3D }[]) {
    this.group.name = 'GAME_HOTEL_NPC'; parent.add(this.group);
    const OX = wx(HOTEL_ORIGIN[0]), OZ = wz(HOTEL_ORIGIN[1]);
    const fy = (lv: number) => LEVELS[lv - 1].elev + 0.12;
    const L = (lx: number, lz: number, lv: number) => new THREE.Vector3(OX + lx, fy(lv), OZ + lz);
    const make = (o: Outfit) => { const p = createPerson(randomSpec(this.r, o)); this.group.add(p.root); return p; };
    const stand = (o: Outfit, lv: number, lx: number, lz: number, faceX: number, faceZ: number, role: Role = 'tamu') => {
      const p = make(o); p.root.position.copy(L(lx, lz, lv)); p.root.rotation.y = Math.atan2(faceX, faceZ);
      this.list.push({ p, level: lv, kind: 'idle', role, name: this.nm(p), said: 0, talkT: 0, t: 0, sp: 0, phase: this.r() * 10 });
    };
    const walker = (o: Outfit, lv: number, a: [number, number], b: [number, number], role: Role = 'tamu') => {
      const p = make(o); const sp = 0.9 + this.r() * 0.4;
      const A = L(a[0], a[1], lv), B = L(b[0], b[1], lv);
      this.list.push({ p, level: lv, kind: 'walk', role, name: this.nm(p), said: 0, talkT: 0, a: A, b: B, t: this.r(), sp: sp / A.distanceTo(B), phase: this.r() });
    };
    // L1 lobi
    stand('office_white', 1, 7.2, 9.1, 0, -1, 'resepsionis'); stand('hijab_woman', 1, 9.6, 9.1, 0, -1, 'resepsionis');   // resepsionis di balik meja
    stand('security', 1, 12.6, 1.4, -0.4, 1, 'satpam');                                              // satpam dekat pintu
    stand('office_batik', 1, 8.0, 6.6, 0, 1);                                              // tamu check-in di depan meja
    walker('student_f', 1, [3.5, 4.5], [12.5, 5.5]); walker('technician', 1, [7, 1.2], [7, 10.6], 'teknisi');
    // pantry + koridor kantor L2/L3
    for (const lv of [2, 3]) { stand('office_batik', lv, 4.0, 15.0, 1, 0, 'karyawan'); stand('hijab_woman', lv, 5.0, 15.1, -1, 0, 'karyawan'); walker('office_white', lv, [2, 11], [28, 11], 'karyawan'); }
    // koridor kamar L4-L8
    for (let lv = 4; lv <= 8; lv++) walker(this.r() < 0.5 ? 'office_white' : 'student_m', lv, [2, 11], [28, 11]);
    // karyawan duduk di sekitar separuh PC kantor (deterministik); PC yang dipakai pemain -> NPC-nya disembunyikan
    for (const pc of pcs) {
      const m = /^PROP_L([1-3])_PC_/.exec(pc.name); if (!m || this.r() > 0.5) continue;
      const lv = +m[1]; const q = new THREE.Quaternion(); pc.o.getWorldQuaternion(q);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0); if (n.lengthSq() < 1e-4) continue; n.normalize();
      const p = make(this.r() < 0.5 ? 'office_batik' : this.r() < 0.5 ? 'office_white' : 'hijab_woman');
      p.root.position.copy(pc.p).addScaledVector(n, 0.78).setY(fy(lv)); p.root.rotation.y = Math.atan2(-n.x, -n.z);
      this.list.push({ p, level: lv, kind: 'type', role: 'karyawan', name: this.nm(p), said: 0, talkT: 0, seatYaw: p.root.rotation.y, pc: pc.name, t: 0, sp: 0, phase: this.r() * 10 });
    }
    this.group.visible = false;
  }
  /** inside: pemain di dalam hotel; level: lantai pemain; busyPc: PC yang sedang diduduki pemain */
  /** inside: pemain di dalam hotel; near: dekat hotel di luar (lobi terlihat lewat kaca) */
  update(dt: number, time: number, inside: boolean, near: boolean, level: number, busyPc: string | null, player: THREE.Vector3) {
    this.group.visible = inside || near; if (!this.group.visible) return;
    for (const n of this.list) {
      const on = inside ? Math.abs(n.level - level) <= 1 : n.level === 1; n.p.root.visible = on; if (!on) continue;
      if (busyPc && n.pc === busyPc) this.standAside(n);
      if (n.talkT > 0) { // menghadap pemain saat diajak bicara
        n.talkT -= dt; const d = player.clone().sub(n.p.root.position); n.p.root.rotation.y = Math.atan2(d.x, d.z);
        if (n.kind === 'type') { n.p.root.rotation.y = n.seatYaw!; typingPose(n.p, time + n.phase); } else idlePose(n.p, time + n.phase); continue;
      }
      if (n.kind === 'type') typingPose(n.p, time + n.phase);
      else if (n.kind === 'idle') idlePose(n.p, time + n.phase);
      else {
        { // berhenti kalau pemain menghalangi jalan (tidak menembus pemain)
          const k0 = n.t % 2, dir = (k0 < 1 ? n.b!.clone().sub(n.a!) : n.a!.clone().sub(n.b!)).setY(0).normalize(), q = n.p.root.position;
          const ax = q.x + dir.x * 0.6 - player.x, az = q.z + dir.z * 0.6 - player.z;
          if (Math.abs(player.y - q.y) < 1.5 && ax * ax + az * az < 0.75 * 0.75) { idlePose(n.p, time + n.phase); continue; }
        }
        n.t += n.sp * dt; const k = n.t % 2, f = k < 1 ? k : 2 - k;
        n.p.root.position.lerpVectors(n.a!, n.b!, f);
        const d = (k < 1 ? n.b!.clone().sub(n.a!) : n.a!.clone().sub(n.b!)); n.p.root.rotation.y = Math.atan2(d.x, d.z);
        n.phase = (n.phase + dt * 1.1 / WALK_STRIDE) % 1; walkPose(n.p, n.phase, 1);
      }
    }
  }

  /** badan NPC sebagai kotak padat untuk tabrakan pemain/kamera */
  boxes(level: number, x: number, z: number, out: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }[]) {
    if (!this.group.visible) return;
    for (const n of this.list) {
      if (n.level !== level || !n.p.root.visible || n.aside) continue; const q = n.p.root.position;
      if (Math.abs(q.x - x) > 6 || Math.abs(q.z - z) > 6) continue;
      const r = n.kind === 'type' ? 0.22 : 0.24; out.push({ minX: q.x - r, maxX: q.x + r, minZ: q.z - r, maxZ: q.z + r, minY: q.y, maxY: q.y + 1.7 });
    }
  }
  private nm(p: Person) { const F = ['Rina', 'Sari', 'Dewi', 'Putri', 'Ayu', 'Nurul', 'Fitri', 'Lestari'], M = ['Budi', 'Agus', 'Joko', 'Rudi', 'Dimas', 'Eko', 'Hendra', 'Fajar', 'Wahyu']; const L = p.spec.female ? F : M; return L[Math.floor(this.r() * L.length)]; }
  /** karyawan berdiri dari kursi dan geser ke samping meja (tidak menghilang) */
  standAside(n: Npc) {
    if (n.kind !== 'type') return; n.kind = 'idle'; const y = n.seatYaw!;
    n.p.root.position.x += Math.cos(y) * 1.1; n.p.root.position.z -= Math.sin(y) * 1.1; n.pc = undefined; n.aside = true;
  }
  nearest(pos: THREE.Vector3, level: number, r = 1.7) {
    let best: Npc | null = null, bd = r;
    for (const n of this.list) { if (n.level !== level || !n.p.root.visible) continue; const d = Math.hypot(n.p.root.position.x - pos.x, n.p.root.position.z - pos.z) - (n.role === 'resepsionis' ? 1.0 : 0); if (d < bd) { bd = d; best = n; } } // resepsionis: diajak bicara dari seberang meja
    return best;
  }
  title(n: Npc) { return `${n.name} (${{ resepsionis: 'Resepsionis', satpam: 'Satpam', tamu: 'Tamu hotel', karyawan: 'Karyawan', teknisi: 'Teknisi gedung' }[n.role]})`; }
  /** satu kalimat; bicara lagi -> kalimat berikutnya. Konteks tugas aktif diutamakan. */
  talk(n: Npc, ctx: TalkCtx, myPc: string | null): string {
    n.talkT = 4; const j = ctx.job, k = n.said++;
    const F: Record<string, string> = { cable: 'kabelnya kayak nggak nyambung, lampu di colokan mati', cablebad: 'internetnya putus-nyambung terus', port: 'tiba-tiba nggak ada jaringan sama sekali', vlan: 'nyambung tapi nggak bisa buka apa-apa, IP-nya aneh', disabled: 'jaringannya mati dari pagi', released: 'IP-nya hilang, katanya "limited"', wrongip: 'temen sebelah bisa, punya saya nggak, kayaknya IP-nya beda sendiri', gateway: 'bisa ping temen tapi nggak bisa internet', dns: 'web nggak kebuka tapi WhatsApp jalan', conflict: 'muncul peringatan IP conflict', patch: 'habis ada yang beresin rak, PC saya mati jaringannya', uplink: 'satu lantai internetnya mati semua', loop: 'jaringan satu lantai lemot parah, lampu switch kedip-kedip', portal: 'Wi-Fi tamu nggak muncul halaman login', appoe: 'Wi-Fi di lantai ini hilang', aprf: 'Wi-Fi lemot dan sering putus', dhcppool: 'HP saya nyambung Wi-Fi tapi nggak dapat IP' };
    const prob = () => { const f = j!.faults.map(x => F[x]).find(Boolean); return f ?? 'jaringannya bermasalah'; };
    if (n.role === 'karyawan' && j && myPc && j.pcs.includes(myPc)) {
      const L = [`Akhirnya teknisi datang! PC saya ${prob()}.`, 'Silakan dicek, Mas/Mbak. Saya minggir dulu ya.', `Tadi saya nggak ngapa-ngapain kok, tiba-tiba aja. Saran dari NOC: ${j.next}`];
      if (k >= 1) this.standAside(n); return L[Math.min(k, L.length - 1)];
    }
    if (n.role === 'karyawan' && n.pc && myPc === n.pc) { this.standAside(n); return 'Oh, mau pakai PC ini? Boleh, saya istirahat dulu ke pantry.'; }
    if (j && (n.role === 'resepsionis' || n.role === 'satpam') && k % 3 === 0) return `Teknisi ya? Ada laporan dari ${j.who}: ${j.title.replace(/\.$/, '')}. Lokasinya di lantai ${[...new Set(j.levels)].join(', ') || '1'}.`;
    if (j && n.role === 'karyawan' && j.levels.includes(n.level) && k % 2 === 0) return `Katanya ada yang lapor di lantai ini, ${prob()}. Semoga cepat beres ya.`;
    if (j && n.role === 'tamu' && j.faults.some(f => ['portal', 'appoe', 'aprf', 'dhcppool'].includes(f)) && k % 2 === 0) return `Mas, Wi-Fi hotelnya kenapa ya? ${prob()[0].toUpperCase()}${prob().slice(1)}.`;
    const P: Record<Role, string[]> = {
      resepsionis: ['Selamat datang di Nusantara Tech Hotel & Office. Ada yang bisa dibantu?', 'Ruang IT dan workshop di lantai 1, lewat koridor sebelah kanan. Lemari alat ada di workshop.', 'Kantor di lantai 2 dan 3, kamar tamu lantai 4 sampai 8. Lift ada di tengah gedung.', 'Kalau ada keluhan jaringan, cek papan kerja ya (tombol T).'],
      satpam: ['Selamat siang! Motor bisa diparkir di depan hotel.', 'Kalau mau ke ruang server, lewat koridor belakang lantai 1.', 'Hati-hati di jalan, Jl. Thamrin rame kalau sore.', 'Aman, Pak/Bu. Silakan masuk.'],
      tamu: ['Hotelnya enak, cuma Wi-Fi kadang lemot.', 'Mau cari makan, katanya ada tukang bakso lewat sore-sore.', 'Saya lagi nunggu teman, janjian di lobi.', 'Liftnya cepat juga ya.'],
      karyawan: ['Lagi kejar laporan, deadline sore ini.', 'Printer di lantai ini kadang macet, sabar aja.', 'Kopi di pantry gratis lho.', 'Kalau internet mati, kami langsung telepon IT di lantai 1.'],
      teknisi: ['Saya teknisi gedung, urusan listrik sama AC. Kalau jaringan, itu bagian kamu.', 'Panel listrik aman, UPS di ruang server juga normal.', 'Tadi ada kabel LAN keinjak kursi di lantai 2, hati-hati.'],
    };
    const L = P[n.role]; return L[k % L.length];
  }
}
