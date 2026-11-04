# Kota Nusantara · Simulator TKJ 3D

Simulator jaringan komputer 3D di browser untuk siswa SMK Teknik Komputer dan Jaringan (Fase E/F) dan guru mereka. Siswa magang sebagai teknisi di gedung kantor dan hotel, memperbaiki jaringan dengan alat dan perangkat yang meniru aslinya. Guru menyusun praktik di Gedung Lab Praktik dan mendapat nilai berformat UKK.

**Main:** https://bahtiarindra32-spec.github.io/TKJSIMULATOR/ · **Nilai dalam 5 menit:** klik **Mode Juri** di menu utama (atau buka `?juri`).

## Masalah

- Praktik jaringan butuh switch, router, patch panel, dan tester. Di banyak SMK alat ini kurang. Evaluasi pada 16 SMK TKJ di Kabupaten Sukoharjo menemukan ruang praktik instalasi jaringan belum memenuhi standar sarana Permendiknas 40/2008 (Susanto & Sudira, *Jurnal Pendidikan Vokasi* 6(1), 2016, [doi:10.21831/jpv.v6i1.8115](https://doi.org/10.21831/jpv.v6i1.8115)).
- Risalah kebijakan Puslitjak Kemendikbud (No. 27, Nov 2021) mencatat tidak semua SMK punya sarana praktik yang lengkap dan memadai ([PDF](https://pskp.kemendikdasmen.go.id/assets_front/images/produk/1-gtk/kebijakan/Risalah_Kebijakan_Puslitjak_No_27_November_2021_Model_Penguatan_SMK_(PRN).pdf)).
- Akibatnya siswa bergantian memakai satu perangkat, dan simulator yang umum dipakai (seperti Packet Tracer) berfokus pada topologi dan konfigurasi, bukan pekerjaan fisik di lokasi: mencari port dengan toner, crimping, label outlet, berjalan ke rak, menulis berita acara.

## Pengguna dan solusi

| Pengguna | Yang didapat |
|---|---|
| Siswa | Dunia 3D tempat setiap pekerjaan dilakukan secara fisik: ambil alat di lemari, jalan ke rak, pasang patch cord, console ke switch, uji dari PC. Tanpa kuis: pekerjaan selesai hanya kalau jaringan simulasi benar-benar sehat dan diuji dari perangkat. |
| Guru | Lab Praktik: susun jobsheet jadi kode 6–8 karakter tanpa server, siswa mengerjakan, checkpoint dinilai otomatis dari simulator, paraf guru ber-PIN, lembar hasil format UKK (Sangat Kompeten…Belum Kompeten), CSV, cetak A4, rekap kelas dari kode hasil. |

Materi yang benar-benar disimulasikan: kabel terstruktur TIA-568 dan crimping T568B, IPv4 statis/DHCP, DNS, VLAN dan trunk 802.1Q, STP, VLSM, routing antar-VLAN (router-on-a-stick), ACL extended, NAT/PAT dua ISP dengan route-map, IP SLA + track failover, server Linux (isc-dhcp-server, bind9, apache2), printer jaringan, telepon IP dengan voice VLAN dan PoE, NAS SMB, Wi-Fi (kanal, sinyal). Daftar lengkap: [FITUR.md](FITUR.md).

## Mode Juri (tur 5 menit)

Enam pemberhentian, masing-masing langsung ke keadaan siap dicoba: surat kerja di depan PC, console switch di rak IDF, shift helpdesk, Lab Praktik VLSM → router-on-a-stick → ACL, Pak Nusa, dan rekap kelas untuk guru. Tidak ada yang diskenariokan berhasil; juri tetap mengerjakan sendiri. Save pemain dicadangkan dan dikembalikan.

## AI

| Fitur | Untuk | Cara kerja |
|---|---|---|
| Pak Nusa, mentor | Siswa | Membaca kondisi pekerjaan (surat kerja, log langkah, IP simulasi) dan memberi arah diagnosis per lapisan OSI. Filter anti-bocor mengganti jawaban siap-tempel dengan petunjuk. |
| Ringkasan rekap kelas | Guru | Dari data rekap anonim (tanpa nama): checkpoint yang paling sering gagal dan saran remedial. Berlabel "Dibuat AI". |
| Keluhan pelanggan | Siswa | Kalimat tiket ditulis ulang dengan gaya pelapor dari gejala saja. |
| Ulasan catatan tiket | Siswa | Catatan penutupan dibandingkan dengan fakta tiket. |

- Penyedia: OpenRouter (API key sendiri) atau **AI lokal** kompatibel OpenAI (Ollama/LM Studio di `localhost`), jadi AI tetap jalan tanpa internet.
- Tidak ada data yang dikirim sebelum pengguna memilih *Setuju* di Pengaturan. Nama siswa dan nilai tidak pernah dikirim (diuji di `tests/nusa.test.ts`).
- **Penilaian tidak memakai AI.** Tanpa AI semua fitur tetap jalan dengan petunjuk offline. Detail: [AI_USAGE.md](AI_USAGE.md).

## Menjalankan

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # unit test (vitest)
npm run typecheck && npm run lint
npm run build        # dist/
```

Tanpa install: buka `docs/index.html` langsung di Chrome/Edge (satu file, offline, tanpa resource luar). Untuk AI lokal: jalankan Ollama, lalu Pengaturan → Penyedia AI → Lokal.

Kontrol utama: WASD + mouse, F aksi, C cek fisik, T papan kerja, J Pak Nusa, M peta, Esc menu. Layar sentuh didukung (joystick + tombol aksi). Daftar lengkap ada di menu Kontrol.

## Arsitektur dan kualitas

- TypeScript + Three.js + Vite, satu dependensi runtime (`three`). Semua model, suara, dan tekstur dibuat prosedural di kode.
- Simulasi jaringan (`src/pcos/`) adalah TS murni tanpa DOM; gameplay (`src/game/`) dan rendering (`src/world/`, `src/assets/`) terpisah. Diagram: [ARCHITECTURE.md](ARCHITECTURE.md). Keputusan desain: [DESIGN.md](DESIGN.md).
- Unit test Vitest untuk simulasi jaringan, gangguan dan penilaian NOC, Lab Praktik (VLSM, inter-VLAN, ACL, UKK, rekap), dan AI. CI GitHub Actions: typecheck, lint, test.
- Playtest otomatis Playwright dengan input nyata (berjalan, mengetik CLI, memasang kabel) di `tools/qa/`.

## Privasi dan Green IT

- Tanpa akun, iklan, analitik, atau pelacak. Progres hanya di `localStorage`; hook tes `window.__kota` hanya aktif dengan `?qa`.
- Satu tampilan grafis untuk semua perangkat, dibuat hemat: mesh statis digabung (draw call di titik awal 6.048 → 3.714, Lab 1.751 → 759), mobil jauh memakai model sederhana, bayangan 2048, hanya lantai gedung di sekitar pemain yang digambar, dan saat panel atau layar PC terbuka adegan digambar ulang ±10 fps saja. Kalau FPS < 24, resolusi render diturunkan, aset tetap.

## Batasan yang jujur

- Belum diuji coba di kelas nyata; validasi sejauh ini adalah review guru TKJ dan playtest otomatis.
- Tanpa server, lembar hasil dan kode hasil bisa dipalsukan; PIN paraf hanya pencegah ringan. Guru sebaiknya mengamati langsung.
- CLI meniru subset Cisco IOS dan Linux yang dipakai di materi, bukan emulator penuh.

## Tim dan lisensi

Indra Bachtiar Zakaria. Dibangun dengan bantuan agen AI (rincian peran di [AI_USAGE.md](AI_USAGE.md)). Lisensi MIT ([LICENSE](LICENSE)). Riwayat: [CHANGELOG.md](CHANGELOG.md).
