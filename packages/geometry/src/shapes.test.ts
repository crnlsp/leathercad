import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as P from './path/index.js';
import {
  circle,
  cornerRoom,
  fittedRadii,
  rect,
  roundedRect,
  uniformRadii,
  type CornerRadii,
} from './shapes.js';
import { vec } from './vec2.js';

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

const size = fc.double({ min: 1, max: 500, noNaN: true });

describe('rect', () => {
  it('has the requested dimensions', () => {
    const box = P.bbox(rect(vec(10, 20), 105, 75))!;
    expect(closeTo(box.maxX - box.minX, 105)).toBe(true);
    expect(closeTo(box.maxY - box.minY, 75)).toBe(true);
  });

  it('is closed, counter-clockwise and valid', () => {
    const r = rect(vec(0, 0), 10, 5);
    expect(r.closed).toBe(true);
    expect(P.isValid(r)).toBe(true);
    expect(P.orientation(r)).toBe('ccw');
  });

  it('has the exact perimeter and area', () => {
    fc.assert(
      fc.property(size, size, (w, h) => {
        const r = rect(vec(0, 0), w, h);
        return closeTo(P.length(r), 2 * (w + h), 1e-6) && closeTo(P.area(r), w * h, 1e-6);
      }),
    );
  });
});

describe('roundedRect', () => {
  it('keeps the overall dimensions regardless of corner radius', () => {
    // The corners round inward; the bounding box must not shrink.
    const box = P.bbox(roundedRect(vec(0, 0), 105, 75, 8))!;
    expect(closeTo(box.maxX - box.minX, 105)).toBe(true);
    expect(closeTo(box.maxY - box.minY, 75)).toBe(true);
  });

  it('has the analytic perimeter', () => {
    // Four straights shortened by 2r each, plus four quarter-arcs making one
    // full circle of radius r.
    fc.assert(
      fc.property(size, size, fc.double({ min: 0, max: 20, noNaN: true }), (w, h, r) => {
        const radius = Math.min(r, w / 2, h / 2);
        const shape = roundedRect(vec(0, 0), w, h, radius);
        const expected = 2 * (w - 2 * radius) + 2 * (h - 2 * radius) + 2 * Math.PI * radius;
        return closeTo(P.length(shape), expected, 1e-6);
      }),
    );
  });

  it('has the analytic area', () => {
    // A full rectangle less the four corner offcuts: (4 - pi)r^2.
    fc.assert(
      fc.property(size, size, fc.double({ min: 0, max: 20, noNaN: true }), (w, h, r) => {
        const radius = Math.min(r, w / 2, h / 2);
        const shape = roundedRect(vec(0, 0), w, h, radius);
        const expected = w * h - (4 - Math.PI) * radius * radius;
        return closeTo(P.area(shape), expected, 1e-6);
      }),
    );
  });

  it('emits no arc for a zero radius, so a square corner is genuinely square', () => {
    const shape = roundedRect(vec(0, 0), 10, 5, 0);
    expect(shape.segments.every((s) => s.kind === 'line')).toBe(true);
    expect(shape.segments).toHaveLength(4);
  });

  it('supports independent corners', () => {
    const shape = roundedRect(vec(0, 0), 100, 60, {
      bottomLeft: 0,
      bottomRight: 10,
      topRight: 20,
      topLeft: 5,
    });
    expect(P.isValid(shape)).toBe(true);
    // Three arcs, because the square corner emits none.
    expect(shape.segments.filter((s) => s.kind === 'arc')).toHaveLength(3);
  });

  it('clamps radii that would make adjacent corners overlap', () => {
    // Asking for 40 mm corners on a 50 mm edge is not satisfiable; the shape
    // must still be valid rather than self-intersecting.
    const shape = roundedRect(vec(0, 0), 50, 50, 40);
    expect(P.isValid(shape)).toBe(true);
    expect(P.orientation(shape)).toBe('ccw');
    const box = P.bbox(shape)!;
    expect(closeTo(box.maxX - box.minX, 50)).toBe(true);
  });

  it('degenerates to a circle when radii fill the square', () => {
    const shape = roundedRect(vec(0, 0), 50, 50, 25);
    expect(closeTo(P.area(shape), Math.PI * 25 * 25, 1e-6)).toBe(true);
  });

  it('scales competing corners together rather than clamping each alone', () => {
    // Independent clamping would silently turn an asymmetric design
    // symmetric; proportional scaling keeps the intent visible.
    const shape = roundedRect(vec(0, 0), 30, 100, {
      bottomLeft: 10,
      bottomRight: 20,
      topRight: 0,
      topLeft: 0,
    });
    const arcs = shape.segments.filter((s) => s.kind === 'arc');
    const radii = arcs.map((s) => (s.kind === 'arc' ? s.radius : 0)).sort((a, b) => a - b);
    expect(radii).toHaveLength(2);
    // Original ratio was 1:2 and must survive the clamp.
    expect(closeTo((radii[1] ?? 0) / (radii[0] ?? 1), 2, 1e-9)).toBe(true);
    expect(closeTo((radii[0] ?? 0) + (radii[1] ?? 0), 30, 1e-9)).toBe(true);
  });

  it('is always valid and counter-clockwise', () => {
    fc.assert(
      fc.property(size, size, fc.double({ min: 0, max: 300, noNaN: true }), (w, h, r) => {
        const shape = roundedRect(vec(0, 0), w, h, r);
        return P.isValid(shape, 1e-6) && P.orientation(shape) !== 'cw';
      }),
    );
  });

  it('handles a negative size by normalising it', () => {
    const box = P.bbox(roundedRect(vec(10, 10), -10, -5, 1))!;
    expect(closeTo(box.minX, 0)).toBe(true);
    expect(closeTo(box.maxY, 10)).toBe(true);
  });
});

