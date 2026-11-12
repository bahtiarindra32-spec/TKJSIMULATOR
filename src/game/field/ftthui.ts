// Fase 3 FTTH chunk B1b: the fibre toolkit in the world. Borrow the kit at the Nusa Teknik cabinet, then use it where
// the cable is: the roset / ONT in the house, the ODP on the pole (ladder + climb cutscene), the ODC cabinet.
// Every number the player reads comes from the engine (src/pcos/ftth: opmRead, vfl, otdr, SpliceSession, ontStatus);
// this file only picks the point, the λ and the tool, draws it and applies the engine's field actions.
import type { Noc } from '../noc';
import { h, btn, esc } from '../noc/util';
import {
  opmRead, vfl, otdr, ontStatus, cleanConnector, plugDrop, setCap, repairBreak, spanStartM, fixBend, CONN, SpliceSession, SPLICE_STEPS,
  type FtthNet, type Lambda, type OpmPoint, type VflPoint, type VflResult, type OtdrTrace, type SpliceStep, type Led,
} from '../../pcos/ftth';
import { rumahFtth, RUMAH_CUST, RUMAH_ODP } from '../../pcos/ftthsite';
import { dropPointAt, indoorPointAt, FTTH_RUMAH, type P3 } from '../../data/ftthsite';
import {
  KIT, newKit, borrow, giveBack, placeLadder, takeLadder, climb, descend, useSleeve, chipItems, apdMissing, kitDef,
  barPhase, stripInput, cleaveInput, cleaveAngle, cleanInput, alignInput, touchedInput, protectInput, type Kit, type KitId,
} from './ftthkit';
import { recordPlug } from './simftth';
import './ftth.css';

export interface FtthHost {
  noc: Noc;
  toast: (s: string, ms?: number) => void;
  /** show the red VFL leak points (city coords) */
  glows: (pts: P3[]) => void;
  ladder: (on: boolean) => void;
  /** run the climb cutscene up (true) or down (false); `then` when the camera has arrived */
  climbCam: (up: boolean, then?: () => void) => void;
  /** a line for the running field order's work log (no-op without one) */
  log: (s: string) => void;
  /** a consumable used during the running field order (sleeve → nota material); optional */
  consume?: (k: 'sleeve') => void;
}
/** Fase 3 B2: a bend counts as "in the roset area" (straightened from the roset) when it is on the patch cord or within this
 *  many metres of the roset on the drop (inside the house) ⚠ design */
const ROSET_AREA_M = 2;
const POLE_ID = `tiang:${RUMAH_ODP}`;
const LAMBDA_NOTE: Record<Lambda, string> = { 1310: 'upstream ONT', 1490: 'downstream data', 1550: 'uji / video' };
const STEP_LABEL: Record<SpliceStep, string> = { strip: 'Strip', clean: 'Bersihkan', cleave: 'Cleave', align: 'Pasang', fuse: 'Fusi', protect: 'Sleeve' };
const LED_TXT: Record<Led, string> = { off: 'mati', green: 'hijau', 'green-blink': 'hijau berkedip', red: 'merah', 'red-blink': 'merah berkedip' };
const fmtM = (m: number) => `${m.toFixed(1)} m`;

export class FtthField {
  kit: Kit = newKit();
  private chip: HTMLElement;
  private chipSig = '';
  private lam: Lambda = 1490;
  private otdrLam: Lambda = 1550;
  /** last instrument results (QA + re-render) */
  last: { opm?: ReturnType<typeof opmRead>; vfl?: VflResult; otdr?: OtdrTrace; splice?: { lossDb: number; pass: boolean; applied: boolean; mistakes: string[] } } = {};
  private glowT = 0;
  private sp: SpliceUi | null = null;
  private actions: string[] = [];
  /** bends the player has located with the VFL or the OTDR, per network (B2: "rapikan tekukan" needs the spot first) */
  private found = new WeakMap<FtthNet, Set<string>>();
  private foundOf(n: FtthNet) { let f = this.found.get(n); if (!f) { f = new Set(); this.found.set(n, f); } return f; }

  constructor(private host: FtthHost) {
    this.chip = h('div');
    this.chip.id = 'ftth-chip';
    document.body.append(this.chip);
  }
  private get net(): FtthNet | null { return rumahFtth(); }
  private show(box: HTMLElement) { this.host.noc.present(box); }
  private close() { this.host.noc.closeModal(); }
  private did(s: string) { this.actions.push(s); this.host.log(s); }
  private row(...b: HTMLElement[]) { const r = h('div', 'row left'); r.append(...b); return r; }
  private closeRow(...extra: HTMLElement[]) { const r = h('div', 'row'); r.append(...extra, btn('Tutup [Esc]', () => this.close(), 'btn', 'ftth-close')); return r; }
  private need(id: KitId, out: HTMLElement): boolean {
    if (this.kit.has.has(id)) return true;
    out.innerHTML = `<p class="msg warn">Kamu tidak membawa ${esc(kitDef(id).label.toLowerCase())}. Pinjam di lemari material Nusa Teknik.</p>`;
    return false;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, hudOn: boolean) {
    const items = chipItems(this.kit), sig = `${hudOn}|${items.join(',')}`;
    if (sig !== this.chipSig) {
      this.chipSig = sig;
      this.chip.classList.toggle('on', hudOn && items.length > 0);
      this.chip.innerHTML = `<b>ALAT FIBER</b>${items.map(t => `<span>${esc(t)}</span>`).join('')}`;
    }
    // the VFL stays on while plugged: its leak points follow the network (a splice removes the break glow)
    if (this.kit.vflOn && (this.glowT -= dt) <= 0) { this.glowT = 0.5; this.refreshGlow(); }
  }

