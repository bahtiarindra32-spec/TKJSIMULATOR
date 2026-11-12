// Fase 3 FTTH (chunk A): field instruments, all deterministic from the model (research §2.4 [29]).
// OPM (+ light source) = power / insertion loss; VFL = red laser that leaks out at breaks, tight bends and bad joints within a few km;
// OTDR = list of events (distance, loss, reflective or not) and the end of the fibre.
// Not simulated (research §2.5): real optical physics, OTDR ghosts, pulse-width maths. Through a splitter the real OTDR trace is the
// overlap of every branch; here the trace follows only the chosen customer's branch (⚠ simplification).
import { round2, type Lambda } from './config';
import { pathOf, CONN, type FtthNet, type PathEl } from './model';

// ------------------------------------------------------------------------------------------------ OPM
/** where the meter is plugged: the ODP port (drop unplugged, meter on the port), the roset, or the ONT end of the patch cord */
export type OpmPoint = 'odp-port' | 'roset' | 'ont';
export interface OpmReading { lambda: Lambda; point: OpmPoint; dbm: number | null; display: string }

/** index of the connector element where the meter sits on a downstream path (-1 = not on the path) */
function pointIndex(net: FtthNet, cust: string, path: PathEl[], p: OpmPoint): number {
  const c = net.customers[cust];
  if (p === 'odp-port') {
    if (c.port === null) return -1;
    const id = CONN.odpPort(c.odp, c.port);
    // a dead port has no light behind it; its connector element is not on the stopped path → the meter reads LO
    return path.findIndex(e => e.kind === 'connector' && e.id === id);
  }
  const id = p === 'roset' ? CONN.roset(cust) : CONN.ont(cust);
  return path.findIndex(e => e.kind === 'connector' && e.id === id);
}

/**
 * OPM reading at a point. source 'pon' = the live OLT signal: only 1490 nm is sent downstream for data (1550 video overlay is not
 * modelled, 1310 is the ONT's upstream), so other λ read LO. source 'ls' = a light source at the ODF sending cfg.lightSourceDbm at λ.
 * A reading below cfg.opmFloorDbm (⚠ inferred) shows "LO". The mated connector at the meter counts (it is in the path element).
 */
export function opmRead(net: FtthNet, cust: string, point: OpmPoint, l: Lambda = 1490, source: 'pon' | 'ls' = 'pon'): OpmReading {
  const LO = { lambda: l, point, dbm: null, display: 'LO' };
  if (source === 'pon' && l !== 1490) return LO;
  const path = pathOf(net, cust);
  const i = pointIndex(net, cust, path, point);
  if (i < 0) return LO;
  let loss = 0;
  for (let k = 1; k <= i; k++) loss += path[k].loss[l];
  const tx = source === 'pon' ? net.olt.txDbm : net.cfg.lightSourceDbm;
  const dbm = tx - loss;
  if (!Number.isFinite(dbm) || dbm < net.cfg.opmFloorDbm) return LO;
  const v = round2(dbm);
  return { lambda: l, point, dbm: v, display: `${v.toFixed(2)} dBm` };
}

/** insertion loss test (LSPM/OLTS [29]): light source at the ODF, OPM at the ONT end → dB (null = no light) */
export function lossTest(net: FtthNet, cust: string, l: Lambda): number | null {
  const r = opmRead(net, cust, 'ont', l, 'ls');
  return r.dbm === null ? null : round2(net.cfg.lightSourceDbm - r.dbm);
}

// ------------------------------------------------------------------------------------------------ VFL
/** where the red laser is injected: at the ODP port (shines down the drop toward the house), at the roset or the ONT end (shines back up) */
export type VflPoint = 'odp-port' | 'roset' | 'ont';
export interface VflGlow {
  kind: 'break' | 'macrobend' | 'dirty' | 'bad-splice' | 'open-end';
  id: string; label: string;
  /** metres from the injection point / from the OLT */
  distanceM: number; atM: number;
  /** within cfg.vflRangeM ("beberapa km" [29], ⚠ 5 km) */
  visible: boolean;
}
export interface VflResult { from: VflPoint; glows: VflGlow[]; visible: VflGlow[]; reachedEnd: boolean }

