import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  arbArcSegment,
  arbCubicSegment,
  arbLineSegment,
  arbNonDegenerateSegment,
  arbRigidTransform,
  arbSegment,
} from '../../test/arbitraries.js';
import { IDENTITY, apply, fromScale } from '../mat2x3.js';
import { EXPORT_TOLERANCE_MM } from '../tolerance.js';
import { containsPoint, expand } from '../rect.js';
import { dist, equals as vecEquals, len, vec } from '../vec2.js';
import * as Seg from './index.js';
import { arc, cubic, line, quadraticToCubic } from './types.js';

const closeTo = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

/** Points sampled along a segment, for bounds and monotonicity checks. */
function sample(s: Seg.Segment, count = 64) {
  return Array.from({ length: count + 1 }, (_, i) => Seg.pointAt(s, i / count));
}

describe('endpoints', () => {
  it('pointAt(0) is the start and pointAt(1) is the end', () => {
    fc.assert(
      fc.property(arbSegment, (s) => {
        return (
          vecEquals(Seg.pointAt(s, 0), Seg.start(s)) && vecEquals(Seg.pointAt(s, 1), Seg.end(s))
        );
      }),
    );
  });

  it('a line runs between its own endpoints', () => {
    const s = line(vec(1, 2), vec(4, 6));
    expect(Seg.start(s)).toEqual(vec(1, 2));
    expect(Seg.end(s)).toEqual(vec(4, 6));
    expect(Seg.length(s)).toBe(5);
  });
});

describe('reverse', () => {
  it('is its own inverse', () => {
    fc.assert(
      fc.property(arbSegment, (s) => {
        const back = Seg.reverse(Seg.reverse(s));
        return (
          vecEquals(Seg.start(back), Seg.start(s), 1e-6) &&
          vecEquals(Seg.end(back), Seg.end(s), 1e-6)
        );
      }),
    );
  });

  it('walks the same curve backwards', () => {
    fc.assert(
      fc.property(arbSegment, fc.double({ min: 0, max: 1, noNaN: true }), (s, t) =>
        vecEquals(Seg.pointAt(Seg.reverse(s), t), Seg.pointAt(s, 1 - t), 1e-6),
      ),
    );
  });

  it('preserves length', () => {
    fc.assert(
      fc.property(arbSegment, (s) => closeTo(Seg.length(Seg.reverse(s)), Seg.length(s), 1e-6)),
    );
  });

  it('flips the tangent', () => {
    fc.assert(
      fc.property(arbNonDegenerateSegment, (s) => {
        const forward = Seg.tangentAt(s, 0.5);
        const backward = Seg.tangentAt(Seg.reverse(s), 0.5);
        return closeTo(forward.x, -backward.x, 1e-5) && closeTo(forward.y, -backward.y, 1e-5);
      }),
    );
  });
});

describe('split', () => {
  it('joins back up where it was cut', () => {
    fc.assert(
      fc.property(arbSegment, fc.double({ min: 0, max: 1, noNaN: true }), (s, t) => {
        const [first, second] = Seg.split(s, t);
        return vecEquals(Seg.end(first), Seg.start(second), 1e-6);
      }),
    );
  });

  it('keeps the original endpoints', () => {
    fc.assert(
      fc.property(arbSegment, fc.double({ min: 0, max: 1, noNaN: true }), (s, t) => {
        const [first, second] = Seg.split(s, t);
        return (
          vecEquals(Seg.start(first), Seg.start(s), 1e-6) &&
          vecEquals(Seg.end(second), Seg.end(s), 1e-6)
        );
      }),
    );
  });

  it('halves sum to the whole length', () => {
    fc.assert(
      fc.property(arbSegment, fc.double({ min: 0, max: 1, noNaN: true }), (s, t) => {
        const [first, second] = Seg.split(s, t);
        const total = Seg.length(s);
        const parts = Seg.length(first) + Seg.length(second);
        return closeTo(parts, total, Math.max(1e-5, total * 1e-6));
      }),
    );
  });

  it('splitting at an endpoint leaves one degenerate half', () => {
    fc.assert(
      fc.property(arbSegment, (s) => {
        const [atZero] = Seg.split(s, 0);
        const [, atOne] = Seg.split(s, 1);
        return Seg.length(atZero) < 1e-6 && Seg.length(atOne) < 1e-6;
      }),
    );
  });
});

