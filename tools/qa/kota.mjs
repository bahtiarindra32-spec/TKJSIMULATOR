import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.argv[2]; const out = process.argv[3]; const views = (process.argv[4]||'overview').split(','); const W=+(process.argv[5]||1440), Hh=+(process.argv[6]||900);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv = http.createServer((q,r)=>{ let p=path.join(root, decodeURIComponent(q.url.split('?')[0])); if(p.endsWith('/')) p+='index.html'; fs.readFile(p,(e,d)=>{ if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'}); r.end(d);});}).listen(5199);
const b = await chromium.launch({executablePath:'/usr/bin/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p = await b.newPage({viewport:{width:W,height:Hh}});
const errs=[]; p.on('console', m=>{ if(m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); }); p.on('pageerror', e=>errs.push('pageerror: '+e.message));
await p.goto('http://localhost:5199/index.html',{waitUntil:'domcontentloaded'}); await p.waitForFunction(()=>window.__kota, null, {timeout:120000});
await p.waitForTimeout(2500);
for (const v of views) {
  if (v.startsWith('key:')) { const [, code, ms] = v.split(':'); await p.keyboard.down(code); await p.waitForTimeout(+ms); await p.keyboard.up(code); console.log(v, JSON.stringify(await p.evaluate(()=>({x:window.__kota.player.pos.x+200, z:window.__kota.player.pos.z+150, y:window.__kota.player.pos.y, lv:window.__kota.player.level, loc:document.getElementById('hudLoc').textContent, hint:document.getElementById('hudHint').textContent})))); continue; }
  if (v.startsWith('shot')) { await p.waitForTimeout(800); await p.screenshot({path: `${out}/${v.replace(/[:.]/g,'_')}.png`}); continue; }
  if (v.startsWith('enter')) { await p.click('#enter'); await p.waitForTimeout(1500); await p.screenshot({path: `${out}/enter.png`}); continue; }
  if (v.startsWith('walk')) { const [, X, Z, lv, yaw] = v.split(':'); await p.evaluate(([X,Z,lv,yaw])=>{ window.__kota.enterWalk(); window.__kota.teleport(+X,+Z,+lv,+yaw); }, [X,Z,lv||1,yaw||Math.PI]); }
  else await p.evaluate(id=>window.__kota.goView(id), v);
  await p.waitForTimeout(2500);
  await p.screenshot({path: `${out}/${v.replace(/[:.]/g,'_')}.png`});
}
console.log(JSON.stringify(await p.evaluate(()=>window.__kota.stats())));
console.log(errs.slice(0,15).join('\n'));
await b.close(); srv.close();
