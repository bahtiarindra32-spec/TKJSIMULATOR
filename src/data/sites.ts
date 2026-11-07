// Fase 1 "Karier lapangan": the four field-work places (pure data, city metres; X east, Z south).
// The world builder (world/sites.ts), the network sim (pcos/net.ts, pcos/wifi.ts, pcos/sites.ts) and main.ts all read
// these numbers, so a device you see on a shelf is the same device the simulation radiates from.
// Lots were picked on empty grass (no ROAD_/ZONE_/BLD_ overlap) and kept >= 150 m apart so the motor ride matters.

export type SiteId = 'nusateknik' | 'rumah' | 'kos' | 'warnet';
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface SiteDef {
  id: SiteId; bld: string; label: string; map: string;
  /** building footprint (outer wall faces) */
  rect: Rect;
  /** wall height of one storey and the number of storeys */
  h: number; floors: number;
  /** facade with the entrance and the door opening along it (X range) */
  front: 'N' | 'S'; door: [number, number];
  /** paved yard / parking in front */
  lots: Rect[];
  /** entry anchor outside the door, facing it (teleport target, QA hook) */
  anchor: { name: string; X: number; Z: number; yaw: number };
  /** just inside the door */
  inside: { X: number; Z: number; yaw: number };
  /** where a motor parks */
  park: { X: number; Z: number; yaw: number };
}

/** floor top inside the buildings: the same 0.15 m the player stands on everywhere off the carriageway */
export const FLOOR_Y = 0.15;

export const SITES: SiteDef[] = [
  {
    id: 'nusateknik', bld: 'BLD_NUSATEKNIK', label: 'Kantor Nusa Teknik', map: 'NUSA TEKNIK',
    rect: { x0: 50, x1: 66, z0: 118, z1: 128 }, h: 3.4, floors: 1, front: 'S', door: [57.4, 58.6],
    lots: [{ x0: 44, x1: 72, z0: 128, z1: 136.8 }],
    anchor: { name: 'ANCHOR_NUSATEKNIK_ENTRY', X: 58, Z: 130.2, yaw: 0 },
    inside: { X: 58, Z: 126.6, yaw: 0 },
    park: { X: 64.5, Z: 132.6, yaw: 0 },
  },
  {
    id: 'rumah', bld: 'BLD_RUMAH_01', label: 'Rumah pelanggan · Kel. Hendra', map: 'RUMAH',
    rect: { x0: 114, x1: 124, z0: 580, z1: 592 }, h: 3.2, floors: 1, front: 'N', door: [116.2, 117.2],
    lots: [{ x0: 112, x1: 124, z0: 576.4, z1: 580 }, { x0: 124, x1: 128.4, z0: 576.4, z1: 587 }],
    anchor: { name: 'ANCHOR_RUMAH_01_ENTRY', X: 116.7, Z: 578.4, yaw: Math.PI },
    inside: { X: 116.7, Z: 581.2, yaw: Math.PI },
    park: { X: 126.2, Z: 582.5, yaw: Math.PI },
  },
  {
    id: 'kos', bld: 'BLD_KOS_01', label: 'Kos Mawar (2 lantai, 6 kamar)', map: 'KOS MAWAR',
    rect: { x0: 132, x1: 148, z0: 304, z1: 316 }, h: 3.2, floors: 2, front: 'S', door: [135, 136.2],
    lots: [{ x0: 128, x1: 152, z0: 316, z1: 323.8 }],
    anchor: { name: 'ANCHOR_KOS_01_ENTRY', X: 135.6, Z: 318.2, yaw: 0 },
    inside: { X: 135.6, Z: 314.8, yaw: 0 },
    park: { X: 146, Z: 320, yaw: 0 },
  },
  {
    id: 'warnet', bld: 'BLD_WARNET_01', label: 'Warnet Sinar (8 PC + kasir)', map: 'WARNET',
    rect: { x0: 344, x1: 360, z0: 303, z1: 317 }, h: 3.4, floors: 1, front: 'S', door: [351.4, 352.6],
    lots: [{ x0: 340, x1: 364, z0: 317, z1: 323.8 }],
    anchor: { name: 'ANCHOR_WARNET_01_ENTRY', X: 352, Z: 319.4, yaw: 0 },
    inside: { X: 352, Z: 315.6, yaw: 0 },
    park: { X: 342.6, Z: 320.6, yaw: 0 },
  },
];
export const siteById = (id: SiteId) => SITES.find(s => s.id === id)!;
export const inRect = (r: Rect, X: number, Z: number, pad = 0) => X > r.x0 - pad && X < r.x1 + pad && Z > r.z0 - pad && Z < r.z1 + pad;
/** the site whose building contains this city point (null = outside all of them) */
export const siteAt = (X: number, Z: number): SiteDef | null => SITES.find(s => inRect(s.rect, X, Z)) ?? null;

