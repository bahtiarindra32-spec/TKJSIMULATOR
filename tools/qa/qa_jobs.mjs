// End-to-end playtest of the work board: every contract template + new ticket faults, through real UI input.
// usage: node qa_jobs.mjs static,desk,dns,renum,vlan,shift
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'static,desk,dns,renum,vlan,shift').split(',');
const xpFor = { chaos: 0, static: 0, desk: 0, dns: 600, renum: 600, vlan: 1600, shift: 1600 };
const Q = await boot({ v: 1, xp: xpFor[phases[0]] ?? 0, shifts: 0, closed: 0, slaMet: 0, seq: 0, contracts: 0, stars: 0, seen: [], mastery: {} });
const { p, K, shot, step, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, ipv4, browser, routerLogin, routerNav, fillName, clickName, modalText, mclick, job, consoleLines, report, errs } = Q;
const results = {};
const setXp = xp => K(x => { const s = JSON.parse(localStorage.getItem('kotaNusantara.noc.v1')); s.xp = Math.max(s.xp, x); localStorage.setItem('kotaNusantara.noc.v1', JSON.stringify(s)); window.__kota.noc['s'].xp = Math.max(window.__kota.noc['s'].xp, x); }, xp);
const accept = async (tpl, seed) => {
  await K(([t, s]) => window.__kota.noc.acceptContract(t, s), [tpl, seed]);
  let t = await modalText(); console.log(`  [${tpl}] modal:`, t?.slice(0, 240));
  if (await mclick('brief-ok')) t = await modalText();
  await shot(`jobs_${tpl}_order`);
  await mclick('order-ok');
  const j = await job(); console.log(`  [${tpl}] job`, JSON.stringify(j));
  return j;
};
const getTools = async () => {
  console.log('  cabinet hint:', await goAnchor('CABINET'));
  await press('f'); console.log('  cabinet:', (await modalText())?.slice(0, 160));
  for (const it of ['tester', 'console', 'laptop', 'patch', 'patch']) { const have = await K(i => i === 'patch' ? false : window.__kota.noc.inv[i], it); if (!have) await mclick(`take-${it}`); }
  console.log('  inv', JSON.stringify(await K(() => window.__kota.noc.inv)));
  await K(() => window.__kota.noc.closeModal());
};
const consoleTo = async (sw, lines) => {
  console.log('  rack hint:', await goAnchor('RACKP'));
  await press('f');
  if (!(await mclick(`console-${sw}`))) console.log('  !! no console button');
  await p.waitForTimeout(150); await p.click('.swcli .swin');
  await p.keyboard.press('Enter');
  const out = await consoleLines(lines);
  await shot(`jobs_cli_${sw}`);
  await mclick('console-close'); await K(() => window.__kota.noc.closeModal());
  return out;
};
const verify = async (pc, what = 'ping cari.id -n 1', wait = 1800) => { await goPc(pc); await openPc(pc); await openCmd(); await cmd(what, wait); const t = await cmdText(); await closePc(); return t; };
const done = async tag => { const j = await job(); const st = await K(() => ({ mode: window.__kota.noc.mode, jobs: window.__kota.noc.jobs.map(j => j.id + ':' + j.status) })); console.log(`  [${tag}] state`, JSON.stringify(st), j ? JSON.stringify(j.targets) : ''); };

