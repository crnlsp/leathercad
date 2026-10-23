import { defineConfig } from '@playwright/test';

// The update check (8.9) never asks GitHub from a test: the app is pointed at
// a port nothing listens on, so a check a test asks for fails at once and says so
// quietly. e2e/updates.spec.ts answers it from a server of its own.
process.env['LEATHERCAD_RELEASES_URL'] ??= 'http://127.0.0.1:9/';

/**
 * The README's screenshots and demo, taken from the real app. Not a test
 * suite: run through `pnpm docs:media`, which builds first. See
 * e2e/media/readme.spec.ts.
 */
export default defineConfig({
  testDir: './e2e/media',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
