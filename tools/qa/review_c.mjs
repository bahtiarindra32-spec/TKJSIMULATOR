// Review C: after the tutorial, open the work board with T, take "Pasang IP Statis", do it with the real IPv4 dialog, sign the berita acara.
import { boot } from './qa_lib.mjs';
process.env.DOC = '1';
const save = {"v":1,"xp":78,"shifts":0,"closed":1,"slaMet":1,"seq":1,"contracts":1,"stars":3,"days":0,"streak":0,"best":0,"day":null,"seen":["tutor"],"mastery":{"tutor":{"ok":1,"miss":0}},"cert":0,"rj45":10,"rj45Used":0};
const Q = await boot(save, { viewport: { width: 1280, height: 720 } });
const { p, K, step, go, goPc, press, openPc, openCmd, cmd, cmdText, closePc, closeWins, ipv4, modalText, mclick, job, errs } = Q;
const SH = '/workspace/work/review/shots';
const shot = async n => { await K(() => window.__kota.step(1)); await p.screenshot({ path: `${SH}/${n}.png` }); console.log('  shot', n); };
await go(247.4, 175, 1); await step(2);
await press('t'); await step(2);
console.log('board:', (await modalText())?.slice(0, 1400));
await shot('c01_board');
await K(() => { const b = document.querySelector('.noc-modal .noc-box'); b.scrollTop = b.scrollHeight; }); await shot('c02_board_bottom');
const idx = await K(() => { const bs = [...document.querySelectorAll('.noc-modal button[name^=offer-]')]; const card = b => { let e = b; while (e.parentElement && e.parentElement.querySelectorAll('button[name^=offer-]').length === 1) e = e.parentElement; return e; }; const b = bs.find(b => /IP Statis/.test(card(b).innerText)); return b?.name ?? null; });
console.log('take', idx); if (idx) await mclick(idx); else { await K(() => { window.__kota.noc.closeModal(); window.__kota.noc.acceptContract('static', 4242); }); } await step(2);
console.log('brief:', (await modalText())?.slice(0, 600)); await shot('c03a_brief'); await mclick('brief-ok'); await step(1);
console.log('order:', (await modalText())?.slice(0, 900)); await shot('c03_order');
await mclick('order-ok'); await step(3);
const j = await job(); console.log('job', JSON.stringify(j).slice(0, 700));
await shot('c04_hud_job');
// route: from workshop L1 to stairs/lift; how far is the target?
const st = await K(() => window.__kota.state()); const lp = await K(() => window.__kota.liftPos());
const pcs = await K(() => window.__kota.pcs()); const t0 = pcs.find(c => c.name === j.targets[0].pc);
console.log('player', st.x, st.z, 'lift', JSON.stringify(lp), 'target0', t0.name, t0.x.toFixed(1), t0.z.toFixed(1));
// lift panel at L1

for (const t of j.targets) {
  await goPc(t.pc); await openPc(t.pc);
  const v = await ipv4({ ip: t.ip, mask: t.mask, gw: t.gw, dns: t.dns }); console.log('  ipv4', t.pc, v);
  await openCmd(); await cmd(`ping ${t.gw} -n 1`, 1800); await cmd('ping cari.id -n 1', 1800); if (t === j.targets[0]) await shot('c06_static_ping');
  await closeWins(); await closePc(); await step(3);
}
for (let i = 0; i < 5; i++) { await step(3); await p.waitForTimeout(100); }
console.log('toast', await K(() => window.__kota.state().toast));
console.log('hud', await K(() => document.querySelector('#noc-hud')?.innerText.replace(/\n+/g, ' | ')));
await shot('c07_docready');
await K(() => window.__kota.noc.openOrder(window.__kota.noc.jobs.find(x => x.status === 'open')));
await step(1); console.log('order w/ BA:', (await modalText())?.slice(0, 900)); await shot('c08_berita');
await p.fill('.noc-modal textarea[name=ba-note]', 'ok').catch(() => {}); await mclick('ba-sign').catch(()=>{}); console.log('short note ->', (await modalText())?.slice(-200));
await p.fill('.noc-modal textarea[name=ba-note]', 'Dua PC kantor diberi IP statis sesuai surat kerja, gateway 192.168.20.1, ping gateway berhasil dari kedua PC.').catch(() => {}); await mclick('ba-sign');
for (let i = 0; i < 6; i++) { await step(3); await p.waitForTimeout(100); if (await K(() => /Laporan kerja/.test(document.querySelector('.noc-modal h2')?.textContent ?? ''))) break; }
console.log('report:', (await modalText())?.slice(0, 900)); await shot('c09_report');
console.log('errors', JSON.stringify(errs.filter(e => !/GPU stall/.test(e)).slice(0, 10)));
await Q.b.close();
