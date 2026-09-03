import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'geometry',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest.setup.ts'],
  },
});
