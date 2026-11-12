// Fase 3 FTTH chunk B2: paid field orders on the house fibre. Each template seeds a real fault into rumahFtth() when it is
// accepted, fails before the fix, passes after the correct engine actions (the same calls the in-game tools make), a wrong
// fix does not pass, and a weak repair (splice > 0.2 dB / no sleeve, drop plugged without cleaning) schedules a garansi
// callback that re-creates the fault.
import { describe, it, expect, beforeEach } from 'vitest';
import { initSwitches, ADAPTERS, ENVS } from '../src/pcos/net';
import { CLIENTS } from '../src/pcos/wifi';
import { initSiteClients } from '../src/pcos/sites';
import { SITE_PCS, SITE_AP_DEFS } from '../src/data/sites';
import { rumahFtth, RUMAH_CUST, RUMAH_ODP } from '../src/pcos/ftthsite';
import { repairBreak, cleanConnector, fixBend, plugDrop, ontStatus, otdr, vfl, rxAt, CONN, type FtthNet } from '../src/pcos/ftth';
import { inject, rootProblem, snapshotSites, restoreSites, ok, ap, LAPTOP_RUMAH, TV, type Injected } from '../src/game/field/sim';
import { FIELD_TPLS } from '../src/game/field/templates';
import { FTTH_TPL_IDS, FTTH_WORK, recordPlug, ftthWeak, ftthSiteCheck, dropPlace, type FtthTplId } from '../src/game/field/simftth';
import { newKit, borrow, placeLadder, climb } from '../src/game/field/ftthkit';
import { availableTpls, planGaransi, garansiOrder, makeOrder } from '../src/game/field/orders';
import { materialCost, payout, PRICE } from '../src/game/field/economy';
import { parseField, freshField } from '../src/game/field/save';
import { noMat } from '../src/game/field/types';
import { mulberry } from '../src/game/noc/util';

const ALL = ['PROP_L1_PC_01', ...SITE_PCS.map(p => p.name)];
let SNAP: ReturnType<typeof snapshotSites>;
const fresh = () => {
  ADAPTERS.clear(); CLIENTS.clear(); initSwitches(ALL); initSiteClients();
  for (const e of [ENVS.rumah, ENVS.kos, ENVS.warnet]) e.leases.clear();
  for (const d of SITE_AP_DEFS) Object.assign(ap(d.id), { mounted: true, radio: true, ssid: d.ssid, key: d.key, sec: 'WPA2-PSK', ch: d.ch, power: 'Tinggi' });
  SNAP = snapshotSites();
};
const net = (): FtthNet => rumahFtth()!;
const cust = () => net().customers[RUMAH_CUST];
const portConn = () => CONN.odpPort(RUMAH_ODP, cust().port!);
const passes = (i: Injected) => rootProblem(i) === '' && i.targets.every(t => ok(t.pc));
/** the correct field fix, as the in-game tools apply it (ftthui.ts) */
function fixRight(i: Injected, lossDb = 0.12) {
  const n = net(), c = cust();
  if (i.tpl === 'f_drop_putus') for (const b of Object.values(n.breaks)) repairBreak(n, b.id, lossDb, true);
  if (i.tpl === 'f_konektor_kotor') for (const id of String(i.data.conns).split(',')) cleanConnector(n, id);
  if (i.tpl === 'f_macrobend') fixBend(n, String(i.data.bend));
  if (i.tpl === 'f_port_salah') { plugDrop(n, RUMAH_CUST, i.ftth!.port, { cleaned: true }); recordPlug(i.ftth!.port, true); }
  void c;
}

describe('FTTH order templates', () => {
  it('four rumah templates, flagged ftth, fees from the research floor (Rp45 rb [47]) with a design top', () => {
    expect(FTTH_TPL_IDS).toEqual(['f_drop_putus', 'f_konektor_kotor', 'f_macrobend', 'f_port_salah']);
    for (const id of FTTH_TPL_IDS) {
      const t = FIELD_TPLS[id];
      expect(t.cust).toBe('rumah'); expect(t.ftth).toBe(true); expect(t.ros).toBeFalsy();
      expect(t.tarif[0]).toBe(45_000); expect(t.tarif[1]).toBeLessThanOrEqual(150_000);
      expect(t.tarifSrc).toMatch(/\[47\]/);
      expect(t.ask.join(' ')).toMatch(/hijau/);
    }
    expect(availableTpls({ rumah: 60, kos: 50, warnet: 50 })).toEqual(expect.arrayContaining(FTTH_TPL_IDS));
    expect(availableTpls({ rumah: 50, kos: 50, warnet: 50 })).not.toContain('f_drop_putus');   // splicing needs reputasi 55
    const o = makeOrder('f_drop_putus', 1, 1, { rumah: 80, kos: 50, warnet: 50 }, mulberry(3));
    expect(o.tarif).toBeGreaterThanOrEqual(45_000); expect(o.tarif).toBeLessThanOrEqual(150_000);
  });
});

