import { formatNumber, type Mm } from '@leathercad/core';
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
  | {
      readonly kind: 'stretched' | 'squeezed';
      /** To the tenth: at least 0.1. */
      readonly percent: number;
      /** The readouts differ, but by less than the tenth of a percent shown. */
      readonly underATenth: boolean;
    };

/**
 * The decimals a hole set's Pitch field and its Spacing readout are both shown
 * to — the one place either gets it, so "matches" below is about the numbers
 * the maker reads.
 */
export const SPACING_DECIMALS = 2;

/** A pitch or a spacing as Properties shows it: `3.85`. */
export function formatSpacing(mm: Mm): string {
  return formatNumber(mm, SPACING_DECIMALS);
}

/**
 * "Matches" is decided by what is shown, not by a tolerance (invariant 7): the
 * Spacing readout shows the Pitch field's number. Otherwise the difference in
 * tenths of a percent as the line writes it — and where the readouts differ
 * by less than that tenth, "less than 0.1 %", so it never reads 0.0 %.
 */
export function spacingAgainstPitch(spacingMm: Mm, pitchMm: Mm): SpacingAgainstPitch {
  if (formatSpacing(spacingMm) === formatSpacing(pitchMm)) return { kind: 'matches' };
  const tenths = Math.round((Math.abs(spacingMm - pitchMm) / pitchMm) * 1000);
  return {
    kind: spacingMm > pitchMm ? 'stretched' : 'squeezed',
    percent: Math.max(tenths, 1) / 10,
    underATenth: tenths < 1,
  };
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

/** "Spacing matches the pitch", "Spacing is stretched 1.8 %", "… less than 0.1 %". */
export function describeSpacing(check: SpacingAgainstPitch, t: Translate): string {
  return check.kind === 'matches'
    ? t('spacing.matches')
    : t(`spacing.${check.kind}${check.underATenth ? 'Under' : ''}`, { percent: check.percent });
}

/**
 * A hole set's runs as Properties and the selection bar both show them:
 * `24 · 51 · 24 · 51`. Each run counts its corner holes, so they add up to
 * more than the set, by one per corner two runs share (U.17).
 */
export function formatRuns(runs: readonly { readonly count: number }[]): string {
  return runs.map((run) => run.count).join(' · ');
}

/** The selection bar's shorter words for the same: "stretched 1.8 %"; nothing when it matches. */
export function describeSpacingShort(check: SpacingAgainstPitch, t: Translate): string | null {
  return check.kind === 'matches'
    ? null
    : t(`selectionBar.${check.kind}${check.underATenth ? 'Under' : ''}`, {
        percent: check.percent,
      });
}
