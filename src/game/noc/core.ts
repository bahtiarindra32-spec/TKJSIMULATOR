// (from the former single Noc class) The Noc controller: Nusantara Tech's IT work board on the real building network.
//   * Kontrak (work orders): randomized templates (contracts.ts). Every run picks a different segment, subnet, PCs, names and twists.
//   * Shift tiket: 3-5 random trouble tickets with SLA (faults.ts injects them into the network sim).
// A job closes only when the network state is really correct AND the player tested it from the affected
// PC (ping / browser). No quizzes: the report is written automatically from what the player did, and
// mistakes have consequences (collateral PCs that break become follow-up complaints; scoring in scoring.ts).
// Physical work is physical: tools come from the workshop cabinet, cables are fixed at the PC (C),
// switches are configured over a console cable at the server-room rack.
// Module layout: see src/game/noc.ts (public facade) and DESIGN.md "Modul NOC".
//
// NocCore: state and rules of the NOC work board. Owns every field of the Noc (save, jobs, inventory, timers)
// and the job lifecycle: offers, accepting work orders, generating shift tickets, checking targets against the
// network simulation, closing and scoring jobs, work days, the tutorial tracker and the per-frame update.
// Physical-work UI lives in workshop.ts (NocWorkshop), panels / HUD / reports / AI mentor in board.ts (Noc).
// Methods a subclass implements are declared abstract below; every field stays here, so the construction order
// is exactly the one of the former single class.
import {
  ENVS,
  SWITCHES,
  envOf,
  live,
  healthy,
  adapterOf,
  bounce,
  portOf,
  outletOf,
  portName,
  routerOf,
  setRouterLan,
  dhcpHousekeeping,
  isWireless,
  ipStr,
  parseIp,
  networkOf,
  maskStr,
  type Env,
  panelOf,
  isWired,
  patchCord,
  apPort,
} from '../../pcos/net';
import { APS, CLIENTS, quality, heardAt, channelClean, type Ap } from '../../pcos/wifi';
import type { PcOS, PcEvent } from '../../pcos/os';
import { SwitchCli } from '../../pcos/switchcli';
import { EXT, EXT_C, DEVICES } from '../../pcos/ext';
import { judge, type Cable, type Wire } from '../crimp';
import { Term } from '../../pcos/term';
import { EDGE } from '../../pcos/edge';
import type { ChatMsg } from '../../ai/nusa';
import { pick, shuffle, h, wallOk, poolSpace, freeIpIn, mulberry } from './util';
import { FAULTS, EDGE_F, registerExtFaults, pickFaultFor, faultBites, rfVariant, injectFaults, type FaultId } from './faults';
import { TEMPLATES, LABPC, DAY_PHASES, PRIO, WHO, registerExtContracts, envForTemplate, offerLine, type TplId, type Prio } from './contracts';
import { RANKS, rankIndexForXp, slaMet, jobStars, jobXp } from './scoring';
import { loadSave, loadNotes, writeSave, fresh, type Save } from './save';
import { jobAp, unpatchedAp, routerProblem, recordProblem, vlanProblem, apProblem, globalProblem } from './checks';
import { ITEM_NAME, apWorld, type PcInfo, type Mode, type Target, type Job, type Item, type Offer, type Note } from './types';
import '../noc.css';
import '../noc.css';

export abstract class NocCore {
  // ---------------------------------------------------------------- implemented by subclasses
  protected abstract endDay(): void;
  abstract openBoard(msg?: string): void;
  protected abstract openBrief(j: Job): void;
  abstract openEdge(): void;
  abstract openOrder(j: Job): void;
  protected abstract openReport(j: Job): void;
  protected abstract renderHud(): void;
  protected abstract voiceComplaints(): void;
  protected s: Save = fresh();
  jobs: Job[] = [];
  mode: 'idle' | 'contract' | 'shift' = 'idle';
  shift = 0;
  trackedId: string | null = null;
  offers: Offer[] = [];
  inv = { tester: false, console: false, laptop: false, toner: false, patch: 0, analyzer: false, ap: 0 };
  analyzerOn = false;
  protected anaEl: HTMLElement | null = null;
  /** world visuals of APs (mounted / taken down) */
  onApVisual: (ap: Ap) => void = () => {};
  /** PC whose wall outlet has the toner generator plugged in */
  toneAt: string | null = null;
  protected probing = false;
  protected sel: { sw: string; pp?: number; swp?: number } | null = null;
  protected audio: AudioContext | null = null;
  protected patchStock = 6;
  protected noCord = new Set<string>();

  /** cables the player crimped and carries (used before stock cords), and which crimped cable sits at which desk */
  protected cables: Cable[] = [];
  protected cordOf = new Map<string, Cable>();
  protected useCord(pc: string) {
    const c = this.cables.shift();
    if (c) {
      this.cordOf.set(pc, c);
      const a = adapterOf(pc);
      a.broken = !judge(c).works;
    } else this.cordOf.delete(pc);
  }
  /** Fase 1 field work: materials used (RJ45 per crimped end, UTP metres per new cable, stock patch cords). Default: no-op. */
  onMaterial: (kind: 'rj45' | 'utp' | 'patch', n: number) => void = () => {};
  /** the crimped cable sitting at this desk (null = a stock patch cord or nothing) */
  cordAt(pc: string): Cable | null {
    return this.cordOf.get(pc) ?? null;
  }
  /** crimped cables in the bag (they are used before stock patch cords) */
  get bagCables() {
    return this.cables.length;
  }
  /** field work: take one cable from the bag for a device port (a crimped cable first, else a stock patch cord); null = bag empty */
  takeCable(): { cable: Cable | null } | null {
    if (this.inv.patch < 1) return null;
    this.inv.patch--;
    const c = this.cables.shift() ?? null;
    if (!c) this.onMaterial('patch', 1);
    return { cable: c };
  }
  protected modal: HTMLElement | null = null;
  protected cli: SwitchCli | null = null;
  protected pendingReport: Job[] = [];
  protected hud: HTMLElement;
  protected listeners = new Set<(open: boolean) => void>();
  protected hudT = 0;
  protected chkT = 0;
  protected hkT = 0;
  protected hudSig = '';
  protected hudFull = 0;
  protected hudWalk = 0;
  readonly CABINET: PcInfo;
  readonly RACKP: PcInfo;
  readonly RACKS: Record<string, PcInfo> = {};
  toast: (s: string, ms?: number) => void = () => {};
  get tickets() {
    return this.jobs;
  }
  get active() {
    return this.mode !== 'idle';
  }

