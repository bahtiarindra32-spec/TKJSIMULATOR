// Fase 1 "Karier lapangan": the field-work controller (DOM + game glue). Order board and material cabinet at Kantor
// Nusa Teknik, device panels at the customer sites, the order card HUD with saldo/reputasi, berita acara + nota, the
// waypoint target and the QA hooks. Rules live in the pure modules next to this file (orders, economy, save) and the
// network side in sim.ts. It reuses the internship's tools instead of copying them: the modal (noc.present), the crimp
// bench, the PC cable check [C], the rack card + switch console, the stage bar and the berita acara fact check.
import type { Noc } from '../noc';
import type { PcOS, PcEvent } from '../../pcos/os';
import { adapterOf, live, patchCord, ENVS, portLink } from '../../pcos/net';
import { heardAt, channelClean, overlap, CHANNELS, type WifiSec } from '../../pcos/wifi';
import { readout } from '../../pcos/sites';
import { SITE_PCS, SITE_TV, siteById, siteAt, KOS, FLOOR_Y, type SiteId } from '../../data/sites';
import { judge, type Cable } from '../crimp';
import { RANKS, jobStars } from '../noc/scoring';
import { stageBarHtml, beritaFactCheck, ipsIn, addNet24 } from '../noc/berita';
import { h, btn, esc, mmss, mulberry } from '../noc/util';
import { FIELD_TPLS, CUSTOMER } from './templates';
import { rp, payout, applyRep, repEventForStars, denda, MAT_LABEL, MAT_UNIT, PRICE, STAR_PAY } from './economy';
import { openDay, closeDay, planGaransi, pushNota, repLine } from './orders';
import { loadField, writeField } from './save';
import { rosTestEvent, isRosTpl } from './simros';
import { rosNeedsLogin } from '../../pcos/routeros';
import { ftthWeak, ftthSiteCheck } from './simftth';
import { WALK_Y } from '../../data/ftthsite';
import { kitDef, type Kit, type KitId } from './ftthkit';
import { inject, rootProblem, cableWeak, snapshotSites, restoreSites, ok, sw, ap, siteDevices, deviceLabel, portParts, NEW_ROUTER, TV, type Injected, type Target, type SiteSnap } from './sim';
import { CUST_LABEL, noMat, type Order, type Mat, type FieldSave, type Nota, type Cust, type GaransiReason } from './types';
import './field.css';

interface ActTarget extends Target {
  ok: boolean;
  tested: boolean;
}
interface Active {
  o: Order;
  inj: Injected;
  targets: ActTarget[];
  surveyed: boolean;
  docReady: boolean;
  age: number;
  mat: Mat;
  wrong: number;
  /** site devices healthy when the order was taken (collateral check at closing) */
  snap: string[];
  /** cable the player put into a site device port ('ONT-RUMAH:1'); null = a stock patch cord */
  portCable: Map<string, Cable | null>;
  /** ports whose old plug is broken (re-seating does not help) */
  broken: Set<string>;
  log: string[];
}
/** where a technician stands to work on a site device (city coords, y = floor) */
export const FIELD_SPOTS: Record<string, { X: number; Z: number; y: number; label: string }> = {
  ONT: { X: 115.3, Z: 581.0, y: FLOOR_Y, label: 'ONT & router Wi-Fi (ruang tamu)' },
  TV: { X: 122.3, Z: 582.6, y: FLOOR_Y, label: 'Smart TV (ruang tamu)' },
  KOS_ROUTER: { X: 133.0, Z: 313.0, y: FLOOR_Y, label: 'Router kos (lantai 1)' },
  'AP-KOS-LT1': { X: 138.0, Z: 310.1, y: FLOOR_Y, label: 'AP lantai 1 (plafon koridor)' },
  'AP-KOS-LT2': { X: 138.0, Z: 310.1, y: KOS.upper, label: 'AP lantai 2 (plafon koridor)' },
  WARNET_RACK: { X: 358.6, Z: 304.9, y: FLOOR_Y, label: 'Rak dinding warnet (SW-WARNET)' },
  BOARD: { X: 55, Z: 119.7, y: FLOOR_Y, label: 'Papan order Nusa Teknik' },
  LEMARI: { X: 51.5, Z: 120.2, y: FLOOR_Y, label: 'Lemari material Nusa Teknik' },
  /** Fase 3 FTTH: the roset on the inside of the west wall and the ODP pole on the sidewalk (data/ftthsite) */
  ROSET: { X: 114.75, Z: 580.75, y: FLOOR_Y, label: 'Roset fiber & ONT (ruang depan)' },
  TIANG: { X: 110, Z: 574.8, y: WALK_Y, label: 'Tiang ODP-FLB-01 (trotoar depan rumah)' },
};
/** Fase 3: fibre tools each FTTH order needs before the player can find and fix its fault (⚠ design hint list) */
const FTTH_TOOLS: Record<string, KitId[]> = {
  f_drop_putus: ['otdr', 'splicer', 'pembersih', 'tangga'],
  f_konektor_kotor: ['opm', 'pembersih', 'tangga'],
  f_macrobend: ['vfl', 'opm'],
  f_port_salah: ['tangga', 'pembersih'],
};
const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));

export interface FieldHost {
  toast: (s: string, ms?: number) => void;
  /** player position in city metres (X east, Z south) and feet height */
  player: () => { X: number; Z: number; y: number } | null;
  /** is the in-game HUD showing (walk mode, not in a menu) */
  hudOn: () => boolean;
}

export class FieldWork {
  s: FieldSave = loadField();
  act: Active | null = null;
  /** field-owned stock in the technician's bag (other materials live in the internship inventory: patch cords, RJ45) */
  bag = { router: 0 };
  /** Fase 3 FTTH (chunk B1b): the fibre tool shelf in the cabinet and the fibre work at the house roset (set by main.ts) */
  onFtthShelf: ((back: () => void) => void) | null = null;
  onFiber: (() => void) | null = null;
  /** Fase 3 FTTH (chunk B2): the fibre kit the player carries (K3 notes, tools left at the site) */
  ftthKit: (() => Kit) | null = null;
  /** QA override: open field work without the hotel rank */
  qaUnlock = false;
  /** QA: berita acara required (always on in play) */
  private base: SiteSnap;
  private hud: HTMLElement;
  private chip: HTMLElement;
  private chkT = 0;
  private hudT = 0;
  private hudSig = '';
  private rand = Math.random;

  constructor(
    private noc: Noc,
    private pcos: PcOS,
    private host: FieldHost,
  ) {
    this.base = snapshotSites();
    this.hud = h('div');
    this.hud.id = 'field-hud';
    this.chip = h('div');
    this.chip.id = 'field-chip';
    document.body.append(this.hud, this.chip);
    const prev = pcos.onEvent;
    pcos.onEvent = e => {
      prev?.(e);
      this.onPc(e);
    };
    noc.onMaterial = (k, n) => {
      if (this.act && noc.mode === 'idle') this.act.mat[k] = (this.act.mat[k] ?? 0) + n;
    };
  }

