/**
 * The one place tolerances are defined. Nothing else may declare an epsilon —
 * ad-hoc tolerances scattered through geometry code produce snapping and
 * boolean failures that are not reproducible. See CLAUDE.md invariant 7.
 *
 * These are **absolute**, not relative, and that is deliberate. Documents span
 * 0.1 mm to 2000 mm; at 2000 mm a double resolves to roughly 1e-13 mm, so
 * EPS_POINT sits four orders of magnitude above floating-point noise and far
 * below anything a maker can cut. A relative epsilon would buy nothing and
 * would make "are these two points the same" depend on where they are.
 */

/** Two coordinates closer than this are the same point. 0.1 nanometre. */
export const EPS_POINT = 1e-7;

/** A segment shorter than this is degenerate. */
export const EPS_LENGTH = 1e-7;

/** For the parameter `t` along a segment, which is dimensionless in [0, 1]. */
export const EPS_PARAM = 1e-9;

/** Radians. */
export const EPS_ANGLE = 1e-9;

/** Square millimetres. Areas are products, so their noise floor is lower. */
export const EPS_AREA = 1e-12;

/**
 * Tolerant equality.
 *
 * NaN is never equal to anything, including itself — propagating it as "equal"
 * would hide exactly the bug the guards exist to surface. Identical infinities
 * compare equal because they are the same value; opposite ones do not.
 */
export function approxEq(a: number, b: number, eps: number = EPS_POINT): boolean {
  // Catches exact equality first, which also handles ±0 and identical infinities.
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

export function approxZero(value: number, eps: number = EPS_POINT): boolean {
  return approxEq(value, 0, eps);
}

/** True when `a` is less than `b`, or close enough to count as equal. */
export function approxLte(a: number, b: number, eps: number = EPS_POINT): boolean {
  return approxEq(a, b, eps) || a < b;
}

/** True when `a` is greater than `b`, or close enough to count as equal. */
export function approxGte(a: number, b: number, eps: number = EPS_POINT): boolean {
  return approxEq(a, b, eps) || a > b;
}

/**
 * Three-way comparison with a tolerance: -1, 0 or 1.
 *
 * Useful for sorting, where treating near-equal values as equal keeps the order
 * stable instead of letting the last bit decide.
 */
export function approxCmp(a: number, b: number, eps: number = EPS_POINT): -1 | 0 | 1 {
  if (approxEq(a, b, eps)) return 0;
  return a < b ? -1 : 1;
}
