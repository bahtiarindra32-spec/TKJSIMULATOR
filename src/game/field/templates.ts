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
  /** what the customer asks for (fixed lines; a MikroTik order adds its per-order values when it is taken) */
  ask: string[];
  /** Fase 2: the job is done on the site's MikroTik router (graded from its configuration state) */
  ros?: boolean;
  /** Fase 3: the job is done on the house fibre (graded from the ftth engine: ONT online, Rx green, port as the ODP data) */
  ftth?: boolean;
}

/** customer per site: who calls and where to go (fictional addresses on the real map streets) */
export const CUSTOMER: Record<Cust, { who: string; address: string; place: string }> = {
  rumah: { who: 'Pak Hendra (pemilik rumah)', address: 'Jl. Flamboyan No. 17 (sisi selatan)', place: 'Rumah Kel. Hendra' },
  kos: { who: 'Bu Sri (pemilik Kos Mawar)', address: 'Jl. Anggrek No. 7 (sisi utara)', place: 'Kos Mawar' },
  warnet: { who: 'Koh Andi (pemilik Warnet Sinar)', address: 'Jl. Anggrek No. 31 (sisi utara)', place: 'Warnet Sinar' },
};

const CRIMP = 'Crimping RJ45 Rp50–100 rb/titik [42]';
const ROUTER = 'Instalasi router + konfigurasi dasar Rp150–300 rb [42]';
const HOTSPOT = 'Setting hotspot MikroTik + voucher Rp250–700 rb [44]';
/** research §4.1 has only a floor for fibre work ("mulai Rp45 rb/titik", unit unclear [47]); the top of each range is ⚠ design */
const FO = 'Instalasi FO (splicing, OTDR) mulai Rp45 rb/titik [47]; batas atas perkiraan desain';
const FTTH_DONE = 'Selesai kalau ONT online, Rx di ONT hijau (−13 s/d −24 dBm), lalu internet diuji dari laptop keluarga (ping / buka situs).';

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
  // ---- Fase 2: MikroTik (warnet RB951Ui-2HnD, kos hAP lite). Reputasi gates only (no extra rank: field work itself is
  // the Fase 1 unlock); the minimums are design numbers (DESIGN.md › Fase 2 orders).
  w_hotspot: {
    id: 'w_hotspot', cust: 'warnet', title: 'Pasang hotspot voucher MikroTik', tarif: [250_000, 700_000], tarifSrc: HOTSPOT, minRep: 60, sla: 1500, weight: 0.8, ros: true,
    say: ['Saya mau jual voucher internet per jam. Pelanggan login dulu sebelum main, kecepatannya dibatasi per voucher.', 'Mulai minggu depan warnet pakai sistem voucher. Tolong pasang login hotspot di router MikroTik-nya.'],
    ask: ['Pasang hotspot MikroTik di LAN warnet (interface bridge-lan, gateway tetap 192.168.100.1/24) lewat Winbox/WebFig dari PC warnet.', 'Buat user hotspot (voucher) sesuai daftar di bawah, semua memakai satu user profile dengan batas kecepatan yang diminta.', 'Uji login pakai salah satu voucher dari PC booth yang ditunjuk, lalu buka situs.'],
  },
  k_queue: {
    id: 'k_queue', cust: 'kos', title: 'Bagi bandwidth per kamar (simple queue)', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 50, sla: 1300, weight: 0.9, ros: true,
    say: ['Satu penghuni download terus, yang lain jadi lemot. Saya mau tiap kamar dapat jatah yang sama.', 'Internet kos sering habis dipakai satu-dua kamar. Tolong dibatasi per kamar di router.'],
    ask: ['Buat simple queue di router kos (hAP lite) untuk laptop tiap kamar yang tercantum, satu queue per kamar (target = alamat laptop itu).', 'Batas kecepatan per kamar sesuai di bawah (upload/download dari sisi penghuni).', 'Uji dari laptop penghuni yang ditunjuk: buka speedtest.cari.id, hasilnya harus sesuai batas.'],
  },
  k_fasttrack: {
    id: 'k_fasttrack', cust: 'kos', title: 'Limit per kamar tidak jalan', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 55, sla: 1200, weight: 0.8, ros: true,
    say: ['Teknisi sebelumnya sudah pasang limit per kamar, tapi penghuni masih bisa download kencang sekali. Limitnya seperti tidak ada.', 'Katanya sudah dibatasi per kamar, tapi speedtest penghuni tetap penuh. Tolong dicek routernya.'],
    ask: ['Cari kenapa simple queue di router kos tidak membatasi. Jangan ubah batas per kamar yang sudah disepakati.', 'Uji dari laptop penghuni yang ditunjuk: buka speedtest.cari.id, hasilnya harus sesuai batas.'],
  },
  w_reset: {
    id: 'w_reset', cust: 'warnet', title: 'Internet warnet mati setelah router direset', tarif: [150_000, 300_000], tarifSrc: ROUTER, minRep: 50, sla: 1300, weight: 0.9, ros: true,
    say: ['Tadi keponakan saya tekan lama tombol reset di router. Sekarang PC dapat IP aneh 192.168.88 dan semuanya tidak bisa internet.', 'Router warnet ke-reset waktu listrik naik-turun dan ada yang pencet tombol reset. Semua PC tidak bisa internet.'],
    ask: ['Kembalikan konfigurasi router MikroTik warnet seperti sebelum reset (Winbox/WebFig dari PC warnet).', 'Data dari ISP & catatan teknisi lama ada di bawah. Kalau di router masih ada file backup, boleh dipakai.', 'Uji dari PC booth yang ditunjuk; PC lain juga harus normal lagi.'],
  },
  // ---- Fase 3: FTTH faults on the house line (ODP-FLB-01 → drop → roset → ONT). Graded from the ftth engine state (simftth.ts).
  f_drop_putus: {
    id: 'f_drop_putus', cust: 'rumah', title: 'Internet mati, LOS merah (kabel drop)', tarif: [45_000, 150_000], tarifSrc: FO, minRep: 55, sla: 1600, weight: 0.8, ftth: true,
    say: ['Internet mati total sejak tadi pagi, lampu LOS di modem merah. Semalam ada truk tinggi lewat, kabel hitam di depan rumah sempat tersangkut.', 'Wi-Fi tersambung tapi tidak ada internet. Lampu LOS di ONT merah terus, kabel dari tiang kelihatan kendur.'],
    ask: ['Cari titik gangguan di jalur fiber rumah (drop dari ODP-FLB-01 di tiang depan rumah sampai roset). Alat fiber dipinjam di lemari Nusa Teknik.', 'Kabel putus disambung dengan fusion splicer; sleeve pelindung dihitung sebagai material. Naik tiang dengan APD lengkap.', FTTH_DONE],
  },
  f_konektor_kotor: {
    id: 'f_konektor_kotor', cust: 'rumah', title: 'Internet mati setelah kabel fiber dicabut-colok', tarif: [45_000, 100_000], tarifSrc: FO, minRep: 0, sla: 1400, weight: 0.9, ftth: true,
    say: ['Kemarin ONT dipindah waktu bersih-bersih, kabel kuningnya dicabut lalu dicolok lagi. Sekarang lampu LOS merah.', 'Internet mati, lampu LOS di ONT merah. Kemarin ada petugas yang membuka box di tiang depan rumah.'],
    ask: ['Ukur daya optik (OPM) di roset dan di port ODP, cari sambungan konektor yang kotor.', 'Bersihkan konektor dengan kit pembersih (alkohol IPA + tisu lint-free) sebelum dicolok lagi.', FTTH_DONE],
  },
  f_macrobend: {
    id: 'f_macrobend', cust: 'rumah', title: 'Internet lambat & sering putus (Rx lemah)', tarif: [45_000, 100_000], tarifSrc: FO, minRep: 50, sla: 1400, weight: 0.8, ftth: true,
    say: ['Internet lambat dan sering putus sejak bufet di ruang tamu digeser. Kabel kuning di dekat roset tertekuk-tekuk.', 'Internet kadang jalan kadang putus. Anak saya merapikan kabel di belakang bufet pakai cable ties.'],
    ask: ['Cari penyebab redaman tinggi di sisi pelanggan: OPM (bandingkan 1310/1550 nm), VFL, atau OTDR.', 'Rapikan tekukan kabel di titik yang ketemu (jari-jari tekukan jangan terlalu kecil).', FTTH_DONE],
  },
  f_port_salah: {
    id: 'f_port_salah', cust: 'rumah', title: 'Internet mati setelah tetangga pasang baru', tarif: [45_000, 100_000], tarifSrc: FO, minRep: 0, sla: 1400, weight: 0.8, ftth: true,
    say: ['Kemarin teknisi memasang internet di rumah tetangga dan naik ke box di tiang depan. Sejak itu internet kami mati, LOS merah.', 'Sejak tetangga pasang internet baru kemarin sore, ONT kami lampu LOS-nya merah terus.'],
    ask: ['Periksa drop rumah di ODP-FLB-01 (tiang depan rumah, naik dengan APD lengkap). Port yang benar ada di data ODP di bawah.', 'Bersihkan konektor sebelum dicolok ke port, pasang lagi tutup debu port yang kosong.', FTTH_DONE],
  },
};

export const TPL_IDS = Object.keys(FIELD_TPLS) as FieldTplId[];
