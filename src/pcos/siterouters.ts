// Fase 2 on the Fase 1 sites: the warnet router is a MikroTik RB951Ui-2HnD and the kos router a hAP lite (RB941-2nD).
// Both start from an empty configuration (no defconf) and get the "konfigurasi pelanggan" typed into the real RouterOS
// console at init, so print/export show what a technician would have entered. The site LAN keeps its Fase 1 segment
// (ENVS.warnet / ENVS.kos with the switch, the APs and the field-order faults); addressing, DHCP, DNS, NAT and the
// internet verdict come from the device (routeros/netsim.ts bindSiteEnv).
import { ENVS, SWITCHES, portLink, type Env } from './net';
import { createDevice, attachRouterOs, detachRouterOs, bindSiteEnv, syncSiteEnv, resetConfiguration, RosCli, DEFAULT_ISP, type ModelId, type RosDevice, type Isp } from './routeros';

export type RosSite = 'warnet' | 'kos';
interface Plan { model: ModelId; identity: string; bridge: string; lan: string[]; gw: string; prefix: number; net: string; start: string; end: string; leaseH: number; dns: string[]; links: () => string[]; isp: Isp }
/**
 * ⚠ design: the warnet buys a business line with a static public address (no DHCP on the ISP side), so its WAN is typed
 * by hand. Addresses are game values in the same private ISP range as DEFAULT_ISP; the research only says warnets buy
 * business/load-balanced lines [45][46]. A reset to the default configuration (DHCP client on ether1) therefore loses
 * the internet, which is what the "internet mati setelah reset" order is about.
 */
export const WARNET_ISP: Isp = { mode: 'static', net: '10.20.1.0', prefix: 24, gw: '10.20.1.1', addr: '10.20.1.10', dns: ['8.8.8.8', '8.8.4.4'], down: 50_000_000, up: 50_000_000 };
const sw = (n: string) => SWITCHES.find(s => s.name === n) ?? null;
/** the Fase 1 address plan, read once from net.ts before any device rewrites the segments */
const base = (e: Env) => ({ gw: e.gateway, prefix: e.prefix, net: e.net, start: e.dhcp!.start, end: e.dhcp!.end, leaseH: e.dhcp!.lease, dns: [...e.dnsSrv.upstream] });
const PLANS: Record<RosSite, Plan> = {
  // warnet: RB951Ui-2HnD in the wall rack; ether2 → SW-WARNET Gi1/0/16, ether3-5 spare (ether5 = PoE-out)
  warnet: {
    model: 'RB951Ui-2HnD', identity: 'WARNET-01', bridge: 'bridge-lan', lan: ['ether2', 'ether3', 'ether4', 'ether5'], ...base(ENVS.warnet),
    links: () => { const s = sw('SW-WARNET'); const p = s?.routerPort ? s.ports[s.routerPort - 1] : null; return p && !p.shutdown && p.peer ? ['ether2'] : []; },
    isp: WARNET_ISP,
  },
  // kos: hAP lite on the common-room shelf; ether2 → AP lantai 1, ether3 → AP lantai 2, ether4 spare (RTR-KOS LANn = ether n+1)
  kos: {
    model: 'RB941-2nD', identity: 'KOS-01', bridge: 'bridge-lan', lan: ['ether2', 'ether3', 'ether4'], ...base(ENVS.kos),
    links: () => { const s = sw('RTR-KOS'); return s ? s.ports.filter(p => portLink(s, p)).map(p => `ether${p.n + 1}`) : []; },
    isp: DEFAULT_ISP,
  },
};
/** the console lines of the customer configuration (what the technician who installed it typed) */
export function customerConfig(site: RosSite): string[] {
  const p = PLANS[site];
  return [
    `/system identity set name=${p.identity}`,
    `/interface bridge add name=${p.bridge} comment="LAN pelanggan"`,
    ...p.lan.map(i => `/interface bridge port add bridge=${p.bridge} interface=${i}`),
    `/ip address add address=${p.gw}/${p.prefix} interface=${p.bridge} comment="gateway LAN"`,
    ...(p.isp.mode === 'dhcp' ? ['/ip dhcp-client add interface=ether1 comment="WAN ISP"']
      : [`/ip address add address=${p.isp.addr}/${p.isp.prefix} interface=ether1 comment="WAN ISP (IP statis)"`, `/ip route add gateway=${p.isp.gw} comment="default ISP"`]),
    `/ip pool add name=pool-lan ranges=${p.start}-${p.end}`,
    `/ip dhcp-server add name=dhcp-lan interface=${p.bridge} address-pool=pool-lan lease-time=${p.leaseH % 24 === 0 ? `${p.leaseH / 24}d` : `${p.leaseH}h`}`,
    `/ip dhcp-server network add address=${p.net}/${p.prefix} gateway=${p.gw} dns-server=${p.gw}`,
    `/ip dns set servers=${(p.isp.mode === 'static' ? p.isp.dns : p.dns).join(',')} allow-remote-requests=yes`,
    '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="NAT internet pelanggan"',
  ];
}
const DEVS: Partial<Record<RosSite, RosDevice>> = {};
/** the RouterOS device of a site (after initSiteRouters) */
export const siteRouter = (site: RosSite) => DEVS[site] ?? null;
/** build both site routers from scratch, type the customer configuration and put them on their site LAN; call after initSwitches */
export function initSiteRouters() {
  for (const site of ['warnet', 'kos'] as const) {
    const old = DEVS[site]; if (old) detachRouterOs(old);
    const p = PLANS[site];
    const d = createDevice(p.model, { id: `${site}-rtr`, defconf: false });
    typeConfig(d, site);
    attachRouterOs(d, { isp: { ...p.isp } });
    bindSiteEnv(d, p.bridge, ENVS[site], p.links, 'ether2');
    DEVS[site] = d;
  }
}
function typeConfig(d: RosDevice, site: RosSite) {
  const cli = new RosCli(d);
  for (const line of customerConfig(site)) {
    const out = cli.run(line);
    if (out.trim()) throw new Error(`site router ${site}: "${line}" → ${out}`);
  }
}
/**
 * Put a site router back to the customer's configuration (a cancelled/failed order is finished by another technician,
 * a new order starts from the healthy site): empty config, the customer config typed again, files and hotspot sessions
 * gone, the ISP line back. Same device object, so the LAN binding and the Winbox neighbours stay.
 */
export function resetSiteRouter(site: RosSite) {
  const d = DEVS[site]; if (!d) return;
  resetConfiguration(d, true, true);
  d.files.clear();
  typeConfig(d, site);
  d.rt.isp = { ...PLANS[site].isp };
  d.rev++;
  syncSiteEnv(ENVS[site]);
}
/** pull the physical state (switch uplink, AP cables) into both routers now, e.g. before a console/Winbox shows them */
export function refreshSiteRouters() { for (const site of ['warnet', 'kos'] as const) syncSiteEnv(ENVS[site]); }
