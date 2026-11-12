// Fase 1 chunk 2: field-work career layer. Pure logic (orders, money, reputasi, garansi, save migration) and every
// order template driven through the real network simulation: inject → customer device broken → fix with the same state
// change the in-game tool makes → healthy and root cause gone.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, adapterOf, ADAPTERS, ENVS, patchCord, SWITCHES } from '../src/pcos/net';
import { CLIENTS } from '../src/pcos/wifi';
import { initSiteClients } from '../src/pcos/sites';
import { SITE_PCS, SITE_AP_DEFS } from '../src/data/sites';
import { mulberry } from '../src/game/noc/util';
import { FIELD_TPLS, TPL_IDS } from '../src/game/field/templates';
import { tarifFor, payout, materialCost, denda, applyRep, PRICE, STAR_PAY, REP_FLOOR, round5k } from '../src/game/field/economy';
import { genDay, availableTpls, planGaransi, garansiOrder, openDay, closeDay, makeOrder } from '../src/game/field/orders';
import { parseField, freshField, FIELD_KEY } from '../src/game/field/save';
import { inject, rootProblem, cableWeak, snapshotSites, restoreSites, ok, sw, ap, siteDevices, NEW_ROUTER, LAPTOP_RUMAH, TV } from '../src/game/field/sim';
import { T568A, T568B } from '../src/game/crimp';
import { beritaFactCheck, stageBarHtml } from '../src/game/noc/berita';
import { noMat, type Rep, type FieldTplId } from '../src/game/field/types';

const REP0: Rep = { rumah: 50, kos: 50, warnet: 50 };

describe('economy', () => {
  it('tarif stays inside the research range, rounded to Rp5.000, higher with better reputasi', () => {
    for (const id of TPL_IDS) {
      const [lo, hi] = FIELD_TPLS[id].tarif;
      for (let i = 0; i <= 20; i++)
        for (const rep of [0, 50, 100]) {
          const t = tarifFor([lo, hi], rep, i / 20);
          expect(t).toBeGreaterThanOrEqual(lo);
          expect(t).toBeLessThanOrEqual(hi);
          expect(t % 5000).toBe(0);
        }
      expect(tarifFor([lo, hi], 100, 0.5)).toBeGreaterThan(tarifFor([lo, hi], 0, 0.5));
    }
  });
  it('pay = fee × star factor − material; garansi pays no fee', () => {
    const m = { rj45: 2, utp: 1.5, patch: 0, router: 0 };
    expect(materialCost(m)).toBe(2 * PRICE.rj45 + 1.5 * PRICE.utp);
    expect(materialCost({ ...noMat(), utp: 1.2 })).toBe(1.5 * PRICE.utp);            // per started half metre
    const p3 = payout(200_000, 3, m), p2 = payout(200_000, 2, m), p1 = payout(200_000, 1, m);
    expect(p3.jasa).toBe(200_000);
    expect(p2.jasa).toBe(200_000 * STAR_PAY[2]);
    expect(p1.jasa).toBe(200_000 * STAR_PAY[1]);
    expect(p3.net).toBe(200_000 - materialCost(m));
    const g = payout(200_000, 3, { ...noMat(), router: 1 }, true);
    expect(g.jasa).toBe(0);
    expect(g.net).toBe(-PRICE.router);
    expect(denda(150_000)).toBe(round5k(15_000));
  });
  it('reputasi is clamped 0..100 and moves only the customer type involved', () => {
    let r: Rep = { ...REP0 };
    for (let i = 0; i < 20; i++) r = applyRep(r, 'kos', 'done3');
    expect(r.kos).toBe(100);
    expect(r.rumah).toBe(50);
    for (let i = 0; i < 20; i++) r = applyRep(r, 'warnet', 'garansiIgnored');
    expect(r.warnet).toBe(0);
  });
});