describe('FTTH orders on the house fibre', () => {
  beforeEach(fresh);
  for (const tpl of FTTH_TPL_IDS)
    it(`${tpl}: inject breaks the line, the right fix passes`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        fresh();
        restoreSites(SNAP, 'rumah');
        const i = inject(tpl, mulberry(seed))!;
        expect(i, `${tpl} seed ${seed}`).not.toBeNull();
        expect(i.ftth?.tpl).toBe(tpl);
        expect(i.targets.find(t => t.primary)!.pc).toBe(LAPTOP_RUMAH);
        expect(i.lines?.join(' ')).toMatch(new RegExp(`${RUMAH_ODP} port ${i.ftth!.port}`));
        const st = ontStatus(net(), RUMAH_CUST);
        expect(st.band === 'green' && st.state === 'online', `${tpl}/${i.variant} Rx ${st.rxDbm}`).toBe(false);
        expect(rootProblem(i), `${tpl}/${i.variant}`).not.toBe('');
        expect(passes(i)).toBe(false);
        if (st.state !== 'online') expect(ok(LAPTOP_RUMAH)).toBe(false);   // no light → no internet on the laptop
        fixRight(i);
        expect(rootProblem(i), `${tpl}/${i.variant}`).toBe('');
        const after = ontStatus(net(), RUMAH_CUST);
        expect(after.state).toBe('online'); expect(after.band).toBe('green');
        expect(ok(LAPTOP_RUMAH)).toBe(true); expect(ok(TV)).toBe(true);
        expect(ftthWeak(i.ftth!)).toBeNull();
      }
    });

  it('f_drop_putus: the break sits 12–16 m out, beyond the OTDR dead zone, and the OTDR from the port finds it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      fresh();
      const i = inject('f_drop_putus', mulberry(seed))!;
      const at = Number(i.data.atM);
      expect(at).toBeGreaterThanOrEqual(12); expect(at).toBeLessThanOrEqual(16);
      const t = otdr(net(), RUMAH_CUST, { launch: 'odp-port', lambda: 1550 });
      expect(t.endM).toBeCloseTo(at, 1);
      expect(t.inDeadZone.some(e => e.type === 'end')).toBe(false);
      expect(vfl(net(), RUMAH_CUST, 'roset').visible.some(g => g.kind === 'break')).toBe(true);
      expect(dropPlace(at)).toMatch(/bentangan|dinding/);
    }
  });
  it('f_drop_putus: cleaning connectors or re-plugging does not mend a broken fibre', () => {
    const i = inject('f_drop_putus', mulberry(2))!;
    for (const id of Object.keys(net().connectors)) cleanConnector(net(), id);
    plugDrop(net(), RUMAH_CUST, 1, { cleaned: true });
    expect(rootProblem(i)).toMatch(/LOS/);
    expect(ok(LAPTOP_RUMAH)).toBe(false);
  });
  it('f_konektor_kotor: cleaning only one of two dirty faces does not close the order; moving the drop to another port does not either', () => {
    let seen = false;
    for (let seed = 1; seed <= 30 && !seen; seed++) {
      fresh();
      const i = inject('f_konektor_kotor', mulberry(seed))!;
      if (i.variant !== 'dua') continue;
      seen = true;
      const [a] = String(i.data.conns).split(',');
      cleanConnector(net(), a);
      expect(rootProblem(i)).not.toBe('');
    }
    expect(seen).toBe(true);
    fresh();
    const i = inject('f_konektor_kotor', mulberry(5))!;
    plugDrop(net(), RUMAH_CUST, 4, { cleaned: true });
    expect(rootProblem(i)).not.toBe('');
  });
  it('f_macrobend: loss is worse at 1550 than 1490, the VFL shows the bend near the roset, cleaning does not fix it', () => {
    for (let seed = 1; seed <= 8; seed++) {
      fresh();
      const i = inject('f_macrobend', mulberry(seed))!;
      const b = net().bends[String(i.data.bend)];
      expect(b).toBeDefined();
      expect(Number(i.data.fromRoset)).toBeLessThanOrEqual(2);
      const r1490 = rxAt(net(), RUMAH_CUST, 1490).rxDbm, r1550 = rxAt(net(), RUMAH_CUST, 1550).rxDbm;
      expect(r1550).toBeLessThan(r1490);                                  // also lower even though fibre loss is less at 1550
      const from = i.variant === 'indoor' ? 'ont' : 'roset';
      expect(vfl(net(), RUMAH_CUST, from).visible.some(g => g.kind === 'macrobend' && g.id === b.id), `${i.variant}`).toBe(true);
      const t = otdr(net(), RUMAH_CUST, { launch: 'odp-port', lambda: 1550 });
      expect(t.events.some(e => e.ids.includes(b.id))).toBe(true);        // the OTDR also locates it (merged with the roset event)
      for (const id of Object.keys(net().connectors)) cleanConnector(net(), id);
      expect(rootProblem(i)).not.toBe('');
    }
  });
  it('f_port_salah: the drop sits in a dead port; a live but wrong port gives light yet does not pass', () => {
    const i = inject('f_port_salah', mulberry(4))!;
    expect(net().odps[RUMAH_ODP].ports[cust().port! - 1].live).toBe(false);
    expect(ontStatus(net(), RUMAH_CUST).state).toBe('los');
    expect(net().customers.tetangga11).toBeDefined();                     // the neighbour job that caused it
    const wrong = net().odps[RUMAH_ODP].ports.find(p => p.live && !p.customer && p.n !== i.ftth!.port)!;
    plugDrop(net(), RUMAH_CUST, wrong.n, { cleaned: true });
    recordPlug(wrong.n, true);
    expect(ontStatus(net(), RUMAH_CUST).band).toBe('green');
    expect(ok(LAPTOP_RUMAH)).toBe(true);
    expect(rootProblem(i)).toMatch(/data ODP/);
  });
});

