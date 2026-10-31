import { boot } from './qa_lib.mjs';
const { b, p, errs, K, go, press } = await boot(null);
const toast = () => K(() => document.getElementById('toast').textContent);
const prompt = () => K(() => window.__kota.prompt());
let ok = true;
// resepsionis: berdiri di depan meja (lokal 8, 6.6 ada tamu) -> sisi lokal 7.2, 6.9
await go(227.3, 175.6, 1, Math.PI); await K(() => window.__kota.step(3, 1/30, false));
console.log('reception prompt:', await prompt()); await press('KeyF'); const t1 = await toast(); console.log('talk1:', t1); await press('KeyF'); console.log('talk2:', await toast());
ok &&= /Ngobrol/.test(await prompt()) || /Resepsionis|Tamu|Satpam/.test(t1);
// karyawan duduk di PC L2: cari PC L2 yang ada NPC, berdiri di belakang kursinya
const pcs = await K(() => window.__kota.pcs().filter(c => /^PROP_L2_PC_/.test(c.name)));
let talked = false;
for (const c of pcs.slice(0, 12)) {
  for (const [dx, dz] of [[0, 1.5], [0, -1.5]]) {
    await go(c.x + dx, c.z + dz, 2, dz > 0 ? 0 : Math.PI); await K(() => window.__kota.step(2, 1/30, false));
    const pr = await prompt(); if (!/Ngobrol/.test(pr)) continue;
    await press('KeyF'); console.log('pc', c.name, '->', await toast());
    await K(() => window.__kota.step(4, 1/30, false)); console.log('  after prompt:', await prompt()); talked = true; break;
  }
  if (talked) break;
}
console.log('RESULT', JSON.stringify({ reception: ok, worker: talked }), 'errors', JSON.stringify(errs)); await b.close();
