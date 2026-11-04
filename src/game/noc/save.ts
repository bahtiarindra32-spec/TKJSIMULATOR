// Progress save (localStorage key kotaNusantara.noc.v1) and the technician's closing notes.
// Reading is defensive: an old or corrupt save from an earlier build must never break the game.
import { FAULTS } from './faults';
import { TEMPLATES } from './contracts';
import type { Note } from './types';

export interface DayRun {
  n: number;
  phase: number;
  xp: number;
  stars: number;
  jobs: number;
  sla: number;
}
export interface Save {
  v: 1;
  cert?: number;
  rj45?: number;
  rj45Used?: number;
  xp: number;
  shifts: number;
  closed: number;
  slaMet: number;
  seq: number;
  contracts: number;
  stars: number;
  days: number;
  streak: number;
  best: number;
  day: DayRun | null;
  seen: string[];
  mastery: Partial<Record<string, { ok: number; miss: number }>>;
}
export const KEY = 'kotaNusantara.noc.v1';
export const NOTES_KEY = 'kotaNusantara.notes.v1';
export function loadNotes(): Note[] {
  try {
    const o = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]');
    return Array.isArray(o)
      ? o
          .filter(n => n && typeof n.id === 'string' && typeof n.note === 'string')
          .map(n => ({ id: n.id, title: String(n.title ?? ''), note: n.note.slice(0, 800), t: Number(n.t) || 0 }))
          .slice(-30)
      : [];
  } catch {
    return [];
  }
}
export const fresh = (): Save => ({
  v: 1,
  xp: 0,
  shifts: 0,
  closed: 0,
  slaMet: 0,
  seq: 0,
  contracts: 0,
  stars: 0,
  days: 0,
  streak: 0,
  best: 0,
  day: null,
  seen: [],
  mastery: {},
});

/** read the progress save defensively: an old/corrupt save from an earlier build must never break the game */
export function loadSave(): Save {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return fresh();
  }
  if (!raw) return fresh();
  try {
    const o = JSON.parse(raw);
    const f = fresh();
    if (!o || typeof o !== 'object') throw new Error('bad');
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    for (const k of ['xp', 'shifts', 'closed', 'slaMet', 'seq', 'contracts', 'stars', 'days', 'streak', 'best'] as const) f[k] = num(o[k]);
    // a day in progress is not resumed after a reload (the network state it was built on is gone); it simply ends
    f.day = null;
    const known = new Set<string>([...Object.keys(FAULTS), ...Object.keys(TEMPLATES)]);
    f.seen = Array.isArray(o.seen) ? o.seen.filter((x: unknown) => typeof x === 'string' && known.has(x)) : [];
    if (o.mastery && typeof o.mastery === 'object')
      for (const [k, v] of Object.entries(o.mastery)) {
        const m = v as { ok?: unknown; miss?: unknown };
        if (known.has(k) && m && typeof m === 'object') f.mastery[k] = { ok: num(m.ok), miss: num(m.miss) };
      }
    return f;
  } catch {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return fresh();
  }
}
/** the save as stored: plain JSON (no Maps/Sets), so it survives a JSON round trip unchanged */
export function writeSave(s: Save, notes: Note[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    /* ignore (private mode / quota) */
  }
}
