// Pak Nusa: the in-game AI mentor (OpenRouter chat completions) with an offline fallback.
// Privacy: only simulated game state is ever sent (job text, simulated IP config, the player's own questions/notes).
// The API key lives only in this browser's localStorage, never in the build or the repository.
// Every AI answer is labelled as AI in the UI; when there is no key / no internet the offline rule engine answers instead.

export interface AiConfig { key: string; model: string; enabled: boolean }
const KEY = 'kotaNusantara.ai.v1';
export const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
export const aiCfg: AiConfig = { key: '', model: DEFAULT_MODEL, enabled: true };
try { const o = JSON.parse(localStorage.getItem(KEY) ?? '{}'); if (o && typeof o === 'object') { if (typeof o.key === 'string') aiCfg.key = o.key; if (typeof o.model === 'string' && o.model.trim()) aiCfg.model = o.model.trim(); if (typeof o.enabled === 'boolean') aiCfg.enabled = o.enabled; } } catch { /* ignore */ }
export function saveAiCfg() { try { localStorage.setItem(KEY, JSON.stringify(aiCfg)); } catch { /* ignore */ } }
export const aiReady = () => aiCfg.enabled && aiCfg.key.trim().length > 10 && navigator.onLine !== false;

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export interface AiStats { calls: number; fails: number; tokens: number; last: string }
export const aiStats: AiStats = { calls: 0, fails: 0, tokens: 0, last: '' };

/** test hook: QA replaces the network call with a fake */
export const aiTransport: { fetch: (url: string, init: RequestInit) => Promise<Response> } = { fetch: (u, i) => fetch(u, i) };

let lastCall = 0;
/** one chat completion; throws on any failure so callers can fall back to the offline engine */
export async function chat(messages: ChatMsg[], o: { maxTokens?: number; temperature?: number; timeoutMs?: number; json?: boolean } = {}): Promise<string> {
  if (!aiReady()) throw new Error('offline');
  const wait = 1500 - (Date.now() - lastCall); if (wait > 0) await new Promise(r => setTimeout(r, wait));   // gentle client-side rate limit
  lastCall = Date.now();
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), o.timeoutMs ?? 20000);
  aiStats.calls++;
  try {
    const r = await aiTransport.fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiCfg.key.trim()}`, 'X-Title': 'Kota Nusantara TKJ Simulator', 'HTTP-Referer': location.origin || 'https://tkjsimulator.my.id' },
      body: JSON.stringify({ model: aiCfg.model, messages, max_tokens: o.maxTokens ?? 350, temperature: o.temperature ?? 0.6, ...(o.json ? { response_format: { type: 'json_object' } } : {}) }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`HTTP ${r.status} ${t.slice(0, 120)}`); }
    const d = await r.json() as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number }; error?: { message?: string } };
    if (d.error) throw new Error(d.error.message ?? 'error');
    const txt = d.choices?.[0]?.message?.content?.trim(); if (!txt) throw new Error('empty');
    aiStats.tokens += d.usage?.total_tokens ?? 0; aiStats.last = 'ok';
    return txt;
  } catch (e) { aiStats.fails++; aiStats.last = String((e as Error).message ?? e); throw e; }
  finally { clearTimeout(to); }
}

/** strip markdown the small HUD can't render, keep line breaks */
export function plain(s: string) { return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/`([^`]+)`/g, '$1').trim(); }

// ---------------------------------------------------------------- mentor
export interface MentorCtx {
  job: { id: string; title: string; kind: string; order: string[]; faults: { id: string; cause: string; fix: string; hint: string; cp: string }[]; log: string[]; next: string } | null;
  pc: string | null; pcState: string | null; rack: string | null; rank: string; place: string;
}
const SYS_MENTOR = `Kamu "Pak Nusa", teknisi senior & mentor di game simulasi TKJ (Teknik Komputer dan Jaringan) untuk siswa SMK kelas 10-11.
Gaya: bahasa Indonesia santai tapi sopan, singkat (maks 5 kalimat atau 4 butir), seperti guru produktif di bengkel.
Aturan:
- Jangan langsung memberi jawaban/perintah perbaikan lengkap. Bimbing dengan pertanyaan diagnosis dan satu langkah berikutnya yang bisa dicek siswa (urut lapisan OSI: fisik dulu, lalu IP, gateway, DNS).
- Kalau siswa sudah mencoba 2x dan tetap buntu (lihat log), boleh sebut perintah/menu spesifik di game.
- Gunakan istilah standar (IP address, subnet mask, default gateway, DNS, VLAN, trunk, patch panel) dan jelaskan singkat bila perlu.
- Hanya bahas jaringan/TKJ dan game ini. Tolak sopan topik lain.
- Data "RAHASIA" hanya untukmu agar petunjukmu akurat; jangan sebut penyebabnya secara gamblang.`;

