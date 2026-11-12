// Lab Praktik, Fase 2: the MikroTik steps (UKK-style "paket MikroTik"). Pure logic, no DOM: praktik.ts shows the
// jobsheet and calls these checks every tick; tests drive the same functions with real RouterOS console lines.
//
// Physical setup (⚠ design): one hAP lite (RB941-2nD) sits on a shelf beside the lab rack. Its ether1 (WAN) is cabled
// to SW-LAB, i.e. the lab's existing upstream 192.168.70.0/24 behind R-LAB (gateway 192.168.70.1); the student's desk
// outlet is patched to ether2 for the duration of the MikroTik steps, so the desk PC is both the admin PC (Winbox) and
// the client that is tested. The research says UKK sheets start from a reset router and give the WAN address by
// table (research-grow §1.3 [12][13]); the lab's upstream as a static "ISP" with its own internet is a game model.
//
// Rubric = configuration STATE through routeros/grade.ts checkState (never the typed text), plus the client test seen
// from the student's PC. Every value that differs per student comes from the seed (LAN subnet, identity, WAN address,
// DHCP pool, queue limit, hotspot user).
import { createDevice, attachRouterOs, detachRouterOs, plugClient, unplugClient, plugOf, rosClientSeg, checkState, RosCli, l3Of, ifByDefault, hsActive, type RosDevice, type Isp, type UkkSpec } from '../pcos/routeros';
import { adapterOf, live, envOf, ping } from '../pcos/net';

export const LABMT_ID = 'lab-mt';
export const LABMT_GW = '192.168.70.1';
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export interface MtParams {
  identity: string;
  /** WAN address on ether1 (/24 in the lab network) */
  wan: string;
  /** LAN: third octet, gateway .1/24 */
  lanNet: string; lanGw: string; poolFrom: string; poolTo: string;
  /** simple queue for the client: upload/download [9] */
  qUp: string; qDown: string;
  backup: string;
  /** hotspot step: user, password, user-profile rate-limit rx/tx (router view = client upload/download [11]) */
  hsUser: string; hsPass: string; hsRate: string;
}
/** per-student values; a separate stream from the other lab params so older sheets keep their cases */
export function mtParams(seed: number): MtParams {
  const r = rng((seed ^ 0x4d696b72) >>> 0), pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  // LAN third octet 10-99, never the lab (70) or the RouterOS default (88)
  let o = 10 + Math.floor(r() * 90); if (o === 70 || o === 88) o += 1;
  const from = 10 + 10 * Math.floor(r() * 5);
  const [qUp, qDown] = pick([['1M', '2M'], ['2M', '4M'], ['2M', '5M'], ['3M', '6M'], ['5M', '10M']]);   // ⚠ design values
  const n = 10 + Math.floor(r() * 90);
  return {
    identity: `R-${pick(['MAWAR', 'MELATI', 'ANGGREK', 'DAHLIA', 'KENANGA', 'TERATAI'])}-${n}`,
    wan: `192.168.70.${201 + Math.floor(r() * 40)}`,
    lanNet: `192.168.${o}.0`, lanGw: `192.168.${o}.1`, poolFrom: `192.168.${o}.${from}`, poolTo: `192.168.${o}.${from + 90}`,
    qUp, qDown, backup: `ukk-${n}`,
    hsUser: `siswa${n}`, hsPass: String(1000 + Math.floor(r() * 9000)), hsRate: pick(['512k/1M', '1M/2M', '1M/3M']),
  };
}
/** the lab upstream as the router's "ISP": static address from the lab table, gateway R-LAB (⚠ design, see header) */
export const labIsp = (P: MtParams): Isp => ({ mode: 'static', net: '192.168.70.0', prefix: 24, gw: LABMT_GW, addr: P.wan, dns: ['8.8.8.8', '8.8.4.4'], down: 20_000_000, up: 20_000_000 });

let DEV: RosDevice | null = null;
export const labMt = () => DEV;
/**
 * A fresh hAP lite, reset with no-defaults (the UKK starting point [5][12]): only factory items, admin with an empty
 * password. ether1 cabled to the lab upstream, the student's PC patched to ether2.
 */
