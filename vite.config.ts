import { defineConfig } from 'vite';
export default defineConfig({ base: './', define: { __BUILD__: JSON.stringify(process.env.KN_BUILD ?? 'dev') }, build: { chunkSizeWarningLimit: 2000 } });
