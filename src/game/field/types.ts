// Fase 1 "Karier lapangan": shared data shapes of the field-work layer (orders, garansi plans, nota, saved state).
// Everything here is plain JSON so the save (kotaNusantara.field.v1) round-trips without loss.

/** customer type = site type; reputasi is kept per type */
export type Cust = 'rumah' | 'kos' | 'warnet';
export const CUSTS: Cust[] = ['rumah', 'kos', 'warnet'];
export const CUST_LABEL: Record<Cust, string> = { rumah: 'Rumah', kos: 'Kos', warnet: 'Warnet' };

export type FieldTplId = 'r_router' | 'r_tv' | 'r_kabel' | 'k_ap2' | 'k_kanal' | 'w_port' | 'w_kabel' | 'w_loop'
  /** Fase 2: MikroTik orders on the site routers (state-graded with routeros checkState) */
  | 'w_hotspot' | 'k_queue' | 'k_fasttrack' | 'w_reset';

export interface Order {
  id: string;
  tpl: FieldTplId;
  cust: Cust;
  kind: 'order' | 'garansi';
  title: string;
  who: string;
  address: string;
  /** what the customer said / asked for (shown on the board and the order card) */
  lines: string[];
  /** offered fee in Rp (0 for garansi) */
  tarif: number;
  /** work day it was offered */
  day: number;
  seed: number;
  status: 'offer' | 'active' | 'done' | 'failed';
  /** garansi: the order it re-opens and the last day it may be handled before reputasi drops */
  garansiOf?: string;
  due?: number;
  /** garansi: what went wrong ('crimp' = sloppy cable, 'config' = switch config not saved) */
  reason?: 'crimp' | 'config';
  /** garansi: data needed to re-create the same fault (port, pc, variant) */
  redo?: Record<string, string | number>;
}

/** a callback scheduled when a job closed with a weak check */
export interface GaransiPlan {
  of: string;
  tpl: FieldTplId;
  cust: Cust;
  reason: 'crimp' | 'config';
  showDay: number;
  redo: Record<string, string | number>;
}

export interface Mat {
  rj45: number;
  utp: number;
  patch: number;
  router: number;
}
export const noMat = (): Mat => ({ rj45: 0, utp: 0, patch: 0, router: 0 });

/** the invoice handed over when a job closes (or a record of a failed one) */
export interface Nota {
  id: string;
  day: number;
  title: string;
  who: string;
  tarif: number;
  stars: number;
  jasa: number;
  mat: Mat;
  material: number;
  denda: number;
  net: number;
  garansi: boolean;
  failed: boolean;
}

export type Rep = Record<Cust, number>;

export interface FieldSave {
  v: 1;
  /** field work opened (sticky once the hotel rank was reached, or by the QA override) */
  unlocked: boolean;
  /** the unlock toast was shown */
  told: boolean;
  /** the RT/RW-net teaser note was opened */
  legalSeen: boolean;
  saldo: number;
  rep: Rep;
  day: number;
  /** last work day whose offers were generated (a reload must not hand out a second set) */
  gen: number;
  seq: number;
  done: number;
  failed: number;
  offers: Order[];
  garansi: GaransiPlan[];
  nota: Nota[];
}