  // ---------------------------------------------------------------- the cabinet shelf
  openShelf(msg = '', back?: () => void) {
    const box = h('div', 'noc-box ftth-shelf');
    box.append(h('h2', '', 'Alat fiber (FTTH) · Nusa Teknik'));
    box.append(h('p', 'how', 'Alat milik kantor, dipinjam per pekerjaan dan dikembalikan. APD ditandai: tiang = helm, sarung tangan, harness, kacamata.'));
    if (msg) box.append(h('p', 'msg', esc(msg)));
    const list = h('div', 'inv');
    for (const d of KIT) {
      const have = d.id === 'sleeve' ? this.kit.sleeves > 0 : this.kit.has.has(d.id);
      const tag = d.kind === 'apd' ? '<em class="badge">APD</em>' : d.kind === 'bahan' ? '<em class="badge">bahan</em>' : '';
      const r = h('div', 'inv-row', `<span><b>${esc(d.label)}</b> ${tag}<br><small>${esc(d.note)}${d.id === 'sleeve' ? ` · di tas: ${this.kit.sleeves}` : have ? ' · dibawa' : ''}</small></span>`);
      if (d.id === 'sleeve' || !have) r.append(btn(d.id === 'sleeve' ? 'Ambil 4' : 'Ambil', () => this.openShelf(borrow(this.kit, d.id), back), 'btn', `ftth-take-${d.id}`));
      if (have) r.append(btn('Kembalikan', () => this.openShelf(giveBack(this.kit, d.id).msg, back), 'btn', `ftth-put-${d.id}`));
      list.append(r);
    }
    box.append(list);
    box.append(this.closeRow(...(back ? [btn('Kembali ke lemari', back, 'btn', 'ftth-back')] : [])));
    this.show(box);
  }

  // ---------------------------------------------------------------- shared instrument blocks
  private ontBlock(box: HTMLElement) {
    const n = this.net; if (!n) return;
    const st = ontStatus(n, RUMAH_CUST);
    const led = (name: string, l: Led) => `<span class="led ${l.replace('-blink', '')}${l.endsWith('blink') ? ' blink' : ''}"></span>${name} <small>${LED_TXT[l]}</small>`;
    box.append(h('div', 'ftth-ont', `<span class="lbl">ONT ${esc(st.serial)}</span>${led('PON', st.leds.pon)}${led('LOS', st.leds.los)}`));
  }
  private lamSeg(cur: Lambda, set: (l: Lambda) => void, name: string) {
    const seg = h('div', 'ftth-seg');
    for (const l of [1310, 1490, 1550] as Lambda[]) {
      const b = btn(`${l} nm`, () => set(l), `seg${l === cur ? ' on' : ''}`, `${name}-${l}`);
      b.title = LAMBDA_NOTE[l];
      seg.append(b);
    }
    return seg;
  }
  /** OPM at a point: the meter is plugged where the cable is opened, reads the live PON signal at the chosen λ */
  private opmSection(box: HTMLElement, _out: HTMLElement, points: [OpmPoint, string][], reopen: () => void) {
    const sec = h('div', 'fd-sec'), out = h('div', 'tester-out');
    sec.append(h('h3', '', 'OPM · power meter'));
    sec.append(this.lamSeg(this.lam, l => { this.lam = l; reopen(); }, 'ftth-lam'));
    const rw = h('div', 'row left');
    for (const [pt, label] of points)
      rw.append(btn(label, () => {
        if (!this.need('opm', out) || !this.net) return;
        const r = opmRead(this.net, RUMAH_CUST, pt, this.lam, 'pon');
        this.last.opm = r;
        this.did(`OPM ${pt} ${r.lambda} nm: ${r.display}`);
        out.innerHTML = `<div class="ftth-meter${r.dbm === null ? ' lo' : ''}" data-opm="${esc(r.display)}"><small>OPM · ${r.lambda} nm · ${esc(pointName(pt))}</small><b>${esc(r.display)}</b>${r.dbm === null && r.lambda !== 1490 ? '<small>Sinyal PON ke arah ONT hanya 1490 nm (1310 = arah naik dari ONT).</small>' : ''}</div>`;
      }, 'btn', `ftth-opm-${pt}`));
    sec.append(rw, out);
    box.append(sec);
  }
  private vflSection(box: HTMLElement, _out: HTMLElement, points: [VflPoint, string][], reopen: () => void) {
    const sec = h('div', 'fd-sec'), out = h('div', 'tester-out');
    sec.append(h('h3', '', `VFL · laser merah${this.kit.vflOn ? ` <em class="badge">menyala di ${esc(pointName(this.kit.vflOn as VflPoint))}</em>` : ''}`));
    const rw = h('div', 'row left');
    if (!this.kit.vflOn)
      for (const [pt, label] of points)
        rw.append(btn(label, () => {
          if (!this.need('vfl', out) || !this.net) return;
          if (apdMissing(this.kit, 'laser').length) this.kit.k3.push('VFL dinyalakan tanpa kacamata safety');
          this.kit.vflOn = pt;
          this.did(`VFL dicolok di ${pointName(pt)} dan dinyalakan`);
          this.refreshGlow();
          reopen();
        }, 'btn', `ftth-vfl-${pt}`));
    else rw.append(btn('Matikan & cabut VFL', () => { this.kit.vflOn = null; this.host.glows([]); this.last.vfl = undefined; reopen(); }, 'btn', 'ftth-vfl-off'));
    sec.append(rw);
    const r = this.last.vfl;
    if (this.kit.vflOn && r) {
      const vis = r.visible;
      sec.append(h('p', vis.length ? 'msg warn' : 'msg', vis.length
        ? `Cahaya merah terlihat bocor: ${vis.map(g => `${esc(glowName(g.kind))} ±${fmtM(g.distanceM)} dari VFL`).join('; ')}.`
        : r.reachedEnd ? 'Tidak ada cahaya bocor di sepanjang kabel; ujung seberang menyala merah.' : 'Tidak ada titik bocor yang terlihat.'));
    }
    sec.append(out, h('p', 'fnote', 'K3: jangan menatap ujung konektor; lihat cahaya VFL dari samping.'));
    box.append(sec);
  }
  private refreshGlow() {
    const n = this.net, at = this.kit.vflOn as VflPoint | null;
    if (!n || !at) { this.host.glows([]); return; }
    const r = vfl(n, RUMAH_CUST, at);
    this.last.vfl = r;
    for (const g of r.visible) if (g.kind === 'macrobend') this.foundOf(n).add(g.id);
    const c = n.customers[RUMAH_CUST];
    const d0 = spanStartM(n, RUMAH_CUST, c.drop)!, i0 = spanStartM(n, RUMAH_CUST, c.indoor)!;
    const pts: P3[] = [];
    for (const g of r.visible) {
      if (g.atM >= d0 && g.atM < i0) pts.push(dropPointAt(g.atM - d0));
      else if (g.atM >= i0) pts.push(indoorPointAt(g.atM - i0));
      else pts.push(dropPointAt(0));   // at the ODP (open / dead port)
    }
    this.host.glows(pts);
  }
  private cleanSection(box: HTMLElement, _out: HTMLElement, conns: [string, string][], reopen: () => void) {
    const sec = h('div', 'fd-sec'), out = h('div', 'tester-out');
    sec.append(h('h3', '', 'Bersihkan konektor'));
    const rw = h('div', 'row left');
    for (const [id, label] of conns)
      rw.append(btn(label, () => {
        if (!this.need('pembersih', out) || !this.net) return;
        cleanConnector(this.net, id);
        // the drop's port connector is unplugged, cleaned and mated again: that mating is a clean one
        const c = this.net.customers[RUMAH_CUST];
        if (c.port !== null && id === CONN.odpPort(RUMAH_ODP, c.port)) recordPlug(c.port, true);
        this.did(`Konektor ${this.net.connectors[id].label} dibersihkan (alkohol IPA + tisu), dicolok lagi`);
        reopen();
        this.host.toast(`${this.net.connectors[id].label}: dibersihkan dan dicolok lagi.`, 2600);
      }, 'btn', `ftth-clean-${id.replace(/[^a-z0-9]/gi, '_')}`));
    sec.append(rw, out);
    box.append(sec);
  }

