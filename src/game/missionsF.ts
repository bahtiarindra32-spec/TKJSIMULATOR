// Extra missions aligned to CP TKJ Fase F elements (BSKAP, Kurikulum Merdeka):
// Perencanaan & Pengalamatan Jaringan · Teknologi Jaringan Kabel & Nirkabel · Keamanan Jaringan ·
// Pemasangan & Konfigurasi Perangkat Jaringan · Administrasi Sistem Jaringan.
// Every quiz step lists the correct option FIRST in data; the UI shuffles it.

export type QuizStep =
  | { type: 'choice'; q: string; options: string[]; explain: string }
  | { type: 'order'; q: string; items: string[]; explain: string };

export const CP_TAGS: Record<string, string> = {
  m1_k3: 'Fase E · K3LH & budaya kerja 5R',
  m2_crimp: 'Fase E · Media & alat ukur jaringan',
  m3_ip: 'Fase E · Pengalamatan IPv4 & TCP/IP',
  m4_subnet: 'Fase F · Perencanaan & Pengalamatan Jaringan (CIDR, subnetting)',
  m5_vlan: 'Fase F · Pemasangan & Konfigurasi Perangkat Jaringan (VLAN)',
  m6_server: 'Fase F · Administrasi Sistem Jaringan (sistem kontrol & monitoring)',
  m7_wifi: 'Fase F · Teknologi Jaringan Kabel & Nirkabel (WLAN)',
  m8_dhcp: 'Fase F · Administrasi Sistem Jaringan (DHCP server)',
  m9_dns: 'Fase F · Administrasi Sistem Jaringan (DNS server)',
  m10_nat: 'Fase F · Pemasangan & Konfigurasi Perangkat Jaringan (routing & NAT)',
  m11_sec: 'Fase F · Keamanan Jaringan (firewall, autentikasi, kriptografi)',
  m12_voip: 'Fase F · Teknologi Jaringan Kabel & Nirkabel (VoIP)',
  m13_fo: 'Fase F · Teknologi Jaringan Kabel & Nirkabel (fiber optic)',
};

