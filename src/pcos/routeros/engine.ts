// RouterOS forwarding logic computed from the configuration tables (pure TS, no DOM, no net.ts import).
// Interface state, WAN/route selection, DHCP server derivation, firewall first-match, srcnat masquerade, FastTrack vs
// simple queues, hotspot login gating. The netsim adapter (netsim.ts) asks these functions per packet.
import {
  rows, single, ifByName, ifByDefault, interfaces, bridgeOf, l3Of, parseCidr, parseRanges, parseRate2, parseTime, addrMatch, ipStr, parseIp, networkOf, broadcastOf,
  PORT_BPS, type RosDevice, type Row, type HsActive, type DynLease,
} from './model';

// ---------------------------------------------------------------- interfaces
/** link/running state: ether = cable with a live peer, wlan = enabled in an AP mode, bridge = any running member port */
export function ifRunning(d: RosDevice, name: string): boolean {
  const i = ifByName(d, name); if (!i || i.row.disabled) return false;
  if (i.type === 'ether') return d.rt.linked.has(i.row.p['default-name']);
  if (i.type === 'wlan') return i.row.p.mode === 'ap-bridge' || i.row.p.mode === 'bridge';
  return rows(d, '/interface bridge port').some(bp => !bp.disabled && bp.p.bridge === name && ifRunning(d, bp.p.interface));
}
export interface Conn { ip: string; prefix: number; net: number; iface: string; dynamic: boolean }
/** addresses the router owns right now (static ones on existing interfaces + bound DHCP-client leases) */
export function addresses(d: RosDevice, onlyRunning = false): Conn[] {
  const out: Conn[] = [];
  for (const r of rows(d, '/ip address')) {
    if (r.disabled || !ifByName(d, r.p.interface)) continue;
    if (bridgeOf(d, r.p.interface)) continue;   // an address on a bridge port is invalid
    if (onlyRunning && !ifRunning(d, r.p.interface)) continue;
    const c = parseCidr(r.p.address); if (!c) continue;
    out.push({ ip: ipStr(c.ip), prefix: c.prefix, net: networkOf(c.ip, c.prefix), iface: r.p.interface, dynamic: false });
  }
  for (const r of rows(d, '/ip dhcp-client')) {
    const b = dhcpClientLease(d, r); if (!b) continue;
    const ip = parseIp(b.ip)!; out.push({ ip: b.ip, prefix: b.prefix, net: networkOf(ip, b.prefix), iface: r.p.interface, dynamic: true });
  }
  return out;
}
/** the first address of a layer-3 interface (the gateway its clients see) */
export const ifAddr = (d: RosDevice, l3: string) => addresses(d).find(a => a.iface === l3) ?? null;

// ---------------------------------------------------------------- WAN side
/** the physical WAN port (factory ether1, wherever its cable goes) */
export const wanIfName = (d: RosDevice) => ifByDefault(d, d.rt.wanPort)?.row.p.name ?? d.rt.wanPort;
/** a DHCP client is bound when it runs on the interface the ISP cable lands on and the ISP hands out leases */
export function dhcpClientLease(d: RosDevice, r: Row): { ip: string; prefix: number; gw: string; dns: string[] } | null {
  const isp = d.rt.isp; if (r.disabled || !isp || isp.mode !== 'dhcp') return null;
  const wan = wanIfName(d);
  if (!ifByName(d, r.p.interface) || bridgeOf(d, r.p.interface)) return null;   // a client on a bridge port never binds
  if (l3Of(d, wan) !== r.p.interface || !ifRunning(d, wan)) return null;
  return { ip: isp.addr, prefix: isp.prefix, gw: isp.gw, dns: isp.dns };
}
export const dhcpClientStatus = (d: RosDevice, r: Row) => (r.disabled ? '' : dhcpClientLease(d, r) ? 'bound' : 'searching...');

