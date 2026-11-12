// Field orders on the real network simulation: inject the fault of an accepted order into net.ts / wifi.ts, list the
// customer devices it must be tested from, check the root cause, and re-create a fault for a garansi callback.
// Only faults the simulation really models are used (DESIGN.md › Fase 1 lists what was skipped and why).
// No DOM here, so tests/field.test.ts drives every template through inject → fix → healthy.
import { SWITCHES, ENVS, adapterOf, healthy, live, patchCord, bounce, releaseLease, repatch, parseIp, ipStr, type Switch, type Port, type PanelPort, type DhcpCfg, type EnvId } from '../../pcos/net';
import { SITE_APS, quality, type Ap, type WifiSec, type TxPower } from '../../pcos/wifi';
import { SITE_PCS, SITE_TV, SITE_WIFI_KEY } from '../../data/sites';
import { judge, type Cable } from '../crimp';
import { resetSiteRouter } from '../../pcos/siterouters';
import { initFtthSite } from '../../pcos/ftthsite';
import { injectRos, rosProblem, isRosTpl, type RosJob } from './simros';
import { injectFtth, ftthProblem, isFtthTpl, type FtthJob } from './simftth';
import type { Cust, FieldTplId } from './types';

export const sw = (n: string): Switch => SWITCHES.find(s => s.name === n)!;
export const ap = (id: string): Ap => SITE_APS.find(a => a.id === id)!;
export const LAPTOP_RUMAH = 'PROP_RUMAH_01_LAPTOP_01';
export const TV = SITE_TV.name;
export const kosLaptop = (k: number) => `PROP_KOS_01_LAPTOP_K${k}`;
export const warnetPc = (n: number) => `PROP_WARNET_01_PC_${String(n).padStart(2, '0')}`;
/** every customer device of a site (the TV counts for the house) */
export const siteDevices = (c: Cust) => [...SITE_PCS.filter(p => p.site === c).map(p => p.name), ...(c === 'rumah' ? [TV] : [])];
export const deviceLabel = (n: string) => (n === TV ? 'Smart TV ruang tamu' : (SITE_PCS.find(p => p.name === n)?.label ?? n));
export const ok = (n: string) => healthy(adapterOf(n));

export interface Target {
  pc: string;
  label: string;
  /** the customer device the job must be tested from; secondary devices only have to be healthy */
  primary: boolean;
}
export interface Injected {
  tpl: FieldTplId;
  variant: string;
  /** what was really wrong (berita acara / nota, and the QA log) */
  detail: string;
  targets: Target[];
  /** where the fault sits (port, pc, AP) — also what a garansi callback needs to re-create it */
  data: Record<string, string | number>;
  /** Fase 2 MikroTik order: graded from the site router's configuration state */
  ros?: RosJob;
  /** Fase 3 FTTH order: graded from the house fibre state (simftth.ts) */
  ftth?: FtthJob;
  /** per-order values for the order letter (vouchers, limits, ISP data) */
  lines?: string[];
}
const T = (pc: string, primary: boolean): Target => ({ pc, label: deviceLabel(pc), primary });
const pickOf = <X>(a: X[], r: () => number) => a[Math.floor(r() * a.length)];

/** factory state of the replacement router (sticker on the box) */
export const NEW_ROUTER = { ssid: 'NusaLink_N300_5A1C', key: '84213570', ch: 11 };
/** port cables the player re-made/replaced on site devices ('ONT-RUMAH:1', 'RTR-KOS:2'); null = still the old cable */
export type PortKey = 'ONT-RUMAH:1' | 'RTR-KOS:1' | 'RTR-KOS:2';
export const portParts = (k: string) => {
  const [s, n] = k.split(':');
  return { sw: sw(s), n: +n };
};

// ---------------------------------------------------------------- inject
/**
 * Break the site for this template (or re-create the fault of a garansi `redo`). Returns null when the fault would not
 * really hurt a customer device right now (the order is then not offered/accepted).
 */
