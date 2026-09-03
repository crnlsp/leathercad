import { EPS_POINT, approxEq, approxZero } from '@leathercad/core';

import { add, rotate, sub, type Vec2 } from './vec2.js';

/**
 * A 2D affine transform.
 *
 * ```
 * | a  c  e |
 * | b  d  f |
 * | 0  0  1 |
 * ```
 *
 * Column-vector convention, matching SVG, Canvas2D and PDF, so a matrix can be
 * handed to any of them without transposition.
 */
export interface Mat2x3 {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Mat2x3 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function fromTranslation(offset: Vec2): Mat2x3 {
  return { a: 1, b: 0, c: 0, d: 1, e: offset.x, f: offset.y };
}

/** Counter-clockwise, about the origin. */
export function fromRotation(radians: number): Mat2x3 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function fromScale(sx: number, sy: number = sx): Mat2x3 {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function fromRotationAround(centre: Vec2, radians: number): Mat2x3 {
  return composeAll(
    fromTranslation({ x: -centre.x, y: -centre.y }),
    fromRotation(radians),
    fromTranslation(centre),
  );
}

/**
 * Reflection about the infinite line through `origin` at `radians`.
 *
 * Built by composition rather than a closed form: mirroring is the operation
 * most likely to be silently wrong, and this way each step is independently
 * meaningful.
 */
export function fromMirror(origin: Vec2, radians: number): Mat2x3 {
  return composeAll(
    fromTranslation({ x: -origin.x, y: -origin.y }),
    fromRotation(-radians),
    fromScale(1, -1),
    fromRotation(radians),
    fromTranslation(origin),
  );
}

/**
 * The transform that applies `first`, then `second`.
 *
 * Argument order is chronological on purpose. The matrix product is the other
 * way round, and writing `compose(a, b)` to mean "b then a" is a reliable
 * source of mirrored output.
 */
export function compose(first: Mat2x3, second: Mat2x3): Mat2x3 {
  return {
    a: second.a * first.a + second.c * first.b,
    b: second.b * first.a + second.d * first.b,
    c: second.a * first.c + second.c * first.d,
    d: second.b * first.c + second.d * first.d,
    e: second.a * first.e + second.c * first.f + second.e,
    f: second.b * first.e + second.d * first.f + second.f,
  };
}

/** Composes left to right, in the order the transforms are applied. */
export function composeAll(...transforms: readonly Mat2x3[]): Mat2x3 {
  return transforms.reduce(compose, IDENTITY);
}

/** Transforms a point, including translation. */
export function apply(m: Mat2x3, v: Vec2): Vec2 {
  return { x: m.a * v.x + m.c * v.y + m.e, y: m.b * v.x + m.d * v.y + m.f };
}

/**
 * Transforms a direction, ignoring translation.
 *
 * Use this for tangents, normals and offsets. Applying the full transform to a
 * direction shifts it by the translation, which is a bug that only shows up
 * once something is moved away from the origin.
 */
export function applyDirection(m: Mat2x3, v: Vec2): Vec2 {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

export function determinant(m: Mat2x3): number {
  return m.a * m.d - m.b * m.c;
}

export function invert(m: Mat2x3): Mat2x3 {
  const det = determinant(m);
  if (approxZero(det, EPS_POINT)) {
    throw new RangeError('matrix is singular and cannot be inverted');
  }
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** True when the transform flips handedness — a mirror is involved. */
export function isMirrored(m: Mat2x3): boolean {
  return determinant(m) < 0;
}

/**
 * True when the transform is a rotation, translation, uniform scale, mirror,
 * or any combination — that is, when it preserves angles.
 *
 * This is the test that decides whether arcs survive a transform as arcs. A
 * non-uniform scale turns a circular arc into an elliptical one, which the
 * Segment union cannot represent. See docs/geometry.md §4.2.
 */
export function isSimilarity(m: Mat2x3, eps: number = 1e-9): boolean {
  const colXLenSq = m.a * m.a + m.b * m.b;
  const colYLenSq = m.c * m.c + m.d * m.d;
  const orthogonal = approxZero(m.a * m.c + m.b * m.d, eps * Math.max(1, colXLenSq));
  return orthogonal && approxEq(colXLenSq, colYLenSq, eps * Math.max(1, colXLenSq));
}

/**
 * The uniform scale factor, for a similarity transform.
 *
 * Used to convert a tolerance across a transform: a 0.005 mm flattening
 * tolerance is only 0.005 mm on the other side if the scale is 1.
 */
export function uniformScaleOf(m: Mat2x3): number {
  return Math.sqrt(Math.abs(determinant(m)));
}

export function equals(a: Mat2x3, b: Mat2x3, eps: number = EPS_POINT): boolean {
  return (
    approxEq(a.a, b.a, eps) &&
    approxEq(a.b, b.b, eps) &&
    approxEq(a.c, b.c, eps) &&
    approxEq(a.d, b.d, eps) &&
    approxEq(a.e, b.e, eps) &&
    approxEq(a.f, b.f, eps)
  );
}

export function isIdentity(m: Mat2x3, eps: number = EPS_POINT): boolean {
  return equals(m, IDENTITY, eps);
}

/** Mirrors a point about the line through `origin` at `radians`. */
export function mirrorPoint(p: Vec2, origin: Vec2, radians: number): Vec2 {
  const local = rotate(sub(p, origin), -radians);
  return add(rotate({ x: local.x, y: -local.y }, radians), origin);
}
