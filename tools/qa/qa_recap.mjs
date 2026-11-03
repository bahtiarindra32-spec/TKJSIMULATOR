// Class recap: two students finish (one early), copy their result codes, the teacher pastes them at the teacher desk.
import { boot } from './qa_lib.mjs';
const Q = await boot({ v: 1, xp: 1234, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } });
const { p, K, go, press, mclick, modalText, errs } = Q; const out = {};
const spot = async k => { const s = await K(k => window.__kota.labSpots()[k], k); for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) { await go(s[0] + dx, s[1] + dz, 1); if (/\[F\]/.test(await K(() => window.__kota.state().hint))) return true; } return false; };
try {
  const codes = [];
  for (const [nm, full] of [['Andi Saputra', true], ['Bella Kusuma', false]]) {
    await K(([nm, full]) => { const P = window.__kota.praktik; P.start({ steps: ['vlsm'], minutes: 30, perStudent: true, seed: 5 }, 'A1B2C3', nm); if (full) { const st = P.state(); void st; } }, [nm, full]);
    if (full) { // answer the VLSM table through the page fields
      const vl = await K(() => window.__kota.praktik.state().P.vl);
      const ip2n = s => s.split('.').reduce((a, o) => a * 256 + +o, 0), n2ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
      const pf = h => { let q = 30; while (2 ** (32 - q) - 2 < h) q--; return q; };
      let at = ip2n(vl.block.split('/')[0]); const ord = vl.needs.map((n, i) => ({ i, q: pf(n.hosts) })).sort((a, b) => a.q - b.q || a.i - b.i); const k = [];
      for (const x of ord) { k[x.i] = [n2ip(at), x.q, n2ip(at + 1), n2ip(at + 2 ** (32 - x.q) - 1)]; at += 2 ** (32 - x.q); }
      for (let i = 0; i < k.length; i++) for (const [j, f] of ['net', 'prefix', 'gw', 'bc'].entries()) await p.fill(`.jobsheet input[name=vlsm-${i}-${f}]`, String(k[i][j]));
      await K(() => document.activeElement?.blur());
      await K(() => { const P = window.__kota.praktik; P.tick(); P.paraf(); });
    } else await K(() => window.__kota.praktik.finish(true));
    await p.waitForTimeout(300);
    const c = await K(() => document.querySelector('.noc-modal .lab-rcode code')?.textContent); console.log('  code', nm, c?.slice(0, 60), c?.length); codes.push(c);
    await mclick('lab-done');
  }
  console.log('  guru', await spot('guru')); await press('f'); await mclick('lab-recap');
  await p.fill('.noc-modal textarea[name=lab-paste]', `[07.58] Andi: ${codes[0]}\n[08.02] Bella: pak ini ${codes[1]}\n[08.03] Doni: KN1.A1B2C3.rusak.abcdef`);
  await mclick('lab-recap-make'); await p.waitForTimeout(200);
  const txt = await modalText(); console.log('  recap', txt?.slice(0, 500));
  await p.screenshot({ path: '/workspace/work/shots/recap.png' });
  const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null); await mclick('lab-recap-csv'); const d = await dl; console.log('  download', d?.suggestedFilename());
  out.recap = /2 siswa/.test(txt) && /1 kode rusak/.test(txt) && /Andi Saputra/.test(txt) && /Bella Kusuma/.test(txt) && /Sangat Kompeten/.test(txt) && /Belum Kompeten/.test(txt) && !!d ? 'OK' : 'FAIL';
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out.recap = 'ERR'; }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
