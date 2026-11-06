// Pak Nusa: offline engine and AI client behaviour (network mocked).
import { describe, it, expect, beforeEach, vi } from 'vitest';
const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
vi.stubGlobal('navigator', { onLine: true });
vi.stubGlobal('location', { origin: 'http://localhost' });
const N = await import('../src/ai/nusa');

const ctx = (q = {}) => ({ job: { id: 'TKT-0001', title: 'ping 8.8.8.8 bisa, tapi situs tidak terbuka.', kind: 'ticket', order: [], faults: [{ id: 'dns', cause: 'Server DNS salah', fix: 'DNS diarahkan ke DNS yang benar', hint: 'nslookup cari.id gagal? Periksa DNS di IPv4 Properties.', cp: 'Fase F' }], log: [], next: 'PC 05: belum normal' }, pc: null, pcState: null, rack: null, rank: 'Magang', place: 'kota', ...q });

describe('offline mentor', () => {
  it('explains APIPA when asked about 169.254', () => { expect(N.offlineMentor(ctx(), 'kenapa dapat 169.254?')).toMatch(/APIPA/); });
  it('always gives the system next step for an active job', () => { expect(N.offlineMentor(ctx(), 'aku harus ngapain')).toMatch(/Langkah berikutnya: PC 05/); });
  it('points to the work board when there is no job', () => { expect(N.offlineMentor(ctx({ job: null }), 'halo')).toMatch(/papan kerja/i); });
});

describe('closing-note feedback (offline)', () => {
  const n = { id: 'TKT-1', title: 't', symptom: 'ping 8.8.8.8 bisa, tapi situs tidak terbuka.', cause: 'Server DNS salah', fix: 'DNS diarahkan ke DNS yang benar', log: [], tested: true };
  it('recognises all four parts of a complete note', () => {
    const r = N.offlineNoteFeedback(n, 'Situs tidak terbuka karena DNS salah. DNS diubah ke otomatis. Tes nslookup cari.id berhasil.');
    expect(Object.values(r.parts).every(Boolean)).toBe(true);
  });
  it('asks for verification when the note has no test evidence', () => {
    const r = N.offlineNoteFeedback(n, 'Situs tidak terbuka karena DNS salah, sudah diganti.');
    expect(r.parts.verifikasi).toBe(false); expect(r.text).toMatch(/verifikasi/);
  });
});

describe('AI client', () => {
  beforeEach(() => { N.aiCfg.key = ''; N.aiCfg.enabled = true; N.aiCfg.consent = true; });
  it('sends nothing without the player\'s consent, even with a key', async () => {
    N.aiCfg.key = 'sk-or-v1-unit-test-key'; N.aiCfg.consent = false; let called = false;
    N.aiTransport.fetch = async () => { called = true; return new Response('{}'); };
    await expect(N.chat([{ role: 'user', content: 'x' }])).rejects.toThrow('offline'); expect(called).toBe(false); expect(N.aiWhyOff()).toMatch(/izin/);
  });
  it('refuses to call the network without a key', async () => { await expect(N.chat([{ role: 'user', content: 'x' }])).rejects.toThrow('offline'); });
  it('sends the key only as a bearer header to OpenRouter and returns the reply', async () => {
    N.aiCfg.key = 'sk-or-v1-unit-test-key';
    let seen: { url: string; init: RequestInit } | null = null;
    N.aiTransport.fetch = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ choices: [{ message: { content: '**Halo**' } }] }), { status: 200 }); };
    const r = await N.chat([{ role: 'user', content: 'tes' }]);
    expect(N.plain(r)).toBe('Halo');
    expect(seen!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-v1-unit-test-key');
    expect(String(seen!.init.body)).not.toContain('sk-or-v1');
  });
  it('rewrites complaints from a JSON reply and ignores junk', async () => {
    N.aiCfg.key = 'sk-or-v1-unit-test-key';
    N.aiTransport.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"items":[{"id":"TKT-1","text":"Internet saya mati dari tadi."},{"id":"TKT-2","text":""}]}' } }] }), { status: 200 });
    const m = await N.aiComplaints([{ id: 'TKT-1', who: 'Staf', place: 'PC 1', symptom: 'x' }, { id: 'TKT-2', who: 'Staf', place: 'PC 2', symptom: 'y' }]);
    expect(m).toEqual({ 'TKT-1': 'Internet saya mati dari tadi.' });
  });
  it('mentor prompt keeps the cause marked as secret and caps history', () => {
    const msgs = N.mentorPrompt(ctx(), Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: String(i) })), 'q');
    expect(msgs.length).toBe(2 + 6 + 1); expect(msgs[1].content).toMatch(/RAHASIA penyebab: Server DNS salah/);
  });
});
describe('negations', () => {
  it('"tidak bisa internet" is a symptom, not proof of a test', async () => {
    const N2 = await import('../src/ai/nusa');
    const r = N2.offlineNoteFeedback({ id: 'x', title: 't', symptom: 'Tidak bisa ping gateway', cause: 'Default gateway salah', fix: 'gateway diarahkan ke router segmen', log: [], tested: true }, 'PC tidak bisa internet karena gateway salah, sudah saya ubah gateway ke router.');
    expect(r.parts.verifikasi).toBe(false);
  });
});

