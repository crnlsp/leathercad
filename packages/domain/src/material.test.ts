import { EPS_POINT, QUANTUM_MM, quantise } from '@leathercad/core';
import {
  circle,
  MatOps,
  PathOps,
  polyline,
  roundedRect,
  uniformRadii,
  type Path,
  type Vec2,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { distanceToEdge, isOnMaterial, type Material } from './material.js';

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

describe('isOnMaterial', () => {
  // Quantised, as every drawn coordinate is stored (invariant 8).
  const arbCoord = fc.double({ min: -300, max: 300, noNaN: true }).map(quantise);
  const arbPoint = fc.record({ x: arbCoord, y: arbCoord });
  const arbT = fc.double({ min: 0, max: 1, noNaN: true });
  /** An edge of each kind a piece is cut by: round, square-cornered, rounded, drawn. */
  const arbEdge: fc.Arbitrary<Path> = fc.oneof(
    fc
      .tuple(arbPoint, fc.double({ min: 0.1, max: 100, noNaN: true }))
      .map(([centre, radius]) => circle(centre, radius)),
    fc
      .tuple(
        arbPoint,
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.constantFrom(0, 0, 0.2),
      )
      .map(([origin, width, height, round]) =>
        roundedRect(origin, width, height, uniformRadii(Math.min(width, height) * round)),
      ),
    fc
      .array(arbPoint, { minLength: 3, maxLength: 8 })
      .map((points) => polyline(points, true))
      // A sliver with no area has no inside to be on, whichever way it is asked.
      .filter((edge) => PathOps.area(edge) > 1),
  );
  /** A point on an edge, nudged up to half a storage quantum off it, either side. */
  const nearEdge = (edge: Path, t: number, angle: number, by: number): Vec2 => {
    const measure = PathOps.measure(edge);
    const p = measure.pointAtDistance(t * measure.totalLength());
    return { x: p.x + Math.cos(angle) * by, y: p.y + Math.sin(angle) * by };
  };
  const arbNudge = fc.tuple(
    arbT,
    fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    fc.double({ min: 0, max: QUANTUM_MM / 2, noNaN: true }),
  );
  /** The same edge however it is drawn: either winding, and mirrored. */
  const facings = (edge: Path, point: Vec2): [Path, Vec2][] => {
    const mirror = MatOps.fromMirror({ x: 0, y: 0 }, Math.PI / 2);
    const mirrored = PathOps.transform(edge, mirror);
    const across = MatOps.apply(mirror, point);
    return [
      [edge, point],
      [PathOps.reverse(edge), point],
      [mirrored, across],
      [PathOps.reverse(mirrored), across],
    ];
  };
  /** Far enough out that every arbitrary edge lies inside it. */
  const field = roundedRect({ x: -1000, y: -1000 }, 2000, 2000, uniformRadii(0));

  it('a point within a storage quantum of the outline is on the leather, whichever way the outline runs (D29)', () => {
    fc.assert(
      fc.property(arbEdge, arbNudge, (edge, [t, angle, by]) => {
        for (const [outer, point] of facings(edge, nearEdge(edge, t, angle, by))) {
          expect(isOnMaterial({ outer, holes: [] }, point)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('a point within a storage quantum of a cut-out is on the leather, whichever way the cut-out runs (D29)', () => {
    fc.assert(
      fc.property(arbEdge, arbNudge, (edge, [t, angle, by]) => {
        for (const [hole, point] of facings(edge, nearEdge(edge, t, angle, by))) {
          expect(isOnMaterial({ outer: field, holes: [hole] }, point)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('says the same of any point, however the material is wound or mirrored', () => {
    fc.assert(
      fc.property(arbEdge, fc.array(arbEdge, { maxLength: 3 }), arbPoint, (edge, cuts, point) => {
        // A point a quantum from an edge, to the last bits, is the threshold's
        // own rounding, which no mirror can be held to.
        const atThreshold = [edge, ...cuts].some(
          (e) => Math.abs(PathOps.distanceToPath(e, point) - QUANTUM_MM) <= EPS_POINT,
        );
        fc.pre(!atThreshold);
        const once = isOnMaterial({ outer: edge, holes: cuts }, point);
        const mirror = MatOps.fromMirror({ x: 0, y: 0 }, Math.PI / 2);
        const across = MatOps.apply(mirror, point);
        const turned = (p: Path) => PathOps.reverse(PathOps.transform(p, mirror));
        expect(isOnMaterial({ outer: turned(edge), holes: cuts.map(turned) }, across)).toBe(once);
      }),
      { numRuns: 500 },
    );
  });

  it('a point more than a quantum outside the outline, or inside a cut-out, is off it', () => {
    const outer = roundedRect({ x: 0, y: 0 }, 100, 60, uniformRadii(0));
    const slot = roundedRect({ x: 40, y: 20 }, 20, 20, uniformRadii(0));
    expect(isOnMaterial({ outer, holes: [] }, { x: 3, y: 60 + 2 * QUANTUM_MM })).toBe(false);
    expect(isOnMaterial({ outer, holes: [slot] }, { x: 50, y: 20 + 2 * QUANTUM_MM })).toBe(false);
    expect(isOnMaterial({ outer: null, holes: [] }, { x: 0, y: 0 })).toBe(false);
  });

  it('a point on one cut-out’s edge but inside another is off the leather', () => {
    const outer = roundedRect({ x: 0, y: 0 }, 100, 60, uniformRadii(0));
    const a = roundedRect({ x: 10, y: 10 }, 20, 20, uniformRadii(0));
    const b = roundedRect({ x: 20, y: 10 }, 20, 20, uniformRadii(0));
    expect(isOnMaterial({ outer, holes: [a, b] }, { x: 30, y: 20 })).toBe(false);
  });
});
