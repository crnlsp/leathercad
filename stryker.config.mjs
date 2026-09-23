/**
 * Mutation testing for the pure layers. See ADR 0016 and docs/testing.md §3.4.
 *
 * Coverage says a line ran. A mutant — `<` turned into `<=`, a `+` into a `-`,
 * a branch forced true — says whether any test would have noticed if that line
 * were wrong. That is the question this codebase's characteristic failure asks:
 * plausible-but-wrong geometry that every test executes and none checks.
 *
 * Slow by nature: every surviving mutant is a full re-run of the tests that
 * cover it. So it runs weekly in CI and on demand locally, never per push.
 *
 *   pnpm test:mutation:geometry
 *   pnpm test:mutation:domain
 *   pnpm test:mutation:geometry --mutate src/ops/offset.ts
 *
 * One package per run, each against its own Vitest config, so the setup file
 * and timeouts are exactly the ones `pnpm test` uses.
 *
 * Vitest 5 needs a patch to the runner until stryker-js#6210 ships: see
 * `patches/` and ADR 0016. Without it every covered mutant is reported as
 * surviving, because the runner's test-name filter matches nothing.
 *
 * `inPlace` rather than Stryker's copied sandbox: pnpm keeps each package's
 * links in that package's own node_modules, and the sandbox links only the
 * root one. The sandbox was not tried. Stryker restores every file when it
 * finishes or is interrupted; after a hard kill, `git status` shows anything
 * left behind.
 */
import { basename } from 'node:path';

// Run from inside the package, so its own vitest.config.ts resolves its paths
// exactly as `pnpm test` does. The scripts `cd` there first.
const PACKAGE = basename(process.cwd());
const REPORTS = `../../reports/mutation/${PACKAGE}`;

export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.config.ts' },
  inPlace: true,
  mutate: [
    'src/**/*.ts',
    '!**/*.test.ts',
    '!**/*.bench.ts',
    '!src/workloads.ts',
    // Words for the user, not logic. A mutated sentence is caught by a
    // snapshot or by nobody, and either way it is not what this measures.
    '!src/problems/messages.ts',
  ],
  coverageAnalysis: 'perTest',
  incremental: true,
  incrementalFile: `${REPORTS}/incremental.json`,
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: `${REPORTS}/index.html` },
  jsonReporter: { fileName: `${REPORTS}/mutation.json` },
  // Informational until the first full report sets a baseline to hold. A
  // break threshold chosen before measuring would be a guess.
  thresholds: { high: 80, low: 60, break: null },
  concurrency: 4,
  timeoutMS: 30_000,
  tempDirName: '.stryker-tmp',
};
