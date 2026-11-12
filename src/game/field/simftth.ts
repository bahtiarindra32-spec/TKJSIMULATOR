// Fase 3 FTTH chunk B2: paid field orders on the house fibre (ODP-FLB-01 → drop → roset → patch cord → ONT).
// Each order seeds a real fault into rumahFtth() when it is accepted and is graded from the ftth engine STATE, never from
// what the player typed: the ONT must be online, its Rx in the green band (−13…−24 dBm, research §2.3 ⚠ inferred bands),
// the drop in the ODP port the inventory names, the template's own fault gone, and (sim.ts / field.ts) the player must
// have tested the internet from the family laptop after the fix.
// Garansi (Fase 1 system): a repair splice above 0.2 dB (FOA 0.1–0.2 dB [20][21], user decision) or without its sleeve,
// or a drop plugged into a port without cleaning first, brings an unpaid callback that re-creates the same fault.
// Grounding: notes/research-grow.md §2 (topology [14]–[16], losses [19]–[24], OTDR/VFL/OPM [29], K3 [30], macrobend as a
// real cause of bad Rx [26]); everything else is marked ⚠ (DESIGN.md › Fase 3 B2).
import { ontStatus, faultsOn, breakFiber, setDirty, addBend, addCustomer, plugDrop, unplugDrop, bendLossDb, round2, CONN, type FtthNet } from '../../pcos/ftth';
import { rumahFtth, RUMAH_CUST, RUMAH_ODP } from '../../pcos/ftthsite';
import { dropParts } from '../../data/ftthsite';
import { kitDef, type Kit } from './ftthkit';
import type { FieldTplId } from './types';

export type FtthTplId = 'f_drop_putus' | 'f_konektor_kotor' | 'f_macrobend' | 'f_port_salah';
export const FTTH_TPL_IDS: FtthTplId[] = ['f_drop_putus', 'f_konektor_kotor', 'f_macrobend', 'f_port_salah'];
export const isFtthTpl = (t: FieldTplId): t is FtthTplId => (FTTH_TPL_IDS as string[]).includes(t);

export interface FtthJob {
  tpl: FtthTplId;
  cust: string;
  /** the ODP port the inventory ("data ODP") gives for the house */
  port: number;
  /** connectors the order made dirty (konektor order: all must be clean at closing) */
  conns: string[];
}
export interface FtthInjected {
  variant: string;
  detail: string;
  lines: string[];
  data: Record<string, string | number>;
  ftth: FtthJob;
}

/** what the technician did that the engine state cannot show afterwards: every plug of the drop into an ODP port */
export const FTTH_WORK = { plugs: [] as { port: number; cleaned: boolean }[] };
/** the UI calls this on every re-plug of the drop (cleaned = the end faces were cleaned right before mating) */
export function recordPlug(port: number, cleaned: boolean) { FTTH_WORK.plugs.push({ port, cleaned }); }

const r1 = (x: number) => Math.round(x * 10) / 10;
const pickOf = <X>(a: X[], r: () => number) => a[Math.floor(r() * a.length)];
const NEED = (): FtthNet => { const n = rumahFtth(); if (!n) throw new Error('ftth: jaringan rumah belum dibangun (initSiteClients)'); return n; };

/** where along the drop a point is, by the walked layout (data/ftthsite dropPointAt order: up the pole, service loop, clamp, span, wall) */
export function dropPlace(atM: number): string {
  const p = dropParts().parts;
  const segs: [number, string][] = [[p.upPole + p.slack, 'di tiang (naik ke clamp / service loop)'], [p.span, 'bentangan udara tiang → rumah'], [p.downWall, 'turun di dinding depan'], [p.throughWall + p.insideToRoset, 'di dalam rumah menuju roset']];
  let left = atM;
  for (const [len, name] of segs) { if (left <= len) return name; left -= len; }
  return 'dekat roset';
}

/** ⚠ inferred: severity of a heavily contaminated end face needed to put the ONT below sensitivity (LOS) by `marginDb` */
function losExtra(net: FtthNet, marginDb: number) {
  const st = ontStatus(net, RUMAH_CUST);
  return r1(Math.max(0, st.rxDbm - net.cfg.ontSensitivityDbm) + marginDb);
}

/**
 * Seed the fault of an accepted order into the live house network (fresh from restoreSites → initFtthSite).
 * redo = a garansi callback: { g: 'splice', atM } re-breaks the drop where it was spliced; { g: 'dirty', conn } makes the
 * connector that was plugged without cleaning heavily dirty again.
 */
