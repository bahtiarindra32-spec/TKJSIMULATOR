// Shared data shapes of the NOC work board: jobs (tickets, work orders, follow-up complaints), their targets, tools.
import { HOTEL_ORIGIN, LEVELS, wx, wz } from '../../data/city';
import type { Ap } from '../../pcos/wifi';
import type { FaultId } from './faults';
import type { TplId, Tut, Prio } from './contracts';

export interface PcInfo {
  name: string;
  label: string;
  x: number;
  y: number;
  z: number;
  level: number;
}
export type Mode = 'any' | 'dhcp' | 'static' | 'browse' | 'env';
export interface Target {
  pc: PcInfo;
  mode: Mode;
  ip?: string;
  mask?: string;
  gw?: string;
  dns?: string;
  browse?: string;
  env?: string;
  ok: boolean;
  tested: boolean;
  note: string;
}
export interface Job {
  id: string;
  kind: 'ticket' | 'contract' | 'follow';
  tpl: TplId | FaultId | 'follow';
  title: string;
  who: string;
  prio: Prio;
  sla: number;
  age: number;
  status: 'open' | 'closed';
  targets: Target[];
  faults: FaultId[];
  order: string[];
  envId: string;
  sw?: string;
  vlanName?: string;
  record?: { name: string; ip: string };
  router?: { ip: string; prefix: number; start: string; end: string };
  tut?: Tut;
  wrong: number;
  log: string[];
  snap: string[];
  hint: boolean;
  swPort?: Record<string, number>;
  detail?: string;
  xp?: number;
  stars?: number;
  slaMet?: boolean;
  collateral?: string[];
  reported?: boolean;
  aiVoice?: boolean;
  swTouched?: boolean;
  apId?: string;
  /** work stages: survei (been at the device) → kerja → uji → dokumentasi (berita acara signed) */
  surveyed?: boolean;
  docReady?: boolean;
  berita?: string;
  /** competency test for this rank index: pass = at least two stars and no help asked */
  exam?: number;
  /** legacy alias for the HUD/waypoint code: the next place to go */
  pc: PcInfo;
}
export type Item = 'tester' | 'console' | 'laptop' | 'patch' | 'toner' | 'analyzer' | 'ap';
export const ITEM_NAME: Record<Item, string> = {
  toner: 'Toner generator + probe',
  tester: 'LAN tester',
  console: 'Kabel console USB–RJ45',
  laptop: 'Laptop teknisi',
  patch: 'Patch cord Cat6 (1 m)',
  analyzer: 'HP teknisi (Wi-Fi analyzer)',
  ap: 'AP pengganti NusaAP AX1800 (PoE)',
};
/** world position of a corridor AP (ceiling height of its floor) */
export const apWorld = (ap: Ap) => ({
  x: wx(HOTEL_ORIGIN[0] + ap.lx),
  z: wz(HOTEL_ORIGIN[1] + ap.lz),
  y: LEVELS[ap.level - 1].elev + LEVELS[ap.level - 1].h - 0.23,
});
/** a work order offered on the board (preview; the job is generated from the same seed when accepted) */
export interface Offer {
  tpl: TplId;
  seed: number;
  title: string;
  lines: string[];
  envLabel: string;
}
export type Note = { id: string; title: string; note: string; t: number };
