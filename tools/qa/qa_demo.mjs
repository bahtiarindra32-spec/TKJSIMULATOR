// Mode Juri: title menu button → 6 stops with real clicks → exit restores the player's own save (also after a reload mid-tour).
import { boot } from './qa_lib.mjs';
const SAVE = { v: 1, xp: 1234, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } };
const Q = await boot(SAVE, { viewport: { width: 1280, height: 720 } });
const { p, K, step, errs } = Q; const out = {}; const seen = [];
const xp = () => K(() => JSON.parse(localStorage.getItem('kotaNusantara.noc.v1') ?? '{}').xp);
try {
  await K(() => window.__kota.menu.show()); await p.waitForTimeout(300);
  await p.click('#mnJuri'); await p.waitForTimeout(900); await step(2);
  for (let i = 0; i < 6; i++) {
    const st = await K(() => ({ t: document.querySelector('.demo-bar .db-t')?.textContent, n: document.querySelector('.demo-bar .mono')?.textContent, modal: (document.querySelector('.noc-modal .noc-box')?.textContent ?? '').slice(0, 70), lab: window.__kota.praktik.state()?.step ?? null, jobs: window.__kota.noc.openJobs().length, mode: window.__kota.state().mode }));
    seen.push(st); console.log('  stop', JSON.stringify(st));
    await p.screenshot({ path: `/workspace/work/shots/demo_${i + 1}.png` });
    if (i < 5) { await K(() => document.querySelector('.demo-bar button[name=demo-next]').click()); await p.waitForTimeout(400); await step(2); }
  }
  console.log('  xp during tour', await xp());
  await K(() => document.querySelector('.demo-bar button[name=demo-exit]').click());
  await p.waitForLoadState('load'); await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
  const after = await xp(); console.log('  xp after exit', after, 'url', p.url());
  // crash path: start again, reload in the middle
  await K(() => window.__kota.demo.start()); await p.waitForTimeout(300); console.log('  xp mid tour', await xp());
  await p.reload(); await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
  const after2 = await xp(); console.log('  xp after reload', after2);
  out.demo = seen.length === 6 && seen.every((s, i) => s.n === `${i + 1}/6`) && seen[0].jobs >= 1 && seen[3].lab === 'vlsm' && /Rekap kelas/.test(seen[5].modal) && after === 1234 && after2 === 1234 ? 'OK' : 'FAIL';
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out.demo = 'ERR'; }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
