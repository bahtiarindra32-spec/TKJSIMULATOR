// Order board logic (pure, unit-tested): daily offers from the templates, reputasi gates, garansi scheduling and the
// end-of-day bookkeeping. The network side (injecting the fault when an order is accepted) lives in sim.ts.
import { FIELD_TPLS, TPL_IDS, CUSTOMER } from './templates';
import { tarifFor, applyRep, denda, REP_FLOOR } from './economy';
import { CUSTS, type Cust, type FieldTplId, type Order, type GaransiPlan, type GaransiReason, type Rep, type FieldSave, type Nota, noMat } from './types';

/** templates that can appear with this reputasi (customer type above the floor and the template's own minimum met) */
export function availableTpls(rep: Rep): FieldTplId[] {
  return TPL_IDS.filter(id => {
    const t = FIELD_TPLS[id];
    return rep[t.cust] >= REP_FLOOR && rep[t.cust] >= t.minRep;
  });
}

/** weight of a template on the board: its own weight × (0.5 + rep/100), so good reputasi brings more calls of that type */
export const tplWeight = (id: FieldTplId, rep: Rep) => FIELD_TPLS[id].weight * (0.5 + rep[FIELD_TPLS[id].cust] / 100);

export const orderId = (seq: number) => `NT-${String(seq).padStart(3, '0')}`;

/** one offer of a template (customer text picked with the same RNG, so it is reproducible from the seed) */
export function makeOrder(id: FieldTplId, day: number, seq: number, rep: Rep, r: () => number): Order {
  const t = FIELD_TPLS[id], c = CUSTOMER[t.cust];
  const seed = Math.floor(r() * 1e9);
  return {
    id: orderId(seq), tpl: id, cust: t.cust, kind: 'order', title: t.title, who: c.who, address: c.address,
    lines: [t.say[Math.floor(r() * t.say.length)], ...t.ask], tarif: tarifFor(t.tarif, rep[t.cust], r()), day, seed, status: 'offer',
  };
}

/** 2–4 offers for a work day, no template twice, weighted by reputasi; fewer when few templates are available */
export function genDay(day: number, rep: Rep, seq: number, r: () => number): Order[] {
  const pool = availableTpls(rep);
  const want = Math.min(pool.length, 2 + Math.floor(r() * 3));
  const out: Order[] = [];
  const left = [...pool];
  while (out.length < want && left.length) {
    const ws = left.map(id => tplWeight(id, rep));
    let x = r() * ws.reduce((a, b) => a + b, 0), k = 0;
    while (k < left.length - 1 && (x -= ws[k]) > 0) k++;
    out.push(makeOrder(left[k], day, seq + out.length, rep, r));
    left.splice(k, 1);
  }
  return out;
}

/** a weak check at closing schedules a garansi callback 1 or 2 days later */
export function planGaransi(o: Order, reason: GaransiReason, redo: Record<string, string | number>, closedDay: number, r: () => number): GaransiPlan {
  return { of: o.id, tpl: o.tpl, cust: o.cust, reason, showDay: closedDay + 1 + (r() < 0.5 ? 0 : 1), redo };
}

const GARANSI_TEXT: Record<GaransiReason, string> = {
  crimp: 'Kabel yang kemarin dipasang sudah putus-putus lagi. Katanya bergaransi?',
  config: 'Semalam listrik padam. Setelah menyala, masalah yang kemarin muncul lagi.',
  fiber: 'Internet mati lagi, lampu LOS di modem merah seperti kemarin. Katanya bergaransi?',
};
/** the callback order for a plan (unpaid; reputasi drops if it is not handled by `due`) */
export function garansiOrder(p: GaransiPlan, seq: number): Order {
  const t = FIELD_TPLS[p.tpl], c = CUSTOMER[p.cust];
  return {
    id: orderId(seq), tpl: p.tpl, cust: p.cust, kind: 'garansi', title: `GARANSI ${p.of}: ${t.title}`, who: c.who, address: c.address,
    lines: [GARANSI_TEXT[p.reason], 'Garansi: tidak dibayar. Kalau dibiarkan sampai lewat batas, reputasi turun.', ...t.ask.slice(-1)],
    tarif: 0, day: p.showDay, seed: Math.floor(p.showDay * 7919 + seq), status: 'offer', garansiOf: p.of, due: p.showDay + 1, reason: p.reason, redo: { ...p.redo },
  };
}

/**
 * Start a new work day on the save: plans whose day has come become garansi orders (customer reputasi −3 each), then the
 * day's normal offers are generated. Returns the new garansi orders.
 */
export function openDay(s: FieldSave, r: () => number): Order[] {
  s.gen = s.day;
  const due = s.garansi.filter(p => p.showDay <= s.day);
  s.garansi = s.garansi.filter(p => p.showDay > s.day);
  const g = due.map(p => {
    s.rep = applyRep(s.rep, p.cust, 'garansiOpen');
    return garansiOrder(p, ++s.seq);
  });
  const fresh = genDay(s.day, s.rep, s.seq + 1, r);
  s.seq += fresh.length;
  s.offers = [...s.offers.filter(o => o.kind === 'garansi' && o.status !== 'done'), ...g, ...fresh];
  return g;
}

/**
 * End the work day: an accepted order still open fails (denda, reputasi −8, nota recorded); a garansi past its due day is
 * ignored (reputasi −10, dropped); unaccepted normal offers expire. Then the day counter moves on and the next day opens.
 */
export function closeDay(s: FieldSave, r: () => number): { failed: Order[]; ignored: Order[]; garansi: Order[] } {
  const failed: Order[] = [], ignored: Order[] = [];
  for (const o of s.offers) {
    if (o.status === 'active') {
      o.status = 'failed';
      failed.push(o);
      const d = o.kind === 'garansi' ? 0 : denda(o.tarif);
      s.saldo -= d;
      s.failed++;
      s.rep = applyRep(s.rep, o.cust, 'failed');
      pushNota(s, { id: o.id, day: s.day, title: o.title, who: o.who, tarif: o.tarif, stars: 0, jasa: 0, mat: noMat(), material: 0, denda: d, net: -d, garansi: o.kind === 'garansi', failed: true });
    }
  }
  for (const o of s.offers)
    if (o.kind === 'garansi' && o.status === 'offer' && (o.due ?? 0) <= s.day) {
      ignored.push(o);
      s.rep = applyRep(s.rep, o.cust, 'garansiIgnored');
    }
  s.offers = s.offers.filter(o => o.kind === 'garansi' && o.status === 'offer' && !ignored.includes(o));
  s.day++;
  const garansi = openDay(s, r);
  return { failed, ignored, garansi };
}

export function pushNota(s: FieldSave, n: Nota) {
  s.nota.push(n);
  if (s.nota.length > 12) s.nota.splice(0, s.nota.length - 12);
}

/** reputasi line for the HUD: "R 50 · K 50 · W 50" */
export const repLine = (rep: Rep) => CUSTS.map(c => `${c[0].toUpperCase()} ${rep[c]}`).join(' · ');
export const custOf = (o: Order): Cust => o.cust;