  constructor(
    protected pcos: PcOS,
    protected pcs: PcInfo[],
    readonly rack: { x: number; z: number },
    cabinet: { x: number; z: number } = rack,
    idfs: { id: string; level: number; x: number; y: number; z: number }[] = [],
  ) {
    registerExtFaults();
    registerExtContracts();
    this.s = loadSave();
    // rank-up needs a passed competency test; older saves keep the rank they already earned
    if (typeof this.s.cert !== 'number') this.s.cert = this.xpRankIndex();
    if (typeof this.s.rj45 === 'number') {
      this.rj45 = this.s.rj45;
      this.rj45Used = this.s.rj45Used ?? 0;
    }
    this.CABINET = { name: 'CABINET', label: 'Lemari Alat · Workshop TKJ', x: cabinet.x, y: 1.0, z: cabinet.z, level: 1 };
    this.RACKP = { name: 'RACK', label: 'Rak MDF · Ruang Server L1', x: rack.x, y: 1.4, z: rack.z, level: 1 };
    this.RACKS.MDF = this.RACKP;
    for (const d of idfs) this.RACKS[d.id] = { name: d.id, label: `Rak IDF · Lantai ${d.level}`, x: d.x, y: d.y, z: d.z, level: d.level };
    this.hud = h('div');
    this.hud.id = 'noc-hud';
    document.body.append(this.hud);
    const prev = pcos.onEvent;
    pcos.onEvent = e => {
      prev?.(e);
      this.onPc(e);
    };
    for (const p of pcs) adapterOf(p.name);
    this.tutEl = h('div');
    this.tutEl.id = 'tut-hint';
    document.body.append(this.tutEl);
  }
  protected tutEl: HTMLElement;
  /** set by the game every frame: is the player walking? (stuck detection for tutorial hints) */
  playerMoving = false;
  /** a verified job waits for the technician's berita acara before it closes (QA can switch it off) */
  docRequired = true;
  protected stuck = { key: '', t: 0, idle: 0, wrong: 0, lvl: 0 };
  /** first time in the game: start the tutorial job by itself */
  maybeStartTutorial() {
    if (this.mode === 'idle' && !this.s.mastery.tutor && this.s.closed === 0) this.acceptContract('tutor', 1);
  }
  /** events from devices that are not PCs (IP phones) or modules (QA) */
  extEvent(e: PcEvent) {
    this.onPc(e);
  }
  protected save() {
    this.s.rj45 = this.rj45;
    this.s.rj45Used = this.rj45Used;
    writeSave(this.s, this.notes);
  }
  get xp() {
    return this.s.xp;
  }
  get stats() {
    return { ...this.s };
  }
  xpRankIndex() {
    return rankIndexForXp(this.s.xp);
  }
  rankIndex() {
    return Math.min(this.xpRankIndex(), this.s.cert ?? 0);
  }
  /** the rank whose competency test is open now (XP enough, not yet certified), or -1 */
  examFor() {
    const c = this.s.cert ?? 0;
    return this.xpRankIndex() > c ? c + 1 : -1;
  }
  startExam(): Job | null {
    const to = this.examFor();
    if (to < 0 || this.s.day) return null;
    const pool = (Object.keys(TEMPLATES) as TplId[]).filter(t => TEMPLATES[t].rank <= to - 1 && t !== 'crimp' && t !== 'tutor');
    const tpl = pool.sort((a, b) => TEMPLATES[b].rank - TEMPLATES[a].rank || TEMPLATES[b].xp - TEMPLATES[a].xp).slice(0, 3)[
      Math.floor(Math.random() * Math.min(3, pool.length))
    ];
    const j = this.acceptContract(tpl);
    if (!j) return null;
    j.exam = to;
    j.sla = Math.round(j.sla * 0.8);
    j.title = `UJI KENAIKAN PANGKAT ${RANKS[to].name}: ${j.title}`;
    this.openOrder(j);
    return j;
  }
  rank() {
    return RANKS[this.rankIndex()].name;
  }
  isModalOpen() {
    return !!this.modal;
  }
  onModal(f: (open: boolean) => void) {
    this.listeners.add(f);
  }
  setHudVisible(v: boolean) {
    this.hud.style.display = v ? '' : 'none';
  }
  protected openJobs() {
    return this.jobs.filter(j => j.status !== 'closed');
  }
  whereNow: { pc: string | null; rack: string | null } = { pc: null, rack: null };
  protected nusaHist: ChatMsg[] = [];
  protected nusaView: { me: boolean; text: string; ai: boolean }[] = [];
  protected nusaBusy = false;
  /** closing notes written in job reports (kept with the save, last 30) */
  notes: Note[] = loadNotes();
  tracked(): Job | null {
    const j = this.jobs.find(x => x.id === this.trackedId && x.status !== 'closed') ?? this.openJobs()[0] ?? null;
    if (j) j.pc = this.nextStop(j);
    return j;
  }
  protected wired() {
    return this.pcs.filter(p => !isWireless(p.name) && isWired(p.name) && !LABPC.test(p.name));
  }
  protected rackOf(swName?: string): PcInfo {
    const sw = SWITCHES.find(s => s.name === swName);
    return (sw && this.RACKS[sw.rack]) || this.RACKP;
  }
  protected rackName(swName?: string) {
    const sw = SWITCHES.find(s => s.name === swName);
    return !sw || sw.level === 1 ? 'rak MDF ruang server L1' : `rak IDF lantai ${sw.level}`;
  }
  protected pcLabel(name: string) {
    return this.pcs.find(p => p.name === name)?.label ?? name;
  }

