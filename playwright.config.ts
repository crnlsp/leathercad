import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Each has its own config and command: pixel diffs run in a pinned
  // container (`pnpm test:visual`), and the packaged smoke test needs a
  // packaged build (`pnpm test:packaged`).
  testIgnore: ['**/visual/**', '**/packaged/**'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Electron instances are heavyweight and contend for the display; one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
});
