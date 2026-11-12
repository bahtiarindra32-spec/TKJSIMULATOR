# Riwayat Perubahan

Ringkasan per hari. Detail lengkap ada di riwayat git.

## 2026-11-12
- Fase 2 MikroTik: mesin RouterOS 7 (`src/pcos/routeros/`: model, CLI dengan path `/ip …`, `print`/`export`, wizard `/ip dhcp-server setup` dan `/ip hotspot setup`, simple queue, firewall filter/NAT, user hotspot + profile rate-limit, backup) yang ikut simulasi jaringan dan dinilai dari kondisi router, bukan dari ketikan.
- Router MikroTik di tempat lapangan: RB951Ui-2HnD di Warnet Sinar dan hAP lite (RB941-2nD) di Kos Mawar. Dari PC/laptop pelanggan: Winbox (Neighbors › connect lewat MAC › New Terminal), WebFig di browser, halaman login hotspot, dan halaman speedtest.cari.id yang menampilkan batas queue/hotspot yang benar-benar berlaku.
- Empat order lapangan baru (terbuka per reputasi): `w_hotspot` (hotspot voucher warnet + rate-limit di user profile, diuji login voucher dari PC), `k_queue` (simple queue per kamar kos, diuji speedtest dari laptop penghuni), `k_fasttrack` (limit kamar tidak jalan karena rule fasttrack), `w_reset` (internet warnet mati setelah router direset).
- Lab Praktik: langkah "Router MikroTik: konfigurasi dasar (paket UKK)" (11 checkpoint) dan langkah opsional "Hotspot MikroTik + user" (`mikrotik`, `mthotspot`) dengan soal beda tiap siswa; router hAP lite lab di rak dinding tembok timur, samping rak lab.
- Perbaikan: kolom kode jobsheet menerima 9 karakter (kode MikroTik + PIN paraf); rekap kelas membaca kode hasil yang memakai PIN.
- Playtest: qa_ros (order lapangan dengan input nyata), qa_praktik mikrotik, qa_tutor; 348 unit test.

## 2026-11-07
- Fase 1 Karier lapangan, bagian 1 (tempat + jaringan): empat gedung baru yang bisa dimasuki, Kantor Nusa Teknik (papan order, lemari material, motor kantor), Rumah Kel. Hendra (ONT ISP + router Wi-Fi mode AP, laptop, smart TV), Kos Mawar (2 lantai dengan tangga, 6 kamar, router + AP per lantai) dan Warnet Sinar (switch 16 port + patch panel di rak dinding, 8 PC + kasir). Tiap tempat punya subnet dan jalur ISP sendiri, terpisah dari hotel; laptop/PC membuka Jendela dan halaman router seperti di hotel; ONT, router kos, AP dan TV punya panel status dari simulasi. Unit test sites (13), playtest qa_sites untuk keempat tempat.
- Fase 1 Karier lapangan, bagian 2 (pekerjaan berbayar): terbuka setelah pangkat Teknisi Junior. Papan order 2–4 order per hari dari 8 jenis pekerjaan yang menyuntik gangguan nyata (router mati, DHCP ONT, kabel putus, AP lantai 2, kanal Wi-Fi, port/VLAN switch warnet, kabel PC, loop STP). Order hanya selesai kalau jaringan sehat dan diuji dari perangkat pelanggan, lalu berita acara + nota. Saldo, tarif dari kisaran riset (label "perkiraan tarif pasar"), material dipotong dari bayaran, bayaran per bintang, denda kalau gagal, reputasi per jenis pelanggan, order garansi 1–2 hari kemudian kalau pemeriksaan lemah (kabel crimp tidak standar/tidak dites, konfigurasi switch tidak disimpan). Kartu order + chip saldo/reputasi di HUD (desktop & HP), penanda jalan ke lokasi, layar jalur karier dengan catatan legalitas RT/RW Net. Save baru `kotaNusantara.field.v1`.
- Dipakai bersama dengan magang: bar tahap Survei → Kerja → Uji → Dokumentasi dan cek fakta berita acara pindah ke `noc/berita.ts`; meja crimping mencatat pemakaian RJ45/UTP. Wi-Fi kini mencocokkan SSID **dan** sandi (perangkat pelanggan tidak tersambung ke SSID yang sama kalau sandinya beda/terbuka).
- Perbaikan: Mode Juri tidak lagi membuka kerja lapangan untuk save pemain (pangkat tur hanya pinjaman), dan save lapangan ikut dicadangkan/dikembalikan oleh tur.
- Playtest: qa_field (unlock, order lengkap dengan input nyata, garansi, tangkapan 1280×720 + HP potret/lanskap); regresi qa_tutor, qa_contracts crimp, qa_praktik run, qa_demo, qa_mobile port, qa_sites (4 tempat). 241 unit test.

