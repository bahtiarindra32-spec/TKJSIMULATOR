import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
const PORT=5300+Math.floor(Math.random()*600);
const root='/workspace/work/devices-dist'; const out='/workspace/work/devshots'; fs.mkdirSync(out,{recursive:true});
const views=(process.argv[2]||'overview').split(','); const W=+(process.argv[3]||1280), H=+(process.argv[4]||800); const tag=process.argv[5]||'';
const srv=http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0])); if(p.endsWith('/'))p+='devices.html'; fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)]||'application/octet-stream'}); r.end(d);});}).listen(PORT);
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:W,height:H}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text())});
const t0=Date.now();
await p.goto(`http://localhost:${PORT}/devices.html?still`,{waitUntil:"domcontentloaded",timeout:120000}); await p.waitForFunction(()=>window.__ready,null,{timeout:180000});
console.log('ready in',Date.now()-t0,'ms');
if (process.argv.includes('stats')) console.log(JSON.stringify(await p.evaluate(()=>window.__stats)));
for (const v of views){ const nl=v.endsWith('!'); const vv=nl?v.slice(0,-1):v; await p.evaluate(([v,nl])=>{window.__labels(!nl);window.__setView(v)},[vv,nl]); await p.waitForTimeout(300); await p.screenshot({path:`${out}/${tag}${vv}.png`}); console.log('shot',vv); }
console.log('errors:', errs.slice(0,10).join(' | ')); await b.close(); srv.close();
