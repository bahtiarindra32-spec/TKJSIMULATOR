import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const out = {}; const errs = [];
for (const [tag, vp] of [['land', { width: 844, height: 390 }], ['port', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit', timeout: 60000 });
  await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 120000 }); await p.waitForTimeout(800);
  await p.screenshot({ path: `/workspace/work/shots/m_${tag}_hero.png` });
  const K = (f, a) => p.evaluate(f, a);
  await K(() => window.__kota.pause(true)); await p.tap('#enter'); await p.waitForTimeout(300); await K(() => window.__kota.pause(true));
  out[tag + '_touch'] = await K(() => document.body.classList.contains('touch') && getComputedStyle(document.getElementById('touchui')).display);
  const s0 = await K(() => ({ ...window.__kota.state() }));
  // joystick push up
  const z = await K(() => { const r = document.getElementById('t-stick').getBoundingClientRect(); return { x: r.left + 90, y: r.bottom - 100 }; });
  const pe = (type, x, y) => K(([t, x, y]) => document.getElementById('t-stick').dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), [type, x, y]);
  await pe('pointerdown', z.x, z.y); await pe('pointermove', z.x, z.y - 60);
  await K(() => window.__kota.step(40)); await p.screenshot({ path: `/workspace/work/shots/m_${tag}_walk.png` });
  await pe('pointerup', z.x, z.y - 60);
  const s1 = await K(() => ({ ...window.__kota.state() }));
  out[tag + '_moved'] = Math.hypot((s1.x ?? s1.pos?.x) - (s0.x ?? s0.pos?.x), (s1.z ?? s1.pos?.z) - (s0.z ?? s0.pos?.z)).toFixed(2);
  // look drag on canvas
  const c = await K(() => { const e = document.querySelector('#app canvas'); return e ? 1 : 0; });
  // F button opens nearest PC: teleport to IT PC
  out[tag+'_moved0']=out[tag+'_moved']; const pc = await K(() => window.__kota.pcs().find(c => /_L1_/.test(c.name)));
  for (const [dx, dz] of [[0, .9], [0, -.9], [.9, 0], [-.9, 0]]) { await K(([x, z]) => { window.__kota.teleport(x, z, 1, 0); window.__kota.step(3); }, [pc.x + dx, pc.z + dz]); if (await K(() => window.__kota.nearPc())) break; }
  await K(() => window.__kota.step(3)); await p.waitForTimeout(300); out[tag + '_flabel'] = await K(() => document.querySelector('#t-f small').textContent);
  await p.tap('#t-f'); for (let i = 0; i < 12 && !(await K(() => window.__kota.pcos.isOpen())); i++) await K(() => window.__kota.step(3));
  await p.waitForTimeout(400); out[tag + '_pc'] = await K(() => window.__kota.pcos.isOpen());
  await p.screenshot({ path: `/workspace/work/shots/m_${tag}_pc.png` });
  if (tag === 'land') {   // lift panel by touch: walk (teleport) to the lift door, tap E, tap floor 5
    await K(() => document.querySelector('#pcos .leave')?.click()); for (let i = 0; i < 12; i++) await K(() => window.__kota.step(3));
    await K(() => { window.__kota.teleport(220 + 21, 168 + 10.9, 1, Math.PI); window.__kota.step(4); }); await p.waitForTimeout(400);
    out.eVisible = await K(() => getComputedStyle(document.getElementById('t-e')).display !== 'none');
    out.eHint = await K(() => window.__kota.state().hint);
    await p.tap('#t-e'); await K(() => window.__kota.step(2)); await p.waitForTimeout(200);
    out.liftPanel = await K(() => document.getElementById('liftpanel').classList.contains('on'));
    await p.screenshot({ path: `/workspace/work/shots/m_land_liftpanel.png` });
    await p.tap('#liftpanel button[name="lift-5"]').catch(e => out.tapErr = e.message.slice(0, 120));
    for (let n = 0; n < 1500; n += 15) { await K(() => window.__kota.step(15, 1 / 30, false)); if (!(await K(() => window.__kota.vertical())).ride) break; }
    out.liftLevel = await K(() => window.__kota.state().lv);
    await K(() => { window.__kota.teleport(200, 140, 1, 0); window.__kota.step(4); }); await p.waitForTimeout(400);
    out.eHiddenStreet = await K(() => getComputedStyle(document.getElementById('t-e')).display === 'none');
  }
  await ctx.close();
}
console.log('RESULT', JSON.stringify(out), 'errs', JSON.stringify(errs.slice(0, 4)));
await b.close();
