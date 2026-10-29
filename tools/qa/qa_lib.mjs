// Shared QA helpers: real keyboard/mouse input on the single-file build.
import { chromium } from 'playwright';
export async function boot(save) {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 300))); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit', timeout: 60000 });
  await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 120000 });
  await p.evaluate(s => { if (s) localStorage.setItem('kotaNusantara.noc.v1', JSON.stringify(s)); else localStorage.removeItem('kotaNusantara.noc.v1'); }, save ?? null);
  await p.reload({ waitUntil: 'commit' });
  await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 120000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__kota.pause(true)); await p.evaluate(() => document.getElementById('enter').click()); await p.waitForTimeout(200);
  if ((await p.evaluate(() => window.__kota.state().mode)) !== 'walk') await p.evaluate(() => document.getElementById('enter').click());
  await p.evaluate(() => window.__kota.pause(true));
  const K = (f, a) => p.evaluate(f, a);
  const shot = async n => { await p.screenshot({ path: `/workspace/work/shots/${n}.png` }); };
  const step = (n = 3) => K(n => window.__kota.step(n), n);
  const go = async (x, z, lv, yaw = 0) => { await K(([x, z, lv, yaw]) => { window.__kota.teleport(x, z, lv, yaw); window.__kota.step(3); }, [x, z, lv, yaw]); };
  const pcInfo = name => K(n => { const c = window.__kota.pcs().find(c => c.name === n); return c; }, name);
  const goPc = async name => {
    const c = await pcInfo(name); const lv = +(/_L(\d)_/.exec(name)[1]);
    for (const [dx, dz] of [[0, .9], [0, -.9], [.9, 0], [-.9, 0], [0, .7], [0, -.7], [.6, .6], [-.6, -.6], [.6, -.6], [-.6, .6]]) { await go(c.x + dx, c.z + dz, lv); if (await K(() => window.__kota.nearPc()) === name) return true; }
    console.log('!! could not stand at', name); return false;
  };
  const goAnchor = async (which) => { const a = await K(w => { const n = window.__kota.noc[w]; return { x: n.x + 200, z: n.z + 150 }; }, which); for (const [dx, dz] of [[0, 1.0], [0, -1.0], [1.0, 0], [-1.0, 0], [0, .6], [.6, 0]]) { await go(a.x + dx, a.z + dz, 1); const h = await K(() => document.getElementById('hudHint')?.textContent ?? ''); if (/Lemari|Rak switch/.test(h)) return h; } return K(() => document.getElementById('hudHint')?.textContent); };
  const press = async k => { await p.keyboard.press(k); await p.waitForTimeout(120); await step(1); };
  const openPc = async (name) => {
    await press('f'); await p.waitForTimeout(80);
    for (let i = 0; i < 12 && !(await K(() => window.__kota.pcos.isOpen())); i++) await step(3);   // sit-down animation
    if (!(await K(() => window.__kota.pcos.isOpen()))) { console.log('  F did not open the PC (door/anchor closer) -> direct'); await K(n => window.__kota.pcos.open(n, n), name); }
    await K(() => document.querySelector('#pcos .lock button')?.click());
    await p.waitForTimeout(200);
  };
  const dbl = sel => K(s => document.querySelector(s).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), sel);
  const openCmd = async () => { await dbl('#pcos .di[title="Command Prompt"]'); await p.waitForTimeout(250); await p.click('#pcos .cmd').catch(() => {}); };
  const cmd = async (c, wait = 700) => { await p.keyboard.type(c); await p.keyboard.press('Enter'); await p.waitForTimeout(wait); };
  const cmdText = () => K(() => document.querySelector('#pcos .cmd')?.innerText.slice(-900));
  const closeWins = () => K(() => { [...document.querySelectorAll('#pcos .win')].forEach(w => w.querySelector('.cb.x')?.click()); });
  const closePc = async () => { await K(() => document.querySelector('#pcos .leave')?.click()); await step(2); for (let i = 0; i < 10 && (await K(() => window.__kota.seat())); i++) await step(3); await p.waitForTimeout(100); };
  /** Network Connections -> Properties -> IPv4 with real typing. cfg: null = DHCP + auto DNS; or {ip,mask,gw,dns} ; dnsOnly: {dns} keeps DHCP address */
  const ipv4 = async (cfg) => {
    await dbl('#pcos .di[title="Network Connections"]'); await p.waitForTimeout(200);
    await K(() => document.querySelector('#pcos .adp').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 300 }))); await p.waitForTimeout(120);
    await K(() => [...document.querySelectorAll('#pcos .ctx div')].find(d => d.textContent === 'Properties').click()); await p.waitForTimeout(150);
    await K(() => [...document.querySelectorAll('#pcos .list div')].find(d => d.textContent.includes('TCP/IPv4')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(200);
    const radio = (n, i) => K(([n, i]) => { const r = [...document.querySelectorAll(`#pcos input[name=${n}]`)][i]; r.checked = true; r.dispatchEvent(new Event('change')); }, [n, i]);
    const fillField = async (k, v) => { const ins = await p.$$('#pcos .ipf input'); const o = v ? v.split('.') : ['', '', '', '']; for (let i = 0; i < 4; i++) await ins[k * 4 + i].fill(o[i]); };
    if (!cfg) { await radio('ipm', 0); await radio('dnm', 0); }
    else if (cfg.dnsOnly) { await radio('ipm', 0); await radio('dnm', 1); await fillField(3, cfg.dns); await fillField(4, ''); }
    else { await radio('ipm', 1); await fillField(0, cfg.ip); await fillField(1, cfg.mask); await fillField(2, cfg.gw); await radio('dnm', 1); await fillField(3, cfg.dns); await fillField(4, ''); }
    const vals = await K(() => [...document.querySelectorAll('#pcos .ipf')].map(f => [...f.querySelectorAll('input')].map(i => i.value).join('.')).join(' | '));
    await K(() => [...document.querySelectorAll('#pcos .btn')].find(b => b.textContent === 'OK' && b.closest('.win').querySelector('.tt').textContent.startsWith('Internet Protocol')).click());
    await p.waitForTimeout(250);
    // a "gateway not on same segment" or other message box: answer Yes/OK
    await K(() => { const b = [...document.querySelectorAll('#pcos .btn')].find(b => /^(Yes|OK)$/.test(b.textContent) && b.closest('.win')?.querySelector('.tt')?.textContent.includes('TCP/IP')); b?.click(); });
    await p.waitForTimeout(150);
    await K(() => { const w = [...document.querySelectorAll('#pcos .win')].find(w => w.querySelector('.tt').textContent.includes('Properties')); w?.querySelector('.btn')?.click(); });
    await closeWins();
    return vals;
  };
  const browser = async (url, wait = 400) => {
    let has = await K(() => !!document.querySelector('#pcos .brw'));
    if (!has) { await dbl('#pcos .di[title="Tepi"]'); await p.waitForTimeout(300); }
    await p.click('#pcos .brw .nav input'); await p.keyboard.press('Control+a'); await p.keyboard.type(url); await p.keyboard.press('Enter'); await p.waitForTimeout(wait);
    return K(() => document.querySelector('#pcos .brw .page')?.innerText.slice(0, 300));
  };
  const routerLogin = async () => { await p.click('#pcos .brw button[name=login]'); await p.waitForTimeout(150); };
  const routerNav = async label => { await K(l => [...document.querySelectorAll('#pcos .wf aside div')].find(d => d.textContent === l)?.click(), label); await p.waitForTimeout(120); };
  const fillName = async (name, v) => { await p.fill(`#pcos .brw input[name=${name}]`, v); };
  const clickName = async name => { await p.click(`#pcos .brw button[name=${name}]`); await p.waitForTimeout(150); };
  const modalText = () => K(() => document.querySelector('.noc-modal .noc-box')?.innerText.replace(/\n+/g, ' | ') ?? null);
  const mclick = async name => { const ok = await K(n => { const b = document.querySelector(`.noc-modal button[name="${n}"]`); b?.click(); return !!b; }, name); await p.waitForTimeout(120); return ok; };
  const job = () => K(() => { const j = window.__kota.noc.tracked(); return j && { id: j.id, tpl: j.tpl, faults: j.faults, order: j.order, targets: j.targets.map(t => ({ pc: t.pc.name, mode: t.mode, ip: t.ip, mask: t.mask, gw: t.gw, dns: t.dns, browse: t.browse, ok: t.ok, tested: t.tested, note: t.note })), router: j.router, record: j.record, sw: j.sw, envId: j.envId }; });
  const consoleLines = async (lines) => { for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(60); } return K(() => document.querySelector('.swcli .swout')?.textContent.slice(-1200)); };
  const report = async tag => {
    for (let i = 0; i < 6; i++) { await step(3); await p.waitForTimeout(100); if (await K(() => /Laporan kerja/.test(document.querySelector('.noc-modal h2')?.textContent ?? ''))) break; }
    const t = await modalText(); console.log(`  REPORT[${tag}]`, t?.slice(0, 700)); await shot(`jobs_report_${tag}`);
    await mclick('report-ok'); await p.waitForTimeout(150);
    return t;
  };
  return { b, p, errs, K, shot, step, go, goPc, goAnchor, press, openPc, openCmd, cmd, cmdText, closePc, closeWins, ipv4, browser, routerLogin, routerNav, fillName, clickName, modalText, mclick, job, consoleLines, report };
}
