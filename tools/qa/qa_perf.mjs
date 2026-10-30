// Mobile performance probe: touch viewport, CPU throttle, real rAF frames for a few seconds at fixed spots.
import { chromium } from 'playwright';
const tag = process.argv[2] ?? 'run'; const query = process.env.QUERY ?? ''; const secs = +(process.env.SECS ?? 6); const rate = +(process.env.THROTTLE ?? 4);
const spots = (process.env.SPOTS ?? 'street,lobby').split(',');
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
const t0 = Date.now();
await p.goto('http://127.0.0.1:8787/?qa' + query, { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
const boot = Date.now() - t0; console.log('  boot', boot);
const K = (f, a) => p.evaluate(f, a);
await p.tap('#enter'); await p.waitForTimeout(200); await K(() => window.__kota.pause(true));
const SP = { street: [226, 162.5, 1, Math.PI], lobby: [228, 175, 1, 0], office: [232, 172, 2, Math.PI], hotel: [235, 179, 6, 0] };
const res = { tag, query, boot, throttle: rate, dpr: 2 };
for (const s of spots) {
  const [x, z, lv, yaw] = SP[s];
  await K(([x, z, lv, yaw]) => { window.__kota.teleport(x, z, lv, yaw); window.__kota.step(2); }, [x, z, lv, yaw]);
  const tw = Date.now(); await K(() => window.__kota.step(1)); const warm = Date.now() - tw; console.log('  warm', s, warm);   // first frame (shader compile)
  const info = await K(() => window.__kota.stats());
  const f0 = await K(() => window.__kota.perf().frames); await K(() => window.__kota.pause(false));
  await p.waitForTimeout(secs * 1000);
  await K(() => window.__kota.pause(true)); const f1 = await K(() => window.__kota.perf().frames);
  console.log('  spot', s, 'done');
  res[s] = { fps: +((f1 - f0) / secs).toFixed(2), warmMs: warm, calls: info.calls, tris: info.tris, q: await K(() => window.__kota.perf().quality) };
}
console.log('PERF', JSON.stringify(res), 'errs', JSON.stringify(errs.slice(0, 3)));
await b.close();