// ---------------------------------------------------------------- privacy, provider, leak guard, teacher recap
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const R = await import('../src/ai/recapAi');
const NAME = 'Rizky Pratama';

describe('privacy: what Pak Nusa sends', () => {
  it('the mentor prompt has no student name, XP or score fields', () => {
    const msgs = N.mentorPrompt(ctx(), [], 'aku harus ngapain?');
    const all = JSON.stringify(msgs);
    expect(all).not.toContain(NAME);
    expect(all).not.toMatch(/\bxp\b|skor|score|nilai\s*\d|predikat/i);
    // MentorCtx carries only these keys; a new key (e.g. name) must be a conscious change to this test
    expect(Object.keys(ctx()).sort()).toEqual(['job', 'pc', 'pcState', 'place', 'rack', 'rank']);
  });
  it('the request body sent over the wire carries no name even when the player set one', async () => {
    store.set('kotaNusantara.settings.v1', JSON.stringify({ name: NAME }));
    N.aiCfg.provider = 'openrouter'; N.aiCfg.key = 'sk-or-v1-unit-test-key'; N.aiCfg.enabled = true; N.aiCfg.consent = true;
    let body = '';
    N.aiTransport.fetch = async (_u, init) => { body = String(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'Cek kabel dulu ya.' } }] }), { status: 200 }); };
    await N.chat(N.mentorPrompt(ctx(), [], 'halo'));
    expect(body).toContain('Pekerjaan aktif TKT-0001');
    expect(body).not.toContain(NAME); expect(body).not.toMatch(/"name"|playerName|\bxp\b/i);
    store.delete('kotaNusantara.settings.v1');
  });
  it('nusa.ts never reads the settings (where the name lives), and the game builds MentorCtx without name/XP/score', () => {
    const src = readFileSync(join(__dirname, '../src/ai/nusa.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"][^'"]*ui\/menu['"]|settings\.name|playerName/);
    const files: string[] = []; const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk(join(__dirname, '../src/game'));
    const bodies = files.map(f => readFileSync(f, 'utf8')).map(s => { const i = s.indexOf('mentorCtx(): MentorCtx {'); return i < 0 ? '' : s.slice(i, s.indexOf('\n  }\n', i)); }).filter(Boolean);
    expect(bodies.length).toBe(1);
    expect(bodies[0]).not.toMatch(/playerName|settings|\.xp\b|score|nilai/i);
  });
});