/**
 * Red light leaks at a break (bright, light stops there), a bend under the safe radius, a dirty connector and (⚠ inferred) a bad splice.
 * The laser is followed only on the customer side of the ODP (drop + indoor); going up, it stops at the ODP splitter (⚠ simplification).
 */
export function vfl(net: FtthNet, cust: string, from: VflPoint): VflResult {
  const c = net.customers[cust];
  const full = pathOf(net, cust, { through: true });
  const sideStart = full.findIndex(e => (e.kind === 'splitter' && e.id === c.odp));
  const side = full.slice(sideStart + 1); // dead-port/open marker, port connector, drop…, roset, indoor…, ONT connector, ONT
  const idx = (id: string) => side.findIndex(e => e.kind === 'connector' && e.id === id);
  let order: PathEl[]; let injM: number;
  if (from === 'odp-port') {
    if (c.port === null) return { from, glows: [], visible: [], reachedEnd: false }; // nothing to plug the VFL into
    const i = idx(CONN.odpPort(c.odp, c.port));
    order = side.slice(i + 1); injM = side[i].startM;
  } else {
    const i = idx(from === 'roset' ? CONN.roset(cust) : CONN.ont(cust));
    order = side.slice(0, from === 'roset' ? i : i + 1).reverse(); injM = side[i].startM;
    if (from === 'ont') order = order.slice(1); // skip the ONT connector itself (the VFL is plugged into it)
  }
  const glows: VflGlow[] = [];
  const glow = (e: PathEl, kind: VflGlow['kind']) => {
    const d = round2(Math.abs(e.startM - injM));
    glows.push({ kind, id: e.id, label: e.label, distanceM: d, atM: e.startM, visible: d <= net.cfg.vflRangeM });
  };
  let reachedEnd = true;
  for (const e of order) {
    if (e.kind === 'break') { glow(e, 'break'); reachedEnd = false; break; }
    if (e.kind === 'open' || e.kind === 'dead-port') { glow(e, 'open-end'); reachedEnd = false; break; }
    if (e.fault === 'macrobend') glow(e, 'macrobend');
    else if (e.fault === 'dirty') glow(e, 'dirty');
    else if (e.fault === 'bad-splice') glow(e, 'bad-splice');
  }
  return { from, glows, visible: glows.filter(g => g.visible), reachedEnd };
}

// ------------------------------------------------------------------------------------------------ OTDR
export type OtdrType = 'reflective' | 'non-reflective' | 'end';
export interface OtdrEvent { distanceM: number; lossDb: number; type: OtdrType; label: string; ids: string[]; kind: PathEl['kind'] }
export interface OtdrTrace {
  lambda: Lambda; launch: 'olt' | 'odp-port'; deadZoneM: number;
  events: OtdrEvent[];
  /** events too close to the launch connector to be seen */
  inDeadZone: OtdrEvent[];
  /** distance of the end of the fibre (break / open end / ONT connector) from the launch; null = beyond range */
  endM: number | null;
  /** relative level (dB, 0 at launch, decreasing) at each element boundary, for drawing the trace */
  points: { m: number; db: number }[];
  totalLossDb: number;
}

/**
 * OTDR shot from the OLT (ODF) or from the ODP port toward the ONT, at 1310/1550 (1490 also allowed).
 * ⚠ inferred dead-zone model (one number, cfg.otdrDeadZoneM): events nearer than it to the launch are hidden; events nearer than it
 * to the previous event are not resolved and merge into it (losses add; reflective wins over non-reflective, end wins over both). Reflectance is given only as a type, no dB values (research gives none).
 */
