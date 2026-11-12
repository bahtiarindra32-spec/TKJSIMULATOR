// UKK-style grading of a RouterOS device: checks the configuration STATE (and what it does), never the typed text.
// Any command path that reaches the state passes (wizard or manual commands, abbreviations, WinBox-style panels later).
// Targets follow the UKK patterns in research §1.3 (identity, IP, DNS + allow-remote, NAT, DHCP, hotspot, queue, firewall).
import { rows, single, ifByName, ifByDefault, bridgeOf, l3Of, parseCidr, parseRate2, addrMatch, findFile, type RosDevice } from './model';
import { dhcpFor, dnsServers, evalFilter, srcNat, forward, queueFor, addresses, wanIfName, wanStatus, hotspotOn } from './engine';
import { networkOf, parseIp } from '../../game/missionLogic';

export interface UkkSpec {
  identity?: string;
  /** a new full user; removeAdmin = the default admin must be gone [5] */
  user?: { name: string; group?: 'full' | 'write' | 'read'; removeAdmin?: boolean };
  /** WAN: DHCP client on iface, or a static address + default route gateway */
  wan?: { iface: string; dhcp?: boolean; address?: string; gateway?: string };
  /** a LAN address on an interface (e.g. bridge1 192.168.88.1/24) */
  lan?: { iface: string; address: string };
  bridgePorts?: { bridge: string; ports: string[] };
  dhcpServer?: { iface: string; from?: string; to?: string; gateway?: string; dns?: string };
  dns?: { servers?: string[]; allowRemote?: boolean };
  /** srcnat masquerade that really translates LAN traffic leaving through outInterface */
  nat?: { outInterface: string; from?: string };
  wireless?: { iface?: string; ssid?: string; mode?: string; wpa2Key?: string };
  /** hotspot server on iface with the gateway address, users, and the user profile rate-limit (rx/tx, router view [11]) */
  hotspot?: { iface: string; address: string; users?: { name: string; password?: string }[]; rateLimit?: string };
  /** simple queue for a client: upload/download max-limit [9]; mustWork = not bypassed by FastTrack, first match */
  queues?: { target: string; maxUp: string; maxDown: string; mustWork?: boolean; exact?: boolean }[];
  /** firewall: ping from a source address to the router (or to dst through it) must be dropped */
  blockPing?: { from: string; to?: string };
  backup?: string;
  /** the router itself must reach the internet (WAN up, default route) */
  online?: boolean;
}
export interface Check { id: string; label: string; ok: boolean; detail: string }
export interface Grade { ok: boolean; score: number; checks: Check[] }

const rateEq = (a: string, b: string) => { const x = parseRate2(a), y = parseRate2(b); return !!x && !!y && x[0] === y[0] && x[1] === y[1]; };
/** the layer-3 interface whose subnet holds this address */
const l3For = (d: RosDevice, ip: string) => { const x = parseIp(ip); return x === null ? null : (addresses(d).find(a => networkOf(x, a.prefix) === a.net)?.iface ?? null); };

