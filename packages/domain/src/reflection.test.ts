import { isErr, isOk } from '@leathercad/core';
import { MatOps, PathOps, uniformRadii, type Mat2x3, type Path } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { pathForShape } from './evaluate.js';
import type { ParametricShape } from './feature.js';
import { transformShape } from './transformShape.js';

/**
 * Defect D2: reflecting a rectangle kept its origin and changed its rotation,
 * so it stayed where it was with its rounded corners diagonally opposite. The
 * 3.7 round-trip test could not catch it, because a wrong mapping still
 * inverts — so everything here is judged against the one thing that cannot be
 * wrong in the same direction: transforming the evaluated path.
 */

const rect = (
  origin = { x: 0, y: 0 },
  width = 10,
  height = 5,
  rotation = 0,
  radii = uniformRadii(0),
): Extract<ParametricShape, { type: 'rect' }> => ({
  type: 'rect',
  origin,
  width,
  height,
  radii,
  rotation,
});

/** Mirror across the vertical line x = at. */
const mirrorX = (at = 0): Mat2x3 =>
  MatOps.composeAll(
    MatOps.fromTranslation({ x: -at, y: 0 }),
    MatOps.fromScale(-1, 1),
    MatOps.fromTranslation({ x: at, y: 0 }),
  );

/** Mirror across the horizontal line y = at. */
const mirrorY = (at = 0): Mat2x3 =>
  MatOps.composeAll(
    MatOps.fromTranslation({ x: 0, y: -at }),
    MatOps.fromScale(1, -1),
    MatOps.fromTranslation({ x: 0, y: at }),
  );

const transformed = (shape: ParametricShape, m: Mat2x3): Path => {
  const result = transformShape(shape, m);
  if (isErr(result)) throw new Error(`refused: ${result.error.code}`);
  return pathForShape(result.value);
};

/** Every sampled point of one path lies on the other, and the boxes agree. */
function sameCurve(actual: Path, expected: Path, tolerance = 1e-6): boolean {
  const measure = PathOps.measure(expected);
  const total = measure.totalLength();

  for (let i = 0; i < 64; i++) {
    const at = measure.locate((total * i) / 64);
    const segment = expected.segments[at.segmentIndex]!;
    const sampled = segmentPoint(segment, at.t);
    if (!PathOps.isPointOnPath(actual, sampled, tolerance)) return false;
  }
  return true;
}

function segmentPoint(segment: Path['segments'][number], t: number): { x: number; y: number } {
  // Local rather than importing SegmentOps.pointAt, so the comparison stays
  // independent of the code under test's own helpers.
  switch (segment.kind) {
    case 'line':
      return {
        x: segment.a.x + (segment.b.x - segment.a.x) * t,
        y: segment.a.y + (segment.b.y - segment.a.y) * t,
      };
    case 'arc': {
      const angle = segment.startAngle + segment.sweepAngle * t;
      return {
        x: segment.centre.x + segment.radius * Math.cos(angle),
        y: segment.centre.y + segment.radius * Math.sin(angle),
      };
    }
    case 'cubic': {
      const u = 1 - t;
      return {
        x:
          u * u * u * segment.p0.x +
          3 * u * u * t * segment.p1.x +
          3 * u * t * t * segment.p2.x +
          t * t * t * segment.p3.x,
        y:
          u * u * u * segment.p0.y +
          3 * u * u * t * segment.p1.y +
          3 * u * t * t * segment.p2.y +
          t * t * t * segment.p3.y,
      };
    }
  }
}

/**
 * What a path is made of, independent of where it is.
 *
 * Sampling proves two curves lie on top of each other; it cannot prove the
 * result is still a *rectangle* — eight segments alternating line and arc, with
 * circular corners of the right radii. A mirrored panel that came back as a
 * polyline, or with a corner arc turned inside out, would pass the point-set
 * oracle and fail here.
 */
function structureOf(path: Path) {
  return {
    kinds: path.segments.map((segment) => segment.kind),
    closed: path.closed,
    arcRadii: path.segments
      .flatMap((segment) => (segment.kind === 'arc' ? [segment.radius] : []))
      .map((radius) => Number(radius.toFixed(9)))
      .sort((a, b) => a - b),
  };
}

const radiiOf = (shape: ParametricShape) =>
  shape.type === 'rect' ? Object.values(shape.radii).sort((a, b) => a - b) : [];

