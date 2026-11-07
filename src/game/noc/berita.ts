// Shared by the hotel internship (noc/board.ts) and the field-work layer (game/field): the four work stages and the
// fact check of a signed berita acara. Pure functions, no DOM state.

/** survei → kerja → uji → dokumentasi (index 4 = closed) */
export const STAGES = ['Survei', 'Kerja', 'Uji', 'Dokumentasi'] as const;

/** the stage bar markup used in both HUD cards (styled by `.stg` in skin.css) */
export const stageBarHtml = (n: number) => `<div class="stg">${STAGES.map((x, i) => `<span class="${i < n ? 'done' : i === n ? 'cur' : ''}">${x}</span>`).join('')}</div>`;

const IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
/** every IPv4 address written in these texts */
export const ipsIn = (...texts: string[]) => texts.flatMap(t => t.match(IP) ?? []);

/** network and broadcast address of a /24 the device sits in (a berita acara may name them) */
export function addNet24(known: Set<string>, ip: string) {
  if (!ip) return;
  const net = ip.split('.').slice(0, 3).join('.');
  known.add(`${net}.0`);
  known.add(`${net}.255`);
}

/**
 * A berita acara is a signed record: every IP it names must be one the job really involved (`known`), and it must say how
 * the work was verified. Returns '' when it may be signed, otherwise the reason. `where` describes the real addressing
 * for the error text (e.g. "Laptop: IP 192.168.1.120, gateway 192.168.1.1").
 */
export function beritaFactCheck(text: string, known: Set<string>, where = ''): string {
  const bad = (text.match(IP) ?? []).filter(x => !known.has(x));
  if (bad.length)
    return `Alamat ${bad[0]} tidak cocok dengan hasil kerja di lapangan${where ? ` (${where})` : ''}. Berita acara ditandatangani, jadi isinya harus sesuai fakta.`;
  if (!/\b(ping|tes|tester|uji|diuji|dites|ipconfig|nslookup|cetak|print|browser|buka|wiremap|verifikasi|cek)\b/i.test(text))
    return 'Tulis juga cara kamu membuktikan hasilnya (mis. LAN tester 1–8 lolos, ping gateway berhasil, situs terbuka dari PC).';
  return '';
}
