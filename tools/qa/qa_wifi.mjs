// Wi-Fi jobs through real input: portal, appoe, aprf, dhcppool tickets and the AP replacement contract.
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'portal,appoe,aprf,dhcppool,ap').split(',');
const Q = await boot({ v: 1, xp: 3200, shifts: 0, closed: 0, slaMet: 0, seq: 0, contracts: 0, stars: 0, seen: ['desk', 'ap'], mastery: {} });
const { p, K, shot, step, go, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, modalText, mclick, job, consoleLines, report, browser, errs } = Q;
const out = {};
const close = () => K(() => window.__kota.noc.closeModal());
const IT = 'PROP_L1_PC_ITOFFICE_01';
const tools = async (items, ap = 0, patch = 0) => { await goAnchor('CABINET'); await press('f'); for (const it of items) if (!(await K(i => window.__kota.noc.inv[i], it))) await mclick(`take-${it}`); for (let i = 0; i < ap; i++) await mclick('take-ap'); for (let i = 0; i < patch; i++) await mclick('take-patch'); console.log('  inv', JSON.stringify(await K(() => window.__kota.noc.inv))); await close(); };
const rack = async lv => { const d = await K(l => window.__kota.idfs().find(x => x.level === l), lv); for (const [dx, dz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, -0.3]]) { await go(d.x + dx, d.z + dz, lv); if (await K(() => window.__kota.nearRack())) break; } await press('f'); return modalText(); };
const cli = async (sw, lines) => { await mclick(`console-${sw}`); await p.waitForTimeout(150); await p.click('.swcli .swin'); await p.keyboard.press('Enter'); const o = await consoleLines(lines); await mclick('console-close'); return o; };
const laptopTest = async pc => { await goPc(pc); await openPc(pc); const pg = await browser('cari.id', 600); let t = pg; if (/Selamat datang/.test(pg ?? '')) { const c = await K(n => { const c = window.__kota.wifi.CLIENTS.get(n); return { room: c.room, guest: c.guest }; }, pc); await Q.fillName('room', c.room); await Q.fillName('surname', c.guest); await K(() => { const a = document.querySelector('#pcos input[name=agree]'); a.checked = true; }); await Q.clickName('portal-login'); await p.waitForTimeout(500); t = await K(() => document.querySelector('#pcos .brw .page')?.innerText.slice(0, 120)); } await openCmd(); await cmd('netsh wlan show interfaces', 400); const ni = await cmdText(); await closePc(); return { page: t?.slice(0, 80).replace(/\n/g, ' '), sig: /Signal\s+:\s*(\d+)%/.exec(ni)?.[1], ch: /Channel\s+:\s*(\d+)/.exec(ni)?.[1] }; };
const ticket = async f => { await K(f => window.__kota.noc.startShift(Math.random, [f]), f); await close(); const j = await job(); console.log('  job', JSON.stringify({ id: j?.id, faults: j?.faults, pc: j?.targets?.[0]?.pc, order: j?.order })); return j; };
const finish = async tag => { await step(15); const r = await report(tag); const open = await K(() => window.__kota.noc.jobs.filter(j => j.status !== 'closed').length); await K(() => { const n = window.__kota.noc; n.mode = 'idle'; n.jobs = []; }); return /Laporan kerja/.test(r ?? '') ? 'OK' : `NOT CLOSED (${open})`; };
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'portal') { const j = await ticket('portal'); console.log('  healthy before', await K(n => window.__kota.wifi.healthy(n), j.targets[0].pc)); const r = await laptopTest(j.targets[0].pc); console.log('  test', JSON.stringify(r)); await shot('wifi_portal_after'); out.portal = await finish('portal'); }
    if (ph === 'appoe') {
      const j = await ticket('appoe'); const det = await K(() => window.__kota.noc.jobs[0].detail); console.log('  detail', det);
      const pc = j.targets[0].pc; const before = await laptopTest(pc); console.log('  laptop before', JSON.stringify(before));
      await tools(['console', 'laptop']); const lv = +/_L(\d)_/.exec(pc)[1];
      const m = await rack(lv); console.log('  rack', m?.slice(0, 160)); await shot('wifi_rack_hotel');
      const apId = /(AP-L\d-\d+)/.exec(det)[1]; const port = await K(a => window.__kota.portOf(a), apId);
      if (/tercabut/.test(det)) { const pp = await K(a => window.__kota.panelOf(a), apId); await mclick(`pp-SW-L${lv}-${pp.pp}`); await mclick(`swp-SW-L${lv}-${lv && /→ (Gi1\/0\/(\d+))/.exec(det)[2]}`); }
      else { const n = /Gi1\/0\/(\d+)/.exec(det)[1]; const o = await cli(`SW-L${lv}`, ['enable', 'show power inline', 'conf t', `interface gi1/0/${n}`, 'power inline auto', 'no shutdown', 'end', 'write memory']); console.log('  cli tail', o.slice(-300).replace(/\n/g, ' / ')); }
      await close(); console.log('  ap port now', JSON.stringify(await K(a => window.__kota.portOf(a), apId)), 'healthy', await K(n => window.__kota.wifi.healthy(n), pc));
      const after = await laptopTest(pc); console.log('  laptop after', JSON.stringify(after)); out.appoe = await finish('appoe');
    }
    if (ph === 'aprf') {
      const j = await ticket('aprf'); const det = await K(() => window.__kota.noc.jobs[0].detail); console.log('  detail', det); const pc = j.targets[0].pc;
      await tools(['analyzer']); await goPc(pc); await press('r'); await step(10); await shot('wifi_analyzer_room'); console.log('  analyzer', await K(() => document.getElementById('wifi-ana')?.innerText.replace(/\n+/g, ' | ').slice(0, 300)));
      await press('r');
      const q = await K(n => { const q = window.__kota.wifi.quality(n); return { ap: q.ap.id, ch: q.ch, cci: q.cciAp?.id, cciCh: q.cciAp?.ch, power: q.ap.power }; }, pc); console.log('  quality', JSON.stringify(q));
      await goPc(IT); await openPc(IT); const pg = await browser('192.168.10.20', 500); console.log('  wlc', pg?.slice(0, 120).replace(/\n/g, ' '));
      const lv = +/AP-L(\d)/.exec(q.ap)[1]; await K(l => document.querySelector(`#pcos button[name=wlc-floor-${l}]`).click(), lv); await p.waitForTimeout(200);
      if (q.power === 'Rendah') await p.selectOption(`#pcos select[name="pw-${q.ap}"]`, 'Sedang');
      else { for (const c of ['1', '6', '11']) { await p.selectOption(`#pcos select[name="ch-${q.ap}"]`, c); await p.waitForTimeout(100); const ok = await K(n => window.__kota.wifi.quality(n).ok, pc); if (ok) break; } }
      await shot('wifi_wlc'); await closePc();
      const after = await laptopTest(pc); console.log('  laptop after', JSON.stringify(after)); out.aprf = await finish('aprf');
    }
    if (ph === 'dhcppool') {
      const j = await ticket('dhcppool'); const pc = j.targets[0].pc;
      await goPc(pc); await openPc(pc); await openCmd(); await cmd('ipconfig', 400); console.log('  ipconfig', (await cmdText()).slice(-260).replace(/\n+/g, ' / ')); await closePc();
      await goPc(IT); await openPc(IT); const pg = await browser('172.16.4.1', 500); console.log('  router', pg?.slice(0, 100).replace(/\n/g, ' '));
      await Q.routerLogin(); await Q.routerNav('IP › DHCP Server'); await p.waitForTimeout(150); console.log('  dhcp page', await K(() => document.querySelector('#pcos .brw .page')?.innerText.slice(0, 200).replace(/\n+/g, ' | '))); await Q.fillName('dhcp-end', '172.16.7.200'); await Q.clickName('apply-dhcp'); await p.waitForTimeout(200); await closePc();
      console.log('  healthy', await K(n => window.__kota.wifi.healthy(n), pc));
      const after = await laptopTest(pc); console.log('  laptop after', JSON.stringify(after)); out.dhcppool = await finish('dhcppool');
    }
    if (ph === 'ap') {
      const jj = await K(() => { const j = window.__kota.noc.acceptContract('ap', 777); return j && { order: j.order, sw: j.sw, ap: j.apId, swPort: j.swPort }; }); console.log('  order', JSON.stringify(jj)); await mclick('order-ok'); await close();
      console.log('  hud', await K(() => document.getElementById('noc-hud').innerText.replace(/\n+/g, ' | ').slice(0, 200)));
      await tools(['console', 'laptop', 'analyzer'], 1, 1);
      const sp = await K(() => window.__kota.noc.spots()[0]); await go(sp.x + 200, sp.z + 150 + 0.5, sp.level); await step(3); console.log('  spot prompt', await K(() => window.__kota.prompt())); await shot('wifi_spot');
      await press('f'); await step(3); console.log('  mounted?', await K(a => window.__kota.wifi.APS.find(x => x.id === a).mounted, jj.ap));
      await press('r'); await step(8); const ana = await K(() => document.getElementById('wifi-ana')?.innerText.replace(/\n+/g, ' | ').slice(0, 400)); console.log('  survey', ana); await shot('wifi_survey'); await press('r');
      const lv = sp.level, n = jj.swPort[jj.ap], pp = await K(a => window.__kota.panelOf(a), jj.ap);
      await rack(lv); await mclick(`pp-SW-L${lv}-${pp.pp}`); await mclick(`swp-SW-L${lv}-${n}`);
      const o = await cli(`SW-L${lv}`, ['enable', 'conf t', `interface gi1/0/${n}`, 'switchport mode access', 'switchport access vlan 40', 'power inline auto', 'no shutdown', 'end', 'write memory', 'show power inline']); console.log('  cli', o.slice(-260).replace(/\n/g, ' / ')); await close();
      await goPc(IT); await openPc(IT); await browser('192.168.10.20', 500); await K(l => document.querySelector(`#pcos button[name=wlc-floor-${l}]`).click(), lv); await p.waitForTimeout(150);
      await K(a => document.querySelector(`#pcos button[name="adopt-${a}"]`)?.click(), jj.ap); await p.waitForTimeout(150);
      for (const c of ['1', '6', '11']) { await p.selectOption(`#pcos select[name="ch-${jj.ap}"]`, c); await p.waitForTimeout(100); if (await K(() => !/kanal/.test(window.__kota.noc.tracked() ? window.__kota.noc.nextHint(window.__kota.noc.tracked()) : ''))) break; }
      console.log('  next', await K(() => window.__kota.noc.nextHint(window.__kota.noc.tracked()))); await shot('wifi_wlc_ap'); await closePc();
      const ts = await K(() => window.__kota.noc.tracked().targets.map(t => t.pc.name));
      for (const t of ts) console.log('  test', t, JSON.stringify(await laptopTest(t)));
      out.ap = await finish('ap');
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 300)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
