import type { Mm } from '@leathercad/core';
import type { Severity } from '@leathercad/domain';

import type { Translate } from '../../shared/i18n.js';

/**
 * How the spacing a hole set came out at compares with its iron's pitch
 * (R-05; R-14's selection bar says the same): it matches, or it is stretched
 * or squeezed by `percent`, to the tenth the line shows.
 *
 * Pitch is the iron's nominal spacing and spacing what the fit achieved
 * (docs/glossary.md). The domain warns only past a quarter of the pitch
 * (`SPACING_DEVIATION_FRACTION`, a problem worth listing); this is the
 * number itself, which the maker reads before punching. Whether it is worth a
 * warning is Problems' to say: see `spacingGlyph`.
 */
export type SpacingAgainstPitch =
  | { readonly kind: 'matches' }
  | { readonly kind: 'stretched' | 'squeezed'; readonly percent: number };

/**
 * "Matches" is decided by what is shown, not by a tolerance (invariant 7): the
 * difference, in whole tenths of a percent as the line writes it, is none.
 * The percent handed back is that same count of tenths, so the words and the
 * decision cannot disagree.
 */
export function spacingAgainstPitch(spacingMm: Mm, pitchMm: Mm): SpacingAgainstPitch {
  const tenths = Math.round((Math.abs(spacingMm - pitchMm) / pitchMm) * 1000);
  if (tenths < 1) return { kind: 'matches' };
  return { kind: spacingMm > pitchMm ? 'stretched' : 'squeezed', percent: tenths / 10 };
}

/**
 * The glyph beside the line. A warning is Problems' verdict on this set
 * (`HOLE_SPACING_DEVIATION`), passed in as its severity, never a rule of the
 * line's own — so the line and the Problems list cannot disagree. Otherwise a
 * check when it matches, and a plain stretch or squeeze when it does not: 0.1 %
 * on a 3.85 iron is 0.004 mm, a fact to read, not a warning to learn to ignore.
 */
export function spacingGlyph(
  check: SpacingAgainstPitch,
  reported: Severity | undefined,
): 'check' | 'stretched' | 'squeezed' | Severity {
  if (reported !== undefined) return reported;
  return check.kind === 'matches' ? 'check' : check.kind;
}

/** "Spacing matches the pitch", "Spacing is stretched 1.8 %". */
export function describeSpacing(check: SpacingAgainstPitch, t: Translate): string {
  return check.kind === 'matches'
    ? t('spacing.matches')
    : t(`spacing.${check.kind}`, { percent: check.percent });
}
