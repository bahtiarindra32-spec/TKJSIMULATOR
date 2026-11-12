// Fase 2 field orders on the MikroTik site routers (warnet RB951Ui-2HnD, kos hAP lite). Each order is graded from the
// router's configuration STATE with routeros checkState (never from typed text), plus what really reaches the customer
// device: the netsim must be healthy, and the player tests from the device (a hotspot login with a voucher, or the
// speed-test page for queue orders, which reads the effective limit from rosThroughput).
// Sources: notes/research-grow.md §1 (hotspot setup + user profile rate-limit rx/tx [11], simple queue a/b = upload/
// download and FastTrack bypassing simple queues [9], backup/reset [5][10]), §4.1 (tarif). Design values are marked ⚠.
import { adapterOf, live } from '../../pcos/net';
import { siteRouter, WARNET_ISP } from '../../pcos/siterouters';
import { RosCli, checkState, hsActive, l3Of, ifByDefault, parseRate, type UkkSpec, type RosDevice } from '../../pcos/routeros';
import type { FieldTplId } from './types';

export type RosTplId = 'w_hotspot' | 'k_queue' | 'k_fasttrack' | 'w_reset';
export const ROS_TPL_IDS: RosTplId[] = ['w_hotspot', 'k_queue', 'k_fasttrack', 'w_reset'];
export const isRosTpl = (t: FieldTplId): t is RosTplId => (ROS_TPL_IDS as string[]).includes(t);

export interface RosJob {
  site: 'warnet' | 'kos';
  /** checkState spec; an interface named "@lan" means "the layer-3 interface the site cabling (ether2) lands on" */
  spec: UkkSpec;
  /** hotspot order: the primary PC must be logged in with one of these users */
  vouchers?: string[];
  /** queue orders: the speed test on the primary device must show exactly this (bps) */
  speed?: { down: number; up: number };
}
export interface RosInjected {
  variant: string;
  detail: string;
  /** per-order values appended to the order letter when it is taken */
  lines: string[];
  targets: { pc: string; primary: boolean }[];
  data: Record<string, string | number>;
  ros: RosJob;
}

const kosLaptop = (k: number) => `PROP_KOS_01_LAPTOP_K${k}`;
const warnetPc = (n: number) => `PROP_WARNET_01_PC_${String(n).padStart(2, '0')}`;
const KOS_ROOMS = [1, 2, 4, 5];
const BOOTHS = Array.from({ length: 8 }, (_, i) => warnetPc(i + 1));
const pickOf = <X>(a: X[], r: () => number) => a[Math.floor(r() * a.length)];
/** ⚠ design: limit pairs (upload, download) a kos/warnet owner would ask for on a 20–50 Mbps line */
const RATES: [string, string][] = [['1M', '2M'], ['1M', '3M'], ['2M', '4M'], ['2M', '5M']];

/** run console lines on a site router as the previous technician typed them (throws on any console error) */
function type(d: RosDevice, lines: string[]) {
  const c = new RosCli(d);
  for (const l of lines) {
    const out = c.run(l);
    if (out.trim() && !/Reset anyway|system configuration will be reset/.test(out)) throw new Error(`${l} → ${out}`);
  }
}
const ipOf = (pc: string) => live(adapterOf(pc)).ip;

