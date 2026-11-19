import { defineConfig } from '@playwright/test';

// The update check (8.9) never asks GitHub from a test: the app is pointed at
// a port nothing listens on, so a check a test asks for fails at once and says so
// quietly. e2e/updates.spec.ts answers it from a server of its own.
process.env['LEATHERCAD_RELEASES_URL'] ??= 'http://127.0.0.1:9/';

export default defineConfig({
  testDir: './e2e',
  // Each has its own config and command: pixel diffs run in a pinned
  // container (`pnpm test:visual`), the packaged smoke test needs a packaged
  // build (`pnpm test:packaged`), and the README's pictures are taken on
  // demand (`pnpm docs:media`).
  testIgnore: ['**/visual/**', '**/packaged/**', '**/media/**'],
  // The run's temp directory, removed when it ends (e2e/tempRoot.ts), and off
  // the developer's screen on Linux (e2e/virtualScreen.ts).
  globalSetup: ['./e2e/tempRoot.ts', './e2e/virtualScreen.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Electron instances are heavyweight and contend for the display; one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  // On CI each shard also writes a blob, which ci.yml's `e2e-report` merges
  // into one HTML report.
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github'], ['blob']],
});