  // ---------------------------------------------------------------- next stop / guidance
  protected needs(j: Job): Item[] {
    const need: Item[] = [];
    const isC = j.kind === 'contract';
    if (j.faults.some(f => EDGE_F.includes(f))) {
      for (const it of ['console', 'laptop'] as Item[]) if (!this.inv[it as 'console']) need.push(it);
      return need;
    }
    if (j.tpl === 'crimp') {
      if (!this.inv.tester) need.push('tester');
      return need;
    }
    if (j.tut) {
      const pc = j.targets[0].pc.name;
      if (!this.inv.tester && !j.tut.tested) need.push('tester');
      if (this.noCord.has(pc) && this.inv.patch < 1) need.push('patch');
      return need;
    }
    if (isC && j.tpl === 'ap') {
      const ap = this.jobAp(j)!;
      if (!ap.mounted && this.inv.ap < 1) need.push('ap');
      if (this.unpatchedAp(j) && this.inv.patch < 1) need.push('patch');
      for (const it of ['console', 'laptop', 'analyzer'] as Item[]) if (!this.inv[it as 'console']) need.push(it);
      return need;
    }
    if (j.faults.includes('appoe')) {
      for (const it of ['console', 'laptop'] as Item[]) if (!this.inv[it as 'console']) need.push(it);
      return need;
    }
    const physical = (isC && (j.tpl === 'desk' || j.tpl === 'vlan')) || j.faults.some(f => f === 'port' || f === 'vlan' || f === 'cablebad');
    if (isC && j.tpl === 'desk') {
      const want =
        j.targets.filter(t => this.noCord.has(t.pc.name)).length + j.targets.filter(t => this.unpatched(j, t.pc.name) && !panelOf(t.pc.name)!.pp.hang).length;
      if (want && this.inv.patch < want) need.push('patch');
      if (!this.inv.toner && j.targets.some(t => this.unpatched(j, t.pc.name) && !panelOf(t.pc.name)!.pp.label)) need.push('toner');
    } else if (j.faults.includes('cablebad') && this.inv.patch < 1) need.push('patch');
    if (((isC && (j.tpl === 'desk' || j.tpl === 'vlan')) || j.faults.some(f => f === 'port' || f === 'vlan')) && !this.inv.console) need.push('console');
    if (((isC && (j.tpl === 'desk' || j.tpl === 'vlan')) || j.faults.some(f => f === 'port' || f === 'vlan')) && !this.inv.laptop) need.push('laptop');
    return physical ? need : [];
  }
  protected switchPending(j: Job) {
    if (j.kind !== 'contract') return false;
    if (j.tpl === 'vlan') return !!this.vlanProblem(j);
    if (j.tpl === 'desk') return j.targets.some(t => this.unpatched(j, t.pc.name) || portOf(t.pc.name)?.port.shutdown || envOf(t.pc.name).id !== j.envId);
    if (j.tpl === 'ap') {
      const ap = this.jobAp(j)!,
        p = apPort(ap);
      return this.unpatchedAp(j) || !p || p.port.shutdown || p.port.vlan !== 40 || p.port.poe === false;
    }
    return false;
  }
  jobAp(j: Job): Ap | null {
    return jobAp(j);
  }
  protected unpatchedAp(j: Job) {
    return unpatchedAp(j);
  }
  /** an IT office PC (lab segment) from which the WLC and the routers can be managed */
  protected itPc(): PcInfo {
    return (
      this.pcs.find(p => p.level === 1 && /_ITOFFICE_/.test(p.name) && healthy(adapterOf(p.name))) ??
      this.pcs.find(p => p.level === 1 && /_ITOFFICE_/.test(p.name)) ??
      this.CABINET
    );
  }
  protected apSpot(ap: Ap): PcInfo {
    const w = apWorld(ap);
    return { name: `SPOT-${ap.id}`, label: `Bracket plafon ${ap.id} · koridor L${ap.level}`, x: w.x, y: w.y - 1.6, z: w.z, level: ap.level };
  }
  /** places in the world the board owns besides PCs/racks (AP mount brackets); main shows the prompt and calls useSpot */
  spots(): { id: string; x: number; z: number; level: number; hint: string; r?: number; y?: number }[] {
    const out: { id: string; x: number; z: number; level: number; hint: string; r?: number; y?: number }[] = [];
    for (const j of this.openJobs()) {
      const ap = this.jobAp(j);
      if (ap && !ap.mounted) {
        const w = apWorld(ap);
        out.push({ id: ap.id, x: w.x, z: w.z, level: ap.level, hint: `[F] Pasang AP di bracket plafon (${ap.id})` });
      }
    }
    for (const d of DEVICES) out.push({ id: d.id, x: d.x, z: d.z, level: d.level, hint: d.hint(), r: d.r, y: d.y });
    return out;
  }
  useSpot(id: string) {
    const dev = DEVICES.find(d => d.id === id);
    if (dev) {
      dev.use();
      return;
    }
    const ap = APS.find(a => a.id === id);
    if (!ap || ap.mounted) return;
    if (this.inv.ap < 1) {
      this.toast('Kamu tidak membawa AP pengganti. Ambil di Lemari Alat (Workshop TKJ).', 3500);
      return;
    }
    this.inv.ap--;
    ap.mounted = true;
    this.onApVisual(ap);
    this.logAll(`${ap.id}: AP baru dipasang di bracket plafon, kabel outlet plafon dicolok ke port LAN/PoE AP`);
    this.toast(`${ap.id} terpasang. LED AP masih mati sampai port switch-nya memberi daya PoE.`, 3800);
    this.check(false);
  }
  /** desk job: the PC's panel port is not yet patched to the switch port of the work order */
  protected unpatched(j: Job, pc: string) {
    const q = panelOf(pc);
    return !!j.swPort && !!q && q.pp.patch !== j.swPort[pc];
  }
  protected needsTone(j: Job) {
    return j.targets.find(t => this.unpatched(j, t.pc.name) && !panelOf(t.pc.name)!.pp.label && this.toneAt !== t.pc.name) ?? null;
  }
  protected labelMissing(j: Job) {
    return j.kind === 'contract' && j.tpl === 'desk' ? (j.targets.find(t => wallOk(t.pc.name) === false) ?? null) : null;
  }
  nextStop(j: Job): PcInfo {
    if (j.faults.some(f => EDGE_F.includes(f))) {
      if (this.needs(j).length) return this.CABINET;
      if (!j.faults.every(f => !EXT[f] || EXT[f].ok(j.targets[0].pc.name)) && this.PLACES.RACK1) return this.PLACES.RACK1;
    }
    if (j.tut) return this.needs(j).length ? this.CABINET : j.targets[0].pc;
    if (j.kind === 'contract' && this.needs(j).length) return this.CABINET;
    if (j.kind === 'contract' && j.tpl === 'ap') {
      const ap = this.jobAp(j)!;
      if (!ap.mounted) return this.apSpot(ap);
      if (this.switchPending(j)) return this.rackOf(j.sw);
      if (!ap.adopted || !channelClean(ap) || !ap.radio) return this.itPc();
    }
    if (j.kind !== 'contract' && j.faults.includes('appoe') && this.needs(j).length) return this.CABINET;
    if (j.kind !== 'contract' && j.faults.some(f => f === 'aprf' || f === 'dhcppool') && !j.targets.every(t => t.ok)) {
      const fixed = this.wifiFixed(j);
      if (!fixed) return this.itPc();
    }
    if (j.kind === 'contract' && j.tpl === 'desk' && j.targets.some(t => this.noCord.has(t.pc.name)))
      return j.targets.find(t => this.noCord.has(t.pc.name))!.pc;
    if (j.kind === 'contract' && j.tpl === 'desk' && this.needsTone(j)) return this.needsTone(j)!.pc;
    if (j.kind === 'contract' && this.switchPending(j)) return this.rackOf(j.sw);
    if (this.labelMissing(j)) return this.labelMissing(j)!.pc;
    return (j.targets.find(t => !(t.ok && t.tested)) ?? j.targets[0]).pc;
  }
  nextHint(j: Job): string {
    if (j.docReady) return 'Dokumentasi: buka surat kerja (T → Surat), isi berita acara, tanda tangan & serahkan';
    const n = this.needs(j);
    if (j.faults.some(f => EDGE_F.includes(f)) && n.length) return `Ambil di Lemari Alat: ${n.map(i => ITEM_NAME[i]).join(', ')}`;
    if (j.faults.some(f => EDGE_F.includes(f)) && !j.faults.every(f => !EXT[f] || EXT[f].ok(j.targets[0].pc.name)))
      return 'Router edge R-EDGE di rak 1 ruang server L1 [F]: console';
    if (j.tut) {
      const st = this.tutStage(j);
      const pc = j.targets[0].pc.label;
      return st === 'tools'
        ? `Ambil di Lemari Alat: ${n.map(i => ITEM_NAME[i]).join(', ')}`
        : st === 'cord'
          ? `${pc}: cek fisik [C], pasang patch cord outlet → PC`
          : st === 'test'
            ? `${pc}: cek fisik [C], tes kabel dengan LAN tester`
            : st === 'sit'
              ? `Nyalakan ${pc} [F]`
              : st === 'ipconfig'
                ? 'Command Prompt: ketik ipconfig'
                : st === 'ping'
                  ? 'Command Prompt: ping alamat Default Gateway'
                  : 'Selesai';
    }
    if (j.tpl === 'crimp' && n.length) return `Ambil di Lemari Alat: ${n.map(i => ITEM_NAME[i]).join(', ')}`;
    if (j.tpl === 'crimp' && j.targets.some(t => this.noCord.has(t.pc.name)) && this.inv.patch < 1)
      return 'Lemari Alat › Crimping: buat patch cord T568B dan tes';
    if (j.tpl === 'crimp' && j.targets.some(t => this.noCord.has(t.pc.name))) {
      const t = j.targets.find(x => this.noCord.has(x.pc.name))!;
      return `${t.pc.label}: pasang kabel buatanmu dari outlet ke PC [C]`;
    }
    if (j.kind === 'contract' && n.length) return `Ambil di Lemari Alat: ${n.map(i => ITEM_NAME[i]).join(', ')}`;
    if (j.kind === 'contract' && j.tpl === 'ap') {
      const ap = this.jobAp(j)!,
        p = apPort(ap);
      if (!ap.mounted) return `Pasang AP di bracket plafon koridor lantai ${ap.level} [F]`;
      if (this.unpatchedAp(j)) return `Rak IDF lantai ${ap.level} [F]: patch PP-${panelOf(ap.id)!.pp.n} (outlet AP) ke ${portName(j.swPort![ap.id])}`;
      if (this.switchPending(j))
        return `Console ${j.sw}: ${portName(p!.port.n)} → ${p!.port.vlan !== 40 ? 'switchport access vlan 40 · ' : ''}${p!.port.poe === false ? 'power inline auto · ' : ''}${p!.port.shutdown ? 'no shutdown' : ''}`.replace(
          / · $/,
          '',
        );
      if (!ap.adopted) return `PC Kantor IT: buka NusaWLC (http://192.168.10.20) dan adopsi ${ap.id}`;
      if (!ap.radio) return `NusaWLC: nyalakan radio ${ap.id}`;
      if (!channelClean(ap)) return `Survei kanal di bawah ${ap.id} pakai analyzer [R], lalu set kanal bersih (1/6/11) di NusaWLC`;
    }
    if (j.kind !== 'contract' && j.faults.includes('appoe') && n.length) return `Ambil di Lemari Alat: ${n.map(i => ITEM_NAME[i]).join(', ')}`;
    if (j.kind === 'contract' && j.tpl === 'desk' && j.targets.some(t => this.noCord.has(t.pc.name))) return 'Pasang patch cord PC → outlet di meja baru [C]';
    if (j.kind === 'contract' && j.tpl === 'desk' && this.needsTone(j)) return `${this.needsTone(j)!.pc.label}: pasang toner di outlet [C]`;
    if (j.kind === 'contract' && j.tpl === 'desk' && j.targets.some(t => this.unpatched(j, t.pc.name)))
      return `Di ${this.rackName(j.sw)} [F]: cari port patch panel pakai probe, patch ke port switch`;
    if (j.kind === 'contract' && this.switchPending(j)) return `Konfigurasi switch lewat console di ${this.rackName(j.sw)} [F]`;
    if (this.labelMissing(j)) return `${this.labelMissing(j)!.pc.label}: tempel label outlet sesuai nomor patch panel [C]`;
    if (j.kind === 'contract' && j.tpl === 'renum' && this.routerProblem(j)) return `Konfigurasi router: ${this.routerProblem(j)}`;
    if (j.kind === 'contract' && j.tpl === 'dns' && this.recordProblem(j)) return 'Tambahkan record DNS di router segmen';
    const t = j.targets.find(x => !x.ok);
    if (t) return `${t.pc.label}: ${t.note || 'belum sesuai surat kerja'}`;
    const u = j.targets.find(x => !x.tested);
    const xh = String(j.tpl).startsWith('x_') ? EXT_C[String(j.tpl).slice(2)]?.testHint : j.faults.map(f => EXT[f]?.testHint).find(Boolean);
    if (u) return `Uji dari ${u.pc.label}: ${u.mode === 'browse' ? `buka ${u.browse}` : (xh ?? 'ping / buka situs')}`;
    return 'Selesai';
  }

  // ---------------------------------------------------------------- contract offers
  protected ensureOffers() {
    if (this.offers.length) return;
    const rk = this.rankIndex();
    const ids = (Object.keys(TEMPLATES) as TplId[]).filter(t => TEMPLATES[t].rank <= rk && t !== 'tutor');
    const order = shuffle(ids);
    while (order.length < 3) order.push(pick(ids));
    this.offers = order.slice(0, 3).map(tpl => this.preview(tpl, Math.floor(Math.random() * 1e9)));
    if (!this.s.mastery.tutor) this.offers.unshift(this.preview('tutor', 1));
  }
  protected preview(tpl: TplId, seed: number): Offer {
    const r = mulberry(seed);
    const env = this.pickEnv(tpl, r);
    const t = TEMPLATES[tpl];
    return { tpl, seed, title: t.name, lines: [offerLine(tpl, env) ?? t.brief[0]], envLabel: env.label };
  }
  protected pickEnv(tpl: TplId, r: () => number): Env {
    return envForTemplate(tpl, r);
  }
  protected pcsIn(env: Env, healthyOnly = true) {
    return this.wired().filter(p => envOf(p.name) === env && (!healthyOnly || healthy(adapterOf(p.name))));
  }
  protected freeIp(env: Env, r: () => number, lo = 21, hi = 89, avoid: string[] = []) {
    return freeIpIn(env, r, lo, hi, avoid);
  }
  protected newJob(kind: Job['kind'], tpl: Job['tpl'], title: string, who: string, prio: Prio, sla: number, envId: string): Job {
    return {
      id: `${kind === 'contract' ? 'SPK' : 'TKT'}-${String(++this.s.seq).padStart(4, '0')}`,
      kind,
      tpl,
      title,
      who,
      prio,
      sla,
      age: 0,
      status: 'open',
      targets: [],
      faults: [],
      order: [],
      envId,
      wrong: 0,
      log: [],
      snap: [],
      hint: this.rankIndex() === 0,
      pc: this.CABINET,
    };
  }
  protected target(pc: PcInfo, mode: Mode, extra: Partial<Target> = {}): Target {
    return { pc, mode, ok: false, tested: false, note: '', ...extra };
  }

