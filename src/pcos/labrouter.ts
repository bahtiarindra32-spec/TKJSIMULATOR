// R-LAB: the router of the SMK practice lab (Cisco ISR-like CLI, console in the lab rack).
// Gi0/0 is cabled to SW-LAB Gi1/0/24. Untagged traffic on that link reaches the physical interface
// (192.168.70.1 = VLAN 70, the lab's normal segment). Router-on-a-stick: a subinterface Gi0/0.N with
// "encapsulation dot1Q N" + an address routes VLAN N, but only when Gi1/0/24 is a trunk that carries N.
// Inter-VLAN packets pass the ACLs bound to the subinterfaces (in on the source side, out on the target side).
// Everything here feeds net.ts through HOOKS, so ping / browser / ipconfig on the lab PCs follow it.
import { HOOKS, ENVS, SWITCHES, ADAPTERS, envOf, live, onSegment, linkUp, parseIp, parseMask, networkOf, broadcastOf, ipStr, setRouterLan, type Env, type PingRes } from './net';
import { ace, aclMatch, type Ace } from './edge';
import type { Shell, TermIO } from './term';

export interface LabIf { name: string; vlan: number | null; ip: string; mask: string; shut: boolean; aclIn: number | null; aclOut: number | null; desc: string }
export const LABR = {
  host: 'R-LAB',
  phys: { name: 'GigabitEthernet0/0', vlan: null, ip: '192.168.70.1', mask: '255.255.255.0', shut: false, aclIn: null, aclOut: null, desc: 'KE-SW-LAB-Gi1/0/24' } as LabIf,
  subs: new Map<number, LabIf>(),
  acl: new Map<number, Ace[]>(),
  dirty: false,
};
const UPLINK = 24;   // SW-LAB Gi1/0/24 = cable to R-LAB Gi0/0
const labSw = () => SWITCHES.find(s => s.name === 'SW-LAB') ?? null;

/** back to the lab's everyday state: no subinterfaces, no ACL, Gi1/0/24 access VLAN 70 */
export function resetLabRouter() {
  LABR.phys = { name: 'GigabitEthernet0/0', vlan: null, ip: '192.168.70.1', mask: '255.255.255.0', shut: false, aclIn: null, aclOut: null, desc: 'KE-SW-LAB-Gi1/0/24' };
  LABR.subs.clear(); LABR.acl.clear(); LABR.dirty = false;
  setRouterLan(ENVS.prak, '192.168.70.1', 24);
  const sw = labSw(); if (sw) { const p = sw.ports[UPLINK - 1]; p.shutdown = false; p.vlan = 70; p.trunk = undefined; p.desc = 'KE-R-LAB-Gi0/0'; p.peer = 'R-LAB Gi0/0'; }
  DYN.clear();
}

