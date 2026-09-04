import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MatOps, RectOps } from '@leathercad/geometry';

import { mmToPixels, pixelsToMm, screenToWorld, visibleBoundsMm, worldToScreen } from './view.js';
import type { ViewportView } from './view.js';

const view: ViewportView = {
  centreMm: { x: 0, y: 0 },
  scale: 4,
  widthPx: 800,
  heightPx: 600,
};

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('worldToScreen', () => {
  it('puts the camera centre in the middle of the canvas', () => {
    const p = MatOps.apply(worldToScreen(view), view.centreMm);
    expect(closeTo(p.x, 400)).toBe(true);
    expect(closeTo(p.y, 300)).toBe(true);
  });

  it('flips Y: a point higher in the model draws higher on screen', () => {
    // CLAUDE.md invariant 2. The model is Y-up, canvas is Y-down, and this is
    // one of only two places that reconcile them. If this ever inverts, every
    // pattern in the application comes out mirrored.
    const m = worldToScreen(view);
    const low = MatOps.apply(m, { x: 0, y: 0 });
    const high = MatOps.apply(m, { x: 0, y: 10 });

    expect(high.y).toBeLessThan(low.y);
  });

  it('does not flip X', () => {
    const m = worldToScreen(view);
    expect(MatOps.apply(m, { x: 10, y: 0 }).x).toBeGreaterThan(MatOps.apply(m, { x: 0, y: 0 }).x);
  });

  it('scales millimetres to pixels exactly', () => {
    const m = worldToScreen(view);
    const a = MatOps.apply(m, { x: 0, y: 0 });
    const b = MatOps.apply(m, { x: 100, y: 0 });
    // 100 mm at 4 px/mm is 400 px. This is the whole product promise, in
    // miniature: a stated millimetre distance maps to a predictable size.
    expect(closeTo(b.x - a.x, 400)).toBe(true);
  });

  it('round-trips through screenToWorld', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (x, y) => {
          const there = MatOps.apply(worldToScreen(view), { x, y });
          const back = MatOps.apply(screenToWorld(view), there);
          return closeTo(back.x, x, 1e-9) && closeTo(back.y, y, 1e-9);
        },
      ),
    );
  });

  it('respects the camera position', () => {
    const moved: ViewportView = { ...view, centreMm: { x: 50, y: 20 } };
    const p = MatOps.apply(worldToScreen(moved), { x: 50, y: 20 });
    expect(closeTo(p.x, 400)).toBe(true);
    expect(closeTo(p.y, 300)).toBe(true);
  });
});

describe('visibleBoundsMm', () => {
  it('covers exactly the canvas', () => {
    const bounds = visibleBoundsMm(view);
    // 800 px at 4 px/mm is 200 mm across, centred on 0.
    expect(closeTo(RectOps.width(bounds), 200)).toBe(true);
    expect(closeTo(RectOps.height(bounds), 150)).toBe(true);
    expect(closeTo(bounds.minX, -100)).toBe(true);
    expect(closeTo(bounds.maxY, 75)).toBe(true);
  });

  it('grows as the scale shrinks', () => {
    const zoomedOut = visibleBoundsMm({ ...view, scale: 1 });
    expect(RectOps.width(zoomedOut)).toBeGreaterThan(RectOps.width(visibleBoundsMm(view)));
  });
});

describe('pixel and millimetre conversion', () => {
  it('are inverses', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 1000, noNaN: true }), (px) =>
        closeTo(mmToPixels(view, pixelsToMm(view, px)), px, 1e-9),
      ),
    );
  });

  it('turn a 10 px pick radius into a millimetre tolerance', () => {
    expect(closeTo(pixelsToMm(view, 10), 2.5)).toBe(true);
  });
});
