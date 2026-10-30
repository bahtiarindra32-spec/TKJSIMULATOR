// A small serial/SSH style terminal (dark, monospace) for consoles shown in game modals:
// the Linux server console and the edge router console. The shell behind it decides what each line does.
export interface Shell {
  banner(): string;
  prompt(): string;
  /** run one line; returns the text to print ('' = nothing). A shell can also open an editor through `edit`. */
  exec(line: string, io: TermIO): string | void;
}
export interface TermIO { edit(path: string, text: string, save: (t: string) => void): void; close(): void }

const el = (tag: string, cls = '', txt = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };

export class Term {
  readonly root: HTMLElement;
  private out: HTMLElement; private input: HTMLInputElement; private pr: HTMLElement; private line: HTMLElement;
  private hist: string[] = []; private hi = 0;
  onLine: (line: string, secret: boolean) => void = () => {};
  onExit: () => void = () => {};
  constructor(private sh: Shell, title: string) {
    this.root = el('div', 'swcli');
    this.out = el('pre', 'swout'); this.line = el('div', 'swline'); this.pr = el('span', 'swprompt');
    this.input = el('input', 'swin') as HTMLInputElement; this.input.spellcheck = false; this.input.autocomplete = 'off'; this.input.setAttribute('aria-label', title);
    this.line.append(this.pr, this.input);
    this.root.append(el('div', 'swbar', title), this.out, this.line);
    this.print(sh.banner());
    this.input.addEventListener('keydown', e => this.key(e));
    this.root.addEventListener('mousedown', () => setTimeout(() => this.input.focus(), 0));
    this.pr.textContent = sh.prompt();
  }
  focus() { this.input.focus(); }
  print(s: string) { if (!s) return; this.out.textContent += s.endsWith('\n') ? s : s + '\n'; this.out.scrollTop = this.out.scrollHeight; }
  /** QA / scripted typing goes through the same path as the keyboard */
  type(v: string) { this.input.value = v; this.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }
  text() { return this.out.textContent ?? ''; }
  private key(e: KeyboardEvent) {
    if (e.key === 'Escape') return;   // the modal closes
    e.stopPropagation();
    if (e.key === 'ArrowUp') { if (this.hi > 0) this.input.value = this.hist[--this.hi] ?? ''; e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { this.input.value = this.hist[++this.hi] ?? ''; if (this.hi > this.hist.length) this.hi = this.hist.length; e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    const v = this.input.value; this.input.value = '';
    const sec = !!(this.sh as { secret?: boolean }).secret; this.out.textContent += `${this.sh.prompt()}${sec ? '' : v}\n`;
    if (v.trim() && !sec) { this.hist.push(v); this.hi = this.hist.length; }
    const r = this.sh.exec(v.trim(), { edit: (p, t, save) => this.editor(p, t, save), close: () => this.onExit() });
    if (r === '\u001b') this.out.textContent = ''; else if (r) this.print(r);
    this.onLine(v.trim(), sec);
    this.input.type = (this.sh as { secret?: boolean }).secret ? 'password' : 'text'; this.pr.textContent = this.sh.prompt(); this.out.scrollTop = this.out.scrollHeight;
  }
  private editor(path: string, text: string, save: (t: string) => void) { nanoEditor(this.root, this.line, path, text, save, () => this.input.focus(), m => this.print(m)); }
}
/** nano-like editor laid over a terminal: Ctrl+O / button saves, Ctrl+X / button leaves */
export function nanoEditor(host: HTMLElement, hide: HTMLElement, path: string, text: string, save: (t: string) => void, done: () => void, note: (m: string) => void) {
  const box = el('div', 'nano'); const head = el('div', 'nano-h', `  GNU nano 7.2        ${path}`);
  const ta = el('textarea', 'nano-ta') as HTMLTextAreaElement; ta.value = text; ta.spellcheck = false; ta.name = 'nano-text';
  const bar = el('div', 'nano-b');
  const leave = () => { box.remove(); hide.style.display = ''; done(); };
  const doSave = () => { save(ta.value); note(`[ Wrote ${ta.value.split('\n').length} lines ]`); };
  const b1 = el('button', 'btn', '^O Simpan') as HTMLButtonElement; b1.name = 'nano-save'; b1.onclick = () => { doSave(); ta.focus(); };
  const b2 = el('button', 'btn', '^X Keluar') as HTMLButtonElement; b2.name = 'nano-exit'; b2.onclick = leave;
  bar.append(b1, b2);
  ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.ctrlKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); doSave(); } if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); leave(); } });
  box.append(head, ta, bar); hide.style.display = 'none'; host.append(box); ta.focus();
}
