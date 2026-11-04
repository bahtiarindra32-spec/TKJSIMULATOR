// Whole-job checks of work orders: the problems a contract still has besides each target PC's own state.
// Pure functions of the job and the shared simulation state (net.ts / wifi.ts).
import { ENVS, SWITCHES, poolProblem, PUBLIC_DNS, uplinkCarries, portOf, portName, panelOf, apPort } from '../../pcos/net';
import { APS, channelClean, type Ap } from '../../pcos/wifi';
import type { Job } from './types';

/** the AP a job is about (AP replacement order), or null */
export function jobAp(j: Job): Ap | null {
  return j.apId ? (APS.find(a => a.id === j.apId) ?? null) : null;
}
/** the job's AP outlet is not patched to the switch port the order asks for */
export function unpatchedAp(j: Job) {
  const ap = jobAp(j);
  if (!ap) return false;
  const q = panelOf(ap.id);
  return !!q && q.pp.patch !== j.swPort?.[ap.id];
}
/** new router + DHCP order: what is still wrong on the router */
export function routerProblem(j: Job): string {
  const env = ENVS[j.envId as keyof typeof ENVS],
    R = j.router!;
  if (env.gateway !== R.ip || env.prefix !== R.prefix) return `alamat LAN harus ${R.ip}/${R.prefix}`;
  if (!env.dhcp) return 'DHCP server belum aktif';
  if (poolProblem(env)) return `pool DHCP: ${poolProblem(env)}`;
  if (env.dhcp.start !== R.start || env.dhcp.end !== R.end) return `pool harus ${R.start} – ${R.end}`;
  if (env.dhcp.gw !== R.ip) return 'gateway DHCP harus alamat router';
  if (env.dhcp.dns[0] !== R.ip) return 'DNS DHCP harus alamat router';
  if (!env.dnsSrv.allow || !env.dnsSrv.upstream.some(u => PUBLIC_DNS.includes(u))) return 'DNS router: upstream & Allow Remote Requests';
  return '';
}
/** DNS record order: is the A record there and pointing at the server? */
export function recordProblem(j: Job) {
  const env = ENVS[j.envId as keyof typeof ENVS];
  const rec = env.dnsSrv.records.find(x => x.name === j.record!.name || `${x.name}.${env.suffix}` === j.record!.name);
  return !rec ? 'record belum ada' : rec.ip !== j.record!.ip ? 'record menunjuk IP yang salah' : '';
}
/** VLAN move order: VLAN 30 created, named, carried on the uplink, and every target port in it */
export function vlanProblem(j: Job): string {
  const sw = SWITCHES.find(s => s.name === j.sw)!;
  if (!sw.vlans.has(30)) return 'VLAN 30 belum dibuat';
  if (sw.vlans.get(30) !== 'KASIR') return 'nama VLAN 30 harus KASIR';
  if (sw.uplink && !uplinkCarries(sw, 30)) return 'trunk uplink Gi1/0/49 belum membawa VLAN 30';
  for (const t of j.targets) {
    const p = portOf(t.pc.name)!.port;
    if (p.vlan !== 30) return `${portName(p.n)} belum di VLAN 30`;
    if (p.shutdown) return `${portName(p.n)} shutdown`;
  }
  return '';
}
/** AP replacement order: mounted, patched, switch port right, adopted, radio on, clean channel */
export function apProblem(j: Job): string {
  const ap = jobAp(j)!,
    p = apPort(ap);
  if (!ap.mounted) return 'AP belum dipasang';
  if (unpatchedAp(j)) return `outlet AP belum di-patch ke ${portName(j.swPort![ap.id])}`;
  if (!p || p.port.shutdown) return 'port switch AP masih shutdown';
  if (p.port.vlan !== 40) return 'port AP belum di VLAN 40';
  if (p.port.poe === false) return 'PoE port AP mati';
  if (!ap.adopted) return 'AP belum diadopsi di NusaWLC';
  if (!ap.radio) return 'radio AP mati';
  if (!channelClean(ap)) return `kanal ${ap.ch} tumpang tindih dengan AP lain di lokasi AP`;
  return '';
}
/** the order-wide problem of a contract ('' = none) */
export function globalProblem(j: Job) {
  if (j.kind !== 'contract') return '';
  if (j.tpl === 'renum') return routerProblem(j);
  if (j.tpl === 'dns') return recordProblem(j);
  if (j.tpl === 'vlan') return vlanProblem(j);
  if (j.tpl === 'ap') return apProblem(j);
  return '';
}
