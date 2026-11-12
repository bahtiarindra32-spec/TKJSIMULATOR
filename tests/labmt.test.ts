// Lab Praktik MikroTik steps: rubric fails on a reset router, passes after real RouterOS console lines + the client test.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, envOf, adapterOf, live, bounce, ADAPTERS, ENVS, ping } from '../src/pcos/net';
import { resetRouterOsNet, rosHotspotLogin, plugOf } from '../src/pcos/routeros';
import { encodeResult, decodeResult, readRecap } from '../src/game/recap';
import { mtParams, freshLabMt, dropLabMt, mtChecks, hsChecks, mtSolution, typeLines, labMt, MT_LABELS } from '../src/game/labmt';

const LABPCS = Array.from({ length: 8 }, (_, i) => `PROP_LAB_PC_${String(i + 1).padStart(2, '0')}`);
const PC = LABPCS[3];
const seen = () => ({ pings: new Map<string, boolean>(), browse: [] as string[] });

describe('Lab Praktik · MikroTik', () => {
  beforeEach(() => { dropLabMt(); resetRouterOsNet(); ADAPTERS.clear(); initSwitches(LABPCS); });
  it('per-student values come from the seed and stay clear of the lab and default subnets', () => {
    const a = mtParams(1), b = mtParams(1), c = mtParams(2);
    expect(a).toEqual(b); expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    for (let s = 0; s < 300; s++) { const p = mtParams(s); expect(p.lanNet).not.toMatch(/^192\.168\.(70|88)\./); expect(+p.wan.split('.')[3]).toBeGreaterThan(200); }
  });
  it('a reset router fails every checkpoint; the desk PC sits on ether2 instead of SW-LAB', () => {
    const P = mtParams(7); freshLabMt(P, PC);
    expect(plugOf(PC)?.port).toBe('ether2');
    expect(envOf(PC)).not.toBe(ENVS.prak);
    const cs = mtChecks(labMt(), PC, P, seen());
    expect(cs.length).toBe(MT_LABELS(P).length); expect(cs.every(c => !c.ok)).toBe(true);
    dropLabMt(); expect(envOf(PC)).toBe(ENVS.prak);
  });
  it('the UKK answer typed in the console + DHCP client + queue + client test passes all 11', () => {
    const P = mtParams(7), d = freshLabMt(P, PC), S = seen();
    const out = typeLines(d, mtSolution(P)); expect(out.filter(x => x.trim() && !/backup/i.test(x))).toEqual([]);
    const a = adapterOf(PC); Object.assign(a, { dhcp: true, dnsAuto: true }); bounce(a);
    const ip = live(a).ip;
    expect(ip.startsWith(P.lanNet.slice(0, -1))).toBe(true);
    let cs = mtChecks(d, PC, P, S);
    expect(cs.filter(c => !c.ok).map(c => c.label)).toEqual([MT_LABELS(P)[8], MT_LABELS(P)[9]]);
    // a queue for the whole subnet is not a queue for this client
    typeLines(d, [`/queue simple add name=semua target=${P.lanNet}/24 max-limit=${P.qUp}/${P.qDown}`]);
    expect(mtChecks(d, PC, P, S)[8].ok).toBe(false);
    // download/upload swapped fails too ([9]: a/b = upload/download)
    typeLines(d, ['/queue simple remove [find name=semua]', `/queue simple add name=klien target=${ip}/32 max-limit=${P.qDown}/${P.qUp}`]);
    expect(mtChecks(d, PC, P, S)[8].ok).toBe(false);
    typeLines(d, [`/queue simple set [find name=klien] max-limit=${P.qUp}/${P.qDown}`]);
    expect(ping(a, envOf(PC), '8.8.8.8', true).kind).toBe('reply');
    S.pings.set('8.8.8.8', true); S.browse.push('http://www.google.com');
    cs = mtChecks(d, PC, P, S);
    expect(cs.filter(c => !c.ok).map(c => c.label)).toEqual([]);
  });
  it('without NAT the client test fails even with the rest done', () => {
    const P = mtParams(11), d = freshLabMt(P, PC), S = seen();
    typeLines(d, mtSolution(P).filter(l => !/masquerade/.test(l)));
    const a = adapterOf(PC); bounce(a);
    typeLines(d, [`/queue simple add target=${live(a).ip} max-limit=${P.qUp}/${P.qDown}`]);
    S.pings.set('8.8.8.8', true); S.browse.push('http://www.google.com');
    const cs = mtChecks(d, PC, P, S);
    expect(cs[6].ok).toBe(false); expect(cs[9].ok).toBe(false);
    expect(ping(a, envOf(PC), '8.8.8.8', true).kind).not.toBe('reply');
  });
  it('hotspot step: wizard + user + profile rate-limit, then a portal login from the PC', () => {
    const P = mtParams(5), d = freshLabMt(P, PC), S = seen();
    typeLines(d, mtSolution(P));
    const a = adapterOf(PC); bounce(a);
    expect(hsChecks(d, PC, P, S).every(c => !c.ok)).toBe(true);
    // the setup wizard asks the prompts of [11] in order; empty answers keep the defaults
    typeLines(d, ['/ip hotspot setup', 'ether2', '', '', '', '', '', '', '', '', '']);
    typeLines(d, [`/ip hotspot user profile add name=prof-siswa rate-limit=${P.hsRate}`, `/ip hotspot user add name=${P.hsUser} password=${P.hsPass} profile=prof-siswa`]);
    let cs = hsChecks(d, PC, P, S);
    expect(cs.slice(0, 4).every(c => c.ok)).toBe(true); expect(cs[4].ok).toBe(false);
    expect(ping(a, envOf(PC), '8.8.8.8', true).kind).not.toBe('reply');   // behind the portal until login
    expect(rosHotspotLogin(PC, P.hsUser, 'salah')).not.toBe('');
    expect(rosHotspotLogin(PC, P.hsUser, P.hsPass)).toBe('');
    S.browse.push('http://www.google.com');
    cs = hsChecks(d, PC, P, S);
    expect(cs.every(c => c.ok)).toBe(true);
  });
  it('result codes carry the new steps and 9-character PIN sheet codes into the class recap', () => {
    const r = { sheet: 'GGJ0C4VSA', name: 'Rina XI TKJ 2', desk: 4, nilai: 95, predikat: 'Sangat Kompeten' as const, durSec: 1500, overtime: false, when: 1_800_000_000_000, steps: [{ step: 'mikrotik' as const, got: 11, of: 11, done: true }, { step: 'mthotspot' as const, got: 5, of: 5, done: true }] };
    const c = encodeResult(r); expect(decodeResult(c)).toEqual(r);
    expect(readRecap(`hasil saya ${c} makasih`).rows.length).toBe(1);
  });
});