  // ---------------------------------------------------------------- roset + ONT (inside the house)
  openRoset() {
    const n = this.net; if (!n) return;
    const box = h('div', 'noc-box wide ftth-panel');
    box.append(h('h2', '', 'Roset & ONT · Rumah Kel. Hendra'));
    this.ontBlock(box);
    box.append(h('p', 'how', 'Roset di dinding: ujung kabel drop dari tiang. Patch cord 1,5 m ke ONT. Cabut patch cord untuk mengukur di roset.'));
    const out = h('div', 'tester-out');
    const re = () => this.openRoset();
    this.opmSection(box, out, [['roset', 'Ukur di roset'], ['ont', 'Ukur di ujung patch cord (ONT)']], re);
    this.vflSection(box, out, [['roset', 'Colok VFL di roset'], ['ont', 'Colok VFL di konektor ONT']], re);
    this.cleanSection(box, out, [[CONN.roset(RUMAH_CUST), 'Konektor roset'], [CONN.ont(RUMAH_CUST), 'Konektor ONT']], re);
    this.bendSection(box, re);
    box.append(out);
    box.append(this.closeRow());
    this.show(box);
  }

  /** Fase 3 B2: straighten a tight bend near the roset once it has been located (VFL glow or OTDR event) */
  private bendSection(box: HTMLElement, reopen: () => void) {
    const n = this.net; if (!n) return;
    const c = n.customers[RUMAH_CUST], dropM = n.spans[c.drop].lengthM, f = this.foundOf(n);
    const near = Object.values(n.bends).filter(b => b.span === c.indoor || (b.span === c.drop && dropM - b.atM <= ROSET_AREA_M));
    const seen = near.filter(b => f.has(b.id));
    const sec = h('div', 'fd-sec');
    sec.append(h('h3', '', 'Kabel di sekitar roset'));
    if (!seen.length) sec.append(h('p', 'how', 'Kabel drop dan patch cord di belakang bufet terlihat biasa dari luar. Titik tekukan baru kelihatan dengan VFL (cahaya merah bocor) atau dari event OTDR.'));
    const rw = h('div', 'row left');
    for (const b of seen) {
      const d = b.span === c.indoor ? b.atM : dropM - b.atM;
      const where = b.span === c.indoor ? 'patch cord ke ONT' : 'kabel drop';
      rw.append(btn(`Rapikan tekukan ${where} (±${d.toFixed(1)} m dari roset)`, () => {
        fixBend(n, b.id);
        f.delete(b.id);
        this.did(`Tekukan ${where} ±${d.toFixed(1)} m dari roset dirapikan (lilitan dilepas, jari-jari dilonggarkan)`);
        this.host.toast('Kabel dirapikan: lilitan kencang dilepas, ditekuk longgar mengikuti dinding.', 3200);
        if (this.kit.vflOn) this.refreshGlow();
        reopen();
      }, 'btn pri', `ftth-unbend-${b.id}`));
    }
    sec.append(rw, h('p', 'fnote', 'Kabel fiber jangan ditekuk tajam atau dililit kencang dengan cable ties: redaman naik, paling terasa di 1550 nm.'));
    box.append(sec);
  }

