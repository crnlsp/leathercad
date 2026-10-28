import { MatOps, SegmentOps, polyline, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EDGE_PX, extentOf, reachesView, unionExtent, type BoundedItem } from './extent.js';
import { worldToScreen, type ViewportView } from './view.js';

/**
 * The Sheets view leaves out a page the camera cannot see (PERF-003). Leaving
 * out one it can see would blank part of the paper, so the rule is tested for
 * what it must never do first — against the screen transform, not against the
 * millimetre arithmetic it is built from.
 */

const arbView: fc.Arbitrary<ViewportView> = fc.record({
  centreMm: fc.record({
    x: fc.double({ min: -3000, max: 3000, noNaN: true }),
    y: fc.double({ min: -3000, max: 3000, noNaN: true }),
  }),
  // From the zoom limits at 1 % to 10 000 % on a 1x display, and 2x of both.
  scale: fc.double({ min: 0.0378, max: 378, noNaN: true }),
  widthPx: fc.integer({ min: 200, max: 3000 }),
  heightPx: fc.integer({ min: 200, max: 2000 }),
  dpr: fc.constantFrom(1, 1.25, 2),
});

const arbPoint: fc.Arbitrary<Vec2> = fc.record({
  x: fc.double({ min: -4000, max: 4000, noNaN: true }),
  y: fc.double({ min: -4000, max: 4000, noNaN: true }),
});

const arbDirection = fc.double({ min: 0, max: 2 * Math.PI, noNaN: true });

/** Where a device pixel of the canvas is, so inside means on the canvas. */
function onCanvas(view: ViewportView, at: Vec2): boolean {
  return at.x >= 0 && at.x <= view.widthPx && at.y >= 0 && at.y <= view.heightPx;
}

const word = (at: Vec2, text: string, sizePx = 12): BoundedItem => ({
  kind: 'overlay-text',
  role: 'construction',
  at,
  text,
  sizePx,
  colour: '#000',
});

const line = (a: Vec2, b: Vec2, widthPx = 1): BoundedItem => ({
  kind: 'path',
  role: 'cut',
  path: polyline([a, b]),
  stroke: { colour: '#000', widthPx },
});

describe('what a page can reach (extentOf)', () => {
  it('has the box of a path and half its width, and a pixel for the edge', () => {
    const extent = extentOf([line({ x: 1, y: 2 }, { x: 11, y: 7 }, 4)]);
    expect(extent?.boundsMm).toEqual({ minX: 1, minY: 2, maxX: 11, maxY: 7 });
    expect(extent?.marginPx).toBe(2 + EDGE_PX);
  });

  it('has nothing for items that draw nothing', () => {
    expect(extentOf([])).toBeNull();
    expect(extentOf([{ kind: 'fill', role: 'cut', paths: [], colour: '#000' }])).toBeNull();
  });

  it('holds every item, with the widest margin', () => {
    const extent = extentOf([
      line({ x: 0, y: 0 }, { x: 5, y: 0 }),
      word({ x: 40, y: 30 }, 'Sheet 3 of 33', 12),
    ])!;
    expect(extent.boundsMm).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 30 });
    expect(extent.marginPx).toBeGreaterThanOrEqual('Sheet 3 of 33'.length * 12);
  });

  it('is the same whichever way two extents are joined', () => {
    const a = extentOf([line({ x: 0, y: 0 }, { x: 5, y: 1 }, 3)])!;
    const b = extentOf([word({ x: 9, y: 9 }, 'x')])!;
    expect(unionExtent(a, b)).toEqual(unionExtent(b, a));
  });
});

describe('what the camera can see (reachesView)', () => {
  it('never leaves out a word the canvas shows any of, however far the page is from it', () => {
    fc.assert(
      fc.property(
        arbView,
        arbPoint,
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 8, max: 20 }),
        // A pixel of the word, anywhere within its reach of where it is placed.
        arbDirection,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (view, at, text, sizePx, direction, fraction) => {
          const extent = extentOf([word(at, text, sizePx)])!;
          const anchor = MatOps.apply(worldToScreen(view), at);
          // The furthest a character is from its anchor, in device pixels.
          const reach = text.length * sizePx * view.dpr * fraction;
          const inked = {
            x: anchor.x + Math.cos(direction) * reach,
            y: anchor.y + Math.sin(direction) * reach,
          };
          if (onCanvas(view, inked)) expect(reachesView(view, extent)).toBe(true);
        },
      ),
    );
  });

  it('never leaves out a line whose stroke reaches the canvas, however little', () => {
    fc.assert(
      fc.property(
        arbView,
        arbPoint,
        arbPoint,
        fc.double({ min: 0.5, max: 12, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        arbDirection,
        (view, a, b, widthPx, along, direction) => {
          const item = line(a, b, widthPx);
          if (item.kind !== 'path') throw new Error('not a path');
          const extent = extentOf([item])!;
          const [segment] = item.path.segments;
          const on = MatOps.apply(worldToScreen(view), SegmentOps.pointAt(segment!, along));
          // A pixel the stroke covers: up to half its width from the line.
          const half = (widthPx / 2) * view.dpr;
          const inked = {
            x: on.x + Math.cos(direction) * half,
            y: on.y + Math.sin(direction) * half,
          };
          if (onCanvas(view, inked)) expect(reachesView(view, extent)).toBe(true);
        },
      ),
    );
  });

  it('counts touching the canvas as reaching it', () => {
    const view: ViewportView = {
      centreMm: { x: 0, y: 0 },
      scale: 2,
      widthPx: 200,
      heightPx: 200,
      dpr: 1,
    };
    // At 2 px a millimetre the canvas shows x from -50 to 50 mm.
    const edge = 50;
    const touching = { boundsMm: { minX: edge, minY: 0, maxX: edge + 5, maxY: 5 }, marginPx: 0 };
    expect(reachesView(view, touching)).toBe(true);
    expect(
      reachesView(view, { ...touching, boundsMm: { ...touching.boundsMm, minX: edge + 1 } }),
    ).toBe(false);
  });

  it('leaves out a page far off a canvas that shows another', () => {
    const view: ViewportView = {
      centreMm: { x: 0, y: 0 },
      scale: 1,
      widthPx: 400,
      heightPx: 300,
      dpr: 1,
    };
    const near = extentOf([line({ x: -10, y: -10 }, { x: 10, y: 10 })])!;
    const far = extentOf([line({ x: 5000, y: 0 }, { x: 5100, y: 10 })])!;
    expect(reachesView(view, near)).toBe(true);
    expect(reachesView(view, far)).toBe(false);
  });

  it('is the same on a 2x display as on a 1x display showing the same millimetres', () => {
    fc.assert(
      fc.property(arbView, arbPoint, arbPoint, (view, a, b) => {
        const extent = extentOf([line(a, b)])!;
        // The same millimetres on screen, at twice the pixels: CSS sizes are
        // the same, so the answer is.
        const doubled: ViewportView = {
          ...view,
          scale: view.scale * 2,
          widthPx: view.widthPx * 2,
          heightPx: view.heightPx * 2,
          dpr: view.dpr * 2,
        };
        expect(reachesView(doubled, extent)).toBe(reachesView(view, extent));
      }),
    );
  });
});
