import { boot } from './qa_lib.mjs';
const Q = await boot(null, { query: '', viewport: { width: 800, height: 500 } });
const r = await Q.K(() => { const g = window.__kota.scene.getObjectByName('BATCH_L1'); const c = { map: 0, nomap: 0, transp: 0 }; const cols = {}; const verts = [];
  g.traverse(o => { if (!o.isMesh) return; const m = o.material; if (m.map) c.map++; else c.nomap++; if (m.transparent) c.transp++; const k = m.type + (m.map ? '+map' : '') + (m.emissiveIntensity > 0 && m.emissive?.getHex() ? '+em' : ''); cols[k] = (cols[k] || 0) + 1; verts.push(o.geometry.attributes.position.count); });
  verts.sort((a, b) => a - b); return { c, cols, smallest: verts.slice(0, 40), n: verts.length, under300: verts.filter(v => v < 300).length }; });
console.log('RESULT', JSON.stringify(r)); await Q.b.close();
