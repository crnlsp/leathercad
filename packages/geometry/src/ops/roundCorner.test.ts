import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { isValid, path, polyline, vertices, type Path } from '../path/index.js';
import { arc, line, tangentAt } from '../segment/index.js';
import { cross, dist, vec, type Vec2 } from '../vec2.js';

import { roundPathVertex, sharpenPathArc } from './editPath.js';

/** A 100 × 50 rectangle, anticlockwise from the origin. */
const box = polyline([vec(0, 0), vec(100, 0), vec(100, 50), vec(0, 50)], true);

const close = (a: Vec2, b: Vec2, eps = 1e-9): boolean => dist(a, b) < eps;

describe('roundPathVertex', () => {
  it('rounds a right-angled corner into a quarter circle tangent to both sides', () => {
    const edit = roundPathVertex(box, 1, 10)!;

    expect(edit.path.segments.map((s) => s.kind)).toEqual(['line', 'arc', 'line', 'line', 'line']);
    const [a, b] = [vertices(edit.path)[1]!, vertices(edit.path)[2]!];
    expect(close(a, vec(90, 0))).toBe(true);
    expect(close(b, vec(100, 10))).toBe(true);

    const rounding = edit.path.segments[1]!;
    expect(rounding.kind === 'arc' && rounding.radius).toBeCloseTo(10, 12);
    expect(rounding.kind === 'arc' && rounding.sweepAngle).toBeCloseTo(Math.PI / 2, 12);

    expect(edit.vertexMap).toEqual([0, null, 3, 4]);
    expect(edit.segmentMap).toEqual([0, 2, 3, 4]);
    expect(edit.reshaped).toEqual({ kind: 'rounded', fromVertex: 1, toSegment: 1 });
  });

  it('rounds the start of a closed path, putting the rounding last', () => {
    const edit = roundPathVertex(box, 0, 10)!;

    expect(isValid(edit.path)).toBe(true);
    expect(edit.path.segments.map((s) => s.kind)).toEqual(['line', 'line', 'line', 'line', 'arc']);
    expect(close(vertices(edit.path)[0]!, vec(10, 0))).toBe(true);
    expect(close(vertices(edit.path)[4]!, vec(0, 10))).toBe(true);
    expect(edit.vertexMap).toEqual([null, 1, 2, 3]);
    expect(edit.reshaped).toEqual({ kind: 'rounded', fromVertex: 0, toSegment: 4 });
  });

  it('refuses a rounding that does not fit, and anything that is not a corner of two straights', () => {
    // A 50 mm side has no room for the 60 mm a 60 mm rounding of a right angle takes.
    expect(roundPathVertex(box, 1, 60)).toBeNull();
    // Exactly the side's length would leave a side of nothing.
    expect(roundPathVertex(box, 1, 50)).toBeNull();
    expect(roundPathVertex(box, 1, 0)).toBeNull();
    expect(roundPathVertex(box, 1, -3)).toBeNull();
    expect(roundPathVertex(box, 7, 3)).toBeNull();

    // A point along a straight side is no corner.
    const five = polyline([vec(0, 0), vec(50, 0), vec(100, 0), vec(100, 50), vec(0, 50)], true);
    expect(roundPathVertex(five, 1, 3)).toBeNull();

    // An open path's ends have one side each.
    const run = polyline([vec(0, 0), vec(10, 0), vec(10, 10)]);
    expect(roundPathVertex(run, 0, 1)).toBeNull();
    expect(roundPathVertex(run, 1, 1)).not.toBeNull();

    // A corner beside an arc is left to a later curve editor.
    const d = path([line(vec(0, 20), vec(0, 0)), arc(vec(0, 10), 10, -Math.PI / 2, Math.PI)], true);
    expect(roundPathVertex(d, 0, 1)).toBeNull();

    expect(() => roundPathVertex(box, 1, Number.NaN)).toThrow(RangeError);
  });

  const arbPolygon: fc.Arbitrary<Path> = fc
    .array(
      fc.record({ x: fc.integer({ min: -60, max: 60 }), y: fc.integer({ min: -60, max: 60 }) }),
      {
        minLength: 3,
        maxLength: 7,
      },
    )
    .map((points) => polyline(points, true))
    .filter((p) => p.segments.every((s) => s.kind === 'line' && dist(s.a, s.b) > 2));

  const arbCase = arbPolygon.chain((p) =>
    fc.record({
      p: fc.constant(p),
      vertex: fc.integer({ min: 0, max: p.segments.length - 1 }),
      radius: fc.double({ min: 0.05, max: 20, noNaN: true }),
    }),
  );

  it('always leaves a valid path, the rounding tangent to both sides at the radius asked', () => {
    fc.assert(
      fc.property(arbCase, ({ p, vertex, radius }) => {
        const edit = roundPathVertex(p, vertex, radius);
        if (edit === null) return;

        expect(isValid(edit.path)).toBe(true);
        expect(edit.path.segments).toHaveLength(p.segments.length + 1);
        const at = edit.reshaped!.kind === 'rounded' ? edit.reshaped!.toSegment : -1;
        const rounding = edit.path.segments[at]!;
        expect(rounding.kind).toBe('arc');
        if (rounding.kind !== 'arc') return;
        expect(rounding.radius).toBeCloseTo(radius, 9);

        // Tangent where it meets each side: no corner left at either end.
        const n = edit.path.segments.length;
        const before = edit.path.segments[(at - 1 + n) % n]!;
        const after = edit.path.segments[(at + 1) % n]!;
        expect(Math.abs(cross(tangentAt(before, 1), tangentAt(rounding, 0)))).toBeLessThan(1e-9);
        expect(Math.abs(cross(tangentAt(rounding, 1), tangentAt(after, 0)))).toBeLessThan(1e-9);

        // Every other point stays exactly where it was.
        const old = vertices(p);
        const now = vertices(edit.path);
        for (const [i, j] of edit.vertexMap.entries()) {
          if (j !== null) expect(close(now[j]!, old[i]!)).toBe(true);
        }
      }),
    );
  });

  it('is undone by sharpening the rounding it made', () => {
    fc.assert(
      fc.property(arbCase, ({ p, vertex, radius }) => {
        const rounded = roundPathVertex(p, vertex, radius);
        if (rounded === null || rounded.reshaped?.kind !== 'rounded') return;

        const sharp = sharpenPathArc(rounded.path, rounded.reshaped.toSegment)!;
        expect(sharp).not.toBeNull();
        expect(sharp.reshaped?.kind).toBe('sharpened');

        // The same points, the corner back where it was — up to where the
        // path starts, which rounding its first point moves.
        const old = vertices(p);
        const now = vertices(sharp.path);
        expect(now).toHaveLength(old.length);
        for (const point of old) {
          expect(now.some((q) => close(q, point, 1e-7))).toBe(true);
        }
      }),
    );
  });
});

