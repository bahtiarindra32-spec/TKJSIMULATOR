// Simulated building network (pure TS, no DOM).
// Wired PCs hang off one access switch per floor (SW-L1..SW-L3, in the L1 server-room rack). The VLAN of the
// switch port decides which segment (Env) a PC is on; each segment has its own router with an editable
// DHCP server and DNS forwarder. Laptops on L4-L8 use the guest Wi-Fi. Everything the player sees in
// ipconfig/ping/nslookup/browser is computed from this state, so faults and fixes are real, not scripted.
import { parseIp, ipStr, prefixToMask, networkOf, broadcastOf, parseMask } from '../game/missionLogic';

export interface Host { ip: string; name: string; mac: string; ttl: number; web?: string }
export type EnvId = 'lab' | 'office' | 'guest' | 'kasir' | 'none';
export interface DhcpCfg { start: string; end: string; gw: string; dns: string[]; lease: number }
export interface DnsCfg { allow: boolean; upstream: string[]; records: { name: string; ip: string }[] }
export interface Env {
  id: EnvId; vlan: number;
  label: string; net: string; prefix: number; gateway: string; dns: string[];
  dhcp: DhcpCfg | null; dnsSrv: DnsCfg; suffix: string;
  hosts: Host[]; internet: boolean; adapter: string; wireless: boolean;
  leases: Map<string, string>;
}

const mkEnv = (id: EnvId, vlan: number, label: string, net: string, prefix: number, suffix: string, adapter: string, wireless: boolean, hosts: Host[], pool: [number, number], lease: number): Env => {
  const b = parseIp(net)!, gw = ipStr(b + 1);
  return {
    id, vlan, label, net, prefix, gateway: gw, dns: [gw], suffix, adapter, wireless, hosts, internet: true, leases: new Map(),
    dhcp: { start: ipStr(b + pool[0]), end: ipStr(b + pool[1]), gw, dns: [gw], lease },
    dnsSrv: { allow: true, upstream: ['8.8.8.8', '1.1.1.1'], records: [] },
  };
};

export const ENVS: Record<EnvId, Env> = {
  lab: mkEnv('lab', 10, 'Lab TKJ (L1)', '192.168.10.0', 24, 'lab.smk.local', 'Realtek PCIe GbE Family Controller', false, [
    { ip: '192.168.10.1', name: 'router-lab', mac: '48-8f-5a-10-00-01', ttl: 64, web: 'router' },
    { ip: '192.168.10.2', name: 'sw-lab-01', mac: '00-1e-7a-10-00-02', ttl: 255 },
    { ip: '192.168.10.10', name: 'srv-praktik', mac: '52-54-00-10-00-0a', ttl: 64, web: 'server' },
  ], [100, 199], 24),
  office: mkEnv('office', 20, 'Kantor (L2–L3)', '192.168.20.0', 24, 'kantor.local', 'Intel(R) Ethernet Connection I219-LM', false, [
    { ip: '192.168.20.1', name: 'router-kantor', mac: '48-8f-5a-20-00-01', ttl: 64, web: 'router' },
    { ip: '192.168.20.50', name: 'printer-l2', mac: '00-80-77-20-00-32', ttl: 64, web: 'printer' },
    { ip: '192.168.20.10', name: 'nas-kantor', mac: '00-11-32-20-00-0a', ttl: 64 },
  ], [100, 220], 8),
  kasir: mkEnv('kasir', 30, 'Kasir & POS', '192.168.30.0', 24, 'kasir.local', 'Intel(R) Ethernet Connection I219-LM', false, [
    { ip: '192.168.30.1', name: 'router-kasir', mac: '48-8f-5a-30-00-01', ttl: 64, web: 'router' },
    { ip: '192.168.30.10', name: 'srv-pos', mac: '52-54-00-30-00-0a', ttl: 64, web: 'pos' },
  ], [100, 160], 8),
  guest: mkEnv('guest', 0, 'Wi-Fi Tamu Hotel', '172.16.4.0', 22, 'tamu.hotel', 'Intel(R) Wi-Fi 6 AX201 160MHz', true, [
    { ip: '172.16.4.1', name: 'gw-tamu', mac: '48-8f-5a-04-00-01', ttl: 64, web: 'router' },
  ], [100, 1000], 2),
  none: {
    id: 'none', vlan: -1, label: 'Tidak ada jaringan (VLAN tanpa router)', net: '169.254.0.0', prefix: 16, gateway: '', dns: [], dhcp: null,
    dnsSrv: { allow: false, upstream: [], records: [] }, suffix: '', hosts: [], internet: false, adapter: 'Intel(R) Ethernet Connection I219-LM', wireless: false, leases: new Map(),
  },
};
ENVS.lab.dhcp!.lease = 24;