  // ---------------------------------------------------------------- the pole: ladder, climb, ODP
  poleHint() {
    const k = this.kit;
    if (k.climbing) return '[F] Buka ODP-FLB-01 (di atas tangga)';
    if (k.ladderAt === POLE_ID) return '[F] Tiang ODP-FLB-01 · naik tangga';
    return '[F] Tiang ODP-FLB-01';
  }
  usePole() { if (this.kit.climbing) this.openOdp(); else this.openPole(); }
  openPole(msg = '') {
    const box = h('div', 'noc-box ftth-panel');
    box.append(h('h2', '', 'Tiang beton · ODP-FLB-01'));
    box.append(h('p', 'how', 'Box ODP 1:8 terpasang 3 m di atas trotoar. Untuk membuka box dan mengukur di port, naik pakai tangga.'));
    if (msg) box.append(h('p', 'msg', esc(msg)));
    const miss = apdMissing(this.kit, 'tiang');
    box.append(h('p', miss.length ? 'msg warn' : 'msg', miss.length ? `APD belum lengkap: ${miss.map(id => esc(kitDef(id).label)).join(', ')}.` : 'APD kerja di tiang lengkap.'));
    const rw = h('div', 'row left');
    if (this.kit.ladderAt !== POLE_ID) {
      rw.append(btn('Sandarkan tangga ke tiang', () => {
        const r = placeLadder(this.kit, POLE_ID);
        if (r.ok) { this.host.ladder(true); this.did(r.msg); }
        this.openPole(r.msg);
      }, 'btn pri', 'ftth-ladder-place'));
    } else {
      rw.append(btn('Naik ke ODP', () => {
        const r = climb(this.kit, POLE_ID);
        if (!r.ok) return this.openPole(r.msg);
        this.did(`Naik tangga ke ODP-FLB-01${r.missing.length ? ' (K3: APD kurang)' : ''}`);
        if (r.missing.length) this.host.toast(r.msg, 4500);
        this.close();
        this.host.climbCam(true, () => this.openOdp());
      }, 'btn pri', 'ftth-climb'));
      rw.append(btn('Lepas tangga', () => {
        const r = takeLadder(this.kit);
        if (r.ok) this.host.ladder(false);
        this.openPole(r.msg);
      }, 'btn', 'ftth-ladder-take'));
    }
    box.append(rw);
    box.append(this.closeRow());
    this.show(box);
  }
  openOdp(msg = '') {
    const n = this.net; if (!n) return;
    const odp = n.odps[RUMAH_ODP], c = n.customers[RUMAH_CUST];
    const box = h('div', 'noc-box wide ftth-panel');
    box.append(h('h2', '', 'ODP-FLB-01 · splitter 1:8 (di atas tangga)'));
    if (msg) box.append(h('p', 'msg', esc(msg)));
    const who = (cid: string | null) => (cid ? n.customers[cid]?.label ?? cid : '');
    box.append(h('table', 'ro ftth-ports', `<tr><th>Port</th><th>Splitter</th><th>Drop</th><th>Tutup debu</th></tr>${odp.ports.map(p => `<tr${p.customer === RUMAH_CUST ? ' class="cur"' : ''}><td>${p.n}</td><td>${p.live ? 'tersambung' : 'belum disambung'}</td><td>${esc(who(p.customer)) || '-'}</td><td>${p.customer ? '' : p.capped ? 'terpasang' : 'terbuka'}</td></tr>`).join('')}`));
    const out = h('div', 'tester-out');
    const re = () => this.openOdp();
    const portTxt = c.port === null ? 'drop rumah tercabut' : `drop rumah di port ${c.port}`;
    box.append(h('p', 'how', `${esc(portTxt)}. Untuk mengukur, drop dicabut dari port dan alat dicolok ke port atau ke konektor drop.`));
    this.opmSection(box, out, [['odp-port', `Ukur di port ${c.port ?? '-'} (OPM)`]], re);
    this.vflSection(box, out, [['odp-port', 'Colok VFL ke konektor drop (arah rumah)']], re);
    // OTDR
    {
      const sec = h('div', 'fd-sec');
      const out = h('div', 'tester-out');
      sec.append(h('h3', '', 'OTDR · tembak ke arah rumah'));
      sec.append(this.lamSeg(this.otdrLam, l => { this.otdrLam = l; re(); }, 'ftth-otdr-lam'));
      sec.append(this.row(btn('Colok OTDR ke drop & tembak', () => {
        if (!this.need('otdr', out) || !this.net) return;
        if (c.port === null) { out.innerHTML = '<p class="msg warn">Drop tidak terpasang di port mana pun.</p>'; return; }
        const t = otdr(this.net, RUMAH_CUST, { launch: 'odp-port', lambda: this.otdrLam });
        this.last.otdr = t;
        for (const ev of t.events) for (const id of ev.ids) if (this.net.bends[id]) this.foundOf(this.net).add(id);
        this.did(`OTDR ${t.lambda} nm dari port ${c.port}: akhir fiber ${t.endM === null ? '-' : fmtM(t.endM)}`);
        this.openOtdr(t, () => this.openOdp());
      }, 'btn', 'ftth-otdr-shot')), out);
      box.append(sec);
    }
    this.cleanSection(box, out, c.port !== null ? [[CONN.odpPort(RUMAH_ODP, c.port), `Konektor port ${c.port}`]] : [], re);
    // re-plug + caps
    {
      const sec = h('div', 'fd-sec');
      const out = h('div', 'tester-out');
      sec.append(h('h3', '', 'Pindah port drop'));
      const sel = h('select') as HTMLSelectElement;
      sel.name = 'ftth-port';
      for (const p of odp.ports) sel.append(new Option(`Port ${p.n}${p.customer && p.customer !== RUMAH_CUST ? ` (dipakai ${who(p.customer)})` : ''}`, String(p.n), false, p.n === c.port));
      const plug = (cleaned: boolean) => {
        const nn = +sel.value;
        if (cleaned && !this.need('pembersih', out)) return;
        try {
          plugDrop(n, RUMAH_CUST, nn, { cleaned });
          recordPlug(nn, cleaned);
          this.did(cleaned ? `Konektor drop & port ${nn} dibersihkan (alkohol IPA + tisu), drop dicolok ke port ${nn}` : `Drop rumah dicolok ke port ${nn} (tanpa dibersihkan)`);
          this.openOdp(`Drop rumah sekarang di port ${nn}.`);
        } catch { out.innerHTML = `<p class="msg warn">Port ${nn} sudah dipakai pelanggan lain.</p>`; }
      };
      sec.append(this.row(h('span', '', 'Colok drop rumah ke:'), sel, btn('Bersihkan lalu colok', () => plug(true), 'btn pri', 'ftth-replug-clean'), btn('Colok langsung', () => plug(false), 'btn', 'ftth-replug')));
      const open = odp.ports.filter(p => !p.customer && !p.capped);
      sec.append(out);
      if (open.length) sec.append(this.row(btn(`Pasang tutup debu port kosong (${open.map(p => p.n).join(', ')})`, () => { for (const p of open) setCap(n, RUMAH_ODP, p.n, true); this.did('Tutup debu port kosong dipasang'); re(); }, 'btn', 'ftth-cap')));
      box.append(sec);
    }
    // splice: a break on the drop or the distribution
    const brk = Object.values(n.breaks).find(b => b.span === c.drop || b.span === odp.distribution);
    if (brk) {
      const sec = h('div', 'fd-sec');
      sec.append(h('h3', '', 'Sambung fiber putus'));
      sec.append(h('p', 'how', 'Lepas drop dari clamp dan ulur service loop supaya bagian putus sampai ke tangga, lalu sambung dengan fusion splicer.'));
      const out = h('div', 'tester-out');
      sec.append(this.row(btn('Siapkan splicer', () => {
        if (!this.need('splicer', out)) return;
        this.openSplice(brk.id);
      }, 'btn pri', 'ftth-splice')), out);
      box.append(sec);
    }
    box.append(out);
    const rw = h('div', 'row');
    rw.append(btn('Turun tangga', () => this.down(), 'btn', 'ftth-descend'), btn('Tutup [Esc]', () => this.close(), 'btn', 'ftth-close'));
    box.append(rw);
    this.show(box);
  }
  down() {
    this.close();
    if (!this.kit.climbing) return;
    this.host.climbCam(false, () => descend(this.kit));
    this.did('Turun dari tangga');
  }

