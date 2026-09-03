import { EPS_POINT } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbRigidTransform, arbVec2 } from '../../test/arbitraries.js';
import { fromRotation, fromScale, fromTranslation } from '../mat2x3.js';
import { containsPoint as rectContains } from '../rect.js';
import { arc, cubic, line } from '../segment/index.js';
import { dist, vec, type Vec2 } from '../vec2.js';
import * as P from './index.js';

const closeTo = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

/** Counter-clockwise unit square, 10 mm on a side, at the origin. */
const square = P.polyline([vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)], true);

/** A full circle of radius 5 at (20, 20), counter-clockwise. */
const circle = P.closed([arc(vec(20, 20), 5, 0, Math.PI * 2)]);

describe('construction and validation', () => {
  it('accepts segments that join up', () => {
    expect(() => P.open([line(vec(0, 0), vec(1, 0)), line(vec(1, 0), vec(1, 1))])).not.toThrow();
  });

  it('rejects a gap between consecutive segments', () => {
    expect(() => P.open([line(vec(0, 0), vec(1, 0)), line(vec(5, 0), vec(5, 1))])).toThrow(
      /invalid path/,
    );
  });

  it('reports how large the gap is', () => {
    const problems = P.validate({
      segments: [line(vec(0, 0), vec(1, 0)), line(vec(3, 0), vec(3, 1))],
      closed: false,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/2\.000/);
  });

  it('rejects a closed path that does not come back to its start', () => {
    expect(() => P.closed([line(vec(0, 0), vec(1, 0)), line(vec(1, 0), vec(1, 1))])).toThrow(/gap/);
  });

  it('tolerates a join within EPS_POINT', () => {
    expect(() =>
      P.open([line(vec(0, 0), vec(1, 0)), line(vec(1 + EPS_POINT / 2, 0), vec(2, 0))]),
    ).not.toThrow();
  });

  it('polyline closes itself', () => {
    expect(square.segments).toHaveLength(4);
    expect(P.isValid(square)).toBe(true);
  });

  it('polyline does not add a zero-length closing segment when already closed', () => {
    const p = P.polyline([vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 0)], true);
    expect(p.segments).toHaveLength(3);
  });

  it('handles the empty path', () => {
    const empty = P.polyline([], false);
    expect(P.isEmpty(empty)).toBe(true);
    expect(P.length(empty)).toBe(0);
    expect(P.bbox(empty)).toBeNull();
    expect(P.start(empty)).toBeNull();
    expect(P.vertices(empty)).toEqual([]);
  });
});

describe('vertices', () => {
  it('omits the repeated point on a closed path', () => {
    expect(P.vertices(square)).toEqual([vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)]);
  });

  it('includes both endpoints on an open path', () => {
    const p = P.polyline([vec(0, 0), vec(1, 0), vec(2, 0)], false);
    expect(P.vertices(p)).toHaveLength(3);
  });
});

describe('length', () => {
  it('sums its segments', () => {
    expect(P.length(square)).toBe(40);
  });

  it('matches the circumference of a circle', () => {
    expect(closeTo(P.length(circle), 2 * Math.PI * 5, 1e-9)).toBe(true);
  });

  it('is unchanged by reversal', () => {
    expect(closeTo(P.length(P.reverse(square)), P.length(square))).toBe(true);
  });

  it('is preserved by a rigid transform', () => {
    fc.assert(
      fc.property(arbRigidTransform, (m) => closeTo(P.length(P.transform(square, m)), 40, 1e-4)),
    );
  });

  it('scales with a uniform scale', () => {
    expect(closeTo(P.length(P.transform(square, fromScale(3, 3))), 120, 1e-6)).toBe(true);
  });
});

