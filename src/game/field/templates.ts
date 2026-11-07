// Field-work order templates. Each one is tied to a real device and a real fault of the network simulation
// (see sim.ts) and priced from the job-category ranges in notes/research-grow.md §4.1. Those ranges are vendor price
// lists ([42] in that file: anecdotal, Jabodetabek, labour only) and are shown in the game as "perkiraan tarif pasar".
import type { Cust, FieldTplId } from './types';

export interface FieldTpl {
  id: FieldTplId;
  cust: Cust;
  title: string;
  /** fee range in Rp (labour only) and which research category it comes from */
  tarif: [number, number];
  tarifSrc: string;
  /** reputasi with this customer type needed before the order appears */
  minRep: number;
  /** time limit in seconds (includes the ride) */
  sla: number;
  weight: number;
  /** complaint lines (customer voice); the generator picks one opener */
  say: string[];
  /** what the customer asks for (fixed lines) */
  ask: string[];
}

/** customer per site: who calls and where to go (fictional addresses on the real map streets) */
export const CUSTOMER: Record<Cust, { who: string; address: string; place: string }> = {
  rumah: { who: 'Pak Hendra (pemilik rumah)', address: 'Jl. Flamboyan No. 12 (sisi selatan)', place: 'Rumah Kel. Hendra' },
  kos: { who: 'Bu Sri (pemilik Kos Mawar)', address: 'Jl. Anggrek No. 7 (sisi utara)', place: 'Kos Mawar' },
  warnet: { who: 'Koh Andi (pemilik Warnet Sinar)', address: 'Jl. Anggrek No. 31 (sisi utara)', place: 'Warnet Sinar' },
};

const CRIMP = 'Crimping RJ45 Rp50–100 rb/titik [42]';
const ROUTER = 'Instalasi router + konfigurasi dasar Rp150–300 rb [42]';

export const FIELD_TPLS: Record<FieldTplId, FieldTpl> = {
  r_router: {
    id: 'r_router', cust: 'rumah', title: 'Ganti router Wi-Fi yang mati', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 55, sla: 1200, weight: 1,
    say: ['Router Wi-Fi di ruang tamu mati total sejak hujan petir semalam, lampunya tidak menyala sama sekali.', 'Router Wi-Fi kami tidak mau nyala lagi, adaptornya sudah dicoba ganti.'],
    ask: ['Pasang router baru (bawa dari lemari material), tetap mode access point di belakang ONT.', 'Nama Wi-Fi dan sandi harus sama dengan yang lama supaya TV dan laptop langsung tersambung: SSID HENDRA_HOME, keamanan WPA2-PSK, sandi hendra2580.', 'Uji dari laptop keluarga dan cek status jaringan di smart TV.'],
  },
  r_tv: {
    id: 'r_tv', cust: 'rumah', title: 'Smart TV tidak dapat internet', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 0, sla: 1000, weight: 1.2,
    say: ['Laptop masih bisa internet, tapi smart TV di ruang tamu bilang "tidak ada internet".', 'Sejak anak saya utak-atik halaman ONT, TV tidak bisa streaming lagi. Laptop aman.'],
    ask: ['Cari penyebabnya di jaringan rumah (ONT ISP adalah gateway dan DHCP rumah ini).', 'Selesai kalau TV dapat alamat dari DHCP dan tersambung ke internet; cek di menu jaringan TV.'],
  },
  r_kabel: {
    id: 'r_kabel', cust: 'rumah', title: 'Kabel ONT ke router putus', tarif: [50_000, 100_000], tarifSrc: CRIMP, minRep: 0, sla: 1000, weight: 1.1,
    say: ['Wi-Fi HENDRA_HOME hilang. Kabel dari modem ke router digigit tikus, konektornya patah.', 'Konektor kabel LAN di belakang ONT patah waktu lemari digeser. Wi-Fi rumah hilang.'],
    ask: ['Buat kabel baru (crimp T568B, tes dengan LAN tester) atau pakai patch cord jadi, pasang ONT LAN1 → router.', 'Uji internet dari laptop keluarga.'],
  },
  k_ap2: {
    id: 'k_ap2', cust: 'kos', title: 'AP lantai 2 mati', tarif: [50_000, 100_000], tarifSrc: CRIMP, minRep: 0, sla: 1100, weight: 1.2,
    say: ['Anak-anak lantai 2 tidak dapat Wi-Fi sama sekali sejak kemarin sore. Lantai 1 normal.', 'Penghuni kamar atas komplain Wi-Fi hilang. Lampu AP di plafon lantai 2 mati.'],
    ask: ['Periksa AP lantai 2 dan kabelnya ke router di lantai 1.', 'Uji dari laptop penghuni di lantai 2.'],
  },
  k_kanal: {
    id: 'k_kanal', cust: 'kos', title: 'Wi-Fi kos lemot (gangguan kanal)', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 50, sla: 1100, weight: 0.9,
    say: ['Wi-Fi tersambung tapi lemot sekali, ping naik-turun. Tadi ada yang pencet-pencet pengaturan AP.', 'Penghuni bilang Wi-Fi tersambung tapi sering timeout, terutama di kamar dekat tangga.'],
    ask: ['Survei kanal kedua AP (AP satu gedung tidak boleh di kanal yang tumpang tindih).', 'Uji dari laptop penghuni yang komplain.'],
  },
  w_port: {
    id: 'w_port', cust: 'warnet', title: 'PC warnet tidak dapat IP', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 0, sla: 1000, weight: 1.2,
    say: ['Satu PC dapat 169.254 terus, padahal kabelnya bagus. Kemarin ada teman saya coba setting switch.', 'Satu PC booth tidak bisa main online, lampu kabelnya kadang nyala tapi tidak dapat IP.'],
    ask: ['Periksa port PC itu di switch SG-1016M (rak dinding, kabel console).', 'Uji dari PC itu (ping / buka situs). Simpan konfigurasi switch kalau diubah.'],
  },
  w_kabel: {
    id: 'w_kabel', cust: 'warnet', title: 'Kabel ke PC warnet putus', tarif: [50_000, 100_000], tarifSrc: CRIMP, minRep: 0, sla: 900, weight: 1.1,
    say: ['Satu PC tiba-tiba putus, ikon jaringan silang merah. Kabelnya sering terinjak kursi.', 'Kabel di bawah meja booth keinjak kaki kursi, PC itu tidak ada koneksi.'],
    ask: ['Tes kabelnya, ganti dengan kabel baru (crimp T568B atau patch cord jadi).', 'Uji dari PC itu.'],
  },
  w_loop: {
    id: 'w_loop', cust: 'warnet', title: 'Semua PC warnet putus', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 55, sla: 1100, weight: 0.8,
    say: ['Semua PC putus, lampu switch kedip-kedip cepat semua. Tadi ada yang merapikan kabel di rak.', 'Warnet lumpuh total sejak rak dirapikan. Semua lampu switch berkedip.'],
    ask: ['Cari penyebabnya di rak (switch SG-1016M) dan pulihkan jaringan.', 'Spanning-tree switch harus aktif lagi dan konfigurasi disimpan. Uji dari PC booth.'],
  },
};

export const TPL_IDS = Object.keys(FIELD_TPLS) as FieldTplId[];
