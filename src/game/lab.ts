// Lab Praktik: a teacher composes a practice sheet (jobsheet), gets a 6-character code; a student types the code
// (and name) at the lab and works the steps in order on one desk of the school lab building. The code holds the whole scenario, so no server is needed.
// Grading is deterministic: rubric checkpoints read from netsim (src/game/praktik.ts). AI may only turn the teacher's sentence into form ticks; it never grades.
export const LAB_STEPS = [
  { id: 'crimp', name: 'Crimping patch cord T568B', cp: 'Fase E · Media transmisi' },
  { id: 'desk', name: 'Pengkabelan terstruktur: outlet → patch panel → switch', cp: 'Fase F · Pengkabelan terstruktur' },
  { id: 'static', name: 'Alamat IP statis', cp: 'Fase E · Pengalamatan IPv4' },
  { id: 'dhcp', name: 'DHCP server di router', cp: 'Fase F · DHCP' },
  { id: 'vlan', name: 'VLAN di switch lab', cp: 'Fase F · VLAN' },
  { id: 'vlsm', name: 'Rancang pengalamatan VLSM', cp: 'Fase F · Subnetting & VLSM' },
  { id: 'intervlan', name: 'Routing antar-VLAN (router-on-a-stick)', cp: 'Fase F · Routing antar-VLAN' },
  { id: 'acl', name: 'Firewall antar-VLAN (ACL extended)', cp: 'Fase F · Keamanan jaringan (ACL)' },
  { id: 'dns', name: 'DNS lokal', cp: 'Fase F · DNS' },
  { id: 'trouble', name: 'Troubleshooting 2 gangguan', cp: 'Fase F · Troubleshooting' },
] as const;
export type LabStepId = typeof LAB_STEPS[number]['id'];
/** bit of each step inside the code: the first seven keep their old bits, so 6-character codes from before still open */
const BIT: Record<LabStepId, number> = { crimp: 0, desk: 1, static: 2, dhcp: 3, vlan: 4, dns: 5, trouble: 6, vlsm: 7, intervlan: 8, acl: 9 };
export interface LabSpec { steps: LabStepId[]; minutes: number; perStudent: boolean; seed: number }

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32: no I, L, O, U
// 6 characters (30 bits): steps 7 · time 4 (×10 min, 0 = no limit) · per-student 1 · seed 16 · check 2
// 7 characters (35 bits): steps 10 · time 4 · per-student 1 · seed 16 · check 2 · 2 spare. Used only when a newer step is on the sheet.
export function encodeLab(s: LabSpec): string {
  let mask = 0; s.steps.forEach(id => { mask |= 1 << BIT[id]; });
  const t = Math.max(0, Math.min(15, Math.round(s.minutes / 10)));
  const long = mask >= 128;
  const body = ((mask * 16 + t) * 2 + (s.perStudent ? 1 : 0)) * 65536 + (s.seed & 0xffff);
  let v = body * 4 + (popcount(body) & 3), out = '';
  for (let i = 0; i < (long ? 7 : 6); i++) { out = ALPHA[v % 32] + out; v = Math.floor(v / 32); }
  return out;
}
export function decodeLab(code: string): LabSpec | null {
  const c = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (c.length !== 6 && c.length !== 7) return null;
  let v = 0; for (const ch of c) { const k = ALPHA.indexOf(ch); if (k < 0) return null; v = v * 32 + k; }
  const chk = v % 4, body = Math.floor(v / 4);
  if ((popcount(body) & 3) !== chk) return null;
  const seed = body % 65536, rest = Math.floor(body / 65536), per = rest % 2, t = Math.floor(rest / 2) % 16, mask = Math.floor(rest / 32);
  if (!mask || mask >= 1024 || (c.length === 6 && mask >= 128) || (c.length === 7 && mask < 128)) return null;
  return { steps: LAB_STEPS.filter(x => mask & (1 << BIT[x.id])).map(x => x.id), minutes: t * 10, perStudent: !!per, seed };
}
function popcount(n: number) { let c = 0; for (let x = n; x > 0; x = Math.floor(x / 2)) c += x % 2; return c; }
/** the seed one student plays: the sheet's seed, mixed with the name when the teacher chose a different case per student */
export function studentSeed(s: LabSpec, name: string) {
  if (!s.perStudent) return s.seed;
  let h = s.seed ^ 0x9e3779b9; for (const ch of name.trim().toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** offline reading of the teacher's sentence: keywords only, the teacher still checks the boxes */
export function parseInstruction(t: string): Partial<LabSpec> {
  const s = t.toLowerCase(), steps: LabStepId[] = [];
  if (/crimp|rj-?45|t568|bikin kabel|buat kabel|kabel utp/.test(s)) steps.push('crimp');
  if (/patch panel|outlet|terstruktur|tersambung|sambung|label/.test(s)) steps.push('desk');
  if (/statis|static|ip manual|alamat ip|ip address/.test(s)) steps.push('static');
  if (/dhcp/.test(s)) steps.push('dhcp');
  if (/vlsm|subnet/.test(s)) steps.push('vlsm');
  if (/antar.?vlan|inter.?vlan|router.on.a.stick|sub.?interface/.test(s)) steps.push('intervlan');
  else if (/vlan/.test(s)) steps.push('vlan');
  if (/acl|firewall|access.list|blokir/.test(s)) steps.push('acl');
  if (/dns|domain|nama server/.test(s)) steps.push('dns');
  if (/trouble|gangguan|perbaik|rusak/.test(s)) steps.push('trouble');
  const m = /(\d{1,3})\s*(menit|mnt|min)/.exec(s), j = /(\d)\s*jam/.exec(s);
  const order = LAB_STEPS.map(x => x.id as LabStepId);
  const out: Partial<LabSpec> = { steps: [...new Set(steps)].sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
  if (m) out.minutes = +m[1]; else if (j) out.minutes = +j[1] * 60;
  if (/beda|acak|tiap siswa|masing/.test(s)) out.perStudent = true;
  return out;
}
export const LAB_AI_PROMPT = `Ubah instruksi guru TKJ menjadi JSON saja, tanpa teks lain: {"steps":[...],"minutes":angka,"perStudent":true/false}. Nilai steps hanya dari: ${LAB_STEPS.map(s => `"${s.id}" (${s.name})`).join(', ')}. Urutkan sesuai daftar itu. Jangan menambah langkah yang tidak diminta. minutes 0 jika tidak disebut, maksimal 150.`;
export interface LabResult { step: LabStepId; stars: number; ms: number; wrong: number; sla: boolean; done: boolean }
