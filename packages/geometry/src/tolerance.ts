import type { Mm } from '@leathercad/core';

/**
 * Geometric tolerances, in millimetres.
 *
 * These are *approximation* budgets — how far a curve may be from its
 * polyline or Bézier stand-in. They are much coarser than the epsilons in
 * @leathercad/core, which decide whether two numbers are the same number.
 *
 * See docs/geometry.md §5.1.
 */

/**
 * For anything that will be cut or printed.
 *
 * A 600 dpi printer dot is 42 µm, so 5 µm is a tenth of the finest mark the
 * hardware can make and comfortably invisible on leather.
 */
export const EXPORT_TOLERANCE_MM: Mm = 0.005;

/**
 * For on-screen rendering.
 *
 * Below one device pixel at any usable zoom, and ten times cheaper to compute
 * than the export tolerance.
 */
export const SCREEN_TOLERANCE_MM: Mm = 0.05;

/**
 * Error coefficient for approximating a circular arc with cubic Béziers using
 * the standard `4/3·tan(θ/4)` handle length.
 *
 * The maximum radial deviation follows `error ≈ k · radius · θ⁶` where θ is
 * the angle spanned by one cubic. Measured empirically across 10°–90°, this
 * value predicts the true error to within 0.5%.
 *
 * The θ⁶ term is why subdivision is so effective: halving the step cuts the
 * error by 64.
 */
export const ARC_CUBIC_ERROR_COEFFICIENT = 1.8142e-5;

/**
 * The largest angle one cubic may span to stay within `tolerance` on an arc of
 * `radius`.
 *
 * Capped at a quarter turn: beyond that the handle length `4/3·tan(θ/4)` grows
 * without bound and the approximation stops behaving.
 */
export function maxArcStepForTolerance(radius: Mm, tolerance: Mm): number {
  const quarterTurn = Math.PI / 2;
  if (radius <= 0 || tolerance <= 0) return quarterTurn;

  const step = Math.pow(tolerance / (ARC_CUBIC_ERROR_COEFFICIENT * radius), 1 / 6);
  return Math.min(quarterTurn, step);
}