describe('AI provider', () => {
  beforeEach(() => { N.aiCfg.provider = 'openrouter'; N.aiCfg.enabled = true; N.aiCfg.key = ''; N.aiCfg.orConsent = false; N.aiCfg.localConsent = false; });
  it('builds the chat URL for OpenRouter and for local servers', () => {
    expect(N.chatUrl('openrouter', 'http://localhost:11434/v1')).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(N.chatUrl('local', 'http://localhost:11434/v1')).toBe('http://localhost:11434/v1/chat/completions');
    expect(N.chatUrl('local', 'http://localhost:1234/v1/')).toBe('http://localhost:1234/v1/chat/completions');
    expect(N.chatUrl('local', 'localhost:11434')).toBe('http://localhost:11434/v1/chat/completions');
    expect(N.chatUrl('local', 'http://10.0.0.5:11434/v1/chat/completions')).toBe('http://10.0.0.5:11434/v1/chat/completions');
    expect(N.chatUrl('local', '')).toBe('http://localhost:11434/v1/chat/completions');
    expect(N.isLoopback('http://127.0.0.1:1234/v1')).toBe(true); expect(N.isLoopback('http://192.168.1.9:11434/v1')).toBe(false);
  });
  it('local: no key, no Authorization header, works offline, still needs its own consent', async () => {
    N.aiCfg.provider = 'local'; N.aiCfg.baseUrl = 'http://localhost:11434/v1'; N.aiCfg.localModel = 'qwen2.5:3b';
    N.aiCfg.orConsent = true;   // agreeing to OpenRouter is not agreeing to the local server
    expect(N.aiReady()).toBe(false); expect(N.aiWhyOff()).toMatch(/lokal/);
    N.aiCfg.consent = true; expect(N.aiCfg.localConsent).toBe(true);
    vi.stubGlobal('navigator', { onLine: false });
    expect(N.aiReady()).toBe(true);
    let seen: { url: string; init: RequestInit } | null = null;
    N.aiTransport.fetch = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ choices: [{ message: { content: '<think>hmm</think>siap' } }] }), { status: 200 }); };
    expect(await N.chat([{ role: 'user', content: 'tes' }], { json: true })).toBe('siap');
    expect(seen!.url).toBe('http://localhost:11434/v1/chat/completions');
    expect((seen!.init.headers as Record<string, string>).Authorization).toBeUndefined();
    const b = JSON.parse(String(seen!.init.body)); expect(b.model).toBe('qwen2.5:3b'); expect(b.response_format).toBeUndefined(); expect(b.messages[0].content).toBe('tes');
    expect(N.aiCfg.model).toBe('Lokal · qwen2.5:3b'); expect(N.aiStats.lastProvider).toBe('local');
    vi.stubGlobal('navigator', { onLine: true });
  });
  it('the status label names the provider and model; setting model sets the active provider\'s model', () => {
    expect(N.aiLabel()).toBe(`OpenRouter · ${N.aiCfg.orModel}`);
    N.aiCfg.provider = 'local'; N.aiCfg.model = 'Lokal · llama3.2:3b'; expect(N.aiCfg.localModel).toBe('llama3.2:3b');
  });
  it('saves and reloads provider settings, keeping v1 OpenRouter saves working', () => {
    N.aiCfg.provider = 'local'; N.aiCfg.baseUrl = 'http://localhost:1234/v1'; N.aiCfg.localModel = 'x'; N.aiCfg.localConsent = true; N.saveAiCfg();
    const o = JSON.parse(store.get('kotaNusantara.ai.v1')!);
    expect(o).toMatchObject({ provider: 'local', baseUrl: 'http://localhost:1234/v1', localModel: 'x', localConsent: true, orConsent: false });
  });
});

