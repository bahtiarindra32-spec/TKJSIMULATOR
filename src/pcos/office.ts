// Office devices on L2/L3 (VLAN 20 kantor): network printers, IP desk phones with a voice VLAN, and the NAS.
// Each one lives in the same network simulation as the PCs: a printer is a host whose IP the player sets on
// its front panel, a phone registers only when its switch port gives it PoE and the voice VLAN, and the NAS
// shares folders over SMB that a PC maps with "net use". Every fault closes only after a real test.
import { ENVS, SWITCHES, envOf, adapterOf, ping, resolve, portOf, uplinkCarries, parseIp, type Host } from './net';
import { EXT, DEVICES } from './ext';
import { SITES, CMD_EXT, DESK_EXT, type PcOS } from './os';

const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const btn = (txt: string, fn: () => void, name = '', cls = 'btn') => { const b = h('button', cls, txt) as HTMLButtonElement; b.onclick = fn; if (name) b.name = name; return b; };
const office = () => ENVS.office;
interface UiHooks { show: (el: HTMLElement) => void; close: () => void; ext: (e: { type: string; pc: string; detail: any }) => void; log: (s: string) => void; toast: (s: string, ms?: number) => void }
let UI: UiHooks = { show: () => {}, close: () => {}, ext: () => {}, log: () => {}, toast: () => {} };

// ---------------------------------------------------------------- printers
export interface Printer { id: string; level: number; want: string; ip: string; mask: string; gw: string; cable: boolean; host: Host; pages: number }
export const PRINTERS: Printer[] = [];
const ADDED = new Map<string, Set<string>>();     // printers each PC has installed (by IP, "Standard TCP/IP port")
const syncPrinter = (p: Printer) => { p.host.ip = p.ip; p.host.down = !p.cable || p.mask !== '255.255.255.0' || p.gw !== office().gateway; };
function printerPanel(p: Printer) {
  const box = h('div', 'noc-box');
  box.append(h('h2', '', `Panel depan printer ${p.id} · Lantai ${p.level}`));
  box.append(h('p', 'how', `Layar printer: <b>${p.cable ? 'Siap' : 'Kabel jaringan tidak terhubung'}</b> · LED jaringan <b>${p.cable ? 'hijau' : 'mati'}</b>. Menu Jaringan › TCP/IPv4 (manual).`));
  const f = h('div', 'row left');
  const inp = (n: string, v: string) => { const i = h('input', 'lbl-in') as HTMLInputElement; i.name = n; i.value = v; i.style.width = '130px'; i.addEventListener('keydown', e => e.stopPropagation()); return i; };
  const ip = inp('prn-ip', p.ip), mk = inp('prn-mask', p.mask), gw = inp('prn-gw', p.gw);
  f.append(h('span', '', 'IP'), ip, h('span', '', 'Mask'), mk, h('span', '', 'Gateway'), gw);
  const out = h('div', 'tester-out');
  const acts = h('div', 'row left');
  acts.append(btn('Simpan IP', () => {
    if ([ip.value, mk.value, gw.value].some(v => parseIp(v.trim()) === null)) { out.innerHTML = '<p class="msg warn">Alamat tidak valid.</p>'; return; }
    p.ip = ip.value.trim(); p.mask = mk.value.trim(); p.gw = gw.value.trim(); syncPrinter(p);
    UI.log(`${p.id}: IP printer diatur ${p.ip} / ${p.mask} gw ${p.gw}`); printerPanel(p);
  }, 'prn-save'));
  acts.append(btn('Cetak halaman konfigurasi', () => { out.innerHTML = `<pre class="msg">NETWORK CONFIGURATION PAGE · ${p.id}\nIPv4 Address : ${p.ip}\nSubnet Mask  : ${p.mask}\nGateway      : ${p.gw}\nConfig By    : Manual\nLink         : ${p.cable ? '1000 Mbps Full' : 'DOWN'}\nRAW port 9100: enabled</pre>`; UI.log(`${p.id}: halaman konfigurasi dicetak`); }, 'prn-config'));
  acts.append(btn(p.cable ? 'Cabut & colok ulang kabel LAN' : 'Colok kabel LAN', () => { const was = p.cable; p.cable = true; syncPrinter(p); UI.log(`${p.id}: kabel LAN printer dicolok${was ? ' ulang' : ' (tadi lepas)'}`); printerPanel(p); }, 'prn-cable'));
  box.append(f, acts, out);
  const rw = h('div', 'row'); rw.append(btn('Tutup [Esc]', () => UI.close())); box.append(rw);
  UI.show(box);
}
/** "Printers & scanners" on a PC */
function printersWin(os: PcOS) {
  const cur = os.current(); if (!cur) return;
  const set = ADDED.get(cur.name) ?? new Set<string>(); ADDED.set(cur.name, set);
  const body = h('div', 'set'); body.style.padding = '16px'; body.style.overflow = 'auto';
  const render = () => {
    body.innerHTML = '<h2 style="margin:0 0 10px">Printers & scanners</h2>';
    for (const ip of set) {
      const row = h('div', 'card'); row.style.display = 'flex'; row.style.gap = '10px'; row.style.alignItems = 'center'; row.style.padding = '10px'; row.style.margin = '6px 0';
      row.append(h('div', 'grow', `<b>Printer kantor (${ip})</b><br><small>Port: IP_${ip} · Standard TCP/IP Port 9100</small>`));
      row.append(btn('Cetak halaman uji', () => {
        const c = os.current()!; const r = ping(c.a, c.env, ip, true); const p = PRINTERS.find(x => x.ip === ip && !x.host.down);
        const ok = r.kind === 'reply' && !!p;
        if (ok) p!.pages++;
        os.emit('print', { printer: ip, ok, id: p?.id });
        os.message('Printer', ok ? `Halaman uji dikirim ke ${p!.id} (${ip}). Kertas keluar di printer lantai ${p!.level}.` : `Error - Printing. Printer di ${ip} tidak merespons (port 9100). Periksa IP printer dan koneksinya.`, ok ? 'info' : 'err');
      }, `print-${ip}`));
      row.append(btn('Hapus', () => { set.delete(ip); render(); }));
      body.append(row);
    }
    if (!set.size) body.append(h('p', '', 'Belum ada printer.'));
    const add = h('input') as HTMLInputElement; add.name = 'prn-add'; add.placeholder = 'Alamat IP printer'; add.style.cssText = 'width:180px;padding:6px;margin-right:8px';
    const ar = h('div'); ar.style.marginTop = '14px'; ar.append(h('b', '', 'Tambah printer (TCP/IP): '), add, btn('Tambah', () => { const v = add.value.trim(); if (parseIp(v) === null) return; set.add(v); os.emit('cmd', { line: `add printer ${v}` }); render(); }, 'prn-add-btn'));
    body.append(ar);
  };
  render(); os.window('Printers & scanners', body, 640, 420);
}

