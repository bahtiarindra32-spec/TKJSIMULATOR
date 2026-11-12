// Fase 3 FTTH chunk B1b: the fibre toolkit a field technician borrows from the Nusa Teknik cabinet, the ladder at the
// pole, the K3 (APD) check and the mapping from the splice minigame's clicks to the engine's SpliceSession inputs.
// Pure (no DOM, no world) so it can be unit-tested; the UI is ftthui.ts.
//
// Grounding (notes/research-grow.md §2.4/2.5): OPM + light source, OTDR, VFL and the fusion-splice steps [28][29];
// K3 [30]: safety glasses with side shields and a closed bin for fibre scraps; "kerja di tiang: cukup cutscene".
// ⚠ inferred: helm, sarung tangan, rompi + full-body harness for the pole (common Indonesian field-work APD, not in the
// research); the ladder as a borrowed item; the timing windows of the minigame bars and their angle mapping.
// Not offered (research gives no basis): fast connector, spare drop cable / drop replacement.
import type { StepInput } from '../../pcos/ftth';

export type KitId = 'tangga' | 'opm' | 'vfl' | 'otdr' | 'splicer' | 'pembersih' | 'sleeve' | 'helm' | 'sarung' | 'kacamata' | 'harness';
export interface KitDef {
  id: KitId;
  label: string;
  /** short name for the HUD chip */
  short: string;
  kind: 'alat' | 'apd' | 'bahan';
  note: string;
  /** true when the item or its use is not in the research (DESIGN.md marks it ⚠) */
  inferred: boolean;
}
export const KIT: readonly KitDef[] = [
  { id: 'tangga', label: 'Tangga aluminium 4 m', short: 'Tangga', kind: 'alat', note: 'Untuk naik ke ODP di tiang (box 3 m dari trotoar).', inferred: true },
  { id: 'opm', label: 'OPM + light source (set LSPM)', short: 'OPM', kind: 'alat', note: 'Ukur daya optik (dBm) per panjang gelombang.', inferred: false },
  { id: 'vfl', label: 'VFL (visual fault locator, laser merah)', short: 'VFL', kind: 'alat', note: 'Cahaya merah bocor di titik putus, tekukan, konektor kotor.', inferred: false },
  { id: 'otdr', label: 'OTDR genggam', short: 'OTDR', kind: 'alat', note: 'Trace event (konektor, splice, putus) dan jaraknya.', inferred: false },
  { id: 'splicer', label: 'Fusion splicer + cleaver + stripper', short: 'Splicer', kind: 'alat', note: 'Sambung fiber putus: strip, bersihkan, cleave, fusi.', inferred: false },
  { id: 'pembersih', label: 'Kit pembersih (alkohol IPA + tisu lint-free)', short: 'Pembersih', kind: 'alat', note: 'Bersihkan ujung konektor dan fiber sebelum cleave.', inferred: false },
  { id: 'sleeve', label: 'Sleeve pelindung sambungan (heat-shrink)', short: 'Sleeve', kind: 'bahan', note: 'Satu per sambungan fusi.', inferred: false },
  { id: 'kacamata', label: 'Kacamata safety bertameng samping', short: 'Kacamata', kind: 'apd', note: 'Serpihan fiber dan laser.', inferred: false },
  { id: 'helm', label: 'Helm safety', short: 'Helm', kind: 'apd', note: 'Kerja di tiang.', inferred: true },
  { id: 'sarung', label: 'Sarung tangan kerja', short: 'Sarung tgn', kind: 'apd', note: 'Kerja di tiang dan kabel.', inferred: true },
  { id: 'harness', label: 'Rompi + full body harness', short: 'Harness', kind: 'apd', note: 'Kerja di ketinggian.', inferred: true },
];
export const kitDef = (id: KitId) => KIT.find(k => k.id === id)!;
/** sleeves the cabinet hands out per take (⚠ design) */
export const SLEEVE_PACK = 4;

/** APD each kind of work asks for (⚠ inferred lists; kacamata + closed scrap bin are research [30]) */
export const APD_FOR: Record<'tiang' | 'splice' | 'laser', KitId[]> = {
  tiang: ['helm', 'sarung', 'harness', 'kacamata'],
  splice: ['kacamata'],
  laser: ['kacamata'],
};

export interface Kit {
  /** borrowed tools and APD (consumables are counted separately) */
  has: Set<KitId>;
  sleeves: number;
  /** where the ladder stands ('tiang:ODP-FLB-01'); null = carried or not borrowed */
  ladderAt: string | null;
  /** on the ladder at this place */
  climbing: string | null;
  /** VFL plugged in and switched on at this point ('odp-port' | 'roset' | 'ont'); null = off */
  vflOn: string | null;
  /** K3 notes recorded during the work (missing APD); not a block */
  k3: string[];
}
export const newKit = (): Kit => ({ has: new Set(), sleeves: 0, ladderAt: null, climbing: null, vflOn: null, k3: [] });

