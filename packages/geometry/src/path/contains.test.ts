import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { circle } from '../shapes.js';
import { vec } from '../vec2.js';

import { arc, line, pointAt } from '../segment/index.js';

import { closestPointOnPath, distanceToPath, isPointOnPath } from './contains.js';
import { path, polyline } from './path.js';

describe('distanceToPath', () => {
  const square = polyline([vec(0, 0), vec(100, 0), vec(100, 60), vec(0, 60)], true);

  it('measures to the nearest edge, from inside', () => {
    // 10 mm from the left edge, 30 from the bottom: the left edge wins.
    expect(distanceToPath(square, vec(10, 30))).toBeCloseTo(10, 9);
  });

  it('measures the same from outside — an edge has no sides', () => {
    expect(distanceToPath(square, vec(-4, 30))).toBeCloseTo(4, 9);
  });

  it('is zero on the line itself', () => {
    expect(distanceToPath(square, vec(50, 0))).toBeCloseTo(0, 9);
  });

  it('measures to a corner when no edge is nearer', () => {
    expect(distanceToPath(square, vec(-3, -4))).toBeCloseTo(5, 9);
  });

  it('measures to an arc by its radius, not to its chord', () => {
    const ring = circle(vec(0, 0), 20);
    expect(distanceToPath(ring, vec(0, 0))).toBeCloseTo(20, 9);
    expect(distanceToPath(ring, vec(25, 0))).toBeCloseTo(5, 9);
  });

  it('is infinite for a path with no segments', () => {
    expect(distanceToPath({ segments: [], closed: false }, vec(0, 0))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('never disagrees with the hit test that shares its maths', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 150, noNaN: true }),
        fc.double({ min: -50, max: 110, noNaN: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        (x, y, tolerance) => {
          const point = vec(x, y);
          return (
            isPointOnPath(square, point, tolerance) === distanceToPath(square, point) <= tolerance
          );
        },
      ),
    );
  });
});

describe('closestPointOnPath', () => {
  const square = polyline([vec(0, 0), vec(100, 0), vec(100, 60), vec(0, 60)], true);

  it('says which side is nearest, and how far along it', () => {
    const near = closestPointOnPath(square, vec(25, -3))!;

    expect(near.segmentIndex).toBe(0);
    expect(near.t).toBeCloseTo(0.25, 12);
    expect(near.point).toEqual(vec(25, 0));
    expect(near.distance).toBeCloseTo(3, 12);
  });

  it('finds the nearest place on an arc', () => {
    const ring = circle(vec(0, 0), 10);
    const near = closestPointOnPath(ring, vec(0, 20))!;

    expect(near.point.x).toBeCloseTo(0, 9);
    expect(near.point.y).toBeCloseTo(10, 9);
    expect(near.distance).toBeCloseTo(10, 9);
  });

  it('regression: a line shorter than EPS_POINT still has two ends (issue 27)', () => {
    // The nightly run shrank to these twice. Taking a line that short as only
    // its start put the answer a nanometre from its other end, where the
    // point is.
    for (const [start, end] of [
      [vec(1.0000000000000003e-9, 0), vec(0, 0)],
      [vec(0, -1.4142358395474732e-9), vec(0, 0)],
    ] as const) {
      const near = closestPointOnPath(path([line(start, end)], false), vec(0, 0))!;

      expect(near.t).toBe(1);
      expect(near.distance).toBeCloseTo(0, 15);
    }
  });

  it('regression: a point a hair from the centre of a circle is a radius away', () => {
    // fast-check shrank to this: 6e-10 mm off the centre. Treating that as
    // "the centre" and answering with the arc's start put the distance off by
    // the same hair, and it disagreed with distanceToPath.
    const ring = path(
      [
        arc(
          vec(4.1421266416818986e-10, -4.1421266416818986e-10),
          28.736282657955208,
          0,
          2 * Math.PI,
        ),
      ],
      true,
    );
    const near = closestPointOnPath(ring, vec(0, 0))!;

    // The radius, less the hair the point is off the centre.
    const hair = Math.hypot(4.1421266416818986e-10, 4.1421266416818986e-10);
    expect(near.distance).toBeCloseTo(28.736282657955208 - hair, 12);
    expect(near.distance).toBeCloseTo(distanceToPath(ring, vec(0, 0)), 12);
  });

  it('answers a side of no length with its one point', () => {
    const dot = path([line(vec(5, 5), vec(5, 5)), line(vec(5, 5), vec(15, 5))]);
    const near = closestPointOnPath(dot, vec(5, 9))!;

    expect(near.segmentIndex).toBe(0);
    expect(near.t).toBe(0);
    expect(near.point).toEqual(vec(5, 5));
  });

  it('has nowhere to be on an empty path', () => {
    expect(closestPointOnPath(polyline([]), vec(1, 1))).toBeNull();
  });

  it('is on the path, at the path distance, and no further than any point of it', () => {
    const arbShape = fc.oneof(
      fc
        .array(
          fc.record({
            x: fc.double({ min: -200, max: 200, noNaN: true }),
            y: fc.double({ min: -200, max: 200, noNaN: true }),
          }),
          { minLength: 2, maxLength: 6 },
        )
        .map((points) => polyline(points, points.length > 2)),
      fc
        .tuple(
          fc.double({ min: -50, max: 50, noNaN: true }),
          fc.double({ min: 0.5, max: 80, noNaN: true }),
        )
        .map(([c, r]) => circle(vec(c, -c), r)),
    );
    const arbPoint = fc.record({
      x: fc.double({ min: -300, max: 300, noNaN: true }),
      y: fc.double({ min: -300, max: 300, noNaN: true }),
    });

    fc.assert(
      fc.property(arbShape, arbPoint, (shape, point) => {
        const near = closestPointOnPath(shape, point);
        if (shape.segments.length === 0) {
          expect(near).toBeNull();
          return;
        }
        expect(near).not.toBeNull();
        const segment = shape.segments[near!.segmentIndex]!;
        const on = pointAt(segment, near!.t);

        expect(near!.t).toBeGreaterThanOrEqual(0);
        expect(near!.t).toBeLessThanOrEqual(1);
        expect(Math.hypot(on.x - near!.point.x, on.y - near!.point.y)).toBeLessThan(1e-9);
        expect(near!.distance).toBeCloseTo(distanceToPath(shape, point), 9);
        // No sampled point of the path is nearer.
        for (const s of shape.segments) {
          for (let i = 0; i <= 16; i++) {
            const q = pointAt(s, i / 16);
            expect(Math.hypot(q.x - point.x, q.y - point.y)).toBeGreaterThanOrEqual(
              near!.distance - 1e-9,
            );
          }
        }
      }),
    );
  });

  it('rejects a point that is not a number', () => {
    expect(() => closestPointOnPath(square, vec(Number.NaN, 0))).toThrow(RangeError);
  });
});
