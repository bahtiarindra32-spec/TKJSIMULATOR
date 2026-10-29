// Simulated client network for the in-game PCs (pure TS, no DOM).
// Each PC sits in a network environment (lab / office / hotel guest Wi-Fi). Its adapter config
// (DHCP or static IP/mask/gateway/DNS, cable) decides what ipconfig/ping/tracert/nslookup/browser see.
import { parseIp, ipStr, prefixToMask, networkOf, broadcastOf, parseMask } from '../game/missionLogic';

export interface Host { ip: string; name: string; mac: string; ttl: number; web?: string }
export interface Env {
  id: 'lab' | 'office' | 'guest';
  label: string; net: string; prefix: number; gateway: string; dns: string[];
  dhcp: { from: number; to: number; lease: number } | null; suffix: string;
  hosts: Host[]; internet: boolean; adapter: string; wireless: boolean;
}

export const ENVS: Record<Env['id'], Env> = {
  lab: {
    id: 'lab', label: 'Lab TKJ (L1)', net: '192.168.10.0', prefix: 24, gateway: '192.168.10.1', dns: ['192.168.10.1'],
    dhcp: { from: 100, to: 199, lease: 24 }, suffix: 'lab.smk.local', internet: true, adapter: 'Realtek PCIe GbE Family Controller', wireless: false,
    hosts: [
      { ip: '192.168.10.1', name: 'router-lab', mac: '48-8f-5a-10-00-01', ttl: 64, web: 'router' },
      { ip: '192.168.10.2', name: 'sw-lab-01', mac: '00-1e-7a-10-00-02', ttl: 255 },
      { ip: '192.168.10.10', name: 'srv-praktik', mac: '52-54-00-10-00-0a', ttl: 64, web: 'server' },
      { ip: '192.168.10.21', name: 'pc-praktik-02', mac: 'b4-2e-99-10-00-15', ttl: 128 },
    ],
  },
  office: {
    id: 'office', label: 'Kantor (L2–L3)', net: '192.168.20.0', prefix: 24, gateway: '192.168.20.1', dns: ['192.168.20.1'],
    dhcp: { from: 100, to: 220, lease: 8 }, suffix: 'kantor.local', internet: true, adapter: 'Intel(R) Ethernet Connection I219-LM', wireless: false,
    hosts: [
      { ip: '192.168.20.1', name: 'router-kantor', mac: '48-8f-5a-20-00-01', ttl: 64, web: 'router' },
      { ip: '192.168.20.50', name: 'printer-l2', mac: '00-80-77-20-00-32', ttl: 64, web: 'printer' },
      { ip: '192.168.20.10', name: 'nas-kantor', mac: '00-11-32-20-00-0a', ttl: 64 },
    ],
  },
  guest: {
    id: 'guest', label: 'Wi-Fi Tamu Hotel', net: '172.16.4.0', prefix: 22, gateway: '172.16.4.1', dns: ['172.16.4.1'],
    dhcp: { from: 100, to: 1000, lease: 2 }, suffix: 'tamu.hotel', internet: true, adapter: 'Intel(R) Wi-Fi 6 AX201 160MHz', wireless: true,
    hosts: [{ ip: '172.16.4.1', name: 'gw-tamu', mac: '48-8f-5a-04-00-01', ttl: 64, web: 'router' }],
  },
};

/** Internet names (fictional addresses inside the simulation). */
export const INTERNET: Record<string, { ip: string; web: string }> = {
  'cari.id': { ip: '103.10.20.30', web: 'search' }, 'www.cari.id': { ip: '103.10.20.30', web: 'search' },
  'google.com': { ip: '142.250.4.100', web: 'search' }, 'www.google.com': { ip: '142.250.4.100', web: 'search' },
  'smk.sch.id': { ip: '103.55.12.7', web: 'school' }, 'www.smk.sch.id': { ip: '103.55.12.7', web: 'school' },
  'youtube.com': { ip: '142.250.4.190', web: 'blocked' }, 'www.youtube.com': { ip: '142.250.4.190', web: 'blocked' },
  'dns.google': { ip: '8.8.8.8', web: 'search' }, 'one.one.one.one': { ip: '1.1.1.1', web: 'search' },
};
const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'];

