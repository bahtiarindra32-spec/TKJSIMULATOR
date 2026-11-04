# Brief proyek

**Tujuan:** simulator jaringan 3D di browser untuk siswa SMK TKJ (Fase E/F) dan guru, yang melatih pekerjaan teknisi secara fisik dan bisa dipakai di kelas tanpa server dan tanpa alat jaringan asli.

**Titik awal (27 Okt 2026):** dokumen rancangan kota "Prompt Pascal Kota Nusantara" milik pengembang (`design/source-pascal-prompt.md`): tata kota bergaya Jakarta, jalan, zona, gedung, dan nama objek (ROAD_, ZONE_, BLD_, PROP_, ANCHOR_). Dokumen ini diaudit terhadap pedoman nyata, bukan diikuti mentah; perubahan dicatat di FITUR.md §6.

**Aturan desain yang ditetapkan pengembang:**
- Setiap mekanik berdasar standar atau perangkat nyata (TIA-568, Cisco IOS, Debian/Ubuntu, Windows). Yang tidak bisa disimulasikan dengan jujur tidak dibuat.
- Tanpa kuis dan tanpa tombol ajaib: pekerjaan selesai hanya kalau jaringan simulasi sehat dan diuji dari perangkat.
- Setiap aksi fisik: berjalan ke rak, mengambil alat, memasang kabel.
- Satu tampilan grafis untuk semua perangkat; penghematan lewat penggabungan mesh dan LOD.
- Penilaian deterministik dari simulator; AI hanya membantu (mentor, teks), tidak menilai.
- Offline: tanpa resource jaringan luar.

**Pengguna:** siswa kelas 10/11 TKJ (laptop sekolah, HP), guru produktif TKJ (menyusun praktik, menilai, merekap).

**Selesai berarti:** tutorial sampai shift helpdesk bisa dimainkan tanpa bantuan; guru bisa menyusun jobsheet, siswa mengerjakannya, dan guru mendapat nilai format UKK dan rekap kelas; semua tanpa server.
