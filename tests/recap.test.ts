import { describe, it, expect } from 'vitest';
import { encodeResult, decodeResult, readRecap, recapCsv, type ResultData } from '../src/game/recap';

const base: ResultData = { sheet: '70344AQ', name: 'Rizky Pratama', desk: 8, nilai: 96, predikat: 'Sangat Kompeten', durSec: 1530, overtime: false, when: 1793680000000, steps: [{ step: 'vlsm', got: 8, of: 8, done: true }, { step: 'acl', got: 3, of: 5, done: false }] };
describe('class recap codes', () => {
  it('round-trips, including names with spaces and accents', () => {
    const c = encodeResult({ ...base, name: 'Siti Nur’aini' }); const r = decodeResult(c)!;
    expect(r.name).toBe('Siti Nur’aini'); expect(r.steps).toEqual(base.steps); expect(r.nilai).toBe(96); expect(r.sheet).toBe('70344AQ');
  });
  it('rejects an edited score', () => {
    const c = encodeResult(base); const [k, s, p, h] = c.split('.');
    const forged = atob(p.replace(/-/g, '+').replace(/_/g, '/')).replace('|96|', '|100|');
    expect(decodeResult(`${k}.${s}.${btoa(forged).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${h}`)).toBeNull();
  });
  it('reads a pasted chat, keeps the newest attempt per name, counts broken codes', () => {
    const a = encodeResult(base), b = encodeResult({ ...base, nilai: 98, when: base.when + 60000 }), c = encodeResult({ ...base, name: 'Budi', nilai: 55, predikat: 'Belum Kompeten' });
    const chat = `[08.01] Rizky: ${a}\n[08.05] Budi: ini pak ${c}\n[08.09] Rizky: ulang ${b}\nKN1.70344AQ.rusak.abcdef`;
    const rc = readRecap(chat);
    expect(rc.rows.map(r => r.name)).toEqual(['Budi', 'Rizky Pratama']); expect(rc.rows[1].nilai).toBe(98); expect(rc.dup).toBe(1); expect(rc.bad).toBe(1);
    const csv = recapCsv(rc); expect(csv.split('\r\n')).toHaveLength(3); expect(csv).toContain('"3/5 (belum tuntas)"');
  });
});
