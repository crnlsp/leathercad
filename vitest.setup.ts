import fc from 'fast-check';

/**
 * Shared test configuration.
 *
 * A property test that picks a new seed every run is a test that passes by
 * luck: a real counterexample surfaces once, fails CI, and then vanishes on
 * re-run. Pinning the seed in CI makes failures reproducible, while local runs
 * stay random so they keep hunting for new cases.
 *
 * Two variables override both, for the nightly deep run and for reproducing
 * what it finds:
 *
 * - `LEATHERCAD_FC_RUNS` sets `numRuns` for every property that does not set
 *   its own;
 * - `LEATHERCAD_FC_SEED` sets the seed. The nightly job picks one at random
 *   and prints it, so a failure it reports reproduces with the same two
 *   variables on any machine.
 *
 * See docs/testing.md §3.3.
 */
const isCi = process.env['CI'] !== undefined;
const runs = process.env['LEATHERCAD_FC_RUNS'];
const seed = process.env['LEATHERCAD_FC_SEED'];

fc.configureGlobal({
  numRuns: runs !== undefined ? Number(runs) : isCi ? 300 : 100,
  ...(seed !== undefined ? { seed: Number(seed) } : isCi ? { seed: 0x1eaf } : {}),
});
