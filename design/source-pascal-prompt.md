<!-- Page 1 -->

# Prompt Pascal Editor: Kota Nusantara + Nusantara Tech Hotel &

# Office

Panduan bertahap untuk membangun 1 kota 3D bergaya Jakarta (jalan dengan plugin Streetscape,

gedung, dan properti jalan) sebagai dunia game simulasi TKJ untuk SMK kelas 10/11. Disusun 26

#### Oktober 2026.

## 1. Cara memakai dokumen ini

-**Kirim satu pesan per giliran.** Salin isi satu kotak abu-abu ke chat AI di Pascal, tunggu selesai, periksa hasilnya di layar, baru kirim pesan berikutnya.

-**Jangan kirim seluruh dokumen sekaligus.** Prompt panjang sebelumnya gagal setelah 15 detik. Setiap pesan di sini sengaja kecil agar muat dalam satu giliran.

-**Mulai dari Pesan 0 dan 0B.** Pesan 0 menetapkan aturan dan koordinat. Pesan 0B menyuruh AI mendaftar tool dan katalog yang benar-benar ada di proyekmu, karena saya tidak bisa melihatnya.

-**Jika sebuah pesan gagal,** pecah jadi lebih kecil (misalnya satu objek per pesan). Jangan kirim ulang yang sama.

-**Setelah selesai tiap fase** (A, B, C, ...), simpan atau ekspor proyek bila menu ekspor tersedia.

-**Pesan bertanda (opsional)** boleh dilewati. Urutan A, B, C, D, E, F, G sebaiknya tidak diubah.

## 2. Apa yang sudah dicek dan apa yang belum

**Sudah dicek** (changelog Pascal dan repositori plugin Streetscape): Streetscape menggambar jaringan jalan lurus dan lengkung, mengedit persimpangan dan penampang jalan, serta menyesuaikan jalan dengan terrain. Trotoar, bordes, marka, dan objek pinggir jalan mengikuti jaringan jalan. Ada 38 tipe objek yang bisa diedit, termasuk lampu, rambu, utilitas, drainase, pembatas, dan driveway, plus pembuatan objek pinggir jalan berulang. Editor juga punya tool dinding, slab, atap, pintu, jendela, level, zona, dan penempatan item.

**Belum bisa dipastikan** (proyekmu tidak bisa saya buka): nama persis tiap tool, isi katalog furnitur (rak server, switch, dst.), ada tidaknya pohon dan kendaraan, lampu lalu lintas, batas tinggi level, dan menu ekspor GLB. Karena itu setiap pesan punya aturan substitusi: kalau elemen tidak ada, AI memakai elemen terdekat dan melapor, bukan berhenti.

## 3. Konsep kota dan batasan Pascal

-Kota fiktif ringkas **400 x 300 m** bergaya Jakarta: dua arteri bersilang (Sudirman dan Thamrin), kolektor, kawasan bisnis, hunian, ruko, pasar, masjid, kampung dengan gang, dan taman.

-**Gedung utama** Nusantara Tech Hotel & Office (8 lantai) berdiri di sudut tenggara persimpangan Sudirman x Thamrin. Lantai 1 berisi lobi, kantor IT, Workshop TKJ, dan Ruang Server.

-Gedung lain dibuat sebagai massa sederhana dan **tidak bisa dimasuki** dulu. Lahan cadangan disiapkan supaya nanti kamu bisa menambah gedung yang bisa dimasuki.

-Pascal adalah editor bangunan. **Kendaraan bergerak, NPC, lampu lalu lintas yang berganti warna, dan misi** **dibuat di game** (Three.js), bukan di Pascal. Di Pascal hanya ada properti diam dan penanda posisi (anchor).

-Props jaringan (rak server, switch, PC) di sini berupa placeholder berukuran benar. Model asli dari Meshy nanti menggantikannya, dicocokkan lewat nama objek.

-Flyover ditunda. Sebagai gantinya ada jembatan penyeberangan (JPO) yang lebih mudah dibuat dan khas Jakarta.

Prompt Pascal-Kota Nusantara + Nusantara Tech Hotel & Office Halaman 1

<!-- Page 2 -->

## 4. Peta kota (acuan semua koordinat)

Titik (0,0) di sudut barat laut. X ke timur, Z ke selatan, satuan meter. Sisi depan hotel menghadap utara ke Jl. Sudirman. Lalu lintas jalur kiri.

(0,0) **UTARA (Z = 0)**

|TAMAN KOTA|JL. THAMRIN|||
|---|---|---|---|
|JL. KEBON JERUK|||HUNIAN|
|CBD BARAT||CBD TIMUR|JL. KEMUNING JL. SUDIRMAN|
|RUKO||HOTEL|LAHAN CADANGAN|
|PASAR MASJID JL. CEMPAKA||PARKIR + BLOK HOTEL||
||JL. THAMRIN|LAHAN CADANGAN SELATAN||

**JL. MELATI**

**JL. SUDIRMAN**

**KAMPUNG A**

**KAMPUNG B**

**SELATAN (Z = 300)** (400,300) Jalan Streetscape Gang kampung Gedung Hotel & Office Lahan cadangan

#### Daftar jalan

|Nama|Sumbu (X,Z)|Tipe|Penampang|
|---|---|---|---|
|ROAD_SUDIRMAN|(0,150) - (400,150)|Arteri, median|2 x 2 lajur @3,5 m + median 2 m + trotoar 3 m = 22 m|
|ROAD_THAMRIN|(200,0) - (200,300)|Arteri, median|sama dengan Sudirman, 22 m|
|ROAD_KEBONJERUK|(0,60) - (400,60)|Kolektor|2 lajur @3,5 m + trotoar 2 m = 11 m|
|ROAD_CEMPAKA|(0,240) - (400,240)|Kolektor|sama, 11 m|
|ROAD_MELATI|(80,0) - (80,300)|Kolektor|sama, 11 m|
|ROAD_KEMUNING|(320,0) - (320,300)|Kolektor|sama, 11 m|
|ROAD_GANG_01..05|lihat Pesan A6|Gang kampung|3 m paving, tanpa trotoar dan marka|

<!-- Page 3 -->

#### Daftar zona

