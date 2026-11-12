// Fase 3 FTTH (chunk A): loss budget and received power. Rx = Tx − Σ element loss (research §2.3 example calc).
// Loss is the same in both directions, so the upstream (ONT 1310 nm → OLT) uses the same sum with the ONT Tx.
import { round2, type Lambda } from './config';
import { pathOf, type FtthNet, type PathEl } from './model';

export interface LossItem { id: string; kind: PathEl['kind']; label: string; db: number; fault?: PathEl['fault'] }
export interface RxResult {
  lambda: Lambda;
  /** false = no light reaches the ONT (break, dead port, drop not plugged) */
  light: boolean;
  /** ODN loss OLT port → ONT (dB); Infinity when there is no light */
  lossDb: number;
  /** received power at the ONT (dBm); -Infinity when there is no light */
  rxDbm: number;
  items: LossItem[];
  /** the element that stops the light, if any */
  stop?: PathEl;
}

export function lossItems(path: PathEl[], l: Lambda): LossItem[] {
  return path.filter(e => e.kind !== 'source' && e.kind !== 'ont').map(e => ({ id: e.id, kind: e.kind, label: e.label, db: e.loss[l], fault: e.fault }));
}

/** downstream power at the ONT for λ (the OLT sends 1490 for data; other λ use the same Tx so a lesson can compare windows) */
export function rxAt(net: FtthNet, cust: string, l: Lambda = 1490, txDbm = net.olt.txDbm): RxResult {
  const path = pathOf(net, cust);
  const items = lossItems(path, l);
  const stop = path.find(e => !Number.isFinite(e.loss[l]));
  const reached = path[path.length - 1].kind === 'ont';
  if (stop || !reached) return { lambda: l, light: false, lossDb: Infinity, rxDbm: -Infinity, items, stop };
  const loss = items.reduce((s, i) => s + i.db, 0);
  return { lambda: l, light: true, lossDb: round2(loss), rxDbm: round2(txDbm - loss), items };
}
export const rxAll = (net: FtthNet, cust: string) => ({ 1310: rxAt(net, cust, 1310), 1490: rxAt(net, cust, 1490), 1550: rxAt(net, cust, 1550) });

/** upstream: the ONT 1310 nm laser as received at the OLT port (dBm). ⚠ The research gives no OLT receiver threshold, so it is not graded. */
export function upstreamRx(net: FtthNet, cust: string, ontTxDbm = net.cfg.ontTxDbm): number {
  const r = rxAt(net, cust, 1310, ontTxDbm);
  return r.light ? r.rxDbm : -Infinity;
}

export type BudgetVerdict = 'under' | 'ok' | 'over' | 'no-light';
/** class B+ ODN window 13–28 dB [17]: under = too little loss (ONT may overload), over = out of budget */
export function budgetCheck(net: FtthNet, lossDb: number): BudgetVerdict {
  if (!Number.isFinite(lossDb)) return 'no-light';
  if (lossDb < net.cfg.budgetMinDb) return 'under';
  if (lossDb > net.cfg.budgetMaxDb) return 'over';
  return 'ok';
}
/** dB left before the class B+ max (negative = over) */
export const marginDb = (net: FtthNet, lossDb: number) => round2(net.cfg.budgetMaxDb - lossDb);

export type RxBand = 'green' | 'yellow' | 'red';
/** colour of an ONT Rx: green −13…−24, yellow −24…sensitivity and −8…−13, red below sensitivity or above overload (⚠ inferred bands, §2.3) */
export function rxBand(net: FtthNet, rxDbm: number): RxBand {
  const c = net.cfg;
  if (!Number.isFinite(rxDbm) || rxDbm < c.ontSensitivityDbm || rxDbm > c.ontOverloadDbm) return 'red';
  if (rxDbm <= c.greenHiDbm && rxDbm >= c.greenLoDbm) return 'green';
  return 'yellow';
}
/** inside the ONU window overload…sensitivity (−8…−27 by default) */
export const rxInSpec = (net: FtthNet, rxDbm: number) => Number.isFinite(rxDbm) && rxDbm >= net.cfg.ontSensitivityDbm && rxDbm <= net.cfg.ontOverloadDbm;

/** the planning table a student fills in (research §2.3): count per element type and the total at λ */
export function budgetTable(net: FtthNet, cust: string, l: Lambda = 1490) {
  const r = rxAt(net, cust, l);
  const sum = (k: PathEl['kind']) => round2(r.items.filter(i => i.kind === k).reduce((s, i) => s + i.db, 0));
  const count = (k: PathEl['kind']) => r.items.filter(i => i.kind === k).length;
  return {
    txDbm: net.olt.txDbm, fiberDb: sum('fiber'), splitterDb: sum('splitter'), connectors: count('connector'), connectorDb: sum('connector'),
    splices: count('splice'), spliceDb: sum('splice'), bendDb: sum('bend'), lossDb: r.lossDb, rxDbm: r.rxDbm, verdict: budgetCheck(net, r.lossDb),
  };
}
