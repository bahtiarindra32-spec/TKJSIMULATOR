// E: office devices — printer, IP phone (voice VLAN + PoE), NAS share; each ticket fixed physically and tested from the client.
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'printer,voice,nas').split(',');
const Q = await boot(null);
const { p, K, step, go, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, closeWins, browser, modalText, mclick, report, shot, errs } = Q;
const out = {};
const ticket = async f => { await K(f => window.__kota.noc.startShift(Math.random, [f]), f); await press('Escape'); const j = await Q.job(); console.log('  ticket', j?.id, j?.faults, j?.targets.map(t => t.pc)); console.log('  detail', await K(() => window.__kota.noc.tracked()?.detail)); return j; };
const toSpot = async (id, re, back = 0) => { const s = await K(id => window.__kota.noc.spots().find(s => s.id === id), id); for (const [dx, dz] of [[0, 0.55], [0, -0.55], [0.55, 0], [-0.55, 0], [0.4, 0.4], [-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0, 0.8], [0, -0.8], [0.8, 0], [-0.8, 0]]) { await go(s.x + 200 + dx, s.z + 150 + dz, s.level); const h = await K(() => document.getElementById('hudHint')?.textContent ?? ''); if (re.test(h)) return h; } return 'NOT FOUND ' + (await K(() => document.getElementById('hudHint')?.textContent)); };
const printTest = async () => { await cmd('control printers', 400); const ip = await K(() => document.querySelector('#pcos button[name^="print-"]')?.name.slice(6)); await K(() => document.querySelector('#pcos button[name^="print-"]')?.click()); await p.waitForTimeout(250); const msg = await K(() => [...document.querySelectorAll('#pcos .win')].map(w => w.innerText).filter(t => /Printer/.test(t)).pop()?.slice(0, 160)); await K(() => [...document.querySelectorAll('#pcos .btn')].find(b => b.textContent === 'OK')?.click()); return { ip, msg }; };
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'printer') {
      const j = await ticket('printer'); const pc = j.targets[0].pc; const lv = +/_L(\d)_/.exec(pc)[1];
      await goPc(pc); await openPc(pc); await openCmd(); const t1 = await printTest(); console.log('  before', JSON.stringify(t1)); await closeWins(); await closePc();
      console.log('  at printer', await toSpot(`PRN-L${lv}`, /printer/)); await press('f'); await shot('e_printer');
      const want = await K(lv => window.__kota.office.PRINTERS.find(p => p.level === lv).want, lv);
      await p.fill('.noc-modal input[name=prn-ip]', want); await p.fill('.noc-modal input[name=prn-mask]', '255.255.255.0'); await p.fill('.noc-modal input[name=prn-gw]', '192.168.20.1');
      await mclick('prn-save'); await mclick('prn-cable'); await mclick('prn-config'); console.log('  panel', (await modalText())?.slice(-200)); await press('Escape');
      await goPc(pc); await openPc(pc); await openCmd(); const t2 = await printTest(); console.log('  after', JSON.stringify(t2)); await closeWins(); await closePc();
      const r = await report('printer'); out.printer = /Laporan kerja/.test(r ?? '') && /Error/.test(t1.msg ?? '') ? 'OK' : 'FAIL';
    }
    if (ph === 'voice') {
      const j = await ticket('voice'); const pc = j.targets[0].pc; const lv = +/_L(\d)_/.exec(pc)[1];
      const phn = await K(pc => window.__kota.office.PHONES.find(x => x.pc === pc), pc);
      console.log('  at phone', await toSpot(phn.id, /Telepon/)); await press('f');
      for (const k of '9000') await mclick(`key-${k}`); await mclick('phone-call'); const before = await modalText(); console.log('  dial before', before.slice(0, 200)); await shot('e_phone_before'); await press('Escape');
      console.log('  cab', await goAnchor('CABINET')); await press('f'); await mclick('take-console'); await mclick('take-laptop'); await press('Escape');
      const port = await K(pc => { const k = window.__kota; return null; }, pc);
      const rk = await K(lv => { const r = window.__kota.noc.RACKS[`IDF-L${lv}`]; return { x: r.x + 200, z: r.z + 150 }; }, lv);
      let hint = ''; for (const [dx, dz] of [[0, 0], [0, 0.3], [0, -0.3], [0.4, 0], [-0.4, 0]]) { await go(rk.x + dx, rk.z + dz, lv); hint = await K(() => document.getElementById('hudHint')?.textContent ?? ''); if (/Rak IDF/.test(hint)) break; }
      console.log('  rack', hint); await press('f'); await mclick(`console-SW-L${lv}`); await p.waitForTimeout(150);
      const n = j.targets[0] && await K(pc => { const s = window.__kota.noc; return null; }, pc);
      const portN = await K(pc => window.__kota.portOf ? window.__kota.portOf(pc) : null, pc);
      const swp = portN ?? await K(pc => { const t = document.querySelector('.noc-modal'); return null; }, pc);
      const pn = await K(pc => window.__kota.office.PHONES && window.__kota.swPort(pc), pc);
      const lines = ['', 'enable', 'conf t', `interface gi1/0/${pn}`, 'switchport voice vlan 100', 'power inline auto', 'end', `show interfaces gi1/0/${pn}`, 'write memory'];
      const txt = await Q.consoleLines(lines); console.log('  console', txt.slice(-330)); await press('Escape');
      await toSpot(phn.id, /Telepon/); await press('f'); for (const k of '9000') await mclick(`key-${k}`); await mclick('phone-call'); const after = await modalText(); console.log('  dial after', after.slice(0, 160)); await shot('e_phone_after'); await press('Escape');
      const r = await report('voice'); out.voice = /Laporan kerja/.test(r ?? '') && /Tes gema/.test(after) ? 'OK' : 'FAIL';
    }
    if (ph === 'nas') {
      const j = await ticket('nas'); const pc = j.targets[0].pc;
      await goPc(pc); await openPc(pc); await openCmd(); await cmd('net use Z: \\\\nas-kantor\\dokumen', 500); console.log('  before', (await cmdText()).slice(-140)); await closeWins(); await closePc();
      const a = await K(() => window.__kota.anchors().find(a => a.name === 'ANCHOR_SRV_RACK_03')); let hint = '';
      for (const [dx, dz] of [[0, -1.0], [0, 1.0], [1, 0], [-1, 0], [0, -0.7]]) { await go(a.x + dx, a.z + dz, 1); hint = await K(() => document.getElementById('hudHint')?.textContent ?? ''); if (/NAS/.test(hint)) break; }
      console.log('  rack3', hint); await press('f'); await mclick('nas-cable'); console.log('  nas', (await modalText())?.slice(0, 160)); await press('Escape');
      await goPc(pc); await openPc(pc);
      const pg = await browser('192.168.20.10'); console.log('  web', pg?.slice(0, 120));
      await K(() => { const c = document.querySelector('#pcos input[name=nas-smb]'); if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change')); } });
      await p.selectOption('#pcos select[name=perm-dokumen]', 'rw'); await shot('e_nas_web'); await closeWins();
      await openCmd(); await cmd('net use Z: \\\\nas-kantor\\dokumen', 500); await cmd('net use', 300); console.log('  after', (await cmdText()).slice(-220)); await closeWins(); await closePc();
      const r = await report('nas'); out.nas = /Laporan kerja/.test(r ?? '') ? 'OK' : 'FAIL';
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 300)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
