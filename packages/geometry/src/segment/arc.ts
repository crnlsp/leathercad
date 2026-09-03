import { EPS_ANGLE, approxZero, type Mm, type Radians } from '@leathercad/core';

import {
  apply,
  applyDirection,
  isMirrored,
  isSimilarity,
  uniformScaleOf,
  type Mat2x3,
} from '../mat2x3.js';
import { fromPoints, type Rect } from '../rect.js';
import { add, angleOf, scale, vec, type Vec2 } from '../vec2.js';
import { EXPORT_TOLERANCE_MM, maxArcStepForTolerance } from '../tolerance.js';
import {
  arc,
  cubic,
  FULL_TURN,
  type ArcSegment,
  type CubicSegment,
  type Segment,
} from './types.js';
import { transform as transformCubic } from './cubic.js';

/** The angle at parameter `t`, measured counter-clockwise from +X. */
export function angleAt(s: ArcSegment, t: number): Radians {
  return s.startAngle + s.sweepAngle * t;
}

export function pointAt(s: ArcSegment, t: number): Vec2 {
  const angle = angleAt(s, t);
  return add(s.centre, vec(Math.cos(angle) * s.radius, Math.sin(angle) * s.radius));
}

/**
 * Unit direction of travel.
 *
 * A zero-sweep arc is a degenerate point and has no direction; this returns
 * the counter-clockwise tangent in that case, which is arbitrary but stable.
 */
export function tangentAt(s: ArcSegment, t: number): Vec2 {
  const angle = angleAt(s, t);
  const sign = s.sweepAngle < 0 ? -1 : 1;
  return vec(-Math.sin(angle) * sign, Math.cos(angle) * sign);
}

export function length(s: ArcSegment): Mm {
  return Math.abs(s.sweepAngle) * s.radius;
}

/**
 * True when `angle` lies on the arc, in any 2π representative.
 *
 * The whole point of a signed sweep: this needs no special case for a full
 * circle and none for direction.
 */
export function containsAngle(s: ArcSegment, angle: Radians): boolean {
  const positive = s.sweepAngle >= 0;
  let delta = (angle - s.startAngle) % FULL_TURN;
  if (positive && delta < 0) delta += FULL_TURN;
  if (!positive && delta > 0) delta -= FULL_TURN;
  return positive ? delta <= s.sweepAngle + EPS_ANGLE : delta >= s.sweepAngle - EPS_ANGLE;
}

/**
 * Exact bounds.
 *
 * The endpoints alone are not enough: an arc bulges past them wherever it
 * crosses an axis. Those four crossings are the only other extremes a circle
 * has, so testing them is exact rather than approximate.
 */
export function bbox(s: ArcSegment): Rect {
  const points: Vec2[] = [pointAt(s, 0), pointAt(s, 1)];

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const angle = (quadrant * Math.PI) / 2;
    if (containsAngle(s, angle)) {
      points.push(add(s.centre, vec(Math.cos(angle) * s.radius, Math.sin(angle) * s.radius)));
    }
  }

  // Always at least two points, so this cannot be null.
  return fromPoints(points) ?? fromPoints([s.centre])!;
}

export function split(s: ArcSegment, t: number): [ArcSegment, ArcSegment] {
  const first = s.sweepAngle * t;
  return [
    arc(s.centre, s.radius, s.startAngle, first),
    arc(s.centre, s.radius, s.startAngle + first, s.sweepAngle - first),
  ];
}

export function reverse(s: ArcSegment): ArcSegment {
  return arc(s.centre, s.radius, s.startAngle + s.sweepAngle, -s.sweepAngle);
}

/**
 * Transforms an arc.
 *
 * Returns an array because a non-uniform scale turns a circular arc into an
 * elliptical one, which ArcSegment cannot represent. In that case the arc is
 * converted to cubics first — lossy at the 1e-4 mm level, exact enough for
 * anything that will be cut, and the only honest option. See
 * docs/geometry.md §4.2.
 */
export function transform(
  s: ArcSegment,
  m: Mat2x3,
  tolerance: Mm = EXPORT_TOLERANCE_MM,
): Segment[] {
  if (!isSimilarity(m)) {
    return toCubics(s, tolerance).map((c) => transformCubic(c, m));
  }

  const startDirection = vec(Math.cos(s.startAngle), Math.sin(s.startAngle));
  return [
    arc(
      apply(m, s.centre),
      s.radius * uniformScaleOf(m),
      // Derived from the transformed start direction rather than by pulling a
      // rotation angle out of the matrix, so mirrors come out right for free.
      angleOf(applyDirection(m, startDirection)),
      isMirrored(m) ? -s.sweepAngle : s.sweepAngle,
    ),
  ];
}

/**
 * Approximates the arc with cubic Béziers, subdivided to meet `tolerance`.
 *
 * The subdivision is driven by the tolerance rather than fixed at a quarter
 * turn, because a quarter turn is not good enough for print. The radial error
 * of the standard approximation is 2.7e-4 of the radius at 90°, which on a
 * 100 mm radius is 0.027 mm — five times the export budget. Since the error
 * goes as θ⁶, one extra split brings it to 0.0004 mm.
 *
 * This path is not hypothetical: PDF has no arc primitive, so every arc in an
 * exported pattern goes through here. See docs/geometry.md §5.1.
 */
export function toCubics(s: ArcSegment, tolerance: Mm = EXPORT_TOLERANCE_MM): CubicSegment[] {
  if (approxZero(s.sweepAngle, EPS_ANGLE) || approxZero(s.radius, EPS_ANGLE)) {
    const p = pointAt(s, 0);
    return [cubic(p, p, p, p)];
  }

  const maxStep = maxArcStepForTolerance(s.radius, tolerance);
  const count = Math.max(1, Math.ceil(Math.abs(s.sweepAngle) / maxStep - 1e-9));
  const step = s.sweepAngle / count;
  const handle = (4 / 3) * Math.tan(step / 4);

  const result: CubicSegment[] = [];
  for (let i = 0; i < count; i++) {
    const a0 = s.startAngle + step * i;
    const a1 = a0 + step;

    const p0 = add(s.centre, vec(Math.cos(a0) * s.radius, Math.sin(a0) * s.radius));
    const p3 = add(s.centre, vec(Math.cos(a1) * s.radius, Math.sin(a1) * s.radius));

    const t0 = vec(-Math.sin(a0), Math.cos(a0));
    const t1 = vec(-Math.sin(a1), Math.cos(a1));

    result.push(
      cubic(p0, add(p0, scale(t0, handle * s.radius)), add(p3, scale(t1, -handle * s.radius)), p3),
    );
  }
  return result;
}
