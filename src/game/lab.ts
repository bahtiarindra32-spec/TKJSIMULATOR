// Lab Praktik: a teacher composes a practice sheet, gets a 6-character code; a student types the code (and name)
// and runs the same simulator jobs in order. The code holds the whole scenario, so no server is needed.
// Grading is deterministic: each step is an ordinary NOC job that closes only when netsim is healthy and the
// student tested from the device. AI may only turn the teacher's sentence into form ticks; it never grades.
export const LAB_STEPS = [
  { id: 'crimp', name: 'Crimping patch cord T568B', tpl: 'crimp', cp: 'Fase E · Media transmisi' },
  { id: 'desk', name: 'Pengkabelan terstruktur: outlet → patch panel → switch', tpl: 'desk', cp: 'Fase E · Pengkabelan terstruktur' },
  { id: 'static', name: 'Alamat IP statis', tpl: 'static', cp: 'Fase E · Pengalamatan IPv4' },
  { id: 'dhcp', name: 'DHCP server di Linux', tpl: 'x_dhcpsrv', cp: 'Fase F · Administrasi server' },
  { id: 'vlan', name: 'VLAN di switch', tpl: 'vlan', cp: 'Fase F · VLAN' },
  { id: 'dns', name: 'DNS lokal', tpl: 'dns', cp: 'Fase F · DNS' },
  { id: 'trouble', name: 'Troubleshooting 2 gangguan acak', tpl: '', cp: 'Fase F · Troubleshooting' },
] as const;
export type LabStepId = typeof LAB_STEPS[number]['id'];
export interface LabSpec { steps: LabStepId[]; minutes: number; perStudent: boolean; seed: number }

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32: no I, L, O, U
// 30 bits: steps 7 · time 4 (×10 min, 0 = no limit) · per-student 1 · seed 16 · check 2
export function encodeLab(s: LabSpec): string {
  let mask = 0; s.steps.forEach(id => { mask |= 1 << LAB_STEPS.findIndex(x => x.id === id); });
  const t = Math.max(0, Math.min(15, Math.round(s.minutes / 10)));
  const body = (mask << 21) | (t << 17) | ((s.perStudent ? 1 : 0) << 16) | (s.seed & 0xffff);
  const chk = popcount(body) & 3;
  let v = (body << 2) | chk, out = '';
  for (let i = 0; i < 6; i++) { out = ALPHA[v & 31] + out; v >>>= 5; }
  return out;
}
export function decodeLab(code: string): LabSpec | null {
  const c = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (c.length !== 6) return null;
  let v = 0; for (const ch of c) { const k = ALPHA.indexOf(ch); if (k < 0) return null; v = v * 32 + k; }
  const chk = v & 3, body = v >>> 2;
  if ((popcount(body) & 3) !== chk) return null;
  const mask = (body >>> 21) & 127; if (!mask) return null;
  return { steps: LAB_STEPS.filter((_, i) => mask & (1 << i)).map(x => x.id), minutes: ((body >>> 17) & 15) * 10, perStudent: !!((body >>> 16) & 1), seed: body & 0xffff };
}
function popcount(n: number) { let c = 0; for (let x = n >>> 0; x; x &= x - 1) c++; return c; }
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
  if (/vlan/.test(s)) steps.push('vlan');
  if (/dns|domain|nama server/.test(s)) steps.push('dns');
  if (/trouble|gangguan|perbaik|rusak/.test(s)) steps.push('trouble');
  const m = /(\d{1,3})\s*(menit|mnt|min)/.exec(s), j = /(\d)\s*jam/.exec(s);
  const out: Partial<LabSpec> = { steps };
  if (m) out.minutes = +m[1]; else if (j) out.minutes = +j[1] * 60;
  if (/beda|acak|tiap siswa|masing/.test(s)) out.perStudent = true;
  return out;
}
export const LAB_AI_PROMPT = `Ubah instruksi guru TKJ menjadi JSON saja, tanpa teks lain: {"steps":[...],"minutes":angka,"perStudent":true/false}. Nilai steps hanya dari: ${LAB_STEPS.map(s => `"${s.id}" (${s.name})`).join(', ')}. Urutkan sesuai daftar itu. Jangan menambah langkah yang tidak diminta. minutes 0 jika tidak disebut, maksimal 150.`;
export interface LabResult { step: LabStepId; stars: number; ms: number; wrong: number; sla: boolean; done: boolean }
