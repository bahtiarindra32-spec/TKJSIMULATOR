// Fase 2 chunk A: MikroTik RouterOS v7 engine — parser, every command group, default config, wizards, NAT/firewall
// first-match, the FastTrack + simple queue bug, hotspot gating, backup/restore, error messages, netsim reachability, checkState.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDevice, RosCli, rosLogin, tokenize, rows, single, exportCfg, wanStatus, dhcpFor, clientInternet, evalFilter, MODELS, DEFAULT_ISP,
  attachRouterOs, plugClient, unplugClient, setWanCable, resetRouterOsNet, rosHotspotLogin, rosNeedsLogin, rosThroughput, rosSegment, checkState,
  type RosDevice,
} from '../src/pcos/routeros';
import { ADAPTERS, adapterOf, envOf, live, ping, healthy, resolve, ENVS } from '../src/pcos/net';

const A = 'PROP_MT_PC_A', B = 'PROP_MT_PC_B', W = 'PROP_MT_LAPTOP_W';
/** a terminal on the device; returns every line's output */
const term = (d: RosDevice) => { const c = new RosCli(d); const run = (...ls: string[]) => ls.map(l => c.run(l)); return { c, run, one: (l: string) => c.run(l) }; };
/** a hAP lite with its defaults, ISP on ether1, PC A on ether2 */
function lab(model: 'RB941-2nD' | 'RB951Ui-2HnD' = 'RB941-2nD') {
  const d = createDevice(model, { id: `t${Math.random().toString(36).slice(2, 8)}` });
  attachRouterOs(d); plugClient(d, 'ether2', A);
  return d;
}
const ip = (pc: string) => live(adapterOf(pc)).ip;
const pingOk = (pc: string, to: string, quiet = true) => ping(adapterOf(pc), envOf(pc), to, quiet).kind === 'reply';
const renew = (pc: string) => { const a = adapterOf(pc); a.lease = undefined; for (const e of [envOf(pc)]) e.leases.delete(a.mac); };
/** answer a wizard: every value in turn ('' = accept the default); returns all outputs incl. the final message */
const wizard = (c: RosCli, cmd: string, answers: string[]) => { const out = [c.run(cmd)]; const qs = [c.prompt()]; for (const a of answers) { out.push(c.run(a)); qs.push(c.prompt()); } return { out, qs }; };

beforeEach(() => { resetRouterOsNet(); ADAPTERS.clear(); });

// ------------------------------------------------------------------------------------------------ parser
describe('parser and navigation', () => {
  it('tokenizer keeps quoted values and [find …] as one token', () => {
    expect(tokenize('add comment="LAN utama" address=1.2.3.4/24').map(t => t.t)).toEqual(['add', 'comment=LAN utama', 'address=1.2.3.4/24']);
    expect(tokenize('remove [find where interface=ether1]').map(t => t.t)).toEqual(['remove', '[find where interface=ether1]']);
    expect(tokenize('  /ip   address').map(t => t.col)).toEqual([3, 9]);
  });
  it('menu paths, .. and / change the prompt; the identity is in the prompt', () => {
    const { c, run } = term(createDevice('RB941-2nD'));
    expect(c.prompt()).toBe('[admin@MikroTik] > ');
    run('/ip address'); expect(c.prompt()).toBe('[admin@MikroTik] /ip address> ');
    run('..'); expect(c.prompt()).toBe('[admin@MikroTik] /ip> ');
    run('firewall nat'); expect(c.prompt()).toBe('[admin@MikroTik] /ip firewall nat> ');
    run('/'); expect(c.prompt()).toBe('[admin@MikroTik] > ');
  });
  it('accepts unambiguous abbreviations and the v7 slash syntax', () => {
    const { one } = term(createDevice('RB941-2nD'));
    expect(one('/ip addr pr')).toMatch(/192\.168\.88\.1\/24/);
    expect(one('/ip/address/print')).toMatch(/192\.168\.88\.1\/24/);
    expect(one('/ip fire nat print')).toMatch(/masquerade/);
  });
  it('bad command name and expected end of command carry the column', () => {
    const { one } = term(createDevice('RB941-2nD'));
    expect(one('/ip adress print')).toBe('bad command name adress (line 1 column 5)');
    expect(one('/ip address add address=10.1.1.1/24 interface=ether1 foo=1')).toBe('expected end of command (line 1 column 54)');
    expect(one('/ip address print bogus')).toBe('expected end of command (line 1 column 19)');
  });
  it('commands of the root are not available inside a menu', () => {
    const { run } = term(createDevice('RB941-2nD'));
    expect(run('/ip address', 'ping 8.8.8.8')[1]).toBe('bad command name ping (line 1 column 1)');
  });
  it('argument names may be abbreviated (to-address → to-addresses)', () => {
    const d = createDevice('RB941-2nD'); const { one } = term(d);
    expect(one('/ip firewall nat add chain=dstnat protocol=tcp port=3389 in-interface=ether1 action=dst-nat to-address=192.168.88.254')).toBe('');
    expect(rows(d, '/ip firewall nat').at(-1)!.p['to-addresses']).toBe('192.168.88.254');
  });
});