export function freshLabMt(P: MtParams, pc: string): RosDevice {
  dropLabMt();
  DEV = createDevice('RB941-2nD', { id: LABMT_ID, defconf: false });
  attachRouterOs(DEV, { isp: labIsp(P) });
  plugClient(DEV, 'ether2', pc);
  return DEV;
}
/** take the router out of the lab network and put the desk back on its outlet (SW-LAB) */
export function dropLabMt() {
  if (!DEV) return;
  for (const pc of LAB_PLUGGED()) unplugClient(pc);
  detachRouterOs(DEV); DEV = null;
}
const LAB_PLUGGED = () => Array.from({ length: 16 }, (_, i) => `PROP_LAB_PC_${String(i + 1).padStart(2, '0')}`).filter(pc => plugOf(pc)?.dev === DEV);

/** the reference answer of the mikrotik step (tests, and the state a sheet that starts at the hotspot step begins from) */
export function mtSolution(P: MtParams, clientIp = ''): string[] {
  return [
    `/system identity set name=${P.identity}`,
    `/ip address add address=${P.wan}/24 interface=ether1`,
    `/ip route add gateway=${LABMT_GW}`,
    '/ip dns set servers=8.8.8.8 allow-remote-requests=yes',
    `/ip address add address=${P.lanGw}/24 interface=ether2`,
    `/ip pool add name=pool-lan ranges=${P.poolFrom}-${P.poolTo}`,
    `/ip dhcp-server network add address=${P.lanNet}/24 gateway=${P.lanGw} dns-server=${P.lanGw}`,
    '/ip dhcp-server add name=dhcp-lan interface=ether2 address-pool=pool-lan disabled=no',
    '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade',
    ...(clientIp ? [`/queue simple add name=klien target=${clientIp}/32 max-limit=${P.qUp}/${P.qDown}`] : []),
    `/system backup save name=${P.backup}`,
  ];
}
export function typeLines(dev: RosDevice, lines: string[]) { const cli = new RosCli(dev); return lines.map(l => cli.run(l)); }