  // ---------------------------------------------------------------- unlock + day
  get unlocked() {
    return this.s.unlocked || this.qaUnlock;
  }
  private save() {
    writeField(this.s);
  }
  /** called every frame: unlock when the hotel rank above Magang is reached (with its competency test) */
  private checkUnlock() {
    // the judge tour (Mode Juri) borrows a high rank: it must not open field work for the real player
    if (!this.qaUnlock && document.body.classList.contains('demo')) return;
    if (!this.s.unlocked && (this.qaUnlock || this.noc.rankIndex() >= 1)) {
      this.s.unlocked = true;
      this.save();
    }
    if (this.s.unlocked && !this.s.told) {
      this.s.told = true;
      this.save();
      this.host.toast(
        `Kak Rani: Selamat, kamu sudah ${RANKS[1].name}! Nusa Teknik (Jl. Sudirman, barat Jl. Melati) cari teknisi lapangan. Mampir ke kantornya dan cek papan order.`,
        9000,
      );
    }
  }
  /** offers for today exist (generated once per work day) */
  private ensureDay() {
    if (this.s.gen !== this.s.day) {
      openDay(this.s, this.rand);
      this.save();
    }
  }
  hasActive() {
    return !!this.act;
  }

  // ---------------------------------------------------------------- accept / cancel
  accept(id: string): string {
    if (!this.unlocked) return 'Kerja lapangan belum terbuka.';
    if (this.act) return `Selesaikan dulu ${this.act.o.id}.`;
    const o = this.s.offers.find(x => x.id === id && x.status === 'offer');
    if (!o) return 'Order tidak ada.';
    restoreSites(this.base, o.cust);
    const inj = inject(o.tpl, mulberry(o.seed || 1), o.kind === 'garansi' ? o.redo : undefined);
    if (!inj) {
      this.s.offers = this.s.offers.filter(x => x !== o);
      this.save();
      return 'Pelanggan menelepon lagi: masalahnya sudah beres sendiri. Order dibatalkan tanpa denda.';
    }
    o.status = 'active';
    if (inj.ftth) { const k = this.ftthKit?.(); if (k) k.k3 = []; }
    // a MikroTik order carries its own values (vouchers, limits, ISP data) onto the order letter
    for (const l of inj.lines ?? []) if (!o.lines.includes(l)) o.lines.push(l);
    const tg = new Set(inj.targets.map(t => t.pc));
    this.act = {
      o, inj, targets: inj.targets.map(t => ({ ...t, ok: false, tested: false })), surveyed: false, docReady: false, age: 0, mat: noMat(), wrong: 0,
      snap: siteDevices(o.cust).filter(n => !tg.has(n) && ok(n)), portCable: new Map(), broken: new Set(inj.data.broken ? [String(inj.data.where)] : []),
      log: [`${o.id} diambil di papan order (hari ${this.s.day})`],
    };
    this.save();
    this.host.toast(`${o.id} diambil. Naik motor ke ${CUSTOMER[o.cust].place}, ${o.address}. Penanda hijau menunjukkan jalannya.`, 5200);
    return '';
  }
  /** drop the active order: denda + reputasi, another technician restores the site */
  cancel() {
    const a = this.act;
    if (!a) return;
    const d = a.o.kind === 'garansi' ? 0 : denda(a.o.tarif);
    a.o.status = 'failed';
    this.s.saldo -= d;
    this.s.failed++;
    this.s.rep = applyRep(this.s.rep, a.o.cust, 'failed');
    pushNota(this.s, { id: a.o.id, day: this.s.day, title: a.o.title, who: a.o.who, tarif: a.o.tarif, stars: 0, jasa: 0, mat: { ...a.mat }, material: 0, denda: d, net: -d, garansi: a.o.kind === 'garansi', failed: true });
    restoreSites(this.base, a.o.cust);
    this.act = null;
    this.save();
    this.noc.closeModal();
    this.host.toast(`${a.o.id} dibatalkan. Denda ${rp(d)}, reputasi ${CUST_LABEL[a.o.cust]} turun. Teknisi lain yang menyelesaikannya.`, 5200);
  }
  /** end the work day (button on the board; QA hook) */
  endDay(): { failed: string[]; ignored: string[]; garansi: string[] } {
    const was = this.act;
    if (was) restoreSites(this.base, was.o.cust);
    this.act = null;
    const r = closeDay(this.s, this.rand);
    this.save();
    return { failed: r.failed.map(o => o.id), ignored: r.ignored.map(o => o.id), garansi: r.garansi.map(o => o.id) };
  }

  // ---------------------------------------------------------------- checking
  private onPc(e: PcEvent) {
    const a = this.act;
    if (!a) return;
    const t = a.targets.find(x => x.pc === e.pc);
    if (e.type === 'ping' && e.detail?.ok) this.log(`${deviceLabel(e.pc)}: ping ${e.detail.name || e.detail.target} berhasil`);
    if (e.type === 'browse') this.log(`${deviceLabel(e.pc)}: buka ${String(e.detail?.url ?? '').replace(/^https?:\/\//, '')}`);
    if (e.type === 'cfg' && e.detail?.kind === 'dhcp') this.log(`WebKonfig ${e.detail.env}: DHCP ${e.detail.on ? `${e.detail.start}–${e.detail.end}` : 'dimatikan'}`);
    if (!t) return;
    if (e.type === 'speed') this.log(`${deviceLabel(e.pc)}: tes kecepatan ${(e.detail.down / 1e6).toFixed(1)}/${(e.detail.up / 1e6).toFixed(1)} Mbps (download/upload)${e.detail.bypassed ? ', antrean dilewati FastTrack' : ''}`);
    let test = (e.type === 'ping' && e.detail?.ok && e.detail?.target !== '127.0.0.1') || e.type === 'browse';
    // queue orders: only the speed-test page showing the ordered limit counts as the customer-device test
    const rt = a.inj.ros && t.primary ? rosTestEvent(a.inj.ros, e.type, e.detail) : null;
    if (rt !== null) test = rt && !this.problem();
    // FTTH orders: only a test done after the fibre is right counts (a yellow-Rx line still pings)
    if (a.inj.ftth && this.problem()) test = false;
    if (test && ok(t.pc)) {
      t.ok = true;
      t.tested = true;
    }
    this.check();
  }
  /** a line from the fibre toolkit for the running order's work log */
  note(s: string) { this.log(s); }
  /** material used by another module during an order (Fase 3: splice sleeves) */
  consume(k: keyof Mat, n = 1) { if (this.act) this.act.mat[k] = (this.act.mat[k] ?? 0) + n; }
  private log(s: string) {
    const a = this.act;
    if (!a || a.log[a.log.length - 1] === s) return;
    a.log.push(s);
    if (a.log.length > 40) a.log.shift();
  }
  /** the root cause that still blocks the order ('' = none) */
  problem(): string {
    return this.act ? rootProblem(this.act.inj) : '';
  }
  private check() {
    const a = this.act;
    if (!a) return;
    for (const t of a.targets) {
      t.ok = ok(t.pc);
      if (!t.ok) t.tested = false;
    }
    const done = a.targets.every(t => t.ok && (t.tested || !t.primary)) && !this.problem();
    if (done && !a.docReady) {
      a.docReady = true;
      this.host.toast(`${a.o.id} lolos uji di perangkat pelanggan. Tutup dengan berita acara: T → Surat order.`, 4500);
    }
    if (!done) a.docReady = false;
  }
  /** survei → kerja → uji → dokumentasi */
  stage(): 0 | 1 | 2 | 3 {
    const a = this.act;
    if (!a) return 0;
    if (a.docReady) return 3;
    if (a.targets.every(t => t.ok) && !this.problem()) return 2;
    return a.surveyed ? 1 : 0;
  }

  update(dt: number) {
    this.checkUnlock();
    const a = this.act;
    if (a) {
      a.age += dt;
      const p = this.host.player();
      const atPole = !!a.inj.ftth && !!p && Math.hypot(p.X - FIELD_SPOTS.TIANG.X, p.Z - FIELD_SPOTS.TIANG.Z) < 6;
      if (p && !a.surveyed && (siteAt(p.X, p.Z)?.id === a.o.cust || atPole)) {
        a.surveyed = true;
        this.log(`Tiba di lokasi: ${CUSTOMER[a.o.cust].place}`);
      }
      this.chkT -= dt;
      if (this.chkT <= 0) {
        this.chkT = 0.4;
        this.check();
      }
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.25;
      this.renderHud();
    }
  }

