// RouterOS v7 terminal (pure logic; plugs into term.ts as a Shell). Menu-path navigation (/ip address, .., /),
// add/print/set/remove/enable/disable/export with [find where …] and item numbers from the last print, the
// dhcp-server and hotspot setup wizards with the prompts of the official docs [8][11], backup/reset/ping.
// Error texts are the standard RouterOS console messages; the ones not quoted in the sources are listed in DESIGN.md.
import {
  TABLE, TABLES, MENUS, MENU_CMDS, ROS_VERSION, rows, single, identity, interfaces, ifByName, bridgeOf, insertRow, withDefaults, resetConfiguration, saveBackup, findFile, loadBackup,
  createDevice, ifMac, parseCidr, parseRate2, fmtRate, parseTime, fmtTime, parseRanges, isMac, ipStr, parseIp, networkOf, broadcastOf, cidrNet,
  type RosDevice, type Row, type TableDef, type FieldDef,
} from './model';
import { ifRunning, dhcpClientLease, dhcpClientStatus, routeTable, activeDefault, gwIface, dnsServers, dynQueues, routerPing, ROS_HOOKS, ifAddr } from './engine';
import { exportCfg, quote } from './export';
import type { Shell, TermIO } from '../term';

export interface Ask { pre?: string; head?: string; q: string; def: string; secret?: boolean }
type Wiz = Generator<Ask, string, string>;
interface Tok { t: string; col: number }
class CliError extends Error {}
const fail = (m: string): never => { throw new CliError(m); };
const colErr = (m: string, col: number) => `${m} (line 1 column ${col})`;

/** split a line into tokens: quotes keep spaces, [ … ] stays one token */
export function tokenize(line: string): Tok[] {
  const out: Tok[] = []; let cur = ''; let start = -1; let i = 0;
  const push = () => { if (start >= 0) out.push({ t: cur, col: start + 1 }); cur = ''; start = -1; };
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { push(); i++; continue; }
    if (start < 0) start = i;
    if (c === '"') { i++; while (i < line.length && line[i] !== '"') { if (line[i] === '\\' && i + 1 < line.length) i++; cur += line[i++]; } i++; continue; }
    if (c === '[') { let depth = 0; do { if (line[i] === '[') depth++; if (line[i] === ']') depth--; cur += line[i++]; } while (i < line.length && depth > 0); continue; }
    cur += c; i++;
  }
  push();
  return out;
}
const segOf = (parent: string, child: string) => (parent === '/' ? child.slice(1) : child.slice(parent.length + 1));
const childrenOf = (p: string) => [...MENUS].filter(m => m !== '/' && (p === '/' ? !m.slice(1).includes(' ') : m.startsWith(`${p} `) && !m.slice(p.length + 1).includes(' ')));
const parentOf = (p: string) => (p === '/' ? '/' : p.includes(' ') ? p.slice(0, p.lastIndexOf(' ')) : '/');
/** exact name first, then a unique prefix (RouterOS accepts unambiguous abbreviations) */
function pick(word: string, names: string[]): string | null {
  if (names.includes(word)) return word;
  const c = names.filter(n => n.startsWith(word));
  return c.length === 1 ? c[0] : null;
}
const extraArgs = (t: TableDef, cmd: string) => ['disabled', 'comment', ...(t.ordered && cmd === 'add' ? ['place-before'] : [])];

export class RosCli implements Shell {
  path = '/';
  /** true while a password is being asked (term.ts hides the input) */
  secret = false;
  private last = new Map<string, Row[]>();
  private wiz: Wiz | null = null; private cur: Ask | null = null;
  onCmd: (line: string) => void = () => {};
  constructor(public dev: RosDevice, public user = 'admin') {}

  banner() {
    return [
      '', '', '', '',
      '  MMM      MMM       KKK                          TTTTTTTTTTT      KKK',
      '  MMMM    MMMM       KKK                          TTTTTTTTTTT      KKK',
      '  MMM MMMM MMM  III  KKK  KKK  RRRRRR     OOOOOO      TTT     III  KKK  KKK',
      '  MMM  MM  MMM  III  KKKKK     RRR  RRR  OOO  OOO     TTT     III  KKKKK',
      '  MMM      MMM  III  KKK KKK   RRRRRR    OOO  OOO     TTT     III  KKK KKK',
      '  MMM      MMM  III  KKK  KKK  RRR  RRR   OOOOOO      TTT     III  KKK  KKK',
      '', `  MikroTik RouterOS ${ROS_VERSION} (c) 1999-2025       https://www.mikrotik.com/`, '',
      `Press F1 for help`, '',
    ].join('\n');
  }
  prompt() { if (this.cur) return `${this.cur.q}: `; return `[${this.user}@${identity(this.dev)}] ${this.path === '/' ? '> ' : `${this.path}> `}`; }
  /** the default value of the open wizard question (a UI can pre-fill the input with it, as RouterOS does) */
  askDefault() { return this.cur ? this.cur.def : null; }
  exec(line: string, _io?: TermIO): string {
    const r = this.run(line); this.onCmd(line); return r;
  }
  /** run one typed line and return what the console prints */
  run(line: string): string {
    if (this.wiz) return this.answer(line);
    const raw = line.trim(); if (!raw) return '';
    // anything unexpected must never break the game's terminal: it reads as a console syntax error
    try { return this.command(raw); } catch (e) { return e instanceof CliError ? e.message : 'syntax error (line 1 column 1)'; }
  }

  // ------------------------------------------------------------ wizards / interactive questions
  private start(w: Wiz): string { this.wiz = w; return this.step(w.next()); }
  private step(r: IteratorResult<Ask, string>): string {
    if (r.done) { this.wiz = null; this.cur = null; this.secret = false; return r.value; }
    this.cur = r.value; this.secret = !!r.value.secret;
    return [r.value.pre, r.value.head].filter(Boolean).join('\n');
  }
  private answer(line: string): string {
    const v = line.trim() === '' ? this.cur!.def : line.trim();
    try { return this.step(this.wiz!.next(v)); } catch (e) { this.wiz = null; this.cur = null; this.secret = false; return e instanceof CliError ? e.message : 'syntax error (line 1 column 1)'; }
  }

