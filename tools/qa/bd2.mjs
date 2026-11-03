import { boot } from './qa_lib.mjs';
const { b, K, go } = await boot(null, { query: '' });
await go(226, 162.5, 1, Math.PI); await K(() => window.__kota.step(2, 1/30, true));
const r = await K(() => { const S = window.__kota.scene; const out = {}; const cnt = o => { let n = 0; o.traverseVisible(m => { if (m.isMesh || m.isLine || m.isPoints) n++; }); return n; };
  const walk = (o, pre, d) => { for (const c of o.children) { const n = cnt(c); if (n > 25) { out[pre + (c.name || c.type)] = n; if (d < 2) walk(c, pre + (c.name || c.type) + '/', d + 1); } } };
  walk(S, '', 0); return { out, stats: window.__kota.stats() }; });
console.log(JSON.stringify(r)); await b.close();
