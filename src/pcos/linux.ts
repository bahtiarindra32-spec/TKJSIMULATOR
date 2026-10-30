// srv-nusa: the Ubuntu-like Linux server in rack 2 of the L1 server room (192.168.10.5, lab VLAN 10).
// It really runs the lab's services: isc-dhcp-server hands out the lab leases (ENVS.lab.dhcp follows
// /etc/dhcp/dhcpd.conf), bind9 answers DNS for lab.smk.local (forwarding the rest to router-lab), apache2
// serves http://intranet.lab.smk.local, and sshd lets a PC log in. Config is edited as text files.
import { ENVS, HOOKS, ADAPTERS, envOf, adapterOf, bounce, live, ping, routerAnswer, PUBLIC_DNS, INTERNET, parseIp, ipStr, networkOf, parseMask, type Adapter } from './net';
import { prefixToMask } from '../game/missionLogic';
import { EXT } from './ext';
import type { Shell, TermIO } from './term';

export const SRV = { ip: '192.168.10.5', name: 'srv-nusa', zone: 'lab.smk.local', user: 'teknisi', pass: 'smkbisa', power: true, cable: true };
type Svc = 'isc-dhcp-server' | 'bind9' | 'apache2' | 'ssh';
const ALIAS: Record<string, Svc> = { 'isc-dhcp-server': 'isc-dhcp-server', dhcpd: 'isc-dhcp-server', dhcp: 'isc-dhcp-server', bind9: 'bind9', named: 'bind9', bind: 'bind9', apache2: 'apache2', apache: 'apache2', httpd: 'apache2', ssh: 'ssh', sshd: 'ssh' };
interface SvcState { active: boolean; enabled: boolean; failed: boolean; log: string[]; since: number }
export const SVC: Record<Svc, SvcState> = {
  'isc-dhcp-server': { active: true, enabled: true, failed: false, log: [], since: Date.now() },
  bind9: { active: true, enabled: true, failed: false, log: [], since: Date.now() },
  apache2: { active: true, enabled: true, failed: false, log: [], since: Date.now() },
  ssh: { active: true, enabled: true, failed: false, log: [], since: Date.now() },
};
const DHCPD = `# /etc/dhcp/dhcpd.conf · isc-dhcp-server untuk Lab TKJ (VLAN 10)
option domain-name "lab.smk.local";
option domain-name-servers 192.168.10.5;
default-lease-time 86400;
max-lease-time 172800;
authoritative;

subnet 192.168.10.0 netmask 255.255.255.0 {
  range 192.168.10.100 192.168.10.199;
  option routers 192.168.10.1;
}
`;
const ZONE = `$TTL 604800
@        IN SOA srv-nusa.lab.smk.local. admin.lab.smk.local. (
              2026103001 ; serial
              604800 86400 2419200 604800 )
@        IN NS   srv-nusa.lab.smk.local.
srv-nusa IN A    192.168.10.5
router   IN A    192.168.10.1
praktik  IN A    192.168.10.10
wlc      IN A    192.168.10.20
intranet IN A    192.168.10.5
www      IN CNAME intranet
`;
export const FILES = new Map<string, string>([
  ['/etc/dhcp/dhcpd.conf', DHCPD],
  ['/etc/default/isc-dhcp-server', 'INTERFACESv4="ens18"\nINTERFACESv6=""\n'],
  ['/etc/bind/named.conf.options', 'options {\n  directory "/var/cache/bind";\n  forwarders { 192.168.10.1; };\n  allow-query { any; };\n  recursion yes;\n};\n'],
  ['/etc/bind/named.conf.local', 'zone "lab.smk.local" {\n  type master;\n  file "/etc/bind/db.lab.smk.local";\n};\n'],
  ['/etc/bind/db.lab.smk.local', ZONE],
  ['/var/www/html/index.html', '<h1>Intranet Lab TKJ</h1>\n<p>Selamat datang di server srv-nusa. Jadwal praktik, modul, dan pengumuman lab ada di sini.</p>\n'],
  ['/etc/ssh/sshd_config', 'Port 22\nPermitRootLogin no\nPasswordAuthentication yes\n'],
  ['/etc/netplan/50-cloud-init.yaml', 'network:\n  ethernets:\n    ens18:\n      addresses: [192.168.10.5/24]\n      routes:\n        - to: default\n          via: 192.168.10.1\n      nameservers:\n        addresses: [127.0.0.1]\n  version: 2\n'],
  ['/etc/hostname', 'srv-nusa\n'],
]);
const DIRS = ['/', '/etc', '/etc/dhcp', '/etc/bind', '/etc/default', '/etc/ssh', '/etc/netplan', '/var', '/var/www', '/var/www/html', '/var/lib', '/var/lib/dhcp', '/home', '/home/teknisi'];