|Zona|X|Z|Isi|
|---|---|---|---|
|ZONE_TAMAN|92 - 186|8 - 50|Taman kota, jalur jogging, pohon|
|ZONE_CBD_BARAT|92 - 186|70 - 133|4 gedung perkantoran (massa)|
|ZONE_CBD_TIMUR|216 - 314|70 - 133|4 gedung perkantoran (massa)|
|ZONE_HUNIAN_TIMUR|326 - 396|8 - 133|3 blok apartemen (massa)|
|ZONE_HOTEL|216 - 314|166 - 233|Hotel utama, gedung pendamping, parkir|
|ZONE_RUKO|92 - 186|165 - 190|10 ruko, minimarket, bank|
|ZONE_PASAR|128 - 186|192 - 232|12 kios, los pasar|
|ZONE_MASJID|96 - 126|204 - 232|Masjid dan menara|
|ZONE_KAMPUNG_A|2 - 74,5|163 - 232|36 rumah kampung, gang|
|ZONE_KAMPUNG_B|2 - 74,5|248 - 298|16 rumah kampung, gang, pos ronda|
|ZONE_CADANGAN_01|326 - 396|165 - 233|Kosong, untuk gedung yang bisa dimasuki nanti|
|ZONE_CADANGAN_02|92 - 396|250 - 298|Kosong, cadangan selatan|
|jangan ikut dikirim. Pesan 0 Konteks dan aturan umum ATURAN UMUM berulang. game, bukan di sini. Balas "siap" saja. rambu, tiang listrik dan kabel, dll.). zona). building. Jangan membuat objek. Cukup jawab. bawah bisa disesuaikan.|5. Pesan yang dikirim ke Pascal (urut) FASE 0 - Konteks dan inventaris (sekali saja) Tanah di elevasi 0. Ukuran kota 400 m (X) x 300 m (Z). - Lalu lintas Indonesia memakai jalur KIRI. membuat jalan dari slab atau dinding biasa kecuali saya minta. penggantinya di ringkasan. Jika gagal, jelaskan apa adanya. Pesan 0B Inventaris kemampuan (jangan membuat objek)|Kita akan membangun SATU KOTA bergaya Jakarta di proyek ini, bertahap, satu langkah kecil per pesan. Kota ini nanti dipakai untuk game 3D simulasi TKJ (komputer dan jaringan) siswa SMK. Kerjakan HANYA yang diminta di tiap pesan, lalu berhenti dan tulis ringkasan 2 kalimat. - Satuan meter. Titik (0,0) = sudut barat laut kota. X ke timur, Z ke selatan (utara = Z kecil). - Jalan dibuat dengan plugin Streetscape (jalan, trotoar, marka, lampu, rambu, utilitas). Jangan-Jika suatu elemen atau tool tidak ada, pakai elemen terdekat, jangan berhenti, dan sebutkan-Beri nama objek persis seperti yang saya tulis (huruf besar, garis bawah). - Hemat: jangan menambah objek dekoratif yang tidak diminta. Duplikat objek yang sama bila-Kota ini hanya bangunan, jalan, dan properti diam. Kendaraan bergerak, NPC, dan misi dibuat di Sebelum membuat apa pun, cek dan jawab singkat dalam bentuk daftar (jangan membuat objek): 1) Plugin Streetscape aktif atau tidak, dan jenis objek apa saja yang tersedia (jalan lurus/lengkung, persimpangan, marka, zebra cross, trotoar, lampu jalan, lampu lalu lintas, 2) Jenis elemen bangunan yang tersedia (dinding, slab, atap, pintu, jendela, tangga, lift, 3) Kategori furnitur/item di katalog (meja, kursi, sofa, rak, pohon, tanaman, kendaraan, dll.). 4) Apakah tinggi level atau dinding bisa sampai 80 m, dan apakah satu proyek bisa berisi banyak|Setiap kotak abu-abu adalah satu pesan. Salin seluruh isi kotak. Teks di bawah kotak (miring) hanya catatan untukmu, Simpan jawabannya. Kalau ada yang tidak tersedia (misalnya lampu lalu lintas atau pohon), kirim jawabannya ke saya dan prompt di|

<!-- Page 4 -->

### FASE A-Jalan dengan Streetscape

#### Pesan A1 Arteri Jl. Sudirman

Langkah A1: buat jalan arteri "ROAD_SUDIRMAN" dengan Streetscape.

- Lurus dari (0,150) ke (400,150), arah timur-barat, elevasi 0.
- Penampang (lebar total 22 m): 2 lajur per arah @3,5 m, median 2 m berbordes, trotoar 3 m di kedua sisi dengan bordes.
- Marka: garis tepi putih menerus, pemisah lajur putus-putus putih. Jalur lalu lintas kiri. Hanya jalan ini. Lalu berhenti. *Cek: lebar total 22 m = 2x(2x3,5) + 2 + 2x3.*
#### Pesan A2 Arteri Jl. Thamrin

Langkah A2: buat jalan arteri "ROAD_THAMRIN" dengan Streetscape.

- Lurus dari (200,0) ke (200,300), arah utara-selatan, elevasi 0.
- Penampang sama persis dengan ROAD_SUDIRMAN (22 m: 2 lajur per arah @3,5 m, median 2 m, trotoar 3 m).
- Persimpangan dengan ROAD_SUDIRMAN di (200,150) harus tersambung sebagai junction, bukan dua jalan bertumpuk. Lalu berhenti.
#### Pesan A3 Kolektor timur-barat

Langkah A3: buat dua jalan kolektor timur-barat dengan Streetscape.

- "ROAD_KEBONJERUK": (0,60) ke (400,60).
- "ROAD_CEMPAKA": (0,240) ke (400,240).
- Penampang (lebar total 11 m): 1 lajur per arah @3,5 m, trotoar 2 m di kedua sisi dengan bordes, tanpa median.
- Marka: garis tengah putus-putus putih, garis tepi putih menerus. Jalur lalu lintas kiri. Sambungkan sebagai junction ke ROAD_THAMRIN di (200,60) dan (200,240). Lalu berhenti.
#### Pesan A4 Kolektor utara-selatan

Langkah A4: buat dua jalan kolektor utara-selatan dengan Streetscape.

- "ROAD_MELATI": (80,0) ke (80,300).
- "ROAD_KEMUNING": (320,0) ke (320,300).
- Penampang sama dengan kolektor di Langkah A3 (11 m, 1 lajur per arah, trotoar 2 m, marka sama). Sambungkan sebagai junction ke semua jalan yang memotongnya. Lalu berhenti.
#### Pesan A5 Persimpangan dan zebra cross

Langkah A5: cek dan rapikan persimpangan, lalu buat zebra cross.

1) Pastikan 9 persimpangan tersambung sebagai junction (bukan jalan bertumpuk): (80,60) (200,60) (320,60) (80,150) (200,150) (320,150) (80,240) (200,240) (320,240).
2) Zebra cross lebar 4 m, berjarak 2 m dari tepi persimpangan, di keempat lengan pada (200,150), (80,150), dan (320,150).
3) Zebra cross tengah ruas yang melintasi ROAD_SUDIRMAN di X=140 dan X=260.
4) Jika Streetscape punya panah arah, beri panah lurus dan belok kiri di lajur kiri yang mendekati (200,150). Lalu berhenti dan laporkan jumlah junction dan zebra cross. *Zebra cross total: 12 di tiga persimpangan Sudirman + 2 tengah ruas = 14.*
#### Pesan A6 Gang kampung

Langkah A6: buat 5 gang kampung, lebar 3 m, permukaan paving atau beton abu-abu, tanpa trotoar dan tanpa marka.