  // ------------------------------------------------------------ command line
  private command(raw: string): string {
    const toks = tokenize(raw);
    let p = this.path; let i = 0;
    if (toks[0].t.startsWith('/') && !toks[0].t.includes('=')) {
      p = '/'; const parts = toks[0].t.split('/').filter(Boolean);
      toks.splice(0, 1, ...parts.map(t => ({ t, col: toks[0].col })));
      if (!parts.length) return this.go(p);
    }
    for (; i < toks.length; i++) {
      const w = toks[i].t;
      if (w === '..') { p = parentOf(p); continue; }
      if (w.includes('=') || w.startsWith('[')) break;
      const kids = childrenOf(p); const cmds = this.cmdsOf(p);
      const all = [...kids.map(k => segOf(p, k)), ...cmds];
      const hit = pick(w, all);
      if (hit === null) return colErr(`bad command name ${w}`, toks[i].col);
      if (cmds.includes(hit) && !kids.some(k => segOf(p, k) === hit)) break;
      p = p === '/' ? `/${hit}` : `${p} ${hit}`;
    }
    if (i >= toks.length) return this.go(p);
    const cmd = pick(toks[i].t, this.cmdsOf(p))!;
    return this.dispatch(p, cmd, toks.slice(i + 1));
  }
  private go(p: string) { this.path = p; return ''; }
  private cmdsOf(p: string): string[] {
    const t = TABLE.get(p); const c = [...(MENU_CMDS[p] ?? [])];
    if (t) {
      c.push('print', 'export');
      if (t.singleton) c.push('set');
      else if (t.path === '/ip hotspot active' || t.path === '/file') c.push('remove');
      else { c.push('set', 'enable', 'disable'); if (t.add) c.push('add'); if (t.remove) c.push('remove'); }
      c.push(...(t.cmds ?? []));
    } else if (p !== '/' && !c.includes('export')) c.push('export');
    return [...new Set(c)];
  }

  private dispatch(p: string, cmd: string, args: Tok[]): string {
    if (p === '/' && cmd === 'ping') return this.ping(args);
    if (cmd === 'export') return this.exportCmd(p, args);
    if (p === '/system' && cmd === 'reset-configuration') return this.reset(args);
    if (p === '/system backup') return cmd === 'save' ? this.backupSave(args) : this.backupLoad(args);
    if (p === '/system resource') return args.length ? colErr('expected end of command', args[0].col) : this.resource();
    if (p === '/system default-configuration') { const fresh = createDevice(this.dev.model.id, { id: `${this.dev.id}-defconf` }); fresh.mac0 = this.dev.mac0; return `  script: ${exportCfg(fresh).split('\n').slice(5).join('\n          ')}`; }
    if (p === '/ip dhcp-server' && cmd === 'setup') return this.start(this.dhcpSetup());
    if (p === '/ip hotspot' && cmd === 'setup') return this.start(this.hotspotSetup());
    const t = TABLE.get(p)!;
    if (cmd === 'print') return this.print(t, args);
    if (cmd === 'add') return this.add(t, args);
    if (cmd === 'set') return this.set(t, args);
    if (cmd === 'remove') return this.remove(t, args);
    if (cmd === 'enable' || cmd === 'disable') { const it = this.items(t, args[0]); for (const r of it) r.disabled = cmd === 'disable'; if (args.length > 1) return colErr('expected end of command', args[1].col); this.dev.rev++; return ''; }
    if (cmd === 'make-static') { for (const r of this.items(t, args[0])) if (r.dynamic) insertRow(this.dev, '/ip dhcp-server lease', { address: r.p.address, 'mac-address': r.p['mac-address'], server: r.p.server }); return ''; }
    return colErr(`bad command name ${cmd}`, 1);
  }

  // ------------------------------------------------------------ rows of a menu (incl. dynamic + views)
  rowsOf(t: TableDef): Row[] {
    const d = this.dev; const syn = (id: number, p: Record<string, string>, o: Partial<Row> = {}): Row => ({ id, disabled: false, dynamic: true, comment: '', p, ...o });
    if (t.path === '/interface') return interfaces(d).map(i => i.row);
    if (t.path === '/file') return [...d.files.values()].map((f, k) => syn(-1000 - k, { name: f.name, type: f.type === 'backup' ? 'backup' : 'script', size: `${(f.size / 1024).toFixed(1)}KiB` }, { dynamic: false }));
    if (t.path === '/ip hotspot active') return d.rt.active.map((a, k) => syn(-2000 - k, { server: a.server, user: a.user, address: a.address, 'mac-address': a.mac.toUpperCase().replace(/-/g, ':'), uptime: fmtTime(Math.floor((Date.now() - a.since) / 1000)) }));
    const own = rows(d, t.path);
    if (t.path === '/ip address') return [...own, ...rows(d, '/ip dhcp-client').flatMap((c, k) => { const b = dhcpClientLease(d, c); return b ? [syn(-3000 - k, { address: `${b.ip}/${b.prefix}`, network: ipStr(networkOf(parseIp(b.ip)!, b.prefix)), interface: c.p.interface })] : []; })];
    if (t.path === '/ip route') return [...routeTable(d).filter(r => r.kind !== 'static').map((r, k) => syn(-4000 - k, { 'dst-address': r.dst, gateway: r.gw, distance: String(r.distance), kind: r.kind })), ...own];
    if (t.path === '/queue simple') return [...dynQueues(d).map((q, k) => syn(-5000 - k, { name: q.name, target: q.target, 'limit-at': `${fmtRate(q.limitAt[0])}/${fmtRate(q.limitAt[1])}`, 'max-limit': `${fmtRate(q.max[0])}/${fmtRate(q.max[1])}` })), ...own];
    if (t.path === '/ip dhcp-server lease') return [...own, ...ROS_HOOKS.leases(d).filter(l => !own.some(o => o.p['mac-address'].toLowerCase() === l.mac.toLowerCase())).map((l, k) => syn(-6000 - k, { address: l.address, 'mac-address': l.mac.toUpperCase(), 'host-name': l.host, server: l.server, 'rate-limit': '' }))];
    return own;
  }

