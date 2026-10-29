# Kota Nusantara — Simulasi TKJ 3D (Three.js)

Game 3D berbasis browser untuk siswa SMK TKJ kelas 10/11. Pemain magang di **Nusantara Tech Hotel & Office**, gedung 8 lantai di tengah kota fiktif bergaya Jakarta (400 × 300 m), lalu mengerjakan misi jaringan komputer yang diselaraskan dengan CP TKJ Fase E/F.

**▶ Main langsung di browser:** https://tkjsimulator.my.id/ (cadangan: https://bahtiarindra32-spec.github.io/TKJSIMULATOR/)

README ini hanya mencatat apa yang **sudah dibuat dan sudah diuji** (status 29 Oktober 2026).

---

## 1. Tech stack

| Bagian | Yang dipakai |
|---|---|
| Bahasa | TypeScript 6 (strict, `tsc --noEmit` lolos) |
| Rendering 3D | Three.js 0.186 (WebGL, tanpa engine/framework lain) |
| Build tool | Vite 8 (build ES module) + konfigurasi kedua untuk build IIFE/classic |
| Paket single-file | `tools/make_single.py`: CSS dan JS dijadikan satu `index.html` (target es2018) yang bisa dibuka offline |
| Karakter | Humanoid 17 tulang dengan skinning di vertex shader (bukan `SkinnedMesh`, karena crash di SwiftShader) |
| Fisika | Kolisi AABB buatan sendiri + grid spasial 8 m (tanpa library fisika) |
| Aset | Semua model dibuat prosedural dari kode (geometri Three.js), tanpa file model atau font eksternal |
| Ekspor | GLTFExporter (tombol Ekspor GLB, nama objek ikut terbawa untuk Blender/Meshy) |
| QA otomatis | Playwright + Chromium + SwiftShader (headless), skrip di `tools/qa/` |
| Hosting | GitHub Pages dari folder `docs/` (branch `main`) |

Dependensi runtime hanya `three`. Dev: `typescript`, `vite`, `@types/three`.

## 2. Skill (specialty) yang dipakai saat membangun

- `threejs-world`: perancangan dunia/kota, hierarki objek, penamaan, dan zona.
- `web-game-foundations`: game loop, input, state, save, dan struktur proyek.
- `three-webgl-game`: performa WebGL, kamera, bayangan, anti-flicker, dan kolisi.
- `game-playtest`: playtest otomatis dengan Playwright, screenshot, dan audit kolisi/jangkauan.

Dokumen sumber: PDF "Prompt Pascal Kota Nusantara" milik pengguna (`.world/source-pascal-prompt.md`). PDF ini **diaudit**, tidak diikuti mentah (lihat bagian 6). Tag CP mengacu pada dokumen CP TKJ Fase F (BSKAP), salinan dari situs SMKN 1 Pogalan:
https://huda.smkn1pogalan.sch.id/wp-content/uploads/2024/08/Fase-F-SMK-TKJ.pdf

## 3. Menjalankan

```bash
npm install
npm run dev                                # http://localhost:5173
npm run build                              # tsc + build ke dist/
npx vite build -c vite.single.config.ts    # build classic/IIFE ke dist-classic/
python3 tools/make_single.py               # gabung jadi satu index.html offline
```

Cara cepat tanpa install: buka `single/index.html` langsung di browser (Chrome/Edge).

## 4. Kontrol

| Tombol | Fungsi |
|---|---|
| Klik + tarik, roda mouse | Orbit dan zoom di mode tampilan |
| MASUK KOTA | Masuk mode jalan kaki di depan hotel |
| W A S D / panah | Jalan dan menoleh (gerak dan tolehan halus, dengan akselerasi) |
| Mouse | Menoleh |
| Shift | Lari |
| Spasi | Lompat (bisa juga jatuh dari pinggiran) |
| V | Ganti kamera orang pertama / orang ketiga (avatar siswa terlihat) |
| F | Buka PC, buka/tutup pintu engsel, Lemari Alat (Workshop), Rak MDF (Ruang Server L1), Rak IDF (ruang IDF L2/L3), Papan kerja (meja NOC) |
| E / Q | Naik/turun di lift atau tangga (animasi perjalanan + indikator lantai) |
| T | Papan kerja NOC: ambil surat kerja, mulai shift, lacak pekerjaan |
| C | Cek fisik di meja: konektor, LED link, LAN tester, patch cord, pasang toner di outlet, tempel label outlet |
| M | Peta besar (minimap selalu tampil) |
| Z | Tampilkan 12 zona kota |
| G atau `?low` | Mode grafis ringan |
| R | Wi-Fi analyzer (RSSI, kanal, AP tetangga) di lantai hotel L4–L8 |
| Esc | Keluar dari mode jalan / tutup jendela |

