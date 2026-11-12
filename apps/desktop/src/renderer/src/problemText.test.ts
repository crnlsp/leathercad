import {
  PROBLEM_CODES,
  problem,
  type Problem,
  type ProblemCode,
  type ProblemFacts,
} from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import {
  describeProblem,
  describeProblemWithSubject,
  problemExplanation,
  problemTitle,
} from './problemText.js';

/**
 * The problem catalogue in English (ADR 0018): every code has words, and the
 * words the app showed before they moved here from the domain are the same
 * words. E2E reads some of them off the screen.
 */

const { t } = createI18n('en');

const named = { featureId: 'f-1', featureName: 'Stitch line' };

/** One sample per code, typed over every code: a code without one does not compile. */
const SAMPLES: { readonly [K in ProblemCode]: ProblemFacts[K] } = {
  SEAM_REQUIRES_CLOSED_LINE: { seamId: 's-1', holeSetId: 'f-1' },
  SEAM_HOLE_COUNT_MISMATCH: {
    seamId: 's-1',
    a: {
      holeSetId: 'f-1',
      stretch: { kind: 'whole' },
      partId: 'p-1',
      partName: 'Pocket',
      count: 11,
      lengthMm: 40,
    },
    b: {
      holeSetId: 'f-2',
      stretch: { kind: 'whole' },
      partId: 'p-2',
      partName: 'Outer',
      count: 10,
      lengthMm: 41,
    },
    driftMm: 1,
    worstPair: 10,
  },
  SEAM_HOLES_DRIFT: {
    seamId: 's-1',
    a: {
      holeSetId: 'f-1',
      stretch: { kind: 'whole' },
      partId: 'p-1',
      partName: 'Pocket',
      count: 11,
      lengthMm: 40,
    },
    b: {
      holeSetId: 'f-2',
      stretch: { kind: 'whole' },
      partId: 'p-2',
      partName: 'Outer',
      count: 10,
      lengthMm: 41,
    },
    driftMm: 1,
    worstPair: 10,
  },
  SEAM_NOT_A_HOLE_SET: { seamId: 's-1', holeSetId: 'f-1' },
  SEAM_HAS_NO_LENGTH: { seamId: 's-1' },
  SEAM_SIDE_MISSING: { seamId: 's-1', holeSetId: 'f-1' },
  SEAM_RUNS_OFF_THE_LINE: { seamId: 's-1', holeSetId: 'f-1', lengthMm: 40, availableMm: 20 },
  DUPLICATE_ID: { featureId: 'f-1' },
  SOURCE_MISSING: named,
  FOLLOWS_ITSELF: named,
  WOULD_LOOP: { ...named, sourceId: 'f-2', sourceName: 'Outline' },
  CYCLE: named,
  DERIVATION_INCOMPATIBLE: { ...named, rule: 'holes-need-stitch-line' },
  PART_ALREADY_HAS_OUTER: { ...named, partName: 'Panel', outerName: 'Outline' },
  CONTOUR_NOT_CLOSED: { ...named, role: 'outer', closable: true },
  FEATURE_LOCKED: named,

  FEATURE_MISSING: { featureId: 'f-1' },
  NOT_DERIVED: named,
  NOT_A_DRAWN_PATH: named,
  NOT_A_SHAPE: named,
  HOLE_STAYS_ROUND: named,
  POINT_EDIT_DEGENERATE: named,
  ROUNDING_DOES_NOT_FIT: { ...named, radiusMm: 60 },
  NOT_A_ROUNDED_CORNER: named,
  FIX_NO_LONGER_APPLIES: { why: 'changed' },
  CORNER_IN_USE: { ...named, usedByName: 'Stitch line' },
  DERIVED_MOVED_ALONE: { ...named, rootId: 'f-2', rootName: 'Outline' },
  MIRROR_WOULD_SCALE: { ...named, sourceName: 'Outline' },
  MIRROR_NO_AXIS: {},
  DIMENSION_NOT_MIRRORED: named,
  MIRROR_FOLD_MISSING: { ...named, foldId: 'f-9' },
  MEASURE_REF_MISSING: named,
  MEASURE_NEEDS_ANCHOR: {},
  MEASURE_ACROSS_PARTS: { otherPartName: 'Back' },
  FOLLOWS_ANOTHER_PART: { ...named, sourceName: 'Outline', otherPartName: 'Back' },
  MIRROR_OUTLINE_ACROSS_FOLD: { ...named, partName: 'Shell' },
  MIRROR_PLACED_BY_FOLD: { ...named, foldName: 'Fold', sourceName: 'Card slot' },
  FOLD_NOT_STRAIGHT: {},
  TRANSFORM_FLATTENS: {},
  WOULD_BECOME_ELLIPSE: { shape: 'circle' },
  WOULD_SHEAR: {},
  TEXT_WOULD_DISTORT: {},
  TEXT_WOULD_READ_BACKWARDS: {},
  NO_TARGET_PART: { what: 'line' },
  TARGET_SPANS_PARTS: { what: 'line' },
  PARAMETER_INVALID: { ...named, parameter: 'width', requirement: 'finite', value: Number.NaN },
  OFFSET_COLLAPSED: { ...named, distanceMm: 60, side: 'inward' },
  OFFSET_UNSUPPORTED: named,
  OFFSET_SPLIT: { ...named, droppedPieces: 2 },
  ANCHOR_MISSING: { ...named, anchor: 9, available: 4 },
  SOURCE_FAILED: { ...named, sourceId: 'f-2', sourceName: 'Outline' },
  GEOMETRY_FAILED: { ...named, detail: 'something the geometry layer said' },
  TEXT_GLYPH_MISSING: {
    partId: 'p-1',
    partName: 'Gusset',
    featureId: 'f-1',
    featureName: 'Label',
    text: '漢',
    characters: '漢',
  },
  CONTOUR_SELF_INTERSECTS: { featureId: 'f-1', featureName: 'Outline', crossings: 1 },
  TEXT_TOO_SMALL_TO_PRINT: { ...named, capHeightMm: 1.047, minimumMm: 1.5 },
  HOLES_OVERLAP: { ...named, spacingMm: 3.2, diameterMm: 4 },
  HOLE_SPACING_DEVIATION: { ...named, achievedMm: 5, pitchMm: 3.85 },
  HOLE_SPACING_UNEVEN: { ...named, narrowestMm: 3.7, widestMm: 4.1 },
  HOLE_COUNT_TOO_LOW: { ...named, count: 1 },
  EMPTY_PART: { partId: 'p-1', partName: 'Gusset' },
  PART_HAS_NO_OUTER_CONTOUR: { partId: 'p-1', partName: 'Gusset' },
  CUT_OUT_OUTSIDE_PART: { featureId: 'f-1', featureName: 'Card slot' },
  OUTSIDE_PART: { ...named, what: 'holes' },
  HOLE_TOO_CLOSE_TO_EDGE: { ...named, clearanceMm: 0.8, minimumMm: 1.5 },
  POCKET_TOO_NARROW: { ...named, content: 'id-1', widthMm: 89, neededMm: 89.6, easeMm: 4 },
  POCKET_TOO_SHALLOW: { ...named, content: 'size', depthMm: 44.3487, neededMm: 53.98 },
  POCKET_NOT_MEASURABLE: { ...named, reading: 'width' },
};

