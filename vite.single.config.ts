import { defineConfig } from 'vite';
// classic-script build (no ES modules) for hosts that cannot run <script type="module">
export default defineConfig({ base: './', build: { target: 'es2018', outDir: 'dist-classic', modulePreload: false, chunkSizeWarningLimit: 4000, rolldownOptions: { output: { format: 'iife' } } } });
