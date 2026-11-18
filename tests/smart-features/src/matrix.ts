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
const DOMAIN_ONLY = 'covered by packages/domain/src/validate.test.ts only; no project scenario yet';

export const MATRIX: { readonly [code: string]: RuleCoverage } = {
  // ——— DR8: a pocket holds what the maker says it is for ———
  POCKET_TOO_NARROW: {
    positive: ['SF-B2', 'SF-B4', 'SF-B5', 'SF-B6', 'SF-I4', 'SF-E5'],
    negative: ['SF-B1', 'SF-B4', 'SF-I3', 'SF-I5'],
    notApplicable: ['SF-C1', 'SF-D1', 'SF-D3'],
    transition: ['SF-B3', 'SF-B5', 'SF-C2', 'SF-H7'],
  },
  POCKET_TOO_SHALLOW: {
    positive: ['SF-F2', 'SF-F4', 'SF-I3'],
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
    positive: ['SF-G2', 'SF-G9', 'SF-I5'],
    negative: ['SF-G1'],
    notApplicable: ['SF-D2'],
    transition: ['SF-G6', 'SF-G9'],
  },
  SEAM_HOLES_DRIFT: {
    positive: ['SF-G3', 'SF-G4', 'SF-G5'],
    negative: ['SF-G1', 'SF-G4'],
    notApplicable: ['SF-D2'],
    transition: ['SF-G3'],
  },
  // ——— Seam outcomes: a declared seam that cannot be walked ———
  SEAM_SIDE_MISSING: {
    positive: ['SF-G7'],
    negative: ['SF-G1'],
    notApplicable: ['SF-D2'],
    transition: {
      exempt:
        'arises only from a file another version edited; the app’s own delete takes the seam with its side (SF-G6)',
    },
  },
  SEAM_RUNS_OFF_THE_LINE: {
    positive: ['SF-G8'],
    negative: { gap: 'a length-following side that fits its line, said nothing' },
    notApplicable: ['SF-D2'],
    transition: { gap: 'lengthening the line it follows until the seam fits' },
  },
  // ——— DR2: everything in a part lies on its material ———
  HOLE_TOO_CLOSE_TO_EDGE: {
    positive: ['SF-A4', 'SF-A5'],
    negative: ['SF-A2', 'SF-K1'],
    notApplicable: { exempt: UNIVERSAL },
    transition: ['SF-A4'],
  },
  OUTSIDE_PART: {
    positive: ['SF-E3'],
    negative: ['SF-A2', 'SF-K1'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'a line or holes moved off the leather and back' },
  },
  CUT_OUT_OUTSIDE_PART: {
    positive: { gap: DOMAIN_ONLY },
    negative: { gap: 'a card slot cut wholly inside its piece, said nothing' },
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'a cut-out dragged out of its piece and back' },
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
    negative: ['SF-A1'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'a crossing point dragged clear' },
  },
  HOLES_OVERLAP: {
    positive: { gap: DOMAIN_ONLY },
    negative: ['SF-J2'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'a row’s pitch typed below its hole size and back' },
  },
  HOLE_SPACING_DEVIATION: {
    positive: ['SF-A7'],
    negative: ['SF-A2'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'a short run lengthened until the iron fits it' },
  },
  HOLE_SPACING_UNEVEN: {
    positive: { gap: DOMAIN_ONLY },
    negative: ['SF-A2'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'a long side and a short one evened out' },
  },
  HOLE_COUNT_TOO_LOW: {
    positive: { gap: DOMAIN_ONLY },
    negative: ['SF-A2'],
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'a hole set on a line lengthened past one hole' },
  },
  TEXT_TOO_SMALL_TO_PRINT: {
    positive: ['SF-A8'],
    negative: { gap: 'a label at 1.5 mm capital height, said nothing' },
    notApplicable: { exempt: UNIVERSAL },
    transition: { gap: 'covered in the app by e2e/text-legibility.spec.ts; no project scenario' },
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
 * Defects the scenarios found, each kept as an `it.fails` scenario that states
 * the correct behaviour. When the defect is fixed the scenario passes, so
 * `it.fails` fails: take `.fails` off, and the entry here, in the same change.
 */
export const KNOWN_DEFECTS: readonly { readonly id: string; readonly scenario: string }[] = [
  { id: 'SF-D1', scenario: 'SF-K3' },
  { id: 'SF-D2', scenario: 'SF-E4' },
  { id: 'SF-D3', scenario: 'SF-J3' },
];

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
