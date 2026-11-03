// Lab Praktik: VLSM table → router-on-a-stick → ACL, with real input (jobsheet fields, consoles, IPv4 dialogs, cmd, browser).
import { boot } from './qa_lib.mjs';
const Q = await boot({ v: 1, xp: 1234, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } });
const { p, K, step, go, press, openPc, openCmd, cmd, closePc, closeWins, browser, ipv4, modalText, mclick, errs } = Q;
const out = {}; const ph = process.argv[2] ?? 'iv';
const S = () => K(() => window.__kota.praktik.state());
const spot = async k => { const s = await K(k => window.__kota.labSpots()[k], k); for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.5, 0.5]]) { await go(s[0] + dx, s[1] + dz, 1); const hint = await K(() => window.__kota.state().hint); if (/\[F\]/.test(hint)) return hint; } return 'no hint'; };
const goPcL = async name => { const c = await K(n => window.__kota.pcs().find(c => c.name === n), name); for (const [dx, dz] of [[0, .9], [0, -.9], [.9, 0], [-.9, 0], [0, .7], [0, -.7]]) { await go(c.x + dx, c.z + dz, 1); if (await K(() => window.__kota.nearPc()) === name) return true; } return false; };
const pcDo = async (pc, fn) => { await goPcL(pc); await openPc(pc); await fn(); await closeWins(); await closePc(); await step(3); };
const tick = async () => { for (let k = 0; k < 12; k++) { const r = await K(() => { const p = window.__kota.praktik; p.tick(); const st = p.state(); if (st?.ready) { p.paraf(); return 1; } return st ? 0 : 1; }); if (r) return; await new Promise(z => setTimeout(z, 300)); } };
const ip2n = s => s.split('.').reduce((a, o) => a * 256 + +o, 0), n2ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const pf = h => { let q = 30; while (2 ** (32 - q) - 2 < h) q--; return q; };
const key = vl => { let at = ip2n(vl.block.split('/')[0]); const ord = vl.needs.map((n, i) => ({ i, q: pf(n.hosts) })).sort((a, b) => a.q - b.q || a.i - b.i); const o = []; for (const x of ord) { o[x.i] = { net: n2ip(at), prefix: x.q, gw: n2ip(at + 1), bc: n2ip(at + 2 ** (32 - x.q) - 1) }; at += 2 ** (32 - x.q); } return o; };
const mask = q => n2ip((0xffffffff << (32 - q)) >>> 0), wild = q => n2ip(2 ** (32 - q) - 1);
const consoleType = async lines => { for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(60); } };
const termOut = () => K(() => document.querySelector('.noc-modal .swout')?.textContent.slice(-400).replace(/\n+/g, ' / '));
try {
  console.log('  guru', await spot('guru')); await press('f'); await mclick('lab-teacher');
  await K(w => { window.__qaWant = w; }, ph === 'acl' ? ['acl'] : ['vlsm', 'intervlan', 'acl']);
  await K(() => { const want = window.__qaWant; document.querySelectorAll('.noc-modal input[type=checkbox][name^=lab-]').forEach(c => { const on = want.includes(c.name.slice(4)); if (c.checked !== on) { c.checked = on; c.dispatchEvent(new Event('change')); } }); });
  const code = await K(() => document.querySelector('.noc-modal .lab-code b')?.dataset.code); console.log('  code', code); out.code7 = code?.length === 7;
  await mclick('lab-try'); await p.fill('.noc-modal input[name=lab-name]', 'Rizky XI TKJ 2'); await mclick('lab-start');
  let s = await S(); const pc = s.pc; console.log('  start', s.step, 'desk', s.desk, 'guru', s.P.guru, JSON.stringify(s.P.vl));
  // 1 VLSM: type into the jobsheet table
  const K1 = key(s.P.vl);
  if (ph !== 'acl') {
  for (let i = 0; i < K1.length; i++) for (const f of ['net', 'prefix', 'gw', 'bc']) { await p.click(`.jobsheet input[name=vlsm-${i}-${f}]`); await p.keyboard.type(String(K1[i][f])); }
  await p.screenshot({ path: '/workspace/work/shots/iv_vlsm.png' });
  await p.keyboard.press('Tab'); await K(() => document.activeElement?.blur());
  s = await S(); console.log('  vlsm', s.checks.map(c => +c.ok).join('')); await tick();
  s = await S(); console.log('  step', s.step);
  // 2 inter-VLAN
  const G = K1[0], Si = K1[1], gIp = n2ip(ip2n(G.net) + 10), sIp = n2ip(ip2n(Si.net) + 10);
  const guruPc = await K(d => window.__kota.pcs().filter(c => /^PROP_LAB_PC_/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name))[d - 1].name, s.P.guru);
  console.log('  tools', await spot('tools')); await press('f'); await mclick('take-console'); await mclick('take-laptop'); await press('Escape');
  console.log('  rack', await spot('rack')); await press('f');
  await K(() => [...document.querySelectorAll('.noc-modal button')].find(b => b.name === 'console-SW-LAB')?.click()); await p.waitForTimeout(200);
  await consoleType(['', 'enable', 'conf t', 'vlan 10', 'name GURU', 'vlan 20', 'name SISWA', 'exit', `interface gi1/0/${s.desk}`, 'switchport mode access', 'switchport access vlan 20', `interface gi1/0/${s.P.guru}`, 'switchport access vlan 10', 'interface gi1/0/24', 'switchport mode trunk', 'switchport trunk native vlan 70', 'end', 'write memory', 'show interfaces trunk']);
  console.log('  sw', await termOut());
  await mclick('console-close'); await p.waitForTimeout(150);
  await mclick('console-R-LAB'); await p.waitForTimeout(200);
  await consoleType(['', 'enable', 'conf t', 'interface g0/0.10', 'encapsulation dot1Q 10', `ip address ${G.gw} ${mask(G.prefix)}`, 'interface g0/0.20', 'encapsulation dot1Q 20', `ip address ${Si.gw} ${mask(Si.prefix)}`, 'end', 'write memory', 'show ip interface brief']);
  console.log('  r', await termOut()); await p.screenshot({ path: '/workspace/work/shots/iv_router.png' });
  await K(() => { window.__kota.noc.closeModal(); if (window.__kota.menu.paused()) window.__kota.menu.resume(); }); await step(2);
  await pcDo(guruPc, async () => { await ipv4({ ip: gIp, mask: mask(G.prefix), gw: G.gw, dns: G.gw }); });
  await pcDo(pc, async () => { await ipv4({ ip: sIp, mask: mask(Si.prefix), gw: Si.gw, dns: Si.gw }); await openCmd(); await cmd(`ping ${gIp}`, 4500); });
  s = await S(); console.log('  iv', s.checks.map(c => `${+c.ok}${c.label.slice(0, 22)}`).join(' | ')); await tick(); s = await S(); console.log('  step', s?.step);
  out.iv = s?.step === 'acl' ? 'OK' : 'FAIL';
  } else { const G = K1[0], Si = K1[1]; void G; void Si; console.log('  tools', await spot('tools')); await press('f'); await mclick('take-console'); await mclick('take-laptop'); await press('Escape'); }
  if (ph === 'acl') {
  const G = K1[0], Si = K1[1], gIp = n2ip(ip2n(G.net) + 10);
  // 3 ACL
  console.log('  rack', await spot('rack')); await press('f'); await mclick('console-R-LAB'); await p.waitForTimeout(200);
  await consoleType(['', 'enable', 'conf t', `access-list 110 deny ip ${Si.net} ${wild(Si.prefix)} ${G.net} ${wild(G.prefix)}`, 'access-list 110 permit ip any any', 'interface g0/0.20', 'ip access-group 110 in', 'end', 'write memory', 'show access-lists']);
  console.log('  acl', await termOut()); await K(() => { window.__kota.noc.closeModal(); if (window.__kota.menu.paused()) window.__kota.menu.resume(); }); await step(2);
  await pcDo(pc, async () => { await browser('http://192.168.70.10', 800); await closeWins(); await openCmd(); await cmd(`ping ${gIp}`, 9000); });
  await spot('tools'); await press('f'); for (const t of ['console', 'laptop']) if (await K(t => window.__kota.noc.inv[t], t)) await mclick(`take-${t}`); await press('Escape');
  s = await S(); console.log('  acl', s?.checks.map(c => `${+c.ok}${c.label.slice(0, 22)}`).join(' | ')); await tick(); await step(2);
  const res = await modalText(); console.log('  result', res?.slice(0, 400));
  out.run = /Sangat Kompeten/.test(res ?? '') ? 'OK' : 'FAIL';
  }
} catch (e) { console.log('  !!', e.message.slice(0, 300)); out.run = 'ERR'; await p.screenshot({ path: '/workspace/work/shots/iv_err.png' }).catch(() => {}); }
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
process.exit(0);
