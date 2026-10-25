import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `tsc --build` emits `dist/src/*.bench.js`, and Vitest's default bench glob
 * finds it: every case ran twice (30, not 15). A package that has benchmarks
 * must say, in its own Vitest config, that only `src/` holds them (PERF-017).
 */
const packages = join(import.meta.dirname, '../../../packages');

describe('benchmark discovery', () => {
  const withBenches = readdirSync(packages).filter((name) =>
    readdirSync(join(packages, name, 'src'), { withFileTypes: true }).some((e) =>
      e.name.endsWith('.bench.ts'),
    ),
  );

  it('finds the packages that hold benchmarks', () => {
    expect(withBenches).toEqual(['domain', 'export', 'geometry', 'persist']);
  });

  it.each(withBenches)('%s restricts benchmarks to src/', (name) => {
    const config = readFileSync(join(packages, name, 'vitest.config.ts'), 'utf8');
    expect(config).toContain("benchmark: { include: ['src/**/*.bench.ts'] }");
  });
});