// ------------------------------------------------------------------------------------------------ device + defaults
describe('models and default configuration', () => {
  it('hAP lite: ether1–4 + wlan1, 32 MB/16 MB; RB951Ui: ether1–5 with PoE-out on ether5', () => {
    const h = createDevice('RB941-2nD'); const r = createDevice('RB951Ui-2HnD');
    expect(rows(h, '/interface ethernet').map(x => x.p.name)).toEqual(['ether1', 'ether2', 'ether3', 'ether4']);
    expect(rows(r, '/interface ethernet').map(x => x.p.name)).toEqual(['ether1', 'ether2', 'ether3', 'ether4', 'ether5']);
    expect(rows(h, '/interface wireless')[0].p.name).toBe('wlan1');
    expect([MODELS['RB941-2nD'].ramMB, MODELS['RB941-2nD'].storageMB, MODELS['RB951Ui-2HnD'].poeOut]).toEqual([32, 16, 'ether5']);
  });
  it('AP Router defconf: ether1 WAN DHCP client, the rest + wlan1 in the LAN bridge with 192.168.88.1/24', () => {
    const d = createDevice('RB951Ui-2HnD');
    expect(rows(d, '/ip dhcp-client').map(r => r.p.interface)).toEqual(['ether1']);
    expect(rows(d, '/interface bridge port').map(r => r.p.interface)).toEqual(['ether2', 'ether3', 'ether4', 'ether5', 'wlan1']);
    expect(rows(d, '/ip address')[0].p).toMatchObject({ address: '192.168.88.1/24', interface: 'bridge', network: '192.168.88.0' });
  });
  it('defconf DHCP server pool 192.168.88.10–254, DNS allow-remote, masquerade on ether1', () => {
    const d = createDevice('RB941-2nD');
    expect(rows(d, '/ip pool')[0].p.ranges).toBe('192.168.88.10-192.168.88.254');
    expect(dhcpFor(d, 'bridge')).toMatchObject({ start: '192.168.88.10', end: '192.168.88.254', gw: '192.168.88.1', dns: ['192.168.88.1'] });
    expect(single(d, '/ip dns')['allow-remote-requests']).toBe('yes');
    expect(rows(d, '/ip firewall nat')[0].p).toMatchObject({ chain: 'srcnat', action: 'masquerade', 'out-interface': 'ether1' });
  });
  it('defconf firewall: input protection and a forward FastTrack rule (the [5] rule set)', () => {
    const f = rows(createDevice('RB941-2nD'), '/ip firewall filter');
    expect(f.filter(r => r.p.chain === 'input')).toHaveLength(6);
    expect(f.find(r => r.p.action === 'fasttrack-connection')!.p['connection-state']).toBe('established,related');
    expect(f.at(-1)!.p).toMatchObject({ chain: 'forward', action: 'drop', 'connection-nat-state': '!dstnat', 'in-interface': 'ether1' });
  });
  it('identity MikroTik, user admin with an empty password, wlan1 in ap-bridge', () => {
    const d = createDevice('RB941-2nD');
    expect(single(d, '/system identity').name).toBe('MikroTik');
    expect(rosLogin(d, 'admin', '')).not.toBeNull();
    expect(rosLogin(d, 'admin', 'x')).toBeNull();
    expect(rows(d, '/interface wireless')[0].p).toMatchObject({ mode: 'ap-bridge', band: '2ghz-b/g/n' });
    expect(rows(d, '/interface wireless')[0].p.ssid).toMatch(/^MikroTik-[0-9A-F]{6}$/);
  });
  it('reset-configuration no-defaults=yes skip-backup=yes asks first, then leaves a bare router', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    run('/system identity set name=R1');
    expect(run('/system reset-configuration no-defaults=yes skip-backup=yes')[0]).toBe('');
    expect(c.prompt()).toBe('Dangerous! Reset anyway? [y/N]: ');
    expect(c.run('y')).toBe('system configuration will be reset');
    expect(rows(d, '/ip address')).toHaveLength(0);
    expect(rows(d, '/ip firewall filter')).toHaveLength(0);
    expect(rows(d, '/interface wireless')[0].disabled).toBe(true);
    expect(single(d, '/system identity').name).toBe('MikroTik');
    expect(d.files.size).toBe(0);
  });
  it('reset without skip-backup saves auto-before-reset.backup; answering N changes nothing', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    run('/system reset-configuration'); expect(c.run('n')).toBe('');
    expect(rows(d, '/ip address')).toHaveLength(1);
    run('/system reset-configuration'); c.run('y');
    expect(d.files.has('auto-before-reset.backup')).toBe(true);
    expect(rows(d, '/ip address')).toHaveLength(1);     // defaults applied again
  });
  it('/system default-configuration print shows the defconf script', () => {
    expect(term(createDevice('RB941-2nD')).one('/system default-configuration print')).toMatch(/\/ip address\s+add address=192\.168\.88\.1\/24/);
  });
});