export interface Route { dst: string; gw: string; distance: number; dynamic: boolean; kind: 'static' | 'connect' | 'dhcp'; row?: Row }
export function routeTable(d: RosDevice): Route[] {
  const out: Route[] = [];
  for (const a of addresses(d, true)) out.push({ dst: `${ipStr(a.net)}/${a.prefix}`, gw: a.iface, distance: 0, dynamic: true, kind: 'connect' });
  for (const r of rows(d, '/ip dhcp-client')) {
    const b = dhcpClientLease(d, r); if (!b || r.p['add-default-route'] === 'no') continue;
    out.push({ dst: '0.0.0.0/0', gw: b.gw, distance: +r.p['default-route-distance'] || 1, dynamic: true, kind: 'dhcp' });
  }
  for (const r of rows(d, '/ip route')) if (!r.disabled) out.push({ dst: r.p['dst-address'], gw: r.p.gateway, distance: +r.p.distance || 1, dynamic: false, kind: 'static', row: r });
  return out;
}
/** the interface a gateway is reached through (null = unreachable gateway) */
export function gwIface(d: RosDevice, gw: string): string | null {
  const x = parseIp(gw);
  if (x === null) return ifRunning(d, gw) ? gw : null;
  return addresses(d, true).find(a => networkOf(x, a.prefix) === a.net)?.iface ?? null;
}
/** the default route in use (lowest distance among those with a reachable gateway) */
export function activeDefault(d: RosDevice): Route | null {
  const c = routeTable(d).filter(r => r.dst === '0.0.0.0/0' && r.kind !== 'connect' && gwIface(d, r.gw));
  return c.sort((a, b) => a.distance - b.distance || (a.kind === 'static' ? -1 : 1))[0] ?? null;
}
/** can the router itself reach the internet through the ISP line? */
export function wanStatus(d: RosDevice): { ok: boolean; egress: string; src: string; why: string } {
  const isp = d.rt.isp; const no = (why: string) => ({ ok: false, egress: '', src: '', why });
  if (!isp) return no('tidak ada kabel ISP');
  const wan = wanIfName(d);
  if (!ifRunning(d, wan)) return no(`${wan} tidak running`);
  const r = activeDefault(d); if (!r) return no('tidak ada default route');
  const egress = gwIface(d, r.gw)!;
  if (l3Of(d, wan) !== egress) return no(`default route lewat ${egress}, bukan port ISP`);
  const mine = addresses(d, true).find(a => a.iface === egress && networkOf(parseIp(a.ip)!, isp.prefix) === parseIp(isp.net)! && a.prefix === isp.prefix);
  if (!mine) return no('alamat WAN tidak sesuai jaringan ISP');
  if (mine.ip !== isp.addr) return no('alamat WAN bukan yang diberikan ISP');
  if (r.gw !== isp.gw && r.gw !== egress) return no('gateway salah');
  return { ok: true, egress, src: mine.ip, why: '' };
}
/** /ip dns servers + dynamic servers learned by DHCP clients with use-peer-dns=yes */
export function dnsServers(d: RosDevice): { stat: string[]; dyn: string[] } {
  const stat = single(d, '/ip dns').servers.split(',').filter(Boolean);
  const dyn: string[] = [];
  for (const r of rows(d, '/ip dhcp-client')) { const b = dhcpClientLease(d, r); if (b && r.p['use-peer-dns'] === 'yes') for (const s of b.dns) if (!dyn.includes(s)) dyn.push(s); }
  return { stat, dyn };
}

// ---------------------------------------------------------------- DHCP server per LAN interface
export interface DhcpOut { server: string; start: string; end: string; gw: string; dns: string[]; leaseSec: number }
/**
 * What clients on a layer-3 interface get from its DHCP server (null = no working server there).
 * Only the first pool range is handed out (⚠ simplification). A network entry without dns-server hands out the
 * router's DNS servers (⚠ inferred); no matching network entry = address without gateway/DNS (⚠ inferred).
 */
