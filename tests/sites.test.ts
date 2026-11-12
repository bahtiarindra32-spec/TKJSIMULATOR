// Fase 1 customer sites (house, kos, warnet): every device the player can walk up to is reachable when the site is healthy,
// the sites are isolated from the hotel and from each other, and the physical path (ports, APs) really matters.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, envOf, adapterOf, healthy, ping, live, ADAPTERS, SWITCHES, ENVS, outletOf, portOf, resolve } from '../src/pcos/net';
import { CLIENTS, servingAp } from '../src/pcos/wifi';
import { initSiteClients, readout } from '../src/pcos/sites';
import { SITE_PCS, SITE_TV, SITES, KOS, kosFeet, FLOOR_Y } from '../src/data/sites';
import { LABPC } from '../src/game/noc/contracts';
import { siteRouter, refreshSiteRouters } from '../src/pcos/siterouters';
import { RosCli, identity, wanStatus, rosOwner } from '../src/pcos/routeros';

const HOTEL = ['PROP_L1_PC_01', 'PROP_L2_PC_01', 'PROP_L2_PC_02'];
const ALL = [...HOTEL, ...SITE_PCS.map(p => p.name)];
const fresh = () => {
  ADAPTERS.clear(); CLIENTS.clear(); initSwitches(ALL); initSiteClients();
  for (const e of [ENVS.rumah, ENVS.kos, ENVS.warnet]) e.leases.clear();
};
const sitePcs = (site: string) => SITE_PCS.filter(p => p.site === site).map(p => p.name);

describe('Fase 1 sites: healthy by default', () => {
  beforeEach(fresh);
  it('every site laptop/PC and the TV lands in its own segment and is fully healthy', () => {
    for (const p of SITE_PCS) { expect(envOf(p.name).id, p.name).toBe(p.site); expect(healthy(adapterOf(p.name)), p.name).toBe(true); }
    expect(envOf(SITE_TV.name).id).toBe('rumah'); expect(healthy(adapterOf(SITE_TV.name))).toBe(true);
  });
  it('DHCP addresses come from each site subnet', () => {
    expect(live(adapterOf('PROP_RUMAH_01_LAPTOP_01')).ip).toMatch(/^192\.168\.1\.1\d\d$/);
    expect(live(adapterOf('PROP_KOS_01_LAPTOP_K4')).ip).toMatch(/^192\.168\.0\.1\d\d$/);
    expect(live(adapterOf('PROP_WARNET_01_KASIR_PC')).ip).toMatch(/^192\.168\.100\.1\d\d$/);
  });
  it('each site device the player can walk up to answers ping from a client of that site', () => {
    const lap = adapterOf('PROP_RUMAH_01_LAPTOP_01');
    for (const ip of ['192.168.1.1', '192.168.1.2']) expect(ping(lap, envOf(lap.pc), ip, true).kind, ip).toBe('reply');
    const k = adapterOf('PROP_KOS_01_LAPTOP_K1');
    for (const ip of ['192.168.0.1', '192.168.0.2', '192.168.0.3']) expect(ping(k, envOf(k.pc), ip, true).kind, ip).toBe('reply');
    const w = adapterOf('PROP_WARNET_01_PC_03');
    for (const ip of ['192.168.100.1', '192.168.100.2']) expect(ping(w, envOf(w.pc), ip, true).kind, ip).toBe('reply');
    // a warnet PC reaches the cashier PC on the same LAN
    const kasirIp = live(adapterOf('PROP_WARNET_01_KASIR_PC')).ip;
    expect(ping(w, envOf(w.pc), kasirIp, true).kind).toBe('reply');
    const r = resolve(w, envOf(w.pc), 'cari.id'); expect(r && typeof r === 'object' && r.via).toBe('192.168.100.1');
  });
  it('kos laptops associate with the AP of their own floor', () => {
    expect(servingAp('PROP_KOS_01_LAPTOP_K1')?.id).toBe('AP-KOS-LT1');
    expect(servingAp('PROP_KOS_01_LAPTOP_K5')?.id).toBe('AP-KOS-LT2');
    expect(servingAp('PROP_RUMAH_01_LAPTOP_01')?.id).toBe('AP-RUMAH-RTR');
  });
  it('warnet outlets are labelled WRN-nn and the cashier sits on outlet 9', () => {
    expect(outletOf('PROP_WARNET_01_PC_01')).toBe('WRN-01');
    expect(outletOf('PROP_WARNET_01_KASIR_PC')).toBe('WRN-09');
    expect(portOf('PROP_WARNET_01_KASIR_PC')!.port.n).toBe(9);
  });
  it('device read-outs come from the live state', () => {
    expect(readout('ONT').rows.find(r => r[0] === 'LAN1')![1]).toMatch(/^hijau/);
    expect(readout('TV').rows.find(r => r[0] === 'Internet')![1]).toBe('tersambung');
    expect(readout('KOS_ROUTER').rows.find(r => r[0] === 'ether3')![1]).toMatch(/^link/);
  });
});

