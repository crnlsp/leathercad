import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `tsc --build` emits `dist/src/*.bench.js`, and Vitest's default bench glob
 * finds it: every case ran twice (30, not 15). A package that has benchmarks
 * must say, in its own Vitest config, that only `src/` holds them (PERF-017).
 *
 * And a baseline is only a number with what it was recorded on: docs/testing.md
 * §9.1 keeps a row for each, which this holds to the files committed.
 */
const packages = join(import.meta.dirname, '../../../packages');
const testingDoc = join(import.meta.dirname, '../../../docs/testing.md');

describe('benchmark discovery', () => {
  const withBenches = readdirSync(packages).filter((name) =>
    readdirSync(join(packages, name, 'src'), { withFileTypes: true }).some((e) =>
      e.name.endsWith('.bench.ts'),
    ),
  );

  it('finds the packages that hold benchmarks', () => {
    expect(withBenches).toEqual(['domain', 'editor', 'export', 'geometry', 'persist']);
  });

  it.each(withBenches)('%s restricts benchmarks to src/', (name) => {
    const config = readFileSync(join(packages, name, 'vitest.config.ts'), 'utf8');
    expect(config).toContain("benchmark: { include: ['src/**/*.bench.ts'] }");
  });

  it('records every committed baseline in docs/testing.md, and no other', () => {
    const committed = withBenches.flatMap((name) =>
      readdirSync(join(packages, name, 'bench'))
        .filter((file) => file.endsWith('.json'))
        .map((file) => `${name}/${file.slice(0, -'.json'.length)}`),
    );
    const doc = readFileSync(testingDoc, 'utf8');
    const section = doc.slice(doc.indexOf('### 9.1'), doc.indexOf('\n## ', doc.indexOf('### 9.1')));
    // The first cell of each row of the section's table names its baselines.
    const recorded = section
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .flatMap((row) => [...(row.split('|')[1] ?? '').matchAll(/`([a-z]+\/[a-z0-9-]+)`/g)])
      .map((match) => match[1]);

    expect(recorded.toSorted()).toEqual(committed.toSorted());
  });
});