// ---------------------------------------------------------------- segments behind the router
const DYN = new Map<number, Env>();
function dynEnv(v: number, f: LabIf): Env {
  let e = DYN.get(v);
  const prefix = parseMask(f.mask) ?? 24, ip = parseIp(f.ip)!;
  if (!e) {
    e = { id: `v${v}`, vlan: v, label: `Lab Praktik VLAN ${v}`, net: '', prefix, gateway: '', dns: [], dhcp: null, dnsSrv: ENVS.prak.dnsSrv, suffix: ENVS.prak.suffix,
      hosts: [{ ip: f.ip, name: `r-lab-gi0-0-${v}`, mac: `48-8f-5a-70-${(v & 255).toString(16).padStart(2, '0')}-01`, ttl: 255, web: 'router' }], internet: true, adapter: ENVS.prak.adapter, wireless: false, leases: new Map() };
    DYN.set(v, e);
  }
  e.prefix = prefix; e.gateway = f.ip; e.dns = [f.ip]; e.net = ipStr(networkOf(ip, prefix)); e.hosts[0].ip = f.ip;
  return e;
}
const sameNet = (a: string, mask: string, b: string, p2: number) => { const m = parseMask(mask); const x = parseIp(a), y = parseIp(b); return m !== null && x !== null && y !== null && m === p2 && networkOf(x, m) === networkOf(y, m); };
/** the router interface that serves VLAN v on SW-LAB right now (null = that VLAN has no router) */
export function ifForVlan(v: number): LabIf | null {
  const sw = labSw(); if (!sw) return null;
  const up = sw.ports[UPLINK - 1];
  if (up.shutdown || LABR.phys.shut || !sw.vlans.has(v)) return null;
  const physOk = parseIp(LABR.phys.ip) !== null;
  if (!up.trunk) return up.vlan === v && physOk ? LABR.phys : null;
  if (up.trunk.allowed && !up.trunk.allowed.includes(v)) return null;
  if (up.trunk.native === v) return physOk ? LABR.phys : null;
  const s = LABR.subs.get(v);
  return s && !s.shut && s.vlan === v && parseIp(s.ip) !== null ? s : null;
}
export function labVlanEnv(v: number): Env | null {
  const f = ifForVlan(v); if (!f) return null;
  if (f === LABR.phys || sameNet(f.ip, f.mask, ENVS.prak.gateway, ENVS.prak.prefix)) return ENVS.prak;
  return dynEnv(v, f);
}
HOOKS.labVlan = labVlanEnv;
/** every lab segment the router serves now, with the interface that serves it */
export function labSegments(): { env: Env; f: LabIf }[] {
  const sw = labSw(); if (!sw) return [];
  const out: { env: Env; f: LabIf }[] = [];
  for (const v of sw.vlans.keys()) { const f = ifForVlan(v); const e = labVlanEnv(v); if (f && e && !out.some(o => o.env === e)) out.push({ env: e, f }); }
  return out;
}
const isLabEnv = (e: Env) => e === ENVS.prak || [...DYN.values()].includes(e);
const inNet = (ip: string, e: Env) => { const x = parseIp(ip); const g = parseIp(e.gateway); return x !== null && g !== null && networkOf(x, e.prefix) === networkOf(g, e.prefix); };
/** can a packet from src (on segment env) to dst cross R-LAB? (ACL in on the source interface, out on the target one) */
export function labPermits(env: Env, src: string, dst: string, p: 'icmp' | 'udp53' | 'tcp80' = 'icmp') {
  const segs = labSegments(); const from = segs.find(s => s.env === env); if (!from) return false;
  if (from.f.aclIn !== null && !aclMatch(LABR.acl.get(from.f.aclIn), src, dst, p)) return false;
  const to = segs.find(s => inNet(dst, s.env));
  if (to && to.f.aclOut !== null && !aclMatch(LABR.acl.get(to.f.aclOut), src, dst, p)) return false;
  return true;
}
HOOKS.labRoute = (env, src, dst): PingRes | null => {
  if (!isLabEnv(env)) return null;
  const segs = labSegments();
  if (!segs.some(s => s.env === env)) return { kind: 'timeout' };
  const to = segs.find(s => s.env !== env && inNet(dst, s.env));
  if (!labPermits(env, src, dst)) return { kind: 'timeout' };
  if (!to) return null;                                   // not another lab VLAN: the normal path (server, internet)
  const E = to.env;
  const h = E.hosts.find(x => x.ip === dst && !x.down);
  if (h) return { kind: 'reply', ip: dst, ttl: h.ttl - 1, ms: () => 1 + Math.round(Math.random() * 2) };
  for (const o of ADAPTERS.values()) {
    if (!o.enabled || !linkUp(o) || envOf(o.pc) !== E) continue;
    const ol = live(o, E); if (!ol.ok || ol.ip !== dst || !onSegment(ol, E, o)) continue;
    if (ol.gw !== E.gateway) return { kind: 'timeout' };    // the reply has no way back: that PC's gateway is wrong
    if (!labPermits(E, dst, src)) return { kind: 'timeout' };  // the echo reply crosses the router too
    return { kind: 'reply', ip: dst, ttl: 127, ms: () => 1 + Math.round(Math.random() * 2) };
  }
  return { kind: 'timeout' };
};

// ---------------------------------------------------------------- IOS-like shell
type Mode = 'user' | 'priv' | 'config' | 'if' | 'acl';
const kw = (tok: string | undefined, word: string, min = 1) => !!tok && tok.length >= min && word.startsWith(tok.toLowerCase());
/** "g0/0", "gi0/0.10", "GigabitEthernet0/0.20" → [physical?, vlan sub number|null] */
function ifRef(t: string): { sub: number | null } | null {
  const m = /^(?:gigabitethernet|gi|g)0\/0(?:\.(\d{1,4}))?$/i.exec(t.replace(/\s+/g, '')); if (!m) return null;
  return { sub: m[1] ? +m[1] : null };
}
const addAce = (n: number, text: string, seq?: number): string => { const l = LABR.acl.get(n) ?? []; const a = ace(seq ?? ((l.at(-1)?.seq ?? 0) + 10), text, n < 100); if (typeof a === 'string') return a; l.push(a); l.sort((x, y) => x.seq - y.seq); LABR.acl.set(n, l); LABR.dirty = true; return ''; };