- ROAD_GANG_01: (28,161) ke (28,234.5)
- ROAD_GANG_02: (52,161) ke (52,234.5)
- ROAD_GANG_03: (0,198) ke (74.5,198)
- ROAD_GANG_04: (40,245.5) ke (40,300)
- ROAD_GANG_05: (0,272) ke (74.5,272) Sambungkan gang yang saling bersilang dan gang yang menempel ke jalan besar (Sudirman, Cempaka, Melati). Jika Streetscape tidak punya tipe gang, pakai tipe jalan terkecil dengan lebar 3 m tanpa trotoar, atau slab 3 m berwarna abu-abu. Lalu berhenti.
#### Pesan A7 Jembatan penyeberangan JPO (opsional)

Langkah A7 (opsional): buat jembatan penyeberangan orang "JPO_01" melintasi ROAD_SUDIRMAN di X=165.

- Dek lebar 2,5 m, dari Z=139 sampai Z=161, tinggi dek 5,5 m, pagar di kedua sisi, atap ringan jika ada.
- Dua tangga lebar 1,5 m (utara dan selatan), masing-masing sepanjang 12 m SEJAJAR trotoar agar tidak menutup jalan, naik ke arah timur dari X=153 ke X=165. Jika elemen tangga atau dek tidak bisa setinggi itu, turunkan tinggi dek sampai 4,5 m. Lalu berhenti.

<!-- Page 5 -->

*Flyover ditunda. Kalau JPO terlalu rumit, lewati saja.*

### FASE B-Tanah dasar dan zona lahan

#### Pesan B1 Tanah dasar

Langkah B1: buat tanah dasar (ground/site) seluas 400 x 300 m dari (0,0) sampai (400,300) di elevasi -0,05 (sedikit di bawah jalan), warna rumput hijau muda keabu-abuan. Jangan menutupi jalan Streetscape. Jika tidak ada tool tanah, lewati langkah ini dan laporkan. Lalu berhenti.

#### Pesan B2 Zona kawasan (bagian 1)

Langkah B2: buat zona (persegi panjang, nama persis, warna berbeda) berikut. Format: NAMA | X dari-sampai | Z dari-sampai. ZONE_TAMAN | 92-186 | 8-50 ZONE_CBD_BARAT | 92-186 | 70-133 ZONE_CBD_TIMUR | 216-314 | 70-133 ZONE_HUNIAN_TIMUR | 326-396 | 8-133 ZONE_HOTEL | 216-314 | 166-233 ZONE_RUKO | 92-186 | 165-190 Jika zona hanya bisa dibuat di dalam level bangunan, buat 1 building "CITY_BASE" berisi 1 level tanpa dinding untuk menampung zona; jika tidak bisa juga, pakai plat penanda tipis (tebal 0,05

m) berwarna. Lalu berhenti.
#### Pesan B3 Zona kawasan (bagian 2)

Langkah B3: lanjutkan zona, aturan sama dengan Langkah B2. ZONE_PASAR | 128-186 | 192-232 ZONE_MASJID | 96-126 | 204-232 ZONE_KAMPUNG_A | 2-74.5 | 163-232 ZONE_KAMPUNG_B | 2-74.5 | 248-298 ZONE_CADANGAN_01 | 326-396 | 165-233 ZONE_CADANGAN_02 | 92-396 | 250-298 Lalu berhenti.

### FASE C-Gedung kota (massa sederhana)

Gedung kota dibuat sebagai balok: 4 dinding luar + atap, 1 level, tanpa interior. Jika tinggi level dibatasi, tumpuk beberapa level (maksimal 6) dengan tinggi yang sama rata. Tiap gedung = 1 building.

#### Pesan C1 Perkantoran CBD barat

Langkah C1: buat 4 gedung perkantoran di ZONE_CBD_BARAT. Tiap gedung 1 building, 1 level, 4 dinding luar tebal 0,3 + slab atap, material kaca biru-abu jika ada. Tinggi level = tinggi gedung. NAMA | X mulai | Z mulai | lebar X | dalam Z | tinggi BLD_TOWER_W1 | 96 | 76 | 28 | 28 | 64 BLD_TOWER_W2 | 138 | 76 | 24 | 24 | 48 BLD_TOWER_W3 | 138 | 106 | 40 | 22 | 28 BLD_TOWER_W4 | 100 | 110 | 30 | 20 | 24 Tanpa pintu dan tanpa interior. Lalu berhenti.

#### Pesan C2 Perkantoran CBD timur

Langkah C2: buat 4 gedung perkantoran di ZONE_CBD_TIMUR dengan aturan sama seperti Langkah C1. NAMA | X mulai | Z mulai | lebar X | dalam Z | tinggi BLD_TOWER_E1 | 222 | 76 | 30 | 30 | 80 BLD_TOWER_E2 | 264 | 76 | 26 | 26 | 56 BLD_TOWER_E3 | 222 | 114 | 36 | 16 | 20 BLD_TOWER_E4 | 266 | 112 | 30 | 18 | 36 Lalu berhenti.

#### Pesan C3 Apartemen kawasan hunian

Langkah C3: buat 3 gedung apartemen di ZONE_HUNIAN_TIMUR dengan aturan sama seperti Langkah C1, warna dinding krem atau putih dengan strip jendela jika ada. NAMA | X mulai | Z mulai | lebar X | dalam Z | tinggi BLD_APT_1 | 330 | 14 | 28 | 30 | 36 BLD_APT_2 | 364 | 14 | 28 | 30 | 36 BLD_APT_3 | 332 | 84 | 58 | 22 | 20 Lalu berhenti.

<!-- Page 6 -->

#### Pesan C4 Ruko, minimarket, bank

Langkah C4: buat deretan toko di ZONE_RUKO. Sisi depan setiap bangunan di Z=165 (menghadap utara ke ROAD_SUDIRMAN).

- RUKO_01 sampai RUKO_10: lebar 5 (X), dalam 12 (Z), tinggi 10,5 (3 lantai). X mulai = 92 + 5 x (nomor - 1). Z mulai 165. Atap datar. Rolling door depan lebar 3,5 tinggi 2,6. Jendela lantai 2 dan 3 lebar 3. Warna dinding bervariasi.
- MINIMARKET_01: X 148, Z 165, ukuran 12 x 12, tinggi 4,5. Pintu kaca depan lebar 2, papan nama.
- BANK_01: X 168, Z 165, ukuran 14 x 12, tinggi 8. Pintu kaca depan. Lalu berhenti.
#### Pesan C5 Masjid dan menara

Langkah C5: buat masjid di ZONE_MASJID.

