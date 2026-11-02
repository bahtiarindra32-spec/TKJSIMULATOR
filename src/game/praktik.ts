// Lab Praktik TKJ (school lab building, src/world/labBuilding.ts). Separate from the Nusantara Tech internship:
// no work orders, tickets, SLA, XP or supervisor. A teacher composes a jobsheet at the teacher's desk and gets a
// 6-character code (src/game/lab.ts); a student enters the code + name, is given one desk, and works the steps in
// order. Each step has rubric checkpoints read live from netsim; the score is the share of checkpoints met.
// AI may only turn the teacher's sentence into form ticks; it never grades.
import { LAB_STEPS, LAB_AI_PROMPT, encodeLab, decodeLab, studentSeed, parseInstruction, type LabSpec, type LabStepId } from './lab';
import { judge } from './crimp';
import { ENVS, SWITCHES, adapterOf, bounce, live, linkUp, panelOf, portOf, portName, outletOf, repatch, type Switch } from '../pcos/net';
import { aiReady, chat } from '../ai/nusa';
import { ukkGrade, ukkCsv, isCore, type UkkStep } from './ukk';
import type { Noc } from './noc';
import type { PcOS } from '../pcos/os';

const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const btn = (txt: string, fn: () => void, cls = 'btn', name = '') => { const b = h('button', cls, txt) as HTMLButtonElement; b.onclick = fn; if (name) b.name = name; return b; };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const GW = '192.168.70.1', SRV = '192.168.70.10';
/** checkpoints per step (for steps never reached, so the score still counts them) */
const CHECKN: Record<LabStepId, number> = { crimp: 5, desk: 6, static: 6, dhcp: 5, vlan: 5, dns: 3, trouble: 3 };

type Fault = 'kabel' | 'port' | 'ip' | 'gw' | 'dns';
interface Params { desk: number; host: number; swPort: number; poolStart: number; dnsName: string; faults: Fault[] }
interface Check { label: string; ok: boolean }
interface StepRes { step: LabStepId; got: number; of: number; ms: number; done: boolean; checks: Check[] }
interface Run { spec: LabSpec; code: string; name: string; pc: string; label: string; P: Params; i: number; t0: number; st0: number; res: StepRes[]; ping: boolean; browse: string[]; best: Check[]; ready?: boolean }

const SHEET: Record<LabStepId, { tujuan: string; alat: string; k3: string; langkah: (P: Params, R: Run) => string[] }> = {
  crimp: { tujuan: 'Membuat kabel UTP straight-through standar T568B dan menyambungkan PC ke jaringan.', alat: 'Kabel UTP Cat6, 2 konektor RJ45, tang crimping, LAN tester (lemari alat & meja crimping).', k3: 'Potong dan kupas kabel menjauh dari badan. Sisa potongan kabel dibuang ke tempat sampah, bukan di lantai.',
    langkah: (_P, R) => ['Ambil LAN tester di lemari alat.', 'Di meja crimping: kupas jaket ±2 cm, urutkan kabel T568B (putih-oranye, oranye, putih-hijau, biru, putih-biru, hijau, putih-coklat, coklat), pin 1 di kiri dengan klip di bawah.', 'Potong rata, masukkan ke RJ45 sampai mentok, crimp. Ulangi ujung kedua.', 'Tes dengan LAN tester: lampu 1–8 harus menyala berurutan di kedua unit.', `Pasang kabel dari outlet ke PC di ${R.label} [C].`, 'Nyalakan PC, ipconfig, lalu ping 192.168.70.1.'] },
  desk: { tujuan: 'Menyambungkan outlet meja ke switch lewat patch panel sesuai standar pengkabelan terstruktur.', alat: 'Toner + probe, patch cord, kabel console + laptop, label.', k3: 'Jangan menarik kabel di rak. Rapikan patch cord, jangan menggantung di depan perangkat.',
    langkah: (P, R) => [`Outlet ${R.label} belum berlabel dan belum terhubung ke switch.`, 'Pasang toner di outlet meja [C], lalu sapu port patch panel di rak lab dengan probe.', `Patch port patch panel itu ke ${portName(P.swPort)} di SW-LAB.`, `Console SW-LAB: interface ${portName(P.swPort)} › switchport mode access › switchport access vlan 70 › no shutdown. Simpan: write memory.`, `Tempel label outlet ${outletOf(R.pc)} [C].`, 'Ping 192.168.70.1 dari PC.'] },
  static: { tujuan: 'Memberi alamat IPv4 statis sesuai tabel pengalamatan.', alat: 'PC meja praktik.', k3: 'Jangan mengubah pengaturan PC meja lain.',
    langkah: P => [`Network Connections › Ethernet › Properties › IPv4.`, `IP 192.168.70.${P.host} · subnet mask 255.255.255.0 · gateway ${GW} · DNS ${GW}.`, 'ipconfig untuk memeriksa, lalu ping 192.168.70.1.'] },
  dhcp: { tujuan: 'Mengaktifkan DHCP server di router lab dan memastikan klien mendapat alamat otomatis.', alat: 'PC meja praktik, browser.', k3: 'Catat pengaturan lama sebelum mengubah router.',
    langkah: P => ['DHCP server router lab mati, PC mendapat 169.254.x.x.', `Beri PC IP statis sementara (mis. 192.168.70.${P.poolStart - 5}/24) agar bisa membuka http://${GW}.`, `Login router › DHCP: aktifkan, pool 192.168.70.${P.poolStart} – 192.168.70.${P.poolStart + 49}, gateway ${GW}, DNS ${GW}.`, 'Kembalikan PC ke "Obtain an IP address automatically", ipconfig /renew.', 'Ping 192.168.70.1.'] },
  vlan: { tujuan: 'Membuat VLAN dan menempatkan port meja sebagai access port VLAN tersebut.', alat: 'Kabel console + laptop.', k3: 'Jangan mematikan port meja lain.',
    langkah: (P, R) => ['Switch lab baru di-reset: VLAN 70 belum ada.', `Console SW-LAB (rak lab): vlan 70 › name PRAKTIK.`, `interface ${portName(portOf(R.pc)?.port.n ?? P.desk)} › switchport mode access › switchport access vlan 70.`, 'show vlan brief untuk memeriksa, lalu write memory.', 'Di PC: ipconfig /renew, ping 192.168.70.1.'] },
  dns: { tujuan: 'Membuat record DNS lokal agar server bisa dibuka dengan nama.', alat: 'PC meja praktik, browser.', k3: 'Jangan menghapus record milik orang lain.',
    langkah: P => [`Login router lab (http://${GW}) › DNS: tambah record A ${P.dnsName} → ${SRV}.`, `Pastikan DNS PC ${GW} (otomatis dari DHCP sudah benar).`, `Buka http://${P.dnsName} di browser PC.`] },
  trouble: { tujuan: 'Menemukan dan memperbaiki gangguan jaringan pada PC meja praktik.', alat: 'LAN tester, kabel console + laptop, PC.', k3: 'Periksa fisik dulu, baru konfigurasi.',
    langkah: () => ['PC meja tidak bisa membuka server lab. Ada 2 penyebab.', 'Periksa lampu link dan kabel [C], ipconfig, ping gateway, nslookup.', 'Perbaiki tiap penyebab, lalu buka http://192.168.70.10 dari PC.'] },
};

