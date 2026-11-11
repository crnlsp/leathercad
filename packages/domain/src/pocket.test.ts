import { EPS_LENGTH } from '@leathercad/core';
import {
  MatOps,
  PathOps,
  SegmentOps,
  Shapes,
  arc,
  cubic,
  line,
  type Mat2x3,
  type Path,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ID1_CARD, contentSize, depthBelowOpening, pocketSize } from './pocket.js';

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

/**
 * A pocket piece as the card holder's is built: an outline `width` across and
 * `height` tall, and U stitching `inset` inside it whose ends stop `rise` below
 * the opening.
 */
const piece = (width: number, height: number, inset: number, rise: number) => ({
  outline: PathOps.polyline(
    [
      { x: -inset, y: rise },
      { x: -inset, y: rise - height },
      { x: width + inset, y: rise - height },
      { x: width + inset, y: rise },
    ],
    true,
  ),
  stitch: u(width, height - rise - inset),
});
const placed = (path: Path, matrix: Mat2x3) => PathOps.transform(path, matrix);

describe('depthBelowOpening', () => {
  it('reads from the opening the leather makes, not from the stitch ends', () => {
    const { outline, stitch } = piece(99, 47.3487, 3, 3);
    close(depthBelowOpening(stitch, outline) ?? undefined, 44.3487);
  });

  it('is the stitch depth plus the rise to the opening, wherever the piece lies', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.double({ min: 5, max: 300, noNaN: true }),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.boolean(),
        (width, depth, inset, rise, angle, reflected) => {
          const { outline, stitch } = piece(width, depth + rise + inset, inset, rise);
          const matrix = MatOps.compose(
            MatOps.fromTranslation({ x: 300, y: -120 }),
            MatOps.compose(MatOps.fromRotation(angle), MatOps.fromScale(reflected ? -1 : 1, 1)),
          );
          const moved = placed(stitch, matrix);
          for (const candidate of [moved, PathOps.reverse(moved)]) {
            close(depthBelowOpening(candidate, placed(outline, matrix)) ?? undefined, depth + rise);
          }
        },
      ),
    );
  });

  it('takes the lower side when the opening is cut on a slant', () => {
    const stitch = u(100, 40);
    const outline = PathOps.polyline(
      [
        { x: -3, y: 2 },
        { x: -3, y: -43 },
        { x: 103, y: -43 },
        { x: 103, y: 8 },
      ],
      true,
    );
    // The ray from the left end meets the slanted top 2.0566 mm up, the right 7.9434.
    const leftRise = 2 + (3 * 6) / 106;
    close(depthBelowOpening(stitch, outline) ?? undefined, 40 + leftRise);
  });

  it('is not lowered by a thumb scoop between the sides', () => {
    const outline = Shapes.rect({ x: -3, y: -43 }, 106, 47);
    const scooped = PathOps.closed([
      line({ x: -3, y: 4 }, { x: -3, y: -43 }),
      line({ x: -3, y: -43 }, { x: 103, y: -43 }),
      line({ x: 103, y: -43 }, { x: 103, y: 4 }),
      line({ x: 103, y: 4 }, { x: 70, y: 4 }),
      arc({ x: 50, y: 4 }, 20, 0, -Math.PI),
      line({ x: 30, y: 4 }, { x: -3, y: 4 }),
    ]);
    expect(depthBelowOpening(u(100, 40), scooped)).toBe(depthBelowOpening(u(100, 40), outline));
    close(depthBelowOpening(u(100, 40), scooped) ?? undefined, 44);
  });

  it('is the stitch depth when the stitching ends on the cut edge', () => {
    const { outline, stitch } = piece(99, 43, 3, 0);
    close(depthBelowOpening(stitch, outline) ?? undefined, 40);
  });

  it.each([
    [
      'stitching off the leather',
      piece(99, 47, 3, 3).stitch,
      Shapes.rect({ x: 200, y: 0 }, 50, 50),
    ],
    [
      'an outline that is not closed',
      u(99, 40),
      PathOps.polyline([
        { x: -3, y: 3 },
        { x: -3, y: -43 },
        { x: 102, y: -43 },
        { x: 102, y: 3 },
      ]),
    ],
    [
      'stitching with no pocket reading',
      PathOps.polyline([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      Shapes.rect({ x: -3, y: -43 }, 106, 47),
    ],
  ])('has no opening for %s', (_name, stitch, outline) => {
    expect(depthBelowOpening(stitch, outline)).toBeNull();
  });

  it('does not mutate either path', () => {
    const { outline, stitch } = piece(99, 47, 3, 3);
    const before = structuredClone({ outline, stitch });
    depthBelowOpening(stitch, outline);
    expect({ outline, stitch }).toEqual(before);
  });
});

describe('contentSize', () => {
  it('gives a payment card its ISO/IEC 7810 ID-1 size, landscape', () => {
    expect(contentSize({ kind: 'id-1' })).toEqual({ widthMm: 85.6, heightMm: 53.98 });
    expect(ID1_CARD).toEqual({ widthMm: 85.6, heightMm: 53.98 });
  });
  it('gives a typed size as typed', () => {
    expect(contentSize({ kind: 'size', widthMm: 160, heightMm: 80 })).toEqual({
      widthMm: 160,
      heightMm: 80,
    });
  });
});
