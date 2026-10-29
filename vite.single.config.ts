import { defineConfig } from 'vite';
// classic-script build (no ES modules) for hosts that cannot run <script type="module">
export default defineConfig({ base: './', define: { __BUILD__: JSON.stringify(process.env.KN_BUILD ?? 'dev') }, build: { target: 'es2018', outDir: 'dist-classic', modulePreload: false, chunkSizeWarningLimit: 4000, rolldownOptions: { output: { format: 'iife' } } } });
