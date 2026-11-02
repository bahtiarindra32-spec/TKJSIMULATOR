import { boot } from './qa_lib.mjs';
const Q = await boot(null, { viewport: { width: 1280, height: 720 } }); const { p, K, openPc, errs } = Q;
const pc = await K(() => { const n = window.__kota.noc; n.acceptContract('tutor', 1); n.closeModal?.(); return n.jobs[0].targets[0].pc.name; });
await openPc(pc); await p.waitForTimeout(1500);
const r = await K(() => ({ obj: document.querySelector('#pcos .pc-obj')?.textContent, hidden: document.querySelector('#pcos .pc-obj')?.hidden, clk: document.querySelector('#pcos .clk')?.innerText, world: window.__kota.daynight.get().clock }));
await p.screenshot({ path: '/workspace/work/shots/pc_obj.png' });
console.log('RESULT', JSON.stringify(r), errs); await Q.b.close();
