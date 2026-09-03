import fc from 'fast-check';

/**
 * Shared test configuration.
 *
 * A property test that picks a new seed every run is a test that passes by
 * luck: a real counterexample surfaces once, fails CI, and then vanishes on
 * re-run. Pinning the seed in CI makes failures reproducible, while local runs
 * stay random so they keep hunting for new cases.
 *
 * See docs/testing.md §3.3.
 */
const isCi = process.env['CI'] !== undefined;

fc.configureGlobal({
  numRuns: isCi ? 300 : 100,
  ...(isCi ? { seed: 0x1eaf } : {}),
});