describe('FTTH garansi (Fase 1 garansi system)', () => {
  beforeEach(fresh);
  it('a repair splice above 0.2 dB passes today but schedules a garansi that re-breaks the drop at the same spot', () => {
    const i = inject('f_drop_putus', mulberry(6))!;
    const at = Number(i.data.atM);
    fixRight(i, 0.32);
    expect(rootProblem(i)).toBe('');                                     // light is fine now
    const w = ftthWeak(i.ftth!)!;
    expect(w.redo).toEqual({ g: 'splice', atM: at });
    expect(w.why).toMatch(/0\.32/);
    // the garansi order re-creates the fault on a fresh line
    const o = makeOrder('f_drop_putus', 1, 1, { rumah: 60, kos: 50, warnet: 50 }, mulberry(1));
    const plan = planGaransi(o, 'fiber', w.redo, 1, mulberry(2));
    const g = garansiOrder(plan, 9);
    expect(g.kind).toBe('garansi'); expect(g.reason).toBe('fiber'); expect(g.tarif).toBe(0);
    expect(g.lines[0]).toMatch(/LOS/);
    restoreSites(SNAP, 'rumah');
    expect(ontStatus(net(), RUMAH_CUST).band).toBe('green');
    const j = inject(g.tpl, mulberry(g.seed), g.redo)!;
    expect(j.variant).toBe('garansi-splice');
    expect(Object.values(net().breaks).map(b => b.atM)).toEqual([at]);
    expect(rootProblem(j)).not.toBe('');
    fixRight(j);
    expect(rootProblem(j)).toBe('');
    expect(ftthWeak(j.ftth!)).toBeNull();
  });
  it('a splice without its sleeve is a weak check too; a good splice is not', () => {
    const i = inject('f_drop_putus', mulberry(7))!;
    const b = Object.values(net().breaks)[0];
    repairBreak(net(), b.id, 0.1, false);
    expect(ftthWeak(i.ftth!)?.why).toMatch(/sleeve/);
  });
  it('plugging the drop without cleaning: green today, garansi tomorrow with a dirty port; cleaning the port afterwards clears it', () => {
    const i = inject('f_port_salah', mulberry(3))!;
    const p = i.ftth!.port;
    plugDrop(net(), RUMAH_CUST, p);                                       // "Colok langsung"
    recordPlug(p, false);
    expect(rootProblem(i)).toBe('');                                     // the open port's dust costs only ⚠ 1.5 dB
    const w = ftthWeak(i.ftth!)!;
    expect(w.redo).toEqual({ g: 'dirty', conn: CONN.odpPort(RUMAH_ODP, p) });
    // garansi callback: that port connector is badly dirty → LOS
    restoreSites(SNAP, 'rumah');
    const j = inject('f_port_salah', mulberry(1), w.redo)!;
    expect(j.variant).toBe('garansi-dirty');
    expect(ontStatus(net(), RUMAH_CUST).state).toBe('los');
    cleanConnector(net(), portConn()); recordPlug(p, true);
    expect(rootProblem(j)).toBe('');
    expect(ftthWeak(j.ftth!)).toBeNull();
    // and the original job, had the technician cleaned the port after all (unplug, clean, re-plug), is not weak
    FTTH_WORK.plugs = [{ port: p, cleaned: false }, { port: p, cleaned: true }];
    expect(ftthWeak(i.ftth!)).toBeNull();
  });
  it('save keeps the fibre garansi reason and the sleeves on a nota', () => {
    const s = freshField();
    s.garansi.push({ of: 'NT-001', tpl: 'f_drop_putus', cust: 'rumah', reason: 'fiber', showDay: 2, redo: { g: 'splice', atM: 13.4 } });
    s.nota.push({ id: 'NT-001', day: 1, title: 'x', who: 'y', tarif: 90_000, stars: 3, jasa: 90_000, mat: { ...noMat(), sleeve: 2 }, material: 500, denda: 0, net: 89_500, garansi: false, failed: false });
    const back = parseField(JSON.stringify(s));
    expect(back.garansi[0].reason).toBe('fiber');
    expect(back.garansi[0].redo).toEqual({ g: 'splice', atM: 13.4 });
    expect(back.nota[0].mat.sleeve).toBe(2);
  });
});