// ------------------------------------------------------------------------------------------------ command groups
describe('command groups', () => {
  it('/system identity set changes the prompt', () => {
    const { c, run } = term(createDevice('RB941-2nD'));
    run('/system identity set name=R-UKK'); expect(c.prompt()).toBe('[admin@R-UKK] > ');
    expect(c.run('/system identity print')).toBe('  name: R-UKK');
  });
  it('/user add/set/remove; group must be full|write|read', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    expect(run('/user add name=teknisi password=rahasia group=superuser')[0]).toBe('input does not match any value of group');
    run('/user add name=teknisi password=rahasia group=full');
    expect(rosLogin(d, 'teknisi', 'rahasia')!.prompt()).toBe('[teknisi@MikroTik] > ');
    run('/user set teknisi password=baru'); expect(rosLogin(d, 'teknisi', 'baru')).not.toBeNull();
    run('/user remove admin'); expect(rows(d, '/user').map(r => r.p.name)).toEqual(['teknisi']);
    expect(run('/user add name=teknisi group=read')[0]).toBe('failure: already have item with such name');
  });
  it('/interface print flags running/slave; set disabled; ethernet rename follows into every reference', () => {
    const d = lab(); const { run, one } = term(d);
    const p = one('/interface print');
    expect(p).toMatch(/0 +R +ether1/); expect(p).toMatch(/1 +RS +ether2/); expect(p).toMatch(/2 +S +ether3/);
    run('/interface set ether4 disabled=yes'); expect(one('/interface print')).toMatch(/3 +XS +ether4/);
    run('/interface ethernet set ether1 name=ether1-wan');
    expect(rows(d, '/ip dhcp-client')[0].p.interface).toBe('ether1-wan');
    expect(rows(d, '/ip firewall nat')[0].p['out-interface']).toBe('ether1-wan');
    expect(wanStatus(d).ok).toBe(true);
  });
  it('/interface bridge + port: duplicate port and unknown bridge are refused', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    expect(run('/interface bridge add name=bridge1')[0]).toBe('');
    expect(run('/interface bridge port add interface=ether2 bridge=bridge1')[0]).toBe('failure: device already added as bridge port');
    expect(run('/interface bridge port add interface=ether1 bridge=bridgeX')[0]).toBe('input does not match any value of bridge');
    run('/interface bridge port add interface=ether1 bridge=bridge1');
    expect(rows(d, '/interface bridge port').at(-1)!.p).toMatchObject({ interface: 'ether1', bridge: 'bridge1' });
  });
  it('/ip address: real errors for duplicates, bad addresses and unknown interfaces', () => {
    const { run } = term(createDevice('RB941-2nD'));
    expect(run('/ip address add address=192.168.88.1/24 interface=bridge')[0]).toBe('failure: already have such address');
    expect(run('/ip address add address=192.168.300.1/24 interface=ether1')[0]).toBe('invalid value for argument address');
    expect(run('/ip address add address=10.0.0.1/24 interface=ether9')[0]).toBe('input does not match any value of interface');
  });
  it('/ip address add without address asks for it, like RouterOS does', () => {
    const d = createDevice('RB941-2nD'); const { c } = term(d);
    expect(c.run('/ip address add interface=ether1')).toBe('');
    expect(c.prompt()).toBe('address: ');
    expect(c.run('bogus')).toBe('invalid value for argument address');
    c.run('1.2.3.100/24');
    expect(rows(d, '/ip address').at(-1)!.p).toMatchObject({ address: '1.2.3.100/24', network: '1.2.3.0', interface: 'ether1' });
  });
  it('numbers come from the last print; without a print they are "no such item"', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    expect(run('/ip pool remove 0')[0]).toBe('no such item');
    run('/ip pool add name=p2 ranges=10.0.0.2-10.0.0.9', '/ip pool print');
    expect(run('/ip pool remove 1')[0]).toBe('');
    expect(rows(d, '/ip pool').map(r => r.p.name)).toEqual(['default-dhcp']);
    expect(run('/ip pool remove 1')[0]).toBe('no such item');
  });
  it('[find where …] with =, ~ and and; print where filters', () => {
    const d = createDevice('RB941-2nD'); const { run, one } = term(d);
    run('/ip address add address=10.9.9.1/24 interface=ether3 comment="lab test"');
    expect(one('/ip address print where interface=ether3')).toMatch(/10\.9\.9\.1\/24/);
    expect(one('/ip address print where interface=ether3')).not.toMatch(/192\.168\.88\.1/);
    run('/ip address disable [find where comment~"lab" and interface=ether3]');
    expect(rows(d, '/ip address').at(-1)!.disabled).toBe(true);
    run('/ip address enable [find interface=ether3]'); expect(rows(d, '/ip address').at(-1)!.disabled).toBe(false);
    run('/ip address remove [find where interface=ether3]'); expect(rows(d, '/ip address')).toHaveLength(1);
  });
  it('/ip dhcp-client: one per interface; status searching… without an ISP, bound with one', () => {
    const d = createDevice('RB941-2nD'); const { run, one } = term(d);
    expect(run('/ip dhcp-client add interface=ether1')[0]).toBe('failure: dhcp-client on that interface already exists');
    expect(one('/ip dhcp-client print')).toMatch(/searching\.\.\./);
    attachRouterOs(d);
    expect(one('/ip dhcp-client print')).toMatch(/bound +10\.20\.0\.100\/24/);
    expect(one('/ip route print')).toMatch(/DAd +0\.0\.0\.0\/0 +10\.20\.0\.1/);
  });
  it('/ip pool, /ip dhcp-server and network by hand (the [8] manual configuration)', () => {
    const d = createDevice('RB941-2nD', { defconf: false }); const { run } = term(d);
    run('/interface bridge add name=bridge1', '/interface bridge port add interface=ether2 bridge=bridge1', '/ip address add address=192.168.88.1/24 interface=bridge1');
    expect(run('/ip pool add name=dhcp_pool0 ranges=192.168.88.254-192.168.88.2')[0]).toBe('invalid value for argument ranges');
    run('/ip pool add name=dhcp_pool0 ranges=192.168.88.2-192.168.88.254', '/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1');
    expect(run('/ip dhcp-server add address-pool=nopool interface=bridge1 name=dhcp1')[0]).toBe('input does not match any value of address-pool');
    run('/ip dhcp-server add address-pool=dhcp_pool0 interface=bridge1 name=dhcp1 disabled=no');
    expect(dhcpFor(d, 'bridge1')).toMatchObject({ server: 'dhcp1', start: '192.168.88.2', gw: '192.168.88.1', leaseSec: 1800 });
  });
  it('/ip dns set servers + allow-remote-requests; bad server address refused', () => {
    const d = createDevice('RB941-2nD'); const { run, one } = term(d);
    expect(run('/ip dns set servers=8.8.8.300')[0]).toBe('invalid value for argument servers');
    run('/ip dns set servers=8.8.8.8,1.1.1.1 allow-remote-requests=no');
    expect(one('/ip dns print')).toMatch(/servers: 8\.8\.8\.8,1\.1\.1\.1\n.*dynamic-servers: \n.*allow-remote-requests: no/);
  });
  it('/ip firewall filter: place-before inserts above the item number of the last print', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    run('/ip firewall filter print');
    run('/ip firewall filter add chain=input protocol=icmp src-address=192.168.88.50 action=drop place-before=0');
    expect(rows(d, '/ip firewall filter')[0].p).toMatchObject({ chain: 'input', action: 'drop', protocol: 'icmp', 'src-address': '192.168.88.50' });
    expect(run('/ip firewall filter add chain=input action=allow')[0]).toBe('input does not match any value of action');
  });
  it('/ip route add gateway=… defaults to 0.0.0.0/0 distance 1', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    run('/ip route add gateway=1.2.3.1');
    expect(rows(d, '/ip route')[0].p).toMatchObject({ 'dst-address': '0.0.0.0/0', gateway: '1.2.3.1', distance: '1' });
    expect(run('/ip route add gateway=hello')[0]).toBe('invalid value for argument gateway');
  });
  it('/queue simple add: automatic name, max-limit kept as upload/download', () => {
    const d = createDevice('RB941-2nD'); const { run, one } = term(d);
    run('/queue simple add target=192.168.88.251/32 limit-at=5M/5M max-limit=15M/15M');
    run('/queue simple add target=192.168.88.20/32 max-limit=2000k/1000000');
    expect(rows(d, '/queue simple').map(r => [r.p.name, r.p['max-limit']])).toEqual([['queue1', '15M/15M'], ['queue2', '2M/1M']]);
    expect(one('/queue simple print')).toMatch(/name=queue1 target=192\.168\.88\.251\/32 limit-at=5M\/5M max-limit=15M\/15M/);
    expect(run('/queue simple add target=192.168.88.21/32 max-limit=fast')[0]).toBe('invalid value for argument max-limit');
  });
  it('/interface wireless: security profile with WPA2-PSK, ssid and mode ([5] commands)', () => {
    const d = createDevice('RB941-2nD', { defconf: false }); const { run } = term(d);
    expect(run('/interface wireless security-profiles add name=myProfile authentication-types=wpa2-psk mode=dynamic-keys wpa2-pre-shared-key=123')[0]).toBe('invalid value for argument wpa2-pre-shared-key');
    run('/interface wireless security-profiles add name=myProfile authentication-types=wpa2-psk mode=dynamic-keys wpa2-pre-shared-key=1234567890');
    run('/interface wireless enable wlan1', '/interface wireless set wlan1 band=2ghz-b/g/n channel-width=20/40mhz-Ce distance=indoors mode=ap-bridge ssid=MikroTik-006360 wireless-protocol=802.11 security-profile=myProfile frequency-mode=regulatory-domain');
    expect(rows(d, '/interface wireless')[0]).toMatchObject({ disabled: false, p: expect.objectContaining({ ssid: 'MikroTik-006360', mode: 'ap-bridge', 'security-profile': 'myProfile' }) });
    expect(run('/interface wireless set wlan1 security-profile=nope')[0]).toBe('input does not match any value of security-profile');
  });
  it('/ip hotspot user + user profile rate-limit', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    run('/ip hotspot user profile add name=paket1 rate-limit=512k/1M shared-users=1');
    run('/ip hotspot user add name=siswa1 password=123 profile=paket1');
    expect(run('/ip hotspot user add name=siswa2 profile=gratis')[0]).toBe('input does not match any value of profile');
    expect(rows(d, '/ip hotspot user')[0].p).toMatchObject({ name: 'siswa1', password: '123', profile: 'paket1', server: 'all' });
    expect(run('/ip hotspot user profile remove default')[0]).toBe('failure: can not remove default profile');
  });
  it('set on a dynamic item is refused; remove without numbers asks for them', () => {
    const d = lab(); const { c, run } = term(d);
    run('/ip route print');
    expect(run('/ip route set 0 distance=5')[0]).toBe('failure: can not change dynamic');
    run('/ip pool print'); c.run('/ip pool remove');
    expect(c.prompt()).toBe('numbers: ');
    c.run('0'); expect(rows(d, '/ip pool')).toHaveLength(0);
  });
});

