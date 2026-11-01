// Unit tests for the network simulation (pure TS): structured cabling, VLANs, DHCP, gateway/DNS faults, loops.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, portOf, panelOf, patchCord, envOf, adapterOf, live, healthy, ping, resolve, stormOn, uplinkCarries, ADAPTERS, SWITCHES, outletOf, bounce } from '../src/pcos/net';

const PCS = [
  ...Array.from({ length: 12 }, (_, i) => `PROP_L1_PC_${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 24 }, (_, i) => `PROP_L2_PC_${String(i + 1).padStart(2, '0')}`),
];
const L2 = 'PROP_L2_PC_05';
const fresh = () => { ADAPTERS.clear(); initSwitches(PCS); };

describe('structured cabling', () => {
  beforeEach(fresh);
  it('patches every desk outlet to a switch port, panel number != switch port after the spare outlet', () => {
    const q = panelOf(L2)!; const p = portOf(L2)!;
    expect(q.sw.name).toBe('SW-L2');
    expect(q.pp.n).toBe(6);            // 4 outlets + 1 spare, so the 5th PC sits on panel port 6
    expect(p.port.n).toBe(5);
    expect(outletOf(L2)).toBe('L2-06');
  });
  it('an unpatched outlet has no switch port and no network', () => {
    const q = panelOf(L2)!; patchCord(q.sw, q.pp.n, null);
    expect(portOf(L2)).toBeNull();
    expect(envOf(L2).id).toBe('none');
  });
});

describe('VLAN and switch ports', () => {
  beforeEach(fresh);
  it('office floor PCs land in the office segment (VLAN 20)', () => { expect(envOf(L2).id).toBe('office'); expect(envOf('PROP_L1_PC_01').id).toBe('lab'); });
  it('a VLAN that does not exist on the switch makes the port inactive', () => { portOf(L2)!.port.vlan = 99; expect(envOf(L2).id).toBe('none'); });
  it('a trunk that does not allow the VLAN cuts the floor off from the routers', () => {
    const sw = SWITCHES.find(s => s.name === 'SW-L2')!; expect(uplinkCarries(sw, 20)).toBe(true);
    sw.uplink!.allowed = [1, 30]; expect(uplinkCarries(sw, 20)).toBe(false); expect(envOf(L2).id).toBe('none');
  });
  it('two switch ports cabled together cause a broadcast storm until one is shut down', () => {
    const sw = SWITCHES.find(s => s.name === 'SW-L2')!; sw.loop = [30, 31]; sw.ports[29].shutdown = false; sw.ports[30].shutdown = false;
    expect(stormOn(sw)).toBe(true); expect(envOf(L2).id).toBe('none');
    sw.ports[30].shutdown = true; expect(stormOn(sw)).toBe(false); expect(envOf(L2).id).toBe('office');
  });
});

describe('client configuration', () => {
  beforeEach(fresh);
  it('DHCP gives a healthy address on the right subnet', () => {
    const a = adapterOf(L2); const l = live(a);
    expect(l.ok).toBe(true); expect(l.ip.startsWith('192.168.20.')).toBe(true); expect(healthy(a)).toBe(true);
  });
  it('an unplugged cable means media disconnected', () => {
    const a = adapterOf(L2); a.cable = false; bounce(a);
    expect(live(a).why).toBe('media'); expect(healthy(a)).toBe(false);
  });
  it('a wrong default gateway still pings the LAN but not the internet', () => {
    const a = adapterOf(L2), env = envOf(L2), l = live(a);
    a.dhcp = false; a.ip = l.ip; a.mask = '255.255.255.0'; a.gw = '192.168.20.254'; a.dns1 = env.gateway; a.dnsAuto = false;
    expect(ping(a, env, env.gateway, true).kind).toBe('reply');
    expect(ping(a, env, '8.8.8.8', true).kind).not.toBe('reply');
    expect(healthy(a)).toBe(false);
  });
  it('a wrong DNS server breaks name resolution while IP connectivity works', () => {
    const a = adapterOf(L2), env = envOf(L2);
    a.dnsAuto = false; a.dns1 = '10.10.10.53'; a.dns2 = '';
    expect(ping(a, env, '8.8.8.8', true).kind).toBe('reply');
    const r = resolve(a, env, 'cari.id'); expect(r === null || r === 'timeout' || r === 'servfail').toBe(true);
  });
});
