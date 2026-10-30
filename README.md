# Kota Nusantara — Simulasi TKJ 3D (Three.js)

Game 3D berbasis browser untuk siswa SMK TKJ kelas 10/11. Pemain magang di **Nusantara Tech Hotel & Office**, gedung 8 lantai di tengah kota fiktif bergaya Jakarta (400 × 300 m), lalu mengerjakan misi jaringan komputer yang diselaraskan dengan CP TKJ Fase E/F.

**▶ Main langsung di browser:** https://bahtiarindra32-spec.github.io/TKJSIMULATOR/

README ini hanya mencatat apa yang **sudah dibuat dan sudah diuji** (status 30 Oktober 2026).

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
| Spasi | Lompat (bisa juga jatuh dari pinggiran). Saat jongkok: berdiri. Saat naik motor: rem belakang |
| X | Jongkok / berdiri (C sudah dipakai untuk Cek, Z untuk zona). Jalan pelan ±1,1 m/s, tidak bisa lari; tidak bisa berdiri kalau ada halangan di atas kepala |
| V | Ganti kamera orang pertama / orang ketiga (avatar siswa terlihat) |
| F | Buka PC, buka/tutup pintu engsel, Lemari Alat (Workshop), Rak MDF (Ruang Server L1), Rak IDF (ruang IDF L2/L3), Papan kerja (meja NOC), Rak 1 router edge, Rak 2 server Linux, Rak 3 NAS, panel printer, telepon IP |
| F (dekat motor) | Naik motor / turun (kalau masih melaju, motor direm otomatis dulu, lalu pemain turun di sisi yang kosong) |
| E / Q | Di pintu tangga: naik/turun satu lantai. Di pintu lift: panel lift (tombol 1–8 atau ketuk lantai, E/Q satu lantai, Esc batal) |
| T | Papan kerja NOC: ambil surat kerja, mulai shift, lacak pekerjaan |
| C | Cek fisik di meja: konektor, LED link, LAN tester, patch cord, pasang toner di outlet, tempel label outlet |
| M | Peta besar (minimap selalu tampil) |
| Z | Tampilkan 12 zona kota |
| G / tombol Grafik | Ganti kualitas: Tinggi, Sedang, Rendah, Hemat. `?low` atau perangkat sentuh mulai dari Rendah, `?q=hemat` memaksa level |
| Esc | Keluar dari mode jalan / tutup jendela (kalau sedang naik motor, motor diparkir di tempat) |

**Saat naik Motor Matic:** W / ↑ gas · S / ↓ rem, kalau sudah berhenti tahan untuk mundur pelan · A / D (← / →) belok · Spasi rem belakang · mouse atau tarik layar untuk melihat sekeliling (kembali ke tengah sendiri saat melaju) · V kamera kejar / mata pengendara · F turun · R kembalikan motor ke jalan terdekat.

**Sentuh:** tombol Jongkok di kanan bawah. Saat naik motor: joystick kiri = belok + gas (dorong ke atas) / rem-mundur (tarik ke bawah), tombol Gas, Rem, Turun, Reset. Melepas joystick atau menggeser jari keluar dari tombol Gas langsung menghentikan gas. Saat jendela kehilangan fokus semua tombol dilepas.

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

### Hari pertama: tutorial (pekerjaan fisik, tanpa kuis)
- Pemain baru langsung mendapat surat kerja **Hari Pertama: Sambungkan PC Workshop** (juga ada di papan kerja sampai selesai): ambil LAN tester + patch cord di Lemari Alat, pasang patch cord dan tes kabel (C / tombol Cek), nyalakan PC (F / tombol Aksi), `ipconfig`, lalu `ping` Default Gateway.
- Langkah dicatat dari aksi nyata. Petunjuk Kak Rani hanya muncul saat pemain tampak macet: diam ±8 detik tanpa kemajuan setelah ±22 detik, langkah salah (membuka PC sebelum kabel beres, mengetik perintah lain), atau terlalu lama. Petunjuk naik dari arahan singkat ke langkah rinci dan hilang begitu ada kemajuan. Teks menyesuaikan kontrol sentuh.

### Server Linux srv-nusa (Rak 2, ruang server L1)
- Ubuntu-like, 192.168.10.5 di VLAN lab. Dipakai lewat **console KVM** di rak (F) atau **SSH dari PC** (`ssh teknisi@srv-nusa`, sandi `smkbisa`).
- Layanan benar-benar menjalankan jaringan lab: `isc-dhcp-server` memberi lease lab dari `/etc/dhcp/dhcpd.conf`, `bind9` menjawab zone `lab.smk.local` dari `/etc/bind/db.lab.smk.local` dan meneruskan nama lain ke router-lab, `apache2` menyajikan `http://intranet.lab.smk.local` dari `/var/www/html/index.html`, `ssh`.
- Shell: `ls cd cat grep nano` (editor dengan Ctrl+O/Ctrl+X), `sudo systemctl status|start|stop|restart|reload|enable`, `journalctl -u`, `ip a`, `ip r`, `ss -tlnp`, `ping`, `dig`, `nslookup`, `host`, `named-checkzone`, `named-checkconf`, `dhcpd -t`, `dhcp-lease-list`, `curl`.
- Tiket: layanan mati (bind9/apache2/isc-dhcp-server), record zone salah atau salah ketik yang membuat zone ditolak, scope DHCP salah (range di luar subnet atau `option routers` salah).

