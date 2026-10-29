import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.reach, null, { timeout: 90000 });
await p.evaluate(() => window.__kota.pause(true));
for (const pt of process.argv.slice(2)) { const [x,z,r]=pt.split(',').map(Number); console.log(pt, JSON.stringify(await p.evaluate(([x,z,r]) => window.__kota.near(x,z,r), [x,z,r||0.3]))); }
await b.close();
