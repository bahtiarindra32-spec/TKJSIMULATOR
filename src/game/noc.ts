// Public facade of the NOC work board (Nusantara Tech's IT team: work orders, shift tickets, ranks).
// The implementation lives in src/game/noc/ (see DESIGN.md, "Modul NOC"):
//   faults.ts     fault catalogue + injection into the network sim      contracts.ts  work-order templates
//   scoring.ts    stars / SLA / XP / ranks                               save.ts       progress save (kotaNusantara.noc.v1)
//   checks.ts     whole-order checks                                     types.ts      Job / Target / tools
//   util.ts       helpers
//   core.ts       NocCore: state + job lifecycle   <- workshop.ts NocWorkshop: physical work UI   <- board.ts Noc: panels, HUD, AI mentor
// Other code imports from here only, so the split stays invisible to main.ts, praktik.ts and the QA window hooks.
export { Noc } from './noc/board';
export { FAULTS, EDGE_F, injectFaults, pickFaultFor, faultBites, rfVariant, registerExtFaults, type FaultId, type FaultDef } from './noc/faults';
export {
  TEMPLATES,
  DAY_PHASES,
  PRIO,
  WHO,
  LABPC,
  envForTemplate,
  offerLine,
  registerExtContracts,
  type TplId,
  type TplDef,
  type Tut,
  type Prio,
} from './noc/contracts';
export { XP_RATE, RANKS, rankIndexForXp, slaMet, jobStars, jobBaseXp, jobXp, offerXp, dayEval } from './noc/scoring';
export { KEY as SAVE_KEY, NOTES_KEY, loadSave, loadNotes, writeSave, fresh as freshSave, type Save, type DayRun } from './noc/save';
export { globalProblem, routerProblem, recordProblem, vlanProblem, apProblem, jobAp, unpatchedAp } from './noc/checks';
export type { PcInfo, Job, Target, Mode, Item, Offer, Note } from './noc/types';
