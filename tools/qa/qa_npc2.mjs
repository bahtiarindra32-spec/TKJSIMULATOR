import { boot } from './qa_lib.mjs';
const { b, p, errs, K, go, press: press0 } = await boot(null);
const press = async k => { await K(() => { if (window.__kota.menu.paused()) window.__kota.menu.resume(); }); await press0(k); };
const toast = () => K(() => document.getElementById('toast').textContent);
const prompt = () => K(() => window.__kota.prompt());
const npcs = () => K(() => window.__kota.npcs());
const pos = () => K(() => { const q = window.__kota.state ? null : null; return null; });
const out = {};
// 1) collision with satpam
await go(227.3, 175.6, 1, Math.PI); await K(() => window.__kota.step(2, 1/30, false));
const sat = (await npcs()).find(n => n.role === 'satpam');
await go(sat.x, sat.z + 1.6, 1, 0);
for (let i = 0; i < 4; i++) { await p.keyboard.down('KeyW'); await K(() => window.__kota.step(15, 1/30, false)); await p.keyboard.up('KeyW'); }
const me = await K(() => { const s = window.__kota.state(); return { x: s.x, z: s.z }; }).catch(() => null);
out.satpamGap = me ? +Math.hypot(me.x - sat.x, me.z - sat.z).toFixed(2) : 'nohook';
// 2) job dialog
await K(() => { window.__kota.noc.startShift(Math.random, ['cable']); window.__kota.noc.closeModal(); });
const job = await K(() => { const j = window.__kota.noc.jobs.find(x => x.status !== 'closed'); return { title: j.title, pcs: j.targets.map(t => ({ n: t.pc.name, l: t.pc.level })) }; });
out.job = job;
const rec = (await npcs()).filter(n => n.role === 'resepsionis').sort((a, b) => b.x - a.x)[0];
await go(rec.x + 0.2, rec.z - 2.3, 1, 0); await K(() => window.__kota.step(2, 1/30, false));
out.recPrompt = await prompt(); out.recState = await K(() => window.__kota.state()); out.rec = rec; out.blk = await K(() => [...document.querySelectorAll('.modal.show,.open,[open]')].map(e => e.id || e.className).slice(0,5)); await press('KeyF'); out.recTalk = await toast();
const lv = job.pcs[0].l, pcn = job.pcs[0].n;
const pc = await K(n => window.__kota.pcs().find(c => c.name === n), pcn);
await go(pc.x, pc.z, lv, 0); await K(() => window.__kota.step(3, 1/30, false));
const atPc = (await npcs()).find(n => n.pc === pcn);
out.targetHasNpc = !!atPc;
const w = atPc ?? (await npcs()).filter(n => n.level === lv && n.role === 'karyawan')[0];
if (w) { for (const [dx, dz] of [[0, 1.3], [0, -1.3], [1.3, 0], [-1.3, 0]]) { await go(w.x + dx, w.z + dz, lv, 0); await K(() => window.__kota.step(2, 1/30, false)); if (/Ngobrol/.test(await prompt())) break; }
  out.wPrompt = await prompt(); await press('KeyF'); out.wTalk1 = await toast(); await K(() => window.__kota.step(30, 1/30, false)); await press('KeyF'); out.wTalk2 = await toast(); }
// 3) corridors L4-L8
for (const L of [4, 6, 8]) { await go(rec.x, rec.z + 2, L, 0); await K(() => window.__kota.step(3, 1/30, false)); out['L' + L] = (await npcs()).filter(n => n.level === L).length; }
await go(204, 161, 6, Math.PI / 2); await K(() => window.__kota.step(5, 1/30, false)); await p.screenshot({ path: '/workspace/work/npc_L6.png' });
console.log('RESULT', JSON.stringify(out, null, 1), 'errors', JSON.stringify(errs)); await b.close();
