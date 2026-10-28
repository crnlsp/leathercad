import { EPS_RATIO, approxEq, approxLte } from './epsilon.js';
import { assertFinite } from './guard.js';
import { err, ok, type Result } from './result.js';

/**
 * A printer's scale correction (7.5): what its output is multiplied by on
 * each axis of the paper, as the paper goes through it — `x` across, `y`
 * along. Stored per printer in the app's configuration, never in a project
 * (docs/printing.md §8.2).
 *
 * Here, below everything, because four places must agree on it: the main
 * process stores and checks it, the platform boundary carries it, the PDF
 * writer applies it, and the Print Preview words it.
 */
export interface ScaleCorrection {
  readonly x: number;
  readonly y: number;
}

/** The default, always: a printer nobody calibrated prints the PDF as written. */
export const NO_CORRECTION: ScaleCorrection = { x: 1, y: 1 };

/**
 * The most a correction may change either axis, ±2 %. A printer is off by a
 * few tenths of a percent; anything larger is almost certainly a print
 * setting — *Fit to page* takes 3 % or more — which a correction would only
 * hide, and then add to the next print made with the setting fixed.
 */
export const CORRECTION_LIMIT = 0.02;

/**
 * Within the guard on both axes. The edge itself is in: `EPS_RATIO`, the
 * tolerance for a dimensionless number of order one, keeps a ratio that is
 * 2 % but for its last bits from being refused.
 */
export function isAllowedCorrection(correction: ScaleCorrection): boolean {
  const within = (factor: number): boolean =>
    Number.isFinite(factor) && approxLte(Math.abs(factor - 1), CORRECTION_LIMIT, EPS_RATIO);
  return within(correction.x) && within(correction.y);
}

/** One on both axes: nothing to apply. */
export function isNoCorrection(correction: ScaleCorrection): boolean {
  return approxEq(correction.x, 1, EPS_RATIO) && approxEq(correction.y, 1, EPS_RATIO);
}

/**
 * The correction that makes a printer's lines as long as they were drawn:
 * `drawn / measured` on each axis — exactly that division, nothing rounded.
 *
 * `measured` is what the maker read off the calibration page, so it can be
 * anything they typed; a length that is no length, or one off by more than
 * the guard allows, is `beyond-limit`. `drawn` is the page's own, and a
 * length that is not one is a bug: it throws.
 */
export function correctionFrom(
  drawn: ScaleCorrection,
  measured: ScaleCorrection,
): Result<ScaleCorrection, 'beyond-limit'> {
  for (const [axis, length] of [
    ['x', drawn.x],
    ['y', drawn.y],
  ] as const) {
    assertFinite(length, `drawn.${axis}`);
    if (length <= 0) throw new RangeError(`drawn.${axis} must be positive, received ${length}`);
  }
  const correction = { x: drawn.x / measured.x, y: drawn.y / measured.y };
  // A measurement of zero or less, or not a number, makes no factor the
  // guard allows: it is refused with the rest.
  if (!(measured.x > 0 && measured.y > 0) || !isAllowedCorrection(correction)) {
    return err('beyond-limit');
  }
  return ok(correction);
}
