import { EPS_POINT } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbAngle, arbRigidTransform, arbSegment, arbSweep } from '../../test/arbitraries.js';
import { polyline, transform as transformPath, unsafePath, type Path } from '../path/index.js';
import type { Rect } from '../rect.js';
import { arc, bbox, cubic, line, pointAt } from '../segment/index.js';
import { circle } from '../shapes.js';
import { cross, dist, sub, vec } from '../vec2.js';

import {
  intersectPaths,
  intersectSegments,
  selfIntersections,
  type Intersection,
} from './intersect.js';

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

    it('regression: collinear lines a nanometre apart touch either way round', () => {
      // fast-check shrank to this (Q1, LEATHERCAD_FC_SEED=-1607984333). The
      // ends are 1e-9 mm apart — well inside EPS_POINT, so they touch — but
      // the gap was measured in parameters against EPS_PARAM, where 1e-9 is
      // exactly the epsilon, and the last bit of |r|² decided the answer.
      const a = line(vec(1.0000000000000005e-9, 0), vec(1.0000000010000005, 0));
      const b = line(vec(0, 0), vec(-1.0000000000000002, 0));

      expect(intersectSegments(a, b)).toHaveLength(1);
      expect(intersectSegments(b, a)).toHaveLength(1);
    });

    it('measures the gap between collinear lines in millimetres, not parameters', () => {
      // 1e-8 mm is a gap of 1e-10 on a 100 mm line and 1e-7 on a 0.1 mm one:
      // either side of EPS_PARAM. In millimetres it is one point both times.
      for (const length of [0.1, 1, 100]) {
        const a = line(vec(0, 0), vec(length, 0));
        const b = line(vec(length + 1e-8, 0), vec(2 * length, 0));

        expect(intersectSegments(a, b)).toHaveLength(1);
      }
    });

    it('measures how far past an end a crossing may be in millimetres (Q25)', () => {
      // Two sides meeting at a right angle, stopped short of the corner. The
      // lines would cross 1.5e-7 mm past each end — more than EPS_POINT, so
      // they do not touch, however long they are. As a parameter, the slack
      // was 2e-7 mm on a 200 mm side and they did.
      for (const lengthMm of [1, 100, 200, 2000]) {
        const gap = 1.5e-7;
        const across = line(vec(-lengthMm, 0), vec(-gap, 0));
        const up = line(vec(0, gap), vec(0, lengthMm));
        expect(intersectSegments(across, up)).toEqual([]);

        // Within EPS_POINT they are one point, at every length.
        const near = 5e-8;
        const touching = intersectSegments(
          line(vec(-lengthMm, 0), vec(-near, 0)),
          line(vec(0, near), vec(0, lengthMm)),
        );
        expect(touching).toHaveLength(1);
      }
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

    it('is symmetric for collinear lines whose ends nearly meet', () => {
      // The general arbitrary almost never lands two lines on one axis with
      // their ends a hair apart, which is where Q1 lived. This one does, with
      // gaps and overlaps spread across EPS_POINT and EPS_PARAM.
      const arbGap = fc.oneof(
        fc.double({ min: -1e-6, max: 1e-6, noNaN: true }),
        fc.constantFrom(0, 1e-9, -1e-9, 1e-7, -1e-7, EPS_POINT, -EPS_POINT),
      );
      const arbLength = fc.double({ min: 1e-3, max: 1000, noNaN: true });

      fc.assert(
        fc.property(
          arbLength,
          arbLength,
          arbGap,
          fc.boolean(),
          arbRigidTransform,
          (lengthA, lengthB, gap, flip, m) => {
            const a = polyline([vec(0, 0), vec(lengthA, 0)]);
            const b = polyline(
              flip
                ? [vec(lengthA + gap + lengthB, 0), vec(lengthA + gap, 0)]
                : [vec(lengthA + gap, 0), vec(lengthA + gap + lengthB, 0)],
            );
            const [sa] = transformPath(a, m).segments;
            const [sb] = transformPath(b, m).segments;

            const forward = intersectSegments(sa!, sb!);
            const backward = intersectSegments(sb!, sa!);

            expect(backward).toHaveLength(forward.length);
            for (const h of forward) {
              expect(backward.some((g) => dist(g.point, h.point) < 1e-6)).toBe(true);
            }
          },
        ),
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

  describe('broad phase (PERF-004)', () => {
    /**
     * What `intersectPaths` did before it had a broad phase, and the
     * specification it still meets: every pair of segments whose boxes overlap
     * to EPS_POINT, in the order of the first path's segments and then the
     * second's, the first crossing at a place kept.
     */
    function everyPairOfBoxes(a: Path, b: Path): Intersection[] {
      const out: Intersection[] = [];
      const near = (p: Rect, q: Rect): boolean =>
        p.minX <= q.maxX + EPS_POINT &&
        q.minX <= p.maxX + EPS_POINT &&
        p.minY <= q.maxY + EPS_POINT &&
        q.minY <= p.maxY + EPS_POINT;
      a.segments.forEach((sa, i) =>
        b.segments.forEach((sb, j) => {
          if (!near(bbox(sa), bbox(sb))) return;
          for (const hit of intersectSegments(sa, sb)) {
            if (out.some((h) => dist(h.point, hit.point) < EPS_POINT)) continue;
            out.push({ point: hit.point, tA: i + hit.tA, tB: j + hit.tB });
          }
        }),
      );
      return out;
    }

    /** Segments a few millimetres apart, so that boxes overlap often and crossings are many. */
    const arbNearCoord = fc.oneof(
      fc.integer({ min: -6, max: 6 }),
      fc.double({ min: -6, max: 6, noNaN: true }),
      fc.constantFrom(0, EPS_POINT, -EPS_POINT, 0.99 * EPS_POINT, 3 + EPS_POINT),
    );
    const arbNearVec = fc.record({ x: arbNearCoord, y: arbNearCoord });
    const arbNearSegment = fc.oneof(
      fc.tuple(arbNearVec, arbNearVec).map(([p, q]) => line(p, q)),
      fc
        .tuple(arbNearVec, fc.double({ min: 0.1, max: 6, noNaN: true }), arbAngle, arbSweep)
        .map(([c, r, start, sweep]) => arc(c, r, start, sweep)),
      fc
        .tuple(arbNearVec, arbNearVec, arbNearVec, arbNearVec)
        .map(([p0, p1, p2, p3]) => cubic(p0, p1, p2, p3)),
    );
    /** Not joined up: the broad phase does not care, and a soup crosses more. */
    const arbSoup = fc
      .array(fc.oneof({ weight: 3, arbitrary: arbNearSegment }, arbSegment), { maxLength: 10 })
      .map((segments) => unsafePath(segments));

    it('finds what testing every pair of overlapping boxes finds, in the same order', () => {
      fc.assert(
        fc.property(arbSoup, arbSoup, (a, b) => {
          expect(intersectPaths(a, b)).toEqual(everyPairOfBoxes(a, b));
        }),
        RUNS,
      );
    });

    it('agrees with every pair of boxes for a path against itself', () => {
      // Shorter: a cubic against itself overlaps along its whole flattening,
      // which is slow, not interesting.
      const arbShortSoup = fc
        .array(arbNearSegment, { maxLength: 6 })
        .map((segments) => unsafePath(segments));
      fc.assert(
        fc.property(arbShortSoup, (a) => {
          expect(intersectPaths(a, a)).toEqual(everyPairOfBoxes(a, a));
        }),
        RUNS,
      );
    });

    it('never leaves out two segments that pass through one point', () => {
      // Without a box at all: `sa` is drawn through a point of `sb`, among
      // segments of every kind, and whatever the two report is kept.
      fc.assert(
        fc.property(
          arbSoup,
          arbSoup,
          arbNearSegment,
          fc.double({ min: 0, max: 1, noNaN: true }),
          arbAngle,
          fc.tuple(
            fc.double({ min: 0.01, max: 8, noNaN: true }),
            fc.double({ min: 0, max: 8, noNaN: true }),
          ),
          (a, b, sb, t, angle, [before, after]) => {
            const p = pointAt(sb, t);
            const u = vec(Math.cos(angle), Math.sin(angle));
            const sa = line(
              vec(p.x - u.x * before, p.y - u.y * before),
              vec(p.x + u.x * after, p.y + u.y * after),
            );
            const found = intersectPaths(
              unsafePath([...a.segments, sa]),
              unsafePath([sb, ...b.segments]),
            );

            for (const hit of intersectSegments(sa, sb)) {
              expect(found.some((h) => dist(h.point, hit.point) < EPS_POINT)).toBe(true);
            }
          },
        ),
        RUNS,
      );
    });

    it('leaves out a touch across a gap a hair over EPS_POINT, as it always has', () => {
      // fast-check found it: `intersectSegments` calls these touching through
      // its own end tolerance, but their boxes are further apart than the one
      // EPS_POINT the box test allows. The broad phase keeps that rule rather
      // than change which crossings snapping offers; widening it is a separate
      // decision (PERF-004 notes).
      const a = polyline([vec(7, 5e-324), vec(0, 5e-324)]);
      const b = polyline([vec(0, -3), vec(0, -EPS_POINT)]);

      expect(intersectSegments(a.segments[0]!, b.segments[0]!)).toHaveLength(1);
      expect(intersectPaths(a, b)).toEqual([]);
    });

    it('keeps a touch across a gap just under EPS_POINT', () => {
      const a = polyline([vec(0, 0), vec(10, 0)]);
      const b = polyline([vec(10 + 0.5 * EPS_POINT, -5), vec(10 + 0.5 * EPS_POINT, 5)]);

      expect(intersectPaths(a, b)).toHaveLength(1);
    });

    it('finds nothing across a gap of a millimetre', () => {
      const a = polyline([vec(0, 0), vec(10, 0)]);
      const b = polyline([vec(11, -5), vec(11, 5)]);

      expect(intersectPaths(a, b)).toEqual([]);
    });

    it('pairs segments that start at the same x', () => {
      // Equal keys in the sweep's sort, both ways round.
      const a = polyline([vec(0, -5), vec(0, 5), vec(10, 5)]);
      const b = polyline([vec(0, 0), vec(10, 0), vec(10, 10)]);

      expect(intersectPaths(a, b)).toEqual(everyPairOfBoxes(a, b));
      expect(intersectPaths(b, a)).toEqual(everyPairOfBoxes(b, a));
    });

    it('keeps one crossing where two land closer than EPS_POINT, across a whole millimetre', () => {
      const a = polyline([vec(-5, 0), vec(5, 0)]);
      const b = unsafePath([
        line(vec(1 - 0.4 * EPS_POINT, -5), vec(1 - 0.4 * EPS_POINT, 5)),
        line(vec(1 + 0.4 * EPS_POINT, -5), vec(1 + 0.4 * EPS_POINT, 5)),
      ]);

      expect(intersectPaths(a, b)).toEqual(everyPairOfBoxes(a, b));
      expect(intersectPaths(a, b)).toHaveLength(1);
    });

    it('keeps both crossings exactly EPS_POINT apart', () => {
      const a = polyline([vec(-5, 0), vec(5, 0)]);
      const b = unsafePath([
        line(vec(0, -5), vec(0, 5)),
        line(vec(EPS_POINT, -5), vec(EPS_POINT, 5)),
      ]);

      expect(intersectPaths(a, b)).toHaveLength(2);
    });

    it('finds nothing against an empty path', () => {
      expect(intersectPaths(unsafePath([]), circle(vec(0, 0), 5))).toEqual([]);
      expect(intersectPaths(circle(vec(0, 0), 5), unsafePath([]))).toEqual([]);
    });

    // `line` refuses a coordinate that is not finite, so these are written out:
    // the sweep's sort must not be thrown by one that got in some other way.
    it('skips a segment with a NaN coordinate and keeps the rest', () => {
      const broken = unsafePath([
        { kind: 'line', a: vec(Number.NaN, 0), b: vec(10, 0) },
        line(vec(5, -5), vec(5, 5)),
      ]);
      const across = polyline([vec(0, 1), vec(10, 1)]);

      expect(intersectPaths(broken, across)).toEqual(everyPairOfBoxes(broken, across));
      expect(intersectPaths(broken, across)).toHaveLength(1);
    });

    it('pairs segments that reach to infinity', () => {
      const wide = unsafePath([
        { kind: 'line', a: vec(Number.NEGATIVE_INFINITY, 0), b: vec(10, 0) },
        { kind: 'line', a: vec(Number.NEGATIVE_INFINITY, 1), b: vec(10, 1) },
      ]);
      const across = polyline([vec(5, -5), vec(5, 5)]);

      expect(intersectPaths(wide, across)).toEqual(everyPairOfBoxes(wide, across));
    });
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
