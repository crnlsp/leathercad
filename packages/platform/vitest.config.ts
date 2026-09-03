import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'platform',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest.setup.ts'],
  },
});