const everyCode = Object.keys(PROBLEM_CODES) as ProblemCode[];
const listedCodes = everyCode.filter((code) =>
  ['outcome', 'rule'].includes(PROBLEM_CODES[code].category),
);

describe('every listed problem explains why and what to do (9.15)', () => {
  it('gives the unsupported label and part name their own correction, preserving translations', () => {
    const facts = { partId: 'part', partName: 'Panel', text: '漢', characters: '漢' };
    const label = problem('TEXT_GLYPH_MISSING', { ...facts, ...named });
    const part = problem('TEXT_GLYPH_MISSING', facts);
    expect(problemExplanation(label, t).fix).toBe('Retype the label using Latin characters.');
    expect(problemExplanation(part, t).fix).toBe('Rename the part using Latin characters.');
    const polish = createI18n('pl');
    expect(problemExplanation(label, polish.t).fix).toBe('Wpisz etykietę znakami łacińskimi.');
    expect(problemExplanation(part, polish.t).fix).toBe(
      'Zmień nazwę części, używając znaków łacińskich.',
    );
  });

  it.each(listedCodes)('%s has a reason and an actionable fix in the shared message', (code) => {
    const explanation = problemExplanation(sample(code), t);
    expect(explanation.why.trim().length).toBeGreaterThan(10);
    expect(explanation.fix?.trim().length).toBeGreaterThan(10);
    expect(explanation.why).not.toMatch(/undefined|\{\{|problems\.[A-Z_]+/);
    expect(explanation.fix).not.toMatch(/undefined|\{\{|problems\.[A-Z_]+/);
    expect(describeProblem(sample(code), t)).toContain(explanation.why);
    expect(describeProblem(sample(code), t)).toContain(explanation.fix);
  });
});
const sample = (code: ProblemCode): Problem => problem(code, SAMPLES[code] as never);

describe('units', () => {
  // A formatted length already carries its unit: "drift 0.61 mm mm" read on screen (9.17).
  it.each(everyCode)('%s never says a unit twice', (code) => {
    expect(describeProblem(sample(code), t)).not.toMatch(/\bmm mm\b/);
  });
});

describe('the message catalogue, in English', () => {
  it('keeps a small-text height below its stated limit instead of rounding it up (Q34)', () => {
    const sentence = describeProblem(
      problem('TEXT_TOO_SMALL_TO_PRINT', {
        featureId: 'label',
        featureName: 'Fold',
        capHeightMm: 1.4999322,
        minimumMm: 1.5,
      }),
      t,
    );
    expect(sentence).toContain('1.4999 mm');
    expect(sentence).toContain('1.50 mm');
    expect(sentence).toContain('Increase Size in Properties.');
  });

  it('says what a too-narrow pocket has and what a card with its ease needs (9.14b)', () => {
    expect(describeProblem(sample('POCKET_TOO_NARROW'), t)).toContain(
      'leaves 89.00 mm between its stitch lines; a payment card with 4.00 mm of ease needs 89.60 mm.',
    );
  });

  it('never rounds a pocket that falls short up to what it needs', () => {
    const sentence = describeProblem(
      problem('POCKET_TOO_NARROW', {
        ...named,
        content: 'size',
        widthMm: 89.59996,
        neededMm: 89.6,
        easeMm: 0,
      }),
      t,
    );
    expect(sentence).toContain('leaves 89.5999 mm');
    expect(sentence).toContain('needs 89.60 mm');
  });

  it.each(everyCode)('describes %s in a sentence', (code) => {
    const sentence = describeProblem(sample(code), t);
    expect(sentence.length).toBeGreaterThan(10);
    expect(sentence).not.toMatch(/undefined|\[object/);
    expect(sentence).toMatch(/[.!?]$/);
  });

  it.each(everyCode)('gives %s a short title', (code) => {
    const title = problemTitle(code, t);
    expect(title.length).toBeGreaterThan(3);
    expect(title.length).toBeLessThan(40);
  });

  // Reviewed wording: refusals stay unchanged; listed problems gain their
  // reason and correction through the same shared path (9.15).
  const unchanged: Array<[Problem, string]> = [
    [
      problem('WOULD_BECOME_ELLIPSE', { shape: 'circle' }),
      'A circle or arc cannot survive a non-uniform scale — it would become an ellipse, which this ' +
        'editor cannot represent. Scale it evenly, or convert it to a drawn path in Properties first.',
    ],
    [
      problem('WOULD_SHEAR', {}),
      'A turned rectangle cannot be stretched along one axis — it would shear, and its corners ' +
        'would stop being square. Rotate it back to 0°, scale it evenly, or convert it to a drawn path ' +
        'in Properties first.',
    ],
    [problem('TRANSFORM_FLATTENS', {}), 'That would flatten the shape to nothing.'],
    [
      problem('DERIVED_MOVED_ALONE', { ...named, rootId: 'r', rootName: 'Outline' }),
      'Follows Outline: move that instead.',
    ],
    [
      problem('NO_TARGET_PART', { what: 'line' }),
      'Select a part first — a fold or marking line belongs to the part it is drawn on.',
    ],
    [
      problem('NO_TARGET_PART', { what: 'label' }),
      'Select a part first — a label belongs to the part it is drawn on.',
    ],
    [
      problem('TARGET_SPANS_PARTS', { what: 'line' }),
      'Select one part: this belongs to a single part, and the selection spans more than one.',
    ],
    [problem('FOLLOWS_ITSELF', named), 'Stitch line cannot follow itself.'],
    [
      problem('WOULD_LOOP', { ...named, sourceId: 'o', sourceName: 'Outline' }),
      'Stitch line would end up following itself, through Outline.',
    ],
    [
      problem('NOT_DERIVED', named),
      'Stitch line does not follow anything, so there is no source to change.',
    ],
    [problem('FEATURE_MISSING', { featureId: 'x' }), 'That feature does not exist.'],
    [problem('DUPLICATE_ID', { featureId: 'cut' }), 'Two items share the id cut.'],
    [problem('CYCLE', named), 'Stitch line follows a chain that leads back to itself.'],
    [problem('SOURCE_MISSING', named), 'Stitch line follows a feature that does not exist.'],
    [
      problem('OFFSET_COLLAPSED', { ...named, distanceMm: 60, side: 'inward' }),
      'A 60 mm edge margin is deeper than this edge can hold, so no offset path can be built. ' +
        'Reduce the inset or allowance in Properties, or give the source line more room.',
    ],
    [
      problem('SOURCE_FAILED', { ...named, sourceId: 'o', sourceName: 'Outline' }),
      'Outline, which it follows, could not be built, so this feature has no source geometry. ' +
        'Fix the named source feature first; this feature will rebuild with it.',
    ],
    [
      problem('ANCHOR_MISSING', { ...named, anchor: 9, available: 4 }),
      'That run named corner 9, and this outline has 4, so the run cannot be located. ' +
        'Choose available corners for the run in Properties, or follow the whole line.',
    ],
    [
      problem('ANCHOR_MISSING', { ...named, anchor: 1, available: 0 }),
      'This outline has no corners to run between, so it can only be followed whole. ' +
        'Choose available corners for the run in Properties, or follow the whole line.',
    ],
    [
      problem('ANCHOR_MISSING', { ...named, seamId: 'seam', anchor: 'start', available: 4 }),
      'This stitch line is closed, so it has no start endpoint for a seam. Choose an available corner on the closed line.',
    ],
    [
      problem('ANCHOR_MISSING', { ...named, seamId: 'seam', anchor: 'end', available: 0 }),
      'This stitch line is closed, so it has no end endpoint for a seam. Choose an available corner on the closed line.',
    ],
    [
      problem('HOLE_SPACING_DEVIATION', { ...named, achievedMm: 5, pitchMm: 3.85 }),
      'The holes are 5.00 mm apart, but the iron’s pitch is 3.85 mm. The pricking iron will not land on every hole. Change the pitch or the ' +
        'edge margin to bring them closer.',
    ],
  ];

  it.each(unchanged)('uses the reviewed wording: %#', (p, words) => {
    expect(describeProblem(p, t)).toBe(words);
  });

  it.each([
    ['holes-need-hole-set', 'Only a stitch hole set can follow a stitch line at a pitch.'],
    ['holes-need-stitch-line', 'Holes can only follow a stitch line.'],
    ['inset-needs-stitch-line', 'Only a stitch line can be inset from an outline.'],
    ['inset-needs-outline', 'A stitch line can only be inset from an outline or a cut-out.'],
    ['allowance-needs-outline', 'Only an outline can be offset outward from a stitch line.'],
    ['allowance-needs-stitch-line', 'An outline can only be offset outward from a stitch line.'],
    [
      'allowance-needs-outer',
      "Only a part's outer outline can be derived from its stitch line, not a cut-out.",
    ],
    [
      'allowance-needs-whole-run',
      'A seam allowance follows the whole stitch line, so the outline it makes is closed.',
    ],
    [
      'allowance-needs-closed-line',
      'A seam allowance needs a closed stitch line: an outline has to enclose the part.',
    ],
  ] as const)('keeps the compatibility table’s words for %s', (rule, words) => {
    expect(describeProblem(problem('DERIVATION_INCOMPATIBLE', { ...named, rule }), t)).toBe(words);
  });

  it('names the subject when the sentence does not already', () => {
    // What the loader shows: a file can hold many features, and a reason with
    // no name attached tells the user nothing about where to look.
    const table = problem('DERIVATION_INCOMPATIBLE', { ...named, rule: 'holes-need-stitch-line' });
    expect(describeProblemWithSubject(table, t)).toBe(
      'Stitch line: Holes can only follow a stitch line.',
    );
    expect(describeProblemWithSubject(problem('CYCLE', named), t)).toBe(
      describeProblem(problem('CYCLE', named), t),
    );
  });

  it('describes an unusable number without printing a JavaScript-ism', () => {
    const nan = describeProblem(
      problem('PARAMETER_INVALID', {
        ...named,
        parameter: 'width',
        requirement: 'finite',
        value: Number.NaN,
      }),
      t,
    );
    expect(nan).toMatch(/width/);
    expect(nan).not.toMatch(/NaN|Infinity/);

    const negative = describeProblem(
      problem('PARAMETER_INVALID', {
        ...named,
        parameter: 'radius',
        requirement: 'non-negative',
        value: -2,
      }),
      t,
    );
    expect(negative).toMatch(/radius/);
    expect(negative).toMatch(/negative/);
  });

  it('says the floor a number is under, never a value rounded away to zero (5.6)', () => {
    // 1e-300 rounds to "0" at the catalogue's precision, which would tell the
    // maker their positive pitch is zero. The sentence says the rule instead.
    const tiny = describeProblem(
      problem('PARAMETER_INVALID', {
        ...named,
        parameter: 'pitch',
        requirement: 'at-least',
        minimum: 0.5,
        value: 1e-300,
      }),
      t,
    );
    expect(tiny).toMatch(/pitch/);
    // Pitch moved to the floor; a size of zero still says "more than zero".
    const zero = describeProblem(
      problem('PARAMETER_INVALID', {
        ...named,
        parameter: 'text size',
        requirement: 'positive',
        value: 0,
      }),
      t,
    );
    expect(zero).toMatch(/text size is 0, and it must be more than zero/);
    expect(tiny).toMatch(/0\.50 mm/);
    expect(tiny).not.toMatch(/\b0\b(?!\.)|e-/);
  });

  it('names a contour still being drawn by what it is drawn as', () => {
    // The drawing modes' refusal: nothing exists yet to call by name.
    expect(
      describeProblem(
        problem('CONTOUR_NOT_CLOSED', { drawing: 'outline', role: 'outer', closable: true }),
        t,
      ),
    ).toBe(
      'An outline has two ends, so there is nothing to cut out. Close the shape, or draw it as a marking line.',
    );
    expect(
      describeProblem(
        problem('CONTOUR_NOT_CLOSED', { drawing: 'cut-out', role: 'inner', closable: false }),
        t,
      ),
    ).toBe(
      'A cut-out has two ends, so there is nothing to cut out of the part. Draw it as a marking line.',
    );
  });

  it('counts in the plural the language uses', () => {
    const holes = (count: number): string =>
      describeProblem(problem('HOLE_COUNT_TOO_LOW', { ...named, count }), t);
    expect(holes(0)).toContain('Stitch line has no holes, and stitching needs at least two.');
    expect(holes(1)).toContain('Stitch line has 1 hole, and stitching needs at least two.');
    const split = describeProblem(problem('OFFSET_SPLIT', { ...named, droppedPieces: 2 }), t);
    expect(split).toContain(
      'The offset for Stitch line came apart into 3 pieces. Only the largest is drawn; 2 pieces left out.',
    );
  });
});
