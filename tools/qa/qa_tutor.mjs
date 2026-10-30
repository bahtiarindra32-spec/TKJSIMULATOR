// C: first-day tutorial job, done physically with real keys; stuck hints checked by idling and by a wrong step.
import { boot } from './qa_lib.mjs';
const Q = await boot(null, { query: '&low&tutor' });
const { p, K, step, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, modalText, mclick, report, shot, errs } = Q;
const out = {};
const ts = () => K(() => window.__kota.noc.tutorState());
await p.waitForTimeout(1300); await step(2);
console.log('  modal', (await modalText())?.slice(0, 160));
await mclick('brief-ok'); await mclick('order-ok');
let s = await ts(); console.log('  start', JSON.stringify(s)); out.started = s?.stage === 'tools';
// idle: no hint at first, nudge after ~25 s idle, detail after ~70 s
await K(() => window.__kota.step(20, 0.5, false)); s = await ts(); out.noHintEarly = s.lvl === 0;
await K(() => window.__kota.step(30, 0.5, false)); s = await ts(); console.log('  idle 25s', s.lvl, s.hint); out.hint1 = s.lvl === 1 && /Lemari Alat/.test(s.hint);
await K(() => window.__kota.step(100, 0.5, false)); s = await ts(); console.log('  idle 75s', s.lvl, s.hint); out.hint2 = s.lvl === 2;
await shot('tut_hint');
// wrong step: sit at the PC before the cable is done -> hint about the cable
await goPc(s.pc); await openPc(s.pc); await K(() => window.__kota.step(30, 0.5, false)); s = await ts(); console.log('  wrong step', s.stage, s.lvl, s.hint); out.wrongHint = s.lvl >= 1 && /kabel/i.test(s.hint);
await closePc();
// tools from the cabinet
console.log('  cab', await goAnchor('CABINET')); await press('f'); await mclick('take-tester'); await mclick('take-patch'); console.log('  cabinet', (await modalText())?.slice(-120)); await press('Escape');
s = await ts(); out.hintGoneOnProgress = s.lvl === 0; console.log('  after tools', s.stage);
await goPc(s.pc); await press('c'); await mclick('phys-install'); await mclick('phys-test'); console.log('  phys', (await modalText())?.slice(0, 200)); await press('Escape');
s = await ts(); console.log('  after cable', JSON.stringify(s.tut), s.stage);
await openPc(s.pc); await openCmd(); await cmd('ipconfig'); s = await ts(); console.log('  after ipconfig', JSON.stringify(s?.tut));
const gw = s.tut.gw; await cmd(`ping ${gw}`, 4500); console.log('  ping out', (await cmdText())?.slice(-260));
await closePc();
const r = await report('tutor'); out.closed = /Laporan kerja/.test(r ?? '');
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
