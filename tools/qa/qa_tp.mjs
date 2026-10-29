import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 300)));
await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.solidAudit, null, { timeout: 120000 });
await p.waitForTimeout(1000);
const K = (f, a) => p.evaluate(f, a);
await p.click('#enter').catch(() => {}); await p.waitForTimeout(400);
for (const re of ['Mulai hari', 'Siap']) await K(r => [...document.querySelectorAll('button')].filter(b => b.offsetParent && new RegExp(r).test(b.textContent)).map(b => b.click()).length, re);
await K(() => window.__kota.pause(true));
for (const r of ['FASE_C_GEDUNG_KOTA', 'FASE_E_PROPERTI_JALAN']) { const a = await K(n => window.__kota.solidAudit(n), r); console.log(r, a.length); console.log(a.slice(0, 40).join('\n')); }
const shot = async n => { await K(() => window.__kota.step(1)); await p.screenshot({ path: `/workspace/work/shots/${n}.png` }); };
const st = await K(() => window.__kota.state()); console.log('spawn', st.x, st.z, st.y);
await p.keyboard.press('v'); await K(() => window.__kota.step(30)); await shot('tp_street');
// jump
await p.keyboard.press('Space'); const ys = [];
for (let i = 0; i < 14; i++) { await K(() => window.__kota.step(4)); ys.push((await K(() => window.__kota.state().y)).toFixed(2)); }
console.log('jump y', ys.join(' '));
// walk forward a bit third-person
await p.keyboard.down('w'); for (let i = 0; i < 8; i++) await K(() => window.__kota.step(4)); await shot('tp_walk'); await p.keyboard.up('w');
// inside hotel L1 lobby
await K(() => { const s = window.__kota.pcs().find(c => c.name === 'PROP_L1_PC_WORKSHOP_01'); window.__kota.teleport(s.x, s.z + 2.2, 1, 0); window.__kota.step(30); });
await shot('tp_hotel');
await p.keyboard.press('v'); await shot('fp_hotel');
console.log('errors:', errs.join(' | '));
await b.close();
