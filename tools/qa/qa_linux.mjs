// D: Linux server srv-nusa — SSH from a lab PC, console at rack 2, and the three server tickets fixed for real.
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'ssh,srvdown,zone,dhcpscope').split(',');
const Q = await boot(null);
const { p, K, step, go, goPc, press, openPc, openCmd, cmd, cmdText, closePc, closeWins, browser, modalText, mclick, report, shot, errs } = Q;
const out = {};
const atRack2 = async () => { const a = await K(() => window.__kota.anchors().find(a => a.name === 'ANCHOR_SRV_RACK_02')); for (const [dx, dz] of [[0, -1.0], [0, 1.0], [1, 0], [-1, 0], [0, -0.7]]) { await go(a.x + dx, a.z + dz, 1); const h = await K(() => document.getElementById('hudHint')?.textContent ?? ''); if (/srv-nusa/.test(h)) return h; } return K(() => document.getElementById('hudHint')?.textContent); };
const termType = async lines => { for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(60); } return K(() => document.querySelector('.noc-modal .swout')?.textContent.slice(-900)); };
const nanoFix = async (where, fix) => { await p.waitForTimeout(150); const cur = await K(s => document.querySelector(`${s} textarea[name=nano-text]`)?.value, where); await p.fill(`${where} textarea[name=nano-text]`, fix(cur)); await p.click(`${where} button[name=nano-save]`); await p.click(`${where} button[name=nano-exit]`); await p.waitForTimeout(100); };
const fixZone = z => z.replace(/^intranet\s+IN\s+A\s+\S+/m, 'intranet IN A    192.168.10.5').replace(/192\.168\.10\.2O/g, '192.168.10.20');
const fixDhcp = c => c.replace(/range\s+[\d.]+\s+[\d.]+;/, 'range 192.168.10.100 192.168.10.199;').replace(/option routers\s+[\d.]+;/, 'option routers 192.168.10.1;');
const ticket = async f => { await K(f => window.__kota.noc.startShift(Math.random, [f]), f); await press('Escape'); const j = await Q.job(); console.log('  ticket', j.id, j.faults, j.targets.map(t => t.pc)); console.log('  detail', await K(() => window.__kota.noc.tracked().detail)); return j; };
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'ssh') {
      const pc = 'PROP_L1_PC_WORKSHOP_01'; await goPc(pc); await openPc(pc); await openCmd();
      await cmd('nslookup intranet.lab.smk.local', 500); const ns = await cmdText(); console.log('  nslookup', ns.slice(-160));
      await cmd('ssh teknisi@srv-nusa', 400); await cmd('smkbisa', 300); await cmd('systemctl status bind9', 300); await cmd('dig www.lab.smk.local', 300); await cmd('cat /var/www/html/index.html', 300);
      const t = await cmdText(); console.log('  ssh', t.slice(-500)); await shot('d_ssh');
      await cmd('exit', 300); const t2 = await cmdText();
      const pg = await browser('intranet.lab.smk.local'); console.log('  web', pg?.slice(0, 160)); await shot('d_web');
      out.ssh = /192\.168\.10\.5/.test(ns) && /active \(running\)/.test(t) && /Intranet Lab TKJ/.test(pg ?? '') && /Connection to 192.168.10.5 closed/.test(t2) ? 'OK' : 'FAIL';
      await closeWins(); await closePc();
    }
    if (ph === 'srvdown') {
      const j = await ticket('srvdown'); const pc = j.targets[0].pc;
      await goPc(pc); await openPc(pc); await openCmd(); await cmd('ipconfig', 300); const pre = await browser('intranet.lab.smk.local'); console.log('  before', pre?.slice(0, 100)); await closeWins(); await closePc();
      console.log('  rack', await atRack2()); await press('f'); await shot('d_console');
      const t = await termType(['teknisi', 'smkbisa', 'systemctl status apache2', 'sudo systemctl restart bind9', 'sudo systemctl start apache2', 'sudo systemctl start isc-dhcp-server', 'systemctl is-active isc-dhcp-server']);
      console.log('  console', t.slice(-300)); await press('Escape');
      await goPc(pc); await openPc(pc); await openCmd(); await cmd('ipconfig /renew', 1600); const pg = await browser('intranet.lab.smk.local'); console.log('  after', pg?.slice(0, 100)); await closeWins(); await closePc();
      const r = await report('srvdown'); out.srvdown = /Laporan kerja/.test(r ?? '') && !/Intranet/.test(pre ?? '') ? 'OK' : 'FAIL';
    }
    if (ph === 'zone') {
      const j = await ticket('zone'); const pc = j.targets[0].pc;
      await goPc(pc); await openPc(pc); await openCmd(); await cmd('nslookup intranet.lab.smk.local', 400); console.log('  nslookup before', (await cmdText()).slice(-120));
      await cmd('ssh teknisi@192.168.10.5', 300); await cmd('smkbisa', 300); await cmd('sudo nano /etc/bind/db.lab.smk.local', 300);
      await nanoFix('#pcos .cmd', fixZone);
      await cmd('named-checkzone lab.smk.local /etc/bind/db.lab.smk.local', 300); await cmd('sudo systemctl reload bind9', 300); console.log('  ssh', (await cmdText()).slice(-260)); await cmd('exit', 300);
      const pg = await browser('intranet.lab.smk.local'); console.log('  web', pg?.slice(0, 80)); await closeWins(); await closePc();
      const r = await report('zone'); out.zone = /Laporan kerja/.test(r ?? '') ? 'OK' : 'FAIL';
    }
    if (ph === 'dhcpscope') {
      const j = await ticket('dhcpscope'); const pc = j.targets[0].pc;
      await goPc(pc); await openPc(pc); await openCmd(); await cmd('ipconfig', 300); console.log('  before', (await cmdText()).slice(-260)); await closeWins(); await closePc();
      await atRack2(); await press('f');
      let t = await termType(['teknisi', 'smkbisa', 'sudo dhcpd -t', 'sudo nano /etc/dhcp/dhcpd.conf']); console.log('  dhcpd -t', t.slice(-200));
      await nanoFix('.noc-modal', fixDhcp);
      t = await termType(['sudo dhcpd -t', 'sudo systemctl restart isc-dhcp-server', 'systemctl is-active isc-dhcp-server']); console.log('  after', t.slice(-160)); await press('Escape');
      await goPc(pc); await openPc(pc); await openCmd(); await cmd('ipconfig /renew', 2600); await cmd('ping 192.168.10.1', 5000); console.log('  client', (await cmdText()).slice(-200), JSON.stringify((await Q.job())?.targets)); await closeWins(); await closePc();
      const r = await report('dhcpscope'); out.dhcpscope = /Laporan kerja/.test(r ?? '') ? 'OK' : 'FAIL';
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 300)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