describe('Fase 1 sites: isolation and physical path', () => {
  beforeEach(fresh);
  it('the hotel cannot reach site devices and sites cannot reach each other or the hotel', () => {
    const hotel = adapterOf('PROP_L2_PC_01');
    expect(healthy(hotel)).toBe(true);
    expect(ping(hotel, envOf(hotel.pc), '192.168.1.1', true).kind).not.toBe('reply');
    expect(ping(hotel, envOf(hotel.pc), '192.168.100.1', true).kind).not.toBe('reply');
    const w = adapterOf('PROP_WARNET_01_PC_01');
    expect(ping(w, envOf(w.pc), '192.168.0.1', true).kind).not.toBe('reply');
    expect(ping(w, envOf(w.pc), '192.168.20.1', true).kind).not.toBe('reply');
  });
  it('shutting the warnet switch port to the router cuts every warnet PC off', () => {
    const sw = SWITCHES.find(s => s.name === 'SW-WARNET')!;
    sw.ports[15].shutdown = true;
    for (const pc of sitePcs('warnet')) expect(envOf(pc).id, pc).toBe('none');
    sw.ports[15].shutdown = false;
    for (const pc of sitePcs('warnet')) expect(envOf(pc).id, pc).toBe('warnet');
  });
  it('a shut access port cuts only that booth', () => {
    portOf('PROP_WARNET_01_PC_02')!.port.shutdown = true;
    expect(healthy(adapterOf('PROP_WARNET_01_PC_02'))).toBe(false);
    expect(healthy(adapterOf('PROP_WARNET_01_PC_01'))).toBe(true);
  });
  it('unplugging the AP of the upper floor leaves upper-floor tenants without a usable link', () => {
    const r = SWITCHES.find(s => s.name === 'RTR-KOS')!; r.ports[1].shutdown = true;
    expect(servingAp('PROP_KOS_01_LAPTOP_K4')?.id ?? null).not.toBe('AP-KOS-LT2');
    expect(healthy(adapterOf('PROP_KOS_01_LAPTOP_K1'))).toBe(true);
  });
  it('site PCs are never internship job targets', () => { for (const p of SITE_PCS) expect(LABPC.test(p.name), p.name).toBe(true); for (const p of HOTEL) expect(LABPC.test(p)).toBe(false); });
});

describe('Fase 1 sites: layout data', () => {
  it('the four buildings are at least 150 m apart', () => {
    const c = SITES.map(s => [(s.rect.x0 + s.rect.x1) / 2, (s.rect.z0 + s.rect.z1) / 2]);
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) expect(Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]), `${SITES[i].id}-${SITES[j].id}`).toBeGreaterThanOrEqual(150);
  });
  it('kos stair climbs from the ground floor to the upper floor', () => {
    const s = KOS.stair, z = (s.z0 + s.z1) / 2;
    expect(kosFeet(s.x0 + 0.01, z, FLOOR_Y)).toBeCloseTo(FLOOR_Y, 1);
    expect(kosFeet(s.x1 - 0.01, z, 3)).toBeCloseTo(KOS.upper, 1);
    expect(kosFeet(134, 306, KOS.upper)).toBe(KOS.upper);
    expect(kosFeet(134, 306, FLOOR_Y)).toBe(FLOOR_Y);
  });
});

