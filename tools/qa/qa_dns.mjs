// DNS SERVFAIL (bind9 zone fails to load) + lab router DHCP page (srv-nusa serves lab DHCP).
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'servfail,router').split(',');
const Q = await boot(null);
const { p, K, goPc, openPc, openCmd, cmd, cmdText, closePc, closeWins, browser, routerLogin, routerNav, errs } = Q;
const out = {};
const PC = 'PROP_L1_PC_WORKSHOP_01';
for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'servfail') {
      // break the zone exactly like the 'syntax' ticket variant (letter O in an address) and reload bind9
      await K(() => { const L = window.__kota.linux, f = '/etc/bind/db.lab.smk.local'; L.files.set(f, L.files.get(f).replace(/^wlc\s+IN\s+A\s+\S+/m, 'wlc      IN A    192.168.10.2O')); L.start('bind9'); });
      await goPc(PC); await openPc(PC); await openCmd();
      await cmd('nslookup intranet.lab.smk.local', 500); const ns = await cmdText(); console.log('  nslookup (zone broken):', ns.slice(-170).replace(/\n+/g, ' / '));
      await cmd('ping intranet.lab.smk.local', 600); const pg = await cmdText(); console.log('  ping:', pg.slice(-110).replace(/\n+/g, ' / '));
      await cmd('nslookup cari.id', 500); const ext = await cmdText(); console.log('  nslookup internet name:', ext.slice(-120).replace(/\n+/g, ' / '));
      await cmd('ssh teknisi@192.168.10.5', 300); await cmd('smkbisa', 300);
      await cmd('host intranet.lab.smk.local', 250); await cmd('nslookup intranet.lab.smk.local 127.0.0.1', 250); await cmd('dig intranet.lab.smk.local', 250); const sv = await cmdText(); console.log('  server side:', sv.slice(-420).replace(/\n+/g, ' / '));
      await cmd('exit', 300);
      const web = await browser('intranet.lab.smk.local'); console.log('  browser:', web?.slice(0, 160).replace(/\n+/g, ' / '));
      // repair and check a genuinely missing name still says NXDOMAIN / Non-existent domain
      await K(() => { const L = window.__kota.linux, f = '/etc/bind/db.lab.smk.local'; L.files.set(f, L.files.get(f).replace(/192\.168\.10\.2O/g, '192.168.10.20')); L.start('bind9'); });
      await closeWins(); await openCmd();
      await cmd('nslookup tidakada.lab.smk.local', 500); const nx = await cmdText(); console.log('  nslookup missing name (zone OK):', nx.slice(-120).replace(/\n+/g, ' / '));
      await cmd('nslookup intranet.lab.smk.local', 500); const okk = await cmdText(); console.log('  nslookup intranet (zone OK):', okk.slice(-90).replace(/\n+/g, ' / '));
      await closeWins(); await closePc();
      const a = /can't find intranet\.lab\.smk\.local: Server failed/.test(ns) && !/Non-existent domain/.test(ns.slice(-170));
      const b = /Ping request could not find host intranet\.lab\.smk\.local/.test(pg);
      const c = /SERVFAIL/.test(sv) && /2\(SERVFAIL\)/.test(sv);
      const d = /Non-existent domain/.test(nx.slice(-120)) && /192\.168\.10\.5/.test(okk.slice(-90));
      const e = /ERR_NAME_NOT_RESOLVED/.test(web ?? '') || /SERVFAIL/.test(web ?? '');
      console.log('  checks', { nslookupServerFailed: a, pingCouldNotFind: b, serverSideServfail: c, nxdomainStillNx: d, browser: e });
      out.servfail = a && b && c && d && e ? 'OK' : 'FAIL';
    }
    if (ph === 'router') {
      await goPc(PC); await openPc(PC); await openCmd(); await cmd('ipconfig /all', 500); const ip = await cmdText(); const dh = /DHCP Server[ .]*: ([\d.]+)/.exec(ip)?.[1]; console.log('  ipconfig /all DHCP Server:', dh);
      await closeWins();
      const pg = await browser('192.168.10.1', 500); console.log('  router page', pg?.slice(0, 60).replace(/\n/g, ' '));
      await routerLogin(); await routerNav('IP › DHCP Server'); await p.waitForTimeout(150);
      const t = await K(() => document.querySelector('#pcos .brw .page')?.innerText.replace(/\n+/g, ' | ').slice(0, 700)); console.log('  dhcp page:', t);
      const hasToggle = await K(() => !!document.querySelector('#pcos .brw input[name=dhcp-on]'));
      await closeWins(); await closePc();
      const ok = dh === '192.168.10.5' && /Disabled/.test(t ?? '') && /srv-nusa \(192\.168\.10\.5\)/.test(t ?? '') && !hasToggle && !/Aktif · interface 192\.168\.10\.1/.test(t ?? '');
      console.log('  checks', { dhcpServerIsSrv: dh === '192.168.10.5', disabled: /Disabled/.test(t ?? ''), namesServer: /srv-nusa \(192\.168\.10\.5\)/.test(t ?? ''), noRouterToggle: !hasToggle });
      out.router = ok ? 'OK' : 'FAIL';
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 300)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
