// Pak Nusa / AI features: offline fallback, mocked OpenRouter (complaints, mentor, note feedback), privacy of payload.
import { boot } from './qa_lib.mjs';
const { b, p, K, step, press } = await boot(null, { query: '&low', viewport: { width: 1100, height: 720 } });
const R = {}; const bodies = [];
await p.route('https://openrouter.ai/**', async route => {
  const body = JSON.parse(route.request().postData() || '{}'); bodies.push(body);
  const sys = body.messages?.[0]?.content || '';
  let content = 'Coba cek dulu lampu link di port switch-nya ya. Kalau kabel sudah lolos LAN tester, langkah berikutnya apa menurutmu?';
  if (/keluhan pengguna/.test(sys)) { const items = JSON.parse(body.messages[1].content).items; content = JSON.stringify({ items: items.map(i => ({ id: i.id, text: `[AI] ${i.pelapor} lapor: komputer saya bermasalah, tolong dibantu ya.` })) }); }
  if (/supervisor helpdesk/.test(sys)) content = 'Gejala dan penyebab sudah jelas. Tambahkan bukti uji, misalnya "ping 8.8.8.8 reply".';
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 99 } }) });
});
// 1) offline (no key)
R.offlineReady = await K(() => window.__kota.ai().ready);
const off = await K(() => window.__kota.ask('kenapa dapat IP 169.254?'));
R.offlineAnswer = !off.ai && /DHCP|APIPA/.test(off.text);
// 2) shift with key -> AI complaints
await K(() => Object.assign(window.__kota.aiCfg, { key: 'sk-or-v1-qa-test-key-0000', enabled: true, consent: true }));
R.ready = await K(() => window.__kota.ai().ready);
await K(() => window.__kota.noc.startShift());
await p.waitForTimeout(2500);
R.complaints = await K(() => window.__kota.noc.jobs.filter(j => j.kind === 'ticket').map(j => ({ ai: !!j.aiVoice, line: j.order.find(x => x.startsWith('Keluhan')) })));
R.complaintsAi = R.complaints.length > 0 && R.complaints.every(c => c.ai && /\[AI\]/.test(c.line));
// 3) mentor via J key
await K(() => window.__kota.noc.closeModal()); await K(() => document.activeElement?.blur?.());
await press('j');
R.panelByKey = await K(() => !!document.querySelector('.noc-box.nusa'));
if (!R.panelByKey) { R.state = await K(() => ({ s: window.__kota.state().mode, paused: window.__kota.menu.paused, open: window.__kota.menu.open })); await K(() => window.__kota.nusa()); }
await p.click('button[name=nusa-q1]'); await p.waitForTimeout(2600);
R.mentorAi = await K(() => !!document.querySelector('.nusa-log .pn .ai-tag') && /lampu link/.test(document.querySelector('.nusa-log').textContent));
await p.fill('#nusa-input', 'apa itu VLAN?'); await p.keyboard.press('Enter'); await p.waitForTimeout(2600);
R.msgs = await K(() => document.querySelectorAll('.nusa-log > div').length);
await p.screenshot({ path: '/workspace/work/shots/ai_nusa.png' });
// payload privacy: only game state, no localStorage dump / email
const all = JSON.stringify(bodies);
R.payloadClean = !/kotaNusantara\.|@gmail|bahtiar/i.test(all) && bodies.every(x => x.model);
R.secretInPrompt = /RAHASIA/.test(all);
await K(() => window.__kota.noc.closeModal());
// 4) report note feedback on a closed job
await K(() => { const n = window.__kota.noc; const j = n.jobs[0]; j.status = 'closed'; j.stars = 2; j.collateral = []; j.xp = 50; j.slaMet = true; n.openReport(j); });
R.noteBox = await K(() => !!document.querySelector('#note-text'));
await p.fill('#note-text', 'PC tidak bisa internet karena gateway salah, sudah saya ubah gateway ke router.');
await p.click('button[name=note-send]'); await p.waitForTimeout(2800);
R.noteChips = await K(() => [...document.querySelectorAll('.note-fb .chip')].map(c => c.textContent));
R.noteAi = await K(() => /bukti uji/.test(document.querySelector('.note-fb')?.textContent || '') && !!document.querySelector('.note-fb .ai-tag'));
R.noteSaved = await K(() => JSON.parse(localStorage.getItem('kotaNusantara.notes.v1') || '[]').length);
await p.screenshot({ path: '/workspace/work/shots/ai_note.png' });
// 5) AI failure -> offline fallback
await p.unroute('https://openrouter.ai/**'); await p.route('https://openrouter.ai/**', r => r.fulfill({ status: 500, body: 'down' }));
const fb = await K(() => window.__kota.ask('aku harus ngapain?'));
R.fallback = !fb.ai && fb.text.length > 10;
R.stats = await K(() => window.__kota.ai());
console.log('RESULT', JSON.stringify(R), 'errors', JSON.stringify((await K(() => 0), [])));
await b.close();