  // ---------------------------------------------------------------- the ODC cabinet
  openOdc() {
    const n = this.net; if (!n) return;
    const box = h('div', 'noc-box ftth-panel');
    box.append(h('h2', '', `${esc(n.odc.label)} · kabinet ODC`));
    const dist = n.spans[n.odps[RUMAH_ODP].distribution];
    box.append(h('table', 'ro', `<tr><th>Feeder dari STO</th><td>${(n.spans[n.feeder].lengthM / 1000).toFixed(1)} km</td></tr><tr><th>Splitter</th><td>1:${n.odc.ratio}</td></tr><tr><th>Distribusi ke ODP-FLB-01</th><td>${fmtM(dist.lengthM)} (duct trotoar + riser tiang)</td></tr>`));
    box.append(h('p', 'how', 'Kabinet dikunci operator. Untuk pelanggan rumah ini, pengukuran dilakukan di port ODP-FLB-01 (tiang) dan di roset.'));
    box.append(h('p', 'fnote', 'K3: di dalam kabinet ada sinar laser aktif. Jangan menatap ujung konektor.'));
    box.append(this.closeRow());
    this.show(box);
  }

  // ---------------------------------------------------------------- OTDR screen
  openOtdr(t: OtdrTrace, back: () => void) {
    const box = h('div', 'noc-box wide ftth-otdr');
    box.append(h('h2', '', `OTDR · ${t.lambda} nm · dari port ODP`));
    const cv = h('canvas', 'ftth-trace') as HTMLCanvasElement;
    cv.width = 720; cv.height = 250;
    box.append(cv);
    drawTrace(cv, t);
    const rows = [...t.inDeadZone.map(e => ({ e, dz: true })), ...t.events.map(e => ({ e, dz: false }))].sort((a, b) => a.e.distanceM - b.e.distanceM);
    const typ = { reflective: 'reflektif', 'non-reflective': 'non-reflektif', end: 'akhir fiber' } as const;
    box.append(h('table', 'ro ftth-ev', `<tr><th>#</th><th>Jarak</th><th>Loss</th><th>Tipe</th><th>Keterangan</th></tr>${rows.map((r, i) => `<tr${r.dz ? ' class="dz"' : ''}><td>${i + 1}</td><td>${fmtM(r.e.distanceM)}</td><td>${r.e.type === 'end' ? '-' : `${r.e.lossDb.toFixed(2)} dB`}</td><td>${typ[r.e.type]}</td><td>${esc(r.e.label)}${r.dz ? ' <small>(dalam dead zone)</small>' : ''}</td></tr>`).join('') || '<tr><td colspan="5">tidak ada event</td></tr>'}`));
    box.append(h('div', 'ftth-sum', `<span>Akhir fiber <b data-otdr-end="${t.endM ?? ''}">${t.endM === null ? 'di luar jangkauan' : fmtM(t.endM)}</b></span><span>Loss total <b>${t.totalLossDb.toFixed(2)} dB</b></span><span>Dead zone <b>${t.deadZoneM} m</b></span>`));
    box.append(this.closeRow(btn('Kembali', back, 'btn', 'ftth-otdr-back')));
    this.show(box);
  }