export interface Adapter {
  dhcp: boolean; ip: string; mask: string; gw: string; dns1: string; dns2: string; dnsAuto: boolean;
  cable: boolean; portDown?: boolean; enabled: boolean; lease?: { ip: string; t: number };
  mac: string; host: string; arp: Map<string, string>;
}

export function envForPc(name: string): Env['id'] {
  if (/_L[2-3]_/.test(name)) return 'office';
  if (/_L[4-8]_/.test(name)) return 'guest';
  return 'lab';
}

let seq = 0;
export function newAdapter(pcName: string): Adapter {
  const h = [...pcName].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hex = (n: number) => (n & 255).toString(16).padStart(2, '0');
  const short = pcName.replace(/^PROP_/, '').replace(/_PC_|_LAPTOP_/, '-').toLowerCase().replace(/_/g, '-');
  return { dhcp: true, ip: '', mask: '', gw: '', dns1: '', dns2: '', dnsAuto: true, cable: true, enabled: true, mac: ['00', 'e0', '4c', hex(h >> 16), hex(h >> 8), hex(h + seq++)].join('-'), host: short.slice(0, 15).toUpperCase(), arp: new Map() };
}

export interface Live { ip: string; prefix: number; gw: string; dns: string[]; apipa: boolean; ok: boolean; why?: string }

/** The address the adapter is actually using right now. */
export function live(a: Adapter, env: Env): Live {
  if (!a.enabled) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'disabled' };
  if (!a.cable || a.portDown) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'media' };
  if (a.dhcp) {
    if (!env.dhcp) { const ap = `169.254.${(parseInt(a.mac.slice(-5, -3), 16) % 254) + 1}.${(parseInt(a.mac.slice(-2), 16) % 254) + 1}`; return { ip: ap, prefix: 16, gw: '', dns: [], apipa: true, ok: false, why: 'apipa' }; }
    if (!a.lease) { const base = parseIp(env.net)!; const span = env.dhcp.to - env.dhcp.from; const off = env.dhcp.from + (parseInt(a.mac.replace(/-/g, '').slice(-4), 16) % span); a.lease = { ip: ipStr((base + off) >>> 0), t: Date.now() }; }
    if (!a.lease.ip) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'released' };
    const dns = a.dnsAuto ? env.dns : [a.dns1, a.dns2].filter(Boolean);
    return { ip: a.lease.ip, prefix: env.prefix, gw: env.gateway, dns, apipa: false, ok: true };
  }
  const p = parseMask(a.mask);
  if (!parseIp(a.ip) || p === null) return { ip: '', prefix: 0, gw: '', dns: [], apipa: false, ok: false, why: 'noip' };
  return { ip: a.ip, prefix: p, gw: a.gw, dns: [a.dns1, a.dns2].filter(s => parseIp(s) !== null), apipa: false, ok: true };
}

export type PingRes =
  | { kind: 'reply'; ip: string; ttl: number; ms: () => number }
  | { kind: 'timeout' }
  | { kind: 'unreach'; from: string }
  | { kind: 'general' }
  | { kind: 'nohost'; name: string };

const inNet = (ip: string, net: string, p: number) => networkOf(parseIp(ip)!, p) === networkOf(parseIp(net)!, p);

/** Is my real address valid on this segment (right subnet, not network/broadcast, not taken)? */
export function onSegment(l: Live, env: Env) {
  if (!l.ok || l.apipa) return false;
  const ip = parseIp(l.ip)!, base = parseIp(env.net)!;
  if (networkOf(ip, env.prefix) !== networkOf(base, env.prefix)) return false;
  if (ip === networkOf(base, env.prefix) || ip === broadcastOf(base, env.prefix)) return false;
  return !conflict(l, env);
}
export function conflict(l: Live, env: Env) { return !!l.ip && env.hosts.some(h => h.ip === l.ip); }

