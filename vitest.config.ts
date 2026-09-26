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
      // Test support that lives in src/ beside what it serves, and is run only
      // by the performance step the coverage run leaves out (Q6). Counting it
      // reported a file of fixtures as 0 % covered production code.
      exclude: ['packages/domain/src/workloads.ts'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
});
