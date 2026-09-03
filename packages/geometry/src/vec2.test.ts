import { EPS_POINT } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbAngle, arbNonZeroVec2, arbVec2 } from '../test/arbitraries.js';
import {
  ZERO,
  add,
  angleBetween,
  angleOf,
  closestPointOnSegment,
  cross,
  dist,
  distToLine,
  dot,
  equals,
  isZero,
  len,
  lenSq,
  lerp,
  midpoint,
  negate,
  normalise,
  perp,
  quantiseVec,
  rotate,
  rotateAround,
  scale,
  sub,
  tryNormalise,
  vec,
} from './vec2.js';

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('arithmetic', () => {
  it('add and sub are inverses', () => {
    fc.assert(fc.property(arbVec2, arbVec2, (a, b) => equals(sub(add(a, b), b), a, 1e-9)));
  });

  it('add is commutative', () => {
    fc.assert(fc.property(arbVec2, arbVec2, (a, b) => equals(add(a, b), add(b, a))));
  });

  it('negate is its own inverse', () => {
    fc.assert(fc.property(arbVec2, (a) => equals(negate(negate(a)), a)));
  });

  it('scaling by 1 is identity and by 0 is zero', () => {
    fc.assert(fc.property(arbVec2, (a) => equals(scale(a, 1), a) && isZero(scale(a, 0))));
  });
});

describe('length and distance', () => {
  it('lenSq is the square of len', () => {
    fc.assert(fc.property(arbVec2, (a) => closeTo(Math.sqrt(lenSq(a)), len(a), 1e-6)));
  });

  it('dist between a point and itself is zero', () => {
    fc.assert(fc.property(arbVec2, (a) => dist(a, a) === 0));
  });

  it('dist is symmetric', () => {
    fc.assert(fc.property(arbVec2, arbVec2, (a, b) => dist(a, b) === dist(b, a)));
  });

  it('satisfies the triangle inequality', () => {
    fc.assert(
      fc.property(
        arbVec2,
        arbVec2,
        arbVec2,
        (a, b, c) => dist(a, c) <= dist(a, b) + dist(b, c) + 1e-9,
      ),
    );
  });

  it('computes a known 3-4-5 triangle', () => {
    expect(len(vec(3, 4))).toBe(5);
  });
});

describe('dot and cross', () => {
  it('dot of perpendicular vectors is zero', () => {
    fc.assert(fc.property(arbVec2, (a) => closeTo(dot(a, perp(a)), 0, 1e-6)));
  });

  it('cross is antisymmetric', () => {
    fc.assert(fc.property(arbVec2, arbVec2, (a, b) => closeTo(cross(a, b), -cross(b, a), 1e-9)));
  });

  it('cross with itself is zero', () => {
    fc.assert(fc.property(arbVec2, (a) => closeTo(cross(a, a), 0, 1e-9)));
  });

  it('cross is positive when b is left of a, matching Y-up', () => {
    // The sign convention the whole engine leans on. +X crossed with +Y is
    // positive, so counter-clockwise is positive. Getting this backwards
    // mirrors every offset in the application.
    expect(cross(vec(1, 0), vec(0, 1))).toBe(1);
  });
});

describe('normalise', () => {
  it('produces unit length', () => {
    fc.assert(fc.property(arbNonZeroVec2, (a) => closeTo(len(normalise(a)), 1, 1e-9)));
  });

  it('preserves direction', () => {
    fc.assert(fc.property(arbNonZeroVec2, (a) => closeTo(angleOf(normalise(a)), angleOf(a), 1e-9)));
  });

  it('throws on a zero-length vector', () => {
    // No meaningful answer exists, and returning zero would push a wrong
    // direction downstream where it is far harder to trace.
    expect(() => normalise(ZERO)).toThrow(RangeError);
    expect(() => normalise(vec(EPS_POINT / 10, 0))).toThrow(RangeError);
  });

  it('tryNormalise returns null instead of throwing', () => {
    expect(tryNormalise(ZERO)).toBeNull();
    expect(tryNormalise(vec(3, 4))).toEqual({ x: 0.6, y: 0.8 });
  });
});

