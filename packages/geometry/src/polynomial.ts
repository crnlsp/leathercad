/**
 * Real roots of low-degree polynomials.
 *
 * Used wherever a curve has to be intersected with something: ray casting for
 * point-in-path, axis crossings for exact bounds, and segment intersection.
 *
 * Every solver returns roots in ascending order and polishes each one with
 * Newton iterations, because the closed forms lose precision badly near
 * repeated roots — exactly the configurations that tangency produces.
 *
 * Their tolerances are relative where rounding grows with the inputs; they
 * live in core's epsilon module with the rest.
 */

import {
  EPS_COEFFICIENT,
  EPS_NEWTON_SLOPE,
  EPS_PARAM,
  EPS_REL_CUBIC_DISCRIMINANT,
  EPS_REL_QUADRATIC_DISCRIMINANT,
  EPS_REL_ROOT,
} from '@leathercad/core';

/** Roots of `a·t + b`. */
export function solveLinear(a: number, b: number): number[] {
  if (Math.abs(a) < EPS_COEFFICIENT) return [];
  return [-b / a];
}

/** Roots of `a·t² + b·t + c`, ascending. */
export function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < EPS_COEFFICIENT) return solveLinear(b, c);

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];

  // A tangency almost never produces a discriminant of exactly zero, and the
  // two roots derived from a near-zero one are numerically worthless — they
  // differ only in digits the subtraction already destroyed. Treating a
  // relatively tiny discriminant as a genuine double root is both more honest
  // and more stable, and tangency is exactly what curve intersection produces.
  const magnitude = Math.max(Math.abs(b * b), Math.abs(4 * a * c));
  if (discriminant <= magnitude * EPS_REL_QUADRATIC_DISCRIMINANT) return [-b / (2 * a)];

  // The textbook form loses most of its digits when b² ≫ 4ac, because one
  // root comes from subtracting two nearly equal numbers. Computing the
  // larger-magnitude root first and deriving the other from the product
  // avoids that entirely.
  const root = Math.sqrt(discriminant);
  const q = b >= 0 ? -0.5 * (b + root) : -0.5 * (b - root);
  const roots = [q / a, c / q];
  return roots.sort((x, y) => x - y);
}

/**
 * Real roots of `a·t³ + b·t² + c·t + d`, ascending.
 *
 * Depresses to `t³ + p·t + q` and branches on the discriminant: one real root
 * when positive, three when negative (via the trigonometric form, which avoids
 * the complex arithmetic Cardano's formula would otherwise need), and a
 * repeated root when it vanishes. Only the largest root is kept from that;
 * the others come from the quadratic left when it is divided out.
 */
export function solveCubic(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < EPS_COEFFICIENT) return solveQuadratic(b, c, d);

  const bn = b / a;
  const cn = c / a;
  const dn = d / a;

  const shift = -bn / 3;
  const p = cn - (bn * bn) / 3;
  const q = (2 * bn * bn * bn) / 27 - (bn * cn) / 3 + dn;

  const roots: number[] = [];
  const discriminant = (q * q) / 4 + (p * p * p) / 27;

  // The threshold has to scale with the terms that formed the discriminant.
  // An absolute one misclassifies small-coefficient cubics: with
  // −0.0005·t³ + 1e-9 the discriminant is 1e-12, which an absolute 1e-12 cut
  // reads as "repeated root", returning two wrong roots — one of which
  // polishes to a spurious zero. Small coefficients are ordinary here, since
  // curve parameters live in [0, 1].
  const discriminantScale = Math.max(
    Math.abs((q * q) / 4),
    Math.abs((p * p * p) / 27),
    Number.MIN_VALUE,
  );
  const threshold = discriminantScale * EPS_REL_CUBIC_DISCRIMINANT;

  if (discriminant > threshold) {
    const root = Math.sqrt(discriminant);
    roots.push(Math.cbrt(-q / 2 + root) + Math.cbrt(-q / 2 - root) + shift);
  } else if (discriminant < -threshold) {
    // Three distinct real roots. p is necessarily negative here.
    const magnitude = 2 * Math.sqrt(-p / 3);
    const argument = Math.acos(clamp((3 * q) / (p * magnitude), -1, 1)) / 3;
    const third = (2 * Math.PI) / 3;
    roots.push(
      magnitude * Math.cos(argument) + shift,
      magnitude * Math.cos(argument - third) + shift,
      magnitude * Math.cos(argument - 2 * third) + shift,
    );
  } else {
    // Repeated root: a double and a single. Covers p = q = 0 correctly too,
    // where both collapse to `shift` and dedupe leaves one.
    const single = Math.cbrt(-q / 2);
    roots.push(2 * single + shift, -single + shift);
  }

  // Cardano resolves every root only to the rounding of the largest, so where
  // one root dwarfs the others it loses them — the cubic analogue of the
  // cancellation solveQuadratic avoids. A t³ term of rounding noise put a
  // root near 3.8e13 and answered t = 0.75 for a tangent touch at 0.5; roots
  // at 0 and −0.01 beside one at 26000 read as a double root and vanished
  // (Q38). The largest is the one it gets right: divide it out, and the
  // quadratic left finds the rest to their own precision.
  let largest: number | undefined;
  for (const candidate of roots) {
    const t = polishCubicRoot(a, b, c, d, candidate);
    if (!isGenuineCubicRoot(a, b, c, d, t)) continue;
    if (largest === undefined || Math.abs(t) > Math.abs(largest)) largest = t;
  }
  if (largest === undefined) return [];

  const rest = solveQuadratic(...deflate(a, b, c, d, largest));
  return dedupe([largest, ...rest].sort((x, y) => x - y));
}

