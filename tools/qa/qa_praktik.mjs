// School lab building: walk in, teacher sheet -> code -> student run with real input where it matters -> result.
import { boot } from './qa_lib.mjs';
const ph = process.argv[2] ?? 'run';
const Q = await boot({ v: 1, xp: 1234, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } });
const { p, K, step, go, press, openPc, openCmd, cmd, cmdText, closePc, closeWins, browser, ipv4, modalText, mclick, shot, errs } = Q;
const out = {};
const S = () => K(() => window.__kota.praktik.state());
const spot = async k => { const s = await K(k => window.__kota.labSpots()[k], k); for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.5, 0.5]]) { await go(s[0] + dx, s[1] + dz, 1); const hint = await K(() => window.__kota.state().hint); if (/Meja guru|Lemari alat lab|Meja crimping|Rak lab/.test(hint)) return hint; } return null; };
const goPcL = async name => { const c = await K(n => window.__kota.pcs().find(c => c.name === n), name); for (const [dx, dz] of [[0, .9], [0, -.9], [.9, 0], [-.9, 0], [0, .7], [0, -.7]]) { await go(c.x + dx, c.z + dz, 1); if (await K(() => window.__kota.state().hint?.includes('PC Lab') || /Duduk|PC/.test(window.__kota.state().hint ?? ''))) return true; } return false; };
const pcDo = async (pc, fn) => { await goPcL(pc); await openPc(pc); await fn(); await closeWins(); await closePc(); await step(3); };
const tick = async () => { for (let k = 0; k < 12; k++) { const r = await K(() => { const p = window.__kota.praktik; p.tick(); const st = p.state(); if (st?.ready) { p.paraf(); return 1; } return st ? 0 : 1; }); if (r) return; await new Promise(z => setTimeout(z, 700)); } };
try {
  if (ph === 'sheet') {
    await go(240, 500, 1, -Math.PI / 2);
    await K(() => { const P = window.__kota.praktik; P.start({ steps: ['crimp', 'static', 'trouble'], minutes: 60, perStudent: true, seed: 77 }, 'TEST01', 'Budi'); });
    await step(3); await p.screenshot({ path: '/workspace/work/shots/lab_sheet.png', timeout: 60000 });
    await K(() => window.__kota.praktik.finish(true)); await step(2); await p.screenshot({ path: '/workspace/work/shots/lab_result.png', timeout: 60000 });
    out.sheet = 'OK';
  } else if (ph === 'look') {
    await go(262, 498, 1, Math.PI / 2 + 0.3); await step(4); await shot('lab_out');
    await go(249.5, 500, 1, Math.PI / 2); await step(4); await shot('lab_in'); await go(240, 500, 1, -Math.PI / 2); await step(4); await shot('lab_in2');
    console.log('  loc', await K(() => window.__kota.state().loc));
    out.look = /Lab Praktik/.test(await K(() => window.__kota.state().loc)) ? 'OK' : 'FAIL';
  } else {
    console.log('  guru', await spot('guru')); await press('f'); console.log('  desk', (await modalText())?.slice(0, 120));
    await mclick('lab-teacher');
    for (const id of ['crimp', 'desk', 'static', 'dhcp', 'vlan', 'dns', 'trouble']) await K(id => { const c = document.querySelector(`.noc-modal input[name=lab-${id}]`); if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change')); } }, id);
    const code = await K(() => document.querySelector('.noc-modal .lab-code b')?.dataset.code); console.log('  code', code);
    await mclick('lab-try'); await p.fill('.noc-modal input[name=lab-name]', 'Sari Dewi XI TKJ 1'); await mclick('lab-start');
    let s = await S(); console.log('  start', JSON.stringify({ step: s.step, desk: s.desk, P: s.P, checks: s.checks.map(c => +c.ok).join('') }));
    const pc = s.pc;
    // 1 crimp: real bench + plug + ping
    console.log('  tools', await spot('tools')); await press('f'); await mclick('take-tester'); await mclick('take-console'); await mclick('take-laptop'); await mclick('take-toner'); await mclick('take-patch'); await press('Escape');
    console.log('  crimp', await spot('crimp')); await press('f');
    const B = ['putih-oranye', 'oranye', 'putih-hijau', 'biru', 'putih-biru', 'hijau', 'putih-coklat', 'coklat'];
    for (const w of B) await mclick(`wire-${w}`); await mclick('crimp-do'); for (const w of B) await mclick(`wire-${w}`); await mclick('crimp-do'); await mclick('crimp-test'); await mclick('crimp-keep'); await press('Escape');
    await goPcL(pc); await press('c'); await K(() => { const b = [...document.querySelectorAll('.noc-modal button')].find(b => /phys-install/.test(b.name)); b?.click(); }); await press('Escape');
    // NOTE: the bench's crafted cable is used before stock cords
    await pcDo(pc, async () => { await openCmd(); await cmd('ipconfig /renew', 2500); await cmd('ping 192.168.70.1', 4500); });
    await tick(); s = await S(); console.log('  after crimp', s?.step, s?.checks.map(c => `${+c.ok}${c.label.slice(0, 18)}`).join(' | '));
    // 2 desk: probe/patch/console done through the sim (cabling/console UI is covered by qa_cabling), label + ping real
    if (s.step === 'desk') {
      await K(sw => { const k = window.__kota; const st = k.praktik.state(); const q = k.rawPanel ? null : null; void q; void st; }, 0);
      await K(() => { const k = window.__kota, st = k.praktik.state(), sw = k.praktik.sw(); const pp = sw.panel.find(x => x.pc === st.pc); pp.patch = st.P.swPort; pp.label = `LAB-${String(pp.n).padStart(2, '0')}`; const pt = sw.ports[st.P.swPort - 1]; pt.shutdown = false; pt.vlan = 70; sw.dirty = false; sw.ports.forEach(p => { p.pc = null; }); sw.panel.forEach(x => { if (x.patch && x.pc) sw.ports[x.patch - 1].pc = x.pc; }); });
      await pcDo(pc, async () => { await openCmd(); await cmd('ipconfig /renew', 2500); await cmd('ping 192.168.70.1', 4500); });
      await tick(); s = await S(); console.log('  after desk', s?.step, s?.checks.map(c => +c.ok).join(''));
    }
    // 3 static: real IPv4 dialog
    if (s.step === 'static') { const ip = `192.168.70.${s.P.host}`; await pcDo(pc, async () => { await ipv4({ ip, mask: '255.255.255.0', gw: '192.168.70.1', dns: '192.168.70.1' }); await openCmd(); await cmd('ping 192.168.70.1', 4500); }); await tick(); s = await S(); console.log('  after static', s?.step, s?.checks.map(c => +c.ok).join('')); }
    // 4 dhcp: router change via sim, PC back to DHCP with the real dialog
    if (s.step === 'dhcp') { const ps = s.P.poolStart; await K(ps => { const e = window.__kota.praktik; void e; }, ps);
      await K(ps => { const net = window.__kota.netEnvs?.() ; void net; }, ps);
      await K(ps => { window.__kota.prakEnv().dhcp = { start: `192.168.70.${ps}`, end: `192.168.70.${ps + 49}`, gw: '192.168.70.1', dns: ['192.168.70.1'], lease: 8 }; }, ps);
      await pcDo(pc, async () => { await ipv4(null); await openCmd(); await cmd('ipconfig /renew', 2500); await cmd('ping 192.168.70.1', 4500); }); await tick(); s = await S(); console.log('  after dhcp', s?.step, s?.checks.map(c => +c.ok).join('')); }
    // 5 vlan: real console at the lab rack
    if (s.step === 'vlan') {
      console.log('  rack', await spot('rack')); await press('f'); console.log('  rackui', (await modalText())?.slice(0, 140));
      const opened = await K(() => { const b = [...document.querySelectorAll('.noc-modal button')].find(b => /console/i.test(b.textContent) || /console/.test(b.name)); b?.click(); return b?.name || b?.textContent; }); console.log('  console btn', opened); await p.waitForTimeout(200); await p.click('.swcli .swin'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
      const port = await K(() => window.__kota.rawPort(window.__kota.praktik.state().pc).n);
      const lines = ['enable', 'conf t', 'vlan 70', 'name PRAKTIK', 'exit', `interface gi1/0/${port}`, 'switchport mode access', 'switchport access vlan 70', 'end', 'write memory'];
      for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(80); }
      console.log('  cli', (await K(() => document.querySelector('.swcli .swout')?.textContent.slice(-300)))?.replace(/\n+/g, ' / '));
      await press('Escape');
      await pcDo(pc, async () => { await openCmd(); await cmd('ipconfig /renew', 2500); await cmd('ping 192.168.70.1', 4500); }); await tick(); s = await S(); console.log('  after vlan', s?.step, s?.checks.map(c => `${+c.ok}${c.label.slice(0, 20)}`).join(' | '));
    }
    // 6 dns: record via sim, real browser
    if (s.step === 'dns') { const nm = s.P.dnsName; await K(nm => { window.__kota.prakEnv().dnsSrv.records.push({ name: nm, ip: '192.168.70.10' }); }, nm); await pcDo(pc, async () => { await browser(`http://${nm}`, 800); }); await tick(); s = await S(); console.log('  after dns', s?.step, s?.checks.map(c => +c.ok).join('')); }
    // K3: the last step needs the borrowed tools back in the cabinet
    await spot('tools'); await press('f'); for (const t of ['tester', 'console', 'laptop', 'toner']) if (await K(t => window.__kota.noc.inv[t], t)) await mclick(`take-${t}`); await press('Escape');
    // 7 trouble: inspect, fix through sim per fault, real browser test
    if (s.step === 'trouble') { console.log('  faults', s.P.faults); await K(() => { const k = window.__kota, st = k.praktik.state(), a = k.adapter(st.pc); const pt = k.rawPort(st.pc); for (const f of st.P.faults) { if (f === 'kabel') a.cable = true; if (f === 'port') pt.shutdown = false; if (f === 'ip' || f === 'gw') { a.dhcp = true; } if (f === 'dns') { a.dnsAuto = true; } } a.dnsAuto = true; });
      await pcDo(pc, async () => { await openCmd(); await cmd('ipconfig /renew', 2500); await browser('http://192.168.70.10', 800); }); await tick(); await step(2); }
    const res = await modalText(); console.log('  result', res?.slice(0, 600));
    const xp = await K(() => JSON.parse(localStorage.getItem('kotaNusantara.noc.v1')).xp), jobs = await K(() => window.__kota.noc.jobs.length);
    console.log('  career xp', xp, 'noc jobs', jobs);
    const csv = await K(() => window.__kota.praktik.last?.csv ?? ''); console.log('  csv lines', csv.split('\r\n').length, csv.split('\r\n')[1]?.slice(0, 160));
    out.run = /Sangat Kompeten/.test(res ?? '') && /nilai/i.test(res ?? '') && csv.split('\r\n').length > 30 && xp === 1234 ? 'OK' : 'FAIL';
  }
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out[ph] = 'ERR'; }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