// ---------------------------------------------------------------- parsers (what the daemons load)
interface Dhcp { start: string; end: string; gw: string; dns: string[]; lease: number; net: string; mask: string }
export function parseDhcpd(txt: string): { cfg: Dhcp | null; err: string } {
  const t = txt.replace(/#.*$/gm, '');
  // every statement must end with ; (except block lines)
  const lines = t.split('\n').map((x, i) => [x.trim(), i + 1] as [string, number]).filter(([x]) => x);
  for (const [x, n] of lines) if (!/[;{}]$/.test(x)) return { cfg: null, err: `/etc/dhcp/dhcpd.conf line ${n}: semicolon expected.` };
  const sub = /subnet\s+([\d.]+)\s+netmask\s+([\d.]+)\s*\{([^}]*)\}/.exec(t);
  if (!sub) return { cfg: null, err: 'No subnet declaration for ens18 (192.168.10.5).\n** Ignoring requests on ens18. **\nNot configured to listen on any interfaces!' };
  const net = sub[1], mask = sub[2], pfx = parseMask(mask);
  if (parseIp(net) === null || pfx === null) return { cfg: null, err: `/etc/dhcp/dhcpd.conf: bad subnet ${net} netmask ${mask}` };
  if (networkOf(parseIp(SRV.ip)!, pfx) !== parseIp(net)) return { cfg: null, err: `No subnet declaration for ens18 (${SRV.ip}).\n** Ignoring requests on ens18. **` };
  const body = sub[3];
  const rg = /range\s+([\d.]+)\s+([\d.]+)\s*;/.exec(body); if (!rg) return { cfg: null, err: 'subnet 192.168.10.0: no range statement (no free leases).' };
  const [s, e] = [parseIp(rg[1]), parseIp(rg[2])];
  if (s === null || e === null) return { cfg: null, err: `bad range ${rg[1]} ${rg[2]}` };
  if (networkOf(s, pfx) !== parseIp(net) || networkOf(e, pfx) !== parseIp(net)) return { cfg: null, err: `Address range ${rg[1]} to ${rg[2]} not on net ${net}/${mask}!` };
  if (s > e) return { cfg: null, err: `Address range ${rg[1]} to ${rg[2]}: start after end.` };
  const gw = /option\s+routers\s+([\d.]+)\s*;/.exec(body)?.[1] ?? /option\s+routers\s+([\d.]+)\s*;/.exec(t)?.[1] ?? '';
  const dnsM = /option\s+domain-name-servers\s+([\d.,\s]+);/.exec(body) ?? /option\s+domain-name-servers\s+([\d.,\s]+);/.exec(t);
  const dns = dnsM ? dnsM[1].split(/[,\s]+/).filter(x => parseIp(x) !== null) : [];
  const lease = +(/default-lease-time\s+(\d+)/.exec(t)?.[1] ?? 86400);
  return { cfg: { start: rg[1], end: rg[2], gw, dns, lease: Math.max(1, Math.round(lease / 3600)), net, mask }, err: '' };
}
export interface Rec { name: string; type: 'A' | 'CNAME' | 'NS'; val: string }
export function parseZone(txt: string): { recs: Rec[]; err: string; serial: string } {
  const recs: Rec[] = []; let serial = '';
  const body = txt.replace(/;.*$/gm, '');
  serial = /SOA[^(]*\(\s*(\d+)/.exec(body)?.[1] ?? '';
  if (!/\bSOA\b/.test(body)) return { recs, err: `zone ${SRV.zone}/IN: has no SOA record`, serial };
  const flat = body.replace(/\([^)]*\)/g, '');
  for (const [i, raw] of flat.split('\n').entries()) {
    const x = raw.trim(); if (!x || x.startsWith('$') || /\bSOA\b/.test(x)) continue;
    const m = /^(\S+)\s+(?:\d+\s+)?(?:IN\s+)?(A|CNAME|NS)\s+(\S+)$/i.exec(x);
    if (!m) return { recs, err: `db.${SRV.zone}:${i + 1}: unknown RR type or syntax error near '${x.slice(0, 30)}'`, serial };
    const type = m[2].toUpperCase() as Rec['type'];
    if (type === 'A' && parseIp(m[3]) === null) return { recs, err: `db.${SRV.zone}:${i + 1}: bad dotted quad '${m[3]}'`, serial };
    recs.push({ name: m[1].toLowerCase(), type, val: m[3].toLowerCase() });
  }
  return { recs, err: '', serial };
}
let LOADED: Rec[] = parseZone(ZONE).recs;
let FORWARDERS = ['192.168.10.1'];

const now = () => new Date().toTimeString().slice(0, 8);
function log(s: Svc, msg: string) { SVC[s].log.push(`Oct 30 ${now()} srv-nusa ${s === 'bind9' ? 'named' : s === 'isc-dhcp-server' ? 'dhcpd' : s === 'ssh' ? 'sshd' : 'apache2'}[${1000 + SVC[s].log.length}]: ${msg}`); if (SVC[s].log.length > 30) SVC[s].log.shift(); }

/** (re)start a daemon: it reads its config files now, exactly like the real ones */
function start(s: Svc): string {
  const S = SVC[s]; S.failed = false;
  if (s === 'isc-dhcp-server') {
    const { cfg, err } = parseDhcpd(FILES.get('/etc/dhcp/dhcpd.conf') ?? '');
    if (!cfg) { S.active = false; S.failed = true; log(s, err.split('\n')[0]); log(s, 'Configuration file errors encountered -- exiting'); applyDhcp(); return `Job for isc-dhcp-server.service failed because the control process exited with error code.\nSee "systemctl status isc-dhcp-server.service" and "journalctl -xeu isc-dhcp-server.service" for details.`; }
    S.active = true; log(s, `Listening on LPF/ens18/${SRV.ip}/${cfg.net}/${(parseMask(cfg.mask))}`); log(s, `Server starting service. Pool ${cfg.start} - ${cfg.end}, routers ${cfg.gw || '-'}, dns ${cfg.dns.join(',') || '-'}`);
  } else if (s === 'bind9') {
    const z = parseZone(FILES.get(`/etc/bind/db.${SRV.zone}`) ?? '');
    const fw = /forwarders\s*\{([^}]*)\}/.exec(FILES.get('/etc/bind/named.conf.options') ?? '')?.[1] ?? '';
    FORWARDERS = fw.split(/[;\s]+/).filter(x => parseIp(x) !== null);
    S.active = true;
    if (z.err) { LOADED = []; log(s, z.err); log(s, `zone ${SRV.zone}/IN: not loaded due to errors.`); }
    else { LOADED = z.recs; log(s, `zone ${SRV.zone}/IN: loaded serial ${z.serial}`); }
    log(s, 'all zones loaded'); log(s, 'running');
  } else if (s === 'apache2') { S.active = true; log(s, 'AH00094: Command line: \'/usr/sbin/apache2\' · resuming normal operations'); }
  else { S.active = true; log(s, 'Server listening on 0.0.0.0 port 22.'); }
  S.since = Date.now(); applyDhcp(); return '';
}
function stop(s: Svc) { SVC[s].active = false; SVC[s].failed = false; log(s, 'Stopped.'); applyDhcp(); }
/** The lab segment's DHCP server is this box: the sim's lab pool is whatever dhcpd has loaded. */
export function applyDhcp() {
  const S = SVC['isc-dhcp-server'];
  const up = SRV.power && SRV.cable && S.active;
  const { cfg } = parseDhcpd(FILES.get('/etc/dhcp/dhcpd.conf') ?? '');
  ENVS.lab.dhcp = up && cfg ? { start: cfg.start, end: cfg.end, gw: cfg.gw, dns: cfg.dns, lease: cfg.lease } : null;
}
const host = () => ENVS.lab.hosts.find(h => h.ip === SRV.ip)!;
function syncHost() { const hh = host(); hh.down = !SRV.power || !SRV.cable; applyDhcp(); }