/**
 * The quadratic left when `t − x` is divided out of the cubic, for a root `x`.
 *
 * Synthetic division is stable only when run from the end whose term the
 * root dominates: from `a` down when x is small beside the other two roots,
 * from `d` up when it is large. The top-down quotient ends in their product
 * times `a`, so `|a·x²|` against it says which — even where d is zero and x
 * only nearly so. The quotient leads with `a` either way, which keeps it
 * clear of solveQuadratic's degree drop. An inexact x leaves its residual
 * behind — as a constant from the top, as `(residual/x²)·t²` from the
 * bottom — no larger where the other roots lie than it was at x.
 */
function deflate(a: number, b: number, c: number, d: number, x: number): [number, number, number] {
  const b1 = b + a * x;
  const c1 = c + b1 * x;
  if (Math.abs(a * x * x) <= Math.abs(c1)) return [a, b1, c1];

  const c2 = -d / x;
  return [a, (c2 - c) / x, c2];
}

/**
 * Two Newton steps against the original coefficients.
 *
 * The depressed-cubic route accumulates error through the cube roots and the
 * arccosine; polishing recovers it cheaply. Skipped where the derivative is
 * flat, since Newton diverges there and the unpolished root is the better
 * answer.
 */
function polishCubicRoot(a: number, b: number, c: number, d: number, t: number): number {
  let root = t;
  for (let i = 0; i < 2; i++) {
    const value = ((a * root + b) * root + c) * root + d;
    const slope = (3 * a * root + 2 * b) * root + c;
    if (Math.abs(slope) < EPS_NEWTON_SLOPE) break;
    const step = value / slope;
    if (!Number.isFinite(step)) break;
    root -= step;
  }
  return root;
}

/** Cauchy's bound: every real root lies within ±this. */
function rootScaleOf(a: number, b: number, c: number, d: number): number {
  return 1 + Math.max(Math.abs(b), Math.abs(c), Math.abs(d)) / Math.abs(a);
}

/**
 * Rejects candidates that are not actually roots.
 *
 * The depressed-cubic route can invent them. When one root dwarfs the others,
 * `q²/4 + p³/27` is the difference of two nearly equal huge numbers and the
 * cancellation destroys its sign, so a cubic with one real root is classified
 * as having a repeated one — and the extra value that branch produces gets
 * polished by Newton into something convincing. Dividing it out would leave a
 * quadratic with the wrong roots.
 *
 * Two certificates, either of which suffices:
 *
 * 1. A residual tiny next to the terms that produced it. This settles ordinary
 *    roots and double roots, where the derivative vanishes and no step-based
 *    test can work.
 * 2. A Newton step tiny next to the **root scale** rather than next to the
 *    candidate itself. This is what settles roots at or near zero. A cubic
 *    with roots at 0 and 738000 resolves the small one to about 7e-11, whose
 *    residual is the same order as its own terms — a relative residual test
 *    throws away a perfectly good root, while the step correctly reads as
 *    converged against a scale of 738000.
 *
 * A spurious root satisfies neither: its residual matches its terms, and
 * Newton still wants to move it a long way relative to the root scale.
 */
function isGenuineCubicRoot(a: number, b: number, c: number, d: number, t: number): boolean {
  const residual = Math.abs(((a * t + b) * t + c) * t + d);
  const termScale = Math.max(
    Math.abs(a * t * t * t),
    Math.abs(b * t * t),
    Math.abs(c * t),
    Math.abs(d),
  );
  if (residual <= termScale * EPS_REL_ROOT) return true;

  const slope = (3 * a * t + 2 * b) * t + c;
  const step = residual / slope;
  // A vanishing slope gives Infinity or NaN, which is the answer: at a
  // stationary point the step says nothing, and the residual test above has
  // already had its chance.
  if (!Number.isFinite(step)) return false;

  return Math.abs(step) <= rootScaleOf(a, b, c, d) * EPS_REL_ROOT;
}

/** Roots closer than EPS_PARAM are one: every caller solves for a curve's `t`. */
function dedupe(sorted: number[]): number[] {
  const result: number[] = [];
  for (const value of sorted) {
    const last = result[result.length - 1];
    if (last === undefined || Math.abs(value - last) > EPS_PARAM) result.push(value);
  }
  return result;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Keeps only roots inside the open interval (0, 1). */
export function rootsInUnitInterval(roots: readonly number[]): number[] {
  return roots.filter((t) => t > 0 && t < 1);
}