export interface Check { label: string; ok: boolean }
/** what the student's PC did (ping replies by target, URLs opened), filled from PC OS events */
export interface ClientSeen { pings: Map<string, boolean>; browse: string[] }
const isInternetUrl = (u: string) => { const h = u.replace(/^\w+:\/\//, '').split(/[/:?]/)[0].toLowerCase(); return !!h && !/^\d+(\.\d+){3}$/.test(h) && !/praktik\.lan$/.test(h); };

/** the LAN layer-3 interface the student built behind ether2 (ether2 itself, or the bridge it was put in) */
const lanIf = (d: RosDevice) => l3Of(d, ifByDefault(d, 'ether2')?.row.p.name ?? 'ether2');
/** the client's address when it holds a lease from the pool (the queue target) */
function clientIp(d: RosDevice, pc: string, P: MtParams): string {
  const s = rosClientSeg(pc); if (!s || s.dev !== d) return '';
  const l = live(adapterOf(pc), s.env); if (!l.ok || l.apipa || !adapterOf(pc).dhcp) return '';
  const n = (ip: string) => +ip.split('.')[3];
  return l.ip.startsWith(P.lanNet.slice(0, -1)) && n(l.ip) >= n(P.poolFrom) && n(l.ip) <= n(P.poolTo) ? l.ip : '';
}
const pick = (g: ReturnType<typeof checkState>, id: string) => g.checks.find(c => c.id === id)?.ok ?? false;

/** rubric of the mikrotik step (11 checkpoints; identity and backup are supporting) */
export function mtChecks(d: RosDevice | null, pc: string, P: MtParams, seen: ClientSeen): Check[] {
  if (!d) return MT_LABELS(P).map(label => ({ label, ok: false }));
  const lan = lanIf(d), ip = clientIp(d, pc, P);
  const spec: UkkSpec = {
    identity: P.identity, wan: { iface: 'ether1', address: `${P.wan}/24`, gateway: LABMT_GW }, online: true,
    dns: { servers: ['8.8.8.8'], allowRemote: true }, lan: { iface: lan, address: `${P.lanGw}/24` },
    dhcpServer: { iface: lan, from: P.poolFrom, to: P.poolTo, gateway: P.lanGw, dns: P.lanGw }, nat: { outInterface: 'ether1', from: ip || P.poolFrom },
    queues: ip ? [{ target: ip, maxUp: P.qUp, maxDown: P.qDown, exact: true }] : [], backup: P.backup,
  };
  const g = checkState(d, spec), L = MT_LABELS(P);
  const a = adapterOf(pc), env = envOf(pc);
  const net = ip !== '' && ping(a, env, '8.8.8.8', true).kind === 'reply';
  return [
    { label: L[0], ok: pick(g, 'identity') },
    { label: L[1], ok: pick(g, 'wan-ip') },
    { label: L[2], ok: pick(g, 'wan-route') && pick(g, 'online') },
    { label: L[3], ok: pick(g, 'dns-servers') && pick(g, 'dns-remote') },
    { label: L[4], ok: pick(g, 'lan-ip') },
    { label: L[5], ok: pick(g, 'dhcp-server') },
    { label: L[6], ok: pick(g, 'nat') },
    { label: L[7], ok: ip !== '' },
    { label: L[8], ok: !!ip && pick(g, `queue-${ip}`) },
    { label: L[9], ok: net && !!seen.pings.get('8.8.8.8') && seen.browse.some(isInternetUrl) },
    { label: L[10], ok: pick(g, 'backup') },
  ];
}
export const MT_LABELS = (P: MtParams) => [
  `Identity router = ${P.identity}`,
  `IP WAN ether1 ${P.wan}/24`,
  `Default route via ${LABMT_GW}, router online`,
  'DNS 8.8.8.8 + allow-remote-requests=yes',
  `IP LAN ${P.lanGw}/24 (ether2)`,
  `DHCP server LAN: pool ${P.poolFrom}-${P.poolTo}, gateway & DNS ${P.lanGw}`,
  'NAT srcnat masquerade keluar ether1',
  'PC klien dapat IP dari pool DHCP',
  `Simple queue klien (target IP klien) max-limit ${P.qUp}/${P.qDown}`,
  'Uji klien: ping 8.8.8.8 berhasil & situs internet terbuka',
  `Konfigurasi disimpan: file ${P.backup}.backup`,
];

/** rubric of the hotspot step (5 checkpoints) */
export function hsChecks(d: RosDevice | null, pc: string, P: MtParams, seen: ClientSeen): Check[] {
  const L = HS_LABELS(P);
  if (!d) return L.map(label => ({ label, ok: false }));
  const lan = lanIf(d);
  const g = checkState(d, { hotspot: { iface: lan, address: `${P.lanGw}/24`, users: [{ name: P.hsUser, password: P.hsPass }], rateLimit: P.hsRate } });
  const s = rosClientSeg(pc), l = s ? live(adapterOf(pc), s.env) : null;
  const act = s && s.dev === d && l?.ok ? hsActive(d, l.ip) : null;
  const net = !!act && ping(adapterOf(pc), envOf(pc), '8.8.8.8', true).kind === 'reply';
  return [
    { label: L[0], ok: pick(g, 'hs-server') },
    { label: L[1], ok: pick(g, 'hs-server') && pick(g, 'hs-address') },
    { label: L[2], ok: pick(g, `hs-user-${P.hsUser}`) },
    { label: L[3], ok: pick(g, 'hs-rate') },
    { label: L[4], ok: act?.user === P.hsUser && net && seen.browse.some(isInternetUrl) },
  ];
}
export const HS_LABELS = (P: MtParams) => [
  `Hotspot server di LAN (ether2 / bridge-nya)`,
  `Alamat hotspot ${P.lanGw}/24`,
  `User hotspot ${P.hsUser} dengan password dari jobsheet`,
  `Rate-limit ${P.hsRate} (rx/tx) di user profile ${P.hsUser}`,
  `Uji klien: login hotspot sebagai ${P.hsUser}, lalu situs internet terbuka`,
];