describe('robustness and references', () => {
  it('odd input never throws out of the terminal (unbalanced quotes/brackets, bad regex, empty values)', () => {
    const { c } = term(createDevice('RB941-2nD'));
    const nasty = ['/ip address print where comment~"("', '/ip address remove [find comment~"["]', '/ip address set [find] address=', '"', '[', '= = =', '/queue simple add target=1.1.1.1 place-before=zz', '/system backup load', '..', '/ip firewall filter add chain=input src-address=!1.2.3.4/33', '/ip address add address='];
    for (const l of nasty) expect(() => c.run(l), l).not.toThrow();
    // the last line opens the interactive `address:` / `interface:` questions: answer them so the prompt closes
    const answers: Record<string, string> = { 'address: ': '10.9.9.1/24', 'interface: ': 'ether2' };
    for (let i = 0; i < 5 && c.askDefault() !== null; i++) { const q = c.prompt(); expect(() => c.run(answers[q] ?? ''), q).not.toThrow(); }
    expect(c.askDefault()).toBeNull();
    expect(c.run('/ip address set [find] address=')).toBe('invalid value for argument address');
  });
  it('renaming a pool or a security profile follows into the items that use it', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    run('/ip pool set default-dhcp name=pool-lan');
    expect(rows(d, '/ip dhcp-server')[0].p['address-pool']).toBe('pool-lan');
    expect(dhcpFor(d, 'bridge')!.start).toBe('192.168.88.10');
    run('/interface wireless security-profiles add name=p1', '/interface wireless set wlan1 security-profile=p1', '/interface wireless security-profiles set p1 name=p2');
    expect(rows(d, '/interface wireless')[0].p['security-profile']).toBe('p2');
  });
  it('exec() is the term.ts Shell entry and reports every line through onCmd', () => {
    const c = new RosCli(createDevice('RB941-2nD')); const seen: string[] = []; c.onCmd = l => seen.push(l);
    expect(c.banner()).toMatch(/MikroTik RouterOS 7\./);
    c.exec('/system identity print', { edit() {}, close() {} });
    expect(seen).toEqual(['/system identity print']);
  });
  it('RB951Ui ether5 (PoE-out port) is an ordinary LAN port of the defconf bridge', () => {
    const d = createDevice('RB951Ui-2HnD'); attachRouterOs(d); plugClient(d, 'ether5', B);
    expect(healthy(adapterOf(B))).toBe(true);
    expect(rosSegment(B)?.l3).toBe('bridge');
  });
});