export const QUIZ: Record<string, QuizStep[]> = {
  m7_wifi: [
    { type: 'choice', q: 'Di pita 2,4 GHz (lebar kanal 20 MHz), kanal mana yang tidak saling tumpang tindih?', options: ['1, 6, 11', '1, 2, 3', '3, 7, 12', '5, 10, 13'], explain: 'Kanal 2,4 GHz hanya berjarak 5 MHz, jadi yang umum dipakai tanpa tumpang tindih adalah 1, 6, dan 11.' },
    { type: 'choice', q: 'Lobi hotel ramai, banyak HP tersambung bersamaan. Standar Wi-Fi mana yang paling cocok?', options: ['802.11ax (Wi-Fi 6)', '802.11b', '802.11g', '802.11a'], explain: 'Wi-Fi 6 punya OFDMA dan MU-MIMO, jadi lebih efisien melayani banyak klien sekaligus.' },
    { type: 'choice', q: 'Keamanan yang tepat untuk SSID tamu?', options: ['WPA2/WPA3 + captive portal', 'Open tanpa password', 'WEP', 'WPA dengan TKIP'], explain: 'WEP dan TKIP sudah dianggap tidak aman. Untuk tamu, pakai WPA2/WPA3 dan halaman login (captive portal).' },
    { type: 'choice', q: 'Access point dipasang di plafon lobi tanpa stopkontak. Dayanya dari mana?', options: ['Switch PoE (IEEE 802.3af/at)', 'Kabel listrik sambungan', 'Baterai cadangan', 'Kabel crossover'], explain: 'PoE mengirim data dan listrik lewat satu kabel UTP dari switch ke AP.' },
  ],
  m8_dhcp: [
    { type: 'order', q: 'Urutkan proses DHCP saat laptop tamu baru tersambung (DORA):', items: ['DHCP Discover', 'DHCP Offer', 'DHCP Request', 'DHCP Acknowledge'], explain: 'Klien mencari (Discover), server menawarkan (Offer), klien meminta (Request), server mengonfirmasi (Acknowledge).' },
    { type: 'choice', q: 'Jaringan Wi-Fi kamar 192.168.40.0/24, router di .1. Pool DHCP yang paling masuk akal?', options: ['192.168.40.100 – 192.168.40.200', '192.168.40.0 – 192.168.40.255', '192.168.41.10 – 192.168.41.50', '192.168.40.1 – 192.168.40.254 (termasuk router)'], explain: '.0 adalah alamat network, .255 broadcast, dan .1 sudah dipakai router. Pool harus di dalam subnet yang sama dan tidak bentrok.' },
    { type: 'choice', q: 'Printer kantor dan server sebaiknya dapat IP bagaimana?', options: ['IP statis atau reservasi DHCP', 'Acak dari pool DHCP', 'APIPA 169.254.x.x', 'Tidak perlu IP'], explain: 'Perangkat yang diakses banyak orang harus punya IP tetap supaya alamatnya tidak berubah-ubah.' },
    { type: 'choice', q: 'Laptop tamu mendapat IP 169.254.12.7. Artinya?', options: ['Tidak dapat balasan dari DHCP server', 'Sudah dapat IP publik', 'Konfigurasi sudah benar', 'Hanya DNS yang error'], explain: '169.254.x.x adalah APIPA: Windows memberi alamat sendiri karena tidak ada DHCP server yang menjawab.' },
  ],
  m9_dns: [
    { type: 'choice', q: 'Fungsi utama DNS server?', options: ['Menerjemahkan nama domain ke alamat IP', 'Membagi IP otomatis', 'Memblokir virus', 'Mempercepat kabel'], explain: 'DNS mengubah nama seperti intranet.nusantara.local menjadi IP seperti 192.168.10.20.' },
    { type: 'choice', q: 'Record DNS untuk nama → alamat IPv4 adalah…', options: ['A', 'MX', 'CNAME', 'PTR'], explain: 'A untuk IPv4, AAAA untuk IPv6, MX untuk mail server, CNAME alias, PTR untuk reverse lookup.' },
    { type: 'choice', q: 'Record yang menunjuk server email domain hotel adalah…', options: ['MX', 'A', 'TXT', 'NS'], explain: 'MX (Mail Exchanger) memberi tahu ke server mana email untuk domain itu dikirim.' },
    { type: 'choice', q: 'DNS standar memakai port…', options: ['53', '80', '22', '25'], explain: 'DNS memakai port 53 (UDP, dan TCP untuk respons besar/zone transfer).' },
    { type: 'choice', q: 'nslookup intranet.nusantara.local menjawab 192.168.10.20, tapi browser gagal membuka. Kemungkinan terbesar?', options: ['DNS sudah benar, masalah di web server atau port 80/443', 'DNS salah total', 'Kabel PC putus', 'IP PC bentrok dengan router'], explain: 'Kalau nama sudah berhasil diterjemahkan ke IP, DNS bekerja. Cek layanan web server dan port-nya.' },
  ],
  m10_nat: [
    { type: 'choice', q: 'Semua PC 192.168.x.x harus bisa internet lewat satu IP publik dari ISP. Router butuh…', options: ['NAT (masquerade / overload)', 'VLAN', 'DHCP relay', 'STP'], explain: 'NAT menerjemahkan banyak IP privat menjadi satu IP publik saat keluar ke internet.' },
    { type: 'choice', q: 'Default route (semua tujuan yang tidak dikenal) ditulis sebagai…', options: ['0.0.0.0/0', '255.255.255.255/32', '192.168.0.0/16', '127.0.0.0/8'], explain: '0.0.0.0/0 cocok dengan semua alamat, jadi dipakai sebagai jalur default ke ISP.' },
    { type: 'order', q: 'Susun perintah Cisco untuk route statis ke LAN cabang 192.168.50.0/24 lewat next-hop 10.0.0.2:', items: ['ip route', '192.168.50.0', '255.255.255.0', '10.0.0.2'], explain: 'Formatnya: ip route <network tujuan> <subnet mask> <next-hop>.' },
    { type: 'choice', q: 'Kelebihan routing dinamis (misalnya OSPF) dibanding statis?', options: ['Otomatis mencari jalur baru kalau ada link putus', 'Tidak butuh router', 'Tidak perlu alamat IP', 'Selalu lebih aman tanpa konfigurasi'], explain: 'Protokol dinamis saling bertukar informasi rute, jadi tabel routing menyesuaikan sendiri saat topologi berubah.' },
  ],
  m11_sec: [
    { type: 'choice', q: 'Tamu Wi-Fi (172.16.4.0/22) tidak boleh mengakses jaringan kantor (192.168.20.0/24). Aturan firewall yang tepat?', options: ['DROP src 172.16.4.0/22 → dst 192.168.20.0/24', 'ACCEPT semua trafik', 'DROP src 192.168.20.0/24 → internet', 'Matikan DHCP tamu'], explain: 'Blokir dari sumber jaringan tamu ke tujuan jaringan kantor, internet tamu tetap jalan.' },
    { type: 'choice', q: 'Log server: 2.000 login SSH gagal dari satu IP dalam 5 menit. Ini serangan…', options: ['Brute force', 'Phishing', 'ARP spoofing', 'Ransomware'], explain: 'Mencoba password berulang-ulang secara otomatis adalah brute force.' },
    { type: 'choice', q: 'Tindakan yang tepat untuk serangan itu?', options: ['Blokir IP-nya, pakai login SSH key dan fail2ban', 'Bagikan password admin ke tim', 'Matikan firewall', 'Abaikan saja'], explain: 'IPS sederhana seperti fail2ban memblokir IP setelah gagal berulang. Login pakai key jauh lebih kuat dari password.' },
    { type: 'choice', q: 'Login Wi-Fi karyawan pakai akun masing-masing (802.1X). Server autentikasinya…', options: ['RADIUS', 'FTP', 'DHCP', 'SMTP'], explain: 'RADIUS memeriksa username/password tiap karyawan secara terpusat untuk WPA2/WPA3-Enterprise.' },
    { type: 'choice', q: 'HTTPS melindungi data login tamu dengan…', options: ['Enkripsi TLS', 'Kompresi ZIP', 'VLAN', 'NAT'], explain: 'TLS mengenkripsi data antara browser dan server, jadi tidak bisa dibaca kalau disadap.' },
  ],
  m12_voip: [
    { type: 'choice', q: 'Protokol pensinyalan yang umum dipakai telepon IP untuk membuat panggilan?', options: ['SIP', 'FTP', 'SNMP', 'ICMP'], explain: 'SIP (Session Initiation Protocol) mengatur buka-tutup panggilan. Suaranya dikirim lewat RTP.' },
    { type: 'choice', q: 'Port default SIP adalah…', options: ['5060', '21', '443', '3389'], explain: 'SIP memakai port 5060 (UDP/TCP) dan 5061 untuk SIP over TLS.' },
    { type: 'choice', q: 'IP phone di meja resepsionis tidak dicolok ke listrik. Kenapa tetap menyala?', options: ['Dapat daya PoE dari switch', 'Punya baterai besar', 'Dapat listrik dari Wi-Fi', 'Tenaga surya'], explain: 'Switch PoE memberi daya lewat kabel UTP yang sama dengan datanya.' },
    { type: 'choice', q: 'Suara telepon putus-putus saat jaringan sibuk. Solusi yang tepat?', options: ['QoS: prioritaskan trafik suara di VLAN voice', 'Ganti kabel straight ke crossover', 'Matikan DHCP', 'Kecilkan volume'], explain: 'Suara sangat sensitif terhadap delay dan jitter. QoS memberi trafik suara jalur prioritas.' },
  ],
  m13_fo: [
    { type: 'choice', q: 'Backbone ke gedung cabang berjarak 8 km. Kabel yang tepat?', options: ['Fiber optic single-mode', 'Fiber multimode OM3', 'UTP Cat6', 'Coaxial RG-6'], explain: 'Single-mode cocok untuk jarak kilometer. Multimode untuk jarak pendek (ratusan meter), UTP maksimal 100 m.' },
    { type: 'order', q: 'Urutkan langkah penyambungan fiber dengan fusion splicer:', items: ['Pasang sleeve, lalu kupas jaket & coating (stripper)', 'Bersihkan core dengan alkohol', 'Potong rata dengan cleaver', 'Sambung (fusion) di splicer', 'Geser sleeve & panaskan sebagai pelindung'], explain: 'Sleeve dipasang sebelum menyambung, fiber dikupas, dibersihkan, dipotong rata, disambung, lalu dilindungi.' },
    { type: 'choice', q: 'Alat untuk mengukur daya cahaya yang diterima (dBm) di ujung link?', options: ['OPM (Optical Power Meter)', 'LAN tester RJ45', 'Tang crimping', 'Multimeter'], explain: 'OPM mengukur daya optik. Dibandingkan dengan sumber cahaya, hasilnya jadi nilai redaman link.' },
    { type: 'choice', q: 'Kabel putus di tengah jalur 8 km. Alat untuk menemukan jarak titik putusnya?', options: ['OTDR', 'OPM', 'Tang potong', 'LAN tester'], explain: 'OTDR mengirim pulsa cahaya dan membaca pantulannya, jadi bisa menunjukkan jarak titik putus atau sambungan buruk.' },
  ],
};
