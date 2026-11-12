// Fase 3 FTTH (chunk A): the passive optical network as plain, serialisable data, plus the path of one customer.
// Topology per research §2.1 [14][15][16]: OLT (STO) → ODF → feeder (Segmen A) → ODC (splitter stage 1) → distribution
// (Segmen B) → ODP (splitter 1:8 / 1:16, ports) → drop cable (Segmen C) → roset/OTP → indoor cable (Segmen D) → ONT.
// Max two splitter stages, so one feeder core serves ≤32 customers with 1:4 × 1:8 [16].
import { ftthConfig, bendLossDb, LAMBDAS, type FtthConfig, type Lambda, type SplitRatio } from './config';

export type SpanKind = 'feeder' | 'distribution' | 'drop' | 'indoor';
export interface Span { id: string; kind: SpanKind; lengthM: number }
export interface Connector {
  id: string; label: string; dirty: boolean;
  /** Fase 3 B2 ⚠ inferred: how much light this dirty end face costs (dB, replaces cfg.dirtyConnectorExtraDb). Research only says
   *  "kotor = loss naik"; a heavily contaminated face (dust + oil) is used by the field orders to push Rx below sensitivity. */
  dirtDb?: number;
}
export interface Splice { id: string; span: string; atM: number; lossDb: number; type: 'fusion' | 'mechanical'; label: string; sleeve: boolean }
export interface Bend {
  id: string; span: string; atM: number; radiusMm: number;
  /** Fase 3 B2 ⚠ inferred: full wraps at this radius (a patch cord coiled tight around a bundle); loss × turns. Default 1. */
  turns?: number;
}
export interface Break { id: string; span: string; atM: number }
export interface OdpPort {
  n: number;
  /** spliced to a splitter output; ⚠ inferred: a spare port of an ODP whose splitter is not fitted yet is "dead" (no light) */
  live: boolean;
  /** dust cap on (unused ports should keep it) */
  capped: boolean;
  /** the customer whose drop is plugged here */
  customer: string | null;
}
export interface Odp { id: string; label: string; ratio: 8 | 16; distribution: string; ports: OdpPort[] }
export interface Customer {
  id: string; label: string; odp: string;
  /** the port in the inventory (work order) */
  assignedPort: number;
  /** the port the drop really sits in (null = not plugged) */
  port: number | null;
  drop: string; indoor: string;
  ontSerial: string;
  /** SN registered on the OLT (research §2.5: "cukup daftarkan SN") */
  registered: boolean;
}
export interface FtthNet {
  cfg: FtthConfig;
  olt: { id: string; label: string; txDbm: number };
  feeder: string;
  odc: { id: string; label: string; ratio: SplitRatio };
  spans: Record<string, Span>;
  connectors: Record<string, Connector>;
  splices: Record<string, Splice>;
  bends: Record<string, Bend>;
  breaks: Record<string, Break>;
  odps: Record<string, Odp>;
  customers: Record<string, Customer>;
  seq: number;
}

/** connector ids are derived, so a port or a customer always finds its own */
export const CONN = {
  odf: 'odf',
  odpPort: (odp: string, n: number) => `${odp}:p${n}`,
  roset: (c: string) => `${c}:roset`,
  ont: (c: string) => `${c}:ont`,
};

export interface NetOpts { cfg?: Partial<FtthConfig>; oltTxDbm?: number; feederM?: number; odcRatio?: SplitRatio; feederJointsM?: number[] }

/** an empty network: OLT → ODF connector → feeder (with joint splices) → ODC splitter. Feeder defaults ⚠ design: 4 km, joints at 1.5 and 3 km. */
export function createFtth(o: NetOpts = {}): FtthNet {
  const cfg = ftthConfig(o.cfg);
  const feederM = o.feederM ?? 4000;
  const net: FtthNet = {
    cfg, olt: { id: 'OLT-1/1/1', label: 'OLT STO port PON 1/1/1', txDbm: o.oltTxDbm ?? cfg.oltTxDbm },
    feeder: 'feeder', odc: { id: 'ODC-01', label: 'ODC-01', ratio: o.odcRatio ?? 4 },
    spans: {}, connectors: {}, splices: {}, bends: {}, breaks: {}, odps: {}, customers: {}, seq: 0,
  };
  net.spans.feeder = { id: 'feeder', kind: 'feeder', lengthM: feederM };
  net.connectors[CONN.odf] = { id: CONN.odf, label: 'Konektor ODF (STO)', dirty: false };
  for (const at of o.feederJointsM ?? [1500, 3000]) addSplice(net, 'feeder', at, { label: `Joint feeder ${at} m` });
  addSplice(net, 'feeder', feederM, { label: 'Splice masuk ODC' });
  return net;
}

