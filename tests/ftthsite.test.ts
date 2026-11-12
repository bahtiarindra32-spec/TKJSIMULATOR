// Fase 3 FTTH chunk B1a: the house (BLD_RUMAH_01) is fed by a live FTTH network; its internet is gated on the ONT.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, adapterOf, ADAPTERS, ENVS, envOf, ping, healthy, SWITCHES } from '../src/pcos/net';
import { CLIENTS } from '../src/pcos/wifi';
import { initSiteClients, readout } from '../src/pcos/sites';
import { SITE_PCS, SITE_AP_DEFS } from '../src/data/sites';
import { rumahFtth, rumahOnt, RUMAH_CUST, RUMAH_ODP, buildRumahFtth } from '../src/pcos/ftthsite';
import { dropParts, distParts, FTTH_RUMAH } from '../src/data/ftthsite';
import { breakFiber, repairBreak, setDirty, cleanConnector, addBend, CONN, rxAt, rxBand, budgetCheck, ontStatus, type FtthNet } from '../src/pcos/ftth';
import { inject, snapshotSites, restoreSites, ok, ap, LAPTOP_RUMAH, TV } from '../src/game/field/sim';
import { FIELD_TPLS, TPL_IDS } from '../src/game/field/templates';
import { mulberry } from '../src/game/noc/util';

const ALL = ['PROP_L1_PC_01', ...SITE_PCS.map(p => p.name)];
const fresh = () => {
  ADAPTERS.clear(); CLIENTS.clear(); initSwitches(ALL); initSiteClients();
  for (const e of [ENVS.rumah, ENVS.kos, ENVS.warnet]) e.leases.clear();
  for (const d of SITE_AP_DEFS) Object.assign(ap(d.id), { mounted: true, radio: true, ssid: d.ssid, key: d.key, sec: 'WPA2-PSK', ch: d.ch, power: 'Tinggi' });
};
const net = (): FtthNet => rumahFtth()!;
const lap = () => adapterOf(LAPTOP_RUMAH);
const ping8 = () => ping(lap(), envOf(LAPTOP_RUMAH), '8.8.8.8', true).kind;
const pingGw = () => ping(lap(), envOf(LAPTOP_RUMAH), '192.168.1.1', true).kind;

describe('Fase 3 FTTH on the house: layout → spans', () => {
  it('span lengths come from the 3D layout (drop ≈ 17 m, distribution ≈ 41 m, patch cord 1.5 m)', () => {
    const n = buildRumahFtth(), c = n.customers[RUMAH_CUST];
    expect(n.spans[c.drop].lengthM).toBe(dropParts().totalM);
    expect(n.spans[n.odps[RUMAH_ODP].distribution].lengthM).toBe(distParts().totalM);
    expect(n.spans[c.indoor].lengthM).toBe(FTTH_RUMAH.indoorM);
    expect(dropParts().totalM).toBeGreaterThan(12); expect(dropParts().totalM).toBeLessThan(25);
    expect(distParts().totalM).toBeGreaterThan(35); expect(distParts().totalM).toBeLessThan(50);
    // ODP 1:8 with 6 live ports, the house on port 1, two neighbours plugged, ports 7–8 dead (splitter not fitted)
    const odp = n.odps[RUMAH_ODP];
    expect(odp.ratio).toBe(8);
    expect(odp.ports.map(p => p.live)).toEqual([true, true, true, true, true, true, false, false]);
    expect(odp.ports.filter(p => p.customer).map(p => p.n)).toEqual([1, 2, 3]);
  });
  it('healthy budget: class B+ ok, Rx in the green band', () => {
    fresh();
    const r = rxAt(net(), RUMAH_CUST, 1490);
    expect(r.light).toBe(true);
    expect(budgetCheck(net(), r.lossDb)).toBe('ok');
    expect(rxBand(net(), r.rxDbm)).toBe('green');
    expect(r.rxDbm).toBeCloseTo(-18.24, 1);
    for (const id of ['tetangga15', 'tetangga13']) expect(ontStatus(net(), id).state).toBe('online');
  });
});