// ---------------------------------------------------------------- kos: two storeys and a straight stair
/** upper floor: slab top 3.35 m (ground 0.15 + 3.2 storey); the stair runs west -> east along the south wall */
export const KOS = {
  storey: 3.2, upper: FLOOR_Y + 3.2,
  stair: { x0: 140.6, x1: 144.6, z0: 314.4, z1: 315.8, steps: 16 },
  /** room x origins (4 m wide, z 304..309); index 0-2 ground floor (Kamar 1-3), 3-5 upper floor (Kamar 4-6) */
  roomX: [132, 136, 140],
  locked: [3, 6],
};
/** the floor height a walker at (X,Z) stands on inside the kos (prevY = height last frame); null = not inside */
export function kosFeet(X: number, Z: number, prevY: number): number | null {
  const r = siteById('kos').rect; if (!inRect(r, X, Z)) return null;
  const s = KOS.stair;
  if (X >= s.x0 && X <= s.x1 && Z >= s.z0 && Z <= s.z1) return FLOOR_Y + KOS.storey * Math.min(1, Math.max(0, (X - s.x0) / (s.x1 - s.x0)));
  return prevY > FLOOR_Y + KOS.storey / 2 ? KOS.upper : FLOOR_Y;
}

// ---------------------------------------------------------------- devices the player can use
export type SitePcKind = 'pc' | 'laptop';
export interface SitePc {
  name: string; label: string; site: SiteId; kind: SitePcKind;
  /** desk-centre position (city) and the direction the screen faces (yaw: facing = (-sin, -cos)) */
  X: number; Z: number; yaw: number;
  /** floor the desk stands on: 1 ground, 2 upper (kos) */
  floor: 1 | 2;
  /** Wi-Fi client (laptops) or wired through the site switch (warnet PCs) */
  wifi: boolean;
}
const E = -Math.PI / 2, N = 0, S = Math.PI;   // screen-facing yaws: east, north, south
export const SITE_PCS: SitePc[] = [
  { name: 'PROP_RUMAH_01_LAPTOP_01', label: 'Laptop keluarga · kamar depan', site: 'rumah', kind: 'laptop', X: 117.5, Z: 591.3, yaw: N, floor: 1, wifi: true },
  // kos: one tenant laptop on the desk of each occupied room (Kamar 3 and 6 are empty and locked)
  ...[1, 2, 4, 5].map(k => {
    const a = KOS.roomX[(k - 1) % 3];
    return { name: `PROP_KOS_01_LAPTOP_K${k}`, label: `Laptop penghuni · Kamar ${k}`, site: 'kos' as SiteId, kind: 'laptop' as SitePcKind, X: a + 3.2, Z: 304.55, yaw: S, floor: (k > 3 ? 2 : 1) as 1 | 2, wifi: true };
  }),
  // warnet: four booths along the west wall (screens face east), four along the north wall (screens face south)
  ...[0, 1, 2, 3].map(i => ({ name: `PROP_WARNET_01_PC_${String(i + 1).padStart(2, '0')}`, label: `PC warnet ${String(i + 1).padStart(2, '0')}`, site: 'warnet' as SiteId, kind: 'pc' as SitePcKind, X: 344.6, Z: 305 + i * 2, yaw: E, floor: 1 as const, wifi: false })),
  ...[0, 1, 2, 3].map(i => ({ name: `PROP_WARNET_01_PC_${String(i + 5).padStart(2, '0')}`, label: `PC warnet ${String(i + 5).padStart(2, '0')}`, site: 'warnet' as SiteId, kind: 'pc' as SitePcKind, X: 348 + i * 2, Z: 303.6, yaw: S, floor: 1 as const, wifi: false })),
  { name: 'PROP_WARNET_01_KASIR_PC', label: 'PC kasir (billing) warnet', site: 'warnet', kind: 'pc', X: 357.4, Z: 312.9, yaw: N, floor: 1, wifi: false },
];
/** a Wi-Fi client that is not a PC (status only): the smart TV in the house */
export const SITE_TV = { name: 'PROP_RUMAH_01_SMARTTV', site: 'rumah' as SiteId, X: 123.45, Z: 582.6, y: FLOOR_Y + 0.5 + 0.4, floor: 1 as const };

