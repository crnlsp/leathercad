import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbVec2 } from '../../test/arbitraries.js';
import * as SegmentOps from '../segment/index.js';
import { arc, cubic, line } from '../segment/index.js';
import { dist, len, vec } from '../vec2.js';
import * as P from './index.js';

const closeTo = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

const square = P.polyline([vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)], true);
const circle = P.closed([arc(vec(0, 0), 10, 0, Math.PI * 2)]);
const wiggle = P.open([
  cubic(vec(0, 0), vec(0, 40), vec(40, -40), vec(40, 0)),
  cubic(vec(40, 0), vec(60, 20), vec(80, 20), vec(100, 0)),
]);

describe('totalLength', () => {
  it('agrees with the exact path length', () => {
    for (const p of [square, circle, wiggle]) {
      expect(closeTo(new P.PathMeasure(p).totalLength(), P.length(p), 1e-6)).toBe(true);
    }
  });

  it('matches the circumference of a circle', () => {
    expect(closeTo(new P.PathMeasure(circle).totalLength(), 2 * Math.PI * 10, 1e-6)).toBe(true);
  });
});

describe('pointAtDistance', () => {
  it('returns the endpoints at 0 and the total length', () => {
    const m = new P.PathMeasure(wiggle);
    expect(dist(m.pointAtDistance(0), P.start(wiggle)!)).toBeLessThan(1e-9);
    expect(dist(m.pointAtDistance(m.totalLength()), P.end(wiggle)!)).toBeLessThan(1e-6);
  });

  it('clamps rather than extrapolating outside the path', () => {
    const m = new P.PathMeasure(wiggle);
    expect(dist(m.pointAtDistance(-50), P.start(wiggle)!)).toBeLessThan(1e-9);
    expect(dist(m.pointAtDistance(m.totalLength() * 3), P.end(wiggle)!)).toBeLessThan(1e-6);
  });

  it('is monotonic: the chord never exceeds the distance travelled', () => {
    const m = new P.PathMeasure(wiggle);
    const total = m.totalLength();
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (u, v) => {
          const [d1, d2] = [u * total, v * total].sort((a, b) => a - b) as [number, number];
          return dist(m.pointAtDistance(d1), m.pointAtDistance(d2)) <= d2 - d1 + 1e-6;
        },
      ),
    );
  });

  it('walks a circle at constant speed', () => {
    // The property stitch holes depend on: equal steps of distance must give
    // equal steps of angle, or holes bunch on the curves.
    const m = new P.PathMeasure(circle);
    const total = m.totalLength();
    const steps = 64;
    for (let i = 0; i < steps; i++) {
      const point = m.pointAtDistance((total * i) / steps);
      const expected = vec(
        Math.cos((Math.PI * 2 * i) / steps) * 10,
        Math.sin((Math.PI * 2 * i) / steps) * 10,
      );
      expect(dist(point, expected)).toBeLessThan(1e-4);
    }
  });

  it('places points at the true arc distance, verified by independent integration', () => {
    // The whole reason PathMeasure exists: on a cubic, t is not proportional
    // to distance, so stepping t uniformly bunches points on the curves.
    //
    // Checked against a dense Simpson integration of |B'(t)| rather than
    // against chord lengths. Chords between arc-equidistant points are *not*
    // equal — they shorten wherever curvature rises — so chord uniformity
    // would be the wrong property to assert.
    const curve = cubic(vec(0, 0), vec(0, 40), vec(40, -40), vec(40, 0));
    const single = P.open([curve]);
    const m = new P.PathMeasure(single);
    const total = m.totalLength();

    const arcLengthTo = (t: number): number => {
      const steps = 20_000;
      const h = t / steps;
      if (h === 0) return 0;
      const speed = (u: number): number => len(SegmentOps.CubicOps.derivativeAt(curve, u));
      let sum = speed(0) + speed(t);
      for (let i = 1; i < steps; i++) {
        sum += speed(i * h) * (i % 2 === 0 ? 2 : 4);
      }
      return (sum * h) / 3;
    };

    for (let i = 0; i <= 10; i++) {
      const target = (total * i) / 10;
      const at = m.locate(target);
      expect(Math.abs(arcLengthTo(at.t) - target)).toBeLessThan(1e-4);
    }
  });

  it('crosses a segment boundary without a discontinuity', () => {
    const m = new P.PathMeasure(square);
    const before = m.pointAtDistance(9.999);
    const after = m.pointAtDistance(10.001);
    expect(dist(before, after)).toBeLessThan(0.01);
  });

  it('walks the interior of every edge, not just the corners', () => {
    // Regression. Only the first segment was seeded with a t=0 sample, so a
    // distance inside any later segment bracketed across a boundary where t
    // resets and got snapped to that segment's start. A line needs just one
    // step, so every straight edge after the first collapsed onto its corner.
    //
    // The corner-only test below passed throughout, and so did the segment
    // index check — the index was right while the position was wrong.
    const m = new P.PathMeasure(square);
    const expected: ReadonlyArray<readonly [number, ReturnType<typeof vec>]> = [
      [5, vec(5, 0)],
      [12.5, vec(10, 2.5)],
      [15, vec(10, 5)],
      [25, vec(5, 10)],
      [32.5, vec(0, 7.5)],
      [35, vec(0, 5)],
    ];
    for (const [distance, point] of expected) {
      expect(dist(m.pointAtDistance(distance), point)).toBeLessThan(1e-9);
    }
  });

  it('spaces points evenly around a multi-segment outline of lines and arcs', () => {
    // The product's headline feature in miniature: a 105 x 75 card-holder
    // outline with 8 mm corners, stitched at a 3.85 mm iron pitch. Every gap
    // must be the same, and every hole must sit on the outline.
    const w = 105;
    const h = 75;
    const r = 8;
    const outline = P.closed([
      line(vec(r, 0), vec(w - r, 0)),
      arc(vec(w - r, r), r, -Math.PI / 2, Math.PI / 2),
      line(vec(w, r), vec(w, h - r)),
      arc(vec(w - r, h - r), r, 0, Math.PI / 2),
      line(vec(w - r, h), vec(r, h)),
      arc(vec(r, h - r), r, Math.PI / 2, Math.PI / 2),
      line(vec(0, h - r), vec(0, r)),
      arc(vec(r, r), r, Math.PI, Math.PI / 2),
    ]);

    const m = new P.PathMeasure(outline);
    const total = m.totalLength();
    const count = Math.round(total / 3.85);
    const pitch = total / count;
    const holes = Array.from({ length: count }, (_, i) => m.pointAtDistance(pitch * i));

    for (const hole of holes) {
      expect(P.isPointOnPath(outline, hole, 0.001)).toBe(true);
    }

    const chords = holes.map((p, i) => dist(p, holes[(i + 1) % holes.length]!));
    // Chords run a little under the pitch on the curved corners, never over.
    expect(Math.min(...chords)).toBeGreaterThan(pitch * 0.98);
    expect(Math.max(...chords)).toBeLessThanOrEqual(pitch + 1e-9);
  });

  it('lands exactly on each corner of a square', () => {
    const m = new P.PathMeasure(square);
    for (const [distance, expected] of [
      [0, vec(0, 0)],
      [10, vec(10, 0)],
      [20, vec(10, 10)],
      [30, vec(0, 10)],
    ] as const) {
      expect(dist(m.pointAtDistance(distance), expected)).toBeLessThan(1e-9);
    }
  });

  it('agrees with the path for a straight polyline', () => {
    fc.assert(
      fc.property(fc.array(arbVec2, { minLength: 2, maxLength: 8 }), (points) => {
        const p = P.polyline(points, false);
        if (P.length(p) < 1) return true;
        const m = new P.PathMeasure(p);
        return closeTo(m.totalLength(), P.length(p), 1e-6);
      }),
    );
  });
});

