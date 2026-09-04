import { EPS_POINT } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbRigidTransform } from '../../test/arbitraries.js';
import { polyline, transform as transformPath } from '../path/index.js';
import { arc, cubic, line, pointAt } from '../segment/index.js';
import { circle } from '../shapes.js';
import { cross, dist, sub, vec } from '../vec2.js';

import { intersectPaths, intersectSegments, selfIntersections } from './intersect.js';

const RUNS = { numRuns: 300 };
const QUARTER = Math.PI / 2;

describe('intersectSegments', () => {
  describe('line and line', () => {
    it('finds a crossing and reports both parameters', () => {
      const hits = intersectSegments(line(vec(0, 0), vec(10, 0)), line(vec(5, -5), vec(5, 5)));

      expect(hits).toHaveLength(1);
      expect(hits[0]!.point.x).toBeCloseTo(5, 9);
      expect(hits[0]!.point.y).toBeCloseTo(0, 9);
      expect(hits[0]!.tA).toBeCloseTo(0.5, 9);
      expect(hits[0]!.tB).toBeCloseTo(0.5, 9);
    });

    it('finds nothing when the crossing lies outside both spans', () => {
      expect(intersectSegments(line(vec(0, 0), vec(1, 0)), line(vec(5, -5), vec(5, 5)))).toEqual(
        [],
      );
    });

    it('finds nothing between parallel lines', () => {
      expect(intersectSegments(line(vec(0, 0), vec(10, 0)), line(vec(0, 1), vec(10, 1)))).toEqual(
        [],
      );
    });

    it('returns the overlap endpoints for collinear segments', () => {
      // Infinitely many intersections; the overlap is the honest answer.
      const hits = intersectSegments(line(vec(0, 0), vec(10, 0)), line(vec(4, 0), vec(20, 0)));

      expect(hits).toHaveLength(2);
      expect(hits.map((h) => h.point.x).sort((a, b) => a - b)).toEqual([4, 10]);
    });

    it('returns one point when collinear segments meet end to end', () => {
      const hits = intersectSegments(line(vec(0, 0), vec(10, 0)), line(vec(10, 0), vec(20, 0)));

      expect(hits).toHaveLength(1);
      expect(hits[0]!.point.x).toBeCloseTo(10, 9);
    });

    it('finds an exact endpoint touch', () => {
      const hits = intersectSegments(line(vec(0, 0), vec(10, 0)), line(vec(10, 0), vec(10, 10)));

      expect(hits).toHaveLength(1);
      expect(hits[0]!.tA).toBeCloseTo(1, 9);
      expect(hits[0]!.tB).toBeCloseTo(0, 9);
    });

    it('treats a pair within the angle epsilon of parallel as parallel', () => {
      // About 1e-9 radians apart — at EPS_ANGLE. The epsilon calls them
      // parallel, and since they also lie within EPS_POINT of the same line,
      // collinear: the answer is the two overlap endpoints rather than one
      // crossing. Which of the two it is remains a judgement the epsilon
      // makes rather than a fact, so the test exists to make changing that
      // epsilon a deliberate act with a visible consequence.
      const a = line(vec(-1, 0), vec(0, -1e-9));
      const b = line(vec(-100, 0), vec(0, 0));

      expect(intersectSegments(a, b)).toHaveLength(2);
    });

    it('regression: near-parallel segments of very different lengths agree either way round', () => {
      // fast-check shrank to this. The short segment lies within EPS_POINT of
      // the long one's line, but extrapolating the short one's slope across
      // the long one's 100 mm crosses the epsilon — so measuring from only one
      // side made the answer depend on argument order.
      const a = line(vec(0, -6.270522301690856e-9), vec(6.6900215979801265, 0));
      const b = line(vec(-99.99999999999987, 0), vec(0, 0));

      expect(intersectSegments(a, b)).toHaveLength(intersectSegments(b, a).length);
    });

    it('does not invent a crossing between near-parallel lines that miss', () => {
      // The determinant is tiny but the segments genuinely do not meet.
      const a = line(vec(0, 0), vec(1000, 0));
      const b = line(vec(0, 1), vec(1000, 1 + 1e-9));

      expect(intersectSegments(a, b)).toEqual([]);
    });
  });

  describe('line and arc', () => {
    it('finds both crossings of a chord', () => {
      // The full circle of radius 10, crossed by the x axis.
      const c = arc(vec(0, 0), 10, 0, Math.PI * 2);
      const hits = intersectSegments(line(vec(-20, 0), vec(20, 0)), c);

      expect(hits).toHaveLength(2);
      expect(hits.map((h) => h.point.x).sort((a, b) => a - b)).toEqual([-10, 10]);
    });

    it('finds one point where a line is tangent', () => {
      const c = arc(vec(0, 0), 10, 0, Math.PI * 2);
      const hits = intersectSegments(line(vec(-20, 10), vec(20, 10)), c);

      expect(hits).toHaveLength(1);
      expect(hits[0]!.point.y).toBeCloseTo(10, 6);
    });

    it('ignores a crossing outside the arc sweep', () => {
      // A quarter arc in the first quadrant cannot meet the negative x axis.
      const quarter = arc(vec(0, 0), 10, 0, QUARTER);
      expect(intersectSegments(line(vec(-20, 0), vec(-5, 0)), quarter)).toEqual([]);
    });

    it('finds nothing when the line misses the circle', () => {
      const c = arc(vec(0, 0), 10, 0, Math.PI * 2);
      expect(intersectSegments(line(vec(-20, 30), vec(20, 30)), c)).toEqual([]);
    });
  });

  describe('arc and arc', () => {
    it('finds two crossings of overlapping circles', () => {
      const a = arc(vec(0, 0), 10, 0, Math.PI * 2);
      const b = arc(vec(12, 0), 10, 0, Math.PI * 2);
      const hits = intersectSegments(a, b);

      expect(hits).toHaveLength(2);
      for (const h of hits) {
        expect(dist(h.point, vec(0, 0))).toBeCloseTo(10, 6);
        expect(dist(h.point, vec(12, 0))).toBeCloseTo(10, 6);
      }
    });

    it('finds one point for externally tangent circles', () => {
      const a = arc(vec(0, 0), 10, 0, Math.PI * 2);
      const b = arc(vec(20, 0), 10, 0, Math.PI * 2);
      const hits = intersectSegments(a, b);

      expect(hits).toHaveLength(1);
      expect(hits[0]!.point.x).toBeCloseTo(10, 6);
    });

    it('finds one point for internally tangent circles', () => {
      const a = arc(vec(0, 0), 10, 0, Math.PI * 2);
      const b = arc(vec(5, 0), 5, 0, Math.PI * 2);

      expect(intersectSegments(a, b)).toHaveLength(1);
    });

    it('finds nothing for separate circles', () => {
      const a = arc(vec(0, 0), 10, 0, Math.PI * 2);
      const b = arc(vec(50, 0), 10, 0, Math.PI * 2);

      expect(intersectSegments(a, b)).toEqual([]);
    });

    it('finds nothing for concentric circles of different radius', () => {
      const a = arc(vec(0, 0), 10, 0, Math.PI * 2);
      const b = arc(vec(0, 0), 4, 0, Math.PI * 2);

      expect(intersectSegments(a, b)).toEqual([]);
    });
  });

  describe('cubics', () => {
    it('refines a line and cubic crossing below the point epsilon', () => {
      // A symmetric hump peaking at (5, 7.5); the line y = 5 cuts it twice.
      const c = cubic(vec(0, 0), vec(0, 10), vec(10, 10), vec(10, 0));
      const hits = intersectSegments(line(vec(-5, 5), vec(15, 5)), c);

      expect(hits).toHaveLength(2);
      for (const h of hits) {
        // The refined point must sit on both curves, not merely near the
        // flattened polylines that located it.
        expect(dist(h.point, pointAt(c, h.tB))).toBeLessThan(EPS_POINT);
        expect(h.point.y).toBeCloseTo(5, 6);
      }
    });

    it('finds nothing when a cubic passes clear of a line', () => {
      const c = cubic(vec(0, 0), vec(0, 10), vec(10, 10), vec(10, 0));
      expect(intersectSegments(line(vec(-5, 50), vec(15, 50)), c)).toEqual([]);
    });
  });

  describe('properties', () => {
    const arbLine = fc
      .tuple(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
      )
      .filter(([ax, ay, bx, by]) => Math.hypot(bx - ax, by - ay) > 1)
      .map(([ax, ay, bx, by]) => line(vec(ax, ay), vec(bx, by)));

    it('every reported point lies on both segments', () => {
      fc.assert(
        fc.property(arbLine, arbLine, (a, b) => {
          for (const h of intersectSegments(a, b)) {
            expect(dist(h.point, pointAt(a, h.tA))).toBeLessThan(1e-6);
            expect(dist(h.point, pointAt(b, h.tB))).toBeLessThan(1e-6);
          }
        }),
        RUNS,
      );
    });

    it('is symmetric in its arguments', () => {
      fc.assert(
        fc.property(arbLine, arbLine, (a, b) => {
          const forward = intersectSegments(a, b);
          const backward = intersectSegments(b, a);

          expect(backward).toHaveLength(forward.length);
          for (const h of forward) {
            expect(backward.some((g) => dist(g.point, h.point) < 1e-6)).toBe(true);
          }
        }),
        RUNS,
      );
    });

    it('keeps its count under a rigid transform', () => {
      fc.assert(
        fc.property(arbLine, arbLine, arbRigidTransform, (a, b, m) => {
          // Excluding pairs within a millionth of parallel. Whether two
          // segments 1e-9 radians apart are "parallel" is genuinely
          // undecidable in doubles: they either cross once or overlap
          // collinearly at two points, and a rigid transform perturbs the
          // last bit enough to change the answer. fast-check found exactly
          // that pair. docs/geometry.md §7 lists it as an edge case for the
          // same reason, and the example below pins the behaviour.
          const u = sub(a.b, a.a);
          const v = sub(b.b, b.a);
          const sine = cross(u, v) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
          fc.pre(Math.abs(sine) > 1e-6);

          const before = intersectSegments(a, b).length;
          const movedA = polyline([a.a, a.b]);
          const movedB = polyline([b.a, b.b]);

          expect(intersectPaths(transformPath(movedA, m), transformPath(movedB, m)).length).toBe(
            before,
          );
        }),
        RUNS,
      );
    });
  });
});