export function dhcpFor(d: RosDevice, l3: string): DhcpOut | null {
  const s = rows(d, '/ip dhcp-server').find(r => !r.disabled && r.p.interface === l3); if (!s) return null;
  if (bridgeOf(d, l3)) return null;
  const pool = rows(d, '/ip pool').find(p => p.p.name === s.p['address-pool']); if (!pool) return null;
  const rg = parseRanges(pool.p.ranges); if (!rg) return null;
  const net = rows(d, '/ip dhcp-server network').find(n => !n.disabled && addrMatch(n.p.address, ipStr(rg[0][0])));
  const ds = dnsServers(d);
  return {
    server: s.p.name, start: ipStr(rg[0][0]), end: ipStr(rg[0][1]), leaseSec: parseTime(s.p['lease-time']) ?? 1800,
    gw: net ? net.p.gateway.split(',')[0] ?? '' : '', dns: net ? (net.p['dns-server'] ? net.p['dns-server'].split(',') : [...ds.stat, ...ds.dyn]) : [],
  };
}

// ---------------------------------------------------------------- firewall
export interface Pkt { chain: string; state: 'new' | 'established' | 'related' | 'invalid' | 'untracked'; nat: '' | 'srcnat' | 'dstnat'; proto: 'icmp' | 'tcp' | 'udp'; src: string; dst: string; sport?: number; dport?: number; inIf?: string; outIf?: string }
const portIn = (spec: string, p: number | undefined) => p !== undefined && spec.split(',').some(s => { const m = /^(\d+)-(\d+)$/.exec(s); return m ? p >= +m[1] && p <= +m[2] : +s === p; });
const neg = (v: string): [boolean, string] => (v.startsWith('!') ? [true, v.slice(1)] : [false, v]);
export function ruleMatches(r: Row, k: Pkt): boolean {
  const p = r.p;
  if (p.chain !== k.chain) return false;
  if (p['connection-state'] && !p['connection-state'].split(',').includes(k.state)) return false;
  if (p['connection-nat-state']) { const [n, v] = neg(p['connection-nat-state']); if (v.split(',').includes(k.nat) === n) return false; }
  if (p.protocol && p.protocol !== k.proto) return false;
  for (const [f, ip] of [['src-address', k.src], ['dst-address', k.dst]] as const) if (p[f]) { const [n, v] = neg(p[f]); if (addrMatch(v, ip) === n) return false; }
  for (const [f, ifn] of [['in-interface', k.inIf], ['out-interface', k.outIf]] as const) if (p[f]) { const [n, v] = neg(p[f]); if ((v === ifn) === n) return false; }
  if (p['dst-port'] && !portIn(p['dst-port'], k.dport)) return false;
  if (p['src-port'] && !portIn(p['src-port'], k.sport)) return false;
  if (p.port && !portIn(p.port, k.dport) && !portIn(p.port, k.sport)) return false;
  return true;
}
/** first matching rule decides (passthrough/log continue); end of a built-in chain = accept */
export function evalFilter(d: RosDevice, k: Pkt): { action: string; index: number } {
  const list = rows(d, '/ip firewall filter');
  for (let i = 0; i < list.length; i++) {
    const r = list[i]; if (r.disabled || !ruleMatches(r, k)) continue;
    if (r.p.action === 'passthrough' || r.p.action === 'log') continue;
    return { action: r.p.action, index: i };
  }
  return { action: 'accept', index: -1 };
}
/** srcnat: the first matching masquerade/src-nat rule translates; accept stops without NAT */
export function srcNat(d: RosDevice, k: Omit<Pkt, 'chain'>): boolean {
  for (const r of rows(d, '/ip firewall nat')) {
    if (r.disabled || !ruleMatches(r, { ...k, chain: 'srcnat' })) continue;
    if (r.p.action === 'masquerade' || r.p.action === 'src-nat') return true;
    if (r.p.action === 'accept') return false;
  }
  return false;
}
export type Proto = 'icmp' | 'udp53' | 'tcp80';
const pk = (p: Proto) => (p === 'icmp' ? { proto: 'icmp' as const } : p === 'udp53' ? { proto: 'udp' as const, dport: 53, sport: 50123 } : { proto: 'tcp' as const, dport: 80, sport: 50123 });
const rk = (p: Proto) => (p === 'icmp' ? { proto: 'icmp' as const } : p === 'udp53' ? { proto: 'udp' as const, sport: 53, dport: 50123 } : { proto: 'tcp' as const, sport: 80, dport: 50123 });
/** a packet from a LAN client to the router itself (input chain) */
export function inputOk(d: RosDevice, inIf: string, src: string, dst: string, p: Proto) {
  const v = evalFilter(d, { chain: 'input', state: 'new', nat: '', src, dst, inIf, ...pk(p) }).action;
  return v === 'accept' || v === 'fasttrack-connection';
}
export interface FwdRes { ok: boolean; fasttrack: boolean; why: string }
/** a new connection from a client on inIf to dst leaving through outIf, plus its reply (established) */
export function forward(d: RosDevice, inIf: string, outIf: string, src: string, dst: string, p: Proto, natNeeded: boolean): FwdRes {
  const a = evalFilter(d, { chain: 'forward', state: 'new', nat: '', src, dst, inIf, outIf, ...pk(p) });
  if (a.action !== 'accept' && a.action !== 'fasttrack-connection') return { ok: false, fasttrack: false, why: `filter rule ${a.index} (${a.action})` };
  const nat = natNeeded ? (srcNat(d, { state: 'new', nat: '', src, dst, outIf, inIf, ...pk(p) }) ? 'srcnat' : null) : '';
  if (nat === null) return { ok: false, fasttrack: false, why: 'tidak ada srcnat/masquerade untuk keluar ke ISP' };
  const b = evalFilter(d, { chain: 'forward', state: 'established', nat, src: dst, dst: src, inIf: outIf, outIf: inIf, ...rk(p) });
  if (b.action !== 'accept' && b.action !== 'fasttrack-connection') return { ok: false, fasttrack: false, why: `balasan diblok rule ${b.index} (${b.action})` };
  return { ok: true, fasttrack: b.action === 'fasttrack-connection' || a.action === 'fasttrack-connection', why: '' };
}