// ---------------------------------------------------------------- IP phones (voice VLAN 100, PoE)
export interface Phone { id: string; ext: string; pc: string; level: number; x: number; z: number }
export const PHONES: Phone[] = [];
export const VOICE_VLAN = 100;
const PBX = { up: true };
export function phoneState(ph: Phone): 'dark' | 'novlan' | 'ok' {
  const p = portOf(ph.pc); if (!p || p.port.shutdown || p.port.poe === false) return 'dark';
  if (p.port.voice !== VOICE_VLAN || !p.sw.vlans.has(VOICE_VLAN) || !uplinkCarries(p.sw, VOICE_VLAN) || !PBX.up) return 'novlan';
  return 'ok';
}
function phonePanel(ph: Phone, dialed = '', msg = '') {
  const st = phoneState(ph);
  const box = h('div', 'noc-box');
  box.append(h('h2', '', `Telepon IP · ext ${ph.ext} · meja ${ph.pc.replace(/^PROP_/, '')}`));
  const scr = st === 'dark' ? '<i>(layar mati · tidak ada daya PoE)</i>' : st === 'novlan' ? `Mendaftar ke ippbx…<br><small>CDP: voice VLAN tidak diterima · tanpa layanan</small>` : `<b>${ph.ext}</b> · Terdaftar<br><small>VLAN suara ${VOICE_VLAN} · ippbx 192.168.100.10</small>`;
  box.append(h('div', 'phone-scr', `${scr}${msg ? `<br><b>${msg}</b>` : ''}<div class="dial">${dialed || '&nbsp;'}</div>`));
  const pad = h('div', 'phone-pad');
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']) pad.append(btn(k, () => phonePanel(ph, (dialed + k).slice(0, 8), ''), `key-${k}`));
  box.append(pad);
  const rw0 = h('div', 'row left');
  rw0.append(btn('📞 Panggil', () => {
    const to = dialed; if (!to) return;
    const target = PHONES.find(x => x.ext === to);
    const ok = phoneState(ph) === 'ok' && (to === '9000' || (!!target && target !== ph && phoneState(target) === 'ok'));
    const m = phoneState(ph) === 'dark' ? '' : phoneState(ph) !== 'ok' ? 'Tidak ada layanan' : ok ? (to === '9000' ? 'Tes gema: suaramu terdengar kembali ✓' : `Tersambung ke ${to} ✓`) : target ? `${to} tidak terdaftar` : 'Nomor tidak dikenal';
    UI.ext({ type: 'dial', pc: ph.pc, detail: { ext: ph.ext, to, ok } }); phonePanel(ph, '', m);
  }, 'phone-call', 'btn pri'));
  rw0.append(btn('Hapus', () => phonePanel(ph, '', ''), 'phone-clr'));
  box.append(rw0);
  box.append(h('p', 'how', 'Tes panggilan: 9000 = tes gema (echo) di ippbx, atau ext telepon lain. Daftar ext: ' + PHONES.slice(0, 6).map(x => x.ext).join(', ') + '…'));
  const rw = h('div', 'row'); rw.append(btn('Tutup [Esc]', () => UI.close())); box.append(rw);
  UI.show(box);
}

