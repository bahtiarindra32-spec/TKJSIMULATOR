// @vitest-environment jsdom
// Gameplay core of the NOC work board (src/game/noc/*): every shift-ticket fault is injected through the real
// Noc.startShift path, must make the simulated network unhealthy, and must be repaired by the same device APIs the
// player uses: the Noc's own physical/rack modals (buttons clicked in jsdom), the switch console (SwitchCli via
// Noc.consoleType), the R-EDGE and srv-nusa shells, the office device panels and web UIs. PC-side Windows dialogs
// (PcOS) are not driven: their fix is the exact state change their handler makes (cited per case).
// Plus the scoring rules (stars, SLA, XP, ranks, tutorial XP = board XP) and the save round trip.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Noc as NocT } from '../src/game/noc';

type Mods = {
  net: typeof import('../src/pcos/net');
  wifi: typeof import('../src/pcos/wifi');
  ext: typeof import('../src/pcos/ext');
  edge: typeof import('../src/pcos/edge');
  linux: typeof import('../src/pcos/linux');
  office: typeof import('../src/pcos/office');
  os: typeof import('../src/pcos/os');
  city: typeof import('../src/data/city');
  noc: typeof import('../src/game/noc');
};
interface World {
  m: Mods;
  n: NocT;
  pcs: { name: string; label: string; x: number; y: number; z: number; level: number }[];
  patches: Map<string, number | null>;
  files: Map<string, string>;
}

const L1 = [...[1, 2, 3, 4].map(i => `PROP_L1_PC_WORKSHOP_0${i}`), ...[1, 2].map(i => `PROP_L1_PC_ITOFFICE_0${i}`)];
const L2 = Array.from({ length: 10 }, (_, i) => `PROP_L2_PC_${String(i + 1).padStart(2, '0')}`);
const L3 = Array.from({ length: 6 }, (_, i) => `PROP_L3_PC_${String(i + 1).padStart(2, '0')}`);
/** hotel-room laptops on L4, inside rooms on the corridor side (local x, z) */
const ROOMS: [string, number, number][] = [
  ['PROP_L4_LAPTOP_401', 7, 5],
  ['PROP_L4_LAPTOP_402', 17, 5],
  ['PROP_L4_LAPTOP_403', 27, 5],
  ['PROP_L4_LAPTOP_404', 12, 16],
];

/** a fresh building: new module instances (all simulation state is module-level), switches, server, office, Wi-Fi, Noc */
async function world(save?: object): Promise<World> {
  vi.resetModules();
  document.body.innerHTML = '';
  localStorage.clear();
  if (save) localStorage.setItem('kotaNusantara.noc.v1', JSON.stringify(save));
  const m: Mods = {
    net: await import('../src/pcos/net'),
    wifi: await import('../src/pcos/wifi'),
    ext: await import('../src/pcos/ext'),
    edge: await import('../src/pcos/edge'),
    linux: await import('../src/pcos/linux'),
    office: await import('../src/pcos/office'),
    os: await import('../src/pcos/os'),
    city: await import('../src/data/city'),
    noc: await import('../src/game/noc'),
  };
  const lv = (n: string) => +(/_L(\d)_/.exec(n)?.[1] ?? 1);
  const pcs = [...L1, ...L2, ...L3].map((name, i) => ({ name, label: name.replace('PROP_', ''), x: i, y: 1, z: 0, level: lv(name) }));
  const [ox, oz] = m.city.HOTEL_ORIGIN,
    elev = m.city.LEVELS[3].elev + 0.8;
  for (const [name, lx, lz] of ROOMS) pcs.push({ name, label: name.replace('PROP_', ''), x: m.city.wx(ox + lx), y: elev, z: m.city.wz(oz + lz), level: 4 });
  m.net.initSwitches(pcs.map(p => p.name));
  m.linux.initLinux();
  for (const p of pcs)
    if (p.level >= 4) {
      m.wifi.registerClient(p.name, p.x, p.y, p.z, p.level);
      m.wifi.AUTH.add(m.net.adapterOf(p.name).mac);
    }
  const pcos = { onEvent: null } as unknown as ConstructorParameters<typeof m.noc.Noc>[0];
  const idfs = [2, 3, 4].map(l => ({ id: `IDF-L${l}`, level: l, x: 0, y: 0, z: 0 }));
  const n = new m.noc.Noc(pcos, pcs, { x: 0, z: 0 }, { x: 1, z: 1 }, idfs);
  m.office.initOffice(
    {
      printers: [
        { id: 'PRN-L2', level: 2, x: 0, z: 0 },
        { id: 'PRN-L3', level: 3, x: 0, z: 0 },
      ],
      phones: [
        { id: 'PROP_L2_IPPHONE_01', level: 2, x: 0, z: 0, pc: L2[0] },
        { id: 'PROP_L2_IPPHONE_02', level: 2, x: 0, z: 0, pc: L2[1] },
      ],
      pcs,
    },
    { show: el => n.showPanel(el), close: () => n.closeModal(), ext: e => n.extEvent(e as never), log: s => n.logLine(s), toast: () => {} },
  );
  n.inv = { tester: true, console: true, laptop: true, toner: true, patch: 4, analyzer: true, ap: 0 };
  n.docRequired = false;
  for (const p of pcs) m.net.live(m.net.adapterOf(p.name)); // every DHCP client takes its lease before the shift
  const patches = new Map<string, number | null>();
  for (const sw of m.net.SWITCHES) for (const q of sw.panel) patches.set(`${sw.name}:${q.n}`, q.patch);
  return { m, n, pcs, patches, files: new Map(m.linux.linuxQa.files) };
}

