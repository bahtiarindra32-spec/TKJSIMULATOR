# Penggunaan AI dalam Kota Nusantara

Dokumen ini menjelaskan dengan terbuka di mana AI dipakai: saat **membangun** game dan **di dalam** game.

## 1. AI saat pengembangan

- Game ini dikembangkan oleh Indra Bachtiar Zakaria dengan bantuan agen AI (Hark) yang menulis sebagian besar kode TypeScript/Three.js berdasarkan arahan.
- Peran pengembang: menentukan ide dan tujuan (simulator TKJ untuk siswa SMK), memilih dan menolak fitur, menetapkan aturan desain (setiap mekanik harus sesuai standar nyata, tanpa kuis, tanpa tombol ajaib), mencoba game, dan memberi koreksi tiap versi.
- Peran AI: menulis dan merapikan kode, menulis tes otomatis (Vitest, Playwright), meriset standar (T568B, perintah Cisco IOS, Capaian Pembelajaran TKJ, instrumen UKK), dan mereview game dari sudut juri, guru, dan pemain.
- Brief proyek ada di `design/brief.md`. Permintaan awal ke agen AI (27 Okt 2026) adalah membangun dunia kota dari dokumen rancangan milik pengembang (`design/source-pascal-prompt.md`), dengan brainstorm, rencana, dan target bertahap. Riwayat perubahan di `CHANGELOG.md` dan riwayat git.
- Semua kode diuji: `tsc --noEmit`, unit test Vitest, dan playtest otomatis di browser sebelum dipublikasikan.

## 2. AI di dalam game

| Fitur | Yang dikirim | Kalau AI mati / offline |
|---|---|---|
| Pak Nusa (mentor) | Data simulasi tiket, konfigurasi IP simulasi, log langkah, pertanyaan pemain | Petunjuk offline berbasis aturan |
| Kalimat keluhan pelanggan | Ringkasan gangguan simulasi | Teks keluhan bawaan |
| Umpan balik catatan tiket | Catatan yang ditulis pemain | Pengecekan kata kunci (gejala, penyebab, tindakan, verifikasi) |

- AI hanya aktif kalau pemain mengisi API key OpenRouter sendiri. Key disimpan di browser itu saja.
- Jawaban AI diberi label, dan Pak Nusa diarahkan memberi petunjuk, bukan jawaban langsung.
- **Penilaian tidak memakai AI.** Selesai tidaknya pekerjaan, bintang, dan nilai Lab Praktik dihitung dari kondisi jaringan simulasi (deterministik).
- Tanpa akun, iklan, cookie pelacak, atau analitik. Progres disimpan di `localStorage`.
