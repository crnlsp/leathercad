import { EPS_POINT, approxEq, approxGte, approxLte, type Mm } from '@leathercad/core';

import { apply, type Mat2x3 } from './mat2x3.js';
import { vec, type Vec2 } from './vec2.js';

/**
 * An axis-aligned bounding box in millimetres. **Y points up**, so `maxY` is
 * the top edge.
 *
 * Invariant: `minX <= maxX` and `minY <= maxY`. Every constructor here
 * establishes it; do not build one by object literal.
 */
export interface Rect {
  readonly minX: Mm;
  readonly minY: Mm;
  readonly maxX: Mm;
  readonly maxY: Mm;
}

/** Normalises, so the corners may be given in any order. */
export function fromCorners(a: Vec2, b: Vec2): Rect {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function fromOriginSize(origin: Vec2, width: Mm, height: Mm): Rect {
  return fromCorners(origin, vec(origin.x + width, origin.y + height));
}

/** Null for an empty input — there is no bounding box of nothing. */
export function fromPoints(points: Iterable<Vec2>): Rect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let seen = false;

  for (const p of points) {
    seen = true;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return seen ? { minX, minY, maxX, maxY } : null;
}

export function width(r: Rect): Mm {
  return r.maxX - r.minX;
}

export function height(r: Rect): Mm {
  return r.maxY - r.minY;
}

export function area(r: Rect): Mm {
  return width(r) * height(r);
}

export function centre(r: Rect): Vec2 {
  return vec((r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2);
}

/** Bottom-left, bottom-right, top-right, top-left — counter-clockwise, Y-up. */
export function corners(r: Rect): [Vec2, Vec2, Vec2, Vec2] {
  return [vec(r.minX, r.minY), vec(r.maxX, r.minY), vec(r.maxX, r.maxY), vec(r.minX, r.maxY)];
}

/** True when the rect has no extent in at least one axis. */
export function isEmpty(r: Rect, eps: number = EPS_POINT): boolean {
  return approxEq(r.minX, r.maxX, eps) || approxEq(r.minY, r.maxY, eps);
}

export function containsPoint(r: Rect, p: Vec2, eps: number = EPS_POINT): boolean {
  return (
    approxGte(p.x, r.minX, eps) &&
    approxLte(p.x, r.maxX, eps) &&
    approxGte(p.y, r.minY, eps) &&
    approxLte(p.y, r.maxY, eps)
  );
}

export function containsRect(outer: Rect, inner: Rect, eps: number = EPS_POINT): boolean {
  return (
    approxLte(outer.minX, inner.minX, eps) &&
    approxLte(outer.minY, inner.minY, eps) &&
    approxGte(outer.maxX, inner.maxX, eps) &&
    approxGte(outer.maxY, inner.maxY, eps)
  );
}

/** Touching edges count as intersecting. */
export function intersects(a: Rect, b: Rect, eps: number = EPS_POINT): boolean {
  return (
    approxLte(a.minX, b.maxX, eps) &&
    approxGte(a.maxX, b.minX, eps) &&
    approxLte(a.minY, b.maxY, eps) &&
    approxGte(a.maxY, b.minY, eps)
  );
}

/**
 * Null when the rects do not overlap.
 *
 * Uses the same tolerance as `intersects`, so the two agree at the boundary.
 * An exact comparison here would let `intersects` report an overlap that
 * `intersection` then refuses to produce — two functions answering the same
 * question differently, which is the worst kind of inconsistency to debug.
 */
export function intersection(a: Rect, b: Rect, eps: number = EPS_POINT): Rect | null {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);

  if (!approxLte(minX, maxX, eps) || !approxLte(minY, maxY, eps)) return null;

  // Edges touching within tolerance would otherwise invert the rect. Collapse
  // to a degenerate one instead, so the minX <= maxX invariant always holds.
  return { minX, minY, maxX: Math.max(minX, maxX), maxY: Math.max(minY, maxY) };
}

export function union(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function unionAll(rects: Iterable<Rect>): Rect | null {
  let result: Rect | null = null;
  for (const r of rects) result = result === null ? r : union(result, r);
  return result;
}

/** Grows on all sides. A negative margin shrinks, and may invert — check isEmpty. */
export function expand(r: Rect, margin: Mm): Rect {
  return {
    minX: r.minX - margin,
    minY: r.minY - margin,
    maxX: r.maxX + margin,
    maxY: r.maxY + margin,
  };
}

export function translate(r: Rect, offset: Vec2): Rect {
  return {
    minX: r.minX + offset.x,
    minY: r.minY + offset.y,
    maxX: r.maxX + offset.x,
    maxY: r.maxY + offset.y,
  };
}

/**
 * The bounding box of the transformed rect.
 *
 * Note this is the bounds of the *rotated box*, not the rotated bounds — the
 * result is generally larger than the original under rotation, which is
 * correct and unavoidable for an axis-aligned representation.
 */
export function transform(r: Rect, m: Mat2x3): Rect {
  const transformed = corners(r).map((c) => apply(m, c));
  const result = fromPoints(transformed);
  // corners() always yields four points, so fromPoints cannot return null.
  return result ?? r;
}

export function equals(a: Rect, b: Rect, eps: number = EPS_POINT): boolean {
  return (
    approxEq(a.minX, b.minX, eps) &&
    approxEq(a.minY, b.minY, eps) &&
    approxEq(a.maxX, b.maxX, eps) &&
    approxEq(a.maxY, b.maxY, eps)
  );
}