// ------------------------------------------------------------------------------------------------ wizards
describe('setup wizards', () => {
  it('/ip dhcp-server setup asks exactly the [8] questions with sensible defaults', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    run('/interface bridge port remove [find interface=ether3]', '/ip address add address=192.168.20.1/24 interface=ether3');
    const w = wizard(c, '/ip dhcp-server setup', ['ether3', '', '', '', '8.8.8.8', '']);
    expect(w.out[0]).toBe('Select interface to run DHCP server on');
    expect(w.qs).toEqual(['dhcp server interface: ', 'dhcp address space: ', 'gateway for dhcp network: ', 'addresses to give out: ', 'dns servers: ', 'lease time: ', '[admin@MikroTik] > ']);
    expect(w.out.slice(1, 6)).toEqual(['Select network for DHCP addresses', 'Select gateway for given network', 'Select pool of ip addresses given out by DHCP server', 'Select DNS servers', 'Select lease time']);
    expect(w.out.at(-1)).toBe('That is all. You have configured an active DHCP server.');
    expect(dhcpFor(d, 'ether3')).toMatchObject({ start: '192.168.20.2', end: '192.168.20.254', gw: '192.168.20.1', dns: ['8.8.8.8'], leaseSec: 1800 });
    expect(rows(d, '/ip pool').at(-1)!.p.name).toBe('dhcp_pool0');
  });
  it('dhcp setup: the defaults come from the interface address (the wizard pre-fills them)', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    run('/interface bridge port remove [find interface=ether4]', '/ip address add address=172.16.5.1/24 interface=ether4');
    c.run('/ip dhcp-server setup'); c.run('ether4');
    expect(c.askDefault()).toBe('172.16.5.0/24'); c.run('');
    expect(c.askDefault()).toBe('172.16.5.1'); c.run('');
    expect(c.askDefault()).toBe('172.16.5.2-172.16.5.254');
  });
  it('dhcp setup refuses an unknown interface and a bridge port, then re-asks', () => {
    const { c } = term(createDevice('RB941-2nD'));
    c.run('/ip dhcp-server setup');
    expect(c.run('ether9')).toBe('input does not match any value of interface\nSelect interface to run DHCP server on');
    expect(c.run('ether2')).toMatch(/port bridge/);
    expect(c.prompt()).toBe('dhcp server interface: ');
  });
  it('/ip hotspot setup asks the [11] questions in order and builds hotspot1/hs-pool/hsprof1/user/masquerade', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    run('/interface bridge port remove [find interface=wlan1]');
    const w = wizard(c, '/ip hotspot setup', ['wlan1', '', '', '', '', '', '8.8.8.8', 'login.smk.id', 'siswa1', 'rahasia']);
    expect(w.qs).toEqual(['hotspot interface: ', 'local address of network: ', 'masquerade network: ', 'address pool of network: ', 'select certificate: ', 'ip address of smtp server: ', 'dns servers: ', 'dns name: ', 'name of local hotspot user: ', 'password for the user: ', '[admin@MikroTik] > ']);
    expect(w.out.slice(0, 2)).toEqual(['Select interface to run HotSpot on', 'Set HotSpot address for interface']);
    expect(w.out.slice(3, 10)).toEqual(['Set pool for HotSpot addresses', 'Select hotspot SSL certificate', 'Select SMTP server', 'Setup DNS configuration', 'DNS name of local hotspot server', 'Create local hotspot user', '']);
    expect(rows(d, '/ip hotspot')[0].p).toMatchObject({ name: 'hotspot1', interface: 'wlan1', 'address-pool': 'hs-pool-1', profile: 'hsprof1', 'idle-timeout': '5m' });
    expect(rows(d, '/ip pool').at(-1)!.p.ranges).toBe('10.5.50.2-10.5.50.254');
    expect(rows(d, '/ip address').at(-1)!.p).toMatchObject({ address: '10.5.50.1/24', interface: 'wlan1' });
    expect(rows(d, '/ip hotspot user')[0].p).toMatchObject({ name: 'siswa1', password: 'rahasia' });
    expect(rows(d, '/ip firewall nat').at(-1)!.p).toMatchObject({ chain: 'srcnat', action: 'masquerade', 'src-address': '10.5.50.0/24' });
    expect(rows(d, '/ip hotspot profile').at(-1)!.p).toMatchObject({ 'hotspot-address': '10.5.50.1', 'dns-name': 'login.smk.id' });
    expect(dhcpFor(d, 'wlan1')).toMatchObject({ start: '10.5.50.2', gw: '10.5.50.1', leaseSec: 3600 });
  });
  it('hotspot setup defaults: 10.5.50.1/24, masquerade yes, admin user; password input is hidden', () => {
    const d = createDevice('RB941-2nD', { defconf: false }); const { c } = term(d);
    c.run('/ip hotspot setup'); c.run('ether3');
    expect(c.askDefault()).toBe('10.5.50.1/24'); c.run('');
    expect(c.askDefault()).toBe('yes'); c.run('');
    expect(c.askDefault()).toBe('10.5.50.2-10.5.50.254');
    for (let k = 0; k < 5; k++) c.run('');
    expect(c.askDefault()).toBe('admin'); c.run('');
    expect(c.secret).toBe(true); c.run('');
    expect(c.secret).toBe(false);
    expect(rows(d, '/ip hotspot user')[0].p.name).toBe('admin');
  });
  it('hotspot on a bridge port is refused ([11]: use the bridge, not its port)', () => {
    const { c } = term(createDevice('RB941-2nD'));
    c.run('/ip hotspot setup');
    expect(c.run('wlan1')).toMatch(/port bridge.*bridge/);
    expect(c.prompt()).toBe('hotspot interface: ');
  });
});

