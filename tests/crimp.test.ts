import { describe, it, expect } from 'vitest';
import { T568A, T568B, judge, wiremap, type Wire } from '../src/game/crimp';

const c = (a: Wire[], b: Wire[]) => ({ a, b, tested: false });
describe('crimping (TIA/EIA-568)', () => {
  it('T568B on both ends is the building standard', () => { const j = judge(c(T568B, T568B)); expect(j.kind).toBe('straightB'); expect(j.works && j.standard && j.testerPass).toBe(true); });
  it('T568A on both ends works but is not the standard', () => { const j = judge(c(T568A, T568A)); expect(j.works).toBe(true); expect(j.standard).toBe(false); });
  it('A to B is a crossover: 1-3, 2-6, 3-1, 6-2 on the tester', () => {
    expect(wiremap(c(T568A, T568B))).toEqual([3, 6, 1, 4, 5, 2, 7, 8]);
    const j = judge(c(T568A, T568B)); expect(j.kind).toBe('crossover'); expect(j.works).toBe(true); expect(j.standard).toBe(false); expect(j.testerPass).toBe(false);
  });
  it('same wrong order on both ends passes a cheap tester but is a split pair', () => {
    const bad: Wire[] = ['putih-oranye', 'oranye', 'putih-hijau', 'hijau', 'putih-biru', 'biru', 'putih-coklat', 'coklat'];
    const j = judge(c(bad, bad)); expect(j.kind).toBe('splitpair'); expect(j.testerPass).toBe(true); expect(j.works).toBe(false);
  });
  it('a swapped pair on one end is miswired', () => {
    const b2 = [...T568B]; [b2[0], b2[1]] = [b2[1], b2[0]];
    const j = judge(c(T568B, b2)); expect(j.kind).toBe('miswired'); expect(j.works).toBe(false); expect(wiremap(c(T568B, b2)).slice(0, 2)).toEqual([2, 1]);
  });
});