  // ------------------------------------------------------------ item references: 0,1 | name | [find …]
  private items(t: TableDef, tok: Tok | undefined): Row[] {
    if (!tok) fail('no such item');
    const all = this.rowsOf(t); const out: Row[] = [];
    if (tok!.t.startsWith('[')) return this.find(t, tok!.t);
    for (const part of tok!.t.split(',')) {
      if (/^\d+$/.test(part)) {
        const l = this.last.get(t.path); const r = l?.[+part];
        if (!r) fail('no such item');
        const live = all.find(x => x.id === r!.id) ?? (r!.id < 0 ? r : undefined);
        if (!live) fail('no such item');
        out.push(live!); continue;
      }
      const r = t.key ? all.find(x => x.p[t.key!] === part) : undefined;
      if (!r) fail('no such item');
      out.push(r!);
    }
    return out;
  }
  /** [find], [find name=x], [find where interface=ether1 and disabled=no], [find comment~"defconf"] */
  private find(t: TableDef, expr: string): Row[] {
    const body = expr.replace(/^\[\s*/, '').replace(/\s*\]$/, '');
    const toks = tokenize(body).map(x => x.t);
    if (toks[0] !== 'find') fail(colErr('bad command name', 2));
    return this.filter(this.rowsOf(t), toks.slice(1));
  }
  private filter(list: Row[], conds: string[]): Row[] {
    const cs = conds.filter(c => c !== 'where' && c !== 'and');
    const val = (r: Row, k: string) => (k === 'disabled' ? (r.disabled ? 'yes' : 'no') : k === 'dynamic' ? (r.dynamic ? 'yes' : 'no') : k === 'comment' ? r.comment : (r.p[k] ?? ''));
    return list.filter(r => cs.every(c => {
      const m = /^([\w-]+)(=|~|!=)(.*)$/.exec(c); if (!m) fail(colErr('syntax error', 1));
      const v = val(r, m![1]);
      if (m![2] !== '~') return m![2] === '=' ? v === m![3] : v !== m![3];
      let re: RegExp | null = null; try { re = new RegExp(m![3]); } catch { fail('syntax error (line 1 column 1)'); }
      return re!.test(v);
    }));
  }

