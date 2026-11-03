// VLSM design task for the Lab Praktik (pure, no DOM). A /24 block and four needs (hosts per segment);
// the student fills the addressing table. Any correct design is accepted, not only the textbook
// largest-first one: every subnet must use the smallest prefix that fits its hosts, sit on its own
// boundary inside the block, not overlap another, and give the right first host (gateway) and broadcast.
import { parseIp, ipStr, networkOf, broadcastOf } from './missionLogic';

export interface Need { name: string; hosts: number }
export interface Row { net: string; prefix: number; gw: string; bc: string }
export interface Plan { block: string; needs: Need[] }

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** smallest prefix whose usable host count (2^h − 2) holds n hosts */
export const prefixFor = (n: number) => { let p = 30; while (p > 0 && 2 ** (32 - p) - 2 < n) p--; return p; };
export const usable = (p: number) => 2 ** (32 - p) - 2;

/** the case for one seed: block 192.168.71–99.0/24 (inside the lab router's NAT list), SISWA / GURU / SERVER / link */
export function vlsmCase(seed: number): Plan {
  const r = rng(seed ^ 0x51ab);
  const third = 71 + Math.floor(r() * 29);
  const guru = r() < 0.5 ? 30 + Math.floor(r() * 31) : 15 + Math.floor(r() * 14);   // /26 or /27
  return {
    block: `192.168.${third}.0/24`,
    needs: [
      { name: 'GURU', hosts: guru },
      { name: 'SISWA', hosts: 65 + Math.floor(r() * 56) },      // always a /25
      { name: 'SERVER', hosts: 6 + Math.floor(r() * 9) },       // /28
      { name: 'LINK-ROUTER', hosts: 2 },                        // /30
    ],
  };
}
/** the textbook answer: largest need first, packed from the start of the block */
export function vlsmKey(p: Plan): Row[] {
  const base = parseIp(p.block.split('/')[0])!;
  const order = p.needs.map((n, i) => ({ i, pf: prefixFor(n.hosts) })).sort((a, b) => a.pf - b.pf || a.i - b.i);
  const out: Row[] = new Array(p.needs.length); let at = base;
  for (const o of order) { const net = at >>> 0; out[o.i] = { net: ipStr(net), prefix: o.pf, gw: ipStr(net + 1), bc: ipStr(broadcastOf(net, o.pf)) }; at = net + 2 ** (32 - o.pf); }
  return out;
}
export interface RowCheck { name: string; netOk: boolean; hostsOk: boolean; why: string }
/** grade the student's rows (same order as needs) */
export function vlsmCheck(p: Plan, rows: Partial<Row>[]): RowCheck[] {
  const [bs, bp] = p.block.split('/'); const B = parseIp(bs)!, BP = +bp;
  const spans: [number, number][] = [];
  return p.needs.map((n, i) => {
    const r = rows[i] ?? {}; const net = parseIp(r.net ?? ''); const pf = Number(r.prefix);
    let why = '';
    if (net === null || !(pf >= 1 && pf <= 30)) why = 'network / prefix belum diisi';
    else if (pf !== prefixFor(n.hosts)) why = `butuh ${n.hosts} host → prefix /${prefixFor(n.hosts)} (${usable(prefixFor(n.hosts))} host)`;
    else if (networkOf(net, pf) !== net) why = `${r.net} bukan awal blok /${pf}`;
    else if (networkOf(net, BP) !== networkOf(B, BP)) why = `di luar blok ${p.block}`;
    else if (spans.some(([a, b]) => net <= b && broadcastOf(net, pf) >= a)) why = 'tumpang tindih dengan subnet lain';
    const netOk = !why;
    if (netOk) spans.push([net!, broadcastOf(net!, pf)]);
    const hostsOk = netOk && r.gw === ipStr(net! + 1) && r.bc === ipStr(broadcastOf(net!, pf));
    if (netOk && !hostsOk) why = 'gateway (host pertama) / broadcast salah';
    return { name: n.name, netOk, hostsOk, why };
  });
}
