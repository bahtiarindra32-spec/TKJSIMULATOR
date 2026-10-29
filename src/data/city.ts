// Kota Nusantara — data mirrors the Pascal PDF tables 1:1 (city coords, metres).
// (0,0) = NW corner, X east, Z south. Left-hand traffic.

export type RoadKind = 'arteri' | 'kolektor' | 'gang';
export interface Road { name: string; a: [number, number]; b: [number, number]; kind: RoadKind }

export const ROAD_SPEC = {
  arteri: { width: 26, carriage: 16, lane: 3.5, lanesPerDir: 2, median: 2, sidewalk: 5 }, // audit: sidewalk 3->5 m (CBD guideline 5-6 m),
  kolektor: { width: 11, carriage: 7, lane: 3.5, lanesPerDir: 1, median: 0, sidewalk: 2 },
  gang: { width: 3, carriage: 3, lane: 3, lanesPerDir: 0, median: 0, sidewalk: 0 },
} as const;

export const ROADS: Road[] = [
  { name: 'ROAD_SUDIRMAN', a: [0, 150], b: [400, 150], kind: 'arteri' },
  { name: 'ROAD_THAMRIN', a: [200, 0], b: [200, 300], kind: 'arteri' },
  { name: 'ROAD_KEBONJERUK', a: [0, 60], b: [400, 60], kind: 'kolektor' },
  { name: 'ROAD_CEMPAKA', a: [0, 240], b: [400, 240], kind: 'kolektor' },
  { name: 'ROAD_MELATI', a: [80, 0], b: [80, 300], kind: 'kolektor' },
  { name: 'ROAD_KEMUNING', a: [320, 0], b: [320, 300], kind: 'kolektor' },
  { name: 'ROAD_GANG_01', a: [28, 161], b: [28, 234.5], kind: 'gang' },
  { name: 'ROAD_GANG_02', a: [52, 161], b: [52, 234.5], kind: 'gang' },
  { name: 'ROAD_GANG_03', a: [0, 198], b: [74.5, 198], kind: 'gang' },
  { name: 'ROAD_GANG_04', a: [40, 245.5], b: [40, 300], kind: 'gang' },
  { name: 'ROAD_GANG_05', a: [0, 272], b: [74.5, 272], kind: 'gang' },
];

export const JUNCTIONS: [number, number][] = [];
for (const x of [80, 200, 320]) for (const z of [60, 150, 240]) JUNCTIONS.push([x, z]);
export const SIGNALISED: [number, number][] = [[80, 150], [200, 150], [320, 150]];

export interface Zone { name: string; x: [number, number]; z: [number, number]; ground: 'park' | 'plaza' | 'paving' | 'dirt' | 'kampung' | 'lot'; color: string }
export const ZONES: Zone[] = [
  { name: 'ZONE_TAMAN', x: [92, 186], z: [8, 50], ground: 'park', color: '#4caf50' },
  { name: 'ZONE_CBD_BARAT', x: [92, 186], z: [70, 133], ground: 'plaza', color: '#2196f3' },
  { name: 'ZONE_CBD_TIMUR', x: [216, 314], z: [70, 133], ground: 'plaza', color: '#3f51b5' },
  { name: 'ZONE_HUNIAN_TIMUR', x: [326, 396], z: [8, 133], ground: 'park', color: '#ff9800' },
  { name: 'ZONE_HOTEL', x: [216, 314], z: [166, 233], ground: 'plaza', color: '#e91e63' },
  { name: 'ZONE_RUKO', x: [92, 186], z: [165, 190], ground: 'paving', color: '#9c27b0' },
  { name: 'ZONE_PASAR', x: [128, 186], z: [192, 232], ground: 'paving', color: '#795548' },
  { name: 'ZONE_MASJID', x: [96, 126], z: [204, 232], ground: 'plaza', color: '#00bcd4' },
  { name: 'ZONE_KAMPUNG_A', x: [2, 74.5], z: [163, 232], ground: 'kampung', color: '#cddc39' },
  { name: 'ZONE_KAMPUNG_B', x: [2, 74.5], z: [248, 298], ground: 'kampung', color: '#8bc34a' },
  { name: 'ZONE_CADANGAN_01', x: [326, 396], z: [165, 233], ground: 'lot', color: '#9e9e9e' },
  { name: 'ZONE_CADANGAN_02', x: [92, 396], z: [250, 298], ground: 'lot', color: '#757575' },
];

