// Fase 3 FTTH (chunk B1a): the fibre that feeds the Fase 1 house (BLD_RUMAH_01) as a live FTTH network in the netsim.
// OLT at the STO (off the map, abstract) → feeder 4 km → ODC-FLB (1:4, green cabinet on Jl. Flamboyan) → distribution in a
// duct + riser → ODP-FLB-01 (1:8 on the pole, 6 of 8 ports live, two neighbours plugged) → drop → roset → patch cord → ONT.
// Span lengths come from the 3D layout (data/ftthsite.ts). The house's internet is gated on the ONT state through the
// site's existing internet flag (ENVS.rumah.internet, read by net.ts for every site segment): it becomes
// "ISP line up AND ontInternetOk". The ONT keeps routing/DHCP on the LAN when the fibre is down, like a real ONT in LOS.
import { createFtth, addOdp, addCustomer, ontStatus, ontInternetOk, pollOnts, type FtthNet, type OntStatus } from './ftth';
import { ENVS } from './net';
import { dropParts, distParts, FTTH_RUMAH } from '../data/ftthsite';

/** customer id of the house in the FTTH network */
export const RUMAH_CUST = 'rumah';
export const RUMAH_ODP = 'ODP-FLB-01';
/** ⚠ design: the ODP sits on a 1:8 splitter with 6 outputs spliced; ports 2 and 3 are the neighbours' drops (no house in 3D) */
export const RUMAH_ODP_LIVE = 6;

/** a fresh, healthy network for the house (same values every call; pure) */
export function buildRumahFtth(): FtthNet {
  const net = createFtth();   // feeder 4 km, joints 1.5 / 3 km, ODC 1:4, OLT +3 dBm (engine defaults)
  net.odc.id = 'ODC-FLB'; net.odc.label = 'ODC-FLB (Jl. Flamboyan)';
  addOdp(net, { id: RUMAH_ODP, ratio: 8, distM: distParts().totalM, livePorts: RUMAH_ODP_LIVE, label: 'ODP-FLB-01' });
  addCustomer(net, { id: RUMAH_CUST, odp: RUMAH_ODP, port: 1, dropM: dropParts().totalM, indoorM: FTTH_RUMAH.indoorM, label: 'Rumah Kel. Hendra (No. 17)', serial: 'ZTEG4F21A609' });
  // neighbours west along the road (data only, no houses drawn) ⚠ design lengths
  addCustomer(net, { id: 'tetangga15', odp: RUMAH_ODP, port: 2, dropM: 38, label: 'Tetangga No. 15' });
  addCustomer(net, { id: 'tetangga13', odp: RUMAH_ODP, port: 3, dropM: 61, label: 'Tetangga No. 13' });
  return net;
}

let NET: FtthNet | null = null;
let ispUp = true;
let bound = false;
/** bind ENVS.rumah.internet once: setters keep meaning "the ISP line" (field orders, tests), getters add the fibre gate */
function bindEnv() {
  if (bound) return;
  const e = ENVS.rumah;
  ispUp = e.internet;
  Object.defineProperty(e, 'internet', {
    configurable: true, enumerable: true,
    get: () => ispUp && (!NET || ontInternetOk(NET, RUMAH_CUST)),
    set: (v: boolean) => { ispUp = !!v; },
  });
  bound = true;
}
/** (re)build the house fibre healthy and gate the house internet on it; called by initSiteClients (site reset) */
export function initFtthSite() { bindEnv(); NET = buildRumahFtth(); ispUp = true; pollOnts(NET); }
/** the live network of the house (null before initSiteClients). Mutate it with the ftth engine (breakFiber, setDirty, …). */
export const rumahFtth = () => NET;
/** ONT status of the house (LEDs, Rx, reason); null before init */
export const rumahOnt = (): OntStatus | null => (NET ? ontStatus(NET, RUMAH_CUST) : null);
/** the ISP line state alone (without the fibre) */
export const rumahIspUp = () => ispUp;