/** The router of a segment (first host). */
export const routerOf = (env: Env) => env.hosts.find(h => h.web === 'router') ?? null;
/** Change a router's LAN address: the segment's subnet follows the router. */
export function setRouterLan(env: Env, ip: string, prefix: number) {
  const r = routerOf(env); if (!r) return;
  r.ip = ip; env.gateway = ip; env.prefix = prefix; env.net = ipStr(networkOf(parseIp(ip)!, prefix)); env.dns = [ip];
}

/** Internet names (fictional addresses inside the simulation). */
export const INTERNET: Record<string, { ip: string; web: string }> = {
  'cari.id': { ip: '103.10.20.30', web: 'search' }, 'www.cari.id': { ip: '103.10.20.30', web: 'search' },
  'google.com': { ip: '142.250.4.100', web: 'search' }, 'www.google.com': { ip: '142.250.4.100', web: 'search' },
  'smk.sch.id': { ip: '103.55.12.7', web: 'school' }, 'www.smk.sch.id': { ip: '103.55.12.7', web: 'school' },
  'youtube.com': { ip: '142.250.4.190', web: 'blocked' }, 'www.youtube.com': { ip: '142.250.4.190', web: 'blocked' },
  'dns.google': { ip: '8.8.8.8', web: 'search' }, 'one.one.one.one': { ip: '1.1.1.1', web: 'search' },
};
export const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'];

// ---------------------------------------------------------------- switches & structured cabling
// Each floor follows TIA-568 structured cabling: wall outlet -> horizontal cable -> patch panel port in the
// floor rack -> patch cord -> switch port. L1's rack in the server room is the MDF (core); L2/L3 have an IDF
// rack in the IDF room with their own access switch, uplinked to the MDF on Gi1/0/49 (802.1Q trunk).
export interface Port { n: number; pc: string | null; shutdown: boolean; vlan: number; desc: string }
/** A patch-panel port: `pc` = the desk whose wall outlet is wired to it, `label` = what is printed on that
 *  wall outlet ('' = missing), `patch` = switch port its patch cord goes to, `hang` = a cord hangs unplugged. */
export interface PanelPort { n: number; pc: string | null; label: string; patch: number | null; hang: boolean }
export interface Uplink { cable: boolean; allowed: number[] | null }
export interface Switch {
  name: string; level: number; ip: string; ports: Port[]; vlans: Map<number, string>; dirty: boolean;
  panel: PanelPort[]; uplink: Uplink | null; upPort: Port; loop: [number, number] | null; rack: string;
}
export const SWITCHES: Switch[] = [];
const PANEL_OF = new Map<string, { sw: Switch; pp: PanelPort }>();
export const portName = (n: number) => `Gi1/0/${n}`;
export const outletId = (lv: number, n: number) => `L${lv}-${String(n).padStart(2, '0')}`;
/** The real identifier of a desk's outlet (= its patch-panel port). */
export const outletOf = (pc: string) => { const p = PANEL_OF.get(pc); return p ? outletId(p.sw.level, p.pp.n) : '-'; };
/** What is printed on the wall plate ('' when the label is missing). */
export const wallLabel = (pc: string) => PANEL_OF.get(pc)?.pp.label ?? '';
export const panelOf = (pc: string) => PANEL_OF.get(pc) ?? null;
export const isWired = (pc: string) => PANEL_OF.has(pc);

/** Recompute which PC reaches which switch port (after any patch-cord change). */
export function repatch(sw: Switch) {
  for (const p of sw.ports) p.pc = null;
  for (const pp of sw.panel) if (pp.patch && pp.pc) sw.ports[pp.patch - 1].pc = pp.pc;
}
/** Plug (or unplug with null) the patch cord of a panel port. Returns an error text or ''. */
export function patchCord(sw: Switch, ppN: number, swN: number | null): string {
  const pp = sw.panel[ppN - 1]; if (!pp) return 'port patch panel tidak ada';
  if (swN !== null) {
    if (swN < 1 || swN > sw.ports.length) return 'port switch tidak ada';
    if (sw.panel.some(q => q !== pp && q.patch === swN)) return `${portName(swN)} sudah terpakai patch cord lain`;
    if (sw.loop?.includes(swN)) return `${portName(swN)} sudah terpakai kabel lain`;
  }
  const before = pp.pc ? ADAPTERS.get(pp.pc) : undefined;
  pp.patch = swN; pp.hang = swN === null;
  repatch(sw);
  if (before) bounce(before);
  return '';
}

