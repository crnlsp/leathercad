import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],

    // Determinism. See docs/testing.md §8 — golden tests, SVG snapshots and
    // byte-stable saves all depend on these being pinned.
    env: {
      TZ: 'UTC',
      LC_ALL: 'en_GB.UTF-8',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Thresholds are enforced only where correctness is invisible to the eye.
      // docs/testing.md §7 explains why UI packages are deliberately excluded.
      include: ['packages/core/src/**', 'packages/geometry/src/**', 'packages/domain/src/**'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
});
