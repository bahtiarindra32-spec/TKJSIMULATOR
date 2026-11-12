// HOOKS adapter: a RouterOS device's configuration drives real reachability in net.ts (like labrouter.ts does for R-LAB).
// A PC is cabled to a router port (etherN) or associated to wlan1; the port's layer-3 interface (its bridge, or the
// port itself) is one net.ts segment (Env) whose gateway, DHCP server, DNS forwarder and internet verdict are computed
// from the device on every config change. Clients get DHCP from the RouterOS server, NAT/firewall/hotspot decide the
// internet, the input chain answers pings to the router, and throughput reports the effective simple-queue limit.
import { HOOKS, ENVS, ADAPTERS, adapterOf, live, linkUp, envOf, bounce, INTERNET, PUBLIC_DNS, type Env, type PingRes, type DhcpCfg } from '../net';
import { DEFAULT_ISP, ifMac, ifByDefault, l3Of, identity, rows, interfaces, type Isp, type RosDevice, type DynLease } from './model';
import { ifAddr, dhcpFor, dnsServers, wanStatus, inputOk, clientInternet, forward, hotspotOn, hsActive, hotspotLogin, hotspotLogout, throughput, addresses, ROS_HOOKS, type Thru } from './engine';
import { networkOf, parseIp } from '../../game/missionLogic';

interface Plug { dev: RosDevice; port: string; ssid: string; key: string }
const DEVS = new Map<string, RosDevice>();
const PLUGS = new Map<string, Plug>();
const SEG = new Map<string, Env>();
const OWNER = new Map<Env, { dev: RosDevice; l3: string }>();
const SYNCED = new Map<Env, number>();
/** Fase 1 site LANs bound to a device bridge: what net.ts keeps owning (label, adapter, Wi-Fi flag, the switch/AP hosts) */
const BOUND = new Map<Env, { label: string; adapter: string; wireless: boolean; extra: Env['hosts']; port?: string }>();
/** ports with a live peer that are not PCs plugged here (a site switch / AP cabled to the router port), per device */
const EXT_LINKS = new Map<string, () => string[]>();
const WIFI_ADAPTER = 'Intel(R) Wi-Fi 6 AX201 160MHz';

/** put a router into the simulation; ether1 (or wanPort) is cabled to the ISP line (⚠ design ISP, DEFAULT_ISP) */
export function attachRouterOs(dev: RosDevice, opts: { isp?: Isp | null; wanPort?: string } = {}) {
  DEVS.set(dev.id, dev);
  dev.rt.isp = opts.isp === undefined ? { ...DEFAULT_ISP } : opts.isp;
  dev.rt.wanPort = opts.wanPort ?? 'ether1';
  refreshLinks(dev); dev.rev++;
  return dev;
}
export function detachRouterOs(dev: RosDevice) {
  for (const [pc, p] of [...PLUGS]) if (p.dev === dev) unplugClient(pc);
  for (const [k, e] of [...SEG]) if (OWNER.get(e)?.dev === dev) { SEG.delete(k); OWNER.delete(e); SYNCED.delete(e); BOUND.delete(e); }
  DEVS.delete(dev.id); EXT_LINKS.delete(dev.id);
}
/** forget every device and plug (tests) */
export function resetRouterOsNet() { for (const d of [...DEVS.values()]) detachRouterOs(d); PLUGS.clear(); }
export const routerOsDevices = () => [...DEVS.values()];
/** the ISP cable on the WAN port (pull it = no internet) */
export function setWanCable(dev: RosDevice, on: boolean) { if (on && !dev.rt.isp) dev.rt.isp = { ...DEFAULT_ISP }; if (!on) dev.rt.isp = null; refreshLinks(dev); dev.rev++; }