- BLD_MASJID_01: ruang utama X 102-118, Z 210-226 (16 x 16), tinggi dinding 7, atap kubah berdiameter 10 di tengah (jika tidak ada kubah, pakai atap limas). Serambi depan X 102-118, Z 206-210 dengan 4 kolom. Pintu utama di sisi utara lebar 2.
- BLD_MINARET_01: X 120-122.5, Z 210-212.5, tinggi 18, kubah kecil di puncak. Lalu berhenti.
#### Pesan C6 Pasar dan warung

Langkah C6: buat pasar kecil di ZONE_PASAR dan 3 warung.

- KIOS_A1 sampai KIOS_A6: ukuran 3 x 3, tinggi 3, atap seng miring. X mulai = 132 + 8 x (nomor -
1), Z mulai 195.
- KIOS_B1 sampai KIOS_B6: sama, Z mulai 212.
- LOS_PASAR_01: atap tanpa dinding X 130-180, Z 202-208, tinggi 3,5, 6 tiang.
- WARUNG_01 di (86,170), WARUNG_02 di (86,182), WARUNG_03 di (86,215): ukuran 3 x 4, tinggi 2,8, atap seng, terpal depan jika ada. Lalu berhenti.
#### Pesan C7 Rumah kampung (bangun satu dulu)

Langkah C7: buat rumah kampung. Rumah standar "RUMAH_K": dinding 6 (X) x 8 (Z), tinggi 3,2; atap pelana genteng terakota (puncak 5,2); 1 pintu 0,9 x 2,1 di sisi yang menghadap gang; 2 jendela 1,0 x 1,2. Warna dinding bervariasi (krem, hijau muda, biru muda, kuning). LANGKAH 1: buat HANYA RUMAH_K01 di X=5, Z=166, lalu berhenti dan laporkan. (Setelah saya setuju, lanjut ke Pesan C8.)

#### Pesan C8 Duplikat rumah kampung memenuhi sel

Langkah C8: duplikat RUMAH_K01 menjadi RUMAH_K02 dst. dengan posisi berikut (X mulai; Z mulai). KAMPUNG A, 3 rumah per baris. X mulai untuk tiga sel: sel kiri 5, 12, 19. sel tengah 30.5, 37.5,

44.5. sel kanan 54, 61, 68. Z mulai untuk empat baris, dipakai di ketiga sel: 166, 186, 202, 223. Total 3 x 3 x 4 = 36 rumah. Jangan menutupi gang. KAMPUNG B, 4 rumah per baris. X mulai: sel kiri 5, 12, 19, 26. sel kanan 43, 50, 57, 64. Z mulai: 261 dan 275. Total 4 x 2 x 2 = 16 rumah. Kerjakan Kampung A dulu, laporkan, lalu Kampung B. Variasikan warna dinding. *Total sekitar 52 rumah. Bila terasa berat, kurangi Kampung B dulu.*
#### Pesan C9 Gedung pendamping, parkir, driveway

Langkah C9: lengkapi ZONE_HOTEL.

- BLD_OFFICE_ANNEX: X 262, Z 168, ukuran 25 x 20, tinggi 40 (massa, tanpa interior).
- PARKIR_HOTEL: slab aspal X 220-310, Z 195-228, tebal 0,1. Garis slot parkir 2,5 x 5 m: 2 baris, masing-masing 18 slot, mulai X=225, baris pertama Z 197-202 dan baris kedua Z 206-211.
- DRIVEWAY_HOTEL_01: dengan Streetscape, lebar 6 m, dari ROAD_CEMPAKA di X=270 ke parkir (Z=228). Gedung hotel sendiri BELUM dibuat di langkah ini. Lalu berhenti.
### FASE D-Gedung utama: Nusantara Tech Hotel & Office

Semua koordinat di Fase D adalah koordinat **lokal** gedung. Titik asal lokal (0,0) = titik kota (220,168). Sumbu lokal sejajar sumbu kota: Z lokal 0 adalah sisi depan yang menghadap utara ke Jl. Sudirman. Denah lantai 1 (600 m2): Lobi X0-14 Z0-12; Lounge X0-10 Z12-20; Kantor IT X14-22 Z0-10; Workshop TKJ X22-30 Z0-10; Koridor X14-30 Z10-12; Toilet X10-15 Z12-20; Tangga X15-19 Z12-20; Lift X19-23 Z12-20; Ruang Server X23-30 Z12-20.

<!-- Page 7 -->

#### Pesan D1 Building dan 8 level

Langkah D1: buat 1 building bernama BLD_HOTEL_NUSANTARA.

- Titik asal lokal (0,0) = titik kota (220,168). Sumbu lokal sejajar sumbu kota: Z lokal 0 = sisi DEPAN, menghadap utara ke ROAD_SUDIRMAN. Semua koordinat langkah D berikutnya adalah koordinat LOKAL. Jika Pascal hanya memakai koordinat dunia, tambahkan (220,168).
- Footprint 30 m (X) x 20 m (Z), sama di semua lantai.
- 8 level L1 sampai L8. L1 tinggi 4,0 elevasi 0. L2 sampai L8 tinggi 3,2. Elevasi: L2 4,0; L3 7,2; L4 10,4; L5 13,6; L6 16,8; L7 20,0; L8 23,2. Atap rata di 26,4. Belum ada dinding atau objek lain. Lalu berhenti.
#### Pesan D2 L1: lantai dan dinding

Langkah D2: di level L1 BLD_HOTEL_NUSANTARA buat slab lantai 30 x 20 (tebal 0,2) dan dinding. Dinding luar tebal 0,25, tinggi 4,0: persegi panjang (0,0)-(30,20). Dinding sekat tebal 0,12, tinggi 4,0 (garis lurus, X,Z): S1: (14,0) ke (14,10) S2: (22,0) ke (22,10) S3: (14,10) ke (30,10) S4: (10,12) ke (23,12) S5: (10,12) ke (10,20) S6: (12.5,12) ke (12.5,20) S7: (15,12) ke (15,20) S8: (19,12) ke (19,20) S9: (21,12) ke (21,20) Dinding Ruang Server tebal 0,20: S10: (23,12) ke (23,20) S11: (23,12) ke (30,12) JANGAN ada dinding di X=14 antara Z=10 dan Z=12 (bukaan lobi ke koridor), dan jangan ada dinding antara Lobi dan Lounge. Lalu berhenti.

#### Pesan D3 L1: pintu

Langkah D3: di L1 buat pintu (nama DOOR_L1_Pxx), koordinat lokal, X atau Z menunjukkan titik tengah pintu. P01 utama: dinding Z=0, X=7, lebar 3,0 tinggi 2,4, ganda (pintu putar jika ada). P02 darurat: dinding X=30, Z=11, lebar 1,2. P03 Kantor IT: dinding S3 (Z=10), X=18, lebar 1,0. P04 Workshop: dinding S3 (Z=10), X=26, ganda lebar 1,8. P05 Toilet pria: dinding S4 (Z=12), X=11.25, lebar 0,9. P06 Toilet wanita: dinding S4 (Z=12), X=13.75, lebar 0,9. P07 Tangga (tahan api): dinding S4 (Z=12), X=17, lebar 1,2. P08 Lift 1: dinding S4 (Z=12), X=20, lebar 1,1. P09 Lift 2: dinding S4 (Z=12), X=22, lebar 1,1. P10 Ruang Server (pintu besi): dinding S11 (Z=12), X=26.5, lebar 1,0. Tinggi pintu 2,1 kecuali P01. Lalu berhenti.