/** the Wi-Fi password the residents' devices have saved (written on the order when the customer asks to keep it) */
export const SITE_WIFI_KEY = { rumah: 'hendra2580', kos: 'mawar1234' } as const;
/** access points (city coords). sw/port = which LAN port of which site device feeds it */
export interface SiteApDef { id: string; site: SiteId; ssid: string; key: string; ch: number; X: number; Z: number; y: number; floor: 1 | 2; sw: string; port: number; label: string }
export const SITE_AP_DEFS: SiteApDef[] = [
  // the house: the ISP ONT's own radio and the family's Wi-Fi router (in access-point mode, cabled to ONT LAN1)
  { id: 'AP-RUMAH-ONT', site: 'rumah', ssid: 'NusaFiber-4F21', key: 'nf4f21x9', ch: 1, X: 114.45, Z: 580.9, y: FLOOR_Y + 0.8, floor: 1, sw: 'ONT-RUMAH', port: 5, label: 'Wi-Fi bawaan ONT' },
  { id: 'AP-RUMAH-RTR', site: 'rumah', ssid: 'HENDRA_HOME', key: SITE_WIFI_KEY.rumah, ch: 6, X: 114.45, Z: 581.35, y: FLOOR_Y + 0.85, floor: 1, sw: 'ONT-RUMAH', port: 1, label: 'Router Wi-Fi (mode AP)' },
  // the kos: one ceiling AP per floor corridor, both cabled to the router on the ground floor
  { id: 'AP-KOS-LT1', site: 'kos', ssid: 'KOS_MAWAR', key: SITE_WIFI_KEY.kos, ch: 1, X: 138, Z: 310.1, y: FLOOR_Y + 3.0, floor: 1, sw: 'RTR-KOS', port: 1, label: 'AP lantai 1 (plafon koridor)' },
  { id: 'AP-KOS-LT2', site: 'kos', ssid: 'KOS_MAWAR', key: SITE_WIFI_KEY.kos, ch: 6, X: 138, Z: 310.1, y: KOS.upper + 2.95, floor: 2, sw: 'RTR-KOS', port: 2, label: 'AP lantai 2 (plafon koridor)' },
];
/** radio walls per site (city coords, dB). Brick/plastered masonry uses the 10 dB the hotel model gives exterior walls. */
export const SITE_WALLS: Record<string, [number, number, number, number, number][]> = {
  rumah: [[114, 585, 124, 585, 10], [119, 585, 119, 592, 10], [114, 580, 124, 580, 10], [114, 592, 124, 592, 10], [114, 580, 114, 592, 10], [124, 580, 124, 592, 10]],
  kos: [
    [132, 309, 148, 309, 10], [136, 304, 136, 309, 10], [140, 304, 140, 309, 10], [144, 304, 144, 309, 10],
    [132, 304, 148, 304, 10], [132, 316, 148, 316, 10], [132, 304, 132, 316, 10], [148, 304, 148, 316, 10],
  ],
};

/** subnets of the three customer sites (documented in DESIGN.md › Fase 1) */
export const SITE_NETS = {
  rumah: { net: '192.168.1.0', gw: '192.168.1.1' },
  kos: { net: '192.168.0.0', gw: '192.168.0.1' },
  warnet: { net: '192.168.100.0', gw: '192.168.100.1' },
} as const;
