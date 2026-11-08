import {
  circle,
  MatOps,
  PathOps,
  polyline,
  roundedRect,
  uniformRadii,
  type Path,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Project } from './feature.js';
import { overlappingParts } from './overlappingParts.js';

function project(...paths: Path[]): Project {
  return {
    id: 'project',
    name: 'Overlaps',
    settings: DEFAULT_SETTINGS,
    parts: paths.map((path, i) => ({
      id: `part-${i}`,
      name: `Panel ${i}`,
      quantity: 1,
      features: [
        {
          id: `outline-${i}`,
          name: 'Outline',
          visible: true,
          locked: false,
          kind: 'cut-contour',
          role: 'outer',
          source: { kind: 'path', path },
        },
      ],
    })),
  };
}

const box = (x: number, y: number, width = 20, height = 20): Path =>
  roundedRect({ x, y }, width, height, uniformRadii(0));

describe('pieces whose exported outer outlines overlap (Q43)', () => {
  const rectangle = fc.record({
    x: fc.integer({ min: -100, max: 100 }),
    y: fc.integer({ min: -100, max: 100 }),
    width: fc.integer({ min: 1, max: 60 }),
    height: fc.integer({ min: 1, max: 60 }),
  });

  it('agrees with interval overlap for rectangles, including contact and containment', () => {
    fc.assert(
      fc.property(fc.array(rectangle, { maxLength: 10 }), (rects) => {
        const input = project(...rects.map((r) => box(r.x, r.y, r.width, r.height)));
        const before = structuredClone(input);
        const expected = rects.flatMap((a, i) =>
          rects.some(
            (b, j) =>
              i !== j &&
              a.x <= b.x + b.width &&
              b.x <= a.x + a.width &&
              a.y <= b.y + b.height &&
              b.y <= a.y + a.height,
          )
            ? [`part-${i}`]
            : [],
        );
        expect(overlappingParts(evaluate(input))).toEqual(expected);
        expect(input).toEqual(before);
      }),
      { numRuns: 500 },
    );
  });

  it('does not depend on winding, part order, or a common rigid motion', () => {
    fc.assert(
      fc.property(
        rectangle,
        rectangle,
        fc.integer({ min: -500, max: 500 }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (a, b, shift, angle) => {
          const paths = [box(a.x, a.y, a.width, a.height), box(b.x, b.y, b.width, b.height)];
          const expected = overlappingParts(evaluate(project(...paths)));
          const moved = paths
            .map((p) =>
              PathOps.transform(
                PathOps.reverse(p),
                MatOps.compose(
                  MatOps.fromTranslation({ x: shift, y: shift }),
                  MatOps.fromRotation(angle),
                ),
              ),
            )
            .reverse();
          expect(overlappingParts(evaluate(project(...moved)))).toEqual(expected);
        },
      ),
    );
  });

  it('names each conflicting piece once, in project order', () => {
    expect(
      overlappingParts(evaluate(project(box(0, 0), box(5, 5), box(100, 100), box(10, 10)))),
    ).toEqual(['part-0', 'part-1', 'part-3']);
  });

  it('does not mistake intersecting bounding boxes for intersecting outlines', () => {
    expect(
      overlappingParts(evaluate(project(circle({ x: 0, y: 0 }, 5), circle({ x: 8, y: 8 }, 5)))),
    ).toEqual([]);
  });

  it('finds curved crossings, tangency, and containment in either order', () => {
    for (const [a, b] of [
      [circle({ x: 0, y: 0 }, 10), circle({ x: 15, y: 0 }, 10)],
      [circle({ x: 0, y: 0 }, 10), circle({ x: 20, y: 0 }, 10)],
      [circle({ x: 0, y: 0 }, 10), circle({ x: 1, y: 1 }, 2)],
    ]) {
      if (a === undefined || b === undefined) throw new Error('Missing circle');
      expect(overlappingParts(evaluate(project(a, b)))).toEqual(['part-0', 'part-1']);
      expect(overlappingParts(evaluate(project(b, a)))).toEqual(['part-0', 'part-1']);
    }
  });

  it('includes coincident outlines and shared edges or vertices', () => {
    for (const other of [box(0, 0), box(20, 0), box(20, 20)]) {
      expect(overlappingParts(evaluate(project(box(0, 0), other)))).toEqual(['part-0', 'part-1']);
    }
  });

  it('checks a derived outer contour at its resolved size', () => {
    const input = project(box(0, 0, 10, 10), box(14, 0));
    const resolved = evaluate({
      ...input,
      parts: input.parts.map((part, i) =>
        i === 0
          ? {
              ...part,
              features: [
                {
                  id: 'source',
                  name: 'Source',
                  visible: false,
                  locked: false,
                  kind: 'stitch-line',
                  source: { kind: 'path', path: box(0, 0, 10, 10) },
                },
                {
                  id: 'outer',
                  name: 'Allowance',
                  visible: true,
                  locked: false,
                  kind: 'cut-contour',
                  role: 'outer',
                  source: {
                    kind: 'derived',
                    sourceId: 'source',
                    op: { type: 'offset', distanceMm: 5, side: 'outward', run: { kind: 'whole' } },
                  },
                },
              ],
            }
          : part,
      ),
    });
    expect(resolved.parts.flatMap((p) => p.features.filter((f) => !f.ok))).toEqual([]);
    expect(overlappingParts(resolved)).toEqual(['part-0', 'part-1']);
  });

  it('handles a zero-length, single-segment outline without a special numerical tolerance', () => {
    const point = polyline(
      [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ],
      true,
    );
    expect(overlappingParts(evaluate(project(point, box(0, 0))))).toEqual(['part-0', 'part-1']);
    expect(overlappingParts(evaluate(project(point, box(100, 100))))).toEqual([]);
  });

  it('uses only visible, successfully resolved outer contours; locking still exports', () => {
    const input = project(box(0, 0), box(0, 0), box(0, 0), box(0, 0), box(0, 0));
    const hidden: Feature = {
      id: 'hidden',
      name: 'Hidden',
      visible: false,
      locked: false,
      kind: 'cut-contour',
      role: 'outer',
      source: { kind: 'path', path: box(0, 0) },
    };
    const excluded: readonly Feature[] = [
      hidden,
      { ...hidden, id: 'inner', visible: true, role: 'inner' },
      {
        ...hidden,
        id: 'failed',
        visible: true,
        source: {
          kind: 'derived',
          sourceId: 'missing',
          op: {
            type: 'offset',
            distanceMm: 1,
            side: 'inward',
            run: { kind: 'whole' },
          },
        },
      },
    ];
    const resolved = evaluate({
      ...input,
      parts: input.parts.map((part, i) => {
        const feature = excluded[i - 1];
        return {
          ...part,
          features:
            feature === undefined ? part.features.map((f) => ({ ...f, locked: true })) : [feature],
        };
      }),
    });
    expect(overlappingParts(resolved)).toEqual(['part-0', 'part-4']);
  });

  it('handles empty pieces and paths; open outlines can cross but do not enclose material', () => {
    expect(overlappingParts(evaluate(project({ segments: [], closed: true }, box(0, 0))))).toEqual(
      [],
    );
    const open = polyline(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ],
      false,
    );
    expect(overlappingParts(evaluate(project(open, box(5, 5, 2, 2))))).toEqual([]);
    expect(overlappingParts(evaluate(project(open, box(10, -5))))).toEqual(['part-0', 'part-1']);
    expect(
      overlappingParts(
        evaluate({
          ...project(),
          parts: [{ id: 'empty', name: 'Empty', quantity: 1, features: [] }],
        }),
      ),
    ).toEqual([]);
  });
});