// ------------------------------------------------------------------------------------------------ netsim
describe('netsim: a RouterOS device drives real reachability', () => {
  it('a PC on ether2 gets a lease from the defconf server and is fully healthy (DNS through the router)', () => {
    lab();
    expect(ip(A)).toMatch(/^192\.168\.88\.(\d+)$/);
    expect(+ip(A).split('.')[3]).toBeGreaterThanOrEqual(10);
    expect(live(adapterOf(A)).gw).toBe('192.168.88.1');
    expect(healthy(adapterOf(A))).toBe(true);
    const r = resolve(adapterOf(A), envOf(A), 'cari.id'); expect(r && typeof r === 'object' && r.via).toBe('192.168.88.1');
  });
  it('the lease shows in /ip dhcp-server lease print and can be made static', () => {
    const d = lab(); const { run, one } = term(d); ip(A);
    const mac = adapterOf(A).mac.toUpperCase().replace(/-/g, ':');
    expect(one('/ip dhcp-server lease print')).toMatch(new RegExp(`0 D ${ip(A).replace(/\./g, '\\.')} +${mac} +MT-A +defconf +bound`));
    run('/ip dhcp-server lease make-static 0');
    expect(rows(d, '/ip dhcp-server lease')[0].p.address).toBe(ip(A));
    expect(one('/ip dhcp-server lease print')).toMatch(new RegExp(`0  ${ip(A).replace(/\./g, '\\.')} +${mac} +MT-A +defconf +bound`));
  });
  it('no masquerade = no internet for the LAN (the router itself still is online)', () => {
    const d = lab(); const { run } = term(d);
    expect(pingOk(A, '8.8.8.8')).toBe(true);
    run('/ip firewall nat print', '/ip firewall nat remove 0');
    expect(pingOk(A, '8.8.8.8')).toBe(false);
    expect(wanStatus(d).ok).toBe(true);
    run('/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade');
    expect(pingOk(A, '8.8.8.8')).toBe(true);
  });
  it('firewall first match: a drop for one client, then an accept placed before it wins', () => {
    const d = lab(); const { run } = term(d); const me = ip(A);
    run(`/ip firewall filter add chain=forward src-address=${me} action=drop comment=blok`);
    expect(pingOk(A, '8.8.8.8')).toBe(false);
    expect(healthy(adapterOf(A))).toBe(false);
    run('/ip firewall filter print', `/ip firewall filter add chain=forward src-address=${me} protocol=icmp action=accept place-before=10`);
    expect(pingOk(A, '8.8.8.8')).toBe(true);                                         // ICMP accepted first
    expect(clientInternet(d, 'bridge', me, '103.10.20.30', 'tcp80').ok).toBe(false);   // web still hits the drop
  });
  it('input chain: dropping ICMP to the router fails the ping but DNS through the router still works', () => {
    const d = lab(); const { run } = term(d); ip(A);
    run('/ip firewall filter print', '/ip firewall filter add chain=input protocol=icmp in-interface=bridge action=drop place-before=0');
    expect(pingOk(A, '192.168.88.1', false)).toBe(false);
    const r = resolve(adapterOf(A), envOf(A), 'cari.id'); expect(r && typeof r === 'object').toBe(true);
    run('/ip dns set allow-remote-requests=no'); renew(A);
    expect(resolve(adapterOf(A), envOf(A), 'cari.id')).toBe('timeout');
  });
  it('a disabled port or a pulled ISP cable is felt by the client', () => {
    const d = lab(); const { run } = term(d);
    run('/interface set ether2 disabled=yes');
    expect(envOf(A)).toBe(ENVS.none);
    run('/interface set ether2 disabled=no'); renew(A);
    expect(healthy(adapterOf(A))).toBe(true);
    setWanCable(d, false);
    expect(pingOk(A, '8.8.8.8')).toBe(false); expect(pingOk(A, '192.168.88.1')).toBe(true);
  });
  it('static WAN as in [5]: address + default route + DNS', () => {
    const d = createDevice('RB941-2nD'); attachRouterOs(d, { isp: { ...DEFAULT_ISP, mode: 'static', net: '1.2.3.0', gw: '1.2.3.1', addr: '1.2.3.100' } }); plugClient(d, 'ether2', A);
    expect(pingOk(A, '8.8.8.8')).toBe(false);
    term(d).run('/ip dhcp-client remove [find]', '/ip address add address=1.2.3.100/24 interface=ether1', '/ip route add gateway=1.2.3.1', '/ip dns set servers=8.8.8.8');
    expect(wanStatus(d).ok).toBe(true);
    expect(healthy(adapterOf(A))).toBe(true);
  });
  it('a wrong default route gateway leaves the router offline', () => {
    const d = createDevice('RB941-2nD'); attachRouterOs(d, { isp: { ...DEFAULT_ISP, mode: 'static', net: '1.2.3.0', gw: '1.2.3.1', addr: '1.2.3.100' } });
    term(d).run('/ip address add address=1.2.3.100/24 interface=ether1', '/ip route add gateway=1.2.3.254');
    expect(wanStatus(d)).toMatchObject({ ok: false, why: 'gateway salah' });
  });
  it('WAN in the LAN bridge breaks it (research: never bridge the WAN port)', () => {
    const d = lab(); term(d).run('/interface bridge port add interface=ether1 bridge=bridge');
    expect(wanStatus(d).ok).toBe(false);
  });
  it('a port taken out of the bridge is its own segment: no address = APIPA until it gets one', () => {
    const d = lab(); plugClient(d, 'ether3', B); const { c, run } = term(d);
    run('/interface bridge port remove [find interface=ether3]'); renew(B);
    expect(live(adapterOf(B)).apipa).toBe(true);
    run('/ip address add address=192.168.20.1/24 interface=ether3');
    wizard(c, '/ip dhcp-server setup', ['ether3', '', '', '', '', '']);
    renew(B);
    expect(ip(B)).toMatch(/^192\.168\.20\./);
    expect(healthy(adapterOf(B))).toBe(true);                   // the defconf masquerade covers every LAN
    expect(pingOk(A, ip(B))).toBe(true);                         // routed between the two segments
    run('/ip firewall filter print', '/ip firewall filter add chain=forward in-interface=bridge out-interface=ether3 action=drop place-before=0');
    expect(pingOk(A, ip(B))).toBe(false);
  });
  it('wlan1 clients need the right SSID and WPA2 key', () => {
    const d = createDevice('RB941-2nD'); attachRouterOs(d); const { run } = term(d);
    run('/interface wireless security-profiles add name=kos authentication-types=wpa2-psk mode=dynamic-keys wpa2-pre-shared-key=mawar2026', '/interface wireless set wlan1 ssid=KOS_MAWAR security-profile=kos');
    plugClient(d, 'wlan1', W, { ssid: 'KOS_MAWAR', key: 'salah123' });
    expect(envOf(W)).toBe(ENVS.none);
    plugClient(d, 'wlan1', W, { ssid: 'KOS_MAWAR', key: 'mawar2026' });
    expect(healthy(adapterOf(W))).toBe(true);
    run('/interface wireless disable wlan1'); expect(envOf(W)).toBe(ENVS.none);
  });
  it('router /ping: internet with a working WAN, LAN clients, and no route without an ISP', () => {
    const d = lab(); const { one } = term(d); ip(A);
    const r = one('/ping 8.8.8.8 count=3');
    expect(r).toMatch(/SEQ HOST/); expect(r).toMatch(/sent=3 received=3 packet-loss=0%/);
    expect(one(`/ping ${ip(A)} count=1`)).toMatch(/received=1/);
    expect(one('/ping cari.id count=1')).toMatch(/103\.10\.20\.30/);
    setWanCable(d, false);
    expect(one('/ping 8.8.8.8 count=2')).toMatch(/no route to host[\s\S]*received=0 packet-loss=100%/);
  });
  it('unplugging releases the lease; envs of other PCs are untouched', () => {
    const d = lab(); ip(A);
    expect(rosSegment(A)?.l3).toBe('bridge');
    unplugClient(A);
    expect(rosSegment(A)).toBeNull();
    expect([...(envOf(A).leases.values())]).not.toContain('x');
    expect(envOf('PROP_L2_PC_01')).toBe(ENVS.office);      // a hotel PC that is not on a RouterOS device keeps its old path
    void d;
  });
});

// ------------------------------------------------------------------------------------------------ queues + FastTrack
describe('simple queues and the FastTrack bug', () => {
  it('without a queue the client gets the ISP plan (20M, ⚠ design number)', () => {
    lab(); ip(A);
    expect(rosThroughput(A)).toMatchObject({ down: 20_000_000, up: 20_000_000, queue: '' });
  });
  it('the classic bug: with defconf FastTrack the queue "does not work"', () => {
    const d = lab(); const me = ip(A);
    term(d).run(`/queue simple add name=klien target=${me}/32 max-limit=2M/1M`);
    expect(rosThroughput(A)).toMatchObject({ down: 20_000_000, queue: 'klien', bypassed: true });
  });
  it('disable the fasttrack rule → upload 2M, download 1M (max-limit is upload/download [9])', () => {
    const d = lab(); const me = ip(A); const { run } = term(d);
    run(`/queue simple add name=klien target=${me}/32 max-limit=2M/1M`, '/ip firewall filter disable [find action=fasttrack-connection]');
    expect(rosThroughput(A)).toMatchObject({ up: 2_000_000, down: 1_000_000, bypassed: false });
  });
  it('queues are strict-order: a broader queue above wins', () => {
    const d = lab(); const me = ip(A); const { run } = term(d);
    run('/ip firewall filter disable [find action=fasttrack-connection]', `/queue simple add name=klien target=${me}/32 max-limit=2M/1M`, '/queue simple print', '/queue simple add name=semua target=192.168.88.0/24 max-limit=10M/10M place-before=0');
    expect(rosThroughput(A)).toMatchObject({ queue: 'semua', down: 10_000_000 });
  });
  it('a static lease rate-limit creates a dynamic dhcp-ds<MAC> queue [8]', () => {
    const d = lab(); ip(A); const { run, one } = term(d);
    run('/ip firewall filter disable [find action=fasttrack-connection]', '/ip dhcp-server lease print', '/ip dhcp-server lease make-static 0', '/ip dhcp-server lease print', '/ip dhcp-server lease set 0 rate-limit=3M/3M');
    expect(one('/queue simple print')).toMatch(/0 D\s+name=dhcp-ds<[0-9A-F:]{17}> target=/);
    expect(rosThroughput(A)).toMatchObject({ down: 3_000_000 });
  });
});

