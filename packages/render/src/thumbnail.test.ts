import { approxEq } from '@leathercad/core';
import { MatOps, PathOps, Shapes, path } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { thumbnailPath, thumbnailView } from './thumbnail.js';
import { worldToScreen } from './view.js';

/** A piece's outline, anywhere on the board, from a card slot to a tote's side. */
const outlines = fc
  .record({
    x: fc.double({ min: -500, max: 500, noNaN: true }),
    y: fc.double({ min: -500, max: 500, noNaN: true }),
    width: fc.double({ min: 1, max: 600, noNaN: true }),
    height: fc.double({ min: 1, max: 600, noNaN: true }),
    radius: fc.double({ min: 0, max: 0.45, noNaN: true }),
  })
  .map(({ x, y, width, height, radius }) =>
    Shapes.roundedRect({ x, y }, width, height, radius * Math.min(width, height)),
  );

/** The boxes a thumbnail is drawn in: the Parts strip's, U.8's tree row's, and others. */
const boxes = fc.record({
  width: fc.integer({ min: 8, max: 64 }),
  height: fc.integer({ min: 8, max: 64 }),
});

/** Where an outline lands on screen, in the box's pixels. */
function placed(outline: ReturnType<typeof Shapes.rect>, box: { width: number; height: number }) {
  const view = thumbnailView(PathOps.bbox(outline)!, box)!;
  return PathOps.bbox(PathOps.transform(outline, worldToScreen(view)))!;
}

const EPS = 1e-6;

describe('thumbnailView', () => {
  it('fits any outline inside its box, a pixel in from each edge', () => {
    fc.assert(
      fc.property(outlines, boxes, (outline, box) => {
        const at = placed(outline, box);
        expect(at.minX).toBeGreaterThanOrEqual(1 - EPS);
        expect(at.minY).toBeGreaterThanOrEqual(1 - EPS);
        expect(at.maxX).toBeLessThanOrEqual(box.width - 1 + EPS);
        expect(at.maxY).toBeLessThanOrEqual(box.height - 1 + EPS);
      }),
    );
  });

  it('is as large as the box allows: it touches the inset on one axis', () => {
    fc.assert(
      fc.property(outlines, boxes, (outline, box) => {
        const at = placed(outline, box);
        const fillsWidth = approxEq(at.maxX - at.minX, box.width - 2, EPS);
        const fillsHeight = approxEq(at.maxY - at.minY, box.height - 2, EPS);
        expect(fillsWidth || fillsHeight).toBe(true);
      }),
    );
  });

  it('keeps the piece’s proportions, and centres it', () => {
    fc.assert(
      fc.property(outlines, boxes, (outline, box) => {
        const mm = PathOps.bbox(outline)!;
        const at = placed(outline, box);
        const ratio = (mm.maxX - mm.minX) / (mm.maxY - mm.minY);
        expect((at.maxX - at.minX) / (at.maxY - at.minY)).toBeCloseTo(ratio, 6);
        expect(at.minX).toBeCloseTo(box.width - at.maxX, 6);
        expect(at.minY).toBeCloseTo(box.height - at.maxY, 6);
      }),
    );
  });

  it('keeps Y up: the top of the piece is at the top of the box', () => {
    // A pocket's scoop at its top must not show at the bottom of its thumbnail.
    const view = thumbnailView(
      { minX: 0, minY: 0, maxX: 40, maxY: 20 },
      { width: 24, height: 16 },
    )!;
    const top = MatOps.apply(worldToScreen(view), { x: 20, y: 20 });
    const bottom = MatOps.apply(worldToScreen(view), { x: 20, y: 0 });
    expect(top.y).toBeLessThan(bottom.y);
  });

  it('has nothing to fit for a point', () => {
    expect(thumbnailView({ minX: 3, minY: 3, maxX: 3, maxY: 3 }, { width: 24, height: 16 })).toBe(
      null,
    );
  });

  it('fits a line by its length alone', () => {
    const view = thumbnailView({ minX: 0, minY: 5, maxX: 44, maxY: 5 }, { width: 24, height: 16 })!;
    // 22 px for 44 mm.
    expect(view.scale).toBeCloseTo(0.5, 9);
  });
});

describe('thumbnailPath', () => {
  it('draws a rectangle on its fitted corners', () => {
    // 40 × 20 mm into 24 × 16 px: 0.55 px a mm by the width, so 22 × 11, centred.
    const d = thumbnailPath(Shapes.rect({ x: 100, y: -50 }, 40, 20), { width: 24, height: 16 });
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const points = [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(points.length).toBeGreaterThanOrEqual(4);
    for (const [x, y] of points) {
      expect([1, 23]).toContain(x);
      expect([2.5, 13.5]).toContain(y);
    }
  });

  it('keeps an arc an arc', () => {
    const d = thumbnailPath(Shapes.roundedRect({ x: 0, y: 0 }, 80, 40, 10), {
      width: 24,
      height: 16,
    });
    expect(d).toMatch(/ A /);
  });

  it('draws nothing for an empty outline', () => {
    expect(thumbnailPath(path([], false), { width: 24, height: 16 })).toBe('');
  });
});
