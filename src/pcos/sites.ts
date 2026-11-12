// Fase 1 customer sites in the network simulation (pure TS, no DOM): Wi-Fi client registration for the laptops and
// the smart TV, and the read-outs a technician gets by walking up to a device (ONT LEDs, router LAN ports, AP state,
// what the TV says about its connection). Everything is computed from net.ts / wifi.ts state, nothing is scripted.
import { SITE_PCS, SITE_TV, SITE_AP_DEFS, SITE_WIFI_KEY, KOS, FLOOR_Y, type SiteId } from '../data/sites';
import { ENVS, SWITCHES, adapterOf, envOf, live, healthy, apPowered, portLink, routerOf } from './net';
import { registerClient, SITE_APS, CLIENTS, servingAp, quality } from './wifi';
import { initSiteRouters, siteRouter } from './siterouters';
import { wanStatus, identity } from './routeros';
import { initFtthSite, rumahOnt } from './ftthsite';
import type { Led } from './ftth';

/** desk-top height of a site PC/laptop (city floor 1 or the kos upper floor) */
export const deskY = (floor: 1 | 2) => (floor === 2 ? KOS.upper : FLOOR_Y) + 0.78;

/** register every site laptop and the TV as Wi-Fi clients (world = city - (200,150)); call after initSwitches */
export function initSiteClients() {
  initSiteRouters();
  initFtthSite();
  for (const p of SITE_PCS) if (p.wifi) registerClient(p.name, p.X - 200, deskY(p.floor), p.Z - 150, p.floor, { site: p.site, ssid: ssidOf(p.site), key: keyOf(p.site) });
  registerClient(SITE_TV.name, SITE_TV.X - 200, SITE_TV.y, SITE_TV.Z - 150, SITE_TV.floor, { site: SITE_TV.site, ssid: ssidOf(SITE_TV.site), key: keyOf(SITE_TV.site) });
  for (const id of [...SITE_PCS.map(p => p.name), SITE_TV.name]) adapterOf(id);
}
/** the SSID the residents use at a site (the house uses its own router, not the ONT's radio) */
export const ssidOf = (site: SiteId) => (site === 'rumah' ? 'HENDRA_HOME' : site === 'kos' ? 'KOS_MAWAR' : '');
/** the Wi-Fi password saved on the residents' devices */
export const keyOf = (site: SiteId) => (site === 'rumah' ? SITE_WIFI_KEY.rumah : site === 'kos' ? SITE_WIFI_KEY.kos : '');

/** an ONT LED as words for the read-out */
const ledText = (l: Led, green: string, greenBlink: string) =>
  l === 'green' ? `hijau${green ? ` (${green})` : ''}` : l === 'green-blink' ? `hijau berkedip${greenBlink ? ` (${greenBlink})` : ''}` : l === 'red' ? 'merah (tidak ada sinyal optik)' : l === 'red-blink' ? 'merah berkedip (daya optik terlalu kuat)' : 'mati';
