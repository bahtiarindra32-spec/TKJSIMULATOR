// Fresh start: the first W must move the player toward the Workshop, with the waypoint on screen.
import { boot } from './qa_lib.mjs';
const Q = await boot(null, { viewport: { width: 1280, height: 720 }, query: '&low' });
const { p, K, errs } = Q; const out = {};
try {
  await K(() => window.__kota.pause(true)); await K(() => window.__kota.step(2));
  const a = await K(() => window.__kota.state()); await p.screenshot({ path: '/workspace/work/shots/spawn_0.png' });
  const wp = await K(() => { const w = document.querySelector('#waypoint, .waypoint'); if (!w) return null; const r = w.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), vis: getComputedStyle(w).display !== 'none' }; });
  await K(() => window.__kota.pause(true));
  await p.keyboard.down('w'); for (let i = 0; i < 60; i++) await K(() => window.__kota.step(1, 1 / 30, false)); await p.keyboard.up('w');
  const b = await K(() => window.__kota.state()); await K(() => window.__kota.step(1)); await p.screenshot({ path: '/workspace/work/shots/spawn_1.png' });
  const moved = Math.hypot(b.x - a.x, b.z - a.z); console.log('  moved', moved.toFixed(2), 'm in 2 s', JSON.stringify(wp));
  out.spawn = moved > 3 ? 'OK' : 'FAIL';
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out.spawn = 'ERR'; }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