export class Praktik {
  run: Run | null = null;
  last: { score: number; txt: string; predikat?: string; csv?: string } | null = null;
  private panel = h('div', 'jobsheet');
  private timer = 0;
  private collapsed = false;
  constructor(private noc: Noc, pcos: PcOS, private pcs: { name: string; label: string }[], private onBoard: (lines: string[]) => void = () => {}) {
    const prev = pcos.onEvent;
    pcos.onEvent = e => { prev?.(e); const R = this.run; if (!R || e.pc !== R.pc) return;
      if (e.type === 'ping' && e.detail?.ok && e.detail?.target === GW) R.ping = true;
      if (e.type === 'browse' && e.detail?.url) R.browse.push(String(e.detail.url));
      this.tick();
    };
    document.body.append(this.panel); this.panel.style.display = 'none';
  }
  sw(): Switch { return SWITCHES.find(s => s.name === 'SW-LAB')!; }

  // ---------------------------------------------------------------- teacher's desk
  openDesk() {
    const box = h('div', 'noc-box labdesk');
    box.append(h('h2', '', 'Meja Guru · Lab Praktik TKJ'));
    if (this.run) {
      box.append(h('p', '', `Praktik berjalan: <b>${esc(this.run.name)}</b> di ${esc(this.run.label)}, langkah ${this.run.i + 1}/${this.run.spec.steps.length}.`));
      const rw = h('div', 'row'); if (this.run.ready) rw.append(btn('Minta paraf guru', () => { const m = this.paraf(); if (this.run) { this.openDesk(); this.noc.toast(m, 4200); } }, 'btn pri', 'lab-paraf')); rw.append(btn('Lihat jobsheet', () => { this.collapsed = false; this.render(); this.noc.closeModal(); }, 'btn', 'lab-show')); rw.append(btn('Akhiri praktik sekarang', () => this.finish(true), 'btn', 'lab-stop')); rw.append(btn('Tutup [Esc]', () => this.noc.closeModal())); box.append(rw);
    } else {
      box.append(h('p', 'how', 'Guru menyusun jobsheet dan membagikan kodenya. Siswa memasukkan kode di sini, lalu mengerjakan langkahnya di meja yang ditunjuk. Penilaian dari rubrik simulator, bukan AI.'));
      const rw = h('div', 'row left'); rw.append(btn('Guru: susun jobsheet', () => this.openTeacher(), 'btn', 'lab-teacher')); rw.append(btn('Siswa: masukkan kode', () => this.openStudent(), 'btn pri', 'lab-student')); box.append(rw);
      if (this.last) box.append(h('p', 'msg', `Hasil terakhir: ${this.last.predikat ?? ""} nilai ${this.last.score}.`));
    }
    this.noc.present(box);
  }
  openTeacher(pre: Partial<LabSpec> = {}, msg = '', said = '') {
    const spec: LabSpec = { steps: pre.steps ?? ['crimp', 'desk', 'static'], minutes: pre.minutes ?? 60, perStudent: pre.perStudent ?? true, seed: pre.seed ?? Math.floor(Math.random() * 65536) };
    const box = h('div', 'noc-box labt');
    box.append(h('h2', '', 'Susun Jobsheet'));
    box.append(h('p', 'how', 'Centang langkah praktik. Siswa mengerjakannya berurutan di satu meja lab. Tiap langkah dinilai dari checkpoint simulator (mis. urutan kabel, port switch, IP, hasil ping).'));
    const ins = h('textarea', 'lab-ins') as HTMLTextAreaElement; ins.name = 'lab-ins'; ins.rows = 2; ins.value = said; ins.placeholder = 'Contoh: siswa crimping kabel sampai PC tersambung, lalu IP statis dan DHCP, 90 menit, soal beda tiap siswa';
    ins.addEventListener('keydown', e => e.stopPropagation());
    const ir = h('div', 'row left');
    ir.append(btn('Isi dari kalimat', () => this.openTeacher({ ...spec, ...parseInstruction(ins.value) }, 'Form diisi dari kata kunci. Periksa centangnya sebelum membagikan kode.', ins.value), 'btn', 'lab-parse'));
    if (aiReady()) ir.append(btn('Isi dengan AI', async () => {
      try {
        const raw = await chat([{ role: 'system', content: LAB_AI_PROMPT }, { role: 'user', content: ins.value }], { maxTokens: 120, temperature: 0, json: true });
        const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        const st = (Array.isArray(o.steps) ? o.steps : []) as string[];
        this.openTeacher({ ...spec, steps: LAB_STEPS.filter(x => st.includes(x.id)).map(x => x.id), minutes: Math.max(0, Math.min(150, +o.minutes || 0)), perStudent: !!o.perStudent }, '[AI] Form diisi AI dari kalimatmu. AI tidak menilai siswa; periksa centangnya.', ins.value);
      } catch { this.openTeacher({ ...spec, ...parseInstruction(ins.value) }, 'AI gagal dihubungi, form diisi dari kata kunci.', ins.value); }
    }, 'btn', 'lab-ai'));
    box.append(ins, ir);
    if (msg) box.append(h('p', 'msg', esc(msg)));
    const list = h('div', 'lab-steps');
    LAB_STEPS.forEach((st, i) => {
      const row = h('label', 'lab-step'); const cb = h('input') as HTMLInputElement; cb.type = 'checkbox'; cb.name = `lab-${st.id}`; cb.checked = spec.steps.includes(st.id);
      cb.addEventListener('change', () => { spec.steps = LAB_STEPS.filter(x => (x.id === st.id ? cb.checked : spec.steps.includes(x.id))).map(x => x.id); upd(); });
      row.append(cb, h('span', '', `<b>${i + 1}. ${st.name}</b><small>${st.cp}</small>`)); list.append(row);
    });
    box.append(list);
    const opt = h('div', 'row left');
    const tm = h('select', '') as HTMLSelectElement; tm.name = 'lab-min';
    const mins = [0, 30, 60, 90, 120, 150], cur = Math.min(150, Math.round(spec.minutes / 10) * 10);
    for (const m of [...new Set([...mins, cur])].sort((a, b) => a - b)) { const o = h('option', '', m ? `${m} menit` : 'tanpa batas waktu') as HTMLOptionElement; o.value = String(m); o.selected = m === cur; tm.append(o); }
    tm.addEventListener('change', () => { spec.minutes = +tm.value; upd(); });
    const ps = h('label', 'lab-chk'); const pc = h('input') as HTMLInputElement; pc.type = 'checkbox'; pc.name = 'lab-per'; pc.checked = spec.perStudent; pc.addEventListener('change', () => { spec.perStudent = pc.checked; upd(); });
    ps.append(pc, h('span', '', 'Soal & meja beda tiap siswa (dari nama)'));
    opt.append(h('span', '', 'Waktu'), tm, ps); box.append(opt);
    const res = h('div', 'lab-code'); box.append(res);
    const upd = () => {
      if (!spec.steps.length) { res.innerHTML = '<p class="msg warn">Centang minimal satu langkah.</p>'; return; }
      const code = encodeLab(spec), url = `${location.origin}${location.pathname}?lab=${code}`;
      res.innerHTML = `<small>KODE JOBSHEET</small><b class="mono" data-code="${code}">${code}</b><span>Siswa datang ke Lab Praktik TKJ (halaman SMK Nusantara, Jl. Dahlia) › Meja Guru › masukkan kode. Atau buka <span class="mono">${esc(url)}</span>. Kode menyimpan seluruh jobsheet; tidak ada server.</span>`;
      res.append(btn('Salin kode & tautan', () => { void navigator.clipboard?.writeText(`Kode jobsheet Lab Praktik TKJ: ${code}\n${url}`).catch(() => {}); this.noc.toast('Kode & tautan disalin.'); }, 'btn', 'lab-copy'));
    };
    upd();
    const rw = h('div', 'row'); rw.append(btn('Coba sebagai siswa', () => this.openStudent(encodeLab(spec)), 'btn', 'lab-try')); rw.append(btn('Kembali', () => this.openDesk())); box.append(rw);
    this.noc.present(box);
  }
  openStudent(code = '', msg = '') {
    const box = h('div', 'noc-box labs');
    box.append(h('h2', '', 'Mulai Praktik'));
    const ci = h('input', 'mono') as HTMLInputElement; ci.name = 'lab-code'; ci.maxLength = 7; ci.placeholder = 'KODE6'; ci.value = code;
    const ni = h('input') as HTMLInputElement; ni.name = 'lab-name'; ni.maxLength = 40; ni.placeholder = 'Nama lengkap · kelas';
    for (const x of [ci, ni]) x.addEventListener('keydown', e => e.stopPropagation());
    const f = h('div', 'lab-form'); f.append(h('label', '', 'Kode dari guru'), ci, h('label', '', 'Nama'), ni); box.append(f);
    if (msg) box.append(h('p', 'msg warn', esc(msg)));
    const pv = h('div', 'lab-prev'); box.append(pv);
    const prev = () => { const sp = decodeLab(ci.value); pv.innerHTML = sp ? `<ol>${sp.steps.map(id => `<li>${LAB_STEPS.find(x => x.id === id)!.name}</li>`).join('')}</ol><small>${sp.minutes ? `Batas waktu ${sp.minutes} menit` : 'Tanpa batas waktu'}${sp.perStudent ? ' · soal & meja tiap siswa berbeda' : ''}</small>` : ci.value.trim().length >= 6 ? '<p class="msg warn">Kode tidak dikenali. Cek lagi huruf dan angkanya.</p>' : ''; };
    ci.addEventListener('input', prev); prev();
    const rw = h('div', 'row');
    rw.append(btn('Mulai praktik', () => {
      const sp = decodeLab(ci.value);
      if (!sp) { this.openStudent(ci.value, 'Kode tidak dikenali.'); return; }
      if (ni.value.trim().length < 3) { this.openStudent(ci.value, 'Tulis nama lengkapmu (dipakai di lembar hasil).'); return; }
      this.start(sp, ci.value.trim().toUpperCase(), ni.value.trim());
    }, 'btn pri', 'lab-start'));
    rw.append(btn('Kembali', () => this.openDesk())); box.append(rw);
    this.noc.present(box);
  }

