import { describe, it, expect } from 'vitest';
import { ukkGrade, ukkCsv, isCore } from '../src/game/ukk';
const step = (checks: [string, boolean][], done = true) => ({ name: 'Langkah', checks: checks.map(([label, ok]) => ({ label, ok })), ms: 60000, done });
describe('UKK-style grading', () => {
  it('labels and VLAN names are supporting, tests and config are core', () => {
    expect(isCore('Label outlet LAB-04')).toBe(false); expect(isCore('Nama VLAN 70 = PRAKTIK')).toBe(false);
    expect(isCore('Konfigurasi switch disimpan (write memory)')).toBe(false); expect(isCore('Uji dari PC: ping 192.168.70.1 berhasil')).toBe(true);
  });
  it('any failed core criterion is Belum Kompeten, capped below 61', () => {
    const g = ukkGrade([step([['IP 192.168.70.34', true], ['Uji dari PC: ping', false], ['Label outlet LAB-01', true]])], 600000, 60);
    expect(g.predikat).toBe('Belum Kompeten'); expect(g.nilai).toBeLessThan(61);
  });
  it('an unfinished element is Belum Kompeten even if its criteria pass', () => {
    expect(ukkGrade([step([['IP', true]]), step([['Ping', true]], false)], 1, 60).predikat).toBe('Belum Kompeten');
  });
  it('bands follow the supporting share', () => {
    const all = ukkGrade([step([['IP', true], ['Label outlet A', true], ['Nama VLAN 70', true]])], 10 * 60000, 60);
    expect(all.predikat).toBe('Sangat Kompeten'); expect(all.nilai).toBeGreaterThanOrEqual(91); expect(all.nilai).toBeLessThanOrEqual(100);
    const half = ukkGrade([step([['IP', true], ['Label outlet A', true], ['Nama VLAN 70', false]])], 1, 60);
    expect(half.predikat).toBe('Kompeten'); expect(half.nilai).toBeGreaterThanOrEqual(75); expect(half.nilai).toBeLessThanOrEqual(90);
    const none = ukkGrade([step([['IP', true], ['Label outlet A', false], ['Nama VLAN 70', false]])], 1, 60);
    expect(none.predikat).toBe('Cukup Kompeten'); expect(none.nilai).toBe(61);
  });
  it('CSV has one row per criterion with header and BOM', () => {
    const s = [step([['IP', true], ['Label outlet A', false]])], g = ukkGrade(s, 1, 60);
    const csv = ukkCsv({ kode: 'ABC123', nama: 'Sari "Dewi"', meja: 3, tanggal: '2 Nov 2026', durasi: '10:00' }, s, g);
    const lines = csv.split('\r\n'); expect(lines.length).toBe(3); expect(csv.startsWith('\ufeff')).toBe(true);
    expect(lines[2]).toContain('"Pendukung";"BK"'); expect(lines[1]).toContain('"Sari ""Dewi"""');
  });
  it('a sheet ended early still counts the checkpoints of steps never reached', () => {
    // 4-step jobsheet (6 + 6 + 5 + 6 = 23 checkpoints): student stopped in step 1 with 3 of its 6 core checks met
    const started = { ...step([['IP', true], ['Mask', true], ['Gateway', true], ['DNS', false], ['Ping', false], ['Label outlet A', false]], false), planned: 6 };
    const later = [6, 5, 6].map(n => ({ name: 'Langkah', checks: [], ms: 0, done: false, planned: n }));
    const g = ukkGrade([started, ...later], 1, 60);
    expect(g.predikat).toBe('Belum Kompeten');
    expect(g.coreOf + g.supOf + g.untested).toBe(23);
    expect(g.untested).toBe(17);
    expect(g.nilai).toBe(Math.round(3 / (5 + 17) * 60));   // progress over the whole sheet, not only the step started
    const csv = ukkCsv({ kode: 'K', nama: 'N', meja: 1, tanggal: 't', durasi: '1:00' }, [started, ...later], g);
    expect(csv.split('\r\n').length).toBe(1 + 6 + 3);
    expect(csv).toContain('Belum dikerjakan (5 checkpoint)');
  });
  it('a finished sheet has nothing untested', () => {
    expect(ukkGrade([{ ...step([['IP', true]]), planned: 1 }], 1, 60).untested).toBe(0);
  });
});

