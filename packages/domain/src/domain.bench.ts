import { test, type Bench } from 'vitest';

import { diagnose } from './diagnose.js';
import { evaluate } from './evaluate.js';
import { seamedBag, strap, tracedOutline } from './workloads.js';
import { resolveSeam, seamVerdict } from './seams.js';

/**
 * What one edit costs: evaluation alone, and `diagnose` — evaluation plus
 * validation — which is what the panels wait for. The same workloads
 * `perf.test.ts` holds to ceilings, measured here as a trend instead.
 *
 * `diagnose` memoises per project object, so each iteration builds a fresh
 * project. The build is a few hundred allocations, noise against the work.
 */

/** One workload, three ways. See `measure` in packages/geometry/src/geometry.bench.ts. */
function measure(bench: Bench, slug: string, fn: () => unknown): Promise<unknown> {
  const mode = process.env['LEATHERCAD_BENCH'];
  const file = `./bench/${slug}.json`;
  return mode === 'compare'
    ? bench.compare(bench('now', fn), bench.from('baseline', file))
    : bench('now', mode === 'baseline' ? { writeResult: file } : {}, fn).run();
}

test('evaluate a strap of 3000 holes', ({ bench }) =>
  measure(bench, 'evaluate-strap', () => evaluate(strap(5800))));

test('evaluate a 500-point traced outline', ({ bench }) =>
  measure(bench, 'evaluate-traced', () => evaluate(tracedOutline(500))));

test('diagnose a strap of 3000 holes', ({ bench }) =>
  measure(bench, 'diagnose-strap', () => diagnose(strap(5800))));

test('diagnose the same strap with 20 slots', ({ bench }) =>
  measure(bench, 'diagnose-strap-slots', () => diagnose(strap(5800, 20))));

test('diagnose a 500-point traced outline', ({ bench }) =>
  measure(bench, 'diagnose-traced', () => diagnose(tracedOutline(500))));

test('resolve forty seams after an unrelated edit (9.6a)', ({ bench }) => {
  const project = seamedBag();
  return measure(bench, 'resolve-seams-unrelated', () => {
    const edited = { ...project };
    for (const seam of edited.seams ?? []) resolveSeam(edited, seam);
  });
});

test('check forty seams after an unrelated edit (9.6b)', ({ bench }) => {
  const project = seamedBag();
  for (const seam of project.seams ?? []) seamVerdict(project, seam);
  return measure(bench, 'check-seams-unrelated', () => {
    const edited = { ...project };
    for (const seam of edited.seams ?? []) seamVerdict(edited, seam);
  });
});
