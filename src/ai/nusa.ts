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
  job: { id: string; title: string; kind: string; order: string[]; faults: { id: string; cause: string; fix: string; hint: string; cp: string }[]; log: string[]; next: string;
    /** exact target values of the task (IP, mask, gateway, DNS): used only by the leak guard, never put in the prompt */
    answer?: string[] } | null;
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

// ---------------------------------------------------------------- anti-answer-leak guard
const IPV4 = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const isMask = (ip: string) => /^255\.(?:0|128|192|224|240|248|252|254|255)\.\d{1,3}\.\d{1,3}$/.test(ip) || /^(?:0|128|192|224|240|248|252|254)\.0\.0\.0$/.test(ip) && ip !== '0.0.0.0';
/** dotted mask → prefix length (255.255.255.0 → 24), -1 when it is not a mask */
function maskPrefix(m: string): number {
  const o = m.split('.').map(Number); if (o.length !== 4 || o.some(x => !(x >= 0 && x <= 255))) return -1;
  const bits = o.map(x => x.toString(2).padStart(8, '0')).join(''); return /^1*0*$/.test(bits) ? bits.indexOf('0') < 0 ? 32 : bits.indexOf('0') : -1;
}
/** addresses that answer nothing on their own: loopback, public DNS used in every ping drill, network/broadcast/wildcard, APIPA */
const notAnswer = (ip: string) => /^(?:127\.|0\.|169\.254\.)/.test(ip) || ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '255.255.255.255'].includes(ip) || /\.(?:0|255)$/.test(ip);
const PREFIX = '(?:[89]|[12]\\d|3[0-2])';
/** any way of writing a subnet mask: dotted, "/24" (after an address or on its own), "prefix 24", "mask biasa/standar/default", "kelas C" */
const MASK_WORDS = new RegExp(`(?:^|[\\s(=])\\/\\s*${PREFIX}\\b|\\bprefix\\s*(?:length)?\\s*[:=]?\\s*${PREFIX}\\b|\\bmask\\s+(?:biasa|standar|standard|default|bawaan|umum|kelas\\s*c)\\b|\\bkelas\\s*c\\b|\\bmask\\s*[:=]?\\s*\\/?\\s*${PREFIX}\\b`, 'i');
const GW_WORD = /gateway|\bgw\b|default-router|gerbang|\brouter(?:nya)?\s+(?:\S+\s+)?(?:\d{1,3}\.){3}\d{1,3}/i;
const IP_WORD = /\bip\b|\balamat\b|\baddress\b|\bpc\b/i;
/** a line that is a diagnostic command (not configuration): ping/tracert/nslookup/ipconfig/show/arp */
const DIAG_LINE = /^\s*(?:[\w.-]+(?:\([\w-]+\))?[#>]\s*)?(?:ping|tracert|traceroute|nslookup|ipconfig|ifconfig|show|arp|sh\s)\b/i;
/** mode navigation: allowed in hints, does not count as a configuration line */
const NAV = /^\s*(?:[\w.-]+(?:\([\w-]+\))?[#>]\s*)?(?:en(?:able)?|conf(?:ig(?:ure)?)?(?:\s+t(?:erminal)?)?|end|exit|write(?:\s+mem(?:ory)?)?|wr|copy\s+run(?:ning-config)?\s+start(?:up-config)?|do\s+wr)\s*\.?$/i;
/** a substantive configuration command (Cisco IOS, MikroTik, netsh). Diagnostics (show/ping/ipconfig) are not in here. */
const CFG_CMD = /^\s*(?:[\w.-]+(?:\([\w-]+\))?[#>]\s*)?(?:int(?:erface)?\s+(?:range\s+)?[a-z]+[\s-]?\d|switchport\b|sw\s+(?:acc(?:ess)?|mode|tr(?:unk)?)\b|ip\s+(?:address|route|default-gateway|dhcp|helper-address|nat|dns|domain|name-server|host|access-group|routing)\b|no\s+(?:sh(?:ut(?:down)?)?\s*$|shut(?:down)?|ip\s|switchport|vlan|access-list)\b|vlan\s+\d+(?:\s*,\s*\d+)*\s*$|vlan\s+\d+\s+name\b|name\s+\S+\s*$|spanning-tree\b|power\s+inline\b|encapsulation\b|access-list\b|permit\s+(?:\d|any|host|ip|tcp|udp)|deny\s+(?:\d|any|host|ip|tcp|udp)|network\s+\d|default-router\b|dns-server\b|router\s+(?:ospf|rip|eigrp|bgp)\b|lease\s+\d|channel-group\b|\/ip\s|\/interface\s|netsh\s)/i;
/** words that make a fragment a sentence about a command rather than the command itself */
const PROSE = /\b(?:sudah|belum|masih|apakah|apa|yang|untuk|kalau|jika|supaya|agar|karena|artinya|biasanya|cek|coba|lihat|bisa|harus|nanti|itu|ini|dipakai|perintah(?:nya)?|adalah|berarti|perlu|sendiri|cara)\b/i;
/** split a reply into command-sized fragments: lines, sentences, comma/semicolon lists, "lalu/kemudian/→" chains, `backtick` spans */
function fragments(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) out.push(m[1]);
  const plainText = text.replace(/`([^`\n]+)`/g, ' ');
  for (const line of plainText.split(/\n/)) {
    for (const sent of line.split(/(?<=[.!?])\s+(?=[A-Z/])/)) {
      let x = sent.replace(/^\s*(?:[-*•>]|\d+[.)])\s*/, '');
      x = x.replace(/^[^:#]{1,40}:\s+(?=\S)/, '');   // "Ketik: ...", "Jalankan ini: ..."
      x = x.replace(/^(?:(?:pertama|kedua|ketiga|keempat|kelima|terakhir|setelah\s+itu|habis\s+itu|lalu|kemudian)\s*,?\s*)?(?:ketik(?:kan)?|jalankan|masukkan|tulis)?\s+(?=\S)/i, '');   // "Kedua ketik ..."
      for (const f of x.split(/\s*[;,]\s*|\s+(?:lalu|kemudian|terus|dan|then|→|->|=>)\s+/i)) if (f.trim()) out.push(f.trim().replace(/[.!]$/, ''));
    }
  }
  return out;
}
const isCfg = (f: string) => f.length <= 90 && CFG_CMD.test(f) && !NAV.test(f) && !PROSE.test(f);
const sameNet24 = (a: string, b: string) => a.split('.').slice(0, 3).join('.') === b.split('.').slice(0, 3).join('.');

/** what the leak guard needs: the hint that replaces a blocked reply, and (when known) the task's exact target values and the values already on the player's screen */
export interface GuardCtx { next: string; hint: string;
  /** exact values the student must enter for the active task (IP, mask, gateway, DNS); never sent to the model */
  answer?: string[];
  /** addresses already shown to the student (the PC's current IP/gateway): repeating them is a diagnosis, not an answer */
  current?: string[] }
/** prompts built by mentorPrompt, so chat() knows to run the leak guard on the reply */
const MENTOR_CALLS = new WeakMap<ChatMsg[], GuardCtx>();

export function mentorPrompt(ctx: MentorCtx, history: ChatMsg[], question: string): ChatMsg[] {
  const j = ctx.job;
  // Only these MentorCtx fields are sent. MentorCtx has no name / XP / score field on purpose (tests/nusa.test.ts).
  // job.answer (the exact target values) is NOT sent: the leak guard uses it locally to recognise a handed-over answer.
  const state = [
    `Pangkat siswa (level permainan, bukan nilai): ${ctx.rank}. Posisi: ${ctx.place}.`,
    j ? `Pekerjaan aktif ${j.id} (${j.kind}): ${j.title}\nSurat kerja: ${j.order.join(' | ')}\nLangkah berikutnya menurut sistem: ${j.next}\nLog tindakan siswa (terbaru di akhir): ${j.log.slice(-10).join(' ; ') || '-'}\nRAHASIA penyebab: ${j.faults.map(f => `${f.cause} → perbaikan: ${f.fix}`).join(' + ') || '-'}` : 'Tidak ada pekerjaan aktif.',
    ctx.pc ? `Siswa sedang di dekat ${ctx.pc}. Status (simulasi): ${ctx.pcState ?? '-'}` : '',
    ctx.rack ? `Siswa di dekat rak ${ctx.rack}.` : '',
  ].filter(Boolean).join('\n');
  const msgs: ChatMsg[] = [{ role: 'system', content: SYS_MENTOR }, { role: 'system', content: `KONDISI GAME:\n${state}` }, ...history.slice(-6), { role: 'user', content: question }];
  MENTOR_CALLS.set(msgs, { next: j?.next ?? '', hint: j?.faults[0]?.hint ?? '', answer: j?.answer ?? [], current: ctx.pcState?.match(IPV4) ?? [] });
  return msgs;
}

export type LeakReason = '' | 'ip-triple' | 'ip-gateway' | 'cli-block' | 'target-values';
export interface GuardResult { leak: boolean; reason: LeakReason; text: string }
/** does a mentor reply hand over a ready-to-paste solution? Heuristic, tuned on tests/nusa.test.ts (adversarial table).
 *  cli-block: three or more configuration commands (interface, ip address, switchport, vlan, encapsulation, access-list, ip nat/route, no shutdown, ...),
 *    counted across lines, comma/semicolon lists, "lalu" chains and `backtick` spans. Diagnostics (show/ping/ipconfig) and mode
 *    navigation (enable, conf t, end, write) do not count; a single command or two pass.
 *  ip-triple: a subnet mask in any form (255.255.255.0, "/24" alone, "prefix 24", "mask biasa") plus two host addresses plus a gateway word,
 *    or a dotted mask and two host addresses on one line (netsh).
 *  ip-gateway: a host address and a gateway address of the same /24 on one line, or "IP: x" and "Gateway: y" lines in the same /24 (on a /24 that is the whole answer).
 *  target-values: two or more of the active task's exact target values (IP, mask incl. its /prefix form, gateway, DNS) appear in the reply.
 *  Addresses already on the student's screen (ctx.current), loopback, 8.8.8.8, network/broadcast and APIPA addresses never count as answers.
 *  A leaking reply is replaced by its non-leaking sentences + the system hint, with a note saying why. */
export function guardLeak(reply: string, g: GuardCtx = { next: '', hint: '' }): GuardResult {
  const text = reply.replace(/```[a-z]*\n?/gi, '');
  const lines = text.split(/\n/).map(l => l.replace(/^\s*(?:[-*•>]|\d+[.)])\s*/, ''));
  const answer = new Set((g.answer ?? []).map(v => v.trim()).filter(Boolean));
  const current = new Set((g.current ?? []).filter(ip => !answer.has(ip)));
  const hostsOf = (s: string) => [...new Set(s.match(IPV4) ?? [])].filter(ip => !isMask(ip) && !notAnswer(ip) && !current.has(ip));
  // cli-block
  const cfgCount = fragments(text).filter(isCfg).length;
  // ip-triple
  const hosts = hostsOf(text);
  const hasMask = (text.match(IPV4) ?? []).some(isMask) || MASK_WORDS.test(text);
  const triple = (hasMask && hosts.length >= 2 && GW_WORD.test(text))
    || lines.some(l => !DIAG_LINE.test(l) && (l.match(IPV4) ?? []).some(isMask) && hostsOf(l).length >= 2);
  // ip-gateway
  const cfgLines = lines.filter(l => !DIAG_LINE.test(l));
  const oneLine = cfgLines.some(l => { const hs = hostsOf(l); return GW_WORD.test(l) && hs.some(a => hs.some(b => a !== b && sameNet24(a, b))); });   // two addresses of one /24 + a gateway word
  const ipLines = cfgLines.filter(l => IP_WORD.test(l) && !GW_WORD.test(l)).flatMap(hostsOf);
  const gwLines = cfgLines.filter(l => GW_WORD.test(l)).flatMap(hostsOf);
  const split = ipLines.some(a => gwLines.some(b => a !== b && sameNet24(a, b)));
  // target-values
  let targets = 0;
  if (answer.size) {
    const ips = new Set(text.match(IPV4) ?? []);
    const seen = new Set<string>();
    for (const v of answer) {
      const pre = maskPrefix(v);
      const hit = ips.has(v) || (isMask(v) && pre > 0 && new RegExp(`\\/\\s*${pre}\\b|prefix\\s*(?:length)?\\s*[:=]?\\s*${pre}\\b`, 'i').test(text));
      if (hit && !current.has(v)) seen.add(v);
    }
    targets = seen.size;
  }
  const reason: LeakReason = cfgCount >= 3 ? 'cli-block' : triple ? 'ip-triple' : (oneLine || split) ? 'ip-gateway' : targets >= 2 ? 'target-values' : '';
  if (!reason) return { leak: false, reason, text: reply };
  // keep only sentences without addresses, masks, target values or config commands
  const leaky = (x: string) => (x.match(IPV4) ?? []).length > 0 || MASK_WORDS.test(x) || /`/.test(x) || fragments(x).some(f => isCfg(f) || CFG_CMD.test(f));
  const keep = text.split(/(?<=[.!?:])\s+|\n+/).map(x => x.trim()).filter(x => /\w{3}/.test(x) && !leaky(x) && !/:$/.test(x) && !/jawabannya|berikut (ini|konfigurasi)|isi (saja|seperti)|tinggal (isi|ketik|salin)|ketik(?:kan)? ini|salin/i.test(x));
  const out = [...keep.slice(0, 3)];
  out.push(reason === 'cli-block' ? 'Pak Nusa tidak menuliskan blok konfigurasi lengkap: susun perintahnya sendiri dari surat kerja, satu baris demi satu baris, lalu cek hasilnya (show ...).'
    : 'Pak Nusa tidak menuliskan alamat IP, subnet mask, dan gateway jadi: bandingkan sendiri alamat PC dengan subnet dan alamat router di surat kerja.');
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