/** cable a PC to a router port (factory name ether2…) or associate it to wlan1 with the SSID/key saved on it */
export function plugClient(dev: RosDevice, port: string, pc: string, opts: { ssid?: string; key?: string } = {}) {
  const a = adapterOf(pc);
  if (a.lease?.ip) bounce(a);
  PLUGS.set(pc, { dev, port, ssid: opts.ssid ?? '', key: opts.key ?? '' });
  refreshLinks(dev); dev.rev++;
}
export function unplugClient(pc: string) {
  const p = PLUGS.get(pc); if (!p) return;
  const a = ADAPTERS.get(pc); if (a?.lease?.ip) bounce(a);
  PLUGS.delete(pc); hotspotLogout(p.dev, a ? live(a).ip : ''); refreshLinks(p.dev); p.dev.rev++;
}
export const plugOf = (pc: string) => PLUGS.get(pc) ?? null;

/** ether ports with a live peer: the ISP line on the WAN port, client NICs with a good cable */
function refreshLinks(dev: RosDevice) {
  const s = new Set<string>();
  if (dev.rt.isp) s.add(dev.rt.wanPort);
  for (const [pc, p] of PLUGS) if (p.dev === dev && p.port.startsWith('ether')) { const a = ADAPTERS.get(pc); if (a && a.cable && !a.broken && a.enabled) s.add(p.port); }
  for (const n of EXT_LINKS.get(dev.id)?.() ?? []) s.add(n);
  const same = s.size === dev.rt.linked.size && [...s].every(x => dev.rt.linked.has(x));
  if (!same) { dev.rt.linked = s; dev.rev++; }
}

/** can the PC reach its router port right now? (wired: port enabled; wlan1: enabled AP, right SSID, right key) */
function portOk(p: Plug): boolean {
  const i = ifByDefault(p.dev, p.port); if (!i || i.row.disabled) return false;
  if (i.type !== 'wlan') return true;
  const w = i.row.p;
  if (w.mode !== 'ap-bridge' && w.mode !== 'bridge') return false;
  if (p.ssid && w.ssid !== p.ssid) return false;
  const sp = rows(p.dev, '/interface wireless security-profiles').find(r => r.p.name === w['security-profile']);
  const open = !sp || sp.p.mode === 'none';
  if (open) return !p.key;
  const psk = sp.p['authentication-types'].split(',').some(x => x === 'wpa2-psk' || x === 'wpa-psk');
  return psk && !!p.key && (p.key === sp.p['wpa2-pre-shared-key'] || p.key === sp.p['wpa-pre-shared-key']);
}

/** the net.ts segment behind a layer-3 interface of a device (created once, resynced when the config changes) */
export function segEnv(dev: RosDevice, l3: string): Env {
  const k = `${dev.id}|${l3}`; let e = SEG.get(k);
  if (!e) {
    e = { id: `ros-${dev.id}-${l3}`, vlan: -2, label: '', net: '0.0.0.0', prefix: 24, gateway: '', dns: [], dhcp: null, dnsSrv: { allow: false, upstream: [], records: [] }, suffix: '', hosts: [], internet: false, adapter: 'Realtek PCIe GbE Family Controller', wireless: false, leases: new Map(), site: `ros:${dev.id}` };
    SEG.set(k, e); OWNER.set(e, { dev, l3 });
  }
  if (SYNCED.get(e) !== dev.rev) sync(dev, l3, e);
  return e;
}
function sync(dev: RosDevice, l3: string, e: Env) {
  SYNCED.set(e, dev.rev);
  const a = ifAddr(dev, l3); const name = identity(dev).toLowerCase();
  e.label = `${identity(dev)} · ${l3}`;
  e.wireless = interfaces(dev).some(i => i.type === 'wlan' && l3Of(dev, i.row.p.name) === l3) && !interfaces(dev).some(i => i.type === 'ether' && l3Of(dev, i.row.p.name) === l3);
  e.adapter = e.wireless ? WIFI_ADAPTER : 'Realtek PCIe GbE Family Controller';
  const b = BOUND.get(e);
  const keep = () => { if (b) { e.label = b.label; e.adapter = b.adapter; e.wireless = b.wireless; e.hosts.push(...b.extra.filter(h => h.ip !== a?.ip)); } };
  if (!a) { Object.assign(e, { gateway: '', net: '0.0.0.0', prefix: 24, dns: [], hosts: [], dhcp: null, dhcpServer: undefined, internet: false }); keep(); return; }
  const mac = ifMac(dev, l3) || '6C:3B:6B:00:00:00';
  e.gateway = a.ip; e.prefix = a.prefix; e.net = [a.net >>> 24, (a.net >>> 16) & 255, (a.net >>> 8) & 255, a.net & 255].join('.'); e.dns = [a.ip];
  e.hosts = [{ ip: a.ip, name, mac: mac.toLowerCase().replace(/:/g, '-'), ttl: 64, web: 'router', ros: dev.id }];
  const dh = dhcpFor(dev, l3);
  e.dhcp = dh ? ({ start: dh.start, end: dh.end, gw: dh.gw, dns: dh.dns, lease: dh.leaseSec / 3600 } as DhcpCfg) : null;
  e.dhcpServer = a.ip;
  const ds = dnsServers(dev);
  // the hotspot DNS name becomes a static DNS entry pointing to the hotspot address [11]
  const records = rows(dev, '/ip hotspot profile').filter(r => r.p['dns-name'] && r.p['hotspot-address'] !== '0.0.0.0').map(r => ({ name: r.p['dns-name'], ip: r.p['hotspot-address'] }));
  e.dnsSrv = { allow: rows(dev, '/ip dns')[0].p['allow-remote-requests'] === 'yes', upstream: [...ds.stat, ...ds.dyn], records };
  e.internet = wanStatus(dev).ok;
  keep();
  // static leases reserve their address for that MAC (net.ts keeps leases as mac → ip with dashed lowercase MACs)
  for (const l of rows(dev, '/ip dhcp-server lease')) if (!l.disabled && (l.p.server === 'all' || l.p.server === dh?.server)) e.leases.set(l.p['mac-address'].toLowerCase().replace(/:/g, '-'), l.p.address);
}

