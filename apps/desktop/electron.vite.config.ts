import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

import { devServerCsp } from './src/csp/devServerCsp.js';
import { thirdPartyNotices } from './src/notices/thirdPartyNotices.js';

// Uses electron-vite's default layout: src/main/index.ts, src/preload/index.ts,
// src/renderer/index.html.
//
// @leathercad/platform is imported for types only, so nothing from the
// workspace ends up in the main or preload bundles.

const ROOT = resolve(import.meta.dirname, '../..');
const rootManifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
};

// The typeface is vendored rather than bundled from node_modules (ADR 0011):
// its woff files are the interface's type, and its outlines are every string
// on a printed pattern. It is recorded here because no module id shows it.
const notices = thirdPartyNotices({
  vendored: [
    {
      name: 'IBM Plex Sans',
      version: rootManifest.devDependencies['@ibm/plex-sans'] ?? '',
      license: 'OFL-1.1',
      homepage: 'https://github.com/IBM/plex',
      note: 'The interface typeface, and the glyph outlines of every string on a printed pattern.',
      text: readFileSync(resolve(ROOT, 'assets/fonts/OFL.txt'), 'utf8').trim(),
    },
  ],
});

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), notices.collect('main')],
  },
  preload: {
    plugins: [externalizeDepsPlugin(), notices.collect('preload')],
  },
  renderer: {
    plugins: [
      react(),
      devServerCsp(),
      notices.collect('renderer'),
      notices.write(['main', 'preload']),
    ],
  },
});