// ---------------------------------------------------------------- the player's hands and tools
const click = (name: string) => {
  const b = document.querySelector<HTMLButtonElement>(`button[name="${name}"]`);
  if (!b) throw new Error(`no button ${name}`);
  b.click();
};
const clickText = (txt: string) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent === txt);
  if (!b) throw new Error(`no button "${txt}"`);
  b.click();
};
/** console cable at the switch's rack: the real SwitchCli behind the Noc modal */
function cli(w: World, swName: string, lines: string[]) {
  const sw = w.m.net.SWITCHES.find(s => s.name === swName)!;
  w.n.openConsole(sw);
  for (const l of ['', 'enable', 'configure terminal', ...lines, 'end', 'write memory']) w.n.consoleType(l);
  w.n.closeModal();
}
/** patch cords at the rack, put back where the as-built documentation says (snapshot before the shift) */
function repatchRack(w: World) {
  for (const sw of w.m.net.SWITCHES)
    for (const q of sw.panel) {
      const want = w.patches.get(`${sw.name}:${q.n}`);
      if (!want || q.patch === want) continue;
      w.n.openRack(sw.rack);
      click(`pp-${sw.name}-${q.n}`);
      click(`swp-${sw.name}-${want}`);
      w.n.closeModal();
    }
}
const io = (onEdit?: (path: string, text: string, save: (t: string) => void) => void) => ({ edit: onEdit ?? (() => {}), close() {} });
function edgeCli(w: World, lines: string[]) {
  const sh = new w.m.edge.EdgeShell();
  sh.exec('', io());
  for (const l of ['enable', 'configure terminal', ...lines, 'end', 'write memory']) sh.exec(l, io());
}
function srvConsole(w: World, lines: (string | [string, (t: string) => string])[]) {
  const sh = new w.m.linux.LinuxShell('console');
  sh.exec('teknisi', io());
  sh.exec('smkbisa', io());
  for (const l of lines) {
    if (typeof l === 'string') sh.exec(l, io());
    else
      sh.exec(
        l[0],
        io((_p, text, save) => save(l[1](text))),
      ); // nano: the edited text is saved
  }
}
/** what os.ts does on "ipconfig /renew" (PcOS.ipconfig: bounce + new lease) */
function renew(w: World, pc: string) {
  const a = w.m.net.adapterOf(pc);
  w.m.net.bounce(a);
  w.m.net.live(a);
}
/** what os.ts does when IPv4 Properties is set back to "Obtain an IP address / DNS server automatically" */
function ipv4Auto(w: World, pc: string) {
  const a = w.m.net.adapterOf(pc);
  const was = a.dhcp;
  a.dhcp = true;
  if (!was) a.lease = undefined;
  a.dnsAuto = true;
  a.dns1 = '';
  a.dns2 = '';
  a.arp.clear();
}
const swOf = (w: World, pc: string) => w.m.net.portOf(pc)!;
const segVlan = (w: World, pc: string) => (/_L1_/.test(pc) ? 10 : 20);