export function mentorPrompt(ctx: MentorCtx, history: ChatMsg[], question: string): ChatMsg[] {
  const j = ctx.job;
  const state = [
    `Pangkat siswa: ${ctx.rank}. Posisi: ${ctx.place}.`,
    j ? `Pekerjaan aktif ${j.id} (${j.kind}): ${j.title}\nSurat kerja: ${j.order.join(' | ')}\nLangkah berikutnya menurut sistem: ${j.next}\nLog tindakan siswa (terbaru di akhir): ${j.log.slice(-10).join(' ; ') || '-'}\nRAHASIA penyebab: ${j.faults.map(f => `${f.cause} → perbaikan: ${f.fix}`).join(' + ') || '-'}` : 'Tidak ada pekerjaan aktif.',
    ctx.pc ? `Siswa sedang di dekat ${ctx.pc}. Status (simulasi): ${ctx.pcState ?? '-'}` : '',
    ctx.rack ? `Siswa di dekat rak ${ctx.rack}.` : '',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: SYS_MENTOR }, { role: 'system', content: `KONDISI GAME:\n${state}` }, ...history.slice(-6), { role: 'user', content: question }];
}

const CONCEPTS: [RegExp, string][] = [
  [/gateway/i, 'Default gateway = alamat router di segmen yang sama. Tanpa gateway yang benar, PC hanya bisa bicara dengan perangkat satu jaringan, tidak bisa ke internet.'],
  [/dns|nslookup|situs/i, 'DNS mengubah nama (cari.id) jadi alamat IP. Kalau ping 8.8.8.8 bisa tapi situs tidak terbuka, curigai DNS. Coba nslookup.'],
  [/vlan|trunk/i, 'VLAN memisahkan jaringan dalam satu switch. Port access hanya membawa 1 VLAN; port trunk (uplink) membawa banyak VLAN. PC di VLAN yang salah dapat IP dari segmen lain atau tidak dapat sama sekali.'],
  [/dhcp|renew|release|apipa|169\.254/i, 'DHCP membagikan IP otomatis. IP 169.254.x.x (APIPA) artinya PC tidak mendapat jawaban DHCP: cek kabel/port/VLAN, lalu ipconfig /renew.'],
  [/subnet|mask|prefix|\/24/i, 'Subnet mask menentukan bagian network dan host. Dua perangkat bisa langsung bicara hanya jika network-nya sama (misal 192.168.20.x/24).'],
  [/kabel|lan tester|rj45|patch|link/i, 'Selalu mulai dari lapisan fisik: konektor terkunci? LED link menyala? Uji dengan LAN tester; patch panel ke switch harus sesuai label.'],
  [/loop|storm|stp/i, 'Loop (dua port switch tersambung satu sama lain) bikin broadcast storm: jaringan satu lantai lambat/putus. Cari kabel yang menyambung dua port switch yang sama.'],
  [/ping/i, 'Urutan ping yang baik: 127.0.0.1 (stack) → IP sendiri → gateway → 8.8.8.8 (internet) → nama situs (DNS). Titik gagal pertama menunjukkan lapisan bermasalah.'],
];
/** offline answer: the system's own next step + the fault hint + a concept note matching the question */
export function offlineMentor(ctx: MentorCtx, question: string): string {
  const out: string[] = [];
  const c = CONCEPTS.find(([re]) => re.test(question)); if (c) out.push(c[1]);
  if (ctx.job) {
    if (/kenapa|penyebab|why/i.test(question) && ctx.job.faults[0]) out.push(`Arah diagnosisnya: ${ctx.job.faults[0].hint}`);
    out.push(`Langkah berikutnya: ${ctx.job.next}.`);
  } else out.push('Belum ada pekerjaan aktif. Tekan T untuk membuka papan kerja dan ambil surat kerja atau mulai shift.');
  if (!c && !ctx.job) out.push('Tanyakan soal IP, gateway, DNS, VLAN, DHCP, kabel, atau ping.');
  return out.join('\n');
}