  // ---------------------------------------------------------------- splice minigame
  openSplice(breakId: string) {
    if (!this.sp || this.sp.breakId !== breakId) this.sp = new SpliceUi(breakId);
    if (apdMissing(this.kit, 'splice').length && !this.sp.k3Noted) { this.kit.k3.push('Menyambung fiber tanpa kacamata safety'); this.sp.k3Noted = true; }
    this.renderSplice();
  }
  private renderSplice() {
    const S = this.sp!, s = S.s;
    const box = h('div', 'noc-box wide ftth-splice');
    box.append(h('h2', '', 'Fusion splicer · sambung drop putus'));
    // step strip
    const stg = h('div', 'stg');
    const curIx = s.done ? SPLICE_STEPS.length : SPLICE_STEPS.indexOf(s.expected!);
    SPLICE_STEPS.forEach((st, i) => stg.append(h('span', i < curIx ? 'done' : i === curIx ? 'cur' : '', STEP_LABEL[st])));
    box.append(stg);
    const wrap = h('div', 'sp-wrap');
    const screen = h('div', 'sp-screen');
    const res = s.result();
    screen.innerHTML = [
      `<div><small>PROG</small> ${S.program}-${S.program}</div>`,
      `<div><small>SLEEVE</small> ${S.sleeveOn ? 'terpasang di fiber' : '-'}</div>`,
      `<div><small>CLEAVE</small> ${S.angle === null ? '-' : `${S.angle.toFixed(1)}°`}</div>`,
      `<div class="est"><small>EST. LOSS</small> <b data-loss="${res ? res.lossDb : ''}">${res ? res.estimate : '--.-- dB'}</b></div>`,
      `<div class="msgl">${esc(S.msg)}</div>`,
    ].join('');
    const act = h('div', 'sp-act');
    wrap.append(screen, act);
    box.append(wrap);
    const go = (st: SpliceStep, inp: Parameters<SpliceSession['step']>[1]) => { const r = s.step(st, inp); S.msg = r.msg; this.renderSplice(); return r; };
    const exp = s.expected;
    const pendingReject = exp === 'fuse' && s.rejects > S.handled;
    if (exp === 'strip') {
      act.append(h('p', '', 'Sleeve dimasukkan ke salah satu ujung <b>sebelum</b> menyambung. Lalu kupas coating 2–3 cm: hentikan penanda di jendela tengah.'));
      act.append(this.row(btn(S.sleeveOn ? 'Sleeve sudah di fiber' : `Masukkan sleeve ke fiber (${this.kit.sleeves} di tas)`, () => {
        if (S.sleeveOn) return;
        if (!useSleeve(this.kit)) { S.msg = 'Tidak ada sleeve di tas. Ambil di lemari material.'; return this.renderSplice(); }
        this.host.consume?.('sleeve');
        S.sleeveOn = true; S.msg = 'Sleeve masuk ke fiber kiri.'; this.renderSplice();
      }, 'btn', 'sp-sleeve-on')));
      act.append(timingBar('strip', ph => go('strip', stripInput(ph)), 'Kupas (stop)'));
    } else if (exp === 'clean' || (exp === 'fuse' && S.needClean)) {
      act.append(h('p', '', 'Bersihkan sisa coating dari fiber yang sudah dikupas.'));
      act.append(this.row(
        btn('Lap tisu + alkohol IPA', () => { if (!this.kit.has.has('pembersih')) { S.msg = 'Kit pembersih tidak dibawa.'; return this.renderSplice(); } S.needClean = false; go('clean', cleanInput('alkohol')); }, 'btn pri', 'sp-clean-alkohol'),
        btn('Tiup saja', () => { S.needClean = false; go('clean', cleanInput('tiup')); }, 'btn', 'sp-clean-tiup'),
        btn('Langsung lanjut', () => { S.needClean = false; go('clean', cleanInput('lewati')); }, 'btn', 'sp-clean-lewati'),
      ));
    } else if (exp === 'cleave' || (exp === 'fuse' && S.recleave)) {
      act.append(h('p', '', 'Letakkan fiber di cleaver, tekan blade tepat saat penanda di tengah (sudut potong makin miring kalau meleset).'));
      act.append(timingBar('cleave', ph => { S.angle = cleaveAngle(ph); S.recleave = false; go('cleave', cleaveInput(ph)); }, 'Tekan blade (stop)'));
    } else if (exp === 'align') {
      act.append(h('p', '', 'Pasang kedua ujung di V-groove splicer, pilih program, tutup clamp.'));
      const grid = h('div', 'sp-grid');
      const tg = (k: 'left' | 'right', label: string) => btn(`${S[k] ? 'Terpasang: ' : ''}${label}`, () => { S[k] = !S[k]; this.renderSplice(); }, `btn${S[k] ? ' on' : ''}`, `sp-${k}`);
      grid.append(tg('left', 'Fiber kiri di V-groove'), tg('right', 'Fiber kanan di V-groove'));
      const sel = h('select') as HTMLSelectElement;
      sel.name = 'sp-program';
      for (const p of ['SM', 'MM', 'DS', 'NZ'] as const) sel.append(new Option(`${p}-${p}`, p, false, p === S.program));
      sel.onchange = () => { S.program = sel.value as SpliceUi['program']; this.renderSplice(); };
      const hold = h('select') as HTMLSelectElement;
      hold.name = 'sp-hold';
      for (const [v, t] of [['coat', 'Pegang di bagian coating'], ['glass', 'Pegang di kaca yang sudah dikupas']]) hold.append(new Option(t, v, false, (v === 'glass') === S.touched));
      hold.onchange = () => { S.touched = hold.value === 'glass'; };
      grid.append(h('label', '', 'Program'), sel, h('label', '', 'Cara memegang'), hold);
      act.append(grid);
      act.append(this.row(btn('Tutup clamp & penutup', () => go('align', { ...alignInput({ leftSeated: S.left, rightSeated: S.right, program: S.program }), ...touchedInput(S.touched) }), 'btn pri', 'sp-clamp')));
    } else if (exp === 'fuse') {
      if (pendingReject) {
        act.append(h('p', 'msg warn', 'Splicer menolak cleave. Buka clamp, bersihkan lagi dan cleave ulang.'));
        act.append(this.row(btn('Buka clamp, ulangi', () => { S.handled = s.rejects; S.needClean = true; S.recleave = true; this.renderSplice(); }, 'btn pri', 'sp-redo')));
      } else {
        act.append(h('p', '', 'Splicer memeriksa ujung fiber, lalu arc fusi.'));
        act.append(this.row(btn('SET (fusi)', () => go('fuse', {}), 'btn pri', 'sp-fuse')));
      }
    } else if (exp === 'protect') {
      act.append(h('p', '', 'Geser sleeve menutupi titik sambung, panaskan di heater splicer.'));
      act.append(this.row(
        btn('Geser sleeve & panaskan', () => go('protect', protectInput({ sleeveOn: S.sleeveOn, heated: true })), 'btn pri', 'sp-heat'),
        btn('Lewati sleeve', () => go('protect', protectInput({ sleeveOn: false, heated: false })), 'btn', 'sp-noheat'),
      ));
    } else if (s.done) {
      if (!S.binned) act.append(this.row(btn('Buang serpihan fiber ke botol limbah bertutup', () => { s.binScraps(); S.binned = true; S.msg = 'Serpihan fiber dibuang ke wadah bertutup.'; this.renderSplice(); }, 'btn', 'sp-bin')));
      const r = s.result()!;
      act.append(h('p', r.pass ? 'msg' : 'msg warn', `${r.pass ? 'Sambungan lulus' : 'Sambungan tidak lulus'} (batas ${s.t.passDb.toFixed(2)} dB${r.protected ? '' : ', tanpa sleeve'}). Skor ${r.score}.${r.mistakes.length ? ` Catatan: ${esc(r.mistakes.join('; '))}.` : ''}`));
      act.append(this.row(
        btn('Rapikan & kembalikan drop ke clamp', () => this.applySplice(), `btn${r.pass ? ' pri' : ''}`, 'sp-apply'),
        btn('Potong & ulangi', () => { this.sp = new SpliceUi(S.breakId); this.renderSplice(); }, 'btn', 'sp-again'),
      ));
    }
    const rw = h('div', 'row');
    rw.append(btn('Kembali ke ODP', () => this.openOdp(), 'btn', 'sp-back'));
    box.append(rw);
    this.show(box);
  }
  private applySplice() {
    const S = this.sp!, n = this.net, r = S.s.result();
    if (!n || !r || !n.breaks[S.breakId]) return this.openOdp();
    repairBreak(n, S.breakId, r.lossDb, r.protected);
    this.last.splice = { lossDb: r.lossDb, pass: r.pass, applied: true, mistakes: r.mistakes };
    this.did(`Drop disambung (fusi), est. loss ${r.estimate}${r.protected ? ', sleeve terpasang' : ', TANPA sleeve'}`);
    this.sp = null;
    const st = ontStatus(n, RUMAH_CUST);
    this.openOdp(`Sambungan dipasang (${r.estimate}). ONT sekarang: ${st.state === 'online' ? 'online' : st.reason}.`);
  }