/** Build the floor switches and wire every PC: outlet n -> panel port n -> switch port n (sorted, stable). */
export function initSwitches(pcNames: string[]) {
  SWITCHES.length = 0; PANEL_OF.clear();
  for (const lv of [1, 2, 3]) {
    const vlan = lv === 1 ? 10 : 20;
    const sw: Switch = {
      name: `SW-L${lv}`, level: lv, ip: lv === 1 ? '192.168.10.2' : `192.168.20.${lv}`, ports: [], vlans: new Map([[1, 'default'], [10, 'LAB'], [20, 'KANTOR']]), dirty: false,
      panel: [], uplink: lv === 1 ? null : { cable: true, allowed: null }, upPort: { n: 49, pc: null, shutdown: false, vlan: 1, desc: lv === 1 ? '' : 'UPLINK-MDF' }, loop: null, rack: lv === 1 ? 'MDF' : `IDF-L${lv}`,
    };
    if (lv > 1) sw.vlans.delete(10);
    for (let n = 1; n <= 48; n++) { sw.ports.push({ n, pc: null, shutdown: n > 44, vlan, desc: '' }); sw.panel.push({ n, pc: null, label: '', patch: null, hang: false }); }
    const mine = pcNames.filter(p => new RegExp(`_L${lv}_`).test(p)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    // outlets are installed in blocks of four with a spare (unused, unpatched) outlet after each block,
    // so panel numbers and switch-port numbers differ, as on a real floor
    mine.forEach((pc, i) => { const pp = sw.panel[i + Math.floor(i / 4)]; pp.pc = pc; pp.label = outletId(lv, pp.n); pp.patch = i + 1; sw.ports[i].desc = pc.replace(/^PROP_/, '').slice(0, 18); PANEL_OF.set(pc, { sw, pp }); });
    repatch(sw);
    SWITCHES.push(sw);
  }
}
/** The switch port a PC reaches right now through its outlet + patch cord (null = not patched). */
export function portOf(pc: string) {
  const q = PANEL_OF.get(pc); if (!q || !q.pp.patch) return null;
  return { sw: q.sw, port: q.sw.ports[q.pp.patch - 1] };
}
export const isWireless = (pc: string) => /_L[4-8]_/.test(pc);
/** A cable between two ports of the same switch with no spanning tree: broadcast storm. */
export const stormOn = (sw: Switch) => !!sw.loop && !sw.ports[sw.loop[0] - 1].shutdown && !sw.ports[sw.loop[1] - 1].shutdown;
/** Uplink to the MDF carries this VLAN? */
export function uplinkCarries(sw: Switch, vlan: number) {
  if (!sw.uplink) return true;
  if (!sw.uplink.cable || sw.upPort.shutdown) return false;
  return !sw.uplink.allowed || sw.uplink.allowed.includes(vlan);
}

/** Which segment a PC is on right now. */
export function envOf(pc: string): Env {
  if (isWireless(pc)) return ENVS.guest;
  const q = PANEL_OF.get(pc);
  if (!q) return /_L[2-3]_/.test(pc) ? ENVS.office : ENVS.lab;
  const p = portOf(pc);
  if (!p) return ENVS.none;
  if (!p.sw.vlans.has(p.port.vlan)) return ENVS.none;          // VLAN not created on the switch: port inactive
  if (stormOn(p.sw)) return ENVS.none;                          // broadcast storm: nothing gets through
  if (!uplinkCarries(p.sw, p.port.vlan)) return ENVS.none;      // routers live behind the MDF
  return Object.values(ENVS).find(e => e.vlan === p.port.vlan && !e.wireless) ?? ENVS.none;
}
/** Legacy name kept for callers that only need the default segment. */
export function envForPc(name: string): EnvId { return envOf(name).id; }

// ---------------------------------------------------------------- adapters
export interface Lease { ip: string; t: number; prefix: number; gw: string; dns: string[]; env: EnvId; server: string }
export interface Adapter {
  pc: string; dhcp: boolean; ip: string; mask: string; gw: string; dns1: string; dns2: string; dnsAuto: boolean;
  cable: boolean; broken: boolean; enabled: boolean; lease?: Lease;
  mac: string; host: string; arp: Map<string, string>;
}
export const ADAPTERS = new Map<string, Adapter>();

let seq = 0;
export function newAdapter(pcName: string): Adapter {
  const h = [...pcName].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hex = (n: number) => (n & 255).toString(16).padStart(2, '0');
  const short = pcName.replace(/^PROP_/, '').replace(/_PC_|_LAPTOP_/, '-').toLowerCase().replace(/_/g, '-');
  const a: Adapter = { pc: pcName, dhcp: true, ip: '', mask: '', gw: '', dns1: '', dns2: '', dnsAuto: true, cable: true, broken: false, enabled: true, mac: ['00', 'e0', '4c', hex(h >> 16), hex(h >> 8), hex(h + seq++)].join('-'), host: short.slice(0, 15).toUpperCase(), arp: new Map() };
  ADAPTERS.set(pcName, a);
  return a;
}
export function adapterOf(pc: string) { return ADAPTERS.get(pc) ?? newAdapter(pc); }

/** Physical layer: is there a link light on the NIC? */
export function linkUp(a: Adapter) {
  if (isWireless(a.pc)) return true;
  if (!PANEL_OF.has(a.pc)) return a.cable && !a.broken;
  const p = portOf(a.pc);
  return a.cable && !a.broken && !!p && !p.port.shutdown;
}
/** Media state as Windows reports it (link + adapter enabled). */
export const mediaOk = (a: Adapter) => linkUp(a);

/** Link went down/up or adapter re-enabled: Windows forgets the lease state and asks DHCP again. */
export function bounce(a: Adapter) {
  if (a.lease?.ip) releaseLease(a);
  a.lease = undefined; a.arp.clear();
}
export function releaseLease(a: Adapter) {
  for (const e of Object.values(ENVS)) if (e.leases.get(a.mac) === a.lease?.ip) e.leases.delete(a.mac);
}

/** Is the DHCP pool usable (inside the router's subnet, ordered, not network/broadcast)? Returns an error text or ''. */
export function poolProblem(env: Env, d: DhcpCfg | null = env.dhcp): string {
  if (!d) return 'DHCP server disabled';
  const s = parseIp(d.start), e = parseIp(d.end), g = parseIp(env.gateway);
  if (s === null || e === null) return 'alamat pool tidak valid';
  if (g === null) return 'router belum punya alamat LAN';
  const p = env.prefix, net = networkOf(g, p), bc = broadcastOf(g, p);
  if (networkOf(s, p) !== net || networkOf(e, p) !== net) return 'pool di luar subnet interface';
  if (s > e) return 'awal pool lebih besar dari akhir';
  if (s === net || e === bc) return 'pool memakai alamat network/broadcast';
  return '';
}
function allocate(env: Env, a: Adapter): string | null {
  if (!env.dhcp || poolProblem(env)) return null;
  const s = parseIp(env.dhcp.start)!, e = parseIp(env.dhcp.end)!;
  const prev = env.leases.get(a.mac);
  const taken = new Set<string>([...env.hosts.map(h => h.ip), ...[...env.leases.entries()].filter(([m]) => m !== a.mac).map(([, ip]) => ip)]);
  for (const o of ADAPTERS.values()) if (o !== a && !o.dhcp && envOf(o.pc) === env && linkUp(o) && o.enabled) taken.add(o.ip);   // server ping-checks before offering
  if (prev && parseIp(prev)! >= s && parseIp(prev)! <= e && !taken.has(prev)) return prev;
  const span = e - s + 1, off = parseInt(a.mac.replace(/-/g, '').slice(-4), 16) % span;
  for (let k = 0; k < span; k++) { const ip = ipStr((s + ((off + k) % span)) >>> 0); if (!taken.has(ip)) { env.leases.set(a.mac, ip); return ip; } }
  return null;
}

export interface Live { ip: string; prefix: number; gw: string; dns: string[]; apipa: boolean; ok: boolean; why?: string }
const apipa = (a: Adapter): Live => ({ ip: `169.254.${(parseInt(a.mac.slice(-5, -3), 16) % 254) + 1}.${(parseInt(a.mac.slice(-2), 16) % 254) + 1}`, prefix: 16, gw: '', dns: [], apipa: true, ok: false, why: 'apipa' });

/** The address the adapter is actually using right now. */
export function live(a: Adapter, env: Env = envOf(a.pc)): Live {
  if (!a.enabled) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'disabled' };
  if (!linkUp(a)) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'media' };
  if (a.dhcp) {
    if (!a.lease) {
      const ip = allocate(env, a);
      if (!ip) return apipa(a);
      const d = env.dhcp!;
      a.lease = { ip, t: Date.now(), prefix: env.prefix, gw: d.gw, dns: [...d.dns], env: env.id, server: env.gateway };
    }
    if (!a.lease.ip) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'released' };
    const dns = a.dnsAuto ? a.lease.dns : [a.dns1, a.dns2].filter(s => parseIp(s) !== null);
    return { ip: a.lease.ip, prefix: a.lease.prefix, gw: a.lease.gw, dns, apipa: false, ok: true };
  }
  const p = parseMask(a.mask);
  if (!parseIp(a.ip) || p === null) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'noip' };
  return { ip: a.ip, prefix: p, gw: a.gw, dns: [a.dns1, a.dns2].filter(s => parseIp(s) !== null), apipa: false, ok: true };
}