describe('anti-answer-leak guard', () => {
  const g = { next: 'PC 05: atur IP sesuai surat kerja', hint: 'Bandingkan IP PC dengan subnet router ruangan.' };
  it('catches a full IP / mask / gateway answer', () => {
    const r = N.guardLeak('Gampang! Isi saja:\nIP: 192.168.20.57\nSubnet mask: 255.255.255.0\nGateway: 192.168.20.1\nDNS: 192.168.20.1', g);
    expect(r.leak).toBe(true); expect(r.reason).toBe('ip-triple');
    expect(r.text).not.toMatch(/192\.168\.20\.57|255\.255\.255\.0/); expect(r.text).toMatch(/Petunjuk: Bandingkan/); expect(r.text).toMatch(/anti-contek/);
  });
  it('catches a /prefix triple written inline', () => {
    expect(N.guardLeak('Set IP 10.10.30.25/24 dengan gateway 10.10.30.1 ya.', g).leak).toBe(true);
  });
  it('catches a ready-to-paste CLI block of 4+ config lines', () => {
    const r = N.guardLeak('Ketik ini di console:\n```\nconf t\ninterface gi1/0/7\nswitchport access vlan 30\nno shutdown\nend\nwrite memory\n```', g);
    expect(r.leak).toBe(true); expect(r.reason).toBe('cli-block'); expect(r.text).not.toMatch(/switchport access vlan 30/);
  });
  it('passes a coaching hint (questions, one address, one command)', () => {
    const hint = 'Coba cek dulu: IP PC-mu satu subnet dengan router belum? Ping gateway 192.168.20.1, kalau RTO lihat lagi subnet mask-nya. Perintah yang membantu: show vlan brief.';
    const r = N.guardLeak(hint, g); expect(r.leak).toBe(false); expect(r.text).toBe(hint);
  });
  it('passes diagnostic command lists (ping/ipconfig are not configuration)', () => {
    expect(N.guardLeak('Urutan cek:\n1. ipconfig\n2. ping 127.0.0.1\n3. ping 192.168.1.1\n4. nslookup cari.id', g).leak).toBe(false);
  });
  it('runs automatically on mentor replies (not on other AI calls)', async () => {
    N.aiCfg.provider = 'openrouter'; N.aiCfg.key = 'sk-or-v1-unit-test-key'; N.aiCfg.enabled = true; N.aiCfg.consent = true;
    const leak = 'IP: 192.168.20.57\nMask: 255.255.255.0\nGateway: 192.168.20.1';
    N.aiTransport.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: leak } }] }), { status: 200 });
    const before = N.aiStats.guarded ?? 0;
    const a = await N.chat(N.mentorPrompt(ctx(), [], 'kasih jawabannya dong'));
    expect(a).not.toContain('192.168.20.57'); expect(N.aiStats.guarded).toBe(before + 1);
    expect(await N.chat([{ role: 'user', content: 'x' }])).toBe(leak);   // a non-mentor call is untouched
  });
  it('the mentor system prompt tells the model to coach, not hand over configs', () => {
    expect(N.mentorPrompt(ctx(), [], 'q')[0].content).toMatch(/PEMBIMBING|JANGAN PERNAH memberi konfigurasi lengkap/);
  });
});

describe('teacher recap summary (AI input is anonymous)', () => {
  const row = (name: string, desk: number, nilai: number, staticDone: boolean) => ({ sheet: 'ABC123', name, desk, nilai, predikat: (nilai >= 75 ? 'Kompeten' : 'Belum Kompeten') as 'Kompeten' | 'Belum Kompeten', durSec: 1800, overtime: false, when: 0,
    steps: [{ step: 'crimp' as const, got: 4, of: 4, done: true }, { step: 'static' as const, got: staticDone ? 5 : 2, of: 5, done: staticDone }] });
  const rows = [row('Rizky Pratama', 3, 88, true), row('Siti Aminah', 7, 61, false), row('Budi Santoso', 11, 58, false)];
  it('buildRecapPrompt carries only aggregates: no names, desks, per-student grades', () => {
    const all = JSON.stringify(R.buildRecapPrompt(rows));
    for (const n of ['Rizky', 'Siti', 'Budi', 'Pratama', 'ABC123']) expect(all).not.toContain(n);
    for (const v of ['"desk"', '"meja"', '88', '61', '58']) expect(all).not.toContain(v);
    expect(all).toContain('belum_tuntas'); expect(all).toMatch(/Alamat IP statis/);
  });
  it('stats put the most-failed step first with exact counts', () => {
    const s = R.recapStats(rows);
    expect(s.steps[0]).toMatchObject({ step: 'static', students: 3, notDone: 2, of: 5, avgGot: 3 });
    expect(s).toMatchObject({ students: 3, avgNilai: 69, kompeten: 1 });
  });
  it('the offline summary states counts only', () => {
    const t = R.offlineRecapSummary(rows);
    expect(t).toMatch(/3 siswa/); expect(t).toMatch(/Alamat IP statis.*2\/3 siswa belum tuntas/); expect(t).not.toMatch(/Rizky|Siti|Budi/);
  });
});