// ---------------------------------------------------------------- AI customer complaints
export interface ComplaintIn { id: string; who: string; place: string; symptom: string }
const OPEN = ['Mas teknisi, tolong ya,', 'Permisi Mas/Mbak IT,', 'Halo tim IT,', 'Duh, gawat nih,', 'Pak, Bu, maaf ganggu,'];
const MID = ['dari tadi', 'sejak habis istirahat', 'pas mau kirim laporan', 'barusan banget', 'sejak pagi'];
const END = ['Saya ada deadline jam 3.', 'Tolong dicek secepatnya ya.', 'Padahal kemarin normal.', 'Yang lain kayaknya aman, cuma punya saya.', 'Makasih banyak ya.'];
/** offline variant: deterministic phrasing from the symptom */
export function offlineComplaint(c: ComplaintIn, seed: number): string {
  const p = <T>(a: T[], k: number) => a[Math.abs(seed * 31 + k * 7) % a.length];
  const s = c.symptom.replace(/\.$/, '');
  return `${p(OPEN, 1)} ${p(MID, 2)} ${s.charAt(0).toLowerCase() + s.slice(1)}. ${p(END, 3)}`;
}
/** ask the model to rewrite all of a shift's complaints in one call; returns id → text (missing ids keep their offline text) */
export async function aiComplaints(list: ComplaintIn[]): Promise<Record<string, string>> {
  const sys = 'Kamu menulis keluhan pengguna untuk tiket helpdesk di game simulasi jaringan (Indonesia). Tulis seperti pesan WhatsApp karyawan/tamu hotel yang awam IT: 1-2 kalimat, natural, sopan, boleh sedikit panik. HANYA ceritakan gejala yang diberikan; jangan menebak penyebab teknis, jangan sebut istilah teknis yang tidak ada di gejala. Balas JSON {"items":[{"id":"...","text":"..."}]}.';
  const user = JSON.stringify({ items: list.map(c => ({ id: c.id, pelapor: c.who, lokasi: c.place, gejala: c.symptom })) });
  const raw = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 120 * list.length + 80, temperature: 0.9, json: true, timeoutMs: 25000 });
  const m = raw.match(/\{[\s\S]*\}/); if (!m) throw new Error('nojson');
  const d = JSON.parse(m[0]) as { items?: { id?: string; text?: string }[] };
  const out: Record<string, string> = {};
  for (const it of d.items ?? []) if (it?.id && typeof it.text === 'string' && it.text.trim().length > 5) out[it.id] = plain(it.text).slice(0, 260);
  return out;
}

// ---------------------------------------------------------------- closing-note feedback
export interface NoteCtx { id: string; title: string; symptom: string; cause: string; fix: string; log: string[]; tested: boolean }
/** offline check: does the note cover the four parts of a good closing note (gejala, penyebab, tindakan, verifikasi)? */
export function offlineNoteFeedback(n: NoteCtx, note: string): { parts: Record<'gejala' | 'penyebab' | 'tindakan' | 'verifikasi', boolean>; text: string } {
  const t = note.toLowerCase();
  const pos = t.replace(/(tidak|gak|ga|nggak|enggak|belum)\s+(bisa\s+)?\w+(\s+(lagi|kembali))?/g, ' ');   // drop negated phrases for the verification check
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9./]+/).filter(w => w.length > 3);
  const hit = (s: string) => words(s).some(w => t.includes(w));
  const parts = {
    gejala: hit(n.symptom) || /gejala|keluhan|tidak bisa|gak bisa|putus|mati|lambat/.test(t),
    penyebab: hit(n.cause) || /penyebab|karena|ternyata|akibat/.test(t),
    tindakan: hit(n.fix) || /ganti|pasang|set|ubah|konfigur|no shut|renew|enable|patch|colok/.test(t),
    verifikasi: /\b(ping|tes|test|uji|diuji|nslookup|reply|berhasil|sukses|lancar)\b|sudah normal|normal (lagi|kembali)|bisa (dibuka|browsing|internet)|terbuka (lagi|kembali)/.test(pos),
  };
  const miss = (Object.keys(parts) as (keyof typeof parts)[]).filter(k => !parts[k]);
  const text = note.trim().length < 15 ? 'Catatannya terlalu singkat. Tulis minimal: gejala, penyebab, tindakan, dan bukti uji.'
    : miss.length ? `Sudah bagus. Lengkapi bagian: ${miss.join(', ')}.${miss.includes('verifikasi') ? ' Contoh bukti: "ping 8.8.8.8 reply, situs terbuka".' : ''}`
    : 'Lengkap: gejala, penyebab, tindakan, dan verifikasi sudah ada. Teknisi berikutnya bisa langsung paham.';
  return { parts, text };
}
export async function aiNoteFeedback(n: NoteCtx, note: string): Promise<string> {
  const sys = 'Kamu supervisor helpdesk yang mereview catatan penutupan tiket dari siswa SMK TKJ. Nilai apakah catatan memuat: gejala, penyebab, tindakan, verifikasi (bukti uji). Beri umpan balik 2-4 kalimat bahasa Indonesia santai: puji yang sudah benar, sebutkan yang kurang/keliru dibanding fakta, beri 1 contoh kalimat perbaikan. Jangan beri nilai angka.';
  const fakta = `Tiket ${n.id}: ${n.title}\nGejala: ${n.symptom}\nPenyebab sebenarnya: ${n.cause}\nPerbaikan yang benar: ${n.fix}\nSudah diuji dari perangkat: ${n.tested ? 'ya' : 'belum'}\nLog: ${n.log.slice(-8).join(' ; ')}`;
  return plain(await chat([{ role: 'system', content: sys }, { role: 'user', content: `FAKTA:\n${fakta}\n\nCATATAN SISWA:\n${note.slice(0, 800)}` }], { maxTokens: 260, temperature: 0.4 }));
}