// ---------------------------------------------------------------- hotspot
/** the hotspot server running on a layer-3 interface (a server on a bridge port is invalid [11]) */
export function hotspotOn(d: RosDevice, l3: string): Row | null {
  return rows(d, '/ip hotspot').find(r => !r.disabled && r.p.interface === l3 && !bridgeOf(d, l3)) ?? null;
}
export const hsActive = (d: RosDevice, ip: string) => d.rt.active.find(a => a.address === ip) ?? null;
/** walled garden: hosts reachable without login [11] (wildcards * and ?) */
export function walled(d: RosDevice, host: string): boolean {
  for (const r of rows(d, '/ip hotspot walled-garden')) {
    if (r.disabled) continue;
    const re = new RegExp(`^${r.p['dst-host'].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    if (re.test(host)) return r.p.action === 'allow';
  }
  return false;
}
/**
 * Hotspot login from the captive page. Returns '' on success or the login-page error text
 * (⚠ texts follow the stock login page; not quoted in the sources).
 */
export function hotspotLogin(d: RosDevice, l3: string, ip: string, mac: string, user: string, password: string): string {
  const hs = hotspotOn(d, l3); if (!hs) return 'hotspot tidak aktif di interface ini';
  const u = rows(d, '/ip hotspot user').find(r => !r.disabled && r.p.name === user && (r.p.server === 'all' || r.p.server === hs.p.name));
  if (!u || u.p.password !== password) return 'invalid username or password';
  const mm = u.p['mac-address']; if (mm && mm !== '00:00:00:00:00:00' && mm.toLowerCase() !== mac.toLowerCase().replace(/-/g, ':')) return 'invalid username or password';
  const prof = rows(d, '/ip hotspot user profile').find(r => r.p.name === u.p.profile);
  const shared = +(prof?.p['shared-users'] ?? '1') || 1;
  d.rt.active = d.rt.active.filter(a => a.address !== ip);
  if (d.rt.active.filter(a => a.user === user).length >= shared) return 'no more sessions are allowed for user';
  d.rt.active.push({ server: hs.p.name, user, address: ip, mac, since: Date.now() } as HsActive); d.rev++;
  return '';
}
export function hotspotLogout(d: RosDevice, ip: string) { const n = d.rt.active.length; d.rt.active = d.rt.active.filter(a => a.address !== ip); if (n !== d.rt.active.length) d.rev++; }

// ---------------------------------------------------------------- queues
export interface Q { name: string; target: string; max: [number, number]; limitAt: [number, number]; dynamic: boolean; row?: Row }
/** dynamic simple queues: hotspot users whose profile has rate-limit, static DHCP leases with rate-limit [8][11] */
export function dynQueues(d: RosDevice): Q[] {
  const out: Q[] = [];
  for (const a of d.rt.active) {
    const u = rows(d, '/ip hotspot user').find(r => r.p.name === a.user);
    const prof = rows(d, '/ip hotspot user profile').find(r => r.p.name === u?.p.profile);
    const rl = prof?.p['rate-limit'] ? parseRate2(prof.p['rate-limit'].split(' ')[0]) : null;
    // rx/tx (router view) = client upload/download = queue upload/download; name format ⚠ inferred
    if (rl) out.push({ name: `<hotspot-${a.user}>`, target: `${a.address}/32`, max: rl, limitAt: rl, dynamic: true });
  }
  for (const l of rows(d, '/ip dhcp-server lease')) {
    if (l.disabled || !l.p['rate-limit']) continue;
    const rl = parseRate2(l.p['rate-limit'].split(' ')[0]); if (!rl) continue;
    out.push({ name: `dhcp-ds<${l.p['mac-address'].toUpperCase()}>`, target: `${l.p.address}/32`, max: rl, limitAt: rl, dynamic: true });   // name as in the [8] example
  }
  return out;
}
export function queues(d: RosDevice): Q[] {
  const stat = rows(d, '/queue simple').filter(r => !r.disabled).map(r => ({ name: r.p.name, target: r.p.target, max: parseRate2(r.p['max-limit']) ?? [0, 0], limitAt: parseRate2(r.p['limit-at']) ?? [0, 0], dynamic: false, row: r }));
  // dynamic entries go first (insert-queue-before default "first" [8]; ⚠ same order assumed for hotspot)
  return [...dynQueues(d), ...stat];
}
/** simple queues are strict-order: the first whose target matches the client wins [9] */
export function queueFor(d: RosDevice, ip: string, l3 = ''): Q | null {
  return queues(d).find(q => q.target.split(',').some(t => t === l3 || addrMatch(t, ip))) ?? null;
}

// ---------------------------------------------------------------- what a LAN client gets
export interface Path { ok: boolean; why: string; fasttrack: boolean }
/** a client on layer-3 interface l3 talks to an internet address (hotspot → forward filter → masquerade → WAN) */
export function clientInternet(d: RosDevice, l3: string, src: string, dst: string, p: Proto, dstHost = ''): Path {
  const w = wanStatus(d); if (!w.ok) return { ok: false, why: w.why, fasttrack: false };
  if (hotspotOn(d, l3) && !hsActive(d, src)) {
    // before login only DNS and walled-garden web hosts pass [11]
    if (!(p === 'udp53' || (p === 'tcp80' && dstHost && walled(d, dstHost)))) return { ok: false, why: 'hotspot: belum login', fasttrack: false };
  }
  const f = forward(d, l3, w.egress, src, dst, p, true);
  return { ok: f.ok, why: f.why, fasttrack: f.fasttrack };
}
export interface Thru { down: number; up: number; queue: string; bypassed: boolean; why: string }
/**
 * Effective throughput of a client to the internet (bps). Limited by the 10/100 port, the ISP plan and the first
 * matching simple queue — unless the connection is fasttracked, which bypasses simple queues [9].
 */
export function throughput(d: RosDevice, l3: string, ip: string): Thru {
  const isp = d.rt.isp;
  const path = clientInternet(d, l3, ip, '103.10.20.30', 'tcp80');
  if (!path.ok || !isp) return { down: 0, up: 0, queue: '', bypassed: false, why: path.why || 'tidak ada ISP' };
  let down = Math.min(PORT_BPS, isp.down), up = Math.min(PORT_BPS, isp.up);
  const q = queueFor(d, ip, l3);
  if (q && !path.fasttrack) { if (q.max[1]) down = Math.min(down, q.max[1]); if (q.max[0]) up = Math.min(up, q.max[0]); }
  return { down, up, queue: q?.name ?? '', bypassed: !!q && path.fasttrack, why: q && path.fasttrack ? 'FastTrack melewati simple queue' : '' };
}

// ---------------------------------------------------------------- the router's own ping
/** injected by netsim.ts (keeps this file free of net.ts): LAN hosts that answer, internet names/addresses */
export const ROS_HOOKS = {
  /** does a device with this IP answer on the segment behind layer-3 interface l3? */
  lanProbe: (_d: RosDevice, _l3: string, _ip: string) => false as boolean,
  /** an internet name → address (null = NXDOMAIN) */
  resolve: (_name: string): string | null => null,
  /** does this internet address answer ping? */
  known: (_ip: string) => true as boolean,
  /** leases handed out right now (the netsim adapter reads them from net.ts) */
  leases: (d: RosDevice): DynLease[] => d.rt.leases,
};
export type PingOut = { ok: boolean; ttl: number; ms: number; why: string };
export function routerPing(d: RosDevice, ip: string): PingOut {
  const x = parseIp(ip); const no = (why: string) => ({ ok: false, ttl: 0, ms: 0, why });
  if (x === null) return no('bad address');
  const own = addresses(d, true);
  if (own.some(a => a.ip === ip)) return { ok: true, ttl: 64, ms: 0, why: '' };
  const out = evalFilter(d, { chain: 'output', state: 'new', nat: '', proto: 'icmp', src: own[0]?.ip ?? '0.0.0.0', dst: ip });
  if (out.action !== 'accept') return no('output chain');
  const local = own.find(a => networkOf(x, a.prefix) === a.net);
  if (local) {
    const isp = d.rt.isp;
    if (isp && ip === isp.gw && l3Of(d, wanIfName(d)) === local.iface) return { ok: true, ttl: 64, ms: 1, why: '' };
    return ROS_HOOKS.lanProbe(d, local.iface, ip) ? { ok: true, ttl: 128, ms: 1, why: '' } : no('timeout');
  }
  if (!wanStatus(d).ok) return no(activeDefault(d) ? 'timeout' : 'no route to host');
  return ROS_HOOKS.known(ip) ? { ok: true, ttl: ip.startsWith('8.8') || ip.startsWith('142.') ? 117 : 56, ms: 14 + (x % 7), why: '' } : no('timeout');
}

// ---------------------------------------------------------------- misc
/** user login check (/user name + password) */
export function checkLogin(d: RosDevice, user: string, password: string) {
  return rows(d, '/user').some(r => !r.disabled && r.p.name === user && r.p.password === password);
}
/** every layer-3 LAN interface that has an address (what the netsim maps to a segment) */
export function l3List(d: RosDevice): string[] {
  const s = new Set<string>(); for (const a of addresses(d)) s.add(a.iface); return [...s];
}
/** names of every interface and its type, in /interface print order */
export const ifNames = (d: RosDevice) => interfaces(d).map(i => i.row.p.name);
export { broadcastOf };
