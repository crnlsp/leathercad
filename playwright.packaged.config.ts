import { defineConfig } from '@playwright/test';

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
