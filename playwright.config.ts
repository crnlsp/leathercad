import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

// Every app a test launches keeps its preferences and recent projects (8.2)
// here — never in the developer's own ~/.config/leathercad, and never carried
// from one run into the next. Tests that change a preference launch with a
// directory of their own as well, so the order they run in cannot matter.
process.env['XDG_CONFIG_HOME'] = mkdtempSync(join(tmpdir(), 'leathercad-e2e-config-'));

export default defineConfig({
  testDir: './e2e',
  // Each has its own config and command: pixel diffs run in a pinned
  // container (`pnpm test:visual`), the packaged smoke test needs a packaged
  // build (`pnpm test:packaged`), and the README's pictures are taken on
  // demand (`pnpm docs:media`).
  testIgnore: ['**/visual/**', '**/packaged/**', '**/media/**'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Electron instances are heavyweight and contend for the display; one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
});
