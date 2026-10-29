import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--single-process"] });
const p = await b.newPage();
process.on('SIGTERM', () => console.log('GOT SIGTERM')); process.on('SIGINT', () => console.log('GOT SIGINT')); process.on('SIGHUP', () => console.log('GOT SIGHUP'));
await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__kota, null, { timeout: 60000 }); await p.evaluate(() => window.__kota.pause(true));
for (let i = 0; i < 6; i++) { await p.waitForTimeout(5000); const r = await p.evaluate(() => !!window.__kota).catch(e => e.message.slice(0, 60)); console.log(i, r); }
await b.close();
