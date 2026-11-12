// Fase 2 chunk B1b: Winbox neighbor discovery + connect, WebFig lookup and the hotspot on a bound site LAN (kos).
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, adapterOf, envOf, live, ping, ADAPTERS, SWITCHES, ENVS } from '../src/pcos/net';
import { CLIENTS } from '../src/pcos/wifi';
import { initSiteClients } from '../src/pcos/sites';
import { SITE_PCS } from '../src/data/sites';
import { siteRouter, refreshSiteRouters } from '../src/pcos/siterouters';
import { RosCli, rosNeighbors, winboxConnect, rosAtIp, rosNeedsLogin, rosHotspotLogin, rosHotspotInfo, identity } from '../src/pcos/routeros';

const HOTEL = ['PROP_L1_PC_01', 'PROP_L2_PC_01'];
const ALL = [...HOTEL, ...SITE_PCS.map(p => p.name)];
const KASIR = 'PROP_WARNET_01_KASIR_PC', K1 = 'PROP_KOS_01_LAPTOP_K1', K4 = 'PROP_KOS_01_LAPTOP_K4';
const fresh = () => {
  ADAPTERS.clear(); CLIENTS.clear(); initSwitches(ALL); initSiteClients();
  for (const e of [ENVS.rumah, ENVS.kos, ENVS.warnet]) e.leases.clear();
};

describe('Winbox neighbors', () => {
  beforeEach(fresh);
  it('a warnet PC sees WARNET-01 with the bridge MAC, LAN IP, board and version', () => {
    const n = rosNeighbors(KASIR);
    expect(n).toHaveLength(1);
    expect(n[0].identity).toBe('WARNET-01'); expect(n[0].ip).toBe('192.168.100.1'); expect(n[0].board).toBe('RB951Ui-2HnD');
    expect(n[0].mac).toMatch(/^6C:3B:6B(:[0-9A-F]{2}){3}$/); expect(n[0].version).toMatch(/^7\./);
    expect(n[0].dev).toBe(siteRouter('warnet'));
  });
  it('a kos laptop sees KOS-01 (hAP lite); hotel and house PCs see no RouterOS device', () => {
    expect(rosNeighbors(K4).map(n => [n.identity, n.ip, n.board])).toEqual([['KOS-01', '192.168.0.1', 'RB941-2nD']]);
    expect(rosNeighbors('PROP_L1_PC_01')).toEqual([]);
    expect(rosNeighbors('PROP_RUMAH_01_LAPTOP_01')).toEqual([]);
  });
  it('no neighbors when the switch port to the router is shut, the adapter disabled or the cable broken', () => {
    const sw = SWITCHES.find(s => s.name === 'SW-WARNET')!;
    sw.ports[15].shutdown = true; refreshSiteRouters();
    expect(rosNeighbors(KASIR)).toEqual([]);
    sw.ports[15].shutdown = false; refreshSiteRouters();
    expect(rosNeighbors(KASIR)).toHaveLength(1);
    adapterOf(KASIR).enabled = false; expect(rosNeighbors(KASIR)).toEqual([]);
    adapterOf(KASIR).enabled = true; adapterOf(KASIR).broken = true; expect(rosNeighbors(KASIR)).toEqual([]);
  });
  it('the MAC follows a renamed identity', () => {
    new RosCli(siteRouter('warnet')!).run('/system identity set name=WARNET');
    expect(rosNeighbors(KASIR)[0].identity).toBe('WARNET');
  });
});

