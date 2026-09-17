import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  PROBLEM_CODES,
  describeProblem,
  describeProblemWithSubject,
  problem,
  problemKey,
  problemTitle,
  sameProblem,
  subjectOf,
  type Problem,
  type ProblemCode,
  type ProblemFacts,
} from './index.js';

const named = { featureId: 'f-1', featureName: 'Stitch line' };

/**
 * One sample per code, typed over every code: a code added without a sample
 * here does not compile, so it cannot ship undescribed.
 */
const SAMPLES: { readonly [K in ProblemCode]: ProblemFacts[K] } = {
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
  DERIVED_MOVED_ALONE: { ...named, rootId: 'f-2', rootName: 'Outline' },
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
  HOLE_SPACING_DEVIATION: { ...named, achievedMm: 5, pitchMm: 3.85 },
  HOLE_SPACING_UNEVEN: { ...named, narrowestMm: 3.7, widestMm: 4.1 },
  HOLE_COUNT_TOO_LOW: { ...named, count: 1 },
  EMPTY_PART: { partId: 'p-1', partName: 'Gusset' },
  PART_HAS_NO_OUTER_CONTOUR: { partId: 'p-1', partName: 'Gusset' },
  CUT_OUT_OUTSIDE_PART: { featureId: 'f-1', featureName: 'Card slot' },
  OUTSIDE_PART: { ...named, what: 'holes' },
  HOLE_TOO_CLOSE_TO_EDGE: { ...named, clearanceMm: 0.8, minimumMm: 1.5 },
};

const everyCode = Object.keys(SAMPLES) as ProblemCode[];
const sample = (code: ProblemCode): Problem => problem(code, SAMPLES[code] as never);

describe('problem identity', () => {
  it('registers every code, and nothing that is not one', () => {
    expect(Object.keys(PROBLEM_CODES).sort()).toEqual([...everyCode].sort());
  });

  it.each(everyCode)('%s names the invariant it protects', (code) => {
    // The forms in docs/domain-model.md §8: S1–S10, E1–E4, DR1–DR6, X1–X10.
    expect(PROBLEM_CODES[code].protects).toMatch(/^(S|E|DR|X)\d+$/);
  });

  it('keeps refusals out of the diagnostic categories, and the reverse', () => {
    // ADR 0013: structural and interaction problems are refused, never listed;
    // outcomes and rules are listed, never refused.
    for (const code of everyCode) {
      const { category, protects } = PROBLEM_CODES[code];
      const family = protects.replace(/\d+$/, '');
      const expected = {
        S: 'structural',
        X: 'interaction',
        E: 'outcome',
        DR: 'rule',
      }[family];
      expect(category, code).toBe(expected);
    }
  });

  it('keys an occurrence by its code and subject', () => {
    expect(problemKey(sample('SOURCE_MISSING'))).toBe('SOURCE_MISSING:f-1');
    expect(problemKey(sample('EMPTY_PART'))).toBe('EMPTY_PART:p-1');
    expect(problemKey(sample('NO_TARGET_PART'))).toBe('NO_TARGET_PART:');
  });

  it('tells two table rows apart on one feature', () => {
    const a = problem('DERIVATION_INCOMPATIBLE', { ...named, rule: 'allowance-needs-outer' });
    const b = problem('DERIVATION_INCOMPATIBLE', { ...named, rule: 'allowance-needs-closed-line' });
    expect(problemKey(a)).not.toBe(problemKey(b));
  });

  it('finds the subject a problem is about', () => {
    expect(subjectOf(sample('OFFSET_COLLAPSED'))).toEqual({ featureId: 'f-1' });
    expect(subjectOf(sample('EMPTY_PART'))).toEqual({ partId: 'p-1' });
    expect(subjectOf(sample('WOULD_SHEAR'))).toEqual({});
  });
});

describe('sameProblem', () => {
  it('is true for the same code and facts, built twice', () => {
    expect(sameProblem(sample('DERIVED_MOVED_ALONE'), sample('DERIVED_MOVED_ALONE'))).toBe(true);
  });

  it('is false when a fact differs', () => {
    const a = problem('OFFSET_COLLAPSED', { ...named, distanceMm: 60, side: 'inward' });
    const b = problem('OFFSET_COLLAPSED', { ...named, distanceMm: 61, side: 'inward' });
    expect(sameProblem(a, b)).toBe(false);
  });

  it('treats null as a problem of its own', () => {
    expect(sameProblem(null, null)).toBe(true);
    expect(sameProblem(sample('WOULD_SHEAR'), null)).toBe(false);
  });

  it('is reflexive and symmetric over any facts', () => {
    fc.assert(
      fc.property(fc.constantFrom(...everyCode), fc.constantFrom(...everyCode), (x, y) => {
        const a = sample(x);
        const b = sample(y);
        return sameProblem(a, a) && sameProblem(a, b) === sameProblem(b, a);
      }),
    );
  });
});

