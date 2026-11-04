// Shift tickets: the fault catalogue and how each fault is really injected into the network simulation.
// A ticket closes only when the simulated network is healthy again, so every entry here has a real counterpart
// in net.ts / wifi.ts / ext.ts that the player repairs with the in-game tools (cable, console CLI, web UIs).
import {
  ENVS,
  adapterOf,
  envOf,
  portOf,
  bounce,
  maskStr,
  panelOf,
  patchCord,
  portName,
  apPort,
  healthy,
  isWireless,
  isWired,
  parseIp,
  ipStr,
} from '../../pcos/net';
import { AUTH, CLIENTS, servingAp, heardAt, type Ap } from '../../pcos/wifi';
import { EXT } from '../../pcos/ext';
import { pick, hostIp, freeIpIn } from './util';
import type { Job } from './types';

type BaseFault =
  | 'cable'
  | 'cablebad'
  | 'port'
  | 'vlan'
  | 'disabled'
  | 'released'
  | 'wrongip'
  | 'conflict'
  | 'gateway'
  | 'dns'
  | 'patch'
  | 'uplink'
  | 'loop'
  | 'portal'
  | 'appoe'
  | 'aprf'
  | 'dhcppool';
export type FaultId = BaseFault | (string & {});
export interface FaultDef {
  cause: string;
  fix: string;
  symptom: string;
  hint: string;
  cp: string;
  wired: boolean;
  rank: number;
  wifi?: boolean;
  ext?: boolean;
}
export const FAULTS: Record<string, FaultDef> = {
  cable: {
    cause: 'Konektor RJ45 di PC lepas/longgar',
    fix: 'konektor dicolok ulang sampai terkunci',
    symptom: 'Ikon jaringan silang merah, internet mati total.',
    hint: 'Status adapter "Network cable unplugged" = lapisan fisik. Datangi PC, tekan C, periksa konektor.',
    cp: 'Fase E · Media transmisi',
    wired: true,
    rank: 0,
  },
  disabled: {
    cause: 'Adapter jaringan di-disable',
    fix: 'adapter di-enable lagi',
    symptom: 'Ikon jaringan hilang, PC tidak terhubung ke mana pun.',
    hint: 'Buka Network Connections. Adapter abu-abu = Disabled.',
    cp: 'Fase E · Konfigurasi klien',
    wired: false,
    rank: 0,
  },
  released: {
    cause: 'Alamat DHCP dilepas (release) dan belum diminta lagi',
    fix: 'ipconfig /renew',
    symptom: 'Terhubung tapi tidak dapat alamat IP.',
    hint: 'ipconfig: IPv4 kosong? Minta alamat lagi ke DHCP server.',
    cp: 'Fase F · DHCP',
    wired: false,
    rank: 0,
  },
  wrongip: {
    cause: 'IP statis salah subnet',
    fix: 'IP disesuaikan dengan subnet ruangan / kembali ke DHCP',
    symptom: 'Tidak bisa ping gateway, internet mati.',
    hint: 'Bandingkan IP PC dengan subnet router ruangan.',
    cp: 'Fase E · Pengalamatan IPv4',
    wired: false,
    rank: 0,
  },
  gateway: {
    cause: 'Default gateway salah',
    fix: 'gateway diarahkan ke router segmen',
    symptom: 'Bisa ping perangkat satu ruangan, tapi internet tidak bisa.',
    hint: 'ipconfig: Default Gateway harus alamat router segmen ini.',
    cp: 'Fase F · Routing',
    wired: false,
    rank: 1,
  },
  dns: {
    cause: 'Server DNS salah',
    fix: 'DNS diarahkan ke DNS yang benar',
    symptom: 'ping 8.8.8.8 bisa, tapi situs tidak terbuka.',
    hint: 'nslookup cari.id gagal? Periksa DNS di IPv4 Properties.',
    cp: 'Fase F · DNS',
    wired: false,
    rank: 1,
  },
  cablebad: {
    cause: 'Patch cord rusak (pasangan kabel putus)',
    fix: 'patch cord diganti yang baru',
    symptom: 'Kabel terpasang tapi lampu link mati.',
    hint: 'Konektor terpasang tapi LED mati? Tes pakai LAN tester (ambil di lemari alat).',
    cp: 'Fase E · Alat ukur jaringan',
    wired: true,
    rank: 1,
  },
  port: {
    cause: 'Port switch shutdown',
    fix: 'interface di-no shutdown lewat console',
    symptom: 'Kabel bagus, tapi lampu link tetap mati.',
    hint: 'Kabel lolos LAN tester tapi link mati = cek port di switch (rak ruang server L1).',
    cp: 'Fase F · Konfigurasi switch',
    wired: true,
    rank: 1,
  },
  conflict: {
    cause: 'IP bentrok dengan perangkat lain',
    fix: 'IP diganti ke alamat yang kosong / DHCP',
    symptom: 'Muncul peringatan konflik alamat IP, koneksi kacau.',
    hint: 'arp -a / ping alamat itu: ada perangkat lain memakai IP yang sama.',
    cp: 'Fase E · Pengalamatan IPv4',
    wired: false,
    rank: 2,
  },
  patch: {
    cause: 'Patch cord di rak lantai tercabut dari switch',
    fix: 'patch cord dari port patch panel outlet itu dicolok lagi ke port switch',
    symptom: 'Kabel di meja terpasang dan lolos tes, tapi lampu link tetap mati.',
    hint: 'Kabel meja baik tapi link mati: ke rak lantai itu. Cari port patch panel outlet ini (dari label, atau pakai toner kalau labelnya hilang) dan periksa patch cord-nya.',
    cp: 'Fase F · Sistem pengkabelan terstruktur',
    wired: true,
    rank: 1,
  },
  uplink: {
    cause: 'Uplink switch lantai ke MDF terputus',
    fix: 'uplink dipulihkan',
    symptom: 'Satu lantai tidak bisa akses apa pun, padahal lampu link di PC menyala.',
    hint: 'Banyak PC satu lantai kena bersamaan = masalah di uplink switch lantai (rak IDF). Lihat LED uplink Gi1/0/49, lalu show interfaces trunk.',
    cp: 'Fase F · Trunk & uplink antar-switch',
    wired: true,
    rank: 2,
  },
  loop: {
    cause: 'Loop: kabel menyambung dua port switch yang sama, padahal spanning-tree di switch itu dimatikan (broadcast storm)',
    fix: 'kabel loop dicabut dan spanning-tree diaktifkan lagi',
    symptom: 'Jaringan satu lantai lumpuh total, semua lampu switch berkedip cepat.',
    hint: 'Semua LED switch berkedip + log MAC flapping di console = loop. Catalyst bawaan menjalankan STP, jadi cek show spanning-tree: kalau mati, storm bisa terjadi. Cabut kabel loop di rak, lalu aktifkan lagi spanning-tree (spanning-tree mode rapid-pvst) dan write memory.',
    cp: 'Fase F · Loop & STP',
    wired: true,
    rank: 2,
  },
  portal: {
    cause: 'Laptop tamu belum login captive portal (sesi Wi-Fi tamu habis setelah ganti kamar)',
    fix: 'login captive portal dengan nomor kamar + nama belakang',
    symptom: 'Wi-Fi tersambung, tapi tidak ada situs yang bisa dibuka.',
    hint: 'Wi-Fi tamu memakai captive portal: dapat IP dan DNS jalan, tapi internet ditahan sampai tamu login. Buka browser di laptop itu.',
    cp: 'Fase F · Jaringan nirkabel',
    wired: false,
    rank: 1,
    wifi: true,
  },
  appoe: {
    cause: 'AP koridor mati (tidak dapat daya PoE / link dari switch lantai)',
    fix: 'AP dinyalakan lagi dari switch lantai',
    symptom: 'Sinyal Wi-Fi di kamar tinggal 1–2 bar, internet putus-putus.',
    hint: 'Laptop pindah ke AP yang jauh = AP terdekat mati. Cek NusaWLC (status Offline) dan rak IDF lantai itu: show power inline, show interfaces status.',
    cp: 'Fase F · Jaringan nirkabel & PoE',
    wired: false,
    rank: 1,
    wifi: true,
  },
  aprf: {
    cause: 'Gangguan radio AP: kanal tumpang tindih dengan AP tetangga / daya pancar terlalu kecil',
    fix: 'kanal/daya AP diatur ulang di kontroler Wi-Fi',
    symptom: 'Wi-Fi kamar lemot sekali, ping naik-turun ratusan ms dan sering timeout.',
    hint: 'Bawa Wi-Fi analyzer (R) ke kamar itu: lihat AP mana yang melayani dan siapa yang memakai kanal sama/berdekatan. Atur kanal 1/6/11 atau daya TX di NusaWLC (http://192.168.10.20 dari PC IT).',
    cp: 'Fase F · Jaringan nirkabel',
    wired: false,
    rank: 2,
    wifi: true,
  },
  dhcppool: {
    cause: 'Pool DHCP Wi-Fi tamu terlalu kecil dan penuh (lease 24 jam)',
    fix: 'pool DHCP tamu diperbesar di router gw-tamu',
    symptom: 'Wi-Fi tersambung tapi "No internet", laptop dapat 169.254.x.x.',
    hint: 'APIPA di Wi-Fi = DHCP tidak menjawab. Router tamu (172.16.4.1) bisa dibuka dari PC IT (segmen lab boleh manajemen). Lihat DHCP › Leases: pool penuh?',
    cp: 'Fase F · DHCP',
    wired: false,
    rank: 2,
    wifi: true,
  },
  vlan: {
    cause: 'Port switch masuk VLAN yang salah',
    fix: 'switchport access vlan dikembalikan',
    symptom: 'Lampu link nyala, tapi PC hanya dapat 169.254.x.x.',
    hint: 'Link ada tapi DHCP tidak sampai = cek VLAN port di switch (show vlan brief).',
    cp: 'Fase F · VLAN',
    wired: true,
    rank: 2,
  },
};
/** faults fixed on the edge router R-EDGE (the switch "dirty" check also looks at the edge config) */
export const EDGE_F = ['isp1', 'nat', 'acl'];