// ---------------------------------------------------------------- adversarial table for the leak guard (juri3 bug #2)
describe('anti-answer-leak guard: adversarial table', () => {
  const g = { next: 'PC 05: atur IP sesuai surat kerja', hint: 'Bandingkan IP PC dengan subnet router ruangan.' };
  // the active task's exact target values (static IP job) and the PC's current (wrong) address on screen
  const task = { ...g, answer: ['192.168.30.45', '255.255.255.0', '192.168.30.1', '192.168.30.1'], current: ['192.168.10.57'] };
  type Case = [label: string, reply: string, ctx?: typeof g & { answer?: string[]; current?: string[] }];
  const LEAKS: Case[] = [
    ['canonical IP / mask / gateway lines', 'Gampang! Isi saja:\nIP: 192.168.20.57\nSubnet mask: 255.255.255.0\nGateway: 192.168.20.1'],
    ['IP + gateway + "mask biasa /24" (juri3)', 'Isi IP PC 192.168.20.57 dan gateway 192.168.20.1, mask biasa /24 ya.'],
    ['IP + gateway on one line, no mask (juri3)', 'Set IP 192.168.20.57 gateway 192.168.20.1'],
    ['3 CLI lines in a code block (juri3)', '```\ninterface fa0/1\nswitchport access vlan 20\nno shutdown\n```'],
    ['comma-separated commands on one line (juri3)', 'Ketik: conf t, int fa0/1, switchport mode access, switchport access vlan 20, end'],
    ['semicolon-separated sub-interface config', 'Ketik: interface g0/0.20; encapsulation dot1Q 20; ip address 192.168.20.1 255.255.255.0'],
    ['"IP:" and "Gateway:" lines without a mask', 'IP: 192.168.20.57\nGateway: 192.168.20.1'],
    ['inline /24 + gw shorthand', 'Pakai 10.10.30.25/24 gw 10.10.30.1'],
    ['"prefix 24" mask form', 'Alamat PC 172.16.5.20, default gateway 172.16.5.1, prefix 24.'],
    ['backtick commands chained with "lalu"', 'Jalankan `interface fa0/3` lalu `switchport access vlan 30` lalu `no shutdown`.'],
    ['numbered NAT / ACL / route config', '1. ip nat inside source list 1 interface g0/1 overload\n2. access-list 1 permit 192.168.10.0 0.0.0.255\n3. ip route 0.0.0.0 0.0.0.0 203.0.113.1'],
    ['router prompts in front of each line', 'R1(config)#interface g0/0\nR1(config-if)#ip address 10.0.0.1 255.255.255.252\nR1(config-if)#no shutdown'],
    ['MikroTik commands', '/ip address add address=192.168.88.2/24 interface=ether2\n/ip route add gateway=192.168.88.1\n/ip dns set servers=8.8.8.8'],
    ['two exact target values, no keywords', 'Jawabannya: 192.168.30.45 dan 192.168.30.1.', task],
    ['target IP + its mask as /24', 'Pakai 192.168.30.45 dengan /24 saja.', task],
    ['netsh static one-liner', 'netsh interface ip set address "Ethernet" static 192.168.20.57 255.255.255.0 192.168.20.1'],
    ['gateway first, IP second, one line', 'Gateway 192.168.20.1, IP-nya 192.168.20.57.'],
    ['VLAN create + name + range + access', 'vlan 30\nname TAMU\ninterface range fa0/1-10\nswitchport access vlan 30'],
    ['semicolons with extra spaces and no shut', 'conf t ; interface vlan 1 ; ip address 192.168.1.2 255.255.255.0 ; no shut'],
    ['shouting caps triple on one line', 'IP ADDRESS 192.168.20.57 SUBNET 255.255.255.0 GATEWAY 192.168.20.1'],
    ['abbreviated IOS commands', 'Masukkan:\nint fa0/1\nsw acc vlan 20\nno sh'],
    ['commands behind ordinal words', 'Pertama ketik interface fa0/1. Kedua switchport access vlan 20. Ketiga no shutdown.'],
  ];
  const HINTS: Case[] = [
    ['coaching hint: one gateway address + one show command', 'Coba cek dulu: IP PC-mu satu subnet dengan router belum? Ping gateway 192.168.20.1, kalau RTO lihat lagi subnet mask-nya. Perintah yang membantu: show vlan brief.'],
    ['diagnostic list (ipconfig / ping / nslookup)', 'Urutan cek:\n1. ipconfig\n2. ping 127.0.0.1\n3. ping 192.168.1.1\n4. nslookup cari.id'],
    ['gateway concept', 'Default gateway adalah alamat router di segmen yang sama. Tanpa gateway, PC hanya bisa bicara dengan perangkat satu jaringan.'],
    ['/24 concept', 'Subnet mask /24 artinya 24 bit pertama adalah network, jadi ada 256 alamat dengan 254 host.'],
    ['one show command', 'Coba masuk ke interface-nya lalu cek apakah statusnya administratively down. Perintah: show ip interface brief.'],
    ['single command hint (no shutdown)', 'Kalau port-nya shutdown, satu perintah yang kamu perlukan di mode interface adalah no shutdown.'],
    ['two-step pointer, no config block', 'Masuk dulu ke interface fa0/5, lalu cek switchport access vlan-nya sudah benar belum.'],
    ['VLAN concept list', '- VLAN 10: staf\n- VLAN 20: tamu\n- VLAN 30: server\nPort access hanya membawa satu VLAN.'],
    ['APIPA explanation', 'IP 169.254.x.x artinya PC tidak dapat jawaban DHCP. Cek kabel lalu ipconfig /renew.'],
    ['ping ladder with loopback and 8.8.8.8', 'Urutan ping: 127.0.0.1 → IP sendiri → gateway → 8.8.8.8 → cari.id.'],
    ['repeats the PC\'s current (wrong) address only', 'IP PC-mu sekarang 192.168.10.57, sedangkan gateway ruangan ini ada di subnet 30. Network-nya beda, kan?', task],
    ['show commands only', 'show running-config\nshow vlan brief\nshow interfaces trunk'],
    ['current address + one gateway on one line', 'Dari PC-mu (192.168.10.57) coba ping gateway 192.168.30.1. Kalau RTO, bandingkan network-nya.', task],
    ['trunk concept mentioning one command', 'Trunk dipakai di uplink antar switch supaya banyak VLAN lewat satu kabel; perintahnya diawali switchport mode trunk.'],
    ['DNS concept', 'Kalau ping 8.8.8.8 bisa tapi cari.id tidak terbuka, curigai DNS. Coba nslookup cari.id.'],
    ['network address range concept', 'Network 192.168.20.0/24 punya host .1 sampai .254; biasanya gateway di .1, tapi cek surat kerja.'],
    ['ACL concept', 'ACL standar dibaca dari atas ke bawah dan ada deny any tersembunyi di akhir; pasang sedekat mungkin dengan tujuan.'],
    ['steps in words, no commands', 'Langkahnya: masuk mode konfigurasi, pilih interface yang benar, atur VLAN-nya, lalu simpan. Coba susun perintahnya sendiri dulu.'],
    ['same-network example with /24, no gateway', 'Contoh: 192.168.1.10/24 dan 192.168.1.200/24 satu network karena tiga oktet pertamanya sama.'],
    ['one target value only (the gateway to ping)', 'Ping gateway 192.168.30.1 dulu. Kalau reply, lanjut cek DNS.', task],
    ['compares gateway and a PC address of another subnet', 'Coba bandingkan: gateway ruangan 192.168.20.1, sedangkan IP PC-mu 192.168.10.57.'],
    ['two-command hint (allowed: at most 2 config lines)', 'Langkah: enable, configure terminal, interface fa0/1, switchport access vlan 20.'],
  ];
  it.each(LEAKS)('blocks: %s', (_l, reply, c) => {
    const r = N.guardLeak(reply, c ?? g);
    expect(r.leak).toBe(true);
    for (const ip of reply.match(/(?:\d{1,3}\.){3}\d{1,3}/g) ?? []) if (!['8.8.8.8', '0.0.0.0'].includes(ip)) expect(r.text).not.toContain(ip);
    expect(r.text).toMatch(/anti-contek/);
  });
  it.each(HINTS)('passes: %s', (_l, reply, c) => {
    const r = N.guardLeak(reply, c ?? g);
    expect(r.leak).toBe(false); expect(r.text).toBe(reply);
  });
  it('pass rate over the whole table', () => {
    const ok = LEAKS.filter(([, r, c]) => N.guardLeak(r, c ?? g).leak).length + HINTS.filter(([, r, c]) => !N.guardLeak(r, c ?? g).leak).length;
    const total = LEAKS.length + HINTS.length;
    console.log(`leak guard adversarial table: ${ok}/${total} (${LEAKS.length} leaks, ${HINTS.length} legitimate hints)`);
    expect(total).toBeGreaterThanOrEqual(30); expect(LEAKS.length).toBeGreaterThanOrEqual(15); expect(HINTS.length).toBeGreaterThanOrEqual(15);
    expect(ok).toBe(total);
  });
  it('mentorPrompt passes the task\'s target values to the guard but never to the model', async () => {
    const c0 = ctx(); const c = { ...c0, job: { ...c0.job, answer: ['192.168.30.45', '255.255.255.0', '192.168.30.1'] } };
    const msgs = N.mentorPrompt(c, [], 'q');
    expect(JSON.stringify(msgs)).not.toContain('192.168.30.45');
    N.aiCfg.provider = 'openrouter'; N.aiCfg.key = 'sk-or-v1-unit-test-key'; N.aiCfg.enabled = true; N.aiCfg.consent = true;
    N.aiTransport.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Coba 192.168.30.45 dengan gateway di .1, prefix 24.' } }] }), { status: 200 });
    expect(await N.chat(msgs)).not.toContain('192.168.30.45');
  });
});

