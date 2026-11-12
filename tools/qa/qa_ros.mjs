// Fase 2 chunk B1b: Winbox, WebFig and the MikroTik hotspot from in-game PCs, with real walking / F / mouse / keyboard.
// usage: run1.sh qa_ros.mjs <winbox|hotspot|shots|order> 115     (NOSHOT=1 for the non-shots phases)
//   order (chunk B2a): take a k_fasttrack order at the Nusa Teknik board (F + click), walk into the kos and to the
//   tenant laptop, Winbox terminal: print + disable the fasttrack rule (typed), speedtest.cari.id from the same laptop,
//   T → berita acara → sign → nota, saldo and reputasi checked
import { boot } from './qa_lib.mjs';
const ph = process.argv[2] ?? 'winbox';
const Q = await boot(null, { query: '', viewport: { width: 1280, height: 720 } });
const { p, K, errs } = Q;
const out = { phase: ph };
const st = () => K(() => window.__kota.state());
const stepN = (n, render = false) => K(([n, r]) => window.__kota.step(n, 1 / 30, r), [n, render]);
const sleep = ms => p.waitForTimeout(ms);
async function walkTo(X, Z, maxSteps = 240) {
  await p.keyboard.down('w'); let s;
  for (let i = 0; i < maxSteps; i += 6) {
    s = await st(); const dx = X - s.x, dz = Z - s.z; if (Math.hypot(dx, dz) < 0.35) break;
    await K(y => { window.__kota.player.yaw = y; }, Math.atan2(-dx, -dz)); await stepN(6);
  }
  await p.keyboard.up('w'); await stepN(8); return st();
}
const near = () => K(() => window.__kota.why().pc);
/** F at the PC (real key), sit-down animation, sign in */
async function openByF(name) {
  const n = await near(); if (n !== name) { console.log('  !! not near', name, 'near =', n, JSON.stringify(await st()).slice(0, 160)); return false; }
  await p.keyboard.press('f'); await sleep(80); await stepN(2);
  for (let i = 0; i < 14 && !(await K(() => window.__kota.pcos.isOpen())); i++) await stepN(3);
  if (!(await K(() => window.__kota.pcos.isOpen()))) return false;
  await p.click('#pcos .lock button'); await sleep(250);
  return true;
}
async function leavePc() { await p.click('#pcos .leave').catch(() => {}); for (let i = 0; i < 10 && (await K(() => !!window.__kota.seat())); i++) await stepN(3); await sleep(100); }
const dbl = sel => p.dblclick(sel);
const pcText = sel => K(s => document.querySelector(s)?.innerText ?? null, sel);
/** Winbox: neighbors → click the row → Connect (admin, empty password) → New Terminal */
async function winbox(pw = '') {
  await dbl('#pcos .di[title="Winbox"]'); await sleep(250);
  const rows = await K(() => [...document.querySelectorAll('#pcos .wbx-list tr.wbx-n')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  out.neighbors = rows;
  if (!rows.length) return false;
  await p.click('#pcos .wbx-list tr.wbx-n'); await sleep(80);
  out.connectTo = await K(() => document.querySelector('#pcos input[name=wbx-to]').value);
  await p.click('#pcos input[name=wbx-pass]'); await p.keyboard.type(pw);
  await p.click('#pcos button[name=wbx-connect]'); await sleep(200);
  out.wbxHead = await pcText('#pcos .wbx-head'); out.wbxMsg = await pcText('#pcos .wbx-msg');
  if (!out.wbxHead) return false;
  await p.click('#pcos button[name=wbx-newterm]'); await sleep(150);
  await p.click('#pcos .rosterm .swin');
  return true;
}
const termType = async (lines, wait = 90) => { for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await sleep(wait); } };
const termOut = (n = 900) => K(n => (document.querySelector('#pcos .rosterm .swout')?.textContent ?? '').slice(-n), n);
const prompt = () => pcText('#pcos .rosterm .swprompt');
async function cmdRun(lines) {
  await dbl('#pcos .di[title="Command Prompt"]'); await sleep(300); await p.click('#pcos .cmd');
  for (const c of lines) { await p.keyboard.type(c); await p.keyboard.press('Enter'); await sleep(c.startsWith('ping') ? 1900 : 400); }
  const t = await K(() => document.querySelector('#pcos .cmd')?.innerText.slice(-600)); await K(() => document.querySelector('#pcos .cmd')?.closest('.win')?.querySelector('.cb.x')?.click()); return t;
}
async function browse(url) {
  if (!(await K(() => !!document.querySelector('#pcos .brw')))) { await dbl('#pcos .di[title="Tepi"]'); await sleep(300); }
  await p.click('#pcos .brw .nav input'); await p.keyboard.press('Control+a'); await p.keyboard.type(url); await p.keyboard.press('Enter'); await sleep(400);
  return { page: (await pcText('#pcos .brw .page'))?.replace(/\n+/g, ' / ').slice(0, 220), addr: await K(() => document.querySelector('#pcos .brw .nav input').value) };
}
const closeWins = () => K(() => { [...document.querySelectorAll('#pcos .win')].forEach(w => w.querySelector('.cb.x')?.click()); });
const shot = async n => { await p.screenshot({ path: `/workspace/work/shots/ros_${n}.png`, timeout: 60000 }); out.shots = [...(out.shots ?? []), `/workspace/work/shots/ros_${n}.png`]; };

async function enterSite(id) {
  const S = (await K(() => window.__kota.sites())).find(s => s.id === id);
  await K(([id]) => { window.__kota.goSite(id); window.__kota.step(6, 1 / 30, false); }, [id]);
  const inn = await walkTo(S.inside.X, S.inside.Z); out[`in_${id}`] = inn.loc;
}
async function toKasir() {
  await enterSite('warnet');
  await walkTo(354.6, 314.6); await walkTo(355.4, 311.4); await walkTo(357.4, 311.7);
  if ((await near()) !== 'PROP_WARNET_01_KASIR_PC') for (const [x, z] of [[357.4, 311.9], [356.8, 311.8], [358.0, 311.8], [357.4, 314.1]]) { await walkTo(x, z, 60); if ((await near()) === 'PROP_WARNET_01_KASIR_PC') break; }
  out.atKasir = await st().then(s => [+s.x.toFixed(2), +s.z.toFixed(2)]);
}
async function toKosRoom(k) {
  const dx = (k - 1) % 3 * 4;
  await walkTo(138.0, 310.4); await walkTo(133.8 + dx, 310.0); await walkTo(133.8 + dx, 307.2); await walkTo(134.5 + dx, 305.6);
  out[`atK${k}`] = await st().then(s => [+s.x.toFixed(2), +s.z.toFixed(2)]);
}

try {
  await K(() => window.__kota.daynight.set(13));
  if (ph === 'winbox') {
    await toKasir();
    out.opened = await openByF('PROP_WARNET_01_KASIR_PC');
    if (out.opened) {
      out.winboxOk = await winbox('');
      await termType(['/ip address print']);
      out.addrPrint = (await termOut(500)).split('\n').filter(l => /192\.168/.test(l)).join(' | ');
      out.has24 = /192\.168\.100\.1\/24/.test(out.addrPrint);
      await termType(['/system identity set name=WARNET']);
      out.promptAfter = await prompt(); out.promptOk = out.promptAfter?.trim() === '[admin@WARNET] >';
      out.headAfter = await pcText('#pcos .wbx-head');
      // wrong password message, via a second Winbox window
      await closeWins(); await dbl('#pcos .di[title="Winbox"]'); await sleep(200);
      await p.click('#pcos .wbx-list tr.wbx-n'); await p.click('#pcos input[name=wbx-pass]'); await p.keyboard.type('salah'); await p.click('#pcos button[name=wbx-connect]'); await sleep(150);
      out.wrongPw = await pcText('#pcos .wbx-msg');
      await closeWins();
      // WebFig at the gateway (replaces the old WebKonfig)
      const w = await browse('192.168.100.1'); out.webfigLogin = w.page;
      await p.click('#pcos button[name=wfg-login]'); await sleep(200);
      await p.click('#pcos .rosterm .swin'); await termType(['/system identity print']);
      out.webfigTerm = (await termOut(200)).replace(/\n+/g, ' / ');
      out.webfigOk = /name: WARNET/.test(out.webfigTerm);
      await leavePc();
    }
  }
  if (ph === 'hotspot') {
    await enterSite('kos');
    await toKosRoom(1);
    out.openedK1 = await openByF('PROP_KOS_01_LAPTOP_K1');
    if (out.openedK1) {
      out.winboxOk = await winbox('');
      await termType(['/ip hotspot setup']); out.wiz0 = await prompt();
      await termType(['bridge-lan']); out.wiz1 = await prompt();
      await termType(['', '', '', '', '', '', '', '', ''], 70);
      out.promptAfterWizard = await prompt();
      await termType(['/ip hotspot user add name=kamar1 password=123', '/ip hotspot print']);
      out.hsPrint = (await termOut(700)).split('\n').filter(l => /hotspot1|wizard|failure|invalid|match/.test(l)).join(' | ');
      await leavePc();
    }
    await walkTo(133.8, 307.2); await walkTo(133.8, 310.0);
    await toKosRoom(2);
    out.openedK2 = await openByF('PROP_KOS_01_LAPTOP_K2');
    if (out.openedK2) {
      out.pingBefore = (await cmdRun(['ping -n 2 8.8.8.8']))?.split('\n').filter(l => /Reply|timed out|Packets/.test(l)).join(' | ');
      const b = await browse('cari.id'); out.loginPage = b.page; out.loginAddr = b.addr;
      await p.click('#pcos input[name=hs-user]'); await p.keyboard.type('kamar1'); await p.click('#pcos input[name=hs-pass]'); await p.keyboard.type('salah'); await p.click('#pcos button[name=hs-login]'); await sleep(150);
      out.loginErr = await pcText('#pcos .hs-msg');
      await p.fill('#pcos input[name=hs-pass]', ''); await p.click('#pcos input[name=hs-pass]'); await p.keyboard.type('123'); await p.click('#pcos button[name=hs-login]'); await sleep(400);
      out.afterLogin = (await pcText('#pcos .brw .page'))?.replace(/\n+/g, ' / ').slice(0, 160);
      await closeWins();
      out.pingAfter = (await cmdRun(['ping -n 2 8.8.8.8']))?.split('\n').filter(l => /Reply|timed out|Packets/.test(l)).join(' | ');
      out.pingOk = /Reply from 8\.8\.8\.8/.test(out.pingAfter ?? '') && !/Reply from 8\.8\.8\.8/.test(out.pingBefore ?? '');
      await leavePc();
    }
  }
  if (ph === 'order') {
    const F = () => K(() => window.__kota.field.state());
    const modal = () => K(() => document.querySelector('.noc-modal .noc-box')?.innerText.replace(/\n+/g, ' | ').slice(0, 500) ?? null);
    const closeModal = async () => { await p.keyboard.press('Escape'); await sleep(100); await stepN(2); await K(() => { if (window.__kota.noc.isModalOpen()) window.__kota.noc.closeModal(); }); };
    await K(() => window.__kota.field.unlock()); await stepN(2);
    const id = await K(() => window.__kota.field.offer('k_fasttrack', 7)); out.id = id;
    const f0 = await F(); out.saldo0 = f0.saldo; out.rep0 = f0.rep.kos;
    // the work board at Nusa Teknik: walk in, F, take the order by click
    await K(() => { window.__kota.goSite('nusateknik'); window.__kota.step(6, 1 / 30, false); });
    await walkTo(58, 126.6); await walkTo(55, 119.9);
    await p.keyboard.press('f'); await sleep(80); await stepN(2);
    out.board = (await modal())?.slice(0, 260);
    await p.click(`button[name="field-take-${id}"]`); await sleep(150); await stepN(1);
    const a0 = (await F()).act; out.act = { tpl: a0.tpl, variant: a0.variant, data: a0.data, problem: a0.problem, next: a0.next };
    out.letter = (await modal())?.slice(0, 500);
    await closeModal();
    const pc = a0.data.pc; const room = +pc.slice(-1);
    await enterSite('kos'); out.surveyed = (await F()).act.surveyed;
    await toKosRoom(room);
    out.opened = await openByF(pc);
    if (out.opened) {
      // the complaint, measured first: the limit is bypassed
      out.speedBefore = (await browse('speedtest.cari.id')).page;
      await closeWins();
      out.winboxOk = await winbox('');
      await termType(['/queue simple print', '/ip firewall filter print']);
      out.filterPrint = (await termOut(900)).split('\n').filter(l => /fasttrack|accept|chain=/.test(l)).join(' | ').slice(0, 400);
      await termType(['/ip firewall filter disable [find action=fasttrack-connection]', '/ip firewall filter print']);
      out.filterAfter = (await termOut(500)).split('\n').filter(l => /X|fasttrack/.test(l)).join(' | ').slice(0, 300);
      await closeWins();
      out.speedAfter = (await browse('speedtest.cari.id')).page;
      const a1 = (await F()).act; out.afterTest = { problem: a1.problem, targets: a1.targets.map(t => `${t.pc.slice(-2)}:${t.ok}/${t.tested}`), docReady: a1.docReady, stage: a1.stage };
      await leavePc();
    }
    // T → order letter → berita acara → sign → nota
    await p.keyboard.press('t'); await sleep(150); await stepN(2);
    out.hasBerita = await K(() => !!document.querySelector('textarea[name="field-berita"]'));
    if (out.hasBerita) {
      await p.click('textarea[name="field-berita"]');
      await p.keyboard.type(`Rule firewall fasttrack-connection di router KOS-01 membuat simple queue per kamar terlewati. Rule fasttrack dinonaktifkan, tes kecepatan dari laptop kamar ${room} sesuai batas ${a0.data.rate}.`);
      await p.click('button[name="field-sign"]'); await sleep(150); await stepN(1);
      out.nota = (await modal())?.slice(0, 420);
    }
    const f1 = await F(); out.result = { saldo: f1.saldo, paid: f1.saldo - out.saldo0, rep: `${out.rep0}→${f1.rep.kos}`, done: f1.done, act: !!f1.act, nota: f1.nota.at(-1) };
    out.pass = !!out.nota && out.result.paid > 0 && !out.result.act && /dilewati \(FastTrack\)/.test(out.speedBefore ?? '') && /Batas 1M\/2M/.test(out.speedAfter ?? '');
  }
  if (ph === 'shots') {
    // visual pass only: open the PCs directly (walking/real clicks are covered by the winbox/hotspot phases); DOM-dispatched
    // clicks here because Playwright's actionability wait stalls on a PC opened without the sit-down
    const kc = sel => K(s => { const e = document.querySelector(s); if (!e) return false; if (e.tagName === 'INPUT') e.focus(); else e.click(); return true; }, sel);
    const kd = sel => K(s => document.querySelector(s)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), sel);
    const typeIn = async (sel, v) => { await K(([s, v]) => { const e = document.querySelector(s); e.focus(); e.value = v; }, [sel, v]); };
    const open = async n => { await K(n => window.__kota.pcos.open(n, n), n); await sleep(150); await K(() => document.querySelector('#pcos .lock button')?.click()); await sleep(300); };
    const term = async lines => { await kc('#pcos .rosterm .swin'); await termType(lines, 70); };
    const wbx = async () => { await kd('#pcos .di[title="Winbox"]'); await sleep(200); await kc('#pcos .wbx-list tr.wbx-n'); };
    const wbxTerm = async () => { await kc('#pcos button[name=wbx-connect]'); await sleep(120); await kc('#pcos button[name=wbx-newterm]'); await sleep(100); };
    const nav = async url => { if (!(await K(() => !!document.querySelector('#pcos .brw')))) { await kd('#pcos .di[title="Tepi"]'); await sleep(250); } await K(u => { const i = document.querySelector('#pcos .brw .nav input'); i.value = u; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, url); await sleep(300); };
    await open('PROP_WARNET_01_KASIR_PC');
    await wbx(); await shot('winbox_neighbors');
    await wbxTerm(); await term(['/ip address print', '/interface print']); await shot('winbox_terminal');
    await closeWins(); await nav('192.168.100.1'); await shot('webfig_login');
    await kc('#pcos button[name=wfg-login]'); await sleep(150); await term(['/ip dhcp-server lease print']); await shot('webfig_terminal');
    await K(() => window.__kota.pcos.close()); await sleep(150);
    await open('PROP_KOS_01_LAPTOP_K1');
    await wbx(); await wbxTerm(); await term(['/ip hotspot setup', 'bridge-lan', '', '', '', '', '', '', '', '', '', '/ip hotspot user add name=kamar1 password=123']);
    await K(() => window.__kota.pcos.close()); await sleep(150);
    await open('PROP_KOS_01_LAPTOP_K2');
    await nav('cari.id'); await shot('hotspot_login');
    await typeIn('#pcos input[name=hs-user]', 'kamar1'); await typeIn('#pcos input[name=hs-pass]', 'salah'); await kc('#pcos button[name=hs-login]'); await sleep(150); await shot('hotspot_error');
    await typeIn('#pcos input[name=hs-pass]', '123'); await kc('#pcos button[name=hs-login]'); await sleep(300);
    await nav('192.168.0.1/status'); await shot('hotspot_status');
    await p.setViewportSize({ width: 800, height: 600 }); await sleep(200); await closeWins();
    await wbx(); await wbxTerm(); await term(['/ip hotspot active print']); await shot('winbox_narrow');
  }
} catch (e) { console.log('  !!', e.message.slice(0, 400)); out.err = e.message.slice(0, 300); }
console.log('RESULT', JSON.stringify(out, null, 1), '\nerrors', JSON.stringify(errs.slice(0, 6)));
await Q.b.close();
