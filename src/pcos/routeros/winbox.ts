// Winbox / WebFig reach (Fase 2 chunk B1b, pure, no DOM). Winbox's Neighbors tab lists the RouterOS devices that
// answer MNDP on the PC's own layer-2 segment, so it works by MAC even when the PC has no IP address yet; a connect by
// IP needs the router's address to answer from the PC (input chain). Login is the device's /user table (rosLogin).
// ⚠ simplified: one neighbor row per device (the interface the PC sits behind), no MNDP timers or
// /ip neighbor discovery-settings, no TCP 8291 service toggle (the IP connect is a ping to the router's own address).
import { adapterOf, envOf, linkUp, live, ping } from '../net';
import { ROS_VERSION, identity, ifMac, type RosDevice } from './model';
import { ifAddr, addresses } from './engine';
import { rosLogin, type RosCli } from './cli';
import { rosClientSeg, routerOsDevices } from './netsim';

export interface Neighbor { dev: RosDevice; iface: string; mac: string; ip: string; identity: string; board: string; version: string; uptime: string }

const normMac = (m: string) => m.trim().toUpperCase().replace(/-/g, ':');
const macOf = (dev: RosDevice, name: string) => normMac(ifMac(dev, name));

/** RouterOS devices visible in Winbox › Neighbors from this PC (same L2 segment, link up) */
export function rosNeighbors(pc: string): Neighbor[] {
  const a = adapterOf(pc);
  if (!a.enabled || !linkUp(a)) return [];
  const s = rosClientSeg(pc); if (!s) return [];
  if (envOf(pc) !== s.env) return [];
  const { dev, l3 } = s;
  return [{ dev, iface: l3, mac: macOf(dev, l3), ip: ifAddr(dev, l3)?.ip ?? '', identity: identity(dev), board: dev.model.id, version: ROS_VERSION, uptime: '' }];
}

export interface WinboxResult { cli: RosCli | null; err: string; dev: RosDevice | null; via: 'mac' | 'ip' | '' }
/** Winbox "Connect": target is a MAC (from Neighbors, L2) or an IP address of a RouterOS device reachable from the PC */
export function winboxConnect(pc: string, target: string, user: string, password: string): WinboxResult {
  const t = target.trim(); const fail = (err: string): WinboxResult => ({ cli: null, err, dev: null, via: '' });
  if (!t) return fail('Isi "Connect To" dengan MAC atau IP router (pilih dari tab Neighbors).');
  let dev: RosDevice | null = null; let via: 'mac' | 'ip' = 'ip';
  if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(t)) {
    via = 'mac';
    dev = rosNeighbors(pc).find(n => n.mac === normMac(t))?.dev ?? null;
    if (!dev) return fail(`Could not connect to ${normMac(t)} - router tidak ditemukan di segmen ini`);
  } else {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return fail(`Could not connect to ${t} - alamat tidak valid`);
    const a = adapterOf(pc); const l = live(a);
    if (!l.ok) return fail(`Could not connect to ${t} - PC belum punya alamat IP (coba connect lewat MAC)`);
    dev = routerOsDevices().find(d => addresses(d).some(x => x.ip === t)) ?? null;
    if (!dev || ping(a, envOf(pc), t, true).kind !== 'reply') return fail(`Could not connect to ${t} - timed out`);
  }
  const cli = rosLogin(dev, user.trim(), password);
  if (!cli) return { cli: null, err: 'ERROR: wrong username or password', dev, via };
  return { cli, err: '', dev, via };
}

/** the RouterOS device answering at an IP from this PC's segment (the browser shows WebFig instead of the old page) */
export function rosAtIp(pc: string, ip: string): RosDevice | null {
  const env = envOf(pc);
  const h = env.hosts.find(x => x.ip === ip && x.ros);
  if (h) return routerOsDevices().find(d => d.id === h.ros) ?? null;
  const s = rosClientSeg(pc);
  if (s && addresses(s.dev).some(x => x.ip === ip)) return s.dev;
  return null;
}
