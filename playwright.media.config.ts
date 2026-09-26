import { defineConfig } from '@playwright/test';

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