describe('FTTH material, K3 and tools at closing', () => {
  it('sleeves are billed as material (Rp250 each, retail packs of 100)', () => {
    expect(PRICE.sleeve).toBe(250);
    expect(materialCost({ ...noMat(), sleeve: 2 })).toBe(500);
    expect(materialCost({ rj45: 0, utp: 0, patch: 0, router: 0 })).toBe(0);  // a Fase 1 record without sleeves
    expect(payout(100_000, 3, { ...noMat(), sleeve: 1 }).net).toBe(99_750);
  });
  it('K3 notes (pole without APD) and tools left at the site are reported; a tidy kit is clean', () => {
    const k = newKit();
    borrow(k, 'tangga'); borrow(k, 'otdr');
    placeLadder(k, 'tiang:X'); climb(k, 'tiang:X');
    const s = ftthSiteCheck(k);
    expect(s.k3.join(' ')).toMatch(/Naik tiang tanpa/);
    expect(s.left).toEqual(expect.arrayContaining(['teknisi masih di atas tangga', 'tangga masih bersandar di tiang']));
    expect(s.carried).toEqual(expect.arrayContaining(['Tangga', 'OTDR']));
    const ok2 = newKit();
    for (const id of ['helm', 'sarung', 'harness', 'kacamata', 'tangga'] as const) borrow(ok2, id);
    placeLadder(ok2, 'tiang:X'); climb(ok2, 'tiang:X');
    ok2.climbing = null; ok2.ladderAt = null;
    const s2 = ftthSiteCheck(ok2);
    expect(s2.k3).toEqual([]); expect(s2.left).toEqual([]);
    expect(ftthSiteCheck(null)).toEqual({ k3: [], left: [], carried: [] });
  });
  it('restoring the house after a failed FTTH order gives a healthy line again', () => {
    fresh();
    for (const tpl of FTTH_TPL_IDS as FtthTplId[]) {
      inject(tpl, mulberry(9));
      restoreSites(SNAP, 'rumah');
      expect(ontStatus(net(), RUMAH_CUST).band).toBe('green');
      expect(Object.keys(net().customers)).not.toContain('tetangga11');
      expect(ok(LAPTOP_RUMAH)).toBe(true);
    }
  });
});
