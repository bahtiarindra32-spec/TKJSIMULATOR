// Faults owned by the newer infrastructure modules (Linux server, office devices, edge router).
// The NOC board treats them like its own tickets: the fault is injected into the real simulation, and the
// ticket closes only when the root cause is gone (ok), the client is healthy, and the player tested it.
export interface ExtFaultDef { cause: string; fix: string; symptom: string; hint: string; cp: string; rank: number }
export interface ExtEvent { type: string; pc: string; detail: any }
export interface ExtFault {
  def: ExtFaultDef;
  /** can this PC be the ticket's client? */
  eligible(pc: string): boolean;
  /** break the simulation; returns the hidden finding written in the report */
  inject(pc: string): string;
  /** root cause fixed (checked together with the client's network health unless health = false) */
  ok(pc: string): boolean;
  /** require full PC network health (default true) */
  health?: boolean;
  /** what counts as the player's test from the client (default: a successful ping or any page opened) */
  tested?(e: ExtEvent, pc: string): boolean;
  /** what the HUD says the test is */
  testHint?: string;
  /** called when the ticket is closed or abandoned (e.g. the ISP line comes back) */
  restore?(): void;
}
export const EXT: Record<string, ExtFault> = {};
/** devices outside PCs that the player uses with F (printers, phones, server racks) */
export interface WorldDevice { id: string; x: number; z: number; level: number; r?: number; hint: () => string; use: () => void;
  /** floor height the device is used from (Fase 1 kos has two storeys outside the hotel level system) */
  y?: number }
export const DEVICES: WorldDevice[] = [];
/** Installation work orders owned by the infrastructure modules. The device starts in its real "fresh out of the box /
 *  not configured yet" state; the order closes when the configuration is right, the clients are healthy and the player
 *  tested from each client. */
export interface ExtContract {
  name: string; rank: number; xp: number; sla: number; cp: string; brief: string[];
  /** choose the client PCs from the candidates (already shuffled); empty = not possible now */
  pick(pcs: string[]): string[];
  /** put the simulation in the pre-installation state; returns the work order lines */
  setup(pcs: string[]): string[];
  ok(pc: string): boolean;
  /** what is still missing for this client (HUD) */
  why?(pc: string): string;
  health?: boolean;
  tested?(e: ExtEvent, pc: string): boolean;
  testHint?: string;
  restore?(): void;
}
export const EXT_C: Record<string, ExtContract> = {};