const nextId = (net: FtthNet, p: string) => `${p}${++net.seq}`;

export function addSplice(net: FtthNet, span: string, atM: number, o: { lossDb?: number; type?: 'fusion' | 'mechanical'; label?: string; id?: string; sleeve?: boolean } = {}): Splice {
  const type = o.type ?? 'fusion';
  const s: Splice = {
    id: o.id ?? nextId(net, 'sp'), span, atM, type, label: o.label ?? `Splice ${span} ${atM} m`, sleeve: o.sleeve ?? true,
    lossDb: o.lossDb ?? (type === 'fusion' ? net.cfg.fusionSpliceDb : net.cfg.mechanicalSpliceDb),
  };
  net.splices[s.id] = s;
  return s;
}

/** ODP with its distribution cable from the ODC. Every port starts capped; `livePorts` < ratio leaves the rest dead (⚠ inferred). */
export function addOdp(net: FtthNet, o: { id: string; ratio?: 8 | 16; distM: number; livePorts?: number; label?: string }): Odp {
  const ratio = o.ratio ?? 8, dist = `${o.id}:dist`;
  net.spans[dist] = { id: dist, kind: 'distribution', lengthM: o.distM };
  addSplice(net, dist, 0, { label: `Splice keluar ODC → ${o.id}` });
  addSplice(net, dist, o.distM, { label: `Splice masuk ${o.id}` });
  const live = o.livePorts ?? ratio;
  const odp: Odp = { id: o.id, label: o.label ?? o.id, ratio, distribution: dist, ports: [] };
  for (let n = 1; n <= ratio; n++) {
    odp.ports.push({ n, live: n <= live, capped: true, customer: null });
    net.connectors[CONN.odpPort(o.id, n)] = { id: CONN.odpPort(o.id, n), label: `${o.id} port ${n}`, dirty: false };
  }
  net.odps[o.id] = odp;
  return odp;
}

/** customer: drop from the ODP port to the roset (drop spliced to the roset pigtail), indoor patch cord to the ONT. Lengths ⚠ design. */
export function addCustomer(net: FtthNet, o: { id: string; odp: string; port: number; dropM?: number; indoorM?: number; label?: string; serial?: string; registered?: boolean }): Customer {
  const drop = `${o.id}:drop`, indoor = `${o.id}:indoor`;
  const dropM = o.dropM ?? 150;
  net.spans[drop] = { id: drop, kind: 'drop', lengthM: dropM };
  net.spans[indoor] = { id: indoor, kind: 'indoor', lengthM: o.indoorM ?? 10 };
  addSplice(net, drop, dropM, { label: `Splice drop di roset ${o.id}` });
  net.connectors[CONN.roset(o.id)] = { id: CONN.roset(o.id), label: `Roset ${o.id}`, dirty: false };
  net.connectors[CONN.ont(o.id)] = { id: CONN.ont(o.id), label: `Konektor ONT ${o.id}`, dirty: false };
  const c: Customer = {
    id: o.id, label: o.label ?? o.id, odp: o.odp, assignedPort: o.port, port: null, drop, indoor,
    ontSerial: o.serial ?? `ZTEG${(0x1000 + Object.keys(net.customers).length).toString(16).toUpperCase().padStart(8, '0')}`,
    registered: o.registered ?? true,
  };
  net.customers[o.id] = c;
  plugDrop(net, o.id, o.port, { cleaned: true });
  return c;
}

