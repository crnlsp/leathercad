import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbVec2 } from '../test/arbitraries.js';
import { area, flattenPath, isPointOnPath, signedArea } from './path/index.js';
import { arcThroughPoints, ellipse, line as lineShape, regularPolygon } from './shapes.js';
import { cross, dist, sub, vec } from './vec2.js';

const RUNS = { numRuns: 300 };

describe('line', () => {
  it('is an open path of one segment', () => {
    const p = lineShape(vec(0, 0), vec(100, 50));

    expect(p.closed).toBe(false);
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]?.kind).toBe('line');
  });

  it('rejects a zero-length line', () => {
    expect(() => lineShape(vec(5, 5), vec(5, 5))).toThrow();
  });
});

describe('ellipse', () => {
  it('encloses π·rx·ry', () => {
    expect(area(ellipse(vec(0, 0), 40, 25, 0))).toBeCloseTo(Math.PI * 40 * 25, 0);
  });

  it('matches a circle when the radii are equal', () => {
    expect(area(ellipse(vec(10, -5), 30, 30, 0))).toBeCloseTo(Math.PI * 900, 0);
  });

  it('rotates without changing area', () => {
    const upright = area(ellipse(vec(0, 0), 50, 20, 0));
    const tilted = area(ellipse(vec(0, 0), 50, 20, Math.PI / 5));

    expect(tilted).toBeCloseTo(upright, 6);
  });

  it('puts an unrotated ellipse in the box its radii describe', () => {
    const points = flattenPath(ellipse(vec(10, 20), 40, 25, 0), 0.001);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    expect(Math.min(...xs)).toBeCloseTo(-30, 2);
    expect(Math.max(...xs)).toBeCloseTo(50, 2);
    expect(Math.min(...ys)).toBeCloseTo(-5, 2);
    expect(Math.max(...ys)).toBeCloseTo(45, 2);
  });

  it('is closed and counter-clockwise', () => {
    const e = ellipse(vec(0, 0), 30, 10, 0);

    expect(e.closed).toBe(true);
    expect(signedArea(e)).toBeGreaterThan(0);
  });

  it('rejects a non-positive radius', () => {
    expect(() => ellipse(vec(0, 0), 0, 10, 0)).toThrow(RangeError);
    expect(() => ellipse(vec(0, 0), 10, -1, 0)).toThrow(RangeError);
  });

  it('rejects a non-finite radius', () => {
    expect(() => ellipse(vec(0, 0), Number.NaN, 10, 0)).toThrow(RangeError);
  });

  it('holds its accuracy at leatherwork sizes', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.double({ min: 1, max: 500, noNaN: true }),
        (rx, ry) => {
          // The contract is a radial deviation budget of EXPORT_TOLERANCE_MM,
          // not an area one, so the area error it implies grows with neither
          // radius nor eccentricity: it stays a fixed *relative* size. A fixed
          // four-Bézier approximation would drift with radius and fail here.
          const relative =
            Math.abs(area(ellipse(vec(0, 0), rx, ry, 0)) - Math.PI * rx * ry) / (Math.PI * rx * ry);
          expect(relative).toBeLessThan(1e-3);
        },
      ),
      RUNS,
    );
  });
});

