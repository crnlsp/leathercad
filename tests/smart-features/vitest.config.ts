import { defineConfig } from 'vitest/config';

// The Smart Features scenario suite (docs/smart-features.md): realistic
// projects built with the app's own commands, each checked against the whole
// diagnostic list it should produce — what must be said and what must not.
export default defineConfig({
  test: {
    name: 'smart-features',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest.setup.ts'],
    testTimeout: 30_000,
  },
});