#### Pesan D4 L1: jendela

Langkah D4: di L1 buat jendela (nama WIN_L1_xx). Standar: ambang 0,9, tinggi 1,5. Titik X atau Z adalah titik tengah.

- Lobi, sisi depan (Z=0): kaca penuh (curtain wall) dari lantai sampai tinggi 3,2, di X 1-6 dan X 8-13.
- Lobi, sisi barat (X=0): 2 jendela lebar 2,0 di Z=3 dan Z=8.
- Lounge, sisi barat (X=0): 2 jendela lebar 1,5 di Z=14 dan Z=18. Sisi selatan (Z=20): 2 jendela lebar 1,5 di X=3 dan X=7.
- Kantor IT, sisi depan (Z=0): 3 jendela lebar 1,5 di X=15.5, X=18, X=20.5.
- Workshop, sisi depan (Z=0): 3 jendela lebar 1,5 di X=23.5, X=26, X=28.5. Sisi timur (X=30): 1 jendela di Z=5.
- TANPA jendela: Ruang Server, toilet, tangga, lift. Lalu berhenti.
#### Pesan D5 L1: zona dan cek luas

Langkah D5: di L1 buat zona (nama persis). NAMA | X | Z | luas L1_LOBI | 0-14 | 0-12 | 168 L1_LOUNGE | 0-10 | 12-20 | 80 L1_IT_OFFICE | 14-22 | 0-10 | 80 L1_WORKSHOP | 22-30 | 0-10 | 80 L1_CORRIDOR | 14-30 | 10-12 | 32 L1_TOILET_M | 10-12.5 | 12-20 | 20 L1_TOILET_F | 12.5-15 | 12-20 | 20 L1_STAIR | 15-19 | 12-20 | 32 L1_LIFT | 19-23 | 12-20 | 32 L1_SERVER | 23-30 | 12-20 | 56 Hitung total luas, harus 600 m2. Laporkan hasilnya dan selisih jika ada. Lalu berhenti.

<!-- Page 8 -->

#### Pesan D6 L1: isi Lobi dan Lounge

Langkah D6: isi L1_LOBI dan L1_LOUNGE. Pakai item katalog; jika tidak ada, pakai kotak placeholder berukuran benar. Nama: PROP_L1_<JENIS>_<nomor>. Jalur jalan minimal 0,9, jangan menghalangi pintu. LOBI:

- PROP_L1_RECEPTION_01: meja resepsionis 6,0 x 0,8 x 1,1 di X 5-11, Z 8.
- PROP_L1_SIGNAGE_01: papan "NUSANTARA TECH HOTEL & OFFICE" 4 x 0,8, tinggi 2,4 dari lantai, menempel di dinding S1 (X=14), Z 2-6, menghadap barat.
- 2 set sofa: sofa 2 dudukan + 2 kursi + meja kopi, di X 1-4 Z 2-4 dan X 1-4 Z 6-8.
- 4 kursi tunggu di sepanjang dinding barat. 4 pot tanaman di (0.8,0.8) (4.5,0.8) (9.5,0.8) (13,11). 1 troli bagasi di (11,3).
- 2 CCTV di (13.5,0.3) dan (0.3,11.5), tinggi 3,0. LOUNGE:
- 1 counter kafe 4 x 0,8 di X 1-5, Z 19. 5 meja 0,8 x 0,8 dengan masing-masing 2 kursi di area X 1-9, Z 13-18. 2 pot tanaman. Lalu berhenti.
#### Pesan D7 L1: isi Kantor IT

Langkah D7: isi L1_IT_OFFICE (X14-22, Z0-10). Jalur jalan minimal 0,9; geser sedikit jika bertabrakan; jangan menghalangi P03 (X=18, Z=10).

- 6 meja kerja 1,4 x 0,7 dalam 2 baris. Baris 1 di Z 3,0-3,7 dan baris 2 di Z 6,0-6,7; X mulai 15,0 / 17,2 / 19,4. Tiap meja 1 kursi di sisi selatan, dan 1 PC lengkap (case, monitor, keyboard, mouse). Nama: PROP_L1_PC_ITOFFICE_01 sampai 06.
- PROP_L1_NOC_DESK_01: meja 3,0 x 0,8 di X 14,2-17,2, Z 8,6-9,4, dengan 3 monitor.
- PROP_L1_NETRACK_WALL_01: rak jaringan dinding 0,6 x 0,5 x 1,0 di dinding S1, Z 1,0, tinggi pasang 1,2.
- PROP_L1_PRINTER_01 di meja kecil di (21,8.5). PROP_L1_CABINET_01: lemari arsip 0,9 x 0,4 x 1,8 menempel dinding S2 di Z 7,5.
- 1 AC dinding di (18,0.3) tinggi 2,6. 1 monitor CCTV di dinding S3. Lalu berhenti.
#### Pesan D8 L1: isi Workshop TKJ

Langkah D8: isi L1_WORKSHOP (X22-30, Z0-10). Jalur minimal 1,2 di antara meja; jangan menghalangi P04 (X 25,1-26,9, Z=10).

- 4 meja praktik 2,4 x 0,9 dalam 2 x 2: baris A di Z 2,5-3,4 dan baris B di Z 5,5-6,4; X mulai 23,0 dan 26,6. Tiap meja: 2 kursi, 1 PC lengkap. Nama: PROP_L1_PC_WORKSHOP_01 sampai 04.
- PROP_L1_CRIMPING_TABLE_01: meja 1,8 x 0,8 di X 23,0-24,8, Z 8,4-9,2. Di atasnya placeholder: gulungan kabel UTP, crimping tool, LAN tester, kotak konektor RJ45.
- PROP_L1_TOOLCAB_01: lemari alat 1,2 x 0,5 x 1,8 di X 28,5, Z 9,4. PROP_L1_PARTSRACK_01: rak komponen 1,0 x 0,4 x 2,0 di dinding timur (X=29,6), Z 7,0.
- Papan tulis 2,4 x 1,2 di dinding S2 (X=22,1), Z 3,0-5,4, menghadap timur.
- 1 printer, 1 cable tray di langit-langit di Z=4,5 dari X 22,5 sampai 29,5 (tinggi 3,6), 1 AC di (26,0.3), 1 APAR di (22.3,9.5). Lalu berhenti.
#### Pesan D9 L1: isi Ruang Server

Langkah D9: isi L1_SERVER (X23-30, Z12-20). Pintu P10 di (26.5, 12).

