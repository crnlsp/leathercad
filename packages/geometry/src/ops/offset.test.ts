import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  area,
  bbox,
  closed,
  distanceToPath,
  length,
  open,
  polyline,
  reverse,
  signedArea,
  type Path,
} from '../path/index.js';
import * as SegmentOps from '../segment/index.js';
import { cubic, line, tangentAt, type Segment } from '../segment/index.js';
import { circle, ellipse, roundedRect } from '../shapes.js';
import { EXPORT_TOLERANCE_MM } from '../tolerance.js';
import { add, dot, perp, scale, vec, type Vec2 } from '../vec2.js';

import { arbCubicSegment } from '../../test/arbitraries.js';
import { selfIntersections } from './intersect.js';
import { measure } from '../path/index.js';
import { pointAt as pointOnSegment } from '../segment/index.js';

import { offsetPath, offsetPathTraced } from './offset.js';

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

    it('rejects a non-finite distance', () => {
      expect(() => offsetPath(square(100), Number.NaN, ROUND)).toThrow(RangeError);
    });
  });

  it('regression: out and back keeps a corner rounded by a hair (Q25)', () => {
    // fast-check found this twice (LEATHERCAD_FC_SEED=42, and 1170594252): a
    // corner radius just over EPS_POINT survives the round trip as a tiny
    // arc, and the sides either side of it were read as crossing, because the
    // crossing test's slack was a parameter — 2e-7 mm on a 200 mm side.
    const p = roundedRect(vec(0, 0), 200, 200, 1.5e-7);
    const [out] = offsetPath(p, -0.5, ROUND);
    const [back] = offsetPath(out!, 0.5, ROUND);

    expect(back).toBeDefined();
    expect(area(back!)).toBeCloseTo(area(p), 4);
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

// ——— Curves: a cubic, offset through the arcs fitted to it (9.19) ——————————

describe('offsetPath along curves', () => {
  /** D7: the stitch line is within this of the true offset (docs/geometry.md §6.2). */
  const TOLERANCE = EXPORT_TOLERANCE_MM;

  /**
   * The true offset of every segment, sampled: each point moved `d` along the
   * left normal. Exact by definition, wherever the path has no corner for the
   * joins to bridge or trim — which a smooth ring of cubics has not.
   */
  const trueOffset = (p: Path, d: number): Vec2[] =>
    p.segments.flatMap((segment) =>
      Array.from({ length: 101 }, (_, i) =>
        add(pointOnSegment(segment, i / 100), scale(perp(tangentAt(segment, i / 100)), d)),
      ),
    );

  /** How far the result strays from the true offset, measured both ways. */
  function strayFromTrueOffset(source: Path, d: number, result: Path): number {
    const missed = Math.max(...trueOffset(source, d).map((q) => distanceToPath(result, q)));
    const along = measure(result);
    const steps = 2000;
    let wrongDistance = 0;
    for (let i = 0; i <= steps; i++) {
      const p = along.pointAtDistance((along.totalLength() * i) / steps);
      wrongDistance = Math.max(wrongDistance, Math.abs(distanceToPath(source, p) - Math.abs(d)));
    }
    return Math.max(missed, wrongDistance);
  }

  /** A circle of 40 mm squashed to 80 × 40, as converting and stretching one makes it. */
  const oval = (): Path => ellipse(vec(0, 0), 80, 40, 0);

  /** Steiner's formula: an offset of a smooth convex ring, by its area and perimeter. */
  const steiner = (p: Path, d: number): number => area(p) - length(p) * d + Math.PI * d * d;

  it('gives a squashed circle a stitch line, made of arcs, within 0.005 mm of the true offset', () => {
    const [inset] = offsetPath(oval(), 3.5, ROUND);

    expect(inset).toBeDefined();
    expect(inset!.closed).toBe(true);
    expect(inset!.segments.every((segment) => segment.kind !== 'cubic')).toBe(true);
    expect(strayFromTrueOffset(oval(), 3.5, inset!)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('encloses the area Steiner gives an inset and an outset ring', () => {
    for (const d of [3.5, -3.5, 10, -10]) {
      const [result] = offsetPath(oval(), d, ROUND);

      // Within the tolerance across the whole perimeter, and no looser.
      expect(Math.abs(area(result!) - steiner(oval(), d))).toBeLessThanOrEqual(
        TOLERANCE * length(oval()),
      );
    }
  });

  it('refuses, by returning nothing, an inset deeper than the curve can bend round', () => {
    // The oval is tightest at its ends, where it turns on 20 mm. A deeper
    // inset would fold over itself there: there is no stitch line to give,
    // and a smooth line that looks plausible would be wrong.
    expect(offsetPath(oval(), 25, ROUND)).toEqual([]);
    expect(offsetPath(oval(), 15, ROUND)).toHaveLength(1);
  });

  it('offsets outward round a curve however tight it is', () => {
    const [outset] = offsetPath(oval(), -25, ROUND);

    expect(strayFromTrueOffset(oval(), -25, outset!)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('follows the sign of travel round a clockwise ring', () => {
    const clockwise = reverse(oval());
    const [left] = offsetPath(clockwise, 3.5, ROUND);

    // Left of travel is now outside.
    expect(area(left!)).toBeGreaterThan(area(oval()));
  });

  it('offsets an open curve on either side, its ends simply ending', () => {
    const flapEdge = open([cubic(vec(80, 60), vec(60, 85), vec(20, 85), vec(0, 60))]);

    for (const d of [3.5, -3.5]) {
      const [result] = offsetPath(flapEdge, d, ROUND);
      expect(result!.closed).toBe(false);
      expect(strayFromTrueOffset(flapEdge, d, result!)).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it('bridges a corner where a curve meets a line and the offset leans away from it', () => {
    // A pouch front's allowance: outward, so each corner of the flap is
    // bridged with an arc about it, as a corner between lines is.
    const front = closed([
      line(vec(0, 0), vec(80, 0)),
      line(vec(80, 0), vec(80, 60)),
      cubic(vec(80, 60), vec(60, 85), vec(20, 85), vec(0, 60)),
      line(vec(0, 60), vec(0, 0)),
    ]);
    const [allowance] = offsetPath(front, -3, ROUND);

    expect(allowance).toBeDefined();
    expect(selfIntersections(allowance!)).toHaveLength(0);
  });

  it('refuses a corner where the inset would have to trim the curve against a line', () => {
    // The same front stitched inside: at each corner of the flap the offsets
    // overlap, and cutting an arc against a line is the join Tier 1 does not
    // make (D8), as at the scooped pocket's tips. Refused, not guessed.
    const front = closed([
      line(vec(0, 0), vec(80, 0)),
      line(vec(80, 0), vec(80, 60)),
      cubic(vec(80, 60), vec(60, 85), vec(20, 85), vec(0, 60)),
      line(vec(0, 60), vec(0, 0)),
    ]);

    expect(offsetPath(front, 3, ROUND)).toEqual([]);
  });

  it('passes over a cubic of no length, as over a corner arc the offset consumes', () => {
    // Four coincident control points at a corner of a square: nothing to fit,
    // and the square's own inset either side of it.
    const withPoint = closed([
      line(vec(0, 0), vec(100, 0)),
      cubic(vec(100, 0), vec(100, 0), vec(100, 0), vec(100, 0)),
      line(vec(100, 0), vec(100, 100)),
      line(vec(100, 100), vec(0, 100)),
      line(vec(0, 100), vec(0, 0)),
    ]);
    const [inset] = offsetPath(withPoint, 10, ROUND);

    expect(area(inset!)).toBeCloseTo(80 * 80, 6);
  });

  it('leaves the curve it follows exactly as it was', () => {
    const before = oval();
    const copy = structuredClone(before);
    offsetPath(before, 3.5, ROUND);

    expect(before).toEqual(copy);
  });

  describe('properties', () => {
    /** Ovals of 20 to 200 mm a side, turned, and an offset the curve can take. */
    const arbOvalAndOffset = fc
      .tuple(
        fc.double({ min: 20, max: 200, noNaN: true }),
        fc.double({ min: 20, max: 200, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: 0.5, max: 8, noNaN: true }),
        fc.boolean(),
      )
      .filter(([rx, ry, , d]) => {
        // Comfortably inside the tightest bend, b²/a, so the inset exists.
        const tightest = Math.min(rx, ry) ** 2 / Math.max(rx, ry);
        return d < 0.8 * tightest;
      })
      .map(([rx, ry, rotation, d, inward]) => ({
        ring: ellipse(vec(0, 0), rx, ry, rotation),
        d: inward ? d : -d,
      }));

    it('lies within 0.005 mm of the true offset, both ways', () => {
      fc.assert(
        fc.property(arbOvalAndOffset, ({ ring, d }) => {
          const [result] = offsetPath(ring, d, ROUND);

          expect(strayFromTrueOffset(ring, d, result!)).toBeLessThanOrEqual(TOLERANCE);
        }),
        { numRuns: 60 },
      );
    });

    it('encloses the area Steiner gives it, not merely the right bounds', () => {
      fc.assert(
        fc.property(arbOvalAndOffset, ({ ring, d }) => {
          const [result] = offsetPath(ring, d, ROUND);

          expect(Math.abs(area(result!) - steiner(ring, d))).toBeLessThanOrEqual(
            TOLERANCE * length(ring),
          );
          expect(selfIntersections(result!)).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * Whether the curve turns back on itself somewhere — a cusp, where its
     * direction flips. Two neighbouring directions pointing apart is a flip.
     */
    const reverses = (c: Segment): boolean =>
      Array.from({ length: 1000 }, (_, i) =>
        dot(tangentAt(c, i / 1000), tangentAt(c, (i + 1) / 1000)),
      ).some((alignment) => alignment < 0);

    it('gives any cubic that keeps its direction nothing, or a line through every point of its true offset', () => {
      // Loops, retracted handles and wild handles included: refused where the
      // curve bends too tightly, and otherwise never a plausible wrong line.
      // Only one way round: a loop's offset along one side legitimately passes
      // nearer the other side than |d|, which is validation's to judge. A cusp
      // is the limit below.
      fc.assert(
        fc.property(
          arbCubicSegment,
          fc.double({ min: 0.1, max: 8, noNaN: true }),
          fc.boolean(),
          (c, distance, right) => {
            fc.pre(!reverses(c));
            const run = open([c]);
            const d = right ? -distance : distance;
            const [result] = offsetPath(run, d, ROUND);
            if (result === undefined) return;

            const missed = Math.max(...trueOffset(run, d).map((q) => distanceToPath(result, q)));
            expect(missed).toBeLessThanOrEqual(TOLERANCE);
          },
        ),
        { numRuns: 150 },
      );
    });

    it('limit: follows a curve that reverses for less than the tolerance in its overall direction', () => {
      // LEATHERCAD_FC_SEED=404 found it. Along the x axis, this runs right for
      // 1.7 µm, turns back through a cusp and runs 359 mm left. The arcs lie
      // within the tolerance of it, but a reversal that short is below what
      // they can see, so the stitch line keeps to the left of the long run the
      // whole way, where over those 1.7 µm the curve's left is the other side.
      const glitch = open([cubic(vec(0, 0), vec(-5e-324, 0), vec(3.85, 0), vec(-359, 0))]);
      const [result] = offsetPath(glitch, 0.1, ROUND);

      for (const segment of result!.segments) {
        expect(SegmentOps.start(segment).y).toBeCloseTo(-0.1, 9);
        expect(SegmentOps.end(segment).y).toBeCloseTo(-0.1, 9);
      }
    });

    it('is deterministic', () => {
      fc.assert(
        fc.property(arbOvalAndOffset, ({ ring, d }) => {
          expect(offsetPath(ring, d, ROUND)).toEqual(offsetPath(ring, d, ROUND));
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ——— The trace: where each part of the input ended up ————————————————————

describe('offsetPathTraced', () => {
  /** The point at a distance along a path, for checking where a corner went. */
  const pointAt = (p: Path, distanceMm: number) => {
    const at = measure(p).locate(distanceMm);
    return pointOnSegment(p.segments[at.segmentIndex]!, at.t);
  };

  const distanceBetween = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

  it('reports one entry per input segment, whatever the offset did to them', () => {
    const [piece] = offsetPathTraced(square(100), 10, ROUND);

    expect(piece!.segments).toHaveLength(4);
    expect(piece!.corners).toHaveLength(4);
    expect(piece!.segments.every((range) => range !== null)).toBe(true);
  });

  it('keeps the corners in order along the result', () => {
    const [piece] = offsetPathTraced(square(100), 10, ROUND);
    const corners = piece!.corners.filter((c): c is number => c !== null);

    expect(corners).toEqual([...corners].sort((a, b) => a - b));
    expect(Math.max(...corners)).toBeLessThanOrEqual(length(piece!.path) + 1e-9);
  });

  it('puts an inset square’s corner 10√2 from the original, on the diagonal', () => {
    // The trimmed join: two offsets crossing at the inset corner. Exactly what
    // a nearest-point search would get wrong the moment a corner disappears.
    const [piece] = offsetPathTraced(square(100), 10, ROUND);
    const image = pointAt(piece!.path, piece!.corners[0]!);

    expect(distanceBetween(image, vec(100, 0))).toBeCloseTo(10 * Math.SQRT2, 9);
  });

  it('puts an outset corner in the middle of the arc that bridges it', () => {
    // Outward, the offsets lean apart and a round join bridges the gap. The
    // middle of that arc is the way the corner pointed.
    const [piece] = offsetPathTraced(square(100), -10, ROUND);
    const image = pointAt(piece!.path, piece!.corners[0]!);

    // On the bridging arc: exactly the offset distance from the corner it is
    // about, and out along the diagonal.
    expect(distanceBetween(image, vec(100, 0))).toBeCloseTo(10, 9);
    expect(image.x).toBeGreaterThan(100);
    expect(image.y).toBeLessThan(0);
  });

  it('follows a rounded corner onto the concentric arc it became', () => {
    const radius = 10;
    const inset = 4;
    const rr = roundedRect(vec(0, 0), 100, 60, radius);
    const [piece] = offsetPathTraced(rr, inset, ROUND);

    const arcs = rr.segments.flatMap((segment, index) =>
      segment.kind === 'arc' ? [{ segment, index }] : [],
    );
    expect(arcs).toHaveLength(4);

    for (const { segment, index } of arcs) {
      const range = piece!.segments[index];
      expect(range).not.toBeNull();

      const image = pointAt(piece!.path, (range!.startMm + range!.endMm) / 2);
      const original = pointOnSegment(segment, 0.5);

      // Concentric: the same direction from the corner's centre, one inset
      // nearer. Not "the closest point", which is what this exists to avoid.
      expect(distanceBetween(image, segment.centre)).toBeCloseTo(radius - inset, 9);
      expect(distanceBetween(image, original)).toBeCloseTo(inset, 9);
    }
  });

  it('still reports a corner the offset swallowed, at the sharp corner it became', () => {
    // A 3 mm corner inset by 3.5 is a sharp corner, not a collapse
    // (docs/geometry.md §6.2) — so the anchor that named it still has an image
    // rather than vanishing.
    const rr = roundedRect(vec(0, 0), 100, 60, 3);
    const [piece] = offsetPathTraced(rr, 3.5, ROUND);

    const arcIndices = rr.segments
      .map((segment, index) => (segment.kind === 'arc' ? index : -1))
      .filter((index) => index !== -1);

    for (const index of arcIndices) {
      expect(piece!.segments[index]).toBeNull();
      expect(piece!.corners[index]).not.toBeNull();
    }
  });

  it('maps everything to itself at zero, the offset that changes nothing', () => {
    const rr = roundedRect(vec(0, 0), 100, 60, 10);
    const [piece] = offsetPathTraced(rr, 0, ROUND);

    expect(piece!.path).toBe(rr);
    expect(piece!.segments[0]!.startMm).toBe(0);
    // The ranges tile the path end to end, and every corner is still a corner.
    for (const [index, range] of piece!.segments.entries()) {
      if (index === 0) continue;
      expect(range!.startMm).toBeCloseTo(piece!.segments[index - 1]!.endMm, 12);
    }
    expect(piece!.segments[piece!.segments.length - 1]!.endMm).toBeCloseTo(length(rr), 9);
    expect(piece!.corners.every((c) => c !== null)).toBe(true);
  });

  it('has no corner after an open run’s last segment, even at zero', () => {
    // The identity trace has to answer the same way the real one does, or a
    // zero offset would report a corner that is not there.
    const open = polyline([vec(0, 0), vec(50, 0), vec(50, 40)], false);
    const [piece] = offsetPathTraced(open, 0, ROUND);

    expect(piece!.corners[0]).not.toBeNull();
    expect(piece!.corners[1]).toBeNull();
  });

  it('has no corner after the last segment of an open run', () => {
    const open = polyline([vec(0, 0), vec(50, 0), vec(50, 40)], false);
    const [piece] = offsetPathTraced(open, 5, ROUND);

    expect(piece!.corners[0]).not.toBeNull();
    expect(piece!.corners[piece!.corners.length - 1]).toBeNull();
  });

  it('reports nothing at all when the offset collapses', () => {
    expect(offsetPathTraced(square(100), 60, ROUND)).toEqual([]);
  });

  it('never points outside the path it traced', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 0.5, max: 8, noNaN: true }),
        (side, d) => {
          const [piece] = offsetPathTraced(square(side), d, ROUND);
          if (piece === undefined) return true;

          const total = length(piece.path);
          const within = (value: number): boolean => value >= -1e-9 && value <= total + 1e-9;

          return (
            piece.segments.every(
              (range) => range === null || (within(range.startMm) && within(range.endMm)),
            ) && piece.corners.every((corner) => corner === null || within(corner))
          );
        },
      ),
      RUNS,
    );
  });

  it('keeps every corner of a rounded rectangle, however deep the inset goes', () => {
    // The guarantee anchors rest on: an inset that does not collapse the shape
    // keeps four corners with four images, whether the radius survived or not.
    fc.assert(
      fc.property(
        fc.double({ min: 2, max: 20, noNaN: true }),
        fc.double({ min: 0.5, max: 12, noNaN: true }),
        (radius, d) => {
          const rr = roundedRect(vec(0, 0), 120, 80, radius);
          const [piece] = offsetPathTraced(rr, d, ROUND);
          if (piece === undefined) return true;

          const arcIndices = rr.segments
            .map((segment, index) => (segment.kind === 'arc' ? index : -1))
            .filter((index) => index !== -1);

          return (
            arcIndices.length === 4 && arcIndices.every((index) => piece.corners[index] !== null)
          );
        },
      ),
    );
  });

  it('reports each cubic of a ring as one contiguous stretch, and each joint between them as a corner', () => {
    const ring = ellipse(vec(0, 0), 80, 40, 0);
    const [piece] = offsetPathTraced(ring, 3.5, ROUND);
    const total = length(piece!.path);

    // One entry per input cubic, end to end round the whole result.
    expect(piece!.segments).toHaveLength(ring.segments.length);
    expect(piece!.segments[0]!.startMm).toBeCloseTo(0, 9);
    expect(piece!.segments.at(-1)!.endMm).toBeCloseTo(total, 6);
    for (let i = 1; i < piece!.segments.length; i++) {
      expect(piece!.segments[i]!.startMm).toBeCloseTo(piece!.segments[i - 1]!.endMm, 9);
    }

    // A joint between two cubics is where it was, moved 3.5 mm inward.
    for (const [i, corner] of piece!.corners.entries()) {
      const joint = SegmentOps.end(ring.segments[i]!);
      const inward = perp(tangentAt(ring.segments[i]!, 1));
      expect(
        distanceBetween(pointAt(piece!.path, corner!), add(joint, scale(inward, 3.5))),
      ).toBeLessThan(EXPORT_TOLERANCE_MM);
    }
  });
});