  // ---------------------------------------------------------------- next step + waypoint
  private fixSpot(): string | null {
    const a = this.act!;
    const t = a.o.tpl;
    if (t === 'r_router' || t === 'r_kabel' || (a.o.kind === 'garansi' && a.inj.data.where === 'ONT-RUMAH:1')) return 'ONT';
    if (t === 'k_ap2') return 'KOS_ROUTER';
    if (t === 'k_kanal') return 'AP-KOS-LT2';
    if (t === 'w_port' || t === 'w_loop') return 'WARNET_RACK';
    return null;
  }
  nextHint(): string {
    const a = this.act;
    if (!a) return '';
    const place = CUSTOMER[a.o.cust].place;
    if (!a.surveyed) return `Naik motor ke ${place}, ${a.o.address}. Parkir, lalu masuk.`;
    if (a.docReady) return 'Isi berita acara & serahkan nota: T → Surat order.';
    const pr = this.problem();
    const bad = a.targets.filter(t => !t.ok);
    if (bad.length || pr) {
      const t = a.o.tpl;
      if (a.inj.ftth) return this.ftthHint(pr);
      if (isRosTpl(t) && pr.startsWith('uji login')) return `Uji dari ${a.targets.find(x => x.primary)?.label ?? 'PC uji'}: buka situs, login hotspot pakai salah satu voucher.`;
      if (isRosTpl(t)) return `${pr ? `${pr} · ` : ''}Konfigurasi router MikroTik lewat Winbox / WebFig dari ${a.targets.find(x => x.primary)?.label ?? 'PC pelanggan'}.`;
      if (t === 'r_router') {
        const r = ap('AP-RUMAH-RTR');
        if (!r.mounted) return this.bag.router ? 'Pasang router baru di dekat ONT [F].' : 'Bawa router baru: ambil di lemari material Nusa Teknik.';
        return `Atur Wi-Fi router baru sesuai surat order [F di ONT]${pr ? ` · ${pr}` : ''}.`;
      }
      if (t === 'r_tv') return 'Cek status jaringan TV [F], lalu periksa DHCP di halaman ONT dari laptop (browser → alamat gateway).';
      if (t === 'k_kanal') return 'Survei kanal AP di plafon [F] (lantai 1 dan 2): kanal AP satu gedung tidak boleh tumpang tindih.';
      if (t === 'w_port') return 'Periksa port PC itu di switch: rak dinding [F], buka console (bawa kabel console).';
      if (t === 'w_loop') return pr || 'Periksa rak switch [F]: LED berkedip semua = cari kabel yang menyambung dua port switch.';
      if (t === 'w_kabel' || (a.o.kind === 'garansi' && String(a.inj.data.where).startsWith('PROP_')))
        return `Cek kabel di ${bad[0]?.label ?? 'PC'} [C]: tes dengan LAN tester, ganti kabel (bawa patch cord / kabel crimp).`;
      const k = [...a.broken][0] ?? String(a.inj.data.where ?? '');
      if (k) return `Periksa kabel ${k.replace(':', ' LAN')} [F]: ${a.broken.size ? 'konektornya patah, pasang kabel baru (crimp T568B + tes, atau patch cord jadi).' : 'cek apakah kabelnya tercabut.'}`;
      return `Perbaiki: ${bad[0]?.label ?? pr} belum normal.`;
    }
    const un = a.targets.find(t => t.primary && !t.tested);
    if (un && a.inj.ros?.speed) return `Uji dari ${un.label}: buka speedtest.cari.id, hasilnya harus sesuai batas order.`;
    if (un && a.inj.ros?.vouchers) return `Uji dari ${un.label}: buka situs, login hotspot pakai salah satu voucher.`;
    if (un) return un.pc === TV ? 'Uji: cek menu jaringan smart TV [F] (harus tersambung internet).' : `Uji dari ${un.label}: buka PC [F], ping / buka situs.`;
    return 'Tunggu…';
  }
  /** fibre tools of the FTTH order that are not in the bag */
  private ftthMissing(): KitId[] {
    const a = this.act, k = this.ftthKit?.();
    if (!a?.inj.ftth || !k) return [];
    const need = FTTH_TOOLS[a.o.tpl] ?? [];
    const out = need.filter(id => !k.has.has(id));
    if (a.o.tpl === 'f_drop_putus' && !k.sleeves) out.push('sleeve');
    return out;
  }
  private ftthHint(pr: string): string {
    const a = this.act!, miss = this.ftthMissing();
    if (miss.length) return `Pinjam alat fiber di lemari Nusa Teknik (Alat fiber FTTH): ${miss.map(id => kitDef(id).short).join(', ')}. APD tiang: helm, sarung tangan, harness, kacamata.`;
    const t = a.o.tpl, port = a.inj.ftth!.port;
    const head = pr ? `${pr} · ` : '';
    if (t === 'f_drop_putus') return `${head}Cari titik putus: OTDR dari port ODP (naik tiang) atau VFL dari roset, lalu sambung dengan fusion splicer di atas tangga.`;
    if (t === 'f_konektor_kotor') return `${head}Ukur Rx dengan OPM di roset dan di port ODP; konektor yang kotor dibersihkan (alkohol IPA + tisu).`;
    if (t === 'f_macrobend') return `${head}Bandingkan OPM 1310/1550 nm, cari tekukan dengan VFL di roset / konektor ONT, lalu rapikan tekukannya di roset.`;
    return `${head}Naik ke ODP-FLB-01: drop rumah harus di port ${port} (data ODP). Bersihkan konektor dulu, baru colok.`;
  }
  /** next place to go (city coords) for the waypoint and the minimap */
  target(): { X: number; Z: number; y: number; label: string } | null {
    const a = this.act;
    if (!a || a.docReady) return null;
    const S = siteById(a.o.cust as SiteId);
    if (!a.surveyed) return { X: S.anchor.X, Z: S.anchor.Z, y: FLOOR_Y, label: `${a.o.id} · ${CUSTOMER[a.o.cust].place}` };
    const stop = (pc: string) => {
      if (pc === TV) return { ...FIELD_SPOTS.TV, label: `${a.o.id} · ${FIELD_SPOTS.TV.label}` };
      const p = SITE_PCS.find(x => x.name === pc)!;
      return { X: p.X, Z: p.Z, y: p.floor === 2 ? KOS.upper : FLOOR_Y, label: `${a.o.id} · ${p.label}` };
    };
    const needFix = a.targets.some(t => !t.ok) || !!this.problem();
    if (needFix) {
      if (a.o.tpl === 'r_router' && !ap('AP-RUMAH-RTR').mounted && !this.bag.router) return { ...FIELD_SPOTS.LEMARI, label: 'Ambil router baru · lemari material' };
      if (a.inj.ftth) {
        if (this.ftthMissing().length) return { ...FIELD_SPOTS.LEMARI, label: 'Pinjam alat fiber · lemari material' };
        const sp = a.o.tpl === 'f_drop_putus' || a.o.tpl === 'f_port_salah' ? 'TIANG' : 'ROSET';
        return { ...FIELD_SPOTS[sp], label: `${a.o.id} · ${FIELD_SPOTS[sp].label}` };
      }
      const sp = this.fixSpot();
      if (sp) return { ...FIELD_SPOTS[sp], label: `${a.o.id} · ${FIELD_SPOTS[sp].label}` };
      if (a.o.tpl === 'r_tv') return stop(a.targets.find(t => t.pc !== TV)?.pc ?? TV);
      const bad = a.targets.find(t => !t.ok) ?? a.targets[0];
      return stop(bad.pc);
    }
    const un = a.targets.find(t => t.primary && !t.tested);
    return un ? stop(un.pc) : null;
  }
  /** one line for the simulated PC's task bar */
  objective(): string {
    const a = this.act;
    if (!a) return '';
    return `${['Survei', 'Kerja', 'Uji', 'Dokumentasi'][this.stage()]} · ${this.nextHint()}`;
  }

