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
  FEATURE_LOCKED: structural('S7'),
  MIRROR_FOLD_MISSING: structural('S2'),
  MEASURE_REF_MISSING: structural('S2'),
  MIRROR_OUTLINE_ACROSS_FOLD: structural('S5'),

  FEATURE_MISSING: interaction('X1'),
  NOT_DERIVED: interaction('X1'),
  DERIVED_MOVED_ALONE: interaction('X3'),
  TRANSFORM_FLATTENS: interaction('X9'),
  WOULD_BECOME_ELLIPSE: interaction('X9'),
  WOULD_SHEAR: interaction('X9'),
  TEXT_WOULD_DISTORT: interaction('X9'),
  TEXT_WOULD_READ_BACKWARDS: interaction('X9'),
  MIRROR_WOULD_SCALE: interaction('X3'),
  MIRROR_PLACED_BY_FOLD: interaction('X3'),
  MIRROR_NO_AXIS: interaction('X3'),
  DIMENSION_NOT_MIRRORED: interaction('X3'),
  MEASURE_NEEDS_ANCHOR: interaction('X3'),
  NO_TARGET_PART: interaction('X4'),
  TARGET_SPANS_PARTS: interaction('X4'),

  PARAMETER_INVALID: outcome('E1'),
  OFFSET_COLLAPSED: outcome('E1'),
  OFFSET_UNSUPPORTED: outcome('E1'),
  OFFSET_SPLIT: outcome('E2', 'warning'),
  ANCHOR_MISSING: outcome('E4'),
  SOURCE_FAILED: outcome('E3'),
  GEOMETRY_FAILED: outcome('E1'),
  FOLD_NOT_STRAIGHT: outcome('E1'),
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

/**
 * The invariants that hold **without** a problem code, and why.
 *
 * Most invariants are enforced by something that can say so: a command refuses,
 * a rule reports. These are not. They hold because the shapes make the
 * violation unrepresentable, because a schema refuses the file before the
 * domain sees it, or because a flow — not a check — is what protects them.
 *
 * Writing them down is the point. Without this list, 4.12's audit could only
 * ask "does every code name an invariant", which never notices an invariant
 * that quietly has nothing enforcing it. With it, the audit asks the useful
 * question in the other direction — *is every invariant accounted for* — and a
 * new row in §8 must either arrive with a code or arrive with a reason.
 */
export interface UncodedInvariant {
  readonly invariant: InvariantId;
  /** What holds it up instead. */
  readonly because: string;
}

export const INVARIANTS_WITHOUT_A_CODE: readonly UncodedInvariant[] = [
  {
    invariant: 'S8',
    because:
      'The writer has nowhere to put a computed path: the schema stores parameters, and evaluation is what produces geometry. A violation would be a new field, not a bad value.',
  },
  {
    invariant: 'S9',
    because:
      'Runs and anchors address geometry by arc length and anchor index (ADR 0010); no model type carries a segment index, so the state has no representation to report.',
  },
  {
    invariant: 'S10',
    because:
      'The zod schema refuses a non-positive quantity, pitch or text size before the domain sees the file, and commands quantise and guard what they store.',
  },
  {
    invariant: 'DR5',
    because:
      'Planned: TEXT_TOO_SMALL_TO_PRINT arrives with document text in 4.11. Until text can be placed at a chosen height there is nothing to measure.',
  },
  {
    invariant: 'X2',
    because:
      "ADR 0009's delete dialog protects this: it is a flow, not a check. What it shows is tested where the dialog is, and a problem code would have nowhere to be shown.",
  },
  {
    invariant: 'X5',
    because:
      'Held by the layering: millimetres are the only unit in the model, and packages/typography ships outlines for the one vendored face, so no other text can reach paper.',
  },
  {
    invariant: 'X6',
    because:
      'A measurement stores its references and precision, never the number it prints. There is no field a stale caption could be stored in.',
  },
  {
    invariant: 'X7',
    because:
      'Structural, and enforced by depcruise: a surface cannot reach a second source of problems because there is no second producer to import.',
  },
  {
    invariant: 'X8',
    because:
      'Commands take settings and have no constants to fall back on; a missing default is a type error rather than a silently wrong value.',
  },
  {
    invariant: 'X10',
    because:
      'A property of refusals rather than a state to report: a refused command returns the project unchanged, and the drawing boundary keeps the work in progress. Tested where each refusal is.',
  },
];
