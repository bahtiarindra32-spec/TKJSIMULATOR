// Class recap without a server: each finished Lab Praktik run gives a result code (one line of text) that the
// student sends to the teacher (chat, LMS, paper). The teacher pastes all codes at the teacher desk and gets
// one table + CSV. The checksum catches typos and casual edits; it is not a signature, because the game runs
// fully in the student's browser (stated on the recap sheet).
import { LAB_STEPS, type LabStepId } from './lab';

export const PREDIKAT = ['Sangat Kompeten', 'Kompeten', 'Cukup Kompeten', 'Belum Kompeten'] as const;
export interface ResultStep { step: LabStepId; got: number; of: number; done: boolean }
export interface ResultData { sheet: string; name: string; desk: number; nilai: number; predikat: typeof PREDIKAT[number]; durSec: number; overtime: boolean; when: number; steps: ResultStep[] }

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36).padStart(7, '0').slice(-6); };
const b64u = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))));
const IDS = LAB_STEPS.map(s => s.id as LabStepId);

export function encodeResult(r: ResultData): string {
  const st = r.steps.map(s => `${IDS.indexOf(s.step)}:${s.got}/${s.of}${s.done ? '' : '!'}`).join(',');
  const body = [r.name.replace(/\|/g, '/').trim().slice(0, 48), r.desk, r.nilai, PREDIKAT.indexOf(r.predikat), r.durSec, r.overtime ? 1 : 0, Math.floor(r.when / 60000), st].join('|');
  const p = b64u(body);
  return `KN1.${r.sheet}.${p}.${fnv(`${r.sheet}.${p}`)}`;
}
export const RESULT_RE = /KN1\.[0-9A-Z]{6,7}\.[A-Za-z0-9_-]+\.[0-9a-z]{6}/g;
export function decodeResult(code: string): ResultData | null {
  const m = /^KN1\.([0-9A-Z]{6,7})\.([A-Za-z0-9_-]+)\.([0-9a-z]{6})$/.exec(code.trim()); if (!m) return null;
  if (fnv(`${m[1]}.${m[2]}`) !== m[3]) return null;
  let body: string; try { body = unb64u(m[2]); } catch { return null; }
  const f = body.split('|'); if (f.length !== 8) return null;
  const steps: ResultStep[] = [];
  for (const part of f[7] ? f[7].split(',') : []) {
    const x = /^(\d+):(\d+)\/(\d+)(!?)$/.exec(part); if (!x || !IDS[+x[1]]) return null;
    steps.push({ step: IDS[+x[1]], got: +x[2], of: +x[3], done: !x[4] });
  }
  const pi = +f[3]; if (!PREDIKAT[pi]) return null;
  return { sheet: m[1], name: f[0], desk: +f[1], nilai: +f[2], predikat: PREDIKAT[pi], durSec: +f[4], overtime: f[5] === '1', when: +f[6] * 60000, steps };
}
export interface Recap { rows: ResultData[]; bad: number; dup: number; sheets: string[] }
/** every result code found in pasted text; one row per student name (the newest attempt wins) */
export function readRecap(text: string, sheet = ''): Recap {
  const found = text.match(RESULT_RE) ?? [];
  const tokens = text.split(/\s+/).filter(t => t.startsWith('KN1.')).length;
  let bad = Math.max(0, tokens - found.length), dup = 0;
  const by = new Map<string, ResultData>();
  for (const c of found) {
    const r = decodeResult(c); if (!r) { bad++; continue; }
    if (sheet && r.sheet !== sheet) continue;
    const k = r.name.trim().toLowerCase(); const prev = by.get(k);
    if (prev) { dup++; if (prev.when > r.when) continue; }
    by.set(k, r);
  }
  const rows = [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  return { rows, bad, dup, sheets: [...new Set(rows.map(r => r.sheet))] };
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** one row per student; a column per step (checkpoints met / total); semicolons for Excel in the Indonesian locale */
export function recapCsv(rc: Recap): string {
  const steps = IDS.filter(id => rc.rows.some(r => r.steps.some(s => s.step === id)));
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ['No', 'Nama', 'Kode jobsheet', 'Meja', 'Nilai', 'Predikat', 'Durasi', 'Lewat waktu', ...steps.map(id => LAB_STEPS.find(x => x.id === id)!.name)];
  const lines = rc.rows.map((r, i) => [i + 1, r.name, r.sheet, r.desk, r.nilai, r.predikat, mmss(r.durSec), r.overtime ? 'ya' : 'tidak', ...steps.map(id => { const s = r.steps.find(x => x.step === id); return s ? `${s.got}/${s.of}${s.done ? '' : ' (belum tuntas)'}` : '-'; })]);
  return '\ufeff' + [head, ...lines].map(l => l.map(q).join(';')).join('\r\n');
}
export { mmss };