  /** wireless ticket: is the root cause gone (so the next stop is the laptop again)? */
  protected wifiFixed(j: Job) {
    const pc = j.targets[0].pc.name,
      q = quality(pc),
      env = ENVS.guest;
    if (j.faults.includes('dhcppool') && poolSpace(env) < 20) return false;
    if (j.faults.includes('aprf') && (!q || !q.ok)) return false;
    return true;
  }
  /** Accept a work order (QA can pass a template and a seed). */
  acceptContract(tpl: TplId, seed = Math.floor(Math.random() * 1e9)): Job | null {
    if (this.mode !== 'idle') {
      this.toast('Selesaikan pekerjaan yang sedang berjalan dulu.');
      return null;
    }
    const r = mulberry(seed);
    const env = this.pickEnv(tpl, r);
    const rk = this.rankIndex();
    const T = TEMPLATES[tpl];
    const j = this.newJob('contract', tpl, T.name, pick(WHO[env.id].who, r), 'Sedang', T.sla, env.id);
    const avail = shuffle(this.pcsIn(env), r);
    if (tpl === 'tutor') {
      const cab = this.CABINET;
      const pc = this.wired()
        .filter(p => p.level === 1 && envOf(p.name) === ENVS.lab && adapterOf(p.name).dhcp && healthy(adapterOf(p.name)))
        .sort((a, b) => Math.hypot(a.x - cab.x, a.z - cab.z) - Math.hypot(b.x - cab.x, b.z - cab.z))[0];
      if (pc) {
        const a = adapterOf(pc.name);
        a.cable = false;
        this.noCord.add(pc.name);
        bounce(a);
        j.targets.push(this.target(pc, 'dhcp'));
        j.tut = { tested: false, ipconfig: false, gw: env.gateway };
        j.who = 'Kak Rani (pembimbing)';
        j.order = [
          `${pc.label} (outlet ${outletOf(pc.name)}) belum tersambung: kabel dari outlet dinding ke PC belum dipasang.`,
          'Ambil LAN tester dan 1 patch cord di Lemari Alat (Workshop TKJ).',
          'Pasang patch cord dan tes kabelnya [C], nyalakan PC [F], lalu Command Prompt: ipconfig dan ping Default Gateway.',
        ];
      }
    } else if (tpl === 'crimp') {
      const cab = this.CABINET;
      const cand = this.wired()
        .filter(p => p.level === 1 && envOf(p.name) === ENVS.lab && adapterOf(p.name).dhcp && healthy(adapterOf(p.name)))
        .sort((a, b) => Math.hypot(a.x - cab.x, a.z - cab.z) - Math.hypot(b.x - cab.x, b.z - cab.z));
      const n = rk === 0 ? 1 : 2;
      for (const pc of cand.slice(0, n)) {
        const a = adapterOf(pc.name);
        a.cable = false;
        this.noCord.add(pc.name);
        this.cordOf.delete(pc.name);
        bounce(a);
        j.targets.push(this.target(pc, 'dhcp'));
      }
      j.order = [
        `${j.targets.map(t => `${t.pc.label} (outlet ${outletOf(t.pc.name)})`).join(' dan ')}: belum ada patch cord.`,
        `Buat ${j.targets.length} patch cord Cat6 straight-through T568B di Lemari Alat › Crimping, lalu tes dengan LAN tester.`,
        'Pasang dari outlet ke PC [C], nyalakan PC, ipconfig, ping gateway.',
      ];
    } else if (tpl.startsWith('x_')) {
      const C = EXT_C[tpl.slice(2)];
      const cand = shuffle(
        this.pcs.filter(p => !LABPC.test(p.name) && healthy(adapterOf(p.name)) && envOf(p.name).id !== 'none'),
        r,
      ).map(p => p.name);
      const pcs = C ? C.pick(cand) : [];
      if (pcs.length) {
        const lbl = (n: string) => this.pcLabel(n);
        j.order = C.setup(pcs).map(x => x.replace('{PCS}', pcs.map(lbl).join(', ')).replace('{PC}', lbl(pcs[0])));
        for (const n of pcs)
          j.targets.push(
            this.target(
              this.pcs.find(p => p.name === n)!,
              'any',
            ),
          );
        j.envId = envOf(pcs[0]).id;
      }
    } else if (tpl === 'static') {
      const n = rk === 0 ? 2 : 3;
      const used: string[] = [];
      for (const pc of avail.slice(0, n)) {
        const ip = this.freeIp(env, r, 21, 89, used);
        used.push(ip);
        j.targets.push(this.target(pc, 'static', { ip, mask: maskStr(env.prefix), gw: env.gateway, dns: env.gateway }));
      }
      j.order = [
        `Segmen: ${env.label} · router ${env.gateway}/${env.prefix}`,
        ...j.targets.map(t => `${t.pc.label} → IP ${t.ip} · mask ${t.mask} · gateway ${t.gw} · DNS ${t.dns}`),
      ];
      if (rk >= 1 && r() < 0.5) {
        const t = pick(j.targets, r);
        adapterOf(t.pc.name).cable = false;
      }
    } else if (tpl === 'desk') {
      const n = rk === 0 ? 1 : 2;
      const lv = avail[0]?.level;
      j.swPort = {};
      for (const pc of avail.filter(p => p.level === lv).slice(0, n)) {
        const a = adapterOf(pc.name),
          q = panelOf(pc.name)!,
          sw = q.sw;
        // the desk is new: no cord at the desk, outlet not labelled, panel port not patched, its old switch port freed
        const old = q.pp.patch;
        a.cable = false;
        this.noCord.add(pc.name);
        q.pp.label = '';
        patchCord(sw, q.pp.n, null);
        q.pp.hang = false;
        bounce(a);
        if (old) {
          sw.ports[old - 1].desc = '';
          sw.ports[old - 1].shutdown = true;
        }
        const used = new Set(Object.values(j.swPort));
        const free = sw.ports.filter(p => !p.pc && p.n <= 44 && !sw.loop?.includes(p.n) && !used.has(p.n) && !sw.panel.some(x => x.patch === p.n));
        const port = pick(free.filter(p => p.n > 24).length ? free.filter(p => p.n > 24) : free, r);
        port.shutdown = true;
        port.desc = '';
        port.vlan = rk >= 1 && r() < 0.6 ? 1 : env.vlan;
        j.swPort[pc.name] = port.n;
        j.targets.push(this.target(pc, 'dhcp'));
      }
      j.sw = panelOf(j.targets[0].pc.name)!.sw.name;
      j.order = [
        ...j.targets.map(
          t => `${t.pc.label}: outlet belum berlabel. Cari port patch panelnya dengan toner, lalu patch ke ${j.sw} ${portName(j.swPort![t.pc.name])}.`,
        ),
        `Port switch harus aktif dan masuk VLAN ${env.vlan} (${env.label}). PC memakai DHCP.`,
        'Tempel label outlet sesuai nomor port patch panel (format L2-07).',
      ];
    } else if (tpl === 'dns') {
      const names = ['absensi', 'presensi', 'inventaris', 'helpdesk', 'elearning', 'arsip', 'perpus', 'cuti', 'gaji', 'tiket'];
      const nm =
        pick(
          names.filter(x => !env.hosts.some(hh => hh.name === `srv-${x}`)),
          r,
        ) ?? `app${Math.floor(r() * 90 + 10)}`;
      const ip = this.freeIp(env, r, 30, 60);
      env.hosts.push({ ip, name: `srv-${nm}`, mac: `52-54-00-${Math.floor(r() * 90 + 10)}-00-${Math.floor(r() * 90 + 10)}`, ttl: 64, web: 'intranet' });
      const fqdn = `${nm}.${env.suffix}`;
      j.record = { name: fqdn, ip };
      for (const pc of avail.slice(0, 2)) j.targets.push(this.target(pc, 'browse', { browse: fqdn }));
      if (r() < 0.6 && j.targets.length) {
        const a = adapterOf(j.targets[1 % j.targets.length].pc.name);
        a.dnsAuto = false;
        a.dns1 = '8.8.8.8';
        a.dns2 = '';
        if (!a.dhcp) a.dns1 = '8.8.8.8';
      }
      j.order = [
        `Server srv-${nm} sudah aktif di ${ip} (segmen ${env.label}).`,
        `Buat nama ${fqdn} → ${ip} di DNS router ${env.gateway}.`,
        `Pastikan ${j.targets.map(t => t.pc.label).join(' dan ')} bisa membuka http://${fqdn}`,
      ];
    } else if (tpl === 'renum') {
      const second = () => 10 + Math.floor(r() * 80);
      let base: string;
      do {
        const k = r();
        base =
          k < 0.45
            ? `10.${second()}.${Math.floor(r() * 100)}.0`
            : k < 0.8
              ? `192.168.${40 + Math.floor(r() * 50)}.0`
              : `172.${16 + Math.floor(r() * 15)}.${Math.floor(r() * 200)}.0`;
      } while (Object.values(ENVS).some(e => e.net === base) || base.startsWith('192.168.88.') || base.startsWith('192.168.1.'));
      const prefix = rk >= 2 && r() < 0.4 ? 25 : 24;
      const b = parseIp(base)!;
      const gwOff = r() < 0.75 ? 1 : prefix === 24 ? 254 : 126;
      const gw = ipStr(b + gwOff);
      const start = ipStr(b + (prefix === 24 ? 100 : 40)),
        end = ipStr(b + (prefix === 24 ? 199 : 100));
      // the factory-reset router + the server team already moved their boxes
      const offs = env.hosts.map(x => parseIp(x.ip)! - networkOf(parseIp(env.gateway)!, env.prefix));
      setRouterLan(env, '192.168.88.1', 24);
      env.dhcp = null;
      env.leases.clear();
      env.dnsSrv = { allow: false, upstream: [], records: env.dnsSrv.records };
      env.hosts.forEach((x, i) => {
        if (x.web !== 'router') {
          let o = offs[i];
          if (o === gwOff) o = 2;
          if (prefix === 25 && o > 120) o = 3 + i;
          x.ip = ipStr(b + o);
        }
      });
      j.router = { ip: gw, prefix, start, end };
      const dh = shuffle(
        avail.filter(p => adapterOf(p.name).dhcp),
        r,
      ).slice(0, 3);
      for (const pc of dh) j.targets.push(this.target(pc, 'dhcp'));
      for (const p of this.wired())
        if (envOf(p.name) === env && !adapterOf(p.name).dhcp && !j.targets.some(t => t.pc.name === p.name))
          j.targets.push(this.target(p, 'any', { note: 'masih memakai IP statis subnet lama' }));
      j.order = [
        `Router baru (sudah di-reset: 192.168.88.1/24, admin tanpa password, DHCP server belum aktif).`,
        `LAN baru: ${gw}/${prefix} · DHCP pool ${start} – ${end} · gateway ${gw} · DNS ${gw}`,
        `DNS router: upstream 8.8.8.8 dan Allow Remote Requests aktif.`,
        `Uji dari: ${j.targets.map(t => t.pc.label).join(', ')}`,
      ];
    } else if (tpl === 'ap') {
      const lv = 4 + Math.floor(r() * 5);
      const ap = pick(
        APS.filter(a => a.level === lv),
        r,
      );
      const q = panelOf(ap.id)!,
        sw = q.sw;
      // the broken AP was taken down: its old switch port is marked faulty, the patch cord went with it
      const old = q.pp.patch;
      patchCord(sw, q.pp.n, null);
      q.pp.hang = false;
      if (old) {
        sw.ports[old - 1].desc = 'RUSAK-JANGAN-PAKAI';
        sw.ports[old - 1].shutdown = true;
      }
      ap.mounted = false;
      ap.adopted = false;
      ap.radio = true;
      ap.power = 'Sedang';
      this.onApVisual(ap);
      // the replacement ships on the channel the strongest neighbour uses at that spot (so the survey matters)
      const w = apWorld(ap),
        nb = heardAt(ap.lx, ap.lz, w.y - 0.3, ap.level).find(x => x.ap !== ap);
      ap.ch = nb ? nb.ap.ch : 6;
      const free = sw.ports.filter(x => x.n >= 5 && x.n <= 40 && !sw.panel.some(z => z.patch === x.n));
      const port = pick(free, r);
      port.vlan = 1;
      port.shutdown = true;
      port.poe = true;
      port.desc = '';
      j.swPort = { [ap.id]: port.n };
      j.sw = sw.name;
      j.apId = ap.id;
      // the rooms that lose most: laptops on that floor nearest to the AP
      const lap = this.pcs
        .filter(p => p.level === lv && isWireless(p.name))
        .sort((a, b) => Math.hypot(a.x - w.x, a.z - w.z) - Math.hypot(b.x - w.x, b.z - w.z))
        .slice(0, 2);
      for (const pc of lap) j.targets.push(this.target(pc, 'any'));
      j.order = [
        `AP: ${ap.id} (koridor lantai ${lv}, plafon) · outlet plafon ${outletOf(ap.id)} → PP-${q.pp.n} di rak IDF lantai ${lv}`,
        `Port switch lama ${old ? portName(old) : '-'} rusak: pakai ${portName(port.n)} di ${sw.name} → access VLAN 40 (TAMU), PoE aktif, no shutdown, simpan konfigurasi.`,
        `Adopsi AP di NusaWLC (http://192.168.10.20, dari PC Kantor IT), lalu atur kanal yang bersih (survei dengan Wi-Fi analyzer).`,
        `Uji dari: ${j.targets.map(t => t.pc.label).join(', ')}`,
      ];
    } else if (tpl === 'vlan') {
      const lv = r() < 0.5 ? 2 : 3;
      const onFloor = avail.filter(p => p.level === lv);
      const n = rk >= 3 ? 3 : 2;
      for (const pc of (onFloor.length >= n ? onFloor : avail).slice(0, n)) j.targets.push(this.target(pc, 'env', { env: 'kasir' }));
      j.sw = portOf(j.targets[0].pc.name)!.sw.name;
      j.vlanName = 'KASIR';
      j.order = [
        `Pindahkan ke VLAN 30 "KASIR" di ${j.sw}: ${j.targets.map(t => `${t.pc.label} (${portName(portOf(t.pc.name)!.port.n)})`).join(', ')}`,
        'PC harus dapat 192.168.30.x dari router kasir dan bisa membuka server POS 192.168.30.10.',
        'Simpan konfigurasi switch setelah selesai.',
      ];
    }
    if (!j.targets.length) {
      this.toast('Tidak ada PC yang cocok untuk pekerjaan ini sekarang.');
      return null;
    }
    this.patchStock = tpl === 'crimp' ? 0 : 6;
    this.jobs = [j];
    this.dayPressure();
    j.snap = this.snapshot();
    this.jobs = [j];
    this.mode = 'contract';
    this.trackedId = j.id;
    this.offers = [];
    this.save();
    if (tpl === 'tutor') {
      // first minute of the game: one line from the supervisor instead of two text panels; the surat kerja stays one key away (T)
      if (!this.s.seen.includes(tpl)) {
        this.s.seen.push(tpl);
        this.save();
      }
      this.toast(
        'Kak Rani: Hari pertama! Satu PC di Workshop TKJ belum tersambung. Ambil alat di Lemari Alat dulu, ikuti penanda hijau. Surat kerja: T.',
        9000,
      );
    } else if (!this.s.seen.includes(tpl)) {
      this.s.seen.push(tpl);
      this.save();
      this.openBrief(j);
    } else this.openOrder(j);
    return j;
  }