describe('bbox', () => {
  it('contains every sampled point', () => {
    fc.assert(
      fc.property(arbSegment, (s) => {
        const box = expand(Seg.bbox(s), 1e-6);
        return sample(s).every((p) => containsPoint(box, p));
      }),
    );
  });

  it('is tight — a sampled point reaches each side', () => {
    // Tightness is the half that catches a box built from the control hull
    // rather than the curve. A loose box makes print pages larger than needed
    // and "fit to content" wrong.
    fc.assert(
      fc.property(arbNonDegenerateSegment, (s) => {
        const box = Seg.bbox(s);
        const points = sample(s, 512);
        const tol = Math.max(1e-3, (box.maxX - box.minX + box.maxY - box.minY) * 1e-3);
        return (
          points.some((p) => Math.abs(p.x - box.minX) < tol) &&
          points.some((p) => Math.abs(p.x - box.maxX) < tol) &&
          points.some((p) => Math.abs(p.y - box.minY) < tol) &&
          points.some((p) => Math.abs(p.y - box.maxY) < tol)
        );
      }),
    );
  });

  it('is not the control-point hull for a bulging cubic', () => {
    // The classic mistake. Control points reach y = 10; the curve only
    // reaches 7.5.
    const s = cubic(vec(0, 0), vec(0, 10), vec(10, 10), vec(10, 0));
    const box = Seg.bbox(s);
    expect(box.maxY).toBeLessThan(9);
    expect(closeTo(box.maxY, 7.5, 1e-9)).toBe(true);
  });

  it('finds the extremum of a curve that doubles back', () => {
    // Regression: fast-check shrank to control points 0 → −2000 → −2000 → 0.
    // The derivative's quadratic is (−4e-10, 4000, −2000), where the textbook
    // root formula subtracts 4000 from 4000 and loses the extremum at t = 0.5
    // entirely — the box collapsed from 1500 mm wide to zero. cubic.ts had
    // inlined that formula instead of using the stable solver.
    const s = cubic(vec(0, 0), vec(-2000, 0), vec(-1999.9999999997938, 0), vec(0, 0));
    const box = Seg.bbox(s);
    expect(closeTo(box.minX, -1500, 1e-6)).toBe(true);
    expect(closeTo(box.maxX, 0, 1e-9)).toBe(true);
  });

  it('bounds a full circle by its radius', () => {
    const box = Seg.bbox(arc(vec(5, 5), 3, 0, Math.PI * 2));
    expect(closeTo(box.minX, 2, 1e-9)).toBe(true);
    expect(closeTo(box.maxX, 8, 1e-9)).toBe(true);
    expect(closeTo(box.minY, 2, 1e-9)).toBe(true);
    expect(closeTo(box.maxY, 8, 1e-9)).toBe(true);
  });

  it('a quarter arc does not bulge past its endpoints', () => {
    // From (1,0) to (0,1): the box is exactly the unit square, because no
    // axis crossing falls strictly inside the sweep.
    const box = Seg.bbox(arc(vec(0, 0), 1, 0, Math.PI / 2));
    expect(closeTo(box.minX, 0, 1e-9)).toBe(true);
    expect(closeTo(box.maxX, 1, 1e-9)).toBe(true);
    expect(closeTo(box.minY, 0, 1e-9)).toBe(true);
    expect(closeTo(box.maxY, 1, 1e-9)).toBe(true);
  });
});

describe('length', () => {
  it('is never less than the straight-line distance between endpoints', () => {
    fc.assert(
      fc.property(arbSegment, (s) => Seg.length(s) >= dist(Seg.start(s), Seg.end(s)) - 1e-6),
    );
  });

  it('is preserved by a rigid transform', () => {
    fc.assert(
      fc.property(arbSegment, arbRigidTransform, (s, m) => {
        const moved = Seg.transform(s, m);
        const total = moved.reduce((sum, part) => sum + Seg.length(part), 0);
        const before = Seg.length(s);
        return closeTo(total, before, Math.max(1e-4, before * 1e-5));
      }),
    );
  });

  it('matches the closed form for an arc', () => {
    fc.assert(
      fc.property(arbArcSegment, (s) =>
        closeTo(Seg.length(s), Math.abs(s.sweepAngle) * s.radius, 1e-9),
      ),
    );
  });

  it('matches the chord for a straight cubic', () => {
    const s = cubic(vec(0, 0), vec(3, 0), vec(6, 0), vec(9, 0));
    expect(closeTo(Seg.length(s), 9, 1e-6)).toBe(true);
  });

  it('approaches the true circumference as the cubic tolerance tightens', () => {
    // The 4/3·tan(θ/4) approximation always runs slightly long. The error
    // falls as θ⁶, so tightening the tolerance must strictly improve it —
    // that convergence is the real contract, not any single magic number.
    const semicircle = arc(vec(0, 0), 10, 0, Math.PI);
    const exact = Math.PI * 10;

    const measure = (tolerance: number): number =>
      Seg.ArcOps.toCubics(semicircle, tolerance).reduce((sum, c) => sum + Seg.length(c), 0);

    const coarse = Math.abs(measure(1) - exact);
    const fine = Math.abs(measure(1e-6) - exact);

    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeLessThan(1e-4);
  });
});

