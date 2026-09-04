import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as P from './path/index.js';
import { circle, rect, roundedRect, uniformRadii } from './shapes.js';
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
