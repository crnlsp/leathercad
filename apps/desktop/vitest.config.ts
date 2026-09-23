import { defineConfig } from 'vitest/config';

// The first unit tests in the app (F.4). Like every package, tests come only
// from src/ — tsc also emits them into dist/, and a compiled copy run from
// there cannot find what it reads beside it.
export default defineConfig({
  test: {
    name: '@leathercad/desktop',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest.setup.ts'],
  },
});
