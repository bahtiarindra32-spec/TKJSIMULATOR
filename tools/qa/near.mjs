import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
const root='/workspace/projects/b057e655-c0c1-4cdc-b187-cf16e7554199/kota-nusantara/dist';
const srv=http.createServer((q,r)=>{let p=path.join(root,q.url.split('?')[0]); if(p.endsWith('/'))p+='index.html'; fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)]||'x'}); r.end(d);});}).listen(5195);
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:400,height:300}});
await p.goto('http://localhost:5195/index.html?low',{waitUntil:'domcontentloaded'}); await p.waitForFunction(()=>window.__kota,null,{timeout:90000});
await p.evaluate(()=>window.__kota.pause(true));
for (const a of process.argv.slice(2)) { const [x,z]=a.split(','); console.log(a, JSON.stringify(await p.evaluate(([x,z])=>window.__kota.near(+x,+z,0.5),[x,z]))); }
console.log(JSON.stringify(await p.evaluate(()=>window.__kota.stats())));
await b.close(); srv.close();