  // ---------------------------------------------------------------- shift & ticket generation
  startShift(rand = Math.random, force?: FaultId[]) {
    if (this.mode === 'shift') {
      this.openBoard();
      return;
    }
    if (this.mode !== 'idle') {
      this.toast('Selesaikan surat kerja yang sedang berjalan dulu.');
      return;
    }
    const rk = this.rankIndex();
    const n = force?.length ?? Math.min(6, 3 + Math.min(rk, 2) + Math.floor((this.s.day?.n ?? 1) / 4));
    this.shift = ++this.s.shifts;
    this.mode = 'shift';
    this.jobs = [];
    const used = new Set<string>(),
      busySw = new Set<string>();
    for (let i = 0; i < n; i++) {
      const wide = force && (force[i] === 'uplink' || force[i] === 'loop');
      const wf = !!force && !!FAULTS[force[i]].wifi;
      const pool = this.pcs.filter(
        p =>
          !LABPC.test(p.name) &&
          !used.has(p.name) &&
          (rk > 0 || p.level <= 3) &&
          !(force && !wf && p.level > 3) &&
          envOf(p.name).id !== 'none' &&
          healthy(adapterOf(p.name)) &&
          !(wf && (!isWireless(p.name) || !this.bites(p.name, force![i]))) &&
          !(force && EXT[force[i]] && !EXT[force[i]].eligible(p.name)) &&
          !(wide && (busySw.has(portOf(p.name)?.sw.name ?? '-') || !portOf(p.name) || (force![i] === 'uplink' && !portOf(p.name)!.sw.uplink))),
      );
      if (!pool.length) break;
      const pc = pick(pool, rand);
      used.add(pc.name);
      const env = envOf(pc.name);
      const swn = portOf(pc.name)?.sw.name ?? '';
      const f = force ? force[i] : this.pickFault(pc.name, rk, rand, undefined, busySw.has(swn));
      if (swn) busySw.add(swn);
      const faults: FaultId[] = [f];
      const dn = this.s.day?.n ?? 0;
      const extra = force
        ? 0
        : rk === 0
          ? 0
          : rk === 1
            ? rand() < 0.2 + Math.min(0.15, dn * 0.02)
              ? 1
              : 0
            : rand() < 0.4 + Math.min(0.2, dn * 0.02)
              ? rand() < 0.35
                ? 2
                : 1
              : 0;
      for (let k = 0; k < extra; k++) {
        const g = this.pickFault(pc.name, rk, rand, f);
        if (
          !faults.includes(g) &&
          g !== 'disabled' &&
          f !== 'disabled' &&
          !EXT[g] &&
          !EXT[f] &&
          FAULTS[g].wired === FAULTS[f].wired &&
          !(faults.includes('cable') && g === 'cablebad') &&
          !(faults.includes('cablebad') && g === 'cable')
        )
          faults.push(g);
      }
      const wi = Math.floor(rand() * WHO[env.id].who.length);
      const prio = WHO[env.id].prio[wi];
      const t = this.newJob('ticket', f, FAULTS[f].symptom, WHO[env.id].who[wi], prio, PRIO[prio], env.id);
      t.age = -i * 25;
      t.faults = faults;
      t.targets = [this.target(pc, 'any')];
      if (f === 'uplink' || f === 'loop') {
        const sw = portOf(pc.name)!.sw;
        const mate = shuffle(
          this.pcs.filter(p => !used.has(p.name) && portOf(p.name)?.sw === sw && healthy(adapterOf(p.name))),
          rand,
        )[0];
        if (mate) {
          used.add(mate.name);
          t.targets.push(this.target(mate, 'any'));
        }
        t.order = [
          `${t.who} · Lantai ${sw.level}: ${t.targets.map(x => x.pc.label).join(', ')} (dan PC lain di lantai itu)`,
          `Keluhan: “${FAULTS[f].symptom}”`,
        ];
      } else if (isWireless(pc.name)) {
        const c = CLIENTS.get(pc.name);
        t.order = [`${t.who} · Kamar ${c?.room ?? '?'} (a.n. ${c?.guest ?? '-'}) · ${pc.label}`, `Keluhan: “${FAULTS[f].symptom}”`];
      } else t.order = [`${t.who} · ${pc.label}${isWired(pc.name) ? ` · outlet ${outletOf(pc.name)}` : ''}`, `Keluhan: “${FAULTS[f].symptom}”`];
      this.inject(t);
      this.jobs.push(t);
    }
    this.patchStock = 6;
    this.dayPressure();
    this.voiceComplaints();
    const snap = this.snapshot();
    for (const j of this.jobs) j.snap = snap;
    this.trackedId = this.jobs[0]?.id ?? null;
    this.save();
    this.openBoard(`Shift ${this.shift} dimulai. ${this.jobs.length} tiket masuk ke antrean NOC.`);
  }
  protected pickFault(pc: string, rk: number, rand: () => number, not?: FaultId, swBusy = false): FaultId {
    return pickFaultFor(pc, rk, rand, this.jobs, this.s.mastery, not, swBusy);
  }
  /** would this Wi-Fi fault really hurt this laptop? (tried and undone) */
  protected bites(pc: string, id: FaultId): boolean {
    return faultBites(pc, id, this.jobs);
  }
  protected rfVariant(pc: string, ap: Ap): { apply: () => void; detail: string } | null {
    return rfVariant(pc, ap);
  }
  /** Break the PC so the fault really exists in the simulation. */
  protected inject(t: Job) {
    injectFaults(t);
  }
  protected snapshot() {
    return this.pcs.filter(p => !LABPC.test(p.name) && healthy(adapterOf(p.name))).map(p => p.name);
  }