describe('Fase 2: warnet and kos routers are MikroTik RouterOS', () => {
  beforeEach(fresh);
  it('the warnet router is an RB951Ui-2HnD and the kos router a hAP lite, each running its site LAN', () => {
    const w = siteRouter('warnet')!, k = siteRouter('kos')!;
    expect(w.model.id).toBe('RB951Ui-2HnD'); expect(k.model.id).toBe('RB941-2nD');
    expect(identity(w)).toMatch(/^WARNET-/); expect(identity(k)).toMatch(/^KOS-/);
    expect(rosOwner(ENVS.warnet)).toBe(w); expect(rosOwner(ENVS.kos)).toBe(k);
    expect(wanStatus(w).ok).toBe(true); expect(wanStatus(k).ok).toBe(true);
  });
  it('clients get their DHCP lease from the RouterOS server and reach the internet', () => {
    for (const pc of ['PROP_WARNET_01_PC_01', 'PROP_WARNET_01_KASIR_PC', 'PROP_KOS_01_LAPTOP_K1', 'PROP_KOS_01_LAPTOP_K5']) {
      const a = adapterOf(pc), l = live(a);
      expect(l.ok, pc).toBe(true);
      expect(a.lease!.server, pc).toBe(envOf(pc).gateway);
      expect(ping(a, envOf(pc), '8.8.8.8', true).kind, pc).toBe('reply');
      expect(healthy(a), pc).toBe(true);
    }
    // the router's lease table shows the clients
    const out = new RosCli(siteRouter('warnet')!).run('/ip dhcp-server lease print');
    expect(out).toContain(live(adapterOf('PROP_WARNET_01_PC_01')).ip);
  });
  it('/ip address print on each router shows the site gateway', () => {
    expect(new RosCli(siteRouter('warnet')!).run('/ip address print')).toMatch(/192\.168\.100\.1\/24\s+192\.168\.100\.0\s+bridge-lan/);
    expect(new RosCli(siteRouter('kos')!).run('/ip address print')).toMatch(/192\.168\.0\.1\/24\s+192\.168\.0\.0\s+bridge-lan/);
    expect(new RosCli(siteRouter('kos')!).run('/ip dhcp-server print')).toMatch(/dhcp-lan\s+bridge-lan\s+pool-lan/);
  });
  it('disabling the NAT masquerade rule breaks the internet of that site only', () => {
    const c = new RosCli(siteRouter('warnet')!);
    expect(c.run('/ip firewall nat disable [find action=masquerade]')).toBe('');
    const w = adapterOf('PROP_WARNET_01_PC_02');
    expect(ping(w, envOf(w.pc), '8.8.8.8', true).kind).toBe('timeout');
    expect(healthy(w)).toBe(false);
    expect(ping(w, envOf(w.pc), '192.168.100.1', true).kind).toBe('reply');   // the LAN still works
    expect(healthy(adapterOf('PROP_KOS_01_LAPTOP_K1'))).toBe(true);
    c.run('/ip firewall nat enable [find action=masquerade]');
    expect(healthy(w)).toBe(true);
  });
  it('the router sees its LAN: ether2 runs while the switch uplink is up and it pings a booth PC', () => {
    const c = new RosCli(siteRouter('warnet')!);
    const ip = live(adapterOf('PROP_WARNET_01_PC_04')).ip;
    expect(c.run(`/ping ${ip} count=1`)).toMatch(/received=1/);
    expect(c.run('/interface print')).toMatch(/ RS\s+ether2 /);
    expect(c.run('/interface print')).toMatch(/ S\s+ether3 /);
    SWITCHES.find(s => s.name === 'SW-WARNET')!.ports[15].shutdown = true;
    refreshSiteRouters();
    expect(c.run('/interface print')).toMatch(/ S\s+ether2 /);
  });
});