/** bind9 answering a client */
function answer(n: string, a: Adapter | null): { ip: string } | null | 'timeout' {
  if (!SVC.bind9.active) return 'timeout';
  const zone = SRV.zone; let name = n.toLowerCase().replace(/\.$/, '');
  for (let hop = 0; hop < 4; hop++) {
    const rel = name === zone ? '@' : name.endsWith(`.${zone}`) ? name.slice(0, -zone.length - 1) : (!name.includes('.') ? name : null);
    if (rel === null) break;
    if (!LOADED.length) return 'timeout';                      // zone failed to load: SERVFAIL
    const r = LOADED.find(x => x.name === rel && x.type !== 'NS');
    if (!r) return null;                                        // NXDOMAIN inside our zone
    if (r.type === 'A') return { ip: r.val };
    name = r.val.endsWith('.') ? r.val.slice(0, -1) : r.val.includes('.') ? r.val : `${r.val}.${zone}`;
  }
  for (const f of FORWARDERS) {
    if (f === ENVS.lab.gateway) { const x = routerAnswer(ENVS.lab, name, SRV.ip); if (x === 'refused') continue; return x; }
    if (PUBLIC_DNS.includes(f)) { if (!HOOKS.internet(ENVS.lab, SRV.ip, f, 'udp53')) continue; return INTERNET[name] ? { ip: INTERNET[name].ip } : null; }
  }
  void a; return 'timeout';
}
HOOKS.dns.set(SRV.ip, (n, a) => answer(n, a));

/** web page served at srv-nusa (null = connection refused) */
export function webPage(): string | null { return SVC.apache2.active && SRV.power && SRV.cable ? FILES.get('/var/www/html/index.html') ?? '' : null; }

export function initLinux() {
  if (!ENVS.lab.hosts.some(h => h.ip === SRV.ip)) ENVS.lab.hosts.push({ ip: SRV.ip, name: SRV.name, mac: '52-54-00-10-00-05', ttl: 64, web: 'linux' });
  for (const s of Object.keys(SVC) as Svc[]) start(s);
  syncHost();
}