  // ---------------------------------------------------------------- HUD
  private renderHud() {
    const show = this.unlocked && this.host.hudOn();
    this.chip.classList.toggle('on', show);
    if (show) {
      const c = `<b>NUSA TEKNIK</b><span>${rp(this.s.saldo)}</span><span class="rep">Reputasi ${repLine(this.s.rep)}</span>`;
      if (this.chip.innerHTML !== c) this.chip.innerHTML = c;
    }
    const a = this.act;
    const card = show && !!a && !this.noc.active;
    this.hud.classList.toggle('on', card);
    if (!card || !a) return;
    const left = FIELD_TPLS[a.o.tpl].sla - a.age;
    const sig = `${a.o.id}|${this.stage()}|${a.targets.map(t => +t.ok + +t.tested).join('')}|${this.nextHint()}|${Math.floor(left)}|${this.problem()}`;
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    const rows = a.targets
      .filter(t => t.primary || !t.ok)
      .slice(0, 4)
      .map(t => `<div class="tg"><i class="st ${t.ok ? (t.tested || !t.primary ? 'ok' : 'part') : 'no'}"></i>${esc(t.label)}${t.ok && t.primary && !t.tested ? ' <em>uji dari sini</em>' : ''}</div>`)
      .join('');
    const pr = this.problem();
    this.hud.innerHTML = `<div class="top"><b>${a.o.kind === 'garansi' ? 'GARANSI' : 'ORDER'}</b><span>${a.o.kind === 'garansi' ? 'tidak dibayar' : `${rp(a.o.tarif)}<small class="pk"> perkiraan</small>`}</span></div>
      <div class="tk"><b>${a.o.id}</b> <span class="sla ${left < 0 ? 'late' : left < 120 ? 'warn' : ''}">SLA ${mmss(left)}</span></div>
      <div class="who">${esc(a.o.who)}<br><small>${esc(a.o.address)}</small></div>
      <div class="ttl">${esc(a.o.title)}</div>${stageBarHtml(this.stage())}${rows}${pr && a.surveyed ? `<div class="gp"><i class="st no"></i>${esc(pr)}</div>` : ''}
      <div class="nx">${esc(this.nextHint())}</div><div class="keys"><kbd>T</kbd> Surat order</div>`;
  }

