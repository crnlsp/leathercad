import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@leathercad/typography',
    // Only the sources: `tsc --build` also emits compiled copies into dist/.
    include: ['src/**/*.test.ts'],
    // The shared setup pins the property-test seed in CI (docs/testing.md §3.3).
    setupFiles: ['../../vitest.setup.ts'],
    testTimeout: 30_000,
  },
});
