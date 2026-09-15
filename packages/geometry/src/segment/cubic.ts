import { EPS_LENGTH, EPS_PARAM, approxEq, type Mm } from '@leathercad/core';

import { apply, type Mat2x3 } from '../mat2x3.js';
import { rootsInUnitInterval, solveQuadratic } from '../polynomial.js';
import { fromPoints, type Rect } from '../rect.js';
import { add, dot, lerp, negate, scale, sub, tryNormalise, vec, ZERO, type Vec2 } from '../vec2.js';
import { cubic, type CubicSegment } from './types.js';

export function pointAt(s: CubicSegment, t: number): Vec2 {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return vec(
    s.p0.x * b0 + s.p1.x * b1 + s.p2.x * b2 + s.p3.x * b3,
    s.p0.y * b0 + s.p1.y * b1 + s.p2.y * b2 + s.p3.y * b3,
  );
}

/** The first derivative — a velocity, not a unit vector. */
export function derivativeAt(s: CubicSegment, t: number): Vec2 {
  const u = 1 - t;
  const a = scale(sub(s.p1, s.p0), 3 * u * u);
  const b = scale(sub(s.p2, s.p1), 6 * u * t);
  const c = scale(sub(s.p3, s.p2), 3 * t * t);
  return add(add(a, b), c);
}

function secondDerivativeAt(s: CubicSegment, t: number): Vec2 {
  const a = scale(add(sub(s.p2, scale(s.p1, 2)), s.p0), 6 * (1 - t));
  const b = scale(add(sub(s.p3, scale(s.p2, 2)), s.p1), 6 * t);
  return add(a, b);
}

/**
 * Unit direction of travel.
 *
 * The derivative vanishes wherever control points coincide — at `t = 0` when
 * `p0 === p1`, which is extremely common in curves produced by offsetting —
 * and at any `t` where the curve doubles back on itself. The curve still has a
 * direction there, so fall back to the second derivative and then to the
 * chord rather than returning zero.
 *
 * **Which direction, at a cusp.** Where `B'(t) = 0` the curve reverses, and
 * the two one-sided limits of the unit tangent are exact negations: it arrives
 * along `-B̂''` and leaves along `+B̂''`. This returns the **outgoing**
 * direction — the way a traveller walking the segment faces just after `t` —
 * which makes the tangent right-continuous on `[0, 1)`. At `t = 1` there is no
 * "just after", so the incoming direction `-B̂''` is the only real branch;
 * without that sign the end tangent of every curve with `p2 === p3` comes back
 * exactly 180° wrong, still unit length and still on the tangent line.
 *
 * **That choice is made only where the derivative is exactly zero.** Where it
 * is merely too short to normalise — approaching a `p2 === p3` end its length
 * falls off as `6(1-t)|p2 - p1|` and slips under `EPS_POINT` while the curve
 * still travels straight ahead — it is untrustworthy in *length*, not in
 * *direction*, so the fallback is turned to agree with it. `1 - t` is exact in
 * floating point for `t` in `[0.5, 1]`, so that sign holds right up to the last
 * representable parameter.
 *
 * Not decided by how close `t` is to an end. A band of `EPS_PARAM` at `t = 1`
 * was tried: the derivative drops under `EPS_POINT` at
 * `1 - t ≈ 1e-7 / (6|p2 - p1|)`, past the band for any control leg under about
 * 17 mm, and every `t` in that window came back reversed.
 *
 * Deliberately a sign test against zero rather than an epsilon: an epsilon here
 * would be a band again, in different units. At a true cusp whose position is
 * not exactly representable the derivative is rounding noise, and either
 * one-sided direction may come back — both are real.
 *
 * A consequence worth stating, because a property test tripped over it:
 * `tangentAt` is **not** antisymmetric under `reverse` at a cusp. Reversal
 * swaps incoming and outgoing, which are already negations of each other, so
 * the same vector comes back both ways. No single-valued tangent can do
 * better — the choice is between a defined direction and an antisymmetric
 * one, and offsetting and stitch distribution both need it defined.
 */
export function tangentAt(s: CubicSegment, t: number): Vec2 {
  const first = tryNormalise(derivativeAt(s, t));
  if (first !== null) return first;

  const second = tryNormalise(secondDerivativeAt(s, t));
  if (second !== null) {
    const travel = dot(derivativeAt(s, t), second);
    if (travel < 0) return negate(second);
    if (travel > 0) return second;
    // Exactly stationary: there is no direction of travel to read a sign from.
    return approxEq(t, 1, EPS_PARAM) ? negate(second) : second;
  }

  return tryNormalise(sub(s.p3, s.p0)) ?? ZERO;
}

