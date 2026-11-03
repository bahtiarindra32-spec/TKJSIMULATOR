import { describe, it, expect } from 'vitest';
import { encodeLab, decodeLab, studentSeed, parseInstruction, type LabSpec } from '../src/game/lab';

describe('lab code', () => {
  it('round-trips every field in 6 characters', () => {
    for (let k = 0; k < 200; k++) {
      const s: LabSpec = { steps: (['crimp', 'desk', 'static', 'dhcp', 'vlan', 'dns', 'trouble'] as const).filter((_, i) => (k * 37 + 1) & (1 << i)), minutes: (k % 16) * 10, perStudent: k % 2 === 0, seed: (k * 2654435761) & 0xffff };
      if (!s.steps.length) continue;
      const c = encodeLab(s); expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/); expect(decodeLab(c)).toEqual(s);
    }
  });
  it('sheets with the newer steps (VLSM, inter-VLAN, ACL) use 7 characters; old 6-character codes still open', () => {
    const s: LabSpec = { steps: ['static', 'vlsm', 'intervlan', 'acl'], minutes: 120, perStudent: true, seed: 65535 };
    const c = encodeLab(s); expect(c).toHaveLength(7); expect(decodeLab(c)).toEqual(s);
    const old: LabSpec = { steps: ['crimp', 'vlan', 'trouble'], minutes: 30, perStudent: false, seed: 4321 };
    expect(encodeLab(old)).toHaveLength(6); expect(decodeLab(encodeLab(old))).toEqual(old);
    expect(parseInstruction('vlsm lalu routing antar vlan dan firewall acl').steps).toEqual(['vlsm', 'intervlan', 'acl']);
  });
  it('rejects most typos', () => {
    const c = encodeLab({ steps: ['crimp', 'static'], minutes: 60, perStudent: true, seed: 1234 });
    let bad = 0; const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < 6; i++) for (const ch of A) { if (ch === c[i]) continue; const t = c.slice(0, i) + ch + c.slice(i + 1); if (!decodeLab(t)) bad++; }
    expect(bad).toBeGreaterThan(6 * 31 * 0.6);
  });
  it('same name gives the same case, different names differ only when per-student', () => {
    const s: LabSpec = { steps: ['static'], minutes: 0, perStudent: true, seed: 99 };
    expect(studentSeed(s, 'Budi')).toBe(studentSeed(s, ' budi ')); expect(studentSeed(s, 'Budi')).not.toBe(studentSeed(s, 'Sari'));
    expect(studentSeed({ ...s, perStudent: false }, 'Budi')).toBe(99);
  });
  it('reads the teacher sentence offline', () => {
    const p = parseInstruction('siswa crimping kabel sampai tersambung, lalu ip statis dan dhcp, 90 menit, beda tiap siswa');
    expect(p.steps).toEqual(['crimp', 'desk', 'static', 'dhcp']); expect(p.minutes).toBe(90); expect(p.perStudent).toBe(true);
  });
});
