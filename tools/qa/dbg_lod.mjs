import { boot } from './qa_lib.mjs';
const { b, K } = await boot(null, { query: '&q=rendah', viewport: { width: 400, height: 300 } });
console.log(await K(() => { const T = window.__kota.scene.getObjectByName('GAME_TRAFFIC'); let car = null; T.traverse(o => { if (!car && o.name === 'VEH_SEDAN') car = o; });
  const B = car.position.constructor; const sz = o => { const bx = new (window.__kota.scene.constructor.prototype.constructor === undefined ? null : null); return null; };
  const res = {}; for (const c of car.children) { c.geometry?.computeBoundingBox?.(); const bb = c.geometry?.boundingBox ?? null; res[c.name || c.type] = bb ? [bb.min.x, bb.max.x, bb.min.y, bb.max.y, bb.min.z, bb.max.z].map(v => +v.toFixed(2)) : 'grp'; if (c.name === 'LOD_LOW') for (const m of c.children) { m.geometry.computeBoundingBox(); const q = m.geometry.boundingBox; res['low_' + m.material.type] = [q.min.x, q.max.x, q.min.y, q.max.y, q.min.z, q.max.z].map(v => +v.toFixed(2)); } }
  res.scale = car.scale.toArray(); res.parentScale = car.parent.scale.toArray(); return res; }));
await b.close();