- PROP_L1_SERVER_RACK_01 sampai 04: rak 0,6 x 1,0 x 2,0, berjajar di X 24,0-26,4, Z 17,0-18,0, pintu rak menghadap utara. Lorong 1,2 di depannya (Z 15,8-17,0).
- PROP_L1_NETRACK_01: rak jaringan 0,6 x 1,0 x 2,0 di X 26,4-27,0, Z 17,0-18,0 (tempat switch, router, patch panel).
- PROP_L1_UPS_01 dan 02: 0,4 x 0,8 x 0,8 di X 28,0-28,4 dan 28,6-29,0, Z 17,0-17,8.
- 2 AC presisi 0,6 x 0,9 x 1,9 di dinding timur (X=29,4), Z 13,0 dan Z 18,5.
- Cable tray di atas rak pada tinggi 2,4, X 24-27, Z 17,5. Raised floor 0,3 jika tersedia.
- 1 APAR di (23.3,12.5). 1 CCTV di (29.5,12.3) tinggi 2,7. 1 panel akses di (27.2,12.1) tinggi 1,3. Lalu berhenti.
#### Pesan D10 L1: toilet, tangga, lift

Langkah D10: di L1 buat sisanya.

- Toilet pria (L1_TOILET_M, X10-12.5): 2 closet dan 1 wastafel. Toilet wanita (L1_TOILET_F, X12.5-15): 2 closet dan 1 wastafel.
- Tangga dua lari (bentuk U) di L1_STAIR (X15-19, Z12-20), naik ke L2 dengan bordes di setengah tinggi (2,0). Lebar lari 1,2. Pintu masuk dari P07.
- Dua shaft lift 2 x 8 di X 19-21 dan X 21-23, Z 12-20, tembus dari L1 sampai L8. Lift berhenti di semua level. Jika tool tangga atau lift tidak ada, buat placeholder kotak dengan nama L1_STAIR_PLACEHOLDER dan L1_LIFT_PLACEHOLDER dan laporkan. Lalu berhenti.

<!-- Page 9 -->

#### Pesan D11 Penanda interaksi (ANCHOR)

Langkah D11: buat penanda posisi untuk interaksi game nanti. Tiap penanda = kotak kecil 0,2 x 0,2 x 0,2 berwarna kuning, tanpa fungsi, di tinggi 1,0 dari lantai L1 (koordinat lokal X,Z). ANCHOR_WS_PC_01 (24.2,2.95), _02 (27.8,2.95), _03 (24.2,5.95), _04 (27.8,5.95) ANCHOR_WS_CRIMPING_01 (23.9,8.8) ANCHOR_WS_TOOLCAB_01 (28.9,9.65) ANCHOR_IT_PC_01 (15.7,3.35), _02 (17.9,3.35), _03 (20.1,3.35), _04 (15.7,6.35), _05 (17.9,6.35), _06 (20.1,6.35) ANCHOR_IT_NOC_01 (15.7,9.0) ANCHOR_SRV_RACK_01 (24.3,16.8), _02 (24.9,16.8), _03 (25.5,16.8), _04 (26.1,16.8) ANCHOR_SRV_NETRACK_01 (26.7,16.8) ANCHOR_SRV_UPS_01 (28.2,17.4) ANCHOR_LOBBY_RECEPTION_01 (8,7.0) Lalu berhenti dan laporkan jumlahnya (harus 20).

*Hitungan: 4 (workshop PC) + 1 (crimping) + 1 (lemari alat) + 6 (PC kantor IT) + 1 (NOC) + 4 (rak server) + 1 (rak jaringan) + 1 (UPS) +* *1 (resepsionis) = 20.*

#### Pesan D12 Lantai 2 (kantor), lalu duplikat ke Lantai 3

Langkah D12: bangun level L2 (elevasi 4,0, tinggi 3,2), lalu duplikat ke L3 dengan nama berawalan L3_.

- Slab 30 x 20 dengan lubang untuk tangga (X15-19, Z12-20) dan lift (X19-23, Z12-20). Dinding luar tebal 0,25.
- Sekat 0,12: Rapat A: (8,0)-(8,6) dan (0,6)-(8,6), pintu 0,9 di (4,6). Rapat B: (22,0)-(22,6) dan (22,6)-(30,6), pintu 0,9 di (26,6).
- Dinding (0,10)-(30,10) dengan 2 pintu ganda 1,8 di X=8 dan X=21. Dinding koridor selatan (0,12)-(23,12). Pantry: (10,12)-(10,20), pintu 0,9 di (5,12).
- Core (toilet, tangga, lift) sama seperti L1. IDF X23-26.5 dan Gudang X26.5-30 (Z12-20), dinding (23,12)-(30,12), (26.5,12)-(26.5,20); pintu IDF di X=24.75 dan Gudang di X=28.25 (Z=12).
- Isi: 12 meja kerja 1,4 x 0,7 + kursi + PC tersebar di X 1-29, Z 1,5-9; meja rapat di kedua ruang rapat; pantry: counter, kulkas, meja makan; IDF: 1 rak jaringan kecil + patch panel + switch (placeholder) + UPS.
- Zona: L2_OPEN_OFFICE, L2_MEETING_A, L2_MEETING_B, L2_CORRIDOR, L2_PANTRY, L2_TOILET_M, L2_TOILET_F, L2_STAIR, L2_LIFT, L2_IDF, L2_STORAGE. Kerjakan L2 dulu, laporkan, baru duplikat ke L3.
#### Pesan D13 Lantai 4 (hotel tipikal) + kamar contoh

Langkah D13: bangun level L4 (elevasi 10,4, tinggi 3,2).

- Slab 30 x 20 dengan lubang tangga dan lift seperti L2. Dinding luar tebal 0,25.
- Koridor X0-30, Z10-12. Dinding (0,10)-(30,10) dengan 6 pintu kamar 0,9 di X=2.5, 7.5, 12.5,
17.5, 22.5, 27.5.
- 6 kamar depan 5 x 10 (X 0-5, 5-10, 10-15, 15-20, 20-25, 25-30): sekat (5,0)-(5,10), (10,0)-(10,10), (15,0)-(15,10), (20,0)-(20,10), (25,0)-(25,10). Tiap kamar: area tidur Z0-7 dan kamar mandi Z7-10 dengan sekat Z=7 dan pintu 0,8 di tengah. 1 jendela lebar 1,8 di dinding depan Z=0.
- 2 kamar belakang 5 x 8: X0-5 dan X5-10, Z12-20, sekat (5,12)-(5,20) dan (10,12)-(10,20), pintu di X=2.5 dan X=7.5 pada Z=12. Housekeeping X10-15, Z12-20, pintu di X=12.5.
- Core, IDF (X23-26.5), dan Linen (X26.5-30) sama seperti L2.
- Zona: L4_ROOM_401 sampai 406 (depan), L4_ROOM_407 dan 408 (belakang), L4_CORRIDOR, L4_HOUSEKEEPING, L4_IDF, L4_LINEN, L4_STAIR, L4_LIFT.
- ISI HANYA L4_ROOM_401 (X0-5): tempat tidur 1,8 x 2,0, 2 nakas, TV 1,2, meja kerja 1,2 x 0,6 + kursi, lemari 1,0 x 0,5 x 2,0; kamar mandi: closet, wastafel, shower 0,9 x 0,9. Kamar lain kosong. Lalu berhenti.
#### Pesan D14 Duplikat L4 ke L5 sampai L8

