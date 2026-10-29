// Full play-through of the mission system dev page with real clicks/keys. Usage: node missions.mjs W H tag
import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
const root = '/workspace/work/missions-dist', out = '/workspace/work/mshots';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 800), tag = process.argv[4] || `${W}`;
const port = 5300 + (W % 97);
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'missions.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(port);
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: W < 720, isMobile: false });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
const log = (...a) => console.log(`[${tag}]`, ...a);
let n = 0;
const shot = async (name) => { await p.waitForTimeout(350); const f = `${out}/${tag}_${String(++n).padStart(2, '0')}_${name}.png`; await p.screenshot({ path: f }); log('shot', f); };
const modalTitle = () => p.locator('.ms-modal h2').textContent();
const click = async (name, exact = true) => { await p.getByRole('button', { name, exact }).first().click(); await p.waitForTimeout(120); };
const expectTitle = async (t) => { const s = await modalTitle(); if (!s.includes(t)) throw new Error(`expected modal "${t}" got "${s}"`); log('modal:', s); };
const state = () => p.evaluate(() => ({ cur: window.__ms.ms.current(), modal: window.__ms.ms.getModal(), player: { ...window.__ms.player } }));
const devGoto = async (anchor) => { await p.evaluate(a => window.__ms.goto(a), anchor); await p.waitForTimeout(150); };
const devF = async (anchor) => { if (W < 720) await p.evaluate(() => document.getElementById('dev').classList.remove('closed')); await p.locator(`#devAnchors button[data-anchor="${anchor}"]`).click(); await p.waitForTimeout(200); if (W < 720) await p.evaluate(() => document.getElementById('dev').classList.add('closed')); };

