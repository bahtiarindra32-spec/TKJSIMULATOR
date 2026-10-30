// F: edge router R-EDGE — ISP1 failover, NAT, ACL tickets fixed on the console in rack 1, tested from the PC.
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'isp1,nat,acl').split(',');
const Q = await boot(null);
const { p, K, go, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, closeWins, modalText, mclick, report, shot, errs } = Q;
const out = {};
const ticket = async f => { await K(f => window.__kota.noc.startShift(Math.random, [f]), f); await press('Escape'); const j = await Q.job(); console.log('  ticket', j?.id, j?.faults, j?.targets.map(t => t.pc)); console.log('  detail', await K(() => window.__kota.noc.tracked()?.detail)); return j; };
const atRack1 = async () => { const a = await K(() => window.__kota.anchors().find(a => a.name === 'ANCHOR_SRV_RACK_01')); for (const [dx, dz] of [[0, -1.0], [0, 1.0], [1, 0], [-1, 0], [0, -0.7]]) { await go(a.x + dx, a.z + dz, 1); const h = await K(() => document.getElementById('hudHint')?.textContent ?? ''); if (/R-EDGE/.test(h)) return h; } return K(() => document.getElementById('hudHint')?.textContent); };
const term = async lines => { for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(50); } return K(() => document.querySelector('.noc-modal .swout')?.textContent); };
const pingTest = async (pc, tag) => { await goPc(pc); await openPc(pc); await openCmd(); await cmd('ping cari.id', 5200); const t = (await cmdText()).slice(-230); console.log(`  ping ${tag}`, t.replace(/\n+/g, ' / ').slice(-200)); await closeWins(); await closePc(); return t; };
const FIX = {
  isp1: ['conf t', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1', 'ip route 0.0.0.0 0.0.0.0 198.51.100.1 10', 'ip nat inside source list 1 interface gi0/1 overload', 'end', 'show ip route', 'show track'],
  nat: ['conf t', 'interface gi0/2', 'ip nat inside', 'exit', 'access-list 1 permit 192.168.0.0 0.0.255.255', 'end', 'show ip nat statistics'],
  acl: ['show access-lists', 'conf t', 'ip access-list extended 110', 'no 5', 'end', 'show access-lists'],
};
let tools = false;
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    const j = await ticket(ph); const pc = j.targets[0].pc;
    const before = await pingTest(pc, 'before');
    console.log('  hud', await K(() => document.querySelector('#noc-hud .nx')?.textContent));
    if (!tools) { await goAnchor('CABINET'); await press('f'); await mclick('take-console'); await mclick('take-laptop'); await press('Escape'); tools = true; }
    console.log('  rack', await atRack1()); await press('f'); await p.waitForTimeout(150);
    const t = await term(['', 'enable', 'show ip route', ...FIX[ph], 'write memory']);
    console.log('  console', t.slice(-700)); await shot(`f_${ph}`); await press('Escape');
    const after = await pingTest(pc, 'after');
    const r = await report(ph); out[ph] = /Laporan kerja/.test(r ?? '') && !/Received = 4/.test(before) && /Received = 4/.test(after) ? 'OK' : 'FAIL';
  } catch (e) { console.log('  !! error', e.message.slice(0, 300)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