// ---------------------------------------------------------------- the shell
export class LinuxShell implements Shell {
  private cwd = '/home/teknisi';
  private stage: 'login' | 'pass' | 'shell' | 'closed';
  private who = '';
  constructor(private via: 'console' | 'ssh', private from = '', user = '') {
    this.stage = via === 'ssh' ? 'pass' : 'login'; this.who = user;
  }
  get open() { return this.stage !== 'closed'; }
  get secret() { return this.stage === 'pass'; }
  banner() { return this.via === 'console' ? `\nUbuntu 24.04.1 LTS srv-nusa tty1\n\n` : ''; }
  prompt() { return this.stage === 'login' ? 'srv-nusa login: ' : this.stage === 'pass' ? (this.via === 'ssh' ? `${this.who}@${SRV.ip}'s password: ` : 'Password: ') : this.stage === 'closed' ? '' : `${this.who}@srv-nusa:${this.cwd.replace(/^\/home\/teknisi/, '~')}$ `; }
  private motd() { return `Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)\n\n  System load:  0.08   Memory usage: 23%   IPv4 address for ens18: ${SRV.ip}\n\nLast login: Thu Oct 29 15:02:11 2026 from 192.168.10.101\nKetik "help" untuk daftar perintah server ini.`; }
  private path(p: string) { if (!p) return this.cwd; if (p === '~') return '/home/teknisi'; let x = p.startsWith('/') ? p : `${this.cwd}/${p}`; const out: string[] = []; for (const s of x.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); } return '/' + out.join('/'); }
  exec(line: string, io: TermIO): string {
    if (this.stage === 'login') { if (!line) return ''; this.who = line; this.stage = 'pass'; return ''; }
    if (this.stage === 'pass') {
      if (this.who === SRV.user && line === SRV.pass) { this.stage = 'shell'; return this.motd(); }
      this.stage = this.via === 'ssh' ? 'pass' : 'login'; return this.via === 'ssh' ? 'Permission denied, please try again.' : '\nLogin incorrect';
    }
    if (this.stage === 'closed' || !line) return '';
    let t = line.split(/\s+/); let sudo = false;
    if (t[0] === 'sudo') { sudo = true; t = t.slice(1); if (!t.length) return 'usage: sudo command'; }
    const c = t[0], a = t.slice(1);
    const needRoot = () => !sudo ? `${c}: Permission denied (gunakan sudo)` : '';
    const svcName = (x?: string) => (x ? ALIAS[x.replace(/\.service$/, '')] : undefined);
    switch (c) {
      case 'help': return 'Perintah: ls cd pwd cat nano head grep · sudo systemctl status|start|stop|restart|reload|enable <svc> · journalctl -u <svc> · ip a · ip r · ping · dig · nslookup · host · named-checkzone · named-checkconf · dhcpd -t · dhcp-lease-list · curl · ss -tlnp · hostname · uptime · df -h · free -h · clear · exit\nLayanan: isc-dhcp-server (DHCP), bind9 (DNS), apache2 (web), ssh';
      case 'clear': return '\u001b';
      case 'exit': case 'logout': this.stage = this.via === 'ssh' ? 'closed' : 'login'; io.close(); return this.via === 'ssh' ? `logout\nConnection to ${SRV.ip} closed.` : '\n\nUbuntu 24.04.1 LTS srv-nusa tty1\n';
      case 'whoami': return sudo ? 'root' : this.who;
      case 'hostname': return SRV.name;
      case 'pwd': return this.cwd;
      case 'uptime': return ' 08:41:07 up 37 days,  2:13,  1 user,  load average: 0.08, 0.05, 0.01';
      case 'df': return 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda2        98G   14G   79G  15% /';
      case 'free': return '               total        used        free      shared  buff/cache   available\nMem:           7.7Gi       1.8Gi       4.2Gi        12Mi       1.9Gi       5.9Gi';
      case 'cd': { const p = this.path(a[0] ?? '~'); if (!DIRS.includes(p)) return `-bash: cd: ${a[0]}: No such file or directory`; this.cwd = p; return ''; }
      case 'ls': { const p = this.path(a.filter(x => !x.startsWith('-'))[0] ?? ''); if (FILES.has(p)) return p.split('/').pop()!; if (!DIRS.includes(p)) return `ls: cannot access '${p}': No such file or directory`; const kids = new Set<string>(); for (const f of [...FILES.keys(), ...DIRS]) if (f.startsWith(p === '/' ? '/' : p + '/') && f !== p) kids.add(f.slice(p === '/' ? 1 : p.length + 1).split('/')[0]); if (p === '/var/lib/dhcp') kids.add('dhcpd.leases'); return [...kids].sort().join('  '); }
      case 'cat': case 'head': case 'less': case 'more': { const f = a.filter(x => !x.startsWith('-'))[0]; if (!f) return ''; const p = this.path(f); if (p === '/var/lib/dhcp/dhcpd.leases') return this.leases(true); const v = FILES.get(p); return v === undefined ? `${c}: ${f}: No such file or directory` : v.replace(/\n$/, ''); }
      case 'grep': { const pat = a[0]; const p = this.path(a[1] ?? ''); const v = FILES.get(p); if (!pat || v === undefined) return 'usage: grep PATTERN FILE'; return v.split('\n').filter(x => x.includes(pat)).join('\n'); }
      case 'nano': case 'vi': case 'vim': {
        const f = a[0]; if (!f) return 'Usage: nano FILE'; const p = this.path(f);
        if (p.startsWith('/etc') && !sudo) { io.edit(p + ' [ Read-only: jalankan dengan sudo ]', FILES.get(p) ?? '', () => {}); return ''; }
        io.edit(p, FILES.get(p) ?? '', txt => { FILES.set(p, txt); this.onEdit?.(p); }); return '';
      }
      case 'systemctl': case 'service': {
        let act = a[0], s = svcName(a[1]);
        if (c === 'service') { s = svcName(a[0]); act = a[1]; }
        if (!act) return 'systemctl: perlu perintah (status, start, stop, restart, reload, enable)';
        if (!s) return `Unit ${(c === 'service' ? a[0] : a[1]) ?? ''}.service could not be found.`;
        if (act === 'status' || act === 'is-active') return act === 'is-active' ? (SVC[s].active ? 'active' : SVC[s].failed ? 'failed' : 'inactive') : this.status(s);
        if (needRoot()) return `Failed to ${act} ${s}.service: Access denied\nSee system logs and 'systemctl status ${s}.service' for details.`;
        let out = '';
        if (act === 'stop') stop(s);
        else if (act === 'start' || act === 'restart' || act === 'reload' || act === 'force-reload') { if (act === 'start' && SVC[s].active) return ''; out = start(s); }
        else if (act === 'enable' || act === 'disable') { SVC[s].enabled = act === 'enable'; return `Synchronizing state of ${s}.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.`; }
        else return `Unknown command verb ${act}.`;
        this.onSvc?.(s, act); return out;
      }
      case 'journalctl': { const i = a.indexOf('-u'); const s = svcName(i >= 0 ? a[i + 1] : a.find(x => !x.startsWith('-'))); if (!s) return '-- No entries --'; return SVC[s].log.slice(-12).join('\n') || '-- No entries --'; }
      case 'ip': if (a[0]?.startsWith('a')) return `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: ens18: <BROADCAST,MULTICAST,${SRV.cable ? 'UP,LOWER_UP' : 'NO-CARRIER'}> mtu 1500 state ${SRV.cable ? 'UP' : 'DOWN'}\n    link/ether 52:54:00:10:00:05 brd ff:ff:ff:ff:ff:ff\n    inet ${SRV.ip}/24 brd 192.168.10.255 scope global ens18`; if (a[0]?.startsWith('r')) return 'default via 192.168.10.1 dev ens18 proto static\n192.168.10.0/24 dev ens18 proto kernel scope link src 192.168.10.5'; return 'Usage: ip [ addr | route ]';
      case 'ss': case 'netstat': return ['State   Local Address:Port   Process', SVC.ssh.active && 'LISTEN  0.0.0.0:22            sshd', SVC.bind9.active && `LISTEN  ${SRV.ip}:53       named`, SVC.bind9.active && 'LISTEN  127.0.0.1:953        named', SVC.apache2.active && 'LISTEN  *:80                 apache2', SVC['isc-dhcp-server'].active && 'UNCONN  0.0.0.0:67           dhcpd'].filter(Boolean).join('\n');
      case 'ping': { const tg = a.filter(x => !x.startsWith('-') && !/^\d+$/.test(x) || /\./.test(x)).pop(); if (!tg) return 'ping: usage error: Destination address required'; const r = this.resolveLocal(tg); if (!r) return `ping: ${tg}: Temporary failure in name resolution`; const ok = this.reach(r); return ok ? `PING ${tg} (${r}) 56(84) bytes of data.\n64 bytes from ${r}: icmp_seq=1 ttl=64 time=0.41 ms\n64 bytes from ${r}: icmp_seq=2 ttl=64 time=0.38 ms\n64 bytes from ${r}: icmp_seq=3 ttl=64 time=0.44 ms\n\n--- ${tg} ping statistics ---\n3 packets transmitted, 3 received, 0% packet loss` : `PING ${tg} (${r}) 56(84) bytes of data.\nFrom ${SRV.ip} icmp_seq=1 Destination Host Unreachable\n\n--- ${tg} ping statistics ---\n3 packets transmitted, 0 received, 100% packet loss`; }
      case 'dig': case 'nslookup': case 'host': {
        const name = a.find(x => !x.startsWith('@') && !x.startsWith('+') && !/^\d+\.\d+\.\d+\.\d+$/.test(x)); const srv = (a.find(x => x.startsWith('@'))?.slice(1)) ?? (c === 'nslookup' ? a.find(x => /^\d+\.\d+\.\d+\.\d+$/.test(x)) : undefined) ?? '127.0.0.1';
        if (!name) return `usage: ${c} name [@server]`;
        const r = srv === '127.0.0.1' || srv === SRV.ip || srv === 'localhost' ? answer(name, null) : srv === ENVS.lab.gateway ? ((x => x === 'refused' ? 'timeout' : x)(routerAnswer(ENVS.lab, name, SRV.ip))) : 'timeout';
        if (c === 'host') return r === 'timeout' ? `;; connection timed out; no servers could be reached` : r === null ? `Host ${name} not found: 3(NXDOMAIN)` : `${name} has address ${r.ip}`;
        if (c === 'nslookup') return r === 'timeout' ? `;; communications error to ${srv}#53: connection refused\n;; no servers could be reached` : `Server:\t\t${srv}\nAddress:\t${srv}#53\n\n` + (r === null ? `** server can't find ${name}: NXDOMAIN` : `Name:\t${name}\nAddress: ${r.ip}`);
        return r === 'timeout' ? `;; communications error to ${srv}#53: ${SVC.bind9.active ? 'timed out' : 'connection refused'}\n;; no servers could be reached` : `; <<>> DiG 9.18.28 <<>> ${name}\n;; ->>HEADER<<- opcode: QUERY, status: ${r === null ? 'NXDOMAIN' : 'NOERROR'}\n;; ANSWER SECTION:\n${r === null ? '' : `${name}.\t604800\tIN\tA\t${r.ip}\n`}\n;; SERVER: ${srv}#53(${srv}) (UDP)`;
      }
      case 'named-checkzone': { const p = this.path(a[1] ?? `/etc/bind/db.${SRV.zone}`); const v = FILES.get(p); if (v === undefined) return `zone ${a[0] ?? ''}/IN: loading from master file ${a[1] ?? ''} failed: file not found`; const z = parseZone(v); return z.err ? `${z.err}\nzone ${a[0] ?? SRV.zone}/IN: loading from master file ${p} failed: syntax error` : `zone ${a[0] ?? SRV.zone}/IN: loaded serial ${z.serial}\nOK`; }
      case 'named-checkconf': return /forwarders\s*\{[^}]*\};/.test(FILES.get('/etc/bind/named.conf.options') ?? '') && /zone\s+"[^"]+"\s*\{[^}]*\};/.test(FILES.get('/etc/bind/named.conf.local') ?? '') ? '' : '/etc/bind/named.conf: missing \';\' before end of file';
      case 'dhcpd': if (a[0] !== '-t') return 'Usage: dhcpd -t (uji konfigurasi)'; { const { err } = parseDhcpd(FILES.get('/etc/dhcp/dhcpd.conf') ?? ''); return err ? `Internet Systems Consortium DHCP Server 4.4.3\n${err}\nConfiguration file errors encountered -- exiting` : 'Internet Systems Consortium DHCP Server 4.4.3\nLDAP configuration file /etc/dhcp/dhcpd.conf: OK'; }
      case 'dhcp-lease-list': return this.leases(false);
      case 'curl': { const u = a.find(x => !x.startsWith('-')) ?? ''; const hn = u.replace(/^https?:\/\//, '').split('/')[0]; const ip = this.resolveLocal(hn); if (!ip) return `curl: (6) Could not resolve host: ${hn}`; if (ip === SRV.ip || ip === '127.0.0.1') { const pg = webPage(); return pg === null ? `curl: (7) Failed to connect to ${hn} port 80 after 0 ms: Couldn't connect to server` : a.includes('-I') ? 'HTTP/1.1 200 OK\nServer: Apache/2.4.58 (Ubuntu)\nContent-Type: text/html' : pg; } return this.reach(ip) ? 'HTTP/1.1 200 OK' : `curl: (28) Failed to connect to ${hn} port 80: Connection timed out`; }
      case 'echo': return a.join(' ');
      case 'history': return '';
      case 'ufw': return 'Status: inactive';
      default: return `${c}: command not found`;
    }
  }
  onEdit?: (p: string) => void; onSvc?: (s: Svc, act: string) => void;
  private status(s: Svc) {
    const S = SVC[s]; const desc: Record<Svc, string> = { 'isc-dhcp-server': 'ISC DHCP IPv4 server', bind9: 'BIND Domain Name Server', apache2: 'The Apache HTTP Server', ssh: 'OpenBSD Secure Shell server' };
    const st = S.active ? `\x20active (running) since Fri 2026-10-30 ${new Date(S.since).toTimeString().slice(0, 8)} WIB` : S.failed ? ' failed (Result: exit-code)' : ' inactive (dead)';
    return `${S.active ? '●' : '○'} ${s}.service - ${desc[s]}\n     Loaded: loaded (/usr/lib/systemd/system/${s}.service; ${S.enabled ? 'enabled' : 'disabled'}; preset: enabled)\n     Active:${st}\n\n${S.log.slice(-5).join('\n')}`;
  }
  private leases(raw: boolean) {
    const rows = [...ENVS.lab.leases.entries()];
    if (raw) return rows.map(([m, ip]) => `lease ${ip} {\n  starts 5 2026/10/30 01:12:44;\n  binding state active;\n  hardware ethernet ${m.replace(/-/g, ':')};\n}`).join('\n') || '# no leases';
    return `MAC                IP              hostname        valid until\n${'-'.repeat(70)}\n` + rows.map(([m, ip]) => { const ad = [...ADAPTERS.values()].find(x => x.mac === m); return `${m.replace(/-/g, ':').padEnd(19)}${ip.padEnd(16)}${(ad?.host ?? '-').padEnd(16)}2026-10-31 08:12:44`; }).join('\n');
  }
  private resolveLocal(n: string): string | null { if (parseIp(n) !== null) return n; if (n === 'localhost') return '127.0.0.1'; const r = answer(n, null); return r && r !== 'timeout' ? r.ip : null; }
  /** can srv-nusa reach this IP (same rules as a lab PC with a static address) */
  private reach(ip: string) {
    if (ip === '127.0.0.1' || ip === SRV.ip) return true;
    if (!SRV.cable) return false;
    const lab = ENVS.lab, n = parseIp(ip)!;
    if (networkOf(n, 24) === networkOf(parseIp(SRV.ip)!, 24)) return lab.hosts.some(h => h.ip === ip && !h.down) || [...ADAPTERS.values()].some(o => envOf(o.pc) === lab && live(o, lab).ip === ip);
    for (const e of Object.values(ENVS)) if (e.id !== 'none' && e.id !== 'lab' && e.hosts.some(h => h.ip === ip && !h.down)) return e.id !== 'guest' && e.id !== 'kasir';
    return HOOKS.internet(lab, SRV.ip, ip, 'icmp') && (PUBLIC_DNS.includes(ip) || Object.values(INTERNET).some(v => v.ip === ip));
  }
}

