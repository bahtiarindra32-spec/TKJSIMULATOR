import { boot } from './qa_lib.mjs';
const Q = await boot(null); const { p, K, step, go } = Q; const HO = [220, 168];
await go(HO[0] + 21, HO[1] + 10.8, 1, Math.PI); await step(2);
await K(() => window.__kota.setThird(true));
await p.keyboard.press('e'); await step(2); console.log('after e', JSON.stringify(await K(() => ({ lp: document.getElementById('liftpanel').className, st: window.__kota.state(), v: window.__kota.vertical() }))));
await p.keyboard.press('3'); await step(2); console.log('after 3', JSON.stringify(await K(() => window.__kota.vertical())));
for (let i = 0; i < 10; i++) { await K(() => window.__kota.step(6, 1 / 30, false)); console.log(JSON.stringify((await K(() => window.__kota.vertical())).ride?.phase)); }
await p.context().browser().close();
