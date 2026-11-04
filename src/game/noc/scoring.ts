// Scoring of the NOC work board: stars per job (SLA, collateral damage, tidiness), job XP, ranks, daily bonus.
// Pure functions: the Noc class (board.ts) calls them when a job closes or a work day ends, tests call them directly.
import { FAULTS, type FaultId } from './faults';
import { TEMPLATES, type TplId } from './contracts';

/** Job XP is scaled so rank-ups take days of work, not a handful of jobs (Teknisi Junior around day 2, Senior around day 15). */
export const XP_RATE = 0.4;
export const RANKS = [
  { xp: 0, name: 'Magang' },
  { xp: 800, name: 'Teknisi Junior' },
  { xp: 2500, name: 'Teknisi' },
  { xp: 5000, name: 'Network Engineer' },
  { xp: 9000, name: 'Senior Network Engineer' },
];

/** highest rank whose XP threshold is reached (the real rank also needs the passed competency test) */
export function rankIndexForXp(xp: number) {
  let i = 0;
  RANKS.forEach((r, k) => {
    if (xp >= r.xp) i = k;
  });
  return i;
}

/** the SLA is met when the job closed within its time limit (seconds) */
export const slaMet = (age: number, sla: number) => age <= sla;

/** 3 stars minus one each for: SLA missed, another device broken, material wasted / switch config not saved. Never below 1. */
export function jobStars(o: { slaMet: boolean; collateral: number; wrong: number; swDirty: boolean }) {
  let stars = 3;
  if (!o.slaMet) stars--;
  if (o.collateral) stars--;
  if (o.wrong > 0 || o.swDirty) stars--;
  return Math.max(1, stars);
}

/** XP the board shows for a work order: its template points at the board's XP rate (the 2-star value, before the no-help bonus). */
export const offerXp = (tpl: TplId) => Math.round(TEMPLATES[tpl].xp * XP_RATE);

/** points of a job before the star multiplier */
export function jobBaseXp(j: { kind: 'ticket' | 'contract' | 'follow'; tpl: string; faults: FaultId[] }) {
  if (j.kind === 'contract') return TEMPLATES[j.tpl as TplId].xp;
  if (j.kind === 'follow') return 60;
  return 100 + (j.faults.some(f => FAULTS[f].rank > 0) ? 50 : 0) + (j.faults.length > 1 ? 60 : 0);
}

/**
 * XP for a closed job. Stars scale the base (★★★ ×1.3, ★★ ×1, ★ ×0.7), +20 when no help was asked, then XP_RATE.
 * The first-day tutorial is a guided job: it pays exactly what the board offered for it (offerXp('tutor')).
 */
export function jobXp(j: { kind: 'ticket' | 'contract' | 'follow'; tpl: string; faults: FaultId[]; stars: number; hint: boolean }) {
  if (j.kind === 'contract' && j.tpl === 'tutor') return offerXp('tutor');
  const mult = j.stars === 3 ? 1.3 : j.stars === 2 ? 1 : 0.7;
  return Math.round((jobBaseXp(j) * mult + (j.hint ? 0 : 20)) * XP_RATE);
}

/** end-of-day evaluation: good-day streak (average ≥ 2 stars) and the daily bonus XP */
export function dayEval(d: { n: number; jobs: number; stars: number; sla: number }, streak: number) {
  const allSla = d.jobs > 0 && d.sla === d.jobs;
  const avg = d.jobs ? d.stars / d.jobs : 0;
  const nextStreak = avg >= 2 ? streak + 1 : 0;
  const bonus = Math.round((allSla ? 60 + d.n * 10 : 0) + (avg >= 2.5 ? 40 : 0) + Math.min(5, nextStreak) * 15);
  return { allSla, avg, streak: nextStreak, bonus };
}