describe('tangentAtDistance', () => {
  it('is a unit vector along the path', () => {
    const m = new P.PathMeasure(wiggle);
    const total = m.totalLength();
    for (let i = 0; i <= 20; i++) {
      expect(closeTo(len(m.tangentAtDistance((total * i) / 20)), 1, 1e-6)).toBe(true);
    }
  });

  it('points the way a circle is travelled', () => {
    const m = new P.PathMeasure(circle);
    // At the rightmost point of a counter-clockwise circle, travel is +Y.
    const tangent = m.tangentAtDistance(0);
    expect(closeTo(tangent.x, 0, 1e-6)).toBe(true);
    expect(closeTo(tangent.y, 1, 1e-6)).toBe(true);
  });

  it('approximates the finite difference of position', () => {
    const m = new P.PathMeasure(wiggle);
    const total = m.totalLength();
    const d = total / 2;
    const h = 1e-4;
    const numeric = {
      x: (m.pointAtDistance(d + h).x - m.pointAtDistance(d - h).x) / (2 * h),
      y: (m.pointAtDistance(d + h).y - m.pointAtDistance(d - h).y) / (2 * h),
    };
    const analytic = m.tangentAtDistance(d);
    expect(dist(numeric, analytic)).toBeLessThan(1e-3);
  });
});

describe('normalAtDistance', () => {
  it('is perpendicular to the tangent and unit length', () => {
    const m = new P.PathMeasure(wiggle);
    const total = m.totalLength();
    for (let i = 1; i < 20; i++) {
      const d = (total * i) / 20;
      const t = m.tangentAtDistance(d);
      const n = m.normalAtDistance(d);
      expect(closeTo(len(n), 1, 1e-6)).toBe(true);
      expect(closeTo(t.x * n.x + t.y * n.y, 0, 1e-6)).toBe(true);
    }
  });

  it('points left of travel, matching the offset sign convention', () => {
    // Counter-clockwise circle: travelling +Y at the rightmost point, so the
    // left-hand normal points back toward the centre, in −X.
    const n = new P.PathMeasure(circle).normalAtDistance(0);
    expect(closeTo(n.x, -1, 1e-6)).toBe(true);
    expect(closeTo(n.y, 0, 1e-6)).toBe(true);
  });
});

describe('locate', () => {
  it('reports the segment a distance falls in', () => {
    const m = new P.PathMeasure(square);
    expect(m.locate(5).segmentIndex).toBe(0);
    expect(m.locate(15).segmentIndex).toBe(1);
    expect(m.locate(25).segmentIndex).toBe(2);
  });

  it('handles an empty path without throwing', () => {
    const m = new P.PathMeasure(P.polyline([], false));
    expect(m.totalLength()).toBe(0);
    expect(m.locate(5).distance).toBe(0);
  });

  it('handles a zero-length path', () => {
    const m = new P.PathMeasure(P.open([line(vec(2, 2), vec(2, 2))]));
    expect(m.totalLength()).toBe(0);
    expect(dist(m.pointAtDistance(1), vec(2, 2))).toBeLessThan(1e-9);
  });
});
