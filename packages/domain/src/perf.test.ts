import { PathOps, uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
import { evaluate, resolvedFeatures } from './evaluate.js';
import { validate } from './validate.js';
import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';

/**
 * A long strap stitched both sides reaches a few thousand holes in real use,
 * and `product-spec.md` §7 budgets a chain regeneration at under 50 ms.
 *
 * Measured rather than assumed: the distribution computes each position as
 * `start + k x pitch` from the index, so it is linear, but the offset and the
 * corner split in front of it are not obviously so.
 */
function strap(widthMm: number, cutOuts = 0): Project {
  const features: Feature[] = [
    {
      id: 'cut-1',
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: {
        kind: 'shape',
        shape: {
          type: 'rect',
          origin: { x: 0, y: 0 },
          width: widthMm,
          height: 40,
          radii: uniformRadii(0),
          rotation: 0,
        },
      },
    },
    {
      id: 'stitch-1',
      kind: 'stitch-line',
      name: 'Stitch line',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'cut-1',
        op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
      },
    },
    {
      id: 'holes-1',
      kind: 'stitch-hole-set',
      name: 'Stitch holes',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'stitch-1',
        op: {
          type: 'stitch-holes',
          pitchMm: 3.85,
          mode: 'fit-whole',
          corners: 'hole-at-corner',
        },
      },
    },
  ];

  // Keeper slots down the strap. Each one is another edge every hole has to
  // be measured against, which is the part of validation that grows.
  for (let i = 0; i < cutOuts; i++) {
    features.push({
      id: `slot-${i}`,
      kind: 'cut-contour',
      role: 'inner',
      name: `Slot ${i}`,
      visible: true,
      locked: false,
      source: {
        kind: 'shape',
        shape: { type: 'circle', centre: { x: 100 + i * 60, y: 20 }, radius: 5 },
      },
    });
  }

  const part: Part = { id: 'part-1', name: 'Strap', quantity: 1, features };
  return { id: 'p', name: 'Strap', settings: DEFAULT_SETTINGS, parts: [part] };
}

/**
 * A pattern traced by hand rather than built from shapes.
 *
 * The heavy case on purpose: every hole is measured against every segment of
 * the outline, so a 500-point trace is where the cost actually shows. Nobody
 * has said this shape has to be fast — the point is to know what it costs.
 */
function tracedOutline(points: number): Project {
  const outline = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    return { x: 300 + 290 * Math.cos(angle), y: 300 + 290 * Math.sin(angle) };
  });

  const features: Feature[] = [
    {
      id: 'cut-1',
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: { kind: 'path', path: PathOps.polyline(outline, true) },
    },
    {
      id: 'stitch-1',
      kind: 'stitch-line',
      name: 'Stitch line',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'cut-1',
        op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
      },
    },
    {
      id: 'holes-1',
      kind: 'stitch-hole-set',
      name: 'Stitch holes',
      visible: true,
      locked: false,
      source: {
        kind: 'derived',
        sourceId: 'stitch-1',
        op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
      },
    },
  ];

  const part: Part = { id: 'part-1', name: 'Traced', quantity: 1, features };
  return { id: 'p', name: 'Traced', settings: DEFAULT_SETTINGS, parts: [part] };
}

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