describe('Fase 3 FTTH on the house: internet gated on the ONT', () => {
  beforeEach(fresh);
  it('healthy fibre: ONT online, laptop and TV have internet', () => {
    expect(rumahOnt()!.state).toBe('online');
    expect(rumahOnt()!.leds).toEqual({ pon: 'green', los: 'off' });
    expect(ENVS.rumah.internet).toBe(true);
    expect(healthy(lap())).toBe(true);
    expect(ping8()).toBe('reply');
    expect(ok(LAPTOP_RUMAH)).toBe(true); expect(ok(TV)).toBe(true);
  });
  it('drop broken → LOS → no internet (LAN and the ONT gateway still answer); repair → works again', () => {
    const b = breakFiber(net(), net().customers[RUMAH_CUST].drop, 9);
    const st = rumahOnt()!;
    expect(st.state).toBe('los'); expect(st.leds).toEqual({ pon: 'off', los: 'red' });
    expect(st.reason).toMatch(/Tidak ada cahaya/);
    expect(ENVS.rumah.internet).toBe(false);
    expect(ping8()).not.toBe('reply');
    expect(pingGw()).toBe('reply');                       // the ONT still routes the LAN and hands out DHCP
    expect(ok(LAPTOP_RUMAH)).toBe(false);
    expect(readout('ONT').rows.find(r => r[0] === 'LOS')![1]).toMatch(/^merah/);
    expect(readout('ONT').rows.find(r => r[0] === 'INTERNET')![1]).toBe('mati');
    // neighbours on the same ODP are untouched (break is on this house's drop)
    expect(ontStatus(net(), 'tetangga15').state).toBe('online');
    repairBreak(net(), b.id);
    expect(rumahOnt()!.state).toBe('online');
    expect(ping8()).toBe('reply');
    expect(ok(LAPTOP_RUMAH)).toBe(true);
  });
  it('a break on the distribution takes the whole ODP down', () => {
    breakFiber(net(), net().odps[RUMAH_ODP].distribution, 20);
    expect(rumahOnt()!.state).toBe('los');
    expect(ontStatus(net(), 'tetangga13').state).toBe('los');
    expect(ping8()).not.toBe('reply');
  });
  it('dirty connectors add loss; past the ONT sensitivity the line gates, cleaning brings it back', () => {
    const rx0 = rumahOnt()!.rxDbm;
    setDirty(net(), CONN.roset(RUMAH_CUST));
    expect(rumahOnt()!.rxDbm).toBeCloseTo(rx0 - net().cfg.dirtyConnectorExtraDb, 2);
    expect(rumahOnt()!.state).toBe('online');            // one dirty connector alone is not enough
    expect(ping8()).toBe('reply');
    for (const c of [CONN.ont(RUMAH_CUST), CONN.odpPort(RUMAH_ODP, 1), CONN.odf]) setDirty(net(), c);
    addBend(net(), net().customers[RUMAH_CUST].drop, 4, 2);   // drop pinched at the clamp
    const st = rumahOnt()!;
    expect(st.rxDbm).toBeLessThan(net().cfg.ontSensitivityDbm);
    expect(st.state).toBe('los');
    expect(ENVS.rumah.internet).toBe(false);
    expect(ping8()).not.toBe('reply');
    cleanConnector(net(), CONN.roset(RUMAH_CUST));
    expect(rumahOnt()!.rxDbm).toBeGreaterThan(net().cfg.ontSensitivityDbm);
    expect(rumahOnt()!.state).toBe('online');
    expect(ping8()).toBe('reply');
  });
  it('the ISP flag still works on its own and a site restore heals the fibre', () => {
    const snap = snapshotSites();
    ENVS.rumah.internet = false;
    expect(ping8()).not.toBe('reply');
    ENVS.rumah.internet = true;
    expect(ping8()).toBe('reply');
    breakFiber(net(), net().customers[RUMAH_CUST].drop, 3);
    expect(ping8()).not.toBe('reply');
    restoreSites(snap, 'rumah');
    expect(rumahOnt()!.state).toBe('online');
    expect(ping8()).toBe('reply');
  });
  it('the kos and warnet lines are not affected by the house fibre', () => {
    breakFiber(net(), net().customers[RUMAH_CUST].drop, 3);
    expect(ENVS.kos.internet).toBe(true); expect(ENVS.warnet.internet).toBe(true);
    expect(SWITCHES.some(s => s.name === 'ONT-RUMAH')).toBe(true);
  });
});

describe('Fase 3 FTTH on the house: the existing rumah orders still work', () => {
  for (const tpl of TPL_IDS.filter(id => FIELD_TPLS[id].cust === 'rumah' && !FIELD_TPLS[id].ros && !FIELD_TPLS[id].ftth))
    it(`${tpl}: inject breaks a device without touching the fibre`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        fresh();
        const inj = inject(tpl, mulberry(seed))!;
        expect(inj).not.toBeNull();
        expect(rumahOnt()!.state).toBe('online');
        expect(inj.targets.filter(t => t.primary).some(t => !ok(t.pc))).toBe(true);
      }
    });
});
