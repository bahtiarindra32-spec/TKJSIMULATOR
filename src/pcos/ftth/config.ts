// Fase 3 FTTH (chunk A): every number the optical engine uses, in one place, with its source.
// Basis = notes/research-grow.md §2 (refs [14]–[30]). Anything the research does not give is marked ⚠ inferred
// and is a config value, so a lesson or a later chunk can change it without touching the engine.

/** the three wavelengths the game measures: 1310 nm upstream, 1490 nm downstream, 1550 nm video overlay / test [17][18] */
export type Lambda = 1310 | 1490 | 1550;
export const LAMBDAS: readonly Lambda[] = [1310, 1490, 1550];

export type SplitRatio = 4 | 8 | 16 | 32;

export interface FtthConfig {
  /** G.652.D single-mode fibre (feeder, distribution) in dB/km [19]: max 0.4 for 1310–1625, max 0.3 @1550.
   *  1310 = 0.4 (the max), 1550 = 0.3 (the max), 1490 = 0.35 ⚠ inferred (inside the 0.4 max; same value as the research example calc §2.3) */
  fiberDbPerKm: Record<Lambda, number>;
  /** drop and indoor cable in dB/km: research says not to use G.652 values; IEC indoor cable ≤1.0 dB/km [19] (used for every λ) */
  dropDbPerKm: Record<Lambda, number>;
  /** one fusion splice, dB: 0.1–0.2 (FOA), 0.15 typical SM [20][21] → default 0.15 */
  fusionSpliceDb: number;
  /** fusion splice acceptance window (user decision: 0.1–0.2 dB per fusion splice); above max = "splice jelek" */
  fusionSpliceMaxDb: number;
  /** mechanical splice, dB [20] */
  mechanicalSpliceDb: number;
  /** mated connector pair, dB: 0.3–0.5 typical, max 0.75 (TIA-568) [20][22] → default 0.3 */
  connectorDb: number;
  connectorMaxDb: number;
  /** PLC splitter insertion loss without connectors [23]; 1:16 = 13.7 (user decision; other sheets 13.5 [24]) */
  splitterDb: Record<SplitRatio, number>;
  /** OLT Tx at the PON port, class B+ +1.5…+5 dBm [17]; default +3 (the research example) */
  oltTxDbm: number;
  oltTxRange: [number, number];
  /** ONT Tx upstream 0.5–5 dBm [18]; default 2 ⚠ inferred (inside the range) */
  ontTxDbm: number;
  /** class B+ ODN loss window: min 13, max 28 dB [17] */
  budgetMinDb: number;
  budgetMaxDb: number;
  /** ONU overload −8 dBm [17] */
  ontOverloadDbm: number;
  /** ONU sensitivity: G.984.2 B+ = −27 dBm [17]. Telkom thresholds in the literature disagree (−24 [25], −25 [26], −27 [27]),
   *  so this is a config with −27 as default (user decision). Below it the ONT is LOS. */
  ontSensitivityDbm: number;
  /** colour bands (research §2.3 game suggestion, ⚠ inferred combination of [25][26][27]): green −13…−24, yellow −24…sensitivity.
   *  ⚠ inferred: −8…−13 (inside the ONU spec but stronger than the Telkom range) is shown yellow too ("terlalu kuat"). */
  greenHiDbm: number;
  greenLoDbm: number;
  // ---- faults (research names macrobend as a real cause [26] and says VFL shows bends/breaks/bad connectors [29]; magnitudes are ⚠ inferred)
  /** ⚠ inferred: bend radius below which a bend costs light (mm) */
  bendSafeRadiusMm: number;
  /** ⚠ inferred: loss of a bend at radius → 0, per λ (dB); 1550 suffers most, then 1490, 1310 least (user decision: stronger at 1550) */
  bendMaxDb: Record<Lambda, number>;
  /** ⚠ inferred: extra loss of a dirty connector end face (dB), on top of connectorDb (above the 0.75 max [22] on purpose) */
  dirtyConnectorExtraDb: number;
  /** ⚠ inferred: default loss of a bad splice (dB), above fusionSpliceMaxDb */
  badSpliceDb: number;
  // ---- instruments
  /** VFL: "lacak fiber beberapa km" [29] → ⚠ inferred 5 km */
  vflRangeM: number;
  /** ⚠ inferred OTDR dead zone (m): events nearer than this to the launch point, or to the previous reflective event, are not resolved.
   *  Research says not to simulate dead-zone detail (§2.5), so this is one simple number. */
  otdrDeadZoneM: number;
  /** ⚠ inferred OTDR distance range (m) */
  otdrRangeM: number;
  /** ⚠ inferred: a hand OPM shows "LO" below this power (dBm) */
  opmFloorDbm: number;
  /** ⚠ inferred: test light source output (dBm), used when the OPM is read with a source instead of the live PON signal */
  lightSourceDbm: number;
}

export const DEFAULT_FTTH: Readonly<FtthConfig> = Object.freeze({
  fiberDbPerKm: { 1310: 0.4, 1490: 0.35, 1550: 0.3 },
  dropDbPerKm: { 1310: 1.0, 1490: 1.0, 1550: 1.0 },
  fusionSpliceDb: 0.15,
  fusionSpliceMaxDb: 0.2,
  mechanicalSpliceDb: 0.3,
  connectorDb: 0.3,
  connectorMaxDb: 0.75,
  splitterDb: { 4: 7.2, 8: 10.5, 16: 13.7, 32: 17.0 },
  oltTxDbm: 3,
  oltTxRange: [1.5, 5] as [number, number],
  ontTxDbm: 2,
  budgetMinDb: 13,
  budgetMaxDb: 28,
  ontOverloadDbm: -8,
  ontSensitivityDbm: -27,
  greenHiDbm: -13,
  greenLoDbm: -24,
  bendSafeRadiusMm: 30,
  bendMaxDb: { 1310: 1.5, 1490: 4, 1550: 8 },
  dirtyConnectorExtraDb: 1.5,
  badSpliceDb: 1.0,
  vflRangeM: 5000,
  otdrDeadZoneM: 10,
  otdrRangeM: 20000,
  opmFloorDbm: -50,
  lightSourceDbm: 0,
});

/** a full config from partial overrides (nested per-λ tables merge per key) */
export function ftthConfig(over: Partial<FtthConfig> = {}): FtthConfig {
  const d = DEFAULT_FTTH;
  return {
    ...d, ...over,
    fiberDbPerKm: { ...d.fiberDbPerKm, ...over.fiberDbPerKm },
    dropDbPerKm: { ...d.dropDbPerKm, ...over.dropDbPerKm },
    splitterDb: { ...d.splitterDb, ...over.splitterDb },
    bendMaxDb: { ...d.bendMaxDb, ...over.bendMaxDb },
    oltTxRange: [...(over.oltTxRange ?? d.oltTxRange)] as [number, number],
  };
}

/** ⚠ inferred bend model: no loss at or above the safe radius; below it loss = s² × bendMaxDb[λ], s = (safe − r) / safe */
export function bendLossDb(cfg: FtthConfig, radiusMm: number, l: Lambda): number {
  const safe = cfg.bendSafeRadiusMm;
  if (radiusMm >= safe) return 0;
  const s = Math.min(1, Math.max(0, (safe - Math.max(0, radiusMm)) / safe));
  return s * s * cfg.bendMaxDb[l];
}

export const round2 = (x: number) => Math.round(x * 100) / 100;
