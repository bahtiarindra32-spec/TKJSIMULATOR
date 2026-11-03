import { boot } from './qa_lib.mjs';
const Q = await boot(null, { query: '', viewport: { width: 800, height: 500 } });
const { K } = Q;
const r = await K(() => { const sc = window.__kota.scene; const res = {};
  for (const n of ['BLD_LAB_PRAKTIK_TKJ', 'FASE_E_PROPERTI_JALAN', 'WAYFINDING', 'GAME_TRAFFIC', 'BATCH_L1']) { const g = sc.getObjectByName(n); if (!g) { res[n] = 'none'; continue; }
    const kinds = {}; const mats = new Set(); const sig = new Set(); const kids = {};
    g.traverseVisible(o => { if (!o.isMesh) return; kinds[o.isInstancedMesh ? 'inst' : 'mesh'] = (kinds[o.isInstancedMesh ? 'inst' : 'mesh'] || 0) + 1; const m = o.material; mats.add(m.uuid ?? 'arr');
      if (!Array.isArray(m)) sig.add([m.type, m.color?.getHexString(), m.map?.uuid, m.emissive?.getHexString(), m.roughness, m.metalness, m.transparent, m.opacity, m.side].join()); 
      let t = o; while (t.parent && t.parent !== g) t = t.parent; const k = t.name.replace(/\d+/g, '#'); kids[k] = (kids[k] || 0) + 1; });
    res[n] = { kinds, mats: mats.size, sigs: sig.size, kids: Object.entries(kids).sort((a, b) => b[1] - a[1]).slice(0, 8) }; }
  return res; });
console.log('RESULT', JSON.stringify(r)); await Q.b.close();
