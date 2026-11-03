// R-EDGE dual-ISP NAT: one dynamic mapping per access list, route-maps per exit interface.
import { describe, it, expect } from 'vitest';
import { EDGE, EdgeShell, edgeCheck } from '../src/pcos/edge';

const io = { edit() {}, close() {} };
const cli = (lines: string[]) => { const sh = new EdgeShell(); sh.exec('', io); return lines.map(l => sh.exec(l, io) ?? ''); };
describe('R-EDGE NAT with two ISPs', () => {
  it('ships with a route-map per ISP and fails over with NAT on Gi0/1', () => {
    expect([...EDGE.rmaps.keys()]).toEqual(['ISP1', 'ISP2']);
    expect(edgeCheck('192.168.20.101', '103.10.20.30').ok).toBe(true);
    EDGE.isp[1].up = false;
    expect(edgeCheck('192.168.20.101', '103.10.20.30')).toMatchObject({ ok: true });
    EDGE.isp[1].up = true;
  });
  it('a second "list 1" mapping replaces the first, as on IOS; route-maps keep both', () => {
    const saveNat = EDGE.nat.map(n => ({ ...n }));
    cli(['enable', 'conf t', 'no ip nat inside source route-map ISP1 interface gi0/0 overload', 'no ip nat inside source route-map ISP2 interface gi0/1 overload', 'ip nat inside source list 1 interface gi0/0 overload']);
    const out = cli(['enable', 'conf t', 'ip nat inside source list 1 interface gi0/1 overload']);
    expect(out[2]).toMatch(/diganti/);
    expect(EDGE.nat).toHaveLength(1);
    expect(edgeCheck('192.168.20.101', '103.10.20.30').ok).toBe(false);     // ISP1 is the active route, but its NAT is gone
    const r = cli(['enable', 'conf t', 'ip nat inside source route-map ISP1 interface gi0/0 overload', 'end', 'show running-config']);
    expect(edgeCheck('192.168.20.101', '103.10.20.30').ok).toBe(true);
    expect(r.at(-1)).toMatch(/route-map ISP1 permit 10\n match ip address 1\n match interface GigabitEthernet0\/0/);
    EDGE.nat = saveNat;
  });
});
