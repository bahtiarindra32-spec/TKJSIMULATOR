import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
const root = '/workspace/work/integ-dist', out = '/workspace/work/mshots';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 800), tag = 'g' + W;
const srv = http.createServer((q, r) => { let p = path.join(root, q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(5401 + W % 50);
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://localhost:${5401 + W % 50}/index.html`); await p.waitForFunction(() => window.__kota, null, { timeout: 120000 }); await p.waitForTimeout(1500);
await p.evaluate(() => { try { localStorage.clear(); } catch {} window.__kota.pause(true); });
const step = n => p.evaluate(n => window.__kota.step(n), n);
const st = async l => console.log(l, JSON.stringify(await p.evaluate(() => ({ ...window.__kota.state(), modal: window.__kota.missions.getModal(), obj: window.__kota.missions.current().objective }))));
const shot = async n => { await step(1); await p.waitForTimeout(200); await p.screenshot({ path: `${out}/${tag}_${n}.png` }); console.log('shot', `${out}/${tag}_${n}.png`); };
await p.click('#enter'); await step(3); await st('entered'); await shot('01_intro');
await p.getByRole('button', { name: 'Mulai hari pertama →' }).click(); await p.getByRole('button', { name: 'Siap, gas!' }).click(); await step(3);
await p.keyboard.down('KeyW'); await step(20); await p.keyboard.up('KeyW'); await st('walked'); await shot('02_spawn_waypoint');
// inside hotel lobby, looking toward workshop
await p.evaluate(() => window.__kota.teleport(232, 172, 1, -Math.PI / 2)); await step(5); await st('lobby'); await shot('03_lobby_waypoint');
await p.evaluate(() => window.__kota.teleport(248.9, 178.7, 1, 0)); await step(5); await st('at toolcab'); await shot('04_at_toolcab');
await p.keyboard.press('KeyF'); await step(2); await st('after F'); await shot('05_k3_ingame');
await p.keyboard.press('Escape'); await step(2); await st('after Esc (should still be walk)');
await p.keyboard.press('KeyJ'); await step(2); await st('J'); await shot('06_log_ingame'); await p.keyboard.press('Escape'); await step(1);
// floor 2: waypoint label
await p.evaluate(() => { window.__kota.missions.jumpTo(4); window.__kota.teleport(237, 179.2, 2, 0); }); await step(5); await st('L2'); await shot('07_L2_label');
await p.evaluate(() => window.__kota.teleport(246.7, 185.8, 1, 0)); await step(5); await st('server room'); await shot('08_server_marker');
console.log('errors:', errs.join(' | ') || 'none'); await b.close(); srv.close();