describe('sharpenPathArc', () => {
  it('turns a rounded corner back into the point where its sides meet', () => {
    const rounded = roundPathVertex(box, 2, 8)!.path;
    const edit = sharpenPathArc(rounded, 2)!;

    expect(vertices(edit.path)).toHaveLength(4);
    expect(close(vertices(edit.path)[2]!, vec(100, 50), 1e-9)).toBe(true);
    expect(edit.reshaped).toEqual({ kind: 'sharpened', fromSegment: 2, toVertex: 2 });
    expect(edit.segmentMap).toEqual([0, 1, null, 2, 3]);
  });

  it('refuses what is not a rounded corner between two straights', () => {
    expect(sharpenPathArc(box, 1)).toBeNull();
    expect(sharpenPathArc(box, 9)).toBeNull();
    // A stadium's ends are half circles between parallel sides: their sides
    // never meet, so there is no corner to go back to.
    const stadium = path(
      [
        line(vec(0, 0), vec(50, 0)),
        arc(vec(50, 10), 10, -Math.PI / 2, Math.PI),
        line(vec(50, 20), vec(0, 20)),
        arc(vec(0, 10), 10, Math.PI / 2, Math.PI),
      ],
      true,
    );
    expect(sharpenPathArc(stadium, 1)).toBeNull();
  });
});
