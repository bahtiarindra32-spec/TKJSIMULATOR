// R-EDGE: the building's internet edge router in rack 1 of the L1 server room (Cisco IOS-like CLI).
// Gi0/0 = ISP1 (main), Gi0/1 = ISP2 (backup), Gi0/2 = inside (towards the segment routers).
// Every packet a PC sends to the internet passes edgeAllows(): default route (with IP SLA tracking for
// failover), NAT/PAT overload on the exit interface, and the ACL on the inside interface. So a missing
// "ip nat inside", a wrong ACL line or an untracked primary route really breaks every PC's internet.
import { HOOKS, ENVS, envOf, live, adapterOf, parseIp, networkOf, parseMask, type Env } from './net';
import { EXT } from './ext';
import type { Shell, TermIO } from './term';

interface Ace { seq: number; act: 'permit' | 'deny'; proto: 'ip' | 'icmp' | 'udp' | 'tcp'; src: string; sw: string; dst: string; dw: string; eq?: number; text: string }
interface Iface { name: string; ip: string; mask: string; shut: boolean; nat: 'inside' | 'outside' | null; aclIn: number | null; desc: string; isp: 1 | 2 | 0 }
interface Route { net: string; mask: string; nh: string; ad: number; track: number | null }
export const EDGE = {
  host: 'R-EDGE',
  ifs: [
    { name: 'GigabitEthernet0/0', ip: '203.0.113.2', mask: '255.255.255.252', shut: false, nat: 'outside', aclIn: null, desc: 'ISP1-NUSANET (utama)', isp: 1 },
    { name: 'GigabitEthernet0/1', ip: '198.51.100.2', mask: '255.255.255.252', shut: false, nat: 'outside', aclIn: null, desc: 'ISP2-CEPATLINK (cadangan)', isp: 2 },
    { name: 'GigabitEthernet0/2', ip: '10.255.0.1', mask: '255.255.255.252', shut: false, nat: 'inside', aclIn: 110, desc: 'INSIDE-KE-CORE', isp: 0 },
  ] as Iface[],
  isp: { 1: { up: true, gw: '203.0.113.1' }, 2: { up: true, gw: '198.51.100.1' } } as Record<1 | 2, { up: boolean; gw: string }>,
  routes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1', ad: 1, track: 1 }, { net: '0.0.0.0', mask: '0.0.0.0', nh: '198.51.100.1', ad: 10, track: null }] as Route[],
  sla: new Map<number, { target: string; src: string; scheduled: boolean }>([[1, { target: '203.0.113.1', src: 'GigabitEthernet0/0', scheduled: true }]]),
  track: new Map<number, number>([[1, 1]]),
  acl: new Map<number, Ace[]>(),
  nat: [{ acl: 1, iface: 'GigabitEthernet0/0' }, { acl: 1, iface: 'GigabitEthernet0/1' }] as { acl: number; iface: string }[],
  dirty: false,
};
const ip2n = (s: string) => parseIp(s) ?? -1;
const wildMatch = (ip: string, base: string, wild: string) => { if (base === 'any') return true; const w = ip2n(wild) >>> 0; return ((ip2n(ip) & ~w) >>> 0) === ((ip2n(base) & ~w) >>> 0); };
function ace(seq: number, text: string, std: boolean): Ace | string {
  const t = text.trim().split(/\s+/); const act = t[0] as Ace['act']; if (act !== 'permit' && act !== 'deny') return '% Invalid input (permit/deny)';
  let i = 1; let proto: Ace['proto'] = 'ip';
  if (!std) { const p = t[i++]?.toLowerCase(); if (!['ip', 'icmp', 'udp', 'tcp'].includes(p)) return '% Invalid protocol (ip/icmp/udp/tcp)'; proto = p as Ace['proto']; }
  const addr = (): [string, string] | null => { const a = t[i++]; if (!a) return null; if (a === 'any') return ['any', '255.255.255.255']; if (a === 'host') { const x = t[i++]; return parseIp(x ?? '') !== null ? [x!, '0.0.0.0'] : null; } if (parseIp(a) === null) return null; const w = t[i]; if (w && parseIp(w) !== null) { i++; return [a, w]; } return [a, '0.0.0.0']; };
  const s = addr(); if (!s) return '% Incomplete or invalid source';
  let d: [string, string] = ['any', '255.255.255.255'], eq: number | undefined;
  if (!std) { const dd = addr(); if (!dd) return '% Incomplete or invalid destination'; d = dd; if (t[i] === 'eq') { const p = t[i + 1]; eq = p === 'domain' ? 53 : p === 'www' ? 80 : +(p ?? ''); if (!eq) return '% Invalid port'; } }
  return { seq, act, proto, src: s[0], sw: s[1], dst: d[0], dw: d[1], eq, text: text.trim() };
}
const addAce = (n: number, text: string): string => { const l = EDGE.acl.get(n) ?? []; const a = ace((l.at(-1)?.seq ?? 0) + 10, text, n < 100); if (typeof a === 'string') return a; l.push(a); EDGE.acl.set(n, l); EDGE.dirty = true; return ''; };
addAce(1, 'permit 192.168.0.0 0.0.255.255'); addAce(1, 'permit 172.16.0.0 0.0.15.255');
addAce(110, 'deny tcp any any eq 23'); addAce(110, 'permit ip any any'); EDGE.dirty = false;
const proto = (p: 'icmp' | 'udp53' | 'tcp80') => (p === 'udp53' ? { pr: 'udp', port: 53 } : p === 'tcp80' ? { pr: 'tcp', port: 80 } : { pr: 'icmp', port: 0 });
function aclPermit(n: number | null, src: string, dst: string, p: 'icmp' | 'udp53' | 'tcp80') {
  if (n === null) return true; const l = EDGE.acl.get(n); if (!l || !l.length) return true;   // an applied but empty/undefined ACL permits all (IOS)
  const { pr, port } = proto(p);
  for (const a of l) { if (a.proto !== 'ip' && a.proto !== pr) continue; if (!wildMatch(src, a.src, a.sw) || !wildMatch(dst, a.dst, a.dw)) continue; if (a.eq !== undefined && a.eq !== port) continue; return a.act === 'permit'; }
  return false;
}
const ifOf = (nh: string) => EDGE.ifs.find(f => { const m = parseMask(f.mask); return m !== null && networkOf(ip2n(f.ip), m) === networkOf(ip2n(nh), m); }) ?? null;
const linkUp = (f: Iface) => !f.shut;
function trackUp(id: number) { const s = EDGE.sla.get(EDGE.track.get(id) ?? -1); if (!s || !s.scheduled) return false; const f = EDGE.ifs.find(x => x.name === s.src) ?? ifOf(s.target); if (!f || !linkUp(f)) return false; const isp = f.isp ? EDGE.isp[f.isp] : null; return !!isp && isp.up && isp.gw === s.target; }
/** the default route the router uses right now */
export function activeRoute(): Route | null {
  const c = EDGE.routes.filter(r => r.net === '0.0.0.0' && r.mask === '0.0.0.0').filter(r => { const f = ifOf(r.nh); return !!f && linkUp(f) && (r.track === null || trackUp(r.track)); });
  return c.sort((a, b) => a.ad - b.ad)[0] ?? null;
}
/** can a packet from an inside host reach the internet now? (why = reason for the CLI/QA) */
export function edgeCheck(src: string, dst: string, p: 'icmp' | 'udp53' | 'tcp80' = 'icmp'): { ok: boolean; why: string } {
  const inside = EDGE.ifs[2];
  if (inside.shut) return { ok: false, why: 'Gi0/2 shutdown' };
  if (!aclPermit(inside.aclIn, src, dst, p)) return { ok: false, why: `ACL ${inside.aclIn} memblok` };
  const r = activeRoute(); if (!r) return { ok: false, why: 'tidak ada default route' };
  const f = ifOf(r.nh)!; const isp = f.isp ? EDGE.isp[f.isp] : null;
  if (!isp || !isp.up) return { ok: false, why: `ISP${f.isp} down (route ke ${r.nh} tanpa tracking)` };
  const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(src);
  if (priv) {
    if (inside.nat !== 'inside') return { ok: false, why: 'ip nat inside belum di Gi0/2' };
    if (f.nat !== 'outside') return { ok: false, why: `ip nat outside belum di ${f.name}` };
    const rule = EDGE.nat.find(n => n.iface === f.name && aclPermit(n.acl, src, '0.0.0.0', 'icmp'));
    if (!rule) return { ok: false, why: `tidak ada aturan NAT overload untuk ${src} keluar ${f.name}` };
  }
  return { ok: true, why: `via ${f.name} (ISP${f.isp})` };
}
HOOKS.internet = (_env: Env, src: string, dst: string, p) => edgeCheck(src, dst, p).ok;