export interface Readout { title: string; rows: [string, string][]; note: string }
const sw = (n: string) => SWITCHES.find(s => s.name === n) ?? null;
const apLine = (id: string) => {
  const ap = SITE_APS.find(a => a.id === id); if (!ap) return 'tidak ada';
  if (!apPowered(ap)) return 'mati (tidak ada link/daya di port LAN-nya)';
  const n = [...CLIENTS.values()].filter(c => c.site === ap.site && servingAp(c.pc) === ap).length;
  return `menyala · SSID ${ap.ssid} · kanal ${ap.ch} · ${n} klien`;
};
/** what a technician reads off a device at a site */
export function readout(id: string): Readout {
  if (id === 'ONT') {
    const st = rumahOnt();
    const o = sw('ONT-RUMAH'); const lan = (n: number) => (o && portLink(o, o.ports[n - 1]) ? 'hijau' : 'mati');
    return {
      title: 'ONT NusaFiber NF-609 (GPON) · ruang tamu',
      rows: [['POWER', 'hijau'], ['PON', ledText(st?.leds.pon ?? 'off', 'terdaftar ke OLT ISP', 'ada cahaya, SN belum terdaftar')], ['LOS', (st?.leds.los ?? 'off') === 'off' ? 'mati (sinyal optik ada)' : ledText(st!.leds.los, '', '')], ['INTERNET', ENVS.rumah.internet ? 'hijau' : 'mati'],
        ['LAN1', `${lan(1)} · kabel ke router Wi-Fi keluarga`], ['LAN2-4', 'kosong'], ['WLAN', apLine('AP-RUMAH-ONT')], ['Gateway', `${routerOf(ENVS.rumah)?.ip}/${ENVS.rumah.prefix} · DHCP ${ENVS.rumah.dhcp ? `${ENVS.rumah.dhcp.start}–${ENVS.rumah.dhcp.end}` : 'mati'}`]],
      note: `${st && st.state !== 'online' ? `Optik: ${st.reason}. ` : ''}Halaman admin ONT dibuka dari laptop di rumah ini (browser → alamat gateway). Kabel drop fiber masuk lewat roset di dinding.`,
    };
  }
  if (id === 'RUMAH_ROUTER') return { title: 'Router Wi-Fi keluarga (mode access point)', rows: [['Kabel', 'LAN router ↔ LAN1 ONT'], ['Wi-Fi', apLine('AP-RUMAH-RTR')], ['Alamat', '192.168.1.2 (manajemen)']], note: 'Mode AP: DHCP dan NAT tetap di ONT, router hanya memancarkan Wi-Fi.' };
  if (id === 'KOS_ROUTER') {
    const r = sw('RTR-KOS'); const port = (n: number) => (r && portLink(r, r.ports[n - 1]) ? 'link' : 'tidak ada link');
    const d = siteRouter('kos'); const w = d ? wanStatus(d) : null;
    return {
      title: `MikroTik hAP lite (RB941-2nD) · ${d ? identity(d) : 'router kos'} · lantai 1 (dinding ruang bersama)`,
      rows: [['ether1 (WAN)', w?.ok ? 'kabel ke modem ISP · internet aktif' : `kabel ke modem ISP · ${w?.why ?? 'tidak ada internet'}`], ['ether2', `${port(1)} → AP lantai 1`], ['ether3', `${port(2)} → AP lantai 2`], ['ether4', 'kosong'],
        ['Gateway', `${ENVS.kos.gateway}/${ENVS.kos.prefix} (bridge-lan)`], ['Wi-Fi bawaan', 'wlan1 dimatikan pemilik (diganti AP per lantai)']],
      note: 'RouterOS: konfigurasi lewat Winbox/terminal (DHCP server, DNS, NAT masquerade ke ether1).',
    };
  }
  if (id.startsWith('AP-')) { const d = SITE_AP_DEFS.find(x => x.id === id)!; return { title: `${d.label} · ${id}`, rows: [['Status', apLine(id)], ['Kabel', `${d.sw} port ${d.port}`]], note: 'AP mendapat daya dari adaptor di dekatnya; datanya lewat kabel LAN ke router.' }; }
  if (id === 'TV') {
    const a = adapterOf(SITE_TV.name), l = live(a), q = quality(SITE_TV.name);
    return {
      title: 'Smart TV · ruang tamu (Pengaturan › Jaringan)',
      rows: [['Wi-Fi', q ? `${q.ap.ssid} · sinyal ${q.pct}%` : 'tidak tersambung'], ['Alamat IP', l.ok && !l.apipa ? l.ip : l.apipa ? `${l.ip} (tidak dapat DHCP)` : '-'], ['Gateway', l.gw || '-'], ['Internet', healthy(a) ? 'tersambung' : 'tidak ada internet']],
      note: `Segmen: ${envOf(SITE_TV.name).label}.`,
    };
  }
  return { title: id, rows: [], note: '' };
}
