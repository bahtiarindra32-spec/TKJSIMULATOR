// Motor Matic QA: real keyboard input (Playwright keyboard) on the single-file build, paused game stepped at fixed dt.
// phases: probe,mount,drive,turns,reverse,wall,wallfast,curb,hotel,dmwall,camera,pause,blur,esc,stuck
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'probe,mount,drive').split(',');
const Q = await boot(null);
const { p, K, step, go, press, errs } = Q;
const SH = '/workspace/work/shots/motor';
const shot = async n => { await K(() => window.__kota.step(1)); await p.screenshot({ path: `${SH}/${n}.png` }); };
const st = () => K(() => window.__kota.state());
const mo = () => K(() => window.__kota.motor());
const hold = async (key, frames, dt = 1 / 30) => { await p.keyboard.down(key); for (let i = 0; i < frames; i += 3) await K(([d]) => window.__kota.step(3, d, false), [dt]); await p.keyboard.up(key); await step(1); };
const frames = (n, dt = 1 / 30) => K(([n, d]) => window.__kota.step(n, d, false), [n, dt]);
const bikeTo = (id, X, Z, yaw) => K(([i, x, z, y]) => window.__kota.bikeTo(i, x, z, y), [id, X, Z, yaw]);
const bike = id => K(i => window.__kota.bikes().find(b => b.id === i), id);
const freeAt = (X, Z, y) => K(([x, z, y]) => !window.__kota.blockedAt(x, z, y + 1.0, 0.3) && !window.__kota.blockedAt(x, z, y + 0.5, 0.3), [X, Z, y]);
const inHotel = (X, Z) => X > 220 && X < 250 && Z > 168 && Z < 188;
/** put the player beside bike `id` and mount it with a real F press */
const mountBike = async (id, side = 1.2) => {
  const b = await bike(id); const r = [Math.cos(b.yaw), -Math.sin(b.yaw)]; // bike right = (cos yaw, -sin yaw)
  const f = [-Math.sin(b.yaw), -Math.cos(b.yaw)];
  for (const [s, a] of [[side, 0], [-side, 0], [0, 1.45], [0, -1.5]]) { await go(b.x + r[0] * s + f[0] * a, b.z + r[1] * s + f[1] * a, 1, b.yaw); const h = (await st()).hint; if (/Naik motor/.test(h)) break; }
  await press('f'); await frames(12); return (await st()).riding;
};
const dismount = async () => { await press('f'); for (let i = 0; i < 40 && (await st()).riding; i++) { await frames(3); if (i === 20) await press('f'); } return st(); };
const out = {};
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'probe') {
      console.log('  bikes', JSON.stringify(await K(() => window.__kota.bikes())));
      for (const [X, Z] of [[241.5, 165], [276.5, 199.5]]) console.log('  near colliders', X, Z, JSON.stringify(await K(([x, z]) => window.__kota.near(x, z, 0.8), [X, Z])));
      const ys = await K(() => window.__kota.bikes().map(b => b.y)); out.probe = ys.every(y => y > 0.05 && y < 0.2) ? 'OK' : 'Y? ' + ys;
      await go(241.5, 162.6, 1, Math.PI); await K(() => window.__kota.setThird(true)); await K(() => window.__kota.look(-0.25)); await step(6); await shot('parked_row');
    }
    if (ph === 'mount') {
      const b0 = await bike('PROP_MOTOR_01');
      await go(241.5, 163.5, 1, Math.PI); await step(3);
      const h = (await st()).hint; console.log('  hint', h); const hintOk = /Naik motor/.test(h);
      let ok = 0; const spots = [];
      for (let i = 0; i < 6; i++) {
        await press('f'); await frames(12); const r1 = (await st()).riding;
        if (i === 0) { await K(() => window.__kota.setThird(true)); await shot('mounted_third'); }
        const s = await dismount(); const free = await freeAt(s.x, s.z, s.y);
        spots.push(`${s.x.toFixed(2)},${s.z.toFixed(2)}${free ? '' : '!BLOCKED'}`);
        if (r1 === 'PROP_MOTOR_01' && !s.riding && free && !inHotel(s.x, s.z)) ok++;
        await go(241.5, 163.5, 1, Math.PI); await step(2);
      }
      const b1 = await bike('PROP_MOTOR_01'); const drift = Math.hypot(b1.x - b0.x, b1.z - b0.z) + Math.abs(b1.yaw - b0.yaw);
      console.log('  dismount spots', spots.join(' '), 'drift', drift.toFixed(4));
      out.mount = hintOk && ok === 6 && drift < 0.01 ? 'OK' : `FAIL hint=${hintOk} ok=${ok}/6 drift=${drift}`;
      // keyboard: other interactions are off while riding (C check, E floor, T allowed)
      await mountBike('PROP_MOTOR_01'); await press('c'); await press('e'); const s2 = await st(); console.log('  C/E while riding ->', s2.riding, JSON.stringify(s2.toast).slice(0, 80));
      out.mountKeys = s2.riding && s2.lv === 1 ? 'OK' : 'FAIL';
      await dismount();
    }
    if (ph === 'drive') {
      // natural full-throttle run on Jl. Kebon Jeruk, westbound lane (left-hand traffic), real W key
      await bikeTo('PROP_MOTOR_05', 392, 61.75, Math.PI / 2); console.log('  mounted', await mountBike('PROP_MOTOR_05'));
      await K(() => window.__kota.setThird(true));
      const tr = []; let maxK = 0, minY = 9, maxY = -9, hits = 0, prevK = 0;
      await p.keyboard.down('w');
      for (let i = 0; i < 390; i += 15) { await frames(15); const m = await mo(); maxK = Math.max(maxK, m.kmh); minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y); if (m.kmh < prevK - 5) hits++; prevK = m.kmh; if (i % 45 === 0) tr.push(`${m.kmh.toFixed(0)}@${m.x.toFixed(0)}`); if (i === 240) await shot('riding_fast'); }
      await p.keyboard.up('w');
      const m = await mo(); console.log('  speed trace', tr.join(' '), '| max', maxK.toFixed(1), 'y', minY.toFixed(3), maxY.toFixed(3), 'drops', hits, 'z', m.z.toFixed(2));
      console.log('  speedo', m.speedo);
      // brake to a stop with S
      let n = 0; await p.keyboard.down('s'); for (; n < 300; n += 3) { await frames(3); if ((await mo()).speed <= 0.05) break; } await p.keyboard.up('s'); await step(1);
      const m2 = await mo(); console.log('  braked from', m.kmh.toFixed(1), 'km/h in', (n / 30).toFixed(2), 's ->', m2.kmh.toFixed(2));
      out.drive = maxK > 60 && maxK <= 85.6 && minY > -0.01 && maxY < 0.25 && m2.kmh < 1 ? 'OK' : `FAIL max=${maxK} y=${minY}..${maxY} stop=${m2.kmh}`;
    }
    if (ph === 'turns') {
      if (!(await st()).riding) { await bikeTo('PROP_MOTOR_05', 300, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_05'); }
      await K(() => window.__kota.setThird(true));
      await hold('w', 60); const m0 = await mo(); console.log('  before turn', m0.kmh.toFixed(1), 'km/h yaw', m0.yaw.toFixed(2));
      await p.keyboard.down('w'); await p.keyboard.down('a'); await frames(18); const mL = await mo(); await shot('lean_left'); await frames(6); await p.keyboard.up('a');
      const yawL = (await mo()).yaw - m0.yaw;
      await frames(12); const m1 = await mo();
      await p.keyboard.down('d'); await frames(18); const mR = await mo(); await shot('lean_right'); await frames(6); await p.keyboard.up('d'); await p.keyboard.up('w');
      const yawR = (await mo()).yaw - m1.yaw;
      console.log('  left: dyaw', yawL.toFixed(2), 'lean', mL.lean.toFixed(2), 'steer', mL.steer.toFixed(2), '| right: dyaw', yawR.toFixed(2), 'lean', mR.lean.toFixed(2), 'steer', mR.steer.toFixed(2));
      // high speed: steering is limited (no snap turns)
      await K(() => window.__kota.bikeSpeed(22)); await p.keyboard.down('w'); await p.keyboard.down('a'); await frames(15); const mH = await mo(); await p.keyboard.up('a'); await p.keyboard.up('w');
      console.log('  at', mH.kmh.toFixed(0), 'km/h full left: steer', mH.steer.toFixed(3), 'lean', mH.lean.toFixed(2));
      out.turns = yawL > 0.15 && mL.lean > 0.05 && yawR < -0.15 && mR.lean < -0.05 && Math.abs(mH.steer) < 0.05 && Math.abs(mH.lean) < 0.75 ? 'OK' : 'FAIL';
      await hold('s', 120);
    }
    if (ph === 'reverse') {
      if (!(await st()).riding) { await bikeTo('PROP_MOTOR_05', 300, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_05'); }
      await hold('s', 30); const a = await mo();
      await hold('s', 75); const b = await mo();
      const back = (b.x - a.x) * Math.sin(a.yaw) + (b.z - a.z) * Math.cos(a.yaw); // positive = moved backwards
      console.log('  reverse speed', b.speed.toFixed(2), 'moved back', back.toFixed(2), 'speedo', b.speedo);
      await hold('w', 20); const c = await mo(); console.log('  W after reverse ->', c.speed.toFixed(2));
      // F while rolling backwards: must brake to a stop and step off (used to keep reversing forever)
      await hold('s', 45); await press('f'); let n = 0; for (; n < 90 && (await st()).riding; n += 3) await frames(3);
      const sd = await st(); console.log('  F while reversing -> riding', sd.riding, 'after', (n / 30).toFixed(1), 's, free', await freeAt(sd.x, sd.z, sd.y));
      // F at 80 km/h: auto-brake then step off
      await mountBike('PROP_MOTOR_05'); await K(() => window.__kota.bikeSpeed(22)); await press('f'); let n2 = 0; for (; n2 < 240 && (await st()).riding; n2 += 3) await frames(3);
      const sf = await st(); console.log('  F at 80 km/h -> riding', sf.riding, 'after', (n2 / 30).toFixed(1), 's, free', await freeAt(sf.x, sf.z, sf.y));
      out.reverse = b.speed < -0.5 && b.speed >= -1.31 && back > 1 && /R/.test(b.speedo) && !sd.riding && !sf.riding && n2 < 150 ? 'OK' : 'FAIL';
    }
    for (const [tag, dt] of [['wall', 1 / 30], ['wallfast', 1 / 10]]) if (ph === tag) {
      // 85 km/h straight into tower E3's south face (z = 130), from 7 m away; then into the hotel shell from the side
      if ((await st()).riding) await dismount();
      await bikeTo('PROP_MOTOR_04', 240, 137.2, 0); await mountBike('PROP_MOTOR_04');
      await K(() => window.__kota.bikeSpeed(85 / 3.6)); let minZ = 999;
      await p.keyboard.down('w'); for (let i = 0; i < 45; i++) { await frames(1, dt); const m = await mo(); minZ = Math.min(minZ, m.z); } await p.keyboard.up('w');
      const m = await mo(); const free = await freeAt(m.x, m.z, m.y);
      console.log(`  dt=${dt.toFixed(3)} tower: min centre z`, minZ.toFixed(3), 'end', m.z.toFixed(3), 'speed', m.speed.toFixed(2), 'free', free, 'toast', (await st()).toast);
      if (tag === 'wall') await shot('wall_hit');
      await hold('s', 60, dt); const mb = await mo(); console.log('  reverse away ->', mb.z.toFixed(2), mb.speed.toFixed(2));
      const towerOk = minZ > 130.9 && free && mb.z > m.z + 0.3;
      // hotel shell: from the east plaza at full speed heading west (yaw +PI/2) into the east wall x = 250
      await dismount(); await bikeTo('PROP_MOTOR_04', 258, 176, Math.PI / 2); await mountBike('PROP_MOTOR_04');
      await K(() => window.__kota.bikeSpeed(85 / 3.6)); let minX = 999;
      await p.keyboard.down('w'); for (let i = 0; i < 45; i++) { await frames(1, dt); const q = await mo(); minX = Math.min(minX, q.x); } await p.keyboard.up('w');
      const h = await mo(); console.log('  hotel east wall: min centre x', minX.toFixed(3), 'end', h.x.toFixed(3), 'inside', inHotel(h.x, h.z));
      // and the 0.6 m Sudirman median at speed (heading north across the road)
      await dismount(); await bikeTo('PROP_MOTOR_04', 120, 156.2, 0); await mountBike('PROP_MOTOR_04');
      await K(() => window.__kota.bikeSpeed(70 / 3.6)); let minZm = 999;
      await p.keyboard.down('w'); for (let i = 0; i < 40; i++) { await frames(1, dt); const q = await mo(); minZm = Math.min(minZm, q.z); } await p.keyboard.up('w');
      console.log('  median: min centre z', minZm.toFixed(3), '(median south face 151)');
      out[tag] = towerOk && minX > 250.9 && !inHotel(h.x, h.z) && minZm > 151.9 ? 'OK' : `FAIL tower=${towerOk} x=${minX} medianZ=${minZm}`;
      await dismount();
    }
    if (ph === 'curb') {
      // Sudirman south lane -> up the kerb onto the sidewalk -> off the far edge into the hotel plaza, at walking pace and fast
      if ((await st()).riding) await dismount();
      const res = [];
      for (const v of [3, 9]) {
        await bikeTo('PROP_MOTOR_04', 300, 154, Math.PI); await mountBike('PROP_MOTOR_04');
        await K(([v]) => window.__kota.bikeSpeed(v), [v]); const prof = [];
        await p.keyboard.down('w');
        for (let i = 0; i < (v < 5 ? 120 : 45); i += 3) { await frames(3); const m = await mo(); prof.push(`${m.z.toFixed(1)}:${m.y.toFixed(2)}`); }
        await p.keyboard.up('w'); const m = await mo();
        console.log(`  v=${v} profile`, prof.join(' '));
        const ys = prof.map(s => +s.split(':')[1]); res.push(Math.max(...ys) >= 0.14 && m.z > 163 && m.stuck === 0);
        if (v === 3) await shot('curb_up');
        await hold('s', 60); await dismount();
      }
      out.curb = res.every(Boolean) ? 'OK' : 'FAIL ' + res;
    }
    if (ph === 'hotel') {
      // ride from the sidewalk straight at the lobby doors (and at an angle): the bike must stay outside
      if ((await st()).riding) await dismount();
      let maxZ = 0, inside = false;
      for (const [X, yaw] of [[227.2, Math.PI], [229, Math.PI - 0.5], [232, Math.PI + 0.4]]) {
        await bikeTo('PROP_MOTOR_04', X, 161, yaw); await mountBike('PROP_MOTOR_04');
        await p.keyboard.down('w'); for (let i = 0; i < 150; i += 3) { await frames(3); const m = await mo(); maxZ = Math.max(maxZ, m.z); inside ||= inHotel(m.x, m.z); } await p.keyboard.up('w');
        const m = await mo(); console.log(`  door run x=${X} yaw=${yaw.toFixed(2)} -> end ${m.x.toFixed(2)},${m.z.toFixed(2)} maxZ ${maxZ.toFixed(2)}`);
        await hold('s', 45); await dismount();
      }
      await shot('hotel_door_block');
      out.hotel = !inside && maxZ < 168 ? 'OK' : `FAIL inside=${inside} maxZ=${maxZ}`;
    }
    if (ph === 'dmwall') {
      // parked with the left side against the hotel's east wall: the rider must step off to the right, outside
      if ((await st()).riding) await dismount();
      await bikeTo('PROP_MOTOR_04', 250.62, 178, 0); await mountBike('PROP_MOTOR_04', 1.3);
      const s = await dismount(); const free = await freeAt(s.x, s.z, s.y);
      console.log('  stepped off at', s.x.toFixed(2), s.z.toFixed(2), 'free', free, 'inHotel', inHotel(s.x, s.z));
      // nose into the planter row in front of the hotel: a spot is still found (behind / side) and never inside the planter
      await bikeTo('PROP_MOTOR_04', 226.5, 165.2, Math.PI); await mountBike('PROP_MOTOR_04');
      const s2 = await dismount(); const free2 = await freeAt(s2.x, s2.z, s2.y);
      console.log('  planter: stepped off at', s2.x.toFixed(2), s2.z.toFixed(2), 'free', free2);
      out.dmwall = !s.riding && free && !inHotel(s.x, s.z) && s.x > 250.9 && !s2.riding && free2 ? 'OK' : 'FAIL';
    }
    if (ph === 'camera') {
      if ((await st()).riding) await dismount();
      await bikeTo('PROP_MOTOR_05', 300, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_05');
      await K(() => window.__kota.setThird(false)); await hold('w', 45); await shot('ride_first_person');
      const c1 = await K(() => window.__kota.camPose()); const m1 = await mo();
      await press('v'); await frames(10); await shot('ride_third_person'); const c3 = await K(() => window.__kota.camPose());
      await press('v'); await frames(4); const c4 = await K(() => window.__kota.camPose());
      // mouse look (drag on the canvas: no pointer lock in headless)
      await p.mouse.move(480, 300); await p.mouse.down(); await p.mouse.move(380, 300, { steps: 4 }); await p.mouse.up(); await frames(2); const c5 = await K(() => window.__kota.camPose());
      console.log('  FP cam', c1.x.toFixed(2), c1.z.toFixed(2), 'y', (c1.y - m1.y).toFixed(2), '| TP cam y', c3.y.toFixed(2), 'third', c3.third, '| back to FP', c4.third);
      const fpNear = Math.hypot(c1.x - m1.x, c1.z - m1.z); const tpDist = Math.hypot(c3.x - m1.x, c3.z - m1.z); console.log('  FP cam to bike', fpNear.toFixed(2), 'm, TP cam to bike', tpDist.toFixed(2), 'm, drag-look moved cam', Math.hypot(c5.x - c4.x, c5.z - c4.z).toFixed(3));
      out.camera = !c1.third && c3.third && !c4.third && Math.abs(c1.y - m1.y - 1.5) < 0.2 && fpNear < 0.6 && tpDist > 2 && tpDist < 7 ? 'OK' : 'FAIL';
      await K(() => window.__kota.setThird(true)); await hold('s', 60);
    }
    if (ph === 'pause') {
      if (!(await st()).riding) { await bikeTo('PROP_MOTOR_05', 300, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_05'); }
      await hold('w', 45); const a = await mo();
      await press('t'); const open = await K(() => window.__kota.noc.isModalOpen()); await frames(30); const b = await mo();
      await K(() => window.__kota.noc.closeModal()); await frames(2); const keys = await K(() => window.__kota.keysHeld());
      await frames(15); const c = await mo();
      // the automation pause hook (stops the loop) and resume
      await K(() => { window.__kota.pause(false); }); await p.waitForTimeout(400); await K(() => window.__kota.pause(true)); const d = await mo();
      console.log('  modal open', open, 'moved while open', Math.hypot(b.x - a.x, b.z - a.z).toFixed(3), 'keys after close', JSON.stringify(keys), 'after resume', c.kmh.toFixed(1), 'km/h | live loop ok', !!d);
      out.pause = open && Math.hypot(b.x - a.x, b.z - a.z) < 0.01 && keys.length === 0 && c.riding !== null && d ? 'OK' : 'FAIL';
      await hold('s', 90);
    }
    if (ph === 'blur') {
      if (!(await st()).riding) { await bikeTo('PROP_MOTOR_05', 300, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_05'); }
      await p.keyboard.down('w'); await p.keyboard.down('a'); await frames(30); const a = await mo();
      await K(() => window.dispatchEvent(new Event('blur'))); const keys = await K(() => window.__kota.keysHeld());
      await frames(30); const b = await mo(); await p.keyboard.up('w'); await p.keyboard.up('a');
      console.log('  before blur', a.kmh.toFixed(1), 'km/h steer', a.steer.toFixed(2), '| keys after blur', JSON.stringify(keys), '| 1 s later', b.kmh.toFixed(1), 'km/h steer', b.steer.toFixed(2), 'engine', b.engine);
      out.blur = keys.length === 0 && b.kmh < a.kmh && Math.abs(b.steer) < 0.05 ? 'OK' : 'FAIL';
      await hold('s', 90);
    }
    if (ph === 'esc') {
      if (!(await st()).riding) { await bikeTo('PROP_MOTOR_05', 300, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_05'); }
      await hold('w', 30); const a = await mo();
      await press('Escape'); const s = await st(); const b = await bike(a.id);
      await K(() => document.getElementById('enter').click()); await K(() => window.__kota.pause(true)); await step(3); const s2 = await st(); const b2 = await bike(a.id);
      console.log('  after Esc mode', s.mode, 'riding', s.riding, 'bike parked at', b.x.toFixed(2), b.z.toFixed(2), '| re-enter', s2.mode, s2.riding, 'speedo hidden', await K(() => !document.getElementById('speedo').classList.contains('on')));
      out.esc = s.mode === 'orbit' && !s.riding && !b.ridden && s2.mode === 'walk' && Math.hypot(b2.x - b.x, b2.z - b.z) < 0.01 ? 'OK' : 'FAIL';
    }
    if (ph === 'stuck') {
      // wedge the bike into a tower corner by teleport (overlapping): it must recover to the nearest road by itself; R also works
      if ((await st()).riding) await dismount();
      await bikeTo('PROP_MOTOR_04', 300, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_04');
      await K(() => { const b = window.__kota.motor(); return b; });
      await K(() => { const k = window.__kota; const id = k.motor().id; const b = k.bikes().find(q => q.id === id); return b; });
      await K(() => window.__kota.bikeTo('PROP_MOTOR_04', 240, 125, 0));   // inside BLD_TOWER_E3
      await frames(40); const m = await mo(); console.log('  after wedge', m.x.toFixed(2), m.z.toFixed(2), 'toast', (await st()).toast);
      const ok1 = !(await K(([x, z]) => window.__kota.blockedAt(x, z, 0.8, 0.3), [m.x, m.z]));
      await press('r'); await frames(3); const m2 = await mo(); console.log('  R reset ->', m2.x.toFixed(2), m2.z.toFixed(2), 'yaw', m2.yaw.toFixed(2));
      out.stuck = ok1 && m.z > 130 ? 'OK' : 'FAIL';
      await dismount();
    }


    if (ph === 'traffic') {
      // rear-end a car at 80 km/h in its lane (Kebon Jeruk westbound): the bike must stop behind it, never inside it
      if ((await st()).riding) await dismount();
      const car = await K(() => { const g = window.__kota.scene.getObjectByName('GAME_TRAFFIC'); const c = g.children.filter(o => o.visible && o.userData.kind !== 'motor' && Math.abs(o.position.z - (61.75 - 150)) < 0.3 && Math.abs(o.rotation.y - Math.PI / 2) < 0.1 && o.position.x > 0 - 200 + 120 && o.position.x < 360 - 200); return c[0] && { x: c[0].position.x + 200, uuid: c[0].uuid, len: c[0].userData.len }; });
      if (!car) { out.traffic = 'SKIP no car'; continue; }
      await bikeTo('PROP_MOTOR_04', car.x + 16, 61.75, Math.PI / 2); await mountBike('PROP_MOTOR_04');
      await K(() => window.__kota.bikeSpeed(22)); let overlap = 0, minGap = 99;
      await p.keyboard.down('w');
      for (let i = 0; i < 75; i++) { await frames(1); const r = await K(u => { const o = window.__kota.scene.getObjectByProperty('uuid', u); const m = window.__kota.motor(); return { cx: o.position.x + 200, mx: m.x, len: o.userData.len }; }, car.uuid); const gap = (r.mx - 0.63 - 0.34) - (r.cx + r.len / 2); minGap = Math.min(minGap, gap); if (gap < -0.15) overlap++; }
      await p.keyboard.up('w'); const m = await mo();
      console.log('  car len', car.len, 'min gap bike-front to car-rear', minGap.toFixed(3), 'm, overlapping frames', overlap, 'end speed', m.kmh.toFixed(1), 'toast', (await st()).toast);
      out.traffic = overlap === 0 ? 'OK' : 'FAIL';
      await hold('s', 30); await dismount();
    }
    if (ph === 'touch') {
      // phone emulation (hasTouch + isMobile): joystick steer+throttle, Gas/Rem hold buttons, Turun button, Jongkok button
      const ctx = await Q.b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
      const m = await ctx.newPage(); m.on('pageerror', e => errs.push('touch: ' + e.message.slice(0, 200)));
      await m.goto('http://127.0.0.1:8787/?qa&low', { waitUntil: 'commit', timeout: 60000 });
      await m.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
      const T = (f, a) => m.evaluate(f, a);
      await T(() => window.__kota.pause(true)); await m.tap('#enter'); await m.waitForTimeout(300); await T(() => window.__kota.pause(true));
      const fr = n => T(([n]) => window.__kota.step(n, 1 / 30, false), [n]);
      const r = {};
      r.touchUi = await T(() => document.body.classList.contains('touch'));
      await T(() => { window.__kota.teleport(241.5, 163.5, 1, Math.PI); window.__kota.step(3); }); await m.waitForTimeout(350);
      r.fLabel = await T(() => document.querySelector('#t-f small').textContent);
      await m.tap('#t-f'); await fr(12); await m.waitForTimeout(300);
      r.riding = (await T(() => window.__kota.state())).riding;
      r.rideBtns = await T(() => getComputedStyle(document.querySelector('.rbtns')).display !== 'none' && getComputedStyle(document.querySelector('.tbtns')).display === 'none');
      // off again with the Turun button (standing still), then take a bike that is on an open road for the riding tests
      await m.tap('#t-turun'); await fr(6); r.turun0 = !(await T(() => window.__kota.state())).riding;
      await T(() => { window.__kota.bikeTo('PROP_MOTOR_04', 330, 61.75, Math.PI / 2); window.__kota.teleport(330, 63.0, 1, Math.PI / 2); window.__kota.step(3); }); await m.waitForTimeout(300);
      await m.tap('#t-f'); await fr(12); r.riding2 = (await T(() => window.__kota.state())).riding;
      // joystick: push up = throttle, then release -> throttle must stop
      const z = await T(() => { const r = document.getElementById('t-stick').getBoundingClientRect(); return { x: r.left + 90, y: r.bottom - 100 }; });
      const pe = (type, x, y, id = 7, sel = '#t-stick') => T(([t, x, y, id, sel]) => document.querySelector(sel).dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), [type, x, y, id, sel]);
      await pe('pointerdown', z.x, z.y); await pe('pointermove', z.x, z.y - 60); await fr(45);
      const a = await T(() => window.__kota.motor()); await m.screenshot({ path: `${SH}/touch_riding.png` });
      await pe('pointermove', z.x - 50, z.y - 40); await fr(12); const b = await T(() => window.__kota.motor());
      await pe('pointerup', z.x - 50, z.y - 40); await fr(30); const c = await T(() => window.__kota.motor());
      r.joy = `${a.kmh.toFixed(1)}km/h steer(after left)=${b.steer.toFixed(2)} ${b.kmh.toFixed(1)}km/h released->${c.kmh.toFixed(1)}km/h steer ${c.steer.toFixed(2)}`;
      const joyOk = a.kmh > 5 && b.steer > 0.05 && c.kmh < b.kmh && Math.abs(c.steer) < 0.05;
      // Gas button held, then the finger slides off it (pointerleave) -> released
      const gb = await T(() => { const r = document.getElementById('t-gas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await pe('pointerdown', gb.x, gb.y, 9, '#t-gas'); await fr(30); const g1 = await T(() => ({ m: window.__kota.motor(), k: window.__kota.keysHeld() }));
      await pe('pointerleave', gb.x + 80, gb.y, 9, '#t-gas'); await fr(2); const g2 = await T(() => window.__kota.keysHeld());
      r.gas = `held keys ${JSON.stringify(g1.k)} ${g1.m.kmh.toFixed(1)}km/h, after slide-off keys ${JSON.stringify(g2)}`;
      // Rem held: stops, then slow reverse
      const rb = await T(() => { const r = document.getElementById('t-rem').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await pe('pointerdown', rb.x, rb.y, 10, '#t-rem'); await fr(90); const rm = await T(() => window.__kota.motor()); await pe('pointerup', rb.x, rb.y, 10, '#t-rem'); await fr(2);
      r.rem = `speed ${rm.speed.toFixed(2)} keys after ${JSON.stringify(await T(() => window.__kota.keysHeld()))}`;
      // blur while the joystick is held -> released
      await pe('pointerdown', z.x, z.y, 11); await pe('pointermove', z.x, z.y - 60, 11); await fr(10);
      await T(() => window.dispatchEvent(new Event('blur'))); await fr(20); const bl = await T(() => window.__kota.motor());
      await pe('pointermove', z.x, z.y - 60, 11); await fr(1); const bl2 = await T(() => window.__kota.motor());   // stale finger after blur must not revive throttle
      r.blur = `after blur ${bl.kmh.toFixed(2)}km/h, stale finger move -> ${bl2.kmh.toFixed(2)}`;
      await pe('pointerup', z.x, z.y - 60, 11);
      // Turun
      await fr(60); await m.tap('#t-turun'); for (let i = 0; i < 20 && (await T(() => window.__kota.state())).riding; i++) await fr(3);
      const s = await T(() => window.__kota.state()); r.turun = !s.riding;
      r.walkBtns = await T(() => getComputedStyle(document.querySelector('.rbtns')).display === 'none' && getComputedStyle(document.querySelector('.tbtns')).display !== 'none');
      await m.tap('#t-crouch'); await fr(15); const cr = await T(() => window.__kota.crouch()); await m.waitForTimeout(300);
      const crLock = await T(() => document.getElementById('t-crouch').classList.contains('lock'));
      await m.screenshot({ path: `${SH}/touch_crouch.png` });
      await m.tap('#t-crouch'); await fr(15); const cr2 = await T(() => window.__kota.crouch());
      r.crouch = `on=${cr.on} eye=${cr.eye.toFixed(2)} btnLock=${crLock} -> off=${!cr2.on}`;
      console.log('  touch', JSON.stringify(r));
      out.touch = r.touchUi && /Naik motor/.test(r.fLabel) && r.riding && r.rideBtns && r.turun0 && r.riding2 === 'PROP_MOTOR_04' && joyOk && g1.k.includes('KeyW') && g1.m.kmh > c.kmh && g2.length === 0 && rm.speed < 0 && bl2.kmh <= bl.kmh + 0.05 && r.turun && r.walkBtns && cr.on && crLock && !cr2.on ? 'OK' : 'FAIL';
      await ctx.close();
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 400)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
