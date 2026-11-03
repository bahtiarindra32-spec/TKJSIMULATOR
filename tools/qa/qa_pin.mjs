// Teacher PIN for paraf + K3 tools check: teacher types a PIN → 8-char code; student finishes a step; paraf refuses
// while a borrowed tool is not back, refuses a wrong PIN, accepts the right one.
import { boot } from './qa_lib.mjs';
const Q = await boot({ v: 1, xp: 1234, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } });
const { p, K, go, press, mclick, modalText, errs } = Q; const out = {};
const spot = async k => { const s = await K(k => window.__kota.labSpots()[k], k); for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) { await go(s[0] + dx, s[1] + dz, 1); if (/\[F\]/.test(await K(() => window.__kota.state().hint))) return true; } return false; };
const toast = () => K(() => document.getElementById('toast')?.textContent ?? '');
try {
  await spot('guru'); await press('f'); await mclick('lab-teacher');
  await K(() => { document.querySelectorAll('.noc-modal input[type=checkbox][name^=lab-]').forEach(c => { const on = c.name === 'lab-vlsm'; if (c.checked !== on) { c.checked = on; c.dispatchEvent(new Event('change')); } }); });
  await p.click('.noc-modal input[name=lab-pin]'); await p.keyboard.type('4821');
  const code = await K(() => document.querySelector('.noc-modal .lab-code b')?.dataset.code); console.log('  code', code); out.code8 = code?.length === 8;
  await mclick('lab-try'); await p.fill('.noc-modal input[name=lab-name]', 'Dimas'); await mclick('lab-start');
  const vl = await K(() => window.__kota.praktik.state().P.vl);
  const ip2n = s => s.split('.').reduce((a, o) => a * 256 + +o, 0), n2ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const pf = h => { let q = 30; while (2 ** (32 - q) - 2 < h) q--; return q; };
  let at = ip2n(vl.block.split('/')[0]); const ord = vl.needs.map((n, i) => ({ i, q: pf(n.hosts) })).sort((a, b) => a.q - b.q || a.i - b.i); const k = [];
  for (const x of ord) { k[x.i] = [n2ip(at), x.q, n2ip(at + 1), n2ip(at + 2 ** (32 - x.q) - 1)]; at += 2 ** (32 - x.q); }
  for (let i = 0; i < k.length; i++) for (const [j, f] of ['net', 'prefix', 'gw', 'bc'].entries()) await p.fill(`.jobsheet input[name=vlsm-${i}-${f}]`, String(k[i][j]));
  await K(() => document.activeElement?.blur());
  // borrow a tester, so the K3 checkpoint is open
  await spot('tools'); await press('f'); await mclick('take-tester'); await press('Escape');
  await K(() => window.__kota.praktik.tick());
  const st = await K(() => window.__kota.praktik.state()); console.log('  checks', st.checks.map(c => `${+c.ok}${c.label.slice(0, 26)}`).join(' | ')); out.k3open = st.checks.at(-1).label.startsWith('K3') && !st.checks.at(-1).ok && !st.ready;
  await spot('tools'); await press('f'); await mclick('take-tester'); await press('Escape'); await K(() => window.__kota.praktik.tick());
  await spot('guru'); await press('f');
  await p.fill('.noc-modal input[name=lab-paraf-pin]', '1234'); await mclick('lab-paraf'); await p.waitForTimeout(200); const t1 = await toast(); console.log('  wrong pin', t1);
  await p.fill('.noc-modal input[name=lab-paraf-pin]', '4821'); await mclick('lab-paraf'); await p.waitForTimeout(400);
  const res = await modalText(); console.log('  result', res?.slice(0, 260));
  out.pin = /PIN guru salah/.test(t1) && /Sangat Kompeten/.test(res ?? '') && /K3/.test(res ?? '') === false ? 'OK' : (/Sangat Kompeten/.test(res ?? '') && /PIN guru salah/.test(t1) ? 'OK' : 'FAIL');
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out.pin = 'ERR'; }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
