import type { ProblemCode } from '@leathercad/domain';

/**
 * Which scenarios cover which rule, and what is not covered yet — the coverage
 * half of the applicability matrix. The other half, what each rule needs and
 * when it must stay silent, is prose in docs/smart-features.md §4; `matrix.test.ts`
 * holds the two to the same codes, and both to the registry.
 *
 * Every rule in scope has four classes of scenario:
 * - **positive** — it speaks when it should, on the right feature, at the
 *   right severity, with the right measurements;
 * - **negative** — its prerequisites are there and it is satisfied: silent;
 * - **notApplicable** — its prerequisites are absent, even where the geometry
 *   looks the part: silent;
 * - **transition** — an edit, an undo or a redo turns it on or off, and
 *   nothing stale is left.
 *
 * A class is scenario ids, or a `gap` (to be written; each is listed as a todo
 * in every run) or an `exempt` (cannot be written, and why). Never empty.
 */

type Coverage = readonly string[] | { readonly gap: string } | { readonly exempt: string };

export interface RuleCoverage {
  readonly positive: Coverage;
  readonly negative: Coverage;
  readonly notApplicable: Coverage;
  readonly transition: Coverage;
}

export const CLASSES = ['positive', 'negative', 'notApplicable', 'transition'] as const;

const UNIVERSAL =
  'universal: it applies wherever its geometry exists, so "absent prerequisites" is the negative case';
/**
 * Why a class is left to the domain's tests: the rule reads one feature's own
 * geometry, so a project adds nothing to it — no other feature, requirement or
 * seam changes its answer — and undo and redo are held for every edit by
 * SF-H7 and the undo property. Its boundaries are in validate.test.ts.
 */
const ONE_FEATURE =
  'one feature’s own geometry: no other feature changes its answer, so its boundaries are domain tests (validate.test.ts), and undo is held for every edit by SF-H7 and the undo property';

