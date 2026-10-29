// Structured cabling playtest: toner tracing + patch panel (desk contract), and the new rack faults
// (patch cord pulled, uplink down, loop) through real UI input.  usage: node qa_cabling.mjs desk,patch,uplink,loop
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'desk,patch,uplink,loop').split(',');
const Q = await boot({ v: 1, xp: 1600, shifts: 0, closed: 0, slaMet: 0, seq: 0, contracts: 0, stars: 0, seen: ['desk'], mastery: {} });
const { p, K, shot, step, go, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, modalText, mclick, job, consoleLines, report, errs } = Q;
const results = {};
const close = () => K(() => window.__kota.noc.closeModal());
const getTools = async (extra = 3) => {
  await goAnchor('CABINET'); await press('f');
  for (const it of ['toner', 'tester', 'console', 'laptop']) { const have = await K(i => window.__kota.noc.inv[i], it); if (!have) await mclick(`take-${it}`); }
  for (let i = 0; i < extra; i++) await mclick('take-patch');
  console.log('  inv', JSON.stringify(await K(() => window.__kota.noc.inv))); await close();
};
/** walk to a rack (MDF = server room anchor, IDF-Lx = office floor IDF) and open it with F */
const goRack = async id => {
  if (id === 'MDF') { await goAnchor('RACKP'); await press('f'); return modalText(); }
  const d = await K(i => window.__kota.idfs().find(x => x.id === i), id);
  for (const [dx, dz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, -0.3]]) { await go(d.x + dx, d.z + dz, d.level); if ((await K(() => window.__kota.nearRack())) === id) break; }
  console.log('  at rack', await K(() => window.__kota.nearRack()), 'hint:', await K(() => document.getElementById('hudHint')?.textContent));
  await press('f'); return modalText();
};
const rackOfSw = sw => (sw === 'SW-L1' ? 'MDF' : `IDF-${sw.slice(3)}`);
const console_ = async (sw, lines) => {
  await mclick(`console-${sw}`); await p.waitForTimeout(150); await p.click('.swcli .swin'); await p.keyboard.press('Enter');
  const out = await consoleLines(lines); await K(() => { window.__lastCli = document.querySelector('.swcli .swout')?.textContent ?? ''; }); await shot(`cab_cli_${sw}`); await mclick('console-close'); return out;
};
const verify = async (pc, what = 'ping cari.id -n 1', wait = 1800) => { await goPc(pc); await openPc(pc); await openCmd(); await cmd(what, wait); const t = await cmdText(); await closePc(); return t?.slice(-160).replace(/\n+/g, ' / '); };
/** sweep the probe across every panel port by hovering, return the loudest */
const sweep = async sw => {
  const best = await K(async sw => {
    const out = [];
    for (let n = 1; n <= 48; n++) { const b = document.querySelector(`.noc-modal button[name="pp-${sw}-${n}"]`); b.dispatchEvent(new MouseEvent('mouseenter')); out.push([n, document.querySelector('.noc-modal .tone').textContent]); }
    return out;
  }, sw);
  const loud = best.filter(([, t]) => /keras/.test(t)), faint = best.filter(([, t]) => /Samar/.test(t));
  console.log('  sweep loud', JSON.stringify(loud), 'faint', faint.map(x => x[0]).join(','));
  return loud[0]?.[0];
};

