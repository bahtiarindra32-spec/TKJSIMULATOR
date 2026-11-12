// Fase 2 chunk B2a: MikroTik field orders on the site routers. Each template spawns on the real network simulation,
// fails before the fix, passes after the correct RouterOS console commands (state-graded with checkState), and a wrong
// fix does not pass. Plus the engine gaps: /system resource print, the bridge MAC in /interface print, and an order
// reset putting the site router back to the customer configuration.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, adapterOf, ADAPTERS, ENVS, live, healthy, dhcpHousekeeping } from '../src/pcos/net';
import { CLIENTS } from '../src/pcos/wifi';
import { initSiteClients } from '../src/pcos/sites';
import { SITE_PCS, SITE_AP_DEFS } from '../src/data/sites';
import { mulberry } from '../src/game/noc/util';
import { FIELD_TPLS, TPL_IDS } from '../src/game/field/templates';
import { availableTpls } from '../src/game/field/orders';
import { inject, rootProblem, snapshotSites, restoreSites, ok, ap, siteDevices, type Injected } from '../src/game/field/sim';
import { rosTestEvent, ROS_TPL_IDS, rosGrade } from '../src/game/field/simros';
import { siteRouter, customerConfig } from '../src/pcos/siterouters';
import { RosCli, rosThroughput, rosHotspotLogin, rosNeedsLogin, identity, wanStatus, rows, exportCfg, ifMac } from '../src/pcos/routeros';

const ALL = ['PROP_L1_PC_01', ...SITE_PCS.map(p => p.name)];
let SNAP: ReturnType<typeof snapshotSites>;
const fresh = () => {
  ADAPTERS.clear();
  CLIENTS.clear();
  initSwitches(ALL);
  initSiteClients();
  for (const e of [ENVS.rumah, ENVS.kos, ENVS.warnet]) e.leases.clear();
  for (const d of SITE_AP_DEFS) Object.assign(ap(d.id), { mounted: true, radio: true, ssid: d.ssid, key: d.key, sec: 'WPA2-PSK', ch: d.ch, power: 'Tinggi' });
  SNAP = snapshotSites();
};
const cli = (site: 'kos' | 'warnet') => new RosCli(siteRouter(site)!);
/** type console lines; every line must be accepted silently (wizard answers included) */
function typeAll(c: RosCli, lines: string[]) {
  for (const l of lines) {
    const out = c.run(l);
    expect(out, l).not.toMatch(/failure|invalid value|syntax error|bad command|expected end|does not match|no such item/);
  }
}
const primary = (i: Injected) => i.targets.find(t => t.primary)!.pc;
/** the order letter values: "Batas per kamar: upload 1M, download 3M." → ['1M', '3M'] */
const rateOf = (i: Injected) => String(i.data.rate).split('/');
/** the healthy-site check done at the end of every order: all targets ok and the root cause gone */
function passes(i: Injected) {
  return rootProblem(i) === '' && i.targets.every(t => ok(t.pc));
}

