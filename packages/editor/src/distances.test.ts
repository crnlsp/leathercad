import { EPS_POINT } from '@leathercad/core';
import { PathOps, Shapes, uniformRadii, type Path, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { rayCrossing, rayDistances } from './distances.js';

/**
 * 3.17: how far a moved feature is from its piece's outline along the four
 * world axes (smart-guides spec §7) — a ray to the nearest crossing with the
 * real outline, not its extent, so a curved flap reads true.
 */

/** Curved outlines: an ellipse (cubics), a disc (arcs) and a rounded panel (lines and arcs). */
const OUTLINES: readonly (readonly [string, Path])[] = [
  ['an ellipse', Shapes.ellipse({ x: 40, y: 20 }, 40, 20, 0.3)],
  ['a disc', Shapes.circle({ x: 0, y: 0 }, 25)],
  ['a rounded panel', Shapes.roundedRect({ x: 0, y: 0 }, 105, 75, uniformRadii(12))],
];

const unit = fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }).map((angle) => ({
  x: Math.cos(angle),
  y: Math.sin(angle),
}));

/**
 * A fraction drawn evenly: fast-check's doubles favour the ends of a range,
 * where a turned ellipse's box has no leather, and the filter would starve.
 */
const fraction = fc.integer({ min: 1, max: 9999 }).map((n) => n / 10000);

/** A point strictly inside the outline, picked from its box. */
const inside = (outline: Path): fc.Arbitrary<Vec2> => {
  const box = PathOps.bbox(outline);
  if (box === null) throw new Error('an outline has a box');
  return fc
    .record({ u: fraction, v: fraction })
    .map(({ u, v }) => ({
      x: box.minX + (box.maxX - box.minX) * u,
      y: box.minY + (box.maxY - box.minY) * v,
    }))
    .filter((p) => PathOps.containsPoint(outline, p) && PathOps.distanceToPath(outline, p) > 0.01);
};

describe('a ray to the outline (3.17)', () => {
  for (const [name, outline] of OUTLINES) {
    it(`ends on ${name}, along the ray, no nearer than its closest point`, () => {
      fc.assert(
        fc.property(inside(outline), unit, (from, direction) => {
          const hit = rayCrossing(outline, from, direction);
          if (hit === null) throw new Error('a ray from inside a closed outline always leaves it');

          // On the outline.
          expect(PathOps.distanceToPath(outline, hit.point)).toBeLessThanOrEqual(EPS_POINT);
          // Along the ray, as far as it says.
          expect(hit.point.x).toBeCloseTo(from.x + direction.x * hit.distanceMm, 6);
          expect(hit.point.y).toBeCloseTo(from.y + direction.y * hit.distanceMm, 6);
          // Never nearer than the nearest point of the outline is.
          expect(hit.distanceMm).toBeGreaterThanOrEqual(
            PathOps.distanceToPath(outline, from) - EPS_POINT,
          );
          // And the first crossing: the ray is still on the leather just short of it.
          const short = Math.max(0, hit.distanceMm - 1e-3);
          expect(
            PathOps.containsPoint(outline, {
              x: from.x + direction.x * short,
              y: from.y + direction.y * short,
            }),
          ).toBe(true);
        }),
      );
    });

    it(`towards ${name}'s closest point, measures the closest distance`, () => {
      fc.assert(
        fc.property(inside(outline), (from) => {
          const near = PathOps.closestPointOnPath(outline, from);
          if (near === null) throw new Error('an outline has a closest point');
          const closest = near.point;
          const away = Math.hypot(closest.x - from.x, closest.y - from.y);
          const direction = { x: (closest.x - from.x) / away, y: (closest.y - from.y) / away };
          const hit = rayCrossing(outline, from, direction);

          expect(hit?.distanceMm).toBeCloseTo(away, 6);
        }),
      );
    });
  }

  it('finds nothing when the ray points away from an outline it is outside', () => {
    const disc = Shapes.circle({ x: 0, y: 0 }, 10);
    expect(rayCrossing(disc, { x: 20, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it("measures a rivet's four distances from its rim, on the key fob's strap", () => {
    // The strap is 140 × 26 with round ends; a 4 mm rivet at (14, 13).
    const strap = Shapes.roundedRect({ x: 0, y: 0 }, 140, 26, uniformRadii(13));
    const rays = rayDistances(strap, { minX: 12, maxX: 16, minY: 11, maxY: 15 }, 2);
    const by = Object.fromEntries(rays.map((ray) => [ray.direction, ray.distanceMm]));

    expect(by.up).toBeCloseTo(11, 9);
    expect(by.down).toBeCloseTo(11, 9);
    expect(by.right).toBeCloseTo(124, 9);
    // Into the round end, which along y = 13 is reached at x = 0.
    expect(by.left).toBeCloseTo(12, 9);
  });

  it("measures a selection's distances from the middle of each side of its extent", () => {
    const panel = Shapes.rect({ x: 0, y: 0 }, 100, 60);
    const rays = rayDistances(panel, { minX: 20, maxX: 50, minY: 10, maxY: 40 }, null);

    expect(rays).toEqual([
      { direction: 'left', from: { x: 20, y: 25 }, to: { x: 0, y: 25 }, distanceMm: 20 },
      { direction: 'right', from: { x: 50, y: 25 }, to: { x: 100, y: 25 }, distanceMm: 50 },
      { direction: 'down', from: { x: 35, y: 10 }, to: { x: 35, y: 0 }, distanceMm: 10 },
      { direction: 'up', from: { x: 35, y: 40 }, to: { x: 35, y: 60 }, distanceMm: 20 },
    ]);
  });
});