### Perangkat kantor L2/L3
- **Printer jaringan** PRN-L2 (192.168.20.50) dan PRN-L3 (192.168.20.51): panel depan (F) untuk IP/mask/gateway, cetak halaman konfigurasi, colok kabel. Di PC: ikon **Printers** atau `control printers`, tambah printer TCP/IP, **Cetak halaman uji**.
- **Telepon IP** di meja kantor: berbagi port switch dengan PC, data di access VLAN 20, suara di **voice VLAN 100**, daya PoE. Layar telepon (F) menunjukkan status pendaftaran; tes panggil ke 9000 (echo) atau ext lain. Switch CLI: `switchport voice vlan 100`, `no switchport voice vlan`, `power inline auto|never`, `show interfaces gi1/0/N` menampilkan voice VLAN dan PoE.
- **NAS nas-kantor** (192.168.20.10, Rak 3 ruang server L1): web admin (layanan SMB, shared folder, hak akses grup staf, buat folder). Di PC: `net use Z: \\nas-kantor\dokumen`, `net use`, `net view`, dengan error Windows asli (53, 67, 5).
- Tiket: printer kembali ke setelan pabrik / kabel lepas, telepon kehilangan voice VLAN / PoE, NAS SMB mati / hak akses hilang / kabel lepas.

### Router edge R-EDGE (Rak 1, ruang server L1)
- Gi0/0 ISP1 (utama), Gi0/1 ISP2 (cadangan), Gi0/2 inside. Semua lalu lintas internet dari PC, laptop tamu, dan srv-nusa melewati router ini: default route + **IP SLA/track** untuk failover, **NAT/PAT overload** di interface keluar, dan **ACL** di interface inside (dibaca dari atas, deny implisit).
- CLI ala Cisco (console + laptop dari Lemari Alat): `show ip interface brief`, `show ip route`, `show ip nat statistics|translations`, `show track`, `show ip sla summary`, `show access-lists`, `show running-config`, `ip route ... [AD] [track N]`, `ip nat inside|outside`, `ip nat inside source list N interface Gi0/X overload`, `access-list N ...`, `ip access-list extended N` + `no <seq>`, `ip access-group N in`, `ip sla N` / `icmp-echo`, `ip sla schedule`, `track N ip sla M reachability`, `ping`, `write memory`.
- Tiket: ISP1 putus dengan failover salah (route utama tanpa track, route cadangan hilang, atau NAT keluar Gi0/1 belum ada), NAT tidak mencakup segmen, ACL memblok segmen/DNS.
- Semua tiket baru di atas hanya tertutup kalau akar masalahnya benar-benar beres di simulasi **dan** pemain menguji dari klien (browser intranet, cetak uji, panggilan telepon, `net use`, ping/situs).

### Jongkok & Motor Matic (30 Okt 2026)
- ✅ Jongkok (X / tombol Jongkok): mata turun halus 1,62 → 1,05 m, kapsul tabrakan 1,75 → 1,25 m, jalan jongkok ±1,1 m/s, pose jongkok + jalan jongkok di kamera orang ketiga. Cek plafon sebelum berdiri. Otomatis berdiri saat duduk di PC, naik tangga/lift, atau naik motor. Meja kantor (daun meja) sekarang padat: tidak bisa ditembus berdiri maupun jongkok (tinggi meja 0,76 m < tinggi jongkok).
- ✅ Motor Matic (`src/game/motor.ts`, model di `src/assets/vehicles.ts`): skuter matic 1:1 (panjang 1,86 m, jarak sumbu roda 1,26 m, jok 0,74–0,80 m) prosedural, tanpa merek. Setang + spakbor depan + roda depan berbelok di sumbu kemudi, standar samping saat parkir, lampu rem menyala saat mengerem, pelat nomor, roda berputar.
- ✅ Diparkir di: `PROP_MOTOR_01–03` di deretan parkir motor depan hotel (X 241,5–243,5 · Z 165, dekat spawn) dan `PROP_MOTOR_04–05` di parkir mobil hotel (X 276,5 / 277,7 · Z 199,5).
- ✅ Fisika arcade yang masuk akal: akselerasi menurun mendekati 85 km/j, rem ±7 m/s², mundur pelan 1,3 m/s, sudut belok dibatasi kecepatan, motor miring saat menikung sesuai kecepatan, mengikuti tinggi aspal/kerb/trotoar (naik kerb ≤ 22 cm), tabrakan dengan gedung/properti/kendaraan/pejalan kaki/motor lain dengan sub-step (tidak tembus di 85 km/j), tidak bisa masuk hotel/tangga JPO, pemulihan otomatis kalau terjepit, R = kembali ke jalan terdekat. Spidometer, suara mesin hasil Web Audio (tanpa file).
- ✅ Saat naik motor: interaksi PC/rak/tangga/cek dimatikan, pemain duduk dengan tangan di setang (ikut berbelok) dan kaki kiri turun saat berhenti.