export function inject(tpl: FieldTplId, r: () => number, redo?: Record<string, string | number>): Injected | null {
  const R = (variant: string, detail: string, targets: Target[], data: Record<string, string | number>): Injected => ({ tpl, variant, detail, targets, data });
  if (isRosTpl(tpl)) {
    const x = injectRos(tpl, r);
    return x && { tpl, variant: x.variant, detail: x.detail, targets: x.targets.map(t => T(t.pc, t.primary)), data: x.data, ros: x.ros, lines: x.lines };
  }
  if (isFtthTpl(tpl)) {
    const x = injectFtth(tpl, r, redo);
    // the family laptop is where the internet is tested; the TV only has to come back too
    return x && { tpl, variant: x.variant, detail: x.detail, targets: [T(LAPTOP_RUMAH, true), T(TV, false)], data: x.data, ftth: x.ftth, lines: x.lines };
  }
  if (tpl === 'r_router') {
    const a = ap('AP-RUMAH-RTR');
    a.mounted = false;
    return R('mati', 'Router Wi-Fi keluarga mati total (tidak ada daya) → diganti router baru mode AP, SSID dan sandi lama, WPA2-PSK', [T(LAPTOP_RUMAH, true), T(TV, true)], { ap: a.id });
  }
  if (tpl === 'r_tv') {
    const env = ENVS.rumah, d = env.dhcp!;
    live(adapterOf(LAPTOP_RUMAH));                    // the laptop already holds a lease from before the change
    const net = (parseIp(env.gateway)! & 0xffffff00) >>> 0, host = (n: number) => ipStr((net + n) >>> 0);
    const v = (redo?.variant as string) ?? pickOf(['penuh', 'terbalik'], r);
    let detail: string;
    if (v === 'penuh') {
      env.dhcp = { ...d, start: host(100), end: host(104) } as DhcpCfg;
      let k = 0;
      for (let n = 100; n <= 104; n++) if (![...env.leases.values()].includes(host(n))) env.leases.set(`ee-${String(k++).padStart(4, '0')}-hp-tamu`, host(n));
      detail = `Pool DHCP ONT diubah jadi ${host(100)}–${host(104)} (5 alamat) dan semuanya terpakai → pool dikembalikan lebar (mis. ${host(100)}–${host(199)})`;
    } else {
      env.dhcp = { ...d, start: host(200), end: host(120) } as DhcpCfg;
      detail = `Pool DHCP ONT terbalik (awal ${host(200)} > akhir ${host(120)}), DHCP tidak membagi alamat → awal/akhir pool dibetulkan`;
    }
    const tv = adapterOf(TV);
    releaseLease(tv);
    bounce(tv);
    if (ok(TV)) return null;
    return R(v, detail, [T(TV, true), T(LAPTOP_RUMAH, false)], { variant: v });
  }
  const where = redo?.where ?? (tpl === 'r_kabel' ? 'ONT-RUMAH:1' : tpl === 'k_ap2' ? 'RTR-KOS:2' : '');
  if (where === 'ONT-RUMAH:1') {
    patchCord(sw('ONT-RUMAH'), 1, null);
    return R('patah', 'Konektor RJ45 kabel ONT LAN1 → router Wi-Fi patah → kabel diganti (crimp baru / patch cord)', [T(LAPTOP_RUMAH, true), T(TV, false)], { where: 'ONT-RUMAH:1', broken: 1 });
  }
  if (where === 'RTR-KOS:2') {
    const v = redo ? 'patah' : pickOf(['lepas', 'patah'], r);
    patchCord(sw('RTR-KOS'), 2, null);
    // upper-floor tenants: the ones that really lost Wi-Fi (the nearer room may still limp along on the ground-floor AP)
    const up = [kosLaptop(4), kosLaptop(5)];
    const hit = up.filter(n => !ok(n));
    if (!hit.length) return null;
    const k = redo?.pc && hit.includes(String(redo.pc)) ? String(redo.pc) : pickOf(hit, r);
    const other = up.find(x => x !== k)!;
    const detail = v === 'lepas' ? 'Kabel AP lantai 2 tercabut dari LAN2 router kos → dicolok lagi sampai terkunci' : 'Konektor kabel LAN2 router → AP lantai 2 patah → kabel diganti (crimp baru / patch cord)';
    return R(v, detail, [T(k, true), T(other, hit.includes(other))], { where: 'RTR-KOS:2', pc: k, broken: v === 'patah' ? 1 : 0 });
  }
  if (tpl === 'k_kanal') {
    const a1 = ap('AP-KOS-LT1'), a2 = ap('AP-KOS-LT2');
    const keep = { c1: a1.ch, c2: a2.ch };
    const lap = [1, 2, 4, 5].map(kosLaptop);
    const opts = [
      { apply: () => (a2.ch = keep.c1), what: `AP lantai 2 dipindah ke kanal ${keep.c1}, sama dengan AP lantai 1` },
      { apply: () => (a1.ch = keep.c2), what: `AP lantai 1 dipindah ke kanal ${keep.c2}, sama dengan AP lantai 2` },
      { apply: () => (a2.ch = Math.min(13, keep.c1 + 2)), what: `AP lantai 2 di kanal ${Math.min(13, keep.c1 + 2)}, tumpang tindih dengan kanal ${keep.c1} AP lantai 1` },
    ];
    const good = opts
      .map(o => {
        o.apply();
        const hit = lap.filter(n => !quality(n)?.ok);
        a1.ch = keep.c1;
        a2.ch = keep.c2;
        return { o, hit };
      })
      .filter(x => x.hit.length);
    if (!good.length) return null;
    const g = pickOf(good, r);
    g.o.apply();
    const k = pickOf(g.hit, r);
    return R('kanal', `${g.o.what} → kanal diatur ulang ke kanal yang tidak tumpang tindih (1/6/11)`, [T(k, true), ...lap.filter(n => n !== k).map(n => T(n, false))], { pc: k });
  }
  if (tpl === 'w_port') {
    const s = sw('SW-WARNET');
    const pc = redo?.pc ? String(redo.pc) : warnetPc(1 + Math.floor(r() * 8));
    const p = s.ports.find(x => x.pc === pc)!;
    const v = (redo?.variant as string) ?? pickOf(['shut', 'vlan'], r);
    s.dirty = false;
    let detail: string;
    if (v === 'shut') {
      p.shutdown = true;
      detail = `Port Gi1/0/${p.n} (${p.desc}) di SW-WARNET di-shutdown → no shutdown, write memory`;
    } else {
      const vl = redo?.vlan ? +redo.vlan : pickOf([99, 50], r);
      if (vl === 50) s.vlans.set(50, 'CCTV');
      p.vlan = vl;
      detail = `Port Gi1/0/${p.n} (${p.desc}) masuk VLAN ${vl}, LAN warnet di VLAN 1 → switchport access vlan 1, write memory`;
    }
    if (ok(pc)) return null;
    return R(v, detail, [T(pc, true)], { pc, variant: v, port: p.n, vlan: p.vlan });
  }
  if (tpl === 'w_kabel') {
    const pc = redo?.pc ? String(redo.pc) : warnetPc(1 + Math.floor(r() * 8));
    const a = adapterOf(pc);
    a.broken = true;
    a.cable = true;
    bounce(a);
    return R('putus', 'Patch cord outlet → PC rusak (pasangan kabel putus, terinjak kursi) → diganti kabel baru, dites LAN tester', [T(pc, true)], { pc, where: pc });
  }
  // w_loop
  const s = sw('SW-WARNET');
  const free = s.ports.filter(x => !x.pc && !x.peer && !s.panel.some(q => q.patch === x.n));
  if (free.length < 2) return null;
  const k = Math.floor(r() * (free.length - 1));
  const [x1, x2] = [free[k], free[k + 1]];
  for (const x of [x1, x2]) {
    x.shutdown = false;
    x.vlan = 1;
  }
  s.loop = [x1.n, x2.n];
  s.stpOff = true;
  s.dirty = false;
  const booths = Array.from({ length: 8 }, (_, i) => warnetPc(i + 1));
  const first = pickOf(booths, r);
  if (ok(first)) return null;
  return R('loop', `Kabel patch menyambung Gi1/0/${x1.n} ke Gi1/0/${x2.n} di SW-WARNET dan spanning-tree dimatikan (badai broadcast) → kabel loop dicabut, spanning-tree aktif, write memory`, [T(first, true), ...[...booths.filter(b => b !== first), 'PROP_WARNET_01_KASIR_PC'].map(b => T(b, false))], { loop: `${x1.n}-${x2.n}` });
}

