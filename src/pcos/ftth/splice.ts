// Fase 3 FTTH (chunk A): fusion splice minigame logic (pure, no UI).
// Steps per FOA [28] (research §2.4): strip coating → clean (alcohol wipe) → cleave → load in guide & clamp + choose program (align)
// → splicer checks the cleave (bad cleave rejected, redo) → fuse → estimated loss → protection sleeve (heat-shrink).
// The last step is common practice (research marks it ⚠). K3 [30]: fibre scraps into a closed bin.
// ⚠ inferred: the loss formula and every penalty number below (research gives only "dirty = loss naik", "cleave jelek = ditolak").

export type SpliceStep = 'strip' | 'clean' | 'cleave' | 'align' | 'fuse' | 'protect';
export const SPLICE_STEPS: readonly SpliceStep[] = ['strip', 'clean', 'cleave', 'align', 'fuse', 'protect'];

export interface SpliceTuning {
  /** loss of a perfect joint (dB) */
  baseDb: number;
  /** dB per degree of cleave angle (both ends combined) */
  perDegreeDb: number;
  /** splicer rejects a cleave above this angle (degrees) */
  rejectAngleDeg: number;
  /** skipped / poor cleaning */
  dirtyDb: number;
  /** fibre touched or laid down after cleaning/cleave (dust on the end face) */
  touchedDb: number;
  /** wrong splicer program (e.g. MM for SM fibre) */
  wrongProgramDb: number;
  /** fibre not seated in the V-groove / clamp */
  misloadDb: number;
  /** result range (user decision: 0.02–0.5 dB) */
  minDb: number; maxDb: number;
  /** a splice above this is a fail (0.2 dB per fusion splice, user decision / FOA [20][21]) */
  passDb: number;
}
export const SPLICE_TUNING: Readonly<SpliceTuning> = Object.freeze({
  baseDb: 0.02, perDegreeDb: 0.1, rejectAngleDeg: 1.0, dirtyDb: 0.15, touchedDb: 0.1, wrongProgramDb: 0.2, misloadDb: 0.12,
  minDb: 0.02, maxDb: 0.5, passDb: 0.2,
});

export interface StepInput {
  /** strip: nicked the glass with the stripper (weak fibre, score only) */
  nicked?: boolean;
  /** clean: wiped with alcohol (false = only pretended / skipped the wipe) */
  wiped?: boolean;
  /** cleave: angle of the cleaved end in degrees */
  angleDeg?: number;
  /** align: fibre seated in the V-groove + clamp */
  seated?: boolean;
  /** align: program chosen on the splicer */
  program?: 'SM' | 'MM' | 'DS' | 'NZ';
  /** any step after clean: fibre end touched something */
  touched?: boolean;
  /** protect: sleeve slid over before fusing and shrunk in the heater */
  shrunk?: boolean;
}

export interface SpliceResult {
  lossDb: number;
  /** what the splicer screen shows (rounded like a splicer, 0.01 dB) */
  estimate: string;
  pass: boolean;
  protected: boolean;
  /** 0–100 */
  score: number;
  mistakes: string[];
}

/**
 * One splice attempt. Call `step()` in order; a step out of order is refused (mistake, no state change).
 * A cleave above rejectAngleDeg is refused at `fuse` ("cleave jelek, ulangi"): the player must cleave again (clean first is wise).
 */
export class SpliceSession {
  readonly t: SpliceTuning;
  private next = 0;
  private dirty = false;
  private touched = false;
  private angle = 0;
  private seated = true;
  private program: StepInput['program'] = 'SM';
  private nicked = false;
  private fused: number | null = null;
  private sleeve = false;
  private scrapsBinned = false;
  readonly mistakes: string[] = [];
  readonly log: string[] = [];
  rejects = 0;

  constructor(t: Partial<SpliceTuning> = {}, readonly fiber: 'SM' | 'MM' = 'SM') { this.t = { ...SPLICE_TUNING, ...t }; }

  get expected(): SpliceStep | null { return SPLICE_STEPS[this.next] ?? null; }
  get done() { return this.next >= SPLICE_STEPS.length; }

