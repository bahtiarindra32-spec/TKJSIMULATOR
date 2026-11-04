// Pak Nusa: the in-game AI mentor with an offline fallback. Provider: OpenRouter (internet, the player's own key) or a
// local OpenAI-compatible server (Ollama / LM Studio on the school laptop, no key, works without internet). Same /chat/completions format.
// Privacy: only simulated game state is ever sent (job text, simulated IP config, the player's own questions/notes).
// Never sent: the player's name (kept in the game settings), XP, scores/grades. This file does not import the settings at all (checked in tests/nusa.test.ts).
// The API key lives only in this browser's localStorage, never in the build or the repository.
// Every AI answer is labelled as AI in the UI; when there is no key / no internet the offline rule engine answers instead.

export type AiProvider = 'openrouter' | 'local';
export interface AiConfig { key: string; enabled: boolean;
  /** where requests go: OpenRouter (internet, needs a key) or a local OpenAI-compatible server (Ollama / LM Studio, no key) */
  provider: AiProvider;
  /** OpenRouter model id */
  orModel: string;
  /** local server base URL, e.g. http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio) */
  baseUrl: string;
  /** model name on the local server, e.g. qwen2.5:3b */
  localModel: string;
  /** per-provider consent: agreeing to OpenRouter does not imply agreeing to a local server and vice versa */
  orConsent: boolean; localConsent: boolean;
  /** the player (or teacher) agreed that questions + simulated game state go to the active provider (off until they say yes) */
  consent: boolean;
  /** display label of the live provider + model ("OpenRouter · openrouter/free", "Lokal · qwen2.5:3b"); setting it sets the active provider's model */
  model: string;
  /** keep the key on this device; false = only for this browser session (sessionStorage) */
  remember: boolean }