export function injectFtth(tpl: FtthTplId, r: () => number, redo?: Record<string, string | number>): FtthInjected | null {
  const net = NEED(), c = net.customers[RUMAH_CUST], dropM = net.spans[c.drop].lengthM;
  FTTH_WORK.plugs = [];
  const job = (o: Partial<FtthJob> = {}): FtthJob => ({ tpl, cust: RUMAH_CUST, port: c.assignedPort, conns: [], ...o });
  const port = () => `Data ODP (inventori): Rumah Kel. Hendra → ${RUMAH_ODP} port ${c.assignedPort}.`;
  // ---- garansi re-creations
  if (redo?.g === 'splice') {
    const at = Math.min(dropM - 0.5, Math.max(0.5, Number(redo.atM) || 12));
    breakFiber(net, c.drop, at);
    return { variant: 'garansi-splice', detail: `Sambungan drop yang kemarin (${at} m dari port ODP, ${dropPlace(at)}) putus lagi: loss terlalu besar / tanpa sleeve → disambung ulang`, lines: [port()], data: { g: 'splice', atM: at }, ftth: job() };
  }
  if (redo?.g === 'dirty') {
    const id = String(redo.conn);
    if (!net.connectors[id]) return null;
    setDirty(net, id, true, losExtra(net, 1.5));
    return { variant: 'garansi-dirty', detail: `${net.connectors[id].label} dicolok tanpa dibersihkan kemarin; debu di ujung konektor membuat Rx jatuh → dibersihkan (alkohol IPA + tisu) lalu dicolok lagi`, lines: [port()], data: { g: 'dirty', conn: id }, ftth: job({ conns: [id] }) };
  }
  if (tpl === 'f_drop_putus') {
    // 12–16 m from the port: beyond the ⚠ 10 m OTDR dead zone, short of the roset (drop ≈ 17 m)
    const at = Math.min(dropM - 0.6, r1(12 + r() * 4));
    breakFiber(net, c.drop, at);
    return { variant: 'putus', detail: `Fiber drop putus ${at} m dari port ${RUMAH_ODP} (${dropPlace(at)}), ${r1(dropM - at)} m dari roset → disambung fusion splice + sleeve`, lines: [port()], data: { atM: at }, ftth: job() };
  }
  if (tpl === 'f_konektor_kotor') {
    const v = (redo?.variant as string) ?? pickOf(['roset', 'odp', 'dua'], r);
    const roset = CONN.roset(RUMAH_CUST), odp = CONN.odpPort(RUMAH_ODP, c.port!);
    const E = losExtra(net, 0.5 + r() * 2.5);
    let conns: string[];
    if (v === 'dua') { const a = r1(E * (0.4 + 0.2 * r())); setDirty(net, roset, true, a); setDirty(net, odp, true, r1(E - a + 0.1)); conns = [roset, odp]; }
    else { const id = v === 'roset' ? roset : odp; setDirty(net, id, true, E); conns = [id]; }
    const names = conns.map(id => net.connectors[id].label).join(' dan ');
    return { variant: v, detail: `Ujung konektor kotor (debu/minyak) di ${names}, Rx ONT di bawah ${net.cfg.ontSensitivityDbm} dBm (LOS) → dibersihkan alkohol IPA + tisu lint-free, dicolok lagi`, lines: [port()], data: { variant: v, conns: conns.join(',') }, ftth: job({ conns }) };
  }
  if (tpl === 'f_macrobend') {
    const v = (redo?.variant as string) ?? pickOf(['indoor', 'drop'], r);
    const radius = 4 + Math.floor(r() * 5);                       // 4–8 mm, well under the ⚠ 30 mm safe radius
    const rx0 = ontStatus(net, RUMAH_CUST).rxDbm, target = -25 - r() * 3;   // yellow … just under sensitivity
    const per = bendLossDb(net.cfg, radius, 1490);
    let turns = Math.min(6, Math.max(1, Math.ceil((rx0 - target) / per)));
    const span = v === 'indoor' ? c.indoor : c.drop;
    const fromRoset = r1(v === 'indoor' ? 0.3 + r() * 0.8 : 0.2 + r() * 0.5);
    const at = v === 'indoor' ? fromRoset : r1(dropM - fromRoset);
    const b = addBend(net, span, at, radius, turns);
    while (ontStatus(net, RUMAH_CUST).band === 'green' && turns < 8) { b.turns = ++turns; }
    const l1490 = round2(bendLossDb(net.cfg, radius, 1490) * turns), l1550 = round2(bendLossDb(net.cfg, radius, 1550) * turns);
    const what = v === 'indoor' ? 'Patch cord roset → ONT' : 'Kabel drop di dalam rumah (sebelum roset)';
    return {
      variant: v, detail: `${what} tertekuk tajam r=${radius} mm, ${turns} lilitan, ±${fromRoset} m dari roset → loss ${l1490} dB @1490, ${l1550} dB @1550 (macrobend) → tekukan dirapikan`,
      lines: [port()], data: { variant: v, bend: b.id, radius, turns, fromRoset }, ftth: job(),
    };
  }
  // f_port_salah: a technician connecting a neighbour took the house drop out of its port by mistake and put it into a port
  // whose splitter output is not spliced (⚠ inferred "dead" spare); the house port was left without a dust cap (dirty).
  const dead = net.odps[RUMAH_ODP].ports.filter(p => !p.live && !p.customer).map(p => p.n);
  if (!dead.length) return null;
  const to = redo?.dead !== undefined && dead.includes(Number(redo.dead)) ? Number(redo.dead) : pickOf(dead, r);
  const neighbour = net.odps[RUMAH_ODP].ports.find(p => p.live && !p.customer && p.n !== c.assignedPort);
  if (neighbour) addCustomer(net, { id: 'tetangga11', odp: RUMAH_ODP, port: neighbour.n, dropM: 47, label: 'Tetangga No. 11 (pasang baru)' });
  unplugDrop(net, RUMAH_CUST);
  setDirty(net, CONN.odpPort(RUMAH_ODP, c.assignedPort), true);           // open port, default ⚠ dirt (setCap rule)
  plugDrop(net, RUMAH_CUST, to);
  return {
    variant: `port${to}`, detail: `Drop rumah dipindah ke port ${to} ${RUMAH_ODP} (splitter belum disambung, tidak ada cahaya) saat pemasangan tetangga; port ${c.assignedPort} dibiarkan terbuka → konektor dibersihkan, drop dicolok kembali ke port ${c.assignedPort} sesuai data ODP, port kosong ditutup`,
    lines: [port()], data: { dead: to, port: c.assignedPort }, ftth: job(),
  };
}

