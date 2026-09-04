import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'editor',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest.setup.ts'],
    testTimeout: 30_000,
  },
});