  // ---------------------------------------------------------------- checks
  protected routerProblem(j: Job): string {
    return routerProblem(j);
  }
  protected recordProblem(j: Job) {
    return recordProblem(j);
  }
  protected vlanProblem(j: Job): string {
    return vlanProblem(j);
  }
  protected targetOk(j: Job, t: Target): boolean {
    const a = adapterOf(t.pc.name),
      env = envOf(t.pc.name);
    const good = healthy(a, env);
    const l = live(a, env);
    t.note = '';
    if (j.kind !== 'contract') {
      const xs = j.faults.filter(f => EXT[f]).map(f => EXT[f]);
      const hOk = xs.length && xs.every(x => x.health === false) ? true : good;
      const ok = hOk && xs.every(x => x.ok(t.pc.name));
      if (!ok) t.note = !hOk ? 'belum normal' : 'akar masalah belum beres';
      return ok;
    }
    if (String(j.tpl).startsWith('x_')) {
      const C = EXT_C[String(j.tpl).slice(2)];
      if (!C) return false;
      const hOk = C.health === false ? true : good,
        ok = hOk && C.ok(t.pc.name);
      if (!ok) t.note = !hOk ? 'belum terhubung normal' : C.why?.(t.pc.name) || 'konfigurasi belum sesuai surat';
      return ok;
    }
    if (j.tpl === 'crimp') {
      const c = this.cordOf.get(t.pc.name);
      if (this.noCord.has(t.pc.name)) {
        t.note = 'patch cord belum dipasang';
        return false;
      }
      if (!c) {
        t.note = 'yang terpasang bukan kabel buatanmu';
        return false;
      }
      const v = judge(c);
      if (!v.standard) {
        t.note = v.works ? 'kabel menyala tapi bukan T568B di kedua ujung: buat ulang' : 'kabel buatanmu tidak bisa dipakai: buat ulang';
        return false;
      }
      if (!c.tested) {
        t.note = 'kabel belum dites dengan LAN tester';
        return false;
      }
      if (!good) {
        t.note = 'belum terhubung (ipconfig /renew)';
        return false;
      }
      return true;
    }
    if (j.tut) {
      if (this.noCord.has(t.pc.name)) {
        t.note = 'patch cord belum dipasang';
        return false;
      }
      if (!j.tut.tested) {
        t.note = 'kabel belum dites dengan LAN tester';
        return false;
      }
      if (!j.tut.ipconfig) {
        t.note = 'belum cek ipconfig di PC';
        return false;
      }
      if (!good) {
        t.note = 'belum terhubung';
        return false;
      }
      return true;
    }
    if (j.tpl === 'desk' && this.noCord.has(t.pc.name)) {
      t.note = 'belum ada patch cord di meja';
      return false;
    }
    if (j.tpl === 'desk' && this.unpatched(j, t.pc.name)) {
      const q = panelOf(t.pc.name)!;
      t.note = q.pp.patch
        ? `patch panel tersambung ke ${portName(q.pp.patch)}, surat kerja minta ${portName(j.swPort![t.pc.name])}`
        : 'outlet belum di-patch ke switch';
      return false;
    }
    if (j.tpl === 'desk' && wallOk(t.pc.name) === false) {
      t.note = 'label outlet belum ada / belum sesuai patch panel';
      return false;
    }
    if (t.mode === 'static') {
      const ok = !a.dhcp && a.ip === t.ip && a.mask === t.mask && a.gw === t.gw && l.dns[0] === t.dns;
      if (!ok)
        t.note = a.dhcp
          ? 'masih DHCP'
          : a.ip !== t.ip
            ? `IP harus ${t.ip}`
            : a.mask !== t.mask
              ? `mask harus ${t.mask}`
              : a.gw !== t.gw
                ? `gateway harus ${t.gw}`
                : `DNS harus ${t.dns}`;
      else if (!good) t.note = 'konfigurasi benar tapi belum terhubung';
      return ok && good;
    }
    if (t.mode === 'dhcp') {
      if (!a.dhcp) {
        t.note = 'harus memakai DHCP';
        return false;
      }
      if (j.tpl === 'renum') {
        const R = j.router!;
        const n = parseIp(l.ip);
        if (!l.ok || n === null || n < parseIp(R.start)! || n > parseIp(R.end)!) {
          t.note = l.apipa ? 'dapat 169.254.x.x (APIPA)' : 'belum dapat IP dari pool baru';
          return false;
        }
      }
      if (env.id !== j.envId) {
        t.note = 'port belum di VLAN yang benar';
        return false;
      }
      if (!good) t.note = l.apipa ? 'dapat 169.254.x.x (APIPA)' : !l.ok ? 'belum ada link / IP' : 'belum terhubung penuh';
      return good;
    }
    if (t.mode === 'env') {
      if (env.id !== t.env) {
        t.note = env.id === 'none' ? 'VLAN port belum aktif' : `masih di ${env.label}`;
        return false;
      }
      if (!good) t.note = l.ok && !l.apipa && envOf(t.pc.name).id === 'kasir' ? 'perlu minta IP baru (ipconfig /renew)' : 'belum dapat IP 192.168.30.x';
      return good;
    }
    if (t.mode === 'browse') {
      if (this.recordProblem(j)) {
        t.note = 'nama belum terdaftar di DNS';
        return good && false;
      }
      if (!good) {
        t.note = 'PC belum terhubung';
        return false;
      }
      return true;
    }
    if (!good) t.note = t.note || 'belum terhubung';
    return good;
  }
  protected globalProblem(j: Job) {
    return globalProblem(j);
  }
  protected apProblem(j: Job): string {
    return apProblem(j);
  }

