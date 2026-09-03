import { EPS_LENGTH, approxZero, type Mm } from '@leathercad/core';

import { apply, type Mat2x3 } from '../mat2x3.js';
import { fromPoints, type Rect } from '../rect.js';
import { add, dist, lerp, scale, sub, tryNormalise, vec, ZERO, type Vec2 } from '../vec2.js';
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
 * `p0 === p1`, which is extremely common in curves produced by offsetting. The
 * curve still has a direction there, so fall back to the second derivative and
 * then to the chord rather than returning zero.
 */
export function tangentAt(s: CubicSegment, t: number): Vec2 {
  const first = tryNormalise(derivativeAt(s, t));
  if (first !== null) return first;

  const second = tryNormalise(secondDerivativeAt(s, t));
  if (second !== null) return second;

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

const MAX_LENGTH_DEPTH = 24;

/**
 * Arc length, by recursive subdivision.
 *
 * The control polygon bounds the curve from above and the chord from below, so
 * their gap bounds the error. Subdividing halves that gap quadratically.
 * Preferred over Gauss-Legendre quadrature here because it stays accurate on
 * curves with cusps, which quadrature handles poorly and which offsetting
 * produces routinely.
 */
export function length(s: CubicSegment, tolerance: Mm = EPS_LENGTH): Mm {
  return lengthOf(s.p0, s.p1, s.p2, s.p3, tolerance, 0);
}

function lengthOf(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: Mm, depth: number): Mm {
  const chord = dist(p0, p3);
  const polygon = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);

  if (polygon - chord <= tolerance || depth >= MAX_LENGTH_DEPTH) {
    return (polygon + chord) / 2;
  }

  const p01 = lerp(p0, p1, 0.5);
  const p12 = lerp(p1, p2, 0.5);
  const p23 = lerp(p2, p3, 0.5);
  const p012 = lerp(p01, p12, 0.5);
  const p123 = lerp(p12, p23, 0.5);
  const mid = lerp(p012, p123, 0.5);

  return (
    lengthOf(p0, p01, p012, mid, tolerance / 2, depth + 1) +
    lengthOf(mid, p123, p23, p3, tolerance / 2, depth + 1)
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

/** Roots of the derivative in the open interval (0, 1), for one axis. */
function derivativeRoots(v0: number, v1: number, v2: number, v3: number): number[] {
  const a = v1 - v0;
  const b = v2 - v1;
  const c = v3 - v2;

  const qa = a - 2 * b + c;
  const qb = 2 * (b - a);
  const qc = a;

  const roots: number[] = [];
  const keep = (t: number): void => {
    if (t > 0 && t < 1) roots.push(t);
  };

  if (approxZero(qa, 1e-12)) {
    // Degenerates to a line; one root unless the derivative is constant.
    if (!approxZero(qb, 1e-12)) keep(-qc / qb);
    return roots;
  }

  const discriminant = qb * qb - 4 * qa * qc;
  if (discriminant < 0) return roots;

  const root = Math.sqrt(discriminant);
  keep((-qb + root) / (2 * qa));
  keep((-qb - root) / (2 * qa));
  return roots;
}
