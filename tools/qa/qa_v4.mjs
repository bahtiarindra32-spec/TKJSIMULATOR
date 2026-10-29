import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 300)));
await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.solidAudit, null, { timeout: 120000 });
await p.waitForTimeout(800);
const K = (f, a) => p.evaluate(f, a);
await p.click('#enter').catch(() => {}); await p.waitForTimeout(300);
console.log('missions', await K(() => window.__kota.missions.missions.map(m => m.no + ':' + m.id).join(' ')));
await K(() => { window.__kota.missions.closeModal(); window.__kota.missions.closeModal(); });
await K(() => window.__kota.pause(true));
const shot = async n => { await K(() => window.__kota.step(1)); await p.screenshot({ path: `/workspace/work/shots/${n}.png` }); };
// TP pitch: mouse down => camera goes up
await p.keyboard.press('v'); await K(() => window.__kota.step(20));
const c0 = await K(() => window.__kota.cam ? window.__kota.cam() : null);
await K(() => { const st = window.__kota.state(); }); 
await p.mouse.move(550, 350); await p.mouse.down(); await p.mouse.move(550, 450, { steps: 5 }); await p.mouse.up();
await K(() => window.__kota.step(30)); await shot('v4_tp_down');
// door toggle: go to L1 corridor near workshop door
const near = await K(() => { const s = window.__kota.state(); return s; }); console.log('state', JSON.stringify(near).slice(0, 200));
// lift ride
await K(() => { window.__kota.teleport(window.__kota.liftPos().x, window.__kota.liftPos().z, 1, 0); window.__kota.step(10); });
await p.keyboard.press('e'); const ys = [];
for (let i = 0; i < 12; i++) { await K(() => window.__kota.step(15)); const s = await K(() => window.__kota.state()); ys.push(s.y.toFixed(1) + '/L' + s.lv); if (i === 3) await p.screenshot({ path: '/workspace/work/shots/v4_lift.png' }); }
console.log('lift', ys.join(' '));
// doors
console.log('door', await K(() => window.__kota.doorTest()));
// quiz render
await K(() => { window.__kota.missions.jumpTo(4); window.__kota.missions.openGame ? 0 : 0; });
await K(() => window.__kota.missions.setModal({ type: 'game', missionId: 'm8_dhcp', game: 'quiz' }));
await p.waitForTimeout(300); await p.screenshot({ path: '/workspace/work/shots/v4_quiz.png' });
console.log('errors:', errs.join(' | '));
await b.close();