export function split(s: CubicSegment, t: number): [CubicSegment, CubicSegment] {
  // de Casteljau: exact, and it produces both halves for the price of one.
  const p01 = lerp(s.p0, s.p1, t);
  const p12 = lerp(s.p1, s.p2, t);
  const p23 = lerp(s.p2, s.p3, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const mid = lerp(p012, p123, t);

  return [cubic(s.p0, p01, p012, mid), cubic(mid, p123, p23, s.p3)];
}

export function reverse(s: CubicSegment): CubicSegment {
  return cubic(s.p3, s.p2, s.p1, s.p0);
}

/** Cubics are closed under affine transformation, so this is exact. */
export function transform(s: CubicSegment, m: Mat2x3): CubicSegment {
  return cubic(apply(m, s.p0), apply(m, s.p1), apply(m, s.p2), apply(m, s.p3));
}

/**
 * Eight-point Gauss-Legendre nodes and weights on [-1, 1].
 *
 * Eight points integrate a degree-15 polynomial exactly. The speed |B'(t)| is
 * not polynomial — it is the square root of a quartic — but it is smooth
 * wherever the curve has no cusp, and there the error falls off extremely
 * fast with subdivision.
 */
const GAUSS_NODES_8 = [
  -0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498,
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
] as const;

const GAUSS_WEIGHTS_8 = [
  0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362,
  0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
] as const;

const MAX_LENGTH_DEPTH = 16;

/** Gauss-Legendre estimate of arc length over a parameter interval. */
function quadratureLength(s: CubicSegment, t0: number, t1: number): number {
  const half = (t1 - t0) / 2;
  const mid = (t0 + t1) / 2;

  let total = 0;
  for (let i = 0; i < GAUSS_NODES_8.length; i++) {
    const velocity = derivativeAt(s, mid + half * GAUSS_NODES_8[i]!);
    total += GAUSS_WEIGHTS_8[i]! * Math.hypot(velocity.x, velocity.y);
  }
  return total * half;
}

/**
 * Arc length, by adaptive Gauss-Legendre quadrature.
 *
 * Each interval is estimated once whole and once as two halves; when the two
 * agree the estimate has converged, and otherwise the interval is split. That
 * subdivides only where the curve misbehaves — near a cusp — and leaves smooth
 * spans at two or three evaluations.
 *
 * This replaced a chord-versus-control-polygon subdivision, which was correct
 * but pathologically slow: it halved the tolerance at every level, so the
 * flatness requirement tightened exponentially while the gap only shrank
 * fourfold. A 2000 mm curve at a 1e-7 tolerance drove it to the depth cap,
 * visiting sixteen million nodes and taking longer than a CI test timeout.
 * Halving is safe *here* because the quadrature error falls off so fast that
 * the depth stays in single figures.
 */
export function length(s: CubicSegment, tolerance: Mm = EPS_LENGTH): Mm {
  return lengthBetween(s, 0, 1, tolerance);
}

/**
 * Length of the portion between two parameters.
 *
 * The building block for arc-length parameterisation: `t` is not proportional
 * to distance on a cubic, so answering "where is the point 3.85 mm along this"
 * needs partial lengths, not just the total.
 */
export function lengthBetween(
  s: CubicSegment,
  t0: number,
  t1: number,
  tolerance: Mm = EPS_LENGTH,
): Mm {
  if (t1 < t0) return lengthBetween(s, t1, t0, tolerance);
  return adaptiveLength(s, t0, t1, quadratureLength(s, t0, t1), tolerance, 0);
}

function adaptiveLength(
  s: CubicSegment,
  t0: number,
  t1: number,
  whole: number,
  tolerance: Mm,
  depth: number,
): Mm {
  const mid = (t0 + t1) / 2;
  const left = quadratureLength(s, t0, mid);
  const right = quadratureLength(s, mid, t1);
  const split = left + right;

  if (depth >= MAX_LENGTH_DEPTH || Math.abs(split - whole) <= tolerance) return split;

  return (
    adaptiveLength(s, t0, mid, left, tolerance / 2, depth + 1) +
    adaptiveLength(s, mid, t1, right, tolerance / 2, depth + 1)
  );
}

/**
 * Exact bounds.
 *
 * **Not** the bounding box of the control points — that hull is generally much
 * larger than the curve, and using it makes print pages bigger than they need
 * to be and "fit to content" wrong. The true extremes are the endpoints plus
 * wherever the derivative crosses zero, which is a quadratic per axis.
 */
export function bbox(s: CubicSegment): Rect {
  const points: Vec2[] = [s.p0, s.p3];

  for (const t of derivativeRoots(s.p0.x, s.p1.x, s.p2.x, s.p3.x)) {
    points.push(pointAt(s, t));
  }
  for (const t of derivativeRoots(s.p0.y, s.p1.y, s.p2.y, s.p3.y)) {
    points.push(pointAt(s, t));
  }

  return fromPoints(points) ?? fromPoints([s.p0])!;
}

/**
 * Roots of the derivative in the open interval (0, 1), for one axis.
 *
 * Delegates the quadratic to `solveQuadratic` rather than inlining the
 * textbook formula. That is not tidiness: with control points like
 * 0 → −2000 → −2000 → 0 the quadratic coefficients become (−4e-10, 4000,
 * −2000), where `(−b + √disc)` subtracts two values of 4000 and destroys the
 * root at t = 0.5 — losing the extremum and shrinking the bounding box from
 * 1500 mm wide to nothing.
 */
function derivativeRoots(v0: number, v1: number, v2: number, v3: number): number[] {
  const a = v1 - v0;
  const b = v2 - v1;
  const c = v3 - v2;

  return rootsInUnitInterval(solveQuadratic(a - 2 * b + c, 2 * (b - a), a));
}
