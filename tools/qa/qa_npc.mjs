import { boot } from './qa_lib.mjs';
const { b, p, errs, K, go, step } = await boot(null);
await K(() => window.__kota.state && 0);
for (const [n, x, z, lv, yaw] of [['npc_l2', 236, 175, 2, 0], ['npc_l3', 230, 175, 3, 0], ['npc_l5', 224, 179, 5, Math.PI/2], ['npc_l2b', 236, 172.5, 2, Math.PI]]) {
  await go(x, z, lv, yaw); await K(() => window.__kota.step(4, 1/30, true)); await p.screenshot({ path: `/workspace/work/shots/${n}.png` });
}
console.log('npcs', await K(() => { const g = window.__kota && document; return 1; }), 'errors', JSON.stringify(errs)); await b.close();
