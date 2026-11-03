import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 400 } });
await p.goto('http://127.0.0.1:8787/?qa&low', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
const r = await p.evaluate(() => {
  const K = window.__kota; const out = {};
  const count = (o) => { let n = 0, t = 0; o.traverseVisible(m => { if (m.isMesh || m.isInstancedMesh || m.isLine || m.isPoints) { n++; const g = m.geometry; t += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3 * (m.count ?? 1); } }); return [n, Math.round(t)]; };
  for (const c of K.scene.children) { if (c.name === 'KOTA_NUSANTARA') { for (const w of c.children) out['world/' + w.name] = count(w); } else out[c.name || c.type] = count(c); }
  const gl = K.scene.getObjectByName('GAME_LAYER'); for (const c of gl.children.slice(0, 3)) out['game/' + (c.name || c.type)] = count(c);
  out.vehicleMeshes = K.scene.getObjectByName('GAME_LAYER').children.length;
  return out;
});
console.log(JSON.stringify(r, null, 0));
await b.close();
