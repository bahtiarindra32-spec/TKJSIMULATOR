// Hotel collision / flicker audit (all 8 floors).
// phases: gaps (wall meshes vs colliders), coplanar (z-fighting faces), reach (walkability + shafts),
//         walk (real-key walks through doorways / into walls), cam (3rd-person camera vs walls/doors/lift car),
//         shots (camera views for visual inspection), flicker (tiny-move frame diff = z-fight detector)
import { boot } from './qa_lib.mjs';
const phases = (process.argv[2] ?? 'gaps,coplanar,reach,walk,cam').split(',');
const Q = await boot(null, { query: process.env.Q ?? '&low' });
const { p, K, step, go, errs } = Q;
const HO = [220, 168];
const out = {};
const LV = [0, 4.0, 7.2, 10.4, 13.6, 16.8, 20.0, 23.2];
const st = () => K(() => window.__kota.state());

// geometry helpers shared by gaps + coplanar (run in page)
const GEO = `
  const root = window.__kota.world.getObjectByName('BLD_HOTEL_NUSANTARA'); root.updateMatrixWorld(true);
  const skipName = n => /^(DOOR_|LIFT_|PLAYER)/.test(n);
  const hiddenUp = o => { let skip = false, vis = true; for (let q = o; q; q = q.parent) { if (q.userData.noCollide || skipName(q.name)) skip = true; if (!q.visible && !q.userData.baked && q.type !== 'Scene') vis = false; } return { skip, vis }; };
  const tr = (e, x, y, z) => [e[0]*x+e[4]*y+e[8]*z+e[12], e[1]*x+e[5]*y+e[9]*z+e[13], e[2]*x+e[6]*y+e[10]*z+e[14]];
  const aligned = e => { for (const c of [0,4,8]) { const v=[Math.abs(e[c]),Math.abs(e[c+1]),Math.abs(e[c+2])]; const m=Math.max(...v); if (v.filter(x=>x>m*0.02).length!==1) return false; } return true; };
  const boxOf = o => { const g=o.geometry, P=g.parameters||{}, e=o.matrixWorld.elements; let hw,hh,hd;
    if (g.type==='BoxGeometry') { hw=P.width/2; hh=P.height/2; hd=P.depth/2; } else if (g.type==='PlaneGeometry') { hw=P.width/2; hh=P.height/2; hd=0; } else return null;
    if (!aligned(e)) return null;
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    for (const sx of [-1,1]) for (const sy of [-1,1]) for (const sz of [-1,1]) { const q=tr(e,sx*hw,sy*hh,sz*hd); for (let k=0;k<3;k++){ mn[k]=Math.min(mn[k],q[k]); mx[k]=Math.max(mx[k],q[k]); } }
    let nAx=-1, nDir=0; if (g.type==='PlaneGeometry') { const n=[e[8],e[9],e[10]]; nAx=[0,1,2].reduce((a,b)=>Math.abs(n[b])>Math.abs(n[a])?b:a,0); nDir=Math.sign(n[nAx]); }
    return { mn, mx, plane: g.type==='PlaneGeometry', nAx, nDir };
  };
`;

