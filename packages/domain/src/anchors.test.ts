import { PathOps, uniformRadii } from '@leathercad/geometry';
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