/** the repair of each fault, done like a technician: look at the device state (show commands / LEDs), then fix it */
const FIX: Record<string, (w: World, pc: string, detail: string) => void> = {
  cable: (w, pc) => {
    w.n.openPhysical(pc);
    click('phys-reseat');
    w.n.closeModal();
  },
  cablebad: (w, pc) => {
    w.n.openPhysical(pc);
    click('phys-test');
    click('phys-replace');
    w.n.closeModal();
  },
  // Network Connections › Enable (os.ts ncpa: a.enabled = true; bounce)
  disabled: (w, pc) => {
    const a = w.m.net.adapterOf(pc);
    a.enabled = true;
    w.m.net.bounce(a);
  },
  released: (w, pc) => renew(w, pc),
  wrongip: (w, pc) => ipv4Auto(w, pc),
  gateway: (w, pc) => ipv4Auto(w, pc),
  conflict: (w, pc) => ipv4Auto(w, pc),
  dns: (w, pc) => ipv4Auto(w, pc),
  port: (w, pc) => {
    const p = swOf(w, pc);
    cli(w, p.sw.name, [`interface gi1/0/${p.port.n}`, 'no shutdown']);
  },
  vlan: (w, pc) => {
    const p = swOf(w, pc);
    cli(w, p.sw.name, [`interface gi1/0/${p.port.n}`, `switchport access vlan ${segVlan(w, pc)}`]);
    renew(w, pc);
  },
  patch: w => repatchRack(w),
  uplink: (w, pc) => {
    const q = w.m.net.panelOf(pc)!,
      sw = q.sw;
    if (!sw.uplink!.cable) {
      w.n.openRack(sw.rack);
      clickText('Cabut & pasang ulang fiber');
      w.n.closeModal();
    } else if (sw.upPort.shutdown) cli(w, sw.name, ['interface gi1/0/49', 'no shutdown']);
    else cli(w, sw.name, ['interface gi1/0/49', `switchport trunk allowed vlan add ${swOf(w, pc).port.vlan}`]);
  },
  loop: (w, pc) => {
    const sw = swOf(w, pc).sw,
      [a] = sw.loop!;
    w.n.openRack(sw.rack);
    click(`swp-${sw.name}-${a}`);
    click('loop-remove');
    w.n.closeModal();
    cli(w, sw.name, ['spanning-tree mode rapid-pvst']);
  },
  // captive portal login with room + surname (os.ts portal(): AUTH.add(mac))
  portal: (w, pc) => {
    w.m.wifi.AUTH.add(w.m.net.adapterOf(pc).mac);
  },
  appoe: (w, _pc, detail) => {
    const ap = w.m.wifi.APS.find(x => detail.startsWith(x.id))!;
    const p = w.m.net.apPort(ap);
    if (!p) {
      repatchRack(w);
      return;
    }
    cli(w, p.sw.name, [`interface gi1/0/${p.port.n}`, p.port.poe === false ? 'power inline auto' : 'no shutdown']);
  },
  // NusaWLC: channel and TX power back to the floor plan (os.ts wlcUi selects set ap.ch / ap.power)
  aprf: (w, pc) => {
    const lv = w.m.wifi.CLIENTS.get(pc)!.level;
    w.m.wifi.APS.filter(a => a.level === lv).forEach((a, i) => {
      a.ch = w.m.wifi.defaultCh(lv, i);
      a.power = 'Sedang';
    });
  },
  // gw-tamu WebKonfig › DHCP Server: bigger pool, shorter lease (os.ts router UI: env.dhcp = cand)
  dhcppool: (w, pc) => {
    const g = w.m.net.ENVS.guest,
      base = w.m.net.parseIp(g.gateway)!;
    g.dhcp = { ...g.dhcp!, start: w.m.net.ipStr(base + 99), end: w.m.net.ipStr(base + 3 * 256 + 231), lease: 2 };
    renew(w, pc);
  },
  isp1: w => {
    const E = w.m.edge.EDGE;
    if (!E.routes.some(r => r.nh === '198.51.100.1')) edgeCli(w, ['ip route 0.0.0.0 0.0.0.0 198.51.100.1 10']);
    else if (!E.nat.some(x => x.iface === 'GigabitEthernet0/1')) edgeCli(w, ['ip nat inside source route-map ISP2 interface Gi0/1 overload']);
    else edgeCli(w, ['ip route 0.0.0.0 0.0.0.0 203.0.113.1 track 1']);
  },
  nat: (w, pc) => {
    if (!w.m.edge.EDGE.ifs[2].nat) edgeCli(w, ['interface Gi0/2', 'ip nat inside']);
    else edgeCli(w, [`access-list 1 permit ${w.m.net.envOf(pc).net} 0.0.0.255`]);
  },
  acl: w => edgeCli(w, ['ip access-list extended 110', 'no 5']),
  srvdown: (w, pc) => {
    const svc = w.m.linux.linuxQa.svc;
    srvConsole(
      w,
      (Object.keys(svc) as (keyof typeof svc)[]).filter(s => !svc[s].active).map(s => `sudo systemctl start ${s}`),
    );
    renew(w, pc);
  },
  zone: w => {
    const p = '/etc/bind/db.lab.smk.local';
    srvConsole(w, [[`sudo nano ${p}`, () => w.files.get(p)!], 'sudo systemctl reload bind9']);
  },
  dhcpscope: (w, pc) => {
    const p = '/etc/dhcp/dhcpd.conf';
    srvConsole(w, [[`sudo nano ${p}`, () => w.files.get(p)!], 'sudo systemctl restart isc-dhcp-server']);
    renew(w, pc);
  },
  printer: (w, pc) => {
    const id = /_L2_/.test(pc) ? 'PRN-L2' : 'PRN-L3';
    const pr = w.m.office.PRINTERS.find(x => x.id === id)!;
    w.m.ext.DEVICES.find(d => d.id === id)!.use();
    if (!pr.cable) click('prn-cable');
    else {
      (document.querySelector('input[name="prn-ip"]') as HTMLInputElement).value = pr.want;
      (document.querySelector('input[name="prn-gw"]') as HTMLInputElement).value = w.m.net.ENVS.office.gateway;
      click('prn-save');
    }
    w.n.closeModal();
  },
  voice: (w, pc) => {
    const p = swOf(w, pc);
    cli(w, p.sw.name, [`interface gi1/0/${p.port.n}`, 'switchport voice vlan 100', 'power inline auto']);
  },
  nas: w => {
    const N = w.m.office.NAS;
    if (!N.cable) {
      w.m.office.nasPanel();
      click('nas-cable');
      w.n.closeModal();
      return;
    }
    // NusaStor DSM web page (SITES.nas), opened from an office PC
    const page = w.m.os.SITES.nas.render(N.ip, new URL(`http://${N.ip}`), { emit() {} } as never);
    document.body.append(page);
    const smb = page.querySelector<HTMLInputElement>('input[name="nas-smb"]')!;
    if (!smb.checked) {
      smb.checked = true;
      smb.dispatchEvent(new Event('change'));
    }
    const sel = page.querySelector<HTMLSelectElement>('select[name="perm-dokumen"]');
    if (sel) {
      sel.value = 'rw';
      sel.dispatchEvent(new Event('change'));
    }
    page.remove();
  },
};