Langkah D14: duplikat level L4 ke L5 (elevasi 13,6), L6 (16,8), L7 (20,0), L8 (23,2), masing- masing tinggi 3,2. Ganti nama zona: L5_ROOM_501 dst., L6_ROOM_601 dst., L7_ROOM_701 dst., L8_ROOM_801 dst. Kamar contoh di tiap lantai ikut tersalin (ROOM_x01). Pastikan lubang tangga dan lift sejajar di semua level. Laporkan jumlah objek per level. Lalu berhenti.

#### Pesan D15 Atap

Langkah D15: buat atap rata di elevasi 26,4: slab 30 x 20 dengan parapet tinggi 1,0 tebal 0,2 di keliling.

- Kotak mesin lift dan tangga: X15-23, Z12-20, tinggi 3,0 di atas atap.
- Placeholder: PROP_ROOF_PARABOLA_01 di (6,6) diameter 1,8; PROP_ROOF_ANTENNA_01 di (24,4) tiang tinggi 4,0; PROP_ROOF_TANDON_01 di (26,14) silinder diameter 1,6 tinggi 2,0; PROP_ROOF_AC_01 sampai 03 (0,9 x 0,4 x 0,8) di (4,15), (7,15), (10,15). Lalu berhenti.

<!-- Page 10 -->

#### Pesan D16 Eksterior gedung (opsional)

Langkah D16 (opsional): detail eksterior BLD_HOTEL_NUSANTARA, koordinat lokal.

- KANOPI_01: slab tipis 6 x 4 x 0,2 di X 4-10, Z -4 sampai 0, tinggi 3,6, 2 tiang di sisi depan.
- SIGNAGE_FACADE_01: papan "NUSANTARA TECH HOTEL & OFFICE" 9 x 1,2 di dinding depan (Z=0), X 3-12, tinggi 4,2-5,4.
- PARKIR_MOTOR_01: slab 12 x 4 di X 12-24, Z -5 sampai -1 (kota: X232-244, Z163-167).
- GENSET_HOUSE_01: kotak 4 x 4 x 3 di X 31-35, Z 15-19 (kota: X251-255, Z183-187). Lalu berhenti.
### FASE E-Properti jalan (koordinat kota)

#### Pesan E1 Lampu jalan

Langkah E1: pasang lampu jalan dengan Streetscape (jenis lampu bawaan).

- Lampu lengan ganda di median ROAD_SUDIRMAN dan ROAD_THAMRIN, setiap 30 m, simetris.
- Lampu lengan tunggal di trotoar ROAD_KEBONJERUK, ROAD_CEMPAKA, ROAD_MELATI, ROAD_KEMUNING, setiap 35 m, selang-seling kiri-kanan.
- Lampu area (multi-head) di (265,211) parkir hotel, (140,30) taman kota, dan (150,181) belakang ruko.
- Gang: 1 lampu setiap 25 m, dinding atau tiang rendah. Jangan memasang lampu di atas persimpangan. Lalu berhenti.
#### Pesan E2 Lampu lalu lintas dan rambu

Langkah E2: lampu lalu lintas dan rambu.

- Lampu lalu lintas: 4 tiang di setiap persimpangan di (200,150), (80,150), (320,150), diletakkan di sudut trotoar, 3 lampu (merah, kuning, hijau) per tiang. Jika tidak ada objek lampu lalu lintas, pakai tiang + 3 bola placeholder berwarna. Nama: TL_200_150_NE, TL_200_150_NW, TL_200_150_SE, TL_200_150_SW, dst.
- Rambu: 6 "Dilarang Parkir" di sepanjang ROAD_SUDIRMAN, 4 batas kecepatan 50 di ROAD_SUDIRMAN dan ROAD_THAMRIN, 4 "Penyeberangan" di dekat zebra cross tengah ruas (X=140 dan X=260), 2 "Dilarang Putar Balik" di median. Lalu berhenti.
#### Pesan E3 Tiang listrik dan kabel semrawut

Langkah E3: tiang listrik beton tinggi 9 m dengan kabel.

- Di trotoar barat ROAD_MELATI dan trotoar selatan ROAD_CEMPAKA, setiap 35 m.
- Di gang kampung (ROAD_GANG_01 sampai 05), setiap 20 m.
- Sambung antar tiang dengan kabel utilitas (wire span). Tambahkan 2-3 bentangan kabel tambahan berbeda kelenturan di gang kampung agar tampak semrawut.
- 1 kotak trafo di (60,163). Lalu berhenti.
#### Pesan E4 Halte bus

Langkah E4: 4 halte bus (atap, bangku, papan nama), ukuran 5 x 1,5, menempel sisi luar trotoar ROAD_SUDIRMAN. HALTE_01 di X 146-151, Z 139,3 (trotoar utara) HALTE_02 di X 146-151, Z 159,5 (trotoar selatan) HALTE_03 di X 262-267, Z 139,3 (trotoar utara) HALTE_04 di X 262-267, Z 159,5 (trotoar selatan) Sisakan jalur pejalan minimal 1,5 m. Lalu berhenti.

#### Pesan E5 Pohon dan taman kota

Langkah E5: tanaman.

- Pohon peneduh di sisi luar kedua trotoar ROAD_SUDIRMAN, setiap 15 m, dan palem di median setiap 15 m.
- Di ZONE_TAMAN: 30 pohon tersebar acak (jarak antar pohon minimal 4 m), jalur jogging lebar 2 m melingkar dari (100,15) ke (180,15), (180,45), (100,45), kembali, 2 gazebo 4 x 4 di (115,30) dan (165,30), 4 bangku. Jika tidak ada objek pohon, pakai placeholder: batang silinder (diameter 0,4) + kanopi bola (diameter 4). Beri nama PROP_TREE_xx. Lalu berhenti.
#### Pesan E6 Billboard, gapura, pos ronda, gerobak

Langkah E6: properti khas kota (placeholder bila tidak ada item).

