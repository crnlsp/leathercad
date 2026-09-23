import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RectOps } from '@leathercad/geometry';

import { Viewport } from './viewport.js';

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

function makeViewport(): Viewport {
  const v = new Viewport();
  v.resize(800, 600, 1);
  v.scale = 4;
  v.centreMm = { x: 0, y: 0 };
  return v;
}

describe('coordinate conversion', () => {
  it('round-trips a point', () => {
    const v = makeViewport();
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (x, y) => {
          const back = v.toWorld(v.toScreen({ x, y }));
          return closeTo(back.x, x, 1e-9) && closeTo(back.y, y, 1e-9);
        },
      ),
    );
  });

  it('puts the camera centre at the middle of the canvas', () => {
    const v = makeViewport();
    const p = v.toScreen({ x: 0, y: 0 });
    expect(closeTo(p.x, 400)).toBe(true);
    expect(closeTo(p.y, 300)).toBe(true);
  });

  it('converts a CSS pointer position through the device pixel ratio', () => {
    const v = makeViewport();
    v.resize(1600, 1200, 2);
    // At dpr 2 the backing store is twice the CSS size, so the CSS centre is
    // still the millimetre centre.
    const p = v.fromCssPoint(400, 300);
    expect(closeTo(p.x, 0)).toBe(true);
    expect(closeTo(p.y, 0)).toBe(true);
  });

  it('turns a 10 px pick radius into millimetres', () => {
    const v = makeViewport();
    expect(closeTo(v.pickToleranceMm(10), 2.5)).toBe(true);
    v.scale = 20;
    expect(closeTo(v.pickToleranceMm(10), 0.5)).toBe(true);
  });
});

describe('zoomAt', () => {
  it('keeps the millimetre point under the cursor fixed', () => {
    // The property that makes wheel zoom feel like moving the drawing rather
    // than the camera. Zooming about the canvas centre instead feels wrong
    // immediately.
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 800, noNaN: true }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.double({ min: 0.2, max: 5, noNaN: true }),
        (px, py, factor) => {
          const v = makeViewport();
          const anchor = { x: px, y: py };
          const before = v.toWorld(anchor);
          v.zoomAt(anchor, factor);
          const after = v.toWorld(anchor);
          return closeTo(before.x, after.x, 1e-6) && closeTo(before.y, after.y, 1e-6);
        },
      ),
    );
  });

  it('multiplies the scale', () => {
    const v = makeViewport();
    v.zoomAt({ x: 400, y: 300 }, 2);
    expect(closeTo(v.scale, 8)).toBe(true);
  });

  it('clamps rather than letting zoom run away', () => {
    const v = makeViewport();
    for (let i = 0; i < 100; i++) v.zoomAt({ x: 400, y: 300 }, 2);
    expect(v.scale).toBe(Viewport.MAX_SCALE);

    for (let i = 0; i < 200; i++) v.zoomAt({ x: 400, y: 300 }, 0.5);
    expect(v.scale).toBe(Viewport.MIN_SCALE);
  });

  it('holds the anchor even at the clamp', () => {
    const v = makeViewport();
    v.scale = Viewport.MAX_SCALE;
    const anchor = { x: 123, y: 456 };
    const before = v.toWorld(anchor);
    v.zoomAt(anchor, 4);
    expect(closeTo(v.toWorld(anchor).x, before.x, 1e-6)).toBe(true);
  });
});

describe('panByPx', () => {
  it('moves by an exact millimetre amount', () => {
    const v = makeViewport();
    v.panByPx(40, 0);
    // 40 px at 4 px/mm is 10 mm, and dragging right moves the camera left.
    expect(closeTo(v.centreMm.x, -10)).toBe(true);
  });

  it('moves the camera up when dragging down, because Y is flipped', () => {
    const v = makeViewport();
    v.panByPx(0, 40);
    expect(closeTo(v.centreMm.y, 10)).toBe(true);
  });

  it('keeps the drawing under the cursor while dragging', () => {
    const v = makeViewport();
    const start = { x: 100, y: 100 };
    const grabbed = v.toWorld(start);
    v.panByPx(37, -19);
    const nowAt = v.toWorld({ x: start.x + 37, y: start.y - 19 });
    expect(closeTo(grabbed.x, nowAt.x, 1e-9)).toBe(true);
    expect(closeTo(grabbed.y, nowAt.y, 1e-9)).toBe(true);
  });

  it('is reversible', () => {
    const v = makeViewport();
    v.panByPx(13, -27);
    v.panByPx(-13, 27);
    expect(closeTo(v.centreMm.x, 0)).toBe(true);
    expect(closeTo(v.centreMm.y, 0)).toBe(true);
  });
});