const KEY = 'kotaNusantara.ai.v1';
/** OpenRouter's free router picks whichever free model is up (single free model ids get retired often) */
export const DEFAULT_MODEL = 'openrouter/free';
export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';
export const DEFAULT_LOCAL_MODEL = 'qwen2.5:3b';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RETIRED = ['meta-llama/llama-3.3-70b-instruct:free'];
const PROVIDER_NAME: Record<AiProvider, string> = { openrouter: 'OpenRouter', local: 'Lokal' };
export const aiCfg: AiConfig = {
  key: '', enabled: true, provider: 'openrouter', orModel: DEFAULT_MODEL, baseUrl: DEFAULT_LOCAL_URL, localModel: DEFAULT_LOCAL_MODEL, orConsent: false, localConsent: false, remember: true,
  get consent() { return this.provider === 'local' ? this.localConsent : this.orConsent; },
  set consent(v: boolean) { if (this.provider === 'local') this.localConsent = !!v; else this.orConsent = !!v; },
  get model() { return `${PROVIDER_NAME[this.provider]} · ${activeModel(this)}`; },
  set model(v: string) { const m = String(v ?? '').replace(/^(OpenRouter|Lokal) · /, '').trim(); if (this.provider === 'local') this.localModel = m || DEFAULT_LOCAL_MODEL; else this.orModel = m || DEFAULT_MODEL; },
};
/** the model id actually sent in the request */
export function activeModel(c: Pick<AiConfig, 'provider' | 'orModel' | 'localModel'> = aiCfg) { return c.provider === 'local' ? (c.localModel.trim() || DEFAULT_LOCAL_MODEL) : (c.orModel.trim() || DEFAULT_MODEL); }
/** /chat/completions URL for a provider; a local base URL is normalised (scheme added, trailing slash or a pasted /chat/completions dropped, /v1 added when no path) */
export function chatUrl(provider: AiProvider, baseUrl = ''): string {
  if (provider !== 'local') return OPENROUTER_URL;
  let u = baseUrl.trim() || DEFAULT_LOCAL_URL;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  u = u.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+\/./i.test(u)) u += '/v1';
  return `${u}/chat/completions`;
}
/** true when the local server is this computer (data never leaves it) */
export function isLoopback(baseUrl: string) { try { const h = new URL(chatUrl('local', baseUrl)).hostname.replace(/^\[|\]$/g, ''); return h === 'localhost' || h === '::1' || /^127\./.test(h); } catch { return false; } }
/** e.g. "OpenRouter · openrouter/free" or "Lokal · qwen2.5:3b" */
export const aiLabel = () => aiCfg.model;
const SKEY = 'kotaNusantara.ai.key';
try {
  const o = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  if (o && typeof o === 'object') {
    if (typeof o.key === 'string') aiCfg.key = o.key;
    const om = typeof o.orModel === 'string' ? o.orModel : o.model;   // v1 saves kept the OpenRouter model in "model"
    if (typeof om === 'string' && om.trim()) aiCfg.orModel = RETIRED.includes(om.trim()) ? DEFAULT_MODEL : om.trim();
    if (typeof o.enabled === 'boolean') aiCfg.enabled = o.enabled;
    if (o.provider === 'local' || o.provider === 'openrouter') aiCfg.provider = o.provider;
    if (typeof o.baseUrl === 'string' && o.baseUrl.trim()) aiCfg.baseUrl = o.baseUrl.trim();
    if (typeof o.localModel === 'string' && o.localModel.trim()) aiCfg.localModel = o.localModel.trim();
    const oc = o.orConsent ?? o.consent;   // v1 had one consent, which was for OpenRouter
    aiCfg.orConsent = oc === true || (oc === undefined && typeof o.key === 'string' && o.key.length > 10);
    aiCfg.localConsent = o.localConsent === true;
    if (o.remember === false) aiCfg.remember = false;
  }
  const sk = sessionStorage.getItem(SKEY); if (!aiCfg.key && sk) aiCfg.key = sk;
} catch { /* ignore */ }
export function saveAiCfg() {
  try {
    const c = aiCfg;
    const o = { key: c.remember ? c.key : '', model: c.orModel, orModel: c.orModel, enabled: c.enabled, consent: c.orConsent, orConsent: c.orConsent, localConsent: c.localConsent, remember: c.remember, provider: c.provider, baseUrl: c.baseUrl, localModel: c.localModel };
    localStorage.setItem(KEY, JSON.stringify(o));
    if (c.remember) sessionStorage.removeItem(SKEY); else sessionStorage.setItem(SKEY, c.key);
  } catch { /* ignore */ }
}
const isLocal = () => aiCfg.provider === 'local';
/** a local server needs no key and no internet (offline final on the school laptop); OpenRouter needs both */
export const aiReady = () => aiCfg.enabled && aiCfg.consent && (isLocal() ? aiCfg.baseUrl.trim().length > 0 : aiCfg.key.trim().length > 10 && navigator.onLine !== false);
/** why the AI is not used right now (for the status line), '' = ready */
export const aiWhyOff = () => !aiCfg.enabled ? 'AI dimatikan'
  : isLocal() ? (!aiCfg.baseUrl.trim() ? 'isi alamat server AI lokal di Pengaturan' : !aiCfg.consent ? 'izin kirim data ke server AI lokal belum diberikan (Pengaturan)' : '')
  : aiCfg.key.trim().length <= 10 ? 'isi API key OpenRouter di Pengaturan, atau pilih penyedia Lokal (Ollama/LM Studio)' : !aiCfg.consent ? 'izin kirim data ke OpenRouter belum diberikan (Pengaturan)' : navigator.onLine === false ? 'tidak ada internet' : '';

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export interface AiStats { calls: number; fails: number; tokens: number; last: string; lastModel?: string; lastProvider?: AiProvider;
  /** mentor replies replaced by the anti-answer-leak guard */
  guarded?: number }
export const aiStats: AiStats = { calls: 0, fails: 0, tokens: 0, last: '' };

/** test hook: QA replaces the network call with a fake */
export const aiTransport: { fetch: (url: string, init: RequestInit) => Promise<Response> } = { fetch: (u, i) => fetch(u, i) };