/**
 * Fase 2 on a Fase 1 site: an existing net.ts segment (ENVS.warnet / ENVS.kos, reached through the site switch or the
 * APs) becomes the LAN behind layer-3 interface l3 of a RouterOS device. net.ts keeps the physical path (switch ports,
 * VLANs, STP, APs) and the segment's identity; gateway, DHCP pool, DNS forwarder and the internet verdict (filter, NAT,
 * WAN) come from the device. `links` reports which factory ports have a live peer (e.g. the switch uplink on ether2).
 */
export function bindSiteEnv(dev: RosDevice, l3: string, env: Env, links: () => string[] = () => [], port?: string) {
  if (!DEVS.has(dev.id)) attachRouterOs(dev);
  const gw = env.hosts.find(h => h.web === 'router');
  BOUND.set(env, { label: env.label, adapter: env.adapter, wireless: env.wireless, extra: env.hosts.filter(h => h !== gw), port });
  const k = `${dev.id}|${l3}`; SEG.set(k, env); OWNER.set(env, { dev, l3 }); SYNCED.delete(env);
  EXT_LINKS.set(dev.id, links);
  syncSiteEnv(env);
  return env;
}
/** bring a bound site segment up to date with its device (net.ts calls this whenever a PC lands on the segment) */
export function syncSiteEnv(env: Env) {
  const o = OWNER.get(env); const b = BOUND.get(env); if (!o || !b) return;
  refreshLinks(o.dev);
  // the site cabling lands on a physical port: the LAN is whatever layer-3 interface that port belongs to now
  // (e.g. after a reset to the default configuration the port sits in "bridge" with 192.168.88.1/24)
  if (b.port) {
    const l3 = l3Of(o.dev, ifByDefault(o.dev, b.port)?.row.p.name ?? b.port);
    if (l3 !== o.l3) {
      SEG.delete(`${o.dev.id}|${o.l3}`); SEG.set(`${o.dev.id}|${l3}`, env);
      OWNER.set(env, { dev: o.dev, l3 }); SYNCED.delete(env); o.l3 = l3;
    }
  }
  if (SYNCED.get(env) !== o.dev.rev) sync(o.dev, o.l3, env);
}
/** the RouterOS device behind a segment (null = not a RouterOS LAN) */
export const rosOwner = (env: Env) => OWNER.get(env)?.dev ?? null;
HOOKS.envSync = syncSiteEnv;

