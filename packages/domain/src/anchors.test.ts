import { EPS_POINT } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  fittedRadii,
  uniformRadii,
  type CornerRadii,
  type Vec2,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { anchorsOf, cornerDistances } from './anchors.js';
import { evaluate, resolvedFeatures } from './evaluate.js';
import {
  DEFAULT_SETTINGS,
  type Feature,
  type ParametricShape,
  type Part,
  type Project,
} from './feature.js';

const rectShape = (radius: number, width = 100, height = 60) =>
  ({
    type: 'rect',
    origin: { x: 0, y: 0 },
    width,
    height,
    radii: uniformRadii(radius),
    rotation: 0,
  }) as const;

function panel(radius: number): Feature {
  return {
    id: 'cut-1',
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    visible: true,
    locked: false,
    source: { kind: 'shape', shape: rectShape(radius) },
  };
}

function run(fromAnchor: number, toAnchor: number): Feature {
  return {
    id: 'stitch-1',
    kind: 'stitch-line',
    name: 'Stitch line',
    visible: true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId: 'cut-1',
      op: {
        type: 'offset',
        distanceMm: 3.5,
        side: 'inward',
        run: { kind: 'between', fromAnchor, toAnchor },
      },
    },
  };
}

function project(features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

const runLength = (radius: number, from: number, to: number): number => {
  const found = [...resolvedFeatures(evaluate(project([panel(radius), run(from, to)])))].find(
    (f) => f.feature.id === 'stitch-1',
  );
  if (found === undefined) throw new Error('run did not resolve');
  return PathOps.length(found.path);
};

describe('anchors', () => {
  it('gives a rectangle four corners, whatever its radii', () => {
    for (const radius of [0, 3, 8, 20]) {
      const shape = rectShape(radius);
      const path = pathOf(shape);
      expect(anchorsOf({ kind: 'shape', shape }, path)).toHaveLength(4);
    }
  });

  it('gives a circle no anchors, so only a whole run is possible', () => {
    const shape = { type: 'circle', centre: { x: 0, y: 0 }, radius: 20 } as const;
    expect(anchorsOf({ kind: 'shape', shape }, pathOf(shape))).toHaveLength(0);
  });

  it('gives an arc no anchors — it is already an open run', () => {
    const shape = {
      type: 'arc',
      centre: { x: 0, y: 0 },
      radius: 20,
      startAngle: 0,
      sweepAngle: 1,
    } as const;
    expect(anchorsOf({ kind: 'shape', shape }, pathOf(shape))).toHaveLength(0);
  });

  it('gives a drawn polyline its corners', () => {
    const path = PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      false,
    );
    expect(anchorsOf({ kind: 'path', path }, path)).toHaveLength(1);
  });

  it('orders anchors along the path, so a run between them is contiguous', () => {
    const shape = rectShape(8);
    const anchors = anchorsOf({ kind: 'shape', shape }, pathOf(shape));
    for (let i = 1; i < anchors.length; i++) expect(anchors[i]!).toBeGreaterThan(anchors[i - 1]!);
  });
});

describe('a rectangle keeps its four corners at any radius (ADR 0010)', () => {
  /**
   * Where each corner is, from the parameters alone: the middle of its
   * rounding, or the point itself when it is sharp. Unturned, at the origin.
   */
  function cornerPlaces(width: number, height: number, radii: CornerRadii): Vec2[] {
    const r = fittedRadii(radii, width, height);
    const middle = 1 - Math.SQRT1_2;
    return [
      { x: width - r.bottomRight * middle, y: r.bottomRight * middle },
      { x: width - r.topRight * middle, y: height - r.topRight * middle },
      { x: r.topLeft * middle, y: height - r.topLeft * middle },
      { x: r.bottomLeft * middle, y: r.bottomLeft * middle },
    ];
  }

  function anchorPlaces(width: number, height: number, radii: CornerRadii): Vec2[] {
    const shape = { ...rectShape(0, width, height), radii };
    const path = pathOf(shape);
    const measure = PathOps.measure(path);
    return anchorsOf({ kind: 'shape', shape }, path).map((at) => {
      const found = measure.locate(at);
      return SegmentOps.pointAt(path.segments[found.segmentIndex]!, found.t);
    });
  }

  const size = fc.double({ min: 1, max: 400, noNaN: true });
  /** A corner's radius as a share of the shorter side: none, all of it, or between. */
  const share = fc.oneof(
    fc.constant(0),
    fc.constant(0.5),
    fc.double({ min: 0, max: 0.5, noNaN: true }),
    // More than fits, which `roundedRect` shrinks to what does.
    fc.double({ min: 0.5, max: 2, noNaN: true }),
  );

  it('names each corner by its place, from no rounding up to a full one', () => {
    fc.assert(
      fc.property(size, size, fc.tuple(share, share, share, share), (width, height, shares) => {
        const shorter = Math.min(width, height);
        const radii: CornerRadii = {
          bottomRight: shares[0] * shorter,
          topRight: shares[1] * shorter,
          topLeft: shares[2] * shorter,
          bottomLeft: shares[3] * shorter,
        };
        const found = anchorPlaces(width, height, radii);
        const expected = cornerPlaces(width, height, radii);
        // The same point, by the model's own measure of one.
        return (
          found.length === 4 &&
          found.every((p, k) => Math.hypot(p.x - expected[k]!.x, p.y - expected[k]!.y) <= EPS_POINT)
        );
      }),
    );
  });

  it('keeps the corners in order along the outline, so a run between two is contiguous', () => {
    fc.assert(
      fc.property(size, size, share, (width, height, s) => {
        const shape = { ...rectShape(s * Math.min(width, height), width, height) };
        const anchors = anchorsOf({ kind: 'shape', shape }, pathOf(shape));
        return anchors.every((at, k) => k === 0 || at > anchors[k - 1]!);
      }),
    );
  });

  it('keeps all four on a square rounded all the way to a circle', () => {
    // Rounded to half its side, a square has no straight left between its
    // roundings — and still four corners, each the middle of its rounding.
    const places = anchorPlaces(10, 10, uniformRadii(5));
    const middle = 5 * (1 - Math.SQRT1_2);

    expect(places).toHaveLength(4);
    for (const [k, [x, y]] of [
      [10 - middle, middle],
      [10 - middle, 10 - middle],
      [middle, 10 - middle],
      [middle, middle],
    ].entries()) {
      expect(places[k]!.x).toBeCloseTo(x!, 9);
      expect(places[k]!.y).toBeCloseTo(y!, 9);
    }
  });

  it('keeps all four on a strap rounded to a half circle at each end', () => {
    expect(anchorPlaces(100, 30, uniformRadii(15))).toHaveLength(4);
  });

  it('keeps a sharp corner where a rounding beside it took the whole side', () => {
    // The bottom side is all rounding, so the bottom-right corner is sharp
    // and joins the rounding straight onto the right side — still corner 0.
    const radii = { bottomLeft: 60, bottomRight: 0, topRight: 0, topLeft: 0 };
    const places = anchorPlaces(60, 100, radii);
    const middle = 60 * (1 - Math.SQRT1_2);

    expect(places.map((p) => [p.x, p.y])).toEqual([
      [60, 0],
      [60, 100],
      [0, 100],
      [expect.closeTo(middle, 9), expect.closeTo(middle, 9)],
    ]);
  });

  it('runs between the same corners when the radius grows to a full rounding', () => {
    // Right side, top and left side, at 8 mm and with the ends rounded right
    // round: the run never jumps to a different stretch of the outline.
    const rounded = runLength(30, 0, 3);
    const sharp = runLength(0, 0, 3);

    expect(rounded).toBeGreaterThan(0);
    expect(Math.abs(rounded - sharp)).toBeLessThan(4 * 30);
  });
});

