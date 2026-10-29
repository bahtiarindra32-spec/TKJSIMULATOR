import { boot } from './qa_lib.mjs';
const Q = await boot(null); const { p, K } = Q;
console.log('after boot', await K(() => JSON.stringify(window.__kota.state())), p.url());
await Q.go(246.5, 183.5, 1, 0);
console.log('after go', await K(() => JSON.stringify(window.__kota.state())));
await Q.b.close();
