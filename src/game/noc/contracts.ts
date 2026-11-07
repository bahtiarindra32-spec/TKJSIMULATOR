// Work orders (kontrak / surat perintah kerja): the template catalogue, who reports what, and which segment
// a template runs on. Every accepted order picks its PCs, subnet and twists from a seed (see board.ts).
import { ENVS, type Env } from '../../pcos/net';
import { EXT_C } from '../../pcos/ext';

export type TplId = 'static' | 'desk' | 'dns' | 'renum' | 'vlan' | 'ap' | 'tutor' | 'crimp' | `x_${string}`;
export interface TplDef {
  name: string;
  rank: number;
  xp: number;
  sla: number;
  cp: string;
  brief: string[];
}
export const TEMPLATES = {
  static: {
    name: 'Pasang IP Statis',
    rank: 0,
    xp: 120,
    sla: 420,
    cp: 'Fase E · Pengalamatan IPv4',
    brief: [
      'Beberapa PC butuh alamat tetap (mis. dipakai aplikasi absensi). Alamatnya sudah ditentukan di surat kerja.',
      'Di PC: Network Connections › Properties › IPv4 › "Use the following IP address". Isi IP, subnet mask, gateway, DNS persis seperti surat kerja.',
      'Uji dari PC itu: ping gateway lalu ping/buka situs. Alamat yang sudah dipakai perangkat lain akan bentrok.',
    ],
  },
  desk: {
    name: 'Sambungkan Meja Baru',
    rank: 0,
    xp: 170,
    sla: 780,
    cp: 'Fase F · Sistem pengkabelan terstruktur',
    brief: [
      'Meja baru belum tersambung. Alurnya: PC → patch cord → outlet dinding → kabel horizontal → port patch panel di rak lantai → patch cord → port switch.',
      'Ambil 2 patch cord per meja, toner + probe, kabel console, dan laptop teknisi di Lemari Alat (Workshop TKJ, L1).',
      'Di meja [C]: pasang patch cord PC → outlet. Label outletnya belum ada, jadi pasang toner di outlet itu.',
      'Ke rak lantai itu (L1: ruang server; L2/L3: ruang IDF). Nyalakan probe dan sapu port patch panel: bunyi paling keras = port outlet tadi. Klik port itu, lalu klik port switch di surat kerja untuk memasang patch cord.',
      'Console ke switch: enable › conf t › interface gi1/0/N › switchport access vlan V › no shutdown › end › write memory.',
      'Kembali ke meja: tempel label outlet sesuai nomor patch panel (mis. L2-07), lalu uji ping/browser dari PC itu.',
    ],
  },
  dns: {
    name: 'Nama untuk Server Intranet',
    rank: 1,
    xp: 180,
    sla: 540,
    cp: 'Fase F · DNS',
    brief: [
      'Server aplikasi baru sudah dipasang tim aplikasi. Karyawan mau membukanya pakai nama, bukan IP.',
      'Buka router segmen itu dari browser PC (http://alamat-gateway, admin tanpa password) › IP › DNS › tambah record A: nama › IP server.',
      'Klien harus memakai DNS router supaya nama lokal terbaca. DNS publik seperti 8.8.8.8 tidak mengenal nama internal.',
      'Uji dengan membuka namanya di browser dari PC yang disebut di surat kerja.',
    ],
  },
  renum: {
    name: 'Pasang Router Baru & DHCP',
    rank: 1,
    xp: 260,
    sla: 900,
    cp: 'Fase F · DHCP & pengalamatan',
    brief: [
      'Router segmen diganti unit baru yang sudah di-reset oleh vendor: hanya alamat 192.168.88.1/24, DHCP server belum diaktifkan. Jaringan pindah ke subnet baru di surat kerja.',
      'PC dengan DHCP akan dapat 169.254.x.x. Untuk bisa membuka router pabrik, beri satu PC IP statis sementara di 192.168.88.0/24.',
      'Di WebKonfig ganti dulu IP › Addresses ke alamat LAN baru. Koneksimu ke router akan putus: pindahkan PC tadi ke IP statis di subnet baru, buka lagi router di alamat barunya.',
      'Lalu atur IP › DHCP Server (pool, gateway, DNS) dan IP › DNS (upstream + Allow Remote Requests).',
      'Kembalikan PC tadi ke DHCP, ipconfig /renew, lalu uji dari setiap PC di surat kerja. PC yang memakai IP statis lama juga harus dipindah.',
    ],
  },
  vlan: {
    name: 'Pindahkan Meja ke VLAN Kasir',
    rank: 2,
    xp: 220,
    sla: 720,
    cp: 'Fase F · VLAN',
    brief: [
      'Beberapa meja kantor dipakai tim kasir. Mereka harus masuk VLAN 30 (KASIR) yang punya router dan server POS sendiri.',
      'Di rak ruang server L1, console ke switch lantainya: conf t › vlan 30 › name KASIR › interface gi1/0/N › switchport access vlan 30.',
      'PC baru pindah subnet setelah minta alamat lagi: ipconfig /renew (atau tunggu klien mencoba ulang).',
      'Uji dari setiap PC: harus dapat 192.168.30.x dan bisa membuka server POS 192.168.30.10. Simpan konfigurasi switch: write memory.',
    ],
  },
} as Record<TplId, TplDef>;

