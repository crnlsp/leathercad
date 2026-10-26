import { MatOps, PathOps, SegmentOps, line, type Path, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { draftDimensionLine, type DimensionLineSizes } from './dimensionLine.js';

const coordinate = fc.double({ min: -2000, max: 2000, noNaN: true });
const point = fc.record({ x: coordinate, y: coordinate });
const sizes: fc.Arbitrary<DimensionLineSizes> = fc.record({
  arrowLengthMm: fc.double({ min: 0.5, max: 10, noNaN: true }),
  arrowWidthMm: fc.double({ min: 0.1, max: 4, noNaN: true }),
  gapMm: fc.double({ min: 0, max: 40, noNaN: true }),
});
/** Two ends a real distance apart, from a paper's width down to under an arrowhead. */
const ends = fc
  .tuple(
    point,
    fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    fc.oneof(
      fc.double({ min: 0.01, max: 30, noNaN: true }),
      fc.double({ min: 0.01, max: 1000, noNaN: true }),
    ),
  )
  .map(([from, angle, span]) => ({
    from,
    to: { x: from.x + Math.cos(angle) * span, y: from.y + Math.sin(angle) * span },
    span,
  }));

const PRINT_SIZES: DimensionLineSizes = { arrowLengthMm: 2.5, arrowWidthMm: 0.85, gapMm: 8 };

/** How far along from → to a point lies, and how far off that line. */
function along(from: Vec2, to: Vec2, p: Vec2): { s: number; off: number } {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const u = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
  const d = { x: p.x - from.x, y: p.y - from.y };
  return { s: d.x * u.x + d.y * u.y, off: d.x * -u.y + d.y * u.x };
}

const corners = (path: Path): Vec2[] => path.segments.map((segment) => SegmentOps.start(segment));
const near = (a: Vec2, b: Vec2, eps: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= eps;
/** Tolerance for a point that came through a 2000 mm coordinate. */
const EPS = 1e-9 * 4000;

const roomFor = (span: number, s: DimensionLineSizes): boolean =>
  span >= 2 * s.arrowLengthMm + s.gapMm;

describe('a dimension line drawn like drafting (4.10b)', () => {
  it('puts an arrowhead on each end, its tip on the extension line', () => {
    fc.assert(
      fc.property(ends, sizes, ({ from, to }, size) => {
        const { arrowheads } = draftDimensionLine(line(from, to), size);
        if (arrowheads.length !== 2) return false;
        const [atFrom, atTo] = arrowheads.map(corners);
        return near(atFrom![0]!, from, EPS) && near(atTo![0]!, to, EPS);
      }),
    );
  });

  it('makes each arrowhead a closed triangle of its length and width, along the line', () => {
    fc.assert(
      fc.property(ends, sizes, ({ from, to }, size) => {
        const { arrowheads } = draftDimensionLine(line(from, to), size);
        return arrowheads.every((head) => {
          if (!head.closed || head.segments.length !== 3) return false;
          const [tip, left, right] = corners(head) as [Vec2, Vec2, Vec2];
          const base = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
          const a = along(from, to, tip);
          const b = along(from, to, base);
          return (
            Math.abs(Math.abs(a.s - b.s) - size.arrowLengthMm) <= EPS &&
            Math.abs(b.off) <= EPS &&
            Math.abs(Math.hypot(left.x - right.x, left.y - right.y) - size.arrowWidthMm) <= EPS
          );
        });
      }),
    );
  });

  it('keeps the arrowheads inside when they and the number fit, and turns them out when not', () => {
    fc.assert(
      fc.property(ends, sizes, ({ from, to, span }, size) => {
        const { arrowheads } = draftDimensionLine(line(from, to), size);
        const inside = roomFor(span, size);
        return arrowheads.every((head) =>
          corners(head)
            .slice(1)
            .every((corner) => {
              const { s } = along(from, to, corner);
              return inside ? s >= -EPS && s <= span + EPS : s <= EPS || s >= span - EPS;
            }),
        );
      }),
    );
  });

  it('draws the line only on itself, between its ends', () => {
    fc.assert(
      fc.property(ends, sizes, ({ from, to, span }, size) => {
        const { lines } = draftDimensionLine(line(from, to), size);
        return lines.every((piece) =>
          corners(piece)
            .concat(SegmentOps.end(piece.segments.at(-1)!))
            .every((p) => {
              const { s, off } = along(from, to, p);
              return Math.abs(off) <= EPS && s >= -EPS && s <= span + EPS;
            }),
        );
      }),
    );
  });

  it('breaks the line where the number sits, whenever the number fits between the ends', () => {
    fc.assert(
      fc.property(ends, sizes, ({ from, to, span }, size) => {
        const { lines } = draftDimensionLine(line(from, to), size);
        if (span <= size.gapMm) return lines.length === 1;
        const [gapFrom, gapTo] = [(span - size.gapMm) / 2, (span + size.gapMm) / 2];
        return lines.every((piece) => {
          const a = along(from, to, SegmentOps.start(piece.segments[0]!)).s;
          const b = along(from, to, SegmentOps.end(piece.segments.at(-1)!)).s;
          return Math.max(a, b) <= gapFrom + EPS || Math.min(a, b) >= gapTo - EPS;
        });
      }),
    );
  });

  it('leaves no other break: the pieces, the arrowheads and the gap make up the whole line', () => {
    fc.assert(
      fc.property(ends, sizes, ({ from, to, span }, size) => {
        const { lines } = draftDimensionLine(line(from, to), size);
        const drawn = lines.reduce((sum, piece) => sum + PathOps.length(piece), 0);
        const expected = roomFor(span, size)
          ? span - 2 * size.arrowLengthMm - size.gapMm
          : span > size.gapMm
            ? span - size.gapMm
            : span;
        return Math.abs(drawn - expected) <= EPS;
      }),
    );
  });

  it('moves with the line under a rigid motion', () => {
    fc.assert(
      fc.property(
        ends,
        sizes,
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        point,
        ({ from, to }, size, angle, by) => {
          const m = MatOps.compose(MatOps.fromRotation(angle), MatOps.fromTranslation(by));
          const moved = draftDimensionLine(line(MatOps.apply(m, from), MatOps.apply(m, to)), size);
          const original = draftDimensionLine(line(from, to), size);
          const flat = (d: typeof original): Vec2[] =>
            [...d.arrowheads, ...d.lines].flatMap(corners);
          const there = flat(original).map((p) => MatOps.apply(m, p));
          const here = flat(moved);
          return (
            there.length === here.length && there.every((p, k) => near(p, here[k]!, 1e-7 * 8000))
          );
        },
      ),
    );
  });

  it('draws the 97 mm width of a piece as drafting does', () => {
    const { lines, arrowheads } = draftDimensionLine(
      line({ x: 0, y: -8 }, { x: 97, y: -8 }),
      PRINT_SIZES,
    );

    expect(arrowheads.map((head) => corners(head)[0])).toEqual([
      { x: 0, y: -8 },
      { x: 97, y: -8 },
    ]);
    expect(
      lines.map((piece) => [corners(piece)[0]!.x, SegmentOps.end(piece.segments[0]!).x]),
    ).toEqual([
      [2.5, 44.5],
      [52.5, 94.5],
    ]);
  });

  it('draws nothing along a line of no length, which has no direction to point', () => {
    expect(draftDimensionLine(line({ x: 3, y: 4 }, { x: 3, y: 4 }), PRINT_SIZES)).toEqual({
      lines: [],
      arrowheads: [],
    });
  });

  it('refuses sizes no arrowhead can have', () => {
    const at = line({ x: 0, y: 0 }, { x: 50, y: 0 });
    for (const bad of [
      { ...PRINT_SIZES, arrowLengthMm: 0 },
      { ...PRINT_SIZES, arrowWidthMm: -1 },
      { ...PRINT_SIZES, gapMm: -0.1 },
      { ...PRINT_SIZES, gapMm: Number.NaN },
      { ...PRINT_SIZES, arrowLengthMm: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => draftDimensionLine(at, bad)).toThrow(RangeError);
    }
  });
});
