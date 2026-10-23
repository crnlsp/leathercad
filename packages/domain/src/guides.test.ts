import { EPS_POINT, approxEq } from '@leathercad/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { guideCrossing, projectToGuide } from './guides.js';

const coordinate = fc.double({ min: -2000, max: 2000, noNaN: true });
const point = fc.record({ x: coordinate, y: coordinate });
const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });

describe('construction guides', () => {
  it('projects to horizontal, vertical and diagonal lines', () => {
    expect(projectToGuide({ origin: { x: 3, y: 4 }, angleRad: 0 }, { x: 10, y: 12 })).toEqual({
      x: 10,
      y: 4,
    });
    expect(
      projectToGuide({ origin: { x: 3, y: 4 }, angleRad: Math.PI / 2 }, { x: 10, y: 12 }).x,
    ).toBeCloseTo(3);
    const diagonal = projectToGuide(
      { origin: { x: 0, y: 0 }, angleRad: Math.PI / 4 },
      { x: 10, y: 0 },
    );
    expect(diagonal.x).toBeCloseTo(5);
    expect(diagonal.y).toBeCloseTo(5);
  });

  it('is the perpendicular nearest point, and projecting twice changes nothing', () => {
    fc.assert(
      fc.property(point, point, angle, (origin, at, angleRad) => {
        const guide = { origin, angleRad };
        const result = projectToGuide(guide, at);
        const along =
          (at.x - result.x) * Math.cos(angleRad) + (at.y - result.y) * Math.sin(angleRad);
        expect(approxEq(along, 0, EPS_POINT)).toBe(true);
        const again = projectToGuide(guide, result);
        expect(approxEq(again.x, result.x)).toBe(true);
        expect(approxEq(again.y, result.y)).toBe(true);
      }),
    );
  });

  it('finds crossings, and treats parallel and nearly parallel guides as having none', () => {
    const horizontal = { origin: { x: 0, y: 4 }, angleRad: 0 };
    const crossing = guideCrossing(horizontal, { origin: { x: 3, y: 0 }, angleRad: Math.PI / 2 });
    expect(crossing?.x).toBeCloseTo(3);
    expect(crossing?.y).toBeCloseTo(4);
    expect(guideCrossing(horizontal, horizontal)).toBeNull();
    expect(guideCrossing(horizontal, { origin: { x: 0, y: 8 }, angleRad: 1e-12 })).toBeNull();
  });

  it('places a crossing on both guides, symmetrically, for any perpendicular pair', () => {
    fc.assert(
      fc.property(point, point, angle, (first, second, angleRad) => {
        const a = { origin: first, angleRad };
        const b = { origin: second, angleRad: angleRad + Math.PI / 2 };
        const crossing = guideCrossing(a, b);
        const reversed = guideCrossing(b, a);
        expect(crossing).not.toBeNull();
        if (crossing === null || reversed === null) return;
        for (const guide of [a, b]) {
          const projected = projectToGuide(guide, crossing);
          expect(approxEq(projected.x, crossing.x)).toBe(true);
          expect(approxEq(projected.y, crossing.y)).toBe(true);
        }
        expect(approxEq(crossing.x, reversed.x)).toBe(true);
        expect(approxEq(crossing.y, reversed.y)).toBe(true);
      }),
    );
  });

  it('rejects a non-finite angle, origin or target before geometry is computed', () => {
    const guide = { origin: { x: 0, y: 0 }, angleRad: 0 };
    expect(() => projectToGuide({ ...guide, angleRad: NaN }, { x: 0, y: 0 })).toThrow(RangeError);
    expect(() =>
      projectToGuide({ ...guide, origin: { x: Infinity, y: 0 } }, { x: 0, y: 0 }),
    ).toThrow(RangeError);
    expect(() => projectToGuide(guide, { x: 0, y: NaN })).toThrow(RangeError);
  });
});