  // ---------------------------------------------------------------- panels
  private show(box: HTMLElement) {
    this.noc.present(box);
  }
  private closeRow(...extra: HTMLElement[]) {
    const rw = h('div', 'row');
    rw.append(...extra, btn('Tutup [Esc]', () => this.noc.closeModal(), 'btn', 'field-close'));
    return rw;
  }
  /** F at the order board */
  openBoard(msg = '') {
    const box = h('div', 'noc-box wide field-board');
    box.append(h('h2', '', `Papan order · Nusa Teknik${this.unlocked ? ` · Hari kerja ${this.s.day}` : ''}`));
    if (!this.unlocked) {
      box.append(h('p', 'how', `Nusa Teknik menerima teknisi lapangan yang sudah lulus <b>${RANKS[1].name}</b> di magang hotel (Nusantara Tech). Pangkatmu sekarang: <b>${esc(this.noc.rank())}</b>.`));
      box.append(this.ladder());
      box.append(this.closeRow());
      this.show(box);
      return;
    }
    this.ensureDay();
    if (msg) box.append(h('p', 'msg', esc(msg)));
    box.append(h('div', 'fb-stat', `<span>Saldo <b>${rp(this.s.saldo)}</b></span><span>Reputasi <b>${repLine(this.s.rep)}</b></span><span>Selesai ${this.s.done} · gagal ${this.s.failed}</span>`));
    const a = this.act;
    if (a) {
      const cur = h('div', 'fo-card cur', `<div class="fo-h"><b>${a.o.id}</b> <span class="tag">SEDANG DIKERJAKAN</span></div><div class="fo-t">${esc(a.o.title)}</div><div class="fo-w">${esc(a.o.who)} · ${esc(a.o.address)}</div>`);
      cur.append(btn('Lihat surat order', () => this.openOrder(), 'btn pri', 'field-order-open'));
      box.append(cur);
    }
    const list = h('div', 'fo-list');
    const offers = this.s.offers.filter(o => o.status === 'offer');
    if (!offers.length) list.append(h('p', 'how', 'Order hari ini sudah habis. Tutup hari kerja untuk order baru besok.'));
    for (const o of offers) {
      const t = FIELD_TPLS[o.tpl];
      const c = h(
        'div',
        `fo-card${o.kind === 'garansi' ? ' gar' : ''}`,
        `<div class="fo-h"><b>${o.id}</b> <span class="tag">${o.kind === 'garansi' ? `GARANSI · batas hari ${o.due}` : CUST_LABEL[o.cust].toUpperCase()}</span><span class="fee">${o.kind === 'garansi' ? 'tidak dibayar' : `${rp(o.tarif)}<small>perkiraan tarif pasar</small>`}</span></div>
        <div class="fo-t">${esc(o.title)}</div><div class="fo-w">${esc(o.who)} · ${esc(o.address)}</div><div class="fo-q">“${esc(o.lines[0])}”</div>${o.kind === 'garansi' ? '' : `<div class="fo-src">Kisaran: ${esc(t.tarifSrc)} · material dibayar terpisah</div>`}`,
      );
      const b = btn(
        'Ambil order',
        () => {
          const m = this.accept(o.id);
          if (m) this.openBoard(m);
          else this.openOrder();
        },
        'btn pri',
        `field-take-${o.id}`,
      );
      b.disabled = !!a;
      c.append(b);
      list.append(c);
    }
    box.append(list);
    box.append(h('p', 'fnote', 'Tarif = perkiraan dari daftar harga jasa vendor (riset, anekdotal). Bayaran akhir mengikuti bintang kerja; material yang terpakai dipotong dari bayaran.'));
    box.append(
      this.closeRow(
        btn('Jalur karier & catatan RT/RW Net', () => this.openCareer(), 'btn', 'field-career'),
        btn('Nota terakhir', () => this.openNotaList(), 'btn', 'field-notas'),
        btn(a ? 'Tutup hari kerja (order berjalan gagal)' : 'Tutup hari kerja', () => this.confirmEndDay(), 'btn', 'field-endday'),
      ),
    );
    this.show(box);
  }
  private confirmEndDay() {
    const box = h('div', 'noc-box');
    box.append(h('h2', '', `Tutup hari kerja ${this.s.day}?`));
    const a = this.act;
    box.append(h('p', '', a ? `${a.o.id} belum selesai: order itu gagal (denda ${rp(a.o.kind === 'garansi' ? 0 : denda(a.o.tarif))}, reputasi turun).` : 'Order yang belum diambil hari ini hangus. Order garansi tetap menunggu sampai batasnya.'));
    const rw = h('div', 'row');
    rw.append(
      btn(
        'Ya, tutup hari',
        () => {
          const r = this.endDay();
          const bits = [r.failed.length ? `gagal: ${r.failed.join(', ')}` : '', r.ignored.length ? `garansi diabaikan: ${r.ignored.join(', ')} (reputasi turun)` : '', r.garansi.length ? `pelanggan minta garansi: ${r.garansi.join(', ')}` : ''].filter(Boolean);
          this.openBoard(`Hari kerja ${this.s.day} dimulai.${bits.length ? ` ${bits.join(' · ')}.` : ''}`);
        },
        'btn pri',
        'field-endday-yes',
      ),
      btn('Batal', () => this.openBoard(), 'btn'),
    );
    box.append(rw);
    this.show(box);
  }
  /** story ladder (and the honest RT/RW-net teaser) */
  private ladder() {
    const st = this.unlocked ? 1 : 0;
    const steps = [
      ['Magang hotel', 'Nusantara Tech: kabel, IP, switch, Wi-Fi tamu. Naik pangkat lewat uji kompetensi.'],
      ['Teknisi lapangan Nusa Teknik', 'Order dari rumah, kos, warnet. Datang sendiri ke lokasi, uji dari perangkat pelanggan, berita acara, nota.'],
      ['Usaha sendiri', 'Fase berikutnya: pelanggan sendiri, jalur usaha internet yang legal.'],
    ];
    return h(
      'ol',
      'ladder',
      steps.map(([t, d], i) => `<li class="${i < st ? 'done' : i === st ? 'cur' : ''}"><b>${t}</b><span>${d}</span>${i === st ? '<em>sekarang</em>' : i > st ? '<em>nanti</em>' : ''}</li>`).join(''),
    );
  }
  openCareer() {
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', 'Jalur karier'));
    box.append(this.ladder());
    box.append(h('h3', '', 'Catatan: "RT/RW Net" itu tidak bebas'));
    box.append(
      h(
        'ul',
        'legal',
        [
          'UU 36/1999 Pasal 11 ayat (1): penyelenggaraan telekomunikasi wajib izin Menteri.',
          'Menjual kembali internet tanpa izin dapat dipidana maksimal 10 tahun (Pasal 47 jo. Pasal 11 ayat (1), sebagaimana diubah UU 6/2023 Cipta Kerja); pemberitaan menyebut denda hingga Rp1,5 miliar.',
          'Jalur legal: jadi penyelenggara (izin ISP), atau reseller dengan Sertifikat Standar Jasa Jual Kembali Jasa Telekomunikasi (KBLI 61994) lewat OSS plus PKS (perjanjian kerja sama) dengan ISP berizin (Permenkominfo 13/2019 dan 3/2021). Tagihan memakai merek ISP dan wajib memenuhi standar kualitas layanan.',
          'Penindakan nyata: 150 penyelenggara ISP ilegal ditindak sepanjang 2023 sampai Maret 2024.',
        ]
          .map(x => `<li>${x}</li>`)
          .join(''),
      ),
    );
    box.append(h('p', 'fnote', 'Catatan edukasi dari riset game ini, bukan nasihat hukum. Quest lengkap (urus OSS + kontrak ISP) menyusul di fase usaha sendiri.'));
    if (!this.s.legalSeen) {
      this.s.legalSeen = true;
      this.save();
    }
    box.append(this.closeRow(btn('Kembali ke papan', () => this.openBoard(), 'btn')));
    this.show(box);
  }
  openNotaList() {
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', 'Nota terakhir'));
    if (!this.s.nota.length) box.append(h('p', 'how', 'Belum ada nota.'));
    else
      box.append(
        h(
          'table',
          'ro',
          `<tr><th>Order</th><th>Hari</th><th>Pekerjaan</th><th>Hasil</th><th>Diterima</th></tr>${[...this.s.nota]
            .reverse()
            .map(n => `<tr><td>${esc(n.id)}</td><td>${n.day}</td><td>${esc(n.title)}</td><td>${n.failed ? 'gagal' : STARS(n.stars)}</td><td>${rp(n.net)}</td></tr>`)
            .join('')}`,
        ),
      );
    box.append(this.closeRow(btn('Kembali ke papan', () => this.openBoard(), 'btn')));
    this.show(box);
  }
  /** F at the material cabinet in the office */
  openLemari(msg = '') {
    const box = h('div', 'noc-box field-lemari');
    box.append(h('h2', '', 'Lemari material · Nusa Teknik'));
    box.append(h('p', 'how', 'Material milik kantor. Yang terpakai di order dipotong dari bayaranmu (harga perkiraan eceran). Yang tidak terpakai boleh dikembalikan.'));
    if (msg) box.append(h('p', 'msg', esc(msg)));
    const inv = this.noc.inv;
    const rows: [keyof Mat, string, () => void, (() => void) | null][] = [
      ['patch', `di tas: ${inv.patch}${this.noc.bagCables ? ` (${this.noc.bagCables} buatan sendiri)` : ''}`, () => (inv.patch < 6 ? inv.patch++ : 0), inv.patch > this.noc.bagCables ? () => inv.patch-- : null],
      ['rj45', `di tas: ${this.noc.rj45}`, () => (this.noc.rj45 += 10), null],
      ['utp', 'gulungan di meja kerja, dipotong saat crimp (1,5 m per kabel)', () => {}, null],
      ['router', `di tas: ${this.bag.router}`, () => (this.bag.router < 1 ? this.bag.router++ : 0), this.bag.router ? () => this.bag.router-- : null],
    ];
    const list = h('div', 'inv');
    for (const [k, have, take, put] of rows) {
      const r = h('div', 'inv-row', `<span><b>${MAT_LABEL[k]}</b> <small>${rp(PRICE[k] ?? 0)}/${MAT_UNIT[k]}</small><br><small>${esc(have)}</small></span>`);
      if (k !== 'utp') r.append(btn(k === 'rj45' ? 'Ambil 10' : 'Ambil 1', () => (take(), this.openLemari()), 'btn', `field-take-${k}`));
      if (put) r.append(btn('Kembalikan', () => (put(), this.openLemari()), 'btn', `field-put-${k}`));
      list.append(r);
    }
    box.append(list);
    box.append(
      this.closeRow(
        btn('Alat kerja (LAN tester, console, …)', () => this.noc.openCabinet(true, 'Alat kerja · Nusa Teknik (pinjam, kembalikan setelah selesai)'), 'btn', 'field-tools'),
        btn('Meja kerja: crimping', () => this.noc.openCrimpBench(), 'btn', 'field-crimp'),
        ...(this.onFtthShelf ? [btn('Alat fiber (FTTH)', () => this.onFtthShelf?.(() => this.openLemari()), 'btn', 'field-ftth')] : []),
      ),
    );
    this.show(box);
  }

