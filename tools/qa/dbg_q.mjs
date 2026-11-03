import { boot } from './qa_lib.mjs';
const { b, K } = await boot(null, { viewport: { width: 640, height: 360 } });
console.log('RESULT', JSON.stringify(await K(() => ({ perf: window.__kota.perf(), gfxBtn: getComputedStyle(document.getElementById('btnGfx')).display }))));
await b.close();
