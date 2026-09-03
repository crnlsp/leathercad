import type { Mm } from '@leathercad/core';

import { fromCorners, type Rect } from '../rect.js';
import { apply, type Mat2x3 } from '../mat2x3.js';
import { dist, lerp, sub, tryNormalise, ZERO, type Vec2 } from '../vec2.js';
import { line, type LineSegment } from './types.js';

export function pointAt(s: LineSegment, t: number): Vec2 {
  return lerp(s.a, s.b, t);
}

/**
 * Unit direction of travel. Zero for a degenerate segment — there is no
 * direction, and inventing one would push a wrong normal downstream.
 */
export function tangentAt(s: LineSegment, _t: number): Vec2 {
  return tryNormalise(sub(s.b, s.a)) ?? ZERO;
}

export function length(s: LineSegment): Mm {
  return dist(s.a, s.b);
}

/** Length of the portion between two parameters. Linear, so exact. */
export function lengthBetween(s: LineSegment, t0: number, t1: number): Mm {
  return length(s) * Math.abs(t1 - t0);
}

export function bbox(s: LineSegment): Rect {
  return fromCorners(s.a, s.b);
}

export function split(s: LineSegment, t: number): [LineSegment, LineSegment] {
  const mid = pointAt(s, t);
  return [line(s.a, mid), line(mid, s.b)];
}

export function reverse(s: LineSegment): LineSegment {
  return line(s.b, s.a);
}

export function transform(s: LineSegment, m: Mat2x3): LineSegment {
  return line(apply(m, s.a), apply(m, s.b));
}
