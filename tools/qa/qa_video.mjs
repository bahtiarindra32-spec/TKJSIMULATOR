// Walkthrough video (Playwright recordVideo) through the lab and the hotel.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: '/workspace/work/video', size: { width: 960, height: 540 } } });
await ctx.addInitScript(() => { try { localStorage.setItem('kotaNusantara.noc.v1', JSON.stringify({ v: 1, xp: 900, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } })); } catch {} });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8787/?qa&low', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
await p.evaluate(() => document.getElementById('enter').click()); await p.waitForTimeout(300);
const K = (f, a) => p.evaluate(f, a);
await K(() => { window.__kota.pause(false); window.__kota.menu?.resume?.(); });
const tp = (x, z, yaw) => K(([x, z, yaw]) => window.__kota.teleport(x, z, 1, yaw), [x, z, yaw]);
const walk = async (ms, key = 'w') => { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); };
const turn = async (dx, n = 10) => { for (let i = 0; i < n; i++) { await K(d => { const k = window.__kota; k.turn ? k.turn(d) : null; }, dx); await p.waitForTimeout(60); } };
const sp = k => K(k => window.__kota.labSpots()[k], k);
const T0 = Date.now(); const mark = s => console.log(((Date.now() - T0) / 1000).toFixed(1), s);
// 1 lab: gate -> door -> inside
mark('lab outside'); await tp(262, 486, Math.PI * 0.75); await p.waitForTimeout(2500);
await tp(254, 500, Math.PI / 2); await p.waitForTimeout(800); mark('enter'); await walk(2500);
await p.waitForTimeout(1200);
const g = await sp('guru'); await tp(g[0] + 0.7, g[1], Math.PI / 2); await p.waitForTimeout(600); mark('guru'); await p.keyboard.press('f'); await p.waitForTimeout(2200);
await K(() => document.querySelector('.noc-modal button[name=lab-teacher]')?.click()); await p.waitForTimeout(2500);
await K(() => window.__kota.noc.closeModal());
await K(() => window.__kota.praktik.start({ steps: ['crimp', 'desk', 'static'], minutes: 60, perStudent: true, seed: 11 }, 'K7M2QX', 'Sari Dewi')); mark('jobsheet'); await p.waitForTimeout(3000);
const c = await sp('crimp'); await tp(c[0], c[1] + 0.3, 0); await p.waitForTimeout(500); await p.keyboard.press('f'); await p.waitForTimeout(800);
for (const w of ['putih-oranye', 'oranye', 'putih-hijau', 'biru', 'putih-biru', 'hijau', 'putih-coklat', 'coklat']) { await K(w => document.querySelector(`.noc-modal button[name="wire-${w}"]`)?.click(), w); await p.waitForTimeout(350); }
mark('crimp'); await p.waitForTimeout(1500); await K(() => window.__kota.noc.closeModal());
const r = await sp('rack'); await tp(r[0], r[1] + 0.4, 0); await p.waitForTimeout(500); await p.keyboard.press('f'); mark('rack'); await p.waitForTimeout(3000); await K(() => window.__kota.noc.closeModal());
await K(() => window.__kota.praktik.finish(true)); mark('hasil'); await p.waitForTimeout(3500); await K(() => window.__kota.noc.closeModal());
// 2 hotel
mark('hotel'); await tp(236, 158, Math.PI * 1.05); await p.waitForTimeout(2500);
await tp(226, 172, 0); await p.waitForTimeout(500); await walk(2000); await p.waitForTimeout(500);
await K(() => window.__kota.noc.openBoard()); mark('board'); await p.waitForTimeout(3000); await K(() => window.__kota.noc.closeModal());
await K(() => window.__kota.noc.openRack('MDF')); mark('mdf'); await p.waitForTimeout(3000); await K(() => window.__kota.noc.closeModal());
mark('end');
await ctx.close(); await b.close();
console.log('VIDEO', (await p.video().path()));
