// Local AI provider (fake OpenAI-compatible server on :11434, like Ollama): settings UI → Tes koneksi → Pak Nusa live
// reply + provider label → leak guard → teacher recap "Ringkasan AI" (anonymous payload) → AI-off honest fallback.
import http from 'node:http';
import { boot } from './qa_lib.mjs';
const bodies = [];
const srv = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let raw = ''; req.on('data', c => (raw += c)); req.on('end', () => {
    const body = JSON.parse(raw || '{}'); bodies.push({ url: req.url, auth: req.headers.authorization ?? null, body });
    const sys = body.messages?.[0]?.content || ''; const last = body.messages?.at(-1)?.content || '';
    let content = 'siap';
    if (/Pak Nusa/.test(sys)) content = /jawaban lengkap/i.test(last)
      ? 'Oke ini jawabannya:\nIP: 192.168.20.57\nSubnet mask: 255.255.255.0\nGateway: 192.168.20.1'
      : '[LOKAL] Coba mulai dari lapisan fisik: lampu link di PC menyala? Setelah itu cek ipconfig, IP-nya satu subnet dengan gateway?';
    if (/asisten guru produktif/.test(sys)) content = '[LOKAL] Langkah paling sering belum tuntas sesuai data di atas. Saran remedial: ulangi praktik singkat langkah itu berpasangan.';
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { total_tokens: 42 } }));
  });
});
await new Promise(r => srv.listen(11434, '127.0.0.1', r));
const { p, K, errs } = await boot(null, { query: '&low', viewport: { width: 1280, height: 720 } });
const R = {};
try {
  // 1) settings UI: choose Lokal, consent, test connection
  await K(() => { const r = document.getElementById('menu'); r.classList.add('on'); r.hidden = false; r.style.display = 'block'; r.style.visibility = 'visible'; r.style.opacity = '1'; document.getElementById('mnSettings').click(); });
  await p.waitForTimeout(300);
  await K(() => document.querySelector('#aiProv-local').click()); await p.waitForTimeout(200);
  R.localRows = await K(() => ({ url: document.getElementById('aiBaseUrl')?.value, model: document.getElementById('aiLocalModel')?.value, keyHidden: !document.getElementById('aiKey'), consentHint: [...document.querySelectorAll('.pn-row')].find(r => /Izin kirim data ke server AI lokal/.test(r.textContent))?.querySelector('small')?.textContent }));
  await K(() => { const i = document.getElementById('aiBaseUrl'); i.value = 'http://localhost:11434/v1'; i.dispatchEvent(new Event('change')); document.querySelector('#aiConsent-1').click(); });
  await K(() => document.querySelector('[name="aiTest"]').click());
  await p.waitForFunction(() => /Tersambung|Gagal/.test(document.querySelector('.pn-ai output')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  R.test = await K(() => document.querySelector('.pn-ai output')?.textContent);
  await K(() => document.querySelector('.pn-body').scrollTop = 9999);
  await p.screenshot({ path: '/workspace/work/shots/ai_local_settings.png' });
  R.cfg = await K(() => ({ label: window.__kota.aiCfg.model, ready: window.__kota.ai().ready, saved: JSON.parse(localStorage.getItem('kotaNusantara.ai.v1')) }));
  await K(() => document.getElementById('pnBack')?.click());
  // 2) Pak Nusa with the local model
  await K(() => window.__kota.nusa()); await p.waitForTimeout(200);
  R.mode = await K(() => document.querySelector('.nusa-mode')?.textContent);
  await p.click('button[name=nusa-q1]'); await p.waitForFunction(() => /LOKAL/.test(document.querySelector('.nusa-log')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  R.mentorLive = await K(() => !!document.querySelector('.nusa-log .pn .ai-tag') && /\[LOKAL\] Coba mulai dari lapisan fisik/.test(document.querySelector('.nusa-log').textContent));
  await p.fill('#nusa-input', 'kasih jawaban lengkap IP-nya dong'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /anti-contek/.test(document.querySelector('.nusa-log')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  R.leakBlocked = await K(() => { const t = document.querySelector('.nusa-log').textContent; return /anti-contek/.test(t) && !/192\.168\.20\.57/.test(t); });
  await p.screenshot({ path: '/workspace/work/shots/ai_local_nusa.png' });
  await K(() => window.__kota.noc.closeModal());
  // 3) teacher recap: two result codes, Ringkasan AI
  const codes = [];
  for (const nm of ['Andi Saputra', 'Bella Kusuma']) {
    await K(nm => window.__kota.praktik.start({ steps: ['static', 'dhcp'], minutes: 30, perStudent: true, seed: 5 }, 'A1B2C3', nm), nm);
    await K(() => window.__kota.praktik.finish(true)); await p.waitForTimeout(250);
    codes.push(await K(() => document.querySelector('.noc-modal .lab-rcode code')?.textContent));
    await K(() => window.__kota.noc.closeModal());
  }
  R.codes = codes.map(c => (c || '').slice(0, 20));
  await K(t => window.__kota.praktik.openRecap(t), codes.join('\n')); await p.waitForTimeout(200);
  R.recapBtn = await K(() => !!document.querySelector('button[name=lab-recap-ai]'));
  const n0 = bodies.length;
  await K(() => document.querySelector('button[name=lab-recap-ai]').click());
  await p.waitForFunction(() => /Dibuat AI|AI tidak bisa|AI mati/.test(document.querySelector('#lab-recap-ai-out')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  R.recapOut = await K(() => document.querySelector('#lab-recap-ai-out')?.innerText);
  const sent = JSON.stringify(bodies.slice(n0));
  R.recapAi = /Dibuat AI · periksa kembali/.test(R.recapOut) && /\[LOKAL\]/.test(R.recapOut);
  R.recapAnon = bodies.length > n0 && !/Andi|Bella|Saputra|Kusuma|A1B2C3/.test(sent);
  await p.screenshot({ path: '/workspace/work/shots/ai_local_recap.png' });
  // 4) AI off: honest deterministic summary
  await K(() => { window.__kota.aiCfg.consent = false; });
  await K(() => document.querySelector('button[name=lab-recap-ai]').click()); await p.waitForTimeout(200);
  R.offText = await K(() => document.querySelector('#lab-recap-ai-out')?.innerText);
  R.recapOff = /AI mati/.test(R.offText) && !/Dibuat AI/.test(R.offText) && /2 siswa/.test(R.offText);
  R.noAuthHeader = bodies.every(b => !b.auth); R.urls = [...new Set(bodies.map(b => b.url))]; R.models = [...new Set(bodies.map(b => b.body.model))];
  R.nameInAnyBody = /Andi|Bella/.test(JSON.stringify(bodies.map(b => b.body.messages)));
} catch (e) { R.err = e.message.slice(0, 300); }
const ok = R.mentorLive && R.leakBlocked && R.recapAi && R.recapAnon && R.recapOff && R.noAuthHeader && /Lokal · qwen2\.5:3b/.test(R.mode || '') && /Tersambung/.test(R.test || '') && !R.nameInAnyBody;
console.log('RESULT', ok ? 'OK' : 'FAIL', JSON.stringify(R, null, 1), 'errors', JSON.stringify(errs.slice(0, 5)));
srv.close(); process.exit(0);