describe('tangentAt', () => {
  it('is a unit vector for a non-degenerate segment', () => {
    fc.assert(
      fc.property(arbNonDegenerateSegment, fc.double({ min: 0, max: 1, noNaN: true }), (s, t) =>
        closeTo(len(Seg.tangentAt(s, t)), 1, 1e-6),
      ),
    );
  });

  it('points along a line', () => {
    expect(vecEquals(Seg.tangentAt(line(vec(0, 0), vec(10, 0)), 0.3), vec(1, 0), 1e-9)).toBe(true);
  });

  it('survives a cubic whose first control point coincides with the start', () => {
    // Extremely common in curves produced by offsetting. The derivative
    // vanishes at t=0, so a naive implementation returns zero here.
    const s = cubic(vec(0, 0), vec(0, 0), vec(10, 0), vec(10, 0));
    expect(closeTo(len(Seg.tangentAt(s, 0)), 1, 1e-9)).toBe(true);
    expect(closeTo(len(Seg.tangentAt(s, 1)), 1, 1e-9)).toBe(true);
  });

  it('follows the sweep direction on an arc', () => {
    const ccw = Seg.tangentAt(arc(vec(0, 0), 1, 0, Math.PI / 2), 0);
    const cw = Seg.tangentAt(arc(vec(0, 0), 1, 0, -Math.PI / 2), 0);
    expect(vecEquals(ccw, vec(0, 1), 1e-9)).toBe(true);
    expect(vecEquals(cw, vec(0, -1), 1e-9)).toBe(true);
  });
});

describe('transform', () => {
  it('the identity changes nothing', () => {
    fc.assert(
      fc.property(arbSegment, (s) => {
        const [only] = Seg.transform(s, IDENTITY);
        return only !== undefined && vecEquals(Seg.start(only), Seg.start(s), 1e-6);
      }),
    );
  });

  it('commutes with pointAt for lines and cubics', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbLineSegment, arbCubicSegment),
        arbRigidTransform,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (s, m, t) => {
          const [moved] = Seg.transform(s, m);
          return (
            moved !== undefined &&
            vecEquals(Seg.pointAt(moved, t), apply(m, Seg.pointAt(s, t)), 1e-6)
          );
        },
      ),
    );
  });

  it('keeps an arc an arc under a similarity transform', () => {
    fc.assert(
      fc.property(arbArcSegment, arbRigidTransform, (s, m) => {
        const result = Seg.transform(s, m);
        return result.length === 1 && result[0]?.kind === 'arc';
      }),
    );
  });

  it('converts an arc to cubics under a non-uniform scale', () => {
    // A circle scaled unevenly is an ellipse, which ArcSegment cannot hold.
    // Returning cubics is the only honest option — see docs/geometry.md §4.2.
    const result = Seg.transform(arc(vec(0, 0), 10, 0, Math.PI * 2), fromScale(2, 1));
    expect(result.every((s) => s.kind === 'cubic')).toBe(true);
    expect(result.length).toBeGreaterThan(1);
  });

  it('an unevenly scaled circle has the ellipse it should', () => {
    const parts = Seg.transform(arc(vec(0, 0), 10, 0, Math.PI * 2), fromScale(2, 1));
    const xs = parts.flatMap((s) => sample(s, 32).map((p) => p.x));
    const ys = parts.flatMap((s) => sample(s, 32).map((p) => p.y));
    expect(closeTo(Math.max(...xs), 20, 0.01)).toBe(true);
    expect(closeTo(Math.max(...ys), 10, 0.01)).toBe(true);
  });
});

