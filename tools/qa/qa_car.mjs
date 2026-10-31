import { boot } from './qa_lib.mjs';
const q = process.argv[2];
const { b, p, K, go } = await boot(null, { query: '&q=' + q, viewport: { width: 640, height: 360 } });
await go(200, 140, 1, 0); await K(() => window.__kota.step(10, 1/30, false));
const c = await K(() => { const w = window.__kota.scene.getObjectByName('GAME_TRAFFIC'); let r = null; w.traverse(o => { if (!r && /^VEH_(MPV|SEDAN|HATCH)$/.test(o.name) && o.visible && Math.hypot(o.getWorldPosition(new o.position.constructor()).x, o.getWorldPosition(new o.position.constructor()).z) > 5) { const v = o.getWorldPosition(new o.position.constructor()); r = { x: v.x + 200, z: v.z + 150, n: o.name }; } }); return r; });
await go(c.x + 4, c.z + 4, 1, Math.PI / 4); await K(() => { window.__kota.step(1, 1/60, true); });
await p.screenshot({ path: `/workspace/work/shots/car_${q}.png` }); console.log('RESULT', JSON.stringify(c)); await b.close();