/** Faults owned by the infrastructure modules (Linux server, office devices, edge router) join the catalogue. */
export function registerExtFaults() {
  for (const [id, x] of Object.entries(EXT)) FAULTS[id] = { ...x.def, wired: false, ext: true };
}

/** One random fault for this PC at this rank, weighted towards faults the technician struggled with. */
export function pickFaultFor(
  pc: string,
  rk: number,
  rand: () => number,
  jobs: Job[],
  mastery: Partial<Record<string, { ok: number; miss: number }>>,
  not?: FaultId,
  swBusy = false,
): FaultId {
  const env = envOf(pc);
  const sw = portOf(pc)?.sw;
  const ids = (Object.keys(FAULTS) as FaultId[]).filter(
    id =>
      FAULTS[id].rank <= rk &&
      id !== not &&
      !(FAULTS[id].wired && isWireless(pc)) &&
      !(id === 'released' && !adapterOf(pc).dhcp) &&
      !(id === 'conflict' && env.hosts.length < 2) &&
      !((id === 'uplink' || id === 'loop') && (swBusy || !sw || not !== undefined)) &&
      !(id === 'uplink' && !sw?.uplink) &&
      !(id === 'patch' && !isWired(pc)) &&
      !(FAULTS[id].wifi && (!isWireless(pc) || not !== undefined || !faultBites(pc, id, jobs))) &&
      !(id === 'dhcppool' && jobs.some(j => j.faults.includes('dhcppool'))) &&
      !(EXT[id] && (not !== undefined || !EXT[id].eligible(pc) || jobs.some(j => j.faults.includes(id)))),
  );
  const w = ids.map(id => {
    const m = mastery[id] ?? { ok: 0, miss: 0 };
    return Math.max(0.3, 1 + m.miss * 1.5 - Math.min(m.ok, 4) * 0.2);
  });
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) {
    r -= w[i];
    if (r <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}
/** would this Wi-Fi fault really hurt this laptop? (tried and undone) */
export function faultBites(pc: string, id: FaultId, jobs: Job[]): boolean {
  const ap = servingAp(pc);
  if (!ap) return false;
  if (id === 'portal' || id === 'dhcppool') return true;
  if (jobs.some(j => j.status !== 'closed' && j.targets.some(t => servingAp(t.pc.name) === ap))) return false; // one ticket per AP
  const p = apPort(ap);
  if (!p) return false;
  const a = adapterOf(pc);
  if (id === 'appoe') {
    p.port.poe = false;
    const bad = !healthy(a);
    p.port.poe = true;
    return bad;
  }
  if (id === 'aprf') {
    const v = rfVariant(pc, ap);
    if (!v) return false;
    const keep = { ch: ap.ch, power: ap.power };
    v.apply();
    const bad = !healthy(a);
    ap.ch = keep.ch;
    ap.power = keep.power;
    return bad;
  }
  return true;
}
/** a radio misconfiguration of the laptop's AP that really degrades it (channel clash or low TX power) */
export function rfVariant(pc: string, ap: Ap): { apply: () => void; detail: string } | null {
  const c = CLIENTS.get(pc)!;
  const rival = heardAt(c.lx, c.lz, c.y, c.level).find(x => x.ap !== ap && !x.ap.ext);
  const opts: { apply: () => void; detail: string }[] = [];
  if (rival)
    opts.push({
      apply: () => {
        ap.ch = rival.ap.ch;
      },
      detail: `${ap.id} dipindah ke kanal ${rival.ap.ch}, sama dengan ${rival.ap.id} yang terdengar ${rival.rssi} dBm di kamar → kanal ${ap.id} dikembalikan ke kanal yang tidak tumpang tindih`,
    });
  opts.push({
    apply: () => {
      ap.power = 'Rendah';
    },
    detail: `Daya TX ${ap.id} diset Rendah (8 dBm) → dinaikkan ke Sedang/Tinggi`,
  });
  const ok = opts.filter(o => {
    const keep = { ch: ap.ch, power: ap.power };
    o.apply();
    const bad = !healthy(adapterOf(pc));
    ap.ch = keep.ch;
    ap.power = keep.power;
    return bad;
  });
  return ok.length ? pick(ok) : null;
}
/** Break the ticket's PC so the fault really exists in the simulation (sets t.detail for the report). */
export function injectFaults(t: Job) {
  const name = t.targets[0].pc.name;
  const a = adapterOf(name),
    env = envOf(name),
    p = portOf(name);
  const mask = maskStr(env.prefix);
  const staticGood = () => {
    a.dhcp = false;
    a.ip = freeIpIn(env, Math.random, 150, 190);
    a.mask = mask;
    a.gw = env.gateway;
    a.dns1 = env.gateway;
    a.dns2 = '';
    a.dnsAuto = false;
    a.lease = undefined;
  };
  for (const f of t.faults) {
    if (EXT[f]) {
      t.detail = EXT[f].inject(name);
      continue;
    }
    if (f === 'cable') {
      a.cable = false;
      bounce(a);
    } else if (f === 'cablebad') {
      a.broken = true;
      bounce(a);
    } else if (f === 'port' && p) p.port.shutdown = true;
    else if (f === 'vlan' && p) {
      p.port.vlan = pick([99, 50, 1]);
      if (!p.sw.vlans.has(50) && p.port.vlan === 50) p.sw.vlans.set(50, 'CCTV');
      if (p.port.vlan === 99) p.sw.vlans.delete(99);
    } else if (f === 'disabled') a.enabled = false;
    else if (f === 'released') {
      a.dhcp = true;
      a.lease = { ip: '', t: Date.now(), prefix: 0, gw: '', dns: [], env: env.id, server: '' };
    } else if (f === 'wrongip') {
      a.dhcp = false;
      a.ip = `192.168.1.${20 + Math.floor(Math.random() * 200)}`;
      a.mask = '255.255.255.0';
      a.gw = '192.168.1.1';
      a.dns1 = '192.168.1.1';
      a.dns2 = '';
      a.dnsAuto = false;
    } else if (f === 'gateway') {
      staticGood();
      a.gw = hostIp(env, 254) === env.gateway ? hostIp(env, 253) : hostIp(env, 254);
    } else if (f === 'dns') {
      a.dnsAuto = false;
      a.dns1 = '10.10.10.53';
      a.dns2 = '';
    } else if (f === 'conflict') {
      staticGood();
      a.ip = pick(env.hosts.filter(x => x.web !== 'router')).ip;
    } else if (f === 'patch') {
      const q = panelOf(name)!;
      patchCord(q.sw, q.pp.n, null);
      if (Math.random() < 0.5) q.pp.label = '';
    } else if (f === 'uplink' && p?.sw.uplink) {
      const sw = p.sw,
        v = pick(['fiber', 'shut', 'trunk'] as const);
      if (v === 'fiber') {
        sw.uplink!.cable = false;
        t.detail = 'Konektor LC patch fiber uplink di rak IDF tidak terkunci → dipasang ulang sampai "klik"';
      } else if (v === 'shut') {
        sw.upPort.shutdown = true;
        t.detail = 'Port uplink Gi1/0/49 di-shutdown → no shutdown';
      } else {
        sw.uplink!.allowed = [...sw.vlans.keys()].filter(x => x !== p.port.vlan).sort((x, y) => x - y);
        t.detail = `VLAN ${p.port.vlan} tidak diizinkan lewat trunk uplink Gi1/0/49 → switchport trunk allowed vlan add ${p.port.vlan}`;
      }
      sw.dirty = false;
    } else if (f === 'portal') {
      AUTH.delete(a.mac);
      t.detail = 'Sesi captive portal laptop habis → login ulang dengan nomor kamar dan nama belakang';
    } else if (f === 'appoe') {
      const ap = servingAp(name)!,
        q = apPort(ap)!,
        v = pick(['poe', 'shut', 'patch'] as const);
      if (v === 'poe') {
        q.port.poe = false;
        t.detail = `${ap.id}: PoE ${portName(q.port.n)} di ${q.sw.name} dimatikan (power inline never) → power inline auto`;
      } else if (v === 'shut') {
        q.port.shutdown = true;
        t.detail = `${ap.id}: ${portName(q.port.n)} di ${q.sw.name} shutdown → no shutdown`;
      } else {
        const pp = panelOf(ap.id)!;
        patchCord(pp.sw, pp.pp.n, null);
        t.detail = `${ap.id}: patch cord PP-${pp.pp.n} → ${portName(q.port.n)} di rak IDF lantai ${ap.level} tercabut → dicolok lagi`;
      }
      t.sw = q.sw.name;
    } else if (f === 'aprf') {
      const ap = servingAp(name)!;
      const v = rfVariant(name, ap);
      if (v) {
        v.apply();
        t.detail = v.detail;
      }
    } else if (f === 'dhcppool') {
      const g = ENVS.guest,
        base = parseIp(g.gateway)!;
      g.dhcp = { ...g.dhcp!, start: ipStr(base + 99), end: ipStr(base + 159), lease: 24 };
      let k = 0;
      for (let n = 99; n <= 159; n++) {
        const ip = ipStr(base + n);
        if (![...g.leases.values()].includes(ip)) g.leases.set(`ee-${String(k++).padStart(4, '0')}-phantom`, ip);
      }
      bounce(a);
      t.detail = `Pool DHCP gw-tamu hanya ${ipStr(base + 99)}–${ipStr(base + 159)} (61 alamat) dengan lease 24 jam, semuanya terpakai → pool diperbesar (mis. .100–172.16.7.232) dan lease diperpendek`;
    } else if (f === 'loop' && p) {
      const sw = p.sw;
      const free = sw.ports.filter(x => !x.pc && x.n <= 44 && !sw.panel.some(q => q.patch === x.n));
      const k = Math.floor(Math.random() * Math.max(1, free.length - 1));
      const [x1, x2] = [free[k], free[k + 1] ?? free[0]];
      for (const x of [x1, x2]) {
        x.shutdown = false;
        x.vlan = p.port.vlan;
      }
      sw.loop = [x1.n, x2.n];
      sw.stpOff = true;
      t.detail = `Kabel patch menyambung ${portName(x1.n)} ke ${portName(x2.n)} di switch yang sama dan spanning-tree dimatikan → kabel dicabut, STP diaktifkan`;
    }
  }
  a.arp.clear();
}
