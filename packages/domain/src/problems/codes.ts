import type { ProblemCode, Severity } from './problem.js';

/**
 * The registry: every problem code, what kind of problem it is, and the
 * invariant it protects.
 *
 * A code is a **stable string**. Tests assert it, 4.12's audit test checks it
 * against docs/domain-model.md §8, and a future list of suppressed warnings
 * would store it — so renaming one is a breaking change, not a tidy-up.
 */

/** An invariant id from docs/domain-model.md §8. */
export type InvariantId = `S${number}` | `E${number}` | `DR${number}` | `X${number}`;

/**
 * ADR 0013's categories, with refusals split by what they protect.
 *
 * - `structural` (S) and `interaction` (X) are **refused**, and never listed.
 * - `outcome` (E) and `rule` (DR) are **listed**, and never refused.
 */
export type ProblemCategory = 'structural' | 'interaction' | 'outcome' | 'rule';

export interface CodeInfo {
  readonly category: ProblemCategory;
  readonly protects: InvariantId;
  /** The default. A rule may choose another for a particular occurrence. */
  readonly severity: Severity;
}

const structural = (protects: InvariantId): CodeInfo => ({
  category: 'structural',
  protects,
  severity: 'error',
});
const interaction = (protects: InvariantId): CodeInfo => ({
  category: 'interaction',
  protects,
  severity: 'error',
});
const outcome = (protects: InvariantId, severity: Severity = 'error'): CodeInfo => ({
  category: 'outcome',
  protects,
  severity,
});
const rule = (protects: InvariantId, severity: Severity): CodeInfo => ({
  category: 'rule',
  protects,
  severity,
});

export const PROBLEM_CODES: { readonly [K in ProblemCode]: CodeInfo } = {
  DUPLICATE_ID: structural('S1'),
  SOURCE_MISSING: structural('S2'),
  FOLLOWS_ITSELF: structural('S3'),
  WOULD_LOOP: structural('S3'),
  // Refused by commands and the loader. Evaluation keeps a guard that reports
  // it too, which S3 makes unreachable.
  CYCLE: structural('S3'),
  DERIVATION_INCOMPATIBLE: structural('S4'),
  PART_ALREADY_HAS_OUTER: structural('S5'),
  CONTOUR_NOT_CLOSED: structural('S6'),

  FEATURE_MISSING: interaction('X1'),
  NOT_DERIVED: interaction('X1'),
  DERIVED_MOVED_ALONE: interaction('X3'),
  TRANSFORM_FLATTENS: interaction('X9'),
  WOULD_BECOME_ELLIPSE: interaction('X9'),
  WOULD_SHEAR: interaction('X9'),
  TEXT_WOULD_DISTORT: interaction('X9'),
  TEXT_WOULD_READ_BACKWARDS: interaction('X9'),
  NO_TARGET_PART: interaction('X4'),
  TARGET_SPANS_PARTS: interaction('X4'),

  PARAMETER_INVALID: outcome('E1'),
  OFFSET_COLLAPSED: outcome('E1'),
  OFFSET_UNSUPPORTED: outcome('E1'),
  OFFSET_SPLIT: outcome('E2', 'warning'),
  ANCHOR_MISSING: outcome('E4'),
  SOURCE_FAILED: outcome('E3'),
  GEOMETRY_FAILED: outcome('E1'),
  // Nothing throws and nothing is dropped: the box is drawn and this says so.
  TEXT_GLYPH_MISSING: outcome('E2', 'warning'),

  CONTOUR_SELF_INTERSECTS: rule('DR3', 'error'),
  HOLE_SPACING_DEVIATION: rule('DR4', 'warning'),
  HOLE_SPACING_UNEVEN: rule('DR4', 'info'),
  HOLE_COUNT_TOO_LOW: rule('DR4', 'warning'),
  EMPTY_PART: rule('DR6', 'info'),
  PART_HAS_NO_OUTER_CONTOUR: rule('DR1', 'error'),
  CUT_OUT_OUTSIDE_PART: rule('DR2', 'error'),
  // Severity is chosen per occurrence: a hole off the material is a hole
  // punched through nothing, while a line off it is a guide that overshoots.
  OUTSIDE_PART: rule('DR2', 'error'),
  HOLE_TOO_CLOSE_TO_EDGE: rule('DR2', 'warning'),
};
