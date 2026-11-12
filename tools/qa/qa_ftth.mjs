// Fase 3 chunk B1a: draw calls at spawn and near the rumah FTTH pole; optional screenshot of pole/ODP/drop (SHOT=1).
// Chunk B1b: phase `fix` = break the house drop at 9 m (QA hook), borrow the fibre kit at the Nusa Teknik cabinet (F),
// OPM at the roset (LO), ladder + climb at the pole, VFL glow, OTDR end ≈ 9 m, splice minigame with good timing → loss
// ≤ 0.2 dB, ONT online + LEDs, laptop ping 8.8.8.8. Phase `shots` = same run with 1280x720 screenshots.
// Chunk B2: phase `order` = paid FTTH order f_drop_putus from the Nusa Teknik board: accept (fault seeded by the order),
// borrow the kit (F at the cabinet), walk into the house (survey), climb the pole, OTDR finds the break, splice minigame,
// down + ladder back, ping from the family laptop (typed), T → berita acara (typed) → sign → nota: paid, sleeve billed,
// reputasi rumah up, no garansi.
// usage: run1.sh qa_ftth.mjs fix 115 | run1.sh qa_ftth.mjs shots 118 | run1.sh qa_ftth.mjs order 115
import { boot } from './qa_lib.mjs';
const PH = process.argv[2] ?? '';
const Q = await boot(null, { query: '', viewport: { width: 1280, height: 720 } });
const { p, K, go, errs } = Q; const out = {};
const look = (pitch) => K(pt => { window.__kota.look(pt); window.__kota.step(4, 1 / 30, true); }, pitch);
const stats = () => K(() => window.__kota.stats());
const stepN = (n, render = false) => K(([n, r]) => window.__kota.step(n, 1 / 30, r), [n, render]);
const st = () => K(() => window.__kota.state());
const SHOTS = PH === 'shots';
const shot = async n => { if (!SHOTS) return; await stepN(1, true); await p.screenshot({ path: `/workspace/work/shots/ftth_${n}.png`, timeout: 70000 }); out.shots = [...(out.shots ?? []), n]; };
const pressF = async () => { await p.keyboard.press('f'); await p.waitForTimeout(80); await stepN(2); };
const click = async name => { const ok = await K(n => { const b = document.querySelector(`.noc-modal button[name="${n}"]`); if (!b || b.disabled) return false; b.click(); return true; }, name); await p.waitForTimeout(60); if (!ok) console.log('  !! no button', name); return ok; };
const modalTxt = () => K(() => document.querySelector('.noc-modal .noc-box')?.innerText.replace(/\n+/g, ' | ').slice(0, 500) ?? null);
const ui = () => K(() => window.__kota.ftthUi());
async function walkTo(X, Z, maxSteps = 240) {
  await p.keyboard.down('w'); let s;
  for (let i = 0; i < maxSteps; i += 6) { s = await st(); const dx = X - s.x, dz = Z - s.z; if (Math.hypot(dx, dz) < 0.35) break; await K(y => { window.__kota.player.yaw = y; }, Math.atan2(-dx, -dz)); await stepN(6); }
  await p.keyboard.up('w'); await stepN(8); return st();
}
const place = (X, Z, yaw, pitch = -0.05) => K(([X, Z, yaw, pitch]) => { const k = window.__kota; k.teleport(X, Z, 1, yaw); k.look(pitch); k.step(12, 1 / 30, false); }, [X, Z, yaw, pitch]);
/** stop the minigame marker inside the centre window: an in-page wait for the marker, then the button click */
const stopBar = name => K(n => new Promise(res => {
  const bar = document.querySelector('.noc-modal .sp-bar'), b = document.querySelector(`.noc-modal button[name="sp-stop-${n}"]`);
  if (!bar || !b) return res(null);
  const t0 = performance.now();
  const f = () => { const ph = +bar.dataset.phase; if (Math.abs(ph - 0.5) < 0.035) { b.click(); res(ph); } else if (performance.now() - t0 > 8000) res(-1); else requestAnimationFrame(f); };
  f();
}), name);

