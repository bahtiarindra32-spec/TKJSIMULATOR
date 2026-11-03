import { boot } from './qa_lib.mjs';
const Q = await boot(null, { viewport: { width: 960, height: 540 }, query: '&low' });
const { p, K } = Q;
const s = await K(() => window.__kota.state()); console.log('  spawn', s.x, s.z);
for (const [n, yaw] of [['pi', Math.PI], ['pi_l', Math.PI + 0.5], ['pi_r', Math.PI - 0.5]]) { await K(([x, z, y]) => { window.__kota.teleport(x, z, 1, y); window.__kota.step(2, 1 / 30, true); }, [s.x, s.z, yaw]); await p.screenshot({ path: `/workspace/work/shots/spawn_${n}.png` }); }
const cab = await K(() => { const c = window.__kota.noc.CABINET; return { x: c.x + 200, z: c.z + 150 }; }); console.log('  cabinet', JSON.stringify(cab));
await Q.b.close();