for (const ph of phases) {
  console.log(`\n=== ${ph} ===`);
  try {
    if (ph === 'gaps') {
      // every wall-like hotel mesh (>=1.5 m tall, thin, long) must be blocked along its whole centre line at chest height
      const r = await K(GEOSRC => { const { root, hiddenUp, boxOf } = new Function(GEOSRC + '; return { root, hiddenUp, boxOf };')();
        const res = []; let walls = 0;
        root.traverse(o => { if (!o.isMesh || o.isInstancedMesh) return; const hu = hiddenUp(o); if (hu.skip || !hu.vis) return;
          const m = o.material; if (!Array.isArray(m) && m.transparent && (m.opacity ?? 1) < 0.6) return;   // glass
          const b = boxOf(o); if (!b || b.plane) return;
          const w = b.mx[0]-b.mn[0], h = b.mx[1]-b.mn[1], d = b.mx[2]-b.mn[2];
          if (h < 1.5 || Math.min(w, d) > 0.35 || Math.max(w, d) < 0.25) return;
          walls++;
          const alongX = w > d, len = alongX ? w : d; let miss = 0, first = null, n = 0;
          for (let t = 0.05; t < len - 0.04; t += 0.1) { n++;
            const x = alongX ? b.mn[0] + t : (b.mn[0]+b.mx[0])/2, z = alongX ? (b.mn[2]+b.mx[2])/2 : b.mn[2] + t;
            for (const y of [b.mn[1] + 0.9, Math.min(b.mx[1] - 0.05, b.mn[1] + 1.6)]) if (!window.__kota.blockedAt(x + 200, z + 150, y, 0)) { miss++; first ??= [x+200-220, z+150-168, y]; break; } }
          if (miss) res.push(`${o.name || o.parent?.name || '?'} lv@y${b.mn[1].toFixed(2)} miss ${miss}/${n} first local(${first.map(v=>v.toFixed(2)).join(',')}) size ${w.toFixed(2)}x${d.toFixed(2)}x${h.toFixed(2)}`);
        });
        return { walls, res };
      }, GEO);
      console.log('  wall meshes checked', r.walls, 'with gaps', r.res.length); for (const x of r.res.slice(0, 60)) console.log('   ', x);
      const audit = await K(() => window.__kota.solidAudit('BLD_HOTEL_NUSANTARA')); console.log('  solidAudit', audit.length - 1, 'misses;', audit.slice(0, 25).join(' | '));
      out.gaps = r.res.length === 0 ? 'OK' : `GAPS ${r.res.length}`;
    }
    if (ph === 'coplanar') {
      const r = await K(([GEOSRC, TOL]) => { const { root, hiddenUp, boxOf } = new Function(GEOSRC + '; return { root, hiddenUp, boxOf };')();
        const items = []; const solids = [];
        root.traverse(o => { if (!o.isMesh || o.isInstancedMesh) return; const hu = hiddenUp(o); if (!hu.vis) return; if (/^(PLAYER)/.test(o.name)) return;
          const b = boxOf(o); if (!b) return; const m = Array.isArray(o.material) ? o.material[0] : o.material;
          const ds = m.side === 2;
          items.push({ o, b, mat: m.uuid, col: m.color ? m.color.getHexString() : '', map: !!m.map, ds, name: o.name || o.parent?.name || '?', tr: m.transparent && (m.opacity ?? 1) < 0.95 });
          if (!b.plane && !(m.transparent && (m.opacity ?? 1) < 0.95)) solids.push(b);
        });
        // occlusion grid of solid boxes
        const C = 2, grid = new Map(); const kk = (i, j) => i + ',' + j;
        solids.forEach((b, idx) => { for (let i = Math.floor(b.mn[0]/C); i <= Math.floor(b.mx[0]/C); i++) for (let j = Math.floor(b.mn[2]/C); j <= Math.floor(b.mx[2]/C); j++) { const k = kk(i,j); (grid.get(k) ?? grid.set(k, []).get(k)).push(b); } });
        const inside = (p, self) => { const l = grid.get(kk(Math.floor(p[0]/C), Math.floor(p[2]/C))) || []; for (const b of l) if (b !== self && p[0] > b.mn[0]+1e-4 && p[0] < b.mx[0]-1e-4 && p[1] > b.mn[1]+1e-4 && p[1] < b.mx[1]-1e-4 && p[2] > b.mn[2]+1e-4 && p[2] < b.mx[2]-1e-4) return true; return false; };
        // faces
        const faces = [];
        for (const it of items) { const b = it.b;
          const axes = b.plane ? [b.nAx] : [0,1,2];
          for (const ax of axes) { const dirs = b.plane ? (it.ds ? [1,-1] : [b.nDir]) : [-1,1];
            for (const dir of dirs) { const c = b.plane ? b.mn[ax] : (dir > 0 ? b.mx[ax] : b.mn[ax]); const u = (ax+1)%3, v = (ax+2)%3;
              if (b.mx[u]-b.mn[u] < 0.01 || b.mx[v]-b.mn[v] < 0.01) continue;
              if (ax === 1 && dir < 0 && c < 0.01) continue;   // underside at ground level: never visible
              faces.push({ it, ax, dir, c, u0: b.mn[u], u1: b.mx[u], v0: b.mn[v], v1: b.mx[v], self: b.plane ? null : b }); } } }
        const buckets = new Map(); for (const f of faces) { const k = f.ax + ':' + f.dir + ':' + Math.round(f.c * 400); (buckets.get(k) ?? buckets.set(k, []).get(k)).push(f); }
        const hits = new Map();
        for (const [k, list] of buckets) { const [ax, dir, ci] = k.split(':'); const cand = [...list, ...(buckets.get(`${ax}:${dir}:${+ci+1}`) || []), ...(buckets.get(`${ax}:${dir}:${+ci+2}`) || [])];
          for (let a = 0; a < list.length; a++) for (let bI = 0; bI < cand.length; bI++) { const f = list[a], g = cand[bI]; if (f === g || f.it === g.it) continue; if (bI < list.length && bI <= a) continue;
            if (Math.abs(f.c - g.c) > TOL) continue;
            const ou = Math.min(f.u1, g.u1) - Math.max(f.u0, g.u0), ov = Math.min(f.v1, g.v1) - Math.max(f.v0, g.v0);
            if (ou < 0.03 || ov < 0.03) continue;
            const sameLook = f.it.mat === g.it.mat || (f.it.col === g.it.col && !f.it.map && !g.it.map);
            // visible? test overlap centre nudged outward along the normal, must not be inside another solid
            const pc = [0,0,0]; const u = (f.ax+1)%3, v = (f.ax+2)%3; pc[f.ax] = f.c + f.dir * 0.004; pc[u] = (Math.max(f.u0,g.u0)+Math.min(f.u1,g.u1))/2; pc[v] = (Math.max(f.v0,g.v0)+Math.min(f.v1,g.v1))/2;
            if (inside(pc, null)) continue;
            const key = [f.it.name, g.it.name].sort().join(' ~ ') + ` ax${'xyz'[f.ax]}${f.dir>0?'+':'-'} gap${Math.round(Math.abs(f.c-g.c)*1000)}mm ${sameLook ? 'same' : 'DIFF'}`;
            const h = hits.get(key) ?? { n: 0, area: 0, at: [pc[0]+200-220, pc[1], pc[2]+150-168].map(x=>+x.toFixed(2)) }; h.n++; h.area += ou*ov; hits.set(key, h);
          } }
        const list = [...hits.entries()].map(([k, h]) => ({ k, ...h, area: +h.area.toFixed(3) })).sort((a, b) => (b.k.includes('DIFF') - a.k.includes('DIFF')) || b.area - a.area);
        return { faces: faces.length, n: list.length, diff: list.filter(x => x.k.includes('DIFF')).length, list: list.filter(x => x.k.includes('DIFF')).slice(0, 120) };
      }, [GEO, +(process.env.TOL ?? 0.0012)]);
      console.log('  faces', r.faces, 'coplanar visible pairs', r.n, 'different-look', r.diff);
      for (const x of r.list) console.log('   ', x.k, 'n', x.n, 'area', x.area, 'at', JSON.stringify(x.at));
      const real = r.list.filter(x => x.area >= 0.02);   // <2 dm² leftovers are slab-seam undersides inside the slab
      out.coplanar = real.length === 0 ? 'OK' : `DIFF ${real.length}`;
    }
    if (ph === 'reach') {
      const res = [];
      for (let lv = 1; lv <= 8; lv++) {
        const g = await K(lv => window.__kota.reach(lv, 1, 11, 0.2), lv);
        if (g.err) { res.push(`L${lv} ${g.err}`); continue; }
        const at = (x, z) => g.data[Math.floor((z - g.z0) / g.st) * g.W + Math.floor((x - g.x0) / g.st)];
        let stair = 0, lift = 0, outside = 0, total = 0;
        for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) { if (g.data[j * g.W + i] !== '1') continue; total++;
          const x = g.x0 + (i + 0.5) * g.st, z = g.z0 + (j + 0.5) * g.st;
          if (x < 0 || x > 30 || z < 0 || z > 20) outside++;
          else if (x > 15.1 && x < 18.9 && z > 12.7) stair++;
          else if (x > 19.1 && x < 22.9 && z > 12.3) lift++; }
        // every room / zone centre that should be walkable
        const pts = lv === 1 ? { lobi: [3, 10], lounge: [5, 15], it: [18, 8.5], workshop: [25, 8.0], server: [26.5, 13.8], toiletM: [11.2, 14], toiletF: [13.7, 14], corridor: [20, 11] }
          : lv <= 3 ? { corridor: [15, 11], open: [15, 9], meetA: [4, 5.2], meetB: [26, 5.2], pantry: [5, 13.5], idf: [24.75, 13.5], storage: [28.2, 13.5], toiletM: [11.2, 14], toiletF: [13.7, 14] }
          : Object.fromEntries([...[0, 1, 2, 3, 4, 5].map(i => [`r${lv}0${i + 1}`, [i * 5 + 3.8, 5]]), [`r${lv}07`, [3.8, 15]], [`r${lv}08`, [8.8, 15]], ['idf', [24.75, 13.5]], ['linen', [28.2, 13.5]], ['hk', [11.25, 13.5]], ['toilet', [13.75, 13.5]], ['bath401', [1.3, 8.4]]]);
        const bad = Object.entries(pts).filter(([, [x, z]]) => at(x, z) !== '1').map(([k, [x, z]]) => `${k}=${at(x, z)}`);
        res.push(`L${lv} reach=${total} stairShaft=${stair} liftShaft=${lift} outside=${outside} unreachable:[${bad.join(' ')}]`);
      }
      for (const x of res) console.log('  ', x);
      // lift shafts are closed only by the dynamic landing doors (not in this static grid); L1 'outside' = through the open lobby entrance
      out.reach = res.every(x => /stairShaft=0 /.test(x) && (/^L1 /.test(x) || /outside=0 /.test(x)) && /unreachable:\[\]/.test(x)) ? 'OK' : 'ISSUES';
    }
    if (ph === 'walk') {
      // real keys: walk from the corridor through every room door, and straight into walls (must stop at the wall)
      const hold = async (key, frames) => { await p.keyboard.down(key); for (let i = 0; i < frames; i += 3) await step(3); await p.keyboard.up(key); await step(2); };
      const res = []; let fails = 0;
      const tryDoor = async (lv, x, zFrom, yaw, zWant, label) => {
        await go(HO[0] + x, HO[1] + zFrom, lv, yaw); await step(2);
        // open a hinged door with F if one is there
        const hint = (await st()).hint; if (/Buka pintu/.test(hint)) { await p.keyboard.press('f'); await step(30); }
        await hold('w', 60); const s = await st(); const z = s.z - HO[1];
        const ok = yaw === 0 ? z <= zWant : z >= zWant;
        if (!ok) fails++;
        res.push(`${ok ? 'ok ' : 'XX '}L${lv} ${label} door x${x} -> z ${z.toFixed(2)} (want ${yaw === 0 ? '<=' : '>='}${zWant}) y${s.y.toFixed(2)} lv${s.lv}`);
        // close again so later probes see a closed door
        await go(HO[0] + x, HO[1] + zFrom, lv, yaw); await step(2); const h2 = (await st()).hint; if (/Tutup pintu/.test(h2)) { await p.keyboard.press('f'); await step(40); }
      };
      const wallHit = async (lv, x, z, yaw, lim, axis, label) => {
        await go(HO[0] + x, HO[1] + z, lv, yaw); await step(2); await hold('w', 75); const s = await st(); const v = axis === 'z' ? s.z - HO[1] : s.x - HO[0];
        const ok = lim[0] <= v && v <= lim[1]; if (!ok) fails++;
        res.push(`${ok ? 'ok ' : 'XX '}L${lv} wall ${label} -> ${axis} ${v.toFixed(2)} (want ${lim[0]}..${lim[1]})`);
      };
      for (const lv of [1, 2, 4, 6, 8]) {
        if (lv >= 4) {
          for (let i = 0; i < 6; i++) await tryDoor(lv, i * 5 + 3.8, 10.9, 0, 8.5, `room ${lv}0${i + 1}`);
          await tryDoor(lv, 3.8, 11.1, Math.PI, 13.2, `room ${lv}07`); await tryDoor(lv, 8.8, 11.1, Math.PI, 13.2, `room ${lv}08`); await tryDoor(lv, 24.75, 11.1, Math.PI, 13.2, 'IDF');
          // open door leaf of room x01 sticks into the corridor (hinge x3.35, z10..10.9): walking east along z10.5 must stop at it
          await go(HO[0] + 3.8, HO[1] + 10.9, lv, 0); await step(2); if (/Buka pintu/.test((await st()).hint)) { await p.keyboard.press('f'); await step(40); }
          await wallHit(lv, 1.5, 10.45, -Math.PI / 2, [2.9, 3.05], 'x', 'open door leaf 401 (walk east into it)');
          await go(HO[0] + 3.8, HO[1] + 10.9, lv, 0); await step(2); if (/Tutup pintu/.test((await st()).hint)) { await p.keyboard.press('f'); await step(40); }
          await wallHit(lv, 7.5, 11.0, 0, [9.9 + 0.0, 10.6], 'z', 'corridor N (between doors)');
          await wallHit(lv, 1.0, 11.0, Math.PI / 2, [0.45, 0.55], 'x', 'corridor west end wall');
          await wallHit(lv, 3.0, 5.0, -Math.PI / 2, [4.4, 4.75], 'x', 'room split x5');
        } else if (lv <= 3 && lv > 1) {
          await tryDoor(lv, 24.75, 11.0, Math.PI, 13.2, 'IDF'); await tryDoor(lv, 28.25, 11.0, Math.PI, 13.2, 'storage'); await tryDoor(lv, 5, 11.0, Math.PI, 13.2, 'pantry');
          await wallHit(lv, 15, 11.0, Math.PI, [11.4, 11.62], 'z', 'corridor S wall');
          await wallHit(lv, 22.0, 11.0, Math.PI, [11.6, 11.75], 'z', 'closed lift landing door (shaft c22)');
        } else {
          await tryDoor(1, 18, 11.0, 0, 9.0, 'IT office P03'); await tryDoor(1, 26, 11.0, 0, 9.0, 'workshop P04'); await tryDoor(1, 26.5, 11.0, Math.PI, 13.0, 'server P10');
          await wallHit(1, 21.0, 11.0, Math.PI, [11.4, 11.62], 'z', 'S4 between lift voids');
          await wallHit(1, 12.5, 5.0, 0, [0.4, 0.6], 'z', 'lobby curtain wall');
          await wallHit(1, 20.0, 11.0, Math.PI, [11.6, 11.75], 'z', 'closed lift landing door (shaft c20)');
          await wallHit(1, 28, 14.5, -Math.PI / 2, [29.0, 29.6], 'x', 'server room east wall');
        }
      }
      for (const x of res) console.log('  ', x);
      out.walk = fails ? `FAIL ${fails}` : 'OK';
    }
    if (ph === 'cam') {
      // 3rd-person camera: back to a wall / closed door / in the lift car -> the camera must stay on the player's side
      await K(() => window.__kota.setThird(true));
      const res = []; let bad = 0;
      const probe = async (lv, x, z, yaw, pitch, label, test) => {
        await go(HO[0] + x, HO[1] + z, lv, yaw); await K(pt => { window.__kota.player.pitch = pt; }, pitch); await step(20);
        const c = await K(() => window.__kota.camPose()); const lx = c.x - HO[0], lz = c.z - HO[1];
        const ok = test(lx, lz, c.y); if (!ok) bad++;
        res.push(`${ok ? 'ok ' : 'XX '}L${lv} ${label}: cam local (${lx.toFixed(2)}, ${lz.toFixed(2)}) y${c.y.toFixed(2)}`);
      };
      // facing north (yaw 0) the camera sits behind (+z) and 0.35 m to the right (+x). Fail = camera beyond a wall/door plane (it would show the room behind).
      const W12 = 12 - 0.06;   // corridor S wall face (z12, 0.12 thick)
      await probe(4, 3.45, 11.55, 0, 0, 'back to CLOSED door 407 (cam in door axis)', (x, z) => z < W12 - 0.05);
      await probe(4, 7.0, 11.55, 0, 0, 'back to corridor S wall', (x, z) => z < W12 - 0.05);
      await probe(4, 3.45, 11.7, 0, -0.95, 'looking down in front of door 407 (header)', (x, z, y) => z < W12 - 0.05 || y < 10.4 + 2.1 - 0.05);
      await probe(1, 16.65, 11.7, 0, -0.95, 'looking down at L1 stair door (header)', (x, z, y) => z < W12 - 0.05 || y < 2.1 - 0.05);
      await probe(2, 19.65, 11.7, 0, -0.95, 'looking down at L2 lift void (header)', (x, z, y) => z < W12 - 0.05 || y < 4.0 + 2.1 - 0.05);
      await probe(4, 2.0, 0.9, Math.PI, 0, 'back to window wall', (x, z) => z > 0.125 + 0.05);
      await probe(4, 12.45, 11.55, 0, 0, 'back to closed housekeeping door', (x, z) => z < W12 - 0.05);
      // lift car: ride and sample the camera mid-ride
      await go(HO[0] + 21, HO[1] + 10.8, 1, Math.PI); await step(2);
      await K(() => window.__kota.setThird(true));
      await p.keyboard.press('e'); await step(2); await p.keyboard.press('3'); let mid = null;
      for (let i = 0; i < 400; i += 6) { await K(() => window.__kota.step(6, 1 / 30, false)); const v = await K(() => window.__kota.vertical()); if (v.ride?.phase === 'move') { mid = await K(() => window.__kota.camPose()); break; } if (!v.ride && i > 30) break; }
      if (mid) { const lz = mid.z - HO[1], lx = mid.x - HO[0]; const ok = lz < 13.84 - 0.18 && lz > 12.22 && Math.abs(lx - 20) < 0.9 - 0.15 || Math.abs(lx - 22) < 0.9 - 0.15 && lz < 13.66; if (!ok) bad++; res.push(`${ok ? 'ok ' : 'XX '}lift car mid-ride cam local (${lx.toFixed(2)}, ${lz.toFixed(2)}) (car interior z12.22-13.84)`); }
      else { bad++; res.push('XX lift ride did not reach move phase'); }
      for (let i = 0; i < 600 && (await K(() => window.__kota.vertical())).ride; i += 15) await K(() => window.__kota.step(15, 1 / 30, false));
      await K(() => window.__kota.setThird(false));
      for (const x of res) console.log('  ', x);
      out.cam = bad ? `FAIL ${bad}` : 'OK';
    }
    if (ph === 'cull') {
      // floors shown while riding: count how often the visible set changes per frame (popping/blinking = many flips)
      const vis = () => K(() => ['L1','L2','L3','L4','L5','L6','L7','L8'].map(n => window.__kota.world.getObjectByName(n).visible ? 1 : 0).join(''));
      const ride = async (label, start) => { await start(); let prev = await vis(), flips = 0, seq = [prev];
        for (let i = 0; i < 1500; i++) { await K(() => window.__kota.step(1, 1 / 30, false)); const v = await vis(); if (v !== prev) { flips++; seq.push(v); prev = v; } if (i > 5 && !(await K(() => window.__kota.vertical())).ride) break; }
        return `${label}: ${flips} changes ${seq.join('>')}`; };
      const r1 = await ride('stair L2->L3 (1st person)', async () => { await go(HO[0] + 17, HO[1] + 11.0, 2, Math.PI); await step(2); await p.keyboard.press('e'); });
      const r2 = await ride('stair L3->L2', async () => { await go(HO[0] + 17, HO[1] + 11.0, 3, Math.PI); await step(2); await p.keyboard.press('q'); });
      const r3 = await ride('lift L1->L4', async () => { await go(HO[0] + 21, HO[1] + 10.8, 1, Math.PI); await step(2); await p.keyboard.press('e'); await step(1); await p.keyboard.press('4'); });
      for (const x of [r1, r2, r3]) console.log('  ', x);
      out.cull = [r1, r2, r3].every(x => +/: (\d+) changes/.exec(x)[1] <= 4) ? 'OK' : 'POPPING';
    }
    if (ph === 'shots' || ph === 'flicker') {
      if (process.env.SQ) await K(q => window.__kota.setQ(q), process.env.SQ);
      const views = [
        ['l1_lobby', 1, 2.5, 10.5, Math.PI * 0.75, 0], ['l1_corridor', 1, 15, 11, -Math.PI / 2, 0.05], ['l1_server', 1, 28.5, 13.6, Math.PI * 0.8, -0.1],
        ['l1_workshop', 1, 29, 1, Math.PI * 0.8, -0.15], ['l2_office', 2, 2, 8.5, -Math.PI * 0.6, -0.1], ['l2_idf', 2, 24.75, 13.2, Math.PI, -0.2],
        ['l4_corridor', 4, 1, 11, -Math.PI / 2, 0.05], ['l4_room', 4, 3.8, 9.0, 0.3, -0.15], ['l6_room_back', 6, 3.8, 13.2, Math.PI, -0.15], ['l8_corridor_up', 8, 15, 11, -Math.PI / 2, 0.5],
        ['l4_floor_down', 4, 15, 11, -Math.PI / 2, -0.9],
      ];
      const only = process.env.VIEWS ? process.env.VIEWS.split(',') : null;
      for (const [n, lv, x, z, yaw, pitch] of views) {
        if (only && !only.includes(n)) continue;
        await go(HO[0] + x, HO[1] + z, lv, yaw); await K(pt => { window.__kota.player.pitch = pt; }, pitch); await K(() => window.__kota.step(20, 1 / 30, false));
        if (ph === 'shots') { await K(() => window.__kota.step(1)); await p.screenshot({ path: `/workspace/work/shots/hotel_${n}.png` }); console.log('  shot', n); continue; }
        // flicker: two renders 3 mm apart along the view axis; z-fighting shows up as scattered large pixel changes
        await K(() => window.__kota.step(1)); const a = (await p.screenshot()).toString('base64');
        await K(() => { const P = window.__kota.player; P.pos.x -= Math.sin(P.yaw) * 0.003; P.pos.z -= Math.cos(P.yaw) * 0.003; window.__kota.step(1, 1 / 30); });
        const b = (await p.screenshot()).toString('base64');
        const d = await K(async ([a, b]) => {
          const load = src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + src; });
          const [A, B] = await Promise.all([load(a), load(b)]); const W = A.width, H = A.height;
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
          g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, W, H).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, W, H).data;
          let n = 0; const cells = new Map(); const mk = g.createImageData(W, H);
          for (let y = 60; y < H - 60; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const dd = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); const j = i; mk.data[j] = da[i] * 0.35; mk.data[j + 1] = da[i + 1] * 0.35; mk.data[j + 2] = da[i + 2] * 0.35; mk.data[j + 3] = 255; if (dd > 90) { mk.data[j] = 255; mk.data[j + 1] = 0; mk.data[j + 2] = 255; n++; const k = `${x >> 5},${y >> 5}`; cells.set(k, (cells.get(k) || 0) + 1); } }
          const hot = [...cells.entries()].filter(([, c]) => c > 40).sort((p, q) => q[1] - p[1]).slice(0, 6);
          g.putImageData(mk, 0, 0); return { n, hot, png: cv.toDataURL('image/png').split(',')[1] };
        }, [a, b]);
        console.log(`  ${n}: changed px ${d.n}, hot 32px cells ${JSON.stringify(d.hot)}`);
        if (d.hot.length) { const fs = await import('fs'); fs.writeFileSync(`/workspace/work/shots/flick_${n}.png`, Buffer.from(d.png, 'base64')); }
      }
      if (ph === 'shots' && (!only || only.includes('exterior'))) { await K(() => { window.__kota.goView('hotel'); window.__kota.step(30, 1 / 30, false); window.__kota.step(1); }); await p.screenshot({ path: '/workspace/work/shots/hotel_exterior.png' }); console.log('  shot exterior'); }
      out[ph] = 'done';
    }
  } catch (e) { console.log('  !! error', e.message.slice(0, 400)); out[ph] = 'ERROR'; }
}
console.log('\nRESULT', JSON.stringify(out), 'errors', JSON.stringify(errs.slice(0, 5)));
await Q.b.close();
