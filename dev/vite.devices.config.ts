import { defineConfig } from 'vite';
export default defineConfig({ root: __dirname, base: './', build: { outDir: '/workspace/work/devices-dist', emptyOutDir: true, chunkSizeWarningLimit: 4000, rollupOptions: { input: __dirname + '/devices.html' } } });
