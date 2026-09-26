import {
  PathOps,
  insertPathVertex,
  movePathVertex,
  path,
  polyline,
  removePathVertex,
  vec,
  type Path,
  type PathEdit,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { cornerDistances, cornerSites, cornersThroughEdit, type CornerSite } from './anchors.js';

/** A 100 × 50 rectangle, anticlockwise from the origin. */
const box = polyline([vec(0, 0), vec(100, 0), vec(100, 50), vec(0, 50)], true);

/** The same rectangle with its top-right corner rounded, as a drawn path. */
const rounded: Path = path(
  [
    { kind: 'line', a: vec(0, 0), b: vec(100, 0) },
    { kind: 'line', a: vec(100, 0), b: vec(100, 40) },
    { kind: 'arc', centre: vec(90, 40), radius: 10, startAngle: 0, sweepAngle: Math.PI / 2 },
    { kind: 'line', a: vec(90, 50), b: vec(0, 50) },
    { kind: 'line', a: vec(0, 50), b: vec(0, 0) },
  ],
  true,
);

describe('cornerSites', () => {
  it('names each corner by the point it is at, in anchor order', () => {
    // Anchors run from the path's start: the corner at its own start is met
    // last, when the closing side arrives back there.
    expect(cornerSites(box)).toEqual([
      { kind: 'vertex', index: 1 },
      { kind: 'vertex', index: 2 },
      { kind: 'vertex', index: 3 },
      { kind: 'vertex', index: 0 },
    ]);
  });

  it('names a rounded corner by its arc', () => {
    expect(cornerSites(rounded)).toEqual([
      { kind: 'vertex', index: 1 },
      { kind: 'arc', segment: 2 },
      { kind: 'vertex', index: 4 },
      { kind: 'vertex', index: 0 },
    ]);
  });

  it('has a site for every anchor, at that anchor', () => {
    const arbPath = fc
      .tuple(
        fc.array(
          fc.record({
            x: fc.integer({ min: -50, max: 50 }),
            y: fc.integer({ min: -50, max: 50 }),
          }),
          { minLength: 2, maxLength: 7 },
        ),
        fc.boolean(),
      )
      .map(([points, closed]) => polyline(points, closed))
      .filter((p) => p.segments.every((s) => PathOps.length({ segments: [s], closed: false }) > 0));

    fc.assert(
      fc.property(arbPath, (p) => {
        const sites = cornerSites(p);
        const distances = cornerDistances(p);
        expect(sites).toHaveLength(distances.length);
        const measure = PathOps.measure(p);
        for (const [k, site] of sites.entries()) {
          const at = measure.pointAtDistance(distances[k]!);
          expect(Math.hypot(at.x - siteAt(p, site).x, at.y - siteAt(p, site).y)).toBeLessThan(1e-6);
        }
      }),
    );
  });
});

describe('cornersThroughEdit', () => {
  it('keeps every corner when a point is added along a side', () => {
    expect(cornersThroughEdit(box, insertPathVertex(box, 0, 0.5)!)).toEqual([0, 1, 2, 3]);
  });

  it('loses only the corner that was removed, and renumbers the rest', () => {
    expect(cornersThroughEdit(box, removePathVertex(box, 2)!)).toEqual([0, null, 1, 2]);
    // Removing the start: the corner that used to come last is the one gone.
    expect(cornersThroughEdit(box, removePathVertex(box, 0)!)).toEqual([0, 1, 2, null]);
  });

  it('loses a corner that a move straightens', () => {
    // The bottom-right corner moved onto the line from (0, 0) to (100, 50).
    expect(cornersThroughEdit(box, movePathVertex(box, 1, vec(50, 25))!)).toEqual([null, 0, 1, 2]);
  });

  it('finds a corner a move makes, without renumbering the ones that were there', () => {
    // A point partway along the bottom side is no corner; pull it down and it
    // becomes one — ahead of every corner that follows it.
    const five = insertPathVertex(box, 0, 0.5)!.path;
    expect(cornersThroughEdit(five, movePathVertex(five, 1, vec(50, -10))!)).toEqual([1, 2, 3, 4]);
  });

  it('keeps a rounded corner through a move elsewhere, and loses it when its arc is split', () => {
    expect(cornersThroughEdit(rounded, movePathVertex(rounded, 0, vec(-5, -5))!)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(cornersThroughEdit(rounded, insertPathVertex(rounded, 2, 0.5)!)[1]).toBeNull();
  });

  it('sends each corner that survives to the same site, and no two to one', () => {
    const arbSquareish = fc
      .array(
        fc.record({ x: fc.integer({ min: -50, max: 50 }), y: fc.integer({ min: -50, max: 50 }) }),
        { minLength: 3, maxLength: 7 },
      )
      .map((points) => polyline(points, true))
      .filter((p) => p.segments.every((s) => PathOps.length({ segments: [s], closed: false }) > 1));
    const arbEdit = arbSquareish.chain((p) => {
      const count = PathOps.vertices(p).length;
      return fc.oneof(
        fc
          .tuple(
            fc.integer({ min: 0, max: count - 1 }),
            fc.record({
              x: fc.integer({ min: -60, max: 60 }),
              y: fc.integer({ min: -60, max: 60 }),
            }),
          )
          .map(([i, to]) => ({ p, edit: movePathVertex(p, i, to) })),
        fc
          .tuple(fc.integer({ min: 0, max: count - 1 }), fc.constantFrom(0.25, 0.5, 0.75))
          .map(([s, t]) => ({ p, edit: insertPathVertex(p, s, t) })),
        fc.integer({ min: 0, max: count - 1 }).map((i) => ({ p, edit: removePathVertex(p, i) })),
      );
    });

    fc.assert(
      fc.property(arbEdit, ({ p, edit }) => {
        if (edit === null) return;
        const map = cornersThroughEdit(p, edit);
        const before = cornerSites(p);
        const after = cornerSites(edit.path);

        expect(map).toHaveLength(before.length);
        const targets = map.filter((k) => k !== null);
        expect(new Set(targets).size).toBe(targets.length);
        for (const [k, j] of map.entries()) {
          if (j === null) continue;
          expect(after[j]).toEqual(through(before[k]!, edit));
        }
      }),
    );
  });
});

function siteAt(p: Path, site: CornerSite): { x: number; y: number } {
  if (site.kind === 'vertex') return PathOps.vertices(p)[site.index]!;
  const arc = p.segments[site.segment]!;
  if (arc.kind !== 'arc') throw new Error('an arc site on a segment that is not an arc');
  const angle = arc.startAngle + arc.sweepAngle / 2;
  return {
    x: arc.centre.x + arc.radius * Math.cos(angle),
    y: arc.centre.y + arc.radius * Math.sin(angle),
  };
}

function through(site: CornerSite, edit: PathEdit): CornerSite | null {
  if (site.kind === 'vertex') {
    const index = edit.vertexMap[site.index];
    return index === null || index === undefined ? null : { kind: 'vertex', index };
  }
  const segment = edit.segmentMap[site.segment];
  return segment === null || segment === undefined ? null : { kind: 'arc', segment };
}
