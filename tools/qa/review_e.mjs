// Review E: phone landscape 844x390 (touch): title, tutorial briefing, walk HUD with touch controls; plus render stats.
import { chromium } from 'playwright';
const SH = '/workspace/work/review/shots';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const errs = [];
for (const [tag, vp] of [['land', { width: 844, height: 390 }], ['port', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('k')) { localStorage.clear(); sessionStorage.setItem('k', '1'); } } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(tag + ': ' + e.message.slice(0, 200)));
  const K = (f, a) => p.evaluate(f, a); const step = n => K(n => window.__kota.step(n), n);
  const shot = async n => { await step(1); await p.screenshot({ path: `${SH}/${n}.png` }); console.log('  shot', n); };
  await p.goto('http://127.0.0.1:8787/?qa&menu&tutor&q=rendah', { waitUntil: 'commit', timeout: 60000 });
  await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 90000 }); await p.waitForTimeout(800); await step(2);
  await shot(`e_${tag}_title`);
  await p.tap('#enter').catch(() => p.click('#enter')); await p.waitForTimeout(1500); await step(3);
  await shot(`e_${tag}_brief`);
  for (const n of ['brief-ok', 'order-ok']) { await K(n => document.querySelector(`.noc-modal button[name=${n}]`)?.click(), n); await p.waitForTimeout(120); }
  await step(3); await shot(`e_${tag}_walk`);
  console.log(tag, 'overflowX', await K(() => document.documentElement.scrollWidth > innerWidth), 'body', await K(() => document.body.className));
  if (tag === 'land') {
    console.log('stats spawn', JSON.stringify(await K(() => window.__kota.stats())), JSON.stringify(await K(() => window.__kota.perf())));
    await K(() => { window.__kota.setQ('tinggi'); window.__kota.teleport(200, 140, 1, Math.PI); }); await step(3);
    const t0 = Date.now(); await step(10); console.log('swiftshader ms/frame tinggi @844x390', ((Date.now() - t0) / 10).toFixed(0), JSON.stringify(await K(() => window.__kota.stats())));
  }
  await ctx.close();
}
console.log('errors', JSON.stringify(errs));
await b.close();
