// Fase 3 chunk A: FTTH optical engine — budget maths, thresholds, faults, OPM/VFL/OTDR, fusion splice logic, ONT states.
// Expected numbers are computed by hand from notes/research-grow.md §2 values (see DESIGN.md › Fase 3: FTTH (engine)).
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FTTH, ftthConfig, bendLossDb, demoFtth, createFtth, addOdp, addCustomer, addBend, fixBend, breakFiber, repairBreak, setDirty,
  cleanConnector, setSpliceLoss, setCap, plugDrop, unplugDrop, pathOf, CONN, rxAt, upstreamRx, budgetCheck, budgetTable, marginDb, rxBand,
  rxInSpec, opmRead, lossTest, vfl, otdr, bendSuspects, SpliceSession, runSplice, SPLICE_STEPS, ontStatus, registerOnt, faultsOn, pollOnts,
  FTTH_HOOKS, ontInternetOk, type FtthNet,
} from '../src/pcos/ftth';

const near = (a: number, b: number, d = 0.011) => expect(Math.abs(a - b)).toBeLessThan(d);
/** the hand-computed loss of demo rumah1 at λ: fibre (feeder 4 km + dist 0.8 km) × G.652 + drop/indoor 0.16 km × 1.0, + 7.2 + 10.5 + 4×0.3 + 6×0.15 */
const r1Loss = (perKm: number) => 4.8 * perKm + 0.16 + 7.2 + 10.5 + 1.2 + 0.9;
const dropSplice = (n: FtthNet, c: string) => Object.values(n.splices).find(s => s.span === `${c}:drop`)!;