await p.goto(`http://localhost:${port}/missions.html`);
await p.evaluate(() => { try { localStorage.clear(); } catch {} }); await p.reload();
await p.waitForSelector('.ms-modal h2');
const devPanel = (open) => p.evaluate(o => document.getElementById('dev').classList.toggle('closed', !o), open);
if (W < 720) await devPanel(false); // hide dev panel on phone so it doesn't cover screenshots
// ---- intro + briefing
await expectTitle('Hari Pertama Magang'); await shot('intro');
await click('Mulai hari pertama →'); await expectTitle('K3 Dulu'); await shot('briefing_m1');
await p.keyboard.press('Enter'); // autofocused "Siap, gas!"
await p.waitForTimeout(200);
if ((await state()).modal) throw new Error('briefing did not close with Enter');
await shot('tracker_waypoint');
// ---- log via J, movement gating
await p.keyboard.press('KeyJ'); await expectTitle('Sekarang: K3'); await shot('log');
const z0 = (await state()).player.z; await p.keyboard.down('KeyW'); await p.waitForTimeout(400); await p.keyboard.up('KeyW');
log('gated move dz =', ((await state()).player.z - z0).toFixed(3));
await p.keyboard.press('KeyJ'); await p.waitForTimeout(150); log('log closed by J:', (await state()).modal === null);
// wrong anchors
await devF('ANCHOR_SRV_UPS_01'); log('toast:', await p.locator('.ms-toast').textContent()); await shot('toast_later_anchor');
// ---- M1 K3
await devF('ANCHOR_WS_TOOLCAB_01');
await expectTitle('Lemari Alat');
await p.locator('.ms-tile').first().focus(); await p.keyboard.press('Space'); const pr1 = await p.locator('.ms-tile').first().getAttribute('aria-pressed'); await p.keyboard.press('Space'); log('keyboard toggle tile:', pr1);
await click('Solder', false); await click('Tang crimping', false); await click('Cek pilihan'); await shot('k3_wrong');
await click('Solder', false); for (const t of ['LAN tester', 'Kabel UTP', 'Konektor RJ45', 'Kacamata pelindung']) await click(t, false);
await shot('k3_selected'); await click('Cek pilihan');
await p.getByRole('button', { name: /Pakai aja/ }).click(); await shot('k3_q1_wrong');
await p.getByRole('button', { name: /lapor ke guru/ }).click(); await click('Soal berikutnya →');
await p.getByRole('button', { name: /kembalikan alat/ }).click(); await shot('k3_q2_right'); await click('Selesai ✓');
await expectTitle('Misi selesai!'); await shot('success_m1');
await click('Lanjut ke misi berikutnya →'); await expectTitle('Crimping'); await click('Siap, gas!');
// ---- M2 crimp, via real F key
await devGoto('ANCHOR_WS_CRIMPING_01'); await p.waitForTimeout(250);
log('objective near:', (await state()).cur.objective); await shot('near_target');
await p.keyboard.press('KeyF'); await expectTitle('Meja Crimping');
const T568B = ['Putih-oranye', 'Oranye', 'Putih-hijau', 'Biru', 'Putih-biru', 'Hijau', 'Putih-coklat', 'Coklat'];
const wrong = [...T568B]; [wrong[2], wrong[5]] = [wrong[5], wrong[2]];
const wires = async (order) => { for (const w of order) await p.locator('.ms-palette button', { hasText: new RegExp(`^${w}$`) }).click(); };
await wires(wrong.slice(0, 4)); await click('Lihat contekan'); await shot('crimp_partial_help');
await click('Sembunyikan contekan');
await wires(wrong.slice(4)); await shot('crimp_endA_wrong_filled');
await click('Crimp ujung A ✓'); await wires(T568B); await click('Crimp ujung B ✓');
await p.waitForTimeout(1600); await shot('tester_running');
await p.getByRole('button', { name: /Potong & ulang/ }).waitFor({ timeout: 10000 }); await shot('tester_fail');
await p.getByRole('button', { name: /Potong & ulang/ }).click();
await wires(T568B); await click('Crimp ujung A ✓');
await p.getByRole('button', { name: 'Selesai ✓' }).waitFor({ timeout: 10000 }); await shot('tester_pass');
await click('Selesai ✓'); await expectTitle('Misi selesai!'); await click('Lanjut ke misi berikutnya →'); await click('Siap, gas!');
// ---- M3 IP
await devGoto('ANCHOR_WS_PC_01'); await p.waitForSelector('.ms-tr-act'); await shot('tracker_act_button'); await p.click('.ms-tr-act'); await expectTitle('PC Praktik 1');
const fill = async (ip, mask, gw) => { await p.fill('#ms-f-ip', ip); await p.fill('#ms-f-mask', mask); await p.fill('#ms-f-gw', gw); };
const zA = (await state()).player.z;
await p.click('#ms-f-ip'); await p.keyboard.type('192.168.1.5'); await p.keyboard.press('KeyW'); await p.keyboard.press('Backspace');
log('typing moved player?', (await state()).player.z !== zA);
await p.fill('#ms-f-mask', '255.255.255.0'); await p.fill('#ms-f-gw', '192.168.10.1'); await shot('ip_form');
await click('Simpan & ping server'); await p.getByRole('button', { name: 'Perbaiki pengaturan' }).waitFor(); await shot('ip_timeout');
await click('Perbaiki pengaturan'); await p.fill('#ms-f-ip', '192.168.10.255'); await p.keyboard.press('Enter'); await shot('ip_broadcast_err');
await p.fill('#ms-f-ip', '192.168.10.21'); await click('Simpan & ping server'); await p.getByRole('button', { name: 'Perbaiki pengaturan' }).waitFor(); await shot('ip_conflict');
await click('Perbaiki pengaturan'); await p.fill('#ms-f-ip', '192.168.10.50'); await click('Simpan & ping server');
await p.getByRole('button', { name: 'Selesai ✓' }).waitFor(); await shot('ip_ok');
await click('Selesai ✓'); await click('Lanjut ke misi berikutnya →'); await click('Siap, gas!');
// ---- M4 subnet (independent solver)
await devGoto('ANCHOR_IT_NOC_01'); await p.keyboard.press('KeyF'); await expectTitle('Meja NOC'); await shot('subnet_intro');
const ipn = s => s.split('.').reduce((a, o) => a * 256 + +o, 0);
const solve = (q) => { let m;
  if ((m = q.match(/^Prefix \/(\d+)/))) return `255.255.255.${256 - 2 ** (32 - m[1])}`;
  if ((m = q.match(/subnet \/(\d+)\?/))) return String(2 ** (32 - m[1]) - 2);
  if ((m = q.match(/IP 192\.168\.20\.(\d+)\/(\d+)\. Alamat network/))) { const b = 2 ** (32 - m[2]); return `192.168.20.${Math.floor(m[1] / b) * b}`; }
  if ((m = q.match(/IP 192\.168\.20\.(\d+)\/(\d+)\. Alamat broadcast/))) { const b = 2 ** (32 - m[2]); return `192.168.20.${Math.floor(m[1] / b) * b + b - 1}`; }
  if ((m = q.match(/prefix \/(\d+)\. Jadi/))) return String(2 ** (m[1] - 24));
  throw new Error('unknown ' + q); };