## 2026-11-06
- Green IT (tetap satu tampilan): lantai hotel L2–L8 digabung per material; mobil jauh (>70 m) digambar instanced, motor jauh digabung, lajur jauh disimulasi 4 Hz; pass AO tidak merender ulang bayangan; menu pause digambar ulang ±4 fps. Draw call titik awal 3.714 → 2.049, kota 2.241 → 977, Lab 753 → 516. Kode tier mati dihapus; penjaga FPS hanya menurunkan AO lalu resolusi render.
- Perbaikan: bias bayangan aktif lagi (sebelumnya mati karena komentar sebaris); hitungan ELEMEN UTAMA di lembar hasil; langkah yang belum dikerjakan dihitung "belum", bukan dibuang; minimap kecil yang bisa diketuk di HP; toast HP landscape tidak menutupi jobsheet; panel Mode Juri tidak menutupi baris petunjuk.
- Playtest: qa_mobile port/land, qa_v6 (lift + tangga), qa_npc2, tangkapan lantai hotel & lalu lintas dibandingkan dengan build sebelumnya. 205 unit test.

## 2026-11-04
- AI: penyedia Lokal (Ollama/LM Studio, kompatibel OpenAI, tanpa key/internet) di Pengaturan dengan izin per penyedia; status Pak Nusa menyebut penyedia + model. Rekap kelas guru: tombol "Ringkasan AI" (hanya angka anonim per langkah, label "Dibuat AI · periksa kembali", ringkasan angka tetap tampil tanpa AI). Penjaga anti-contek memotong jawaban mentor yang berisi IP/mask/gateway lengkap atau blok CLI ≥4 baris. Unit test nusa (privasi payload, URL penyedia, penjaga, prompt rekap), playtest qa_ai_local.
- Kode: `noc.ts` (157 KB) dipecah tanpa mengubah perilaku ke `src/game/noc/` (faults, contracts, scoring, save, checks, core/workshop/board); `noc.ts` tetap facade. Bug XP tutorial diperbaiki: papan kerja menampilkan 60 XP dan tutorial memberi tepat 60 XP (sebelumnya +78). `tests/noc.test.ts`: semua 26 jenis gangguan × semua variannya disuntik lalu diperbaiki lewat alat game (rak, console switch, R-EDGE, srv-nusa) sampai jaringan sehat, plus bintang/SLA/XP, ambang pangkat, save. `strict` eksplisit di tsconfig, ESLint (typescript-eslint), CI GitHub Actions (typecheck, lint, test, build).

- Perbaikan dari review juri: K3 "alat dikembalikan" hanya dinilai kalau siswa memang meminjam alat (bukan poin gratis); modal tidak lagi terpotong di 1280×720 (kotak bisa digulir, tombol tutup selalu terlihat); panel Mode Juri pindah ke pojok kiri bawah saat modal terbuka; toast di HP tidak menutupi jobsheet; baris petunjuk tombol dan legenda minimap tidak terpotong; lembar hasil terbuka di kop.
- Green IT (tetap satu tampilan): bayangan 2048 (dari 4096, memori GPU ¼), adegan digambar ulang ±10 fps saat panel/layar PC menutupi permainan.
- Privasi: hook tes `window.__kota` hanya aktif dengan `?qa`.
- Repo: README ditulis ulang untuk juri (masalah bersumber, Mode Juri, AI, batasan); daftar fitur lengkap pindah ke FITUR.md; `design/request.md` diganti `design/brief.md`; storyboard video di `design/video-storyboard.md`; skrip QA usang dan folder `single/` dihapus (build satu file tetap di `docs/index.html`); versi 1.0.0.
- Review juri 3: penjaga anti-contek diperketat (IP + gateway satu baris, mask "/24"/"mask biasa"/"prefix 24", ≥3 perintah konfigurasi termasuk yang dipisah koma/titik koma/`backtick`, ≥2 nilai target tugas aktif) dengan tabel uji adversarial 44 kasus; jendela Pak Nusa saat AI mati menampilkan "Coba AI live" (AI lokal di laptop ini: izin di tempat → tes koneksi → hasil atau langkah pasang Ollama; OpenRouter: membuka Pengaturan di bagian AI), teks Mode Juri stop 5 disesuaikan, tanpa jawaban AI rekaman; Pengaturan › Privasi & data: "Hapus semua data saya".

## 2026-11-03
- Router edge R-EDGE: NAT dua ISP memakai route-map (ISP1 keluar Gi0/0, ISP2 keluar Gi0/1) seperti contoh dual-ISP PAT Cisco. Perintah baru `route-map NAMA permit 10`, `match ip address`, `match interface`, `ip nat inside source route-map`, `show route-map`. Menulis `list N` yang sama untuk interface lain kini mengganti pemetaan lama dengan peringatan, sesuai perilaku IOS. Unit test edge (48 total), playtest qa_edge.