/** take an item from the cabinet; returns a message for the player */
export function borrow(k: Kit, id: KitId): string {
  if (id === 'sleeve') { k.sleeves += SLEEVE_PACK; return `Ambil ${SLEEVE_PACK} sleeve pelindung.`; }
  if (k.has.has(id)) return `${kitDef(id).label} sudah kamu bawa.`;
  k.has.add(id); return `${kitDef(id).label} diambil.`;
}
/** put an item back; refused while it is in use (ladder standing / climbing, VFL on) */
export function giveBack(k: Kit, id: KitId): { ok: boolean; msg: string } {
  if (id === 'sleeve') { if (!k.sleeves) return { ok: false, msg: 'Tidak ada sleeve di tas.' }; k.sleeves = 0; return { ok: true, msg: 'Sleeve sisa dikembalikan.' }; }
  if (!k.has.has(id)) return { ok: false, msg: `${kitDef(id).label} tidak kamu bawa.` };
  if (id === 'tangga' && (k.ladderAt || k.climbing)) return { ok: false, msg: 'Tangga masih bersandar di tiang. Ambil dulu tangganya.' };
  if (id === 'vfl' && k.vflOn) return { ok: false, msg: 'VFL masih menyala dan tercolok. Matikan dan cabut dulu.' };
  k.has.delete(id); return { ok: true, msg: `${kitDef(id).label} dikembalikan.` };
}
/** APD of a kind of work that the technician does not carry */
export const apdMissing = (k: Kit, work: keyof typeof APD_FOR) => APD_FOR[work].filter(id => !k.has.has(id));

/** lean the carried ladder against the pole at `at` */
export function placeLadder(k: Kit, at: string): { ok: boolean; msg: string } {
  if (!k.has.has('tangga')) return { ok: false, msg: 'Kamu tidak membawa tangga. Pinjam di lemari Nusa Teknik.' };
  if (k.ladderAt) return { ok: false, msg: 'Tangga sudah bersandar di tiang.' };
  k.ladderAt = at; return { ok: true, msg: 'Tangga disandarkan ke tiang, kaki tangga di trotoar, diikat ke tiang.' };
}
export function takeLadder(k: Kit): { ok: boolean; msg: string } {
  if (k.climbing) return { ok: false, msg: 'Turun dulu dari tangga.' };
  if (!k.ladderAt) return { ok: false, msg: 'Tangga tidak sedang dipasang.' };
  k.ladderAt = null; return { ok: true, msg: 'Tangga dilepas dan dibawa lagi.' };
}
/**
 * climb the ladder at `at`. Needs the ladder standing there. Missing APD does not block (the research keeps pole work a
 * cutscene); it is written into the K3 notes and returned so the UI can warn.
 */
export function climb(k: Kit, at: string): { ok: boolean; msg: string; missing: KitId[] } {
  if (k.ladderAt !== at) return { ok: false, msg: 'Sandarkan tangga ke tiang dulu.', missing: [] };
  const missing = apdMissing(k, 'tiang');
  if (missing.length) k.k3.push(`Naik tiang tanpa ${missing.map(id => kitDef(id).short.toLowerCase()).join(', ')}`);
  k.climbing = at;
  return { ok: true, msg: missing.length ? `K3: kamu naik tanpa ${missing.map(id => kitDef(id).label.toLowerCase()).join(', ')}. Dicatat.` : 'Naik tangga dengan APD lengkap.', missing };
}
export function descend(k: Kit) { k.climbing = null; }
/** use one protection sleeve (false = none in the bag) */
export function useSleeve(k: Kit): boolean { if (k.sleeves < 1) return false; k.sleeves--; return true; }
/** the short HUD chip text: tools carried, sleeves, APD count, ladder place */
export function chipItems(k: Kit): string[] {
  const out = KIT.filter(d => d.kind === 'alat' && k.has.has(d.id)).map(d => (d.id === 'tangga' && k.ladderAt ? 'Tangga (di tiang)' : d.short));
  if (k.sleeves) out.push(`Sleeve ${k.sleeves}`);
  const apd = KIT.filter(d => d.kind === 'apd'), n = apd.filter(d => k.has.has(d.id)).length;
  if (n) out.push(`APD ${n}/${apd.length}`);
  return out;
}

// ------------------------------------------------------------------------------------------------ splice minigame mapping
// The strip and cleave steps use a marker that sweeps a bar (triangle wave). Where the player stops it decides the input.
// ⚠ inferred windows: strip is clean within ±0.15 of the centre; the cleave angle grows with the distance from the centre,
// 0.1° at the centre to 2.5° at an edge, so a stop within ±0.1 gives ≤0.6° and one beyond ±0.19 (> 1.0°) is rejected
// by the splicer (SpliceTuning.rejectAngleDeg).

/** marker position 0…1…0 over one period (ms) */
export function barPhase(tMs: number, periodMs: number): number {
  const x = (((tMs % periodMs) + periodMs) % periodMs) / periodMs;
  return x < 0.5 ? x * 2 : 2 - x * 2;
}
export const STRIP_WINDOW = 0.15;
/** strip: stopping off the centre nicks the glass */
export const stripInput = (phase: number): StepInput => ({ nicked: Math.abs(phase - 0.5) > STRIP_WINDOW });
/** cleave: angle in degrees (0.1 decimal, like a splicer screen) from where the marker stopped */
export const cleaveAngle = (phase: number) => Math.round((0.1 + Math.min(0.5, Math.abs(phase - 0.5)) * 4.8) * 10) / 10;
export const cleaveInput = (phase: number): StepInput => ({ angleDeg: cleaveAngle(phase) });
/** clean: the wipe the player picked */
export const cleanInput = (how: 'alkohol' | 'tiup' | 'lewati'): StepInput => ({ wiped: how === 'alkohol' });
/** align: the fibre is seated only when both ends were laid in the V-groove before the clamp closed */
export const alignInput = (o: { leftSeated: boolean; rightSeated: boolean; program: NonNullable<StepInput['program']> }): StepInput => ({ seated: o.leftSeated && o.rightSeated, program: o.program });
/** a fibre end that touched the table / fingers after cleaning (UI action "letakkan di meja") */
export const touchedInput = (touched: boolean): StepInput => (touched ? { touched: true } : {});
/** protect: sleeve slid over before fusing (moving it after fusing is impossible) and heated */
export const protectInput = (o: { sleeveOn: boolean; heated: boolean }): StepInput => ({ shrunk: o.sleeveOn && o.heated });