  // ---------------------------------------------------------------- events from the PCs, console & hands
  protected logAll(s: string, pc?: string) {
    for (const j of this.openJobs()) {
      if (pc && j.kind !== 'contract' && !j.targets.some(t => t.pc.name === pc)) continue;
      if (j.log[j.log.length - 1] !== s) j.log.push(s);
      if (j.log.length > 60) j.log.shift();
    }
  }
  protected onPc(e: PcEvent) {
    const lbl = this.pcLabel(e.pc);
    if (e.type === 'ipset')
      this.logAll(
        `${lbl}: IPv4 ${e.detail.dhcp ? 'diatur ke DHCP' : `statis ${e.detail.ip}/${e.detail.prefix} gw ${e.detail.gw || '-'} dns ${(e.detail.dns ?? []).join(', ') || '-'}`}`,
        e.pc,
      );
    if (e.type === 'cmd' && /^(ipconfig|ping|nslookup|tracert|arp|ssh|net)/i.test(e.detail?.line ?? ''))
      this.logAll(`${lbl}: ${String(e.detail.line).slice(0, 48)}`, e.pc);
    if (e.type === 'ssh' && e.detail?.line && !e.detail.target) this.logAll(`srv-nusa (SSH dari ${lbl}): ${String(e.detail.line).slice(0, 48)}`);
    if (e.type === 'print') this.logAll(`${lbl}: cetak ke ${e.detail?.printer ?? '?'} ${e.detail?.ok ? 'berhasil' : 'gagal'}`, e.pc);
    if (e.type === 'netuse') this.logAll(`${lbl}: net use ${e.detail?.drive ?? ''} ${e.detail?.path ?? ''} ${e.detail?.ok ? 'berhasil' : 'gagal'}`, e.pc);
    if ((e.type as string) === 'dial') this.logAll(`Telepon ${e.detail?.ext ?? ''}: panggil ${e.detail?.to ?? ''} ${e.detail?.ok ? 'tersambung' : 'gagal'}`);
    if (e.type === 'cmd' && /^ipconfig\s*$|^ipconfig \/all/i.test(String(e.detail?.line ?? '').trim()))
      for (const j of this.openJobs())
        if (j.tut && j.targets[0].pc.name === e.pc && !this.noCord.has(e.pc) && j.tut.tested && live(adapterOf(e.pc)).ok) j.tut.ipconfig = true;
    if (e.type === 'cmd' && this.openJobs().some(j => j.tut && j.targets[0].pc.name === e.pc) && !/^(ipconfig|ping)/i.test(String(e.detail?.line ?? '')))
      this.stuck.wrong += 4;
    if (e.type === 'cfg' && e.detail?.kind === 'wlc') {
      const d = e.detail;
      this.logAll(
        `NusaWLC ${d.ap}: ${d.adopt ? 'AP diadopsi' : d.ch !== undefined ? `kanal → ${d.ch}` : d.power !== undefined ? `daya TX → ${d.power}` : `radio ${d.radio ? 'ON' : 'OFF'}`}`,
      );
    } else if (e.type === 'cfg' && !ENVS[e.detail?.env as keyof typeof ENVS]) {
      /* other devices log through their own events */
    } else if (e.type === 'cfg') {
      const d = e.detail,
        r = routerOf(ENVS[d.env as keyof typeof ENVS])?.name ?? 'router';
      this.logAll(
        d.kind === 'lan'
          ? `${r}: alamat LAN → ${d.ip}/${d.prefix}`
          : d.kind === 'dhcp'
            ? d.on
              ? `${r}: DHCP pool ${d.start} – ${d.end}, gw ${d.gw}, dns ${d.dns.join(', ')}`
              : `${r}: DHCP server dimatikan`
            : d.kind === 'dns'
              ? `${r}: DNS upstream ${d.upstream.join(', ') || '-'} · remote ${d.allow ? 'ya' : 'tidak'}`
              : d.kind === 'dnsrec'
                ? `${r}: record ${d.name} → ${d.ip}`
                : `${r}: record ${d.name} dihapus`,
      );
    }
    if (e.type === 'ping' && e.detail?.ok && e.detail?.target !== '127.0.0.1') this.logAll(`${lbl}: ping ${e.detail.name || e.detail.target} berhasil`, e.pc);
    if (e.type === 'portal') this.logAll(`${lbl}: login captive portal (kamar ${e.detail?.room ?? '?'})`, e.pc);
    if (e.type === 'browse')
      this.logAll(
        `${lbl}: buka ${String(e.detail.url)
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '')}`,
        e.pc,
      );
    const base = (e.type === 'ping' && e.detail?.ok && e.detail?.target !== '127.0.0.1') || e.type === 'browse';
    for (const j of this.openJobs())
      for (const t of j.targets) {
        if (t.pc.name !== e.pc) continue;
        const xs = j.faults.filter(f => EXT[f]?.tested).map(f => EXT[f]);
        const xc = String(j.tpl).startsWith('x_') ? EXT_C[String(j.tpl).slice(2)] : null;
        if (xc?.tested ? !xc.tested(e, t.pc.name) : xs.length ? !xs.every(x => x.tested!(e, t.pc.name)) : !base) continue;
        if (j.tut && !(e.type === 'ping' && e.detail?.ok && e.detail?.target === live(adapterOf(e.pc)).gw)) continue;
        if (t.mode === 'browse') {
          const host = (() => {
            try {
              return new URL(e.detail?.url ?? '').hostname;
            } catch {
              return '';
            }
          })();
          const short = t.browse!.split('.')[0];
          if (e.type !== 'browse' || (host !== t.browse && host !== short)) continue;
        }
        if (this.targetOk(j, t)) {
          t.ok = true;
          t.tested = true;
        }
      }
    this.check(true);
  }

  /** tools the current Lab Praktik step needs and the player is not carrying (set by praktik.ts) */
  labNeeds: () => Item[] = () => [];
  /** the name the player gave in Settings ('' = none yet) */
  playerName: () => string = () => '';

  /** crimping bench: lay the eight wires of each plug, crimp, test with the LAN tester, keep or bin the cable */
  protected cabLab = false;
  /** RJ45 connectors on the bench: one per crimped end; a wasted cable wastes its connectors. */
  rj45 = 10;
  rj45Used = 0;
  protected crimpSt: { a: Wire[]; b: Wire[]; end: 'a' | 'b' | 'done'; tested: boolean; pool: Wire[] } | null = null;

  // ---------------------------------------------------------------- closing jobs
  protected check(fromTest: boolean) {
    for (const j of this.openJobs()) {
      for (const t of j.targets) {
        const ok = this.targetOk(j, t);
        if (!ok) {
          t.ok = false;
          t.tested = false;
        } else t.ok = true;
      }
      const done = j.targets.every(t => t.ok && t.tested) && !this.globalProblem(j);
      if (!done) {
        j.docReady = false;
        continue;
      }
      if (!this.docRequired || j.tut) {
        this.close(j);
        continue;
      }
      if (!j.docReady) {
        j.docReady = true;
        this.toast(`${j.id} lolos uji. Tutup dengan berita acara: T → Surat → tanda tangan.`, 4200);
      }
    }
    void fromTest;
  }
  protected close(j: Job) {
    j.status = 'closed';
    if (j.tut) {
      this.s.mastery.tutor = { ok: 1, miss: 0 };
      this.tutEl.classList.remove('on');
    }
    j.slaMet = slaMet(j.age, j.sla);
    const busy = new Set(this.openJobs().flatMap(x => x.targets.map(t => t.pc.name)));
    j.collateral = j.snap.filter(n => !busy.has(n) && !j.targets.some(t => t.pc.name === n) && !healthy(adapterOf(n)));
    const swDirty = j.swTouched && (SWITCHES.some(s => s.dirty) || (j.faults.some(f => EDGE_F.includes(f)) && EDGE.dirty));
    j.stars = jobStars({ slaMet: j.slaMet, collateral: j.collateral.length, wrong: j.wrong, swDirty: !!swDirty });
    j.xp = jobXp({ kind: j.kind, tpl: String(j.tpl), faults: j.faults, stars: j.stars, hint: j.hint });
    this.s.closed++;
    if (j.slaMet) this.s.slaMet++;
    this.s.stars += j.stars;
    if (j.kind === 'contract') this.s.contracts++;
    for (const f of j.faults) {
      const m = this.s.mastery[f] ?? { ok: 0, miss: 0 };
      if (j.stars >= 2) m.ok++;
      else m.miss++;
      this.s.mastery[f] = m;
    }
    if (j.kind === 'contract') {
      const m = this.s.mastery[j.tpl] ?? { ok: 0, miss: 0 };
      if (j.stars >= 2) m.ok++;
      else m.miss++;
      this.s.mastery[j.tpl] = m;
    }
    // consequences: everything that used to work and is broken now becomes a complaint
    for (const n of j.collateral.slice(0, 4)) {
      if (this.jobs.some(x => x.status !== 'closed' && x.targets.some(t => t.pc.name === n))) continue;
      const pc = this.pcs.find(p => p.name === n)!;
      const env = envOf(n);
      const f = this.newJob('follow', 'follow', 'Keluhan susulan: tadi normal, sekarang putus', pick(WHO[env.id]?.who ?? ['Staf']), 'Tinggi', 300, env.id);
      f.targets = [this.target(pc, 'any')];
      f.order = [`${pc.label} terputus setelah pekerjaan ${j.id}.`, 'Cari tahu apa yang berubah dan perbaiki.'];
      f.snap = this.snapshot();
      this.jobs.push(f);
    }
    for (const f of j.faults) EXT[f]?.restore?.();
    if (String(j.tpl).startsWith('x_')) EXT_C[String(j.tpl).slice(2)]?.restore?.();
    this.pendingReport.push(j);
    if (this.trackedId === j.id) this.trackedId = this.openJobs()[0]?.id ?? null;
    this.toast(`${j.id} terverifikasi. Laporan kerja dibuat otomatis.`, 3200);
    this.save();
  }

