import { defineConfig } from '@playwright/test';

// The update check (8.9) never asks GitHub from a test: the app is pointed at
// a port nothing listens on, so a start's check fails at once and says so
// quietly. e2e/updates.spec.ts answers it from a server of its own.
process.env['LEATHERCAD_RELEASES_URL'] ??= 'http://127.0.0.1:9/';

/**
 * The smoke test for the packaged app. See e2e/packaged/packaged.spec.ts.
 *
 * Needs `pnpm package:e2e` first, which builds the unpacked app with the one
 * fuse Playwright needs. `pnpm test:packaged` does both.
 */
export default defineConfig({
  testDir: './e2e/packaged',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
});
