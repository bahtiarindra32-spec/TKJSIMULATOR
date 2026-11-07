// Field-work save (localStorage key kotaNusantara.field.v1). Reading is defensive and migrates older shapes:
//  - v0 (pre-release draft: no `v`, `rep` a single number, `money` instead of `saldo`) → v1
//  - unknown future versions or corrupt JSON → a fresh save (never a crash)
// An order that was in progress when the page closed goes back on the board as an offer: the network state it was
// injected into is gone after a reload, so it is not resumed and not punished.
import { FIELD_TPLS } from './templates';
import { CUSTS, type FieldSave, type Order, type GaransiPlan, type Nota, type Rep, noMat } from './types';
import { clamp } from './economy';

export const FIELD_KEY = 'kotaNusantara.field.v1';
export const START_REP = 50;

export const freshField = (): FieldSave => ({
  v: 1, unlocked: false, told: false, legalSeen: false, saldo: 0, rep: { rumah: START_REP, kos: START_REP, warnet: START_REP },
  day: 1, gen: 0, seq: 0, done: 0, failed: 0, offers: [], garansi: [], nota: [],
});

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const int0 = (v: unknown, d = 0) => Math.max(0, Math.floor(num(v, d)));
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isTpl = (v: unknown): v is keyof typeof FIELD_TPLS => typeof v === 'string' && v in FIELD_TPLS;

function readRep(v: unknown): Rep {
  const r = { rumah: START_REP, kos: START_REP, warnet: START_REP };
  if (typeof v === 'number') for (const c of CUSTS) r[c] = clamp(Math.round(num(v, START_REP)), 0, 100);
  else if (v && typeof v === 'object') for (const c of CUSTS) r[c] = clamp(Math.round(num((v as Record<string, unknown>)[c], START_REP)), 0, 100);
  return r;
}
function readOrder(o: unknown): Order | null {
  if (!o || typeof o !== 'object') return null;
  const x = o as Record<string, unknown>;
  if (!isTpl(x.tpl) || typeof x.id !== 'string') return null;
  const t = FIELD_TPLS[x.tpl];
  const kind = x.kind === 'garansi' ? 'garansi' : 'order';
  const status = x.status === 'done' || x.status === 'failed' ? x.status : 'offer';   // 'active' → back on the board
  const out: Order = {
    id: x.id, tpl: x.tpl, cust: t.cust, kind, title: str(x.title) || t.title, who: str(x.who), address: str(x.address),
    lines: Array.isArray(x.lines) ? x.lines.filter((l): l is string => typeof l === 'string').slice(0, 8) : [],
    tarif: kind === 'garansi' ? 0 : clamp(int0(x.tarif), t.tarif[0], t.tarif[1]), day: int0(x.day, 1), seed: int0(x.seed), status,
  };
  if (kind === 'garansi') {
    out.garansiOf = str(x.garansiOf);
    out.due = int0(x.due);
    out.reason = x.reason === 'config' ? 'config' : 'crimp';
    out.redo = readRedo(x.redo);
  }
  return out;
}
function readRedo(v: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) if (typeof val === 'string' || (typeof val === 'number' && Number.isFinite(val))) out[k] = val;
  return out;
}
function readPlan(v: unknown): GaransiPlan | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  if (!isTpl(x.tpl)) return null;
  return { of: str(x.of), tpl: x.tpl, cust: FIELD_TPLS[x.tpl].cust, reason: x.reason === 'config' ? 'config' : 'crimp', showDay: int0(x.showDay, 1), redo: readRedo(x.redo) };
}
function readNota(v: unknown): Nota | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  const m = (x.mat && typeof x.mat === 'object' ? x.mat : {}) as Record<string, unknown>;
  return {
    id: str(x.id), day: int0(x.day), title: str(x.title), who: str(x.who), tarif: int0(x.tarif), stars: clamp(int0(x.stars), 0, 3), jasa: int0(x.jasa),
    mat: { ...noMat(), rj45: int0(m.rj45), utp: Math.max(0, num(m.utp)), patch: int0(m.patch), router: int0(m.router) },
    material: int0(x.material), denda: int0(x.denda), net: Math.round(num(x.net)), garansi: !!x.garansi, failed: !!x.failed,
  };
}

/** parse a stored save (string from localStorage), migrating older shapes; never throws */
export function parseField(raw: string | null): FieldSave {
  if (!raw) return freshField();
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return freshField();
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return freshField();
  const v = o.v === undefined ? 0 : o.v;
  if (v !== 0 && v !== 1) return freshField();          // a save from a newer build: do not guess
  const f = freshField();
  f.unlocked = !!o.unlocked;
  f.told = !!o.told;
  f.legalSeen = !!o.legalSeen;
  f.saldo = Math.round(num(v === 0 ? (o.saldo ?? o.money) : o.saldo));
  f.rep = readRep(o.rep);
  f.day = Math.max(1, int0(o.day, 1));
  f.gen = Math.min(f.day, int0(o.gen));
  f.seq = int0(o.seq);
  f.done = int0(o.done);
  f.failed = int0(o.failed);
  f.offers = (Array.isArray(o.offers) ? o.offers : []).map(readOrder).filter((x): x is Order => !!x && x.status === 'offer');
  f.garansi = (Array.isArray(o.garansi) ? o.garansi : []).map(readPlan).filter((x): x is GaransiPlan => !!x);
  f.nota = (Array.isArray(o.nota) ? o.nota : []).map(readNota).filter((x): x is Nota => !!x).slice(-12);
  // ids handed out later must not collide with the ones still on the board
  for (const x of f.offers) f.seq = Math.max(f.seq, int0(Number(x.id.replace(/\D/g, ''))));
  return f;
}
export function loadField(): FieldSave {
  try {
    return parseField(localStorage.getItem(FIELD_KEY));
  } catch {
    return freshField();
  }
}
export function writeField(s: FieldSave) {
  try {
    localStorage.setItem(FIELD_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota */
  }
}
