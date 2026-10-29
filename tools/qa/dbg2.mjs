import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); p.on('console',m=>console.log('C',m.text()));
await p.setContent('<button id=b onclick="console.log(\'hit\')">x</button><script>window.addEventListener("keydown",e=>console.log("k",e.code))</script>');
await p.click('#b'); await p.keyboard.press('KeyW'); await p.waitForTimeout(300); await b.close();
