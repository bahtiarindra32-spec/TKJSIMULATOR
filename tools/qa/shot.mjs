import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setContent('<h1>ok</h1>'); await p.screenshot({path:'t.png'}); await b.close(); console.log('ok');
