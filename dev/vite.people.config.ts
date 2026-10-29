import { defineConfig } from 'vite';
export default defineConfig({ root: __dirname, base: './', build: { outDir: '/workspace/work/people-dist', emptyOutDir: true, chunkSizeWarningLimit: 4000, rollupOptions: { input: __dirname + '/people.html' } } });
