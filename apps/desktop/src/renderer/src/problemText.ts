import { formatEditable, formatMm } from '@leathercad/core';
import type { Problem, ProblemCode, ProblemFacts } from '@leathercad/domain';

import type { Translate } from '../../shared/i18n.js';

/**
 * The message catalogue: the one place a problem becomes words, in the
 * interface's language (ADR 0018).
 *
 * The domain reports a problem as a code and facts; the words are the
 * locale's, under `problems.<CODE>` in `src/locales/`. This picks which of
 * them a problem's facts call for and fills them in, so the status bar, the
 * problems panel, a refusal and the loader's error all say the same thing.
 * Typed over every code, so a code without words does not compile.
 */

type Describe<K extends ProblemCode> = (facts: ProblemFacts[K], t: Translate) => string;

const CATALOGUE: { readonly [K in ProblemCode]: Describe<K> } = {
  DUPLICATE_ID: (f, t) => t('problems.DUPLICATE_ID.description', f),
  SOURCE_MISSING: (f, t) => t('problems.SOURCE_MISSING.description', f),
  FOLLOWS_ITSELF: (f, t) => t('problems.FOLLOWS_ITSELF.description', f),
  WOULD_LOOP: (f, t) => t('problems.WOULD_LOOP.description', f),
  CYCLE: (f, t) => t('problems.CYCLE.description', f),
  DERIVATION_INCOMPATIBLE: (f, t) => t(`problems.DERIVATION_INCOMPATIBLE.rule.${f.rule}`),
  PART_ALREADY_HAS_OUTER: (f, t) => t('problems.PART_ALREADY_HAS_OUTER.description', f),
  CONTOUR_NOT_CLOSED: (f, t) =>
    t(`problems.CONTOUR_NOT_CLOSED.${f.role}${f.closable ? 'Closable' : ''}`, {
      subject: 'drawing' in f ? t(`problems.drawing.${f.drawing}`) : f.featureName,
    }),

  MEASURE_REF_MISSING: (f, t) => t('problems.MEASURE_REF_MISSING.description', f),
  MEASURE_NEEDS_ANCHOR: (_, t) => t('problems.MEASURE_NEEDS_ANCHOR.description'),
  MEASURE_ACROSS_PARTS: (f, t) => t('problems.MEASURE_ACROSS_PARTS.description', f),
  FOLLOWS_ANOTHER_PART: (f, t) => t('problems.FOLLOWS_ANOTHER_PART.description', f),

  MIRROR_FOLD_MISSING: (f, t) => t('problems.MIRROR_FOLD_MISSING.description', f),
  MIRROR_OUTLINE_ACROSS_FOLD: (f, t) => t('problems.MIRROR_OUTLINE_ACROSS_FOLD.description', f),
  MIRROR_PLACED_BY_FOLD: (f, t) => t('problems.MIRROR_PLACED_BY_FOLD.description', f),
  FOLD_NOT_STRAIGHT: (_, t) => t('problems.FOLD_NOT_STRAIGHT.description'),
  MIRROR_WOULD_SCALE: (f, t) => t('problems.MIRROR_WOULD_SCALE.description', f),
  MIRROR_NO_AXIS: (_, t) => t('problems.MIRROR_NO_AXIS.description'),

  FEATURE_LOCKED: (f, t) => t('problems.FEATURE_LOCKED.description', f),
  FEATURE_MISSING: (_, t) => t('problems.FEATURE_MISSING.description'),
  NOT_A_DRAWN_PATH: (f, t) => t('problems.NOT_A_DRAWN_PATH.description', f),
  POINT_EDIT_DEGENERATE: (f, t) => t('problems.POINT_EDIT_DEGENERATE.description', f),
  ROUNDING_DOES_NOT_FIT: (f, t) =>
    t('problems.ROUNDING_DOES_NOT_FIT.description', {
      featureName: f.featureName,
      radius: formatEditable(f.radiusMm, 2),
    }),
  NOT_A_ROUNDED_CORNER: (f, t) => t('problems.NOT_A_ROUNDED_CORNER.description', f),
  CORNER_IN_USE: (f, t) => t('problems.CORNER_IN_USE.description', f),
  NOT_DERIVED: (f, t) => t('problems.NOT_DERIVED.description', f),
  DERIVED_MOVED_ALONE: (f, t) => t('problems.DERIVED_MOVED_ALONE.description', f),
  TRANSFORM_FLATTENS: (_, t) => t('problems.TRANSFORM_FLATTENS.description'),
  WOULD_BECOME_ELLIPSE: (_, t) => t('problems.WOULD_BECOME_ELLIPSE.description'),
  WOULD_SHEAR: (_, t) => t('problems.WOULD_SHEAR.description'),
  TEXT_WOULD_DISTORT: (_, t) => t('problems.TEXT_WOULD_DISTORT.description'),
  DIMENSION_NOT_MIRRORED: (f, t) => t('problems.DIMENSION_NOT_MIRRORED.description', f),
  TEXT_WOULD_READ_BACKWARDS: (_, t) => t('problems.TEXT_WOULD_READ_BACKWARDS.description'),
  NO_TARGET_PART: (f, t) => t(`problems.NO_TARGET_PART.${f.what}`),
  TARGET_SPANS_PARTS: (_, t) => t('problems.TARGET_SPANS_PARTS.description'),

  PARAMETER_INVALID: (f, t) => {
    const about = {
      featureName: f.featureName,
      parameter: t(`problems.PARAMETER_INVALID.parameter.${f.parameter}`),
    };
    // The rule, not the value, for a floor: a pitch of 1e-300 would round to
    // "0" here, and a positive number must not be called zero.
    return f.requirement === 'at-least'
      ? t('problems.PARAMETER_INVALID.at-least', { ...about, minimum: formatMm(f.minimum) })
      : t(`problems.PARAMETER_INVALID.${f.requirement}`, { ...about, value: typed(f.value) });
  },
  OFFSET_COLLAPSED: (f, t) =>
    t(`problems.OFFSET_COLLAPSED.${f.side}`, { distance: formatEditable(f.distanceMm, 2) }),
  OFFSET_UNSUPPORTED: (f, t) => t('problems.OFFSET_UNSUPPORTED.description', f),
  OFFSET_SPLIT: (f, t) =>
    t('problems.OFFSET_SPLIT.description', {
      featureName: f.featureName,
      pieces: f.droppedPieces + 1,
      count: f.droppedPieces,
    }),
  ANCHOR_MISSING: (f, t) =>
    f.available < 1
      ? t('problems.ANCHOR_MISSING.noCorners')
      : t('problems.ANCHOR_MISSING.description', { anchor: f.anchor, available: f.available }),
  SOURCE_FAILED: (f, t) => t('problems.SOURCE_FAILED.description', f),
  GEOMETRY_FAILED: (f, t) => t('problems.GEOMETRY_FAILED.description', f),

  TEXT_GLYPH_MISSING: (f, t) =>
    t(`problems.TEXT_GLYPH_MISSING.${f.featureId === undefined ? 'part' : 'label'}`, {
      text: f.text,
      characters: f.characters,
    }),

  CONTOUR_SELF_INTERSECTS: (f, t) =>
    t('problems.CONTOUR_SELF_INTERSECTS.description', {
      featureName: f.featureName,
      count: Math.max(1, f.crossings),
    }),
  HOLE_SPACING_DEVIATION: (f, t) =>
    t('problems.HOLE_SPACING_DEVIATION.description', {
      achieved: formatMm(f.achievedMm),
      pitch: formatMm(f.pitchMm),
    }),
  HOLE_SPACING_UNEVEN: (f, t) =>
    t('problems.HOLE_SPACING_UNEVEN.description', {
      featureName: f.featureName,
      narrowest: formatMm(f.narrowestMm),
      widest: formatMm(f.widestMm),
    }),
  HOLE_COUNT_TOO_LOW: (f, t) =>
    f.count < 1
      ? t('problems.HOLE_COUNT_TOO_LOW.none', { featureName: f.featureName })
      : t('problems.HOLE_COUNT_TOO_LOW.description', {
          featureName: f.featureName,
          count: f.count,
        }),
  PART_HAS_NO_OUTER_CONTOUR: (f, t) => t('problems.PART_HAS_NO_OUTER_CONTOUR.description', f),
  CUT_OUT_OUTSIDE_PART: (f, t) => t('problems.CUT_OUT_OUTSIDE_PART.description', f),
  OUTSIDE_PART: (f, t) => t(`problems.OUTSIDE_PART.${f.what}`, { featureName: f.featureName }),
  HOLE_TOO_CLOSE_TO_EDGE: (f, t) =>
    t('problems.HOLE_TOO_CLOSE_TO_EDGE.description', {
      featureName: f.featureName,
      clearance: formatMm(f.clearanceMm),
      minimum: formatMm(f.minimumMm),
    }),

  EMPTY_PART: (f, t) => t('problems.EMPTY_PART.description', f),
};

/** The sentence for a problem. */
export function describeProblem(p: Problem, t: Translate): string {
  // The union of entries cannot be narrowed by `p.code` alone; the catalogue's
  // mapped type is what guarantees this entry takes these facts.
  const describe = CATALOGUE[p.code] as Describe<ProblemCode>;
  return describe(p.facts as never, t);
}

/** A few words naming the kind of problem, for a list. */
export function problemTitle(code: ProblemCode, t: Translate): string {
  return t(`problems.${code}.title`);
}

/**
 * The sentence, prefixed with its subject's name when it does not already say
 * it — for a surface with no other way to show which feature is meant: the
 * loader's error, where a file can hold dozens.
 */
export function describeProblemWithSubject(p: Problem, t: Translate): string {
  const sentence = describeProblem(p, t);
  const facts = p.facts as Partial<Record<'featureName' | 'partName', string>>;
  const name = facts.featureName ?? facts.partName;
  return name === undefined || sentence.includes(name)
    ? sentence
    : t('problems.withSubject', { name, sentence });
}

/** Enough precision to recognise a typed value, without float noise. */
function typed(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}