/** what still keeps the order open ('' = the fibre meets the order). Rx and state are read from the engine, as the ONT does. */
export function ftthProblem(j: FtthJob): string {
  const net = rumahFtth(); if (!net) return 'jaringan fiber rumah belum ada';
  const c = net.customers[j.cust];
  if (c.port === null) return 'drop rumah belum terpasang di port ODP';
  if (c.port !== j.port) return `drop rumah di port ${c.port}, menurut data ODP seharusnya port ${j.port}`;
  const st = ontStatus(net, j.cust);
  if (st.state !== 'online') return `ONT ${st.state === 'los' ? 'LOS' : st.state}: ${st.reason}`;
  if (st.band !== 'green') return `Rx ONT ${st.rxDbm.toFixed(2)} dBm belum hijau (−13 s/d −24 dBm)`;
  const f = faultsOn(net, j.cust);
  const left = f.find(x => x.kind === 'break' || x.kind === 'macrobend' || x.kind === 'dead-port' || (x.kind === 'dirty' && j.conns.includes(x.id)));
  if (left) return `masih ada gangguan: ${left.label}`;
  return '';
}

/** a fibre job that passes now but will come back (garansi): a weak repair splice, or a drop plugged without cleaning */
export function ftthWeak(j: FtthJob): { redo: Record<string, string | number>; why: string } | null {
  const net = rumahFtth(); if (!net) return null;
  const c = net.customers[j.cust];
  for (const s of Object.values(net.splices)) {
    if (!s.label.startsWith('Splice perbaikan') || s.span !== c.drop) continue;
    if (s.lossDb > net.cfg.fusionSpliceMaxDb + 1e-9) return { redo: { g: 'splice', atM: s.atM }, why: `Sambungan fusi drop ${s.lossDb.toFixed(2)} dB, di atas batas ${net.cfg.fusionSpliceMaxDb} dB: masih nyala sekarang, tapi rawan.` };
    if (!s.sleeve) return { redo: { g: 'splice', atM: s.atM }, why: 'Sambungan fusi drop tanpa sleeve pelindung: fiber telanjang mudah patah.' };
  }
  // the last mating counts: cleaning the port connector later (unplug, clean, re-plug) fixes an earlier dirty plug
  const p = FTTH_WORK.plugs[FTTH_WORK.plugs.length - 1];
  if (p && !p.cleaned) return { redo: { g: 'dirty', conn: CONN.odpPort(c.odp, p.port) }, why: `Drop dicolok ke port ${p.port} tanpa membersihkan konektor dulu: debu di ujung konektor menaikkan redaman.` };
  return null;
}

/** K3 notes and tools at closing: APD missing on the pole / at the splicer / with the laser, and tools left at the site */
export function ftthSiteCheck(k: Kit | null): { k3: string[]; left: string[]; carried: string[] } {
  if (!k) return { k3: [], left: [], carried: [] };
  const left = [k.climbing ? 'teknisi masih di atas tangga' : '', k.ladderAt ? 'tangga masih bersandar di tiang' : '', k.vflOn ? 'VFL masih tercolok dan menyala' : ''].filter(Boolean);
  const carried = [...k.has].filter(id => kitDef(id).kind !== 'bahan').map(id => kitDef(id).short);
  return { k3: [...new Set(k.k3)], left, carried };
}