  update(dt: number) {
    if (this.mode === 'idle') {
      this.hud.innerHTML = '';
      this.hud.classList.remove('on');
      if (this.stuck.lvl) {
        this.stuck.lvl = 0;
        this.tutEl.classList.remove('on');
      }
    }
    this.hkT += dt;
    if (this.hkT > 60) {
      this.hkT = 0;
      dhcpHousekeeping();
    }
    if (this.mode === 'idle') return;
    for (const j of this.openJobs()) j.age += dt;
    this.chkT -= dt;
    if (this.chkT <= 0) {
      this.chkT = 0.4;
      this.check(false);
    }
    if (this.pendingReport.length && !this.modal && !this.pcos.isOpen()) this.openReport(this.pendingReport.shift()!);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.25;
      this.renderHud();
    }
    this.tutorTick(dt);
  }
  protected tutStage(j: Job): 'tools' | 'cord' | 'test' | 'sit' | 'ipconfig' | 'ping' | 'done' {
    const pc = j.targets[0].pc.name,
      t = j.tut!;
    if (this.needs(j).length) return 'tools';
    if (this.noCord.has(pc)) return 'cord';
    if (!t.tested) return 'test';
    if (!(this.pcos.isOpen() && this.pcos.current()?.name === pc) && !t.ipconfig) return 'sit';
    if (!t.ipconfig) return 'ipconfig';
    if (!j.targets[0].tested) return this.pcos.isOpen() ? 'ping' : 'sit';
    return 'done';
  }
  /** contextual help only when the player seems stuck: no progress and idle, a wrong step, or a long time */
  protected tutorTick(dt: number) {
    const j = this.openJobs().find(x => x.tut);
    const S = this.stuck;
    if (!j) {
      if (S.lvl) {
        this.tutEl.classList.remove('on');
        S.lvl = 0;
      }
      return;
    }
    const st = this.tutStage(j),
      key = `${st}|${this.inv.tester}|${this.inv.patch}|${this.pcos.isOpen()}`;
    if (key !== S.key) {
      S.key = key;
      S.t = 0;
      S.idle = 0;
      S.wrong = 0;
      S.lvl = 0;
      this.tutEl.classList.remove('on');
      return;
    }
    S.t += dt;
    S.idle = this.playerMoving ? 0 : S.idle + dt;
    if (S.wrong > 0) S.wrong += dt;
    // a wrong step: the PC is open but the cable is not done yet
    if (this.pcos.isOpen() && (st === 'cord' || st === 'test' || st === 'tools')) S.wrong += dt;
    const lvl = S.t > 70 || S.wrong > 14 ? 2 : (S.t > 22 && S.idle > 8) || S.t > 45 || S.wrong > 6 ? 1 : 0;
    if (lvl === S.lvl) return;
    S.lvl = lvl;
    if (!lvl) {
      this.tutEl.classList.remove('on');
      return;
    }
    const touch = document.body.classList.contains('touch');
    const F = touch ? 'tombol F (Aksi)' : 'tombol F',
      C = touch ? 'tombol Cek' : 'tombol C',
      ip = j.tut!.gw;
    const pcOpenWrong = this.pcos.isOpen() && (st === 'cord' || st === 'test' || st === 'tools');
    const H: Record<string, [string, string]> = {
      tools: [
        'Alat kerja ada di Lemari Alat, Workshop TKJ. Ikuti penanda hijau di layar.',
        `Berdiri di depan Lemari Alat lalu tekan ${F}. Ambil "LAN tester" dan "Patch cord" (Ambil 1).`,
      ],
      cord: ['Kabel PC belum terpasang. Datangi PC yang ditandai.', `Di depan PC itu tekan ${C} untuk cek fisik, lalu pilih "Pasang patch cord".`],
      test: [
        'Sebelum dipakai, kabel baru dites dulu.',
        `Buka cek fisik (${C}) di PC itu dan pilih "Tes kabel (LAN tester)": lampu 1–8 harus menyala berurutan.`,
      ],
      sit: ['Kabel sudah baik. Sekarang nyalakan PC-nya.', `Di depan PC tekan ${F}. Di layar kunci, ${touch ? 'ketuk' : 'klik'} lalu Sign in.`],
      ipconfig: ['Cek alamat IP yang didapat PC.', `Buka Command Prompt (ikon di desktop, ${touch ? 'ketuk' : 'klik dua kali'}), ketik ipconfig lalu Enter.`],
      ping: ['Uji koneksi ke router (Default Gateway).', `Di Command Prompt ketik: ping ${ip}`],
    };
    const [a, b] = H[st] ?? ['', ''];
    this.tutEl.innerHTML = `<b>Kak Rani:</b> ${pcOpenWrong ? 'PC belum bisa tersambung karena kabelnya belum beres. Tutup PC dulu (tombol keluar), lalu ' + a.charAt(0).toLowerCase() + a.slice(1) : a}${lvl >= 2 ? `<br><small>${b}</small>` : ''}`;
    this.tutEl.classList.add('on');
  }
  /** QA */
  tutorState() {
    const j = this.openJobs().find(x => x.tut);
    return j
      ? {
          stage: this.tutStage(j),
          hint: this.tutEl.classList.contains('on') ? this.tutEl.textContent : '',
          lvl: this.stuck.lvl,
          tut: { ...j.tut! },
          pc: j.targets[0].pc.name,
        }
      : null;
  }

  // ---------------------------------------------------------------- Linux server srv-nusa (rack 2)
  /** set by the edge-router module (opens its console in a board modal) */
  edgeOpen: (() => void) | null = () => this.openEdge();
  /** fixed places in the world the guidance can point at (racks in the server room) */
  PLACES: Record<string, PcInfo> = {};
  term: Term | null = null;
  protected endWork() {
    const xp = this.jobs.reduce((a, t) => a + (t.xp ?? 0), 0),
      st = this.jobs.reduce((a, t) => a + (t.stars ?? 0), 0);
    const msg =
      this.mode === 'shift'
        ? `Shift ${this.shift} selesai: ${this.jobs.length} tiket, ${this.jobs.filter(t => t.slaMet).length} tepat SLA, ${st} bintang, +${xp} XP.`
        : `Surat kerja selesai: ${st} bintang, +${xp} XP. Ambil surat kerja berikutnya atau mulai shift.`;
    const d = this.s.day,
      nj = this.jobs.length;
    if (d) {
      d.xp += xp;
      d.stars += st;
      d.jobs += this.jobs.length;
      d.sla += this.jobs.filter(t => t.slaMet).length;
      d.phase++;
    }
    this.mode = 'idle';
    this.trackedId = null;
    this.jobs = [];
    if (d && (d.phase >= 3 || (d.phase === 2 && this.rankIndex() < 1))) {
      this.endDay();
      return;
    }
    this.save();
    this.openBoard(
      d ? `${DAY_PHASES[d.phase - 1].name} selesai: ${nj} pekerjaan, ${st} bintang, +${xp} XP. Lanjut ke ${DAY_PHASES[d.phase].name.toLowerCase()}.` : msg,
    );
  }
  // ---------------------------------------------------------------- work days: morning order, afternoon shift, late incident, evaluation
  get day() {
    return this.s.day;
  }
  startDay() {
    if (this.mode !== 'idle') {
      this.toast('Selesaikan pekerjaan yang sedang berjalan dulu.');
      return;
    }
    this.s.day = { n: this.s.days + 1, phase: 0, xp: 0, stars: 0, jobs: 0, sla: 0 };
    this.save();
    this.nextPhase();
  }
  nextPhase() {
    const d = this.s.day;
    if (!d || this.mode !== 'idle') return;
    const rk = this.rankIndex();
    if (d.phase === 0) {
      // the morning order: the open template this technician has done least (and worst), never the tutorial
      const ids = (Object.keys(TEMPLATES) as TplId[]).filter(t => TEMPLATES[t].rank <= rk && t !== 'tutor');
      const score = (t: string) => {
        const m = this.s.mastery[t] ?? { ok: 0, miss: 0 };
        return m.ok - m.miss * 2 + Math.random() * 1.5;
      };
      const order = ids.sort((a, b) => score(a) - score(b));
      for (const t of order) {
        if (this.acceptContract(t)) return;
      }
      d.phase = 1;
    }
    if (d.phase === 1) {
      this.startShift();
      return;
    }
    if (d.phase === 2) {
      // a building-wide incident: one root cause, many users. Opens at Teknisi Junior.
      const pool: FaultId[] = rk >= 2 ? ['uplink', 'loop', 'isp1', 'nat', 'dhcpscope', 'srvdown'] : ['srvdown', 'patch', 'zone'];
      const list = shuffle(pool.filter(f => FAULTS[f]));
      for (const f of list) {
        this.startShift(Math.random, [f]);
        if (this.jobs.length) {
          for (const j of this.jobs) {
            j.title = `INSIDEN · ${j.title}`;
            j.prio = 'Tinggi';
          }
          this.save();
          this.openBoard(`Insiden sore hari ${d.n}: banyak pengguna terdampak satu akar masalah. Prioritas tinggi.`);
          return;
        }
        this.mode = 'idle';
      }
      this.endDay();
    }
  }
  protected dayPressure() {
    const d = this.s.day;
    if (!d) return;
    const k = Math.max(0.7, 1 - (d.n - 1) * 0.03);
    for (const j of this.jobs) if (!j.reported) j.sla = Math.round(j.sla * k);
  }
}
