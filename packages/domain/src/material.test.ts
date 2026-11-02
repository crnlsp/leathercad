import {
  circle,
  PathOps,
  polyline,
  roundedRect,
  uniformRadii,
  type Path,
  type Vec2,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { distanceToEdge, type Material } from './material.js';

/**
 * What `distanceToEdge` answered by asking every edge, and the specification
 * it still meets (PERF-005): the nearest of them, each measured whole.
 */
function askingEveryEdge(material: Material, point: Vec2): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const edge of material.outer === null
    ? material.holes
    : [material.outer, ...material.holes]) {
    const distance = PathOps.distanceToPath(edge, point);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/** A path whose segments count every time one is read. */
function counted(p: Path, reads: { count: number }): Path {
  return {
    closed: p.closed,
    segments: new Proxy([...p.segments], {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads.count++;
        return Reflect.get(target, key, receiver) as unknown;
      },
    }),
  };
}

describe('distanceToEdge', () => {
  const arbCoord = fc.oneof(
    fc.double({ min: -300, max: 300, noNaN: true }),
    fc.integer({ min: -300, max: 300 }),
  );
  const arbPoint = fc.record({ x: arbCoord, y: arbCoord });
  /** An edge of each kind the material is made of: round, rounded, drawn. */
  const arbEdge: fc.Arbitrary<Path> = fc.oneof(
    fc
      .tuple(
        arbPoint,
        fc.oneof(fc.double({ min: 0.1, max: 100, noNaN: true }), fc.constantFrom(5, 20)),
      )
      .map(([centre, radius]) => circle(centre, radius)),
    fc
      .tuple(
        arbPoint,
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
      )
      .map(([origin, width, height, round]) =>
        roundedRect(origin, width, height, uniformRadii(Math.min(width, height) * round)),
      ),
    fc
      .array(arbPoint, { minLength: 3, maxLength: 8 })
      .filter((points) => PathOps.length(polyline(points, true)) > 1)
      .map((points) => polyline(points, true)),
  );
  const arbMaterial: fc.Arbitrary<Material> = fc.record({
    outer: fc.option(arbEdge, { nil: null }),
    holes: fc.array(arbEdge, { maxLength: 6 }),
  });

  /** Anywhere, and on an edge, and halfway between two: where a nearest edge is decided. */
  const arbAsked = (material: Material): fc.Arbitrary<Vec2> => {
    const edges = material.outer === null ? material.holes : [material.outer, ...material.holes];
    const along = (i: number, t: number): Vec2 => {
      const measure = PathOps.measure(edges[i % edges.length]!);
      return measure.pointAtDistance(t * measure.totalLength());
    };
    const arbT = fc.double({ min: 0, max: 1, noNaN: true });
    return edges.length === 0
      ? arbPoint
      : fc.oneof(
          arbPoint,
          fc.tuple(fc.nat(), arbT).map(([i, t]) => along(i, t)),
          fc.tuple(fc.nat(), fc.nat(), arbT, arbT).map(([i, j, s, t]) => {
            const p = along(i, s);
            const q = along(j, t);
            return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          }),
        );
  };

  it('is the nearest edge, to the last bit, as asking every edge found it', () => {
    fc.assert(
      fc.property(
        arbMaterial.chain((material) => fc.tuple(fc.constant(material), arbAsked(material))),
        ([material, point]) => {
          expect(Object.is(distanceToEdge(material, point), askingEveryEdge(material, point))).toBe(
            true,
          );
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('is infinite with no edge at all, as before', () => {
    expect(distanceToEdge({ outer: null, holes: [] }, { x: 0, y: 0 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('measures only the cut-outs near a hole, not every one for every hole', () => {
    // A work bound, not a timing, and the guard against every edge being
    // asked again. The audit's strap: 5.8 m long, 40 mm wide, twenty round
    // slots down its middle, and a hole every 3.85 mm along each side, 3.5 mm
    // in. Asking every edge read each slot's segments for each of the 3,014
    // holes, 60,280 reads; the nearest edge to every hole is the outline, so
    // no slot need be read at all beyond the once its box is taken. The bound
    // is a tenth of a read a hole.
    const reads = { count: 0 };
    const material: Material = {
      outer: roundedRect({ x: 0, y: 0 }, 5800, 40, uniformRadii(0)),
      holes: Array.from({ length: 20 }, (_, i) =>
        counted(circle({ x: 100 + i * 60, y: 20 }, 5), reads),
      ),
    };
    const holes = Array.from({ length: 1507 }, (_, k) => [
      { x: 3.5 + k * 3.85, y: 3.5 },
      { x: 3.5 + k * 3.85, y: 36.5 },
    ]).flat();

    for (const hole of holes) distanceToEdge(material, hole);

    expect(reads.count).toBeLessThan(holes.length / 10);
  });
});
