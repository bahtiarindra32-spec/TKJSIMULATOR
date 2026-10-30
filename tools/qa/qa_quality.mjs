import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
await p.goto('http://127.0.0.1:8787/?qa', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
const K = (f, a) => p.evaluate(f, a);
await p.tap('#enter'); await p.waitForTimeout(200); await K(() => window.__kota.pause(true));
const spot = process.argv[2] === 'lobby' ? [228, 175, 1, 0] : [226, 162.5, 1, Math.PI];
await K(s => { window.__kota.teleport(...s); window.__kota.step(2); }, spot);
for (const q of ['tinggi', 'sedang', 'rendah', 'hemat']) {
  await K(q => { window.__kota.setQ(q); window.__kota.step(2, 1/30, true); }, q);
  const s = await K(() => ({ ...window.__kota.stats(), ...window.__kota.perf() }));
  console.log(q, JSON.stringify(s), await K(() => document.getElementById('btnGfx')?.textContent));
  await p.screenshot({ path: `/workspace/work/shots/q_${process.argv[2]}_${q}.png` });
}
console.log('errs', JSON.stringify(errs)); await b.close();