export function injectRos(tpl: RosTplId, r: () => number): RosInjected | null {
  if (tpl === 'w_hotspot') {
    const n = 3 + Math.floor(r() * 3);
    const [up, down] = pickOf(RATES, r);
    const users = Array.from({ length: n }, (_, i) => ({ name: `vch${String(i + 1).padStart(2, '0')}`, password: String(1000 + Math.floor(r() * 9000)) }));
    const pc = pickOf(BOOTHS, r);
    return {
      variant: `${n}x${up}/${down}`,
      detail: `Hotspot MikroTik di bridge-lan (192.168.100.1/24), ${n} user voucher, user profile rate-limit ${up}/${down} (rx/tx = upload/download pelanggan)`,
      lines: [`Voucher: ${users.map(u => `${u.name} / ${u.password}`).join(', ')}.`, `Batas per voucher: upload ${up}, download ${down}.`, `PC uji: PC warnet ${pc.slice(-2)}.`],
      targets: [{ pc, primary: true }],
      data: { pc, n, rate: `${up}/${down}` },
      ros: { site: 'warnet', spec: { hotspot: { iface: 'bridge-lan', address: '192.168.100.1/24', users, rateLimit: `${up}/${down}` }, online: true }, vouchers: users.map(u => u.name) },
    };
  }
  if (tpl === 'k_queue' || tpl === 'k_fasttrack') {
    const d = siteRouter('kos'); if (!d) return null;
    const [up, down] = pickOf(RATES, r);
    const rooms = KOS_ROOMS.map(k => ({ k, pc: kosLaptop(k), ip: ipOf(kosLaptop(k)) }));
    if (rooms.some(x => !x.ip)) return null;
    const k0 = pickOf(KOS_ROOMS, r);
    const spec: UkkSpec = { queues: rooms.map(x => ({ target: x.ip, maxUp: up, maxDown: down, mustWork: true, exact: true })), online: true };
    const list = rooms.map(x => `Kamar ${x.k}: ${x.ip}`).join(', ');
    const base = { targets: [{ pc: kosLaptop(k0), primary: true }, ...rooms.filter(x => x.k !== k0).map(x => ({ pc: x.pc, primary: false }))], data: { pc: kosLaptop(k0), rate: `${up}/${down}` }, ros: { site: 'kos' as const, spec, speed: { down: parseRate(down)!, up: parseRate(up)! } } };
    if (tpl === 'k_queue')
      return { ...base, variant: `${up}/${down}`, detail: `Simple queue per kamar (target alamat laptop, max-limit ${up}/${down} = upload/download) di router kos`, lines: [`Laptop penghuni (dari daftar lease router): ${list}.`, `Batas per kamar: upload ${up}, download ${down}.`, `Laptop uji: Kamar ${k0}.`] };
    // FastTrack fault: the previous technician's queues are right, but a fasttrack rule copied from the default
    // configuration lets established traffic bypass every simple queue [9]
    type(d, [
      ...rooms.map(x => `/queue simple add name=kamar${x.k} target=${x.ip}/32 max-limit=${up}/${down}`),
      '/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="fast-track"',
      '/ip firewall filter add chain=forward action=accept connection-state=established,related comment="accept established,related"',
    ]);
    return { ...base, variant: 'fasttrack', detail: `Rule firewall fasttrack-connection (forward, established/related) membuat trafik melewati simple queue → rule fasttrack dinonaktifkan/dihapus (atau rule accept ditaruh di atasnya), queue ${up}/${down} per kamar kembali membatasi`, lines: [`Batas yang disepakati per kamar: upload ${up}, download ${down} (${list}).`, `Penghuni yang komplain: Kamar ${k0}.`] };
  }
  // w_reset: someone held the reset button → default configuration (192.168.88.1/24, DHCP client on ether1). RouterOS
  // saves auto-before-reset.backup unless skip-backup=yes; the warnet ISP line is a static address (⚠ design, siterouters)
  const d = siteRouter('warnet'); if (!d) return null;
  type(d, ['/system reset-configuration', 'y']);
  const pc = pickOf(BOOTHS, r);
  const isp = WARNET_ISP;
  return {
    variant: 'defconf',
    detail: `Router warnet tereset ke konfigurasi default (bridge 192.168.88.1/24, DHCP client di ether1, padahal ISP memberi IP statis) → konfigurasi pelanggan dikembalikan (backup auto-before-reset.backup / ketik ulang)`,
    lines: [`Data ISP (IP statis): alamat ${isp.addr}/${isp.prefix} di ether1, gateway ${isp.gw}, DNS ${isp.dns.join(', ')}.`, 'Catatan teknisi lama: identity WARNET-01, LAN 192.168.100.1/24 di bridge (ether2–ether5), DHCP 192.168.100.100–192.168.100.199, NAT masquerade keluar ether1.', `PC uji: PC warnet ${pc.slice(-2)}.`],
    targets: [{ pc, primary: true }, ...[...BOOTHS.filter(b => b !== pc), 'PROP_WARNET_01_KASIR_PC'].map(b => ({ pc: b, primary: false }))],
    data: { pc },
    ros: { site: 'warnet', spec: { identity: 'WARNET-01', wan: { iface: 'ether1', address: `${isp.addr}/${isp.prefix}`, gateway: isp.gw }, lan: { iface: '@lan', address: '192.168.100.1/24' }, dhcpServer: { iface: '@lan' }, nat: { outInterface: 'ether1' }, online: true } },
  };
}

/** the spec with "@lan" resolved to the interface ether2 sits on right now */
function resolveSpec(d: RosDevice, spec: UkkSpec): UkkSpec {
  const lan = l3Of(d, ifByDefault(d, 'ether2')?.row.p.name ?? 'ether2');
  const s: UkkSpec = JSON.parse(JSON.stringify(spec));
  if (s.lan?.iface === '@lan') s.lan.iface = lan;
  if (s.dhcpServer?.iface === '@lan') s.dhcpServer.iface = lan;
  return s;
}
/** what is still wrong on the router ('' = the configuration state meets the order) */
export function rosProblem(job: RosJob, primary?: string): string {
  const d = siteRouter(job.site); if (!d) return 'router pelanggan tidak ada';
  const g = checkState(d, resolveSpec(d, job.spec));
  const bad = g.checks.find(c => !c.ok);
  if (bad) return `${bad.label}: ${bad.detail}`;
  if (job.vouchers && primary) {
    const ip = ipOf(primary); const s = ip ? hsActive(d, ip) : null;
    if (!s || !job.vouchers.includes(s.user)) return 'uji login: PC uji belum login hotspot memakai salah satu voucher';
  }
  return '';
}
/** the full grade (QA/tests) */
export const rosGrade = (job: RosJob) => { const d = siteRouter(job.site)!; return checkState(d, resolveSpec(d, job.spec)); };
/**
 * Does a PC event count as the customer-device test of this job? null = the usual rule (ping/browse while healthy).
 * Queue jobs need the speed-test page, and only a result that matches the order's limit counts.
 */
export function rosTestEvent(job: RosJob, type: string, detail: { down?: number; up?: number } | undefined): boolean | null {
  if (!job.speed) return null;
  return type === 'speed' && detail?.down === job.speed.down && detail?.up === job.speed.up;
}
