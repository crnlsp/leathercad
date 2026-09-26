import { defineConfig } from 'vitest/config';

// The first unit tests in the app (F.4). Like every package, tests come only
// from src/ — tsc also emits them into dist/, and a compiled copy run from
// there cannot find what it reads beside it.
export default defineConfig({
  test: {
    name: '@leathercad/desktop',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest.setup.ts'],
    // As every package has it: a property test plays hundreds of cases, and
    // under coverage on a CI runner that outlasts the 5 s default (the
    // command round-trip property, 8.2).
    testTimeout: 30_000,
  },
});