// ------------------------------------------------------------------------------------------------ hotspot gating
describe('hotspot gating', () => {
  function hs() {
    const d = createDevice('RB941-2nD'); attachRouterOs(d); const { c, run } = term(d);
    run('/interface bridge port remove [find interface=wlan1]');
    wizard(c, '/ip hotspot setup', ['wlan1', '', '', '', '', '', '', 'login.smk.id', 'siswa1', 'rahasia']);
    const ssid = rows(d, '/interface wireless')[0].p.ssid;
    plugClient(d, 'wlan1', W, { ssid });
    return { d, c, run };
  }
  it('a hotspot client gets 10.5.50.x and DNS, but no internet before login', () => {
    hs();
    expect(ip(W)).toMatch(/^10\.5\.50\.\d+$/);
    expect(live(adapterOf(W)).gw).toBe('10.5.50.1');
    expect(rosNeedsLogin(W)).toBe(true);
    const r = resolve(adapterOf(W), envOf(W), 'cari.id'); expect(r && typeof r === 'object').toBe(true);
    expect(pingOk(W, '8.8.8.8')).toBe(false);
    expect(healthy(adapterOf(W))).toBe(false);
  });
  it('the hotspot DNS name resolves to the hotspot address [11]', () => {
    hs(); const r = resolve(adapterOf(W), envOf(W), 'login.smk.id');
    expect(r && typeof r === 'object' && r.ip).toBe('10.5.50.1');
  });
  it('wrong password is refused; the right one opens the internet; logout closes it', () => {
    const { run } = hs(); ip(W);
    expect(rosHotspotLogin(W, 'siswa1', 'salah')).toBe('invalid username or password');
    expect(rosHotspotLogin(W, 'siswa1', 'rahasia')).toBe('');
    expect(rosNeedsLogin(W)).toBe(false);
    expect(healthy(adapterOf(W))).toBe(true);
    expect(term(hsDev(W)).one('/ip hotspot active print')).toMatch(/hotspot1 +siswa1 +10\.5\.50\./);
    run('/ip hotspot active print', '/ip hotspot active remove 0');
    expect(pingOk(W, '8.8.8.8')).toBe(false);
  });
  it('shared-users=1: a second device with the same account is refused', () => {
    const { d } = hs(); ip(W); rosHotspotLogin(W, 'siswa1', 'rahasia');
    const ssid = rows(d, '/interface wireless')[0].p.ssid; plugClient(d, 'wlan1', 'PROP_MT_LAPTOP_X', { ssid }); ip('PROP_MT_LAPTOP_X');
    expect(rosHotspotLogin('PROP_MT_LAPTOP_X', 'siswa1', 'rahasia')).toBe('no more sessions are allowed for user');
  });
  it('walled garden lets an unauthenticated client open that web host only [11]', () => {
    const { d, run } = hs(); const me = ip(W);
    expect(clientInternet(d, 'wlan1', me, '103.55.12.7', 'tcp80', 'smk.sch.id').ok).toBe(false);
    run('/ip hotspot walled-garden add dst-host=*.sch.id', '/ip hotspot walled-garden add dst-host=smk.sch.id');
    expect(clientInternet(d, 'wlan1', me, '103.55.12.7', 'tcp80', 'smk.sch.id').ok).toBe(true);
    expect(clientInternet(d, 'wlan1', me, '103.10.20.30', 'tcp80', 'cari.id').ok).toBe(false);
  });
  it('user profile rate-limit rx/tx = client upload/download, via a dynamic queue (bypassed by FastTrack too)', () => {
    const { run } = hs(); ip(W);
    run('/ip hotspot user profile add name=paket1 rate-limit=512k/1M', '/ip hotspot user set siswa1 profile=paket1');
    rosHotspotLogin(W, 'siswa1', 'rahasia');
    expect(rosThroughput(W)).toMatchObject({ queue: '<hotspot-siswa1>', bypassed: true });
    run('/ip firewall filter disable [find action=fasttrack-connection]');
    expect(rosThroughput(W)).toMatchObject({ up: 512_000, down: 1_000_000, bypassed: false });
  });
});
const hsDev = (pc: string) => rosSegment(pc)!.dev;

// ------------------------------------------------------------------------------------------------ backup / export
describe('backup, restore and export', () => {
  it('backup save → change → load asks the password and restore confirmation, then config is back', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    expect(run('/system backup save name=test password=kunci')[0]).toBe('Configuration backup saved');
    run('/system identity set name=RUSAK', '/ip address remove [find]');
    c.run('/system backup load name=test');
    expect(c.prompt()).toBe('password: '); expect(c.secret).toBe(true);
    expect(c.run('salah')).toBe('failure: wrong password');
    c.run('/system backup load name=test'); c.run('kunci');
    expect(c.prompt()).toBe('Restore and reboot? [y/N]: ');
    expect(c.run('y')).toMatch(/restored, rebooting now/);
    expect(single(d, '/system identity').name).toBe('MikroTik');
    expect(rows(d, '/ip address')).toHaveLength(1);
  });
  it('a backup is a copy, not a link; a missing file is reported', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    run('/system backup save name=b1');
    run('/system identity set name=X');
    expect(d.files.get('b1.backup')!.cfg!.tables['/system identity'][0].p.name).toBe('MikroTik');
    c.run('/system backup load name=nope password=');
    expect(c.prompt()).toBe('[admin@X] > ');
    expect(term(d).one('/file print')).toMatch(/b1\.backup +backup/);
  });
  it('/export prints a script; in a menu it exports that menu only; file= writes an .rsc', () => {
    const d = createDevice('RB941-2nD'); const { run, one } = term(d);
    run('/system identity set name=R-UKK', '/ip dns set servers=8.8.8.8');
    const all = one('/export');
    expect(all).toMatch(/^# .* by RouterOS 7\./);
    expect(all).toMatch(/\/system identity\nset name=R-UKK/);
    expect(all).toMatch(/\/ip dns\nset allow-remote-requests=yes servers=8\.8\.8\.8/);
    expect(all).toMatch(/\/ip firewall nat\nadd action=masquerade chain=srcnat comment="defconf: masquerade" out-interface=ether1/);
    const nat = run('/ip firewall nat', 'export')[1];
    expect(nat).toMatch(/masquerade/); expect(nat).not.toMatch(/system identity/);
    run('/export file=backup-step3');
    expect(d.files.get('backup-step3.rsc')!.text).toMatch(/set name=R-UKK/);
  });
  it('export hides secrets unless show-sensitive', () => {
    const d = createDevice('RB941-2nD'); term(d).run('/ip hotspot user add name=u1 password=p4ss');
    expect(exportCfg(d)).toMatch(/^add name=u1$/m);
    expect(exportCfg(d, '/', { sensitive: true })).toMatch(/password=p4ss/);
  });
});

