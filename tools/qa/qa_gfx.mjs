import { boot } from './qa_lib.mjs';
const spot = process.argv[2] ?? 'street';
const { b, p, K, go, errs } = await boot(null, { query: '&q=hemat', viewport: { width: 640, height: 360 } });
await K(() => window.__kota.menu.resume?.());
const SP = { street: [215, 150, 1, -2.4], ruko: [112, 155.5, 1, Math.PI + 0.5], office: [232, 172, 2, Math.PI], south: [150, 334.5, 1, Math.PI] }[spot];
const out = { gfx: await K(() => window.__kota.gfx()) };
for (const q of (process.env.QS ?? 'hemat,rendah,sedang,tinggi').split(',')) {
  await K(q => window.__kota.setQ(q), q);
  await go(...SP); await K(() => { window.__kota.step(2, 1/30, true); });
  out[q] = await K(() => ({ ...window.__kota.stats(), q: window.__kota.perf().quality }));
  out[q] = { calls: out[q].calls, tris: out[q].tris, q: out[q].q };
  await p.screenshot({ path: `/workspace/work/shots/gfx_${spot}_${q}.png` });
}
console.log('RESULT', JSON.stringify(out), 'errs', JSON.stringify(errs)); await b.close();