describe('fitTo', () => {
  it('centres on the content', () => {
    const v = makeViewport();
    v.fitTo(RectOps.fromCorners({ x: 10, y: 20 }, { x: 110, y: 95 }));
    expect(closeTo(v.centreMm.x, 60)).toBe(true);
    expect(closeTo(v.centreMm.y, 57.5)).toBe(true);
  });

  it('makes the content fit inside the padding', () => {
    const v = makeViewport();
    const bounds = RectOps.fromCorners({ x: 0, y: 0 }, { x: 105, y: 75 });
    v.fitTo(bounds, 40);

    const visible = v.visibleBounds();
    expect(RectOps.containsRect(visible, bounds)).toBe(true);
    // And not wastefully far out: the content should fill most of the canvas.
    expect(RectOps.width(visible)).toBeLessThan(RectOps.width(bounds) * 2);
  });

  it('uses the tighter of the two axes', () => {
    const v = makeViewport();
    // Very wide content on a 800x600 canvas must be limited by width.
    v.fitTo(RectOps.fromCorners({ x: 0, y: 0 }, { x: 1000, y: 10 }), 0);
    expect(closeTo(v.scale, 0.8)).toBe(true);
  });

  it('keeps the current zoom for a degenerate bound', () => {
    const v = makeViewport();
    const before = v.scale;
    v.fitTo(RectOps.fromCorners({ x: 5, y: 5 }, { x: 5, y: 5 }));
    expect(v.scale).toBe(before);
    expect(closeTo(v.centreMm.x, 5)).toBe(true);
  });
});

describe('visibleBounds', () => {
  it('matches the canvas size in millimetres', () => {
    const v = makeViewport();
    const bounds = v.visibleBounds();
    expect(closeTo(RectOps.width(bounds), 200)).toBe(true);
    expect(closeTo(RectOps.height(bounds), 150)).toBe(true);
  });

  it('contains the camera centre', () => {
    const v = makeViewport();
    v.centreMm = { x: 42, y: -17 };
    expect(RectOps.containsPoint(v.visibleBounds(), v.centreMm)).toBe(true);
  });
});

describe('reframe', () => {
  // F.3. When the canvas's box changes — the problems drawer opens, the rail
  // collapses, the window is resized — the drawing must not move on screen.
  // Holding the world point at the canvas *centre* is what moved it: the
  // centre itself moves when an edge does, by half the change (~8.7 mm).
  const size = fc.integer({ min: 200, max: 2000 });
  const shift = fc.integer({ min: -300, max: 300 });

  it('keeps every window point over the same millimetre', () => {
    fc.assert(
      fc.property(size, size, size, size, shift, shift, (w, h, w2, h2, dx, dy) => {
        const v = new Viewport();
        v.resize(w, h, 1);
        v.scale = 3;
        v.centreMm = { x: 60, y: 40 };

        // A window point, expressed in the old canvas and in the new one,
        // whose top-left has moved by (dx, dy).
        const windowPoint = { x: 150, y: 120 };
        const before = v.toWorld(windowPoint);

        v.reframe(w2, h2, { x: dx, y: dy });
        const after = v.toWorld({ x: windowPoint.x - dx, y: windowPoint.y - dy });

        return closeTo(after.x, before.x) && closeTo(after.y, before.y);
      }),
    );
  });

  it('does not zoom', () => {
    const v = new Viewport();
    v.resize(800, 600, 1);
    v.scale = 3;
    v.reframe(800, 652, { x: 0, y: -52 });
    expect(v.scale).toBeCloseTo(3, 12);
  });

  it('moves nothing when only the far edges move', () => {
    // A drawer opening below the canvas takes height from the bottom: the top
    // edge is where it was, so nothing above the drawer may shift.
    const v = new Viewport();
    v.resize(620, 700, 1);
    v.scale = 3;
    v.centreMm = { x: 60, y: 40 };
    const topLeft = v.toWorld({ x: 0, y: 0 });

    v.reframe(620, 480, { x: 0, y: 0 });

    const after = v.toWorld({ x: 0, y: 0 });
    expect(after.x).toBeCloseTo(topLeft.x, 9);
    expect(after.y).toBeCloseTo(topLeft.y, 9);
  });
});
