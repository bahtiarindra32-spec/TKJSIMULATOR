// Draw calls at the default ('tinggi') look: spawn, a street, hotel L3, lab. Breakdown of visible meshes by top-level group.
import { boot } from './qa_lib.mjs';
const Q = await boot(null, { query: process.env.T ? '&t=' + process.env.T : '', viewport: { width: 1280, height: 720 } });
const { p, K, go } = Q; const out = {};
const brk = () => K(() => { const sc = window.__kota.scene; const c = {}; const cam = window.__kota.camera ?? null;
  sc.traverseVisible(o => { if (!o.isMesh && !o.isInstancedMesh) return; let t = o; const path = []; while (t.parent && t.parent !== sc) { path.unshift(t.parent.name || t.parent.type); t = t.parent; } const k = (t.name || t.type) + (path[1] ? '/' + path[1] : ''); c[k] = (c[k] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14); });
const at = async (n, x, z, lv, yaw) => { await go(x, z, lv, yaw); await K(() => window.__kota.step(4, 1 / 30, true)); out[n] = await K(() => window.__kota.stats()); if (process.env.SHOT) await p.screenshot({ path: '/workspace/work/shots/perf_' + process.env.SHOT + '_' + n + '.png' }); out[n + '_b'] = await brk(); };
try {
  const sp = await K(() => window.__kota.state()); await at('spawn', sp.x, sp.z, sp.lv, Math.PI); await at('street', 200, 300, 1, 0); await at('hotelL3', sp.x, sp.z, 3, 0);
  await at('lab', 240, 497, 1, Math.PI);
} catch (e) { console.log('!!', e.message.slice(0, 300)); }
console.log('RESULT', JSON.stringify(out, null, 0)); await Q.b.close();
