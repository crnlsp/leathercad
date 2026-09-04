import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { area, polyline, signedArea, type Path } from '../path/index.js';
import { line } from '../segment/index.js';
import { circle, roundedRect } from '../shapes.js';
import { vec } from '../vec2.js';

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

    it('rejects an open path', () => {
      expect(() => offsetPath(polyline([vec(0, 0), vec(100, 0)]), 5, ROUND)).toThrow(/closed/i);
    });

    it('rejects a non-convex path, which needs Tier 2', () => {
      const dart = polyline(
        [vec(0, 0), vec(100, 0), vec(50, 30), vec(100, 100), vec(0, 100)],
        true,
      );

      expect(() => offsetPath(dart, 5, ROUND)).toThrow(/convex/i);
    });

    it('rejects a cubic, which has no analytic offset', () => {
      const p = { segments: [line(vec(0, 0), vec(10, 0))], closed: true } as Path;
      expect(() => offsetPath(p, 1, ROUND)).toThrow();
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
});