describe('order board', () => {
  it('2–4 offers per day, no template twice, all tied to available templates', () => {
    for (let s = 1; s < 60; s++) {
      const offers = genDay(1, REP0, 0, mulberry(s));
      expect(offers.length).toBeGreaterThanOrEqual(2);
      expect(offers.length).toBeLessThanOrEqual(4);
      expect(new Set(offers.map(o => o.tpl)).size).toBe(offers.length);
      for (const o of offers) expect(availableTpls(REP0)).toContain(o.tpl);
    }
  });
  it('reputasi gates orders: advanced ones need more, a type below the floor stops calling', () => {
    expect(availableTpls(REP0)).not.toContain('r_router');
    expect(availableTpls({ ...REP0, rumah: 60 })).toContain('r_router');
    const low = availableTpls({ rumah: REP_FLOOR - 1, kos: 50, warnet: 50 });
    expect(low.some(id => FIELD_TPLS[id].cust === 'rumah')).toBe(false);
    // good reputasi with one type makes its orders more frequent
    const count = (rep: Rep) => {
      let n = 0;
      for (let s = 1; s < 300; s++) n += genDay(1, rep, 0, mulberry(s)).filter(o => o.cust === 'warnet').length;
      return n;
    };
    expect(count({ rumah: 50, kos: 50, warnet: 95 })).toBeGreaterThan(count({ rumah: 50, kos: 50, warnet: 25 }));
  });
  it('a weak close schedules a garansi 1–2 days later; it appears unpaid and costs reputasi when ignored', () => {
    const o = makeOrder('w_port', 3, 7, REP0, mulberry(4));
    const days = new Set<number>();
    for (let s = 1; s < 40; s++) days.add(planGaransi(o, 'config', { pc: 'X' }, 3, mulberry(s)).showDay);
    expect([...days].sort()).toEqual([4, 5]);
    const g = garansiOrder(planGaransi(o, 'config', { pc: 'X' }, 3, () => 0.1), 9);
    expect(g.kind).toBe('garansi');
    expect(g.tarif).toBe(0);
    expect(g.due).toBe(5);
    // day flow on a save
    const s = freshField();
    s.day = 3;
    s.garansi = [planGaransi(o, 'config', { pc: 'X' }, 3, () => 0.1)];   // shows on day 4
    openDay(s, mulberry(1));
    expect(s.offers.some(x => x.kind === 'garansi')).toBe(false);
    closeDay(s, mulberry(2));                                            // → day 4: the callback appears (−3 warnet)
    expect(s.day).toBe(4);
    expect(s.offers.filter(x => x.kind === 'garansi')).toHaveLength(1);
    expect(s.rep.warnet).toBe(47);
    closeDay(s, mulberry(3));                                            // → day 5: still there (due day 5)
    expect(s.offers.filter(x => x.kind === 'garansi')).toHaveLength(1);
    closeDay(s, mulberry(4));                                            // → day 6: ignored, −10
    expect(s.offers.filter(x => x.kind === 'garansi')).toHaveLength(0);
    expect(s.rep.warnet).toBe(37);
  });
  it('an accepted order still open at the end of the day fails: denda, reputasi −8, nota recorded', () => {
    const s = freshField();
    openDay(s, mulberry(9));
    const o = s.offers[0];
    o.status = 'active';
    const before = s.rep[o.cust];
    const res = closeDay(s, mulberry(10));
    expect(res.failed.map(x => x.id)).toEqual([o.id]);
    expect(s.saldo).toBe(-denda(o.tarif));
    expect(s.rep[o.cust]).toBe(before - 8);
    expect(s.nota.at(-1)!.failed).toBe(true);
    expect(s.offers.some(x => x.id === o.id)).toBe(false);
  });
});

