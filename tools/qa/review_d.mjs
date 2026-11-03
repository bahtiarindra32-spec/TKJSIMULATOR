// Review D: Lab Praktik at SMK Nusantara: find it, walk in, teacher desk, compose a jobsheet, start as student.
import { boot } from './qa_lib.mjs';
const save = {"v":1,"xp":146,"shifts":0,"closed":2,"slaMet":2,"seq":2,"contracts":2,"stars":6,"days":0,"streak":0,"best":0,"day":null,"seen":["tutor"],"mastery":{"tutor":{"ok":1,"miss":0},"static":{"ok":1,"miss":0}},"cert":0,"rj45":10,"rj45Used":0};
const Q = await boot(save, { viewport: { width: 1280, height: 720 } });
const { p, K, step, go, press, modalText, mclick, errs } = Q;
const SH = '/workspace/work/review/shots';
const shot = async n => { await K(() => window.__kota.step(1)); await p.screenshot({ path: `${SH}/${n}.png` }); console.log('  shot', n); };
const sp = await K(() => window.__kota.labSpots()); console.log('spots', JSON.stringify(sp));
const st0 = await K(() => window.__kota.state()); console.log('spawn', st0.x, st0.z, 'dist to lab guru', Math.hypot(sp.guru[0] - st0.x, sp.guru[1] - st0.z).toFixed(0), 'm');
// does the map show it?
await p.keyboard.press('KeyM'); await p.waitForTimeout(150); await step(2); await shot('d00_map_from_hotel'); await p.keyboard.press('KeyM'); await step(1);
await go(262, 498, 1, Math.PI / 2 + 0.3); await step(4); console.log('outside loc', await K(() => window.__kota.state().loc), '| hint', await K(() => window.__kota.state().hint)); await shot('d01_lab_outside');
await go(249.5, 500, 1, Math.PI / 2); await step(4); await shot('d02_lab_inside');
const g = sp.guru; let hint = null;
for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.5, 0.5]]) { await go(g[0] + dx, g[1] + dz, 1); hint = await K(() => window.__kota.state().hint); if (/Meja guru/.test(hint)) break; }
console.log('guru hint', hint); await step(2); await shot('d03_guru_desk');
await press('f'); await step(1); console.log('desk:', (await modalText())?.slice(0, 900)); await shot('d04_desk_modal');
await mclick('lab-teacher'); await step(1); console.log('teacher:', (await modalText())?.slice(0, 1200)); await shot('d05_teacher');
await p.fill('.noc-modal textarea[name=lab-ins]', 'siswa pasang ip statis lalu perbaiki gangguan, 30 menit, beda tiap siswa').catch(e => console.log('no textarea', e.message.slice(0, 80))); await mclick('lab-parse'); await step(1);
await K(() => { const b = document.querySelector('.noc-modal .noc-box'); if (b) b.scrollTop = b.scrollHeight; }); await shot('d06_teacher_code');
console.log('code', await K(() => document.querySelector('.noc-modal .lab-code b')?.dataset.code));
await mclick('lab-try'); await step(1); console.log('student form:', (await modalText())?.slice(0, 600)); await shot('d07_student_form');
await p.fill('.noc-modal input[name=lab-name]', 'Budi Santoso XI TKJ 2').catch(() => {}); await mclick('lab-start'); await step(3);
console.log('after start:', (await modalText())?.slice(0, 700)); await shot('d08_run_start');
await press('Escape'); await step(3); console.log('hud', await K(() => document.querySelector('#noc-hud')?.innerText.replace(/\n+/g, ' | '))); await shot('d09_run_hud');
console.log('errors', JSON.stringify(errs.filter(e => !/GPU stall/.test(e)).slice(0, 10)));
await Q.b.close();
