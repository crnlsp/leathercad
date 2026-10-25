import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'geometry',
    include: ['src/**/*.test.ts'],
    // tsc --build also emits dist/src/*.bench.js; only the sources are benchmarks (PERF-017).
    benchmark: { include: ['src/**/*.bench.ts'] },
    setupFiles: ['../../vitest.setup.ts'],
    // Property tests run 300 cases in CI; the 5s default is not enough headroom.
    testTimeout: 30_000,
  },
});
