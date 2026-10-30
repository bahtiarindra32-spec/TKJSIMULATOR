// Crouch (jongkok) QA: real keyboard input. phases: basic,third,desk,ceiling,sit,stair,lift,jump,ride
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'basic,third,desk,ceiling').split(',');
const Q = await boot(null);
const { p, K, step, go, goPc, press, errs } = Q;
const SH = '/workspace/work/shots/motor';
const HO = [220, 168];
const shot = async n => { await K(() => window.__kota.step(1)); await p.screenshot({ path: `${SH}/${n}.png` }); };
const st = () => K(() => window.__kota.state());
const cr = () => K(() => window.__kota.crouch());
const frames = (n, dt = 1 / 30) => K(([n, d]) => window.__kota.step(n, d, false), [n, dt]);
const hold = async (key, n) => { await p.keyboard.down(key); for (let i = 0; i < n; i += 3) await frames(3); await p.keyboard.up(key); await step(1); };
const waitRide = async (max = 900) => { let n = 0; for (; n < max; n += 15) { await frames(15); if (!(await K(() => window.__kota.vertical())).ride) break; } return n; };
const out = {};
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'basic') {
      await K(() => window.__kota.setThird(false));
      await go(150, 162, 1, Math.PI / 2); await step(3);          // Sudirman south sidewalk, facing west
      const a0 = await st(); await hold('w', 60); const a1 = await st(); const dStand = Math.hypot(a1.x - a0.x, a1.z - a0.z);
      await press('x'); await frames(15); const c1 = await cr();
      const b0 = await st(); await hold('w', 60); const b1 = await st(); const dCrouch = Math.hypot(b1.x - b0.x, b1.z - b0.z);
      await p.keyboard.down('Shift'); await hold('w', 60); await p.keyboard.up('Shift'); const b2 = await st(); const dCrouchRun = Math.hypot(b2.x - b1.x, b2.z - b1.z);
      await press('x'); await frames(15); const c2 = await cr();
      console.log('  stand eye', (c2.eye).toFixed(2), 'crouch eye', c1.eye.toFixed(2), '| 2 s walk: standing', dStand.toFixed(2), 'm, crouched', dCrouch.toFixed(2), 'm, crouched+Shift', dCrouchRun.toFixed(2), 'm');
      out.basic = c1.on && Math.abs(c1.eye - 1.05) < 0.05 && !c2.on && Math.abs(c2.eye - 1.62) < 0.08 && dCrouch < dStand * 0.6 && dCrouch > 1.2 && dCrouchRun < dStand * 0.6 ? 'OK' : 'FAIL';
    }
    if (ph === 'third') {
      await go(150, 162, 1, Math.PI / 2); await K(() => window.__kota.setThird(true)); await K(() => window.__kota.look(-0.2)); await step(6);
      await press('x'); await frames(15); await shot('crouch_third_idle'); const t1 = await K(() => window.__kota.camPose());
      await p.keyboard.down('w'); await frames(14); await shot('crouch_third_walk'); await p.keyboard.up('w'); await step(2);
      await press('v'); await frames(10); const c = await cr(); await shot('crouch_first');
      await press('v'); await frames(10); const c3 = await cr();
      await press('x'); await frames(15); const t2 = await K(() => window.__kota.camPose());
      console.log('  TP cam y crouched', t1.y.toFixed(2), 'standing', t2.y.toFixed(2), '| FP crouched eye', c.eye.toFixed(2), 'third', c.third, '| back to TP still crouched', c3.on);
      out.third = t1.y < t2.y - 0.3 && !c.third && Math.abs(c.eye - 1.05) < 0.06 && c3.on && c3.third ? 'OK' : 'FAIL';
      await K(() => window.__kota.setThird(false));
    }
    if (ph === 'desk') {
      // IT office desk row: walk into the open end of a desk (gap between desks) crouched and standing -> the desk top is solid
      const pc = await K(() => window.__kota.pcs().find(c => c.name === 'PROP_L1_PC_ITOFFICE_01') ?? window.__kota.pcs().find(c => /_L1_PC_/.test(c.name)));
      console.log('  pc', pc.name, pc.x.toFixed(2), pc.z.toFixed(2));
      const res = [];
      for (const crouched of [true, false]) {
        await go(pc.x - 1.1, pc.z, 1, -Math.PI / 2); await step(3);      // in the gap west of the desk, facing east
        if (crouched) { await press('x'); await frames(15); }
        await hold('d', 3); await hold('w', 60); const s = await st(); const c = await cr();
        res.push({ crouched, x: +(s.x - pc.x).toFixed(3), canStand: c.canStand });
        if (crouched) { await shot('crouch_desk'); await press('x'); await frames(15); }
      }
      console.log('  stopped at dx from PC centre (desk half-width 0.70 + radius 0.32 = 1.02):', JSON.stringify(res));
      out.desk = res.every(r => r.x <= -1.0) ? 'OK' : 'FAIL';
    }
    if (ph === 'ceiling') {
      // a test-only beam 1.35-1.55 m above the lobby floor (no natural 1.3-1.7 m overhead exists in the city)
      const X = HO[0] + 4, Z = HO[1] + 4;
      await K(([x, z]) => window.__kota.qaBeam(x, z, 1, 1.35, 1.55, 1.6, 1.6), [X, Z]);
      await go(X - 2.2, Z, 1, -Math.PI / 2); await step(3);
      await hold('w', 45); const sStand = await st(); console.log('  standing walk-in stopped at dx', (sStand.x - X).toFixed(2));
      await go(X - 2.2, Z, 1, -Math.PI / 2); await press('x'); await frames(15);
      await hold('w', 50); const sIn = await st(); const c1 = await cr();
      await press('x'); await frames(10); const c2 = await cr(); const toast = (await st()).toast;
      await press('Space'); await frames(10); const c3 = await cr(); const yJump = (await st()).y;
      await hold('w', 45); const sOut = await st(); await press('x'); await frames(15); const c4 = await cr();
      console.log('  crouched under beam at dx', (sIn.x - X).toFixed(2), 'canStand', c1.canStand, '| X ->', c2.on ? 'still crouched' : 'STOOD', JSON.stringify(toast), '| Space ->', c3.on ? 'still crouched' : 'STOOD', 'y', yJump.toFixed(2), '| walked out dx', (sOut.x - X).toFixed(2), '-> X stands', !c4.on);
      out.ceiling = sStand.x < X - 0.8 - 0.3 && Math.abs(sIn.x - X) < 0.6 && !c1.canStand && c2.on && /halangan/.test(toast) && c3.on && !c4.on ? 'OK' : 'FAIL';
    }
    if (ph === 'sit') {
      const pcs = await K(() => window.__kota.pcs().filter(c => /_L2_PC_/.test(c.name)).map(c => c.name)); let pc = null;
      for (const n of pcs) { if (await goPc(n) && /Nyalakan/.test((await st()).hint)) { pc = n; break; } }   // a spot where F means the PC (not a desk phone)
      console.log('  pc', pc); await press('x'); await frames(15); const c0 = await cr();
      await press('f'); for (let i = 0; i < 12 && !(await K(() => window.__kota.pcos.isOpen())); i++) await frames(3);
      const open = await K(() => window.__kota.pcos.isOpen()); const c1 = await cr();
      await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(150);
      await K(() => document.querySelector('#pcos .leave')?.click()); for (let i = 0; i < 12 && (await K(() => window.__kota.seat())); i++) await frames(3);
      await frames(5); const c2 = await cr(); const s = await st();
      console.log('  crouched', c0.on, '-> F: pcos open', open, 'crouch', c1.on, '| after leaving PC eye', c2.eye.toFixed(2), 'crouch', c2.on, 'hint', s.hint);
      out.sit = c0.on && open && !c1.on && !c2.on && Math.abs(c2.eye - 1.62) < 0.08 ? 'OK' : 'FAIL';
    }
    if (ph === 'stair') {
      await go(HO[0] + 17, HO[1] + 10.2, 1, Math.PI); await hold('w', 20); console.log('  hint', (await st()).hint);
      await press('x'); await frames(12); const c0 = await cr();
      await press('e'); await frames(9); const v1 = await K(() => window.__kota.vertical()); const c1 = await cr();
      await press('x'); await frames(3); const c2 = await cr();
      await waitRide(); const s = await st(); const c3 = await cr();
      console.log('  crouched', c0.on, '-> E: ride', !!v1.ride, 'crouch', c1.on, '| X during climb ->', c2.on, '| arrived lv', s.lv, 'y', s.y.toFixed(2), 'crouch', c3.on);
      out.stair = c0.on && v1.ride && !c1.on && !c2.on && s.lv === 2 && !c3.on ? 'OK' : 'FAIL';
      await press('q'); await waitRide();
    }
    if (ph === 'lift') {
      await go(HO[0] + 21, HO[1] + 10.2, 1, Math.PI); await hold('w', 20); console.log('  hint', (await st()).hint);
      await press('x'); await frames(12); const c0 = await cr();
      await press('e'); const panel = await K(() => document.getElementById('liftpanel').classList.contains('on')); const c1 = await cr();
      await press('x'); const c1b = await cr();                       // X while the panel is open: ignored
      await press('2'); await frames(6); await press('x'); const c2 = await cr();
      await waitRide(1500); const s = await st();
      console.log('  crouched', c0.on, '-> E: panel', panel, 'crouch', c1.on, '| X in panel', c1b.on, '| X in lift', c2.on, '| arrived lv', s.lv);
      out.lift = c0.on && panel && !c1.on && !c1b.on && !c2.on && s.lv === 2 ? 'OK' : 'FAIL';
    }
    if (ph === 'jump') {
      await go(150, 162, 1, Math.PI / 2); await step(3); await press('x'); await frames(15); const y0 = (await st()).y;
      await p.keyboard.press('Space'); await frames(2); const s1 = await st(); const c1 = await cr(); await frames(20);
      await p.keyboard.press('Space'); await frames(3); const s2 = await st(); await frames(30);
      console.log('  crouched Space -> crouch', c1.on, 'y', (s1.y - y0).toFixed(3), '| standing Space -> y', (s2.y - y0).toFixed(3));
      out.jump = !c1.on && Math.abs(s1.y - y0) < 0.01 && s2.y > y0 + 0.05 ? 'OK' : 'FAIL';
    }
    if (ph === 'ride') {
      await go(241.5, 163.5, 1, Math.PI); await step(3); await press('x'); await frames(12); const c0 = await cr();
      await press('f'); await frames(12); const s1 = await st(); const c1 = await cr();
      await press('x'); await frames(5); const c2 = await cr(); const s2 = await st();
      await press('f'); await frames(10); const s3 = await st(); const c3 = await cr();
      console.log('  crouched', c0.on, '-> F: riding', s1.riding, 'crouch', c1.on, '| X while riding -> crouch', c2.on, 'riding', s2.riding, '| F -> riding', s3.riding, 'eye', c3.eye.toFixed(2));
      out.ride = c0.on && s1.riding && !c1.on && !c2.on && s2.riding && !s3.riding && !c3.on ? 'OK' : 'FAIL';
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 400)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