// ---------------------------------------------------------------- checks
/** root cause still present beyond device health ('' = fixed) */
export function rootProblem(i: Injected): string {
  if (i.ros) return rosProblem(i.ros, i.targets.find(t => t.primary)?.pc);
  if (i.ftth) return ftthProblem(i.ftth);
  if (i.tpl === 'r_router') {
    const a = ap('AP-RUMAH-RTR');
    if (!a.mounted) return 'router Wi-Fi belum diganti';
    if (a.ssid !== 'HENDRA_HOME') return `SSID masih ${a.ssid}, pelanggan minta HENDRA_HOME`;
    if (a.sec !== 'WPA2-PSK') return `keamanan Wi-Fi ${a.sec}, pelanggan minta WPA2-PSK`;
    if (a.key !== SITE_WIFI_KEY.rumah) return 'sandi Wi-Fi belum sama dengan sandi lama';
  }
  if (i.tpl === 'w_loop') {
    const s = sw('SW-WARNET');
    if (s.loop) return 'kabel loop masih terpasang di switch';
    if (s.stpOff) return 'spanning-tree SW-WARNET belum diaktifkan lagi';
  }
  return '';
}
/** a crimped cable that works but is not T568B on both ends, or was never tested, is a weak check (garansi) */
export function cableWeak(c: Cable | null): boolean {
  if (!c) return false;
  const j = judge(c);
  return !j.standard || !c.tested;
}

