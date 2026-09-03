import { assertFinite, type Mm, type Radians } from '@leathercad/core';

import { add, scale, sub, type Vec2 } from '../vec2.js';

/**
 * A straight segment between two points.
 */
export interface LineSegment {
  readonly kind: 'line';
  readonly a: Vec2;
  readonly b: Vec2;
}

/**
 * A circular arc, in **centre parameterisation**.
 *
 * `sweepAngle` is signed: positive sweeps counter-clockwise, negative
 * clockwise, and its magnitude is the angle covered (up to a full turn).
 *
 * This replaces the more common `{ startAngle, endAngle, ccw }` form, which is
 * ambiguous in exactly the place it matters: with equal start and end angles
 * you cannot tell a zero-length arc from a full circle. A signed sweep says
 * both without a special case, and makes `reverse` a sign flip.
 *
 * Endpoint parameterisation (SVG's form) is converted on import and export
 * only — every arc computation is direct in centre form.
 */
export interface ArcSegment {
  readonly kind: 'arc';
  readonly centre: Vec2;
  readonly radius: Mm;
  readonly startAngle: Radians;
  readonly sweepAngle: Radians;
}

/**
 * A cubic Bézier.
 *
 * Quadratics are raised to cubics on ingest — the conversion is exact, and a
 * fourth case would double the surface area of every algorithm in the engine
 * in exchange for nothing.
 */
export interface CubicSegment {
  readonly kind: 'cubic';
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
}

export type Segment = LineSegment | ArcSegment | CubicSegment;

export type SegmentKind = Segment['kind'];

/** A whole turn. `|sweepAngle|` never exceeds this. */
export const FULL_TURN = Math.PI * 2;

export function line(a: Vec2, b: Vec2): LineSegment {
  assertFinite(a.x, 'line a.x');
  assertFinite(a.y, 'line a.y');
  assertFinite(b.x, 'line b.x');
  assertFinite(b.y, 'line b.y');
  return { kind: 'line', a, b };
}

export function arc(
  centre: Vec2,
  radius: Mm,
  startAngle: Radians,
  sweepAngle: Radians,
): ArcSegment {
  assertFinite(centre.x, 'arc centre.x');
  assertFinite(centre.y, 'arc centre.y');
  assertFinite(radius, 'arc radius');
  assertFinite(startAngle, 'arc startAngle');
  assertFinite(sweepAngle, 'arc sweepAngle');

  if (radius < 0) {
    throw new RangeError(`arc radius must not be negative, received ${radius}`);
  }
  if (Math.abs(sweepAngle) > FULL_TURN + 1e-9) {
    throw new RangeError(`arc sweepAngle must be within one full turn, received ${sweepAngle}`);
  }
  return { kind: 'arc', centre, radius, startAngle, sweepAngle };
}

export function cubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): CubicSegment {
  for (const [name, p] of [
    ['p0', p0],
    ['p1', p1],
    ['p2', p2],
    ['p3', p3],
  ] as const) {
    assertFinite(p.x, `cubic ${name}.x`);
    assertFinite(p.y, `cubic ${name}.y`);
  }
  return { kind: 'cubic', p0, p1, p2, p3 };
}

/**
 * Raises a quadratic Bézier to a cubic. Exact, not an approximation.
 *
 * Called on ingest so the rest of the engine never sees a quadratic.
 */
export function quadraticToCubic(p0: Vec2, control: Vec2, p2: Vec2): CubicSegment {
  const twoThirds = 2 / 3;
  return cubic(
    p0,
    add(p0, scale(sub(control, p0), twoThirds)),
    add(p2, scale(sub(control, p2), twoThirds)),
    p2,
  );
}

export function isLine(s: Segment): s is LineSegment {
  return s.kind === 'line';
}

export function isArc(s: Segment): s is ArcSegment {
  return s.kind === 'arc';
}

export function isCubic(s: Segment): s is CubicSegment {
  return s.kind === 'cubic';
}
