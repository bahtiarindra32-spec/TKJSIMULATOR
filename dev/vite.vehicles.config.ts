import { defineConfig } from 'vite';
export default defineConfig({ root: __dirname, base: './', build: { outDir: '/workspace/work/vehicles-dist', emptyOutDir: true, chunkSizeWarningLimit: 4000, rollupOptions: { input: __dirname + '/vehicles.html' } } });