describe('save (kotaNusantara.field.v1)', () => {
  it('round-trips through JSON', () => {
    const s = freshField();
    s.unlocked = true;
    s.saldo = 345_000;
    s.rep = { rumah: 61, kos: 44, warnet: 70 };
    openDay(s, mulberry(5));
    s.garansi = [planGaransi(s.offers[0], 'crimp', { where: 'ONT-RUMAH:1' }, 1, () => 0.9)];
    expect(parseField(JSON.stringify(s))).toEqual(s);
    expect(FIELD_KEY).toBe('kotaNusantara.field.v1');
  });
  it('migrates the v0 draft shape and repairs bad values', () => {
    const v0 = { money: 120000, rep: 73, unlocked: true, day: 4, offers: [{ id: 'NT-009', tpl: 'w_port', tarif: 9_999_999, status: 'active' }, { id: 'NT-010', tpl: 'nope' }] };
    const s = parseField(JSON.stringify(v0));
    expect(s.v).toBe(1);
    expect(s.saldo).toBe(120000);
    expect(s.rep).toEqual({ rumah: 73, kos: 73, warnet: 73 });
    expect(s.offers).toHaveLength(1);
    expect(s.offers[0].status).toBe('offer');                            // in progress → back on the board
    expect(s.offers[0].tarif).toBe(FIELD_TPLS.w_port.tarif[1]);          // clamped to the range
    expect(s.seq).toBe(9);
    expect(parseField(JSON.stringify({ v: 1, rep: { rumah: 400, kos: -3, warnet: 'x' } })).rep).toEqual({ rumah: 100, kos: 0, warnet: 50 });
  });
  it('corrupt or future saves give a fresh save, never a crash', () => {
    expect(parseField('{oops')).toEqual(freshField());
    expect(parseField('[]')).toEqual(freshField());
    expect(parseField(JSON.stringify({ v: 9, saldo: 5 }))).toEqual(freshField());
    expect(parseField(null)).toEqual(freshField());
  });
});

describe('shared helpers with the internship', () => {
  it('stage bar and berita acara fact check', () => {
    expect(stageBarHtml(2)).toContain('<span class="cur">Uji</span>');
    const known = new Set(['192.168.1.1']);
    expect(beritaFactCheck('Router diganti, ping 192.168.1.1 berhasil dari laptop.', known)).toBe('');
    expect(beritaFactCheck('Router diganti, gateway 192.168.1.254, ping berhasil.', known)).toMatch(/tidak cocok/);
    expect(beritaFactCheck('Router sudah diganti dan semuanya sudah normal kembali.', known)).toMatch(/membuktikan/);
  });
});

// ---------------------------------------------------------------- templates on the network simulation
const ALL = ['PROP_L1_PC_01', ...SITE_PCS.map(p => p.name)];
let SNAP: ReturnType<typeof snapshotSites>;
const fresh = () => {
  ADAPTERS.clear();
  CLIENTS.clear();
  initSwitches(ALL);
  initSiteClients();
  for (const e of [ENVS.rumah, ENVS.kos, ENVS.warnet]) e.leases.clear();
  for (const d of SITE_AP_DEFS) Object.assign(ap(d.id), { mounted: true, radio: true, ssid: d.ssid, key: d.key, sec: 'WPA2-PSK', ch: d.ch, power: 'Tinggi' });
  SNAP = snapshotSites();
};
/** the fix a player makes in game, as the state change of that tool */
function fix(tpl: FieldTplId, d: Record<string, string | number>) {
  if (tpl === 'r_router') {
    const a = ap('AP-RUMAH-RTR');
    Object.assign(a, { mounted: true, ssid: NEW_ROUTER.ssid, key: NEW_ROUTER.key, sec: 'WPA2-PSK' });   // field panel: pasang router baru
    expect(ok(LAPTOP_RUMAH)).toBe(false);                                // factory SSID: devices do not join yet
    Object.assign(a, { ssid: 'HENDRA_HOME', key: 'hendra2580', sec: 'WPA/WPA2-PSK' });                // field panel: atur Wi-Fi
  } else if (tpl === 'r_tv') {
    ENVS.rumah.dhcp = { ...ENVS.rumah.dhcp!, start: '192.168.1.100', end: '192.168.1.199' };            // WebKonfig › DHCP
  } else if (tpl === 'r_kabel') patchCord(sw('ONT-RUMAH'), 1, 1);
  else if (tpl === 'k_ap2') patchCord(sw('RTR-KOS'), 2, 2);
  else if (tpl === 'k_kanal') {
    ap('AP-KOS-LT1').ch = 1;
    ap('AP-KOS-LT2').ch = 11;                                            // AP panel › kanal
  } else if (tpl === 'w_port') {
    const p = sw('SW-WARNET').ports[+d.port - 1];
    p.shutdown = false;
    p.vlan = 1;                                                          // SwitchCli: no shutdown / switchport access vlan 1
  } else if (tpl === 'w_kabel') {
    const a = adapterOf(String(d.pc));
    a.broken = false;                                                    // C › ganti patch cord
  } else if (tpl === 'w_loop') {
    const s = sw('SW-WARNET');
    s.loop = null;                                                       // rack › cabut kabel loop
    expect(rootProblem({ tpl, variant: '', detail: '', targets: [], data: d })).toMatch(/spanning-tree/);
    s.stpOff = false;                                                    // SwitchCli: spanning-tree mode rapid-pvst
  }
}