**HP / tablet:** joystick di kiri, geser layar untuk menoleh, tombol F (label berubah sesuai objek), Lompat, Lari, E/Q, dan bar atas Kerja/Cek/Wi-Fi/Kamera/Peta/Full/Keluar. Android langsung full layar saat MASUK KOTA. iPhone: Bagikan → "Tambah ke Layar Utama", lalu buka dari ikon supaya tanpa search bar.

## 5. Yang sudah dibuat ✅

### Kota (Fase A–C, E–G dari PDF)
- ✅ Jalan arteri (gaya Sudirman/Thamrin), kolektor, gang kampung, trotoar, kerb hitam-putih, median, marka, 12 zebra cross, dan JPO dengan tangga sesuai batas kemiringan.
- ✅ 12 zona: CBD (menara), apartemen, ruko, minimarket, bank, masjid, pasar, warung, 52 rumah kampung, taman, dan lahan cadangan.
- ✅ Properti jalan: lampu jalan, lampu lalu lintas bersiklus, rambu, tiang listrik + kabel, halte, pohon, billboard, gapura, pos ronda, gerobak.
- ✅ Penunjuk arah: panah lajur (lalu lintas kiri), papan nama jalan di tiap simpang, rambu petunjuk hijau, minimap + peta besar.
- ✅ Lalu lintas: kendaraan berjalan di lajur kiri dan berhenti di lampu merah atau saat ada pemain di lajurnya, plus pejalan kaki.

### Kendaraan & orang
- ✅ Kendaraan khas Indonesia: skuter gaya BeAT dengan pengendara, MPV, sedan, hatchback, taksi biru, mikrolet M01, dan bus TransJakarta (roda berputar).
- ✅ Orang: 9 jenis pakaian Indonesia, pose jalan, diam, duduk, dan mengetik.

### Gedung Nusantara Tech Hotel (Fase D)
- ✅ 8 lantai + atap + eksterior. Pintu lobi kaca geser otomatis, pintu engsel manual (F) yang beranimasi dan padat saat tertutup.
- ✅ Lantai 1 lengkap: lobi & resepsionis (marmer), lounge, workshop TKJ, ruang IT/NOC dengan video wall, ruang server (rak 42U, switch, router, patch panel, ODF, PDU, server, UPS), toilet, poster T568B/OSI/K3/topologi, papan arah.
- ✅ Lantai 2–3 kantor: 24 meja dengan PC dan IP phone, AP di plafon, printer, outlet RJ45, ruang meeting (TV, floor box, conference phone), rak penyimpanan.
- ✅ Lantai 4–8 hotel: 8 kamar per lantai (kamar mandi, kasur, TV + STB IPTV, meja + laptop, AP dinding, outlet RJ45, AC split), AP plafon dan CCTV IP di koridor, rak housekeeping.
- ✅ Lift dan tangga dengan animasi naik/turun (overlay pintu lift dan indikator lantai).

### Perangkat jaringan (`src/assets/netdevices.ts`)
- ✅ Sekitar 50 perangkat berukuran nyata: rak 42U, switch 24 port, router, patch panel, ODF, PDU, server, UPS, AP, ONT, ODP, crimper, LAN tester, stripper, punch down, RJ45, dus kabel UTP, multimeter, matras ESD, monitor/PC/laptop, telepon VoIP, cable tray, APAR, rambu K3.

