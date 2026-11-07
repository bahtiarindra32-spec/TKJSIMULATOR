// Fase 1 chunk 2: field-work career layer. Real keyboard/mouse input on the single-file build.
// usage: NOSHOT=1 timeout 118 bash run1.sh qa_field.mjs <unlock|order|garansi|shots|phone> 115
//   unlock : locked board text, hotel rank-up opens field work (toast), walk in, F on the board, take an order by click
//   order  : take a w_port order at the board → tools from the cabinet → teleport near the warnet → walk in → console at the
//            rack (typed) → ping from the customer PC (typed) → T → berita acara → nota, paid, reputasi up, no garansi
//   garansi: w_port closed without write memory + r_kabel with a T568A crimp made on the bench (clicks) → garansi plans →
//            advance days → callbacks appear (unpaid, reputasi −3) → accepting re-breaks the device
//   shots  : 1280×720 board, order card HUD, nota          phone: same at 390×844 touch
import { boot } from './qa_lib.mjs';
const ph = process.argv[2] ?? 'unlock';
const phone = ph === 'phone' || ph === 'phoneL';
const Q = await boot(null, { query: '', viewport: ph === 'phoneL' ? { width: 844, height: 390 } : phone ? { width: 390, height: 844 } : { width: 1280, height: 720 }, touch: phone });
const { p, K, errs } = Q;
const out = { phase: ph };
const SH = n => `/workspace/work/shots/field_${ph}_${n}.png`;
const shotNow = async n => { if (process.env.NOSHOT) return; await K(() => window.__kota.step(2, 1 / 30, true)); await p.screenshot({ path: SH(n), timeout: 80000 }); out.shots = [...(out.shots ?? []), n]; };
const st = () => K(() => window.__kota.state());
const F = () => K(() => window.__kota.field.state());
const stepN = (n, render = false) => K(([n, r]) => window.__kota.step(n, 1 / 30, r), [n, render]);
const place = (X, Z, yaw, pitch = -0.05, y = null) => K(([X, Z, yaw, pitch, y]) => { const k = window.__kota; k.teleport(X, Z, 1, yaw); if (y !== null) k.player.pos.y = y; k.look(pitch); k.step(12, 1 / 30, false); }, [X, Z, yaw, pitch, y]);
async function walkTo(X, Z, maxSteps = 260) {
  await p.keyboard.down('w');
  let s;
  for (let i = 0; i < maxSteps; i += 6) {
    s = await st(); const dx = X - s.x, dz = Z - s.z; if (Math.hypot(dx, dz) < 0.35) break;
    await K(y => { window.__kota.player.yaw = y; }, Math.atan2(-dx, -dz));
    await stepN(6);
  }
  await p.keyboard.up('w'); await stepN(8);
  return st();
}
const pressF = async () => { await p.keyboard.press('f'); await p.waitForTimeout(80); await stepN(2); };
const modal = () => K(() => document.querySelector('.noc-modal .noc-box')?.innerText.replace(/\n+/g, ' | ').slice(0, 600) ?? null);
const closeModal = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(100); await stepN(2); await K(() => { if (window.__kota.noc.isModalOpen()) window.__kota.noc.closeModal(); }); };
const click = async sel => { await p.click(sel, { timeout: 8000 }); await p.waitForTimeout(120); await stepN(1); };
const toastText = () => K(() => document.getElementById('toast')?.textContent ?? '');
/** stand-in-front point of a site PC (screens face east for booths 1–4, south for 5–8) */
const pcStand = name => {
  const n = +name.slice(-2);
  return n <= 4 ? [345.75, 305 + (n - 1) * 2] : [348 + (n - 5) * 2, 304.75];
};
async function pingFromPc(name, viaF = true) {
  if (viaF) {
    const why = await K(() => window.__kota.why()); out[`near_${name}`] = why.pc;
    await pressF();
    for (let i = 0; i < 14 && !(await K(() => window.__kota.pcos.isOpen())); i++) await stepN(3);
  }
  if (!(await K(() => window.__kota.pcos.isOpen()))) { out[`pcOpenFallback_${name}`] = true; await K(n => window.__kota.pcos.open(n, n), name); }
  await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(250);
  await K(() => document.querySelector('#pcos .di[title="Command Prompt"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(300);
  await p.click('#pcos .cmd').catch(() => {});
  await p.keyboard.type('ping 8.8.8.8'); await p.keyboard.press('Enter'); await p.waitForTimeout(1900);
  const txt = (await K(() => document.querySelector('#pcos .cmd')?.innerText.slice(-260)))?.replace(/\n+/g, ' / ');
  await K(() => document.querySelector('#pcos .leave')?.click()); for (let i = 0; i < 10 && (await K(() => !!window.__kota.seat())); i++) await stepN(3);
  await stepN(4);
  return txt;
}
async function typeConsole(lines) {
  await p.waitForTimeout(300); await p.click('.noc-modal .swcli').catch(() => {}); await p.waitForTimeout(100);
  for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(140); }
}
const portCmds = (d, save = true) => ['', 'enable', 'configure terminal', `interface gigabitEthernet1/0/${d.port}`, d.variant === 'shut' ? 'no shutdown' : 'switchport access vlan 1', 'end', ...(save ? ['write memory'] : [])];
try {
  await K(() => window.__kota.daynight.set(13));
  if (ph === 'unlock') {
    // locked: the board explains what opens field work
    await K(() => window.__kota.field.board()); out.lockedBoard = (await modal())?.slice(0, 220); await closeModal();
    out.before = (await F()).unlocked;
    // the hotel rank above Magang (XP + passed competency test) opens field work; Kak Rani points to the office
    await K(() => { const s = window.__kota.noc['s']; s.xp = 900; s.cert = 1; });
    await stepN(3); out.toast = await toastText(); out.after = (await F()).unlocked;
    // walk in with W from the entry anchor and use the board with F
    await K(() => { window.__kota.goSite('nusateknik'); window.__kota.step(6, 1 / 30, false); });
    const S = (await K(() => window.__kota.sites())).find(s => s.id === 'nusateknik');
    await walkTo(S.inside.X, S.inside.Z); await walkTo(55, 119.9); out.hint = (await st()).hint;
    await pressF(); out.board = (await modal())?.slice(0, 320);
    const f = await F(); out.offers = f.offers.map(o => `${o.id}:${o.tpl}:${o.tarif}`); out.day = f.day;
    out.offerCount = f.offers.length;
    await click(`button[name="field-take-${f.offers[0].id}"]`);
    const g = await F(); out.taken = g.act && { id: g.act.id, tpl: g.act.tpl, stage: g.act.stage, next: g.act.next };
    out.letter = (await modal())?.slice(0, 200); await closeModal();
    await stepN(10); out.hud = await K(() => document.getElementById('field-hud')?.classList.contains('on') && document.getElementById('field-hud').innerText.replace(/\n+/g, ' | ').slice(0, 260));
    out.chip = await K(() => document.getElementById('field-chip')?.innerText.replace(/\n+/g, ' | '));
    out.waypoint = await K(() => window.__kota.field.target());
    out.saved = await K(() => { const s = JSON.parse(localStorage.getItem('kotaNusantara.field.v1') ?? '{}'); return { v: s.v, unlocked: s.unlocked, told: s.told, offers: (s.offers ?? []).length }; });
  }
  if (ph === 'order') {
    await K(() => window.__kota.field.unlock()); await stepN(2);
    const id = await K(() => window.__kota.field.offer('w_port', 7)); out.id = id;
    await K(() => { window.__kota.goSite('nusateknik'); window.__kota.step(6, 1 / 30, false); });
    await walkTo(58, 126.6); await walkTo(55, 119.9);
    await pressF(); await click(`button[name="field-take-${id}"]`);
    const a0 = (await F()).act; out.act = { tpl: a0.tpl, variant: a0.variant, data: a0.data, stage: a0.stage };
    await closeModal();
    // tools from the office cabinet (console cable + technician laptop)
    await walkTo(51.6, 120.3); out.hintLemari = (await st()).hint; await pressF();
    await click('button[name="field-tools"]'); await click('button[name="take-console"]'); await click('button[name="take-laptop"]'); await closeModal();
    // ride is skipped: teleport to the warnet entry anchor, then walk in with W
    await K(() => { window.__kota.goSite('warnet'); window.__kota.step(6, 1 / 30, false); });
    out.beforeIn = (await F()).act.surveyed;
    await walkTo(352, 315.6); await stepN(4);
    out.surveyed = (await F()).act.surveyed;
    out.pcBroken = (await F()).act.targets.map(t => `${t.pc}:${t.ok}`);
    await walkTo(354.6, 314.6); await walkTo(354.6, 310.8); await walkTo(358.6, 305.0); out.hintRack = (await st()).hint;
    await pressF(); await click('button[name="console-SW-WARNET"]');
    await typeConsole(portCmds(a0.data));
    out.cli = (await K(() => document.querySelector('.noc-modal')?.innerText.slice(-520)))?.replace(/\n+/g, ' / ');
    await closeModal();
    const a1 = (await F()).act; out.afterFix = { targets: a1.targets.map(t => `${t.ok}/${t.tested}`), stage: a1.stage, next: a1.next, dirty: await K(() => window.__kota.swDirty('SW-WARNET')) };
    // test from the customer PC (walk to its desk, F, type ping)
    const [sx, sz] = pcStand(a0.data.pc);
    await walkTo(352, 308.8); await walkTo(sx, sz); 
    out.ping = await pingFromPc(a0.data.pc);
    const a2 = (await F()).act; out.tested = { targets: a2.targets.map(t => `${t.ok}/${t.tested}`), docReady: a2.docReady, stage: a2.stage };
    // T → order letter → berita acara → sign
    await p.keyboard.press('t'); await p.waitForTimeout(150); await stepN(2);
    out.letterHasBerita = await K(() => !!document.querySelector('textarea[name="field-berita"]'));
    await p.click('textarea[name="field-berita"]');
    await p.keyboard.type(`Port Gi1/0/${a0.data.port} di SW-WARNET ${a0.variant === 'shut' ? 'di-shutdown' : 'masuk VLAN salah'}, diperbaiki lewat console lalu write memory. Uji ping 8.8.8.8 dari PC berhasil.`);
    await click('button[name="field-sign"]');
    out.nota = (await modal())?.slice(0, 420);
    const f = await F(); out.result = { saldo: f.saldo, rep: f.rep, done: f.done, garansi: f.garansi.length, nota: f.nota.at(-1), act: !!f.act };
  }
  if (ph === 'garansi') {
    await K(() => window.__kota.field.unlock()); await stepN(2);
    // (1) switch config not saved
    const id = await K(() => window.__kota.field.offer('w_port', 11)); out.accept1 = await K(i => window.__kota.field.accept(i), id);
    const a0 = (await F()).act; out.a1 = { variant: a0.variant, pc: a0.data.pc, port: a0.data.port };
    await K(() => { window.__kota.goSite('warnet', 'inside'); window.__kota.step(6, 1 / 30, false); });
    await K(() => { const n = window.__kota.noc; n.inv.console = true; n.inv.laptop = true; });
    await K(() => window.__kota.noc.openRack('WARNET')); await click('button[name="console-SW-WARNET"]');
    await typeConsole(portCmds(a0.data, false));                          // fixed, but no write memory
    await closeModal();
    out.ping1 = (await pingFromPc(a0.data.pc, false))?.slice(-90);
    out.sign1 = await K(() => window.__kota.field.sign('Port switch PC diperbaiki lewat console, uji ping 8.8.8.8 dari PC berhasil.'));
    let f = await F(); out.plan1 = f.garansi.map(g => `${g.reason}@${g.showDay}`); out.stars1 = f.nota.at(-1).stars;
    // (2) sloppy crimp: a T568A cable made on the bench by clicks, never tested, installed at the ONT
    const id2 = await K(() => window.__kota.field.offer('r_kabel', 3)); out.accept2 = await K(i => window.__kota.field.accept(i), id2);
    await K(() => { window.__kota.goSite('rumah', 'inside'); window.__kota.step(6, 1 / 30, false); });
    await K(() => window.__kota.field.device('ONT'));
    await click('button[name="field-crimp-ONT-RUMAH:1"]');
    const A = ['putih-hijau', 'hijau', 'putih-oranye', 'biru', 'putih-biru', 'oranye', 'putih-coklat', 'coklat'];
    for (const end of ['a', 'b']) { for (const w of A) await click(`button[name="wire-${w}"]`); await click('button[name="crimp-do"]'); void end; }
    await click('button[name="crimp-keep"]');
    await K(() => window.__kota.field.device('ONT')); await click('button[name="field-cable-ONT-RUMAH:1"]');
    out.ping2 = (await pingFromPc('PROP_RUMAH_01_LAPTOP_01', false))?.slice(-90);
    const a2 = (await F()).act; out.a2 = { targets: a2.targets.map(t => `${t.ok}/${t.tested}`), weak: a2.weak, mat: a2.mat };
    out.sign2 = await K(() => window.__kota.field.sign('Kabel ONT LAN1 ke router diganti kabel crimp baru, uji ping 8.8.8.8 dari laptop berhasil.'));
    f = await F(); out.plans = f.garansi.map(g => `${g.tpl}:${g.reason}@${g.showDay}`); out.nota2 = f.nota.at(-1);
    out.repBefore = f.rep;
    // advance work days until both callbacks are on the board
    const seen = [];
    for (let d = 0; d < 3; d++) { const r = await K(() => window.__kota.field.endDay()); seen.push(r); f = await F(); if (f.offers.filter(o => o.kind === 'garansi').length >= 2) break; }
    out.days = seen; out.dayNow = f.day; out.repAfter = f.rep;
    out.garansiOffers = f.offers.filter(o => o.kind === 'garansi');
    await K(() => window.__kota.field.board()); out.board = (await modal())?.slice(0, 500);
    await shotNow('board_garansi'); await closeModal();
    const g1 = out.garansiOffers.find(o => o.tpl === 'w_port');
    if (g1) { out.acceptG = await K(i => window.__kota.field.accept(i), g1.id); const ga = (await F()).act; out.garansiAct = { kind: ga.kind, targets: ga.targets.map(t => `${t.pc}:${t.ok}`), detail: ga.detail }; }
  }
  if (ph === 'shots' || ph === 'phone' || ph === 'phoneL') {
    await K(() => window.__kota.field.unlock()); await stepN(2);
    const id = await K(() => window.__kota.field.offer('r_tv', 5));
    await place(57.2, 121.6, 0.6, -0.04);
    await K(() => window.__kota.field.board()); await shotNow('board'); await closeModal();
    out.accept = await K(i => window.__kota.field.accept(i), id);
    await K(() => { window.__kota.goSite('rumah'); window.__kota.step(6, 1 / 30, false); });
    await walkTo(116.7, 581.2); await stepN(8, true);
    out.hud = await K(() => document.getElementById('field-hud')?.innerText.replace(/\n+/g, ' | ').slice(0, 300));
    await shotNow('hud');
    out.overlap = await K(() => { const ids = ['field-hud', 'field-chip', 'hud-loc', 'clock', 'compass', 'minimap', 'ring']; const R = ids.map(id => { const e = id === 'ring' ? document.querySelector('#t-stick .ring') : document.getElementById(id); return e && e.offsetWidth ? [id, e.getBoundingClientRect()] : null; }).filter(Boolean); const tb = [...document.querySelectorAll('#touch button, .tc button, [data-k]')].filter(b => b.offsetWidth).map((b, i) => ['btn' + i + ':' + (b.textContent || '').trim().slice(0, 8), b.getBoundingClientRect()]); const all = [...R, ...tb]; const bad = []; for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const [a, ra] = all[i], [b, rb] = all[j]; if (!a.startsWith('field') && !b.startsWith('field')) continue; if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) bad.push(a + '×' + b); } return bad; });
    // overlap check of the HUD boxes on screen
    out.boxes = await K(() => ['field-hud', 'field-chip', 'noc-hud', 'minimap', 'hud-loc', 'clock', 'compass', 'touch-ui', 'tc-top', 'joy'].map(id => { const e = document.getElementById(id); if (!e || !e.offsetWidth) return null; const r = e.getBoundingClientRect(); return { id, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(Boolean));
    // fix: the ONT DHCP page from the family laptop (hook path; real typing is covered by the order phase)
    await K(() => { const env = window.__kota.env('rumah'); env.dhcp = { ...env.dhcp, start: '192.168.1.100', end: '192.168.1.199' }; });
    await K(() => window.__kota.field.device('TV')); await closeModal();
    out.ping = (await pingFromPc('PROP_RUMAH_01_LAPTOP_01', false))?.slice(-80);
    out.sign = await K(() => window.__kota.field.sign('Pool DHCP ONT dibetulkan jadi 192.168.1.100 sampai 192.168.1.199, TV dapat IP, dicek di menu jaringan TV dan ping dari laptop berhasil.'));
    out.nota = (await modal())?.slice(0, 300);
    await shotNow('nota');
    if (ph === 'shots') { await closeModal(); await K(() => window.__kota.field.career()); await shotNow('career'); }
  }
} catch (e) { console.log('  !!', e.message.slice(0, 400)); out.err = e.message.slice(0, 200); }
console.log('RESULT', JSON.stringify(out, null, 1), '\nerrors', JSON.stringify(errs.slice(0, 6)));
await Q.b.close();
