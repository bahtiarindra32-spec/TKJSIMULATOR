// "Ringkasan AI" for the teacher's class recap (Lab Praktik › Guru: rekap kelas).
// Privacy: only AGGREGATED, ANONYMOUS numbers leave the browser: per step how many students did it, how many did not
// finish it, and the average checkpoints met. No names, no desk numbers, no per-student grades, no result codes.
// Honesty: the deterministic count summary is always shown (it is the ground truth); the AI text is extra, labelled
// "Dibuat AI · periksa kembali", and never replaces the numbers. Without AI (off / no consent / no key / server down)
// the panel says so plainly.
import './recapAi.css';
import { LAB_STEPS } from '../game/lab';
import type { ResultData } from '../game/recap';
import { aiReady, aiWhyOff, aiLabel, chat, plain, type ChatMsg } from './nusa';

export interface StepStat { step: string; name: string; cp: string; students: number; notDone: number; avgGot: number; of: number; avgPct: number }
export interface RecapStats { students: number; avgNilai: number; kompeten: number; overtime: number; steps: StepStat[] }

const r1 = (x: number) => Math.round(x * 10) / 10;
/** per-step aggregates over all students; the order is "most students not finished" first, then lowest average */
export function recapStats(rows: ResultData[]): RecapStats {
  const steps: StepStat[] = [];
  for (const st of LAB_STEPS) {
    const got = rows.map(r => r.steps.find(s => s.step === st.id)).filter((s): s is NonNullable<typeof s> => !!s);
    if (!got.length) continue;
    const of = Math.max(...got.map(s => s.of));
    const avgGot = got.reduce((a, s) => a + s.got, 0) / got.length;
    const avgPct = got.reduce((a, s) => a + (s.of ? s.got / s.of : 0), 0) / got.length;
    steps.push({ step: st.id, name: st.name, cp: st.cp, students: got.length, notDone: got.filter(s => !s.done).length, avgGot: r1(avgGot), of, avgPct: Math.round(avgPct * 100) });
  }
  steps.sort((a, b) => b.notDone / b.students - a.notDone / a.students || a.avgPct - b.avgPct);
  const n = rows.length;
  return { students: n, avgNilai: n ? Math.round(rows.reduce((a, r) => a + r.nilai, 0) / n) : 0, kompeten: rows.filter(r => r.predikat !== 'Belum Kompeten').length, overtime: rows.filter(r => r.overtime).length, steps };
}

const SYS_RECAP = `Kamu asisten guru produktif TKJ (Teknik Komputer dan Jaringan) di SMK. Kamu menerima rekap ANONIM hasil praktik satu kelas di simulator (tanpa nama siswa).
Tulis ringkasan bahasa Indonesia untuk guru, maksimal 6 butir pendek:
1) checkpoint/langkah yang paling sering belum tuntas, sebut angkanya persis dari data;
2) dugaan miskonsepsi yang umum untuk langkah itu (tandai sebagai dugaan);
3) 2-3 saran remedial konkret untuk pertemuan berikutnya, kaitkan dengan CP (Fase E/F) yang tertulis.
Aturan: pakai HANYA angka dari data. Jangan mengarang angka, nama, atau data lain. Jangan menilai siswa perorangan. Tanpa markdown tebal, tanpa emoji.`;

/** the exact messages sent to the AI; pure, so tests can check that no name / desk / per-student grade is inside */
export function buildRecapPrompt(rows: ResultData[]): ChatMsg[] {
  const s = recapStats(rows);
  const data = {
    jumlah_siswa: s.students, rata_rata_nilai_kelas: s.avgNilai, jumlah_kompeten: s.kompeten, lewat_waktu: s.overtime,
    langkah: s.steps.map(x => ({ langkah: x.name, cp: x.cp, dikerjakan: x.students, belum_tuntas: x.notDone, rata_checkpoint: `${x.avgGot}/${x.of}`, rata_persen: x.avgPct })),
  };
  return [{ role: 'system', content: SYS_RECAP }, { role: 'user', content: `DATA REKAP KELAS (anonim):\n${JSON.stringify(data)}` }];
}

/** deterministic summary from the counts only (shown always; the whole summary when AI is off) */
export function offlineRecapSummary(rows: ResultData[]): string {
  const s = recapStats(rows);
  if (!s.students) return 'Belum ada data siswa.';
  const out = [`${s.students} siswa · rata-rata nilai ${s.avgNilai} · kompeten ${s.kompeten}/${s.students}${s.overtime ? ` · lewat waktu ${s.overtime}` : ''}.`];
  const weak = s.steps.filter(x => x.notDone > 0);
  if (!weak.length) out.push('Semua langkah tuntas oleh semua siswa yang mengerjakannya.');
  else {
    out.push('Langkah yang paling sering belum tuntas:');
    for (const x of weak.slice(0, 3)) out.push(`- ${x.name} (${x.cp}): ${x.notDone}/${x.students} siswa belum tuntas, rata-rata checkpoint ${x.avgGot}/${x.of}.`);
  }
  return out.join('\n');
}

export async function aiRecapSummary(rows: ResultData[]): Promise<string> {
  return plain(await chat(buildRecapPrompt(rows), { maxTokens: 400, temperature: 0.3, timeoutMs: 30000 }));
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

/** button + output box for openRecap; the button fills the box (counts first, then the AI text or why AI is off) */
export function recapAiPanel(rows: ResultData[]): { button: HTMLButtonElement; out: HTMLElement } {
  const out = document.createElement('div'); out.className = 'recap-ai'; out.id = 'lab-recap-ai-out'; out.hidden = true;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.name = 'lab-recap-ai'; b.textContent = 'Ringkasan AI';
  b.onclick = async () => {
    out.hidden = false;
    const base = `<div class="ra-sec"><small>RINGKASAN DARI ANGKA (dihitung, tanpa AI)</small><p>${nl(offlineRecapSummary(rows))}</p></div>`;
    if (!aiReady()) { out.innerHTML = `${base}<p class="ra-off">AI mati: ${esc(aiWhyOff())}. Ringkasan di atas dihitung langsung dari kode hasil, tanpa AI.</p>`; out.scrollIntoView?.({ block: 'nearest' }); return; }
    out.innerHTML = `${base}<p class="ra-wait">AI (${esc(aiLabel())}) menyusun ringkasan dari angka anonim di atas…</p>`;
    b.disabled = true;
    try {
      const t = await aiRecapSummary(rows);
      out.innerHTML = `${base}<div class="ra-sec ra-ai"><small><i class="ai-tag" title="Dibuat oleh AI, bisa keliru">AI</i> Dibuat AI · periksa kembali · ${esc(aiLabel())}</small><p>${nl(t)}</p><small class="ra-note">Yang dikirim ke AI hanya angka per langkah (jumlah siswa, belum tuntas, rata-rata checkpoint). Tanpa nama, meja, atau nilai per siswa.</small></div>`;
    } catch (e) {
      out.innerHTML = `${base}<p class="ra-off">AI tidak bisa dihubungi (${esc(String((e as Error).message ?? e).slice(0, 80))}). Pakai ringkasan dari angka di atas.</p>`;
    } finally { b.disabled = false; out.scrollIntoView?.({ block: 'nearest' }); }
  };
  return { button: b, out };
}