/** the default teaching network ⚠ design: feeder 4 km, ODC 1:4, ODP-A 1:8 at 800 m (6 live ports of 8), ODP-B 1:16 at 1.2 km, three houses */
export function demoFtth(o: NetOpts = {}): FtthNet {
  const net = createFtth(o);
  addOdp(net, { id: 'ODP-A', ratio: 8, distM: 800, livePorts: 6 });
  addOdp(net, { id: 'ODP-B', ratio: 16, distM: 1200 });
  addCustomer(net, { id: 'rumah1', odp: 'ODP-A', port: 1, dropM: 150, label: 'Rumah 1' });
  addCustomer(net, { id: 'rumah2', odp: 'ODP-A', port: 2, dropM: 250, label: 'Rumah 2' });
  addCustomer(net, { id: 'rumah3', odp: 'ODP-B', port: 1, dropM: 120, label: 'Rumah 3' });
  return net;
}

// ------------------------------------------------------------------------------------------------ faults & field actions
const need = <T>(x: T | undefined, what: string): T => { if (x === undefined) throw new Error(`ftth: ${what} tidak ada`); return x; };
const checkAt = (net: FtthNet, span: string, atM: number) => {
  const s = need(net.spans[span], `span ${span}`);
  if (!(atM >= 0 && atM <= s.lengthM)) throw new Error(`ftth: ${atM} m di luar span ${span} (0–${s.lengthM} m)`);
};

/** a tight bend (macrobend) on a span, e.g. a drop cable pinched at a door frame [26] */
export function addBend(net: FtthNet, span: string, atM: number, radiusMm: number, turns = 1): Bend {
  checkAt(net, span, atM);
  const b: Bend = { id: nextId(net, 'bend'), span, atM, radiusMm, ...(turns !== 1 ? { turns: Math.max(1, Math.round(turns)) } : {}) };
  net.bends[b.id] = b; return b;
}
/** straighten the cable: the bend is gone */
export function fixBend(net: FtthNet, id: string) { delete net.bends[id]; }

/** fibre broken at atM metres from the span start */
export function breakFiber(net: FtthNet, span: string, atM: number): Break {
  checkAt(net, span, atM);
  const b: Break = { id: nextId(net, 'brk'), span, atM };
  net.breaks[b.id] = b; return b;
}
/** repair a break by splicing it: the break becomes a splice with the given loss (e.g. from the splice minigame) */
export function repairBreak(net: FtthNet, id: string, lossDb = net.cfg.fusionSpliceDb, sleeve = true): Splice {
  const b = need(net.breaks[id], `putus ${id}`);
  delete net.breaks[id];
  return addSplice(net, b.span, b.atM, { lossDb, label: `Splice perbaikan ${b.atM} m`, sleeve });
}

export function setDirty(net: FtthNet, connId: string, dirty = true, dirtDb?: number) {
  const c = need(net.connectors[connId], `konektor ${connId}`);
  c.dirty = dirty;
  if (dirty && dirtDb !== undefined) c.dirtDb = dirtDb; else if (!dirty) delete c.dirtDb;
}
/** clean an end face (alcohol wipe / cleaner, research §2.4) */
export const cleanConnector = (net: FtthNet, connId: string) => setDirty(net, connId, false);
/** a splice whose loss is out of spec (default cfg.badSpliceDb) */
export function setSpliceLoss(net: FtthNet, id: string, lossDb = net.cfg.badSpliceDb) { need(net.splices[id], `splice ${id}`).lossDb = lossDb; }

/** put or take the dust cap of an ODP port. ⚠ inferred: an unused port left uncapped collects dust → its connector is dirty. */
export function setCap(net: FtthNet, odp: string, n: number, capped: boolean) {
  const p = portOf(net, odp, n);
  p.capped = capped;
  if (!capped && !p.customer) setDirty(net, CONN.odpPort(odp, n), true);
}
export function portOf(net: FtthNet, odp: string, n: number): OdpPort {
  const o = need(net.odps[odp], `ODP ${odp}`);
  return need(o.ports[n - 1], `${odp} port ${n}`);
}
/** plug a customer's drop into an ODP port. Unplug first if it sat elsewhere; the old port gets no cap (a later setCap puts it back).
 *  cleaned=false keeps whatever dust the port has. Throws when the port is taken. */
