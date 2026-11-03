import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto('http://127.0.0.1:8787/', { waitUntil: 'commit', timeout: 60000 });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 120000 });
console.log(await p.evaluate(() => { const k = window.__kota; k.pause(true); k.noc.startShift(Math.random, ['dns', 'released']); k.noc.closeModal();
  const out = [];
  for (const t of k.noc.tickets) { const a = k.pcos.adapter(t.pc.name); out.push(t.faults[0] + ' before ' + k.noc.isHealthy(t) + ' ' + JSON.stringify({ dhcp: a.dhcp, auto: a.dnsAuto, d: a.dns1, lease: a.lease }));
    if (t.faults[0] === 'dns') a.dnsAuto = true; else a.lease = undefined;
    out.push(' after ' + k.noc.isHealthy(t) + ' ' + JSON.stringify({ dhcp: a.dhcp, auto: a.dnsAuto, ip: a.ip, mask: a.mask, gw: a.gw, d1: a.dns1 })); }
  return out.join('\n'); }));
await b.close();
