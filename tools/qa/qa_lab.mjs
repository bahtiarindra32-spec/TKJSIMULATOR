// Lab Praktik: teacher sheet -> code -> student run (career frozen) -> result sheet; ?lab= link opens the student form.
import { boot } from './qa_lib.mjs';
const ph = process.argv[2] ?? 'run';
const Q = await boot({ v: 1, xp: 1234, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } }, ph === 'link' ? { query: '&low&lab=' + (process.argv[3] ?? 'X') } : {});
const { p, K, step, press, modalText, mclick, shot, errs } = Q;
const out = {};
try {
  if (ph === 'link') {
    for (let i = 0; i < 20 && !(await K(() => !!document.querySelector('.noc-modal input[name=lab-code]'))); i++) { await step(3); await p.waitForTimeout(150); }
    out.link = await K(() => document.querySelector('.noc-modal input[name=lab-code]')?.value); console.log('  form', (await modalText())?.slice(0, 200));
  } else {
    await K(() => window.__kota.noc.openBoard()); await mclick('lab-teacher');
    await p.fill('.noc-modal textarea[name=lab-ins]', 'siswa pasang ip statis lalu perbaiki gangguan, 30 menit, beda tiap siswa'); await mclick('lab-parse');
    const ticks = await K(() => [...document.querySelectorAll('.noc-modal .lab-step input')].filter(i => i.checked).map(i => i.name)); console.log('  ticks', ticks);
    const code = await K(() => document.querySelector('.noc-modal .lab-code b')?.dataset.code); console.log('  code', code); await shot('lab_teacher');
    await mclick('lab-try'); await p.fill('.noc-modal input[name=lab-name]', 'Budi Santoso XI TKJ 2'); console.log('  preview', (await modalText())?.slice(0, 200)); await mclick('lab-start');
    const closeAll = async () => { await K(() => { const n = window.__kota.noc; for (const j of n.jobs) if (j.status !== 'closed') { j.targets.forEach(t => { t.ok = t.tested = true; }); n.close(j); } }); for (let i = 0; i < 40; i++) { await step(2); await p.waitForTimeout(60); await mclick('report-ok'); const s = await K(() => ({ next: window.__kota.noc.mode !== 'idle' && window.__kota.noc.jobs.some(j => j.status !== 'closed'), res: !!document.querySelector('.noc-modal.labres, .noc-box.labres') })); if (s.next || s.res) break; } };
    const s1 = await K(() => ({ lab: !!window.__kota.noc.labRun, jobs: window.__kota.noc.jobs.map(j => j.title) })); console.log('  step1', JSON.stringify(s1)); await press('Escape');
    await closeAll(); const s2 = await K(() => ({ lab: window.__kota.noc.labRun?.i, jobs: window.__kota.noc.jobs.map(j => j.title + ' ' + j.faults) })); console.log('  step2', JSON.stringify(s2)); await press('Escape');
    await closeAll(); await step(2); const res = await modalText(); console.log('  result', res?.slice(0, 500)); await shot('lab_result');
    const xp = await K(() => JSON.parse(localStorage.getItem('kotaNusantara.noc.v1')).xp);
    out.run = ticks.join() === 'lab-static,lab-trouble' && s1.jobs.every(t => /LAB 1\/2/.test(t)) && /LAB 2\/2/.test(s2.jobs.join()) && /Budi Santoso/.test(res ?? '') && /Nilai/.test(res ?? '') && xp === 1234 ? 'OK' : 'FAIL';
    console.log('  career xp after lab', xp, 'code', code);
  }
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out[ph] = 'ERR'; }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
