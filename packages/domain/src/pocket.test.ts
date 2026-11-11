import { EPS_LENGTH } from '@leathercad/core';
import { MatOps, PathOps, SegmentOps, arc, cubic, line, type Path } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pocketSize } from './pocket.js';

const u = (width: number, depth: number): Path =>
  PathOps.polyline([
    { x: 0, y: 0 },
    { x: 0, y: -depth },
    { x: width, y: -depth },
    { x: width, y: 0 },
  ]);
const close = (actual: number | undefined, expected: number) => {
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? Infinity) - expected)).toBeLessThanOrEqual(EPS_LENGTH);
};

describe('pocketSize', () => {
  it('reads the space between sides and the depth below stitch ends', () => {
    expect(pocketSize(u(99, 41.3487))).toEqual({ widthMm: 99, depthMm: 41.3487 });
  });
  it('keeps dimensions when moved, turned, reflected or walked backwards', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 2000, noNaN: true }),
        fc.double({ min: 0.1, max: 2000, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.integer({ min: -2000, max: 2000 }),
        fc.boolean(),
        (width, depth, angle, shift, reflected) => {
          const matrix = MatOps.compose(
            MatOps.fromTranslation({ x: shift, y: -shift }),
            MatOps.compose(MatOps.fromRotation(angle), MatOps.fromScale(reflected ? -1 : 1, 1)),
          );
          const path = PathOps.transform(u(width, depth), matrix);
          for (const candidate of [path, PathOps.reverse(path)]) {
            const size = pocketSize(candidate);
            close(size?.widthMm, width);
            close(size?.depthMm, depth);
          }
        },
      ),
    );
  });
  it('is unchanged when straight sides are subdivided', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 0.99, noNaN: true }), (t) => {
        const path = u(99, 40);
        const divided = PathOps.open(path.segments.flatMap((s) => SegmentOps.split(s, t)));
        expect(pocketSize(divided)).toEqual(pocketSize(path));
      }),
    );
  });
  it('takes the narrower end of tapered side runs', () => {
    const path = PathOps.polyline([
      { x: 0, y: 0 },
      { x: 10, y: -40 },
      { x: 80, y: -40 },
      { x: 100, y: 0 },
    ]);
    expect(pocketSize(path)).toEqual({ widthMm: 70, depthMm: 40 });
  });
  it('does not mistake rounded bottom corners for narrowing side runs', () => {
    const path = PathOps.open([
      line({ x: 0, y: 0 }, { x: 0, y: -39 }),
      arc({ x: 1, y: -39 }, 1, Math.PI, Math.PI / 2),
      line({ x: 1, y: -40 }, { x: 98, y: -40 }),
      arc({ x: 98, y: -39 }, 1, -Math.PI / 2, Math.PI / 2),
      line({ x: 99, y: -39 }, { x: 99, y: 0 }),
    ]);
    expect(pocketSize(path)).toEqual({ widthMm: 99, depthMm: 40 });
  });

  it('ignores zero-length segments at the stitch ends', () => {
    const path = u(99, 40);
    expect(
      pocketSize(
        PathOps.open([
          line({ x: 0, y: 0 }, { x: 0, y: 0 }),
          ...path.segments,
          line({ x: 99, y: 0 }, { x: 99, y: 0 }),
        ]),
      ),
    ).toEqual(pocketSize(path));
  });
  it('measures the exact cubic bottom extremum rather than its control hull', () => {
    const path = PathOps.open([
      line({ x: 0, y: 0 }, { x: 0, y: -40 }),
      cubic({ x: 0, y: -40 }, { x: 20, y: -60 }, { x: 80, y: -60 }, { x: 100, y: -40 }),
      line({ x: 100, y: -40 }, { x: 100, y: 0 }),
    ]);
    expect(pocketSize(path)).toEqual({ widthMm: 100, depthMm: 55 });
  });
  it('does not mutate the path while measuring', () => {
    const path = u(99, 40);
    const before = structuredClone(path);
    pocketSize(path);
    expect(path).toEqual(before);
  });
  it('scales both measurements with the pattern', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 20, noNaN: true }), (factor) => {
        const size = pocketSize(PathOps.transform(u(99, 40), MatOps.fromScale(factor)));
        close(size?.widthMm, 99 * factor);
        close(size?.depthMm, 40 * factor);
      }),
    );
  });
  it.each([
    [
      'bottom outside sides',
      PathOps.polyline([
        { x: 0, y: 0 },
        { x: 0, y: -40 },
        { x: -10, y: -50 },
        { x: 100, y: -40 },
        { x: 100, y: 0 },
      ]),
    ],
    [
      'looping bottom',
      PathOps.polyline([
        { x: 0, y: 0 },
        { x: 0, y: -40 },
        { x: 80, y: -60 },
        { x: 20, y: -60 },
        { x: 100, y: -40 },
        { x: 100, y: 0 },
      ]),
    ],
    [
      'curved sides',
      PathOps.open([
        arc({ x: 20, y: 0 }, 20, Math.PI, Math.PI / 2),
        line({ x: 20, y: -20 }, { x: 80, y: -20 }),
        arc({ x: 80, y: 0 }, 20, -Math.PI / 2, Math.PI / 2),
      ]),
    ],
    ['empty', PathOps.open([])],
    [
      'single line',
      PathOps.polyline([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ],
    ['closed', { ...u(99, 40), closed: true }],
    [
      'coincident ends',
      PathOps.polyline([
        { x: 0, y: 0 },
        { x: 0, y: -40 },
        { x: 0, y: 0 },
      ]),
    ],
    [
      'crossed sides',
      PathOps.polyline([
        { x: 0, y: 0 },
        { x: 100, y: -40 },
        { x: 0, y: -40 },
        { x: 100, y: 0 },
      ]),
    ],
    [
      'backtracking bottom',
      PathOps.polyline([
        { x: 0, y: 0 },
        { x: 0, y: -40 },
        { x: 50, y: -10 },
        { x: 100, y: -40 },
        { x: 100, y: 0 },
      ]),
    ],
  ])('does not invent a pocket for %s', (_name, path) => {
    expect(pocketSize(path)).toBeNull();
  });
});
