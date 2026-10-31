// v9 QA: Esc -> return -> Space (real keys), day/night, Kota Selatan world (colliders, bounds, ride, walk, minimap)
// usage: node qa_v9.mjs space,daynight,world
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'space').split(',');
const Q = await boot(null, { query: process.env.Q ?? '&low' });
const { p, K, step, go, press, errs } = Q;
const SH = '/workspace/work/shots/v9';
import { mkdirSync } from 'fs'; mkdirSync(SH, { recursive: true });
const shot = async n => { await K(() => window.__kota.step(1)); await p.screenshot({ path: `${SH}/${n}.png` }); };
const st = () => K(() => window.__kota.state());
const frames = (n, dt = 1 / 30) => K(([n, d]) => window.__kota.step(n, d, false), [n, dt]);
const hold = async (key, n) => { await p.keyboard.down(key); for (let i = 0; i < n; i += 3) await frames(3); await p.keyboard.up(key); await frames(1); };
const out = {};
const jumpTest = async label => {
  const s0 = await st(); let maxY = s0.y;
  await p.keyboard.down('Space'); await frames(2); await p.keyboard.up('Space');
  for (let i = 0; i < 20; i++) { await frames(1); maxY = Math.max(maxY, (await st()).y); }
  const s1 = await st();
  const moved = Math.hypot(s1.x - s0.x, s1.z - s0.z);
  console.log(`  ${label}: y0 ${s0.y.toFixed(2)} peak ${maxY.toFixed(2)} | pos drift ${moved.toFixed(2)} m | mode ${s1.mode} | at ${s1.x.toFixed(1)},${s1.z.toFixed(1)}`);
  return maxY - s0.y > 0.3 && moved < 0.5 && s1.mode === 'walk';
};
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'space') {
      await go(150, 139.5, 1, Math.PI / 2); await frames(5);
      const a = await jumpTest('plain Space');
      // 1) Esc (real key) -> pause; Esc again -> resume; Space must jump in place
      await press('Escape'); const paused = await K(() => window.__kota.menu.paused());
      await press('Escape'); const resumed = !(await K(() => window.__kota.menu.paused()));
      const b = await jumpTest('after Esc/Esc');
      // 2) Esc -> pause -> "Lanjutkan" clicked with the real mouse (focuses the button) -> Space
      await press('Escape'); await p.click('#psResume'); await frames(2);
      const c = await jumpTest('after pause > Lanjutkan (mouse)');
      // 3) Esc -> Menu Utama -> Lanjutkan (#enter, real mouse click focuses it) -> Space: the old bug respawned the player here
      await press('Escape'); await p.click('#psMenu'); await frames(3); const inMenu = await K(() => window.__kota.menu.open());
      await p.click('#enter'); await frames(3); const s = await st();
      const d = await jumpTest('after Menu Utama > Lanjutkan (mouse) ');
      // 4) a still-focused #enter in walk mode (the original bug path): Space jumps, no respawn
      await K(() => document.getElementById('enter').focus());
      const e = await jumpTest('with #enter focused');
      // 5) crouched + riding resume
      await press('x'); await frames(10); await press('Escape'); await p.click('#psMenu'); await frames(2); await p.click('#enter'); await frames(3);
      const cr = await K(() => window.__kota.crouch().on);
      console.log('  pause', paused, 'resumed', resumed, 'menu', inMenu, 'resumed at', s.x.toFixed(1), s.z.toFixed(1), 'crouch kept', cr);
      await press('x'); await frames(10);
      out.space = a && b && c && d && e && paused && resumed && inMenu && cr ? 'OK' : 'FAIL';
    }
    if (ph === 'daynight') {
      if ((await st()).mode !== 'walk') { await K(() => document.getElementById('enter').click()); await K(() => window.__kota.pause(true)); }
      await K(() => window.__kota.setThird(true)); await go(232, 139.5, 1, -Math.PI / 2 + 0.25); await frames(5); await K(() => window.__kota.look(0.05));
      for (const [h, n] of [[7, 'pagi'], [12, 'siang'], [17.6, 'sore'], [21.5, 'malam']]) {
        await K(h => window.__kota.daynight.set(h), h); await frames(2);
        const v = await K(() => window.__kota.daynight.get()); console.log(' ', n, JSON.stringify(v));
        await shot(`dn_${n}`);
      }
      // N key (real input) jumps to the next preset (animated)
      await K(() => window.__kota.daynight.set(12)); const h0 = (await K(() => window.__kota.daynight.get())).hour;
      await press('n'); for (let i = 0; i < 30; i++) await frames(1);
      const h1 = await K(() => window.__kota.daynight.get());
      console.log('  N: from', h0.toFixed(2), 'to', h1.hour.toFixed(2), h1.label, '| clock HUD', await K(() => document.getElementById('clock').textContent));
      // night ride: headlight beam
      await K(() => window.__kota.daynight.set(21.5));
      out.daynight = h1.label === 'Sore' ? 'OK' : 'FAIL';
    }
    if (ph === 'world') {
      // colliders: every new house / ruko / tower blocks; gangs are free
      const probes = await K(() => { const B = window.__kota.blockedAt; const r = {};
        r.house = [[8, 345], [15, 356], [34, 345], [57, 367], [64, 400]].filter(([x, z]) => B(x, z, 1.0, 0)).length >= 3; r.ruko = B(100, 343, 1.0, 0); r.tower = B(230, 350, 1.0, 0); r.masjid = B(350, 375, 1.0, 0); r.smk = B(260, 545, 1.0, 0); r.wall = B(200, 598.7, 1.0, 0);
        r.gang06free = !B(28, 400, 1.0, 0.3); r.gang08free = !B(40, 390, 1.0, 0.3); r.alleyfree = !B(15, 350.5, 1.0, 0.3); r.lapanganfree = !B(138, 400, 1.0, 0.3); return r; });
      console.log('  probes', JSON.stringify(probes)); const aud = await K(() => window.__kota.solidAudit('FASE_F_KOTA_SELATAN')); console.log('  solidAudit', aud.length - 1, 'misses of', aud[0], JSON.stringify(aud.slice(1, 8)));
      const okProbes = Object.values(probes).every(Boolean);
      // walk the kampung gang with real W (third person), south along gang 06
      await K(() => window.__kota.setThird(true)); await go(28, 338, 1, Math.PI); await frames(3);
      const w0 = await st(); await p.keyboard.down('ShiftLeft'); await hold('w', 150); await p.keyboard.up('ShiftLeft'); const w1 = await st();
      console.log('  walk gang06', w0.z.toFixed(1), '->', w1.z.toFixed(1), 'x', w1.x.toFixed(2), 'y', w1.y.toFixed(2), 'loc', w1.loc);
      await shot('kampung_gang');
      // walk into a house wall: must stop
      const hx = await K(() => [33.5, 40.5, 57, 64, 8, 15].find(x => window.__kota.blockedAt(x, 345, 1.0, 0))); await go(hx, 350.6, 1, 0); await hold('w', 60); const w2 = await st(); console.log('  into house wall at x', hx, ': z', w2.z.toFixed(2), '(wall at 349)');
      // ride: Thamrin south (left-hand: southbound on the east half) then a long run on Jl. Dahlia west
      await K(() => window.__kota.bikeTo('PROP_MOTOR_01', 206.25, 300, Math.PI)); await go(207.6, 300, 1, Math.PI); await press('f'); await frames(12);
      const r0 = await K(() => window.__kota.motor()); await hold('w', 240); const r1 = await K(() => window.__kota.motor());
      console.log('  ride Thamrin S', r0 && r0.z.toFixed(1), '->', r1 && r1.z.toFixed(1), 'kmh', r1 && r1.kmh.toFixed(0), 'stuck', r1 && r1.stuck.toFixed(2));
      await shot('ride_thamrin_selatan');
      // to the south edge at full speed: must stay inside the wall
      await K(() => { window.__kota.bikeSpeed(0); }); await K(() => window.__kota.bikeTo('PROP_MOTOR_01', 140, 585, Math.PI)); await frames(2);
      await K(() => window.__kota.bikeSpeed(18)); await hold('w', 120); const r2 = await K(() => window.__kota.motor());
      console.log('  edge run: z', r2.z.toFixed(2), 'y', r2.y.toFixed(2), 'speed', r2.kmh.toFixed(1));
      // Dahlia westbound ride (north half = westbound? left-hand: heading -X drives on south side)
      await K(() => window.__kota.bikeTo('PROP_MOTOR_01', 300, 451.75, -Math.PI / 2 * -1)); await frames(2); await K(() => window.__kota.bikeSpeed(0));
      const d0 = await K(() => window.__kota.motor()); await hold('w', 200); const d1 = await K(() => window.__kota.motor());
      console.log('  ride Dahlia', d0.x.toFixed(1), '->', d1.x.toFixed(1), 'z', d1.z.toFixed(2), 'stuck', d1.stuck.toFixed(2));
      await shot('ride_dahlia');
      await K(() => window.__kota.bikeSpeed(0)); await frames(20);
      // minimap big
      await press('f'); await frames(30); await press('m'); await frames(2); await shot('peta_besar'); await press('m');
      const okWalk = w1.z - w0.z > 20 && w1.y > -0.05 && Math.abs(w1.x - 28) < 1.3 && w2.z < 349.5;
      const okRide = r1 && r1.z - r0.z > 40 && r2.z < 598.2 && r2.y > -0.05 && d1.x < d0.x - 30;
      out.world = okProbes && okWalk && okRide ? 'OK' : `FAIL probes=${okProbes} walk=${okWalk} ride=${okRide}`;
      // district screenshots from the orbit views
      for (const v of ['selatan', 'smk']) { await K(v => window.__kota.goView(v), v); await K(() => window.__kota.step(2)); await shot(`view_${v}`); }
    }
  } catch (e) { console.log('!! phase error', ph, e.message.slice(0, 400)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 6)));
await p.context().browser().close();