// ------------------------------------------------------------------------------------------------ config & budget
describe('config and loss budget', () => {
  it('defaults are the research values (splitters, splice, connector, class B+, ONU window, Tx range)', () => {
    const c = DEFAULT_FTTH;
    expect(c.splitterDb).toEqual({ 4: 7.2, 8: 10.5, 16: 13.7, 32: 17.0 });
    expect(c.fusionSpliceDb).toBe(0.15); expect(c.fusionSpliceMaxDb).toBe(0.2); expect(c.connectorDb).toBe(0.3); expect(c.connectorMaxDb).toBe(0.75);
    expect([c.budgetMinDb, c.budgetMaxDb]).toEqual([13, 28]);
    expect([c.ontOverloadDbm, c.ontSensitivityDbm]).toEqual([-8, -27]);
    expect(c.oltTxDbm).toBeGreaterThanOrEqual(c.oltTxRange[0]); expect(c.oltTxDbm).toBeLessThanOrEqual(c.oltTxRange[1]);
    expect(c.fiberDbPerKm[1310]).toBeLessThanOrEqual(0.4); expect(c.fiberDbPerKm[1550]).toBeLessThanOrEqual(0.3);
  });
  it('ftthConfig merges nested per-λ overrides and does not mutate the default', () => {
    const c = ftthConfig({ splitterDb: { 16: 13.5 } as never, fiberDbPerKm: { 1550: 0.25 } as never });
    expect(c.splitterDb[16]).toBe(13.5); expect(c.splitterDb[8]).toBe(10.5);
    expect(c.fiberDbPerKm[1550]).toBe(0.25); expect(c.fiberDbPerKm[1310]).toBe(0.4);
    expect(DEFAULT_FTTH.splitterDb[16]).toBe(13.7);
  });
  it('reproduces the research example: +3 − 5 km×0.35 − 1:4 − 1:8 − 4 conn×0.3 − 6 splice×0.1 = −18.25 (research rounds to −18.3) dBm', () => {
    const n = createFtth({ cfg: { fusionSpliceDb: 0.1 } });
    addOdp(n, { id: 'O', distM: 1000 });
    addCustomer(n, { id: 'c', odp: 'O', port: 1, dropM: 0, indoorM: 0 });
    const r = rxAt(n, 'c', 1490);
    near(r.rxDbm, -18.25); expect(budgetTable(n, 'c').connectors).toBe(4); expect(budgetTable(n, 'c').splices).toBe(6);
  });
  it('demo rumah1 budget table at 1490: 4 connectors, 6 splices, 21.64 dB, −18.64 dBm, class B+ ok', () => {
    const n = demoFtth(), t = budgetTable(n, 'rumah1');
    expect(t.connectors).toBe(4); expect(t.splices).toBe(6);
    near(t.fiberDb, 1.84); near(t.splitterDb, 17.7); near(t.connectorDb, 1.2); near(t.spliceDb, 0.9);
    near(t.lossDb, r1Loss(0.35)); near(t.rxDbm, 3 - r1Loss(0.35)); expect(t.verdict).toBe('ok');
  });
  it('fibre attenuation per wavelength: 1550 loses least, 1310 most (G.652.D values)', () => {
    const n = demoFtth();
    const [a, b, c] = [rxAt(n, 'rumah1', 1310), rxAt(n, 'rumah1', 1490), rxAt(n, 'rumah1', 1550)];
    near(a.lossDb, r1Loss(0.4)); near(b.lossDb, r1Loss(0.35)); near(c.lossDb, r1Loss(0.3));
    expect(c.rxDbm).toBeGreaterThan(b.rxDbm); expect(b.rxDbm).toBeGreaterThan(a.rxDbm);
  });
  it('a 1:16 ODP costs 13.7 dB: rumah3 (ODP-B, dist 1.2 km, drop 120 m) at 1490', () => {
    const n = demoFtth();
    near(rxAt(n, 'rumah3', 1490).lossDb, 5.2 * 0.35 + 0.13 + 7.2 + 13.7 + 1.2 + 0.9);
  });
  it('drop and indoor cable use 1.0 dB/km, not the G.652 value', () => {
    const a = demoFtth(), b = demoFtth();
    b.spans['rumah1:drop'].lengthM = 1150; dropSplice(b, 'rumah1').atM = 1150;
    near(rxAt(a, 'rumah1').rxDbm - rxAt(b, 'rumah1').rxDbm, 1.0);
  });
  it('budgetCheck: class B+ window 13–28 dB', () => {
    const n = demoFtth();
    expect(budgetCheck(n, 12.9)).toBe('under'); expect(budgetCheck(n, 13)).toBe('ok'); expect(budgetCheck(n, 28)).toBe('ok');
    expect(budgetCheck(n, 28.1)).toBe('over'); expect(budgetCheck(n, Infinity)).toBe('no-light');
    near(marginDb(n, 21.64), 6.36);
  });
  it('rxBand colours: green −13…−24, yellow −24…−27 and −8…−13, red outside the ONU window', () => {
    const n = demoFtth();
    expect(rxBand(n, -18)).toBe('green'); expect(rxBand(n, -24)).toBe('green'); expect(rxBand(n, -25)).toBe('yellow');
    expect(rxBand(n, -27)).toBe('yellow'); expect(rxBand(n, -10)).toBe('yellow'); expect(rxBand(n, -27.1)).toBe('red');
    expect(rxBand(n, -7.5)).toBe('red'); expect(rxBand(n, -Infinity)).toBe('red');
    expect(rxInSpec(n, -8)).toBe(true); expect(rxInSpec(n, -27)).toBe(true); expect(rxInSpec(n, -27.01)).toBe(false);
  });
  it('the sensitivity threshold is a config: −25.5 dBm is online with −27 (default) and LOS with −25 or −24', () => {
    const tx = -25.5 + r1Loss(0.35);
    expect(ontStatus(demoFtth({ oltTxDbm: tx }), 'rumah1').state).toBe('online');
    expect(ontStatus(demoFtth({ oltTxDbm: tx, cfg: { ontSensitivityDbm: -25 } }), 'rumah1').state).toBe('los');
    expect(ontStatus(demoFtth({ oltTxDbm: tx, cfg: { ontSensitivityDbm: -24 } }), 'rumah1').state).toBe('los');
  });
  it('upstream: ONT 1310 Tx − the same ODN loss at 1310 (loss is symmetric)', () => {
    const n = demoFtth();
    near(upstreamRx(n, 'rumah1'), 2 - r1Loss(0.4));
    near(upstreamRx(n, 'rumah1', 5), 5 - r1Loss(0.4));
  });
  it('the downstream path is in order and its positions add up to the cabled length', () => {
    const p = pathOf(demoFtth(), 'rumah1');
    expect(p[0].kind).toBe('source'); expect(p[p.length - 1].kind).toBe('ont'); expect(p[p.length - 1].endM).toBe(4960);
    for (let i = 1; i < p.length; i++) expect(p[i].startM).toBeGreaterThanOrEqual(p[i - 1].startM);
    expect(p.filter(e => e.kind === 'splitter').map(e => e.id)).toEqual(['ODC-01', 'ODP-A']);
  });
});

