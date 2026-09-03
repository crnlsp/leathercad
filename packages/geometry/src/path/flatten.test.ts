import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbArcSegment, arbCubicSegment, arbSegment, arbVec2 } from '../../test/arbitraries.js';
import { arc, cubic, line } from '../segment/index.js';
import * as Seg from '../segment/index.js';
import { EXPORT_TOLERANCE_MM, SCREEN_TOLERANCE_MM } from '../tolerance.js';
import { closestPointOnSegment, dist, vec, type Vec2 } from '../vec2.js';
import * as P from './index.js';

const circle = P.closed([arc(vec(0, 0), 10, 0, Math.PI * 2)]);
const square = P.polyline([vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)], true);

/**
 * The largest distance from the true curve to its flattened polyline.
 *
 * Measured this way round deliberately. Checking that the flattened *points*
 * lie on the curve tests nothing: subdivision produces them by de Casteljau,
 * so they are on it by construction. What the tolerance actually promises is
 * that no part of the curve strays further than that from the chords, which
 * needs dense sampling of the curve and an exact distance to the polyline.
 */
function maxDeviationFromPolyline(s: Seg.Segment, polyline: readonly Vec2[]): number {
  let worst = 0;
  const samples = 4000;
  for (let i = 0; i <= samples; i++) {
    const onCurve = Seg.pointAt(s, i / samples);
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < polyline.length - 1; j++) {
      const closest = closestPointOnSegment(onCurve, polyline[j]!, polyline[j + 1]!);
      best = Math.min(best, dist(onCurve, closest));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

describe('maxAngleStepForSagitta', () => {
  it('derives the step from the sagitta formula', () => {
    // A chord subtending θ sits r(1 − cos(θ/2)) below the arc.
    const radius = 100;
    const tolerance = 0.005;
    const step = P.maxAngleStepForSagitta(radius, tolerance);
    expect(radius * (1 - Math.cos(step / 2))).toBeCloseTo(tolerance, 9);
  });

  it('shrinks as the radius grows', () => {
    expect(P.maxAngleStepForSagitta(1000, 0.005)).toBeLessThan(P.maxAngleStepForSagitta(10, 0.005));
  });

  it('degrades safely for nonsense input', () => {
    expect(P.maxAngleStepForSagitta(0, 0.005)).toBe(Math.PI);
    expect(P.maxAngleStepForSagitta(10, 0)).toBe(Math.PI);
    expect(P.maxAngleStepForSagitta(1, 50)).toBe(Math.PI);
  });
});

describe('flattenSegment', () => {
  it('keeps both endpoints exactly', () => {
    fc.assert(
      fc.property(arbSegment, (s) => {
        const points = P.flattenSegment(s, SCREEN_TOLERANCE_MM);
        const first = points[0]!;
        const last = points[points.length - 1]!;
        return dist(first, Seg.start(s)) < 1e-9 && dist(last, Seg.end(s)) < 1e-9;
      }),
    );
  });

  it('leaves a line as two points', () => {
    expect(P.flattenSegment(line(vec(0, 0), vec(10, 0)), 0.001)).toHaveLength(2);
  });

  it('keeps the whole arc within tolerance of its polyline', () => {
    fc.assert(
      fc.property(arbArcSegment, (s) => {
        const tolerance = EXPORT_TOLERANCE_MM;
        const points = P.flattenSegment(s, tolerance);
        return maxDeviationFromPolyline(s, points) <= tolerance + 1e-9;
      }),
      { numRuns: 40 },
    );
  });

  it('places every arc vertex exactly on the circle', () => {
    fc.assert(
      fc.property(arbArcSegment, (s) =>
        P.flattenSegment(s, EXPORT_TOLERANCE_MM).every(
          (p) => Math.abs(dist(p, s.centre) - s.radius) < 1e-9,
        ),
      ),
    );
  });

  it('keeps the whole cubic within tolerance of its polyline', () => {
    fc.assert(
      fc.property(arbCubicSegment, (s) => {
        const tolerance = 0.05;
        const points = P.flattenSegment(s, tolerance);
        return maxDeviationFromPolyline(s, points) <= tolerance + 1e-9;
      }),
      { numRuns: 40 },
    );
  });

  it('handles a cubic that doubles back on itself', () => {
    // Regression: fast-check shrank to a curve with every control point on
    // x = 0, running up to y ≈ 60 and back down to −5. Degenerate in x, so
    // the flatness test sees a straight line in one axis only.
    const s = cubic(vec(0, 0), vec(0, 0), vec(0, 135.10183727034132), vec(0, -5));
    const points = P.flattenSegment(s, 0.05);
    expect(maxDeviationFromPolyline(s, points)).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('is deterministic to the bit', () => {
    // Golden fixtures and byte-stable saves depend on this. Any state or
    // iteration-order dependence in the recursion would break it.
    fc.assert(
      fc.property(arbSegment, (s) => {
        const a = P.flattenSegment(s, SCREEN_TOLERANCE_MM);
        const b = P.flattenSegment(s, SCREEN_TOLERANCE_MM);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
    );
  });

  it('never produces fewer points as the tolerance tightens', () => {
    fc.assert(
      fc.property(arbSegment, (s) => {
        const coarse = P.flattenSegment(s, 0.5).length;
        const fine = P.flattenSegment(s, 0.001).length;
        return fine >= coarse;
      }),
    );
  });

  it('underestimates the true length, converging as tolerance tightens', () => {
    // A chord is always shorter than the arc it spans.
    const s = arc(vec(0, 0), 10, 0, Math.PI);
    const measure = (tolerance: number): number => {
      const points = P.flattenSegment(s, tolerance);
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) total += dist(points[i]!, points[i + 1]!);
      return total;
    };
    const exact = Math.PI * 10;
    const coarse = measure(0.5);
    const fine = measure(0.0001);

    expect(coarse).toBeLessThan(exact);
    expect(fine).toBeLessThan(exact + 1e-9);
    expect(exact - fine).toBeLessThan(exact - coarse);
  });

  it('terminates on a degenerate cubic', () => {
    const s = cubic(vec(1, 1), vec(1, 1), vec(1, 1), vec(1, 1));
    expect(P.flattenSegment(s, 1e-9).length).toBeGreaterThanOrEqual(2);
  });

  it('terminates on a cusp', () => {
    const s = cubic(vec(0, 0), vec(10, 0), vec(0, 0), vec(10, 0));
    const points = P.flattenSegment(s, 1e-6);
    expect(points.length).toBeGreaterThan(2);
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('flattenPath', () => {
  it('collapses the shared point between segments', () => {
    const p = P.polyline([vec(0, 0), vec(1, 0), vec(2, 0)], false);
    expect(P.flattenPath(p, 0.01)).toEqual([vec(0, 0), vec(1, 0), vec(2, 0)]);
  });

  it('drops the repeated closing point, matching vertices()', () => {
    expect(P.flattenPath(square, 0.01)).toHaveLength(4);
    expect(P.flattenPath(square, 0.01)).toEqual(P.vertices(square));
  });

  it('approximates a circle closely enough for export', () => {
    const points = P.flattenPath(circle, EXPORT_TOLERANCE_MM);
    expect(
      points.every((p) => Math.abs(dist(p, vec(0, 0)) - 10) <= EXPORT_TOLERANCE_MM + 1e-9),
    ).toBe(true);
    // Well under a full turn of 1° steps, but far more than a coarse screen pass.
    expect(points.length).toBeGreaterThan(P.flattenPath(circle, SCREEN_TOLERANCE_MM).length);
  });

  it('handles an empty path', () => {
    expect(P.flattenPath(P.polyline([], false), 0.01)).toEqual([]);
  });

  it('is deterministic to the bit', () => {
    fc.assert(
      fc.property(fc.array(arbVec2, { minLength: 2, maxLength: 15 }), (points) => {
        const p = P.polyline(points, true);
        return JSON.stringify(P.flattenPath(p, 0.01)) === JSON.stringify(P.flattenPath(p, 0.01));
      }),
    );
  });
});

describe('flattenToPolyline', () => {
  it('produces a valid closed path', () => {
    const flat = P.flattenToPolyline(circle, 0.01);
    expect(P.isValid(flat, 1e-6)).toBe(true);
    expect(flat.closed).toBe(true);
    expect(flat.segments.every((s) => s.kind === 'line')).toBe(true);
  });

  it('preserves area to within the tolerance', () => {
    const flat = P.flattenToPolyline(circle, 0.001);
    // A polygon inscribed in a circle is slightly smaller than it.
    expect(P.area(flat)).toBeLessThan(Math.PI * 100);
    expect(Math.PI * 100 - P.area(flat)).toBeLessThan(0.1);
  });

  it('preserves orientation', () => {
    expect(P.orientation(P.flattenToPolyline(circle, 0.01))).toBe('ccw');
    expect(P.orientation(P.flattenToPolyline(P.reverse(circle), 0.01))).toBe('cw');
  });

  it('agrees with containsPoint on the original', () => {
    const flat = P.flattenToPolyline(circle, 0.001);
    for (const p of [vec(0, 0), vec(9, 0), vec(0, 9), vec(11, 0), vec(20, 20)]) {
      expect(P.containsPoint(flat, p)).toBe(P.containsPoint(circle, p));
    }
  });

  it('leaves an already-straight path unchanged', () => {
    expect(P.vertices(P.flattenToPolyline(square, 0.01))).toEqual(P.vertices(square));
  });
});
