// v6 playtest: server-room exit, floating prompts, sit/stand, real lift + stair walk, Wi-Fi baseline, cache guard.
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'server,prompt,sit,lift,stair,wifi,save').split(',');
const Q = await boot(null);
const { p, K, shot, step, go, goPc, press, errs } = Q;
const HO = [220, 168];
const st = () => K(() => window.__kota.state());
const hold = async (key, frames) => { await p.keyboard.down(key); for (let i = 0; i < frames; i += 3) await step(3); await p.keyboard.up(key); await step(1); };
const out = {};
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'server') {
      // inside the server room on the raised floor, face the door (north = -Z), open it, walk out
      await go(HO[0] + 26.5, HO[1] + 15.5, 1, 0);
      let s = await st(); console.log('  start', s.x.toFixed(2), s.z.toFixed(2), 'y', s.y.toFixed(2));
      await hold('w', 60); s = await st(); console.log('  at door?', s.z.toFixed(2), 'y', s.y.toFixed(2), 'hint', s.hint, 'prompt', await K(() => window.__kota.prompt()));
      if (/Buka pintu/.test(s.hint)) { await press('f'); for (let i = 0; i < 12; i++) await step(3); }
      await shot('v6_server_door');
      await hold('w', 120); s = await st(); console.log('  after', s.z.toFixed(2), 'y', s.y.toFixed(2), s.loc);
      out.server = s.z < HO[1] + 11.6 ? 'OUT' : 'STUCK';
      // and back in again (ramp up)
      await go(HO[0] + 26.5, HO[1] + 10.8, 1, Math.PI); await hold('w', 90); s = await st(); console.log('  back in', s.z.toFixed(2), 'y', s.y.toFixed(2));
      out.serverIn = s.z > HO[1] + 13 && s.y > 0.35 ? 'IN' : 'NOT-IN';
    }
    if (ph === 'prompt') {
      await go(HO[0] + 18, HO[1] + 11, 1, 0); await step(3);
      const pr = await K(() => window.__kota.prompt()); console.log('  prompt near stair door:', pr); await shot('v6_prompt_door');
      await goPc('PROP_L1_PC_IT_02').catch(() => {}); await step(3); console.log('  prompt at PC:', await K(() => window.__kota.prompt())); await shot('v6_prompt_pc');
      out.prompt = pr ? 'OK' : 'NONE';
    }
    if (ph === 'sit') {
      const pcs = await K(() => window.__kota.pcs().filter(c => /_L2_PC_/.test(c.name)).map(c => c.name)); const pc = pcs[3];
      await goPc(pc); const cam0 = await K(() => window.__kota.cam());
      await press('f'); const tr = [];
      for (let i = 0; i < 8; i++) { await step(3); tr.push([await K(() => JSON.stringify(window.__kota.seat())), (await K(() => window.__kota.cam())).y.toFixed(2)].join(' ')); if (i === 2) await shot('v6_sit_mid'); }
      console.log('  sit trace', tr.join(' / '));
      const open = await K(() => window.__kota.pcos.isOpen()); console.log('  pcos open', open);
      await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(200); await shot('v6_sit_os');
      await K(() => document.querySelector('#pcos .leave')?.click()); const tr2 = [];
      for (let i = 0; i < 8; i++) { await step(3); tr2.push([await K(() => JSON.stringify(window.__kota.seat())), (await K(() => window.__kota.cam())).y.toFixed(2)].join(' ')); }
      console.log('  stand trace', tr2.join(' / '));
      out.sit = open && !(await K(() => window.__kota.seat())) ? 'OK' : 'FAIL';
    }
    if (ph === 'lift') {
      await go(HO[0] + 20, HO[1] + 11, 1, 0); await step(3); console.log('  hint', (await st()).hint);
      await press('e'); const tr = []; let shotIn = false;
      for (let i = 0; i < 160; i++) {
        await step(3); const v = await K(() => window.__kota.vertical()); const s = await st();
        if (i % 6 === 0) tr.push(`${v.ride?.phase ?? 'done'}@${s.y.toFixed(2)}/${s.z.toFixed(1)}`);
        if (v.ride?.phase === 'move' && !shotIn) { shotIn = true; await shot('v6_lift_inside'); }
        if (v.ride?.phase === 'in' && i % 6 === 0) await shot('v6_lift_enter');
        if (!v.ride) break;
      }
      console.log('  ride', tr.join(' '));
      let s = await st(); console.log('  arrived lv', s.lv, 'y', s.y.toFixed(2), 'z', s.z.toFixed(2), await K(() => JSON.stringify(window.__kota.vertical())));
      await shot('v6_lift_arrive');
      // walk away and back: landing door must be closed (solid)
      await hold('s', 6); await step(30);
      out.lift = s.lv === 2 ? 'OK' : 'FAIL';
      await press('q'); for (let i = 0; i < 160; i++) { await step(3); if (!(await K(() => window.__kota.vertical())).ride) break; }
      s = await st(); console.log('  back down lv', s.lv, 'y', s.y.toFixed(2)); out.liftDown = s.lv === 1 ? 'OK' : 'FAIL';
      // multi: L1 -> L5 by pressing E 4 times in a row
      for (let k = 0; k < 4; k++) { await press('e'); for (let i = 0; i < 160; i++) { await step(3); if (!(await K(() => window.__kota.vertical())).ride) break; } }
      s = await st(); console.log('  up to', s.lv); out.lift5 = s.lv === 5 ? 'OK' : 'FAIL';
    }
    if (ph === 'stair') {
      await go(HO[0] + 17, HO[1] + 11, 1, 0); await step(3); console.log('  hint', (await st()).hint);
      await press('e'); const tr = [];
      for (let i = 0; i < 200; i++) { await step(3); const s = await st(); if (i % 8 === 0) tr.push(`${s.y.toFixed(2)}/${s.x.toFixed(1)},${s.z.toFixed(1)}`); if (i === 30) await shot('v6_stair_mid'); if (!(await K(() => window.__kota.vertical())).ride) break; }
      const s = await st(); console.log('  path', tr.join(' ')); console.log('  arrived lv', s.lv, 'y', s.y.toFixed(2));
      out.stair = s.lv === 2 && Math.abs(s.y - 4.12) < 0.05 ? 'OK' : 'FAIL';
      await press('q'); for (let i = 0; i < 200; i++) { await step(3); if (!(await K(() => window.__kota.vertical())).ride) break; }
      out.stairDown = (await st()).lv === 1 ? 'OK' : 'FAIL';
    }
    if (ph === 'wifi') {
      const r = await K(() => { const W = window.__kota.wifi; const rows = [...W.CLIENTS.values()].map(c => { const q = W.quality(c.pc); return { pc: c.pc.replace('PROP_', ''), ap: q?.ap.id, rssi: q?.rssi, cci: q?.cci, busy: q?.busy, weak: q?.weak, env: W.env(c.pc), ok: W.healthy(c.pc) }; }); return rows; });
      const bad = r.filter(x => !x.ok); console.log('  clients', r.length, 'unhealthy', bad.length, JSON.stringify(bad.slice(0, 6)));
      console.log('  rssi range', Math.min(...r.map(x => x.rssi)), Math.max(...r.map(x => x.rssi)), 'sample', JSON.stringify(r.slice(0, 4)));
      out.wifi = bad.length ? `UNHEALTHY ${bad.length}` : 'OK';
    }
    if (ph === 'save') {
      await K(() => localStorage.setItem('kotaNusantara.noc.v1', '{"v":1,"xp":"abc","seen":"x","mastery":{"loop":{"ok":2},"zzz":5}}'));
      await p.reload({ waitUntil: 'commit' }); await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 120000 });
      const st2 = await K(() => window.__kota.noc.stats); console.log('  sanitized', JSON.stringify(st2)); out.save = st2.xp === 0 && Array.isArray(st2.seen) ? 'OK' : 'FAIL';
      await K(() => localStorage.setItem('kotaNusantara.noc.v1', '{garbage')); await p.reload({ waitUntil: 'commit' }); await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 120000 });
      out.saveGarbage = (await K(() => window.__kota.noc.stats.xp)) === 0 ? 'OK' : 'FAIL';
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 300)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