for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  await setXp(xpFor[ph] ?? 0);
  try {
    if (ph === 'static') {
      await press('t'); await shot('jobs_board'); console.log('  board:', (await modalText())?.slice(0, 400)); await K(() => window.__kota.noc.closeModal());
      const j = await accept('static', 4242);
      for (const t of j.targets) {
        await goPc(t.pc);
        // physical first if the link is down
        if (!(await K(n => window.__kota.noc && (() => { const a = window.__kota.pcos.adapter(n); return a.cable; })(), t.pc))) { await press('c'); await shot('jobs_phys'); console.log('  phys:', (await modalText())?.slice(0, 200)); await mclick('phys-reseat'); await K(() => window.__kota.noc.closeModal()); }
        await openPc(t.pc);
        const v = await ipv4({ ip: t.ip, mask: t.mask, gw: t.gw, dns: t.dns }); console.log('  ipv4', t.pc, v);
        await openCmd(); await cmd('ipconfig', 300); await cmd('ping cari.id -n 1', 1800); console.log('  cmd', (await cmdText())?.slice(-300).replace(/\n+/g, ' / '));
        await closePc();
      }
      await done('static'); results.static = await report('static');
    }
    if (ph === 'desk') {
      const j = await accept('desk', 777);
      await getTools();
      for (const t of j.targets) { await goPc(t.pc); await press('c'); console.log('  phys:', (await modalText())?.slice(0, 220)); await mclick('phys-install'); await shot('jobs_desk_phys'); await K(() => window.__kota.noc.closeModal()); }
      const ports = await K(names => names.map(n => window.__kota.noc.jobs[0].order.find(o => o.includes(window.__kota.pcs().find(c => c.name === n) ? '' : ''))), j.targets.map(t => t.pc));
      const pn = await K(names => names.map(n => { const sw = window.__kota.noc.jobs[0].sw; return window.__kota.noc.jobs[0].order.find(o => o.includes('outlet'))?.match(/Gi1\/0\/(\d+)/g); }), j.targets.map(t => t.pc));
      const lines = ['enable', 'show interfaces status'];
      for (const t of j.targets) { const n = await K(name => { for (const o of window.__kota.noc.jobs[0].order) { const m = /Gi1\/0\/(\d+)/.exec(o); if (m && o.startsWith(window.__kota.noc.jobs[0].targets.find(x => x.pc.name === name).pc.label)) return m[1]; } return null; }, t.pc); lines.push('conf t', `int gi1/0/${n}`, 'no shut', 'switchport access vlan ' + (j.envId === 'lab' ? 10 : 20), 'end'); }
      lines.push('write memory', 'show vlan brief');
      const out = await consoleTo(j.sw, lines); console.log('  cli tail:', out.slice(-500).replace(/\n+/g, ' / '));
      for (const t of j.targets) console.log('  verify', t.pc, (await verify(t.pc, 'ping cari.id -n 1'))?.slice(-200).replace(/\n+/g, ' / '));
      await done('desk'); results.desk = await report('desk');
    }
    if (ph === 'dns') {
      const j = await accept('dns', 31337);
      const gw = await K(e => window.__kota.noc && (window.__kota.pcs && null) || null, j.envId);
      const first = j.targets[0].pc;
      // add the record from the first PC's browser
      await goPc(first); await openPc(first);
      const env = await K(n => { const a = window.__kota.pcos.adapter(n); return { dns: [a.dnsAuto, a.dns1] }; }, first);
      const gwIp = j.order[1].match(/router (\d+\.\d+\.\d+\.\d+)/)[1];
      console.log('  open router', gwIp, (await browser(gwIp))?.slice(0, 80));
      await routerLogin(); await routerNav('IP › DNS'); await fillName('rec-name', j.record.name); await fillName('rec-ip', j.record.ip); await clickName('add-rec');
      await shot('jobs_dns_router');
      console.log('  router page', (await K(() => document.querySelector('#pcos .wf main')?.innerText.slice(0, 400)))?.replace(/\n+/g, ' / '));
      await Q.closeWins(); await closePc();
      for (const t of j.targets) {
        await goPc(t.pc); await openPc(t.pc);
        let pg = await browser(`http://${t.browse}`, 500); console.log('  browse', t.pc, pg?.slice(0, 120).replace(/\n+/g, ' / '));
        if (!/Intranet/.test(pg ?? '')) { await Q.closeWins(); await openCmd(); await cmd('ipconfig /all', 300); await cmd(`nslookup ${t.browse}`, 6500); console.log('  diag', (await cmdText())?.slice(-260).replace(/\n+/g, ' / ')); await Q.closeWins(); await ipv4(null); pg = await browser(`http://${t.browse}`, 500); console.log('  browse2', pg?.slice(0, 120).replace(/\n+/g, ' / ')); }
        await shot(`jobs_dns_browse_${t.pc}`);
        await closePc();
      }
      await done('dns'); results.dns = await report('dns');
    }
    if (ph === 'renum') {
      const j = await accept('renum', 9001);
      const R = j.router; const pc0 = j.targets[0].pc;
      const nb = R.ip.split('.').slice(0, 3).join('.');
      const mask = R.prefix === 24 ? '255.255.255.0' : '255.255.255.128';
      await goPc(pc0); await openPc(pc0);
      await openCmd(); await cmd('ipconfig', 300); console.log('  before', (await cmdText())?.slice(-260).replace(/\n+/g, ' / ')); await Q.closeWins();
      await ipv4({ ip: '192.168.88.10', mask: '255.255.255.0', gw: '192.168.88.1', dns: '192.168.88.1' });
      console.log('  factory router:', (await browser('192.168.88.1'))?.slice(0, 60)); await routerLogin();
      await routerNav('IP › DNS'); await fillName('dns-up', '8.8.8.8, 1.1.1.1'); await K(() => { const c = document.querySelector('#pcos input[name=dns-allow]'); c.checked = true; }); await clickName('apply-dns');
      await routerNav('IP › Addresses'); await fillName('lan-addr', `${R.ip}/${R.prefix}`); await clickName('apply-addr');
      console.log('  after LAN change:', (await K(() => document.querySelector('#pcos .brw .page')?.innerText.slice(0, 120)))?.replace(/\n+/g, ' / '));
      await shot('jobs_renum_lost');
      await Q.closeWins();
      const tmp = R.prefix === 24 ? `${nb}.20` : `${nb}.${+R.ip.split('.')[3] > 100 ? 20 : 110}`;
      await ipv4({ ip: tmp, mask, gw: R.ip, dns: R.ip });
      console.log('  new router:', (await browser(R.ip))?.slice(0, 60)); await routerLogin();
      await routerNav('IP › DHCP Server');
      await K(() => { const c = document.querySelector('#pcos input[name=dhcp-on]'); c.checked = true; });
      await fillName('dhcp-start', R.start); await fillName('dhcp-end', R.end); await fillName('dhcp-gw', R.ip); await fillName('dhcp-dns', R.ip); await clickName('apply-dhcp');
      console.log('  dhcp page', (await K(() => document.querySelector('#pcos .wf main')?.innerText.slice(0, 300)))?.replace(/\n+/g, ' / '));
      await shot('jobs_renum_dhcp');
      await Q.closeWins(); await ipv4(null);
      await openCmd(); await cmd('ipconfig /renew', 2800); await cmd('ping cari.id -n 1', 1800); console.log('  pc0', (await cmdText())?.slice(-300).replace(/\n+/g, ' / ')); await closePc();
      for (const t of j.targets.slice(1)) {
        await goPc(t.pc); await openPc(t.pc);
        if (t.mode === 'any') await ipv4(null);
        await openCmd(); await cmd('ipconfig /renew', 2800); await cmd('ping cari.id -n 1', 1800); console.log('  ', t.pc, (await cmdText())?.slice(-200).replace(/\n+/g, ' / ')); await closePc();
      }
      await done('renum'); results.renum = await report('renum');
      for (let k = 0; k < 4 && await K(() => window.__kota.noc.jobs.some(j => j.kind === 'follow' && j.status !== 'closed')); k++) { const f = await K(() => { const j = window.__kota.noc.jobs.find(j => j.kind === 'follow' && j.status !== 'closed'); return { targets: j.targets.map(t => ({ pc: t.pc.name })) }; }); console.log('  follow-up', JSON.stringify(f.targets)); const t = f.targets[0]; await goPc(t.pc); await openPc(t.pc); await ipv4(null); await openCmd(); await cmd('ipconfig /renew', 2800); await cmd('ping cari.id -n 1', 1800); await closePc(); await report('follow'); }
    }
    if (ph === 'vlan') {
      const j = await accept('vlan', 555);
      await getTools();
      const lines = ['en', 'conf t', 'vlan 30', 'name KASIR', 'exit'];
      for (const t of j.targets) { const n = await K(name => /Gi1\/0\/(\d+)/.exec(window.__kota.noc.jobs[0].order[0].split(', ').find(x => x.includes(window.__kota.noc.jobs[0].targets.find(y => y.pc.name === name).pc.label)) ?? '')?.[1], t.pc); lines.push(`int g1/0/${n}`, 'sw mode acc', 'sw acc vl 30', 'exit'); }
      lines.push('end', 'sh vl br', 'wr');
      const out = await consoleTo(j.sw, lines); console.log('  cli tail:', out.slice(-600).replace(/\n+/g, ' / '));
      for (const t of j.targets) console.log('  verify', t.pc, (await verify(t.pc, 'ipconfig /renew', 2800))?.slice(-120).replace(/\n+/g, ' / '), (await verify(t.pc, 'ping 192.168.30.10 -n 1', 1800))?.slice(-160).replace(/\n+/g, ' / '));
      await done('vlan'); results.vlan = await report('vlan');
    }
    if (ph === 'chaos') {
      await K(() => window.__kota.noc.closeModal());
      const j = await accept('static', 9999);
      if (!(await K(() => window.__kota.noc.inv.console && window.__kota.noc.inv.laptop))) await getTools();
      // pick a healthy L1 PC that is not a target and break its port on purpose
      const victim = await K(ts => window.__kota.pcs().map(c => c.name).find(n => /_L1_/.test(n) && !ts.includes(n) && window.__kota.portOf(n)), j.targets.map(t => t.pc));
      const vp = await K(n => window.__kota.portOf(n), victim);
      console.log('  victim', victim, JSON.stringify(vp));
      let out = await consoleTo(vp.sw, ['en', '?', 'foo bar', 'conf t', 'int gi1/0/99', `int gi1/0/${vp.n}`, 'shut', 'end', 'sh int gi1/0/' + vp.n, 'wr']);
      console.log('  cli chaos', out.slice(-700).replace(/\n+/g, ' / '));
      for (const t of j.targets) { await goPc(t.pc); await openPc(t.pc); await ipv4({ ip: t.ip, mask: t.mask, gw: t.gw, dns: t.dns }); await openCmd(); await cmd('ping cari.id -n 1', 1800); await closePc(); }
      results.chaos = await report('chaos');
      const f = await K(() => window.__kota.noc.jobs.filter(j => j.kind === 'follow').map(j => ({ id: j.id, pc: j.targets[0].pc.name, order: j.order })));
      console.log('  follow-ups', JSON.stringify(f));
      out = await consoleTo(vp.sw, ['en', 'conf t', `int gi1/0/${vp.n}`, 'no shut', 'end', 'wr']);
      for (const x of f) console.log('  fix follow', (await verify(x.pc))?.slice(-100).replace(/\n+/g, ' / '));
      for (const x of f) await report('follow');
      console.log('  end', JSON.stringify(await K(() => ({ mode: window.__kota.noc.mode, jobs: window.__kota.noc.jobs.map(j => j.id + ':' + j.status) }))));
    }
    if (ph === 'shift') {
      await K(() => window.__kota.noc.closeModal());
      await K(() => { window.__kota.noc.startShift(Math.random, ['cable', 'cablebad', 'port', 'vlan']); window.__kota.noc.closeModal(); });
      const T = await K(() => window.__kota.noc.jobs.map(j => ({ id: j.id, f: j.faults, pc: j.targets[0].pc.name, label: j.targets[0].pc.label, order: j.order })));
      console.log('  tickets', JSON.stringify(T));
      if (!(await K(() => window.__kota.noc.inv.tester && window.__kota.noc.inv.console && window.__kota.noc.inv.laptop && window.__kota.noc.inv.patch > 0))) await getTools();
      // cable: reseat
      await goPc(T[0].pc); await press('c'); console.log('  cable phys:', (await modalText())?.slice(0, 200)); await mclick('phys-reseat'); await K(() => window.__kota.noc.closeModal());
      console.log('  v1', (await verify(T[0].pc))?.slice(-120).replace(/\n+/g, ' / ')); await report('cable');
      // cablebad: tester then replace
      await goPc(T[1].pc); await press('c'); await mclick('phys-test'); await shot('jobs_tester'); console.log('  tester:', (await modalText())?.slice(0, 300)); await mclick('phys-replace'); await K(() => window.__kota.noc.closeModal());
      console.log('  v2', (await verify(T[1].pc))?.slice(-120).replace(/\n+/g, ' / ')); await report('cablebad');
      // port + vlan via console
      const info = await K(names => names.map(n => { const j = window.__kota.noc.jobs.find(j => j.targets[0].pc.name === n); return { n, lv: j.targets[0].pc.level }; }), [T[2].pc, T[3].pc]);
      const portN = async name => K(n => { const c = window.__kota.pcs().find(c => c.name === n); return null; }, name);
      const pn = await K(names => names.map(n => window.__kota.noc['nextStop'] && window.__kota.noc.jobs.find(j => j.targets[0].pc.name === n).order[0]), [T[2].pc, T[3].pc]);
      console.log('  orders', pn);
      const portOf = async n => K(n => window.__kota.portOf(n), n);
      const p2 = await portOf(T[2].pc), p3 = await portOf(T[3].pc);
      console.log('  ports', JSON.stringify([p2, p3]));
      let out = await consoleTo(p2.sw, ['en', 'sh int status', 'conf t', `int gi1/0/${p2.n}`, 'no shutdown', 'end', 'wr']); console.log('  cli port', out.slice(-300).replace(/\n+/g, ' / '));
      console.log('  v3', (await verify(T[2].pc))?.slice(-120).replace(/\n+/g, ' / ')); await report('port');
      out = await consoleTo(p3.sw, ['en', 'sh vlan brief', `sh int gi1/0/${p3.n}`, 'conf t', `int gi1/0/${p3.n}`, `switchport access vlan ${p3.home}`, 'end', 'wr']); console.log('  cli vlan', out.slice(-400).replace(/\n+/g, ' / '));
      console.log('  v4', (await verify(T[3].pc, 'ipconfig /renew', 2800))?.slice(-160).replace(/\n+/g, ' / '));
      console.log('  v4b', (await verify(T[3].pc))?.slice(-120).replace(/\n+/g, ' / ')); await report('vlan');
      await shot('jobs_shift_end'); console.log('  end board:', (await modalText())?.slice(0, 300));
    }
  } catch (e) { console.log(`!! ${ph} failed:`, e.message.slice(0, 300)); await shot(`jobs_fail_${ph}`); }
}
console.log('\nSUMMARY', JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, (v ?? '').match(/Laporan kerja \S+ ([★☆]+)/)?.[1] ?? 'no-report']))));
console.log('noc', JSON.stringify(await K(() => ({ xp: window.__kota.noc.xp, rank: window.__kota.noc.rank(), mode: window.__kota.noc.mode }))));
console.log('errors', errs.length ? errs : 'none');
await Q.b.close();