describe('field templates on the network simulation', () => {
  beforeEach(fresh);
  // MikroTik (Fase 2) templates are graded from the router state: tests/fieldros.test.ts
  // FTTH (Fase 3) templates: tests/fieldftth.test.ts
  for (const tpl of TPL_IDS.filter(id => !FIELD_TPLS[id].ros && !FIELD_TPLS[id].ftth))
    it(`${tpl}: inject breaks the customer device, the in-game fix heals it`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        fresh();
        const inj = inject(tpl, mulberry(seed));
        expect(inj, `${tpl} seed ${seed}`).not.toBeNull();
        const prim = inj!.targets.filter(t => t.primary);
        expect(prim.length).toBeGreaterThan(0);
        expect(prim.some(t => !ok(t.pc)), `${tpl}/${inj!.variant}: a primary device is broken`).toBe(true);
        fix(tpl, inj!.data);
        if (tpl === 'r_router') {
          expect(rootProblem(inj!)).toMatch(/WPA2-PSK/);                // the mixed mode still works but is not what was asked
          ap('AP-RUMAH-RTR').sec = 'WPA2-PSK';
        }
        for (const t of inj!.targets) expect(ok(t.pc), `${tpl}/${inj!.variant}: ${t.label}`).toBe(true);
        expect(rootProblem(inj!)).toBe('');
        // nothing else at the site was hurt
        for (const n of siteDevices(FIELD_TPLS[tpl].cust)) expect(ok(n), n).toBe(true);
      }
    });
  it('an open Wi-Fi with the right SSID does not join devices that saved a WPA2 profile', () => {
    inject('r_router', mulberry(1));
    Object.assign(ap('AP-RUMAH-RTR'), { mounted: true, ssid: 'HENDRA_HOME', key: '', sec: 'Open' });
    expect(ok(LAPTOP_RUMAH)).toBe(false);
    expect(ok(TV)).toBe(false);
  });
  it('restoreSites puts a broken site back to its healthy baseline', () => {
    inject('w_loop', mulberry(2));
    inject('r_tv', mulberry(3));
    restoreSites(SNAP);
    for (const c of ['rumah', 'kos', 'warnet'] as const) for (const n of siteDevices(c)) expect(ok(n), n).toBe(true);
    expect(sw('SW-WARNET').loop).toBeNull();
    expect(SWITCHES.find(s => s.name === 'SW-WARNET')!.stpOff).toBe(false);
  });
  it('garansi redo re-creates the same fault (config not saved / sloppy cable)', () => {
    const a = inject('w_port', mulberry(5))!;
    fix('w_port', a.data);
    expect(ok(String(a.data.pc))).toBe(true);
    const b = inject('w_port', mulberry(99), a.data)!;                   // power cut: the unsaved change is gone
    expect(b.data.pc).toBe(a.data.pc);
    expect(b.variant).toBe(a.variant);
    expect(ok(String(a.data.pc))).toBe(false);
    const c = inject('k_ap2', mulberry(1))!;
    fix('k_ap2', c.data);
    const d = inject('r_kabel', mulberry(1), { where: 'RTR-KOS:2', pc: String(c.data.pc) })!;
    expect(d.data.where).toBe('RTR-KOS:2');
    expect(ok(String(c.data.pc))).toBe(false);
  });
  it('weak cable check: T568A / crossover / untested crimped cables trigger garansi, a tested T568B one does not', () => {
    expect(cableWeak({ a: [...T568B], b: [...T568B], tested: true })).toBe(false);
    expect(cableWeak({ a: [...T568B], b: [...T568B], tested: false })).toBe(true);
    expect(cableWeak({ a: [...T568A], b: [...T568A], tested: true })).toBe(true);
    expect(cableWeak({ a: [...T568A], b: [...T568B], tested: true })).toBe(true);
    expect(cableWeak(null)).toBe(false);
  });
});