  /** do a step; returns the message the splicer / trainer shows */
  step(s: SpliceStep, inp: StepInput = {}): { ok: boolean; msg: string } {
    if (this.done) return { ok: false, msg: 'Penyambungan sudah selesai.' };
    // a re-cleave after a reject is allowed (cleave again, optionally clean again first)
    const redo = this.next === SPLICE_STEPS.indexOf('fuse') && (s === 'cleave' || s === 'clean') && this.rejects > 0;
    if (s !== this.expected && !redo) {
      this.mistakes.push(`urutan: ${s} sebelum ${this.expected}`);
      return { ok: false, msg: `Langkah salah. Berikutnya: ${this.expected}.` };
    }
    if (inp.touched && SPLICE_STEPS.indexOf(s) >= SPLICE_STEPS.indexOf('cleave')) { this.touched = true; this.mistakes.push('ujung fiber tersentuh setelah dibersihkan'); }
    switch (s) {
      case 'strip':
        this.nicked = !!inp.nicked; if (this.nicked) this.mistakes.push('fiber tergores saat strip');
        this.dirty = true; // stripped coating leaves residue until cleaned
        break;
      case 'clean':
        if (inp.wiped === false) this.mistakes.push('tidak dibersihkan dengan alkohol'); else { this.dirty = false; if (redo) this.touched = false; }
        break;
      case 'cleave':
        this.angle = Math.max(0, inp.angleDeg ?? 0.5);
        if (redo) { this.log.push(`cleave ulang ${this.angle}°`); return { ok: true, msg: `Cleave ulang: sudut ${this.angle.toFixed(1)}°.` }; }
        break;
      case 'align':
        this.seated = inp.seated !== false; if (!this.seated) this.mistakes.push('fiber tidak duduk di V-groove');
        this.program = inp.program ?? 'SM'; if (this.program !== this.fiber) this.mistakes.push(`program ${this.program} untuk fiber ${this.fiber}`);
        break;
      case 'fuse':
        if (this.angle > this.t.rejectAngleDeg) {
          this.rejects++; this.mistakes.push(`cleave ditolak (${this.angle.toFixed(1)}°)`);
          return { ok: false, msg: `Cleave jelek (${this.angle.toFixed(1)}° > ${this.t.rejectAngleDeg}°). Ulangi cleave.` };
        }
        this.fused = this.computeLoss();
        break;
      case 'protect':
        this.sleeve = inp.shrunk !== false; if (!this.sleeve) this.mistakes.push('sleeve pelindung tidak dipasang');
        break;
    }
    // chunk B1b fix: a re-clean after a reject must not advance the sequence (it used to skip fuse → protect)
    if (redo) { this.log.push(`${s} ulang`); return { ok: true, msg: 'Dibersihkan lagi.' }; }
    this.log.push(s); this.next++;
    return { ok: true, msg: s === 'fuse' ? `Est. loss ${this.fused!.toFixed(2)} dB` : `OK: ${s}` };
  }

  /** K3: fibre scraps into the closed bin (research §2.4 [30]) */
  binScraps() { this.scrapsBinned = true; }

  private computeLoss() {
    const t = this.t;
    let db = t.baseDb + this.angle * t.perDegreeDb;
    if (this.dirty) db += t.dirtyDb;
    if (this.touched) db += t.touchedDb;
    if (this.program !== this.fiber) db += t.wrongProgramDb;
    if (!this.seated) db += t.misloadDb;
    return Math.round(Math.min(t.maxDb, Math.max(t.minDb, db)) * 100) / 100;
  }

  /** the outcome; null until fused */
  result(): SpliceResult | null {
    if (this.fused === null) return null;
    const lossDb = this.fused;
    let score = 100 - this.mistakes.length * 10 - this.rejects * 5 - (this.scrapsBinned ? 0 : 10) - Math.round(Math.max(0, lossDb - this.t.baseDb) * 100);
    score = Math.max(0, Math.min(100, score));
    return { lossDb, estimate: `${lossDb.toFixed(2)} dB`, pass: lossDb <= this.t.passDb + 1e-9 && this.sleeve, protected: this.sleeve, score, mistakes: [...this.mistakes] };
  }
}

/** run a whole attempt from a list of inputs (tests, AI hints, replay) */
export function runSplice(inputs: Partial<Record<SpliceStep, StepInput>>, opts: { binScraps?: boolean; tuning?: Partial<SpliceTuning> } = {}) {
  const s = new SpliceSession(opts.tuning);
  for (const st of SPLICE_STEPS) s.step(st, inputs[st] ?? {});
  if (opts.binScraps !== false) s.binScraps();
  return s;
}