const answerAll = async (wrongFirst) => {
  for (let i = 0; i < 5; i++) {
    const q = await p.locator('.ms-q').textContent(); const ans = solve(q);
    const opts = p.locator('.ms-choice');
    if (wrongFirst.includes(i)) { const texts = await opts.allTextContents(); const k = texts.findIndex(t => t.slice(1) !== ans); await opts.nth(k).click(); if (i === wrongFirst[0]) await shot('subnet_wrong'); }
    const texts = await opts.allTextContents(); const k = texts.findIndex(t => t.slice(1) === ans);
    if (k < 0) throw new Error(`answer ${ans} not in ${texts}`); await opts.nth(k).click();
    if (i === 0) await shot('subnet_right');
    await p.getByRole('button', { name: /Soal berikutnya|Lihat hasil/ }).click();
  }
};
await click('Mulai soal →'); await answerAll([1, 3]); await shot('subnet_fail'); await click('Coba set soal baru');
await answerAll([]); await shot('subnet_pass'); await click('Selesai ✓'); await click('Lanjut ke misi berikutnya →'); await click('Siap, gas!');
// ---- M5 VLAN
await devGoto('ANCHOR_SRV_NETRACK_01'); await p.keyboard.press('KeyF'); await expectTitle('Rak Jaringan');
const want = ['10', '20', '30', '10', '30', '20', '10', 'Trunk']; const bad = [...want]; bad[2] = '20'; bad[7] = '10';
const setPorts = async (arr) => { for (let i = 0; i < arr.length; i++) await p.locator(".ms-port").nth(i).getByRole('radio', { name: arr[i], exact: true }).click(); };
await setPorts(bad.slice(0, 5)); await shot('vlan_partial'); await setPorts(bad);
await click('Verifikasi (show vlan brief)'); await p.getByRole('button', { name: 'Perbaiki port' }).waitFor(); await shot('vlan_fail_cli');
await click('Perbaiki port'); await shot('vlan_fail_marked'); await setPorts(want);
await click('Verifikasi (show vlan brief)'); await p.getByRole('button', { name: 'Selesai ✓' }).waitFor(); await shot('vlan_ok');
await click('Selesai ✓'); await click('Lanjut ke misi berikutnya →'); await click('Siap, gas!');
// ---- M6 server
await devGoto('ANCHOR_SRV_UPS_01'); await p.keyboard.press('KeyF'); await expectTitle('Panel UPS');
const temps = (await p.locator('.ms-temp').allTextContents()).map(t => parseInt(t));
const upsOk = (await p.locator('.ms-lcd').textContent()).includes('ONLINE');
log('temps', temps, 'upsOk', upsOk);
for (let i = 0; i < 4; i++) await p.locator('.ms-rack').nth(i).getByRole('radio', { name: 'Aman', exact: true }).click(); // all "aman" = wrong for the bad rack
await p.getByRole('radio', { name: upsOk ? 'Perlu dilaporkan' : 'Normal' }).click(); await shot('server_marked_wrong');
await click('Kirim laporan'); await shot('server_fail');
for (let i = 0; i < 4; i++) await p.locator('.ms-rack').nth(i).getByRole('radio', { name: temps[i] >= 18 && temps[i] <= 27 ? 'Aman' : 'Tidak aman', exact: true }).click();
await p.getByRole('radio', { name: upsOk ? 'Normal' : 'Perlu dilaporkan' }).click();
await click('Kirim laporan'); await shot('server_ok'); await click('Selesai ✓'); await expectTitle('Misi selesai!');
await click('Lihat hasil akhir →'); await expectTitle('Magang hari pertama beres'); await shot('finale');
await click('Jalan-jalan bebas'); await shot('free_roam');
// persistence + Esc cancel + reset
await p.reload(); await p.waitForTimeout(800); log('after reload:', JSON.stringify((await state()).cur.finished), (await state()).cur.xp);
await p.evaluate(() => window.__ms.ms.jumpTo(1)); await devGoto('ANCHOR_WS_CRIMPING_01'); await p.keyboard.press('KeyF');
await p.waitForTimeout(150); await p.keyboard.press('Escape'); await p.waitForTimeout(150); log('Esc closed game:', (await state()).modal === null);
log('errors:', errs.length ? errs.join(' | ') : 'none');
await b.close(); srv.close();
