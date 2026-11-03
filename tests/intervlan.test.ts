// Router-on-a-stick in the Lab Praktik (R-LAB + SW-LAB) and the VLSM grader. Pure netsim, real CLI lines.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, envOf, adapterOf, ping, ADAPTERS, SWITCHES, ENVS } from '../src/pcos/net';
import { LabRouterShell, LABR, resetLabRouter, labPermits } from '../src/pcos/labrouter';
import { SwitchCli } from '../src/pcos/switchcli';
import { vlsmCase, vlsmKey, vlsmCheck, prefixFor } from '../src/game/vlsm';

// SwitchCli builds its terminal with DOM calls: a tiny stand-in is enough for the command logic
const fake = (): any => new Proxy({ textContent: '', className: '', value: '', style: {}, children: [] as unknown[] }, { get: (t: any, k) => (k in t ? t[k] : () => fake()), set: (t: any, k, v) => { t[k] = v; return true; } });
(globalThis as any).document ??= { createElement: () => fake() };
const LABPCS = Array.from({ length: 8 }, (_, i) => `PROP_LAB_PC_${String(i + 1).padStart(2, '0')}`);
const A = LABPCS[2], B = LABPCS[5], C = LABPCS[0];
const io = { edit() {}, close() {} };
const router = (lines: string[]) => { const sh = new LabRouterShell(); sh.exec('', io); return lines.map(l => sh.exec(l, io) ?? ''); };
const sw = () => SWITCHES.find(s => s.name === 'SW-LAB')!;
const swcli = (lines: string[]) => { const c = new SwitchCli(sw()); for (const l of ['', ...lines]) (c as unknown as { exec(l: string): void }).exec(l); };
const setIp = (pc: string, ip: string, mask: string, gw: string) => Object.assign(adapterOf(pc), { dhcp: false, ip, mask, gw, dnsAuto: false, dns1: gw, dns2: '', lease: undefined });
const pingOk = (from: string, to: string) => ping(adapterOf(from), envOf(from), to, true).kind === 'reply';

describe('R-LAB router-on-a-stick', () => {
  beforeEach(() => { ADAPTERS.clear(); initSwitches(LABPCS); resetLabRouter(); });
  it('everyday lab: all desks on VLAN 70 behind Gi0/0', () => {
    expect(envOf(A)).toBe(ENVS.prak);
    expect(sw().ports[23].peer).toBeTruthy();
  });
  it('VLAN 10 and 20 only route after trunk + dot1Q subinterfaces; the other desks keep VLAN 70 via native vlan', () => {
    swcli(['enable', 'conf t', 'vlan 10', 'name GURU', 'vlan 20', 'name SISWA', 'interface g1/0/6', 'switchport access vlan 10', 'interface g1/0/3', 'switchport access vlan 20']);
    expect(envOf(A).id).toBe('none');                      // VLAN 20 exists on the switch, but no router serves it
    swcli(['enable', 'conf t', 'interface g1/0/24', 'switchport mode trunk']);
    expect(envOf(C).id).toBe('none');                      // native VLAN 1: the untagged VLAN 70 desks lost their gateway
    swcli(['enable', 'conf t', 'interface g1/0/24', 'switchport trunk native vlan 70']);
    expect(envOf(C)).toBe(ENVS.prak);
    const out = router(['enable', 'conf t', 'interface g0/0.20', 'ip address 192.168.80.1 255.255.255.128']);
    expect(out[3]).toMatch(/802\.1Q/);                      // IOS refuses an address before encapsulation
    router(['enable', 'conf t', 'interface g0/0.20', 'encapsulation dot1Q 20', 'ip address 192.168.80.1 255.255.255.128', 'interface g0/0.10', 'encapsulation dot1Q 10', 'ip address 192.168.80.129 255.255.255.192']);
    expect(envOf(A).id).toBe('v20'); expect(envOf(B).id).toBe('v10');
    setIp(A, '192.168.80.10', '255.255.255.128', '192.168.80.1');
    setIp(B, '192.168.80.138', '255.255.255.192', '192.168.80.129');
    expect(pingOk(A, '192.168.80.1')).toBe(true);
    expect(pingOk(A, '192.168.80.138')).toBe(true);        // across VLANs through the router
    setIp(B, '192.168.80.138', '255.255.255.192', '192.168.80.1');
    expect(pingOk(A, '192.168.80.138')).toBe(false);       // wrong gateway on the far PC: the reply has no way back
  });
  it('an ACL in on Gi0/0.20 blocks SISWA → GURU but keeps the lab server', () => {
    swcli(['enable', 'conf t', 'vlan 10', 'vlan 20', 'interface g1/0/6', 'switchport access vlan 10', 'interface g1/0/3', 'switchport access vlan 20', 'interface g1/0/24', 'switchport mode trunk', 'switchport trunk native vlan 70']);
    router(['enable', 'conf t', 'interface g0/0.20', 'encapsulation dot1Q 20', 'ip address 192.168.80.1 255.255.255.128', 'interface g0/0.10', 'encapsulation dot1Q 10', 'ip address 192.168.80.129 255.255.255.192']);
    setIp(A, '192.168.80.10', '255.255.255.128', '192.168.80.1'); setIp(B, '192.168.80.138', '255.255.255.192', '192.168.80.129');
    expect(envOf(A).id).toBe('v20'); expect(pingOk(A, '192.168.80.138')).toBe(true);
    router(['enable', 'conf t', 'access-list 110 deny ip 192.168.80.0 0.0.0.127 192.168.80.128 0.0.0.63', 'access-list 110 permit ip any any', 'interface g0/0.20', 'ip access-group 110 in']);
    expect(pingOk(A, '192.168.80.138')).toBe(false);
    expect(pingOk(A, '192.168.70.10')).toBe(true);
    expect(labPermits(envOf(B), '192.168.80.138', '192.168.80.10')).toBe(true);   // GURU → SISWA is not filtered
    expect(LABR.subs.get(20)!.aclIn).toBe(110);
  });
});

describe('VLSM grader', () => {
  it('prefix for host counts', () => { expect(prefixFor(100)).toBe(25); expect(prefixFor(62)).toBe(26); expect(prefixFor(63)).toBe(25); expect(prefixFor(14)).toBe(28); expect(prefixFor(2)).toBe(30); });
  it('the key passes, a misaligned or overlapping design does not', () => {
    for (let s = 1; s < 40; s++) { const p = vlsmCase(s); expect(vlsmCheck(p, vlsmKey(p)).every(r => r.netOk && r.hostsOk)).toBe(true); }
    const p = vlsmCase(7), k = vlsmKey(p);
    const bad = k.map(r => ({ ...r })); bad[2] = { ...k[1] };     // SERVER copies GURU's network
    const r = vlsmCheck(p, bad); expect(r[2].netOk).toBe(false);
    const wrongBc = k.map(r => ({ ...r })); wrongBc[0].bc = '192.168.1.1';
    expect(vlsmCheck(p, wrongBc)[0].hostsOk).toBe(false);
  });
  it('another valid order (smallest first) is accepted too', () => {
    const p = { block: '192.168.90.0/24', needs: [{ name: 'A', hosts: 100 }, { name: 'B', hosts: 2 }] };
    expect(vlsmCheck(p, [{ net: '192.168.90.128', prefix: 25, gw: '192.168.90.129', bc: '192.168.90.255' }, { net: '192.168.90.0', prefix: 30, gw: '192.168.90.1', bc: '192.168.90.3' }]).every(r => r.netOk && r.hostsOk)).toBe(true);
  });
});
