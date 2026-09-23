import { defineConfig } from '@playwright/test';

/**
 * Pixel diffs of the running app. See docs/testing.md §5.2.
 *
 * Run through `pnpm test:visual`, never directly: `tools/visual.mjs` puts
 * Playwright inside the official Playwright image at the exact version in the
 * lockfile, so a laptop and CI rasterise identically. Screenshots taken
 * anywhere else differ in font hinting and anti-aliasing, and a suite that
 * fails on those gets deleted.
 */
export default defineConfig({
  testDir: './e2e/visual',
  // One set of references, no platform suffix: there is only one platform
  // that takes them, the container.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
  expect: {
    toHaveScreenshot: {
      // Identical rasterisation is the premise of the container. Any pixel
      // that moves is a change someone should look at.
      maxDiffPixels: 0,
      animations: 'disabled',
      caret: 'hide',
    },
  },
});
