import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1280,height:800}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///workspace/work/kota-single/kota-nusantara.html',{waitUntil:'commit',timeout:90000}); await p.waitForFunction(()=>window.__kota,null,{timeout:90000});
await p.evaluate(()=>window.__kota.pause(true)); await p.click('#enter'); await p.evaluate(()=>window.__kota.step(3));
console.log(JSON.stringify(await p.evaluate(()=>({s:window.__kota.state(), m:window.__kota.missions.isModalOpen(), css:getComputedStyle(document.getElementById('minimap')).position}))));
await p.screenshot({path:'/workspace/work/shots/single.png'}); console.log('errs',errs); await b.close();