  // ---------------------------------------------------------------- run
  start(spec: LabSpec, code: string, name: string) {
    const seed = studentSeed(spec, name), r = rng(seed);
    const desk = Math.floor(r() * this.pcs.length) + 1;
    const pool: Fault[] = ['kabel', 'port', 'ip', 'gw', 'dns'];
    const f1 = pool[Math.floor(r() * pool.length)]; const rest = pool.filter(x => x !== f1 && !(f1 === 'ip' && x === 'gw') && !(f1 === 'gw' && x === 'ip'));
    const P: Params = { desk, host: 20 + Math.floor(r() * 30), swPort: 13 + Math.floor(r() * 8), poolStart: 100 + 10 * Math.floor(r() * 4), dnsName: `${['server', 'jobsheet', 'elearning', 'ujian'][Math.floor(r() * 4)]}.praktik.lan`, faults: [f1, rest[Math.floor(r() * rest.length)]] };
    const pc = this.pcs[desk - 1];
    this.reset();
    this.run = { spec, code, name, pc: pc.name, label: `Meja ${desk}`, P, i: 0, t0: performance.now(), st0: performance.now(), res: [], ping: false, browse: [], best: [] };
    this.setup();
    this.noc.closeModal(); this.collapsed = false;
    this.noc.toast(`Praktik dimulai. Kamu di Meja ${desk}. Ikuti langkah di lembar jobsheet.`, 4200);
    clearInterval(this.timer); this.timer = window.setInterval(() => this.tick(), 700);
    this.render(); this.board();
  }
  /** the lab as the technician left it last night: every desk patched, DHCP on, VLAN 70, no records */
  reset() {
    const sw = this.sw(); const env = ENVS.prak;
    sw.vlans = new Map([[1, 'default'], [70, 'PRAKTIK']]); sw.dirty = false; sw.loop = null; sw.stpOff = false;
    sw.ports.forEach(p => { p.vlan = 70; p.shutdown = p.n > this.pcs.length; p.desc = p.n <= this.pcs.length ? `MEJA-${p.n}` : ''; });
    sw.panel.forEach((pp, i) => { pp.patch = pp.pc ? i + 1 : null; pp.hang = false; pp.label = pp.pc ? outletOf(pp.pc) || pp.label : ''; });
    sw.panel.forEach(pp => { if (pp.pc) pp.label = `LAB-${String(pp.n).padStart(2, '0')}`; });
    repatch(sw);
    env.dhcp = { start: '192.168.70.100', end: '192.168.70.150', gw: GW, dns: [GW], lease: 8 }; env.dnsSrv.records = []; env.leases.clear();
    for (const p of this.pcs) { this.noc.labSetCord(p.name, true); const a = adapterOf(p.name); Object.assign(a, { dhcp: true, dnsAuto: true, ip: '', mask: '', gw: '', dns1: '', dns2: '', broken: false, enabled: true, cable: true }); bounce(a); }
  }
  private setup() {
    const R = this.run!, P = R.P, id = R.spec.steps[R.i], a = adapterOf(R.pc), sw = this.sw(), q = panelOf(R.pc)!;
    R.ping = false; R.browse = []; R.st0 = performance.now(); R.best = [];
    if (id === 'crimp') this.noc.labSetCord(R.pc, false);
    if (id === 'desk') { q.pp.patch = null; q.pp.label = ''; const p = sw.ports[P.swPort - 1]; p.shutdown = true; p.vlan = 1; p.desc = ''; repatch(sw); bounce(a); }
    if (id === 'static') { a.dhcp = true; a.dnsAuto = true; bounce(a); }
    if (id === 'dhcp') { ENVS.prak.dhcp = null; ENVS.prak.leases.clear(); a.dhcp = true; a.dnsAuto = true; bounce(a); }
    if (id === 'vlan') { sw.vlans.delete(70); const p = portOf(R.pc)?.port; if (p) p.vlan = 1; sw.dirty = false; bounce(a); }
    if (id === 'dns') ENVS.prak.dnsSrv.records = ENVS.prak.dnsSrv.records.filter(r => r.name !== P.dnsName);
    if (id === 'trouble') for (const f of P.faults) {
      if (f === 'kabel') { a.cable = false; }
      if (f === 'port') { const p = portOf(R.pc)?.port; if (p) p.shutdown = true; }
      if (f === 'ip') { Object.assign(a, { dhcp: false, ip: `192.168.17.${P.host}`, mask: '255.255.255.0', gw: GW, dnsAuto: false, dns1: GW, dns2: '' }); }
      if (f === 'gw') { Object.assign(a, { dhcp: false, ip: `192.168.70.${P.host}`, mask: '255.255.255.0', gw: '192.168.70.254', dnsAuto: false, dns1: GW, dns2: '' }); }
      if (f === 'dns') { if (a.dhcp) { a.dnsAuto = false; a.dns1 = '192.168.70.99'; a.dns2 = ''; } else a.dns1 = '192.168.70.99'; }
    }
    if (id === 'trouble') bounce(a);
  }
  /** rubric checkpoints of the current step, read from netsim */
  checks(): Check[] {
    const R = this.run!, P = R.P, id = R.spec.steps[R.i], a = adapterOf(R.pc), L = live(a), sw = this.sw(), q = panelOf(R.pc)!;
    const port = portOf(R.pc)?.port, inNet = /^192\.168\.70\.\d+$/.test(L.ip) && L.ok;
    const ping: Check = { label: 'Uji dari PC: ping 192.168.70.1 berhasil', ok: R.ping && linkUp(a) && inNet };
    if (id === 'crimp') { const c = this.noc.labCord(R.pc), j = c.crafted ? judge(c.crafted) : null;
      return [{ label: 'Kabel buatan sendiri terpasang di meja', ok: c.present && !!c.crafted }, { label: 'Urutan T568B di kedua ujung', ok: !!j?.standard }, { label: 'Kabel dites dengan LAN tester', ok: !!c.crafted?.tested }, { label: 'Lampu link NIC menyala', ok: linkUp(a) }, ping]; }
    if (id === 'desk') { const p = sw.ports[P.swPort - 1];
      return [{ label: `Patch panel outlet meja → ${portName(P.swPort)}`, ok: q.pp.patch === P.swPort }, { label: `${portName(P.swPort)} no shutdown`, ok: !p.shutdown }, { label: `${portName(P.swPort)} access VLAN 70`, ok: p.vlan === 70 }, { label: `Label outlet ${outletOf(R.pc)}`, ok: q.pp.label === outletOf(R.pc) }, { label: 'Konfigurasi switch disimpan (write memory)', ok: !sw.dirty && !p.shutdown && p.vlan === 70 }, ping]; }
    if (id === 'static') return [{ label: 'IPv4 statis (bukan DHCP)', ok: !a.dhcp }, { label: `IP 192.168.70.${P.host}`, ok: a.ip === `192.168.70.${P.host}` }, { label: 'Subnet mask 255.255.255.0', ok: a.mask === '255.255.255.0' }, { label: `Gateway ${GW}`, ok: a.gw === GW }, { label: `DNS ${GW}`, ok: !a.dnsAuto && a.dns1 === GW }, ping];
    if (id === 'dhcp') { const d = ENVS.prak.dhcp;
      return [{ label: 'DHCP server router aktif', ok: !!d }, { label: `Pool 192.168.70.${P.poolStart} – .${P.poolStart + 49}`, ok: !!d && d.start === `192.168.70.${P.poolStart}` && d.end === `192.168.70.${P.poolStart + 49}` }, { label: `Gateway & DNS di DHCP = ${GW}`, ok: !!d && d.gw === GW && d.dns[0] === GW }, { label: 'PC kembali ke DHCP dan dapat IP dari pool', ok: a.dhcp && inNet && +L.ip.split('.')[3] >= P.poolStart && +L.ip.split('.')[3] <= P.poolStart + 49 }, ping]; }
    if (id === 'vlan') return [{ label: 'VLAN 70 dibuat', ok: sw.vlans.has(70) }, { label: 'Nama VLAN 70 = PRAKTIK', ok: sw.vlans.get(70) === 'PRAKTIK' }, { label: 'Port meja access VLAN 70', ok: port?.vlan === 70 }, { label: 'Konfigurasi switch disimpan (write memory)', ok: !sw.dirty && sw.vlans.has(70) && port?.vlan === 70 }, ping];
    if (id === 'dns') { const rec = ENVS.prak.dnsSrv.records.find(r => r.name === P.dnsName);
      return [{ label: `Record A ${P.dnsName} → ${SRV}`, ok: rec?.ip === SRV }, { label: `DNS PC ${GW}`, ok: L.dns.includes(GW) }, { label: `http://${P.dnsName} terbuka di browser PC`, ok: !!rec && rec.ip === SRV && L.dns.includes(GW) && R.browse.some(u => u.includes(P.dnsName)) }]; }
    const fx: Check[] = P.faults.map(f => f === 'kabel' ? { label: 'Gangguan fisik di meja diperbaiki', ok: a.cable } : f === 'port' ? { label: 'Port switch meja aktif lagi', ok: !port?.shutdown } : f === 'ip' ? { label: 'Alamat IP kembali di jaringan 192.168.70.0/24', ok: inNet } : f === 'gw' ? { label: `Gateway kembali ${GW}`, ok: L.gw === GW } : { label: `DNS kembali ${GW}`, ok: L.dns.includes(GW) });
    return [...fx, { label: 'Uji: http://192.168.70.10 terbuka dari PC', ok: fx.every(c => c.ok) && R.browse.some(u => u.includes(SRV)) }];
  }
  tick() {
    const R = this.run; if (!R) return;
    const cs = this.checks();
    // a checkpoint counts once it was met at the same time as the others of the step (the final state is graded)
    R.best = cs;
    const ok = cs.every(c => c.ok);
    // like a school jobsheet: a finished step waits for the teacher's initials (paraf) at the teacher desk
    if (ok && !R.ready) this.noc.toast('Semua checkpoint langkah ini terpenuhi. Minta paraf guru di meja guru.', 4200);
    R.ready = ok;
    this.render();
  }
  /** Teacher initials the current step at the desk: re-checks live state, then moves on. */
  paraf(): string {
    const R = this.run; if (!R) return 'Tidak ada praktik berjalan.';
    const cs = this.checks();
    if (!cs.every(c => c.ok)) { R.ready = false; this.render(); return `Belum bisa diparaf: ${cs.filter(c => !c.ok).map(c => c.label).join('; ')}.`; }
    R.res.push({ step: R.spec.steps[R.i], got: cs.length, of: cs.length, ms: performance.now() - R.st0, done: true, checks: cs });
    R.i++; R.ready = false;
    if (R.i >= R.spec.steps.length) { this.finish(false); return 'Semua langkah sudah diparaf.'; }
    this.noc.toast(`Langkah ${R.i} diparaf guru. Berikutnya: ${LAB_STEPS.find(x => x.id === R.spec.steps[R.i])!.name}.`, 4200);
    this.setup(); this.board(); this.render();
    return `Langkah ${R.i} diparaf.`;
  }
  finish(early: boolean) {
    const R = this.run; if (!R) return;
    if (early) { const cs = this.checks(); R.res.push({ step: R.spec.steps[R.i], got: cs.filter(c => c.ok).length, of: cs.length, ms: performance.now() - R.st0, done: false, checks: cs }); for (let k = R.i + 1; k < R.spec.steps.length; k++) R.res.push({ step: R.spec.steps[k], got: 0, of: CHECKN[R.spec.steps[k]], ms: 0, done: false, checks: [] }); }
    this.run = null; clearInterval(this.timer); this.panel.style.display = 'none'; this.board();
    const total = performance.now() - R.t0, over = R.spec.minutes > 0 && total > R.spec.minutes * 60000;
    const got = R.res.reduce((s, r) => s + r.got, 0), of = R.res.reduce((s, r) => s + r.of, 0);
    const steps: UkkStep[] = R.res.map(r => ({ name: LAB_STEPS.find(x => x.id === r.step)!.name, checks: r.checks, ms: r.ms, done: r.done }));
    const G = ukkGrade(steps, total, R.spec.minutes), score = G.nilai;
    const mm = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    const when = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const box = h('div', 'noc-box paper labres');
    box.append(h('div', 'pp-head', `<div><b>LAB PRAKTIK TKJ · SMK NUSANTARA</b><small>Lembar hasil jobsheet</small></div><div class="pp-no"><small>KODE</small><b>${esc(R.code)}</b></div>`));
    box.append(h('table', 'pp-fields', `<tr><th>Nama</th><td>${esc(R.name)}</td><th>Meja</th><td class="mono">${R.P.desk}</td></tr><tr><th>Tanggal</th><td class="mono">${esc(when)}</td><th>Durasi</th><td class="mono">${mm(total)}${R.spec.minutes ? ` / ${R.spec.minutes}:00` : ''}${over ? ' · LEWAT' : ''}</td></tr><tr><th>Elemen utama</th><td class="mono">${G.coreOk}/${G.coreOf}</td><th>Pendukung</th><td class="mono">${G.supOk}/${G.supOf}</td></tr><tr><th>Predikat</th><td><b>${G.predikat}</b></td><th>Nilai</th><td class="mono"><b>${score}</b></td></tr>`));
    box.append(h('table', 'lab-tab', `<tr><th>Langkah</th><th>Checkpoint</th><th>Waktu</th><th>Status</th></tr>${R.res.map(r => `<tr><td>${LAB_STEPS.find(x => x.id === r.step)!.name}${r.checks.filter(c => !c.ok).length ? `<small>${r.checks.filter(c => !c.ok).map(c => '✗ ' + esc(c.label) + (isCore(c.label) ? ' · utama' : ' · pendukung')).join('<br>')}</small>` : ''}</td><td class="mono">${r.got}/${r.of}</td><td class="mono">${r.ms ? mm(r.ms) : '-'}</td><td>${r.done ? 'Tuntas' : r.checks.length ? 'Belum tuntas' : 'Tidak dikerjakan'}</td></tr>`).join('')}`));
    box.append(h('p', 'how', 'Format mengikuti lembar penilaian UKK: kriteria utama (jaringan berfungsi & teruji) dan pendukung (label, nama VLAN, simpan konfigurasi). Ada kriteria utama yang gagal = Belum Kompeten. Posisi nilai di dalam rentang predikat memakai aturan simulator (porsi pendukung, efisiensi waktu); guru tetap berhak mengoreksi. Semua kriteria dibaca dari simulator jaringan, tidak dinilai AI. Tanpa server, lembar ini bisa dipalsukan; guru sebaiknya melihat langsung.'));
    const txt = `Lab Praktik TKJ ${R.code} · ${R.name} · Meja ${R.P.desk} · ${when}\n${G.predikat} · nilai ${score} (utama ${G.coreOk}/${G.coreOf}, pendukung ${G.supOk}/${G.supOf}) · durasi ${mm(total)}${over ? ' (lewat batas)' : ''}\n${R.res.map(r => `- ${LAB_STEPS.find(x => x.id === r.step)!.name}: ${r.checks.length ? `${r.got}/${r.of}` : `tidak dikerjakan (0/${r.of})`}${r.done ? `, ${mm(r.ms)}` : ''}`).join('\n')}`;
    const csv = ukkCsv({ kode: R.code, nama: R.name, meja: R.P.desk, tanggal: when, durasi: mm(total) }, steps, G);
    this.last = { score, txt, predikat: G.predikat, csv };
    const rw = h('div', 'row'); rw.append(btn('Salin hasil', () => { void navigator.clipboard?.writeText(txt).catch(() => {}); this.noc.toast('Hasil disalin.'); }, 'btn', 'lab-copyres')); rw.append(btn('Unduh CSV', () => this.download(csv, `praktik-${R.code}-${R.name.replace(/[^\w]+/g, '_')}.csv`), 'btn', 'lab-csv'));
    rw.append(btn('Cetak A4', () => this.print(box, R.name), 'btn', 'lab-print'));
    rw.append(btn('Tutup', () => this.noc.closeModal(), 'btn pri', 'lab-done'));
    box.append(rw);
    this.noc.present(box);
  }