describe('arcThroughPoints', () => {
  it('finds the arc through three points on a known circle', () => {
    // Three points on the unit-ish circle of radius 50 about the origin.
    const p = arcThroughPoints(vec(50, 0), vec(0, 50), vec(-50, 0));
    const seg = p.segments[0];

    expect(seg?.kind).toBe('arc');
    if (seg?.kind === 'arc') {
      expect(seg.centre.x).toBeCloseTo(0, 6);
      expect(seg.centre.y).toBeCloseTo(0, 6);
      expect(seg.radius).toBeCloseTo(50, 6);
    }
  });

  it('passes through the middle point', () => {
    // On the path, not merely near a flattened vertex of it: at a 0.001 mm
    // flattening tolerance the vertices are still up to 0.6 mm apart, so
    // measuring to the nearest one tests the flattener, not the arc.
    const p = arcThroughPoints(vec(0, 0), vec(30, 40), vec(80, 10));

    expect(isPointOnPath(p, vec(30, 40), 1e-6)).toBe(true);
  });

  it('falls back to a straight line when the points are collinear', () => {
    const p = arcThroughPoints(vec(0, 0), vec(50, 0), vec(100, 0));

    // A circle through collinear points has infinite radius. A line is the
    // honest answer, not an arc with an absurd centre.
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]?.kind).toBe('line');
  });

  it('keeps the endpoints when collinear points put b outside the span', () => {
    // fast-check found this: a = (2,0), b = (0,0), c = (105,0). No path from
    // a to c passes through b without doubling back, so the endpoints win and
    // b is dropped. The alternative — spanning the extremes — would silently
    // return a path that does not start where the caller asked.
    const p = arcThroughPoints(vec(2, 0), vec(0, 0), vec(105, 0));

    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]?.kind).toBe('line');
    expect(isPointOnPath(p, vec(0, 0), 1e-6)).toBe(false);
  });

  it('rejects coincident points', () => {
    expect(() => arcThroughPoints(vec(0, 0), vec(0, 0), vec(10, 10))).toThrow();
  });

  it('always reaches all three points', () => {
    fc.assert(
      fc.property(arbVec2, arbVec2, arbVec2, (a, b, c) => {
        // A real triangle: collinear triples fall back to a line and are
        // covered by their own tests above, where b may legitimately be
        // dropped.
        fc.pre(dist(a, b) > 1 && dist(b, c) > 1 && dist(a, c) > 1);
        fc.pre(Math.abs(cross(sub(b, a), sub(c, a))) > 1);

        const p = arcThroughPoints(a, b, c);
        for (const target of [a, b, c]) {
          expect(isPointOnPath(p, target, 1e-6)).toBe(true);
        }
      }),
      RUNS,
    );
  });
});

describe('regularPolygon', () => {
  it('makes a square from four sides', () => {
    // A square inscribed in a circle of radius r has area 2r².
    expect(area(regularPolygon(vec(0, 0), 50, 4, 0))).toBeCloseTo(2 * 2500, 6);
  });

  it('makes a hexagon from six', () => {
    expect(area(regularPolygon(vec(0, 0), 10, 6, 0))).toBeCloseTo(
      ((3 * Math.sqrt(3)) / 2) * 100,
      6,
    );
  });

  it('is closed and counter-clockwise', () => {
    const p = regularPolygon(vec(3, 4), 20, 5, 0.3);

    expect(p.closed).toBe(true);
    expect(signedArea(p)).toBeGreaterThan(0);
  });

  it('rejects fewer than three sides', () => {
    expect(() => regularPolygon(vec(0, 0), 10, 2, 0)).toThrow(RangeError);
  });

  it('rejects a fractional side count', () => {
    expect(() => regularPolygon(vec(0, 0), 10, 5.5, 0)).toThrow(RangeError);
  });

  it('puts every vertex on the circumscribing circle', () => {
    fc.assert(
      fc.property(
        arbVec2,
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.integer({ min: 3, max: 24 }),
        fc.double({ min: 0, max: Math.PI * 2, noNaN: true }),
        (centre, r, n, rotation) => {
          const p = regularPolygon(centre, r, n, rotation);

          expect(p.segments).toHaveLength(n);
          for (const v of flattenPath(p, 0.001)) {
            expect(dist(v, centre)).toBeCloseTo(r, 6);
          }
          // area = (n/2)·r²·sin(2π/n)
          expect(area(p)).toBeCloseTo((n / 2) * r * r * Math.sin((2 * Math.PI) / n), 4);
        },
      ),
      RUNS,
    );
  });
});