const BASE = [
  'cable',
  'cablebad',
  'port',
  'vlan',
  'disabled',
  'released',
  'wrongip',
  'conflict',
  'gateway',
  'dns',
  'patch',
  'uplink',
  'loop',
  'portal',
  'appoe',
  'aprf',
  'dhcppool',
];
const EXTF = ['isp1', 'nat', 'acl', 'srvdown', 'zone', 'dhcpscope', 'printer', 'voice', 'nas'];
/** Math.random values used inside injection, so each fault's variants (pick of 2-3) are all exercised */
const VARIANTS = [0.1, 0.45, 0.8];
/** distinct injected variants seen per fault (report finding text) */
const SEEN = new Map<string, Set<string>>();
const SENIOR = {
  v: 1,
  xp: 9000,
  cert: 9,
  shifts: 0,
  closed: 3,
  slaMet: 0,
  seq: 0,
  contracts: 0,
  stars: 0,
  days: 0,
  streak: 0,
  best: 0,
  day: null,
  seen: [],
  mastery: { tutor: { ok: 1, miss: 0 } },
};

describe('every shift fault: inject → unhealthy → real fix → healthy', () => {
  afterEach(() => vi.restoreAllMocks());
  it('the test covers the whole fault catalogue', async () => {
    const w = await world(SENIOR);
    expect(Object.keys(w.m.noc.FAULTS).sort()).toEqual([...BASE, ...EXTF].sort());
    for (const f of Object.keys(w.m.noc.FAULTS)) expect(FIX[f], f).toBeTypeOf('function');
  });
  for (const f of [...BASE, ...EXTF])
    for (const v of VARIANTS)
      it(`${f} (variant r=${v})`, async () => {
        const w = await world(SENIOR);
        vi.spyOn(Math, 'random').mockReturnValue(v);
        let k = 7;
        const rand = () => (k = (k * 16807) % 2147483647) / 2147483647;
        w.n.startShift(rand, [f]);
        const j = w.n.jobs[0];
        expect(j, `no PC eligible for ${f}`).toBeTruthy();
        const pc = j.targets[0].pc.name,
          a = w.m.net.adapterOf(pc),
          X = w.m.ext.EXT[f];
        const ok = () => (w.n as unknown as { targetOk(j: unknown, t: unknown): boolean }).targetOk(j, j.targets[0]);
        // broken for real
        if (!SEEN.has(f)) SEEN.set(f, new Set());
        SEEN.get(f)!.add((j.detail ?? `vlan ${w.m.net.portOf(pc)?.port.vlan ?? '-'}`).split('→')[0].trim());
        const before = X ? !X.ok(pc) || (X.health !== false && !w.m.net.healthy(a)) : !w.m.net.healthy(a);
        expect(before, `${f}: injection had no effect (${j.detail ?? ''})`).toBe(true);
        expect(ok()).toBe(false);
        FIX[f](w, pc, j.detail ?? '');
        if (X) expect(X.ok(pc), `${f}: root cause still there (${j.detail})`).toBe(true);
        if (!X || X.health !== false) expect(w.m.net.healthy(a), `${f}: PC still unhealthy (${j.detail ?? ''})`).toBe(true);
        expect(ok(), `${f}: board still not satisfied: ${j.targets[0].note}`).toBe(true);
        if (!X) {
          // the player's test from the PC closes the ticket and writes the report
          for (const t of j.targets) w.n.extEvent({ type: 'ping', pc: t.pc.name, detail: { ok: true, target: '8.8.8.8' } });
          for (const t of j.targets) if (!t.tested) FIX[f](w, t.pc.name, j.detail ?? '');
          for (const t of j.targets) w.n.extEvent({ type: 'ping', pc: t.pc.name, detail: { ok: true, target: '8.8.8.8' } });
          expect(j.status, `${f}: ${j.targets.map(t => `${t.pc.name}:${t.note}`).join(', ')}`).toBe('closed');
          expect(j.stars).toBeGreaterThanOrEqual(1);
        }
      });
});

