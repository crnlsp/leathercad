import { EPS_POINT, approxEq, approxZero, assertFinite, quantise, type Mm } from '@leathercad/core';

/**
 * A point or a direction in millimetres. **Y points up.**
 *
 * A plain object rather than a class: V8 optimises these well, they serialise
 * straight to JSON, and they carry no prototype into the file format. Treated
 * as immutable by convention and not frozen, because Object.freeze is slow in
 * the paths that matter.
 */
export interface Vec2 {
  readonly x: Mm;
  readonly y: Mm;
}

export const ZERO: Vec2 = { x: 0, y: 0 };
export const UNIT_X: Vec2 = { x: 1, y: 0 };
export const UNIT_Y: Vec2 = { x: 0, y: 1 };

export function vec(x: Mm, y: Mm): Vec2 {
  return { x, y };
}

/** Rejects NaN and Infinity, naming the offending component. */
export function assertFiniteVec(v: Vec2, name: string): Vec2 {
  assertFinite(v.x, `${name}.x`);
  assertFinite(v.y, `${name}.y`);
  return v;
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, factor: number): Vec2 {
  return { x: v.x * factor, y: v.y * factor };
}

export function negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** The z component of the 3D cross product. Positive when b is left of a. */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/** Prefer this over `len` in comparisons — no square root, and more accurate. */
export function lenSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/** Prefer this over `dist` in comparisons. */
export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Scales to unit length. Throws on a zero-length vector.
 *
 * Normalising zero has no meaningful answer, and silently returning zero would
 * push a wrong direction downstream where it is far harder to trace. Use
 * `tryNormalise` where a degenerate input is expected and handled.
 */
export function normalise(v: Vec2): Vec2 {
  const length = len(v);
  if (approxZero(length, EPS_POINT)) {
    throw new RangeError('cannot normalise a zero-length vector');
  }
  return { x: v.x / length, y: v.y / length };
}

/** Returns null instead of throwing on a zero-length vector. */
export function tryNormalise(v: Vec2): Vec2 | null {
  const length = len(v);
  if (approxZero(length, EPS_POINT)) return null;
  return { x: v.x / length, y: v.y / length };
}

/** Rotated a quarter turn counter-clockwise. The left-hand normal. */
export function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

export function rotate(v: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

export function rotateAround(v: Vec2, centre: Vec2, radians: number): Vec2 {
  return add(rotate(sub(v, centre), radians), centre);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Counter-clockwise from +X, in (-π, π]. */
export function angleOf(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

/** Signed angle from a to b, in (-π, π]. Positive is counter-clockwise. */
export function angleBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(cross(a, b), dot(a, b));
}

export function equals(a: Vec2, b: Vec2, eps: number = EPS_POINT): boolean {
  return approxEq(a.x, b.x, eps) && approxEq(a.y, b.y, eps);
}

export function isZero(v: Vec2, eps: number = EPS_POINT): boolean {
  return approxZero(v.x, eps) && approxZero(v.y, eps);
}

/** Snaps both components to the storage grid. See core's `quantise`. */
export function quantiseVec(v: Vec2): Vec2 {
  return { x: quantise(v.x), y: quantise(v.y) };
}

/** Distance from `p` to the infinite line through `a` and `b`. */
export function distToLine(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const lengthSq = lenSq(ab);
  if (approxZero(lengthSq, EPS_POINT * EPS_POINT)) return dist(p, a);
  return Math.abs(cross(ab, sub(p, a))) / Math.sqrt(lengthSq);
}

/**
 * The point on segment `a`–`b` closest to `p`, clamped to the segment.
 *
 * Returns `a` for a degenerate segment, which is the only sensible answer when
 * both endpoints are the same point.
 */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const lengthSq = lenSq(ab);
  if (approxZero(lengthSq, EPS_POINT * EPS_POINT)) return a;
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / lengthSq));
  return add(a, scale(ab, t));
}