### Kamera, gerak, grafik
- ✅ Orang pertama/ketiga. Kamera orang ketiga berhenti sebelum tembok/plafon, dan arah pitch-nya sudah diperbaiki.
- ✅ Kolisi otomatis untuk semua mesh padat ≥ 25 cm (audit: 76 gedung kota dan 30 properti jalan tertutup kolider).
- ✅ Anti-flicker (shadow frustum di-snap, near/far kamera dinamis, polygonOffset lantai/marka), GTAO.
- ✅ 4 level grafik: Tinggi (AO + bayangan), Sedang (bayangan), Rendah (tanpa bayangan, jarak pandang 420 m), Hemat (render 0,7× resolusi, jarak pandang 260 m). Pengawas FPS menurunkan satu level otomatis kalau rata-rata < 24 FPS. Di dalam hotel hanya lantai pemain ±1 yang digambar. Kepadatan kendaraan dan pejalan kaki ikut level grafik.
- ✅ Kontrol sentuh: tombol E/Q hanya muncul di depan tangga/lift, panel lift di tengah layar, tombol F berlabel aksi yang tersedia.
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
│  ├─ game/                  physics, traffic, motor (Motor Matic), missionSystem, missionLogic, missions, missionsF
│  ├─ ui/                    minimap, missionUI, waypoint, mission.css
│  └─ pcos/                  net.ts (simulasi jaringan), os.ts (Jendela 11), switchcli.ts, wifi.ts,
│                            linux.ts (srv-nusa), office.ts (printer/telepon/NAS), edge.ts (R-EDGE), term.ts, ext.ts
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

## 8. Validasi terakhir (30 Okt 2026, jongkok + motor)
- `tools/qa/qa_motor.mjs` (keyboard nyata + emulasi sentuh) dan `tools/qa/qa_crouch.mjs`: naik/turun 6×, lari penuh di Jl. Kebon Jeruk, belok kiri/kanan, mundur, 85 km/j ke tembok menara/hotel/median dengan dt 1/30 dan 1/10 (tidak tembus), menabrak mobil dari belakang, naik/turun kerb, mencoba masuk pintu lobi, turun di samping tembok, kamera 1/3, modal/pause, kehilangan fokus, Esc, terjepit, joystick dilepas. Jongkok: kecepatan, kamera, meja, plafon, duduk di PC, tangga, lift, lompat, naik motor.
- Regresi: `qa_v6` (lift memakai panel v8), `qa_v8a`, `qa_hotel walk/cam`, `qa_mobile land/port`, `qa_tutor` lolos.

## 8b. Validasi 30 Okt 2026 (pagi)
- Playwright + SwiftShader, input nyata: `qa_tutor` (tutorial selesai ★★★, petunjuk muncul saat diam/macet), `qa_linux` (ssh, layanan mati, zone, scope DHCP), `qa_office` (printer, telepon, NAS), `qa_edge` (ISP1 failover, NAT, ACL), `qa_v8a` (tangga, lift 1→8→1), `qa_wifi`, `qa_v6`, `qa_mobile` (joystick, tombol F, panel lift disentuh), `qa_jobs` (static, dns). Tanpa page error.
- Performa (844×390, DPR 2, CPU 4× lebih lambat, SwiftShader tanpa GPU): jalan depan hotel 4542 → 851 draw call, 4,18 → 0,90 juta segitiga; lobi 4163 → 590 draw call. Angka FPS SwiftShader (0,38 → 1,0) hanya untuk perbandingan, bukan FPS HP asli.

## 9. Validasi sebelumnya (29 Okt 2026)
- `npx tsc --noEmit` lolos, `vite build` lolos, build single-file lolos.
- Playtest otomatis `tools/qa/qa_jobs.mjs` dengan input nyata (jalan ke lokasi, F/C, mengetik di CMD, form IPv4, WebKonfig, console switch): kelima surat kerja selesai bintang 3; shift 4 tiket (konektor, patch cord rusak, port shutdown, VLAN salah) selesai; uji "sengaja merusak" (shutdown port PC lain) menurunkan bintang dan memunculkan keluhan susulan yang lalu diperbaiki. Tanpa page error.