describe('Winbox connect', () => {
  beforeEach(fresh);
  it('connects by MAC with admin and the empty factory password; the session is a RosCli on that router', () => {
    const mac = rosNeighbors(KASIR)[0].mac;
    const r = winboxConnect(KASIR, mac.toLowerCase().replace(/:/g, '-'), 'admin', '');
    expect(r.err).toBe(''); expect(r.via).toBe('mac');
    expect(r.cli!.run('/ip address print')).toMatch(/192\.168\.100\.1\/24/);
    r.cli!.run('/system identity set name=WARNET');
    expect(r.cli!.prompt()).toBe('[admin@WARNET] > ');
    expect(identity(siteRouter('warnet')!)).toBe('WARNET');
  });
  it('rejects a wrong password, an unknown MAC and a router of another site', () => {
    const mac = rosNeighbors(KASIR)[0].mac;
    expect(winboxConnect(KASIR, mac, 'admin', 'salah').err).toBe('ERROR: wrong username or password');
    expect(winboxConnect(KASIR, rosNeighbors(K4)[0].mac, 'admin', '').err).toMatch(/tidak ditemukan/);
    expect(winboxConnect(KASIR, '192.168.0.1', 'admin', '').err).toMatch(/timed out/);
    expect(winboxConnect(KASIR, '', 'admin', '').err).toMatch(/Connect To/);
    expect(winboxConnect(KASIR, 'router', 'admin', '').err).toMatch(/tidak valid/);
  });
  it('connects by IP while the PC has an address; without one only the MAC works', () => {
    expect(winboxConnect(KASIR, '192.168.100.1', 'admin', '').via).toBe('ip');
    const a = adapterOf(KASIR); Object.assign(a, { dhcp: false, ip: '10.9.9.9', mask: '255.255.255.0', gw: '' });
    expect(winboxConnect(KASIR, '192.168.100.1', 'admin', '').cli).toBeNull();
    expect(winboxConnect(KASIR, rosNeighbors(KASIR)[0].mac, 'admin', '').cli).not.toBeNull();
  });
  it('a password set on the router is required afterwards', () => {
    new RosCli(siteRouter('kos')!).run('/user set admin password=kos123');
    const mac = rosNeighbors(K1)[0].mac;
    expect(winboxConnect(K1, mac, 'admin', '').cli).toBeNull();
    expect(winboxConnect(K1, mac, 'admin', 'kos123').cli).not.toBeNull();
  });
});

describe('WebFig lookup', () => {
  beforeEach(fresh);
  it('the gateway of a RouterOS site is a RouterOS device; the house router is not', () => {
    expect(rosAtIp(KASIR, '192.168.100.1')).toBe(siteRouter('warnet'));
    expect(rosAtIp(K4, '192.168.0.1')).toBe(siteRouter('kos'));
    expect(rosAtIp('PROP_RUMAH_01_LAPTOP_01', ENVS.rumah.gateway)).toBeNull();
    expect(rosAtIp(KASIR, '192.168.100.2')).toBeNull();   // SW-WARNET management IP
  });
});

describe('hotspot on the kos LAN (bound site segment)', () => {
  beforeEach(fresh);
  const setup = () => {
    const c = new RosCli(siteRouter('kos')!);
    const out = ['/ip hotspot setup', 'bridge-lan', '', '', '', '', '', '', '', '', ''].map(l => c.run(l));
    expect(c.prompt()).toBe('[admin@KOS-01] > ');
    expect(out.join('\n')).not.toMatch(/invalid|does not match|failure/);
    expect(c.run('/ip hotspot user add name=kamar1 password=123')).toBe('');
    return c;
  };
  it('the wizard on bridge-lan gates every laptop until it logs in, then the internet works', () => {
    expect(rosNeedsLogin(K4)).toBe(false);
    setup();
    const a = adapterOf(K4);
    expect(live(a).ok).toBe(true);
    expect(rosNeedsLogin(K4)).toBe(true);
    expect(ping(a, envOf(K4), '8.8.8.8', true).kind).toBe('timeout');
    expect(rosHotspotInfo(K4)).toMatchObject({ server: 'hotspot1', address: '192.168.0.1', identity: 'KOS-01', user: '' });
    expect(rosHotspotLogin(K4, 'kamar1', 'salah')).toBe('invalid username or password');
    expect(rosHotspotLogin(K4, 'kamar1', '123')).toBe('');
    expect(rosNeedsLogin(K4)).toBe(false);
    expect(rosHotspotInfo(K4)!.user).toBe('kamar1');
    expect(ping(a, envOf(K4), '8.8.8.8', true).kind).toBe('reply');
    // another laptop is still gated, and kamar1 has one shared session
    expect(rosNeedsLogin(K1)).toBe(true);
    expect(rosHotspotLogin(K1, 'kamar1', '123')).toBe('no more sessions are allowed for user');
  });
  it('Winbox by MAC still reaches the router from a gated laptop; the warnet is unaffected', () => {
    setup();
    expect(winboxConnect(K1, rosNeighbors(K1)[0].mac, 'admin', '').cli).not.toBeNull();
    expect(winboxConnect(K1, '192.168.0.1', 'admin', '').cli).not.toBeNull();
    expect(rosNeedsLogin(KASIR)).toBe(false);
  });
});
