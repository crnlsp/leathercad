import { EPS_POINT } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbCubicSegment, arbRigidTransform } from '../../test/arbitraries.js';
import { fromScale } from '../mat2x3.js';
import { distanceToPath, unsafePath, type Path } from '../path/index.js';
import { CubicOps, cubic, end, pointAt, start, tangentAt, type Segment } from '../segment/index.js';
import { ellipse } from '../shapes.js';
import { EXPORT_TOLERANCE_MM } from '../tolerance.js';
import { dist, dot, len, vec, type Vec2 } from '../vec2.js';

import { fitArcs, type ArcFit } from './fitArcs.js';

/**
 * Fewer runs than the cheaper properties elsewhere: each fits a cubic of up
 * to 2 m with wild handles into some 65 pieces, and the tolerance check
 * measures every one of them against a densely sampled reference.
 */
const RUNS = { numRuns: 200 };
const HEAVY_RUNS = { numRuns: 100 };
const TOLERANCE = EXPORT_TOLERANCE_MM;

/** The fitted pieces as one path, for measuring against. */
const asPath = (fit: ArcFit): Path => unsafePath(fit.pieces.map((piece) => piece.segment));

/** Many more samples than the fitter takes, so a peak between its samples shows. */
const SAMPLES = 400;
const samplesOf = (s: Segment): Vec2[] =>
  Array.from({ length: SAMPLES + 1 }, (_, i) => pointAt(s, i / SAMPLES));

/** The furthest any point of the cubic lies from the fit. */
const cubicToFit = (c: Segment, fit: ArcFit): number =>
  // A cubic of four coincident points is fitted by nothing, and is nothing to miss.
  fit.pieces.length === 0
    ? 0
    : Math.max(...samplesOf(c).map((p) => distanceToPath(asPath(fit), p)));

/**
 * Distance to the cubic, accurate where the curve runs back over itself.
 *
 * The engine's nearest-point search brackets one minimum on a coarse sweep,
 * which is right for picking but not as a reference: on a needle or a loop it
 * settles on the wrong branch and overstates the distance. Here every local
 * minimum of 1024 samples is refined by ternary search, and the nearest kept.
 */
function distanceToCubic(c: Segment): (p: Vec2) => number {
  const n = 1024;
  const points = Array.from({ length: n + 1 }, (_, i) => pointAt(c, i / n));

  return (p) => {
    const sampled = points.map((q) => dist(q, p));
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= n; i++) {
      const here = sampled[i]!;
      if ((i > 0 && sampled[i - 1]! < here) || (i < n && sampled[i + 1]! < here)) continue;
      let lo = Math.max(0, i - 1) / n;
      let hi = Math.min(n, i + 1) / n;
      for (let step = 0; step < 40; step++) {
        const a = lo + (hi - lo) / 3;
        const b = hi - (hi - lo) / 3;
        if (dist(pointAt(c, a), p) < dist(pointAt(c, b), p)) hi = b;
        else lo = a;
      }
      best = Math.min(best, here, dist(pointAt(c, (lo + hi) / 2), p));
    }
    return best;
  };
}

/** The furthest any point of the fit lies from the cubic, 10 intervals to a piece. */
const fitToCubic = (c: Segment, fit: ArcFit): number => {
  const toCurve = distanceToCubic(c);
  return Math.max(
    0,
    ...fit.pieces.flatMap(({ segment }) =>
      Array.from({ length: 11 }, (_, i) => toCurve(pointAt(segment, i / 10))),
    ),
  );
};

/** A quarter of a circle of radius 50, as the export writes arcs: one cubic. */
const quarterCircle = cubic(vec(50, 0), vec(50, 27.614), vec(27.614, 50), vec(0, 50));

