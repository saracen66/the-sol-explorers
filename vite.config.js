import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages, Netlify, a USB stick).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
  server: { host: true },
});