async function climbUp() {
  await place(110, 574.85, 0, -0.1); out.poleSp = (await K(() => window.__kota.why())).sp;
  await pressF();
  if ((await ui()).ladderAt === null) await click('ftth-ladder-place');
  await click('ftth-climb');
  for (let i = 0; i < 8 && (await ui()).climbCam !== 'on'; i++) await stepN(8);
  await stepN(2);
  return (await ui()).climbCam;
}
async function climbDown() { if (!(await K(() => window.__kota.noc.isModalOpen()))) await pressF(); await click('ftth-descend'); for (let i = 0; i < 8 && (await ui()).climbCam; i++) await stepN(8); return (await ui()).climbCam; }

try {
  await K(() => window.__kota.daynight.set(13));
  if (PH === 'order') {
    const F = () => K(() => window.__kota.field.state());
    await K(() => window.__kota.field.unlock()); await stepN(2);
    const id = await K(() => window.__kota.field.offer('f_drop_putus', 7)); out.id = id;
    out.ontBefore = (await K(() => window.__kota.ftth())).state;
    // board at Nusa Teknik: real F + click "Ambil order"
    await place(55, 120.6, 0, -0.1); out.boardSp = (await K(() => window.__kota.why())).sp;
    await pressF(); await click(`field-take-${id}`);
    const a0 = (await F()).act; out.act = a0 && { tpl: a0.tpl, variant: a0.variant, data: a0.data, problem: a0.problem, next: a0.next, ftth: a0.ftth };
    out.ontAfterAccept = await K(() => { const k = window.__kota; k.step(4, 1 / 30, false); return { state: k.ftth().state, leds: k.ftthLeds(), inet: k.ftth().internet }; });
    out.targetBeforeKit = (await K(() => window.__kota.field.target()))?.label;
    await p.keyboard.press('Escape'); await stepN(2);
    // the fibre kit from the cabinet (F → Alat fiber)
    await place(51.5, 121.1, 0, -0.1);
    await pressF(); await click('field-ftth');
    for (const kid of ['tangga', 'otdr', 'vfl', 'splicer', 'pembersih', 'sleeve', 'kacamata', 'helm', 'sarung', 'harness']) await click(`ftth-take-${kid}`);
    await p.keyboard.press('Escape'); await stepN(2);
    out.kit = (await ui()).has; out.sleeves0 = (await ui()).sleeves;
    out.targetAfterKit = (await K(() => window.__kota.field.target()))?.label;
    // ride skipped: into the house (survey), then out to the pole
    await place(115.3, 581.0, -Math.PI / 2, -0.1); await stepN(6);
    out.surveyed = (await F()).act.surveyed;
    out.climb = await climbUp();
    await click('ftth-otdr-lam-1550'); await click('ftth-otdr-shot');
    out.otdrEnd = await K(() => document.querySelector('.noc-modal [data-otdr-end]')?.dataset.otdrEnd ?? null);
    out.otdrMatchesBreak = Math.abs(Number(out.otdrEnd) - Number(out.act?.data?.atM)) < 0.15;
    await click('ftth-otdr-back');
    await click('ftth-splice'); await click('sp-sleeve-on');
    out.strip = await stopBar('strip'); await click('sp-clean-alkohol'); out.cleave = await stopBar('cleave');
    await click('sp-left'); await click('sp-right'); await click('sp-clamp'); await click('sp-fuse');
    if (await K(() => !!document.querySelector('.noc-modal button[name="sp-redo"]'))) { out.rejected = true; await click('sp-redo'); await click('sp-clean-alkohol'); await stopBar('cleave'); await click('sp-fuse'); }
    await click('sp-heat'); await click('sp-bin');
    out.spliceLoss = await K(() => document.querySelector('.noc-modal [data-loss]')?.dataset.loss ?? null);
    await click('sp-apply');
    out.down = await climbDown();
    await pressF(); await click('ftth-ladder-take'); await p.keyboard.press('Escape'); await stepN(2);
    out.ont = await K(() => { const k = window.__kota; k.step(6, 1 / 30, false); return { state: k.ftth().state, rx: k.ftth().rxDbm, band: k.ftth().band }; });
    const a1 = (await F()).act; out.afterFix = { problem: a1.problem, stage: a1.stage, targets: a1.targets.map(t => `${t.ok}/${t.tested}`), mat: a1.mat, next: a1.next };
    // the test from the family laptop (walk to it, F, typed ping)
    await place(115.4, 581.1, Math.PI, -0.1);
    await walkTo(118.0, 584.0); await walkTo(117.9, 586.6); await walkTo(117.5, 590.2);
    const why = await K(() => window.__kota.why()); out.nearPc = why.pc;
    await pressF();
    for (let i = 0; i < 14 && !(await K(() => window.__kota.pcos.isOpen())); i++) await stepN(3);
    await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(250);
    await K(() => document.querySelector('#pcos .di[title="Command Prompt"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(300);
    await p.click('#pcos .cmd').catch(() => {});
    await p.keyboard.type('ping 8.8.8.8'); await p.keyboard.press('Enter'); await p.waitForTimeout(1900);
    out.pingOk = /Reply from 8\.8\.8\.8|Balasan dari 8\.8\.8\.8/i.test((await K(() => document.querySelector('#pcos .cmd')?.innerText.slice(-300))) ?? '');
    await K(() => document.querySelector('#pcos .leave')?.click()); for (let i = 0; i < 10 && (await K(() => !!window.__kota.seat())); i++) await stepN(3);
    await stepN(4);
    const a2 = (await F()).act; out.tested = { docReady: a2.docReady, stage: a2.stage, targets: a2.targets.map(t => `${t.ok}/${t.tested}`) };
    // T → order letter → berita acara (typed) → sign
    await p.keyboard.press('t'); await p.waitForTimeout(150); await stepN(2);
    out.letterHasBerita = await K(() => !!document.querySelector('textarea[name="field-berita"]'));
    await p.click('textarea[name="field-berita"]');
    await p.keyboard.type(`Drop putus ${out.otdrEnd} m dari port ODP-FLB-01, ditemukan dengan OTDR 1550 nm. Disambung fusion splice (est. ${out.spliceLoss} dB) dengan sleeve, Rx ONT hijau, uji ping 8.8.8.8 dari laptop berhasil.`);
    await click('field-sign');
    out.nota = (await modalTxt())?.slice(0, 500);
    const f = await F(); out.result = { saldo: f.saldo, rep: f.rep, done: f.done, garansi: f.garansi.length, nota: f.nota.at(-1), act: !!f.act };
  } else if (PH !== 'fix' && PH !== 'shots') {
    const sp = await st();
    await go(sp.x, sp.z, sp.lv, Math.PI); await look(-0.05); out.spawn = await stats();
    const V = (PH || '104,566,-2.5,0.12').split(',').map(Number);
    await go(V[0], V[1], 1, V[2]); await look(V[3]); out.rumah = await stats();
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, timeout: 70000 });
    out.ftth = await K(() => window.__kota.ftth?.() ?? null);
  } else {
    // ---- 1. the fault: drop broken 9 m from the ODP port (QA hook writes the break into the live net, same shape as breakFiber)
    out.broken = await K(() => { const k = window.__kota, n = k.ftthNet(); n.breaks.qa = { id: 'qa', span: 'rumah:drop', atM: 9 }; k.step(6, 1 / 30, false); return { state: k.ftth().state, leds: k.ftthLeds(), inet: k.ftth().internet }; });
    // ---- 2. borrow the kit at the Nusa Teknik cabinet (teleport to the cabinet only; real F + buttons)
    await place(51.5, 121.1, 0, -0.1);
    out.lemariSp = (await K(() => window.__kota.why())).sp;
    await pressF(); await click('field-ftth');
    await shot('shelf_before');
    for (const id of ['tangga', 'opm', 'vfl', 'otdr', 'splicer', 'pembersih', 'sleeve', 'kacamata', 'helm', 'sarung', 'harness']) await click(`ftth-take-${id}`);
    await shot('shelf');
    await p.keyboard.press('Escape'); await stepN(2);
    out.kit = (await ui()).has; out.sleeves = (await ui()).sleeves;
    out.chip = await K(() => { const c = document.getElementById('ftth-chip'); return c && { on: c.classList.contains('on'), txt: c.innerText.replace(/\n/g, ' ') }; });
    // ---- 3. OPM at the roset in the house: LO (no light past the break)
    await place(115.3, 581.0, -Math.PI / 2, -0.1); await walkTo(114.8, 580.75);
    out.rosetSp = (await K(() => window.__kota.why())).sp;
    await pressF(); out.rosetModal = (await modalTxt())?.slice(0, 160);
    await click('ftth-lam-1490'); await click('ftth-opm-roset');
    out.opmRoset = await K(() => document.querySelector('.noc-modal [data-opm]')?.dataset.opm ?? null);
    await shot('roset');
    await p.keyboard.press('Escape'); await stepN(2);
    // ---- 4. the pole: ladder, climb (cutscene), ODP panel
    out.climb = await climbUp();
    out.odpModal = (await modalTxt())?.slice(0, 120);
    out.k3 = (await ui()).k3;
    // VFL into the drop toward the house: the leak at the break shows in 3D
    await click('ftth-vfl-odp-port');
    const u1 = await ui(); out.vfl = u1.vfl; out.glows = u1.glows; out.ladderVisible = u1.ladderVisible;
    await shot('odp');
    if (SHOTS) { await K(() => document.querySelector('.noc-modal .noc-box').scrollTop = 330); await shot('odp_vfl'); }
    if (SHOTS) {
      // look at the leak from the ground: come down (VFL stays plugged at the port), street-side view of the span
      await climbDown();
      await K(() => window.__kota.noc.closeModal());
      await place(106.5, 576.8, -1.36, 0.55); await stepN(4, true);
      await shot('vfl_glow');
      await place(104, 571, -2.16, 0.36); await shot('vfl_glow2');
      await climbUp();
    }
    // OTDR at 1550 nm from the ODP port
    await click('ftth-otdr-lam-1550'); await click('ftth-otdr-shot');
    out.otdrEnd = await K(() => document.querySelector('.noc-modal [data-otdr-end]')?.dataset.otdrEnd ?? null);
    out.otdr = (await ui()).otdr;
    await shot('otdr');
    await click('ftth-otdr-back');
    // ---- 5. splice minigame with good inputs
    await click('ftth-splice');
    await click('sp-sleeve-on');
    await shot('splice_strip');
    out.strip = await stopBar('strip');
    await click('sp-clean-alkohol');
    out.cleave = await stopBar('cleave');
    await click('sp-left'); await click('sp-right');
    await shot('splice_align');
    await click('sp-clamp');
    await click('sp-fuse');
    if (await K(() => !!document.querySelector('.noc-modal button[name="sp-redo"]'))) { out.rejected = true; await click('sp-redo'); await click('sp-clean-alkohol'); await stopBar('cleave'); await click('sp-fuse'); }
    await click('sp-heat'); await click('sp-bin');
    out.spliceLoss = await K(() => document.querySelector('.noc-modal [data-loss]')?.dataset.loss ?? null);
    await shot('splice_done');
    await click('sp-apply');
    out.afterSplice = (await modalTxt())?.slice(0, 200);
    out.spliceRes = (await ui()).splice;
    await stepN(10);
    out.glowsAfter = (await ui()).glows;
    await click('ftth-vfl-off');
    // ---- 6. down, ladder back, ONT + LEDs, laptop ping
    out.down = await climbDown();
    await pressF(); await click('ftth-ladder-take'); await p.keyboard.press('Escape'); await stepN(2);
    out.ladderAfter = (await ui()).ladderVisible;
    out.ont = await K(() => { const k = window.__kota; k.step(6, 1 / 30, false); return { ftth: k.ftth(), leds: k.ftthLeds() }; });
    await place(115.4, 581.1, Math.PI, -0.1);
    await walkTo(118.0, 584.0); await walkTo(117.9, 586.6); await walkTo(117.5, 590.2);
    const why = await K(() => window.__kota.why()); out.nearPc = why.pc;
    if (why.pc === 'PROP_RUMAH_01_LAPTOP_01') {
      await pressF();
      for (let i = 0; i < 14 && !(await K(() => window.__kota.pcos.isOpen())); i++) await stepN(3);
      await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(250);
      await K(() => document.querySelector('#pcos .di[title="Command Prompt"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(300);
      await p.click('#pcos .cmd').catch(() => {});
      await p.keyboard.type('ping 8.8.8.8'); await p.keyboard.press('Enter'); await p.waitForTimeout(1800);
      out.ping = (await K(() => document.querySelector('#pcos .cmd')?.innerText.slice(-400)))?.replace(/\n+/g, ' / ');
      out.pingOk = /Reply from 8\.8\.8\.8|Balasan dari 8\.8\.8\.8/i.test(out.ping ?? '');
    }
    out.k3End = (await ui()).k3; out.actions = (await ui()).actions;
  }
} catch (e) { console.log('!!', e.message.slice(0, 300)); out.err = e.message.slice(0, 200); }
console.log('RESULT', JSON.stringify(out, null, 1), '\nerrors', JSON.stringify(errs.slice(0, 6))); await Q.b.close();