describe('circle', () => {
  it('has the analytic circumference and area', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 500, noNaN: true }), (r) => {
        const c = circle(vec(3, -4), r);
        return (
          closeTo(P.length(c), 2 * Math.PI * r, 1e-6) && closeTo(P.area(c), Math.PI * r * r, 1e-6)
        );
      }),
    );
  });

  it('contains its own centre and excludes a point outside', () => {
    const c = circle(vec(0, 0), 10);
    expect(P.containsPoint(c, vec(0, 0))).toBe(true);
    expect(P.containsPoint(c, vec(11, 0))).toBe(false);
  });

  it('is counter-clockwise', () => {
    expect(P.orientation(circle(vec(0, 0), 5))).toBe('ccw');
  });
});

describe('uniformRadii', () => {
  it('sets all four corners', () => {
    expect(uniformRadii(3)).toEqual({ bottomLeft: 3, bottomRight: 3, topRight: 3, topLeft: 3 });
  });
});

const CORNERS = ['bottomLeft', 'bottomRight', 'topRight', 'topLeft'] as const;
type Corner = (typeof CORNERS)[number];

/** `radii` with `corners` set to `radius`. */
const withCorners = (radii: CornerRadii, corners: readonly Corner[], radius: number): CornerRadii =>
  Object.fromEntries(
    CORNERS.map((corner) => [corner, corners.includes(corner) ? radius : radii[corner]]),
  ) as unknown as CornerRadii;

const sameRadii = (a: CornerRadii, b: CornerRadii, eps = 1e-9): boolean =>
  CORNERS.every((corner) => closeTo(a[corner], b[corner], eps));

/**
 * A rectangle, radii whose every pair fits beside each other on every side —
 * none more than half the shorter side — and some corners to set.
 */
const fitting = fc.tuple(size, size).chain(([w, h]) =>
  fc.tuple(
    fc.constant(w),
    fc.constant(h),
    fc.record({
      bottomLeft: fc.double({ min: 0, max: Math.min(w, h) / 2, noNaN: true }),
      bottomRight: fc.double({ min: 0, max: Math.min(w, h) / 2, noNaN: true }),
      topRight: fc.double({ min: 0, max: Math.min(w, h) / 2, noNaN: true }),
      topLeft: fc.double({ min: 0, max: Math.min(w, h) / 2, noNaN: true }),
    }),
    fc.subarray([...CORNERS], { minLength: 1 }),
  ),
);

describe('fittedRadii', () => {
  it('leaves radii that fit as they are', () => {
    fc.assert(fc.property(fitting, ([w, h, radii]) => sameRadii(fittedRadii(radii, w, h), radii)));
  });

  it('shrinks every corner by one factor when two would overlap: 40 on 80 × 60 draws 30', () => {
    expect(fittedRadii(uniformRadii(40), 80, 60)).toEqual(uniformRadii(30));
    const kept = fittedRadii({ bottomLeft: 10, bottomRight: 20, topRight: 0, topLeft: 0 }, 30, 100);
    expect(closeTo(kept.bottomRight / kept.bottomLeft, 2)).toBe(true);
  });

  it('is what roundedRect draws', () => {
    fc.assert(
      fc.property(
        size,
        size,
        fc.record({
          bottomLeft: fc.double({ min: 0, max: 300, noNaN: true }),
          bottomRight: fc.double({ min: 0, max: 300, noNaN: true }),
          topRight: fc.double({ min: 0, max: 300, noNaN: true }),
          topLeft: fc.double({ min: 0, max: 300, noNaN: true }),
        }),
        (w, h, radii) => {
          const drawn = roundedRect(vec(0, 0), w, h, radii)
            .segments.flatMap((s) => (s.kind === 'arc' ? [s.radius] : []))
            .sort((a, b) => a - b);
          const fitted = CORNERS.map((c) => fittedRadii(radii, w, h)[c])
            .filter((r) => r > 0)
            .sort((a, b) => a - b);
          return drawn.length === fitted.length && drawn.every((r, i) => closeTo(r, fitted[i]!));
        },
      ),
    );
  });

  it('reads a negative radius as a square corner, as roundedRect does', () => {
    expect(fittedRadii({ ...uniformRadii(5), topLeft: -3 }, 50, 50).topLeft).toBe(0);
  });

  it('refuses a size or a radius that is not a number', () => {
    expect(() => fittedRadii(uniformRadii(5), Number.NaN, 50)).toThrow();
    expect(() => fittedRadii({ ...uniformRadii(5), topLeft: Number.NaN }, 50, 50)).toThrow();
    expect(() => fittedRadii(uniformRadii(Number.POSITIVE_INFINITY), 50, 50)).toThrow();
  });

  it('squares every corner of a rectangle with no width', () => {
    expect(fittedRadii(uniformRadii(5), 0, 50)).toEqual(uniformRadii(0));
  });
});