describe('a partial run', () => {
  it('covers three sides of a panel', () => {
    // Anchors 0..3 are the four corners in path order, so 0 to 3 is the right
    // edge, the top and the left: 60 + 100 + 60 = 220 mm of outline. Inset
    // 3.5 mm, the two interior corners each lose 3.5 mm from both edges
    // meeting there, so 220 - 4 x 3.5 = 206.
    expect(runLength(0, 0, 3)).toBeCloseTo(206, 6);
  });

  it('keeps the same edges when the corner radius changes to zero', () => {
    // The trap this design exists to avoid. roundedRect emits 8 segments at
    // 8 mm and 4 at 0 mm, so an index-based run would silently move to
    // different edges. These two must stay within a corner's worth of each
    // other, not differ by a whole side.
    const rounded = runLength(8, 0, 3);
    const sharp = runLength(0, 0, 3);

    expect(Math.abs(rounded - sharp)).toBeLessThan(20);
  });

  it('wraps through the path start when the run does', () => {
    const wrapped = runLength(0, 3, 0);
    const forward = runLength(0, 0, 3);

    // The two runs are complementary: together they are the whole perimeter.
    expect(wrapped).toBeGreaterThan(0);
    expect(wrapped).toBeLessThan(forward);
  });

  it('refuses an anchor that is not there', () => {
    const errors = evaluate(project([panel(0), run(0, 9)]))
      .parts.flatMap((p) => p.features)
      .filter((f) => !f.ok);

    expect(errors[0]).toBeDefined();
    // E4: a corner that is not there fails; it never falls back to a neighbour.
    expect((errors[0] as { problem: unknown }).problem).toMatchObject({
      code: 'ANCHOR_MISSING',
      facts: { anchor: 9 },
    });
  });

  it('refuses a run on a circle, which has no corners to name', () => {
    const circle: Feature = {
      id: 'cut-1',
      kind: 'cut-contour',
      role: 'outer',
      name: 'Outline',
      visible: true,
      locked: false,
      source: { kind: 'shape', shape: { type: 'circle', centre: { x: 0, y: 0 }, radius: 30 } },
    };

    const errors = evaluate(project([circle, run(0, 1)]))
      .parts.flatMap((p) => p.features)
      .filter((f) => !f.ok);

    expect((errors[0] as { problem: unknown }).problem).toMatchObject({
      code: 'ANCHOR_MISSING',
      facts: { available: 0 },
    });
  });
});

describe('cornerDistances', () => {
  it('finds the four corners of a sharp rectangle', () => {
    expect(cornerDistances(pathOf(rectShape(0)))).toHaveLength(4);
  });

  it('finds the four rounded corners of a radiused rectangle', () => {
    expect(cornerDistances(pathOf(rectShape(8)))).toHaveLength(4);
  });

  it('finds none on a circle, which never turns a corner', () => {
    expect(
      cornerDistances(pathOf({ type: 'circle', centre: { x: 0, y: 0 }, radius: 20 } as const)),
    ).toHaveLength(0);
  });
});

/** The evaluated geometry of one shape, on its own. */
function pathOf(shape: ParametricShape) {
  const feature: Feature = {
    id: 'cut-1',
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    visible: true,
    locked: false,
    source: { kind: 'shape', shape },
  };

  const found = [...resolvedFeatures(evaluate(project([feature])))][0];
  if (found === undefined) throw new Error('shape did not resolve');
  return found.path;
}
