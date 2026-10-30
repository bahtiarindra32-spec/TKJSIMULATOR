// v8 stabilization: stairs walked with real keys (multi-floor), lift panel L1->L8 and back, walking out after each ride.
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'stair,lift8').split(',');
const Q = await boot(null);
const { p, K, shot, step, go, press, errs } = Q;
const HO = [220, 168];
const st = () => K(() => window.__kota.state());
const hold = async (key, frames) => { await p.keyboard.down(key); for (let i = 0; i < frames; i += 3) await step(3); await p.keyboard.up(key); await step(1); };
const holdUntil = async (key, test, max = 120) => { await p.keyboard.down(key); let s; for (let i = 0; i < max; i += 3) { await step(3); s = await st(); if (test(s)) break; } await p.keyboard.up(key); await step(1); return s; };
const waitRide = async (max = 900) => { let n = 0; for (; n < max; n += 15) { await K(() => window.__kota.step(15, 1 / 30, false)); if (!(await K(() => window.__kota.vertical())).ride) break; } return n; };
const out = {};
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'stair') {
      await go(HO[0] + 17, HO[1] + 10.2, 1, Math.PI);
      let s = await holdUntil('w', s => /Naik tangga/.test(s.hint), 60); console.log('  at door', s.z.toFixed(2), s.hint);
      const levels = [];
      for (const k of ['e', 'e']) { await press(k); await waitRide(); s = await st(); levels.push(`${s.lv}@${s.y.toFixed(2)}`); }
      await shot('v8_stair_l3');
      // walk away from the stair on L3 and come back (floor height must hold, no falling through)
      await hold('w', 30); s = await st(); console.log('  walked on L3', s.x.toFixed(1), s.z.toFixed(1), 'y', s.y.toFixed(2), 'lv', s.lv);
      const walkedOk = s.lv === 3 && Math.abs(s.y - 7.32) < 0.06;
      await go(HO[0] + 17, HO[1] + 10.8, 3, Math.PI); await step(3);
      for (const k of ['q', 'q']) { await press(k); await waitRide(); s = await st(); levels.push(`${s.lv}@${s.y.toFixed(2)}`); }
      console.log('  levels', levels.join(' '));
      out.stair = levels.join(',') === '2@4.12,3@7.32,2@4.12,1@0.12' && walkedOk ? 'OK' : 'FAIL ' + levels.join(',');
    }
    if (ph === 'lift8') {
      await go(HO[0] + 21, HO[1] + 10.2, 1, Math.PI);
      let s = await holdUntil('w', s => /Panggil lift/.test(s.hint), 60); console.log('  at lift', s.z.toFixed(2), s.hint);
      await press('e'); const panel = await K(() => document.getElementById('liftpanel').classList.contains('on')); console.log('  panel open', panel);
      await shot('v8_lift_panel');
      await press('8'); const fr = await waitRide(1500); s = await st(); console.log('  L1->L8 frames', fr, 'lv', s.lv, 'y', s.y.toFixed(2), 'z', s.z.toFixed(2));
      await shot('v8_lift_l8');
      const up = s.lv === 8 && Math.abs(s.y - 23.32) < 0.06;
      // walk out into the L8 corridor and back to the lift (landing door must close behind and still allow return)
      await hold('w', 24); const s2 = await st(); console.log('  walked out', s2.z.toFixed(2), 'y', s2.y.toFixed(2), s2.loc);
      await K(() => { window.__kota.player.yaw = Math.PI; }); await step(6);
      s = await holdUntil('w', s => /Panggil lift/.test(s.hint), 60);
      await press('q'); await press('1'); await waitRide(1500); s = await st(); console.log('  L8->L1 lv', s.lv, 'y', s.y.toFixed(2));
      const down = s.lv === 1 && Math.abs(s.y - 0.12) < 0.06;
      // one-floor E inside the panel, twice
      await go(HO[0] + 21, HO[1] + 10.8, 1, Math.PI); await step(3);
      await press('e'); await press('e'); await waitRide(); await go(HO[0] + 21, HO[1] + 10.8, 2, Math.PI); await press('e'); await press('e'); await waitRide(); s = await st();
      const step2 = s.lv === 3;
      console.log('  E,E twice ->', s.lv, 'y', s.y.toFixed(2));
      out.lift8 = up && down && step2 && s2.z < HO[1] + 10.5 ? 'OK' : `FAIL up=${up} down=${down} e2=${step2} out=${s2.z.toFixed(2)}`;
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 300)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