// ---------------------------------------------------------------- IOS-like shell
type Mode = 'user' | 'priv' | 'config' | 'if' | 'sla' | 'acl';
const kw = (tok: string | undefined, word: string, min = 1) => !!tok && tok.length >= min && word.startsWith(tok.toLowerCase());
function ifName(t: string): string | null { const m = /^(?:gigabitethernet|gi|g)(0\/[0-2])$/i.exec(t.replace(/\s+/g, '')); return m ? `GigabitEthernet${m[1]}` : null; }
export class EdgeShell implements Shell {
  private mode: Mode = 'user'; private cur: Iface | null = null; private slaId = 0; private aclId = 0; private started = false;
  onCmd: (line: string) => void = () => {};
  banner() { return `\n${EDGE.host} con0 is now available\n\nPress RETURN to get started.\n`; }
  prompt() { if (!this.started) return ''; const n = EDGE.host; return ({ user: `${n}>`, priv: `${n}#`, config: `${n}(config)#`, if: `${n}(config-if)#`, sla: `${n}(config-ip-sla-echo)#`, acl: `${n}(config-ext-nacl)#` } as Record<Mode, string>)[this.mode]; }
  exec(line: string, _io: TermIO): string {
    if (!this.started) { this.started = true; return ''; }
    if (!line) return '';
    const r = this.run(line.split(/\s+/)); this.onCmd(line); return r;
  }
  private run(t: string[]): string {
    const m = this.mode;
    if (kw(t[0], 'do', 2) && m !== 'user' && m !== 'priv') { const k = this.mode; this.mode = 'priv'; const r = this.run(t.slice(1)); this.mode = k; return r; }
    if (kw(t[0], 'end', 3) && m !== 'user' && m !== 'priv') { this.mode = 'priv'; return `%SYS-5-CONFIG_I: Configured from console by console`; }
    if (kw(t[0], 'exit', 3)) { this.mode = m === 'if' || m === 'sla' || m === 'acl' ? 'config' : m === 'config' ? 'priv' : 'user'; return ''; }
    if (m === 'user' || m === 'priv') {
      if (kw(t[0], 'enable', 2)) { this.mode = 'priv'; return ''; }
      if (kw(t[0], 'disable', 4)) { this.mode = 'user'; return ''; }
      if (kw(t[0], 'show', 2)) return this.show(t.slice(1));
      if (kw(t[0], 'ping', 2)) return this.ping(t[1] ?? '');
      if (m === 'user') return '% Masuk mode privileged dulu: enable';
      if (kw(t[0], 'configure', 4)) { this.mode = 'config'; return 'Enter configuration commands, one per line.  End with CNTL/Z.'; }
      if (kw(t[0], 'write', 2) || (kw(t[0], 'copy', 2) && kw(t[1], 'running-config', 3))) { EDGE.dirty = false; return 'Building configuration...\n[OK]'; }
      return `% Invalid input detected at '^' marker.`;
    }
    const no = kw(t[0], 'no', 2); const u = no ? t.slice(1) : t;
    if (m === 'config') {
      if (kw(u[0], 'interface', 3)) { const n = ifName(u.slice(1).join('')); const f = EDGE.ifs.find(x => x.name === n); if (!f) return '% Invalid interface (Gi0/0, Gi0/1, Gi0/2)'; this.cur = f; this.mode = 'if'; return ''; }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'route', 2)) {
        const [net, mask, nh] = [u[2], u[3], u[4]]; if (!net || !mask || !nh || [net, mask, nh].some(x => parseIp(x) === null)) return '% Incomplete command. ip route NETWORK MASK NEXT-HOP [AD] [track N]';
        if (no) { const before = EDGE.routes.length; EDGE.routes = EDGE.routes.filter(r => !(r.net === net && r.mask === mask && r.nh === nh)); EDGE.dirty = true; return before === EDGE.routes.length ? '%No matching route to delete' : ''; }
        let ad = 1, track: number | null = null; for (let i = 5; i < u.length; i++) { if (kw(u[i], 'track', 2)) { track = +u[++i]; if (!track) return '% Invalid track number'; } else if (/^\d+$/.test(u[i])) ad = +u[i]; }
        if (!ifOf(nh)) return `%Invalid next hop address (${nh} tidak ada di subnet interface mana pun)`;
        EDGE.routes = EDGE.routes.filter(r => !(r.net === net && r.mask === mask && r.nh === nh)); EDGE.routes.push({ net, mask, nh, ad, track }); EDGE.dirty = true; return '';
      }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'nat', 3) && kw(u[2], 'inside', 3) && kw(u[3], 'source', 3) && kw(u[4], 'list', 3)) {
        const acl = +u[5]; const f = ifName(u.slice(7).filter(x => !kw(x, 'overload', 4)).join('')); if (!acl || !kw(u[6], 'interface', 3) || !f) return '% Usage: ip nat inside source list N interface Gi0/X overload';
        if (no) { EDGE.nat = EDGE.nat.filter(r => !(r.acl === acl && r.iface === f)); EDGE.dirty = true; return ''; }
        if (!u.some(x => kw(x, 'overload', 4))) return '% Tanpa overload hanya 1 alamat publik untuk 1 host: tambahkan "overload" (PAT)';
        if (!EDGE.nat.some(r => r.acl === acl && r.iface === f)) EDGE.nat.push({ acl, iface: f }); EDGE.dirty = true; return '';
      }
      if (kw(u[0], 'access-list', 3)) {
        const n = +u[1]; if (!(n >= 1 && n <= 199)) return '% Nomor ACL 1-99 (standard) atau 100-199 (extended)';
        if (no) { EDGE.acl.delete(n); EDGE.dirty = true; return ''; }
        return addAce(n, u.slice(2).join(' '));
      }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'access-list', 3) && kw(u[2], 'extended', 2)) { const n = +u[3]; if (!(n >= 100 && n <= 199)) return '% ACL extended bernomor 100-199'; if (no) { EDGE.acl.delete(n); return ''; } this.aclId = n; if (!EDGE.acl.has(n)) EDGE.acl.set(n, []); this.mode = 'acl'; return ''; }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'sla', 3) && kw(u[2], 'schedule', 3)) { const s = EDGE.sla.get(+u[3]); if (!s) return '% IP SLA belum dibuat'; s.scheduled = !no; EDGE.dirty = true; return ''; }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'sla', 3)) { const n = +u[2]; if (!n) return '% Incomplete command.'; if (no) { EDGE.sla.delete(n); return ''; } if (!EDGE.sla.has(n)) EDGE.sla.set(n, { target: '', src: '', scheduled: false }); this.slaId = n; this.mode = 'sla'; return ''; }
      if (kw(u[0], 'track', 3)) { const n = +u[1]; if (!n) return '% Incomplete command.'; if (no) { EDGE.track.delete(n); return ''; } if (!kw(u[2], 'ip', 2) || !kw(u[3], 'sla', 3) || !+u[4]) return '% Usage: track N ip sla M reachability'; EDGE.track.set(n, +u[4]); EDGE.dirty = true; return ''; }
      if (kw(u[0], 'hostname', 3)) return '% Hostname router ini dikunci untuk inventaris (R-EDGE)';
      return `% Invalid input detected at '^' marker.`;
    }
    if (m === 'if') {
      const f = this.cur!;
      if (kw(u[0], 'shutdown', 4)) { f.shut = !no; EDGE.dirty = true; return `%LINK-5-CHANGED: Interface ${f.name}, changed state to ${f.shut ? 'administratively down' : 'up'}`; }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'nat', 3)) { if (no) { f.nat = null; EDGE.dirty = true; return ''; } if (kw(u[2], 'inside', 3)) f.nat = 'inside'; else if (kw(u[2], 'outside', 3)) f.nat = 'outside'; else return '% ip nat inside | outside'; EDGE.dirty = true; return ''; }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'access-group', 3)) { const n = +u[2]; if (no) { f.aclIn = null; EDGE.dirty = true; return ''; } if (!n || !kw(u[3], 'in', 2)) return '% Usage: ip access-group N in'; f.aclIn = n; EDGE.dirty = true; return ''; }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'address', 3)) { if (no) return '% Alamat interface ini dipakai ISP/core: jangan dihapus'; if (parseIp(u[2] ?? '') === null || parseMask(u[3] ?? '') === null) return '% Invalid address'; f.ip = u[2]; f.mask = u[3]; EDGE.dirty = true; return ''; }
      if (kw(u[0], 'description', 3)) { f.desc = u.slice(1).join(' ').slice(0, 30); return ''; }
      return `% Invalid input detected at '^' marker.`;
    }
    if (m === 'sla') {
      const s = EDGE.sla.get(this.slaId)!;
      if (kw(u[0], 'icmp-echo', 2)) { if (parseIp(u[1] ?? '') === null) return '% icmp-echo TARGET-IP source-interface Gi0/X'; s.target = u[1]; const i = u.findIndex(x => kw(x, 'source-interface', 3)); if (i > 0) { const n = ifName(u.slice(i + 1).join('')); if (!n) return '% Invalid interface'; s.src = n; } EDGE.dirty = true; return ''; }
      if (kw(u[0], 'frequency', 2) || kw(u[0], 'timeout', 2) || kw(u[0], 'threshold', 2)) return '';
      return `% Invalid input detected at '^' marker.`;
    }
    if (m === 'acl') {
      if (no && /^\d+$/.test(u[0] ?? '')) { const l = EDGE.acl.get(this.aclId) ?? []; EDGE.acl.set(this.aclId, l.filter(a => a.seq !== +u[0])); EDGE.dirty = true; return ''; }
      let seq: number | null = null; let rest = u; if (/^\d+$/.test(u[0] ?? '')) { seq = +u[0]; rest = u.slice(1); }
      const l = EDGE.acl.get(this.aclId) ?? []; const a = ace(seq ?? ((l.at(-1)?.seq ?? 0) + 10), rest.join(' '), false); if (typeof a === 'string') return a;
      l.push(a); l.sort((x, y) => x.seq - y.seq); EDGE.acl.set(this.aclId, l); EDGE.dirty = true; return '';
    }
    return '';
  }
  private ping(tg: string) {
    if (parseIp(tg) === null) return '% Unrecognized host or address';
    const f = ifOf(tg); let ok: boolean;
    if (f && f.isp) ok = linkUp(f) && EDGE.isp[f.isp].up && EDGE.isp[f.isp].gw === tg;
    else if (f) ok = linkUp(f);
    else { const r = activeRoute(); ok = !!r && EDGE.isp[ifOf(r.nh)!.isp as 1 | 2]?.up; }
    return `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${tg}, timeout is 2 seconds:\n${ok ? '!!!!!' : '.....'}\nSuccess rate is ${ok ? '100 percent (5/5), round-trip min/avg/max = 2/3/6 ms' : '0 percent (0/5)'}`;
  }
  private show(t: string[]): string {
    if (kw(t[0], 'ip', 2) && kw(t[1], 'interface', 2)) return 'Interface              IP-Address      OK? Method Status                Protocol\n' + EDGE.ifs.map(f => `${f.name.padEnd(23)}${f.ip.padEnd(16)}YES manual ${(f.shut ? 'administratively down' : 'up').padEnd(22)}${f.shut ? 'down' : 'up'}`).join('\n');
    if (kw(t[0], 'ip', 2) && kw(t[1], 'route', 2)) { const a = activeRoute(); return 'Codes: C - connected, S - static, * - candidate default\nGateway of last resort is ' + (a ? `${a.nh} to network 0.0.0.0` : 'not set') + '\n\n' + (a ? `S*    0.0.0.0/0 [${a.ad}/0] via ${a.nh}\n` : '') + EDGE.ifs.filter(f => !f.shut).map(f => `C     ${(() => { const p = parseMask(f.mask)!; const n = networkOf(ip2n(f.ip), p) >>> 0; return `${[n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')}/${p}`; })()} is directly connected, ${f.name}`).join('\n') + '\nS     192.168.0.0/16 [1/0] via 10.255.0.2\nS     172.16.0.0/22 [1/0] via 10.255.0.2'; }
    if (kw(t[0], 'ip', 2) && kw(t[1], 'nat', 2) && kw(t[2], 'translations', 2)) { const r = edgeCheck('192.168.20.101', '103.10.20.30'); if (!r.ok) return 'Pro Inside global      Inside local       Outside local      Outside global'; const f = ifOf(activeRoute()!.nh)!; return `Pro Inside global      Inside local       Outside local      Outside global\ntcp ${f.ip}:51022  192.168.20.101:51022 103.10.20.30:80   103.10.20.30:80\nudp ${f.ip}:1031   192.168.10.5:1031  8.8.8.8:53         8.8.8.8:53\nicmp ${f.ip}:1     192.168.10.130:1   103.10.20.30:1     103.10.20.30:1`; }
    if (kw(t[0], 'ip', 2) && kw(t[1], 'nat', 2)) return `Outside interfaces:\n  ${EDGE.ifs.filter(f => f.nat === 'outside').map(f => f.name).join(', ') || '-'}\nInside interfaces:\n  ${EDGE.ifs.filter(f => f.nat === 'inside').map(f => f.name).join(', ') || '-'}\nDynamic mappings:\n${EDGE.nat.map(n => `-- Inside Source\n[Id: ${n.acl}] access-list ${n.acl} interface ${n.iface} refcount 3`).join('\n') || '  (tidak ada)'}`;
    if (kw(t[0], 'track', 2)) return [...EDGE.track].map(([n, s]) => `Track ${n}\n  IP SLA ${s} reachability\n  Reachability is ${trackUp(n) ? 'Up' : 'Down'}`).join('\n') || '% Belum ada track';
    if (kw(t[0], 'ip', 2) && kw(t[1], 'sla', 2)) return 'IPSLAs Latest Operation Summary\nID   Type        Destination      State       Return code\n' + [...EDGE.sla].map(([n, s]) => `${String(n).padEnd(5)}icmp-echo   ${(s.target || '-').padEnd(17)}${(s.scheduled ? 'Active' : 'Pending').padEnd(12)}${s.scheduled && s.target ? (trackUpRaw(s) ? 'OK' : 'Timeout') : '-'}`).join('\n');
    if (kw(t[0], 'access-lists', 3)) return [...EDGE.acl].map(([n, l]) => `${n < 100 ? 'Standard' : 'Extended'} IP access list ${n}\n${l.map(a => `    ${a.seq} ${a.text}`).join('\n')}`).join('\n') || '';
    if (kw(t[0], 'running-config', 3) || kw(t[0], 'run', 3)) {
      let s = `Building configuration...\n!\nhostname ${EDGE.host}\n!\n`;
      for (const [n, sl] of EDGE.sla) s += `ip sla ${n}\n icmp-echo ${sl.target} source-interface ${sl.src}\n${sl.scheduled ? `ip sla schedule ${n} life forever start-time now\n` : ''}`;
      for (const [n, sl] of EDGE.track) s += `track ${n} ip sla ${sl} reachability\n`;
      for (const f of EDGE.ifs) s += `!\ninterface ${f.name}\n description ${f.desc}\n ip address ${f.ip} ${f.mask}\n${f.nat ? ` ip nat ${f.nat}\n` : ''}${f.aclIn ? ` ip access-group ${f.aclIn} in\n` : ''}${f.shut ? ' shutdown\n' : ''}`;
      s += '!\n' + EDGE.nat.map(n => `ip nat inside source list ${n.acl} interface ${n.iface} overload\n`).join('');
      s += EDGE.routes.map(r => `ip route ${r.net} ${r.mask} ${r.nh}${r.ad !== 1 ? ` ${r.ad}` : ''}${r.track ? ` track ${r.track}` : ''}\n`).join('') + 'ip route 192.168.0.0 255.255.0.0 10.255.0.2\nip route 172.16.0.0 255.255.252.0 10.255.0.2\n!\n';
      for (const [n, l] of EDGE.acl) s += l.map(a => `access-list ${n} ${a.text}\n`).join('');
      return s + '!\nend';
    }
    return `% Invalid input detected at '^' marker.`;
  }
}
const trackUpRaw = (s: { target: string; src: string }) => { const f = EDGE.ifs.find(x => x.name === s.src) ?? ifOf(s.target); return !!f && linkUp(f) && !!f.isp && EDGE.isp[f.isp].up && EDGE.isp[f.isp].gw === s.target; };

// ---------------------------------------------------------------- NOC faults on the edge
const pcOk = (pc: string) => { const a = adapterOf(pc), l = live(a); return l.ok && edgeCheck(l.ip, '103.10.20.30', 'icmp').ok && edgeCheck(l.ip, '8.8.8.8', 'udp53').ok; };
const anyWired = (pc: string) => ['lab', 'office'].includes(envOf(pc).id) && !/_L[4-8]_/.test(pc);
const netOf = (pc: string) => { const e = envOf(pc); return e.net; };
EXT.isp1 = {
  def: { cause: 'Jalur ISP1 putus dan failover ke ISP2 tidak jalan', fix: 'failover di R-EDGE dibetulkan (IP SLA + track di route utama, route cadangan AD lebih besar, NAT overload keluar Gi0/1)', symptom: 'Seluruh gedung tidak bisa internet. Jaringan lokal (ping gateway) normal.', hint: 'Semua lantai kena bersamaan = masalah di edge. Rak 1 ruang server (R-EDGE, bawa console + laptop): show ip route, show track, show ip nat statistics, ping 203.0.113.1 / 198.51.100.1. Route utama harus "track 1", route cadangan AD 10, dan ada NAT overload untuk Gi0/1.', cp: 'Fase F · Routing statis, failover & NAT', rank: 2 },
  eligible: anyWired,
  inject() {
    EDGE.isp[1].up = false;
    const v = ['track', 'backup', 'nat'][Math.floor(Math.random() * 3)];
    if (v === 'track') { EDGE.routes.forEach(r => { if (r.nh === '203.0.113.1') r.track = null; }); return 'ISP1 (NusaNet) putus di sisi ISP; route default utama tidak memakai "track 1" sehingga tetap aktif dan semua lalu lintas dibuang ke ISP1 → ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1'; }
    if (v === 'backup') { EDGE.routes = EDGE.routes.filter(r => r.nh !== '198.51.100.1'); return 'ISP1 putus; route cadangan ke ISP2 terhapus → ip route 0.0.0.0 0.0.0.0 198.51.100.1 10'; }
    EDGE.nat = EDGE.nat.filter(n => n.iface !== 'GigabitEthernet0/1'); return 'ISP1 putus; failover pindah ke ISP2 tapi tidak ada NAT overload keluar Gi0/1 → ip nat inside source list 1 interface Gi0/1 overload';
  },
  ok: pc => !EDGE.isp[1].up && pcOk(pc) && activeRoute()?.nh === '198.51.100.1',
  restore: () => { EDGE.isp[1].up = true; },
};
EXT.nat = {
  def: { cause: 'NAT/PAT di router edge tidak menerjemahkan segmen ini', fix: 'konfigurasi NAT dibetulkan (ip nat inside/outside, ACL NAT mencakup subnet)', symptom: 'Satu segmen tidak bisa internet, segmen lain normal (atau semua segmen setelah perubahan NAT).', hint: 'Ping gateway segmen bisa, internet tidak. Di R-EDGE (rak 1): show ip nat statistics, show access-lists 1, show running-config. Alamat privat hanya bisa ke internet lewat PAT (overload).', cp: 'Fase F · NAT/PAT', rank: 2 },
  eligible: anyWired,
  inject(pc) {
    if (Math.random() < 0.5) { EDGE.ifs[2].nat = null; return '"ip nat inside" hilang dari Gi0/2 setelah ganti kabel/port → interface Gi0/2 › ip nat inside'; }
    const net = netOf(pc), other = ['192.168.10.0', '192.168.20.0', '192.168.30.0'].filter(x => x !== net);
    EDGE.acl.set(1, []); for (const o of other) addAce(1, `permit ${o} 0.0.0.255`); addAce(1, 'permit 172.16.0.0 0.0.15.255');
    return `ACL 1 (daftar alamat yang di-NAT) ditulis ulang per subnet dan ${net}/24 terlewat → access-list 1 permit ${net} 0.0.0.255`;
  },
  ok: pcOk,
};
EXT.acl = {
  def: { cause: 'ACL firewall di router edge memblok lalu lintas yang sah', fix: 'baris ACL yang salah dihapus (ip access-list extended 110 › no <seq>)', symptom: 'Internet mati untuk sebagian PC sejak aturan firewall baru dipasang.', hint: 'Lihat show access-lists di R-EDGE: ACL dibaca dari atas, aturan pertama yang cocok menang, di akhir ada deny implisit. Hapus baris yang salah dengan ip access-list extended 110 lalu no <nomor urut>.', cp: 'Fase F · ACL / firewall', rank: 2 },
  eligible: anyWired,
  inject(pc) {
    const net = netOf(pc), l = EDGE.acl.get(110) ?? [];
    const v = Math.random() < 0.5 ? ace(5, `deny ip ${net} 0.0.0.255 any`, false) : ace(5, 'deny udp any any eq 53', false);
    if (typeof v !== 'string') { l.unshift(v); EDGE.acl.set(110, l); } EDGE.ifs[2].aclIn = 110;
    return typeof v !== 'string' && v.proto === 'udp' ? 'Baris "5 deny udp any any eq 53" (maksudnya memblok DNS luar untuk tamu) memblok semua DNS ke internet → no 5' : `Baris "5 deny ip ${net} 0.0.0.255 any" (salah subnet, maksudnya segmen tamu) memblok ${net}/24 → no 5`;
  },
  ok: pcOk,
};
export const edgeQa = { EDGE, edgeCheck, activeRoute };
void ENVS;