export class LabRouterShell implements Shell {
  private mode: Mode = 'user'; private cur: LabIf | null = null; private aclId = 0; private started = false;
  onCmd: (line: string) => void = () => {};
  banner() { return `\n${LABR.host} con0 is now available\n\nPress RETURN to get started.\n`; }
  prompt() { if (!this.started) return ''; const n = LABR.host; return ({ user: `${n}>`, priv: `${n}#`, config: `${n}(config)#`, if: this.cur && this.cur !== LABR.phys ? `${n}(config-subif)#` : `${n}(config-if)#`, acl: `${n}(config-ext-nacl)#` } as Record<Mode, string>)[this.mode]; }
  exec(line: string, _io: TermIO): string {
    if (!this.started) { this.started = true; return ''; }
    if (!line.trim()) return '';
    const r = this.run(line.trim().split(/\s+/)); this.onCmd(line); return r;
  }
  private run(t: string[]): string {
    const m = this.mode;
    if (kw(t[0], 'do', 2) && m !== 'user' && m !== 'priv') { const k = this.mode; this.mode = 'priv'; const r = this.run(t.slice(1)); this.mode = k; return r; }
    if (kw(t[0], 'end', 3) && m !== 'user' && m !== 'priv') { this.mode = 'priv'; return '%SYS-5-CONFIG_I: Configured from console by console'; }
    if (kw(t[0], 'exit', 3)) { this.mode = m === 'if' || m === 'acl' ? 'config' : m === 'config' ? 'priv' : 'user'; return ''; }
    if (m === 'user' || m === 'priv') {
      if (kw(t[0], 'enable', 2)) { this.mode = 'priv'; return ''; }
      if (kw(t[0], 'disable', 4)) { this.mode = 'user'; return ''; }
      if (kw(t[0], 'show', 2)) return this.show(t.slice(1));
      if (kw(t[0], 'ping', 2)) return this.ping(t[1] ?? '');
      if (m === 'user') return '% Masuk mode privileged dulu: enable';
      if (kw(t[0], 'configure', 4)) { this.mode = 'config'; return 'Enter configuration commands, one per line.  End with CNTL/Z.'; }
      if (kw(t[0], 'write', 2) || (kw(t[0], 'copy', 2) && kw(t[1], 'running-config', 3))) { LABR.dirty = false; return 'Building configuration...\n[OK]'; }
      if (kw(t[0], 'reload', 3)) return '% Reload ditolak saat praktik berjalan. Simpan dengan "write memory".';
      return "% Invalid input detected at '^' marker.";
    }
    const no = kw(t[0], 'no', 2); const u = no ? t.slice(1) : t;
    if (m === 'config' || (m === 'if' && kw(u[0], 'interface', 3))) {
      if (kw(u[0], 'interface', 3)) {
        const r = ifRef(u.slice(1).join('')); if (!r) return '% Invalid interface (router ini punya Gi0/0 dan subinterface Gi0/0.N)';
        if (r.sub === null) { this.cur = LABR.phys; this.mode = 'if'; return ''; }
        if (!(r.sub >= 1 && r.sub <= 4094)) return '% Nomor subinterface 1-4094';
        if (no) { LABR.subs.delete(r.sub); LABR.dirty = true; return ''; }
        let s = LABR.subs.get(r.sub);
        if (!s) { s = { name: `GigabitEthernet0/0.${r.sub}`, vlan: null, ip: '', mask: '', shut: false, aclIn: null, aclOut: null, desc: '' }; LABR.subs.set(r.sub, s); LABR.dirty = true; }
        this.cur = s; this.mode = 'if'; return '';
      }
      if (kw(u[0], 'access-list', 3)) {
        const n = +u[1]; if (!(n >= 1 && n <= 199)) return '% Nomor ACL 1-99 (standard) atau 100-199 (extended)';
        if (no) { LABR.acl.delete(n); LABR.dirty = true; return ''; }
        return addAce(n, u.slice(2).join(' '));
      }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'access-list', 3) && kw(u[2], 'extended', 2)) { const n = +u[3]; if (!(n >= 100 && n <= 199)) return '% Router ini memakai ACL bernomor: extended 100-199'; if (no) { LABR.acl.delete(n); LABR.dirty = true; return ''; } this.aclId = n; if (!LABR.acl.has(n)) LABR.acl.set(n, []); this.mode = 'acl'; return ''; }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'routing', 3)) return '';
      if (kw(u[0], 'hostname', 3)) return '% Hostname router lab dikunci (R-LAB, sesuai label rak)';
      return "% Invalid input detected at '^' marker.";
    }
    if (m === 'if') {
      const f = this.cur!; const sub = f !== LABR.phys;
      if (kw(u[0], 'shutdown', 4)) { f.shut = !no; LABR.dirty = true; return `%LINK-5-CHANGED: Interface ${f.name}, changed state to ${f.shut ? 'administratively down' : 'up'}`; }
      if (kw(u[0], 'encapsulation', 3)) {
        if (!sub) return '% Encapsulation dot1Q dipasang di subinterface (interface Gi0/0.N), bukan di Gi0/0';
        if (no) { f.vlan = null; LABR.dirty = true; return ''; }
        if (!kw(u[1], 'dot1q', 3)) return '% Usage: encapsulation dot1Q VLAN-ID';
        const v = +u[2]; if (!(v >= 1 && v <= 4094)) return '% Incomplete command. encapsulation dot1Q VLAN-ID';
        for (const [n, o] of LABR.subs) if (o !== f && o.vlan === v) return `% Configuration of multiple subinterfaces of the same main interface with the same VID (${v}) is not permitted. This VID is already configured on GigabitEthernet0/0.${n}.`;
        f.vlan = v; LABR.dirty = true; return '';
      }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'address', 3)) {
        if (no) { f.ip = ''; f.mask = ''; LABR.dirty = true; return ''; }
        if (parseIp(u[2] ?? '') === null || parseMask(u[3] ?? '') === null) return '% Usage: ip address A.B.C.D MASK (contoh 192.168.71.1 255.255.255.192)';
        if (sub && f.vlan === null) return '% Configuring IP routing on a LAN subinterface is only allowed if that subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q, or ISL vLAN.';
        const p = parseMask(u[3])!, ip = parseIp(u[2])!, net = networkOf(ip, p);
        if (ip === net || ip === broadcastOf(ip, p)) return `% ${u[2]} adalah alamat network/broadcast, bukan alamat host`;
        for (const o of [LABR.phys, ...LABR.subs.values()]) if (o !== f && o.ip) { const op = parseMask(o.mask)!; const pp = Math.min(p, op); if (networkOf(parseIp(o.ip)!, pp) === networkOf(ip, pp)) return `% ${ipStr(net)} overlaps with ${o.name}`; }
        f.ip = u[2]; f.mask = u[3]; LABR.dirty = true;
        if (!sub) setRouterLan(ENVS.prak, f.ip, p);
        return '';
      }
      if (kw(u[0], 'ip', 2) && kw(u[1], 'access-group', 3)) {
        const n = +u[2]; const dir = u[3]?.toLowerCase();
        if (no) { if (!dir || kw(dir, 'in', 2)) f.aclIn = null; if (!dir || kw(dir, 'out', 2)) f.aclOut = null; LABR.dirty = true; return ''; }
        if (!n || !dir || !(kw(dir, 'in', 2) || kw(dir, 'out', 2))) return '% Usage: ip access-group NOMOR in|out';
        if (kw(dir, 'in', 2)) f.aclIn = n; else f.aclOut = n; LABR.dirty = true; return '';
      }
      if (kw(u[0], 'description', 3)) { f.desc = u.slice(1).join(' ').slice(0, 30); LABR.dirty = true; return ''; }
      return "% Invalid input detected at '^' marker.";
    }
    if (m === 'acl') {
      if (no && /^\d+$/.test(u[0] ?? '')) { const l = LABR.acl.get(this.aclId) ?? []; LABR.acl.set(this.aclId, l.filter(a => a.seq !== +u[0])); LABR.dirty = true; return ''; }
      let seq: number | undefined; let rest = u; if (/^\d+$/.test(u[0] ?? '')) { seq = +u[0]; rest = u.slice(1); }
      return addAce(this.aclId, rest.join(' '), seq);
    }
    return '';
  }
  private ping(tg: string) {
    if (parseIp(tg) === null) return '% Unrecognized host or address';
    const seg = labSegments().find(s => inNet(tg, s.env));
    let ok = false;
    if (seg) {
      ok = seg.env.hosts.some(h => h.ip === tg) || [...ADAPTERS.values()].some(o => o.enabled && linkUp(o) && envOf(o.pc) === seg.env && live(o, seg.env).ip === tg);
    }
    return `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${tg}, timeout is 2 seconds:\n${ok ? '!!!!!' : '.....'}\nSuccess rate is ${ok ? '100 percent (5/5), round-trip min/avg/max = 1/1/2 ms' : '0 percent (0/5)'}`;
  }
  private show(t: string[]): string {
    const all = [LABR.phys, ...[...LABR.subs.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1])];
    const sw = labSw(); const up = sw?.ports[UPLINK - 1]; const link = !!up && !up.shutdown;
    const st = (f: LabIf) => (f.shut || (f !== LABR.phys && LABR.phys.shut) ? 'administratively down' : link ? 'up' : 'down');
    if (kw(t[0], 'ip', 2) && kw(t[1], 'interface', 2)) return 'Interface              IP-Address      OK? Method Status                Protocol\n' + all.map(f => `${f.name.padEnd(23)}${(f.ip || 'unassigned').padEnd(16)}YES manual ${st(f).padEnd(22)}${st(f) === 'up' ? 'up' : 'down'}`).join('\n');
    if (kw(t[0], 'vlans', 4)) return [...LABR.subs.values()].filter(s => s.vlan !== null).map(s => `Virtual LAN ID:  ${s.vlan} (IEEE 802.1Q Encapsulation)\n\n   vLAN Trunk Interface:   ${s.name}\n\n   Protocols Configured:   Address:\n          IP               ${s.ip || '-'}\n`).join('\n') || '% Belum ada subinterface dengan encapsulation dot1Q';
    if (kw(t[0], 'ip', 2) && kw(t[1], 'route', 2)) {
      return 'Codes: C - connected, L - local, S - static\nGateway of last resort is 192.168.70.254 to network 0.0.0.0\n\nS*    0.0.0.0/0 [1/0] via 192.168.70.254\n' + all.filter(f => f.ip && st(f) === 'up' && (f === LABR.phys || f.vlan !== null)).map(f => { const p = parseMask(f.mask)!; return `C     ${ipStr(networkOf(parseIp(f.ip)!, p))}/${p} is directly connected, ${f.name}\nL     ${f.ip}/32 is directly connected, ${f.name}`; }).join('\n');
    }
    if (kw(t[0], 'access-lists', 3)) return [...LABR.acl].map(([n, l]) => `${n < 100 ? 'Standard' : 'Extended'} IP access list ${n}\n${l.map(a => `    ${a.seq} ${a.text}`).join('\n')}`).join('\n') || '';
    if (kw(t[0], 'running-config', 3) || kw(t[0], 'run', 3)) {
      let s = `Building configuration...\n!\nhostname ${LABR.host}\n!\n`;
      for (const f of all) s += `interface ${f.name}\n${f.desc ? ` description ${f.desc}\n` : ''}${f !== LABR.phys && f.vlan !== null ? ` encapsulation dot1Q ${f.vlan}\n` : ''}${f.ip ? ` ip address ${f.ip} ${f.mask}\n` : ' no ip address\n'}${f.aclIn ? ` ip access-group ${f.aclIn} in\n` : ''}${f.aclOut ? ` ip access-group ${f.aclOut} out\n` : ''}${f.shut ? ' shutdown\n' : ''}!\n`;
      s += 'ip route 0.0.0.0 0.0.0.0 192.168.70.254\n!\n';
      for (const [n, l] of LABR.acl) s += l.map(a => `access-list ${n} ${a.text}\n`).join('');
      return s + '!\nend';
    }
    if (kw(t[0], 'version', 2)) return 'Cisco IOS XE Software, ISR4321 (simulasi lab SMK)\nR-LAB uptime is 12 days, 2 hours\n2 Gigabit Ethernet interfaces';
    return "% Invalid input detected at '^' marker.";
  }
}
