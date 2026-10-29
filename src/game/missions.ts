// Mission stubs per ANCHOR_, grounded in SMK TKJ Kurikulum Merdeka (Fase E kelas 10, Fase F kelas 11-12).
// Sources: see /work/research_tkj_city_grounding.md (BSKAP CP TKJ, Kemendikbud lab standard).
export const MISSIONS: Record<string, { title: string; desc: string; fase: 'E' | 'F' }> = {
  ANCHOR_WS_PC_01: { title: 'Atur IP & Ping', desc: 'Beri IPv4 statis ke PC praktik lalu uji ping ke PC sebelah.', fase: 'E' },
  ANCHOR_WS_PC_02: { title: 'Atur IP & Ping', desc: 'Beri IPv4 statis ke PC praktik lalu uji ping ke PC sebelah.', fase: 'E' },
  ANCHOR_WS_PC_03: { title: 'Subnetting', desc: 'Bagi jaringan /24 jadi 4 subnet (CIDR/VLSM) untuk 4 meja.', fase: 'F' },
  ANCHOR_WS_PC_04: { title: 'Subnetting', desc: 'Bagi jaringan /24 jadi 4 subnet (CIDR/VLSM) untuk 4 meja.', fase: 'F' },
  ANCHOR_WS_CRIMPING_01: { title: 'Crimping UTP', desc: 'Buat kabel straight T568B dan cross, lalu cek dengan LAN tester.', fase: 'E' },
  ANCHOR_WS_TOOLCAB_01: { title: 'K3LH & 5R', desc: 'Ambil alat dan APD yang benar, kembalikan rapi (budaya 5R).', fase: 'E' },
  ANCHOR_IT_PC_01: { title: 'Troubleshoot User', desc: 'PC staf tidak dapat internet: cek kabel, IP, gateway, DNS.', fase: 'E' },
  ANCHOR_IT_PC_02: { title: 'Troubleshoot User', desc: 'PC staf tidak dapat internet: cek kabel, IP, gateway, DNS.', fase: 'E' },
  ANCHOR_IT_PC_03: { title: 'Wi-Fi Kantor', desc: 'Sambungkan laptop ke WLAN kantor dengan WPA2.', fase: 'E' },
  ANCHOR_IT_PC_04: { title: 'Proxy', desc: 'Atur proxy agar situs tertentu diblokir untuk staf.', fase: 'F' },
  ANCHOR_IT_PC_05: { title: 'Keamanan Jaringan', desc: 'Ganti password default perangkat dan matikan layanan tak perlu.', fase: 'F' },
  ANCHOR_IT_PC_06: { title: 'IPv6 Dasar', desc: 'Kenali alamat IPv6 link-local dan uji ping6.', fase: 'E' },
  ANCHOR_IT_NOC_01: { title: 'NOC: Bandwidth', desc: 'Pantau trafik dan batasi bandwidth tamu hotel (bandwidth management).', fase: 'F' },
  ANCHOR_SRV_RACK_01: { title: 'Server: DHCP', desc: 'Pasang layanan DHCP untuk VLAN kantor.', fase: 'F' },
  ANCHOR_SRV_RACK_02: { title: 'Server: DNS', desc: 'Buat record DNS nusantara.local.', fase: 'F' },
  ANCHOR_SRV_RACK_03: { title: 'Server: Web', desc: 'Pasang web server untuk halaman hotel.', fase: 'F' },
  ANCHOR_SRV_RACK_04: { title: 'Server: File & Backup', desc: 'Atur berbagi file dan jadwal backup.', fase: 'F' },
  ANCHOR_SRV_NETRACK_01: { title: 'Router & Switch', desc: 'Buat VLAN 10/20/30, routing antar-VLAN, dan NAT ke internet.', fase: 'F' },
  ANCHOR_SRV_UPS_01: { title: 'UPS & Suhu', desc: 'Cek baterai UPS dan pastikan suhu udara masuk server 18–27 °C.', fase: 'F' },
  ANCHOR_LOBBY_RECEPTION_01: { title: 'Wi-Fi Tamu', desc: 'Siapkan hotspot tamu terpisah dari jaringan kantor.', fase: 'F' },
};
