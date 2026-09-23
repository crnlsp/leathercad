import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
import { evaluate, resolvedFeatures } from './evaluate.js';
import { validate } from './validate.js';
import type { Project } from './feature.js';
import { strap, tracedOutline } from './workloads.js';

/** Milliseconds for one cold `diagnose` — the memo is per project object. */
function timeDiagnose(project: Project): number {
  const started = performance.now();
  diagnose(project);
  return performance.now() - started;
}

describe('regeneration budget', () => {
  it('rebuilds a chain of three thousand holes well inside 50 ms', () => {
    // ~11.6 m of stitch line at 3.85 mm — a long strap stitched both sides.
    const project = strap(5800);

    const started = performance.now();
    const resolved = [...resolvedFeatures(evaluate(project))];
    const elapsed = performance.now() - started;

    const holes = resolved.find((f) => f.feature.id === 'holes-1')?.holes;
    expect(holes).toBeDefined();
    expect(holes!.count).toBeGreaterThan(3000);
    expect(elapsed).toBeLessThan(50);
  });
});

/**
 * What the UI actually waits for.
 *
 * `evaluate` above is half the story: the panel reads `diagnose`, which is
 * evaluation **and** validation, memoised per project object — so every edit
 * pays for both. Slice 4.3a put the material rules in the second half, and
 * they are O(holes x edge segments): each hole is asked whether it is on the
 * leather and how far from the nearest edge, against the outline and every
 * cut-out.
 *
 * Measured, not budgeted. The numbers are a baseline recorded on the 4.3a
 * review machine — 13 ms for the strap, 24 ms with twenty slots, 70 ms for the
 * traced outline, of which 42 ms is validation — so a regression is visible,
 * rather than a promise to anybody:
 * `product-spec.md` §7 budgets chain regeneration, and whether validation
 * belongs inside that budget is a decision for 4.3b or later, once there is
 * something to decide it with. The ceilings asserted here are deliberately
 * loose: they catch an order of magnitude, not a percentage.
 */
describe('what an edit costs the panel', () => {
  it.each([
    // ~13 ms measured.
    { what: 'a strap of 3000 holes', project: () => strap(5800), ceilingMs: 200 },
    // ~24 ms: each slot is another edge every hole is measured against.
    { what: 'the same strap with 20 slots', project: () => strap(5800, 20), ceilingMs: 200 },
    // ~70 ms, over the §7 budget and deliberately not held to it — see above.
    { what: 'a 500-point traced outline', project: () => tracedOutline(500), ceilingMs: 500 },
  ])('$what', ({ project, ceilingMs }) => {
    expect(timeDiagnose(project())).toBeLessThan(ceilingMs);
  });

  it('spends real time in validation, not only in evaluation', () => {
    // The half that 4.3a made expensive, stated as a test so it stops being
    // true loudly rather than quietly. Measured at ~42 ms of validation
    // against ~24 ms of evaluation on the review machine; the bound is well
    // under that ratio, because the claim is "validation is not noise".
    const project = tracedOutline(500);

    const startedEval = performance.now();
    const resolved = evaluate(project);
    const evaluateMs = performance.now() - startedEval;

    const startedValidate = performance.now();
    validate(resolved);
    const validateMs = performance.now() - startedValidate;

    expect([...resolvedFeatures(resolved)].length).toBe(3);
    expect(validateMs).toBeGreaterThan(evaluateMs * 0.5);
  });
});
