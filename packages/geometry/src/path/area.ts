import { EPS_AREA, type Mm } from '@leathercad/core';

import * as Seg from '../segment/index.js';
import { reverse, type Path } from './path.js';

/**
 * Signed area enclosed by the path, by Green's theorem: `A = ½∮(x dy − y dx)`.
 *
 * Positive is counter-clockwise, which with Y-up is the mathematical
 * convention and the one the winding rules assume.
 *
 * For an **open** path this is the area of the region closed by a straight
 * chord from the end back to the start — the same thing the shoelace formula
 * gives for an unclosed point list.
 *
 * Every term is exact. Nothing here flattens.
 */
export function signedArea(p: Path): Mm {
  let total = 0;
  for (const segment of p.segments) total += segmentArea(segment);
  return total / 2;
}

export function area(p: Path): Mm {
  return Math.abs(signedArea(p));
}

export type Orientation = 'ccw' | 'cw' | 'degenerate';

export function orientation(p: Path, eps: number = EPS_AREA): Orientation {
  const signed = signedArea(p);
  if (Math.abs(signed) <= eps) return 'degenerate';
  return signed > 0 ? 'ccw' : 'cw';
}

export function isCounterClockwise(p: Path): boolean {
  return signedArea(p) > 0;
}

/**
 * Returns the path wound the requested way, reversing it if needed.
 *
 * The domain layer normalises outer contours counter-clockwise and holes
 * clockwise, which is what lets "inward" and "outward" offsets have an
 * unambiguous meaning. A degenerate path is returned untouched — there is no
 * orientation to correct.
 */
export function withOrientation(p: Path, want: 'ccw' | 'cw'): Path {
  const current = orientation(p);
  if (current === 'degenerate' || current === want) return p;
  return reverse(p);
}

/** Contribution of one segment to `∮(x dy − y dx)`. */
function segmentArea(s: Seg.Segment): number {
  switch (s.kind) {
    case 'line':
      return s.a.x * s.b.y - s.a.y * s.b.x;

    case 'arc': {
      // Integrating in closed form: ∫(c.x·r·cosθ + c.y·r·sinθ + r²) dθ.
      const startAngle = s.startAngle;
      const endAngle = s.startAngle + s.sweepAngle;
      return (
        s.centre.x * s.radius * (Math.sin(endAngle) - Math.sin(startAngle)) -
        s.centre.y * s.radius * (Math.cos(endAngle) - Math.cos(startAngle)) +
        s.radius * s.radius * s.sweepAngle
      );
    }

    case 'cubic':
      return cubicArea(s);
  }
}

// Three-point Gauss-Legendre on [0, 1]. The integrand x·y' − y·x' is degree 5
// for a cubic, and n-point Gauss-Legendre is exact to degree 2n−1 = 5 — so
// this is not an approximation, it is the exact integral in three evaluations.
const GAUSS_OFFSET = Math.sqrt(3 / 5) / 2;
const GAUSS_NODES = [0.5 - GAUSS_OFFSET, 0.5, 0.5 + GAUSS_OFFSET] as const;
const GAUSS_WEIGHTS = [5 / 18, 8 / 18, 5 / 18] as const;

function cubicArea(s: Seg.CubicSegment): number {
  let total = 0;
  for (let i = 0; i < GAUSS_NODES.length; i++) {
    const t = GAUSS_NODES[i]!;
    const point = Seg.CubicOps.pointAt(s, t);
    const velocity = Seg.CubicOps.derivativeAt(s, t);
    total += GAUSS_WEIGHTS[i]! * (point.x * velocity.y - point.y * velocity.x);
  }
  return total;
}
