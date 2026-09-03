import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Uses electron-vite's default layout: src/main/index.ts, src/preload/index.ts,
// src/renderer/index.html.
//
// @leathercad/platform is imported for types only, so nothing from the
// workspace ends up in the main or preload bundles.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
