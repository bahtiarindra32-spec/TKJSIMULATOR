// New install contracts (EXT_C), crimping, and the work-day loop. Real input where the player would act; direct sim
// setup only for the configuration typing that other QA scripts already cover through the real UI.
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'crimp,printer,share,voice,dhcpsrv,failover,day').split(',');
const Q = await boot(null);
const { p, K, step, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, closeWins, browser, modalText, mclick, report, shot, errs } = Q;
const out = {};
const accept = async tpl => { const j = await K(t => { const n = window.__kota.noc; n.mode = 'idle'; n.jobs = []; const j = n.acceptContract(t, 4242); return j && { id: j.id, tpl: j.tpl, order: j.order, targets: j.targets.map(t => t.pc.name) }; }, tpl); console.log('  job', JSON.stringify(j)?.slice(0, 400)); await press('Escape'); return j; };
const st = () => K(() => { const j = window.__kota.noc.jobs[0]; return j && { status: j.status, notes: j.targets.map(t => `${t.ok ? 'ok' : 'x'}${t.tested ? 'T' : ''}:${t.note}`), hint: window.__kota.noc.nextHint(j) }; });
const fin = async tag => { const r = await report(tag); const s = await st(); console.log('  state', JSON.stringify(s)); return s?.status === 'closed' || /Laporan kerja/.test(r ?? ''); };
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'crimp') {
      const j = await accept('crimp'); const pc = j.targets[0];
      console.log('  cab', await goAnchor('CABINET')); await press('f'); await mclick('take-tester'); await mclick('crimp-open');
      // first a wrong cable: A on one end, B on the other (crossover)
      const A = ['putih-hijau', 'hijau', 'putih-oranye', 'biru', 'putih-biru', 'oranye', 'putih-coklat', 'coklat'], B = ['putih-oranye', 'oranye', 'putih-hijau', 'biru', 'putih-biru', 'hijau', 'putih-coklat', 'coklat'];
      for (const w of A) await mclick(`wire-${w}`); await mclick('crimp-do'); for (const w of B) await mclick(`wire-${w}`); await mclick('crimp-do'); await mclick('crimp-test');
      const t1 = await K(() => document.querySelector('.noc-modal .tester-out')?.innerText); console.log('  tester crossover:', t1?.replace(/\n+/g, ' ').slice(0, 160)); await shot('c_crimp_cross');
      await mclick('crimp-bin');
      for (const w of B) await mclick(`wire-${w}`); await mclick('crimp-do'); for (const w of B) await mclick(`wire-${w}`); await mclick('crimp-do'); await mclick('crimp-test');
      const t2 = await K(() => document.querySelector('.noc-modal .tester-out')?.innerText); console.log('  tester B-B:', t2?.replace(/\n+/g, ' ').slice(0, 120)); await shot('c_crimp_ok');
      await mclick('crimp-keep'); await press('Escape');
      await goPc(pc); await press('c'); await mclick('phys-install'); await press('Escape');
      await openPc(pc); await openCmd(); await cmd('ipconfig /renew', 2500); console.log('  focus0', await K(() => document.activeElement?.tagName + '.' + document.activeElement?.className)); await cmd('ipconfig', 900);
      const gw = await K(n => window.__kota.noc.jobs[0] && (window.__kota.pcos ? null : null), pc); void gw;
      console.log('  focus', await K(() => document.activeElement?.tagName + '.' + document.activeElement?.className + ' modal=' + !!document.querySelector('.noc-modal') + ' open=' + window.__kota.pcos.isOpen() + ' cmd=' + !!document.querySelector('#pcos .cmd'))); await p.click('#pcos .cmd').catch(e => console.log('clickfail', e.message.slice(0,120))); await cmd('ping 192.168.10.1', 4500); await shot('c_crimp_cmd'); console.log('  cmd', (await cmdText()).slice(-200).replace(/\n+/g, ' '));
      await closeWins(); await closePc();
      if (process.env.DOC) { await step(3);
        console.log('  hud', await K(() => document.querySelector('#noc-hud .stg')?.innerText.replace(/\n/g, '|') + ' cur=' + document.querySelector('#noc-hud .stg .cur')?.textContent));
        console.log('  open before sign', await K(() => window.__kota.noc.jobs.filter(x => x.status === 'open').length));
        await K(() => window.__kota.noc.openOrder(window.__kota.noc.jobs.find(x => x.status === 'open' && x.docReady)));
        await K(() => { const t = document.querySelector('.noc-modal textarea[name=ba-note]'); t.value = 'ok'; }); await mclick('ba-sign');
        console.log('  short', await K(() => document.querySelector('.noc-modal .pp-sec:last-of-type')?.innerText.slice(-80)));
        await K(() => { const t = document.querySelector('.noc-modal textarea[name=ba-note]'); t.value = 'Patch cord crossover diganti kabel T568B kedua ujung, dites LAN tester 1-8, ping gateway berhasil.'; }); await mclick('ba-sign');
      }
      out.crimp = (await fin('crimp')) && /3/.test(t1 ?? '') && /1 sampai 8/.test(t2 ?? '') ? 'OK' : 'FAIL';
    }
    if (ph === 'exam') {
      const r0 = await K(() => { const n = window.__kota.noc; n.s.xp = 900; n.s.cert = 0; n.s.day = null; n.mode = 'idle'; n.jobs = []; return { rank: n.rank(), ex: n.examFor() }; });
      await K(() => window.__kota.noc.openBoard()); await step(2);
      const sec = await K(() => [...document.querySelectorAll('.noc-modal h3')].map(x => x.textContent).join(' | '));
      await mclick('exam-start'); await step(2);
      const j = await K(() => { const j = window.__kota.noc.jobs[0]; return j && { title: j.title, exam: j.exam, sla: j.sla, tpl: j.tpl }; });
      // fail first (help asked), then pass
      const res = await K(() => { const n = window.__kota.noc, j = n.jobs[0]; const out = [];
        j.hint = true; j.age = 0; j.wrong = 0; n.close(j); n.openReport(n.pendingReport.shift()); out.push(n.rank() + ' / ' + document.querySelector('.noc-modal .msg')?.textContent); n.closeModal();
        n.mode = 'idle'; n.jobs = []; const k = n.startExam(); k.hint = false; k.age = 0; k.wrong = 0; n.close(k); n.openReport(n.pendingReport.shift()); out.push(n.rank() + ' / ' + document.querySelector('.noc-modal .msg')?.textContent); return out; });
      console.log('  r0', JSON.stringify(r0), '\n  board', sec, '\n  job', JSON.stringify(j), '\n  res', res.join(' || '));
      out.exam = r0.rank === 'Magang' && r0.ex === 1 && /Uji kenaikan pangkat/.test(sec) && j?.exam === 1 && /Magang/.test(res[0]) && /Teknisi Junior/.test(res[1]) ? 'OK' : 'FAIL';
    }
    if (ph === 'loop') {
      const r = await K(async () => { const n = window.__kota.noc; n.s.xp = 6000; n.s.cert = 9; n.s.day = null; n.mode = 'idle'; n.jobs = []; n.startShift(Math.random, ['loop']); n.closeModal();
        const j = n.jobs[0]; const pc = j.targets[0].pc.name; const sw = window.__kota.noc.portOf ? null : null; void sw;
        const before = window.__kota.switchObj(window.__kota.portOf(pc).sw); const out = { loop: before.loop, stpOff: before.stpOff, detail: j.detail };
        n.inv.console = true; n.inv.laptop = true; n.openConsole(before); await new Promise(z => setTimeout(z, 300)); const T = async l => { n.consoleType(l); await new Promise(z => setTimeout(z, 500)); };
        for (const l of ['', 'enable', 'show spanning-tree']) await T(l); out.showOff = document.querySelector('.swcli')?.innerText.slice(-700);
        for (const l of ['conf t', 'spanning-tree mode rapid-pvst', 'end', 'show spanning-tree']) await T(l); out.showOn = document.querySelector('.swcli')?.innerText.slice(-260);
        out.stpOffAfter = before.stpOff; out.env = window.__kota.wifi.env(pc); return out; });
      console.log('  loop', JSON.stringify(r));
      out.loop = r.loop && r.stpOff === true && r.stpOffAfter === false && /BLK/.test(r.showOn ?? '') && /No spanning tree/.test(r.showOff ?? '') ? 'OK' : 'FAIL';
    }
    if (ph === 'printer') {
      const j = await accept('x_printer'); const lv = +/_L(\d)_/.exec(j.targets[0])[1];
      // printer front panel (same flow qa_office proves with real typing)
      await K(lv => { const p = window.__kota.office.PRINTERS.find(p => p.level === lv); window.__kota.office.printerPanel(p); }, lv);
      const want = await K(lv => window.__kota.office.PRINTERS.find(p => p.level === lv).want, lv);
      await p.fill('.noc-modal input[name=prn-ip]', want); await p.fill('.noc-modal input[name=prn-mask]', '255.255.255.0'); await p.fill('.noc-modal input[name=prn-gw]', '192.168.20.1'); await mclick('prn-save'); await press('Escape');
      for (const pc of j.targets) {
        await goPc(pc); await openPc(pc); await openCmd(); await cmd('control printers', 400);
        await p.fill('#pcos input[name=prn-add]', want); await K(() => [...document.querySelectorAll('#pcos button')].find(b => b.textContent === 'Tambah')?.click()); await p.waitForTimeout(200);
        await K(w => document.querySelector(`#pcos button[name="print-${w}"]`)?.click(), want); await p.waitForTimeout(200);
        await closeWins(); await closePc();
      }
      out.printer = (await fin('printer')) ? 'OK' : 'FAIL';
    }
    if (ph === 'share') {
      const j = await accept('x_share'); const name = /\\\\nas-kantor\\(\w+)/.exec(j.order[0])[1];
      await K(n => { const N = window.__kota.office.NAS; N.smb = true; N.shares.push({ name: n, perm: 'rw' }); }, name);
      for (const pc of j.targets) { await goPc(pc); await openPc(pc); await openCmd(); await cmd(`net use P: \\\\nas-kantor\\${name}`, 600); console.log('  ', (await cmdText()).slice(-90).replace(/\n+/g, ' ')); await closeWins(); await closePc(); }
      out.share = (await fin('share')) ? 'OK' : 'FAIL';
    }
    if (ph === 'voice') {
      const j = await accept('x_voice'); const pc = j.targets[0];
      const before = await st(); console.log('  before', before.notes);
      await K(pc => { const q = window.__kota.rawPort(pc); q.poe = true; q.voice = 100; }, pc);
      const ph2 = await K(pc => window.__kota.office.PHONES.find(x => x.pc === pc), pc);
      await K(id => window.__kota.office.phonePanel(window.__kota.office.PHONES.find(x => x.id === id)), ph2.id);
      for (const k of '9000') await mclick(`key-${k}`); await mclick('phone-call'); console.log('  dial', (await modalText())?.slice(0, 120)); await press('Escape');
      out.voice = (await fin('voice')) && /PoE|VLAN/.test(before.notes.join()) ? 'OK' : 'FAIL';
    }
    if (ph === 'dhcpsrv') {
      const j = await accept('x_dhcpsrv');
      const svc = await K(() => ({ active: window.__kota.linux.svc['isc-dhcp-server'].active, conf: window.__kota.linux.files.get('/etc/dhcp/dhcpd.conf').slice(0, 40) })); console.log('  fresh', JSON.stringify(svc));
      const errMsg = await K(() => window.__kota.linux.start('isc-dhcp-server')); console.log('  start fresh ->', String(errMsg).slice(0, 90));
      await K(() => { const f = window.__kota.linux.files; f.set('/etc/dhcp/dhcpd.conf', 'option domain-name "lab.smk.local";\noption domain-name-servers 192.168.10.5;\ndefault-lease-time 86400;\nmax-lease-time 172800;\nauthoritative;\nsubnet 192.168.10.0 netmask 255.255.255.0 {\n  range 192.168.10.100 192.168.10.199;\n  option routers 192.168.10.1;\n}\n'); window.__kota.linux.start('isc-dhcp-server'); });
      for (const pc of j.targets) { await goPc(pc); await openPc(pc); await openCmd(); await cmd('ipconfig /renew', 900); await browser('http://intranet.lab.smk.local', 500); await closeWins(); await closePc(); }
      out.dhcpsrv = (await fin('dhcpsrv')) && !svc.active && /fail|Job/i.test(String(errMsg)) ? 'OK' : 'FAIL';
    }
    if (ph === 'failover') {
      const j = await accept('x_failover');
      const s0 = await st(); console.log('  before', s0.notes);
      await K(() => { const E = window.__kota.edge.EDGE; E.sla.set(1, { target: '203.0.113.1', src: 'GigabitEthernet0/0', scheduled: true }); E.track.set(1, 1); E.routes.forEach(r => { if (r.nh === '203.0.113.1') r.track = 1; }); E.routes.push({ net: '0.0.0.0', mask: '0.0.0.0', nh: '198.51.100.1', ad: 10, track: null }); E.nat.push({ acl: 1, iface: 'GigabitEthernet0/1' }); });
      for (const pc of j.targets) { await goPc(pc); await openPc(pc); await openCmd(); await browser('http://cari.id', 800); await closeWins(); await closePc(); }
      out.failover = (await fin('failover')) && /SLA|track|cadangan|NAT/.test(s0.notes.join()) ? 'OK' : 'FAIL';
    }
    if (ph === 'day') {
      await K(() => { const n = window.__kota.noc; n.mode = 'idle'; n.jobs = []; n.s.xp = 900; n.s.cert = 1; n.openBoard(); });
      await mclick('start-day'); const d0 = await K(() => ({ day: window.__kota.noc.day, mode: window.__kota.noc.mode, tpl: window.__kota.noc.jobs[0]?.tpl, sla: window.__kota.noc.jobs[0]?.sla })); console.log('  morning', JSON.stringify(d0)); await press('Escape');
      const closeAll = async () => { await K(() => { const n = window.__kota.noc; for (const j of n.jobs) if (j.status !== 'closed') { j.targets.forEach(t => { t.ok = t.tested = true; }); n.close(j); } }); for (let i = 0; i < 40; i++) { await step(2); await p.waitForTimeout(60); await mclick('report-ok'); const s = await K(() => ({ idle: window.__kota.noc.mode === 'idle' && !window.__kota.noc.pendingReport.length, ev: /Evaluasi/.test(document.querySelector('.noc-modal h2')?.textContent ?? '') })); if (s.idle || s.ev) break; } };
      await closeAll(); const d1 = await K(() => ({ day: window.__kota.noc.day, mode: window.__kota.noc.mode })); console.log('  after morning', JSON.stringify(d1)); await shot('c_day_board');
      await mclick('day-continue'); const d2 = await K(() => ({ day: window.__kota.noc.day, mode: window.__kota.noc.mode, n: window.__kota.noc.jobs.length })); console.log('  afternoon', JSON.stringify(d2)); await press('Escape');
      await closeAll(); await mclick('day-continue'); const d3 = await K(() => ({ day: window.__kota.noc.day, mode: window.__kota.noc.mode, jobs: window.__kota.noc.jobs.map(j => j.title) })); console.log('  incident', JSON.stringify(d3)); await press('Escape');
      await closeAll(); await step(3); const ev = await modalText(); console.log('  dbg', JSON.stringify(await K(() => ({ day: window.__kota.noc.day, mode: window.__kota.noc.mode, days: window.__kota.noc.s.days, h2: document.querySelector('.noc-modal h2')?.textContent, pend: window.__kota.noc.pendingReport.length })))); console.log('  eval', ev?.slice(0, 260)); await shot('c_day_eval');
      out.day = d0.mode === 'contract' && d1.day?.phase === 1 && d2.mode === 'shift' && d3.jobs.every(t => /INSIDEN/.test(t)) && /Evaluasi Hari 1/.test(ev ?? '') ? 'OK' : 'FAIL';
    }
  } catch (e) { console.log('  !!', e.message.slice(0, 300)); out[ph] = 'ERR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b?.close?.(); process.exit(0);
