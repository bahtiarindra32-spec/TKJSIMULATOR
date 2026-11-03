import { boot } from './qa_lib.mjs';
const { b, p, errs, K, go, press } = await boot(null);
await K(() => { window.__kota.noc.startShift(Math.random, ['cable']); window.__kota.noc.closeModal(); });
await go(227.2, 175.2, 1, 0); await K(() => window.__kota.step(2, 1/30, false));
console.log(await K(() => [window.__kota.prompt(), window.__kota.noc.isModalOpen?.(), document.activeElement?.tagName + '#' + document.activeElement?.id, document.body.className]));
await K(() => window.__kota.menu.resume()); console.log(await K(() => window.__kota.why())); await press('KeyF'); console.log('toast', await K(() => document.getElementById('toast').textContent));
console.log(errs); await b.close();