/** A lease from a subnet this port is no longer on (renumbered router, moved VLAN): the client keeps it
 *  until it renews. Returns true when the next renewal would be NAKed. */
export function staleLease(a: Adapter) {
  if (!a.dhcp || !a.lease?.ip) return false;
  const env = envOf(a.pc);
  if (a.lease.env !== env.id) return true;
  return !env.gateway || networkOf(parseIp(a.lease.ip)!, env.prefix) !== networkOf(parseIp(env.gateway)!, env.prefix);
}

export type PingRes =
  | { kind: 'reply'; ip: string; ttl: number; ms: () => number }
  | { kind: 'timeout' }
  | { kind: 'unreach'; from: string }
  | { kind: 'general' }
  | { kind: 'nohost'; name: string };

const segNet = (env: Env) => (env.gateway ? networkOf(parseIp(env.gateway)!, env.prefix) : -1);
const inEnv = (ip: string, env: Env) => !!env.gateway && networkOf(parseIp(ip)!, env.prefix) === segNet(env);

/** Another device (host or PC) using this IP on the same segment. */
export function conflict(l: Live, env: Env, self?: Adapter) {
  if (!l.ip) return false;
  if (env.hosts.some(h => h.ip === l.ip)) return true;
  for (const o of ADAPTERS.values()) {
    if (o === self || !o.enabled || !linkUp(o) || envOf(o.pc) !== env) continue;
    const ol = live(o, env);
    if (ol.ok && ol.ip === l.ip) return true;
  }
  return false;
}