// ---------------------------------------------------------------- "Hapus semua data saya" (Settings → Privasi & data)
describe('wipe all of my data', () => {
  const mk = (keys: string[]) => { const m = new Map(keys.map(k => [k, 'x'])); return { m, st: { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => { m.delete(k); } } }; };
  it('removes every key the game writes (found by grepping localStorage/sessionStorage in src) and nothing else', async () => {
    const M = await import('../src/ui/menu');
    const local = mk(['kotaNusantara.settings.v1', 'kotaNusantara.ai.v1', 'kotaNusantara.noc.v1', 'kotaNusantara.notes.v1', 'kotaNusantara.missions.v2', '__ms_probe', 'other-app.token']);
    const sess = mk(['kotaNusantara.ai.key', 'kotaNusantara.demoBackup', 'kn-reloaded', 'unrelated']);
    const gone = M.wipeGameData([local.st, sess.st]);
    expect(gone.length).toBe(9);
    expect([...local.m.keys()]).toEqual(['other-app.token']); expect([...sess.m.keys()]).toEqual(['unrelated']);
    // every storage key literal in src is covered by a prefix (a new key with another name must update GAME_KEY_PREFIXES)
    const files: string[] = []; const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk(join(__dirname, '../src'));
    const src = files.map(f => readFileSync(f, 'utf8')).join('\n');
    const lits = [...src.matchAll(/(?:KEY|BACKUP|KEYS)\s*=\s*\[?\s*'([^']+)'/g), ...src.matchAll(/(?:local|session)Storage\.(?:get|set|remove)Item\('([^']+)'/g)].map(m => m[1]);
    expect(lits.length).toBeGreaterThanOrEqual(6);
    for (const k of lits) expect(M.GAME_KEY_PREFIXES.some(p => k.startsWith(p)), k).toBe(true);
  });
  it('survives a blocked storage', async () => {
    const M = await import('../src/ui/menu');
    expect(M.wipeGameData([{ get length(): number { throw new Error('SecurityError'); }, key: () => null, removeItem: () => {} }])).toEqual([]);
  });
});
