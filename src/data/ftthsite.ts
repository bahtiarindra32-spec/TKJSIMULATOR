// Fase 3 FTTH (chunk B1a): the physical layout of the fibre that feeds BLD_RUMAH_01 (pure data, city metres; X east,
// Z south, y up from the ground). The world builder (world/ftthsite.ts) draws these points and the netsim
// (pcos/ftthsite.ts) takes its span lengths from the same numbers, so the drop you see is the drop the loss budget uses.
//
// Street: ROAD_FLAMBOYAN (kolektor, centre Z 570, carriage 566.5–573.5, south sidewalk 573.5–575.5). The pole stands on
// the kerb line of the south sidewalk (Z 574, the line the street lamps use), west of the house front; the ODC cabinet
// stands at the back edge of the same sidewalk 32 m further east. ⚠ design: positions and the slack lengths are game values.
import { FLOOR_Y } from './sites';

export type P3 = [number, number, number];
/** sidewalk top (street lamps stand at 0.15) */
export const WALK_Y = 0.15;

export const FTTH_RUMAH = {
  /** concrete utility pole ("tiang beton 7 m"), base centre on the kerb line */
  pole: { X: 110, Z: 574, h: 7.5, rBase: 0.14, rTop: 0.09 },
  /** ODP box strapped to the house side (+Z) of the pole, centre height; 1:8 ODP-FLB-01 */
  odp: { y: 3.0, w: 0.3, h: 0.42, d: 0.13 },
  /** S-clamp / drop hook near the pole top where the drops leave the pole */
  clampY: 6.6,
  /** drop anchor (hook) on the front (north) wall near the NW corner, below the eave trim and left of the window */
  houseHook: [114.3, 2.5, 579.98] as P3,
  /** where the drop goes through the front wall (outside face, roset height) */
  wallEntry: [114.3, FLOOR_Y + 1.31, 579.98] as P3,
  /** just inside the front wall; from here the drop is clipped along the inside of the west wall to the roset */
  wallInside: [114.3, FLOOR_Y + 1.31, 580.16] as P3,
  /** roset / OTP on the inside of the west wall (existing PROP_RUMAH_01_ROSET) */
  roset: [114.15, FLOOR_Y + 1.31, 580.75] as P3,
  /** ONT on the front-room bufet (existing PROP_RUMAH_01_ONT, centre) */
  ont: [114.5, FLOOR_Y + 0.65, 580.85] as P3,
  /** drop sag at mid-span (m) */
  sag: 0.35,
  /** service loop coiled on the pole under the clamp (m) ⚠ design */
  dropSlackM: 3,
  /** ODC cabinet (green, on the sidewalk back edge); X centre, Z of its front face */
  odc: { X: 142, Z0: 574.95, w: 1.1, h: 1.45, d: 0.5 },
  /** distribution: ODC → duct under the sidewalk (depth) → riser pipe up the pole → ODP; slack stored in ODC and ODP ⚠ design */
  ductDepth: 0.6, distSlackM: 5,
  /** indoor patch cord roset → ONT: a standard 1.5 m SC/APC patch cord (the measured run is ~1.1 m) ⚠ design */
  indoorM: 1.5,
} as const;

const d3 = (a: P3, b: P3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** arc length of a parabolic sag over a chord: L ≈ c + 8s²/(3c) */
export const sagLen = (a: P3, b: P3, sag: number) => { const c = d3(a, b); return c + (8 * sag * sag) / (3 * c); };
export const r1 = (x: number) => Math.round(x * 10) / 10;

/** the drop cable as walked: ODP → up the pole → clamp → sagging span → hook → down the front wall → through it → along the inside to the roset, plus the service loop */
export function dropParts() {
  const F = FTTH_RUMAH, p = F.pole;
  const clamp: P3 = [p.X, WALK_Y + F.clampY, p.Z];
  const parts = {
    upPole: F.clampY - F.odp.y,
    span: sagLen(clamp, F.houseHook, F.sag),
    downWall: F.houseHook[1] - F.wallEntry[1],
    throughWall: d3(F.wallEntry, F.wallInside),
    insideToRoset: d3(F.wallInside, F.roset),
    slack: F.dropSlackM,
  };
  return { parts, totalM: r1(Object.values(parts).reduce((s, x) => s + x, 0)) };
}
/** the distribution cable: ODC → down into the duct → along the sidewalk → up the riser on the pole → ODP, plus slack */
export function distParts() {
  const F = FTTH_RUMAH;
  const parts = { odcDown: F.ductDepth, duct: Math.abs(F.odc.X - F.pole.X), riser: F.ductDepth + F.odp.y, slack: F.distSlackM };
  return { parts, totalM: r1(Object.values(parts).reduce((s, x) => s + x, 0)) };
}

/**
 * Fase 3 chunk B1b: the city point (X, y, Z) at `m` metres along the drop from the ODP port, following the same route
 * dropParts() measures: up the pole face to the service loop under the clamp, the loop itself (3 m coiled in one spot),
 * on to the clamp, the sagging span, down the front wall, through it, along the inside to the roset. Inside a segment
 * the point is interpolated by fraction of the segment (the sag by its parameter, not exact arc length: ⚠ approximation
 * well under the 0.1 m the UI shows). Used to put the VFL red glow where the engine says the light leaks.
 */
export function dropPointAt(m: number): P3 {
  const F = FTTH_RUMAH, p = F.pole, { parts } = dropParts();
  const face = (y: number): P3 => [p.X, y, p.Z + p.rTop + 0.03];
  const odpY = WALK_Y + F.odp.y, coilY = WALK_Y + F.clampY - 0.55, clampY = WALK_Y + F.clampY;
  const clamp: P3 = [p.X, clampY, p.Z + p.rTop + 0.1];
  const lerp = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sag = (t: number): P3 => { const q = lerp(clamp, F.houseHook, t); return [q[0], q[1] - 4 * F.sag * t * (1 - t), q[2]]; };
  const upA = coilY - odpY, upB = parts.upPole - upA;
  const segs: [number, (t: number) => P3][] = [
    [upA, t => face(odpY + upA * t)],
    [parts.slack, () => face(coilY)],
    [upB, t => face(coilY + upB * t)],
    [parts.span, sag],
    [parts.downWall, t => lerp(F.houseHook, F.wallEntry, t)],
    [parts.throughWall, t => lerp(F.wallEntry, F.wallInside, t)],
    [parts.insideToRoset, t => lerp(F.wallInside, F.roset, t)],
  ];
  let left = Math.max(0, m);
  for (const [len, at] of segs) { if (left <= len) return at(len > 0 ? left / len : 0); left -= len; }
  return [...F.roset] as P3;
}
/** point `m` metres along the indoor patch cord from the roset toward the ONT (straight line, ⚠ simplification) */
export function indoorPointAt(m: number): P3 {
  const F = FTTH_RUMAH, t = Math.min(1, Math.max(0, m / F.indoorM));
  return [F.roset[0] + (F.ont[0] - F.roset[0]) * t, F.roset[1] + (F.ont[1] - F.roset[1]) * t, F.roset[2] + (F.ont[2] - F.roset[2]) * t];
}
