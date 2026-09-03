import type { Mm } from '@leathercad/core';

import type { Mat2x3 } from '../mat2x3.js';
import type { Rect } from '../rect.js';
import type { Vec2 } from '../vec2.js';
import * as ArcOps from './arc.js';
import * as CubicOps from './cubic.js';
import * as LineOps from './line.js';
import type { CubicSegment, Segment } from './types.js';

export type { ArcSegment, CubicSegment, LineSegment, Segment, SegmentKind } from './types.js';

export { FULL_TURN, arc, cubic, isArc, isCubic, isLine, line, quadraticToCubic } from './types.js';

export { ArcOps, CubicOps, LineOps };

/**
 * The uniform interface over the three segment kinds.
 *
 * Every operation dispatches on `kind` and nothing else, so adding a kind
 * would mean a compile error in each of these — which is the point of the
 * discriminated union.
 *
 * `t` is the natural parameter in [0, 1] and is **not** proportional to
 * distance along the segment. For distance, use PathMeasure (slice 1.6).
 */

export function pointAt(s: Segment, t: number): Vec2 {
  switch (s.kind) {
    case 'line':
      return LineOps.pointAt(s, t);
    case 'arc':
      return ArcOps.pointAt(s, t);
    case 'cubic':
      return CubicOps.pointAt(s, t);
  }
}

/** Unit direction of travel at `t`. */
export function tangentAt(s: Segment, t: number): Vec2 {
  switch (s.kind) {
    case 'line':
      return LineOps.tangentAt(s, t);
    case 'arc':
      return ArcOps.tangentAt(s, t);
    case 'cubic':
      return CubicOps.tangentAt(s, t);
  }
}

export function length(s: Segment): Mm {
  switch (s.kind) {
    case 'line':
      return LineOps.length(s);
    case 'arc':
      return ArcOps.length(s);
    case 'cubic':
      return CubicOps.length(s);
  }
}

/**
 * Length of the portion between two parameters.
 *
 * Exact for lines and arcs, where length is linear in `t`; by adaptive
 * quadrature for cubics, where it is not.
 */
export function lengthBetween(s: Segment, t0: number, t1: number): Mm {
  switch (s.kind) {
    case 'line':
      return LineOps.lengthBetween(s, t0, t1);
    case 'arc':
      return ArcOps.lengthBetween(s, t0, t1);
    case 'cubic':
      return CubicOps.lengthBetween(s, t0, t1);
  }
}

/** Exact bounds — never the control-point hull. */
export function bbox(s: Segment): Rect {
  switch (s.kind) {
    case 'line':
      return LineOps.bbox(s);
    case 'arc':
      return ArcOps.bbox(s);
    case 'cubic':
      return CubicOps.bbox(s);
  }
}

export function split(s: Segment, t: number): [Segment, Segment] {
  switch (s.kind) {
    case 'line':
      return LineOps.split(s, t);
    case 'arc':
      return ArcOps.split(s, t);
    case 'cubic':
      return CubicOps.split(s, t);
  }
}

export function reverse(s: Segment): Segment {
  switch (s.kind) {
    case 'line':
      return LineOps.reverse(s);
    case 'arc':
      return ArcOps.reverse(s);
    case 'cubic':
      return CubicOps.reverse(s);
  }
}

/**
 * Returns an array because one arc under a non-uniform scale becomes several
 * cubics — the transform of a circle is an ellipse, which ArcSegment cannot
 * hold. Lines and cubics always yield exactly one.
 */
export function transform(s: Segment, m: Mat2x3): Segment[] {
  switch (s.kind) {
    case 'line':
      return [LineOps.transform(s, m)];
    case 'arc':
      return ArcOps.transform(s, m);
    case 'cubic':
      return [CubicOps.transform(s, m)];
  }
}

export function start(s: Segment): Vec2 {
  return pointAt(s, 0);
}

export function end(s: Segment): Vec2 {
  return pointAt(s, 1);
}

/**
 * Converts any segment to cubics. Exact for lines and cubics; an arc is
 * subdivided until its radial error is within `tolerance`.
 */
export function toCubics(s: Segment, tolerance?: Mm): CubicSegment[] {
  switch (s.kind) {
    case 'line': {
      // A line is a cubic whose controls sit on it, at the thirds.
      const third = { x: (s.b.x - s.a.x) / 3, y: (s.b.y - s.a.y) / 3 };
      return [
        {
          kind: 'cubic',
          p0: s.a,
          p1: { x: s.a.x + third.x, y: s.a.y + third.y },
          p2: { x: s.b.x - third.x, y: s.b.y - third.y },
          p3: s.b,
        },
      ];
    }
    case 'arc':
      return ArcOps.toCubics(s, tolerance);
    case 'cubic':
      return [s];
  }
}