// ---------------------------------------------------------------- NAS (SMB shares)
export const NAS = { ip: '192.168.20.10', name: 'nas-kantor', smb: true, cable: true, shares: [{ name: 'dokumen', perm: 'rw' as 'rw' | 'ro' | 'none' }, { name: 'publik', perm: 'ro' as 'rw' | 'ro' | 'none' }] };
const nasHost = () => office().hosts.find(x => x.name === NAS.name)!;
const syncNas = () => { const x = nasHost(); x.down = !NAS.cable; };
const MAPS = new Map<string, Map<string, string>>();
export function nasPanel() {
  const box = h('div', 'noc-box');
  box.append(h('h2', '', `Rak 3 · NAS ${NAS.name} (${NAS.ip})`));
  box.append(h('p', 'how', `NusaStor DS-4 · 4 disk RAID 5 · LED status <b>hijau</b> · LED LAN1 <b>${NAS.cable ? 'hijau berkedip' : 'mati'}</b>. Pengaturan share dan SMB lewat web http://${NAS.ip} dari PC kantor.`));
  const rw0 = h('div', 'row left'); rw0.append(btn(NAS.cable ? 'Cabut & colok ulang kabel LAN' : 'Colok kabel LAN', () => { const was = NAS.cable; NAS.cable = true; syncNas(); UI.log(`${NAS.name}: kabel LAN dicolok${was ? ' ulang' : ' (tadi lepas)'}`); nasPanel(); }, 'nas-cable'));
  box.append(rw0);
  const rw = h('div', 'row'); rw.append(btn('Tutup [Esc]', () => UI.close())); box.append(rw);
  UI.show(box);
}
SITES.nas = {
  render: (_ip, _url, os) => {
    const root = h('div', 'wf');
    const draw = () => {
      root.innerHTML = '';
      const main = h('main');
      main.append(h('h3', '', `NusaStor DSM · ${NAS.name}`));
      const smb = h('label', '', `<input type="checkbox" name="nas-smb" ${NAS.smb ? 'checked' : ''}> Layanan berkas SMB (Windows file sharing) aktif`);
      smb.querySelector('input')!.addEventListener('change', e => { NAS.smb = (e.target as HTMLInputElement).checked; os.emit('cfg', { kind: 'nas', smb: NAS.smb }); UI.log(`${NAS.name}: SMB ${NAS.smb ? 'diaktifkan' : 'dimatikan'}`); draw(); });
      main.append(smb);
      const tb = h('table', '', '<tr><th>Shared folder</th><th>Hak akses grup "staf"</th><th></th></tr>');
      for (const s of NAS.shares) {
        const tr = h('tr'); tr.append(h('td', '', `\\\\${NAS.name}\\${s.name}`));
        const sel = h('select') as HTMLSelectElement; sel.name = `perm-${s.name}`; for (const [v, l] of [['rw', 'Baca/Tulis'], ['ro', 'Hanya baca'], ['none', 'Tidak ada akses']]) { const o = h('option', '', l) as HTMLOptionElement; o.value = v; o.selected = s.perm === v; sel.append(o); }
        sel.onchange = () => { s.perm = sel.value as typeof s.perm; UI.log(`${NAS.name}: hak akses staf di share ${s.name} → ${sel.value}`); os.emit('cfg', { kind: 'nas', share: s.name, perm: s.perm }); };
        const td = h('td'); td.append(sel); tr.append(td);
        const td2 = h('td'); td2.append(btn('Hapus', () => { NAS.shares = NAS.shares.filter(x => x !== s); UI.log(`${NAS.name}: share ${s.name} dihapus`); draw(); })); tr.append(td2);
        tb.append(tr);
      }
      main.append(tb);
      const nn = h('input') as HTMLInputElement; nn.name = 'nas-new'; nn.placeholder = 'nama folder';
      main.append(h('div', '', '<b>Buat shared folder:</b> '), nn, btn('Buat', () => { const v = nn.value.trim().toLowerCase(); if (!/^[a-z0-9_-]{2,20}$/.test(v) || NAS.shares.some(x => x.name === v)) return; NAS.shares.push({ name: v, perm: 'rw' }); UI.log(`${NAS.name}: share ${v} dibuat (staf baca/tulis)`); draw(); }, 'nas-create'));
      root.append(h('aside', '', '<div class="on">Shared Folder</div><div>Layanan berkas</div><div>Pengguna</div>'), main);
    };
    draw(); return root;
  },
};
/** net use / net view on a PC */
CMD_EXT.net = (args, _raw, os) => {
  const cur = os.current(); if (!cur) return '';
  const maps = MAPS.get(cur.name) ?? new Map<string, string>(); MAPS.set(cur.name, maps);
  const sub = (args[0] ?? '').toLowerCase();
  if (sub === 'view') { const m = /^\\\\([^\\]+)/.exec(args[1] ?? ''); if (!m) return 'The syntax of this command is:\n\nNET VIEW \\\\computername'; const r = smbReach(cur.a, cur.env, m[1]); if (r) return r; return `Shared resources at \\\\${m[1]}\n\nShare name  Type  Used as  Comment\n-------------------------------------------------\n${NAS.shares.map(s => `${s.name.padEnd(12)}Disk`).join('\n')}\nThe command completed successfully.`; }
  if (sub !== 'use') return 'The syntax of this command is:\n\nNET [ USE | VIEW ]';
  if (!args[1]) return maps.size ? `New connections will be remembered.\n\nStatus       Local     Remote\n-------------------------------------------------\n${[...maps].map(([d, p]) => `OK           ${d.padEnd(10)}${p}`).join('\n')}\nThe command completed successfully.` : 'New connections will be remembered.\n\nThere are no entries in the list.';
  const drive = args[1].toUpperCase();
  if (args[2]?.toLowerCase() === '/delete') { maps.delete(drive); return `${drive} was deleted successfully.`; }
  const m = /^\\\\([^\\]+)\\([^\\\s]+)$/.exec(args[2] ?? '');
  if (!/^[D-Z]:$/.test(drive) || !m) return 'The syntax of this command is:\n\nNET USE [devicename] [\\\\computername\\sharename]';
  const fail = (code: number, txt: string) => { os.emit('netuse', { drive, path: args[2], ok: false }); return `System error ${code} has occurred.\n\n${txt}`; };
  const r = smbReach(cur.a, cur.env, m[1]); if (r) { os.emit('netuse', { drive, path: args[2], ok: false }); return r; }
  const sh = NAS.shares.find(s => s.name === m[2].toLowerCase());
  if (!sh) return fail(67, 'The network name cannot be found.');
  if (sh.perm === 'none') return fail(5, 'Access is denied.');
  maps.set(drive, `\\\\${m[1]}\\${sh.name}`); os.emit('netuse', { drive, path: args[2], ok: true, share: sh.name });
  return 'The command completed successfully.';
};
function smbReach(a: ReturnType<typeof adapterOf>, env: ReturnType<typeof envOf>, hostName: string): string {
  const r = resolve(a, env, hostName);
  if (r === null || r === 'timeout') return 'System error 53 has occurred.\n\nThe network path was not found.';
  if (r.ip !== NAS.ip) return 'System error 53 has occurred.\n\nThe network path was not found.';
  if (ping(a, env, r.ip, true).kind !== 'reply') return 'System error 53 has occurred.\n\nThe network path was not found.';
  if (!NAS.smb) return 'System error 53 has occurred.\n\nThe network path was not found.\n(Port 445 ditolak: layanan SMB di NAS tidak aktif)';
  return '';
}
CMD_EXT.control = (args, _raw, os) => { if ((args[0] ?? '').toLowerCase() === 'printers') { printersWin(os); return ''; } return 'Gunakan: control printers'; };
DESK_EXT.push(['Printers', os => printersWin(os)]);

