import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The benchmarks `pnpm bench` runs are the ones committed, each once, and each
 * with a baseline that says what recorded it (PERF-017).
 *
 * `tsc --build` emits `dist/src/*.bench.js`, and Vitest's default bench glob
 * finds it: every case ran twice (30, not 15). So a package's own Vitest
 * config says that only `src/` holds benchmarks. And a baseline is only a
 * number with what it was recorded on: docs/testing.md §9.1 keeps a row for
 * each.
 */
const root = join(import.meta.dirname, '../../..');
const packages = join(root, 'packages');
const testingDoc = join(root, 'docs/testing.md');

interface BenchmarkRun {
  /** Every file the bench projects would run, from the root. */
  readonly files: readonly string[];
  /** How many cases each of those files declares, collected by running it. */
  readonly cases: Readonly<Record<string, number>>;
  /** Each generated `dist/` copy of a benchmark a bench project would also run. */
  readonly generated: readonly string[];
}

/**
 * Asks Vitest itself, as `vitest bench` sets it up, in a process of its own:
 * one inside a test worker would be Vitest within Vitest. Collecting imports
 * each file and counts the cases it declares without running any; a loop of
 * cases counts as many as it makes.
 */
function benchmarkRun(): BenchmarkRun {
  const script = `
    import { readdirSync } from 'node:fs';
    import { join, relative } from 'node:path';
    import { createVitest } from 'vitest/node';
    const posix = (path) => relative(process.cwd(), path).replaceAll('\\\\', '/');
    const vitest = await createVitest('test', {
      watch: false,
      benchmarkOnly: true,
      config: 'vitest.config.ts',
    });
    try {
      const specifications = await vitest.globTestSpecifications();
      const { testModules } = await vitest.collect(undefined, { staticParse: false });
      const generated = vitest.projects.flatMap((project) =>
        readdirSync(join(project.config.root, 'src'))
          .filter((name) => name.endsWith('.bench.ts'))
          .map((name) => join(project.config.root, 'dist/src', name.replace(/ts$/, 'js')))
          .filter((path) => project.matchesTestGlob(path)),
      );
      console.log(JSON.stringify({
        files: specifications.map((s) => posix(s.moduleId)),
        cases: Object.fromEntries(
          testModules.map((m) => [posix(m.moduleId), [...m.children.allTests()].length]),
        ),
        generated: generated.map(posix),
      }));
    } finally {
      await vitest.close();
    }
  `;
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8',
  });
  return JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as BenchmarkRun;
}

describe('benchmark discovery', () => {
  const withBenches = readdirSync(packages).filter((name) =>
    readdirSync(join(packages, name, 'src'), { withFileTypes: true }).some((e) =>
      e.name.endsWith('.bench.ts'),
    ),
  );
  const sources = withBenches.flatMap((name) =>
    readdirSync(join(packages, name, 'src'))
      .filter((file) => file.endsWith('.bench.ts'))
      .map((file) => `packages/${name}/src/${file}`),
  );
  const baselines = (name: string): string[] =>
    readdirSync(join(packages, name, 'bench'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length));

  it('finds the packages that hold benchmarks', () => {
    expect(withBenches).toEqual(['domain', 'editor', 'export', 'geometry', 'persist']);
  });

  describe('as `pnpm bench` runs them', () => {
    // One collection for the three below: it imports every benchmark.
    let run: BenchmarkRun | undefined;
    const ran = (): BenchmarkRun => (run ??= benchmarkRun());

    it('runs every committed benchmark file, each once', { timeout: 120_000 }, () => {
      expect(ran().files.toSorted()).toEqual(sources.toSorted());
    });

    it('would not run a generated dist/ copy of one', { timeout: 120_000 }, () => {
      // Asked of each bench project's own globs, so it holds whether or not
      // `tsc --build` has emitted `dist/` on this machine.
      expect(ran().generated).toEqual([]);
    });

    it.each(withBenches)(
      '%s runs a case for each committed baseline, and no fewer',
      { timeout: 120_000 },
      (name) => {
        // Each case compares with its own `bench/<slug>.json`, so the two
        // counts are equal; a case deleted, or a file that stopped declaring
        // its cases, leaves a baseline nothing compares with.
        const declared = Object.entries(ran().cases)
          .filter(([file]) => file.startsWith(`packages/${name}/`))
          .reduce((sum, [, count]) => sum + count, 0);
        expect(declared).toBe(baselines(name).length);
      },
    );
  });

  it('records every committed baseline in docs/testing.md, and no other', () => {
    const committed = withBenches.flatMap((name) =>
      baselines(name).map((slug) => `${name}/${slug}`),
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
