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
export interface WorldDevice { id: string; x: number; z: number; level: number; r?: number; hint: () => string; use: () => void }
export const DEVICES: WorldDevice[] = [];