describe('arc specifics', () => {
  it('containsAngle covers everything on a full circle', () => {
    const full = arc(vec(0, 0), 1, 0, Math.PI * 2);
    for (const angle of [0, 1, -1, Math.PI, 4, -6, 100]) {
      expect(Seg.ArcOps.containsAngle(full, angle)).toBe(true);
    }
  });

  it('containsAngle excludes angles outside the sweep', () => {
    const quarter = arc(vec(0, 0), 1, 0, Math.PI / 2);
    expect(Seg.ArcOps.containsAngle(quarter, Math.PI / 4)).toBe(true);
    expect(Seg.ArcOps.containsAngle(quarter, Math.PI)).toBe(false);
    expect(Seg.ArcOps.containsAngle(quarter, -0.1)).toBe(false);
  });

  it('handles a clockwise sweep', () => {
    const cw = arc(vec(0, 0), 1, Math.PI / 2, -Math.PI / 2);
    expect(vecEquals(Seg.start(cw), vec(0, 1), 1e-9)).toBe(true);
    expect(vecEquals(Seg.end(cw), vec(1, 0), 1e-9)).toBe(true);
  });

  it('reverse flips the sweep sign and moves the start to the old end', () => {
    const s = arc(vec(1, 2), 3, 0.4, 1.1);
    const r = Seg.ArcOps.reverse(s);
    expect(closeTo(r.sweepAngle, -1.1, 1e-12)).toBe(true);
    expect(closeTo(r.startAngle, 1.5, 1e-12)).toBe(true);
  });

  it('rejects a sweep beyond a full turn', () => {
    expect(() => arc(vec(0, 0), 1, 0, Math.PI * 3)).toThrow(RangeError);
  });

  it('rejects a negative radius', () => {
    expect(() => arc(vec(0, 0), -1, 0, 1)).toThrow(RangeError);
  });

  it('toCubics honours the tolerance it was given', () => {
    // PDF has no arc primitive, so every exported arc goes through this path.
    // A fixed quarter-turn subdivision leaves 0.027 mm of error at a 100 mm
    // radius — five times the export budget — so the step is derived from the
    // tolerance instead.
    fc.assert(
      fc.property(arbArcSegment, (s) => {
        const tolerance = EXPORT_TOLERANCE_MM;
        return Seg.ArcOps.toCubics(s, tolerance).every((c) =>
          sample(c, 64).every((p) => Math.abs(dist(p, s.centre) - s.radius) <= tolerance + 1e-9),
        );
      }),
    );
  });

  it('subdivides more finely for a larger radius', () => {
    // Error scales with radius, so a bigger arc needs more pieces to hold the
    // same absolute tolerance.
    const small = Seg.ArcOps.toCubics(arc(vec(0, 0), 1, 0, Math.PI * 2), EXPORT_TOLERANCE_MM);
    const large = Seg.ArcOps.toCubics(arc(vec(0, 0), 1000, 0, Math.PI * 2), EXPORT_TOLERANCE_MM);
    expect(large.length).toBeGreaterThan(small.length);
  });
});

describe('quadraticToCubic', () => {
  it('is exact, not an approximation', () => {
    const p0 = vec(0, 0);
    const control = vec(5, 10);
    const p2 = vec(10, 0);
    const raised = quadraticToCubic(p0, control, p2);

    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      const expected = vec(
        u * u * p0.x + 2 * u * t * control.x + t * t * p2.x,
        u * u * p0.y + 2 * u * t * control.y + t * t * p2.y,
      );
      expect(vecEquals(Seg.pointAt(raised, t), expected, 1e-12)).toBe(true);
    }
  });
});

describe('degenerate input', () => {
  it('handles a zero-length line', () => {
    const s = line(vec(3, 3), vec(3, 3));
    expect(Seg.length(s)).toBe(0);
    expect(vecEquals(Seg.tangentAt(s, 0.5), vec(0, 0))).toBe(true);
    expect(Seg.bbox(s)).toEqual({ minX: 3, minY: 3, maxX: 3, maxY: 3 });
  });

  it('handles a zero-sweep arc', () => {
    const s = arc(vec(0, 0), 5, 1, 0);
    expect(Seg.length(s)).toBe(0);
    expect(vecEquals(Seg.start(s), Seg.end(s))).toBe(true);
  });

  it('handles a zero-radius arc', () => {
    const s = arc(vec(2, 2), 0, 0, Math.PI);
    expect(Seg.length(s)).toBe(0);
    expect(vecEquals(Seg.start(s), vec(2, 2))).toBe(true);
  });

  it('handles a cubic with all control points coincident', () => {
    const s = cubic(vec(1, 1), vec(1, 1), vec(1, 1), vec(1, 1));
    expect(Seg.length(s)).toBe(0);
    expect(vecEquals(Seg.pointAt(s, 0.5), vec(1, 1))).toBe(true);
    expect(vecEquals(Seg.tangentAt(s, 0.5), vec(0, 0))).toBe(true);
  });

  it('handles a cubic with a cusp', () => {
    const s = cubic(vec(0, 0), vec(10, 0), vec(0, 0), vec(10, 0));
    expect(Number.isFinite(Seg.length(s))).toBe(true);
    expect(Number.isFinite(Seg.bbox(s).maxX)).toBe(true);
  });

  it('rejects NaN at construction rather than propagating it', () => {
    expect(() => line(vec(Number.NaN, 0), vec(1, 1))).toThrow(RangeError);
    expect(() => cubic(vec(0, 0), vec(0, 0), vec(0, 0), vec(Number.POSITIVE_INFINITY, 0))).toThrow(
      RangeError,
    );
    expect(() => arc(vec(0, 0), Number.NaN, 0, 1)).toThrow(RangeError);
  });
});