/** Is my real address valid on this segment (right subnet, not network/broadcast, not taken)? */
export function onSegment(l: Live, env: Env, self?: Adapter) {
  if (!l.ok || l.apipa || !env.gateway) return false;
  const ip = parseIp(l.ip)!;
  if (networkOf(ip, env.prefix) !== segNet(env) || l.prefix !== env.prefix) return false;
  if (ip === segNet(env) || ip === broadcastOf(ip, env.prefix)) return false;
  return !conflict(l, env, self);
}

/** Resolve a name like Windows' resolver (configured DNS servers in order). */
export function resolve(a: Adapter, env: Env, name: string): { ip: string; via: string } | null | 'timeout' {
  const n = name.toLowerCase().replace(/\.$/, '');
  if (parseIp(n) !== null) return { ip: n, via: '' };
  if (n === 'localhost') return { ip: '127.0.0.1', via: '' };
  const l = live(a, env);
  if (!l.ok || !l.dns.length) return null;
  for (const d of l.dns) {
    if (ping(a, env, d, true).kind !== 'reply') continue;
    const r = routerOf(env);
    if (r && d === r.ip) {                                         // the segment router's DNS forwarder
      if (!env.dnsSrv.allow) continue;                              // refuses remote requests
      const short = n.endsWith(`.${env.suffix}`) ? n.slice(0, -env.suffix.length - 1) : n;
      const rec = env.dnsSrv.records.find(x => x.name.toLowerCase() === n || x.name.toLowerCase() === short);
      if (rec) return { ip: rec.ip, via: d };
      const host = env.hosts.find(h => h.name === short);
      if (host) return { ip: host.ip, via: d };
      if (!env.dnsSrv.upstream.some(u => PUBLIC_DNS.includes(u))) return 'timeout';
      return INTERNET[n] ? { ip: INTERNET[n].ip, via: d } : null;
    }
    if (PUBLIC_DNS.includes(d)) return INTERNET[n] ? { ip: INTERNET[n].ip, via: d } : null;   // public DNS knows no internal names
  }
  return 'timeout';
}