TEMPLATES.ap = {
  name: 'Ganti AP Koridor yang Rusak',
  rank: 2,
  xp: 300,
  sla: 1200,
  cp: 'Fase F · Jaringan nirkabel',
  brief: [
    'Satu AP koridor di lantai hotel rusak dan sudah diturunkan. Tamu di kamar sekitarnya mengeluh sinyal lemah.',
    'Ambil AP pengganti, patch cord, kabel console + laptop, dan Wi-Fi analyzer di Lemari Alat. Pasang AP di bracket plafon koridor [F].',
    'Di rak IDF lantai itu: patch outlet AP ke port switch di surat kerja, lalu console: interface gi1/0/N › switchport access vlan 40 › power inline auto › no shutdown › write memory.',
    'Di PC Kantor IT, buka NusaWLC (http://192.168.10.20): adopsi AP. Lalu survei: berdiri di bawah AP, nyalakan analyzer [R], pilih kanal 1/6/11 yang tidak dipakai AP yang terdengar kuat di situ.',
    'Selesai kalau laptop kamar di surat kerja bisa internet dengan sinyal bagus.',
  ],
};

TEMPLATES.tutor = {
  name: 'Hari Pertama: Sambungkan PC Workshop',
  rank: 0,
  xp: 150,
  sla: 900,
  cp: 'Fase E · Media transmisi & pengalamatan IP',
  brief: [
    'Selamat datang di tim IT Nusantara Tech! Tugas pertamamu: satu PC di Workshop TKJ belum tersambung ke jaringan.',
    'Ambil alat di Lemari Alat (Workshop TKJ): LAN tester dan satu patch cord.',
    'Di meja PC itu, cek fisik [C / tombol Cek]: pasang patch cord dari outlet dinding ke PC, lalu tes kabelnya dengan LAN tester.',
    'Nyalakan PC [F / tombol Aksi], buka Command Prompt, ketik ipconfig: catat IPv4 Address dan Default Gateway.',
    'Ping alamat Default Gateway. Kalau ada Reply, PC sudah tersambung dan pekerjaan selesai.',
  ],
};
TEMPLATES.crimp = {
  name: 'Buat Patch Cord Sendiri (Crimping)',
  rank: 0,
  xp: 200,
  sla: 900,
  cp: 'Fase E · Media transmisi: pembuatan kabel UTP',
  brief: [
    'Stok patch cord pabrikan habis. Buat sendiri dari gulungan kabel UTP Cat6 dan konektor RJ45 di Lemari Alat (Workshop TKJ): tombol "Crimping".',
    'Standar gedung ini T568B di kedua ujung (straight-through): putih-oranye, oranye, putih-hijau, biru, putih-biru, hijau, putih-coklat, coklat. Pin 1 di kiri saat klip konektor menghadap ke bawah.',
    'Kupas jaket kira-kira 2 cm, luruskan dan urutkan kabel, potong rata kira-kira 1,3 cm, masukkan sampai ujung tembaga terlihat di ujung konektor, lalu crimp.',
    'Tes dengan LAN tester sebelum dipasang: lampu 1 sampai 8 di unit utama dan remote harus menyala berurutan. Tester murah tidak bisa mendeteksi split pair, jadi urutan warna tetap harus standar.',
    'Pasang kabelnya dari outlet ke PC [C], nyalakan PC dan uji ping ke gateway.',
  ],
};
/** steps of the first-day tutorial job, tracked from what the player really does */
export interface Tut {
  tested: boolean;
  ipconfig: boolean;
  gw: string;
}

