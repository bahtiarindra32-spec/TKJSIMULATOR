// Fase 3 FTTH (chunk A): ONT optical state, so a later chunk can gate a customer's internet on the fibre.
// Grounded: ONU sensitivity −27 dBm (config) and overload −8 dBm [17]; colour bands research §2.3 (⚠ inferred combination).
// ⚠ inferred (research has no LED table): the common ONT front panel — PON green steady = registered, blinking = light but not
// registered; LOS red = no light / below sensitivity. Overload is reported as its own state with LOS blinking (⚠ inferred).
// Not simulated (research §2.5): OMCI, real OLT vendor activation; registration is a flag ("cukup daftarkan SN").
import { rxAt, rxBand, type RxBand } from './budget';
import { CONN, type FtthNet } from './model';

export type OntState = 'online' | 'unregistered' | 'los' | 'overload';
export type Led = 'off' | 'green' | 'green-blink' | 'red' | 'red-blink';
export interface OntStatus {
  customer: string; serial: string; state: OntState;
  rxDbm: number; band: RxBand;
  leds: { pon: Led; los: Led };
  /** the drop sits in another ODP port than the work order says (light may still be fine) — ⚠ inferred inventory check */
  portMismatch: boolean;
  /** internet may pass (state online) */
  internet: boolean;
  /** one line for a trouble ticket / ONT web page */
  reason: string;
}

export function ontStatus(net: FtthNet, cust: string): OntStatus {
  const c = net.customers[cust];
  const r = rxAt(net, cust, 1490);
  const cfg = net.cfg, rx = r.rxDbm, band = rxBand(net, rx);
  const portMismatch = c.port !== null && c.port !== c.assignedPort;
  let state: OntState, reason: string;
  if (!r.light) { state = 'los'; reason = `Tidak ada cahaya: ${r.stop?.label ?? 'jalur terputus'}`; }
  else if (rx < cfg.ontSensitivityDbm) { state = 'los'; reason = `Rx ${rx.toFixed(2)} dBm di bawah sensitivitas ${cfg.ontSensitivityDbm} dBm`; }
  else if (rx > cfg.ontOverloadDbm) { state = 'overload'; reason = `Rx ${rx.toFixed(2)} dBm di atas batas overload ${cfg.ontOverloadDbm} dBm`; }
  else if (!c.registered) { state = 'unregistered'; reason = `SN ${c.ontSerial} belum didaftarkan di OLT`; }
  else { state = 'online'; reason = band === 'green' ? `Rx ${rx.toFixed(2)} dBm normal` : `Rx ${rx.toFixed(2)} dBm (${band === 'yellow' ? 'kritis' : 'buruk'})`; }
  if (portMismatch) reason += ` · drop di port ${c.port}, seharusnya port ${c.assignedPort}`;
  const leds: OntStatus['leds'] =
    state === 'online' ? { pon: 'green', los: 'off' } :
    state === 'unregistered' ? { pon: 'green-blink', los: 'off' } :
    state === 'overload' ? { pon: 'off', los: 'red-blink' } :
    { pon: 'off', los: 'red' };
  return { customer: cust, serial: c.ontSerial, state, rxDbm: rx, band, leds, portMismatch, internet: state === 'online', reason };
}

export function registerOnt(net: FtthNet, cust: string, serial?: string): boolean {
  const c = net.customers[cust];
  if (serial !== undefined && serial.trim().toUpperCase() !== c.ontSerial.toUpperCase()) return false;
  c.registered = true; return true;
}

/** the faults on a customer's line, for a work order generator / the ticket check (deterministic) */
export function faultsOn(net: FtthNet, cust: string) {
  const c = net.customers[cust];
  const out: { kind: string; id: string; label: string }[] = [];
  const conns = [CONN.odf, c.port !== null ? CONN.odpPort(c.odp, c.port) : null, CONN.roset(cust), CONN.ont(cust)].filter((x): x is string => !!x);
  for (const id of conns) if (net.connectors[id]?.dirty) out.push({ kind: 'dirty', id, label: net.connectors[id].label });
  const spans = [net.feeder, net.odps[c.odp].distribution, c.drop, c.indoor];
  for (const s of Object.values(net.splices)) if (spans.includes(s.span) && s.type === 'fusion' && s.lossDb > net.cfg.fusionSpliceMaxDb + 1e-9) out.push({ kind: 'bad-splice', id: s.id, label: s.label });
  for (const b of Object.values(net.bends)) if (spans.includes(b.span) && b.radiusMm < net.cfg.bendSafeRadiusMm) out.push({ kind: 'macrobend', id: b.id, label: `tekukan ${b.radiusMm} mm` });
  for (const b of Object.values(net.breaks)) if (spans.includes(b.span)) out.push({ kind: 'break', id: b.id, label: `putus ${b.atM} m (${b.span})` });
  if (c.port === null) out.push({ kind: 'unplugged', id: cust, label: 'drop tidak terpasang' });
  else {
    if (!net.odps[c.odp].ports[c.port - 1].live) out.push({ kind: 'dead-port', id: CONN.odpPort(c.odp, c.port), label: `port ${c.port} mati` });
    if (c.port !== c.assignedPort) out.push({ kind: 'wrong-port', id: CONN.odpPort(c.odp, c.port), label: `port ${c.port} ≠ ${c.assignedPort}` });
  }
  if (!c.registered) out.push({ kind: 'unregistered', id: cust, label: 'SN belum terdaftar' });
  return out;
}

/** Hooks for the netsim (chunk B wires them). Defaults are no-ops, so nothing changes until a world binds an FTTH network. */
export const FTTH_HOOKS = {
  /** called by pollOnts when a customer's ONT state changes */
  statusChanged: (_cust: string, _now: OntStatus, _before: OntState | null): void => {},
};
const LAST = new WeakMap<FtthNet, Map<string, OntState>>();
/** recompute every ONT; fires FTTH_HOOKS.statusChanged for changed ones; returns all statuses */
export function pollOnts(net: FtthNet): OntStatus[] {
  let m = LAST.get(net); if (!m) { m = new Map(); LAST.set(net, m); }
  const out: OntStatus[] = [];
  for (const id of Object.keys(net.customers)) {
    const st = ontStatus(net, id), before = m.get(id) ?? null;
    if (before !== st.state) { m.set(id, st.state); FTTH_HOOKS.statusChanged(id, st, before); }
    out.push(st);
  }
  return out;
}
/** the gate a netsim adapter asks: may this customer's traffic pass the fibre right now? */
export const ontInternetOk = (net: FtthNet, cust: string) => ontStatus(net, cust).internet;