export const MATRIX: { readonly [code: string]: RuleCoverage } = {
  // ——— DR8: a pocket holds what the maker says it is for ———
  POCKET_TOO_NARROW: {
    positive: ['SF-B2', 'SF-B4', 'SF-B5', 'SF-B6', 'SF-I4', 'SF-E5'],
    negative: ['SF-B1', 'SF-B4', 'SF-I3', 'SF-I5'],
    notApplicable: ['SF-C1', 'SF-D1', 'SF-D3'],
    transition: ['SF-B3', 'SF-B5', 'SF-C2', 'SF-H7', 'SF-X1'],
  },
  POCKET_TOO_SHALLOW: {
    positive: ['SF-F2', 'SF-F4', 'SF-I3', 'SF-E6'],
    negative: ['SF-F3', 'SF-F4'],
    notApplicable: ['SF-F1', 'SF-C1'],
    transition: ['SF-F2', 'SF-H7'],
  },
  POCKET_NOT_MEASURABLE: {
    positive: ['SF-E1', 'SF-E2', 'SF-E3'],
    negative: ['SF-B1', 'SF-F3'],
    notApplicable: ['SF-A2'],
    transition: ['SF-E5'],
  },
  // ——— DR7: sewn stretches have paired holes ———
  SEAM_HOLE_COUNT_MISMATCH: {
    positive: ['SF-G2', 'SF-G9', 'SF-G10', 'SF-I5'],
    negative: ['SF-G1'],
    notApplicable: ['SF-D2'],
    transition: ['SF-G6', 'SF-G9', 'SF-G10'],
  },
  SEAM_HOLES_DRIFT: {
    positive: ['SF-G3', 'SF-G4', 'SF-G5'],
    negative: ['SF-G1', 'SF-G4'],
    notApplicable: ['SF-D2'],
    transition: ['SF-G3'],
  },
  SEAM_JOINS_ITSELF: {
    positive: ['SF-G11'],
    negative: ['SF-G12'],
    notApplicable: ['SF-G1'],
    transition: ['SF-G11'],
  },
  // ——— Seam outcomes: a declared seam that cannot be walked ———
  SEAM_SIDE_MISSING: {
    positive: ['SF-G7', 'SF-X2'],
    negative: ['SF-G1'],
    notApplicable: ['SF-D2'],
    transition: ['SF-X2'],
  },
  SEAM_RUNS_OFF_THE_LINE: {
    positive: ['SF-G8'],
    negative: { gap: 'a length-following side that fits its line, said nothing' },
    notApplicable: ['SF-D2'],
    transition: { gap: 'lengthening the line it follows until the seam fits' },
  },
  // ——— DR2: everything in a part lies on its material ———
  HOLE_TOO_CLOSE_TO_EDGE: {
    positive: ['SF-A4', 'SF-A5', 'SF-K7'],
    negative: ['SF-A2', 'SF-K1', 'SF-K6', 'SF-K8'],
    notApplicable: { exempt: UNIVERSAL },
    transition: ['SF-A4', 'SF-K7'],
  },
  OUTSIDE_PART: {
    positive: ['SF-E3', 'SF-K4', 'SF-K5', 'SF-A11'],
    negative: ['SF-A2', 'SF-K1', 'SF-K6', 'SF-K8'],
    notApplicable: { exempt: UNIVERSAL },
    transition: ['SF-A11', 'SF-K4'],
  },
  CUT_OUT_OUTSIDE_PART: {
    positive: ['SF-A10'],
    negative: ['SF-A10'],
    notApplicable: { exempt: UNIVERSAL },
    transition: ['SF-A10'],
  },
  // ——— DR1, DR3, DR4, DR5, DR6: the shape of each piece ———
  PART_HAS_NO_OUTER_CONTOUR: {
    positive: ['SF-A9'],
    negative: ['SF-A2'],
    notApplicable: ['SF-A3'],
    transition: ['SF-A9'],
  },
  CONTOUR_SELF_INTERSECTS: {
    positive: ['SF-A6'],
    negative: ['SF-A1', 'SF-A13'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { exempt: ONE_FEATURE },
  },
  CONTOUR_HAS_NO_AREA: {
    positive: ['SF-A12'],
    negative: ['SF-A1', 'SF-A13'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { exempt: ONE_FEATURE },
  },
  HOLES_OVERLAP: {
    positive: ['SF-J6'],
    negative: ['SF-J2', 'SF-J6'],
    notApplicable: { exempt: UNIVERSAL },
    transition: ['SF-J6'],
  },
  HOLE_SPACING_DEVIATION: {
    positive: ['SF-A7'],
    negative: ['SF-A2'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { exempt: ONE_FEATURE },
  },
  HOLE_SPACING_UNEVEN: {
    positive: ['SF-J5'],
    negative: ['SF-A2', 'SF-J5'],
    notApplicable: { exempt: UNIVERSAL },
    transition: ['SF-J5'],
  },
  HOLE_COUNT_TOO_LOW: {
    positive: { exempt: ONE_FEATURE },
    negative: ['SF-A2'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { exempt: ONE_FEATURE },
  },
  TEXT_TOO_SMALL_TO_PRINT: {
    positive: ['SF-A8'],
    negative: { exempt: ONE_FEATURE },
    notApplicable: { exempt: UNIVERSAL },
    transition: { exempt: `${ONE_FEATURE}; in the app, e2e/text-legibility.spec.ts` },
  },
  EMPTY_PART: {
    positive: ['SF-A3'],
    negative: ['SF-A1'],
    notApplicable: { exempt: UNIVERSAL },
    transition: ['SF-A3'],
  },
};

/**
 * Codes a scenario must never stay silent about, outside the rules: the
 * outcomes of a relationship the maker declared. Other outcomes are geometry
 * failing to build, which domain tests own (docs/smart-features.md §4).
 */
export const DECLARED_OUTCOME_PREFIXES = ['SEAM_', 'POCKET_'] as const;

/**
 * Defects the scenarios found, each pinned by `Bench.expectDefect` in its
 * scenario: the list exactly as the defect makes it, beside the correct one.
 * The fix fails that scenario on purpose; it then asserts the correct list and
 * takes its entry out of here, in the same change.
 */
export const KNOWN_DEFECTS: readonly { readonly id: string; readonly scenario: string }[] = [];

export function isCovered(coverage: Coverage): coverage is readonly string[] {
  return Array.isArray(coverage);
}

/** The codes the matrix must account for: every design rule, and every declared-relationship outcome. */
export function inScope(code: ProblemCode, category: string): boolean {
  return (
    category === 'rule' ||
    (category === 'outcome' && DECLARED_OUTCOME_PREFIXES.some((prefix) => code.startsWith(prefix)))
  );
}