### PC yang bisa dibuka: OS "Jendela 11" (`src/pcos/`)
- ✅ 98 PC/laptop di gedung bisa dibuka dengan F.
- ✅ OS mirip Windows 11 dengan merek sendiri: layar kunci, desktop, Start, taskbar, Settings, Notepad, Run.
- ✅ CMD yang bisa diketik: `ipconfig` (`/all`, `/release`, `/renew`, `/flushdns`), `ping` (`-n`, `-t`, `-l`), `tracert`, `nslookup`, `arp -a`, `route print`, `netsh int ip show config`, `getmac`, dll.
- ✅ Network Connections, Status/Details, Properties, dan dialog IPv4 dengan validasi ala Windows.
- ✅ Browser "Tepi": WebKonfig router, halaman server, printer, halaman internet, dan halaman error.
- ✅ Simulasi jaringan (`net.ts`): lab 192.168.10.0/24, kantor 192.168.20.0/24, tamu 172.16.4.0/22, adapter per PC, lease DHCP, ping, resolve DNS, dan hop.

### Pekerjaan jaringan (tanpa kuis, bisa diulang) — `src/game/noc.ts`
Semua pekerjaan datang dari **Papan Kerja NOC** (T, atau F di meja NOC). Rantai misi kuis lama sudah tidak dipakai.

**Surat kerja (kontrak acak).** Tiap kali diambil, lokasi, PC, alamat IP, subnet, nama, dan kejutannya berbeda:

| Surat kerja | Yang dikerjakan pemain | Terbuka |
|---|---|---|
| Pasang IP Statis | Isi IPv4 statis persis surat kerja di 2–3 PC, uji dari tiap PC | Magang |
| Sambungkan Meja Baru | Pasang patch cord di meja, pasang toner di outlet tanpa label, sapu probe di patch panel rak lantai itu, patch ke port switch di surat kerja, `switchport access vlan` + `no shutdown` lewat console, tempel label outlet, uji DHCP | Magang |
| Nama untuk Server Intranet | Tambah record DNS di router (WebKonfig), perbaiki PC yang memakai DNS publik, buka nama itu di browser | Teknisi Junior |
| Pasang Router Baru & DHCP | Router setelan pabrik 192.168.88.1: IP statis sementara di PC, ganti alamat LAN (koneksi putus!), pindah subnet, atur DHCP & DNS, kembalikan PC ke DHCP, renew, uji | Teknisi Junior |
| Pindahkan Meja ke VLAN Kasir | `vlan 30` / `name KASIR` / `switchport access vlan 30` di switch lantai, renew, buka server POS 192.168.30.10 | Teknisi |

**Shift helpdesk.** 3–5 tiket gangguan nyata dengan SLA: konektor longgar, patch cord rusak (LAN tester: pin 3 & 6 putus), port switch shutdown, port di VLAN salah, patch cord di rak tercabut, uplink lantai putus (fiber longgar / Gi1/0/49 shutdown / VLAN tidak diizinkan di trunk), loop antar-port switch (badai broadcast + log MAC flapping), adapter disabled, DHCP release, IP salah subnet, gateway salah, DNS salah, IP bentrok.