// ---------------------------------------------------------------- baseline snapshot / restore
interface SwSnap { name: string; ports: Port[]; panel: PanelPort[]; vlans: [number, string][]; loop: [number, number] | null; stpOff: boolean; dirty: boolean }
interface ApSnap { id: string; mounted: boolean; ch: number; power: TxPower; radio: boolean; ssid: string; key?: string; sec?: WifiSec }
interface EnvSnap { id: EnvId; dhcp: DhcpCfg | null; leases: [string, string][]; gateway: string; prefix: number; net: string; dns: string[]; routerIp: string; dnsAllow: boolean; upstream: string[] }
interface AdSnap { pc: string; dhcp: boolean; ip: string; mask: string; gw: string; dns1: string; dns2: string; dnsAuto: boolean; cable: boolean; broken: boolean; enabled: boolean }
export interface SiteSnap { sws: SwSnap[]; aps: ApSnap[]; envs: EnvSnap[]; ads: AdSnap[] }
const SITE_SW: Record<Cust, string> = { rumah: 'ONT-RUMAH', kos: 'RTR-KOS', warnet: 'SW-WARNET' };

/** the healthy state of all three sites (taken once after the network is built) */
export function snapshotSites(): SiteSnap {
  return {
    sws: Object.values(SITE_SW).map(n => {
      const s = sw(n);
      return { name: n, ports: s.ports.map(p => ({ ...p })), panel: s.panel.map(p => ({ ...p })), vlans: [...s.vlans.entries()], loop: s.loop ? [...s.loop] as [number, number] : null, stpOff: !!s.stpOff, dirty: s.dirty };
    }),
    aps: SITE_APS.map(a => ({ id: a.id, mounted: a.mounted, ch: a.ch, power: a.power, radio: a.radio, ssid: a.ssid, key: a.key, sec: a.sec })),
    envs: (['rumah', 'kos', 'warnet'] as const).map(id => {
      const e = ENVS[id];
      return { id, dhcp: e.dhcp ? { ...e.dhcp, dns: [...e.dhcp.dns] } : null, leases: [...e.leases.entries()], gateway: e.gateway, prefix: e.prefix, net: e.net, dns: [...e.dns], routerIp: e.hosts[0].ip, dnsAllow: e.dnsSrv.allow, upstream: [...e.dnsSrv.upstream] };
    }),
    ads: [...SITE_PCS.map(p => p.name), TV].map(pc => {
      const a = adapterOf(pc);
      return { pc, dhcp: a.dhcp, ip: a.ip, mask: a.mask, gw: a.gw, dns1: a.dns1, dns2: a.dns2, dnsAuto: a.dnsAuto, cable: a.cable, broken: a.broken, enabled: a.enabled };
    }),
  };
}
/** put one site (or all) back to the snapshot: a failed/cancelled order is finished by another technician */
export function restoreSites(snap: SiteSnap, only?: Cust) {
  const custOfName = (n: string): Cust => (n.includes('RUMAH') ? 'rumah' : n.includes('KOS') ? 'kos' : 'warnet');
  for (const x of snap.sws) {
    if (only && SITE_SW[only] !== x.name) continue;
    const s = sw(x.name);
    x.ports.forEach((p, i) => Object.assign(s.ports[i], { ...p }));
    x.panel.forEach((p, i) => Object.assign(s.panel[i], { ...p }));
    s.vlans = new Map(x.vlans);
    s.loop = x.loop ? [...x.loop] as [number, number] : null;
    s.stpOff = x.stpOff;
    s.dirty = x.dirty;
    repatch(s);
  }
  for (const x of snap.aps) {
    const a = ap(x.id);
    if (only && a.site !== only) continue;
    Object.assign(a, { mounted: x.mounted, ch: x.ch, power: x.power, radio: x.radio, ssid: x.ssid, key: x.key, sec: x.sec });
  }
  for (const x of snap.envs) {
    if (only && x.id !== only) continue;
    const e = ENVS[x.id];
    e.dhcp = x.dhcp ? { ...x.dhcp, dns: [...x.dhcp.dns] } : null;
    e.leases = new Map(x.leases);
    Object.assign(e, { gateway: x.gateway, prefix: x.prefix, net: x.net, dns: [...x.dns] });
    e.hosts[0].ip = x.routerIp;
    e.dnsSrv.allow = x.dnsAllow;
    e.dnsSrv.upstream = [...x.upstream];
  }
  // the MikroTik site routers go back to the customer configuration (before the clients re-lease)
  for (const site of ['kos', 'warnet'] as const) if (!only || only === site) resetSiteRouter(site);
  // the house fibre (Fase 3) goes back to a healthy line too
  if (!only || only === 'rumah') initFtthSite();
  for (const x of snap.ads) {
    if (only && custOfName(x.pc) !== only) continue;
    const a = adapterOf(x.pc);
    Object.assign(a, { dhcp: x.dhcp, ip: x.ip, mask: x.mask, gw: x.gw, dns1: x.dns1, dns2: x.dns2, dnsAuto: x.dnsAuto, cable: x.cable, broken: x.broken, enabled: x.enabled });
    bounce(a);
  }
}