export function checkState(d: RosDevice, spec: UkkSpec): Grade {
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean, detail = '') => checks.push({ id, label, ok, detail: ok ? '' : detail });
  if (spec.identity !== undefined) { const v = single(d, '/system identity').name; add('identity', `identity = ${spec.identity}`, v === spec.identity, `sekarang "${v}"`); }
  if (spec.user) {
    const u = rows(d, '/user').find(r => r.p.name === spec.user!.name && !r.disabled);
    add('user', `user ${spec.user.name} (${spec.user.group ?? 'full'})`, !!u && u.p.group === (spec.user.group ?? 'full'), u ? `group ${u.p.group}` : 'user belum ada');
    if (spec.user.removeAdmin) add('user-admin', 'user admin bawaan dihapus', !rows(d, '/user').some(r => r.p.name === 'admin'), 'admin masih ada');
  }
  if (spec.wan) {
    const w = spec.wan;
    if (w.dhcp) add('wan-dhcp', `DHCP client di ${w.iface}`, rows(d, '/ip dhcp-client').some(r => !r.disabled && r.p.interface === w.iface && !bridgeOf(d, w.iface)), 'tidak ada DHCP client aktif di interface itu');
    if (w.address) add('wan-ip', `alamat WAN ${w.address} di ${w.iface}`, rows(d, '/ip address').some(r => !r.disabled && r.p.interface === w.iface && r.p.address === w.address), 'alamat tidak ditemukan');
    if (w.gateway) add('wan-route', `default route via ${w.gateway}`, rows(d, '/ip route').some(r => !r.disabled && r.p['dst-address'] === '0.0.0.0/0' && r.p.gateway === w.gateway), 'route belum ada');
  }
  if (spec.lan) add('lan-ip', `alamat ${spec.lan.address} di ${spec.lan.iface}`, rows(d, '/ip address').some(r => !r.disabled && r.p.interface === spec.lan!.iface && r.p.address === spec.lan!.address) && !bridgeOf(d, spec.lan.iface), 'alamat tidak ada (atau interface-nya port bridge)');
  if (spec.bridgePorts) {
    const b = spec.bridgePorts; const miss = b.ports.filter(p => bridgeOf(d, p) !== b.bridge);
    add('bridge-ports', `${b.ports.join(', ')} di ${b.bridge}`, !!ifByName(d, b.bridge) && !miss.length, miss.length ? `belum: ${miss.join(', ')}` : 'bridge belum ada');
  }
  if (spec.dhcpServer) {
    const s = spec.dhcpServer; const o = dhcpFor(d, s.iface);
    const ok = !!o && (!s.from || o.start === s.from) && (!s.to || o.end === s.to) && (!s.gateway || o.gw === s.gateway) && (!s.dns || o.dns.includes(s.dns));
    add('dhcp-server', `DHCP server di ${s.iface}${s.from ? ` (${s.from}-${s.to})` : ''}`, ok, o ? `pool ${o.start}-${o.end}, gateway ${o.gw || '-'}, dns ${o.dns.join(',') || '-'}` : 'tidak ada DHCP server yang jalan di interface itu');
  }
  if (spec.dns) {
    const ds = dnsServers(d); const p = single(d, '/ip dns');
    if (spec.dns.servers) add('dns-servers', `DNS servers ${spec.dns.servers.join(',')}`, spec.dns.servers.every(s => ds.stat.includes(s)), `sekarang ${ds.stat.join(',') || '(kosong)'}`);
    if (spec.dns.allowRemote !== undefined) add('dns-remote', `allow-remote-requests=${spec.dns.allowRemote ? 'yes' : 'no'}`, (p['allow-remote-requests'] === 'yes') === spec.dns.allowRemote, `sekarang ${p['allow-remote-requests']}`);
  }
  if (spec.nat) {
    const lan = spec.nat.from ?? addresses(d).find(a => a.iface !== spec.nat!.outInterface)?.ip ?? '192.168.88.10';
    add('nat', `NAT masquerade keluar ${spec.nat.outInterface}`, srcNat(d, { state: 'new', nat: '', proto: 'tcp', dport: 80, src: lan, dst: '103.10.20.30', outIf: spec.nat.outInterface, inIf: l3For(d, lan) ?? '' }), 'lalu lintas LAN keluar tanpa di-masquerade');
  }
  if (spec.wireless) {
    const w = spec.wireless; const i = w.iface ? ifByName(d, w.iface) : ifByDefault(d, 'wlan1');
    const p = i?.row.p;
    add('wlan-on', `${w.iface ?? 'wlan1'} aktif`, !!i && !i.row.disabled, 'interface wireless masih disabled');
    if (w.ssid) add('wlan-ssid', `SSID ${w.ssid}`, p?.ssid === w.ssid, `sekarang ${p?.ssid ?? '-'}`);
    if (w.mode) add('wlan-mode', `mode ${w.mode}`, p?.mode === w.mode, `sekarang ${p?.mode ?? '-'}`);
    if (w.wpa2Key) { const sp = rows(d, '/interface wireless security-profiles').find(r => r.p.name === p?.['security-profile']); add('wlan-wpa2', 'WPA2-PSK dengan password yang diminta', !!sp && sp.p.mode === 'dynamic-keys' && sp.p['authentication-types'].split(',').includes('wpa2-psk') && sp.p['wpa2-pre-shared-key'] === w.wpa2Key, 'security profile belum WPA2-PSK / password beda'); }
  }
  if (spec.hotspot) {
    const h = spec.hotspot; const srv = hotspotOn(d, h.iface);
    add('hs-server', `hotspot di ${h.iface}`, !!srv, bridgeOf(d, h.iface) ? `${h.iface} masih port bridge` : 'tidak ada server hotspot aktif');
    add('hs-address', `alamat hotspot ${h.address}`, rows(d, '/ip address').some(r => !r.disabled && r.p.interface === h.iface && r.p.address === h.address), 'alamat gateway hotspot tidak ada di interface itu');
    for (const u of h.users ?? []) { const r = rows(d, '/ip hotspot user').find(x => x.p.name === u.name && !x.disabled); add(`hs-user-${u.name}`, `user hotspot ${u.name}`, !!r && (u.password === undefined || r.p.password === u.password), r ? 'password beda' : 'user belum ada'); }
    if (h.rateLimit) {
      const users = (h.users ?? []).map(u => rows(d, '/ip hotspot user').find(x => x.p.name === u.name)).filter(Boolean);
      const ok = users.length > 0 && users.every(u => { const pr = rows(d, '/ip hotspot user profile').find(x => x.p.name === u!.p.profile); return !!pr && rateEq(pr.p['rate-limit'].split(' ')[0] ?? '', h.rateLimit!); });
      add('hs-rate', `rate-limit ${h.rateLimit} (rx/tx) di profile user`, ok, 'profile user belum memakai rate-limit itu');
    }
  }
  for (const q of spec.queues ?? []) {
    const ip = parseCidr(q.target); const ipS = ip ? q.target.split('/')[0] : q.target;
    // exact: the queue must be for this one client (target = its address or address/32), not a shared subnet queue
    const tgtOk = (t: string) => (q.exact ? t === ipS || t === `${ipS}/32` : addrMatch(t, ipS));
    const mine = rows(d, '/queue simple').find(r => !r.disabled && r.p.target.split(',').some(tgtOk) && rateEq(r.p['max-limit'], `${q.maxUp}/${q.maxDown}`));
    add(`queue-${ipS}`, `queue ${ipS} max-limit ${q.maxUp}/${q.maxDown}`, !!mine, q.exact ? 'tidak ada simple queue khusus klien ini (target alamatnya sendiri) dengan max-limit itu (ingat: upload/download)' : 'tidak ada simple queue dengan target & max-limit itu (ingat: upload/download)');
    if (q.mustWork && mine) {
      const first = queueFor(d, ipS, l3For(d, ipS) ?? '');
      const lan = l3For(d, ipS) ?? ''; const f = forward(d, lan, l3Of(d, wanIfName(d)), ipS, '103.10.20.30', 'tcp80', false);
      add(`queue-${ipS}-live`, `queue ${ipS} benar-benar membatasi`, first?.row === mine && !f.fasttrack, first?.row !== mine ? `queue lain di atasnya cocok duluan (${first?.name})` : 'FastTrack melewati simple queue: nonaktifkan rule fasttrack untuk trafik ini');
    }
  }
  if (spec.blockPing) {
    const b = spec.blockPing; const inIf = l3For(d, b.from) ?? '';
    const v = b.to && !addresses(d).some(a => a.ip === b.to)
      ? evalFilter(d, { chain: 'forward', state: 'new', nat: '', proto: 'icmp', src: b.from, dst: b.to, inIf, outIf: l3For(d, b.to) ?? '' }).action
      : evalFilter(d, { chain: 'input', state: 'new', nat: '', proto: 'icmp', src: b.from, dst: b.to ?? addresses(d).find(a => a.iface === inIf)?.ip ?? '', inIf }).action;
    add('block-ping', `ping dari ${b.from} ${b.to ? `ke ${b.to} ` : 'ke router '}diblok`, v === 'drop' || v === 'reject', 'ping masih diterima (cek urutan rule: first match)');
  }
  if (spec.backup) add('backup', `file backup ${spec.backup}`, !!findFile(d, spec.backup, 'backup'), 'file .backup belum ada');
  if (spec.online) { const w = wanStatus(d); add('online', 'router terhubung internet', w.ok, w.why); }
  const passed = checks.filter(c => c.ok).length;
  return { ok: checks.length > 0 && passed === checks.length, score: checks.length ? Math.round((passed / checks.length) * 100) : 0, checks };
}
