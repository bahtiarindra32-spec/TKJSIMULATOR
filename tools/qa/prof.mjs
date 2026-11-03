import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const c = await p.context().newCDPSession(p);
await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 2000 }); await c.send('Profiler.start');
const t0 = Date.now();
await p.goto('http://127.0.0.1:8787/?low', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__kota && window.__kota.noc, null, { timeout: 100000 });
console.log('loaded', Date.now() - t0);
const { profile } = await c.send('Profiler.stop');
// self time per function
const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; const cnt = new Map();
profile.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dt[i] || 0)));
for (const [id, t] of cnt) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} @${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`; self.set(k, (self.get(k) || 0) + t); }
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, t]) => `${(t / 1000).toFixed(0)}ms ${k}`).join('\n'));
// inclusive per function
const parent = new Map(); for (const n of profile.nodes) for (const ch of n.children || []) parent.set(ch, n.id);
const incl = new Map();
for (const [id, t] of cnt) { const seen = new Set(); let x = id; while (x) { const n = byId.get(x); const k = `${n.callFrame.functionName || '(anon)'} @${n.callFrame.lineNumber}`; if (!seen.has(k)) { incl.set(k, (incl.get(k) || 0) + t); seen.add(k); } x = parent.get(x); } }
console.log('--- inclusive'); console.log([...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, t]) => `${(t / 1000).toFixed(0)}ms ${k}`).join('\n'));
await b.close();
