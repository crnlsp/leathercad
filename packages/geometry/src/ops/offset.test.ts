import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { area, bbox, length, polyline, signedArea, type Path } from '../path/index.js';
import { cubic } from '../segment/index.js';
import { circle, roundedRect } from '../shapes.js';
import { vec } from '../vec2.js';

import { selfIntersections } from './intersect.js';
import { offsetPath } from './offset.js';

const RUNS = { numRuns: 1000 };
const ROUND = { join: 'round' } as const;

/** Counter-clockwise, so left of travel — a positive offset — is inward. */
const square = (side: number): Path =>
  polyline([vec(0, 0), vec(side, 0), vec(side, side), vec(0, side)], true);

describe('offsetPath', () => {
  describe('sign convention', () => {
    it('a positive offset moves left of travel, which is inward on a CCW ring', () => {
      // docs/geometry.md §6.4. Inward and outward are domain concepts; the
      // geometry layer only knows left and right.
      const [inset] = offsetPath(square(100), 10, ROUND);

      expect(area(inset!)).toBeCloseTo(80 * 80, 6);
    });

    it('a negative offset moves right of travel, rounding the outer corners', () => {
      const [outset] = offsetPath(square(100), -10, ROUND);

      // 100 × 100, a 10 mm band on each of four sides, and four quarter
      // circles meeting at the corners.
      expect(area(outset!)).toBeCloseTo(100 * 100 + 4 * 10 * 100 + Math.PI * 100, 6);
    });

    it('reverses with the path, since the sign is relative to travel', () => {
      const cw = polyline([vec(0, 100), vec(100, 100), vec(100, 0), vec(0, 0)], true);
      const [result] = offsetPath(cw, 10, ROUND);

      // Left of travel is now outward, so the same sign grows the shape.
      expect(area(result!)).toBeGreaterThan(100 * 100);
    });
  });

  describe('arcs stay arcs', () => {
    it('insets a rounded rectangle to another rounded rectangle', () => {
      const rr = roundedRect(vec(0, 0), 100, 60, 10);
      const [inset] = offsetPath(rr, 4, ROUND);

      // The whole point of Tier 1: the result is 92 × 52 with 6 mm radii,
      // still made of lines and arcs, not a polyline approximation.
      expect(inset!.segments.filter((s) => s.kind === 'arc')).toHaveLength(4);
      expect(inset!.segments.filter((s) => s.kind === 'line')).toHaveLength(4);
      expect(area(inset!)).toBeCloseTo(92 * 52 - (4 - Math.PI) * 6 * 6, 6);
    });

    it('insets a circle to a smaller concentric circle', () => {
      const [inset] = offsetPath(circle(vec(0, 0), 50), 10, ROUND);

      expect(inset!.segments).toHaveLength(1);
      expect(area(inset!)).toBeCloseTo(Math.PI * 40 * 40, 6);
    });

    it('joins tangent segments without inserting anything', () => {
      // A rounded rectangle's segments meet tangentially, so there is no gap
      // to bridge and no overlap to trim. Inserting a join here would be a
      // zero-length artefact in every derived stitch line.
      const [inset] = offsetPath(roundedRect(vec(0, 0), 100, 60, 10), 4, ROUND);

      expect(inset!.segments).toHaveLength(8);
    });
  });

  describe('collapse', () => {
    it('returns nothing when an inset exceeds the inradius', () => {
      expect(offsetPath(square(100), 60, ROUND)).toEqual([]);
    });

    it('returns nothing when an inset consumes a circle exactly', () => {
      expect(offsetPath(circle(vec(0, 0), 50), 50, ROUND)).toEqual([]);
    });

    it('returns nothing when a rounded rectangle collapses in one direction', () => {
      // 100 × 60 inset by 31: the height would go negative.
      expect(offsetPath(roundedRect(vec(0, 0), 100, 60, 10), 31, ROUND)).toEqual([]);
    });
  });

  describe('rejected input', () => {
    it('returns the path unchanged at zero distance', () => {
      const p = square(100);
      expect(offsetPath(p, 0, ROUND)).toEqual([p]);
    });

    it('offsets an open path, leaving its ends open', () => {
      // Replaced "rejects an open path" in slice 4.2a. A stitch line on three
      // sides of a pocket is an open offset, and it is the most common seam in
      // leatherwork — refusing it refused the normal case. A stitch line has
      // ends, so there is no cap policy to invent.
      const run = polyline([vec(0, 0), vec(100, 0), vec(100, 50)], false);
      const [offsetRun] = offsetPath(run, 3.5, ROUND);

      expect(offsetRun).toBeDefined();
      expect(offsetRun!.closed).toBe(false);
      // Both edges lose 3.5 mm at the inside corner where they are trimmed.
      expect(length(offsetRun!)).toBeCloseTo(length(run) - 3.5 * 2, 6);
    });

    it('bridges the outside of a corner on an open path', () => {
      const run = polyline([vec(0, 0), vec(100, 0), vec(100, 50)], false);
      const [outside] = offsetPath(run, -3.5, ROUND);

      expect(outside).toBeDefined();
      expect(outside!.segments.some((s) => s.kind === 'arc')).toBe(true);
    });

    it('offsets a single open segment, which has no joins at all', () => {
      const [moved] = offsetPath(polyline([vec(0, 0), vec(100, 0)], false), 3.5, ROUND);

      expect(moved).toBeDefined();
      expect(length(moved!)).toBeCloseTo(100, 9);
    });

    it('offsets a dart rather than refusing it for being non-convex', () => {
      // Replaced the old "rejects a non-convex path" test in slice 4.2a. That
      // assertion encoded a defect: the engine asked whether concavity *could*
      // cause a problem, when it can check whether it *did*. The rejection is
      // now based on the result, not the input. See the design, section 6.2.
      const dart = polyline(
        [vec(0, 0), vec(100, 0), vec(50, 30), vec(100, 100), vec(0, 100)],
        true,
      );

      const [inset] = offsetPath(dart, 2, ROUND);

      expect(inset).toBeDefined();
      expect(selfIntersections(inset!)).toHaveLength(0);
    });

    it('rejects a cubic, which has no analytic offset', () => {
      // This test used to hold a *line* and passed only because the convexity
      // gate rejected a single-segment path for having no turn. With that gate
      // gone the test was vacuous, so it now holds the cubic its name claims.
      const p = {
        segments: [cubic(vec(0, 0), vec(3, 10), vec(7, 10), vec(10, 0))],
        closed: true,
      } as Path;
      expect(() => offsetPath(p, 1, ROUND)).toThrow(/cubic/i);
    });

    it('rejects a non-finite distance', () => {
      expect(() => offsetPath(square(100), Number.NaN, ROUND)).toThrow(RangeError);
    });
  });

  describe('properties', () => {
    const arbConvex = fc
      .tuple(
        fc.double({ min: 30, max: 200, noNaN: true }),
        fc.double({ min: 20, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
      )
      .map(([w, h, r]) => roundedRect(vec(0, 0), w, h, Math.min(r, w / 2 - 0.1, h / 2 - 0.1)));

    it('insetting strictly decreases area, outsetting strictly increases it', () => {
      fc.assert(
        fc.property(arbConvex, fc.double({ min: 0.5, max: 8, noNaN: true }), (p, d) => {
          const before = area(p);

          for (const piece of offsetPath(p, d, ROUND)) {
            expect(area(piece)).toBeLessThan(before);
          }
          const [out] = offsetPath(p, -d, ROUND);
          expect(area(out!)).toBeGreaterThan(before);
        }),
        RUNS,
      );
    });

    it('offsetting out and back returns the original area', () => {
      fc.assert(
        fc.property(arbConvex, fc.double({ min: 0.5, max: 8, noNaN: true }), (p, d) => {
          const [out] = offsetPath(p, -d, ROUND);
          const [back] = offsetPath(out!, d, ROUND);

          // Four decimal places, not six. The generator reaches corner radii
          // of about 1e-8 mm, where the round trip loses roughly 5e-7 mm² on a
          // 600 mm² shape — a relative error of 1e-9, and eleven orders of
          // magnitude below anything a knife can follow. Asserting tighter
          // than the arithmetic tests the floating point, not the offset.
          expect(area(back!)).toBeCloseTo(area(p), 4);
        }),
        RUNS,
      );
    });

    it('preserves closedness and winding', () => {
      fc.assert(
        fc.property(arbConvex, fc.double({ min: -8, max: 8, noNaN: true }), (p, d) => {
          for (const r of offsetPath(p, d, ROUND)) {
            expect(r.closed).toBe(true);
            // A collapsing offset returns nothing rather than a ring that has
            // turned itself inside out.
            expect(Math.sign(signedArea(r))).toBe(Math.sign(signedArea(p)));
          }
        }),
        RUNS,
      );
    });

    it('is deterministic', () => {
      fc.assert(
        fc.property(arbConvex, fc.double({ min: -8, max: 8, noNaN: true }), (p, d) => {
          expect(offsetPath(p, d, ROUND)).toEqual(offsetPath(p, d, ROUND));
        }),
        RUNS,
      );
    });
  });

  describe('corners smaller than the inset', () => {
    it('insets a rounded rectangle past its corner radius, giving sharp corners', () => {
      // A 3 mm corner inset by 3.5 mm. The corner arc is consumed; the two
      // neighbouring edges still meet, so the result is a sharp rectangle —
      // not a collapse. Wallet corners are routinely 3-5 mm and stitch insets
      // 3.5-4 mm, so this is the ordinary case, not an exotic one.
      const [inset] = offsetPath(roundedRect(vec(0, 0), 105, 75, 3), 3.5, ROUND);

      expect(inset).toBeDefined();
      const box = bbox(inset!);
      expect(box!.maxX - box!.minX).toBeCloseTo(98, 9);
      expect(box!.maxY - box!.minY).toBeCloseTo(68, 9);
      expect(inset!.segments).toHaveLength(4);
    });

    it('still collapses when the inset genuinely exceeds the shape', () => {
      // Unchanged behaviour: 100 x 60 inset by 31 has nowhere to go.
      expect(offsetPath(roundedRect(vec(0, 0), 100, 60, 10), 31, ROUND)).toEqual([]);
    });
  });

  describe('concave paths', () => {
    it('offsets a concave outline whose result does not self-intersect', () => {
      // A thumb scoop: a gentle concave notch in a pocket. Inset 3.5 mm it
      // produces an ordinary curve, so refusing it for being non-convex
      // refuses valid work.
      const scooped = polyline(
        [vec(0, 0), vec(95, 0), vec(95, 60), vec(60, 60), vec(47, 48), vec(34, 60), vec(0, 60)],
        true,
      );

      const [inset] = offsetPath(scooped, 3.5, ROUND);

      expect(inset).toBeDefined();
      expect(selfIntersections(inset!)).toHaveLength(0);
    });

    it('rejects a concave outline when the inset folds the result over itself', () => {
      // A deep narrow notch inset further than it is wide has no simple
      // answer. Rejecting is correct; pruning the loops is slice 9.11.
      const notched = polyline(
        [vec(0, 0), vec(100, 0), vec(100, 60), vec(52, 60), vec(50, 10), vec(48, 60), vec(0, 60)],
        true,
      );

      expect(offsetPath(notched, 8, ROUND)).toEqual([]);
    });
  });

  describe('offset properties', () => {
    it('never produces a self-intersecting result', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 20, max: 200, noNaN: true }),
          fc.double({ min: 20, max: 200, noNaN: true }),
          fc.double({ min: 0, max: 15, noNaN: true }),
          fc.double({ min: 0.5, max: 8, noNaN: true }),
          (w, h, r, d) => {
            const [inset] = offsetPath(roundedRect(vec(0, 0), w, h, r), d, ROUND);
            if (inset === undefined) return; // a legitimate collapse
            expect(selfIntersections(inset)).toHaveLength(0);
          },
        ),
        { numRuns: 300 },
      );
    });

    it('shrinks a rounded rectangle by twice the inset in each direction', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 40, max: 200, noNaN: true }),
          fc.double({ min: 40, max: 200, noNaN: true }),
          fc.double({ min: 0, max: 15, noNaN: true }),
          fc.double({ min: 0.5, max: 8, noNaN: true }),
          (w, h, r, d) => {
            const [inset] = offsetPath(roundedRect(vec(0, 0), w, h, r), d, ROUND);
            if (inset === undefined) return;
            const box = bbox(inset)!;
            // Holds whether or not the corner arcs survived the inset — which
            // is the whole point of the Case A fix.
            expect(box.maxX - box.minX).toBeCloseTo(w - 2 * d, 6);
            expect(box.maxY - box.minY).toBeCloseTo(h - 2 * d, 6);
          },
        ),
        { numRuns: 300 },
      );
    });
  });
});