export function plugDrop(net: FtthNet, cust: string, n: number, o: { cleaned?: boolean } = {}) {
  const c = need(net.customers[cust], `pelanggan ${cust}`);
  const p = portOf(net, c.odp, n);
  if (p.customer && p.customer !== cust) throw new Error(`ftth: ${c.odp} port ${n} sudah dipakai ${p.customer}`);
  unplugDrop(net, cust);
  p.customer = cust; p.capped = false; c.port = n;
  if (o.cleaned) cleanConnector(net, CONN.odpPort(c.odp, n));
}
export function unplugDrop(net: FtthNet, cust: string) {
  const c = need(net.customers[cust], `pelanggan ${cust}`);
  if (c.port !== null) { const p = portOf(net, c.odp, c.port); p.customer = null; }
  c.port = null;
}

// ------------------------------------------------------------------------------------------------ the downstream path of one customer
export type ElKind = 'source' | 'connector' | 'splice' | 'fiber' | 'splitter' | 'bend' | 'break' | 'dead-port' | 'open' | 'ont';
export interface PathEl {
  kind: ElKind; id: string; label: string;
  /** metres from the OLT port where the element starts / ends (equal for point elements) */
  startM: number; endM: number;
  /** insertion loss per λ (dB). Infinity = no light passes */
  loss: Record<Lambda, number>;
  /** reflective event on an OTDR (connector, open end, break); splices, bends and splitters are non-reflective */
  reflective: boolean;
  span?: string;
  /** what is wrong with this element (for VFL/OTDR labels and the trouble ticket) */
  fault?: 'dirty' | 'bad-splice' | 'macrobend' | 'break' | 'dead-port' | 'open';
}
const flat = (x: number): Record<Lambda, number> => ({ 1310: x, 1490: x, 1550: x });
const per = (f: (l: Lambda) => number): Record<Lambda, number> => Object.fromEntries(LAMBDAS.map(l => [l, f(l)])) as Record<Lambda, number>;

function connEl(net: FtthNet, id: string, atM: number): PathEl {
  const c = net.connectors[id];
  const loss = net.cfg.connectorDb + (c.dirty ? (c.dirtDb ?? net.cfg.dirtyConnectorExtraDb) : 0);
  return { kind: 'connector', id, label: c.label, startM: atM, endM: atM, loss: flat(loss), reflective: true, fault: c.dirty ? 'dirty' : undefined };
}

/** fibre pieces and point events of a span, in order; stops after a break (returns stopped=true) */
function spanEls(net: FtthNet, spanId: string, startM: number, out: PathEl[], through = false): boolean {
  const span = net.spans[spanId], cfg = net.cfg;
  const perKm = span.kind === 'drop' || span.kind === 'indoor' ? cfg.dropDbPerKm : cfg.fiberDbPerKm;
  type Pt = { atM: number; el: (at: number) => PathEl; stop?: boolean };
  const pts: Pt[] = [];
  for (const s of Object.values(net.splices)) if (s.span === spanId) pts.push({ atM: s.atM, el: at => ({
    kind: 'splice', id: s.id, label: s.label, startM: at, endM: at, loss: flat(s.lossDb), reflective: false, span: spanId,
    fault: s.type === 'fusion' && s.lossDb > cfg.fusionSpliceMaxDb + 1e-9 ? 'bad-splice' : undefined,
  }) });
  for (const b of Object.values(net.bends)) if (b.span === spanId) pts.push({ atM: b.atM, el: at => ({
    kind: 'bend', id: b.id, label: `Tekukan r=${b.radiusMm} mm${(b.turns ?? 1) > 1 ? ` ×${b.turns} lilitan` : ''}`, startM: at, endM: at, loss: per(l => bendLossDb(cfg, b.radiusMm, l) * (b.turns ?? 1)), reflective: false, span: spanId,
    fault: bendLossDb(cfg, b.radiusMm, 1550) > 0 ? 'macrobend' : undefined,
  }) });
  for (const b of Object.values(net.breaks)) if (b.span === spanId) pts.push({ atM: b.atM, stop: true, el: at => ({
    kind: 'break', id: b.id, label: 'Fiber putus', startM: at, endM: at, loss: flat(Infinity), reflective: true, span: spanId, fault: 'break',
  }) });
  pts.sort((a, b) => a.atM - b.atM || (a.stop ? 1 : 0) - (b.stop ? 1 : 0));
  let pos = 0;
  const fiber = (to: number) => {
    if (to <= pos) return;
    out.push({ kind: 'fiber', id: `${spanId}@${pos}`, label: `Kabel ${span.kind} ${pos}–${to} m`, startM: startM + pos, endM: startM + to,
      loss: per(l => ((to - pos) / 1000) * perKm[l]), reflective: false, span: spanId });
    pos = to;
  };
  for (const p of pts) {
    fiber(p.atM);
    out.push(p.el(startM + p.atM));
    if (p.stop && !through) return true;
  }
  fiber(span.lengthM);
  return false;
}