**Aturan dunia nyata**
- Pemain harus berjalan ke lokasinya: PC (duduk, layar penuh), Lemari Alat di Workshop TKJ, Rak MDF di Ruang Server L1, Rak IDF di ruang IDF lantai 2 dan 3. Penanda hanya menunjuk arah.
- Alat fisik: toner + probe, LAN tester, kabel console USB–RJ45, laptop teknisi, patch cord (stok habis pakai). Tanpa console + laptop, switch tidak bisa dikonfigurasi.
- Switch per lantai (SW-L1/L2/L3, 48 port) dengan CLI mirip Cisco IOS: `enable`, `conf t`, `interface [range] gi1/0/N`, `shutdown`, `switchport access vlan`, `vlan`/`name`, `show interfaces status`, `show vlan brief`, `show mac address-table`, `show running-config`, `write memory`, singkatan (`sh vl br`), `?`, dan pesan error IOS. LED port di rak mengikuti status.
- Router tiap segmen bisa diubah di WebKonfig: alamat LAN, DHCP server (pool, gateway, DNS, lease, daftar lease), DNS forwarder (upstream, Allow Remote Requests, record A).
- Klien DHCP menyimpan lease lama sampai renew; lease dari subnet lama ditolak dan klien mencoba ulang sendiri (±60 detik). Lepas/colok kabel atau enable adapter = minta alamat baru. IP bentrok antar-PC terdeteksi.
- Pekerjaan selesai hanya kalau jaringan benar-benar sesuai **dan** pemain menguji dari PC terdampak (ping/browser).
- Laporan kerja dibuat otomatis dari aksi pemain (perintah, pengaturan, aksi fisik). Bintang 1–3: SLA, tidak ada perangkat lain yang ikut putus, tanpa material terbuang + konfigurasi switch disimpan.
- Konsekuensi: PC lain yang tadinya normal lalu putus karena ulah pemain masuk sebagai **keluhan susulan** yang harus diperbaiki. Perubahan jaringan bertahan sepanjang sesi (mis. PC yang dipindah ke VLAN kasir tetap di sana).
- Briefing Kak Rani muncul saat pertama kali mengambil tiap jenis surat kerja. XP dan pangkat Magang → Teknisi Junior → Teknisi → Network Engineer tersimpan di `localStorage` (`kotaNusantara.noc.v1`).

### Pengkabelan terstruktur (TIA-568)
- Meja → patch cord → outlet dinding → kabel horizontal → patch panel di rak lantai → patch cord → port switch. Nomor outlet = nomor port patch panel (contoh `L2-07`); nomor port switch berbeda, seperti di gedung nyata. Tiap 4 outlet ada 1 outlet cadangan.
- Rak MDF di ruang server L1 (SW-L1, inti). Rak IDF di ruang IDF L2 dan L3 (SW-L2, SW-L3), uplink fiber Gi1/0/49 (trunk 802.1Q) ke MDF.
- Rak: patch panel 48 port + switch 48 port bisa diklik. Klik port patch panel lalu port switch untuk memasang patch cord; cabut patch cord; cabut kabel loop; pasang ulang fiber uplink.
- Toner + probe: pasang toner di outlet meja, nyalakan probe di rak, sapu port patch panel. Port yang benar berbunyi keras, port sebelahnya samar (induksi), dan nadanya melemah kalau port itu sudah tersambung ke port switch yang aktif.
- Console switch: `interface gi1/0/49`, `switchport mode trunk`, `switchport trunk allowed vlan [add|remove|except|all|none] ...`, `show interfaces trunk`, dan log `%SW_MATM-4-MACFLAP_NOTIF` saat ada loop.

### Wi-Fi hotel L4–L8 (`src/pcos/wifi.ts`)
- ✅ AP koridor ber-PoE di switch lantai, VLAN 40, SSID `Nusantara-Guest`, RSSI dan tumpang-tindih kanal (termasuk AP tetangga luar).
- ✅ Wi-Fi analyzer (R), `netsh wlan show interfaces`, kontroler NusaWLC di `http://192.168.10.20` (adopsi AP, kanal, daya), captive portal nomor kamar + nama belakang.
- ✅ Tiket portal, PoE/port AP, RF/kanal, pool DHCP penuh, dan surat kerja pasang/ganti AP.

### Kamera, gerak, grafik
- ✅ Prompt interaksi melayang di dekat objek ("[F] Buka pintu", "[F] Nyalakan PC", lift, rak).
- ✅ Animasi duduk/berdiri di kursi PC; PC terbuka setelah duduk.
- ✅ Lift dengan kabin, pintu buka/tutup, dan indikator lantai yang bergerak halus (tanpa kedip); tangga dengan animasi naik/turun.
- ✅ Ruang server punya ramp di pintu, tidak lagi terjebak di dalam.
- ✅ Kontrol sentuh dan tata letak HP (landscape dan portrait), jendela PC otomatis penuh di layar kecil, PWA manifest.
- ✅ Anti-cache: build ID + `version.json`, halaman reload sendiri kalau ada versi baru; save rusak/format lama dibersihkan.
- ✅ Orang pertama/ketiga. Kamera orang ketiga berhenti sebelum tembok/plafon, dan arah pitch-nya sudah diperbaiki.
- ✅ Kolisi otomatis untuk semua mesh padat ≥ 25 cm (audit: 76 gedung kota dan 30 properti jalan tertutup kolider).
- ✅ Anti-flicker (shadow frustum di-snap, near/far kamera dinamis, polygonOffset lantai/marka), GTAO, dan mode ringan.
- ✅ Loading screen dengan penjaga error WebGL. Tidak ada resource jaringan eksternal (aman offline).