export interface Tower { name: string; x: number; z: number; w: number; d: number; h: number; style: 'glass' | 'glass2' | 'apt' }
export const TOWERS: Tower[] = [
  { name: 'BLD_TOWER_W1', x: 96, z: 76, w: 28, d: 28, h: 64, style: 'glass' },
  { name: 'BLD_TOWER_W2', x: 138, z: 76, w: 24, d: 24, h: 48, style: 'glass2' },
  { name: 'BLD_TOWER_W3', x: 138, z: 106, w: 40, d: 22, h: 28, style: 'glass' },
  { name: 'BLD_TOWER_W4', x: 100, z: 110, w: 30, d: 20, h: 24, style: 'glass2' },
  { name: 'BLD_TOWER_E1', x: 222, z: 76, w: 30, d: 30, h: 80, style: 'glass' },
  { name: 'BLD_TOWER_E2', x: 264, z: 76, w: 26, d: 26, h: 56, style: 'glass2' },
  { name: 'BLD_TOWER_E3', x: 222, z: 114, w: 36, d: 16, h: 20, style: 'glass2' },
  { name: 'BLD_TOWER_E4', x: 266, z: 112, w: 30, d: 18, h: 36, style: 'glass' },
  { name: 'BLD_APT_1', x: 330, z: 14, w: 28, d: 30, h: 36, style: 'apt' },
  { name: 'BLD_APT_2', x: 364, z: 14, w: 28, d: 30, h: 36, style: 'apt' },
  { name: 'BLD_APT_3', x: 332, z: 84, w: 58, d: 22, h: 20, style: 'apt' },
  { name: 'BLD_OFFICE_ANNEX', x: 262, z: 168, w: 25, d: 20, h: 40, style: 'glass2' },
];

// Kampung houses (C8)
export const KAMPUNG_HOUSES: [number, number][] = [];
{
  const xs = [5, 12, 19, 30.5, 37.5, 44.5, 54, 61, 68];
  for (const z of [166, 186, 202, 223]) for (const x of xs) KAMPUNG_HOUSES.push([x, z]);
  const xsB = [5, 12, 19, 26, 43, 50, 57, 64];
  for (const z of [261, 275]) for (const x of xsB) KAMPUNG_HOUSES.push([x, z]);
}

// Hotel local origin
export const HOTEL_ORIGIN: [number, number] = [220, 168];
export const LEVELS = [
  { name: 'L1', elev: 0, h: 4.0 },
  { name: 'L2', elev: 4.0, h: 3.2 },
  { name: 'L3', elev: 7.2, h: 3.2 },
  { name: 'L4', elev: 10.4, h: 3.2 },
  { name: 'L5', elev: 13.6, h: 3.2 },
  { name: 'L6', elev: 16.8, h: 3.2 },
  { name: 'L7', elev: 20.0, h: 3.2 },
  { name: 'L8', elev: 23.2, h: 3.2 },
];
export const ROOF_ELEV = 26.4;

export const ANCHORS: [string, number, number][] = [
  ['ANCHOR_WS_PC_01', 24.2, 2.95], ['ANCHOR_WS_PC_02', 27.8, 2.95], ['ANCHOR_WS_PC_03', 24.2, 5.95], ['ANCHOR_WS_PC_04', 27.8, 5.95],
  ['ANCHOR_WS_CRIMPING_01', 23.9, 8.8], ['ANCHOR_WS_TOOLCAB_01', 28.75, 8.5],
  ['ANCHOR_IT_PC_01', 15.7, 3.35], ['ANCHOR_IT_PC_02', 17.9, 3.35], ['ANCHOR_IT_PC_03', 20.1, 3.35],
  ['ANCHOR_IT_PC_04', 15.7, 6.35], ['ANCHOR_IT_PC_05', 17.9, 6.35], ['ANCHOR_IT_PC_06', 20.1, 6.35],
  ['ANCHOR_IT_NOC_01', 15.7, 9.0],
  ['ANCHOR_SRV_RACK_01', 24.3, 16.8], ['ANCHOR_SRV_RACK_02', 24.9, 16.8], ['ANCHOR_SRV_RACK_03', 25.5, 16.8], ['ANCHOR_SRV_RACK_04', 26.1, 16.8],
  ['ANCHOR_SRV_NETRACK_01', 26.7, 16.8], ['ANCHOR_SRV_UPS_01', 28.0, 16.6], ['ANCHOR_LOBBY_RECEPTION_01', 8, 7.0],
];

export const SPAWN: [number, number] = [226, 162.5];

/** city (X,Z) -> three.js world x,z */
export const wx = (X: number) => X - 200;
export const wz = (Z: number) => Z - 150;