// ------------------------------------------------------------------------------------------------ grading
describe('checkState (UKK targets graded on state)', () => {
  const SPEC = {
    identity: 'R-UKK', user: { name: 'teknisi', removeAdmin: true },
    dns: { servers: ['8.8.8.8'], allowRemote: true }, nat: { outInterface: 'ether1' },
    hotspot: { iface: 'wlan1', address: '10.5.50.1/24', users: [{ name: 'siswa1', password: 'rahasia' }], rateLimit: '512k/1M' },
    queues: [{ target: '192.168.88.20', maxUp: '2M', maxDown: '1M', mustWork: true }],
  };
  it('a fresh defconf router fails most items, with reasons', () => {
    const g = checkState(createDevice('RB941-2nD'), SPEC);
    expect(g.ok).toBe(false);
    expect(g.checks.find(c => c.id === 'identity')!.detail).toBe('sekarang "MikroTik"');
    expect(g.checks.find(c => c.id === 'nat')!.ok).toBe(true);          // defconf already masquerades
    expect(g.checks.find(c => c.id === 'hs-server')!.detail).toMatch(/port bridge/);
  });
  it('the full UKK-style job passes, whatever path was typed (wizard + abbreviations)', () => {
    const d = createDevice('RB941-2nD'); const { c, run } = term(d);
    run('/sys ident set name=R-UKK', '/user add name=teknisi password=x group=full', '/user remove admin', '/ip dns set servers=8.8.8.8',
      '/interface bridge port remove [find interface=wlan1]');
    wizard(c, '/ip hotspot setup', ['wlan1', '', '', '', '', '', '', 'login.smk.id', 'siswa1', 'rahasia']);
    run('/ip hotspot user profile add name=p1 rate-limit=512k/1M', '/ip hotspot user set siswa1 profile=p1',
      '/queue simple add target=192.168.88.20/32 max-limit=2M/1M', '/ip firewall filter disable [find action=fasttrack-connection]');
    const g = checkState(d, SPEC);
    expect(g.checks.filter(x => !x.ok)).toEqual([]);
    expect(g).toMatchObject({ ok: true, score: 100 });
  });
  it('queue mustWork fails while FastTrack is on, and when another queue matches first', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    run('/queue simple add target=192.168.88.20/32 max-limit=2M/1M');
    const spec = { queues: [{ target: '192.168.88.20', maxUp: '2M', maxDown: '1M', mustWork: true }] };
    expect(checkState(d, spec).checks[1].detail).toMatch(/FastTrack/);
    run('/ip firewall filter disable [find action=fasttrack-connection]', '/queue simple print', '/queue simple add target=192.168.88.0/24 max-limit=5M/5M place-before=0');
    expect(checkState(d, spec).checks[1].detail).toMatch(/queue lain/);
    expect(checkState(d, { queues: [{ target: '192.168.88.20', maxUp: '1M', maxDown: '2M' }] }).ok).toBe(false);   // swapped upload/download
  });
  it('blockPing follows first match: an accept above the drop defeats it', () => {
    const d = createDevice('RB941-2nD'); const { run } = term(d);
    run('/ip firewall filter print', '/ip firewall filter add chain=input src-address=192.168.88.50 protocol=icmp action=drop place-before=0');
    expect(checkState(d, { blockPing: { from: '192.168.88.50' } }).ok).toBe(true);
    run('/ip firewall filter print', '/ip firewall filter add chain=input protocol=icmp action=accept place-before=0');
    expect(checkState(d, { blockPing: { from: '192.168.88.50' } }).ok).toBe(false);
    expect(evalFilter(d, { chain: 'input', state: 'new', nat: '', proto: 'icmp', src: '192.168.88.50', dst: '192.168.88.1', inIf: 'bridge' }).index).toBe(0);
  });
  it('WAN, LAN, DHCP server, wireless and backup targets', () => {
    const d = createDevice('RB951Ui-2HnD', { defconf: false }); attachRouterOs(d); const { c, run } = term(d);
    run('/ip dhcp-client add interface=ether1', '/interface bridge add name=bridge1', '/interface bridge port add interface=ether2 bridge=bridge1', '/interface bridge port add interface=wlan1 bridge=bridge1',
      '/ip address add address=192.168.88.1/24 interface=bridge1');
    wizard(c, '/ip dhcp-server setup', ['bridge1', '', '', '', '', '']);
    run('/interface wireless security-profiles add name=wpa authentication-types=wpa2-psk mode=dynamic-keys wpa2-pre-shared-key=smkbisa123', '/interface wireless enable wlan1', '/interface wireless set wlan1 mode=ap-bridge ssid=UKK-TKJ security-profile=wpa',
      '/system backup save name=ukk');
    const g = checkState(d, {
      wan: { iface: 'ether1', dhcp: true }, lan: { iface: 'bridge1', address: '192.168.88.1/24' }, bridgePorts: { bridge: 'bridge1', ports: ['ether2', 'wlan1'] },
      dhcpServer: { iface: 'bridge1', from: '192.168.88.2', to: '192.168.88.254', gateway: '192.168.88.1' }, wireless: { ssid: 'UKK-TKJ', mode: 'ap-bridge', wpa2Key: 'smkbisa123' }, backup: 'ukk', online: true,
    });
    expect(g.checks.filter(x => !x.ok)).toEqual([]);
    expect(g.score).toBe(100);
  });
});