  /** T while an order runs: the order letter, berita acara and signing */
  openOrder(msg = '') {
    const a = this.act;
    if (!a) {
      this.noc.openBoard();
      return;
    }
    const box = h('div', 'noc-box wide field-order');
    const o = a.o;
    box.append(h('h2', '', `Surat order ${o.id} · ${esc(o.title)}`));
    box.append(
      h(
        'table',
        'ro',
        `<tr><th>Pelanggan</th><td>${esc(o.who)}</td></tr><tr><th>Alamat</th><td>${esc(o.address)}</td></tr><tr><th>Tarif</th><td>${o.kind === 'garansi' ? 'Garansi (tidak dibayar)' : `${rp(o.tarif)} <small>perkiraan tarif pasar · ★★★ 100% · ★★ ${STAR_PAY[2] * 100}% · ★ ${STAR_PAY[1] * 100}%</small>`}</td></tr>`,
      ),
    );
    box.append(h('ul', 'fo-lines', o.lines.map(l => `<li>${esc(l)}</li>`).join('')));
    box.append(h('div', 'fo-stage', stageBarHtml(this.stage())));
    box.append(h('p', 'nx', esc(this.nextHint())));
    if (msg) box.append(h('p', 'msg', esc(msg)));
    if (a.docReady) {
      box.append(h('h3', '', 'Berita acara'));
      box.append(h('p', 'how', 'Tulis penyebab, tindakan, dan cara kamu membuktikan hasilnya. Alamat IP yang ditulis harus sesuai fakta di lapangan.'));
      const ta = h('textarea', 'ba') as HTMLTextAreaElement;
      ta.name = 'field-berita';
      ta.rows = 4;
      ta.addEventListener('keydown', e => e.stopPropagation());
      box.append(ta);
      box.append(this.closeRow(btn('Tanda tangan & serahkan nota', () => {
        const err = this.sign(ta.value);
        if (err) this.openOrder(err);
      }, 'btn pri', 'field-sign')));
    } else {
      box.append(
        this.closeRow(
          btn('Papan kerja magang (hotel)', () => this.noc.openBoard(), 'btn', 'field-noc'),
          btn('Batalkan order (denda)', () => this.cancel(), 'btn', 'field-cancel'),
        ),
      );
    }
    this.show(box);
  }
  /** facts a berita acara may name: addresses on the order, in the work log, and the devices' real addressing */
  private known(): Set<string> {
    const a = this.act!;
    const k = new Set<string>(ipsIn(...a.o.lines, a.inj.detail, ...a.log));
    const env = ENVS[a.o.cust];
    for (const hst of env.hosts) k.add(hst.ip);
    k.add(env.gateway);
    if (env.dhcp) for (const v of [env.dhcp.start, env.dhcp.end]) k.add(v);
    addNet24(k, env.gateway);
    for (const t of a.targets) {
      const l = live(adapterOf(t.pc));
      for (const v of [l.ip, l.gw, ...l.dns]) if (v) k.add(v);
    }
    for (const x of ['8.8.8.8', '8.8.4.4', '1.1.1.1']) k.add(x);
    return k;
  }
  /** sign the berita acara: re-check live state, score, pay, schedule garansi on a weak check, show the nota */
  sign(text: string): string {
    const a = this.act;
    if (!a) return 'Tidak ada order.';
    if (text.trim().length < 25) return 'Tulis uraian penyebab & tindakan minimal satu kalimat (25 huruf).';
    const t0 = a.targets.find(t => t.primary) ?? a.targets[0];
    const l0 = live(adapterOf(t0.pc));
    const fact = beritaFactCheck(text, this.known(), l0.ip ? `${t0.label}: IP ${l0.ip}, gateway ${l0.gw || '-'}` : '');
    if (fact) return fact;
    this.check();
    if (!a.docReady) return 'Belum bisa ditandatangani: hasil uji di perangkat pelanggan tidak lagi lolos. Cek ulang.';
    this.close(text.trim().slice(0, 600));
    return '';
  }
  /** weak checks that bring a garansi callback later */
  weakness(): { reason: GaransiReason; redo: Record<string, string | number>; why: string } | null {
    const a = this.act!;
    const t = a.o.tpl;
    if (a.inj.ftth) { const w = ftthWeak(a.inj.ftth); return w && { reason: 'fiber', redo: w.redo, why: w.why }; }
    if ((t === 'w_port' || (a.o.kind === 'garansi' && a.o.reason === 'config')) && sw('SW-WARNET').dirty)
      return { reason: 'config', redo: { ...a.inj.data }, why: 'Konfigurasi SW-WARNET diubah tapi belum disimpan (write memory): hilang kalau switch restart.' };
    for (const [k, c] of a.portCable) if (cableWeak(c)) return { reason: 'crimp', redo: { where: k, pc: t0pc(a) }, why: crimpWhy(c!) };
    if (t === 'w_kabel' || String(a.inj.data.where ?? '').startsWith('PROP_')) {
      const pc = String(a.inj.data.pc);
      const c = this.noc.cordAt(pc);
      if (cableWeak(c)) return { reason: 'crimp', redo: { pc, where: pc }, why: crimpWhy(c!) };
    }
    return null;
  }
  private close(berita: string) {
    const a = this.act!;
    const o = a.o;
    const slaOk = a.age <= FIELD_TPLS[o.tpl].sla;
    // a PC that only waits on the hotspot login page (the order put a hotspot on its LAN) is not broken
    const collateral = a.snap.filter(n => !ok(n) && !rosNeedsLogin(n));
    const weak = this.weakness();
    const unsaved = o.tpl === 'w_loop' && sw('SW-WARNET').dirty;
    // Fase 3 FTTH: K3 notes (APD missing on the pole / at the splicer / with the VFL) and tools left at the site cost like a wrong step
    const site = a.inj.ftth ? ftthSiteCheck(this.ftthKit?.() ?? null) : null;
    const wrong = a.wrong + (site?.k3.length ? 1 : 0) + (site?.left.length ? 1 : 0);
    const stars = jobStars({ slaMet: slaOk, collateral: collateral.length, wrong, swDirty: !!weak || unsaved });
    const garansi = o.kind === 'garansi';
    const pay = payout(o.tarif, stars, a.mat, garansi);
    const repBefore = this.s.rep[o.cust];
    this.s.saldo += pay.net;
    this.s.done++;
    this.s.rep = applyRep(this.s.rep, o.cust, garansi ? 'garansiDone' : repEventForStars(stars));
    o.status = 'done';
    // a weak check comes back as an unpaid garansi callback 1–2 days later (the w_loop STP revert would not hurt anyone: no callback)
    if (weak && o.tpl !== 'w_loop') this.s.garansi.push(planGaransi(o, weak.reason, weak.redo, this.s.day, this.rand));
    const nota: Nota = { id: o.id, day: this.s.day, title: o.title, who: o.who, tarif: o.tarif, stars, jasa: pay.jasa, mat: { ...a.mat }, material: pay.material, denda: 0, net: pay.net, garansi, failed: false };
    pushNota(this.s, nota);
    this.act = null;
    this.save();
    const extra = site
      ? [
          site.k3.length ? `K3: ${site.k3.join('; ')} (−1 bintang)` : 'K3: APD lengkap saat naik tiang, menyambung dan memakai laser',
          site.left.length ? `Alat tertinggal di lokasi: ${site.left.join(', ')} (−1 bintang)` : 'Alat dibereskan dari lokasi',
          ...(site.carried.length ? [`Kembalikan alat fiber ke lemari Nusa Teknik: ${site.carried.join(', ')}`] : []),
        ]
      : [];
    if (site) this.log(`Penutupan: K3 ${site.k3.length ? 'dicatat' : 'lengkap'}, alat ${site.left.length ? 'tertinggal' : 'dibereskan'}`);
    this.openNota(nota, { berita, detail: a.inj.detail, slaOk, collateral, weak: weak?.why ?? (unsaved ? 'Konfigurasi switch belum disimpan (write memory).' : ''), repFrom: repBefore, repTo: this.s.rep[o.cust], cust: o.cust, extra });
  }
  openNota(n: Nota, x: { berita: string; detail: string; slaOk: boolean; collateral: string[]; weak: string; repFrom: number; repTo: number; cust: Cust; extra?: string[] }) {
    const box = h('div', 'noc-box wide field-nota');
    box.append(h('h2', '', `Nota ${esc(n.id)} · Nusa Teknik`));
    const matRows = (Object.keys(n.mat) as (keyof Mat)[])
      .filter(k => (n.mat[k] ?? 0) > 0)
      .map(k => `<tr><td>${MAT_LABEL[k]}</td><td>${n.mat[k]} ${MAT_UNIT[k]} × ${rp(PRICE[k] ?? 0)}</td><td class="num">− ${rp(k === 'utp' ? (Math.ceil(n.mat.utp * 2) / 2) * PRICE.utp : (n.mat[k] ?? 0) * (PRICE[k] ?? 0))}</td></tr>`)
      .join('');
    box.append(
      h(
        'div',
        'nota-head',
        `<div><small>Pelanggan</small><b>${esc(n.who)}</b></div><div><small>Hari kerja</small><b>${n.day}</b></div><div><small>Teknisi</small><b>${esc(this.noc.playerName() || 'Teknisi lapangan')}</b></div><div><small>Hasil</small><b class="stars">${STARS(n.stars)}</b></div>`,
      ),
    );
    box.append(
      h(
        'table',
        'ro nota',
        `<tr><th colspan="3">${esc(n.title)}</th></tr>
        <tr><td>Jasa</td><td>${n.garansi ? 'garansi (tidak dibayar)' : `${rp(n.tarif)} × ${Math.round((STAR_PAY[n.stars] ?? 0.6) * 100)}% (${STARS(n.stars)})`}</td><td class="num">${rp(n.jasa)}</td></tr>
        ${matRows}
        <tr class="tot"><td>Diterima</td><td></td><td class="num">${rp(n.net)}</td></tr>`,
      ),
    );
    const qc = [
      x.slaOk ? 'Waktu: dalam SLA' : 'Waktu: lewat SLA (−1 bintang)',
      x.collateral.length ? `Perangkat lain ikut rusak: ${x.collateral.map(deviceLabel).join(', ')} (−1 bintang)` : 'Tidak ada perangkat lain yang rusak',
      x.weak ? `${x.weak} Pelanggan bisa minta garansi.` : 'Pemeriksaan akhir rapi',
      ...(x.extra ?? []),
    ];
    box.append(h('ul', 'fo-lines', qc.map(q => `<li>${esc(q)}</li>`).join('')));
    box.append(h('p', '', `<b>Berita acara:</b> ${esc(x.berita)}`));
    box.append(h('p', 'fnote', `Temuan: ${esc(x.detail)}`));
    box.append(h('p', 'fb-stat', `<span>Saldo <b>${rp(this.s.saldo)}</b></span><span>Reputasi ${CUST_LABEL[x.cust]} <b>${x.repFrom} → ${x.repTo}</b></span>`));
    box.append(this.closeRow(btn('Ke papan order', () => this.openBoard(), 'btn pri', 'field-nota-board')));
    this.show(box);
  }

