// Imported first by main.ts: if the judge tour (Mode Juri) was left by closing the tab or a crash, put the
// player's own save back before anything reads it. The tour never writes over a real save.
export const DEMO_BACKUP = 'kotaNusantara.demoBackup';
export const SAVE_KEYS = ['kotaNusantara.noc.v1', 'kotaNusantara.notes.v1', 'kotaNusantara.field.v1'];
const juri = /[?&]juri\b/.test(location.search);
try {
  const b = sessionStorage.getItem(DEMO_BACKUP);
  if (b && !juri) {
    const saved = JSON.parse(b) as Record<string, string | null>;
    for (const k of SAVE_KEYS) { const v = saved[k]; if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); }
    sessionStorage.removeItem(DEMO_BACKUP);
  }
} catch { /* storage blocked: nothing to restore */ }