let lastCall = 0;
/** one chat completion (same OpenAI /chat/completions format for OpenRouter and local servers); throws on any failure so callers can fall back to the offline engine */
export async function chat(messages: ChatMsg[], o: { maxTokens?: number; temperature?: number; timeoutMs?: number; json?: boolean } = {}): Promise<string> {
  if (!aiReady()) throw new Error('offline');
  const local = isLocal();
  const wait = (local ? 300 : 1500) - (Date.now() - lastCall); if (wait > 0) await new Promise(r => setTimeout(r, wait));   // gentle client-side rate limit
  lastCall = Date.now();
  // small local models on a school laptop CPU are slow: allow more time
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), (o.timeoutMs ?? 20000) * (local ? 3 : 1));
  aiStats.calls++;
  try {
    const url = chatUrl(aiCfg.provider, aiCfg.baseUrl);
    // local: only Content-Type (no key, no extra headers, so the CORS preflight stays simple); no response_format (not every local server supports json_object; callers parse JSON from the text)
    const headers: Record<string, string> = local ? { 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json', Authorization: `Bearer ${aiCfg.key.trim()}`, 'X-Title': 'Kota Nusantara TKJ Simulator', 'HTTP-Referer': location.origin || 'https://bahtiarindra32-spec.github.io' };
    const call = (model: string) => aiTransport.fetch(url, {
      method: 'POST', signal: ctl.signal, headers,
      body: JSON.stringify({ model, messages, max_tokens: o.maxTokens ?? 350, temperature: o.temperature ?? 0.6, stream: false, ...(o.json && !local ? { response_format: { type: 'json_object' } } : {}) }),
    });
    const model = activeModel();
    let r = await call(model);
    // a chosen OpenRouter model that no longer exists: fall back to the free router once instead of going silent
    if (!local && (r.status === 400 || r.status === 404) && model !== DEFAULT_MODEL) { aiStats.lastModel = DEFAULT_MODEL; r = await call(DEFAULT_MODEL); } else aiStats.lastModel = model;
    aiStats.lastProvider = aiCfg.provider;
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`HTTP ${r.status} ${t.slice(0, 120)}`); }
    const d = await r.json() as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number }; error?: { message?: string } | string };
    if (d.error) throw new Error(typeof d.error === 'string' ? d.error : d.error.message ?? 'error');
    let txt = d.choices?.[0]?.message?.content?.trim(); if (!txt) throw new Error('empty');
    txt = txt.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim() || txt;   // reasoning models (qwen3, deepseek-r1) on Ollama prepend their thinking
    aiStats.tokens += d.usage?.total_tokens ?? 0; aiStats.last = 'ok';
    const g = MENTOR_CALLS.get(messages);
    if (g) { const f = guardLeak(txt, g); if (f.leak) { aiStats.guarded = (aiStats.guarded ?? 0) + 1; txt = f.text; } }
    return txt;
  } catch (e) { aiStats.fails++; aiStats.last = String((e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message ?? e); throw e; }
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
- Kamu PEMBIMBING, bukan pemberi jawaban. Bimbing dengan pertanyaan diagnosis dan satu langkah berikutnya yang bisa dicek siswa (urut lapisan OSI: fisik dulu, lalu IP, gateway, DNS).
- JANGAN PERNAH memberi konfigurasi lengkap yang siap disalin: tidak boleh menulis pasangan IP + subnet mask + gateway lengkap untuk soal siswa, dan tidak boleh menulis blok perintah CLI berisi lebih dari 2 baris konfigurasi. Kalau siswa meminta jawaban lengkap, tolak halus dan beri petunjuk atau pertanyaan pancingan.
- Kalau siswa sudah mencoba 2x dan tetap buntu (lihat log), boleh sebut SATU perintah/menu spesifik di game, bukan seluruh konfigurasi.
- Gunakan istilah standar (IP address, subnet mask, default gateway, DNS, VLAN, trunk, patch panel) dan jelaskan singkat bila perlu.
- Hanya bahas jaringan/TKJ dan game ini. Tolak sopan topik lain.
- Data "RAHASIA" hanya untukmu agar petunjukmu akurat; jangan sebut penyebabnya secara gamblang.`;

/** what the leak guard needs to turn a blocked reply into a hint */
export interface GuardCtx { next: string; hint: string }
/** prompts built by mentorPrompt, so chat() knows to run the leak guard on the reply */
const MENTOR_CALLS = new WeakMap<ChatMsg[], GuardCtx>();

export function mentorPrompt(ctx: MentorCtx, history: ChatMsg[], question: string): ChatMsg[] {
  const j = ctx.job;
  // Only these MentorCtx fields are sent. MentorCtx has no name / XP / score field on purpose (tests/nusa.test.ts).
  const state = [
    `Pangkat siswa (level permainan, bukan nilai): ${ctx.rank}. Posisi: ${ctx.place}.`,
    j ? `Pekerjaan aktif ${j.id} (${j.kind}): ${j.title}\nSurat kerja: ${j.order.join(' | ')}\nLangkah berikutnya menurut sistem: ${j.next}\nLog tindakan siswa (terbaru di akhir): ${j.log.slice(-10).join(' ; ') || '-'}\nRAHASIA penyebab: ${j.faults.map(f => `${f.cause} → perbaikan: ${f.fix}`).join(' + ') || '-'}` : 'Tidak ada pekerjaan aktif.',
    ctx.pc ? `Siswa sedang di dekat ${ctx.pc}. Status (simulasi): ${ctx.pcState ?? '-'}` : '',
    ctx.rack ? `Siswa di dekat rak ${ctx.rack}.` : '',
  ].filter(Boolean).join('\n');
  const msgs: ChatMsg[] = [{ role: 'system', content: SYS_MENTOR }, { role: 'system', content: `KONDISI GAME:\n${state}` }, ...history.slice(-6), { role: 'user', content: question }];
  MENTOR_CALLS.set(msgs, { next: j?.next ?? '', hint: j?.faults[0]?.hint ?? '' });
  return msgs;
}

// ---------------------------------------------------------------- anti-answer-leak guard
const IPV4 = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const isMask = (ip: string) => /^255\.(?:0|128|192|224|240|248|252|254|255)\.\d{1,3}\.\d{1,3}$/.test(ip);
/** a configuration command (Cisco-style CLI, MikroTik, netsh); diagnostics like ping/ipconfig/show do not count */
const CFG_LINE = /^\s*(?:[\w.-]+(?:\([\w-]+\))?[#>]\s*)?(?:enable$|conf(?:ig(?:ure)?)?(?:\s+t(?:erminal)?)?$|int(?:erface)?\s+\S|switchport\b|ip\s+(?:address|route|default-gateway|dhcp|helper-address|nat|dns|domain|name-server|host|access-group)\b|no\s+shut(?:down)?\b|vlan\s+\d|name\s+\S|spanning-tree\b|power\s+inline\b|encapsulation\b|access-list\b|permit\b|deny\b|network\s+\d|default-router\b|dns-server\b|router\s+\w|write(?:\s+mem(?:ory)?)?$|copy\s+run|end$|exit$|\/ip\s|\/interface\s|netsh\s)/i;
export interface GuardResult { leak: boolean; reason: '' | 'ip-triple' | 'cli-block'; text: string }
/** does a mentor reply hand over a full ready-to-paste solution?
 *  ip-triple: one reply carries a subnet mask (dotted or /prefix) plus a host IP plus a gateway IP (the complete IPv4 setting).
 *  cli-block: four or more configuration command lines.
 *  A leaking reply is replaced by its non-leaking sentences + the system hint, with a note saying why. */
export function guardLeak(reply: string, g: GuardCtx = { next: '', hint: '' }): GuardResult {
  const text = reply.replace(/```[a-z]*\n?/gi, '');
  const lines = text.split(/\n/);
  const cfgLines = lines.filter(l => CFG_LINE.test(l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')));
  const ips = [...new Set(text.match(IPV4) ?? [])];
  const hosts = ips.filter(ip => !isMask(ip));
  const hasMask = ips.some(isMask) || /\b(?:\d{1,3}\.){3}\d{1,3}\s*\/\s*(?:[89]|[12]\d|3[0-2])\b/.test(text) || /\bprefix\s*(?:length)?\s*:?\s*(?:[89]|[12]\d|3[0-2])\b/i.test(text);
  const triple = hasMask && hosts.length >= 2 && /gateway|\bgw\b|default-router|gerbang/i.test(text);
  const reason: GuardResult['reason'] = cfgLines.length >= 4 ? 'cli-block' : triple ? 'ip-triple' : '';
  if (!reason) return { leak: false, reason, text: reply };
  // keep only sentences without addresses or config commands
  const hasIp = (x: string) => (x.match(IPV4) ?? []).length > 0 || /\/\s*(?:[89]|[12]\d|3[0-2])\b/.test(x);
  const keep = text.split(/(?<=[.!?:])\s+|\n+/).map(x => x.trim()).filter(x => /\w{3}/.test(x) && !hasIp(x) && !CFG_LINE.test(x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')) && !/:$/.test(x) && !/jawabannya|berikut (ini|konfigurasi)|isi (saja|seperti)|tinggal (isi|ketik|salin)/i.test(x));
  const out = [...keep.slice(0, 3)];
  out.push(reason === 'cli-block' ? 'Pak Nusa tidak menuliskan blok konfigurasi lengkap: susun perintahnya sendiri dari surat kerja, satu baris demi satu baris, lalu cek hasilnya (show ...).'
    : 'Pak Nusa tidak menuliskan IP, subnet mask, dan gateway lengkap: bandingkan sendiri alamat PC dengan subnet dan alamat router di surat kerja.');
  if (g.hint) out.push(`Petunjuk: ${g.hint}`); else if (g.next) out.push(`Langkah berikutnya: ${g.next}.`);
  return { leak: true, reason, text: `${out.join('\n')}\n(Jawaban AI dipotong oleh penjaga anti-contek.)` };
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