describe('bbox', () => {
  it('bounds a square exactly', () => {
    expect(P.bbox(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('bounds a circle by its radius', () => {
    const box = P.bbox(circle)!;
    expect(closeTo(box.minX, 15, 1e-9)).toBe(true);
    expect(closeTo(box.maxY, 25, 1e-9)).toBe(true);
  });

  it('contains every vertex', () => {
    fc.assert(
      fc.property(fc.array(arbVec2, { minLength: 2, maxLength: 20 }), (points) => {
        const p = P.polyline(points, false);
        const box = P.bbox(p);
        return box !== null && P.vertices(p).every((v) => rectContains(box, v));
      }),
    );
  });
});

describe('reverse', () => {
  it('is its own inverse', () => {
    const back = P.reverse(P.reverse(square));
    expect(P.vertices(back)).toEqual(P.vertices(square));
  });

  it('swaps start and end on an open path', () => {
    const p = P.polyline([vec(0, 0), vec(5, 0), vec(5, 5)], false);
    const r = P.reverse(p);
    expect(P.start(r)).toEqual(vec(5, 5));
    expect(P.end(r)).toEqual(vec(0, 0));
  });

  it('leaves the path valid', () => {
    expect(P.isValid(P.reverse(circle))).toBe(true);
  });
});

describe('transform', () => {
  it('keeps the path valid', () => {
    fc.assert(fc.property(arbRigidTransform, (m) => P.isValid(P.transform(square, m), 1e-6)));
  });

  it('moves every vertex', () => {
    const moved = P.transform(square, fromTranslation(vec(3, 4)));
    expect(P.vertices(moved)[0]).toEqual(vec(3, 4));
  });

  it('turns arcs into cubics under a non-uniform scale, staying valid', () => {
    const squashed = P.transform(circle, fromScale(2, 1));
    expect(squashed.segments.every((s) => s.kind === 'cubic')).toBe(true);
    expect(P.isValid(squashed, 1e-6)).toBe(true);
  });
});

describe('signedArea and orientation', () => {
  it('is positive for a counter-clockwise square', () => {
    // Y-up, so counter-clockwise is positive — the convention every winding
    // rule downstream assumes.
    expect(closeTo(P.signedArea(square), 100, 1e-9)).toBe(true);
    expect(P.orientation(square)).toBe('ccw');
  });

  it('flips sign when reversed', () => {
    expect(closeTo(P.signedArea(P.reverse(square)), -100, 1e-9)).toBe(true);
    expect(P.orientation(P.reverse(square))).toBe('cw');
  });

  it('is exact for a circle', () => {
    expect(closeTo(P.area(circle), Math.PI * 25, 1e-9)).toBe(true);
  });

  it('is exact for a cubic, not merely close', () => {
    // Three-point Gauss-Legendre integrates the degree-5 integrand exactly,
    // so this should match the analytic value to machine precision.
    const quarter = P.closed([
      cubic(vec(1, 0), vec(1, 0.5523), vec(0.5523, 1), vec(0, 1)),
      line(vec(0, 1), vec(0, 0)),
      line(vec(0, 0), vec(1, 0)),
    ]);
    // Compare against a dense polygonal approximation of the same shape.
    const dense: Vec2[] = [];
    for (let i = 0; i <= 2000; i++) {
      const t = i / 2000;
      const u = 1 - t;
      dense.push(
        vec(
          u * u * u * 1 + 3 * u * u * t * 1 + 3 * u * t * t * 0.5523,
          u * u * t * 3 * 0.5523 + 3 * u * t * t * 1 + t * t * t * 1,
        ),
      );
    }
    dense.push(vec(0, 0));
    expect(closeTo(P.area(quarter), P.area(P.polyline(dense, true)), 1e-4)).toBe(true);
  });

  it('reversal negates the signed area for any polygon', () => {
    fc.assert(
      fc.property(fc.array(arbVec2, { minLength: 3, maxLength: 12 }), (points) => {
        const p = P.polyline(points, true);
        return closeTo(P.signedArea(P.reverse(p)), -P.signedArea(p), 1e-6);
      }),
    );
  });

  it('is invariant under a rigid transform', () => {
    fc.assert(
      fc.property(arbRigidTransform, (m) =>
        closeTo(Math.abs(P.signedArea(P.transform(square, m))), 100, 1e-4),
      ),
    );
  });

  it('scales with the square of a uniform scale', () => {
    expect(closeTo(P.area(P.transform(square, fromScale(3, 3))), 900, 1e-6)).toBe(true);
  });

  it('reports a degenerate path', () => {
    expect(P.orientation(P.polyline([vec(0, 0), vec(5, 0)], true))).toBe('degenerate');
  });

  it('withOrientation normalises without changing the shape', () => {
    const cw = P.reverse(square);
    const fixed = P.withOrientation(cw, 'ccw');
    expect(P.orientation(fixed)).toBe('ccw');
    expect(closeTo(P.length(fixed), P.length(cw))).toBe(true);
  });

  it('withOrientation leaves an already-correct path alone', () => {
    expect(P.withOrientation(square, 'ccw')).toBe(square);
  });
});

describe('containsPoint', () => {
  it('finds points inside and outside a square', () => {
    expect(P.containsPoint(square, vec(5, 5))).toBe(true);
    expect(P.containsPoint(square, vec(-1, 5))).toBe(false);
    expect(P.containsPoint(square, vec(11, 5))).toBe(false);
    expect(P.containsPoint(square, vec(5, 20))).toBe(false);
  });

  it('finds points inside and outside a circle', () => {
    expect(P.containsPoint(circle, vec(20, 20))).toBe(true);
    expect(P.containsPoint(circle, vec(24.9, 20))).toBe(true);
    expect(P.containsPoint(circle, vec(25.1, 20))).toBe(false);
    expect(P.containsPoint(circle, vec(20, 26))).toBe(false);
  });

  it('agrees with the radius test everywhere on a circle', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 30, noNaN: true }),
        fc.double({ min: 10, max: 30, noNaN: true }),
        (x, y) => {
          const p = vec(x, y);
          const d = dist(p, vec(20, 20));
          // Skip the boundary, where "inside" is genuinely undefined.
          if (Math.abs(d - 5) < 1e-6) return true;
          return P.containsPoint(circle, p) === d < 5;
        },
      ),
    );
  });

  it('is unaffected by the direction the path is wound', () => {
    expect(P.containsPoint(P.reverse(square), vec(5, 5))).toBe(true);
    expect(P.containsPoint(P.reverse(circle), vec(20, 20))).toBe(true);
  });

  it('winds ±1 inside a simple loop and 0 outside', () => {
    expect(Math.abs(P.windingNumber(square, vec(5, 5)))).toBe(1);
    expect(P.windingNumber(square, vec(50, 50))).toBe(0);
    expect(Math.abs(P.windingNumber(circle, vec(20, 20)))).toBe(1);
  });

  it('counts a doubly-wound path twice, and the two fill rules disagree', () => {
    // Non-zero says inside, even-odd says outside. This is exactly why the
    // rule has to match SVG and PDF, or screen and export would differ.
    const twice = P.closed([arc(vec(0, 0), 5, 0, Math.PI * 2), arc(vec(0, 0), 5, 0, Math.PI * 2)]);
    expect(Math.abs(P.windingNumber(twice, vec(0, 0)))).toBe(2);
    expect(P.containsPoint(twice, vec(0, 0), 'nonzero')).toBe(true);
    expect(P.containsPoint(twice, vec(0, 0), 'evenodd')).toBe(false);
  });

  it('handles a ray passing exactly through a vertex', () => {
    // The half-open crossing rule exists for this: without it the shared
    // vertex counts twice and inside flips to outside along that line.
    const diamond = P.polyline([vec(0, 0), vec(5, 5), vec(10, 0), vec(5, -5)], true);
    expect(P.containsPoint(diamond, vec(5, 0))).toBe(true);
    expect(P.containsPoint(diamond, vec(-1, 0))).toBe(false);
    expect(P.containsPoint(diamond, vec(11, 0))).toBe(false);
  });

  it('resolves points on a horizontal edge by the half-open convention', () => {
    // A point exactly on the boundary has no defined answer, so the rule is
    // consistency rather than correctness: crossings count on [y0, y1), which
    // puts the bottom edge inside and the top edge outside. Rasterisers use
    // the same convention so that abutting shapes tile without seams or
    // double-covered pixels.
    expect(P.containsPoint(square, vec(5, 0))).toBe(true);
    expect(P.containsPoint(square, vec(5, 10))).toBe(false);

    // Points level with an edge but off to the side are unambiguous.
    expect(P.containsPoint(square, vec(-5, 0))).toBe(false);
    expect(P.containsPoint(square, vec(-5, 10))).toBe(false);
    expect(P.containsPoint(square, vec(15, 0))).toBe(false);
  });

  it('excludes the hole in a ring under the non-zero rule', () => {
    // Outer counter-clockwise, inner clockwise — the convention the domain
    // layer uses for a part with a window cut out of it.
    const outer = arc(vec(0, 0), 10, 0, Math.PI * 2);
    const inner = arc(vec(0, 0), 5, 0, -Math.PI * 2);
    const ring = { segments: [outer, inner], closed: true };
    expect(P.containsPoint(ring, vec(7, 0))).toBe(true);
    expect(P.containsPoint(ring, vec(2, 0))).toBe(false);
    expect(P.containsPoint(ring, vec(12, 0))).toBe(false);
  });

  it('works on a path made of cubics', () => {
    // fromScale is about the origin, so the circle at (20,20) r=5 becomes an
    // ellipse centred (40,20) with semi-axes 10 and 5.
    const ellipse = P.transform(circle, fromScale(2, 1));
    expect(P.containsPoint(ellipse, vec(40, 20))).toBe(true);
    expect(P.containsPoint(ellipse, vec(49, 20))).toBe(true);
    expect(P.containsPoint(ellipse, vec(51, 20))).toBe(false);
    expect(P.containsPoint(ellipse, vec(40, 24))).toBe(true);
    expect(P.containsPoint(ellipse, vec(40, 6))).toBe(false);
  });

  it('survives a ray cast straight through a full circle seam', () => {
    // Regression: fast-check shrank to a rotation of 5e-324, which moved the
    // arc's start angle a hair past 0 while the ray still crossed at exactly
    // 0. The crossing then fell into the crack between "before the start" and
    // "at the excluded end", and the centre of a circle reported as outside.
    // A circle's own centre is the most ordinary containment query there is.
    for (const startAngle of [0, 5e-324, -5e-324, 1e-12, Math.PI * 2 - 1e-12]) {
      const c = P.closed([arc(vec(20, 20), 5, startAngle, Math.PI * 2)]);
      expect(P.containsPoint(c, vec(20, 20))).toBe(true);
      expect(P.containsPoint(c, vec(30, 20))).toBe(false);
    }
  });

  it('is invariant under rotation', () => {
    fc.assert(
      fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (angle) => {
        const m = fromRotation(angle);
        const rotated = P.transform(circle, m);
        const centre = vec(
          20 * Math.cos(angle) - 20 * Math.sin(angle),
          20 * Math.sin(angle) + 20 * Math.cos(angle),
        );
        return P.containsPoint(rotated, centre);
      }),
    );
  });
});

describe('isPointOnPath', () => {
  it('finds a point on the middle of a long edge', () => {
    // Sampling only the endpoints would miss this entirely.
    expect(P.isPointOnPath(square, vec(5, 0), 0.01)).toBe(true);
  });

  it('rejects a point well away from the path', () => {
    expect(P.isPointOnPath(square, vec(5, 5), 0.01)).toBe(false);
  });

  it('finds a point on a curve', () => {
    expect(P.isPointOnPath(circle, vec(25, 20), 0.05)).toBe(true);
  });
});