  private download(text: string, name: string) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /** A4 sheet with signature boxes for the assessor and the student, printed from a hidden frame (works offline) */
  private print(box: HTMLElement, name: string) {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.append(f);
    const d = f.contentDocument!; const body = box.cloneNode(true) as HTMLElement; body.querySelectorAll('.row, button').forEach(e => e.remove());
    d.open(); d.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Lembar hasil praktik · ${esc(name)}</title><style>@page{size:A4;margin:16mm}body{font:11pt/1.4 system-ui,Arial,sans-serif;color:#000}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #444;padding:4px 6px;text-align:left;vertical-align:top}small{display:block;color:#333}.pp-head{display:flex;justify-content:space-between;border-bottom:2px solid #000;margin-bottom:8px}.how{font-size:9pt;color:#333}.sig{display:flex;gap:24px;margin-top:28px}.sig div{flex:1;border-top:1px solid #000;padding-top:4px;text-align:center;margin-top:56px}</style></head><body>${body.innerHTML}<div class="sig"><div>Peserta</div><div>Penilai / Guru</div></div></body></html>`);
    d.close(); setTimeout(() => { f.contentWindow?.print(); setTimeout(() => f.remove(), 1000); }, 200);
  }

  // ---------------------------------------------------------------- jobsheet panel + whiteboard
  private render() {
    const R = this.run; if (!R) { this.panel.style.display = 'none'; return; }
    const id = R.spec.steps[R.i], S = SHEET[id], cs = R.best.length ? R.best : this.checks();
    const el = performance.now() - R.t0, mm = `${Math.floor(el / 60000)}:${String(Math.floor(el / 1000) % 60).padStart(2, '0')}`;
    this.panel.style.display = '';
    this.panel.classList.toggle('min', this.collapsed);
    this.panel.innerHTML = `<div class="js-h"><b>JOBSHEET</b><span class="mono">${esc(R.code)} · ${esc(R.label)} · ${mm}${R.spec.minutes ? ` / ${R.spec.minutes}:00` : ''}</span><button class="js-t" name="js-toggle">${this.collapsed ? 'Buka' : 'Kecilkan'}</button></div>
      <div class="js-b"><div class="js-step">Langkah ${R.i + 1}/${R.spec.steps.length} · <b>${LAB_STEPS.find(x => x.id === id)!.name}</b>${R.ready ? '<br><b>Tuntas · minta paraf guru di meja guru [F]</b>' : ''}</div>
      <ul class="js-c">${cs.map(c => `<li class="${c.ok ? 'ok' : ''}"><i></i>${esc(c.label)}</li>`).join('')}</ul>
      <dl><dt>Tujuan</dt><dd>${S.tujuan}</dd><dt>Alat &amp; bahan</dt><dd>${S.alat}</dd><dt>K3</dt><dd>${S.k3}</dd></dl>
      <div class="js-lt">Langkah kerja</div><ol class="js-l">${S.langkah(R.P, R).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
    (this.panel.querySelector('.js-t') as HTMLButtonElement).onclick = () => { this.collapsed = !this.collapsed; this.render(); };
  }
  private board() {
    const R = this.run;
    this.onBoard(R ? [`JOBSHEET ${R.code}`, `${R.name} · Meja ${R.P.desk}`, ...R.spec.steps.map((s, i) => `${i < R.i ? '✓' : i === R.i ? '▶' : '·'} ${i + 1}. ${LAB_STEPS.find(x => x.id === s)!.name}`)] : ['LAB PRAKTIK TKJ', 'Meja guru: susun jobsheet atau masukkan kode', this.last ? `Hasil terakhir: nilai ${this.last.score}` : '']);
  }
  /** for QA and the HUD */
  /** one line for the PC screen: which jobsheet step, and what is still open on its rubric */
  objective(): string {
    const R = this.run; if (!R) return '';
    const s = R.spec.steps[R.i]; if (!s) return '';
    if (R.ready) return `Langkah ${R.i + 1}/${R.spec.steps.length} selesai · minta paraf di meja guru`;
    const c = this.checks(), n = c.filter(x => x.ok).length;
    return `Langkah ${R.i + 1}/${R.spec.steps.length} · ${LAB_STEPS.find(x => x.id === s)!.name} · checkpoint ${n}/${c.length}`;
  }
  state() { const R = this.run; return R && { step: R.spec.steps[R.i], i: R.i, pc: R.pc, desk: R.P.desk, P: R.P, checks: this.checks(), ready: !!R.ready }; }
}