/** PCs of the SMK practice lab building: never part of internship jobs */
/** PCs that are never internship (hotel) job targets: the SMK practice lab and the Fase 1 customer sites */
export const LABPC = /^PROP_(LAB|RUMAH|KOS|WARNET|NUSATEKNIK)_/;
export const DAY_PHASES = [
  { name: 'Pagi', what: 'satu surat kerja instalasi' },
  { name: 'Siang', what: 'shift helpdesk, beberapa tiket' },
  { name: 'Sore', what: 'insiden: satu akar masalah, banyak pengguna' },
];
export const PRIO = { Tinggi: 240, Sedang: 420, Rendah: 600 } as const;
export type Prio = keyof typeof PRIO;
export const WHO: Record<string, { who: string[]; prio: Prio[] }> = {
  lab: { who: ['Siswa praktik', 'Guru produktif', 'Asisten lab'], prio: ['Sedang', 'Rendah', 'Sedang'] },
  office: { who: ['Staf keuangan', 'Manajer kantor', 'Staf HRD', 'Admin marketing'], prio: ['Tinggi', 'Tinggi', 'Sedang', 'Sedang'] },
  kasir: { who: ['Kasir', 'Supervisor kasir'], prio: ['Tinggi', 'Tinggi'] },
  guest: { who: ['Tamu hotel', 'Tamu VIP', 'Tamu bisnis'], prio: ['Sedang', 'Tinggi', 'Tinggi'] },
  none: { who: ['Staf'], prio: ['Sedang'] },
};
/** Installation orders owned by the infrastructure modules join the catalogue as `x_<id>`. */
export function registerExtContracts() {
  for (const [id, c] of Object.entries(EXT_C))
    (TEMPLATES as Record<string, TplDef>)[`x_${id}`] = { name: c.name, rank: c.rank, xp: c.xp, sla: c.sla, cp: c.cp, brief: c.brief };
}
/** the network segment a template's job runs on */
export function envForTemplate(tpl: TplId, r: () => number): Env {
  if (tpl === 'vlan') return ENVS.office;
  if (tpl === 'ap') return ENVS.guest;
  if (tpl === 'tutor') return ENVS.lab;
  if (tpl === 'crimp') return ENVS.lab;
  if (tpl.startsWith('x_')) return tpl === 'x_dhcpsrv' ? ENVS.lab : tpl === 'x_failover' ? (r() < 0.5 ? ENVS.lab : ENVS.office) : ENVS.office;
  if (tpl === 'renum') return ENVS.office; // lab DHCP/DNS now live on the Linux server srv-nusa
  if (tpl === 'desk') return r() < 0.5 ? ENVS.lab : ENVS.office;
  return r() < 0.5 ? ENVS.lab : ENVS.office;
}
/** one-line board description of an offered order */
export function offerLine(tpl: TplId, env: Env): string | undefined {
  const lines: Record<string, string> = {
    static: `${env.label}: beberapa PC butuh alamat IP tetap.`,
    desk: `${env.label}: meja baru belum tersambung ke jaringan.`,
    dns: `${env.label}: server aplikasi baru perlu nama domain lokal.`,
    renum: `${env.label}: router diganti unit baru, jaringan pindah subnet.`,
    vlan: 'Kantor: beberapa meja dipindah ke jaringan kasir (VLAN 30).',
    ap: 'Hotel: satu AP koridor rusak, tamu di kamar sekitarnya mengeluh sinyal lemah.',
    tutor: 'Workshop TKJ: satu PC praktik belum tersambung. Pekerjaan pertama untuk teknisi baru.',
    crimp: 'Workshop TKJ: stok patch cord habis, PC praktik harus disambung dengan kabel buatan sendiri.',
    x_printer: 'Kantor: printer jaringan baru datang, masih setelan pabrik.',
    x_voice: 'Kantor: telepon IP baru di meja belum menyala.',
    x_share: 'Kantor: divisi minta folder bersama baru di NAS.',
    x_dhcpsrv: 'Lab TKJ: server Linux diinstal ulang, DHCP-nya belum jalan.',
    x_failover: 'Gedung: jalur ISP2 baru dipasang, belum jadi cadangan otomatis.',
  };
  return lines[tpl];
}
