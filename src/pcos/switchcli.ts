// Console session to a floor switch (Cisco IOS-like subset) shown on the technician laptop.
// Every command changes the shared switch state in net.ts, so the PCs feel it immediately.
import { SWITCHES, ADAPTERS, portName, linkUp, bounce, stormOn, portLink, type Switch, type Port } from './net';

type Mode = 'user' | 'priv' | 'config' | 'if' | 'vlan';
const el = (tag: string, cls = '', txt = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };

/** Keyword prefix match like IOS ("conf t", "sh vl br", "sw acc vl 30"). */
function kw(tok: string | undefined, word: string, min = 1) { return !!tok && tok.length >= min && word.startsWith(tok.toLowerCase()); }

export class SwitchCli {
  readonly root: HTMLElement;
  private out: HTMLElement;
  private input: HTMLInputElement;
  private promptEl: HTMLElement;
  private mode: Mode = 'user';
  private ifs: Port[] = [];
  private vlanId = 0;
  private hist: string[] = []; private hi = 0;
  private started = false;

  constructor(private sw: Switch, private onCmd: (line: string, sw: Switch) => void = () => {}) {
    this.root = el('div', 'swcli');
    const bar = el('div', 'swbar', `COM3 - PuTTY · Console ${sw.name} (9600 8N1)`);
    this.out = el('pre', 'swout');
    const line = el('div', 'swline');
    this.promptEl = el('span', 'swprompt');
    this.input = el('input', 'swin') as HTMLInputElement;
    this.input.spellcheck = false; this.input.autocomplete = 'off'; this.input.setAttribute('aria-label', 'switch console');
    line.append(this.promptEl, this.input);
    this.root.append(bar, this.out, line);
    this.print(`\n\n${sw.name} con0 is now available\n\n\n\n\nPress RETURN to get started.\n`);
    this.input.addEventListener('keydown', e => this.key(e));
    this.root.addEventListener('mousedown', () => setTimeout(() => this.input.focus(), 0));
    this.setPrompt();
  }
  focus() { this.input.focus(); }
  private print(s: string) { this.out.textContent += s; this.out.scrollTop = this.out.scrollHeight; }
  private prompt() { const n = this.sw.name; return this.mode === 'user' ? `${n}>` : this.mode === 'priv' ? `${n}#` : this.mode === 'config' ? `${n}(config)#` : this.mode === 'if' ? `${n}(config-if${this.ifs.length > 1 ? '-range' : ''})#` : `${n}(config-vlan)#`; }
  private setPrompt() { this.promptEl.textContent = this.started ? this.prompt() : ''; }
  private key(e: KeyboardEvent) {
    if (e.key === 'Escape') return;   // the modal closes
    e.stopPropagation();
    if (e.key === 'ArrowUp') { if (this.hi > 0) this.input.value = this.hist[--this.hi] ?? ''; e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { this.input.value = this.hist[++this.hi] ?? ''; if (this.hi > this.hist.length) this.hi = this.hist.length; e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    const v = this.input.value; this.input.value = '';
    if (!this.started) { this.started = true; this.print('\n'); this.setPrompt(); return; }
    this.print(`${this.prompt()}${v}\n`);
    if (v.trim()) { this.hist.push(v); this.hi = this.hist.length; this.exec(v.trim()); this.onCmd(v.trim(), this.sw); this.flap(); }
    this.setPrompt();
  }
  /** Run a command as if typed (QA hooks use the same path). */
  type(v: string) { this.input.value = v; this.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }

  /** A loop makes the switch log MAC flapping (as IOS does) between the two looped ports. */
  private flap() {
    if (!stormOn(this.sw)) return;
    const pcs = this.sw.ports.filter(p => p.pc).slice(0, 2);
    const [a, b] = this.sw.loop!;
    for (const p of pcs) { const m = (ADAPTERS.get(p.pc!)?.mac ?? '0000.0000.0000').replace(/-/g, ''); this.print(`%SW_MATM-4-MACFLAP_NOTIF: Host ${m.slice(0, 4)}.${m.slice(4, 8)}.${m.slice(8)} in vlan ${p.vlan} is flapping between port ${portName(a)} and port ${portName(b)}\n`); }
  }
  private up(p: Port) { return p === this.sw.upPort; }
  private bad(tok?: string) { this.print(`% Invalid input detected at '^' marker.${tok ? `  (${tok})` : ''}\n\n`); }
  private incomplete() { this.print('% Incomplete command.\n\n'); }

  private parseIf(t: string[]): Port[] | null {
    // gi1/0/5 | g1/0/5 | gigabitethernet 1/0/5 | range gi1/0/5-8 | range gi1/0/5 - 8
    let s = t.join('').toLowerCase().replace(/^gigabitethernet|^gi|^g/, '');
    const m = /^1\/0\/(\d+)(?:-(\d+))?$/.exec(s);
    if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a === 49 && b === 49 && this.sw.uplink) return [this.sw.upPort];
    if (a < 1 || b > this.sw.ports.length || b < a) return null;
    return this.sw.ports.slice(a - 1, b);
  }

  private exec(line: string) {
    const t = line.split(/\s+/);
    if (t[0] === '?') { this.help(); return; }
    if (kw(t[0], 'do', 2) && (this.mode === 'config' || this.mode === 'if' || this.mode === 'vlan')) { const m = this.mode; this.mode = 'priv'; this.exec(t.slice(1).join(' ')); this.mode = m; return; }
    if (kw(t[0], 'end', 2) && this.mode !== 'user' && this.mode !== 'priv') { this.mode = 'priv'; this.print(`%SYS-5-CONFIG_I: Configured from console by console\n`); return; }
    if (kw(t[0], 'exit', 2)) {
      if (this.mode === 'if' || this.mode === 'vlan') this.mode = 'config';
      else if (this.mode === 'config') this.mode = 'priv';
      else { this.mode = 'user'; this.started = false; this.print(`\n${this.sw.name} con0 is now available\n\nPress RETURN to get started.\n`); }
      return;
    }
    if (kw(t[0], 'show', 2) || kw(t[0], 'sh', 2)) { this.show(t.slice(1)); return; }
    switch (this.mode) {
      case 'user':
        if (kw(t[0], 'enable', 2)) { this.mode = 'priv'; return; }
        if (kw(t[0], 'logout', 3)) { this.exec('exit'); return; }
        return this.bad(t[0]);
      case 'priv':
        if (kw(t[0], 'disable', 4)) { this.mode = 'user'; return; }
        if (kw(t[0], 'configure', 4)) { if (t[1] && !kw(t[1], 'terminal')) return this.bad(t[1]); this.mode = 'config'; this.print('Enter configuration commands, one per line.  End with CNTL/Z.\n'); return; }
        if (kw(t[0], 'write', 2) || (kw(t[0], 'copy', 2) && kw(t[1], 'running-config', 3) && kw(t[2], 'startup-config', 3))) { this.sw.dirty = false; this.print('Building configuration...\n[OK]\n'); return; }
        if (kw(t[0], 'reload', 3)) { this.print('% Reload ditolak: switch melayani PC yang sedang dipakai. Simpan konfigurasi dengan "write memory".\n'); return; }
        if (kw(t[0], 'enable', 2)) return;
        return this.bad(t[0]);
      case 'config':
        if (kw(t[0], 'interface', 3)) {
          const rest = kw(t[1], 'range', 1) ? t.slice(2) : t.slice(1);
          if (!rest.length) return this.incomplete();
          const p = this.parseIf(rest); if (!p) return this.bad(rest.join(' '));
          this.ifs = p; this.mode = 'if'; return;
        }
        if (kw(t[0], 'vlan', 2)) { const id = +t[1]; if (!t[1]) return this.incomplete(); if (!(id >= 2 && id <= 1001)) return this.bad(t[1]); if (!this.sw.vlans.has(id)) this.sw.vlans.set(id, `VLAN${String(id).padStart(4, '0')}`); this.vlanId = id; this.mode = 'vlan'; this.sw.dirty = true; return; }
        if (kw(t[0], 'no', 2) && kw(t[1], 'vlan', 2)) { const id = +t[2]; if (!this.sw.vlans.has(id) || id === 1) return this.bad(t[2]); this.sw.vlans.delete(id); this.sw.dirty = true; return; }
        if (kw(t[0], 'hostname', 3)) { if (!t[1]) return this.incomplete(); this.print('% Hostname dikunci oleh label rak (dokumentasi NOC). Perubahan tidak disimpan.\n'); return; }
        return this.bad(t[0]);
      case 'vlan':
        if (kw(t[0], 'name', 2)) { if (!t[1]) return this.incomplete(); this.sw.vlans.set(this.vlanId, t.slice(1).join('_').slice(0, 32).toUpperCase()); this.sw.dirty = true; return; }
        if (kw(t[0], 'vlan', 2) || kw(t[0], 'interface', 3)) { this.mode = 'config'; this.exec(line); return; }
        return this.bad(t[0]);
      case 'if': {
        if (kw(t[0], 'interface', 3) || kw(t[0], 'vlan', 2)) { this.mode = 'config'; this.exec(line); return; }
        if (kw(t[0], 'shutdown', 2)) { for (const p of this.ifs) { if (!p.shutdown) this.print(`%LINK-5-CHANGED: Interface ${portName(p.n)}, changed state to administratively down\n`); p.shutdown = true; } this.sw.dirty = true; return; }
        if (kw(t[0], 'no', 2) && kw(t[1], 'shutdown', 2)) {
          for (const p of this.ifs) {
            if (!p.shutdown) continue;
            p.shutdown = false;
            const a = p.pc ? ADAPTERS.get(p.pc) : undefined;
            if (a) bounce(a);
            const up = this.up(p) ? this.sw.uplink!.cable : this.sw.loop?.includes(p.n) ? true : p.pc?.startsWith('AP-') ? portLink(this.sw, p) : !!a && linkUp(a) && a.enabled;
            this.print(`%LINK-3-UPDOWN: Interface ${portName(p.n)}, changed state to ${up ? 'up' : 'down'}\n`);
            if (up) this.print(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${portName(p.n)}, changed state to up\n`);
          }
          this.sw.dirty = true; return;
        }
        if (kw(t[0], 'switchport', 2) && this.ifs.some(p => this.up(p))) {
          const U = this.sw.uplink!;
          if (kw(t[1], 'mode', 2)) { if (!t[2]) return this.incomplete(); if (!kw(t[2], 'trunk', 2)) { this.print('% Gi1/0/49 adalah uplink ke MDF: harus "switchport mode trunk" (membawa banyak VLAN).\n'); return; } return; }
          if (kw(t[1], 'access', 2)) { this.print('% Uplink membawa banyak VLAN (trunk 802.1Q). Pakai "switchport trunk allowed vlan ...".\n'); return; }
          if (kw(t[1], 'trunk', 2) && kw(t[2], 'allowed', 2) && kw(t[3], 'vlan', 2)) {
            const arg = t[4]?.toLowerCase(); if (!arg) return this.incomplete();
            const list = (x: string | undefined) => { if (!x) return null; const out: number[] = []; for (const part of x.split(',')) { const r = /^(\d+)(?:-(\d+))?$/.exec(part); if (!r) return null; const a = +r[1], b = r[2] ? +r[2] : a; if (a < 1 || b > 4094 || b < a) return null; for (let k = a; k <= b; k++) out.push(k); } return out; };
            const cur = U.allowed ?? [];
            if (kw(arg, 'all', 2)) U.allowed = null;
            else if (kw(arg, 'none', 2)) U.allowed = [];
            else if (kw(arg, 'add', 2)) { const l = list(t[5]); if (!l) return this.bad(t[5]); if (U.allowed) U.allowed = [...new Set([...cur, ...l])].sort((a, b) => a - b); }
            else if (kw(arg, 'remove', 2)) { const l = list(t[5]); if (!l) return this.bad(t[5]); const base = U.allowed ?? Array.from({ length: 4094 }, (_, i) => i + 1); U.allowed = base.filter(v => !l.includes(v)); }
            else if (kw(arg, 'except', 2)) { const l = list(t[5]); if (!l) return this.bad(t[5]); U.allowed = Array.from({ length: 4094 }, (_, i) => i + 1).filter(v => !l.includes(v)); }
            else { const l = list(t[4]); if (!l) return this.bad(t[4]); U.allowed = [...new Set(l)].sort((a, b) => a - b); }
            this.sw.dirty = true; return;
          }
          return this.bad(t[1]);
        }
        if (kw(t[0], 'switchport', 2) && kw(t[1], 'voice', 2) && kw(t[2], 'vlan', 2)) {
          const id = +t[3]; if (!t[3]) return this.incomplete(); if (!(id >= 1 && id <= 1001)) return this.bad(t[3]);
          if (!this.sw.vlans.has(id)) { this.print(`% Voice VLAN does not exist. Creating vlan ${id}\n`); this.sw.vlans.set(id, `VLAN${String(id).padStart(4, '0')}`); }
          for (const p of this.ifs) p.voice = id; this.sw.dirty = true; return;
        }
        if (kw(t[0], 'no', 2) && kw(t[1], 'switchport', 2) && kw(t[2], 'voice', 2)) { for (const p of this.ifs) p.voice = undefined; this.sw.dirty = true; return; }
        if (kw(t[0], 'switchport', 2)) {
          if (kw(t[1], 'mode', 2)) { if (!t[2]) return this.incomplete(); if (!kw(t[2], 'access', 2)) { this.print('% Port akses ke PC: gunakan "switchport mode access". Trunk hanya untuk uplink.\n'); return; } return; }
          if (kw(t[1], 'access', 2) && kw(t[2], 'vlan', 2)) {
            const id = +t[3]; if (!t[3]) return this.incomplete(); if (!(id >= 1 && id <= 1001)) return this.bad(t[3]);
            if (!this.sw.vlans.has(id)) { this.print(`% Access VLAN does not exist. Creating vlan ${id}\n`); this.sw.vlans.set(id, `VLAN${String(id).padStart(4, '0')}`); }
            for (const p of this.ifs) p.vlan = id;
            this.sw.dirty = true; return;
          }
          return this.bad(t[1]);
        }
        if (kw(t[0], 'power', 2) && kw(t[1], 'inline', 2)) {
          if (!t[2]) return this.incomplete();
          if (this.ifs.some(p => this.up(p))) { this.print('% PoE tidak tersedia di port SFP uplink.\n'); return; }
          const on = kw(t[2], 'auto', 2) ? true : kw(t[2], 'never', 2) ? false : null; if (on === null) return this.bad(t[2]);
          for (const p of this.ifs) { const was = p.poe !== false; p.poe = on; if (was !== on && p.pc?.startsWith('AP-')) this.print(on ? `%ILPOWER-5-POWER_GRANTED: Interface ${portName(p.n)}: Power granted\n%LINK-3-UPDOWN: Interface ${portName(p.n)}, changed state to up\n` : `%ILPOWER-5-IEEE_DISCONNECT: Interface ${portName(p.n)}: PD removed\n%LINK-3-UPDOWN: Interface ${portName(p.n)}, changed state to down\n`); }
          this.sw.dirty = true; return;
        }
        if (kw(t[0], 'description', 3)) { for (const p of this.ifs) p.desc = t.slice(1).join(' ').slice(0, 24); this.sw.dirty = true; return; }
        if (kw(t[0], 'no', 2) && kw(t[1], 'description', 3)) { for (const p of this.ifs) p.desc = ''; return; }
        return this.bad(t[0]);
      }
    }
  }

  private help() {
    const m: Record<Mode, string> = {
      user: '  enable      Turn on privileged commands\n  exit        Exit from the EXEC\n  show        Show running system information',
      priv: '  configure   Enter configuration mode\n  copy        Copy from one file to another\n  disable     Turn off privileged commands\n  exit        Exit from the EXEC\n  show        Show running system information\n  write       Write running configuration to memory',
      config: '  do          To run exec commands in config mode\n  end         Exit from configure mode\n  exit        Exit from configure mode\n  interface   Select an interface to configure\n  no          Negate a command or set its defaults\n  vlan        Vlan commands',
      if: '  description Interface specific description\n  do          To run exec commands\n  end         Exit from configure mode\n  exit        Exit from interface configuration mode\n  no          Negate a command or set its defaults\n  power       Power configuration (power inline auto|never)\n  switchport  voice vlan N (telepon IP), access vlan N\n  shutdown    Shutdown the selected interface\n  switchport  Set switching mode characteristics',
      vlan: '  end         Exit from configure mode\n  exit        Apply changes, bump revision number, and exit mode\n  name        Ascii name of the VLAN',
    };
    this.print(`${m[this.mode]}\n\n`);
  }

  private status(p: Port) {
    if (p.shutdown) return 'disabled';
    if (this.up(p)) return this.sw.uplink!.cable ? 'connected' : 'notconnect';
    if (this.sw.loop?.includes(p.n)) return 'connected';
    if (!portLink(this.sw, p)) return 'notconnect';
    if (!this.sw.vlans.has(p.vlan)) return 'inactive';
    return 'connected';
  }
  private show(t: string[]) {
    if (!t.length) return this.incomplete();
    const sw = this.sw;
    if (kw(t[0], 'interfaces', 2) && (kw(t[1], 'status', 2))) {
      let s = 'Port      Name               Status       Vlan       Duplex  Speed Type\n';
      for (const p of sw.ports) { const st = this.status(p); s += `${portName(p.n).padEnd(10)}${p.desc.slice(0, 18).padEnd(19)}${st.padEnd(13)}${String(p.vlan).padEnd(11)}${(st === 'connected' ? 'a-full' : 'auto').padEnd(8)}${(st === 'connected' ? 'a-1000' : 'auto').padEnd(6)}10/100/1000BaseTX\n`; }
      if (sw.uplink) { const st = this.status(sw.upPort); s += `${portName(49).padEnd(10)}${sw.upPort.desc.padEnd(19)}${st.padEnd(13)}${'trunk'.padEnd(11)}${(st === 'connected' ? 'full' : 'auto').padEnd(8)}${(st === 'connected' ? '1000' : 'auto').padEnd(6)}1000BaseLX SFP\n`; }
      this.print(s + '\n'); return;
    }
    if (kw(t[0], 'interfaces', 2) && kw(t[1], 'trunk', 2)) {
      if (!sw.uplink) { this.print('\n% Switch inti (MDF): trunk ke IDF ada di modul fiber, tidak dikonfigurasi dari sini.\n\n'); return; }
      const st = this.status(sw.upPort) === 'connected';
      if (!st) { this.print('\n'); return; }
      const al = sw.uplink.allowed === null ? '1-4094' : sw.uplink.allowed.length ? sw.uplink.allowed.join(',') : 'none';
      const act = [...sw.vlans.keys()].filter(v => sw.uplink!.allowed === null || sw.uplink!.allowed.includes(v)).sort((a, b) => a - b).join(',') || 'none';
      this.print(`\nPort        Mode         Encapsulation  Status        Native vlan\nGi1/0/49    on           802.1q         trunking      1\n\nPort        Vlans allowed on trunk\nGi1/0/49    ${al}\n\nPort        Vlans allowed and active in management domain\nGi1/0/49    ${act}\n\n`);
      return;
    }
    if (kw(t[0], 'interfaces', 2) && t[1]) {
      const p = this.parseIf(t.slice(1).filter(x => !kw(x, 'switchport', 2)));
      if (!p || p.length !== 1) return this.bad(t.slice(1).join(' '));
      const q = p[0], st = this.status(q);
      if (this.up(q)) { this.print(`GigabitEthernet1/0/49 is ${q.shutdown ? 'administratively down' : st === 'connected' ? 'up' : 'down'}, line protocol is ${st === 'connected' ? 'up (connected)' : `down (${st})`}\n  Description: ${q.desc}\n  Hardware is Gigabit Ethernet SFP (1000BaseLX, fiber) · Administrative Mode: trunk\n\n`); return; }
      this.print(`${portName(q.n).replace('Gi', 'GigabitEthernet')} is ${q.shutdown ? 'administratively down' : st === 'connected' || st === 'inactive' ? 'up' : 'down'}, line protocol is ${st === 'connected' ? 'up (connected)' : st === 'inactive' ? 'up (inactive)' : `down (${st})`}\n  Description: ${q.desc}\n  Switchport: Enabled · Administrative Mode: static access · Access Mode VLAN: ${q.vlan} (${sw.vlans.get(q.vlan) ?? 'Inactive'})\n  Voice VLAN: ${q.voice ? `${q.voice} (${sw.vlans.get(q.voice) ?? 'Inactive'})` : 'none'} · Power inline: ${q.poe === false ? 'never' : 'auto'}\n\n`);
      return;
    }
    if (kw(t[0], 'power', 2)) {
      let s = 'Module   Available     Used     Remaining\n          (Watts)     (Watts)    (Watts)\n------   ---------   --------   ---------\n';
      const pd = sw.ports.filter(p => p.pc?.startsWith('AP-') && p.poe !== false && portLink(sw, p));
      s += `1           370.0${(pd.length * 13.4).toFixed(1).padStart(11)}${(370 - pd.length * 13.4).toFixed(1).padStart(12)}\nInterface Admin  Oper       Power   Device              Class Max\n                           (Watts)\n--------- ------ ---------- ------- ------------------- ----- ----\n`;
      for (const p of sw.ports) { const link = p.poe !== false && portLink(sw, p) && !!p.pc?.startsWith('AP-'); s += `${portName(p.n).padEnd(10)}${(p.poe === false ? 'off' : 'auto').padEnd(7)}${(p.poe === false ? 'off' : link ? 'on' : 'off').padEnd(11)}${(link ? '13.4' : '0.0').padStart(7)} ${(link ? 'NusaAP AX1800' : 'n/a').padEnd(20)}${(link ? '4' : 'n/a').padEnd(6)}30.0\n`; }
      this.print(s + '\n'); return;
    }
    if (kw(t[0], 'vlan', 1)) {
      let s = 'VLAN Name                             Status    Ports\n---- -------------------------------- --------- -------------------------------\n';
      for (const [id, name] of [...sw.vlans.entries()].sort((a, b) => a[0] - b[0])) {
        const ports = sw.ports.filter(p => p.vlan === id).map(p => portName(p.n));
        const chunks: string[] = []; for (let i = 0; i < ports.length; i += 4) chunks.push(ports.slice(i, i + 4).join(', '));
        s += `${String(id).padEnd(5)}${name.padEnd(33)}${'active'.padEnd(10)}${chunks[0] ?? ''}\n`;
        for (const c of chunks.slice(1)) s += `${''.padEnd(48)}${c}\n`;
      }
      const orphan = [...new Set(sw.ports.filter(p => !sw.vlans.has(p.vlan)).map(p => p.vlan))];
      if (orphan.length) s += `\n% Port di VLAN yang tidak ada (inactive): ${orphan.map(v => `VLAN ${v}: ${sw.ports.filter(p => p.vlan === v).map(p => portName(p.n)).join(', ')}`).join(' · ')}\n`;
      this.print(s + '\n'); return;
    }
    if (kw(t[0], 'mac', 1)) {
      let s = '          Mac Address Table\n-------------------------------------------\n\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----\n';
      for (const p of sw.ports) { const a = p.pc ? ADAPTERS.get(p.pc) : undefined; if (!a || this.status(p) !== 'connected' || !a.enabled) continue; const m = a.mac.replace(/-/g, ''); s += ` ${String(p.vlan).padEnd(7)}${`${m.slice(0, 4)}.${m.slice(4, 8)}.${m.slice(8)}`.padEnd(18)}DYNAMIC     ${portName(p.n)}\n`; }
      this.print(s + '\n'); return;
    }
    if (kw(t[0], 'running-config', 3) || kw(t[0], 'run', 3)) {
      if (this.mode === 'user') return this.bad(t[0]);
      let s = `Building configuration...\n\nCurrent configuration:\n!\nhostname ${sw.name}\n!\n`;
      for (const [id, name] of sw.vlans) if (id !== 1) s += `vlan ${id}\n name ${name}\n!\n`;
      for (const p of sw.ports) { s += `interface ${portName(p.n).replace('Gi', 'GigabitEthernet')}\n`; if (p.desc) s += ` description ${p.desc}\n`; s += ` switchport access vlan ${p.vlan}\n switchport mode access\n`; if (p.voice) s += ` switchport voice vlan ${p.voice}\n`; if (p.poe === false) s += ' power inline never\n'; if (p.shutdown) s += ' shutdown\n'; s += '!\n'; }
      if (sw.uplink) { s += `interface GigabitEthernet1/0/49\n description ${sw.upPort.desc}\n switchport mode trunk\n`; if (sw.uplink.allowed) s += ` switchport trunk allowed vlan ${sw.uplink.allowed.length ? sw.uplink.allowed.join(',') : 'none'}\n`; if (sw.upPort.shutdown) s += ' shutdown\n'; s += '!\n'; }
      s += `interface Vlan1\n ip address ${sw.ip} 255.255.255.0\n!\nend\n`;
      this.print(s + '\n'); return;
    }
    if (kw(t[0], 'version', 2)) { this.print(`Nusa IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E8\n${sw.name} uptime is 41 days, 3 hours\n48 Gigabit Ethernet interfaces, 4 SFP uplink ports\n\n`); return; }
    if (kw(t[0], 'ip', 2)) { this.print(`Interface              IP-Address      OK? Method Status                Protocol\nVlan1                  ${sw.ip.padEnd(16)}YES NVRAM  up                    up\n\n`); return; }
    this.bad(t[0]);
  }
}

export const switchByName = (n: string) => SWITCHES.find(s => s.name === n) ?? null;