describe('cornerRoom', () => {
  it('gives all four corners of 80 × 60 half the height: 30', () => {
    expect(cornerRoom(80, 60, uniformRadii(4), CORNERS)).toEqual({
      radiusMm: 30,
      side: 'height',
      shared: true,
    });
    expect(cornerRoom(60, 80, uniformRadii(4), CORNERS)).toMatchObject({ side: 'width' });
  });

  it('gives one corner what the corners beside it leave', () => {
    // Bottom-right shares the foot with bottom-left (10) and the right side
    // with top-right (5): 80 − 10 = 70 along the foot, 60 − 5 = 55 up the side.
    const radii = { bottomLeft: 10, bottomRight: 4, topRight: 5, topLeft: 0 };
    expect(cornerRoom(80, 60, radii, ['bottomRight'])).toEqual({
      radiusMm: 55,
      side: 'height',
      shared: false,
    });
  });

  it('reads a negative size as roundedRect does', () => {
    expect(cornerRoom(-80, -60, uniformRadii(0), CORNERS)).toEqual(
      cornerRoom(80, 60, uniformRadii(0), CORNERS),
    );
  });

  it('is the tightest side exactly, not the first within a tolerance of it', () => {
    // Found by the property below: two sides a nanometre apart. Reporting
    // the first side's room offered a radius 1e-9 mm too large to be drawn.
    const radii = { bottomLeft: 0, bottomRight: 1e-9, topRight: 0, topLeft: 0 };
    const room = cornerRoom(28.593, 2.033, radii, ['topRight', 'topLeft']);
    expect(room.radiusMm).toBe(2.033 - 1e-9);
    expect(room.side).toBe('height');
  });

  it('has no room on a rectangle with no width', () => {
    expect(cornerRoom(0, 60, uniformRadii(0), ['topRight'])).toEqual({
      radiusMm: 0,
      side: 'width',
      shared: false,
    });
  });

  it('is never negative: a corner beside one taking the whole side has no room', () => {
    const radii = { bottomLeft: 0, bottomRight: 0, topRight: 70, topLeft: 0 };
    expect(cornerRoom(80, 60, radii, ['bottomRight']).radiusMm).toBe(0);
  });

  it('refuses no corners, and a size or radius that is not a number', () => {
    expect(() => cornerRoom(80, 60, uniformRadii(4), [])).toThrow(RangeError);
    expect(() => cornerRoom(Number.NaN, 60, uniformRadii(4), CORNERS)).toThrow();
    expect(() => cornerRoom(80, 60, uniformRadii(Number.POSITIVE_INFINITY), CORNERS)).toThrow();
  });

  it('always fits: the room is drawn exactly as asked', () => {
    fc.assert(
      fc.property(fitting, ([w, h, radii, corners]) => {
        const { radiusMm } = cornerRoom(w, h, radii, corners);
        const asked = withCorners(radii, corners, radiusMm);
        return sameRadii(fittedRadii(asked, w, h), asked, 1e-9);
      }),
    );
  });

  it('is the most that fits: anything more is drawn smaller', () => {
    fc.assert(
      fc.property(
        fitting,
        fc.double({ min: 1e-3, max: 100, noNaN: true }),
        ([w, h, radii, corners], more) => {
          const { radiusMm } = cornerRoom(w, h, radii, corners);
          const asked = withCorners(radii, corners, radiusMm + more);
          const drawn = fittedRadii(asked, w, h);
          return corners.every((corner) => drawn[corner] < asked[corner]);
        },
      ),
    );
  });

  it('leaves any radius within the room as it is asked', () => {
    fc.assert(
      fc.property(
        fitting,
        fc.double({ min: 0, max: 1, noNaN: true }),
        ([w, h, radii, corners], t) => {
          const radius = t * cornerRoom(w, h, radii, corners).radiusMm;
          const asked = withCorners(radii, corners, radius);
          return sameRadii(fittedRadii(asked, w, h), asked);
        },
      ),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(fitting, ([w, h, radii, corners]) => {
        const a = cornerRoom(w, h, radii, corners);
        const b = cornerRoom(w, h, radii, corners);
        return Object.is(a.radiusMm, b.radiusMm) && a.side === b.side && a.shared === b.shared;
      }),
    );
  });
});
