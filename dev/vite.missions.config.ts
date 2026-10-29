import { defineConfig } from 'vite';
import { resolve } from 'path';
// Dev-only build of the mission test page. Run: npx vite build -c dev/vite.missions.config.ts
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  build: { outDir: '/workspace/work/missions-dist', emptyOutDir: true, chunkSizeWarningLimit: 4000, rollupOptions: { input: resolve(__dirname, 'missions.html') } },
});