describe('the message catalogue', () => {
  it.each(everyCode)('describes %s in a sentence', (code) => {
    const sentence = describeProblem(sample(code));
    expect(sentence.length).toBeGreaterThan(10);
    expect(sentence).not.toMatch(/undefined|\[object/);
    expect(sentence).toMatch(/[.!?]$/);
  });

  it.each(everyCode)('gives %s a short title', (code) => {
    const title = problemTitle(code);
    expect(title.length).toBeGreaterThan(3);
    expect(title.length).toBeLessThan(40);
  });

  // The words the app already shows. Moving them into the catalogue must not
  // change one: E2E reads some of them off the screen.
  const unchanged: Array<[Problem, string]> = [
    [
      problem('WOULD_BECOME_ELLIPSE', { shape: 'circle' }),
      'A circle or arc cannot survive a non-uniform scale — it would become an ellipse, which this ' +
        'editor cannot represent. Scale it evenly instead.',
    ],
    [
      problem('WOULD_SHEAR', {}),
      'A turned rectangle cannot be stretched along one axis — it would shear, and its corners ' +
        'would stop being square. Rotate it back to 0°, or scale it evenly.',
    ],
    [problem('TRANSFORM_FLATTENS', {}), 'That would flatten the shape to nothing.'],
    [
      problem('DERIVED_MOVED_ALONE', { ...named, rootId: 'r', rootName: 'Outline' }),
      'Stitch line follows Outline, so it moves when Outline does. Move Outline instead.',
    ],
    [
      problem('NO_TARGET_PART', { what: 'line' }),
      'Select a part first — a fold or marking line belongs to the panel it is drawn on.',
    ],
    [
      problem('NO_TARGET_PART', { what: 'label' }),
      'Select a part first — a label belongs to the panel it is drawn on.',
    ],
    [
      problem('TARGET_SPANS_PARTS', { what: 'line' }),
      'Select one part: this belongs to a single panel, and the selection spans more than one.',
    ],
    [problem('FOLLOWS_ITSELF', named), 'Stitch line cannot follow itself.'],
    [
      problem('WOULD_LOOP', { ...named, sourceId: 'o', sourceName: 'Outline' }),
      'Stitch line would end up following itself, through Outline.',
    ],
    [
      problem('NOT_DERIVED', named),
      'Stitch line does not follow anything, so there is nothing to re-point.',
    ],
    [problem('FEATURE_MISSING', { featureId: 'x' }), 'That feature does not exist.'],
    [problem('DUPLICATE_ID', { featureId: 'cut' }), 'Two features share the id cut.'],
    [problem('CYCLE', named), 'Stitch line follows a chain that leads back to itself.'],
    [problem('SOURCE_MISSING', named), 'Stitch line follows a feature that does not exist.'],
    [
      problem('OFFSET_COLLAPSED', { ...named, distanceMm: 60, side: 'inward' }),
      'A 60 mm edge margin is deeper than this edge can hold.',
    ],
    [
      problem('SOURCE_FAILED', { ...named, sourceId: 'o', sourceName: 'Outline' }),
      'The Outline it follows could not be built.',
    ],
    [
      problem('ANCHOR_MISSING', { ...named, anchor: 9, available: 4 }),
      'That run named corner 9, and this outline has 4.',
    ],
    [
      problem('ANCHOR_MISSING', { ...named, anchor: 1, available: 0 }),
      'This outline has no corners to run between, so it can only be followed whole.',
    ],
    [
      problem('HOLE_SPACING_DEVIATION', { ...named, achievedMm: 5, pitchMm: 3.85 }),
      'The spacing came out 5.00 mm against a 3.85 mm iron. Change the pitch, or the edge ' +
        'margin, to bring them together.',
    ],
  ];

  it.each(unchanged)('keeps the existing words: %#', (p, words) => {
    expect(describeProblem(p)).toBe(words);
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
    expect(describeProblem(problem('DERIVATION_INCOMPATIBLE', { ...named, rule }))).toBe(words);
  });

  it('names the subject when the sentence does not already', () => {
    // What the loader shows: a file can hold many features, and a reason with
    // no name attached tells the user nothing about where to look.
    const table = problem('DERIVATION_INCOMPATIBLE', { ...named, rule: 'holes-need-stitch-line' });
    expect(describeProblemWithSubject(table)).toBe(
      'Stitch line: Holes can only follow a stitch line.',
    );
    expect(describeProblemWithSubject(problem('CYCLE', named))).toBe(
      describeProblem(problem('CYCLE', named)),
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
    );
    expect(negative).toMatch(/radius/);
    expect(negative).toMatch(/negative/);
  });
});