describe('fitArcs', () => {
  describe('examples', () => {
    it('fits a quarter circle with arcs of its own radius', () => {
      const fit = fitArcs(quarterCircle, TOLERANCE);

      expect(fit.pieces.length).toBeGreaterThan(0);
      for (const { segment } of fit.pieces) {
        expect(segment.kind).toBe('arc');
        // Each within 2.5% of 50 mm, as the cubic's own bend is: a short arc
        // follows the cubic, not the circle the cubic stands for.
        if (segment.kind === 'arc') expect(Math.abs(segment.radius / 50 - 1)).toBeLessThan(0.025);
      }
      expect(cubicToFit(quarterCircle, fit)).toBeLessThanOrEqual(TOLERANCE);
    });

    it('fits a straight cubic with straight lines', () => {
      const straight = cubic(vec(0, 0), vec(10, 5), vec(30, 15), vec(100, 50));
      const fit = fitArcs(straight, TOLERANCE);

      expect(fit.pieces.every((piece) => piece.segment.kind === 'line')).toBe(true);
      expect(start(fit.pieces[0]!.segment)).toEqual(straight.p0);
      expect(end(fit.pieces.at(-1)!.segment)).toEqual(straight.p3);
      expect(fit.sharpestBend.left).toBeCloseTo(0, 12);
      expect(fit.sharpestBend.right).toBeCloseTo(0, 12);
    });

    it('fits an S-curve, bending each way in turn', () => {
      const s = cubic(vec(0, 0), vec(40, 40), vec(60, -40), vec(100, 0));
      const fit = fitArcs(s, TOLERANCE);

      expect(fit.sharpestBend.left).toBeGreaterThan(0);
      expect(fit.sharpestBend.right).toBeGreaterThan(0);
      expect(cubicToFit(s, fit)).toBeLessThanOrEqual(TOLERANCE);
    });

    it('reads the sharpest bend of an ellipse at the ends of its long axis', () => {
      // An 80 × 40 ellipse is tightest at (±80, 0), where its radius of
      // curvature is b²/a = 20 mm; at (0, ±40) it is a²/b = 160 mm.
      const quarters = ellipse(vec(0, 0), 80, 40, 0).segments;
      const sharpest = Math.max(
        ...quarters.map((q) => (q.kind === 'cubic' ? fitArcs(q, TOLERANCE).sharpestBend.left : 0)),
      );

      // Counter-clockwise, so the whole ring bends left — and never right.
      expect(1 / sharpest).toBeCloseTo(20, 0);

      // Mirrored, the same ring runs clockwise and bends only right.
      const mirrored = ellipse(vec(0, 0), 80, 40, 0).segments.map((q) =>
        q.kind === 'cubic' ? fitArcs(CubicOps.transform(q, fromScale(1, -1)), TOLERANCE) : null,
      );
      for (const fit of mirrored) expect(fit?.sharpestBend.left).toBe(0);
      for (const q of quarters) {
        if (q.kind === 'cubic') expect(fitArcs(q, TOLERANCE).sharpestBend.right).toBe(0);
      }
    });

    it('needs more arcs for a tighter tolerance', () => {
      const flap = cubic(vec(80, 60), vec(60, 85), vec(20, 85), vec(0, 60));

      expect(fitArcs(flap, TOLERANCE / 10).pieces.length).toBeGreaterThan(
        fitArcs(flap, TOLERANCE).pieces.length,
      );
    });
  });

  describe('degenerate input', () => {
    it('returns nothing for a cubic whose four points coincide', () => {
      const point = cubic(vec(3, 4), vec(3, 4), vec(3, 4), vec(3, 4));

      expect(fitArcs(point, TOLERANCE)).toEqual({
        pieces: [],
        sharpestBend: { left: 0, right: 0 },
      });
    });

    it('fits a cubic with collinear control points that doubles back on itself', () => {
      // It runs out to x = 10, turns back through a cusp, and ends at x = 5.
      const back = cubic(vec(0, 0), vec(20, 0), vec(-10, 0), vec(5, 0));
      const fit = fitArcs(back, TOLERANCE);

      expect(cubicToFit(back, fit)).toBeLessThanOrEqual(TOLERANCE);
      expect(fitToCubic(back, fit)).toBeLessThanOrEqual(TOLERANCE);
    });

    it('fits a closed loop, whose two ends are the same point', () => {
      const loop = cubic(vec(0, 0), vec(100, 100), vec(-100, 100), vec(0, 0));
      const fit = fitArcs(loop, TOLERANCE);

      expect(fit.pieces.length).toBeGreaterThan(1);
      expect(cubicToFit(loop, fit)).toBeLessThanOrEqual(TOLERANCE);
    });

    it('fits a cubic whose first two control points coincide (a retracted handle)', () => {
      const retracted = cubic(vec(0, 0), vec(0, 0), vec(40, 30), vec(100, 0));
      const fit = fitArcs(retracted, TOLERANCE);

      expect(cubicToFit(retracted, fit)).toBeLessThanOrEqual(TOLERANCE);
      expect(dist(start(fit.pieces[0]!.segment), retracted.p0)).toBeLessThanOrEqual(EPS_POINT);
    });

    it('regression: never makes an arc of no length where the junction lands on a cusp', () => {
      // fast-check found a zero-radius arc here, its own tangent reversed
      // against the one it carried: the biarc's junction fell on the end it
      // left from, and a centre was computed from a chord of no length.
      const needle = cubic(vec(0, 0), vec(0, -19), vec(0, 0), vec(-5e-324, -11));

      for (const { segment } of fitArcs(needle, TOLERANCE).pieces) {
        if (segment.kind === 'arc') expect(segment.radius).toBeGreaterThan(EPS_POINT);
      }
    });

    it('regression: finds the tip of a cusp between the parameters it samples', () => {
      // The curve slows to a stop at its tip, which fell between evenly spaced
      // samples: the fit was accepted 0.024 mm short of it until every local
      // peak of the samples was refined.
      const needle = cubic(vec(0, 0), vec(0, 30.11913978494624), vec(0, -1), vec(0, 0));

      expect(cubicToFit(needle, fitArcs(needle, TOLERANCE))).toBeLessThanOrEqual(TOLERANCE);
    });

    it('refuses a tolerance that is not a positive, finite length', () => {
      expect(() => fitArcs(quarterCircle, 0)).toThrow(RangeError);
      expect(() => fitArcs(quarterCircle, -1)).toThrow(RangeError);
      expect(() => fitArcs(quarterCircle, Number.NaN)).toThrow(RangeError);
      expect(() => fitArcs(quarterCircle, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });
  });

  describe('properties', () => {
    it('lies within the tolerance of the cubic, both ways', () => {
      fc.assert(
        fc.property(arbCubicSegment, (c) => {
          const fit = fitArcs(c, TOLERANCE);

          expect(cubicToFit(c, fit)).toBeLessThanOrEqual(TOLERANCE);
          expect(fitToCubic(c, fit)).toBeLessThanOrEqual(TOLERANCE);
        }),
        HEAVY_RUNS,
      );
    });

    it('runs end to end from the first control point to the last', () => {
      fc.assert(
        fc.property(arbCubicSegment, (c) => {
          const { pieces } = fitArcs(c, TOLERANCE);
          if (pieces.length === 0) return;

          expect(dist(start(pieces[0]!.segment), c.p0)).toBeLessThanOrEqual(EPS_POINT);
          expect(dist(end(pieces.at(-1)!.segment), c.p3)).toBeLessThanOrEqual(EPS_POINT);
          for (let i = 1; i < pieces.length; i++) {
            expect(
              dist(end(pieces[i - 1]!.segment), start(pieces[i]!.segment)),
            ).toBeLessThanOrEqual(EPS_POINT);
          }
        }),
        RUNS,
      );
    });

    it('is tangent-continuous: each piece leaves the way the one before arrived', () => {
      fc.assert(
        fc.property(arbCubicSegment, (c) => {
          const { pieces } = fitArcs(c, TOLERANCE);

          for (let i = 1; i < pieces.length; i++) {
            // Shared, not merely close: the offset of one piece must start
            // exactly where the offset of the one before it ends.
            expect(pieces[i]!.startTangent).toBe(pieces[i - 1]!.endTangent);
          }
          for (const { segment, startTangent, endTangent } of pieces) {
            expect(len(startTangent)).toBeCloseTo(1, 12);
            expect(len(endTangent)).toBeCloseTo(1, 12);
            // An arc's own tangent is the one it carries. A line's chord may
            // lean off it by less than the tolerance allows it to bulge.
            if (segment.kind === 'arc') {
              expect(dot(tangentAt(segment, 0), startTangent)).toBeCloseTo(1, 9);
              expect(dot(tangentAt(segment, 1), endTangent)).toBeCloseTo(1, 9);
            }
          }
        }),
        RUNS,
      );
    });

    it('starts and ends along the cubic', () => {
      fc.assert(
        fc.property(arbCubicSegment, (c) => {
          const { pieces } = fitArcs(c, TOLERANCE);
          if (pieces.length === 0) return;

          expect(pieces[0]!.startTangent).toEqual(tangentAt(c, 0));
          expect(pieces.at(-1)!.endTangent).toEqual(tangentAt(c, 1));
        }),
        RUNS,
      );
    });

    it('moves with the cubic under a rigid transform', () => {
      fc.assert(
        fc.property(arbCubicSegment, arbRigidTransform, (c, m) => {
          const moved = CubicOps.transform(c, m);
          const fit = fitArcs(moved, TOLERANCE);

          // Not the same arcs — the halving may round differently — but the
          // same curve, to the same tolerance.
          expect(cubicToFit(moved, fit)).toBeLessThanOrEqual(TOLERANCE);
        }),
        RUNS,
      );
    });

    it('is deterministic', () => {
      fc.assert(
        fc.property(arbCubicSegment, (c) => {
          expect(fitArcs(c, TOLERANCE)).toEqual(fitArcs(c, TOLERANCE));
        }),
        HEAVY_RUNS,
      );
    });
  });
});