/** SSH from a PC: can this PC open TCP/22 to srv-nusa? Returns an OpenSSH-style error or ''. */
export function sshCheck(a: Adapter, target: string): string {
  const env = envOf(a.pc);
  const r = ping(a, env, target, true);
  if (target !== SRV.ip) return r.kind === 'reply' ? `ssh: connect to host ${target} port 22: Connection refused` : `ssh: connect to host ${target} port 22: Connection timed out`;
  if (r.kind !== 'reply') return `ssh: connect to host ${target} port 22: ${r.kind === 'general' ? 'Network is unreachable' : 'Connection timed out'}`;
  if (!SVC.ssh.active) return `ssh: connect to host ${target} port 22: Connection refused`;
  return '';
}

// ---------------------------------------------------------------- NOC faults on the server
const isLabPc = (pc: string) => envOf(pc).id === 'lab' && !/_L[4-8]_/.test(pc) && live(adapterOf(pc)).dns.includes(SRV.ip);
const sedFile = (p: string, f: (s: string) => string) => FILES.set(p, f(FILES.get(p) ?? ''));
const nm = (s: string) => ({ start: s, end: s });
void nm; void ipStr; void prefixToMask; void adapterOf;
EXT.srvdown = {
  def: { cause: 'Layanan di server Linux srv-nusa berhenti', fix: 'layanan dijalankan lagi (systemctl start/restart) dan diaktifkan', symptom: 'PC lab tidak bisa membuka situs / intranet, padahal kabel dan IP terlihat normal.', hint: 'Masalah di sisi server, bukan PC. Ke ruang server L1, rak 2 (srv-nusa): login di console, atau SSH dari PC lab (ssh teknisi@192.168.10.5, sandi smkbisa). Cek: systemctl status bind9 / apache2 / isc-dhcp-server.', cp: 'Fase G · Administrasi server Linux', rank: 1 },
  eligible: isLabPc,
  inject(pc) {
    const v = (['bind9', 'apache2', 'isc-dhcp-server'] as Svc[])[Math.floor(Math.random() * 3)];
    (EXT.srvdown as any).v = v; stop(v); SVC[v].log.push(`Oct 30 ${now()} srv-nusa systemd[1]: ${v}.service: Main process exited, code=killed, status=9/KILL`);
    if (v === 'isc-dhcp-server') { const a = adapterOf(pc); a.dhcp = true; bounce(a); }
    return v === 'bind9' ? 'bind9 (DNS) di srv-nusa mati → systemctl restart bind9' : v === 'apache2' ? 'apache2 (web intranet) di srv-nusa mati → systemctl start apache2' : 'isc-dhcp-server di srv-nusa mati, PC dapat 169.254.x.x → systemctl start isc-dhcp-server lalu ipconfig /renew';
  },
  ok: () => SVC.bind9.active && SVC.apache2.active && SVC['isc-dhcp-server'].active && !!LOADED.length,
  tested: (e) => e.type === 'browse' && /intranet/.test(String(e.detail?.url ?? '')) && e.detail?.web === 'linux' && !!webPage(),
  testHint: 'buka http://intranet.lab.smk.local',
};
EXT.zone = {
  def: { cause: 'Record DNS di zone lab.smk.local salah', fix: 'record A intranet dibetulkan di /etc/bind/db.lab.smk.local lalu bind9 di-reload', symptom: 'http://intranet.lab.smk.local tidak terbuka dari PC lab (situs internet lain jalan).', hint: 'nslookup intranet.lab.smk.local dari PC: alamatnya benar? Zone ada di srv-nusa (rak 2 ruang server, atau SSH): /etc/bind/db.lab.smk.local. Setelah edit: named-checkzone lalu sudo systemctl reload bind9.', cp: 'Fase G · DNS server (BIND)', rank: 1 },
  eligible: isLabPc,
  inject() {
    const v = Math.random() < 0.5 ? 'ip' : 'syntax';
    if (v === 'ip') sedFile(`/etc/bind/db.${SRV.zone}`, s => s.replace(/^intranet\s+IN\s+A\s+\S+/m, 'intranet IN A    192.168.10.55'));
    else sedFile(`/etc/bind/db.${SRV.zone}`, s => s.replace(/^intranet\s+IN\s+A\s+\S+/m, 'intranet IN A    192.168.10.5').replace(/^wlc\s+IN\s+A\s+\S+/m, 'wlc      IN A    192.168.10.2O'));
    start('bind9');
    return v === 'ip' ? 'Record A intranet menunjuk 192.168.10.55 (alamat kosong) → dibetulkan ke 192.168.10.5, bind9 di-reload' : 'Salah ketik di zone (192.168.10.2O, huruf O) membuat bind9 menolak seluruh zone lab.smk.local → diperbaiki, named-checkzone OK, bind9 di-reload';
  },
  ok: () => SVC.bind9.active && LOADED.some(r => r.name === 'intranet' && (r.type === 'A' ? r.val === SRV.ip : true)),
  tested: (e) => e.type === 'browse' && /intranet/.test(String(e.detail?.url ?? '')) && e.detail?.web === 'linux',
  testHint: 'buka http://intranet.lab.smk.local',
};
EXT.dhcpscope = {
  def: { cause: 'Konfigurasi DHCP server Linux salah (scope)', fix: 'dhcpd.conf dibetulkan (range/routers sesuai subnet 192.168.10.0/24) dan isc-dhcp-server di-restart', symptom: 'PC lab dapat 169.254.x.x atau tidak bisa keluar jaringan setelah server di-update.', hint: 'DHCP lab dilayani srv-nusa (isc-dhcp-server), bukan router. Di server: sudo dhcpd -t, journalctl -u isc-dhcp-server, lalu edit /etc/dhcp/dhcpd.conf (sudo nano).', cp: 'Fase G · DHCP server (isc-dhcp-server)', rank: 2 },
  eligible: pc => envOf(pc).id === 'lab' && adapterOf(pc).dhcp && adapterOf(pc).dnsAuto,
  inject(pc) {
    const v = Math.random() < 0.5 ? 'range' : 'routers';
    if (v === 'range') { sedFile('/etc/dhcp/dhcpd.conf', s => s.replace(/range\s+[\d.]+\s+[\d.]+;/, 'range 192.168.11.100 192.168.11.199;')); start('isc-dhcp-server'); }
    else { sedFile('/etc/dhcp/dhcpd.conf', s => s.replace(/option routers\s+[\d.]+;/, 'option routers 192.168.10.254;')); start('isc-dhcp-server'); }
    const a = adapterOf(pc); a.dhcp = true; a.dnsAuto = true; for (const [m] of ENVS.lab.leases) if (m === a.mac) ENVS.lab.leases.delete(m); bounce(a);
    return v === 'range' ? 'range di dhcpd.conf ditulis 192.168.11.100–199 (di luar subnet) sehingga isc-dhcp-server gagal start → range dikembalikan ke 192.168.10.x, layanan di-restart, klien renew' : 'option routers di dhcpd.conf 192.168.10.254 (bukan router) → dikembalikan ke 192.168.10.1, layanan di-restart, klien ipconfig /renew';
  },
  ok: () => { const d = ENVS.lab.dhcp; return !!d && SVC['isc-dhcp-server'].active && d.gw === ENVS.lab.gateway; },
};
export const linuxQa = { start, stop, answer: (n: string) => answer(n, null), files: FILES, svc: SVC, srv: SRV, sync: syncHost };
