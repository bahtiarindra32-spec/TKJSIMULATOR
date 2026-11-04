// NocWorkshop: the technician's physical work. Tool cabinet, crimping bench, the PC's cable check (C), floor racks
// (patch panel + switch ports, toner probe, loop cable, uplink fiber), switch console, Wi-Fi analyzer, the edge router
// and Linux server consoles. Every button changes the shared network simulation (net.ts / wifi.ts) directly.
import {
  ADAPTERS,
  SWITCHES,
  adapterOf,
  linkUp,
  bounce,
  portOf,
  outletOf,
  portName,
  isWireless,
  type Switch,
  panelOf,
  patchCord,
  stormOn,
  portLink,
} from '../../pcos/net';
import { heardAt, overlap, pctOf, type Heard } from '../../pcos/wifi';
import { SwitchCli } from '../../pcos/switchcli';
import { wiremap, WIRES, WIRE_CSS, type Wire } from '../crimp';
import { LinuxShell, SRV, linuxQa } from '../../pcos/linux';
import { Term } from '../../pcos/term';
import { nasPanel } from '../../pcos/office';
import { EdgeShell, EDGE, activeRoute } from '../../pcos/edge';
import { LabRouterShell, LABR } from '../../pcos/labrouter';
import { shuffle, h, btn, esc } from './util';
import { EDGE_F } from './faults';
import { ITEM_NAME, type Item } from './types';
import { NocCore } from './core';