/** One ICMP echo from this adapter to an IP. */
export function ping(a: Adapter, env: Env, target: string, quiet = false): PingRes {
  const l = live(a, env);
  if (target === '127.0.0.1') return { kind: 'reply', ip: target, ttl: 128, ms: () => 0 };
  if (!l.ok) return { kind: 'general' };
  if (target === l.ip) return { kind: 'reply', ip: target, ttl: 128, ms: () => 0 };
  const t = parseIp(target); if (t === null) return { kind: 'general' };
  const mine = parseIp(l.ip)!;
  const seg = onSegment(l, env, a);
  if (networkOf(t, l.prefix) === networkOf(mine, l.prefix)) {
    // on-link: ARP on the wire works only if both really share the segment
    const h = env.hosts.find(x => x.ip === target);
    const pc = [...ADAPTERS.values()].find(o => o !== a && o.enabled && linkUp(o) && envOf(o.pc) === env && live(o, env).ip === target);
    if (seg && (h || pc)) { if (!quiet) a.arp.set(target, h?.mac ?? pc!.mac); return { kind: 'reply', ip: target, ttl: h?.ttl ?? 128, ms: () => (Math.random() < 0.8 ? 0 : 1) }; }
    return seg && inEnv(target, env) ? { kind: 'timeout' } : { kind: 'unreach', from: l.ip };
  }
  // off-link: needs a default gateway inside my own subnet that is the real router
  if (!l.gw || parseIp(l.gw) === null || networkOf(parseIp(l.gw)!, l.prefix) !== networkOf(mine, l.prefix)) return { kind: 'general' };
  const gwHost = env.hosts.find(x => x.ip === l.gw);
  if (!seg || !gwHost || gwHost.web !== 'router') return gwHost && seg ? { kind: 'timeout' } : { kind: 'unreach', from: l.ip };
  if (!quiet) a.arp.set(gwHost.ip, gwHost.mac);
  for (const e of Object.values(ENVS)) if (e !== env && e.id !== 'none' && inEnv(target, e)) {
    const h = e.hosts.find(x => x.ip === target);
    if (!h || env.id === 'guest' || e.id === 'guest' || env.id === 'kasir' || e.id === 'kasir') return { kind: 'timeout' };    // guest & POS segments are firewalled
    return { kind: 'reply', ip: h.ip, ttl: h.ttl - 1, ms: () => 1 + Math.round(Math.random() * 2) };
  }
  if (!env.internet) return { kind: 'timeout' };
  const known = PUBLIC_DNS.includes(target) || Object.values(INTERNET).some(v => v.ip === target);
  if (!known) return { kind: 'timeout' };
  return { kind: 'reply', ip: target, ttl: target.startsWith('8.8') || target.startsWith('142.') ? 117 : 56, ms: () => 14 + Math.round(Math.random() * 18) };
}

export function hopsTo(a: Adapter, env: Env, target: string): string[] {
  const l = live(a, env);
  const internal = Object.values(ENVS).some(e => e.id !== 'none' && inEnv(target, e));
  if (networkOf(parseIp(target)!, l.prefix || 32) === networkOf(parseIp(l.ip || '0.0.0.0')!, l.prefix || 32)) return [target];
  if (internal) return [env.gateway, target];
  return [env.gateway, '10.20.0.1', '180.252.1.17', '61.5.115.9', '72.14.215.85', target];
}

/** Full connectivity from this adapter: valid address, gateway answers, DNS resolves, internet answers. */
export function healthy(a: Adapter, env: Env = envOf(a.pc)) {
  const l = live(a, env);
  if (!l.ok || !onSegment(l, env, a)) return false;
  if (ping(a, env, l.gw || '0.0.0.0', true).kind !== 'reply') return false;
  const r = resolve(a, env, 'cari.id');
  return !!r && r !== 'timeout' && ping(a, env, r.ip, true).kind === 'reply';
}

/** Windows retries DHCP on its own: a client whose lease was NAKed (stale subnet) or that sits on APIPA
 *  asks again. Called on a slow timer by the game (≈ every 60 s), never for an explicit /release. */
export function dhcpHousekeeping() {
  for (const a of ADAPTERS.values()) {
    if (!a.dhcp || !a.enabled || !linkUp(a)) continue;
    if (staleLease(a)) { releaseLease(a); a.lease = undefined; }
  }
}

export const maskStr = (p: number) => ipStr(prefixToMask(p));
export { parseIp, parseMask, ipStr, networkOf, broadcastOf, prefixToMask };
