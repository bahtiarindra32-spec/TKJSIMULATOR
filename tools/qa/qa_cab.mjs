// Cabinet: items the running job needs are on top with a badge; "Ambil yang diperlukan" takes them in one click.
import { boot } from './qa_lib.mjs';
const Q = await boot({ v: 1, xp: 3000, cert: 2, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } });
const { p, K, press, mclick, goAnchor, errs } = Q; const out = {};
try {
  await K(() => { window.__kota.noc.acceptContract('vlan', 4242); window.__kota.noc.closeModal(); });
  console.log('  anchor', await goAnchor('CABINET')); await press('f'); console.log('  modal', (await Q.modalText())?.slice(0, 120), await K(() => { try { window.__kota.noc.openCabinet(false); return 'opened'; } catch (e) { return 'ERR ' + e.message; } }));
  const before = await K(() => ({ first: [...document.querySelectorAll('.noc-modal .inv-row')].slice(0, 3).map(r => r.textContent.slice(0, 40)), badges: document.querySelectorAll('.noc-modal .inv-row .badge').length }));
  console.log('  before', JSON.stringify(before));
  await p.screenshot({ path: '/workspace/work/shots/cabinet.png' });
  await mclick('take-needed');
  const inv = await K(() => ({ ...window.__kota.noc.inv })); console.log('  inv', JSON.stringify(inv));
  out.cab = before.badges >= 1 && /Diperlukan/.test(before.first[0]) && inv.console && inv.laptop ? 'OK' : 'FAIL';
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out.cab = 'ERR'; }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
