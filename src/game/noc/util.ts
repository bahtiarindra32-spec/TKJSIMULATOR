// Small shared helpers of the NOC work board: random picks, DOM shortcuts, formatting and address math.
import { panelOf, outletId, poolProblem, parseIp, ipStr, networkOf, ADAPTERS, live, type Env } from '../../pcos/net';

export const pick = <T>(a: T[], r = Math.random) => a[Math.floor(r() * a.length)];
export const shuffle = <T>(a: T[], r = Math.random) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
export const h = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
export const btn = (txt: string, fn: () => void, cls = 'btn', name = '') => {
  const b = h('button', cls, txt) as HTMLButtonElement;
  b.onclick = fn;
  if (name) b.name = name;
  return b;
};
export const mmss = (s: number) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
export const esc = (s: string) => s.replace(/[&<>]/g, c => ESC[c] ?? c);
/** Wall label of a wired desk: true = printed and correct, false = missing/wrong, null = not a wired desk. */
export const wallOk = (pc: string) => {
  const q = panelOf(pc);
  return q ? q.pp.label.toUpperCase() === outletId(q.sw.level, q.pp.n) : null;
};
/** free addresses left in a DHCP pool */
export const poolSpace = (env: Env) => {
  if (!env.dhcp || poolProblem(env)) return 0;
  const a = parseIp(env.dhcp.start),
    b = parseIp(env.dhcp.end);
  if (a === null || b === null) return 0;
  const used = new Set([...env.leases.values(), ...env.hosts.map(x => x.ip)]);
  let n = 0;
  for (let k = a; k <= b; k++) if (!used.has(ipStr(k >>> 0))) n++;
  return n;
};
/** host number n of the segment behind env's gateway (e.g. n = 254 → x.x.x.254 on a /24) */
export const hostIp = (env: Env, n: number) => ipStr((networkOf(parseIp(env.gateway) ?? 0, env.prefix) + n) >>> 0);
/** a free address in env between host numbers lo..hi that no PC, server or `avoid` entry is using */
export function freeIpIn(env: Env, r: () => number, lo = 21, hi = 89, avoid: string[] = []) {
  const used = new Set<string>([...env.hosts.map(x => x.ip), ...avoid]);
  for (const a of ADAPTERS.values()) {
    const l = live(a);
    if (l.ip) used.add(l.ip);
  }
  for (let k = 0; k < 200; k++) {
    const ip = hostIp(env, lo + Math.floor(r() * (hi - lo + 1)));
    if (!used.has(ip)) return ip;
  }
  return hostIp(env, lo);
}
/** Small seeded RNG so a work order is reproducible from its seed. */
export function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
