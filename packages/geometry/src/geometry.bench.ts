import { test, type Bench } from 'vitest';

import { offsetPath } from './ops/offset.js';
import { PathMeasure } from './path/measure.js';
import { polyline } from './path/index.js';
import { roundedRect, uniformRadii } from './shapes.js';

/**
 * The geometry every edit runs through: offsetting a cut edge into a stitch
 * line, and measuring the line to place holes on it. Both outlines wind
 * counter-clockwise, so a positive distance is inward.
 *
 * A trend, not a gate. `perf.test.ts` in the domain package holds the loose
 * ceilings that do fail. See docs/testing.md §9.
 */

/**
 * One workload, three ways, chosen by `LEATHERCAD_BENCH`. Unset, it just runs.
 * `baseline` writes the result to `bench/<slug>.json` in this package.
 * `compare` runs it beside that committed baseline. `pnpm bench`,
 * `pnpm bench:baseline` and `pnpm bench:compare` set it. A baseline compares
 * only on the machine that recorded it. Repeated in each package's bench file,
 * because a package cannot import another's internals.
 */
function measure(bench: Bench, slug: string, fn: () => unknown): Promise<unknown> {
  const mode = process.env['LEATHERCAD_BENCH'];
  const file = `./bench/${slug}.json`;
  return mode === 'compare'
    ? bench.compare(bench('now', fn), bench.from('baseline', file))
    : bench('now', mode === 'baseline' ? { writeResult: file } : {}, fn).run();
}

const strapOutline = roundedRect({ x: 0, y: 0 }, 5800, 40, uniformRadii(6));

const traced = polyline(
  Array.from({ length: 500 }, (_, i) => {
    const angle = (i / 500) * Math.PI * 2;
    return { x: 300 + 290 * Math.cos(angle), y: 300 + 290 * Math.sin(angle) };
  }),
  true,
);
const measured = new PathMeasure(traced);
const length = measured.totalLength();

test('offset a 5.8 m rounded strap 3.5 mm inward', ({ bench }) =>
  measure(bench, 'offset-strap', () => offsetPath(strapOutline, 3.5, { join: 'round' })));

test('offset a 500-point traced outline 3.5 mm inward', ({ bench }) =>
  measure(bench, 'offset-traced', () => offsetPath(traced, 3.5, { join: 'round' })));

test('build the measure table for a 500-point outline', ({ bench }) =>
  measure(bench, 'measure-build', () => new PathMeasure(traced)));

test('place 3000 points along a 500-point outline', ({ bench }) =>
  measure(bench, 'measure-3000', () => {
    for (let k = 0; k < 3000; k++) measured.pointAtDistance((k / 3000) * length);
  }));
