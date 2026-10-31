// v9 title screen / pause / panels screenshots: desktop, phone landscape, phone portrait (no ?qa: real menu)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const SH = '/workspace/work/shots/v9'; mkdirSync(SH, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const out = {}; const errs = [];
const which = (process.argv[2] ?? 'desk,land,port').split(',');
for (const [tag, vp, mob] of [['desk', { width: 1280, height: 720 }, false], ['land', { width: 844, height: 390 }, true], ['port', { width: 390, height: 844 }, true]].filter(x => which.includes(x[0]))) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob, deviceScaleFactor: 1, ...(mob ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' } : {}) });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(tag + ': ' + e.message.slice(0, 200)));
  await p.goto('http://127.0.0.1:8787/?q=rendah&t=17.6', { waitUntil: 'commit', timeout: 60000 });
  await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__kota.pause(true)); await p.evaluate(() => window.__kota.step(2));
  await p.screenshot({ path: `${SH}/menu_${tag}.png` });
  out[tag + '_menu'] = await p.evaluate(() => ({ open: window.__kota.menu.open(), overflow: document.documentElement.scrollWidth > innerWidth, btns: [...document.querySelectorAll('#menu .mn-list button:not([hidden])')].map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(r.top), Math.round(r.bottom), r.bottom <= innerHeight && r.top >= 0]; }) }));
  await p.click('#mnSettings'); await p.evaluate(() => window.__kota.step(1)); await p.screenshot({ path: `${SH}/menu_${tag}_settings.png` });
  out[tag + '_settingsFits'] = await p.evaluate(() => { const r = document.querySelector('#menu .mn-panel.on').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
  await p.click('#pnBack'); await p.click('#mnControls'); await p.evaluate(() => window.__kota.step(1)); await p.screenshot({ path: `${SH}/menu_${tag}_controls.png` }); await p.click('#pnBack');
  await p.click('#enter'); await p.waitForTimeout(900); await p.evaluate(() => window.__kota.step(2));
  for (const n of ['brief-ok', 'order-ok']) { const e = await p.$(`.noc-modal button[name=${n}]`); if (e) await e.click().catch(() => {}); await p.waitForTimeout(100); }
  out[tag + '_walk'] = await p.evaluate(() => window.__kota.state().mode);
  if (mob) await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))); else await p.keyboard.press('Escape');
  await p.waitForTimeout(300); out[tag + '_escPaused'] = await p.evaluate(() => window.__kota.menu.paused()); await p.evaluate(() => { window.__kota.noc.closeModal?.(); if (!window.__kota.menu.paused()) window.__kota.menu.pause(); window.__kota.step(1); }); await p.screenshot({ path: `${SH}/pause_${tag}.png` });
  out[tag + '_paused'] = await p.evaluate(() => window.__kota.menu.paused());
  await ctx.close();
}
console.log('RESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await b.close();