describe('reflecting a rectangle', () => {
  it('lands on the other side of the axis', () => {
    // The measured defect: a 10 × 5 panel mirrored across x = 0 landed at
    // x ∈ [0, 10] instead of x ∈ [−10, 0].
    const box = PathOps.bbox(transformed(rect(), mirrorX(0)))!;

    expect(box.minX).toBeCloseTo(-10, 9);
    expect(box.maxX).toBeCloseTo(0, 9);
    expect(box.minY).toBeCloseTo(0, 9);
    expect(box.maxY).toBeCloseTo(5, 9);
  });

  it('takes its rounded corners with it, rather than swapping them diagonally', () => {
    // One rounded corner, bottom-left. Mirrored across x = 0 it must be the
    // bottom-*right* corner of the result — adjacent, not diagonal.
    const shape = rect({ x: 0, y: 0 }, 10, 5, 0, {
      bottomLeft: 2,
      bottomRight: 0,
      topLeft: 0,
      topRight: 0,
    });

    const result = transformShape(shape, mirrorX(0));
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || result.value.type !== 'rect') return;

    expect(result.value.radii).toEqual({
      bottomLeft: 0,
      bottomRight: 2,
      topLeft: 0,
      topRight: 0,
    });
  });

  it('draws what transforming the drawn path draws', () => {
    const shape = rect({ x: 2, y: 1 }, 10, 5, 0, uniformRadii(1.5));
    const m = mirrorX(0);

    expect(sameCurve(transformed(shape, m), PathOps.transform(pathForShape(shape), m))).toBe(true);
  });

  it('does the same across a horizontal axis', () => {
    const shape = rect({ x: 2, y: 1 }, 10, 5, 0, uniformRadii(1.5));
    const m = mirrorY(0);

    expect(sameCurve(transformed(shape, m), PathOps.transform(pathForShape(shape), m))).toBe(true);
  });

  it('does the same for a rectangle that is already turned', () => {
    const shape = rect({ x: 2, y: 1 }, 10, 5, Math.PI / 6, uniformRadii(1));
    const m = mirrorX(3);

    expect(sameCurve(transformed(shape, m), PathOps.transform(pathForShape(shape), m))).toBe(true);
  });

  it('comes back a rectangle, not merely the same set of points', () => {
    const shape = rect({ x: 2, y: 1 }, 10, 5, 0, {
      bottomLeft: 2,
      bottomRight: 1,
      topLeft: 0.5,
      topRight: 1.5,
    });
    const m = mirrorX(0);

    const before = structureOf(pathForShape(shape));
    const after = structureOf(transformed(shape, m));

    // The same alternation of straights and corner arcs, closed, with the same
    // four corner radii — moved to different corners, not resized or lost.
    expect(after.kinds).toEqual(before.kinds);
    expect(after.closed).toBe(true);
    expect(after.arcRadii).toEqual(before.arcRadii);
  });

  it('keeps its corner radii valid, and the same four of them', () => {
    const shape = rect({ x: 2, y: 1 }, 10, 5, Math.PI / 5, {
      bottomLeft: 2,
      bottomRight: 1,
      topLeft: 0.5,
      topRight: 1.5,
    });

    for (const m of [mirrorX(4), mirrorY(-3)]) {
      const result = transformShape(shape, m);
      if (!isOk(result) || result.value.type !== 'rect') throw new Error('expected a rect');

      expect(radiiOf(result.value)).toEqual(radiiOf(shape));
      expect(Object.values(result.value.radii).every((radius) => radius >= 0)).toBe(true);
      expect(result.value.width).toBeCloseTo(shape.width, 9);
      expect(result.value.height).toBeCloseTo(shape.height, 9);
    }
  });

  it('keeps its size and its area', () => {
    const shape = rect({ x: 2, y: 1 }, 10, 5, 0, uniformRadii(1.5));
    const result = transformShape(shape, mirrorX(0));

    if (!isOk(result) || result.value.type !== 'rect') throw new Error('expected a rect');
    expect(result.value.width).toBeCloseTo(10, 9);
    expect(result.value.height).toBeCloseTo(5, 9);
    expect(PathOps.area(pathForShape(result.value))).toBeCloseTo(
      PathOps.area(pathForShape(shape)),
      6,
    );
  });

  it('draws the same curve for any rectangle across any axis', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.double({ min: 1, max: 40, noNaN: true }),
        fc.double({ min: 1, max: 40, noNaN: true }),
        fc.double({ min: 0, max: Math.PI, noNaN: true }),
        fc.double({ min: 0, max: 0.4, noNaN: true }),
        fc.double({ min: -15, max: 15, noNaN: true }),
        fc.boolean(),
        (x, y, width, height, rotation, radiusFraction, axis, horizontal) => {
          const radius = Math.min(width, height) * radiusFraction * 0.5;
          const shape = rect({ x, y }, width, height, rotation, uniformRadii(radius));
          const m = horizontal ? mirrorY(axis) : mirrorX(axis);

          return sameCurve(transformed(shape, m), PathOps.transform(pathForShape(shape), m), 1e-6);
        },
      ),
    );
  });
});

describe('reflecting the round shapes', () => {
  it('mirrors a circle to the other side, unchanged in size', () => {
    const circle: ParametricShape = { type: 'circle', centre: { x: 4, y: 3 }, radius: 2 };
    const result = transformShape(circle, mirrorX(0));

    if (!isOk(result) || result.value.type !== 'circle') throw new Error('expected a circle');
    expect(result.value.centre).toEqual({ x: -4, y: 3 });
    expect(result.value.radius).toBeCloseTo(2, 9);
  });

  it('draws what transforming a mirrored arc’s path draws', () => {
    // An arc that bent one way bends the other; the sweep negates. Judged
    // against the path rather than against the parameters, because the
    // parameters are exactly what was wrong for rectangles.
    const arc: ParametricShape = {
      type: 'arc',
      centre: { x: 4, y: 3 },
      radius: 2,
      startAngle: 0.3,
      sweepAngle: 1.2,
    };
    const m = mirrorX(1);

    expect(sameCurve(transformed(arc, m), PathOps.transform(pathForShape(arc), m))).toBe(true);
  });
});