  // ---------------------------------------------------------------- device panels at the sites
  /** F at a site device: the live read-out plus the field actions that device offers */
  device(id: string) {
    const r = readout(id === 'ONT' ? 'ONT' : id);
    const box = h('div', 'noc-box field-dev');
    box.append(h('h2', '', esc(r.title)));
    box.append(h('table', 'ro', r.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')));
    box.append(h('p', 'how', esc(r.note)));
    const out = h('div', 'tester-out');
    const a = this.act;
    if (id === 'TV' && a) {
      const t = a.targets.find(x => x.pc === TV);
      if (t && ok(TV)) {
        t.ok = true;
        t.tested = true;
        this.log('Smart TV: menu jaringan → tersambung internet');
        out.innerHTML = '<p class="msg ok">Diuji: TV tersambung ke internet.</p>';
        this.check();
      }
    }
    if (id === 'ONT') this.routerSection(box, out);
    if (id === 'ONT') this.portSection(box, out, 'ONT-RUMAH:1', 'LAN1 ONT → router Wi-Fi');
    if (id === 'ONT' && this.onFiber) {
      const fr = h('div', 'row left');
      fr.append(btn('Fiber: roset & konektor ONT (alat FTTH)', () => this.onFiber?.(), 'btn', 'field-fiber'));
      box.append(fr);
    }
    if (id === 'KOS_ROUTER') {
      this.portSection(box, out, 'RTR-KOS:1', 'ether2 → AP lantai 1');
      this.portSection(box, out, 'RTR-KOS:2', 'ether3 → AP lantai 2');
    }
    if (id.startsWith('AP-KOS')) this.channelSection(box, out, id);
    box.append(out);
    box.append(this.closeRow());
    this.show(box);
  }
  /** cable to a port of a site device: state + re-seat / install a cable from the bag / crimp */
  private portSection(box: HTMLElement, out: HTMLElement, key: string, label: string) {
    const { sw: s, n } = portParts(key);
    const pp = s.panel[n - 1];
    const a = this.act;
    const broken = !!a?.broken.has(key);
    const link = !!pp.patch && portLink(s, s.ports[n - 1]);
    const sec = h('div', 'fd-sec');
    const st = pp.patch ? (link ? 'terpasang, LED link hijau' : 'terpasang, LED link mati') : broken ? 'konektor RJ45 patah (klip hilang), tidak bisa dikunci' : 'kabel tercabut, menggantung';
    sec.append(h('p', '', `<b>${esc(label)}</b>: ${st}`));
    const rw = h('div', 'row left');
    if (!pp.patch && !broken)
      rw.append(
        btn('Colok ulang sampai klik', () => {
          patchCord(s, n, n);
          this.log(`${label}: kabel dicolok ulang`);
          this.noc.closeModal();
          this.host.toast('Kabel dicolok lagi, "klik". LED link menyala.', 3000);
        }, 'btn pri', `field-reseat-${key}`),
      );
    if (!pp.patch || broken || (a && a.portCable.has(key) && !link)) {
      rw.append(
        btn(`Pasang kabel dari tas (${this.noc.inv.patch})`, () => {
          const got = this.noc.takeCable();
          if (!got) {
            out.innerHTML = '<p class="msg warn">Tas kosong. Buat kabel di meja/tang crimping, atau ambil patch cord di lemari material.</p>';
            return;
          }
          const works = got.cable ? judge(got.cable).works : true;
          if (a) a.portCable.set(key, got.cable);
          if (works) {
            patchCord(s, n, n);
            a?.broken.delete(key);
            this.log(`${label}: kabel ${got.cable ? 'crimp buatan sendiri' : 'patch cord jadi'} dipasang`);
            this.host.toast('Kabel terpasang. LED link menyala.', 3000);
          } else {
            patchCord(s, n, null);
            if (a) {
              a.wrong++;
              a.broken.add(key);
            }
            this.log(`${label}: kabel crimp dipasang tapi tidak tersambung`);
            this.host.toast('LED link tetap mati: kabel buatanmu tidak tersambung. Buat ulang dan tes dulu.', 4200);
          }
          this.noc.closeModal();
        }, 'btn', `field-cable-${key}`),
      );
      rw.append(btn('Tang crimping (buat kabel)', () => this.noc.openCrimpBench(), 'btn', `field-crimp-${key}`));
    }
    sec.append(rw);
    box.append(sec);
  }
  /** the house's Wi-Fi router (AP mode): replace a dead unit, set SSID / security / key */
  private routerSection(box: HTMLElement, out: HTMLElement) {
    const r = ap('AP-RUMAH-RTR');
    const a = this.act;
    const job = a && a.o.tpl === 'r_router';
    const sec = h('div', 'fd-sec');
    if (!r.mounted) {
      sec.append(h('p', '', '<b>Router Wi-Fi keluarga</b>: mati total, LED power tidak menyala (adaptor sudah dicoba pelanggan).'));
      const rw = h('div', 'row left');
      rw.append(
        btn(`Pasang router baru (${this.bag.router} di tas)`, () => {
          if (this.bag.router < 1) {
            out.innerHTML = '<p class="msg warn">Kamu tidak membawa router baru. Ambil di lemari material Nusa Teknik.</p>';
            return;
          }
          this.bag.router--;
          if (a) a.mat.router++;
          Object.assign(r, { mounted: true, ssid: NEW_ROUTER.ssid, key: NEW_ROUTER.key, sec: 'WPA2-PSK' as WifiSec, ch: NEW_ROUTER.ch });
          this.log(`Router baru dipasang (bawaan pabrik ${NEW_ROUTER.ssid}), kabel ONT LAN1 → port LAN router (mode AP)`);
          this.device('ONT');
        }, 'btn pri', 'field-router-new'),
      );
      sec.append(rw);
    } else if (job) {
      sec.append(h('p', '', `<b>Router Wi-Fi (mode access point)</b> · SSID <b>${esc(r.ssid)}</b> · ${esc(r.sec ?? '')} · kanal ${r.ch}`));
      const f = h('div', 'fd-form');
      const ss = h('input') as HTMLInputElement;
      ss.name = 'field-ssid';
      ss.value = r.ssid;
      const sel = h('select') as HTMLSelectElement;
      sel.name = 'field-sec';
      for (const v of ['WPA2-PSK', 'WPA/WPA2-PSK', 'Open'] as WifiSec[]) sel.append(new Option(v === 'Open' ? 'Tanpa sandi (Open)' : v === 'WPA2-PSK' ? 'WPA2-PSK (AES)' : 'WPA/WPA2-PSK campuran', v, false, r.sec === v));
      const pw = h('input') as HTMLInputElement;
      pw.name = 'field-key';
      pw.value = r.key ?? '';
      for (const e of [ss, pw]) e.addEventListener('keydown', ev => ev.stopPropagation());
      f.append(h('label', '', 'SSID'), ss, h('label', '', 'Keamanan'), sel, h('label', '', 'Sandi'), pw);
      sec.append(h('p', 'how', `Stiker router baru: SSID ${NEW_ROUTER.ssid}, sandi ${NEW_ROUTER.key}. Atur dari aplikasi/halaman router (laptop teknisi tersambung ke LAN router).`));
      sec.append(f);
      sec.append(
        btn('Simpan pengaturan Wi-Fi', () => {
          const sv = sel.value as WifiSec;
          if (!ss.value.trim()) return void (out.innerHTML = '<p class="msg warn">SSID tidak boleh kosong.</p>');
          if (sv !== 'Open' && pw.value.length < 8) return void (out.innerHTML = '<p class="msg warn">Sandi WPA minimal 8 karakter.</p>');
          Object.assign(r, { ssid: ss.value.trim().slice(0, 32), sec: sv, key: sv === 'Open' ? '' : pw.value });
          this.log(`Router: SSID ${r.ssid}, ${sv}${sv === 'Open' ? '' : ', sandi diatur'}`);
          this.device('ONT');
        }, 'btn pri', 'field-wifi-save'),
      );
    }
    box.append(sec);
  }
  /** kos ceiling AP: channel survey and channel setting (the AP's own app on the technician's phone) */
  private channelSection(box: HTMLElement, out: HTMLElement, id: string) {
    const x = ap(id);
    const sec = h('div', 'fd-sec');
    const heard = heardAt(x.lx, x.lz, (x.ly ?? 3) - 0.3, x.level, x.site).filter(q => q.ap !== x);
    sec.append(h('p', '', `<b>Survei kanal di ${esc(id)}</b> (kanal sekarang ${x.ch}): ${channelClean(x) ? 'bersih' : 'tumpang tindih'}`));
    sec.append(h('table', 'ro', `<tr><th>AP terdengar</th><th>Kanal</th><th>Sinyal</th><th></th></tr>${heard.map(q => `<tr><td>${esc(q.ap.id)}</td><td>${q.ap.ch}</td><td>${q.rssi} dBm</td><td>${overlap(q.ap.ch, x.ch) ? 'tumpang tindih' : ''}</td></tr>`).join('') || '<tr><td colspan="4">tidak ada</td></tr>'}`));
    const rw = h('div', 'row left');
    const sel = h('select') as HTMLSelectElement;
    sel.name = `field-ch-${id}`;
    for (const c of CHANNELS) sel.append(new Option(String(c), String(c), false, c === x.ch));
    rw.append(
      h('span', '', 'Kanal:'),
      sel,
      btn('Terapkan', () => {
        x.ch = +sel.value;
        this.log(`${id}: kanal → ${x.ch}`);
        this.device(id);
      }, 'btn pri', `field-ch-apply-${id}`),
    );
    sec.append(rw);
    sec.append(h('p', 'fnote', 'Di 2,4 GHz hanya kanal 1, 6 dan 11 yang tidak saling tumpang tindih.'));
    box.append(sec);
    void out;
  }

  // ---------------------------------------------------------------- QA
  qa() {
    const a = this.act;
    return {
      unlocked: this.unlocked, saldo: this.s.saldo, rep: { ...this.s.rep }, day: this.s.day, done: this.s.done, failed: this.s.failed,
      offers: this.s.offers.map(o => ({ id: o.id, tpl: o.tpl, kind: o.kind, status: o.status, tarif: o.tarif, due: o.due })),
      garansi: this.s.garansi.map(g => ({ ...g })), nota: this.s.nota.slice(-3), bag: { ...this.bag, patch: this.noc.inv.patch, rj45: this.noc.rj45 },
      act: a && {
        id: a.o.id, tpl: a.o.tpl, kind: a.o.kind, variant: a.inj.variant, data: { ...a.inj.data }, detail: a.inj.detail, stage: this.stage(), surveyed: a.surveyed, docReady: a.docReady, problem: this.problem(),
        targets: a.targets.map(t => ({ pc: t.pc, primary: t.primary, ok: t.ok, tested: t.tested })), mat: { ...a.mat }, age: Math.round(a.age), next: this.nextHint(), weak: this.weakness()?.reason ?? null, ftth: a.inj.ftth ? { ...a.inj.ftth } : null, log: a.log.slice(-8),
      },
    };
  }
  /** QA: put one order of a template on the board (deterministic seed) */
  qaOffer(tpl: keyof typeof FIELD_TPLS, seed = 7) {
    this.ensureDay();
    const t = FIELD_TPLS[tpl];
    const o: Order = { id: `NT-${String(++this.s.seq).padStart(3, '0')}`, tpl, cust: t.cust, kind: 'order', title: t.title, who: CUSTOMER[t.cust].who, address: CUSTOMER[t.cust].address, lines: [t.say[0], ...t.ask], tarif: t.tarif[0] + 5000 * Math.floor((t.tarif[1] - t.tarif[0]) / 10000), day: this.s.day, seed, status: 'offer' };
    this.s.offers.push(o);
    this.save();
    return o.id;
  }
}

const t0pc = (a: Active) => (a.targets.find(t => t.primary) ?? a.targets[0]).pc;
const crimpWhy = (c: Cable) => {
  const j = judge(c);
  return !j.standard ? `Kabel crimp bukan T568B di kedua ujung (${j.kind === 'crossover' ? 'crossover' : 'T568A'}): masih nyala sekarang, tapi tidak sesuai standar.` : 'Kabel crimp dipasang tanpa dites LAN tester.';
};
void SITE_TV;