## 2026-11-02
- Review berlapis (juri, guru TKJ, playtester). AI bawaan pindah ke `openrouter/free` dengan fallback dan tombol Tes koneksi AI.
- Spanning tree di switch: kabel loop hanya menimbulkan broadcast storm kalau STP dimatikan.
- Uji kenaikan pangkat (XP saja tidak cukup), berita acara sebelum pekerjaan ditutup, tahapan Survei → Kerja → Uji → Dokumentasi, stok konektor RJ45, paraf guru per langkah di Lab Praktik.
- Polesan: lemari alat menandai alat yang diperlukan + tombol ambil sekaligus, animasi pasang patch cord (klik RJ45, LED kuning → hijau), nama pemain di Pengaturan untuk surat kerja & jobsheet, posisi awal menghadap pintu lobi ke arah Workshop, versi hanya di Tentang, kalimat defensif dihapus, keputusan bahasa dicatat di DESIGN.md.
- PIN paraf guru (kode 8 karakter, cek 7-bit, kunci 1 menit setelah 3 salah), checkpoint K3 alat dikembalikan di langkah terakhir, izin kirim data ke OpenRouter (default belum) dan opsi API key hanya untuk sesi ini. 2 unit test baru (46), playtest qa_pin.
- Mode Juri (menu utama atau ?juri): tur 6 pemberhentian ke fitur unggulan, save pemain dicadangkan dan dikembalikan (juga setelah reload). Playtest qa_demo.
- Rekap kelas tanpa server: kode hasil di lembar hasil (salin), meja guru → Guru: rekap kelas (tempel chat, tolak kode rusak, percobaan terbaru per nama, tabel + CSV). 3 unit test baru (44), playtest qa_recap.
- Lab Praktik: tiga langkah baru. Rancang VLSM (tabel di jobsheet, desain benar apa pun diterima), routing antar-VLAN router-on-a-stick di router lab R-LAB (console IOS: subinterface dot1Q, trunk Gi1/0/24 + native VLAN 70 di SW-LAB), dan firewall antar-VLAN dengan ACL extended. Kode jobsheet 7 karakter bila memakai langkah baru; kode 6 karakter lama tetap valid. 7 unit test baru (41 total), playtest qa_ivlan.
- Performa (satu level grafis tetap): Lab Praktik dan papan nama jalan di-batch, warna polos digabung per jenis permukaan (warna pindah ke vertex), mobil jauh (>70 m) memakai model sederhana, dan mobil parkir tidak lagi tergambar dua kali. Draw call di titik awal 6.048 → 3.714, di Lab 1.751 → 759.
- Layout HP: portrait menampilkan tombol utama saja (⋯ untuk sisanya), kotak lokasi/jam/kartu kerja/jobsheet tidak bertumpuk dan tidak menutupi joystick, tabel papan kerja bisa digeser, penanda tujuan menghindari panel samping, keterangan langkah di layar PC menyesuaikan layar sempit.
- Lab Praktik: penanda arah ke tempat langkah berikutnya (meja crimping, rak lab, meja siswa, meja guru untuk paraf); penanda tidak lagi tertutup panel jobsheet.
- Lembar hasil Lab Praktik memakai format penilaian UKK: kriteria utama/pendukung, predikat Sangat Kompeten/Kompeten/Cukup Kompeten/Belum Kompeten, nilai 0–100; tombol Unduh CSV dan Cetak A4 dengan kolom tanda tangan.
- Berita acara dicek isinya: alamat IP yang ditulis harus sesuai hasil kerja, dan harus menyebut cara verifikasi.
- Di layar PC ada keterangan tahap dan langkah berikutnya; jam taskbar mengikuti jam di kota; akun Windows sesuai pemakai (siswa, teknisi, staf, tamu).
- Menu judul punya Lab Praktik; tutorial dimulai tanpa panel teks panjang. Lisensi MIT, AI_USAGE.md.

## 2026-11-01
- Gedung Lab Praktik TKJ di SMK Nusantara: guru menyusun jobsheet jadi kode, siswa mengerjakan, nilai dari rubrik simulator.
- Hari kerja magang (kontrak → shift → insiden → evaluasi), kontrak instalasi baru (printer, VoIP, berbagi berkas, DHCP Linux, failover ISP), minigame crimping T568B.

## 2026-10-31
- Server Linux (systemctl, dhcpd, bind9), Wi-Fi analyzer, router edge dengan NAT/ACL, aksesibilitas dan kontrol sentuh.

## 2026-10-29 – 2026-10-30
- Versi pertama: kota bergaya Jakarta, hotel kantor dengan rak dan switch, simulasi jaringan (kabel terstruktur, VLAN, DHCP, DNS), Jendela 11 dengan Command Prompt, console switch, papan kerja dan tiket gangguan.