// ---------------------------------------------------------------- init (world positions come from the game)
export function initOffice(o: { printers: { id: string; level: number; x: number; z: number }[]; phones: { id: string; level: number; x: number; z: number; pc: string }[]; pcs: { name: string; level: number }[] }, ui: UiHooks) {
  UI = ui;
  const env = office();
  o.printers.forEach((p, i) => {
    const want = i === 0 ? '192.168.20.50' : `192.168.20.${50 + i}`;
    let host = env.hosts.find(x => x.ip === want);
    if (!host) { host = { ip: want, name: `printer-l${p.level}`, mac: `00-80-77-20-00-${(50 + i).toString(16)}`, ttl: 64, web: 'printer' }; env.hosts.push(host); }
    const pr: Printer = { id: `PRN-L${p.level}`, level: p.level, want, ip: want, mask: '255.255.255.0', gw: env.gateway, cable: true, host, pages: 0 };
    PRINTERS.push(pr); syncPrinter(pr);
    DEVICES.push({ id: pr.id, x: p.x, z: p.z, level: p.level, hint: () => `[F] Panel printer ${pr.id}`, use: () => printerPanel(pr) });
  });
  for (const pc of o.pcs) if (pc.level === 2 || pc.level === 3) { const pr = PRINTERS.find(x => x.level === pc.level) ?? PRINTERS[0]; if (pr) ADDED.set(pc.name, new Set([pr.want])); }
  for (const sw of SWITCHES) if (sw.level === 2 || sw.level === 3) sw.vlans.set(VOICE_VLAN, 'VOICE');
  o.phones.forEach(q => {
    const n = PHONES.filter(x => x.level === q.level).length + 1;
    const ph: Phone = { id: q.id, ext: `${q.level}${String(n).padStart(3, '0')}`, pc: q.pc, level: q.level, x: q.x, z: q.z };
    const p = portOf(q.pc); if (p) p.port.voice = VOICE_VLAN;
    PHONES.push(ph);
    DEVICES.push({ id: ph.id, x: q.x, z: q.z, level: q.level, r: 0.9, hint: () => `[F] Telepon IP ext ${ph.ext}`, use: () => phonePanel(ph) });
  });
  const nh = nasHost(); if (nh) nh.web = 'nas';
}