  // ---------------------------------------------------------------- QA
  qa() {
    const k = this.kit;
    return {
      has: [...k.has], sleeves: k.sleeves, ladderAt: k.ladderAt, climbing: k.climbing, vflOn: k.vflOn, k3: [...k.k3],
      opm: this.last.opm ?? null, vfl: this.last.vfl ? this.last.vfl.visible.map(g => ({ kind: g.kind, distanceM: g.distanceM, atM: g.atM })) : null,
      otdr: this.last.otdr ? { endM: this.last.otdr.endM, events: this.last.otdr.events.length, inDeadZone: this.last.otdr.inDeadZone.length } : null,
      found: this.net ? [...this.foundOf(this.net)] : [], splice: this.last.splice ?? null, spliceStep: this.sp ? this.sp.s.expected : null, actions: this.actions.slice(-12),
    };
  }
}

/** per-attempt UI state of the splice minigame (the engine session holds the rules) */
class SpliceUi {
  s = new SpliceSession();
  msg = 'Siap. Kupas dulu.';
  sleeveOn = false;
  angle: number | null = null;
  left = false;
  right = false;
  program: 'SM' | 'MM' | 'DS' | 'NZ' = 'SM';
  touched = false;
  needClean = false;
  /** rejects the player has already reacted to */
  handled = 0;
  recleave = false;
  binned = false;
  k3Noted = false;
  constructor(readonly breakId: string) {}
}

