import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } }); p.on('crash', () => console.log('CRASH')); p.on('console', m => console.log('c:', m.text().slice(0,150))); p.on('pageerror', e => console.log('pe', e.message.slice(0,200)));
await p.goto('http://127.0.0.1:8787/?low', { waitUntil: 'commit' });
for (let i = 0; i < 12; i++) { await p.waitForTimeout(5000); const r = await p.evaluate(() => [!!window.__kota, location.href]).catch(e => e.message.slice(0, 80)); console.log(i, JSON.stringify(r)); }
await b.close();