  // ------------------------------------------------------------ argument parsing + validation
  private args(t: TableDef, toks: Tok[], cmd: string): Map<string, { v: string; col: number }> {
    const names = [...t.fields.filter(f => !f.ro).map(f => f.name), ...extraArgs(t, cmd)];
    const out = new Map<string, { v: string; col: number }>();
    for (const tk of toks) {
      const eq = tk.t.indexOf('=');
      if (eq <= 0) fail(colErr('expected end of command', tk.col));
      const k = pick(tk.t.slice(0, eq), names); if (!k) fail(colErr('expected end of command', tk.col));
      out.set(k!, { v: tk.t.slice(eq + 1), col: tk.col });
    }
    return out;
  }
  /** normalise a value for a field, or throw the RouterOS error */
  value(t: TableDef, f: FieldDef, v: string): string {
    const d = this.dev; const bad = () => fail(`invalid value for argument ${f.name}`); const nomatch = () => fail(`input does not match any value of ${f.name}`);
    let negate = ''; if (f.neg && v.startsWith('!')) { negate = '!'; v = v.slice(1); }
    switch (f.type) {
      case 'str': return v;
      case 'num': if (!/^\d+$/.test(v)) bad(); return v;
      case 'ip': if (parseIp(v) === null) bad(); return v;
      case 'iplist': if (v && v.split(',').filter(Boolean).some(x => parseIp(x) === null)) bad(); return v.split(',').filter(Boolean).join(',');
      case 'cidr': { const c = parseCidr(v); if (!c) bad(); if (t.path === '/ip address') return `${ipStr(c!.ip)}/${c!.prefix}`; return `${ipStr(networkOf(c!.ip, c!.prefix))}/${c!.prefix}`; }
      case 'addr': for (const part of v.split(',')) { const r = /^([\d.]+)-([\d.]+)$/.exec(part); if (r ? parseIp(r[1]) === null || parseIp(r[2]) === null : !parseCidr(part)) bad(); } return negate + v.split(',').map(x => (x.includes('-') || x.includes('/') ? x : `${x}`)).join(',');
      case 'iface': if (!ifByName(d, v)) nomatch(); return negate + v;
      case 'bridge': { const i = ifByName(d, v); if (!i || i.type !== 'bridge') nomatch(); return v; }
      case 'enum': if (!f.values!.includes(v)) nomatch(); return v;
      case 'multi': { const parts = v.split(',').filter(Boolean); if (parts.some(x => !f.values!.includes(x))) nomatch(); return negate + parts.join(','); }
      case 'rate2': { const r = parseRate2(v); if (!r) bad(); return `${fmtRate(r![0])}/${fmtRate(r![1])}`; }
      case 'time': { const s = parseTime(v); if (s === null) bad(); return fmtTime(s!); }
      case 'ranges': if (!parseRanges(v)) bad(); return v;
      case 'mac': if (!isMac(v)) bad(); return v.toUpperCase().replace(/-/g, ':');
      case 'ref': if (!(f.extra ?? []).includes(v) && !rows(d, f.ref!).some(r => r.p[TABLE.get(f.ref!)!.key ?? 'name'] === v)) nomatch(); return v;
      case 'gw': if (parseIp(v) === null && !ifByName(d, v)) bad(); return v;
      case 'ports': if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(v)) bad(); return v;
      default: return v;
    }
  }
  /** apply parsed args to a row (validates everything before changing anything) */
  private apply(t: TableDef, r: Row, a: Map<string, { v: string; col: number }>) {
    const next = { ...r.p }; let dis = r.disabled; let cm = r.comment;
    for (const [k, { v }] of a) {
      if (k === 'place-before') continue;
      if (k === 'disabled') { if (v !== 'yes' && v !== 'no') fail('input does not match any value of disabled'); dis = v === 'yes'; continue; }
      if (k === 'comment') { cm = v; continue; }
      const f = t.fields.find(x => x.name === k)!;
      if (v === '' && f.type !== 'str' && f.type !== 'iplist') { if (f.req) fail(`invalid value for argument ${k}`); if (f.def !== undefined) next[k] = f.def; else delete next[k]; continue; }
      next[k] = this.value(t, f, v);
    }
    if (t.path === '/ip address' && next.address) next.network = cidrNet(next.address);
    if (t.path === '/interface wireless security-profiles' && next['wpa2-pre-shared-key'] && (next['wpa2-pre-shared-key'].length < 8 || next['wpa2-pre-shared-key'].length > 64)) fail('invalid value for argument wpa2-pre-shared-key');
    this.unique(t, r, next);
    const oldKey = t.key ? r.p[t.key] : undefined;
    r.p = next; r.disabled = dis; r.comment = cm;
    if (t.key && oldKey !== undefined && oldKey !== next[t.key]) this.renameRefs(t, oldKey, next[t.key]);
    this.dev.rev++;
  }
  private unique(t: TableDef, self: Row, p: Record<string, string>) {
    const others = this.rowsOf(t).filter(r => r !== self && !r.dynamic);
    if (t.key && p[t.key] && others.some(r => r.p[t.key!] === p[t.key!])) fail('failure: already have item with such name');
    if (t.path === '/interface' || t.path.startsWith('/interface ')) {
      if (t.key && p.name && interfaces(this.dev).some(i => i.row !== self && i.row.p.name === p.name)) fail('failure: already have interface with such name');
    }
    if (t.path === '/ip address' && others.some(r => r.p.address === p.address && r.p.interface === p.interface)) fail('failure: already have such address');
    if (t.path === '/interface bridge port') {
      if (others.some(r => r.p.interface === p.interface)) fail('failure: device already added as bridge port');
      if (p.interface === p.bridge || ifByName(this.dev, p.interface)?.type === 'bridge') fail('failure: can not add bridge as port to itself');
    }
    if (t.path === '/ip dhcp-client' && others.some(r => r.p.interface === p.interface)) fail('failure: dhcp-client on that interface already exists');
    if (t.path === '/ip hotspot' && others.some(r => r.p.interface === p.interface)) fail('failure: already have hotspot server on that interface');
  }
  /** renaming an item (interface, pool, profile …) follows into every field that names it, as RouterOS keeps ids */
  private renameRefs(t: TableDef, from: string, to: string) {
    const isIf = t.path === '/interface' || t.path.startsWith('/interface') && t.path !== '/interface wireless security-profiles';
    for (const tt of TABLES) for (const r of rows(this.dev, tt.path)) for (const f of tt.fields) {
      const v = r.p[f.name]; if (v === undefined) continue;
      const hit = (isIf && (f.type === 'iface' || f.type === 'bridge' || f.type === 'gw' || (tt.path === '/queue simple' && f.name === 'target'))) || (f.type === 'ref' && f.ref === t.path);
      if (!hit) continue;
      if (v === from) r.p[f.name] = to; else if (v === `!${from}`) r.p[f.name] = `!${to}`;
    }
  }

  // ------------------------------------------------------------ add / set / remove / print
  private add(t: TableDef, toks: Tok[]): string {
    const a = this.args(t, toks, 'add');
    const missing = t.fields.filter(f => f.req && !a.has(f.name));
    if (missing.length) return this.start(this.askMissing(t, a, missing));
    return this.doAdd(t, a);
  }
  private doAdd(t: TableDef, a: Map<string, { v: string; col: number }>): string {
    const d = this.dev;
    const r: Row = { id: d.cfg.nextId++, disabled: false, dynamic: false, comment: '', p: withDefaults(t.path, {}) };
    if (t.auto && !a.has(t.key!)) { let n = 1; while (rows(d, t.path).some(x => x.p[t.key!] === `${t.auto}${n}`)) n++; a.set(t.key!, { v: `${t.auto}${n}`, col: 0 }); }
    const list = d.cfg.tables[t.path];
    this.apply(t, r, a);
    const pb = a.get('place-before');
    let at = list.length;
    if (pb) { const tgt = this.items(t, { t: pb.v, col: pb.col })[0]; at = list.indexOf(tgt); if (at < 0) at = list.length; }
    list.splice(at, 0, r);
    d.rev++;
    return '';
  }
  private *askMissing(t: TableDef, a: Map<string, { v: string; col: number }>, missing: FieldDef[]): Wiz {
    for (const f of missing) {
      let pre = '';
      for (;;) {
        const v = yield { pre, q: f.name, def: '', secret: f.secret };
        try { this.value(t, f, v); a.set(f.name, { v, col: 0 }); break; } catch (e) { if (!(e instanceof CliError)) throw e; pre = e.message; }
      }
    }
    return this.doAdd(t, a);
  }
  private set(t: TableDef, toks: Tok[]): string {
    if (t.singleton) { this.apply(t, rows(this.dev, t.path)[0], this.args(t, toks, 'set')); return ''; }
    const [first, ...rest] = toks;
    if (!first || first.t.includes('=') && !first.t.startsWith('[')) return this.start(this.askNumbers(t, toks, 'set'));
    const it = this.items(t, first);
    const a = this.args(t, rest, 'set');
    for (const r of it) {
      if (r.dynamic) fail('failure: can not change dynamic');
      const tt = t.path === '/interface' ? TABLE.get(`/interface ${interfaces(this.dev).find(i => i.row === r)!.type === 'ether' ? 'ethernet' : interfaces(this.dev).find(i => i.row === r)!.type === 'wlan' ? 'wireless' : 'bridge'}`)! : t;
      this.apply(tt, r, a);
    }
    return '';
  }
  private *askNumbers(t: TableDef, toks: Tok[], cmd: 'set' | 'remove'): Wiz {
    const v = yield { q: 'numbers', def: '' };
    const tk = { t: v, col: 1 };
    return cmd === 'set' ? this.set(t, [tk, ...toks]) : this.remove(t, [tk]);
  }
  private remove(t: TableDef, toks: Tok[]): string {
    if (!toks.length) return this.start(this.askNumbers(t, toks, 'remove'));
    const it = this.items(t, toks[0]);
    if (toks.length > 1) return colErr('expected end of command', toks[1].col);
    const d = this.dev;
    for (const r of it) {
      if (t.path === '/file') { d.files.delete(r.p.name); continue; }
      if (t.path === '/ip hotspot active') { d.rt.active = d.rt.active.filter(a => a.address !== r.p.address); continue; }
      if (r.dynamic) fail('failure: can not remove dynamic item');
      if (t.key && r.p[t.key] === 'default' && t.path.includes('profile')) fail('failure: can not remove default profile');
      const list = d.cfg.tables[t.path]; const k = list.indexOf(r); if (k >= 0) list.splice(k, 1);
    }
    d.rev++;
    return '';
  }

  private print(t: TableDef, toks: Tok[]): string {
    const words = toks.map(x => x.t);
    const detail = words.includes('detail') || !!t.detail;
    const wi = words.indexOf('where');
    for (const w of words) if (!['detail', 'terse', 'brief', 'where', 'and'].includes(w) && wi < 0) return colErr('expected end of command', toks[words.indexOf(w)].col);
    if (t.singleton) return this.printSingle(t);
    let list = this.rowsOf(t);
    if (wi >= 0) list = this.filter(list, words.slice(wi + 1));
    this.last.set(t.path, list);
    const d = this.dev;
    const flagsOf = (r: Row) => {
      let f = '';
      if (r.disabled) f += 'X';
      if (t.path === '/interface') { if (ifRunning(d, r.p.name)) f += 'R'; if (bridgeOf(d, r.p.name)) f += 'S'; }
      if (r.dynamic && t.path !== '/file') f += 'D';
      if (t.path === '/ip route') { const ad = activeDefault(d); if (r.p.kind === 'connect' || (r.p['dst-address'] === '0.0.0.0/0' && ad && ad.gw === r.p.gateway && gwIface(d, r.p.gateway))) f += 'A'; f += r.p.kind === 'connect' ? 'c' : r.p.kind === 'dhcp' ? 'd' : 's'; }
      return f;
    };
    const legend = t.path === '/interface' ? 'Flags: R - RUNNING; S - SLAVE; X - DISABLED'
      : t.path === '/ip route' ? 'Flags: D - DYNAMIC; X - DISABLED; A - ACTIVE; c - CONNECT, s - STATIC, d - DHCP'
      : t.path === '/file' ? '' : 'Flags: X - DISABLED; D - DYNAMIC';
    if (detail) {
      const lines = legend ? [legend] : [];
      list.forEach((r, k) => {
        const order = [...t.fields.map(f => f.name), ...Object.keys(r.p)];
        const kv = [...new Set(order)].filter(key => { const v = r.p[key]; const f = t.fields.find(x => x.name === key); return v !== undefined && v !== '' && !f?.secret && key !== 'kind'; }).map(key => `${key}=${quote(r.p[key])}`);
        lines.push(`${String(k).padStart(2)} ${flagsOf(r).padEnd(2)} ${r.comment ? `;;; ${r.comment}` : ''}`.trimEnd());
        lines.push(`      ${kv.join(' ')}`);
        lines.push('');
      });
      return lines.join('\n').trimEnd();
    }
    const cols = t.cols ?? [];
    const cell = (r: Row, c: string): string => {
      const key = c.toLowerCase();
      if (t.path === '/interface') { const i = interfaces(d).find(x => x.row === r)!; if (key === 'type') return i.type; if (key === 'actual-mtu') return r.p.mtu ?? '1500'; }
      if (t.path === '/ip dhcp-client') { if (key === 'status') return dhcpClientStatus(d, r); if (key === 'address') { const b = dhcpClientLease(d, r); return b ? `${b.ip}/${b.prefix}` : ''; } }
      if (t.path === '/ip dhcp-server lease' && (key === 'status' || key === 'host-name')) {
        const dl = ROS_HOOKS.leases(d).find(l => l.mac.toLowerCase() === (r.p['mac-address'] ?? '').toLowerCase());
        return key === 'status' ? (dl ? 'bound' : 'waiting') : (dl?.host ?? r.p['host-name'] ?? '');
      }
      if (key === 'last-logged-in') return '';
      if (key === 'mac-address' && t.path === '/interface') return ifMac(d, r.p.name);   // a bridge shows the MAC it took from its port
      return r.p[key] ?? '';
    };
    const data = list.map((r, k) => [String(k), flagsOf(r), ...cols.map(c => cell(r, c))]);
    const w = ['#', '', ...cols].map((h, ci) => Math.max(h.length, ...data.map(x => x[ci].length)));
    const fmt = (x: string[]) => x.map((s, ci) => s.padEnd(w[ci])).join(' ').trimEnd();
    const out = [legend, `Columns: ${cols.join(', ')}`, fmt(['#', '', ...cols])].filter(Boolean);
    list.forEach((r, k) => { if (r.comment) out.push(`${' '.repeat(w[0] + 1 + w[1] + 1)};;; ${r.comment}`); out.push(fmt(data[k])); });
    return out.join('\n');
  }
  private printSingle(t: TableDef): string {
    const p = rows(this.dev, t.path)[0].p;
    const lines = t.fields.map(f => [f.name, p[f.name] ?? '']);
    if (t.path === '/ip dns') lines.splice(1, 0, ['dynamic-servers', dnsServers(this.dev).dyn.join(',')]);
    const w = Math.max(...lines.map(l => l[0].length));
    return lines.map(([k, v]) => `${k.padStart(w + 2)}: ${v}`).join('\n');
  }

  /**
   * /system resource print. Field names/order as RouterOS v7 prints them; architecture, cpu, cpu-count, cpu-frequency,
   * total-memory and total-hdd-space from the product pages [2][3]. ⚠ inferred: free-memory / free-hdd-space shares,
   * cpu-load (a small figure that grows with queues and firewall rules), board-name = the product name.
   */
  private resource(): string {
    const d = this.dev; const m = d.model;
    const mib = (mb: number) => `${mb.toFixed(1)}MiB`;
    const load = Math.min(30, 1 + rows(d, '/queue simple').length + Math.ceil(rows(d, '/ip firewall filter').length / 4) + d.rt.active.length);
    const lines: [string, string][] = [
      ['uptime', fmtTime(Math.max(1, Math.floor((Date.now() - d.rt.bootAt) / 1000)))],
      ['version', `${ROS_VERSION} (stable)`],
      ['free-memory', mib(m.ramMB * m.freeMem)], ['total-memory', mib(m.ramMB)],
      ['cpu', m.cpu], ['cpu-count', '1'], ['cpu-frequency', `${m.cpuMHz}MHz`], ['cpu-load', `${load}%`],
      ['free-hdd-space', mib(m.storageMB * m.freeHdd)], ['total-hdd-space', mib(m.storageMB)],
      ['architecture-name', m.arch], ['board-name', m.name], ['platform', 'MikroTik'],
    ];
    const w = Math.max(...lines.map(l => l[0].length));
    return lines.map(([k, v]) => `${k.padStart(w + 2)}: ${v}`).join('\n');
  }

  // ------------------------------------------------------------ export / backup / reset / ping
  private exportCmd(p: string, toks: Tok[]): string {
    let file = ''; let sens = false;
    for (const tk of toks) { if (tk.t.startsWith('file=')) file = tk.t.slice(5); else if (tk.t === 'show-sensitive') sens = true; else if (tk.t === 'compact' || tk.t === 'verbose' || tk.t === 'terse') continue; else return colErr('expected end of command', tk.col); }
    const text = exportCfg(this.dev, p, { sensitive: sens });
    if (file) { const fn = file.endsWith('.rsc') ? file : `${file}.rsc`; this.dev.files.set(fn, { name: fn, type: 'script', text, size: text.length }); return ''; }
    return text;
  }
  private kv(toks: Tok[], names: string[]) {
    const out: Record<string, string> = {};
    for (const tk of toks) { const eq = tk.t.indexOf('='); const k = eq > 0 ? pick(tk.t.slice(0, eq), names) : null; if (!k) fail(colErr('expected end of command', tk.col)); out[k!] = tk.t.slice(eq + 1); }
    return out;
  }
  private backupSave(toks: Tok[]): string {
    const a = this.kv(toks, ['name', 'password', 'dont-encrypt', 'encryption']);
    const now = new Date(); const p2 = (n: number) => String(n).padStart(2, '0');
    const name = a.name || `${identity(this.dev)}-${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`;
    saveBackup(this.dev, name, a.password ?? '');
    return 'Configuration backup saved';   // [10]
  }
  private backupLoad(toks: Tok[]): string { return this.start(this.loadWiz(this.kv(toks, ['name', 'password']))); }
  private *loadWiz(a: Record<string, string>): Wiz {
    const name = a.name ?? (yield { q: 'name', def: '' });
    const f = findFile(this.dev, name, 'backup');
    if (!f || f.type !== 'backup') return 'failure: no such file';
    const pw = a.password ?? (yield { q: 'password', def: '', secret: true });   // the load asks for the password [10]
    if ((f.password ?? '') !== pw) return 'failure: wrong password';
    const ok = yield { q: 'Restore and reboot? [y/N]', def: 'N' };
    if (ok.toLowerCase() !== 'y') return '';
    loadBackup(this.dev, f); this.path = '/'; this.last.clear();
    return 'Restoring system configuration\nSystem configuration restored, rebooting now';
  }
  private reset(toks: Tok[]): string { return this.start(this.resetWiz(this.kv(toks, ['no-defaults', 'skip-backup', 'keep-users', 'run-after-reset']))); }
  private *resetWiz(a: Record<string, string>): Wiz {
    const ok = yield { q: 'Dangerous! Reset anyway? [y/N]', def: 'N' };
    if (ok.toLowerCase() !== 'y') return '';
    resetConfiguration(this.dev, a['no-defaults'] === 'yes', a['skip-backup'] === 'yes');
    this.path = '/'; this.last.clear(); this.user = 'admin';
    return 'system configuration will be reset';
  }
  private *pingAsk(): Wiz { const v = yield { q: 'address', def: '' }; return this.ping([{ t: v, col: 1 }]); }
  private ping(toks: Tok[]): string {
    if (!toks.length) return this.start(this.pingAsk());
    let target = ''; let count = 4;
    for (const tk of toks) { if (tk.t.startsWith('count=')) count = Math.max(1, Math.min(20, +tk.t.slice(6) || 4)); else if (tk.t.startsWith('address=')) target = tk.t.slice(8); else if (!target && !tk.t.includes('=')) target = tk.t; else if (!tk.t.startsWith('interface=') && !tk.t.startsWith('size=')) return colErr('expected end of command', tk.col); }
    let ip = target;
    if (parseIp(target) === null) {
      const ds = dnsServers(this.dev); const r = ds.stat.length || ds.dyn.length ? ROS_HOOKS.resolve(target) : null;
      if (!r || !routerPing(this.dev, ds.stat[0] ?? ds.dyn[0]).ok) return 'invalid value for argument address';
      ip = r;
    }
    const lines = ['  SEQ HOST                                     SIZE TTL TIME       STATUS'];
    let rec = 0; const rtts: number[] = [];
    for (let s = 0; s < count; s++) {
      const r = routerPing(this.dev, ip);
      if (r.ok) { rec++; rtts.push(r.ms); lines.push(`${String(s).padStart(5)} ${ip.padEnd(40)} ${'56'.padStart(4)} ${String(r.ttl).padStart(3)} ${`${r.ms}ms`.padEnd(10)}`); }
      else lines.push(`${String(s).padStart(5)} ${ip.padEnd(40)} ${''.padStart(4)} ${''.padStart(3)} ${''.padEnd(10)} ${r.why === 'no route to host' ? 'no route to host' : 'timeout'}`);
    }
    const loss = Math.round(((count - rec) / count) * 100);
    lines.push(`    sent=${count} received=${rec} packet-loss=${loss}%${rec ? ` min-rtt=${Math.min(...rtts)}ms avg-rtt=${Math.round(rtts.reduce((x, y) => x + y, 0) / rec)}ms max-rtt=${Math.max(...rtts)}ms` : ''}`);
    return lines.join('\n');
  }

  // ------------------------------------------------------------ wizards (prompts exactly as the docs show them)
  /** /ip dhcp-server setup [8] */
  private *dhcpSetup(): Wiz {
    const d = this.dev; let pre = '';
    let ifn = '';
    for (;;) {
      ifn = yield { pre, head: 'Select interface to run DHCP server on', q: 'dhcp server interface', def: '' };
      if (!ifByName(d, ifn)) { pre = 'input does not match any value of interface'; continue; }
      if (bridgeOf(d, ifn)) { pre = `${ifn} adalah port bridge: jalankan DHCP server di interface bridge-nya (${bridgeOf(d, ifn)})`; continue; }
      if (rows(d, '/ip dhcp-server').some(r => r.p.interface === ifn)) { pre = `failure: interface ${ifn} already has a DHCP server`; continue; }
      break;
    }
    const a = ifAddr(d, ifn);
    pre = '';
    let space = '';
    for (;;) { space = yield { pre, head: 'Select network for DHCP addresses', q: 'dhcp address space', def: a ? `${ipStr(a.net)}/${a.prefix}` : '' }; const c = parseCidr(space); if (c) { space = `${ipStr(networkOf(c.ip, c.prefix))}/${c.prefix}`; break; } pre = 'invalid value for argument address'; }
    const sc = parseCidr(space)!; const net = networkOf(sc.ip, sc.prefix), bc = broadcastOf(sc.ip, sc.prefix);
    pre = ''; let gw = '';
    for (;;) { gw = yield { pre, head: 'Select gateway for given network', q: 'gateway for dhcp network', def: a && networkOf(parseIp(a.ip)!, sc.prefix) === net ? a.ip : '' }; if (parseIp(gw) !== null) break; pre = 'invalid value for argument gateway'; }
    const g = parseIp(gw)!;
    const defPool = g > net && g < bc ? [g > net + 1 ? `${ipStr(net + 1)}-${ipStr(g - 1)}` : '', g < bc - 1 ? `${ipStr(g + 1)}-${ipStr(bc - 1)}` : ''].filter(Boolean).join(',') : `${ipStr(net + 1)}-${ipStr(bc - 1)}`;
    pre = ''; let pool = '';
    for (;;) { pool = yield { pre, head: 'Select pool of ip addresses given out by DHCP server', q: 'addresses to give out', def: defPool }; if (parseRanges(pool)) break; pre = 'invalid value for argument ranges'; }
    const ds = dnsServers(d);
    pre = ''; let dns = '';
    for (;;) { dns = yield { pre, head: 'Select DNS servers', q: 'dns servers', def: [...ds.stat, ...ds.dyn].join(',') }; dns = dns.split(',').map(s => s.trim()).filter(Boolean).join(','); if (dns.split(',').filter(Boolean).every(s => parseIp(s) !== null)) break; pre = 'invalid value for argument dns-server'; }
    // ⚠ default lease time: 30m (v7 default [8]); the doc example shows 10m from an older release
    pre = ''; let lt = '';
    for (;;) { lt = yield { pre, head: 'Select lease time', q: 'lease time', def: '30m' }; if (parseTime(lt) !== null) break; pre = 'invalid value for argument lease-time'; }
    // ⚠ object names dhcp_pool0 / dhcp1 follow the [8] manual example
    let n = 0; while (rows(d, '/ip pool').some(r => r.p.name === `dhcp_pool${n}`)) n++;
    let m = 1; while (rows(d, '/ip dhcp-server').some(r => r.p.name === `dhcp${m}`)) m++;
    insertRow(d, '/ip pool', { name: `dhcp_pool${n}`, ranges: pool });
    insertRow(d, '/ip dhcp-server network', { address: space, gateway: gw, 'dns-server': dns });
    insertRow(d, '/ip dhcp-server', { name: `dhcp${m}`, interface: ifn, 'address-pool': `dhcp_pool${n}`, 'lease-time': fmtTime(parseTime(lt)!) });
    return 'That is all. You have configured an active DHCP server.';
  }

  /** /ip hotspot setup [11] */
  private *hotspotSetup(): Wiz {
    const d = this.dev; let pre = ''; let ifn = '';
    for (;;) {
      ifn = yield { pre, head: 'Select interface to run HotSpot on', q: 'hotspot interface', def: '' };
      if (!ifByName(d, ifn)) { pre = 'input does not match any value of interface'; continue; }
      // [11]: on a bridge run HotSpot on the bridge interface, not on a bridge port
      if (bridgeOf(d, ifn)) { pre = `${ifn} adalah port bridge: pakai interface bridge-nya (${bridgeOf(d, ifn)}), bukan port bridge`; continue; }
      if (rows(d, '/ip hotspot').some(r => r.p.interface === ifn)) { pre = 'failure: already have hotspot server on that interface'; continue; }
      break;
    }
    const a = ifAddr(d, ifn);
    pre = ''; let local = '';
    for (;;) { local = yield { pre, head: 'Set HotSpot address for interface', q: 'local address of network', def: a ? `${a.ip}/${a.prefix}` : '10.5.50.1/24' }; const c = parseCidr(local); if (c && c.prefix < 31 && c.ip !== networkOf(c.ip, c.prefix) && c.ip !== broadcastOf(c.ip, c.prefix)) break; pre = 'invalid value for argument address'; }
    pre = ''; let masq = '';
    for (;;) { masq = yield { pre, q: 'masquerade network', def: 'yes' }; if (masq === 'yes' || masq === 'no') break; pre = 'input does not match any value of masquerade-network'; }
    const c = parseCidr(local)!; const net = networkOf(c.ip, c.prefix), bc = broadcastOf(c.ip, c.prefix);
    const defPool = c.ip === net + 1 ? `${ipStr(net + 2)}-${ipStr(bc - 1)}` : `${ipStr(net + 1)}-${ipStr(c.ip - 1)}${c.ip < bc - 1 ? `,${ipStr(c.ip + 1)}-${ipStr(bc - 1)}` : ''}`;
    pre = ''; let pool = '';
    for (;;) { pool = yield { pre, head: 'Set pool for HotSpot addresses', q: 'address pool of network', def: defPool }; if (pool === 'none' || parseRanges(pool)) break; pre = 'invalid value for argument ranges'; }
    yield { head: 'Select hotspot SSL certificate', q: 'select certificate', def: 'none' };   // HTTPS login not simulated
    pre = '';
    for (;;) { const v = yield { pre, head: 'Select SMTP server', q: 'ip address of smtp server', def: '0.0.0.0' }; if (parseIp(v) !== null) break; pre = 'invalid value for argument smtp-server'; }
    const ds = dnsServers(d);
    pre = ''; let dns = '';
    for (;;) { dns = yield { pre, head: 'Setup DNS configuration', q: 'dns servers', def: [...ds.stat, ...ds.dyn].join(',') }; dns = dns.split(',').map(s => s.trim()).filter(Boolean).join(','); if (dns.split(',').filter(Boolean).every(s => parseIp(s) !== null)) break; pre = 'invalid value for argument dns-servers'; }
    const dnsName = yield { head: 'DNS name of local hotspot server', q: 'dns name', def: '' };
    const uname = yield { head: 'Create local hotspot user', q: 'name of local hotspot user', def: 'admin' };
    const upass = yield { q: 'password for the user', def: '', secret: true };
    // ---- what the wizard creates [11]: address, pool hs-pool-N, dhcp server, hsprof1, hotspot1, user, masquerade
    const ipStrLocal = ipStr(c.ip); const cidr = `${ipStr(net)}/${c.prefix}`;
    if (!rows(d, '/ip address').some(r => r.p.interface === ifn && r.p.address === `${ipStrLocal}/${c.prefix}`)) insertRow(d, '/ip address', { address: `${ipStrLocal}/${c.prefix}`, interface: ifn, network: ipStr(net) });
    let poolName = 'none';
    if (pool !== 'none') {
      // ⚠ suffix = the interface's trailing number (doc: ether3 → hs-pool-3), otherwise a counter
      const suf = /(\d+)$/.exec(ifn)?.[1]; let k = suf ? +suf : 1; poolName = `hs-pool-${k}`;
      while (rows(d, '/ip pool').some(r => r.p.name === poolName)) poolName = `hs-pool-${++k}`;
      insertRow(d, '/ip pool', { name: poolName, ranges: pool });
      if (!rows(d, '/ip dhcp-server').some(r => r.p.interface === ifn)) {
        let m = 1; while (rows(d, '/ip dhcp-server').some(r => r.p.name === `dhcp${m}`)) m++;
        insertRow(d, '/ip dhcp-server', { name: `dhcp${m}`, interface: ifn, 'address-pool': poolName, 'lease-time': '1h' });   // lease 1h as in the doc's print
        // ⚠ inferred: network entry with the hotspot address as gateway and DNS
        insertRow(d, '/ip dhcp-server network', { address: cidr, gateway: ipStrLocal, 'dns-server': ipStrLocal });
      }
    }
    if (dns) single(d, '/ip dns').servers = dns;
    single(d, '/ip dns')['allow-remote-requests'] = 'yes';   // ⚠ inferred: the hotspot answers its clients' DNS
    let k = 1; while (rows(d, '/ip hotspot profile').some(r => r.p.name === `hsprof${k}`)) k++;
    insertRow(d, '/ip hotspot profile', { name: `hsprof${k}`, 'hotspot-address': ipStrLocal, 'dns-name': dnsName });
    let h = 1; while (rows(d, '/ip hotspot').some(r => r.p.name === `hotspot${h}`)) h++;
    insertRow(d, '/ip hotspot', { name: `hotspot${h}`, interface: ifn, 'address-pool': poolName, profile: `hsprof${k}` });
    const existing = rows(d, '/ip hotspot user').find(r => r.p.name === uname);
    if (existing) existing.p.password = upass; else if (uname) insertRow(d, '/ip hotspot user', { name: uname, password: upass });
    if (masq === 'yes') {
      if (!rows(d, '/ip firewall nat').some(r => r.p.chain === 'unused-hs-chain')) insertRow(d, '/ip firewall nat', { chain: 'unused-hs-chain', action: 'passthrough' }, { disabled: true, comment: 'place hotspot rules here' });
      insertRow(d, '/ip firewall nat', { chain: 'srcnat', action: 'masquerade', 'src-address': cidr }, { comment: 'masquerade hotspot network' });
    }
    d.rev++;
    return '';
  }
}
/** a terminal session after a successful login (RouterOS login: name + password from /user) */
export function rosLogin(d: RosDevice, user: string, password: string): RosCli | null {
  return rows(d, '/user').some(r => !r.disabled && r.p.name === user && r.p.password === password) ? new RosCli(d, user) : null;
}
export { ifRunning };
