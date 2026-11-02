import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'export',
    include: ['src/**/*.test.ts'],
    // tsc --build also emits dist/src/*.bench.js; only the sources are benchmarks (PERF-017).
    benchmark: { include: ['src/**/*.bench.ts'] },
    setupFiles: ['../../vitest.setup.ts'],
    testTimeout: 30_000,
  },
});
