import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 120000 });
await p.waitForTimeout(1500);
const K = (f, a) => p.evaluate(f, a);
const shot = async n => { await p.screenshot({ path: `/workspace/work/shots/${n}.png` }); };
await K(() => localStorage.removeItem('kotaNusantara.noc.v1'));
await p.click('#enter').catch(() => {}); await p.waitForTimeout(500);
for (const re of ['Mulai hari', 'Siap']) await K(r => [...document.querySelectorAll('button')].filter(b => b.offsetParent && new RegExp(r).test(b.textContent)).map(b => b.click()).length, re);
await K(() => { window.__kota.pause(true); });
// start via T key -> board -> Mulai Shift button is the normal path; force faults for a deterministic test
await p.keyboard.press('t'); await p.waitForTimeout(200);
console.log('board open', await K(() => !!document.querySelector('.noc-modal')));
await shot('noc_board0');
await K(() => { window.__kota.noc.closeModal(); window.__kota.noc.startShift(Math.random, ['cable', 'port', 'dns', 'released']); });
await shot('noc_board1');
await K(() => window.__kota.noc.closeModal());
const T = await K(() => window.__kota.noc.tickets.map(t => ({ id: t.id, f: t.faults, pc: t.pc.name, x: t.pc.x + 200, z: t.pc.z + 150, lv: t.pc.level, healthy: window.__kota.noc.isHealthy(t) })));
console.log(JSON.stringify(T));
const go = async (x, z, lv) => { await K(([x, z, lv]) => { window.__kota.teleport(x, z, lv, 0); window.__kota.step(3); }, [x, z, lv]); };
const goPc = async (t) => { for (const [dx, dz] of [[0, .9], [0, -.9], [.9, 0], [-.9, 0], [0, .7], [0, -.7], [.6, .6], [-.6, -.6]]) { await go(t.x + dx, t.z + dz, t.lv); if (await K(() => window.__kota.nearPc()) === t.pc) return true; } console.log('NO NEAR', t.pc); return false; };
const openPc = async () => { await p.keyboard.press('f'); await p.waitForTimeout(300); if (!(await K(() => window.__kota.pcos.isOpen()))) { console.log('F did not open PC (door closer?) -> open directly'); await K(() => { const n = window.__kota.nearPc(); window.__kota.pcos.open(n, n); }); await p.waitForTimeout(300); } await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await K(() => document.querySelector('#pcos .di[title="Command Prompt"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(300); };
const cmd = async (c, wait = 600) => { await p.keyboard.type(c); await p.keyboard.press('Enter'); await p.waitForTimeout(wait); };
const closePc = async () => { await K(() => document.querySelector('#pcos .leave')?.click()); await K(() => window.__kota.step(2)); await p.waitForTimeout(200); };
const report = async (tag) => {
  await K(() => window.__kota.step(2)); await p.waitForTimeout(150);
  const q = await K(() => document.querySelector('.noc-modal h2')?.textContent);
  await shot('noc_report_' + tag);
  const right = await K(() => { const t = window.__kota.noc.tickets.find(t => t.status === 'closed' && !t.report); return t ? t.faults[0] : null; });
  const ok = await K((f) => { const want = { cable: 'Kabel UTP', port: 'Port switch', dns: 'Server DNS', released: 'Alamat DHCP' }[f]; const b = [...document.querySelectorAll('.noc-modal .opt')].find(b => b.textContent.startsWith(want)); b?.click(); return !!b; }, right);
  await p.waitForTimeout(100);
  const res = await K(() => document.querySelector('.noc-modal .noc-box')?.innerText.replace(/\n+/g, ' | '));
  console.log('report', tag, q, ok, res?.slice(0, 260));
  await shot('noc_result_' + tag);
  await K(() => document.querySelector('.noc-modal .btn.pri')?.click());
};
const state = () => K(() => window.__kota.noc.tickets.map(t => t.id + ':' + t.status).join(' '));

// 1 cable
let t = T[0]; await goPc(t);
console.log('hint', await K(() => window.__kota.state().hint));
await K(() => window.__kota.step(4)); await shot('noc_hud');
await p.keyboard.press('c'); await p.waitForTimeout(100); console.log('C@pc:', await K(() => window.__kota.state().toast));
await openPc(); await cmd('ping cari.id -n 1', 1500); await shot('noc_ping1'); await closePc();
console.log('after1', await state()); await report('cable');
// 2 port: C at pc tells it's the switch, then C at the rack
t = T[1]; await goPc(t);
await p.keyboard.press('c'); await p.waitForTimeout(100); console.log('C@pc2:', await K(() => window.__kota.state().toast));
const rack = await K(() => ({ x: window.__kota.noc.rack.x + 200, z: window.__kota.noc.rack.z + 150 }));
await go(rack.x, rack.z + 1.0, 1); console.log('hint rack', await K(() => window.__kota.state().hint));
await p.keyboard.press('c'); await p.waitForTimeout(100); console.log('C@rack:', await K(() => window.__kota.state().toast));
await goPc(t); await openPc(); await cmd('ping 8.8.8.8 -n 2', 2600); await closePc();
console.log('after2', await state()); await report('port');
// 3 dns: diagnose in CMD, fix DNS (dialog tested in qa_pcos; set adapter like the dialog does), verify in CMD
t = T[2]; await goPc(t); await openPc(); await cmd('ping 8.8.8.8 -n 1', 1600); await cmd('nslookup cari.id', 7000); await shot('noc_dns_diag');
console.log('before fix', await state());
await K((n) => { const a = window.__kota.pcos.adapter(n); a.dnsAuto = true; }, t.pc);
await cmd('ping cari.id -n 1', 2500); await closePc(); console.log('after3', await state()); await report('dns');
// 4 released: ipconfig /renew
t = T[3]; await goPc(t); await openPc(); await cmd('ipconfig', 300); await cmd('ipconfig /renew', 2500); await cmd('ping cari.id -n 1', 2500); await shot('noc_renew'); await closePc();
console.log('after4', await state()); await report('released');
await p.waitForTimeout(200); await shot('noc_end');
console.log('end', await K(() => ({ active: window.__kota.noc.active, xp: window.__kota.noc.xp, rank: window.__kota.noc.rank(), modal: document.querySelector('.noc-modal .msg')?.textContent })));
console.log('errors', errs.length ? errs : 'none');
await b.close();