## 6. Perubahan dari PDF (hasil audit)
1. Trotoar arteri 3 m menjadi 5 m (pedoman kawasan bisnis), lebar Sudirman/Thamrin menjadi 26 m.
2. Zebra cross tengah ruas X=140 dan X=260 dihapus (arteri terbagi < 300 m dari simpang). Penyeberangan lewat JPO, total zebra 12.
3. Tangga JPO: run 15,5 m untuk naik 5,5 m (±19,5°, maks 20°), lebar 2 m.
4. Halte dipindah ke sisi luar trotoar sehingga jalur pejalan 3,5 m tetap bebas.
5. Curtain wall lobi dipotong karena bertabrakan dengan pintu utama 3 m di PDF.
6. Workshop TKJ memakai lantai keramik/vinyl, bukan karpet.

## 7. Struktur folder

```
kota-nusantara/
├─ index.html, package.json, tsconfig.json
├─ vite.config.ts            build ES module
├─ vite.single.config.ts     build classic/IIFE
├─ src/
│  ├─ main.ts                UI, mode jalan, kamera, interaksi, ekspor GLB, hook tes window.__kota
│  ├─ data/city.ts           semua koordinat jalan, zona, gedung, level hotel, anchor, spawn
│  ├─ world/                 core, roads, buildings, hotel, props, wayfinding, interiorDressing
│  ├─ assets/                netdevices, vehicles, people
│  ├─ game/                  physics, traffic, missionSystem, missionLogic, missions, missionsF
│  ├─ ui/                    minimap, missionUI, waypoint, mission.css
│  └─ pcos/                  net.ts (simulasi jaringan), os.ts (Jendela 11), pcos.css
├─ dev/                      halaman pamer: devices, vehicles, people, missions
├─ single/index.html         build satu file, siap dibuka offline
├─ tools/
│  ├─ make_single.py         pembuat index.html satu file
│  ├─ reach_png.py           visualisasi peta jangkauan lantai
│  └─ qa/*.mjs               skrip Playwright (play, qa_v4, qa_tp, qa_pcos, qa_reach, qa_near, ...)
└─ design/                   dokumen desain (.world): prompt sumber, expanded prompt, scene summary, laporan validasi
```

Konversi koordinat: `three.x = X − 200`, `three.z = Z − 150` (X/Z = koordinat tabel PDF).
Semua nama objek dari PDF (ROAD_, ZONE_, BLD_, PROP_, ANCHOR_, ...) dipertahankan di objek Three.js.

## 8. Validasi terakhir (29 Okt 2026)
- Update mobile/lift/Wi-Fi: `tsc` lolos; playtest `tools/qa/qa_v6.mjs` lolos untuk keluar-masuk ruang server, prompt pintu, duduk/berdiri, lift L1→L2 (kabin naik halus 0,12→4,12 m tanpa teleport), dan pembersihan save; `qa_mobile.mjs` (sentuh, 844×390 dan 390×844) lolos: joystick menggerakkan pemain, tombol F membuka PC.
- `npx tsc --noEmit` lolos, `vite build` lolos, build single-file lolos.
- Playtest otomatis `tools/qa/qa_jobs.mjs` dengan input nyata (jalan ke lokasi, F/C, mengetik di CMD, form IPv4, WebKonfig, console switch): kelima surat kerja selesai bintang 3; shift 4 tiket (konektor, patch cord rusak, port shutdown, VLAN salah) selesai; uji "sengaja merusak" (shutdown port PC lain) menurunkan bintang dan memunculkan keluhan susulan yang lalu diperbaiki. Tanpa page error.