for (const ph0 of phases) {
  const [ph, variant] = ph0.split(':');
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'desk') {
      await K(() => window.__kota.noc.acceptContract('desk', 4711));
      console.log('  order:', (await modalText())?.slice(0, 500)); await mclick('order-ok');
      const j = await job(); console.log('  job', JSON.stringify({ sw: j.sw, targets: j.targets.map(t => t.pc) }));
      const sp = await K(() => window.__kota.noc.jobs[0].swPort); console.log('  swPort', JSON.stringify(sp));
      console.log('  hud:', await K(() => document.getElementById('noc-hud').innerText.replace(/\n+/g, ' | ')));
      await getTools(4);
      console.log('  hud after tools:', await K(() => document.getElementById('noc-hud').innerText.replace(/\n+/g, ' | ')));
      for (const t of j.targets) {
        await goPc(t.pc); await press('c');
        console.log('  phys:', (await modalText())?.slice(0, 260));
        await mclick('phys-install'); await mclick('phys-tone'); await shot('cab_phys_tone');
        console.log('  phys after:', (await modalText())?.slice(0, 260)); await close();
        console.log('  hud:', await K(() => document.getElementById('noc-hud').innerText.replace(/\n+/g, ' | ')));
        const rk = rackOfSw(j.sw); console.log('  rack:', (await goRack(rk))?.slice(0, 200));
        await mclick(`probe-${j.sw}`); const n = await sweep(j.sw); await shot('cab_probe');
        const truth = await K(n => window.__kota.panelOf(n), t.pc); console.log('  traced PP', n, 'truth', JSON.stringify(truth));
        await mclick(`pp-${j.sw}-${n}`); await mclick(`probe-${j.sw}`); await mclick(`pp-${j.sw}-${n}`);
        await mclick(`swp-${j.sw}-${sp[t.pc]}`); console.log('  ppinfo:', await K(() => [...document.querySelectorAll('.noc-modal .ppinfo')].map(x => x.textContent).join(' ')));
        await shot('cab_patched');
        const vl = j.envId === 'lab' ? 10 : 20;
        const out = await console_(j.sw, ['en', 'conf t', `int gi1/0/${sp[t.pc]}`, `switchport access vlan ${vl}`, `description ${t.pc.replace('PROP_', '').slice(0, 18)}`, 'no shut', 'end', 'wr', `sh int gi1/0/${sp[t.pc]}`]);
        console.log('  cli', out.slice(-300).replace(/\n+/g, ' / ')); await close();
        await goPc(t.pc); await press('c');
        await p.fill('.noc-modal input[name="phys-label-in"]', `L${truth.lv}-${String(n).padStart(2, '0')}`); await mclick('phys-label');
        console.log('  labelled:', (await modalText())?.slice(0, 200)); await close();
        console.log('  verify', await verify(t.pc, 'ipconfig /renew', 2600), '||', await verify(t.pc));
      }
      results.desk = await report('desk');
    }
    if (['patch', 'uplink', 'loop'].includes(ph)) {
      await close();
      await K(([f, v]) => { const R = Math.random; if (v) Math.random = () => (v === 'fiber' ? 0.1 : v === 'trunk' ? 0.9 : 0.5); window.__kota.noc.startShift(R, [f]); Math.random = R; window.__kota.noc.closeModal(); }, [ph, variant]);
      const T = await K(() => window.__kota.noc.jobs.map(j => ({ id: j.id, pcs: j.targets.map(t => t.pc.name), order: j.order, detail: j.detail })));
      console.log('  ticket', JSON.stringify(T));
      const t0 = T[0].pcs[0]; const pinfo = await K(n => window.__kota.panelOf(n), t0);
      const sw = pinfo.sw, rk = rackOfSw(sw);
      if (!(await K(() => window.__kota.noc.inv.toner && window.__kota.noc.inv.console && window.__kota.noc.inv.laptop))) await getTools(1);
      console.log('  symptom', await verify(t0, 'ping 8.8.8.8 -n 1', 1500));
      await goPc(t0); await press('c'); console.log('  phys:', (await modalText())?.slice(0, 240)); await mclick('phys-test'); console.log('  tester:', (await modalText())?.match(/Lampu[^|]*/)?.[0]);
      let label = await K(n => window.__kota.panelOf(n).label, t0);
      if (ph === 'patch' && !label) { await mclick('phys-tone'); }
      await close();
      const rackTxt = await goRack(rk); console.log('  rack:', rackTxt?.slice(0, 160)); await shot(`cab_rack_${ph}`);
      if (ph === 'patch') {
        let n = label ? +label.split('-')[1] : null;
        if (!n) { await mclick(`probe-${sw}`); n = await sweep(sw); await mclick(`probe-${sw}`); }
        await mclick(`pp-${sw}-${n}`); console.log('  ppinfo:', await K(() => document.querySelector('.noc-modal .ppinfo')?.textContent));
        await console_(sw, ['en', 'sh int status']);
        const out = await K(() => window.__lastCli ?? '');
        const m = new RegExp(`Gi1/0/(\\d+)\\s+${t0.replace('PROP_', '').slice(0, 18)}`).exec(out);
        console.log('  desc port', m?.[1]);
        await mclick(`pp-${sw}-${n}`); await mclick(`swp-${sw}-${m[1]}`); console.log('  ppinfo:', await K(() => document.querySelector('.noc-modal .ppinfo')?.textContent));
        await close();
      }
      if (ph === 'uplink') {
        const out = await console_(sw, ['en', 'sh int status', 'sh int trunk', 'sh int gi1/0/49']);
        console.log('  cli', out.slice(-700).replace(/\n+/g, ' / '));
        const lines = ['conf t', 'int gi1/0/49'];
        const row49 = out.split('\n').filter(l => l.startsWith('Gi1/0/49')).join(' ');
        const allowed = /Vlans allowed on trunk\nGi1\/0\/49\s+(\S+)/.exec(out)?.[1];
        console.log('  row49', row49, 'allowed', allowed);
        if (/administratively down/.test(out)) lines.push('no shut');
        if (allowed && allowed !== '1-4094' && !allowed.split(',').includes('20')) lines.push('switchport trunk allowed vlan add 20');
        if (/notconnect/.test(row49)) { await mclick(`uplink-reseat-${sw}`); console.log('  reseated fiber'); }
        lines.push('end', 'wr', 'sh int trunk');
        const o2 = await console_(sw, ['en', ...lines]); console.log('  cli fix', o2.slice(-400).replace(/\n+/g, ' / '));
        await close();
      }
      if (ph === 'loop') {
        const out = await console_(sw, ['en', 'sh int status']);
        console.log('  cli', out.slice(-400).replace(/\n+/g, ' / '), 'flap?', /MACFLAP/.test(out));
        const loop = await K(s => window.__kota.noc && (() => { const x = window.__kota.noc.jobs[0].detail; return /Gi1\/0\/(\d+)/.exec(x)[1]; })(), sw);
        await mclick(`swp-${sw}-${loop}`); console.log('  ppinfo:', await K(() => document.querySelector('.noc-modal .ppinfo')?.textContent)); await shot('cab_loop');
        await mclick('loop-remove'); await close();
      }
      for (const pc of T[0].pcs) console.log('  verify', pc, await verify(pc, 'ipconfig /renew', 2600), '||', await verify(pc));
      results[ph0] = await report(ph);
      await K(() => { if (window.__kota.noc.mode !== 'idle') window.__kota.noc['endWork'](); window.__kota.noc.closeModal(); });
    }
  } catch (e) { console.log(`!! ${ph} failed:`, e.message.slice(0, 400)); await shot(`cab_fail_${ph}`); await K(() => { const n = window.__kota.noc; for (const j of n.jobs) j.status = 'closed'; n.mode = 'idle'; n.jobs = []; n.closeModal(); }); }
}
console.log('\nSUMMARY', JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, (v ?? '').match(/Laporan kerja \S+ ([★☆]+)/)?.[1] ?? 'no-report']))));
console.log('errors', errs.length ? errs : 'none');
await Q.b.close();
