// Phone layout: portrait 390x844 and landscape 844x390 with touch. Screens: walk+job, board, PC, lab jobsheet. Reports overlapping HUD boxes.
import { boot } from './qa_lib.mjs';
const ph = process.argv[2] ?? 'port';
const vp = ph === 'port' ? { width: 390, height: 844 } : { width: 844, height: 390 };
const Q = await boot({ v: 1, xp: 1234, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } }, { viewport: vp, touch: true });
const { p, K, step, go, openPc, errs } = Q; const out = {};
const overlaps = () => K(() => {
  const sel = ['.ttop', '#hud-loc', '#noc-hud', '.jobsheet', '#t-stick .ring', '.tbtns', '#waypoint', '#toast', '#minimap', '#clock', '#iprompt'];
  const vis = e => { if (!e) return null; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
  const R = sel.map(s => [s, vis(document.querySelector(s))]).filter(x => x[1]);
  const W = innerWidth, H = innerHeight, res = [];
  for (let i = 0; i < R.length; i++) { const [a, r] = R[i]; if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) res.push(`${a} offscreen`); for (let j = i + 1; j < R.length; j++) { const [b, q] = R[j]; const ix = Math.min(r.right, q.right) - Math.max(r.left, q.left), iy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); if (ix > 4 && iy > 4) res.push(`${a} x ${b}`); } }
  return res;
});
const snap = async n => { await K(() => window.__kota.step(2)); await p.screenshot({ path: `/workspace/work/shots/mob_${ph}_${n}.png` }); out[n] = await overlaps(); };
try {
  out.touch = await K(() => document.body.classList.contains('touch'));
  const pc = await K(() => { const n = window.__kota.noc; const t = n.board?.()?.find?.(x => x) ; return null; });
  await K(() => { const n = window.__kota.noc; n.acceptContract('static', 1); n.closeModal?.(); });
  await snap('walk');
  await K(() => window.__kota.noc.openBoard?.()); await p.waitForTimeout(300); await snap('board'); await K(() => window.__kota.noc.closeModal?.());
  const jp = await K(() => window.__kota.noc.jobs.find(j => j.status === 'open')?.targets[0]?.pc.name);
  if (jp) { await openPc(jp); await p.waitForTimeout(1200); await p.screenshot({ path: `/workspace/work/shots/mob_${ph}_pc.png` }); await Q.closePc(); }
  await K(() => { window.__kota.praktik.start({ steps: ['static'], minutes: 60, perStudent: true, seed: 7 }, 'TEST01', 'Budi'); window.__kota.noc.closeModal?.(); });
  await go(240, 497, 1, Math.PI); await snap('lab');
} catch (e) { console.log('!!', e.message.slice(0, 300)); }
console.log('RESULT', JSON.stringify(out), errs); await Q.b.close();