describe('rotation', () => {
  it('preserves length', () => {
    fc.assert(fc.property(arbVec2, arbAngle, (a, t) => closeTo(len(rotate(a, t)), len(a), 1e-6)));
  });

  it('rotating by an angle then its negation is identity', () => {
    fc.assert(fc.property(arbVec2, arbAngle, (a, t) => equals(rotate(rotate(a, t), -t), a, 1e-6)));
  });

  it('rotates counter-clockwise for a positive angle', () => {
    const r = rotate(vec(1, 0), Math.PI / 2);
    expect(closeTo(r.x, 0)).toBe(true);
    expect(closeTo(r.y, 1)).toBe(true);
  });

  it('perp matches a quarter-turn rotation', () => {
    fc.assert(fc.property(arbVec2, (a) => equals(perp(a), rotate(a, Math.PI / 2), 1e-9)));
  });

  it('rotateAround leaves the centre fixed', () => {
    fc.assert(fc.property(arbVec2, arbAngle, (c, t) => equals(rotateAround(c, c, t), c, 1e-9)));
  });

  it('rotateAround preserves distance to the centre', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbAngle, (p, c, t) =>
        closeTo(dist(rotateAround(p, c, t), c), dist(p, c), 1e-6),
      ),
    );
  });
});

describe('interpolation', () => {
  it('lerp hits the endpoints exactly', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) => equals(lerp(a, b, 0), a) && equals(lerp(a, b, 1), b)),
    );
  });

  it('lerp at 0.5 equals the midpoint', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, (a, b) => equals(lerp(a, b, 0.5), midpoint(a, b), 1e-9)),
    );
  });
});

describe('angles', () => {
  it('angleOf matches the known axes', () => {
    expect(angleOf(vec(1, 0))).toBe(0);
    expect(closeTo(angleOf(vec(0, 1)), Math.PI / 2)).toBe(true);
    expect(closeTo(angleOf(vec(0, -1)), -Math.PI / 2)).toBe(true);
  });

  it('angleBetween is antisymmetric away from the ±π boundary', () => {
    fc.assert(
      fc.property(arbNonZeroVec2, arbNonZeroVec2, (a, b) => {
        const forward = angleBetween(a, b);
        // At exactly ±π the two directions are the same turn, so the sign is
        // not meaningful and the property genuinely does not hold.
        if (Math.abs(Math.abs(forward) - Math.PI) < 1e-6) return true;
        return closeTo(forward, -angleBetween(b, a), 1e-9);
      }),
    );
  });

  it('angleBetween a vector and itself is zero', () => {
    fc.assert(fc.property(arbNonZeroVec2, (a) => closeTo(angleBetween(a, a), 0, 1e-9)));
  });
});

describe('quantiseVec', () => {
  it('snaps both components', () => {
    expect(quantiseVec(vec(1.000_04, -2.000_06))).toEqual({ x: 1, y: -2.0001 });
  });

  it('is idempotent', () => {
    fc.assert(fc.property(arbVec2, (a) => equals(quantiseVec(quantiseVec(a)), quantiseVec(a), 0)));
  });
});

describe('distToLine', () => {
  it('is zero for a point on the line', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, fc.double({ min: -3, max: 3, noNaN: true }), (a, b, t) => {
        if (dist(a, b) < 1e-3) return true;
        return distToLine(lerp(a, b, t), a, b) < 1e-6;
      }),
    );
  });

  it('measures perpendicular distance, not distance to an endpoint', () => {
    // The line is infinite; the point projects outside the segment.
    expect(closeTo(distToLine(vec(10, 3), vec(0, 0), vec(1, 0)), 3)).toBe(true);
  });

  it('falls back to point distance for a degenerate line', () => {
    expect(closeTo(distToLine(vec(3, 4), vec(1, 1), vec(1, 1)), dist(vec(3, 4), vec(1, 1)))).toBe(
      true,
    );
  });
});

describe('closestPointOnSegment', () => {
  it('clamps to the segment rather than the infinite line', () => {
    expect(closestPointOnSegment(vec(10, 5), vec(0, 0), vec(1, 0))).toEqual(vec(1, 0));
    expect(closestPointOnSegment(vec(-10, 5), vec(0, 0), vec(1, 0))).toEqual(vec(0, 0));
  });

  it('projects onto the interior when the point is alongside', () => {
    expect(closestPointOnSegment(vec(0.5, 9), vec(0, 0), vec(1, 0))).toEqual(vec(0.5, 0));
  });

  it('never returns a point further away than either endpoint', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, (p, a, b) => {
        const closest = closestPointOnSegment(p, a, b);
        return dist(p, closest) <= Math.min(dist(p, a), dist(p, b)) + 1e-6;
      }),
    );
  });

  it('returns the start for a degenerate segment', () => {
    expect(closestPointOnSegment(vec(5, 5), vec(1, 1), vec(1, 1))).toEqual(vec(1, 1));
  });
});
