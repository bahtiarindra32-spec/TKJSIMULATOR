// Fase 3 FTTH chunk B1b: toolkit / ladder / K3 state and the splice minigame input mapping (pure).
import { describe, it, expect } from 'vitest';
import { newKit, borrow, giveBack, placeLadder, takeLadder, climb, descend, apdMissing, useSleeve, chipItems, SLEEVE_PACK, KIT, barPhase, stripInput, cleaveAngle, cleaveInput, cleanInput, alignInput, protectInput, touchedInput, STRIP_WINDOW } from '../src/game/field/ftthkit';
import { SpliceSession, SPLICE_STEPS, SPLICE_TUNING, type SpliceStep, type StepInput } from '../src/pcos/ftth';
import { dropPointAt, indoorPointAt, dropParts, FTTH_RUMAH, WALK_Y } from '../src/data/ftthsite';

describe('FTTH kit: borrow, give back, ladder, K3', () => {
  it('borrows tools once, sleeves by the pack, and gives them back', () => {
    const k = newKit();
    borrow(k, 'opm'); borrow(k, 'opm'); borrow(k, 'sleeve'); borrow(k, 'sleeve');
    expect([...k.has]).toEqual(['opm']);
    expect(k.sleeves).toBe(2 * SLEEVE_PACK);
    expect(giveBack(k, 'opm').ok).toBe(true);
    expect(giveBack(k, 'opm').ok).toBe(false);
    expect(giveBack(k, 'sleeve').ok).toBe(true); expect(k.sleeves).toBe(0);
  });
  it('the ladder must be carried to be placed, stands at one pole, and cannot be returned while standing', () => {
    const k = newKit();
    expect(placeLadder(k, 'tiang:A').ok).toBe(false);
    borrow(k, 'tangga');
    expect(placeLadder(k, 'tiang:A').ok).toBe(true);
    expect(giveBack(k, 'tangga').ok).toBe(false);
    expect(climb(k, 'tiang:B').ok).toBe(false);
    expect(climb(k, 'tiang:A').ok).toBe(true);
    expect(takeLadder(k).ok).toBe(false);          // still on it
    descend(k);
    expect(takeLadder(k).ok).toBe(true);
    expect(giveBack(k, 'tangga').ok).toBe(true);
  });
  it('missing APD does not block the climb but is recorded as a K3 note', () => {
    const k = newKit(); borrow(k, 'tangga'); borrow(k, 'kacamata'); placeLadder(k, 'p');
    const r = climb(k, 'p');
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual(['helm', 'sarung', 'harness']);
    expect(k.k3.length).toBe(1);
    descend(k); for (const id of ['helm', 'sarung', 'harness'] as const) borrow(k, id);
    expect(apdMissing(k, 'tiang')).toEqual([]);
    expect(climb(k, 'p').missing).toEqual([]); expect(k.k3.length).toBe(1);
  });
  it('VFL cannot be returned while on; sleeves run out; chip lists what is carried', () => {
    const k = newKit(); borrow(k, 'vfl'); k.vflOn = 'roset';
    expect(giveBack(k, 'vfl').ok).toBe(false);
    expect(useSleeve(k)).toBe(false); borrow(k, 'sleeve'); expect(useSleeve(k)).toBe(true); expect(k.sleeves).toBe(SLEEVE_PACK - 1);
    borrow(k, 'helm');
    expect(chipItems(k)).toEqual(['VFL', `Sleeve ${SLEEVE_PACK - 1}`, `APD 1/${KIT.filter(d => d.kind === 'apd').length}`]);
  });
});

describe('splice minigame → SpliceSession inputs', () => {
  it('bar phase is a triangle wave 0…1…0', () => {
    expect(barPhase(0, 1000)).toBe(0); expect(barPhase(250, 1000)).toBe(0.5); expect(barPhase(500, 1000)).toBe(1); expect(barPhase(750, 1000)).toBe(0.5); expect(barPhase(1000, 1000)).toBe(0);
  });
  it('strip nicks off the centre window; cleave angle grows with the distance from the centre', () => {
    expect(stripInput(0.5).nicked).toBe(false); expect(stripInput(0.5 + STRIP_WINDOW - 0.01).nicked).toBe(false); expect(stripInput(0.9).nicked).toBe(true);
    expect(cleaveAngle(0.5)).toBe(0.1); expect(cleaveAngle(0.6)).toBe(0.6); expect(cleaveAngle(0)).toBe(2.5); expect(cleaveAngle(1)).toBe(2.5);
    expect(cleaveAngle(0.55)).toBeLessThan(SPLICE_TUNING.rejectAngleDeg);
    expect(cleaveAngle(0.75)).toBeGreaterThan(SPLICE_TUNING.rejectAngleDeg);
  });
  const run = (inp: Partial<Record<SpliceStep, StepInput>>) => { const s = new SpliceSession(); for (const st of SPLICE_STEPS) s.step(st, inp[st] ?? {}); s.binScraps(); return s; };
  it('good inputs give a passing splice ≤ 0.2 dB', () => {
    const s = run({ strip: stripInput(0.5), clean: cleanInput('alkohol'), cleave: cleaveInput(0.52), align: { ...alignInput({ leftSeated: true, rightSeated: true, program: 'SM' }), ...touchedInput(false) }, protect: protectInput({ sleeveOn: true, heated: true }) });
    const r = s.result()!;
    expect(r.pass).toBe(true); expect(r.lossDb).toBeLessThanOrEqual(0.2); expect(r.mistakes).toEqual([]);
  });
  it('skipped wipe, wrong program, unseated fibre and a touched end raise the loss; no sleeve fails', () => {
    const good = run({ cleave: cleaveInput(0.5) }).result()!.lossDb;
    const bad = run({ clean: cleanInput('tiup'), cleave: cleaveInput(0.5), align: { ...alignInput({ leftSeated: true, rightSeated: false, program: 'MM' }), ...touchedInput(true) }, protect: protectInput({ sleeveOn: false, heated: true }) }).result()!;
    expect(bad.lossDb).toBeGreaterThan(good);
    expect(bad.pass).toBe(false); expect(bad.protected).toBe(false);
  });
  it('a bad cleave is rejected at fuse and can be redone', () => {
    const s = new SpliceSession();
    s.step('strip', stripInput(0.5)); s.step('clean', cleanInput('alkohol')); s.step('cleave', cleaveInput(0.0)); s.step('align', alignInput({ leftSeated: true, rightSeated: true, program: 'SM' }));
    expect(s.step('fuse').ok).toBe(false);
    s.step('clean', cleanInput('alkohol')); s.step('cleave', cleaveInput(0.5));
    expect(s.step('fuse').ok).toBe(true);
  });
});

describe('drop route points (VFL glow placement)', () => {
  it('starts at the ODP on the pole, climbs to the clamp, ends at the roset', () => {
    const F = FTTH_RUMAH, a = dropPointAt(0), end = dropPointAt(dropParts().totalM + 5);
    expect(a[0]).toBe(F.pole.X); expect(a[1]).toBeCloseTo(WALK_Y + F.odp.y, 5);
    expect(end).toEqual([...F.roset]);
    // 9 m: past the 3.6 m climb and the 3 m loop, in the aerial span between the pole and the house
    const p9 = dropPointAt(9);
    expect(p9[0]).toBeGreaterThan(F.pole.X); expect(p9[0]).toBeLessThan(F.houseHook[0]);
    expect(p9[1]).toBeGreaterThan(F.houseHook[1]);
    expect(indoorPointAt(0)).toEqual([...F.roset]); expect(indoorPointAt(99)).toEqual([...F.ont]);
  });
});
