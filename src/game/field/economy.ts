// Field-work money and reputasi (pure functions, unit-tested in tests/field.test.ts).
// Fee ranges come from notes/research-grow.md §4.1 (templates.ts). Material unit prices are retail listings seen in
// Nov 2026 (DESIGN.md › Fase 1 lists the sources); they are rounded "perkiraan" values, not live prices.
// Star pay factors, denda and reputasi steps are game-design numbers (marked as such in DESIGN.md).
import type { Mat, Rep, Cust } from './types';

/** Rp per unit: RJ45 per piece, UTP Cat6 per metre, ready-made 1 m patch cord, entry-level Wi-Fi router, one 60 mm splice
 *  protection sleeve (Fase 3: retail packs of 100 listed at Rp13.000–25.000 in Nov 2026 → Rp250/pcs, the top of that range) */
export const PRICE: Mat = { rj45: 1_000, utp: 5_000, patch: 15_000, router: 180_000, sleeve: 250 };
export const MAT_LABEL: Record<keyof Mat, string> = { rj45: 'Konektor RJ45 Cat6', utp: 'Kabel UTP Cat6', patch: 'Patch cord Cat6 1 m (jadi)', router: 'Router Wi-Fi N300 (baru)', sleeve: 'Sleeve pelindung sambungan 60 mm' };
export const MAT_UNIT: Record<keyof Mat, string> = { rj45: 'pcs', utp: 'm', patch: 'pcs', router: 'unit', sleeve: 'pcs' };

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const round5k = (v: number) => Math.round(v / 5_000) * 5_000;
/** "Rp 125.000" */
export const rp = (v: number) => `${v < 0 ? '−' : ''}Rp ${Math.abs(Math.round(v)).toLocaleString('id-ID')}`;

/**
 * Fee for an order: random inside the research range, nudged toward the top by good reputasi with that customer type.
 * pos = 0.15 + 0.6·r + (rep − 50)/250, clamped to the range, rounded to Rp5.000 and kept inside [lo, hi].
 */
export function tarifFor(range: [number, number], rep: number, r: number) {
  const [lo, hi] = range;
  const pos = clamp(0.15 + 0.6 * r + (clamp(rep, 0, 100) - 50) / 250, 0, 1);
  return clamp(round5k(lo + (hi - lo) * pos), lo, hi);
}

/** share of the fee paid for 3 / 2 / 1 stars */
export const STAR_PAY: Record<number, number> = { 3: 1, 2: 0.85, 1: 0.6 };
/** denda for an accepted order that was dropped or not finished by the end of the day: 10 % of the fee */
export const DENDA_RATE = 0.1;
export const denda = (tarif: number) => round5k(tarif * DENDA_RATE);

/** material actually used, in Rp (UTP is billed per started half metre) */
export function materialCost(m: Mat) {
  return Math.round(m.rj45 * PRICE.rj45 + Math.ceil(m.utp * 2) / 2 * PRICE.utp + m.patch * PRICE.patch + m.router * PRICE.router + (m.sleeve ?? 0) * (PRICE.sleeve ?? 0));
}

/** what the technician receives for a closed order: fee × star factor, minus the material used (garansi pays no fee) */
export function payout(tarif: number, stars: number, m: Mat, garansi = false) {
  const jasa = garansi ? 0 : Math.round(tarif * (STAR_PAY[clamp(Math.round(stars), 1, 3)] ?? 0.6));
  const material = materialCost(m);
  return { jasa, material, net: jasa - material };
}

export type RepEvent = 'done3' | 'done2' | 'done1' | 'failed' | 'garansiOpen' | 'garansiDone' | 'garansiIgnored';
/** reputasi steps (design numbers) */
export const REP_STEP: Record<RepEvent, number> = { done3: 6, done2: 3, done1: -2, failed: -8, garansiOpen: -3, garansiDone: 2, garansiIgnored: -10 };
export const repEventForStars = (stars: number): RepEvent => (stars >= 3 ? 'done3' : stars === 2 ? 'done2' : 'done1');
/** reputasi with one customer type after an event, always 0..100 */
export function applyRep(rep: Rep, cust: Cust, ev: RepEvent): Rep {
  return { ...rep, [cust]: clamp(Math.round(rep[cust] + REP_STEP[ev]), 0, 100) };
}
/** below this a customer type stops calling (only garansi callbacks still come) */
export const REP_FLOOR = 20;
