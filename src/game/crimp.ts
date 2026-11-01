// Crimping a Cat6 patch cord (TIA/EIA-568). The player lays the eight wires for each RJ45 plug (pin 1 on the left,
// clip facing down), then crimps. The result is judged the way the real cable behaves:
//  - both ends T568B (or both T568A): straight-through, works; this building's standard is T568B on both ends
//  - one end A, the other B: crossover. Works today because NICs and switches do Auto MDI-X, but it is not the
//    building standard, so the work order rejects it
//  - same non-standard order on both ends: a cheap LAN tester still lights 1-1 … 8-8, but the pairs are split
//    (a signal and its return are not twisted together), so the link is unusable. The tester cannot see this.
//  - any other order: miswired; the tester shows the crossed or open pins.
export const WIRES = ['putih-oranye', 'oranye', 'putih-hijau', 'biru', 'putih-biru', 'hijau', 'putih-coklat', 'coklat'] as const;
export type Wire = typeof WIRES[number];
export const T568B: Wire[] = [...WIRES];
export const T568A: Wire[] = ['putih-hijau', 'hijau', 'putih-oranye', 'biru', 'putih-biru', 'oranye', 'putih-coklat', 'coklat'];
export const WIRE_CSS: Record<Wire, string> = {
  'putih-oranye': 'repeating-linear-gradient(90deg,#f1ede4 0 6px,#e8812a 6px 10px)', oranye: '#e8812a',
  'putih-hijau': 'repeating-linear-gradient(90deg,#f1ede4 0 6px,#3c9a4f 6px 10px)', hijau: '#3c9a4f',
  'putih-biru': 'repeating-linear-gradient(90deg,#f1ede4 0 6px,#2f6fc4 6px 10px)', biru: '#2f6fc4',
  'putih-coklat': 'repeating-linear-gradient(90deg,#f1ede4 0 6px,#7a4b2a 6px 10px)', coklat: '#7a4b2a',
};
export type EndStd = 'A' | 'B' | null;
export interface Cable { a: Wire[]; b: Wire[]; tested: boolean }
export const endStd = (w: Wire[]): EndStd => (w.join() === T568B.join() ? 'B' : w.join() === T568A.join() ? 'A' : null);
/** pin on end B that each pin of end A reaches (index 0 = pin 1); 0 = open */
export const wiremap = (c: Cable) => c.a.map(w => c.b.indexOf(w) + 1);
export function judge(c: Cable): { works: boolean; standard: boolean; kind: 'straightB' | 'straightA' | 'crossover' | 'splitpair' | 'miswired'; testerPass: boolean; text: string } {
  const sa = endStd(c.a), sb = endStd(c.b), map = wiremap(c), pass = map.every((p, i) => p === i + 1);
  if (sa === 'B' && sb === 'B') return { works: true, standard: true, kind: 'straightB', testerPass: true, text: 'Straight-through T568B di kedua ujung. Sesuai standar gedung.' };
  if (sa === 'A' && sb === 'A') return { works: true, standard: false, kind: 'straightA', testerPass: true, text: 'Straight-through T568A di kedua ujung. Kabelnya jalan, tapi standar gedung ini T568B.' };
  if (sa && sb) return { works: true, standard: false, kind: 'crossover', testerPass: false, text: 'Crossover (satu ujung T568A, satu T568B). Masih nyala karena Auto MDI-X, tapi bukan kabel PC ke outlet sesuai standar.' };
  if (pass) return { works: false, standard: false, kind: 'splitpair', testerPass: true, text: 'Urutan di kedua ujung sama tapi bukan T568A/B: pasangan kabel terbelah (split pair). LAN tester murah tetap lulus, tapi link tidak stabil/putus.' };
  return { works: false, standard: false, kind: 'miswired', testerPass: false, text: 'Urutan kabel salah: ada pin yang tertukar atau tidak tersambung.' };
}