describe('Fase 2 engine gaps', () => {
  beforeEach(fresh);
  it('/system resource print shows the model spec (product page values) and a live uptime', () => {
    const k = cli('kos').run('/system resource print');
    expect(k).toMatch(/uptime: \d+s/);
    expect(k).toMatch(/version: 7\.\d+\.\d+ \(stable\)/);
    expect(k).toMatch(/total-memory: 32\.0MiB/);
    expect(k).toMatch(/cpu: QCA9533/);
    expect(k).toMatch(/cpu-frequency: 650MHz/);
    expect(k).toMatch(/total-hdd-space: 16\.0MiB/);
    expect(k).toMatch(/architecture-name: smips/);
    expect(k).toMatch(/board-name: hAP lite/);
    const w = cli('warnet').run('/system resource print');
    expect(w).toMatch(/cpu: AR9344/);
    expect(w).toMatch(/cpu-frequency: 600MHz/);
    expect(w).toMatch(/total-memory: 128\.0MiB/);
    expect(w).toMatch(/architecture-name: mipsbe/);
    // free memory is below total; abbreviations work like every other menu
    const free = +/free-memory: ([\d.]+)MiB/.exec(w)![1];
    expect(free).toBeGreaterThan(0);
    expect(free).toBeLessThan(128);
    expect(cli('kos').run('/sys reso pr')).toMatch(/cpu: QCA9533/);
    expect(cli('kos').run('/system resource print detail')).toMatch(/expected end of command/);
  });
  it('/interface print shows the bridge MAC (taken from its first port)', () => {
    const d = siteRouter('warnet')!;
    const out = new RosCli(d).run('/interface print');
    const line = out.split('\n').find(l => /bridge-lan\s+bridge/.test(l))!;
    expect(line).toBeTruthy();
    expect(line).toContain(ifMac(d, 'ether2'));
    expect(ifMac(d, 'bridge-lan')).toMatch(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
  });
  it('an order reset puts the site router back to the customer configuration', () => {
    const k = siteRouter('kos')!, w = siteRouter('warnet')!;
    const before = { k: exportCfg(k), w: exportCfg(w) };
    typeAll(cli('kos'), ['/system identity set name=RUSAK', '/ip firewall nat disable [find action=masquerade]', '/system backup save name=x']);
    const cw = cli('warnet'); cw.run('/system reset-configuration'); cw.run('y');
    expect(identity(w)).toBe('MikroTik');
    expect(healthy(adapterOf('PROP_KOS_01_LAPTOP_K1'))).toBe(false);
    restoreSites(SNAP, 'kos');
    expect(identity(k)).toBe('KOS-01');
    expect(exportCfg(k)).toBe(before.k);
    expect(k.files.size).toBe(0);
    expect(identity(w)).toBe('MikroTik');            // only the order's site
    restoreSites(SNAP);
    expect(exportCfg(w)).toBe(before.w);
    for (const c of ['rumah', 'kos', 'warnet'] as const) for (const n of siteDevices(c)) expect(ok(n), n).toBe(true);
    expect(customerConfig('warnet').join('\n')).toMatch(/address=10\.20\.1\.10\/24 interface=ether1/);
  });
});

describe('Fase 2 MikroTik order templates', () => {
  beforeEach(fresh);
  it('the four templates exist, are MikroTik orders priced inside existing ranges and are gated by reputasi', () => {
    expect(ROS_TPL_IDS.every(id => TPL_IDS.includes(id) && FIELD_TPLS[id].ros)).toBe(true);
    for (const id of ROS_TPL_IDS) {
      const [lo, hi] = FIELD_TPLS[id].tarif;
      expect(lo).toBeGreaterThanOrEqual(150_000);
      expect(hi).toBeLessThanOrEqual(700_000);
    }
    expect(availableTpls({ rumah: 50, kos: 50, warnet: 50 })).not.toContain('w_hotspot');
    expect(availableTpls({ rumah: 50, kos: 60, warnet: 60 })).toEqual(expect.arrayContaining(ROS_TPL_IDS));
  });

  it('w_hotspot: hotspot + N vouchers with a user-profile rate-limit, tested by a voucher login from the booth PC', () => {
    for (let seed = 1; seed <= 4; seed++) {
      fresh();
      const i = inject('w_hotspot', mulberry(seed))!;
      expect(i, `seed ${seed}`).not.toBeNull();
      const pc = primary(i);
      const users = i.ros!.spec.hotspot!.users!;
      expect(users.length).toBeGreaterThanOrEqual(3);
      expect(i.lines!.join(' ')).toContain(`${users[0].name} / ${users[0].password}`);
      expect(rootProblem(i)).toMatch(/hotspot/);
      const [up, down] = rateOf(i);
      const c = cli('warnet');
      // wrong fix first: hotspot wizard + users, but the profile rate-limit typed the wrong way round (tx/rx)
      typeAll(c, ['/ip hotspot setup', 'bridge-lan', '', '', '', '', '', '', '', '', '']);
      typeAll(c, [`/ip hotspot user profile add name=voucher rate-limit=${down}/${up}`, ...users.map(u => `/ip hotspot user add name=${u.name} password=${u.password} profile=voucher`)]);
      expect(rootProblem(i)).toMatch(/rate-limit/);
      expect(passes(i)).toBe(false);
      typeAll(c, [`/ip hotspot user profile set voucher rate-limit=${up}/${down}`]);
      // configuration right, but nobody has logged in with a voucher yet: the booth PC sits on the login page
      expect(rootProblem(i)).toMatch(/uji login/);
      expect(rosNeedsLogin(pc)).toBe(true);
      expect(ok(pc)).toBe(false);
      expect(rosHotspotLogin(pc, users[0].name, 'salah')).toMatch(/invalid/);
      expect(rosHotspotLogin(pc, 'admin', '')).toBe('');            // the wizard's admin user is not a voucher
      expect(rootProblem(i)).toMatch(/uji login/);
      expect(rosHotspotLogin(pc, users[1].name, users[1].password ?? '')).toBe('');
      expect(passes(i)).toBe(true);
      // the voucher's limit really applies (dynamic queue from the user profile)
      const t = rosThroughput(pc)!;
      expect([t.up, t.down]).toEqual([up, down].map(x => parseInt(x) * 1e6));
    }
  });

  it('k_queue: one simple queue per room with the ordered max-limit, verified by the speed test from the tenant laptop', () => {
    for (let seed = 1; seed <= 4; seed++) {
      fresh();
      const i = inject('k_queue', mulberry(seed))!;
      expect(i).not.toBeNull();
      const pc = primary(i);
      const [up, down] = rateOf(i);
      const rooms = i.ros!.spec.queues!.map(q => q.target);
      expect(rooms.length).toBe(4);
      expect(rootProblem(i)).toMatch(/queue/);
      expect(rosThroughput(pc)!.down).toBe(20e6);                   // no limit yet: the whole ISP plan
      expect(rosTestEvent(i.ros!, 'speed', { down: 20e6, up: 20e6 })).toBe(false);
      const c = cli('kos');
      // wrong 1: one shared queue for the whole subnet (not per room)
      typeAll(c, [`/queue simple add name=semua target=192.168.0.0/24 max-limit=${up}/${down}`]);
      expect(rootProblem(i)).toMatch(/khusus klien/);
      typeAll(c, ['/queue simple remove [find name=semua]']);
      // wrong 2: per room but upload/download swapped
      typeAll(c, rooms.map((ip, k) => `/queue simple add name=kamar${k} target=${ip}/32 max-limit=${down}/${up}`));
      expect(rootProblem(i)).toMatch(/queue/);
      expect(passes(i)).toBe(false);
      // wrong 3: right values but one queue on the gateway instead of the laptop
      typeAll(c, ['/queue simple remove [find]', ...rooms.map((ip, k) => `/queue simple add name=kamar${k} target=${k === 0 ? '192.168.0.1' : ip}/32 max-limit=${up}/${down}`)]);
      expect(passes(i)).toBe(false);
      // correct
      typeAll(c, ['/queue simple remove [find]', ...rooms.map((ip, k) => `/queue simple add name=kamar${k + 1} target=${ip}/32 max-limit=${up}/${down}`)]);
      expect(rootProblem(i)).toBe('');
      expect(passes(i)).toBe(true);
      const t = rosThroughput(pc)!;
      expect([t.up, t.down]).toEqual([up, down].map(x => parseInt(x) * 1e6));
      expect(rosTestEvent(i.ros!, 'speed', { down: t.down, up: t.up })).toBe(true);
      expect(rosTestEvent(i.ros!, 'browse', undefined)).toBe(false);   // a plain page visit is not the test
    }
  });

  it('k_fasttrack: pre-seeded queues are bypassed by a fasttrack rule; disabling it (or an accept above it) fixes it, touching the queues does not', () => {
    for (let seed = 1; seed <= 4; seed++) {
      fresh();
      const i = inject('k_fasttrack', mulberry(seed))!;
      expect(i).not.toBeNull();
      const pc = primary(i);
      const [up, down] = rateOf(i);
      const d = siteRouter('kos')!;
      expect(rows(d, '/queue simple').length).toBe(4);
      const t0 = rosThroughput(pc)!;
      expect(t0.bypassed).toBe(true);
      expect(t0.down).toBe(20e6);                                     // the complaint: the limit is ignored
      expect(rootProblem(i)).toMatch(/FastTrack/);
      expect(ok(pc)).toBe(true);
      const c = cli('kos');
      // wrong fix: lowering / removing the queues does not make the agreed limit work
      typeAll(c, [`/queue simple set [find] max-limit=512k/512k`]);
      expect(passes(i)).toBe(false);
      typeAll(c, [`/queue simple set [find] max-limit=${up}/${down}`]);
      typeAll(c, ['/queue simple disable [find]']);
      expect(passes(i)).toBe(false);
      typeAll(c, ['/queue simple enable [find]']);
      expect(passes(i)).toBe(false);
      if (seed % 2) typeAll(c, ['/ip firewall filter disable [find action=fasttrack-connection]']);
      else typeAll(c, ['/ip firewall filter print', '/ip firewall filter add chain=forward action=accept connection-state=established,related place-before=0']);
      expect(rootProblem(i)).toBe('');
      expect(passes(i)).toBe(true);
      const t = rosThroughput(pc)!;
      expect(t.bypassed).toBe(false);
      expect([t.up, t.down]).toEqual([up, down].map(x => parseInt(x) * 1e6));
      expect(rosTestEvent(i.ros!, 'speed', { down: t.down, up: t.up })).toBe(true);
    }
  });

  it('w_reset: factory default (192.168.88.1, DHCP client on a static ISP line) kills the internet; the backup or the retyped config brings it back', () => {
    for (const how of ['backup', 'retype', 'wrong'] as const) {
      fresh();
      const i = inject('w_reset', mulberry(3))!;
      expect(i).not.toBeNull();
      const d = siteRouter('warnet')!;
      const pc = primary(i);
      expect(identity(d)).toBe('MikroTik');
      expect(wanStatus(d).ok).toBe(false);
      expect(ok(pc)).toBe(false);
      expect(live(adapterOf(pc)).ip).toMatch(/^192\.168\.88\./);       // the clients now sit on the default LAN
      expect(d.files.has('auto-before-reset.backup')).toBe(true);
      expect(new RosCli(d).run('/file print')).toContain('auto-before-reset.backup');
      expect(rootProblem(i)).not.toBe('');
      const c = new RosCli(d);
      if (how === 'backup') {
        c.run('/system backup load name=auto-before-reset.backup');
        c.run('');                                                     // password: empty
        expect(c.run('y')).toMatch(/restored/);
      } else if (how === 'retype') {
        typeAll(c, [
          '/system reset-configuration no-defaults=yes skip-backup=yes', 'y',
          '/system identity set name=WARNET-01',
          '/interface bridge add name=br-lan',
          ...['ether2', 'ether3', 'ether4', 'ether5'].map(e => `/interface bridge port add bridge=br-lan interface=${e}`),
          '/ip address add address=192.168.100.1/24 interface=br-lan',
          '/ip address add address=10.20.1.10/24 interface=ether1',
          '/ip route add gateway=10.20.1.1',
          '/ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes',
          '/ip pool add name=lan ranges=192.168.100.100-192.168.100.199',
          '/ip dhcp-server add interface=br-lan address-pool=lan',
          '/ip dhcp-server network add address=192.168.100.0/24 gateway=192.168.100.1 dns-server=192.168.100.1',
          '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade',
        ]);
      } else {
        // wrong: the default LAN kept, only the identity and a DHCP client "fix"
        typeAll(c, ['/system identity set name=WARNET-01']);
        expect(rootProblem(i)).toMatch(/WAN|alamat|route/);
        expect(passes(i)).toBe(false);
        continue;
      }
      dhcpHousekeeping();                                              // the PCs ask again (stale 192.168.88.x lease)
      expect(wanStatus(d).ok).toBe(true);
      expect(rosGrade(i.ros!).ok).toBe(true);
      expect(live(adapterOf(pc)).ip).toMatch(/^192\.168\.100\./);
      expect(passes(i), `${how}: ${rootProblem(i)}`).toBe(true);
      for (const n of siteDevices('warnet')) expect(ok(n), n).toBe(true);
    }
  });

  it('every MikroTik template spawns on all seeds and an accepted order does not touch the other sites', () => {
    for (const tpl of ROS_TPL_IDS)
      for (let seed = 1; seed <= 6; seed++) {
        fresh();
        const i = inject(tpl, mulberry(seed));
        expect(i, `${tpl} seed ${seed}`).not.toBeNull();
        expect(rootProblem(i!), `${tpl} seed ${seed}`).not.toBe('');
        const other = FIELD_TPLS[tpl].cust === 'kos' ? 'warnet' : 'kos';
        for (const n of [...siteDevices('rumah'), ...siteDevices(other)]) expect(ok(n), n).toBe(true);
      }
  });
});
