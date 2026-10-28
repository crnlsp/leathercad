import { PathOps, RectOps, SegmentOps, Shapes, type Rect } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arbItems, arbPoint } from '../../test/scenes.js';
import { inkReaches } from './reach.js';

/**
 * A tiled sheet leaves out what its clip hides whole (PERF-002). Leaving out
 * one thing it shows would cut a hole off the template without a word, so the
 * rule is tested for what it must never do first.
 */

const arbArea: fc.Arbitrary<Rect> = fc
  .tuple(
    arbPoint,
    fc.double({ min: 1, max: 300, noNaN: true }),
    fc.double({ min: 1, max: 300, noNaN: true }),
  )
  .map(([corner, width, height]) => RectOps.fromOriginSize(corner, width, height));

describe('what a tiled sheet leaves out', () => {
  it('never leaves out a path whose stroke reaches the sheet, however little', () => {
    fc.assert(
      fc.property(
        arbItems,
        arbArea,
        arbPoint,
        fc.double({ min: 0, max: 2, noNaN: true }),
        (items, area, offset, widthMm) => {
          for (const { path } of items) {
            // Points along the path, every segment sampled finely: if the ink
            // around any of them is on the sheet, the path must be kept.
            const inked = RectOps.expand(area, widthMm / 2);
            const touches = path.segments.some((segment) =>
              Array.from({ length: 65 }, (_, i) => SegmentOps.pointAt(segment, i / 64)).some(
                (point) =>
                  RectOps.containsPoint(inked, {
                    x: point.x + offset.x,
                    y: point.y + offset.y,
                  }),
              ),
            );
            if (touches) expect(inkReaches(path, offset, area, widthMm)).toBe(true);
          }
        },
      ),
    );
  });

  it('never leaves out a path that reaches the sheet only by its stroke', () => {
    // The sheet set beside a point of the path, short of it by less than half
    // the stroke: the line itself never enters, its ink does.
    fc.assert(
      fc.property(
        arbItems,
        fc.nat(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom('left', 'right', 'below', 'above'),
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        fc.double({ min: 0.01, max: 2, noNaN: true }),
        (items, which, t, side, short, widthMm) => {
          const { path } = items[which % items.length]!;
          const point = SegmentOps.pointAt(path.segments[which % path.segments.length]!, t);
          const gap = (short * widthMm) / 2;
          const area =
            side === 'right'
              ? RectOps.fromOriginSize({ x: point.x + gap, y: point.y - 25 }, 50, 50)
              : side === 'left'
                ? RectOps.fromOriginSize({ x: point.x - gap - 50, y: point.y - 25 }, 50, 50)
                : side === 'above'
                  ? RectOps.fromOriginSize({ x: point.x - 25, y: point.y + gap }, 50, 50)
                  : RectOps.fromOriginSize({ x: point.x - 25, y: point.y - gap - 50 }, 50, 50);
          expect(inkReaches(path, { x: 0, y: 0 }, area, widthMm)).toBe(true);
        },
      ),
    );
  });

  it('keeps a hole outside the sheet whose stroke still reaches over its edge', () => {
    const area = RectOps.fromOriginSize({ x: 0, y: 0 }, 100, 100);
    // Its circle's edge is 0.1 mm past the sheet's right edge; a 0.3 mm
    // stroke puts 0.15 mm of ink either side of it.
    const hole = Shapes.circle({ x: 100.6, y: 50 }, 0.5);
    expect(inkReaches(hole, { x: 0, y: 0 }, area, 0.3)).toBe(true);
  });

  it('keeps a filled word whose box only touches the sheet', () => {
    const area = RectOps.fromOriginSize({ x: 0, y: 0 }, 100, 100);
    const glyph = PathOps.polyline(
      [
        { x: 100, y: 10 },
        { x: 104, y: 10 },
        { x: 104, y: 14 },
      ],
      true,
    );
    expect(inkReaches(glyph, { x: 0, y: 0 }, area, 0)).toBe(true);
  });

  it('leaves out a hole a tile away, as the next sheet prints it', () => {
    const area = RectOps.fromOriginSize({ x: 0, y: 0 }, 190, 277);
    const hole = Shapes.circle({ x: 400, y: 50 }, 0.5);
    expect(inkReaches(hole, { x: 0, y: 0 }, area, 0.3)).toBe(false);
  });

  it('places the path by the offset the sheet gives it', () => {
    const area = RectOps.fromOriginSize({ x: 0, y: 0 }, 190, 277);
    const hole = Shapes.circle({ x: 400, y: 50 }, 0.5);
    expect(inkReaches(hole, { x: -300, y: 0 }, area, 0.3)).toBe(true);
  });
});
