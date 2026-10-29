# Kota Nusantara — Simulasi TKJ 3D (Three.js)

Game 3D berbasis browser untuk siswa SMK TKJ kelas 10/11. Pemain magang di **Nusantara Tech Hotel & Office**, gedung 8 lantai di tengah kota fiktif bergaya Jakarta (400 × 300 m), lalu mengerjakan misi jaringan komputer yang diselaraskan dengan CP TKJ Fase E/F.

README ini hanya mencatat apa yang **sudah dibuat dan sudah diuji** (status 28 Oktober 2026, versi v4).

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
| Berbagi link | Python `http.server` + Cloudflare quick tunnel (`cloudflared`) |

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
| F | Interaksi misi, buka/tutup pintu engsel (beranimasi), buka PC |
| E / Q | Naik/turun di lift atau tangga (animasi perjalanan + indikator lantai) |
| T | Papan Tiket NOC (mulai shift, lacak tiket) |
| C | Cek fisik: kabel di dekat PC, atau port switch di rak ruang server L1 (saat ada tiket) |
| J | Buku Misi |
| M | Peta besar (minimap selalu tampil) |
| Z | Tampilkan 12 zona kota |
| G atau `?low` | Mode grafis ringan |
| Esc | Keluar dari mode jalan / tutup jendela |

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

### Misi (13 misi berurutan)
| No | Misi | Fase |
|---|---|---|
| 1 | K3 Dulu, Baru Kerja (APD & 5R) | E |
| 2 | Crimping Kabel Straight (T568B + LAN tester) | E |
| 3 | Atur IP & Ping Server | E |
| 4 | Hitung Subnet untuk Hotel | F |
| 5 | Wi-Fi tamu | F |
| 6 | DHCP | F |
| 7 | DNS | F |
| 8 | VLAN: pisahkan jaringan | F |
| 9 | NAT & routing | F |
| 10 | Firewall & keamanan | F |
| 11 | VoIP | F |
| 12 | Fiber optic | F |
| 13 | Cek UPS & suhu ruang server (18–27 °C) | F |

- ✅ Pelacak misi, penanda 3D + jarak, waypoint, Buku Misi (J), dan tag elemen CP per misi.
- ✅ Progres tersimpan di `localStorage` (`kotaNusantara.missions.v2`).

### Shift Helpdesk NOC (loop misi tanpa batas) — `src/game/noc.ts`
- ✅ Shift berisi 3–5 tiket gangguan **nyata** yang disuntikkan ke simulasi jaringan PC (bukan kuis): kabel UTP lepas, adapter di-disable, DHCP terlepas, IP statis salah subnet, gateway salah, DNS salah, port switch shutdown, IP bentrok.
- ✅ Tiap tiket punya pelapor, lokasi PC (L1–L8), keluhan berupa gejala, prioritas, dan SLA (4/7/10 menit). Penanda 3D, waypoint lintas lantai, dan minimap mengarah ke PC yang dilacak.
- ✅ Perbaikan dilakukan seperti di dunia nyata: lewat CMD/Network Connections/IPv4 di Jendela 11, atau fisik dengan **C** (colok ulang RJ45 di PC, `no shutdown` port switch di rak server).
- ✅ Verifikasi otomatis: tiket baru tertutup kalau PC benar-benar sehat (IP valid, gateway, DNS, internet) **dan** siswa menguji dari PC itu (ping atau browser).
- ✅ Laporan penyebab utama (pilihan), XP (SLA, langkah tidak perlu, laporan tepat), pangkat Magang → Teknisi Junior → Teknisi → Network Engineer. Gangguan baru terbuka per pangkat, dan mulai pangkat Teknisi ada tiket dengan 2 penyebab.
- ✅ Gangguan yang sering salah lebih sering muncul (bobot penguasaan per jenis gangguan). Progres tersimpan di `localStorage` (`kotaNusantara.noc.v1`).
- ✅ Dibuka lewat **T** di mana saja atau **F** di meja NOC.

### Kamera, gerak, grafik
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

## 8. Validasi terakhir (28 Okt 2026)
- `npx tsc --noEmit` lolos, `vite build` lolos, build single-file lolos.
- Playwright: 13 misi terdeteksi, lift L1→L2 bergerak bertahap, pintu buka 1.00 lalu tutup 0.00, tidak ada page error.
- Audit kolider kota dan properti jalan: 0 mesh padat yang terlewat.
- Shift NOC (`tools/qa/qa_noc.mjs`): 4 tiket (kabel, port switch, DNS, DHCP) rusak di awal, diperbaiki lewat input nyata (C, CMD `ipconfig /renew`, ping), keempatnya tertutup, laporan tepat, naik pangkat ke Teknisi Junior, rekap shift muncul, tanpa page error.
