import { MatOps, RectOps, SegmentOps, polyline, type Path, type Vec2 } from '@leathercad/geometry';
import { worldToScreen, type DisplayItem, type ViewportView } from '@leathercad/render';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SETUP } from './paper.js';
import { PRINT_STYLES, type ExportPart } from './scene.js';
import { planSheets } from './sheetPlan.js';
import { sheetsLayers, sheetsPages, sheetsView, type SheetsLayer } from './sheetsDisplay.js';
import { layoutSheets } from './sheetsLayout.js';

/**
 * The Sheets view leaves out the pages the camera cannot see (PERF-003).
 * Leaving out a page it can see any of would blank part of the paper, so the
 * rule is tested for what it must never do first — against the screen
 * transform, not against the arithmetic that chose.
 */

const NOW = new Date('2026-09-24T00:00:00.000Z');

function outlined(id: string, widthMm: number, heightMm: number): ExportPart {
  const corners = [
    { x: 0, y: 0 },
    { x: widthMm, y: 0 },
    { x: widthMm, y: heightMm },
    { x: 0, y: heightMm },
  ];
  return {
    id,
    name: id,
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x: 0, y: 0 }, { x: widthMm, y: heightMm }),
    paths: [{ role: 'cut', style: PRINT_STYLES.cut, path: polyline(corners, true) }],
    texts: [],
  };
}

// Twelve sheets in rows of five, each holding a panel, and a strap taped
// across five more: whole sheets, tiled sheets and a taped piece's name.
const panels = Array.from({ length: 12 }, (_, i) => outlined(`panel-${String(i)}`, 180, 250));
const plan = planSheets(
  { projectName: 'Test', parts: [...panels, outlined('strap', 900, 40)] },
  DEFAULT_PAGE_SETUP,
);
const layout = layoutSheets(plan);
const options = { now: NOW, selected: new Set(['panel-3', 'strap']), hovered: 'panel-7' };
const pages = sheetsPages(plan, layout, options);
const everything = sheetsLayers(pages);

const arbView: fc.Arbitrary<ViewportView> = fc.record({
  centreMm: fc.record({
    x: fc.double({ min: -300, max: 1700, noNaN: true }),
    y: fc.double({ min: -1500, max: 300, noNaN: true }),
  }),
  scale: fc.double({ min: 0.05, max: 6, noNaN: true }),
  widthPx: fc.integer({ min: 200, max: 1800 }),
  heightPx: fc.integer({ min: 200, max: 1200 }),
  dpr: fc.constantFrom(1, 2),
});

/** The items of layers, in the order they are drawn. */
const itemsOf = (layers: readonly SheetsLayer[]): readonly DisplayItem[] =>
  layers.flatMap((layer) => layer.list.items);

/** Where a rectangle of the view lands on the canvas, in device pixels. */
const onScreen = (view: ViewportView, area: ReturnType<typeof RectOps.fromCorners>) =>
  RectOps.fromPoints(RectOps.corners(area).map((c) => MatOps.apply(worldToScreen(view), c)))!;

const canvasOf = (view: ViewportView) =>
  RectOps.fromCorners({ x: 0, y: 0 }, { x: view.widthPx, y: view.heightPx });

describe('which pages the Sheets view draws', () => {
  it('draws every page when the camera sees them all', () => {
    const wide: ViewportView = {
      centreMm: RectOps.centre(layout.extent),
      scale: 0.01,
      widthPx: 4000,
      heightPx: 4000,
      dpr: 1,
    };
    expect(sheetsLayers(pages, wide)).toEqual(everything);
    expect(sheetsView(plan, layout, options)).toEqual(everything);
  });

  it('draws what it keeps as it always drew it: the same items, in the same order', () => {
    const order = new Map(itemsOf(everything).map((item, i) => [item, i]));
    fc.assert(
      fc.property(arbView, (view) => {
        const kept = sheetsLayers(pages, view);
        // A subsequence, by identity: nothing moved, nothing drawn twice.
        const places = itemsOf(kept).map((item) => order.get(item) ?? -1);
        const inOrder = places.every((at, i) => at >= 0 && (i === 0 || at > places[i - 1]!));
        // Paper under everything, taped sheets' pieces over it, as always.
        const layered = kept[0]!.clipMm === null && kept.slice(1).every((l) => l.clipMm !== null);
        return inOrder && layered;
      }),
      { numRuns: 200 },
    );
  });

  it('keeps every sheet whose paper the camera shows any of, whole — even only its edge', () => {
    fc.assert(
      fc.property(arbView, (view) => {
        const layers = sheetsLayers(pages, view);
        const kept = new Set(itemsOf(layers));
        return layout.frames.every((frame) => {
          const page = pages[frame.index]!;
          const paper = RectOps.fromOriginSize(frame.origin, frame.widthMm, frame.heightMm);
          if (!RectOps.intersects(onScreen(view, paper), canvasOf(view), 0)) return true;
          return (
            [...page.paper, ...page.base].every((item) => kept.has(item)) &&
            (page.tile === null || layers.includes(page.tile))
          );
        });
      }),
      { numRuns: 200 },
    );
  });

  it('leaves out only what lies off the canvas, however far its stroke or its words reach', () => {
    // A taped sheet's piece is clipped, so for it only the clip reaches.
    const unclipped = itemsOf(everything.slice(0, 1));
    fc.assert(
      fc.property(arbView, (view) => {
        const kept = new Set(itemsOf(sheetsLayers(pages, view)));
        const canvas = canvasOf(view);
        /** Device pixels from the canvas, by the furthest of x and y. */
        const outside = (at: Vec2): number => {
          const p = MatOps.apply(worldToScreen(view), at);
          return Math.max(
            canvas.minX - p.x,
            p.x - canvas.maxX,
            canvas.minY - p.y,
            p.y - canvas.maxY,
          );
        };
        const along = (path: Path): Vec2[] =>
          path.segments.flatMap((segment) =>
            Array.from({ length: 9 }, (_, i) => SegmentOps.pointAt(segment, i / 8)),
          );
        const clear = (item: DisplayItem): boolean => {
          if (item.kind === 'path') {
            const reach = (item.stroke.widthPx / 2) * view.dpr;
            return along(item.path).every((at) => outside(at) > reach);
          }
          if (item.kind === 'fill') {
            return item.paths.every((path) => along(path).every((at) => outside(at) > 0));
          }
          if (item.kind === 'overlay-text') {
            return outside(item.at) > item.text.length * item.sizePx * view.dpr;
          }
          return false;
        };

        return (
          unclipped.every((item) => kept.has(item) || clear(item)) &&
          everything.slice(1).every((layer) => {
            const first = layer.list.items[0];
            return (
              first === undefined ||
              kept.has(first) ||
              !RectOps.intersects(onScreen(view, layer.clipMm!), canvas, 0)
            );
          })
        );
      }),
      { numRuns: 100 },
    );
  });

  it('draws fewer pages when the camera is close, and none when it looks away', () => {
    const close: ViewportView = {
      centreMm: { x: 105, y: -140 },
      scale: 3,
      widthPx: 800,
      heightPx: 600,
      dpr: 1,
    };
    const away: ViewportView = { ...close, centreMm: { x: 1e6, y: 1e6 } };
    expect(itemsOf(sheetsLayers(pages, close)).length).toBeLessThan(itemsOf(everything).length / 4);
    expect(itemsOf(sheetsLayers(pages, away))).toEqual([]);
  });
});