/** the segment (and router interface) a plugged PC is on, or null when it is not on a RouterOS device */
export function rosSegment(pc: string): { dev: RosDevice; l3: string; env: Env } | null {
  const p = PLUGS.get(pc); if (!p) return null;
  refreshLinks(p.dev);
  if (!portOk(p)) return null;
  const i = ifByDefault(p.dev, p.port)!; const l3 = l3Of(p.dev, i.row.p.name);
  return { dev: p.dev, l3, env: segEnv(p.dev, l3) };
}
HOOKS.envFor = pc => {
  if (!PLUGS.size || !PLUGS.has(pc)) return null;
  return rosSegment(pc)?.env ?? ENVS.none;   // plugged but the port is down / wrong SSID or key: no network
};
HOOKS.linkFor = pc => {
  if (!PLUGS.size) return null;
  const p = PLUGS.get(pc); if (!p) return null;
  const a = ADAPTERS.get(pc);
  if (!a) return false;
  if (p.port.startsWith('wlan')) return portOk(p);
  return a.cable && !a.broken && portOk(p);
};
HOOKS.extraEnvs = () => [...SEG.values()];
const hostOf = (ip: string) => Object.entries(INTERNET).find(([, v]) => v.ip === ip)?.[0] ?? '';
HOOKS.gate = (env, src, dst, p, kind) => {
  const o = OWNER.get(env); if (!o) return null;
  if (kind === 'router') return wanStatus(o.dev).ok;
  if (kind === 'input') return inputOk(o.dev, o.l3, src, dst, p);
  return clientInternet(o.dev, o.l3, src, dst, p, hostOf(dst)).ok;
};
HOOKS.rosRoute = (env, src, dst): PingRes | null => {
  const o = OWNER.get(env); if (!o) return null;
  const { dev, l3 } = o; const x = parseIp(dst); if (x === null) return null;
  const reply = (ttl: number): PingRes => ({ kind: 'reply', ip: dst, ttl, ms: () => 1 + Math.round(Math.random() * 2) });
  // one of the router's own addresses (WAN address, another LAN's gateway): input chain
  if (addresses(dev).some(a => a.ip === dst)) return inputOk(dev, l3, src, dst, 'icmp') ? reply(64) : { kind: 'timeout' };
  if (hotspotOn(dev, l3) && !hsActive(dev, src)) return { kind: 'timeout' };
  // another segment of the same router: forward chain both ways, the far PC must use this router as its gateway
  for (const [other, ow] of OWNER) {
    if (ow.dev !== dev || ow.l3 === l3 || !other.gateway) continue;
    if (networkOf(x, other.prefix) !== networkOf(parseIp(other.gateway)!, other.prefix)) continue;
    if (!forward(dev, l3, ow.l3, src, dst, 'icmp', false).ok) return { kind: 'timeout' };
    for (const [pc, pl] of PLUGS) {
      if (pl.dev !== dev) continue; const s = rosSegment(pc); if (!s || s.env !== other) continue;
      const a = ADAPTERS.get(pc); if (!a || !a.enabled || !linkUp(a)) continue;
      const l = live(a, other); if (!l.ok || l.ip !== dst) continue;
      return l.gw === other.gateway ? reply(127) : { kind: 'timeout' };
    }
    return { kind: 'timeout' };
  }
  // the ISP gateway answers when the client's traffic really leaves through the router (filter + masquerade)
  const isp = dev.rt.isp;
  if (isp && dst === isp.gw) return clientInternet(dev, l3, src, dst, 'icmp').ok ? reply(63) : { kind: 'timeout' };
  return null;
};
ROS_HOOKS.lanProbe = (d, l3, ip) => {
  // a bound Fase 1 site LAN: its switch/APs and every PC that really sits on that segment
  for (const [e, o] of OWNER) {
    if (o.dev !== d || o.l3 !== l3 || !BOUND.has(e)) continue;
    if (e.hosts.some(h => h.ip === ip && !h.down && !h.ros)) return true;
    for (const a of ADAPTERS.values()) if (a.enabled && linkUp(a) && envOf(a.pc) === e && live(a, e).ip === ip) return true;
  }
  for (const [pc, p] of PLUGS) {
    if (p.dev !== d) continue; const s = rosSegment(pc); if (!s || s.l3 !== l3) continue;
    const a = ADAPTERS.get(pc); if (a && a.enabled && linkUp(a) && live(a, s.env).ip === ip) return true;
  }
  return false;
};
ROS_HOOKS.resolve = name => INTERNET[name.toLowerCase()]?.ip ?? null;
ROS_HOOKS.known = ip => PUBLIC_DNS.includes(ip) || Object.values(INTERNET).some(v => v.ip === ip);
ROS_HOOKS.leases = d => {
  const out: DynLease[] = [];
  for (const [e, o] of OWNER) {
    if (o.dev !== d) continue;
    const srv = dhcpFor(d, o.l3)?.server ?? '';
    for (const [mac, ip] of e.leases) { const a = [...ADAPTERS.values()].find(x => x.mac === mac); out.push({ address: ip, mac: mac.toUpperCase().replace(/-/g, ':'), host: a?.host ?? '', server: srv }); }
  }
  return out;
};