- BILLBOARD_01 di (112,136.5), BILLBOARD_02 di (230,136.5), BILLBOARD_03 di (300,163.5): papan 6 x 3 di atas 2 tiang, bagian bawah papan setinggi 8.
- GAPURA_01 di (28,163) dan GAPURA_02 di (52,163): 2 pilar 0,5 x 0,5 x 3,5 + balok atas melintang gang bertuliskan "KAMPUNG MELATI".
- POS_RONDA_01: 3 x 3 x 3, atap pelana, di X 34-37, Z 287-290.
- GEROBAK_BAKSO_01 di (88,177), GEROBAK_NASGOR_01 di (150,181), GEROBAK_KOPI_01 di (276,164): 1,8 x 0,9 x 1,5 dengan roda dan payung atau terpal. Jangan menghalangi jalur pejalan. Lalu berhenti.

<!-- Page 11 -->

### FASE F-Penamaan, titik awal, pemeriksaan akhir

#### Pesan F1 Titik awal pemain

Langkah F1: buat penanda SPAWN_PLAYER_01 di (226,162.5) (trotoar depan hotel, dekat kanopi), kotak 0,3 x 0,3 x 0,3 berwarna hijau di ketinggian trotoar. Lalu berhenti.

#### Pesan F2 Cek penamaan

Langkah F2: periksa semua objek yang saya minta. Laporkan dalam tabel: nama yang diminta | ada atau tidak | pengganti. Awalan yang dipakai: ROAD_, ZONE_, BLD_, RUKO_, KIOS_, WARUNG_, RUMAH_K, PROP_, ANCHOR_, DOOR_, WIN_, L1_ sampai L8_, TL_, HALTE_, GAPURA_, BILLBOARD_, GEROBAK_, SPAWN_. Jangan mengubah apa pun, hanya melapor.

#### Pesan F3 Cek akhir

Langkah F3: cek akhir. Laporkan:

1) Dinding yang tumpang tindih atau berlubang.
2) Pintu yang terhalang furnitur.
3) Gedung yang menembus jalan atau trotoar Streetscape.
4) Persimpangan Streetscape yang belum tersambung.
5) Jumlah objek per level BLD_HOTEL_NUSANTARA dan jumlah total gedung.
6) Daftar semua SUBSTITUSI (elemen yang tidak tersedia dan penggantinya). Jangan memperbaiki apa pun dulu, hanya melapor.
#### Pesan G1 Kendaraan parkir diam (opsional)

Langkah G1 (opsional): hanya kendaraan PARKIR yang DIAM, kotak placeholder bila tidak ada item. Kendaraan yang bergerak akan dibuat di game.

- PARKED_MOTOR_01 sampai 12: 0,8 x 1,8 x 1,1, tegak lurus trotoar, jarak 1,0 m, di PARKIR_MOTOR_01 mulai X=232,5, Z=164.
- PARKED_CAR_01 sampai 10: 1,8 x 4,5 x 1,5, di slot PARKIR_HOTEL baris pertama (Z 197-202), mulai X=225, setiap slot ke-2. Lalu berhenti.

<!-- Page 12 -->

## 6. Konvensi penamaan (supaya mudah dipetakan ke game)

|Awalan||Arti|||Contoh|
|---|---|---|---|---|---|
|ROAD_|||Jalan Streetscape||ROAD_SUDIRMAN, ROAD_GANG_03|
|ZONE_|||Zona kawasan kota||ZONE_RUKO|
|BLD_|||Gedung (building)||BLD_HOTEL_NUSANTARA, BLD_TOWER_E1|
|L1_ ... L8_|||Zona/ruang di dalam hotel per lantai||L1_SERVER, L4_ROOM_401|
|DOOR_ / WIN_|||Pintu dan jendela||DOOR_L1_P10, WIN_L1_03|
|PROP_|||Prop dalam ruangan (placeholder, nanti diganti model Meshy)||PROP_L1_SERVER_RACK_01|
|ANCHOR_|||Titik interaksi game (tanpa fungsi di Pascal)||ANCHOR_WS_CRIMPING_01|
|GEROBAK_|TL_ / HALTE_ / GAPURA_ /||Properti jalan||TL_200_150_NE, HALTE_01|
|SPAWN_|terbawa. Cek apakah menu ekspor ada di proyekmu. 7. Daftar pemeriksaan per fase||Titik awal pemain Pascal dapat mengekspor adegan ke Blender lewat GLB dengan metadata level, zona, dan pintu, jadi nama yang konsisten akan||SPAWN_PLAYER_01|
|Fase|Yang harus dicek di layar|||||
|A|||Semua jalan tersambung di persimpangan. Trotoar dan marka muncul. Lebar jalan sesuai tabel. Zebra cross 14 buah.|||
|B|||Tanah menutupi 400 x 300 m. 12 zona ada dan tidak tumpang tindih.|||
|C|||Tidak ada gedung menembus trotoar. Rumah kampung tidak menutupi gang. Jumlah rumah sekitar 52.|||
|D E F|prop yang benar. 8. Jika terjadi masalah||Luas L1 = 600 m2. Semua pintu menempel dinding yang benar. Tangga dan lift sejajar L1 sampai L8. 20+ anchor berada di atas Lampu tidak berada di tengah jalan. Halte tidak menutup trotoar. Pos ronda dan gerobak tidak menghalangi jalur. Daftar substitusi dan masalah dari Pesan F3 sudah dibaca. Simpan atau ekspor proyek.|||
|Gejala|||Kemungkinan penyebab|Yang dilakukan||
||Gagal setelah beberapa detik||Pesan terlalu besar untuk satu giliran||Pecah pesan jadi satu objek per pesan|
||AI bilang elemen tidak ada||Katalog atau tool belum tersedia||Biarkan memakai substitusi, catat di F3|
||Jalan bertumpuk, bukan junction||Titik sambung tidak tepat||Ulangi Pesan A5, minta snap ke ujung jalan|
||Gedung tenggelam atau melayang||Elevasi tanah salah||Pastikan tanah di -0,05 dan jalan di 0|
||Bangunan tinggi tidak bisa dibuat||Batas tinggi level||Tumpuk level (maks 6) dengan tinggi sama rata|
||Koordinat meleset di hotel||Pascal memakai koordinat dunia||Tambahkan offset (220,168) ke semua koordinat D|
|Proyek lambat|||Terlalu banyak objek kecil||Lewati opsional (A7, D16, G1), kurangi rumah Kampung B|
|- - - Sumber - -|9. Setelah kota selesai lorong dan pintu bisa dilewati.||Uji dengan mode jalan orang pertama di Pascal (changelog menyebut pintu dan lift berfungsi) untuk memastikan Isi lahan cadangan dengan gedung baru yang bisa dimasuki, memakai pola yang sama dengan Fase D. Ganti placeholder PROP_ dengan model dari Meshy (cocokkan lewat nama), buat kendaraan dan NPC di game, lalu mulai misi TKJ memakai ANCHOR_ sebagai titik interaksi. Pascal changelog, 11 Agustus 2026 (Streetscape, Mint, CLI): editor.pascal.app/changelog/2026-08-11-plugins-cli-and-agent-accounts Repositori: github.com/pascalorg/plugin-streetscape dan github.com/pascalorg/editor|||
