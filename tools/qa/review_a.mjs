// Review A: first-time player, desktop 1280x720: title -> enter -> tutorial briefing -> walk -> tutorial job.
import { chromium } from 'playwright';
const SH = '/workspace/work/review/shots';
const vp = { width: 1280, height: 720 };
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: vp });
await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('k')) { localStorage.clear(); sessionStorage.setItem('k', '1'); } } catch {} });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 300))); p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/favicon/.test(m.text())) errs.push(m.type() + ': ' + m.text().slice(0, 200)); });
const K = (f, a) => p.evaluate(f, a);
const step = (n = 2, r = true) => K(([n, r]) => window.__kota.step(n, 1 / 30, r), [n, r]);
const shot = async n => { await step(1); await p.screenshot({ path: `${SH}/${n}.png` }); console.log('  shot', n); };
const modal = () => K(() => document.querySelector('.noc-modal .noc-box')?.innerText.replace(/\n+/g, ' | ') ?? null);
const mclick = async n => { const ok = await K(n => { const b = document.querySelector(`.noc-modal button[name="${n}"]`); b?.click(); return !!b; }, n); await p.waitForTimeout(120); return ok; };
const t0 = Date.now();
await p.goto('http://127.0.0.1:8787/?qa&menu&tutor&q=rendah', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
console.log('boot ms', Date.now() - t0);
await p.waitForTimeout(800); await step(2);
await shot('a01_title');
console.log('title text:', await K(() => document.getElementById('menu')?.innerText.replace(/\n+/g, ' | ').slice(0, 900)));
await p.click('#enter'); await p.waitForTimeout(400); await step(3);
await shot('a02_after_enter');
// tutorial starts ~900ms after walk mode via setTimeout
await p.waitForTimeout(1300); await step(3);
console.log('state', JSON.stringify(await K(() => window.__kota.state())));
console.log('brief:', await modal());
await shot('a03_brief');
await mclick('brief-ok'); await step(2);
console.log('order:', await modal());
await shot('a04_order');
await mclick('order-ok'); await step(3);
await shot('a05_hud_walk');
console.log('hud text:', await K(() => [...document.querySelectorAll('#hud, #noc-hud, .noc-hud, #hudLoc, #hudHint, #minimap, #tut, .tut')].map(e => e.id + '.' + e.className + ': ' + e.innerText?.replace(/\n+/g, ' | ').slice(0, 200)).join('\n')));
const st0 = await K(() => window.__kota.state());
const ts = await K(() => window.__kota.noc.tutorState());
const pcs = await K(() => window.__kota.pcs()); const tpc = pcs.find(c => c.name === ts.pc);
const anchors = await K(() => window.__kota.anchors());
const cab = await K(() => { const n = window.__kota.noc.CABINET; return n && { x: n.x + 200, z: n.z + 150 }; });
console.log('spawn', st0.x.toFixed(1), st0.z.toFixed(1), 'lv', st0.lv, '| cabinet', JSON.stringify(cab), '| target pc', ts.pc, tpc && tpc.x.toFixed(1), tpc && tpc.z.toFixed(1));
if (cab) console.log('straight-line spawn->cabinet m', Math.hypot(cab.x - st0.x, cab.z - st0.z).toFixed(1), 'cabinet->pc', tpc ? Math.hypot(cab.x - tpc.x, cab.z - tpc.z).toFixed(1) : '?');
// walk forward with real W key for ~6 s game time to feel movement + the waypoint
await p.keyboard.down('KeyW'); for (let i = 0; i < 6; i++) await step(30, i === 5); await p.keyboard.up('KeyW');
const st1 = await K(() => window.__kota.state()); console.log('walked 6s ->', st1.x.toFixed(1), st1.z.toFixed(1), 'dist', Math.hypot(st1.x - st0.x, st1.z - st0.z).toFixed(1), 'loc', st1.loc, 'hint', st1.hint);
await shot('a06_walk6s');
// run (shift)
await p.keyboard.down('ShiftLeft'); await p.keyboard.down('KeyW'); for (let i = 0; i < 4; i++) await step(30, false); await p.keyboard.up('KeyW'); await p.keyboard.up('ShiftLeft');
const st2 = await K(() => window.__kota.state()); console.log('ran 4s dist', Math.hypot(st2.x - st1.x, st2.z - st1.z).toFixed(1));
// idle 30 s to see stuck hint
await K(() => window.__kota.step(60, 0.5, false)); await step(2);
console.log('idle hint', JSON.stringify(await K(() => window.__kota.noc.tutorState())));
await shot('a07_idle_hint');
// map
await p.keyboard.press('KeyM'); await p.waitForTimeout(150); await step(2); await shot('a08_map'); await p.keyboard.press('KeyM'); await p.waitForTimeout(100); await p.keyboard.press('Escape').catch(()=>{}); await step(2);
console.log('menu paused?', await K(() => window.__kota.menu.paused()));
if (await K(() => window.__kota.menu.paused())) { await shot('a09_pause'); await K(() => window.__kota.menu.resume()); await K(() => window.__kota.pause(true)); }
console.log('mode', (await K(() => window.__kota.state())).mode);
await K(() => window.__kota.pause(true));
const save = await K(() => localStorage.getItem('kotaNusantara.noc.v1'));
console.log('errors', JSON.stringify(errs.slice(0, 12)));
await b.close();
