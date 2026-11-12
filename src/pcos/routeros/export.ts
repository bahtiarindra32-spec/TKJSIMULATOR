// /export: the configuration as a RouterOS script (text, unlike the binary .backup [5][10]).
// Like the real export it lists only what differs from the factory state, sorts properties alphabetically, uses
// "set [ find default-name=… ]" for built-in items and hides secrets unless show-sensitive is given.
// ⚠ simplified: /user is not exported (as on RouterOS), no "# … by RouterOS" comment variants, no "compact/verbose".
import { TABLE, ROS_VERSION, rows, withDefaults, type RosDevice, type Row } from './model';

/** section order of a RouterOS export (definitions before the rules that use them) */
export const EXPORT_ORDER = [
  '/interface bridge', '/interface ethernet', '/interface wireless security-profiles', '/interface wireless', '/ip hotspot profile', '/ip hotspot user profile',
  '/ip pool', '/ip dhcp-server', '/ip hotspot', '/queue simple', '/interface bridge port', '/ip address', '/ip dhcp-client', '/ip dhcp-server lease',
  '/ip dhcp-server network', '/ip dns', '/ip firewall filter', '/ip firewall nat', '/ip hotspot user', '/ip hotspot walled-garden', '/ip route', '/system identity',
];
/** items that exist on a fresh router and are changed with set, not added */
const BUILTIN: Record<string, (r: Row) => string | null> = {
  '/interface ethernet': r => `default-name=${r.p['default-name']}`,
  '/interface wireless': r => `default-name=${r.p['default-name']}`,
  '/interface wireless security-profiles': r => (r.p.name === 'default' ? 'default=yes' : null),
  '/ip hotspot profile': r => (r.p.name === 'default' ? 'default=yes' : null),
  '/ip hotspot user profile': r => (r.p.name === 'default' ? 'default=yes' : null),
};
export const quote = (v: string) => (v === '' ? '""' : /[\s"\\;$[\]{}]/.test(v) ? `"${v.replace(/(["\\$])/g, '\\$1')}"` : v);

function props(path: string, r: Row, builtin: boolean, sensitive: boolean): string[] {
  const t = TABLE.get(path)!; const def = withDefaults(path, {});
  const out: string[] = [];
  for (const f of t.fields) {
    if (f.ro && f.name !== 'network') continue;
    if (f.secret && !sensitive) continue;
    const v = r.p[f.name]; if (v === undefined) continue;
    if (f.name === 'default-name') continue;
    if (v === (def[f.name] ?? '') && !(f.name === 'name' && !builtin)) continue;
    out.push(`${f.name}=${quote(v)}`);
  }
  if (r.comment) out.push(`comment=${quote(r.comment)}`);
  if (r.disabled !== (builtin && path === '/interface wireless')) out.push(`disabled=${r.disabled ? 'yes' : 'no'}`);
  return out.sort();
}

/** export the whole configuration (scope '/') or one menu and its sub-menus */
export function exportCfg(d: RosDevice, scope = '/', opts: { sensitive?: boolean; date?: Date } = {}): string {
  const dt = opts.date ?? new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const stamp = `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}`;
  const lines = [`# ${stamp} by RouterOS ${ROS_VERSION}`, `# software id = ${d.serial.slice(2, 6)}-${d.serial.slice(4, 8)}`, '#', `# model = ${d.model.id}`, `# serial number = ${d.serial}`];
  for (const path of EXPORT_ORDER) {
    if (scope !== '/' && path !== scope && !path.startsWith(`${scope} `)) continue;
    const t = TABLE.get(path)!; const body: string[] = [];
    for (const r of rows(d, path)) {
      if (r.dynamic) continue;
      if (t.singleton) { const pr = props(path, r, true, !!opts.sensitive); if (pr.length) body.push(`set ${pr.join(' ')}`); continue; }
      const b = BUILTIN[path]?.(r) ?? null;
      if (b) { const pr = props(path, r, true, !!opts.sensitive).filter(x => !x.startsWith('name=') || r.p.name !== (r.p['default-name'] ?? 'default')); if (pr.length) body.push(`set [ find ${b} ] ${pr.join(' ')}`); continue; }
      body.push(`add ${props(path, r, false, !!opts.sensitive).join(' ')}`.trimEnd());
    }
    if (body.length) lines.push(path, ...body);
  }
  return lines.join('\n');
}