/** Resolve a name like Windows' resolver (hosts first, then configured DNS). */
export function resolve(a: Adapter, env: Env, name: string): { ip: string; via: string } | null | 'timeout' {
  const n = name.toLowerCase().replace(/\.$/, '');
  if (parseIp(n) !== null) return { ip: n, via: '' };
  if (n === 'localhost') return { ip: '127.0.0.1', via: '' };
  const l = live(a, env);
  if (!l.ok || !l.dns.length) return null;
  const short = n.replace(`.${env.suffix}`, '');
  const local = env.hosts.find(h => h.name === short);
  // pick the first DNS that answers
  for (const d of l.dns) {
    const r = ping(a, env, d, true);
    if (r.kind !== 'reply') continue;
    const isLocalDns = env.hosts.some(h => h.ip === d);
    if (local && isLocalDns) return { ip: local.ip, via: d };
    const inet = INTERNET[n];
    if (inet) return { ip: inet.ip, via: d };
    return null;
  }
  return 'timeout';
}

/** One ICMP echo from this adapter to an IP. */
export function ping(a: Adapter, env: Env, target: string, quiet = false): PingRes {
  const l = live(a, env);
  if (target === '127.0.0.1') return { kind: 'reply', ip: target, ttl: 128, ms: () => 0 };
  if (!l.ok) return { kind: 'general' };
  if (target === l.ip) return { kind: 'reply', ip: target, ttl: 128, ms: () => 0 };
  const t = parseIp(target)!;
  const mine = parseIp(l.ip)!;
  const sameMine = networkOf(t, l.prefix) === networkOf(mine, l.prefix);
  const seg = onSegment(l, env);
  if (sameMine) {
    // ARP on the wire: works only if both really share the segment
    const h = env.hosts.find(x => x.ip === target);
    if (!seg || !h) return inNet(target, env.net, env.prefix) && seg ? { kind: 'timeout' } : { kind: 'unreach', from: l.ip };
    if (!quiet) a.arp.set(h.ip, h.mac);
    return { kind: 'reply', ip: h.ip, ttl: h.ttl, ms: () => (Math.random() < 0.8 ? 0 : 1) };
  }
  // off-link: needs a default gateway inside my own subnet
  if (!l.gw || parseIp(l.gw) === null || networkOf(parseIp(l.gw)!, l.prefix) !== networkOf(mine, l.prefix)) return { kind: 'general' };
  const gwHost = env.hosts.find(x => x.ip === l.gw);
  if (!seg || !gwHost || l.gw !== env.gateway) return gwHost && seg ? { kind: 'timeout' } : { kind: 'unreach', from: l.ip };
  if (!quiet) a.arp.set(gwHost.ip, gwHost.mac);
  // another internal network routed by the building core
  for (const e of Object.values(ENVS)) if (e !== env && inNet(target, e.net, e.prefix)) {
    const h = e.hosts.find(x => x.ip === target);
    if (!h || env.id === 'guest' || e.id === 'guest') return { kind: 'timeout' };    // guest Wi-Fi is isolated
    return { kind: 'reply', ip: h.ip, ttl: h.ttl - 1, ms: () => 1 + Math.round(Math.random() * 2) };
  }
  if (!env.internet) return { kind: 'timeout' };
  const known = PUBLIC_DNS.includes(target) || Object.values(INTERNET).some(v => v.ip === target);
  if (!known) return { kind: 'timeout' };
  return { kind: 'reply', ip: target, ttl: target.startsWith('8.8') || target.startsWith('142.') ? 117 : 56, ms: () => 14 + Math.round(Math.random() * 18) };
}

export function hopsTo(a: Adapter, env: Env, target: string): string[] {
  const l = live(a, env);
  const internal = Object.values(ENVS).some(e => inNet(target, e.net, e.prefix));
  if (networkOf(parseIp(target)!, l.prefix || 32) === networkOf(parseIp(l.ip || '0.0.0.0')!, l.prefix || 32)) return [target];
  if (internal) return [env.gateway, target];
  return [env.gateway, '10.20.0.1', '180.252.1.17', '61.5.115.9', '72.14.215.85', target];
}

export const maskStr = (p: number) => ipStr(prefixToMask(p));
export { parseIp, parseMask, ipStr };
