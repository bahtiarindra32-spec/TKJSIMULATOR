import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
const root='/workspace/work/kota-single'; const out='/workspace/work/shots';
const W=+(process.argv[3]||1280), H=+(process.argv[4]||800);
const srv=http.createServer((q,r)=>{let p=path.join(root,q.url.split('?')[0]); if(p.endsWith('/'))p+='index.html'; fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)]||'x'}); r.end(d);});}).listen(5196);
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:W,height:H}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5196/index.html',{waitUntil:'domcontentloaded'}); await p.waitForFunction(()=>window.__kota,null,{timeout:90000}); await p.waitForTimeout(1500);
await p.evaluate(()=>window.__kota.pause(true)); await p.waitForTimeout(800);
const st=async(l)=>console.log(l, JSON.stringify(await p.evaluate(()=>window.__kota.state())));
const step=async(n)=>{ await p.evaluate(n=>window.__kota.step(n),n); };
const hold=async(code,frames)=>{ await p.keyboard.down(code); await p.waitForTimeout(50); await step(frames); await p.keyboard.up(code); await p.waitForTimeout(50); };
const shot=async(n)=>{ await step(1); await p.screenshot({path:`${out}/${n}.png`}); };
for (const a of process.argv[2].split(',')) {
  const [k,...rest]=a.split(':');
  if(k==='click'){ await p.click(rest[0]); await p.waitForTimeout(200); await step(2); }
  else if(k==='hold'){ await hold(rest[0], +rest[1]); }
  else if(k==='press'){ await p.keyboard.press(rest[0]); await p.waitForTimeout(100); await step(2); }
  else if(k==='shot'){ await shot(rest[0]); }
  else if(k==='view'){ await p.click(`#views button[data-id="${rest[0]}"]`); await p.waitForTimeout(100); await step(60); }
  else if(k==='tp'){ await p.evaluate(r=>window.__kota.teleport(+r[0],+r[1],+(r[2]||1),+(r[3]??Math.PI)),rest); await step(2); }
  await st(a);
}
console.log('errors:', errs.join(' | ')); await b.close(); srv.close();