export function otdr(net: FtthNet, cust: string, o: { lambda?: Lambda; launch?: 'olt' | 'odp-port'; deadZoneM?: number; rangeM?: number } = {}): OtdrTrace {
  const l = o.lambda ?? 1550, launch = o.launch ?? 'olt';
  const dz = o.deadZoneM ?? net.cfg.otdrDeadZoneM, range = o.rangeM ?? net.cfg.otdrRangeM;
  const c = net.customers[cust];
  let path = pathOf(net, cust);
  if (launch === 'odp-port') {
    if (c.port === null) return { lambda: l, launch, deadZoneM: dz, events: [], inDeadZone: [], endM: null, points: [{ m: 0, db: 0 }], totalLossDb: 0 };
    const full = pathOf(net, cust, { through: true });
    const i = full.findIndex(e => e.kind === 'connector' && e.id === CONN.odpPort(c.odp, c.port!));
    path = full.slice(i);
    const b = path.findIndex(e => e.kind === 'break');
    if (b >= 0) path = path.slice(0, b + 1);
  } else {
    path = path.slice(1); // drop the source element; the ODF connector is the launch point
  }
  const zero = path[0]?.startM ?? 0;
  const raw: OtdrEvent[] = [];
  const points: { m: number; db: number }[] = [{ m: 0, db: 0 }];
  let level = 0, endM: number | null = null;
  for (let k = 1; k < path.length; k++) {
    const e = path[k], d = round2(e.startM - zero);
    if (d > range) break;
    if (e.kind === 'fiber') { level -= e.loss[l]; points.push({ m: round2(e.endM - zero), db: round2(level) }); continue; }
    const end = !Number.isFinite(e.loss[l]) || e.kind === 'ont';
    if (end) {
      raw.push({ distanceM: d, lossDb: 0, type: 'end', label: e.kind === 'ont' ? 'Akhir fiber (konektor ONT)' : `Akhir fiber: ${e.label}`, ids: [e.id], kind: e.kind });
      endM = d; break;
    }
    if (e.loss[l] === 0 && e.kind === 'bend') continue; // a bend above the safe radius is invisible
    raw.push({ distanceM: d, lossDb: round2(e.loss[l]), type: e.reflective ? 'reflective' : 'non-reflective', label: e.label, ids: [e.id], kind: e.kind });
    level -= e.loss[l]; points.push({ m: d, db: round2(level) });
  }
  // the ONT connector + ONT end become one end event (merge rule below)
  const inDeadZone: OtdrEvent[] = [], events: OtdrEvent[] = [];
  for (const ev of raw) {
    if (ev.distanceM < dz) { inDeadZone.push(ev); continue; }
    const prev = events[events.length - 1];
    if (prev && ev.distanceM - prev.distanceM < dz) {
      prev.lossDb = round2(prev.lossDb + ev.lossDb); prev.ids.push(...ev.ids); prev.label += ` + ${ev.label}`;
      if (ev.type === 'end') prev.type = 'end'; else if (ev.type === 'reflective' && prev.type === 'non-reflective') prev.type = 'reflective';
      continue;
    }
    events.push({ ...ev, ids: [...ev.ids] });
  }
  return { lambda: l, launch, deadZoneM: dz, events, inDeadZone, endM, points, totalLossDb: round2(-level) };
}

/** compare two shots: events whose loss at 1550 is much higher than at 1310 are bend suspects (⚠ inferred threshold 0.5 dB) */
export function bendSuspects(t1310: OtdrTrace, t1550: OtdrTrace, minDiffDb = 0.5): OtdrEvent[] {
  return t1550.events.filter(e => {
    const o = t1310.events.find(x => Math.abs(x.distanceM - e.distanceM) < 1);
    return e.type === 'non-reflective' && e.lossDb - (o?.lossDb ?? 0) >= minDiffDb;
  });
}
