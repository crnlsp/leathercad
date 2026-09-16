import { PathOps, Shapes } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { keepLargestPiece } from './offsetPieces.js';

const square = (x: number, side: number) => Shapes.rect({ x, y: 0 }, side, side);
const bar = (length: number) =>
  PathOps.polyline(
    [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
    false,
  );

describe('keepLargestPiece', () => {
  it('keeps a single piece and drops nothing', () => {
    const only = square(0, 10);
    expect(keepLargestPiece([only])).toEqual({ kept: only, dropped: 0 });
  });

  it('keeps the largest island wherever it comes in the list', () => {
    const small = square(0, 5);
    const large = square(20, 12);
    const medium = square(40, 8);

    expect(keepLargestPiece([small, large, medium])).toEqual({ kept: large, dropped: 2 });
  });

  it('measures open pieces by length', () => {
    const short = bar(3);
    const long = bar(30);
    expect(keepLargestPiece([short, long]).kept).toBe(long);
  });

  it('keeps the earlier of two equal pieces, so the choice never flickers', () => {
    const a = square(0, 10);
    const b = square(50, 10);
    expect(keepLargestPiece([a, b]).kept).toBe(a);
  });

  it('refuses an empty list, which means the offset collapsed rather than split', () => {
    expect(() => keepLargestPiece([])).toThrow(RangeError);
  });

  it('always reports every piece but one as dropped, and keeps one no smaller than any', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 1, max: 200, noNaN: true }), { minLength: 1, maxLength: 8 }),
        (sides) => {
          const pieces = sides.map((side, i) => square(i * 300, side));
          const { kept, dropped } = keepLargestPiece(pieces);
          const keptArea = Math.abs(PathOps.signedArea(kept));
          return (
            dropped === pieces.length - 1 &&
            pieces.every((piece) => Math.abs(PathOps.signedArea(piece)) <= keptArea)
          );
        },
      ),
    );
  });
});
