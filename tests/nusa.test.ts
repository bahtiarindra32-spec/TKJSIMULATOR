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