describe('intersectPaths', () => {
  it('finds where two rectangles overlap', () => {
    const a = polyline([vec(0, 0), vec(20, 0), vec(20, 20), vec(0, 20)], true);
    const b = polyline([vec(10, 10), vec(30, 10), vec(30, 30), vec(10, 30)], true);

    // The corner of b sits inside a, so their boundaries cross twice.
    expect(intersectPaths(a, b)).toHaveLength(2);
  });

  it('reports the segment index in the integer part of the parameter', () => {
    const a = polyline([vec(0, 0), vec(20, 0), vec(20, 20)]);
    const b = polyline([vec(15, -5), vec(15, 5)]);

    const hits = intersectPaths(a, b);
    expect(hits).toHaveLength(1);
    // Segment 0 of a, three quarters along it.
    expect(hits[0]!.tA).toBeCloseTo(0.75, 9);
  });

  it('finds nothing between disjoint paths', () => {
    const a = polyline([vec(0, 0), vec(10, 0)]);
    const b = polyline([vec(0, 50), vec(10, 50)]);

    expect(intersectPaths(a, b)).toEqual([]);
  });

  it('finds where a circle crosses a square', () => {
    const square = polyline([vec(-20, -20), vec(20, -20), vec(20, 20), vec(-20, 20)], true);
    // Radius 25 pokes through all four sides, twice each.
    expect(intersectPaths(circle(vec(0, 0), 25), square)).toHaveLength(8);
  });
});

describe('selfIntersections', () => {
  it('finds the crossing of a figure eight', () => {
    const eight = polyline([vec(0, 0), vec(10, 10), vec(10, 0), vec(0, 10)], true);

    expect(selfIntersections(eight)).toHaveLength(1);
  });

  it('finds nothing on a simple polygon', () => {
    expect(selfIntersections(polyline([vec(0, 0), vec(10, 0), vec(10, 10)], true))).toEqual([]);
  });

  it('does not report the joins between consecutive segments', () => {
    // Adjacent segments always touch at their shared vertex. Reporting that
    // would make every path self-intersecting.
    expect(selfIntersections(polyline([vec(0, 0), vec(10, 0), vec(20, 5)]))).toEqual([]);
  });
});
