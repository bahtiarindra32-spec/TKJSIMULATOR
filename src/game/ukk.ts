// UKK-style conclusion for a Lab Praktik result, following the layout of the official assessment sheet
// (Lembar Penilaian, Pedoman UKK SMK): each criterion is either an element UTAMA (core) or PENDUKUNG (supporting),
// marked Kompeten / Belum Kompeten, then a predicate with a 0–100 score band:
//   Sangat Kompeten 91–100: all core + all supporting
//   Kompeten        75–90 : all core + most supporting
//   Cukup Kompeten  61–74 : all core + few supporting
//   Belum Kompeten  < 61  : any core criterion not met
// Where the score falls inside a band is our own deterministic rule (share of supporting criteria met,
// and for Sangat Kompeten the time used), stated on the sheet so a teacher can override it.

export interface UkkCheck { label: string; ok: boolean }
export interface UkkStep { name: string; checks: UkkCheck[]; ms: number; done: boolean }
export type Predikat = 'Sangat Kompeten' | 'Kompeten' | 'Cukup Kompeten' | 'Belum Kompeten';
export interface UkkResult { predikat: Predikat; nilai: number; coreOk: number; coreOf: number; supOk: number; supOf: number }

/** supporting (pendukung) criteria: tidiness and documentation that do not stop the network from working */
const PENDUKUNG = /^Label outlet|^Nama VLAN|disimpan|write memory|^Deskripsi port|^K3: alat dikembalikan/i;
export const isCore = (label: string) => !PENDUKUNG.test(label);

export function ukkGrade(steps: UkkStep[], totalMs: number, minutes: number): UkkResult {
  const all = steps.flatMap(s => s.checks);
  const core = all.filter(c => isCore(c.label)), sup = all.filter(c => !isCore(c.label));
  const coreOk = core.filter(c => c.ok).length, supOk = sup.filter(c => c.ok).length;
  const r = { coreOk, coreOf: core.length, supOk, supOf: sup.length };
  if (!core.length || coreOk < core.length || steps.some(s => !s.done)) {  // an element not finished is not competent
    // not competent: show how far the student got, capped below the competent bands
    return { ...r, predikat: 'Belum Kompeten', nilai: Math.min(60, Math.round(coreOk / Math.max(1, core.length) * 60)) };
  }
  const p = sup.length ? supOk / sup.length : 1;
  if (p >= 1) {
    const left = minutes > 0 ? Math.max(0, 1 - totalMs / (minutes * 60000)) : 0.5;
    return { ...r, predikat: 'Sangat Kompeten', nilai: 91 + Math.round(9 * Math.min(1, left * 2)) };
  }
  if (p >= 0.5) return { ...r, predikat: 'Kompeten', nilai: 75 + Math.round(15 * (p - 0.5) / 0.5) };
  return { ...r, predikat: 'Cukup Kompeten', nilai: 61 + Math.round(13 * p / 0.5) };
}

/** one CSV row per criterion, ready for a spreadsheet / e-Rapor copy (semicolon: Excel in Indonesian locale) */
export function ukkCsv(meta: { kode: string; nama: string; meja: number; tanggal: string; durasi: string }, steps: UkkStep[], g: UkkResult): string {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ['Kode', 'Nama', 'Meja', 'Tanggal', 'Elemen', 'Kriteria', 'Jenis', 'Hasil', 'Waktu langkah', 'Durasi total', 'Predikat', 'Nilai'];
  const mm = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const rows = steps.flatMap(s => s.checks.map(c => [meta.kode, meta.nama, meta.meja, meta.tanggal, s.name, c.label, isCore(c.label) ? 'Utama' : 'Pendukung', c.ok ? 'K' : 'BK', s.done ? mm(s.ms) : '-', meta.durasi, g.predikat, g.nilai]));
  return '\ufeff' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
}