export abstract class NocWorkshop extends NocCore {
  // ---------------------------------------------------------------- implemented by subclasses
  abstract closeModal(): void;
  protected abstract show(el: HTMLElement, focusBtn?: boolean): void;
  // ---------------------------------------------------------------- physical work
  hintAt(nearPc: string | null, nearRack: string | null): string | null {
    this.whereNow = { pc: nearPc, rack: nearRack };
    if (nearPc) for (const j of this.openJobs()) if (j.targets.some(t => t.pc.name === nearPc)) j.surveyed = true;
    if (nearPc && !isWireless(nearPc)) return '[C] Cek fisik kabel & outlet';
    if (nearRack && nearRack !== 'MDF') return `[F] ${this.RACKS[nearRack]?.label ?? 'Rak IDF'} (patch panel · switch)`;
    return null;
  }
  /** C key: physical inspection at a PC, or a rack. Opens a panel; returns null (no toast). */
  physical(nearPc: string | null, nearRack: string | null | boolean): string | null {
    if (nearPc) {
      this.openPhysical(nearPc);
      return null;
    }
    if (nearRack) {
      this.openRack(typeof nearRack === 'string' ? nearRack : 'MDF');
      return null;
    }
    return null;
  }
  /** F at an anchor this board owns. */
  interactAnchor(name: string | null): boolean {
    if (name === 'ANCHOR_WS_TOOLCAB_01') {
      this.openCabinet();
      return true;
    }
    if (name === 'ANCHOR_SRV_NETRACK_01') {
      this.openRack('MDF');
      return true;
    }
    if (name === 'ANCHOR_IT_NOC_01') {
      this.openBoard();
      return true;
    }
    if (name === 'ANCHOR_SRV_RACK_02') {
      this.openServer();
      return true;
    }
    if (name === 'ANCHOR_SRV_RACK_03') {
      nasPanel();
      return true;
    }
    if (name === 'ANCHOR_SRV_RACK_01' && this.edgeOpen) {
      this.edgeOpen();
      return true;
    }
    return false;
  }
  anchorHint(name: string | null): string | null {
    if (name === 'ANCHOR_WS_TOOLCAB_01') return '[F] Lemari Alat (ambil/kembalikan alat)';
    if (name === 'ANCHOR_SRV_NETRACK_01') return '[F] Rak MDF (patch panel · switch · console)';
    if (name === 'ANCHOR_IT_NOC_01') return '[F] Papan kerja NOC';
    if (name === 'ANCHOR_SRV_RACK_02') return '[F] Server Linux srv-nusa (console)';
    if (name === 'ANCHOR_SRV_RACK_03') return '[F] Rak 3 · NAS nas-kantor';
    if (name === 'ANCHOR_SRV_RACK_01' && this.edgeOpen) return '[F] Router edge R-EDGE (console)';
    return null;
  }
  openCabinet(lab = false) {
    this.cabLab = lab;
    const box = h('div', 'noc-box');
    box.append(h('h2', '', lab ? 'Lemari Alat · Lab Praktik TKJ' : 'Lemari Alat · Workshop TKJ'));
    box.append(
      h(
        'p',
        'how',
        lab
          ? 'Alat praktik milik sekolah. Kembalikan setelah selesai.'
          : 'Ambil alat yang dibutuhkan pekerjaan. Patch cord habis pakai (diganti stoknya tiap pekerjaan baru).',
      ),
    );
    const list = h('div', 'inv');
    // what the running work still needs (internship job or the lab step) goes first with a badge
    const tj = lab ? null : this.tracked();
    const need = new Set<Item>(lab ? this.labNeeds() : tj ? this.needs(tj) : []);
    const row = (it: Item, have: boolean | number, take: () => void, put: () => void, extra = '') => {
      const r = h(
        'div',
        `inv-row${need.has(it) ? ' need' : ''}`,
        `<span><b>${ITEM_NAME[it]}</b>${need.has(it) ? ' <em class="badge">Diperlukan</em>' : ''} ${extra}</span>`,
      );
      r.append(
        btn(
          it === 'patch' || it === 'ap' ? 'Ambil 1' : have ? 'Kembalikan' : 'Ambil',
          () => {
            if (it !== 'patch' && it !== 'ap' && have) put();
            else take();
            this.openCabinet(this.cabLab);
          },
          'btn',
          `take-${it}`,
        ),
      );
      list.append(r);
    };
    row(
      'toner',
      this.inv.toner,
      () => {
        this.inv.toner = true;
      },
      () => {
        this.inv.toner = false;
        if (this.toneAt) {
          this.toast('Toner generator ikut diambil dari outlet.');
          this.toneAt = null;
        }
      },
      this.inv.toner ? '· dibawa' : '',
    );
    row(
      'tester',
      this.inv.tester,
      () => {
        this.inv.tester = true;
      },
      () => {
        this.inv.tester = false;
      },
      this.inv.tester ? '· dibawa' : '',
    );
    row(
      'console',
      this.inv.console,
      () => {
        this.inv.console = true;
      },
      () => {
        this.inv.console = false;
      },
      this.inv.console ? '· dibawa' : '',
    );
    row(
      'laptop',
      this.inv.laptop,
      () => {
        this.inv.laptop = true;
      },
      () => {
        this.inv.laptop = false;
      },
      this.inv.laptop ? '· dibawa' : '',
    );
    row(
      'analyzer',
      this.inv.analyzer,
      () => {
        this.inv.analyzer = true;
      },
      () => {
        this.inv.analyzer = false;
        this.setAnalyzer(false);
      },
      this.inv.analyzer ? '· dibawa (tekan R untuk membuka)' : '',
    );
    if (this.jobs.some(j => j.status !== 'closed' && j.tpl === 'ap') || this.inv.ap)
      row(
        'ap',
        this.inv.ap,
        () => {
          if (this.inv.ap < 1) this.inv.ap++;
        },
        () => {},
        `· dibawa ${this.inv.ap}`,
      );
    row(
      'patch',
      this.inv.patch,
      () => {
        if (lab) this.inv.patch++;
        else if (this.patchStock > 0) {
          this.patchStock--;
          this.inv.patch++;
        } else this.toast('Stok patch cord habis.');
      },
      () => {},
      `· dibawa ${this.inv.patch}${lab ? '' : ` · stok ${this.patchStock}`}`,
    );
    box.append(list);
    const cr = h(
      'div',
      'inv-row',
      `<span><b>Meja crimping</b> · kabel UTP Cat6, konektor RJ45, tang crimping${this.cables.length ? ` · ${this.cables.length} kabel buatanmu di tas` : ''}</span>`,
    );
    cr.append(btn('Crimping', () => this.openCrimpBench(), this.jobs.some(x => x.status !== 'closed' && x.tpl === 'crimp') ? 'btn pri' : 'btn', 'crimp-open'));
    list.append(cr);
    list.querySelectorAll('.inv-row.need').forEach(r => list.prepend(r));
    if (need.size) {
      const nr = h('div', 'row left');
      nr.append(
        btn(
          `Ambil yang diperlukan (${need.size})`,
          () => {
            for (const it of need) {
              if (it === 'patch' || it === 'ap') {
                if (it === 'patch' && (lab || this.patchStock > 0)) {
                  if (!lab) this.patchStock--;
                  this.inv.patch++;
                }
                if (it === 'ap' && this.inv.ap < 1) this.inv.ap++;
              } else (this.inv as Record<string, unknown>)[it] = true;
            }
            this.openCabinet(lab);
          },
          'btn pri',
          'take-needed',
        ),
      );
      box.append(nr);
    }
    const j = tj;
    if (j) {
      const n = this.needs(j);
      box.append(
        h(
          'p',
          n.length ? 'msg warn' : 'msg',
          n.length ? `Untuk ${j.id} masih perlu: ${n.map(i => ITEM_NAME[i]).join(', ')}` : `Alat untuk ${j.id} sudah lengkap.`,
        ),
      );
    }
    const rw = h('div', 'row');
    rw.append(btn('Tutup [Esc]', () => this.closeModal()));
    box.append(rw);
    this.show(box);
  }
  // ---- physical state the school lab (src/game/praktik.ts) reads and sets; the lab has no jobs of its own here
  labSetCord(pc: string, present: boolean) {
    const a = adapterOf(pc);
    if (present) {
      this.noCord.delete(pc);
      a.cable = true;
    } else {
      this.noCord.add(pc);
      a.cable = false;
      this.cordOf.delete(pc);
    }
    bounce(a);
  }
  labCord(pc: string) {
    return { present: !this.noCord.has(pc), crafted: this.cordOf.get(pc) ?? null };
  }
  labTools() {
    return { ...this.inv };
  }
  openCrimpBench(msg = '') {
    const st = (this.crimpSt ??= { a: [], b: [], end: 'a', tested: false, pool: shuffle([...WIRES]) });
    const box = h('div', 'noc-box crimp');
    box.append(h('h2', '', 'Meja Crimping · Patch Cord Cat6'));
    const sw = (w: Wire) => `<i class="wire" style="background:${WIRE_CSS[w]}" title="${w}"></i>`;
    const plug = (ws: Wire[], label: string, cur: boolean) =>
      `<div class="plug ${cur ? 'cur' : ''}"><small>${label}</small><div class="pins">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<div class="pin">${ws[i] ? sw(ws[i]) : '<i class="wire empty"></i>'}<b>${i + 1}</b></div>`).join('')}</div></div>`;
    box.append(h('p', 'how', 'Konektor dilihat dari depan, klip menghadap ke bawah: pin 1 di kiri. Klik warna kabel berurutan dari pin 1 sampai 8.'));
    box.append(h('div', 'plugs', plug(st.a, 'Ujung A', st.end === 'a') + plug(st.b, 'Ujung B', st.end === 'b')));
    if (msg) box.append(h('p', 'msg', msg));
    box.append(h('p', 'how', `Konektor RJ45 di meja: <b>${this.rj45}</b> · terpakai: ${this.rj45Used}`));
    const out = h('div', 'tester-out');
    if (st.end !== 'done') {
      const cur = st[st.end];
      const pal = h('div', 'row left wires');
      for (const w of st.pool) {
        const b = btn(
          '',
          () => {
            if (cur.length < 8 && !cur.includes(w)) cur.push(w);
            this.openCrimpBench();
          },
          'btn wire-btn',
          `wire-${w}`,
        );
        b.innerHTML = `${sw(w)}<span>${w}</span>`;
        b.disabled = cur.includes(w);
        pal.append(b);
      }
      box.append(pal);
      const rw = h('div', 'row left');
      rw.append(
        btn(
          'Hapus terakhir',
          () => {
            cur.pop();
            this.openCrimpBench();
          },
          'btn',
          'crimp-undo',
        ),
      );
      rw.append(
        btn(
          'Ulang ujung ini',
          () => {
            cur.length = 0;
            this.openCrimpBench();
          },
          'btn',
          'crimp-clear',
        ),
      );
      if (cur.length === 8 && this.rj45 <= 0)
        rw.append(
          btn(
            'Ambil 1 pak konektor RJ45 (isi 10)',
            () => {
              this.rj45 += 10;
              this.logAll('Bahan: 1 pak konektor RJ45 diambil');
              this.openCrimpBench('Konektor diisi ulang. Pemakaian bahan tercatat.');
            },
            'btn pri',
            'rj45-refill',
          ),
        );
      else if (cur.length === 8)
        rw.append(
          btn(
            `Potong rata & crimp ujung ${st.end.toUpperCase()}`,
            () => {
              this.rj45--;
              this.rj45Used++;
              st.end = st.end === 'a' ? 'b' : 'done';
              this.logAll(`Crimping: ujung ${st.end === 'b' ? 'A' : 'B'} di-crimp (${cur.join(', ')})`);
              this.openCrimpBench(st.end === 'b' ? 'Ujung A sudah di-crimp. Sekarang ujung B.' : 'Kedua ujung sudah di-crimp. Tes dulu sebelum dipakai.');
            },
            'btn pri',
            'crimp-do',
          ),
        );
      box.append(rw);
    } else {
      const rw = h('div', 'row left');
      rw.append(
        btn(
          'Tes dengan LAN tester',
          () => {
            if (!this.inv.tester) {
              out.innerHTML = '<p class="msg warn">Kamu tidak membawa LAN tester. Ambil dulu di lemari ini.</p>';
              return;
            }
            st.tested = true;
            const map = wiremap({ a: st.a, b: st.b, tested: true });
            out.innerHTML = `<div class="tester"><div><small>Unit utama</small>${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<i class="tl on" style="animation-delay:${n * 0.18}s">${n}</i>`).join('')}</div><div><small>Unit remote</small>${map.map((q, i) => `<i class="tl ${q ? 'on' : ''}" style="animation-delay:${(i + 1) * 0.18}s">${q || '-'}</i>`).join('')}</div></div><p>${
              map.every((q, i) => q === i + 1)
                ? 'Lampu remote menyala 1 sampai 8 berurutan, sama dengan unit utama.'
                : `Urutan lampu remote tidak sama: ${map
                    .map((q, i) => (q === i + 1 ? '' : `pin ${i + 1} → ${q || 'putus'}`))
                    .filter(Boolean)
                    .join(', ')}.`
            }</p>`;
            this.logAll(`Crimping: tes LAN tester → ${map.join('-')}`);
          },
          'btn',
          'crimp-test',
        ),
      );
      rw.append(
        btn(
          'Simpan kabel ke tas',
          () => {
            this.cables.push({ a: [...st.a], b: [...st.b], tested: st.tested });
            this.inv.patch++;
            this.crimpSt = null;
            this.logAll('Crimping: patch cord buatan sendiri disimpan');
            this.openCrimpBench('Kabel masuk tas. Pasang di meja PC lewat cek fisik [C].');
          },
          'btn pri',
          'crimp-keep',
        ),
      );
      rw.append(
        btn(
          'Buang & buat ulang',
          () => {
            const jj = this.jobs.find(x => x.status !== 'closed' && x.tpl === 'crimp');
            if (jj) jj.wrong++;
            this.crimpSt = null;
            this.openCrimpBench('Kabel dibuang (konektor RJ45 terbuang).');
          },
          'btn',
          'crimp-bin',
        ),
      );
      box.append(rw);
    }
    box.append(out);
    const rw2 = h('div', 'row');
    rw2.append(btn('Kembali ke lemari', () => this.openCabinet(this.cabLab)));
    rw2.append(btn('Tutup [Esc]', () => this.closeModal()));
    box.append(rw2);
    this.show(box);
  }
  openPhysical(pc: string) {
    const a = adapterOf(pc),
      p = portOf(pc);
    const box = h('div', 'noc-box');
    box.append(h('h2', '', `Cek fisik · ${esc(this.pcLabel(pc))}`));
    if (isWireless(pc)) {
      box.append(h('p', '', 'Laptop tamu memakai Wi-Fi. Tidak ada kabel di sini; periksa dari sisi sistem operasi (ipconfig, Network Connections).'));
      const rw = h('div', 'row');
      rw.append(btn('Tutup [Esc]', () => this.closeModal()));
      box.append(rw);
      this.show(box);
      return;
    }
    const cord = !this.noCord.has(pc);
    const led = linkUp(a);
    const pic = h('div', 'phys');
    pic.innerHTML = `<div class="nic"><div class="jack ${cord ? (a.cable ? 'in' : 'loose') : 'empty'}"><i class="led l1 ${led ? 'on' : ''}"></i><i class="led l2 ${led && a.enabled ? 'blink' : ''}"></i></div><small>NIC belakang PC</small></div>
      <div class="cord ${cord ? '' : 'none'}"></div>
      <div class="outlet"><div class="jack in"></div><small>Outlet ${outletOf(pc)}</small></div>`;
    box.append(pic);
    const state = !cord
      ? 'Belum ada patch cord dari outlet ke PC.'
      : !a.cable
        ? 'Konektor RJ45 di PC tidak terkunci (keluar setengah).'
        : 'Konektor terpasang dan terkunci.';
    const lbl = panelOf(pc)?.pp.label ?? '';
    box.append(
      h(
        'p',
        '',
        `${state}<br>LED link: <b>${led ? 'hijau menyala' : 'mati'}</b> · Label outlet: ${lbl ? `<b>${esc(lbl)}</b>` : '<i>tidak ada (belum dipasang / pudar)</i>'}${this.toneAt === pc ? '<br>Toner generator terpasang di outlet ini (nada berjalan di kabel horizontal ke patch panel).' : ''}`,
      ),
    );
    void p;
    const out = h('div', 'tester-out');
    const acts = h('div', 'row left');
    const job = this.openJobs().find(j => j.targets.some(t => t.pc.name === pc));
    if (!cord)
      acts.append(
        btn(
          'Pasang patch cord',
          () => {
            if (this.inv.patch < 1) {
              out.innerHTML = '<p class="msg warn">Kamu tidak membawa patch cord. Ambil di Lemari Alat (Workshop TKJ).</p>';
              return;
            }
            this.inv.patch--;
            // a short physical beat: the cord goes in, the RJ45 clicks, the link LED goes amber then green (auto-negotiation)
            pic.classList.add('plug');
            acts.querySelectorAll('button').forEach(b => ((b as HTMLButtonElement).disabled = true));
            this.click();
            setTimeout(() => {
              this.noCord.delete(pc);
              a.cable = true;
              a.broken = false;
              this.useCord(pc);
              bounce(a);
              this.logAll(`${this.pcLabel(pc)}: patch cord dipasang outlet ${outletOf(pc)} → PC`, pc);
              if (this.modal?.contains(pic)) this.openPhysical(pc);
            }, 650);
          },
          'btn pri',
          'phys-install',
        ),
      );
    if (cord)
      acts.append(
        btn(
          'Cabut & colok ulang konektor',
          () => {
            const was = a.cable;
            a.cable = true;
            bounce(a);
            this.logAll(`${this.pcLabel(pc)}: konektor dicolok ulang${was ? '' : ' (tadi longgar)'}`, pc);
            this.openPhysical(pc);
            this.toast(was ? 'Konektor dicabut dan dipasang lagi. Klik terkunci.' : 'Ketemu: konektor longgar. Sekarang terkunci, "klik".', 3200);
          },
          'btn',
          'phys-reseat',
        ),
      );
    if (cord)
      acts.append(
        btn(
          'Tes kabel (LAN tester)',
          () => {
            if (!this.inv.tester) {
              out.innerHTML = '<p class="msg warn">Kamu tidak membawa LAN tester. Ambil di Lemari Alat (Workshop TKJ).</p>';
              return;
            }
            const cc = this.cordOf.get(pc);
            const cmap = cc ? wiremap(cc) : null;
            const bad = cmap ? cmap.map((q, i) => (q === i + 1 ? 0 : i + 1)).filter(Boolean) : a.broken ? [3, 6] : [];
            if (cc) cc.tested = true;
            const leds = (_side: string) =>
              [1, 2, 3, 4, 5, 6, 7, 8].map(n => `<i class="tl ${bad.includes(n) ? '' : 'on'}" style="animation-delay:${n * 0.18}s">${n}</i>`).join('');
            out.innerHTML = `<div class="tester"><div><small>Unit utama</small>${leds('m')}</div><div><small>Unit remote</small>${leds('r')}</div></div><p>${a.broken ? 'Lampu 3 dan 6 tidak menyala: pasangan hijau putus. Patch cord rusak, ganti yang baru.' : 'Lampu 1–8 menyala berurutan di kedua unit: kabel baik (straight T568B).'}</p>`;
            this.logAll(`${this.pcLabel(pc)}: tes LAN tester → ${a.broken ? 'pin 3 & 6 putus' : 'kabel baik'}`, pc);
            if (!a.broken) for (const jj of this.openJobs()) if (jj.tut && jj.targets[0].pc.name === pc) jj.tut.tested = true;
          },
          'btn',
          'phys-test',
        ),
      );
    if (cord)
      acts.append(
        btn(
          'Ganti patch cord',
          () => {
            if (this.inv.patch < 1) {
              out.innerHTML = '<p class="msg warn">Kamu tidak membawa patch cord cadangan. Ambil di Lemari Alat.</p>';
              return;
            }
            const wasted = !a.broken;
            this.inv.patch--;
            a.broken = false;
            a.cable = true;
            this.useCord(pc);
            bounce(a);
            if (wasted && job) job.wrong++;
            this.logAll(`${this.pcLabel(pc)}: patch cord diganti${wasted ? ' (kabel lama sebenarnya baik)' : ''}`, pc);
            this.openPhysical(pc);
            this.toast(wasted ? 'Patch cord diganti, padahal yang lama baik. Lain kali tes dulu.' : 'Patch cord baru terpasang. LED link menyala.', 3500);
          },
          'btn',
          'phys-replace',
        ),
      );
    acts.append(
      btn(
        this.toneAt === pc ? 'Lepas toner dari outlet' : 'Pasang toner di outlet',
        () => {
          if (this.toneAt === pc) {
            this.toneAt = null;
            this.logAll(`${this.pcLabel(pc)}: toner dilepas dari outlet`, pc);
            this.openPhysical(pc);
            return;
          }
          if (!this.inv.toner) {
            out.innerHTML = '<p class="msg warn">Kamu tidak membawa toner + probe. Ambil di Lemari Alat (Workshop TKJ).</p>';
            return;
          }
          const moved = this.toneAt && this.toneAt !== pc;
          this.toneAt = pc;
          this.logAll(`${this.pcLabel(pc)}: toner dipasang di outlet${lbl ? ` ${lbl}` : ' (tanpa label)'}`, pc);
          this.openPhysical(pc);
          this.toast(`${moved ? 'Toner dipindah ke outlet ini. ' : ''}Toner menyala. Sekarang bawa probe ke rak lantai ini dan sapu port patch panel.`, 4200);
        },
        'btn',
        'phys-tone',
      ),
    );
    const lab = h('div', 'row left');
    const inp = h('input', 'lbl-in') as HTMLInputElement;
    inp.name = 'phys-label-in';
    inp.placeholder = `L${panelOf(pc)?.sw.level ?? 1}-07`;
    inp.maxLength = 6;
    inp.value = lbl;
    inp.addEventListener('keydown', e => e.stopPropagation());
    lab.append(
      h('span', '', 'Label outlet:'),
      inp,
      btn(
        'Tempel label',
        () => {
          const v = inp.value.trim().toUpperCase();
          if (!/^L\d-\d{2}$/.test(v)) {
            out.innerHTML = '<p class="msg warn">Format label: L&lt;lantai&gt;-&lt;nomor port patch panel 2 digit&gt;, mis. L2-07.</p>';
            return;
          }
          const q = panelOf(pc);
          if (!q) return;
          q.pp.label = v;
          this.logAll(`${this.pcLabel(pc)}: label outlet ditempel "${v}"`, pc);
          this.openPhysical(pc);
        },
        'btn',
        'phys-label',
      ),
    );
    box.append(acts, lab, out);
    const rw = h('div', 'row');
    rw.append(btn('Tutup [Esc]', () => this.closeModal()));
    box.append(rw);
    this.show(box);
  }

  // ---------------------------------------------------------------- racks: patch panel, probe, uplink, console
  /** Toner probe reading at a panel port: 1 = loud (the toned run), crosstalk on neighbours, weaker when the
   *  run is patched to a live switch port (the port loads the tone, as in real life). */
  toneAt_(sw: Switch, n: number) {
    if (!this.toneAt || !this.inv.toner) return 0;
    const q = panelOf(this.toneAt);
    if (!q || q.sw !== sw) return 0;
    const d = Math.abs(q.pp.n - n);
    let v = d === 0 ? 1 : d === 1 ? 0.22 : d === 2 ? 0.07 : 0;
    const pp = sw.panel[n - 1];
    if (d === 0 && pp.patch && !sw.ports[pp.patch - 1].shutdown) v *= 0.55;
    return v;
  }
  /** the RJ45 latch: a short dry click */
  protected click() {
    try {
      this.audio ??= new AudioContext();
      const t = this.audio.currentTime,
        n = this.audio.createBufferSource(),
        b = this.audio.createBuffer(1, 2205, 44100),
        d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 180);
      const g = this.audio.createGain();
      g.gain.setValueAtTime(0.35, t);
      n.buffer = b;
      n.connect(g).connect(this.audio.destination);
      n.start(t + 0.32);
    } catch {
      /* no audio */
    }
  }
  protected beep(v: number) {
    try {
      if (!v) return;
      this.audio ??= new AudioContext();
      const o = this.audio.createOscillator(),
        g = this.audio.createGain(),
        t = this.audio.currentTime;
      o.type = 'square';
      o.frequency.setValueAtTime(980, t);
      o.frequency.setValueAtTime(1180, t + 0.12);
      o.frequency.setValueAtTime(980, t + 0.24);
      g.gain.setValueAtTime(0.18 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(g).connect(this.audio.destination);
      o.start(t);
      o.stop(t + 0.37);
    } catch {
      /* no audio */
    }
  }
  protected probeText(v: number) {
    return v >= 0.5
      ? `Nada keras (${Math.round(v * 100)}%): ini kabel outlet yang di-toner`
      : v >= 0.15
        ? `Samar (${Math.round(v * 100)}%): induksi dari kabel sebelah`
        : v > 0
          ? `Sangat samar (${Math.round(v * 100)}%)`
          : '… sunyi';
  }

  openRack(id = 'MDF') {
    const R = this.RACKS[id] ?? this.RACKP;
    const sws = SWITCHES.filter(s => s.rack === id);
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', R.label));
    box.append(
      h(
        'p',
        'how',
        'Atas: patch panel (nomor = nomor outlet di meja). Bawah: port switch. LED hijau = connected, kuning = inactive (VLAN tidak ada), abu = tidak ada link, gelap = shutdown, oranye berkedip = badai broadcast. Klik port patch panel lalu klik port switch untuk memasang patch cord.',
      ),
    );
    const tone = h(
      'div',
      'tone',
      this.probing ? (this.inv.toner ? 'Probe menyala. Sapu (arahkan kursor / klik) port patch panel.' : 'Kamu tidak membawa probe.') : '',
    );
    for (const sw of sws) {
      const card = h('div', 'swcard');
      const storm = stormOn(sw);
      const upSt = !sw.uplink ? '' : sw.upPort.shutdown ? 'off' : !sw.uplink.cable ? 'nolink' : 'up';
      card.append(
        h(
          'div',
          'swhead',
          `<b>${sw.name}</b> <small>${sw.level === 0 ? 'C2960-24TT · Lab Praktik SMK' : `${sw.level >= 4 ? 'C2960X-48FPD (PoE+)' : 'C2960X-48'} · Lantai ${sw.level}`} · ${sw.ip}${sw.level === 0 ? ' · gateway: router-praktik 192.168.70.1' : sw.uplink ? ' · uplink fiber ke MDF' : ' · inti (MDF): uplink fiber dari IDF L2 & L3 di modul SFP'}</small>`,
        ),
      );
      card.append(h('div', 'pp-title', `Patch panel ${sw.level === 0 ? 'PP-LAB · Cat6 24' : `PP-L${sw.level} · Cat6 48`} port`));
      const pp = h('div', 'ports pp');
      for (const q of sw.panel) {
        const isSel = this.sel?.sw === sw.name && this.sel.pp === q.n;
        const b = btn(
          String(q.n),
          () => {
            if (this.probing) {
              const v = this.toneAt_(sw, q.n);
              tone.textContent = `PP-${q.n}: ${this.probeText(v)}`;
              this.beep(v);
              this.logProbe(sw, q.n, v);
            }
            this.sel = { sw: sw.name, pp: q.n };
            if (!this.probing) this.openRack(id);
            else this.renderSel(sw, info, acts, id);
          },
          `ppb ${q.patch ? 'used' : q.hang ? 'hang' : ''} ${isSel ? 'sel' : ''}`,
          `pp-${sw.name}-${q.n}`,
        );
        b.title = `PP-${q.n}${q.patch ? ` → ${portName(q.patch)}` : q.hang ? ' · patch cord tergantung' : ' · kosong'}`;
        b.addEventListener('mouseenter', () => {
          if (!this.probing) return;
          const v = this.toneAt_(sw, q.n);
          tone.textContent = `PP-${q.n}: ${this.probeText(v)}`;
          this.beep(v);
        });
        pp.append(b);
      }
      card.append(pp);
      card.append(h('div', 'pp-title', `Switch ${sw.name}`));
      const ports = h('div', 'ports');
      for (const p of sw.ports) {
        const a = p.pc ? ADAPTERS.get(p.pc) : undefined;
        const inLoop = !!sw.loop?.includes(p.n);
        const isAp = !!p.pc?.startsWith('AP-');
        const st = p.shutdown
          ? 'off'
          : storm
            ? 'storm'
            : inLoop
              ? 'up'
              : (isAp ? !portLink(sw, p) : !a || !linkUp(a))
                ? 'nolink'
                : !sw.vlans.has(p.vlan)
                  ? 'inact'
                  : 'up';
        const isSel = this.sel?.sw === sw.name && this.sel.swp === p.n;
        const b = btn(String(p.n), () => this.clickSwitchPort(sw, p.n, id), `pl ${st} ${inLoop ? 'loopc' : ''} ${isSel ? 'sel' : ''}`, `swp-${sw.name}-${p.n}`);
        b.title = `${portName(p.n)} ${p.desc}${isAp ? ` · PoE ${p.poe === false ? 'mati' : st === 'up' ? 'aktif 13.4 W' : 'siap'}` : ''}`;
        ports.append(b);
      }
      card.append(ports);
      if (sw.uplink) {
        const up = h(
          'div',
          'uplink',
          `<i class="pl ${upSt}">49</i> <b>Uplink Gi1/0/49</b> (SFP 1000BASE-LX, fiber ke MDF) · ${sw.uplink.cable ? 'konektor LC terkunci' : '<b>konektor LC fiber tidak terkunci</b>'} · LED ${upSt === 'up' ? 'hijau' : 'mati'}`,
        );
        up.append(
          btn(
            'Cabut & pasang ulang fiber',
            () => {
              const was = sw.uplink!.cable;
              sw.uplink!.cable = true;
              this.logAll(`${sw.name}: patch fiber uplink dipasang ulang${was ? '' : ' (tadi longgar)'}`);
              this.check(false);
              this.toast(
                was
                  ? 'Fiber dicabut dan dipasang lagi. Konektor LC sudah terkunci dari tadi.'
                  : 'Ketemu: konektor LC fiber longgar. Sekarang terkunci, LED uplink hijau.',
                3500,
              );
              this.openRack(id);
            },
            'btn',
            `uplink-reseat-${sw.name}`,
          ),
        );
        card.append(up);
      }
      const info = h('div', 'ppinfo'),
        acts = h('div', 'row left');
      if (this.sel?.sw === sw.name) this.renderSel(sw, info, acts, id);
      card.append(info, acts);
      const rw = h('div', 'row left');
      rw.append(
        btn(
          this.probing ? 'Matikan probe' : 'Nyalakan probe toner',
          () => {
            if (!this.inv.toner && !this.probing) {
              this.toast('Kamu tidak membawa toner + probe. Ambil di Lemari Alat (Workshop TKJ).', 3500);
              return;
            }
            this.probing = !this.probing;
            this.openRack(id);
          },
          'btn',
          `probe-${sw.name}`,
        ),
      );
      rw.append(btn('Colok console & buka terminal', () => this.openConsole(sw, id), 'btn', `console-${sw.name}`));
      card.append(rw);
      box.append(card);
    }
    box.append(tone);
    if (id === 'LAB') {
      // the lab router sits in the same rack: Gi0/0 is cabled to SW-LAB Gi1/0/24
      const rc = h('div', 'swcard');
      const subs = [...LABR.subs.values()].filter(x => x.vlan !== null);
      rc.append(
        h(
          'div',
          'uplink',
          `<b>R-LAB</b> (ISR 4321) · Gi0/0 ${LABR.phys.shut ? '<b>shutdown</b>' : 'LED hijau'} → kabel ke SW-LAB Gi1/0/24 · ${subs.length ? `subinterface: ${subs.map(x => `Gi0/0.${x.name.split('.')[1]} (VLAN ${x.vlan})`).join(', ')}` : 'belum ada subinterface'}`,
        ),
      );
      const rr = h('div', 'row left');
      rr.append(btn('Colok console ke R-LAB', () => this.openLabRouter(), 'btn', 'console-R-LAB'));
      rc.append(rr);
      box.append(rc);
    }
    const rw = h('div', 'row');
    rw.append(btn('Tutup [Esc]', () => this.closeModal()));
    box.append(rw);
    this.show(box);
  }
  /** console session to the practice-lab router R-LAB (router-on-a-stick, ACL) */
  openLabRouter() {
    if (!this.inv.console || !this.inv.laptop) {
      this.toast('Butuh laptop dan kabel console dari lemari alat.', 4200);
      return;
    }
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', 'Laptop → console R-LAB (router lab praktik)'));
    const sh = new LabRouterShell();
    this.term = new Term(sh, 'COM3 - PuTTY · Console R-LAB (9600 8N1)');
    sh.onCmd = line => {
      this.logAll(`R-LAB: ${line.slice(0, 60)}`);
      this.check(false);
    };
    box.append(this.term.root);
    const rw = h('div', 'row');
    rw.append(
      btn(
        'Cabut console',
        () => {
          this.term = null;
          this.openRack('LAB');
        },
        'btn',
        'console-close',
      ),
    );
    box.append(rw);
    this.show(box, false);
    const tm = this.term;
    setTimeout(() => tm.focus(), 80);
  }
  protected logProbe(sw: Switch, n: number, v: number) {
    if (v >= 0.5) this.logAll(`${sw.name.replace('SW-', 'PP-')}: probe toner berbunyi keras di port ${n}`);
  }
  protected renderSel(sw: Switch, info: HTMLElement, acts: HTMLElement, id: string) {
    info.innerHTML = '';
    acts.innerHTML = '';
    const S = this.sel;
    if (!S || S.sw !== sw.name) return;
    if (S.pp) {
      const q = sw.panel[S.pp - 1];
      info.innerHTML = `<b>PP-${q.n}</b> · ${q.patch ? `patch cord → <b>${portName(q.patch)}</b> (${esc(sw.ports[q.patch - 1].desc || 'tanpa deskripsi')})` : q.hang ? 'patch cord <b>tergantung</b>, ujung switch-nya tidak tercolok' : 'belum ada patch cord'}${q.patch ? '' : ' · klik port switch tujuan untuk memasang patch cord'}`;
      if (q.patch)
        acts.append(
          btn(
            'Cabut patch cord dari switch',
            () => {
              const from = q.patch!;
              patchCord(sw, q.n, null);
              this.logAll(`${sw.name.replace('SW-', 'PP-')}: patch cord PP-${q.n} dicabut dari ${portName(from)}`);
              this.check(false);
              this.openRack(id);
            },
            'btn',
            'pp-unplug',
          ),
        );
    } else if (S.swp) {
      const p = sw.ports[S.swp - 1];
      const from = sw.panel.find(x => x.patch === p.n);
      const loop = sw.loop?.includes(p.n) ? sw.loop.find(x => x !== p.n)! : null;
      info.innerHTML = `<b>${portName(p.n)}</b> · ${esc(p.desc || 'tanpa deskripsi')} · ${loop ? `<b>kabel patch ke ${portName(loop)}</b>: port switch disambung ke port switch, bukan ke patch panel!` : from ? `patch cord dari PP-${from.n}` : 'kosong'}`;
      if (loop)
        acts.append(
          btn(
            'Cabut kabel ini',
            () => {
              sw.loop = null;
              this.inv.patch++;
              this.logAll(`${sw.name}: kabel loop ${portName(p.n)} ↔ ${portName(loop)} dicabut`);
              this.check(false);
              this.toast('Kabel loop dicabut. LED berhenti berkedip liar; badai broadcast berhenti.', 3500);
              this.openRack(id);
            },
            'btn pri',
            'loop-remove',
          ),
        );
    }
  }
  protected clickSwitchPort(sw: Switch, n: number, id: string) {
    const S = this.sel;
    if (S?.sw === sw.name && S.pp && !sw.panel[S.pp - 1].patch) {
      const q = sw.panel[S.pp - 1];
      if (!q.hang && this.inv.patch < 1) {
        this.toast('Kamu tidak membawa patch cord. Ambil di Lemari Alat (Workshop TKJ).', 3500);
        return;
      }
      const hadHang = q.hang;
      const err = patchCord(sw, q.n, n);
      if (err) {
        this.toast(err, 3000);
        this.sel = { sw: sw.name, swp: n };
        this.openRack(id);
        return;
      }
      if (!hadHang) this.inv.patch--;
      this.logAll(`${sw.name.replace('SW-', 'PP-')}: patch cord PP-${q.n} → ${portName(n)}`);
      this.check(false);
      this.sel = { sw: sw.name, swp: n };
      this.openRack(id);
      return;
    }
    this.sel = { sw: sw.name, swp: n };
    this.openRack(id);
  }
  openConsole(sw: Switch, rackId = sw.rack) {
    if (!this.inv.console || !this.inv.laptop) {
      this.toast(
        `Butuh ${!this.inv.laptop ? 'laptop teknisi' : ''}${!this.inv.laptop && !this.inv.console ? ' dan ' : ''}${!this.inv.console ? 'kabel console' : ''}. Ambil di Lemari Alat (Workshop TKJ).`,
        4200,
      );
      return;
    }
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', `Laptop teknisi → console ${sw.name}`));
    this.cli = new SwitchCli(sw, (line, s) => {
      for (const j of this.openJobs())
        if (j.sw === s.name || j.faults.some(f => f === 'port' || f === 'vlan' || f === 'uplink' || f === 'loop')) j.swTouched = true;
      this.logAll(`${s.name}: ${line}`);
      this.check(false);
    });
    box.append(this.cli.root);
    const rw = h('div', 'row');
    rw.append(
      btn(
        'Cabut console',
        () => {
          this.cli = null;
          this.openRack(rackId);
        },
        'btn',
        'console-close',
      ),
    );
    box.append(rw);
    this.show(box, false);
    this.cli.focus();
  }
  // ---------------------------------------------------------------- Wi-Fi analyzer (technician phone)
  setAnalyzer(on: boolean) {
    if (on && !this.inv.analyzer) {
      this.toast('Ambil HP teknisi (Wi-Fi analyzer) di Lemari Alat dulu.', 3200);
      return;
    }
    this.analyzerOn = on;
    if (!on) {
      this.anaEl?.remove();
      this.anaEl = null;
      return;
    }
    if (!this.anaEl) {
      this.anaEl = h('div');
      this.anaEl.id = 'wifi-ana';
      document.body.append(this.anaEl);
    }
  }
  /** redraw with what the phone hears at the player's spot (hotel-local coords) */
  renderAnalyzer(lx: number, lz: number, y: number, level: number, where: string) {
    if (!this.analyzerOn || !this.anaEl) return;
    const list: Heard[] =
      level >= 4 || lx < -5 || lx > 35
        ? heardAt(lx, lz, y, Math.max(level, 1))
        : heardAt(lx, lz, y, level).filter(x => x.ap.ext || Math.abs(x.ap.level - level) <= 1);
    const cv = document.createElement('canvas');
    cv.width = 300;
    cv.height = 96;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#0d1418';
    g.fillRect(0, 0, 300, 96);
    const X = (ch: number) => 14 + (ch - 1) * 21.5,
      Y = (dbm: number) => 86 - Math.max(0, dbm + 95) * 1.35;
    g.strokeStyle = '#26343c';
    g.fillStyle = '#7b8d96';
    g.font = '9px monospace';
    for (let c = 1; c <= 13; c++) {
      g.beginPath();
      g.moveTo(X(c), 6);
      g.lineTo(X(c), 86);
      g.stroke();
      g.fillText(String(c), X(c) - 3, 95);
    }
    for (const d of [-90, -70, -50]) {
      g.fillText(String(d), 0, Y(d) + 3);
    }
    const cols = ['#4fc3f7', '#ffb74d', '#81c784', '#e57373', '#ba68c8', '#fff176', '#90a4ae', '#f06292'];
    list.slice(0, 8).forEach((x, i) => {
      g.strokeStyle = cols[i % cols.length];
      g.lineWidth = i === 0 ? 2.2 : 1.3;
      g.beginPath();
      for (let k = -2.2; k <= 2.2; k += 0.2) {
        const yy = Y(-95) - (Y(-95) - Y(x.rssi)) * (1 - (k / 2.2) ** 2);
        k === -2.2 ? g.moveTo(X(x.ap.ch + k), yy) : g.lineTo(X(x.ap.ch + k), yy);
      }
      g.stroke();
    });
    const rows = list
      .slice(0, 8)
      .map(
        (x, i) =>
          `<tr><td><i style="background:${cols[i % cols.length]}"></i>${x.ap.ssid}</td><td>${x.ap.ext ? x.ap.mac.slice(-8) : x.ap.id}</td><td>${x.ap.ch}</td><td>${x.rssi} dBm</td><td>${pctOf(x.rssi)}%</td></tr>`,
      )
      .join('');
    const top = list.find(x => !x.ap.ext);
    const clash = top ? list.filter(x => x !== top && overlap(x.ap.ch, top.ap.ch) && x.rssi >= -80) : [];
    this.anaEl.innerHTML = `<div class="ah">Wi-Fi Analyzer · ${esc(where)} <small>[R] tutup</small></div>`;
    this.anaEl.append(cv);
    this.anaEl.insertAdjacentHTML(
      'beforeend',
      `<table><tr><th>SSID</th><th>BSSID/AP</th><th>Ch</th><th>RSSI</th><th>%</th></tr>${rows || '<tr><td colspan=5>Tidak ada sinyal</td></tr>'}</table>` +
        (top
          ? `<div class="af">${clash.length ? `⚠ Kanal ${top.ap.ch}: tumpang tindih dengan ${clash.map(x => `${x.ap.ext ? x.ap.ssid : x.ap.id} (ch ${x.ap.ch}, ${x.rssi} dBm)`).join(', ')}` : `✓ Kanal ${top.ap.ch} bersih di titik ini`}</div>`
          : ''),
    );
  }
  /** QA hook: type into the open console. */
  consoleType(line: string) {
    this.cli?.type(line);
  }
  openEdge() {
    if (!this.inv.console || !this.inv.laptop) {
      this.toast('Butuh laptop teknisi dan kabel console. Ambil di Lemari Alat (Workshop TKJ).', 4200);
      return;
    }
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', 'Rak 1 · Router edge R-EDGE (C1111-4P)'));
    const led = (ok: boolean) => `<b style="color:${ok ? '#5c5' : '#e55'}">${ok ? 'hijau' : 'merah'}</b>`;
    const r = activeRoute();
    box.append(
      h(
        'p',
        'how',
        `ONT ISP1 NusaNet: PON ${led(true)} · LOS ${EDGE.isp[1].up ? '<b>mati</b>' : '<b style="color:#e55">merah berkedip</b>'} → Gi0/0 · Modem ISP2 CepatLink: ONLINE ${led(EDGE.isp[2].up)} → Gi0/1 · Gi0/2 → core (inside). Jalur aktif: <b>${r ? r.nh : 'tidak ada'}</b>. Laptop teknisi tersambung lewat kabel console.`,
      ),
    );
    const sh = new EdgeShell();
    this.term = new Term(sh, 'COM3 - PuTTY · Console R-EDGE (9600 8N1)');
    sh.onCmd = line => {
      for (const j of this.openJobs()) if (j.faults.some(f => EDGE_F.includes(f))) j.swTouched = true;
      this.logAll(`R-EDGE: ${line.slice(0, 60)}`);
      this.check(false);
    };
    box.append(this.term.root);
    const rw = h('div', 'row');
    rw.append(btn('Cabut console [Esc]', () => this.closeModal(), 'btn', 'edge-close'));
    box.append(rw);
    this.show(box, false);
    const tm = this.term;
    setTimeout(() => tm.focus(), 80);
  }
  openServer() {
    const box = h('div', 'noc-box wide');
    box.append(h('h2', '', `Rak 2 · Server Linux ${SRV.name} (${SRV.ip})`));
    box.append(
      h(
        'p',
        'how',
        `Ubuntu Server 24.04 · layanan: isc-dhcp-server (DHCP lab), bind9 (DNS lab.smk.local), apache2 (intranet), ssh. LED power <b>${SRV.power ? 'hijau' : 'mati'}</b> · LED LAN ens18 <b>${SRV.cable ? 'hijau berkedip' : 'mati'}</b>. Login console atau SSH dari PC: akun <b>${SRV.user}</b>, sandi <b>${SRV.pass}</b>.`,
      ),
    );
    const rw0 = h('div', 'row left');
    rw0.append(
      btn(
        'Cabut & colok ulang kabel LAN',
        () => {
          const was = SRV.cable;
          SRV.cable = true;
          linuxQa.sync();
          this.logAll(`${SRV.name}: kabel LAN ens18 dicolok ulang${was ? '' : ' (tadi lepas)'}`);
          this.check(false);
          this.openServer();
        },
        'btn',
        'srv-reseat',
      ),
    );
    box.append(rw0);
    const sh = new LinuxShell('console');
    this.term = new Term(sh, `KVM console · ${SRV.name} · tty1`);
    this.term.onLine = (line, sec) => {
      if (line && !sec && !/^(teknisi|root)$/.test(line)) this.logAll(`${SRV.name} (console): ${line.slice(0, 48)}`);
      this.check(false);
    };
    box.append(this.term.root);
    const rw = h('div', 'row');
    rw.append(btn('Tutup [Esc]', () => this.closeModal(), 'btn', 'srv-close'));
    box.append(rw);
    this.show(box, false);
    const tm = this.term;
    setTimeout(() => tm.focus(), 80); // later than the F key that opened it
  }
  /** QA hook: type into the open server/router console */
  termType(line: string) {
    this.term?.type(line);
  }
}