const pointName = (p: OpmPoint | VflPoint) => (p === 'odp-port' ? 'port ODP' : p === 'roset' ? 'roset' : 'konektor ONT');
const GLOW_NAME: Record<string, string> = { break: 'fiber putus', macrobend: 'tekukan tajam', dirty: 'konektor kotor', 'bad-splice': 'sambungan jelek', 'open-end': 'ujung terbuka' };
const glowName = (k: string) => GLOW_NAME[k] ?? k;

/**
 * a marker sweeping a bar; the stop button reads where it is. The phase is computed from the clock at the click
 * (barPhase), the animation only shows it. data-phase carries the live value for QA.
 */
function timingBar(name: string, onStop: (phase: number) => void, label: string) {
  const PERIOD = 1600;
  const wrap = h('div', 'sp-bar');
  const track = h('div', 'trk', '<i class="zone"></i><i class="mk"></i>');
  const mk = track.querySelector('.mk') as HTMLElement;
  const t0 = performance.now();
  let raf = 0;
  const tick = () => {
    if (!wrap.isConnected && raf) return;
    const ph = barPhase(performance.now() - t0, PERIOD);
    mk.style.left = `${(ph * 100).toFixed(1)}%`;
    wrap.dataset.phase = ph.toFixed(3);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const b = btn(label, () => { cancelAnimationFrame(raf); onStop(barPhase(performance.now() - t0, PERIOD)); }, 'btn pri', `sp-stop-${name}`);
  wrap.append(track, b);
  return wrap;
}

/** the OTDR trace: relative level (dB) over distance from the engine's points, event markers, the dead zone and the end */
function drawTrace(cv: HTMLCanvasElement, t: OtdrTrace) {
  const g = cv.getContext('2d'); if (!g) return;
  const W = cv.width, H = cv.height, L = 52, R = 14, T = 14, B = 34;
  const maxM = Math.max(10, (t.endM ?? t.points[t.points.length - 1]?.m ?? 10) * 1.15, t.deadZoneM * 1.5);
  const minDb = Math.min(-1, ...t.points.map(p => p.db)) - 0.5;
  const x = (m: number) => L + (m / maxM) * (W - L - R), y = (db: number) => T + (db / minDb) * (H - T - B);
  g.fillStyle = '#0e1012'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2a2e34'; g.lineWidth = 1; g.font = '11px ui-monospace, Consolas, monospace'; g.fillStyle = '#8f969d';
  const stepM = niceStep(maxM / 6);
  for (let m = 0; m <= maxM; m += stepM) { g.beginPath(); g.moveTo(x(m), T); g.lineTo(x(m), H - B); g.stroke(); g.fillText(`${m} m`, x(m) - 10, H - B + 16); }
  const stepDb = niceStep(-minDb / 4);
  for (let d = 0; d >= minDb; d -= stepDb) { g.beginPath(); g.moveTo(L, y(d)); g.lineTo(W - R, y(d)); g.stroke(); g.fillText(`${d.toFixed(stepDb < 1 ? 1 : 0)} dB`, 4, y(d) + 4); }
  // dead zone
  g.fillStyle = 'rgba(240,192,46,.08)'; g.fillRect(x(0), T, x(t.deadZoneM) - x(0), H - T - B);
  g.fillStyle = '#c9a43a'; g.fillText('dead zone', x(0) + 3, T + 12);
  // trace from the engine points; launch spike and the reflective end spike are drawn at their event distances
  g.strokeStyle = '#43c07f'; g.lineWidth = 2; g.beginPath();
  t.points.forEach((p, i) => (i ? g.lineTo(x(p.m), y(p.db)) : g.moveTo(x(p.m), y(p.db))));
  const last = t.points[t.points.length - 1];
  if (t.endM !== null && last) { g.lineTo(x(t.endM), y(last.db)); g.lineTo(x(t.endM), T + 4); g.lineTo(x(t.endM) + 3, H - B); }
  g.stroke();
  // markers
  g.fillStyle = '#ebe7de';
  for (const e of [...t.inDeadZone, ...t.events]) {
    const xm = x(e.distanceM);
    g.beginPath(); g.moveTo(xm, H - B - 2); g.lineTo(xm - 5, H - B - 11); g.lineTo(xm + 5, H - B - 11); g.closePath();
    g.fillStyle = e.type === 'end' ? '#e2574c' : e.type === 'reflective' ? '#5bb8d6' : '#ebe7de'; g.fill();
  }
  if (t.endM !== null) { g.fillStyle = '#e2574c'; g.fillText(`akhir ${t.endM.toFixed(1)} m`, Math.min(W - R - 90, x(t.endM) + 6), T + 26); }
  g.fillStyle = '#8f969d'; g.fillText(`${t.lambda} nm`, W - R - 56, T + 12);
}
function niceStep(x: number) { const p = 10 ** Math.floor(Math.log10(Math.max(1e-6, x))); for (const k of [1, 2, 5, 10]) if (k * p >= x) return k * p; return 10 * p; }

void FTTH_RUMAH;