// ---------------------------------------------------------------- what the world UI (chunk B) calls
/** the RouterOS segment a client sits on: a PC plugged to a device port, or a PC on a bound Fase 1 site LAN (warnet, kos) */
export function rosClientSeg(pc: string): { dev: RosDevice; l3: string; env: Env } | null {
  const s = rosSegment(pc); if (s) return s;
  if (PLUGS.has(pc)) return null;
  const env = envOf(pc); const o = OWNER.get(env);
  if (!o || !BOUND.has(env)) return null;
  syncSiteEnv(env);
  return { dev: o.dev, l3: o.l3, env };
}
/** captive-portal login from a client PC; '' = logged in, else the login page's error text */
export function rosHotspotLogin(pc: string, user: string, password: string): string {
  const s = rosClientSeg(pc); if (!s) return 'tidak tersambung ke router';
  const a = adapterOf(pc); const l = live(a, s.env); if (!l.ok || l.apipa) return 'belum mendapat alamat IP';
  return hotspotLogin(s.dev, s.l3, l.ip, a.mac, user, password);
}
export function rosHotspotLogout(pc: string) { const s = rosClientSeg(pc); if (s) hotspotLogout(s.dev, live(adapterOf(pc), s.env).ip); }
/** does the client sit behind a hotspot it has not logged in to yet? (the browser shows the login page) */
export function rosNeedsLogin(pc: string): boolean {
  const s = rosClientSeg(pc); if (!s || !hotspotOn(s.dev, s.l3)) return false;
  const l = live(adapterOf(pc), s.env); if (!l.ok || l.apipa) return false;
  return !hsActive(s.dev, l.ip);
}
/** the hotspot a client is behind (login page header: server name, DNS name, router identity), or null */
export function rosHotspotInfo(pc: string): { server: string; dnsName: string; address: string; identity: string; user: string } | null {
  const s = rosClientSeg(pc); if (!s) return null; const hs = hotspotOn(s.dev, s.l3); if (!hs) return null;
  const prof = rows(s.dev, '/ip hotspot profile').find(r => r.p.name === hs.p.profile);
  const ip = live(adapterOf(pc), s.env).ip;
  return { server: hs.p.name, dnsName: prof?.p['dns-name'] ?? '', address: ifAddr(s.dev, s.l3)?.ip ?? '', identity: identity(s.dev), user: hsActive(s.dev, ip)?.user ?? '' };
}
/** effective internet throughput of a client (bps) with the simple queue / FastTrack explanation */
export function rosThroughput(pc: string): Thru | null {
  const s = rosClientSeg(pc); if (!s) return null;
  const l = live(adapterOf(pc), s.env); if (!l.ok || l.apipa) return { down: 0, up: 0, queue: '', bypassed: false, why: 'tidak ada alamat IP' };
  return throughput(s.dev, s.l3, l.ip);
}
