// Fase 1 chunk 1: the four field-work places. Per site: teleport to the entry anchor, walk in with real keys,
// use one device with F (real key), screenshot exterior + interior + device at 1280x720.
// usage: run1.sh qa_sites.mjs <nusateknik|rumah|kos|warnet> 115     (NOSHOT=1 skips screenshots)
import { boot } from './qa_lib.mjs';
const ph = process.argv[2] ?? 'nusateknik';
const Q = await boot(null, { query: '', viewport: { width: 1280, height: 720 } });
const { p, K, errs } = Q;
const out = { site: ph };
const SH = n => `/workspace/work/shots/sites_${ph}_${n}.png`;
const snap = async n => { if (process.env.NOSHOT) return; await K(() => window.__kota.step(2, 1 / 30, true)); await p.screenshot({ path: SH(n), timeout: 70000 }); };
const st = () => K(() => window.__kota.state());
const stepN = (n, render = false) => K(([n, r]) => window.__kota.step(n, 1 / 30, r), [n, render]);
const place = (X, Z, yaw, pitch = -0.05, y = null) => K(([X, Z, yaw, pitch, y]) => { const k = window.__kota; k.teleport(X, Z, 1, yaw); if (y !== null) k.player.pos.y = y; k.look(pitch); k.step(12, 1 / 30, false); }, [X, Z, yaw, pitch, y]);
/** hold W toward a city point with real key input, steering by setting the look yaw (= mouse) */
async function walkTo(X, Z, maxSteps = 240) {
  await p.keyboard.down('w');
  let s;
  for (let i = 0; i < maxSteps; i += 6) {
    s = await st(); const dx = X - s.x, dz = Z - s.z; if (Math.hypot(dx, dz) < 0.35) break;
    await K(y => { window.__kota.player.yaw = y; }, Math.atan2(-dx, -dz));
    await stepN(6);
  }
  await p.keyboard.up('w'); await stepN(8);
  return st();
}
const pressF = async () => { await p.keyboard.press('f'); await p.waitForTimeout(80); await stepN(2); };
const modal = () => K(() => document.querySelector('.noc-modal .noc-box')?.innerText.replace(/\n+/g, ' | ').slice(0, 400) ?? null);
const closeModal = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(100); await stepN(2); await K(() => { if (window.__kota.noc.isModalOpen()) window.__kota.noc.closeModal(); }); };
async function openPcByF(name) {
  const why = await K(() => window.__kota.why()); out[`near_${name}`] = why.pc;
  if (why.pc !== name) { console.log('  !! not near', name, JSON.stringify(why)); return false; }
  await pressF();
  for (let i = 0; i < 14 && !(await K(() => window.__kota.pcos.isOpen())); i++) await stepN(3);
  const open = await K(() => window.__kota.pcos.isOpen()); if (!open) return false;
  await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(250);
  await K(() => document.querySelector('#pcos .di[title="Command Prompt"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(300);
  await p.click('#pcos .cmd').catch(() => {});
  for (const c of ['ipconfig', 'ping 8.8.8.8']) { await p.keyboard.type(c); await p.keyboard.press('Enter'); await p.waitForTimeout(c.startsWith('ping') ? 1800 : 400); }
  out[`cmd_${name}`] = (await K(() => document.querySelector('#pcos .cmd')?.innerText.slice(-700)))?.replace(/\n+/g, ' / ');
  await p.screenshot({ path: SH('device_pc'), timeout: 60000 });
  // the site router's web page from this client (browser -> default gateway)
  const gw = await K(n => window.__kota.adapter(n).lease?.gw ?? '', name);
  await K(() => document.querySelector('#pcos .di[title="Tepi"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(400);
  await p.click('#pcos .brw .nav input'); await p.keyboard.press('Control+a'); await p.keyboard.type(gw); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  out[`web_${name}`] = (await K(() => document.querySelector('#pcos .brw .page')?.innerText.slice(0, 160)))?.replace(/\n+/g, ' / ');
  await K(() => document.querySelector('#pcos .leave')?.click()); for (let i = 0; i < 10 && (await K(() => !!window.__kota.seat())); i++) await stepN(3);
  return true;
}
try {
  const S = (await K(() => window.__kota.sites())).find(s => s.id === ph);
  await K(() => window.__kota.daynight.set(13));
  // ---- exterior (from the street, facing the front)
  const EXT = { nusateknik: [58, 141, 0, 0.06], rumah: [120, 568, Math.PI, 0.06], kos: [140, 334, 0, 0.12], warnet: [352, 334, 0, 0.08] }[ph];
  await place(...EXT); await snap('exterior');
  // ---- teleport to the entry anchor, then walk in through the door with W
  await K(([id]) => { window.__kota.goSite(id); window.__kota.step(6, 1 / 30, false); }, [ph]);
  const a = await st(); out.anchor = [a.x.toFixed(1), a.z.toFixed(1)];
  const inn = await walkTo(S.inside.X, S.inside.Z);
  out.walkedIn = { x: +inn.x.toFixed(2), z: +inn.z.toFixed(2), y: +inn.y.toFixed(2), loc: inn.loc };
  out.inside = inn.loc === undefined ? false : /Nusa Teknik|Rumah|Kos|Warnet/.test(inn.loc);
  // ---- interior views + one device per site
  if (ph === 'nusateknik') {
    await place(65.0, 127.2, 0.95, -0.08); await snap('interior');
    await walkTo(55, 119.9); out.hint = (await st()).hint; await pressF(); out.device = await modal(); await p.screenshot({ path: SH('device'), timeout: 60000 }); await closeModal();
    await walkTo(51.6, 120.3); out.hint2 = (await st()).hint;
    // the technician's bike is parked outside
    out.bikes = (await K(() => window.__kota.bikes())).filter(b => b.id === 'PROP_MOTOR_06');
  }
  if (ph === 'rumah') {
    await place(122.6, 584.3, 1.13, -0.12); await snap('interior');
    await walkTo(115.4, 581.1); out.hint = (await st()).hint; await pressF(); out.device = await modal(); await p.screenshot({ path: SH('device'), timeout: 60000 }); await closeModal();
    await walkTo(118.0, 584.0); await walkTo(117.9, 586.6); await walkTo(117.5, 590.2);
    out.laptop = await openPcByF('PROP_RUMAH_01_LAPTOP_01');
    await place(118.6, 586.0, 2.6, -0.15); await snap('interior2');
  }
  if (ph === 'kos') {
    await place(139.6, 315.3, 1.24, -0.06); await snap('interior');
    // ground-floor router + AP prompts
    await walkTo(133.1, 313.0); out.hintRouter = (await st()).hint; await pressF(); out.device = await modal(); await p.screenshot({ path: SH('device'), timeout: 60000 }); await closeModal();
    await walkTo(138.0, 310.4); out.hintAp1 = (await st()).hint;
    // climb the stair with W (bottom at x 140.6 on the south wall, top at x 144.6)
    await walkTo(140.2, 315.1); const c0 = await st();
    const top = await walkTo(145.6, 315.1, 300); out.stair = { from: +c0.y.toFixed(2), to: +top.y.toFixed(2), x: +top.x.toFixed(2) };
    await walkTo(145.8, 310.3); const up = await walkTo(138.0, 310.3); out.upper = { y: +up.y.toFixed(2), loc: up.loc, hint: up.hint };
    await snap('upper');
    await walkTo(133.8, 310.0); await walkTo(133.8, 307.2); await walkTo(134.5, 305.6);
    out.laptop = await openPcByF('PROP_KOS_01_LAPTOP_K4');
    await place(146.4, 310.3, 1.42, -0.06, 3.35); await snap('upper_corridor');
  }
  if (ph === 'warnet') {
    await place(357.4, 315.9, 0.78, -0.08); await snap('interior');
    await walkTo(354.6, 314.6); await walkTo(354.6, 310.8); await walkTo(358.6, 305.0); out.hint = (await st()).hint; out.rk = await K(() => window.__kota.nearRack());
    await pressF(); out.device = await modal(); await p.screenshot({ path: SH('device'), timeout: 60000 }); await closeModal();
    await walkTo(349, 306.8); await walkTo(345.75, 307.0);
    out.pc = await openPcByF('PROP_WARNET_01_PC_02');
    await place(346.2, 314.8, -0.47, -0.1); await snap('interior2');
  }
  out.stats = await K(() => window.__kota.stats());
} catch (e) { console.log('  !!', e.message.slice(0, 400)); out.err = e.message.slice(0, 200); }
console.log('RESULT', JSON.stringify(out, null, 1), '\nerrors', JSON.stringify(errs.slice(0, 6)));
await Q.b.close();
