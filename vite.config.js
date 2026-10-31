import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

// Hash of everything in public/data. Data URLs carry it as ?v=, so a browser that cached
// yesterday's map (data is cached for a day) fetches the new files as soon as they change.
function dataVersion(dir = 'public/data') {
  const h = createHash('md5');
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true }).sort((a, b) => (a.parentPath + a.name).localeCompare(b.parentPath + b.name))) {
    if (e.isFile()) h.update(e.name).update(readFileSync(`${e.parentPath}/${e.name}`));
  }
  return h.digest('hex').slice(0, 10);
}

// Relative base so the build works from any sub-path (GitHub Pages, Netlify, a USB stick).
export default defineConfig({
  base: './',
  define: { __DATA_V__: JSON.stringify(dataVersion()) },
  build: { chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
  server: { host: true },
});