describe('fault variants', () => {
  it('every random variant of the multi-variant faults was injected and repaired above', () => {
    const want: Record<string, number> = {
      uplink: 3,
      appoe: 3,
      isp1: 3,
      nat: 2,
      acl: 2,
      srvdown: 3,
      zone: 2,
      dhcpscope: 2,
      printer: 2,
      voice: 2,
      nas: 3,
      vlan: 3,
    };
    for (const [f, nv] of Object.entries(want)) expect(SEEN.get(f)?.size, `${f}: ${[...(SEEN.get(f) ?? [])].join(' | ')}`).toBe(nv);
  });
});

describe('scoring', () => {
  let S: typeof import('../src/game/noc');
  beforeEach(async () => {
    vi.resetModules();
    S = await import('../src/game/noc');
  });
  it('stars: 3 minus SLA missed, collateral damage, waste/unsaved config; never below 1', () => {
    expect(S.jobStars({ slaMet: true, collateral: 0, wrong: 0, swDirty: false })).toBe(3);
    expect(S.jobStars({ slaMet: false, collateral: 0, wrong: 0, swDirty: false })).toBe(2);
    expect(S.jobStars({ slaMet: true, collateral: 2, wrong: 0, swDirty: false })).toBe(2);
    expect(S.jobStars({ slaMet: true, collateral: 0, wrong: 0, swDirty: true })).toBe(2);
    expect(S.jobStars({ slaMet: false, collateral: 1, wrong: 3, swDirty: true })).toBe(1);
  });
  it('SLA is met up to and including the limit', () => {
    expect(S.slaMet(420, 420)).toBe(true);
    expect(S.slaMet(421, 420)).toBe(false);
    expect(S.slaMet(-50, 420)).toBe(true);
  });
  it('job XP: base × star multiplier (+20 without help) × XP_RATE', () => {
    expect(S.XP_RATE).toBe(0.4);
    // ticket with a rank-0 fault: base 100
    expect(S.jobXp({ kind: 'ticket', tpl: 'cable', faults: ['cable'], stars: 3, hint: false })).toBe(Math.round((100 * 1.3 + 20) * 0.4));
    // rank-1 fault + second fault: 100 + 50 + 60
    expect(S.jobBaseXp({ kind: 'ticket', tpl: 'port', faults: ['port', 'cable'] })).toBe(210);
    expect(S.jobXp({ kind: 'ticket', tpl: 'port', faults: ['port', 'cable'], stars: 1, hint: true })).toBe(Math.round(210 * 0.7 * 0.4));
    expect(S.jobXp({ kind: 'follow', tpl: 'follow', faults: [], stars: 2, hint: true })).toBe(24);
    expect(S.jobXp({ kind: 'contract', tpl: 'desk', faults: [], stars: 2, hint: false })).toBe(Math.round((170 + 20) * 0.4));
  });
  it('the board shows template points at XP_RATE, and the tutorial pays exactly that', () => {
    for (const t of Object.keys(S.TEMPLATES) as import('../src/game/noc').TplId[]) expect(S.offerXp(t)).toBe(Math.round(S.TEMPLATES[t].xp * S.XP_RATE));
    for (const stars of [1, 2, 3])
      for (const hint of [true, false]) expect(S.jobXp({ kind: 'contract', tpl: 'tutor', faults: [], stars, hint })).toBe(S.offerXp('tutor'));
    expect(S.offerXp('tutor')).toBe(60);
  });
  it('rank thresholds', () => {
    expect(S.RANKS.map(r => r.xp)).toEqual([0, 800, 2500, 5000, 9000]);
    expect([0, 799, 800, 2499, 2500, 4999, 5000, 8999, 9000, 1e6].map(S.rankIndexForXp)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('daily bonus and streak', () => {
    expect(S.dayEval({ n: 3, jobs: 4, stars: 12, sla: 4 }, 1)).toEqual({ allSla: true, avg: 3, streak: 2, bonus: 60 + 30 + 40 + 30 });
    expect(S.dayEval({ n: 1, jobs: 2, stars: 2, sla: 1 }, 4)).toEqual({ allSla: false, avg: 1, streak: 0, bonus: 0 });
    expect(S.dayEval({ n: 1, jobs: 0, stars: 0, sla: 0 }, 9).bonus).toBe(0);
  });
});

describe('tutorial through the real Noc: the reward is what the board offered', () => {
  it('board offer shows 60 XP and closing the tutorial adds exactly 60 XP', async () => {
    const w = await world();
    w.n.openBoard();
    const offer = [...document.querySelectorAll('.offer')].find(x => /Hari Pertama/.test(x.textContent ?? ''));
    expect(offer?.textContent).toMatch(/· 60 XP/);
    expect(offer?.textContent).not.toMatch(/±60/);
    w.n.closeModal();
    w.n.maybeStartTutorial();
    const j = w.n.jobs[0],
      pc = j.targets[0].pc.name;
    expect(j.tut).toBeTruthy();
    // cord from the cabinet, LAN tester, ipconfig, ping the gateway: as qa_tutor does in the browser
    w.n.openPhysical(pc);
    click('phys-install');
    await new Promise(r => setTimeout(r, 700));
    w.n.openPhysical(pc);
    click('phys-test');
    w.n.closeModal();
    w.n.extEvent({ type: 'cmd', pc, detail: { line: 'ipconfig' } });
    const gw = w.m.net.live(w.m.net.adapterOf(pc)).gw;
    w.n.extEvent({ type: 'ping', pc, detail: { ok: true, target: gw } });
    expect(j.status).toBe('closed');
    expect(j.xp).toBe(60);
    expect(w.n.xp).toBe(0); // XP is booked when the report is read
    (w.n as unknown as { openReport(j: unknown): void }).openReport(j);
    expect(w.n.xp).toBe(60);
    expect(document.body.textContent).toMatch(/\+60 XP/);
  });
});

describe('save', () => {
  it('round trip: what is written is plain JSON and loads back unchanged (a running day is dropped)', async () => {
    vi.resetModules();
    localStorage.clear();
    const S = await import('../src/game/noc');
    const s = {
      ...S.freshSave(),
      xp: 1234,
      cert: 1,
      closed: 9,
      slaMet: 7,
      stars: 20,
      days: 3,
      streak: 2,
      best: 25,
      seq: 41,
      contracts: 4,
      shifts: 5,
      seen: ['tutor', 'cable', 'static'],
      mastery: { cable: { ok: 3, miss: 1 }, static: { ok: 1, miss: 0 } },
    };
    S.writeSave(s, [{ id: 'TKT-0001', title: 'x', note: 'kabel diganti', t: 1 }]);
    const raw = localStorage.getItem(S.SAVE_KEY)!;
    expect(JSON.parse(raw)).toEqual(s);
    const back = S.loadSave();
    expect(back).toMatchObject({ xp: 1234, closed: 9, slaMet: 7, stars: 20, days: 3, streak: 2, best: 25, seq: 41, contracts: 4, shifts: 5, day: null });
    expect(back.seen).toEqual(s.seen);
    expect(back.mastery).toEqual(s.mastery);
    expect(S.loadNotes()).toEqual([{ id: 'TKT-0001', title: 'x', note: 'kabel diganti', t: 1 }]);
    expect(S.SAVE_KEY).toBe('kotaNusantara.noc.v1');
  });
  it('a corrupt or hostile save never breaks the game', async () => {
    vi.resetModules();
    const S = await import('../src/game/noc');
    localStorage.setItem(S.SAVE_KEY, '{not json');
    expect(S.loadSave()).toEqual(S.freshSave());
    expect(localStorage.getItem(S.SAVE_KEY)).toBeNull();
    localStorage.setItem(
      S.SAVE_KEY,
      JSON.stringify({ xp: -5, closed: 'x', seen: ['cable', 'nope', 3], mastery: { cable: { ok: 2.7, miss: -1 }, evil: { ok: 1 } }, day: { n: 2 } }),
    );
    const s = S.loadSave();
    expect(s.xp).toBe(0);
    expect(s.closed).toBe(0);
    expect(s.day).toBeNull();
    expect(s.seen).toEqual(['cable']);
    expect(s.mastery).toEqual({ cable: { ok: 2, miss: 0 } });
  });
  it('the Noc keeps its progress across a reload', async () => {
    const w = await world(SENIOR);
    w.n.startShift(Math.random, ['cable']);
    const j = w.n.jobs[0],
      pc = j.targets[0].pc.name;
    FIX.cable(w, pc, '');
    w.n.extEvent({ type: 'ping', pc, detail: { ok: true, target: '8.8.8.8' } });
    (w.n as unknown as { openReport(j: unknown): void }).openReport(j);
    const xp = w.n.xp,
      stats = w.n.stats;
    const saved = localStorage.getItem('kotaNusantara.noc.v1');
    const w2 = await world(JSON.parse(saved!));
    expect(w2.n.xp).toBe(xp);
    expect(w2.n.stats).toMatchObject({ closed: stats.closed, slaMet: stats.slaMet, stars: stats.stars, shifts: stats.shifts, seq: stats.seq });
    expect(w2.n.rank()).toBe(w.n.rank());
  });
});