// ------------------------------------------------------------------------------------------------ faults
describe('faults', () => {
  it('macrobend: loss rises as the radius shrinks and is strongest at 1550, weakest at 1310', () => {
    const c = DEFAULT_FTTH;
    expect(bendLossDb(c, 10, 1550)).toBeGreaterThan(bendLossDb(c, 10, 1490));
    expect(bendLossDb(c, 10, 1490)).toBeGreaterThan(bendLossDb(c, 10, 1310));
    expect(bendLossDb(c, 5, 1550)).toBeGreaterThan(bendLossDb(c, 15, 1550));
    near(bendLossDb(c, 10, 1550), (20 / 30) ** 2 * 8); near(bendLossDb(c, 0, 1550), 8);
  });
  it('a bend at or above the safe radius costs nothing and is not a fault', () => {
    const n = demoFtth(); addBend(n, 'rumah1:drop', 40, 30);
    near(rxAt(n, 'rumah1', 1550).lossDb, r1Loss(0.3)); expect(faultsOn(n, 'rumah1')).toEqual([]);
  });
  it('a pinched drop (r=8 mm) drops Rx more at 1550 than at 1490; straightening it restores the line', () => {
    const n = demoFtth(), b = addBend(n, 'rumah1:drop', 40, 8);
    const d1550 = rxAt(n, 'rumah1', 1550).lossDb - r1Loss(0.3), d1490 = rxAt(n, 'rumah1', 1490).lossDb - r1Loss(0.35);
    expect(d1550).toBeGreaterThan(d1490); near(d1550, bendLossDb(n.cfg, 8, 1550));
    expect(faultsOn(n, 'rumah1').map(f => f.kind)).toEqual(['macrobend']);
    fixBend(n, b.id); near(rxAt(n, 'rumah1', 1550).lossDb, r1Loss(0.3));
  });
  it('a bad enough bend takes rumah3 into LOS at 1490 (ONT red)', () => {
    const n = demoFtth(); addBend(n, 'rumah3:drop', 60, 0); addBend(n, 'rumah3:drop', 61, 2);
    const s = ontStatus(n, 'rumah3');
    expect(s.state).toBe('los'); expect(s.leds).toEqual({ pon: 'off', los: 'red' }); expect(s.internet).toBe(false);
  });
  it('dirty connector adds cfg.dirtyConnectorExtraDb; cleaning restores', () => {
    const n = demoFtth(); setDirty(n, CONN.roset('rumah1'));
    near(rxAt(n, 'rumah1').lossDb, r1Loss(0.35) + 1.5);
    expect(faultsOn(n, 'rumah1')[0]).toMatchObject({ kind: 'dirty', id: 'rumah1:roset' });
    cleanConnector(n, CONN.roset('rumah1')); near(rxAt(n, 'rumah1').lossDb, r1Loss(0.35));
  });
  it('bad splice: default 1.0 dB is flagged; 0.2 dB (upper fusion limit) is not', () => {
    const n = demoFtth(), s = dropSplice(n, 'rumah1');
    setSpliceLoss(n, s.id, 0.2); expect(faultsOn(n, 'rumah1')).toEqual([]);
    setSpliceLoss(n, s.id); near(rxAt(n, 'rumah1').lossDb, r1Loss(0.35) - 0.15 + 1.0);
    expect(faultsOn(n, 'rumah1').map(f => f.kind)).toEqual(['bad-splice']);
  });
  it('broken drop: no light at that ONT (LOS), the neighbour on the same ODP is fine', () => {
    const n = demoFtth(); breakFiber(n, 'rumah1:drop', 100);
    const r = rxAt(n, 'rumah1');
    expect(r.light).toBe(false); expect(r.rxDbm).toBe(-Infinity); expect(r.stop?.kind).toBe('break');
    expect(ontStatus(n, 'rumah1').state).toBe('los'); expect(ontStatus(n, 'rumah2').state).toBe('online');
  });
  it('broken feeder takes every customer down', () => {
    const n = demoFtth(); breakFiber(n, 'feeder', 2500);
    expect(pollOnts(n).map(s => s.state)).toEqual(['los', 'los', 'los']);
  });
  it('break position must be on the span', () => {
    const n = demoFtth();
    expect(() => breakFiber(n, 'rumah1:drop', 151)).toThrow(); expect(() => addBend(n, 'nope', 1, 5)).toThrow();
  });
  it('repairing a break with a splice brings the light back with that splice loss', () => {
    const n = demoFtth(), b = breakFiber(n, 'rumah1:drop', 100);
    repairBreak(n, b.id, 0.05);
    near(rxAt(n, 'rumah1').lossDb, r1Loss(0.35) + 0.05); expect(ontStatus(n, 'rumah1').state).toBe('online');
  });
  it('wrong ODP port (live): light is fine but the inventory mismatch is reported', () => {
    const n = demoFtth(); plugDrop(n, 'rumah1', 4, { cleaned: true });
    const s = ontStatus(n, 'rumah1');
    expect(s.state).toBe('online'); expect(s.portMismatch).toBe(true); expect(s.reason).toContain('seharusnya port 1');
    expect(faultsOn(n, 'rumah1').map(f => f.kind)).toEqual(['wrong-port']);
  });
  it('wrong ODP port that is not spliced to the splitter (port 7 of 6 live): LOS', () => {
    const n = demoFtth(); plugDrop(n, 'rumah1', 7, { cleaned: true });
    expect(ontStatus(n, 'rumah1').state).toBe('los'); expect(rxAt(n, 'rumah1').stop?.kind).toBe('dead-port');
    expect(faultsOn(n, 'rumah1').map(f => f.kind)).toEqual(['dead-port', 'wrong-port']);
  });
  it('an unused port left without its dust cap gets dirty; plugging without cleaning carries the dust', () => {
    const n = demoFtth(); setCap(n, 'ODP-A', 3, false); plugDrop(n, 'rumah1', 3);
    near(rxAt(n, 'rumah1').lossDb, r1Loss(0.35) + 1.5);
    const m = demoFtth(); setCap(m, 'ODP-A', 3, false); plugDrop(m, 'rumah1', 3, { cleaned: true });
    near(rxAt(m, 'rumah1').lossDb, r1Loss(0.35));
  });
  it('a capped unused port stays clean', () => {
    const n = demoFtth(); setCap(n, 'ODP-A', 5, true); plugDrop(n, 'rumah1', 5);
    near(rxAt(n, 'rumah1').lossDb, r1Loss(0.35));
  });
  it('a port already used by another drop cannot be taken; an unplugged drop is LOS', () => {
    const n = demoFtth();
    expect(() => plugDrop(n, 'rumah1', 2)).toThrow(/rumah2/);
    unplugDrop(n, 'rumah1');
    expect(ontStatus(n, 'rumah1').state).toBe('los'); expect(faultsOn(n, 'rumah1').map(f => f.kind)).toEqual(['unplugged']);
    expect(n.odps['ODP-A'].ports[0].customer).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ ONT
describe('ONT states and hooks', () => {
  it('online: PON green, LOS off, internet passes', () => {
    const s = ontStatus(demoFtth(), 'rumah1');
    expect(s).toMatchObject({ state: 'online', band: 'green', internet: true, leds: { pon: 'green', los: 'off' } });
  });
  it('unregistered SN: PON blinking, no internet; wrong SN is refused, the right one registers', () => {
    const n = demoFtth(); n.customers.rumah2.registered = false;
    expect(ontStatus(n, 'rumah2')).toMatchObject({ state: 'unregistered', internet: false, leds: { pon: 'green-blink', los: 'off' } });
    expect(registerOnt(n, 'rumah2', 'ZTEG00000000')).toBe(false);
    expect(registerOnt(n, 'rumah2', n.customers.rumah2.ontSerial.toLowerCase())).toBe(true);
    expect(ontInternetOk(n, 'rumah2')).toBe(true);
  });
  it('overload above −8 dBm (too little ODN loss): own state, class B+ verdict "under"', () => {
    const n = demoFtth({ cfg: { splitterDb: { 4: 0, 8: 0, 16: 0, 32: 0 } } });
    const r = rxAt(n, 'rumah1');
    expect(r.rxDbm).toBeGreaterThan(-8); expect(budgetCheck(n, r.lossDb)).toBe('under');
    expect(ontStatus(n, 'rumah1')).toMatchObject({ state: 'overload', internet: false, band: 'red' });
  });
  it('several dirty connectors push Rx below sensitivity → LOS with the reason', () => {
    const n = demoFtth();
    for (const id of [CONN.odf, CONN.odpPort('ODP-B', 1), CONN.roset('rumah3'), CONN.ont('rumah3')]) setDirty(n, id);
    const s = ontStatus(n, 'rumah3');
    expect(s.rxDbm).toBeLessThan(-27); expect(s.state).toBe('los'); expect(s.reason).toContain('sensitivitas');
  });
  it('pollOnts fires FTTH_HOOKS.statusChanged only when a state changes', () => {
    const n = demoFtth(), seen: string[] = [];
    const old = FTTH_HOOKS.statusChanged;
    FTTH_HOOKS.statusChanged = (c, now, before) => { seen.push(`${c}:${before}->${now.state}`); };
    try {
      pollOnts(n); expect(seen).toHaveLength(3);
      pollOnts(n); expect(seen).toHaveLength(3);
      breakFiber(n, 'rumah2:drop', 10); pollOnts(n);
      expect(seen[3]).toBe('rumah2:online->los'); expect(seen).toHaveLength(4);
    } finally { FTTH_HOOKS.statusChanged = old; }
  });
});

// ------------------------------------------------------------------------------------------------ OPM
describe('OPM and loss test', () => {
  it('live PON 1490 at the ODP port, roset and ONT end', () => {
    const n = demoFtth();
    const odp = 3 - (0.3 + 4.8 * 0.35 + 7.2 + 10.5 + 0.75 + 0.3); // ODF, fibre, splitters, 5 splices so far, port connector
    near(opmRead(n, 'rumah1', 'odp-port').dbm!, odp);
    near(opmRead(n, 'rumah1', 'roset').dbm!, odp - 0.15 - 0.15 - 0.3);
    near(opmRead(n, 'rumah1', 'ont').dbm!, rxAt(n, 'rumah1').rxDbm);
    expect(opmRead(n, 'rumah1', 'ont').display).toBe(`${rxAt(n, 'rumah1').rxDbm.toFixed(2)} dBm`);
  });
  it('the live PON has no 1310/1550 downstream: LO; with a light source those λ read', () => {
    const n = demoFtth();
    expect(opmRead(n, 'rumah1', 'ont', 1310).display).toBe('LO'); expect(opmRead(n, 'rumah1', 'ont', 1550).display).toBe('LO');
    near(opmRead(n, 'rumah1', 'ont', 1550, 'ls').dbm!, 0 - r1Loss(0.3));
  });
  it('reads LO past a break and on a dead port', () => {
    const n = demoFtth(); breakFiber(n, 'rumah1:drop', 50);
    expect(opmRead(n, 'rumah1', 'odp-port').dbm).not.toBeNull(); expect(opmRead(n, 'rumah1', 'roset').display).toBe('LO');
    const m = demoFtth(); plugDrop(m, 'rumah1', 8, { cleaned: true });
    expect(opmRead(m, 'rumah1', 'odp-port').display).toBe('LO');
  });
  it('the meter floor is a config', () => {
    expect(opmRead(demoFtth({ cfg: { opmFloorDbm: -15 } }), 'rumah1', 'ont').display).toBe('LO');
  });
  it('lossTest (light source at ODF, OPM at ONT) equals the ODN loss at λ, null when broken', () => {
    const n = demoFtth();
    near(lossTest(n, 'rumah1', 1310)!, r1Loss(0.4)); near(lossTest(n, 'rumah1', 1550)!, r1Loss(0.3));
    breakFiber(n, 'feeder', 10); expect(lossTest(n, 'rumah1', 1550)).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ VFL
describe('VFL', () => {
  it('clean line: no glow, the light reaches the far end', () => {
    const v = vfl(demoFtth(), 'rumah1', 'odp-port');
    expect(v.glows).toEqual([]); expect(v.reachedEnd).toBe(true);
  });
  it('from the ODP port, a break 100 m down the drop glows at 100 m and the light stops there', () => {
    const n = demoFtth(); breakFiber(n, 'rumah1:drop', 100); setDirty(n, CONN.ont('rumah1'));
    const v = vfl(n, 'rumah1', 'odp-port');
    expect(v.glows).toHaveLength(1); expect(v.glows[0]).toMatchObject({ kind: 'break', distanceM: 100, visible: true }); expect(v.reachedEnd).toBe(false);
  });
  it('from the roset the same break is 50 m away (drop is 150 m)', () => {
    const n = demoFtth(); breakFiber(n, 'rumah1:drop', 100);
    expect(vfl(n, 'rumah1', 'roset').glows[0]).toMatchObject({ kind: 'break', distanceM: 50 });
  });
  it('range: a break 6 km away is not visible (5 km VFL), 2 km away it is', () => {
    const n = createFtth(); addOdp(n, { id: 'O', distM: 500 }); addCustomer(n, { id: 'far', odp: 'O', port: 1, dropM: 8000 });
    breakFiber(n, 'far:drop', 6000);
    expect(vfl(n, 'far', 'odp-port').glows[0]).toMatchObject({ distanceM: 6000, visible: false }); expect(vfl(n, 'far', 'odp-port').visible).toEqual([]);
    expect(vfl(n, 'far', 'roset').glows[0]).toMatchObject({ distanceM: 2000, visible: true });
    expect(vfl(demoFtth({ cfg: { vflRangeM: 7000 } }), 'rumah1', 'odp-port').visible).toEqual([]);
  });
  it('shows a tight bend, a dirty connector and a bad splice along the drop', () => {
    const n = demoFtth(); addBend(n, 'rumah1:drop', 30, 6); setDirty(n, CONN.roset('rumah1')); setSpliceLoss(n, dropSplice(n, 'rumah1').id, 0.8);
    const v = vfl(n, 'rumah1', 'odp-port');
    expect(v.glows.map(g => [g.kind, g.distanceM])).toEqual([['macrobend', 30], ['bad-splice', 150], ['dirty', 150]]);
  });
  it('drop unplugged: nothing to inject at the port; from the roset the open end glows at the ODP', () => {
    const n = demoFtth(); unplugDrop(n, 'rumah1');
    expect(vfl(n, 'rumah1', 'odp-port').glows).toEqual([]);
    expect(vfl(n, 'rumah1', 'roset').glows[0]).toMatchObject({ kind: 'open-end', distanceM: 150 });
  });
});

// ------------------------------------------------------------------------------------------------ OTDR
describe('OTDR', () => {
  it('from the OLT: events at the right distances, co-located events merge, end of fibre at the ONT', () => {
    const n = demoFtth(), t = otdr(n, 'rumah1', { lambda: 1550 });
    expect(t.events.map(e => [e.distanceM, e.type])).toEqual([
      [1500, 'non-reflective'], [3000, 'non-reflective'], [4000, 'non-reflective'], [4800, 'reflective'], [4950, 'reflective'], [4960, 'end'],
    ]);
    near(t.events[2].lossDb, 0.15 + 7.2 + 0.15); near(t.events[3].lossDb, 0.15 + 10.5 + 0.3); near(t.events[4].lossDb, 0.45);
    expect(t.endM).toBe(4960);
    near(t.totalLossDb, r1Loss(0.3) - 0.3); // the launch ODF connector is not in the level
  });
  it('a break in the distribution cable ends the trace there', () => {
    const n = demoFtth(); breakFiber(n, 'ODP-A:dist', 500);
    const t = otdr(n, 'rumah1');
    expect(t.endM).toBe(4500); expect(t.events[t.events.length - 1]).toMatchObject({ type: 'end', distanceM: 4500 });
    expect(t.events.every(e => e.distanceM <= 4500)).toBe(true);
  });
  it('from the ODP port: a drop break at 100 m is the end event at 100 m', () => {
    const n = demoFtth(); breakFiber(n, 'rumah1:drop', 100);
    const t = otdr(n, 'rumah1', { launch: 'odp-port' });
    expect(t.events).toEqual([expect.objectContaining({ distanceM: 100, type: 'end' })]); expect(t.endM).toBe(100);
  });
  it('dead zone: an event 5 m from the launch is hidden with 10 m, seen with 2 m', () => {
    const n = demoFtth(); addBend(n, 'rumah1:drop', 5, 5);
    expect(otdr(n, 'rumah1', { launch: 'odp-port' }).inDeadZone.map(e => e.kind)).toEqual(['bend']);
    expect(otdr(n, 'rumah1', { launch: 'odp-port', deadZoneM: 2 }).events[0]).toMatchObject({ kind: 'bend', distanceM: 5 });
  });
  it('range: events past rangeM are not shown and there is no end', () => {
    const t = otdr(demoFtth(), 'rumah1', { rangeM: 3500 });
    expect(t.events.map(e => e.distanceM)).toEqual([1500, 3000]); expect(t.endM).toBeNull();
  });
  it('macrobend: 1550 shows a bigger loss than 1310; bendSuspects finds the bend, not the splices', () => {
    const n = demoFtth(); addBend(n, 'rumah1:drop', 60, 10);
    const a = otdr(n, 'rumah1', { lambda: 1310, launch: 'odp-port' }), b = otdr(n, 'rumah1', { lambda: 1550, launch: 'odp-port' });
    const ea = a.events.find(e => e.kind === 'bend')!, eb = b.events.find(e => e.kind === 'bend')!;
    expect(eb.lossDb).toBeGreaterThan(ea.lossDb); expect(eb.distanceM).toBe(60);
    expect(bendSuspects(a, b).map(e => e.distanceM)).toEqual([60]);
  });
  it('a bad splice shows as a non-reflective step at its distance', () => {
    const n = demoFtth(); setSpliceLoss(n, Object.values(n.splices).find(s => s.label.startsWith('Joint feeder 3000'))!.id, 0.9);
    expect(otdr(n, 'rumah1').events[1]).toMatchObject({ distanceM: 3000, lossDb: 0.9, type: 'non-reflective' });
  });
  it('is deterministic and the trace never rises', () => {
    const n = demoFtth(); addBend(n, 'rumah2:drop', 20, 12);
    const a = otdr(n, 'rumah2'), b = otdr(n, 'rumah2');
    expect(a).toEqual(b);
    for (let i = 1; i < a.points.length; i++) { expect(a.points[i].db).toBeLessThanOrEqual(a.points[i - 1].db); expect(a.points[i].m).toBeGreaterThanOrEqual(a.points[i - 1].m); }
  });
});

// ------------------------------------------------------------------------------------------------ splice minigame
describe('fusion splice minigame', () => {
  const good = { strip: {}, clean: { wiped: true }, cleave: { angleDeg: 0.3 }, align: { program: 'SM' as const }, fuse: {}, protect: { shrunk: true } };
  it('a clean run gives a low loss, passes, and the splicer shows the estimate', () => {
    const s = runSplice(good), r = s.result()!;
    near(r.lossDb, 0.05); expect(r.estimate).toBe('0.05 dB'); expect(r.pass).toBe(true); expect(r.score).toBeGreaterThanOrEqual(90);
    expect(s.done).toBe(true); expect(s.log).toEqual([...SPLICE_STEPS]);
  });
  it('skipping the alcohol wipe adds the dirty penalty', () => {
    near(runSplice({ ...good, clean: { wiped: false } }).result()!.lossDb, 0.05 + 0.15);
  });
  it('a worse (still accepted) cleave angle gives a higher loss', () => {
    expect(runSplice({ ...good, cleave: { angleDeg: 0.9 } }).result()!.lossDb).toBeGreaterThan(runSplice(good).result()!.lossDb);
  });
  it('a bad cleave is rejected at fuse; cleave again and the splice goes on', () => {
    const s = new SpliceSession();
    s.step('strip'); s.step('clean', { wiped: true }); s.step('cleave', { angleDeg: 1.6 }); s.step('align');
    const f = s.step('fuse');
    expect(f.ok).toBe(false); expect(f.msg).toContain('Cleave jelek'); expect(s.result()).toBeNull();
    expect(s.step('cleave', { angleDeg: 0.4 }).ok).toBe(true);
    expect(s.step('fuse').msg).toBe('Est. loss 0.06 dB'); expect(s.rejects).toBe(1);
  });
  it('a step out of order is refused and counted as a mistake', () => {
    const s = new SpliceSession();
    expect(s.step('cleave').ok).toBe(false); expect(s.expected).toBe('strip'); expect(s.mistakes).toHaveLength(1);
  });
  it('wrong program, fibre touched after the cleave and not seated each add loss', () => {
    near(runSplice({ ...good, align: { program: 'MM' } }).result()!.lossDb, 0.25);
    near(runSplice({ ...good, align: { program: 'SM', touched: true } }).result()!.lossDb, 0.15);
    near(runSplice({ ...good, align: { program: 'SM', seated: false } }).result()!.lossDb, 0.17);
  });
  it('everything wrong clamps at 0.5 dB and fails', () => {
    const r = runSplice({ strip: { nicked: true }, clean: { wiped: false }, cleave: { angleDeg: 1.0 }, align: { program: 'MM', seated: false, touched: true }, fuse: {}, protect: { shrunk: false } }).result()!;
    expect(r.lossDb).toBe(0.5); expect(r.pass).toBe(false); expect(r.score).toBeLessThan(40);
  });
  it('a good joint without the protection sleeve does not pass', () => {
    const r = runSplice({ ...good, protect: { shrunk: false } }).result()!;
    expect(r.lossDb).toBeLessThan(0.2); expect(r.protected).toBe(false); expect(r.pass).toBe(false);
  });
  it('K3: not binning the fibre scraps costs score', () => {
    expect(runSplice(good).result()!.score - runSplice(good, { binScraps: false }).result()!.score).toBe(10);
  });
  it('every combination stays inside 0.02–0.5 dB', () => {
    for (const a of [0, 0.2, 0.5, 0.8, 1.0]) for (const w of [true, false]) for (const p of ['SM', 'MM'] as const) {
      const l = runSplice({ ...good, clean: { wiped: w }, cleave: { angleDeg: a }, align: { program: p } }).result()!.lossDb;
      expect(l).toBeGreaterThanOrEqual(0.02); expect(l).toBeLessThanOrEqual(0.5);
    }
  });
  it('the splice result goes into the network: repaired drop shows that loss on the OTDR', () => {
    const n = demoFtth(), b = breakFiber(n, 'rumah1:drop', 100);
    const r = runSplice({ ...good, clean: { wiped: false } }).result()!;
    repairBreak(n, b.id, r.lossDb, r.protected);
    expect(otdr(n, 'rumah1', { launch: 'odp-port' }).events[0]).toMatchObject({ distanceM: 100, lossDb: r.lossDb, type: 'non-reflective' });
    expect(ontStatus(n, 'rumah1').state).toBe('online');
  });
});
