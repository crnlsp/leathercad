import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { circle } from '../shapes.js';
import { vec } from '../vec2.js';

import { distanceToPath, isPointOnPath } from './contains.js';
import { polyline } from './path.js';

describe('distanceToPath', () => {
  const square = polyline([vec(0, 0), vec(100, 0), vec(100, 60), vec(0, 60)], true);

  it('measures to the nearest edge, from inside', () => {
    // 10 mm from the left edge, 30 from the bottom: the left edge wins.
    expect(distanceToPath(square, vec(10, 30))).toBeCloseTo(10, 9);
  });

  it('measures the same from outside — an edge has no sides', () => {
    expect(distanceToPath(square, vec(-4, 30))).toBeCloseTo(4, 9);
  });

  it('is zero on the line itself', () => {
    expect(distanceToPath(square, vec(50, 0))).toBeCloseTo(0, 9);
  });

  it('measures to a corner when no edge is nearer', () => {
    expect(distanceToPath(square, vec(-3, -4))).toBeCloseTo(5, 9);
  });

  it('measures to an arc by its radius, not to its chord', () => {
    const ring = circle(vec(0, 0), 20);
    expect(distanceToPath(ring, vec(0, 0))).toBeCloseTo(20, 9);
    expect(distanceToPath(ring, vec(25, 0))).toBeCloseTo(5, 9);
  });

  it('is infinite for a path with no segments', () => {
    expect(distanceToPath({ segments: [], closed: false }, vec(0, 0))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('never disagrees with the hit test that shares its maths', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 150, noNaN: true }),
        fc.double({ min: -50, max: 110, noNaN: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        (x, y, tolerance) => {
          const point = vec(x, y);
          return (
            isPointOnPath(square, point, tolerance) === distanceToPath(square, point) <= tolerance
          );
        },
      ),
    );
  });
});