/** every element from the OLT port to the ONT of a customer (downstream order). The path ends early at a break, a dead or empty port,
 *  unless through=true: then every physical element is listed (for instruments that look at the cable from the customer side). */
export function pathOf(net: FtthNet, cust: string, o: { through?: boolean } = {}): PathEl[] {
  const T = !!o.through;
  const c = need(net.customers[cust], `pelanggan ${cust}`);
  const odp = net.odps[c.odp], cfg = net.cfg;
  const out: PathEl[] = [{ kind: 'source', id: net.olt.id, label: net.olt.label, startM: 0, endM: 0, loss: flat(0), reflective: false }];
  let at = 0;
  out.push(connEl(net, CONN.odf, at));
  if (spanEls(net, net.feeder, at, out, T)) return out;
  at += net.spans[net.feeder].lengthM;
  out.push({ kind: 'splitter', id: net.odc.id, label: `${net.odc.label} splitter 1:${net.odc.ratio}`, startM: at, endM: at, loss: flat(cfg.splitterDb[net.odc.ratio]), reflective: false });
  if (spanEls(net, odp.distribution, at, out, T)) return out;
  at += net.spans[odp.distribution].lengthM;
  out.push({ kind: 'splitter', id: odp.id, label: `${odp.label} splitter 1:${odp.ratio}`, startM: at, endM: at, loss: flat(cfg.splitterDb[odp.ratio]), reflective: false });
  if (c.port === null) {
    out.push({ kind: 'open', id: `${odp.id}:open`, label: 'Drop tidak terpasang', startM: at, endM: at, loss: flat(Infinity), reflective: true, fault: 'open' });
    if (!T) return out;
  } else {
    const port = odp.ports[c.port - 1];
    if (!port.live) {
      out.push({ kind: 'dead-port', id: CONN.odpPort(odp.id, c.port), label: `${odp.id} port ${c.port} tidak tersambung splitter`, startM: at, endM: at, loss: flat(Infinity), reflective: true, fault: 'dead-port' });
      if (!T) return out;
    }
    out.push(connEl(net, CONN.odpPort(odp.id, c.port), at));
  }
  if (spanEls(net, c.drop, at, out, T)) return out;
  at += net.spans[c.drop].lengthM;
  out.push(connEl(net, CONN.roset(c.id), at));
  if (spanEls(net, c.indoor, at, out, T)) return out;
  at += net.spans[c.indoor].lengthM;
  out.push(connEl(net, CONN.ont(c.id), at));
  out.push({ kind: 'ont', id: `${c.id}:ONT`, label: `ONT ${c.ontSerial}`, startM: at, endM: at, loss: flat(0), reflective: true });
  return out;
}

/** metres from the OLT to the ONT end of the customer, by the cabled lengths (ignores breaks) */
export function lengthToOnt(net: FtthNet, cust: string): number {
  const c = net.customers[cust], o = net.odps[c.odp];
  return [net.feeder, o.distribution, c.drop, c.indoor].reduce((s, id) => s + net.spans[id].lengthM, 0);
}
/** metres from the OLT to the start of a span on this customer's path (null = span not on it) */
export function spanStartM(net: FtthNet, cust: string, span: string): number | null {
  const c = net.customers[cust], o = net.odps[c.odp];
  let at = 0;
  for (const id of [net.feeder, o.distribution, c.drop, c.indoor]) { if (id === span) return at; at += net.spans[id].lengthM; }
  return null;
}