// ---------------------------------------------------------------- NOC faults
const isOfficePc = (pc: string) => envOf(pc).id === 'office' && /_L[23]_/.test(pc);
const printerOf = (pc: string) => { const set = ADDED.get(pc); return set ? PRINTERS.find(p => set.has(p.want)) ?? null : null; };
EXT.printer = {
  def: { cause: 'Printer jaringan tidak bisa dijangkau', fix: 'IP / kabel printer dibetulkan di panel depan printer', symptom: 'Tidak bisa mencetak: "Error - Printing", padahal internet di PC normal.', hint: 'PC mencetak ke IP printer (port TCP/IP). Ping IP printer dari PC. Lalu datangi printernya [F]: cek LED jaringan dan cetak halaman konfigurasi untuk melihat IP-nya.', cp: 'Fase F · Perangkat jaringan kantor (printer)', rank: 1 },
  eligible: pc => isOfficePc(pc) && !!printerOf(pc) && !printerOf(pc)!.host.down && printerOf(pc)!.ip === printerOf(pc)!.want,
  inject(pc) {
    const p = printerOf(pc)!;
    if (Math.random() < 0.5) { p.ip = '192.168.1.50'; p.gw = '192.168.1.1'; syncPrinter(p); return `${p.id} kembali ke setelan pabrik (IP 192.168.1.50) setelah ganti board → IP diatur lagi ke ${p.want} / 255.255.255.0 gw ${office().gateway}`; }
    p.cable = false; syncPrinter(p); return `Kabel LAN di belakang ${p.id} tercabut saat printer dipindah → dicolok lagi`;
  },
  ok: pc => { const p = printerOf(pc); return !!p && p.ip === p.want && !p.host.down; },
  tested: (e, pc) => e.type === 'print' && e.pc === pc && !!e.detail?.ok,
  testHint: 'cetak halaman uji (ikon Printers / control printers)',
};
const phoneOf = (pc: string) => PHONES.find(p => p.pc === pc) ?? null;
EXT.voice = {
  def: { cause: 'Telepon IP tidak terdaftar ke ippbx', fix: 'port switch diberi PoE dan voice VLAN 100 lagi', symptom: 'Telepon meja mati / "Tidak ada layanan", PC di meja yang sama normal.', hint: 'Telepon IP dan PC berbagi satu port switch: data di access VLAN, suara di voice VLAN 100, daya lewat PoE. Datangi teleponnya [F], lalu ke rak IDF lantai itu: show interfaces gi1/0/N, switchport voice vlan 100, power inline auto.', cp: 'Fase F · VoIP: voice VLAN & PoE', rank: 1 },
  eligible: pc => isOfficePc(pc) && !!phoneOf(pc) && phoneState(phoneOf(pc)!) === 'ok',
  inject(pc) {
    const p = portOf(pc)!;
    if (Math.random() < 0.5) { p.port.voice = undefined; return `switchport voice vlan di ${p.sw.name} Gi1/0/${p.port.n} terhapus saat port dikonfigurasi ulang → switchport voice vlan 100`; }
    p.port.poe = false; return `PoE ${p.sw.name} Gi1/0/${p.port.n} dimatikan (power inline never) → power inline auto`;
  },
  ok: pc => !!phoneOf(pc) && phoneState(phoneOf(pc)!) === 'ok',
  health: false,
  tested: (e, pc) => e.type === 'dial' && e.pc === pc && !!e.detail?.ok,
  testHint: 'panggil 9000 atau ext lain dari telepon meja itu',
};
EXT.nas = {
  def: { cause: 'Drive jaringan NAS tidak bisa dibuka', fix: 'akses SMB ke share dokumen dipulihkan', symptom: 'Drive Z: (\\\\nas-kantor\\dokumen) tidak bisa dibuka: "network path was not found" / "Access is denied".', hint: 'Coba di CMD: ping nas-kantor, lalu net use Z: \\\\nas-kantor\\dokumen. Error 53 = jaringan/layanan, error 5 = hak akses. NAS ada di rak 3 ruang server L1; pengaturannya di http://192.168.20.10 dari PC kantor.', cp: 'Fase F · Layanan berbagi berkas (NAS/SMB)', rank: 1 },
  eligible: isOfficePc,
  inject() {
    const v = ['smb', 'perm', 'cable'][Math.floor(Math.random() * 3)];
    if (v === 'smb') { NAS.smb = false; return 'Layanan SMB di NAS dimatikan saat update firmware → diaktifkan lagi di web NAS'; }
    if (v === 'perm') { const s = NAS.shares.find(x => x.name === 'dokumen'); if (s) s.perm = 'none'; else NAS.shares.push({ name: 'dokumen', perm: 'none' }); return 'Hak akses grup staf di share dokumen jadi "Tidak ada akses" → dikembalikan ke Baca/Tulis'; }
    NAS.cable = false; syncNas(); return 'Kabel LAN NAS di rak 3 ruang server tercabut → dicolok lagi';
  },
  ok: () => NAS.smb && NAS.cable && NAS.shares.some(s => s.name === 'dokumen' && s.perm === 'rw'),
  tested: (e, pc) => e.type === 'netuse' && e.pc === pc && !!e.detail?.ok && e.detail?.share === 'dokumen',
  testHint: 'net use Z: \\\\nas-kantor\\dokumen',
};
export const officeQa = { PRINTERS, PHONES, NAS, phoneState, ADDED, MAPS, printerPanel, phonePanel, nasPanel };
