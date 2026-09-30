import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  PROBLEM_CODES,
  problem,
  problemKey,
  sameProblem,
  subjectOf,
  type Problem,
  type ProblemCode,
  type ProblemFacts,
} from './index.js';

const named = { featureId: 'f-1', featureName: 'Stitch line' };

/**
 * One sample per code, typed over every code: a code added without a sample
 * here does not compile. The words for each are the app's, and tested there
 * (apps/desktop/src/renderer/src/problemText.test.ts).
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
  NOT_A_DRAWN_PATH: named,
  POINT_EDIT_DEGENERATE: named,
  ROUNDING_DOES_NOT_FIT: { ...named, radiusMm: 60 },
  NOT_A_ROUNDED_CORNER: named,
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
  WHOLE_PART_NOT_SCALED: {},
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
