// Screenshot tour: lab building + hotel, task by task. node qa_tour.mjs <phase>
import { boot } from './qa_lib.mjs';
const ph = process.argv[2];
const Q = await boot({ v: 1, xp: 900, shifts: 2, closed: 5, slaMet: 5, seq: 9, contracts: 3, stars: 12, days: 2, streak: 1, best: 25, day: null, seen: ['tutor'], mastery: { tutor: { ok: 1, miss: 0 } } });
const { p, K, step, go, press, openPc, openCmd, cmd, closePc, closeWins, browser, mclick, goAnchor, goPc, errs } = Q;
const shot = async n => { await K(() => window.__kota.step(2)); await p.screenshot({ path: `/workspace/work/tour/${n}.png`, timeout: 60000 }); console.log('  shot', n); };
const sp = k => K(k => window.__kota.labSpots()[k], k);
const at = async (k, dx = 0, dz = 0.6, yaw) => { const s = await sp(k); await go(s[0] + dx, s[1] + dz, 1, yaw ?? 0); };
const goLabPc = async name => { const c = await K(n => window.__kota.pcs().find(c => c.name === n), name); for (const [dx, dz] of [[0, .9], [0, -.9]]) { await go(c.x + dx, c.z + dz, 1); if (await K(() => window.__kota.nearPc()) === name) return; } };
const resume = () => K(() => window.__kota.menu?.resume?.());
const startLab = () => K(() => window.__kota.praktik.start({ steps: ['crimp', 'desk', 'static', 'dhcp', 'vlan', 'dns', 'trouble'], minutes: 90, perStudent: true, seed: 4242 }, 'K7M2QX', 'Sari Dewi · XI TKJ 1'));
try {
  if (ph === 'lab1') {
    await go(266, 486, 1, Math.PI * 0.78); await step(4); await shot('L01_gedung_lab_luar');
    await go(250.5, 500, 1, Math.PI / 2); await step(4); await shot('L02_dalam_lab_arah_papan');
    await go(238, 500, 1, -Math.PI / 2); await step(4); await shot('L03_dalam_lab_arah_rak_pintu');
    await at('guru', 0.7, 0); await press('f'); await shot('L04_meja_guru');
    await mclick('lab-teacher'); for (const id of ['dhcp', 'vlan', 'dns', 'trouble']) await K(id => { const c = document.querySelector(`.noc-modal input[name=lab-${id}]`); c.checked = true; c.dispatchEvent(new Event('change')); }, id); await shot('L05_guru_susun_jobsheet');
    await mclick('lab-try'); await p.fill('.noc-modal input[name=lab-name]', 'Sari Dewi · XI TKJ 1'); await K(() => document.querySelector('.noc-modal input[name=lab-code]').dispatchEvent(new Event('input'))); await shot('L06_siswa_masukkan_kode');
    await K(() => window.__kota.noc.closeModal()); await startLab(); await step(2); await shot('L07_jobsheet_langkah1_crimping');
  } else if (ph === 'lab2') {
    await startLab(); const st = await K(() => window.__kota.praktik.state());
    await at('tools', -0.6, 0); await press('f'); await mclick('take-tester'); await mclick('take-console'); await mclick('take-laptop'); await shot('L08_lemari_alat_lab'); await press('Escape');
    await at('crimp', 0, 0.3); await press('f');
    for (const w of ['putih-oranye', 'oranye', 'putih-hijau', 'biru', 'putih-biru']) await mclick(`wire-${w}`); await shot('L09_crimping_menyusun_T568B');
    for (const w of ['hijau', 'putih-coklat', 'coklat']) await mclick(`wire-${w}`); await mclick('crimp-do');
    for (const w of ['putih-oranye', 'oranye', 'putih-hijau', 'biru', 'putih-biru', 'hijau', 'putih-coklat', 'coklat']) await mclick(`wire-${w}`); await mclick('crimp-do'); await mclick('crimp-test'); await shot('L10_tes_LAN_tester'); await mclick('crimp-keep'); await press('Escape');
    await goLabPc(st.pc); await press('c'); await shot('L11_cek_fisik_meja');
    await K(() => [...document.querySelectorAll('.noc-modal button')].find(b => /phys-install/.test(b.name))?.click()); await press('Escape');
    await openPc(st.pc); await openCmd(); await cmd('ipconfig', 600); await cmd('ping 192.168.70.1', 4500); await shot('L12_ping_gateway_lab'); await closeWins(); await closePc();
    await K(() => window.__kota.praktik.tick()); await step(2); await shot('L13_jobsheet_langkah2_pengkabelan');
    await at('rack', 0, 0.4, 0); await press('f'); await shot('L14_rak_lab_patchpanel_SW-LAB');
    await mclick('console-SW-LAB'); await p.waitForTimeout(200); await p.click('.swcli .swin'); await p.keyboard.press('Enter');
    for (const l of ['enable', 'show vlan brief']) { await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(80); } await shot('L15_console_SW-LAB');
    await press('Escape'); await K(() => window.__kota.praktik.finish(true)); await step(2); await shot('L16_lembar_hasil');
  } else if (ph === 'hotel1') {
    await go(236, 158, 1, Math.PI * 1.05); await step(4); await shot('H01_hotel_luar');
    await go(226, 172, 1, 0); await step(4); await shot('H02_lobby');
    await K(() => window.__kota.noc.openBoard()); await shot('H03_papan_kerja_NOC');
    await K(() => window.__kota.noc.closeModal()); await goAnchor('RACKP'); await press('f'); await shot('H04_rak_MDF_ruang_server');
    await K(() => window.__kota.noc.closeModal()); await goAnchor('CABINET'); await press('f'); await shot('H05_lemari_alat_workshop');
    await K(() => window.__kota.noc.closeModal()); await step(3); await shot('H06_workshop_TKJ');
  } else if (ph === 'hotel2') {
    if (!process.env.SKIP) { const d = await K(() => window.__kota.idfs()[0]); await go(d.x, d.z + 0.9, d.level); await press('f'); await shot('H07_rak_IDF_lantai2'); await K(() => window.__kota.noc.closeModal()); }
    const pc = await K(() => window.__kota.pcs().find(c => /_L2_PC_/.test(c.name)).name);
    await goPc(pc); await K(() => window.__kota.noc.closeModal()); await K(n => window.__kota.pcos.open(n, n), pc); await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(300); if (!process.env.SKIP) { await shot('H08_desktop_PC_kantor'); await openCmd(); await cmd('ipconfig /all', 700); await shot('H09_ipconfig_kantor'); }
    await closeWins(); await p.waitForTimeout(500); await K(() => document.querySelector('#pcos .di[title="Tepi"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await p.waitForTimeout(400); await K(() => { const i = document.querySelector('#pcos .brw .nav input'); i.focus(); i.value = 'http://192.168.20.1'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await p.waitForTimeout(900); console.log('  page', await K(() => document.querySelector('#pcos .brw .page')?.innerText.slice(0, 80))); await K(() => document.querySelector('#pcos .brw button[name=login]')?.click()); await p.waitForTimeout(300); await shot('H10_router_webkonfig'); await closeWins(); await closePc();
    const lap = await K(() => window.__kota.pcs().find(c => /_L5_LAPTOP_/.test(c.name)).name);
    await K(n => window.__kota.pcos.open(n, n), lap); await K(() => document.querySelector('#pcos .lock button')?.click()); await p.waitForTimeout(300); await shot('H11_laptop_tamu_kamar_L5'); await closePc();
    await at('rack', 0, 0.4, 0); await press('f'); await shot('L14_rak_lab_patchpanel_SW-LAB');
  } else if (ph === 'hotel3') {
    await K(() => window.__kota.noc.openBoard()); await K(() => { const b = [...document.querySelectorAll('.noc-modal button')].find(b => /^accept/.test(b.name) || /Terima|Ambil/.test(b.textContent)); b?.click(); }); await step(2); await shot('H12_SPK_surat_kerja');
    await K(() => window.__kota.noc.closeModal()); await go(220 + 15, 168 + 12, 1, Math.PI / 2); await step(3); await shot('H13_ruang_IT_NOC');
  }
} catch (e) { console.log('  !!', e.message.slice(0, 300)); }
console.log('DONE', ph, 'errors', JSON.stringify(errs.slice(0, 3)));
process.exit(0);
