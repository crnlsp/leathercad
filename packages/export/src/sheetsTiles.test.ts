import {
  MatOps,
  PathOps,
  RectOps,
  SegmentOps,
  polyline,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';
import {
  CANVAS,
  ROLE_STYLES,
  ZOOM_LIMITS,
  scaleAtZoomPercent,
  worldToScreen,
  type ViewportView,
} from '@leathercad/render';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { itemOf, sceneOf, textOf } from '../test/scenes.js';
import { DEFAULT_PAGE_SETUP } from './paper.js';
import { planSheets } from './sheetPlan.js';
import { sheetsLayers, sheetsPages, type SheetsLayer } from './sheetsDisplay.js';
import { layoutSheets } from './sheetsLayout.js';

/**
 * A taped sheet draws its piece through the clip of its printable area, so it
 * leaves out the paths the clip would hide (PERF-003): for a long strap,
 * almost every one of its holes on almost every sheet. Leaving out a path the
 * clip would have shown is a hole missing from the template on screen, so what
 * is left out is tested to be out of reach at every zoom there is.
 */

const NOW = new Date('2026-09-24T00:00:00.000Z');

/** A strap 2.4 m long: a hole every 16 mm along it, and a word on every tenth. */
const strapScene = (() => {
  const outline = itemOf(
    'cut',
    polyline(
      [
        { x: 0, y: 0 },
        { x: 2400, y: 0 },
        { x: 2400, y: 40 },
        { x: 0, y: 40 },
      ],
      true,
    ),
  );
  const holes = Array.from({ length: 150 }, (_, i) =>
    itemOf(
      'stitch-holes',
      polyline([
        { x: 8 + i * 16, y: 6 },
        { x: 8 + i * 16 + 1, y: 6 },
      ]),
    ),
  );
  const words = Array.from({ length: 15 }, (_, i) =>
    textOf('annotation', `hole ${String(i * 10)}`, { x: 8 + i * 160, y: 20 }),
  );
  return sceneOf([outline, ...holes], words, 'Strap');
})();

const plan = planSheets(strapScene, DEFAULT_PAGE_SETUP);
const layout = layoutSheets(plan);
const pages = sheetsPages(plan, layout, { now: NOW });
const tiles = pages.flatMap((page) => (page.tile === null ? [] : [{ page, tile: page.tile }]));
const part = strapScene.parts[0]!;
const emphasis = { selected: new Set(['part-1']) };

/** A path's place, to tell whether a moved copy of it was drawn. */
const keyOf = (box: Rect): string => `${box.minX.toFixed(6)},${box.minY.toFixed(6)}`;

/** Which of the part's paths and contours a layer drew, moved by `at`. */
function drawnKeys(layer: SheetsLayer): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const item of layer.list.items) {
    const paths = item.kind === 'path' ? [item.path] : item.kind === 'fill' ? item.paths : [];
    for (const path of paths) {
      const box = PathOps.bbox(path);
      if (box !== null) keys.add(keyOf(box));
    }
  }
  return keys;
}

const moved = (box: Rect, at: Vec2): Rect => RectOps.translate(box, at);

/** Any camera there is: at any zoom from the smallest to the largest, on a 1x or a 2x display. */
const arbView: fc.Arbitrary<ViewportView> = fc
  .record({
    centreMm: fc.record({
      x: fc.double({ min: -500, max: 3500, noNaN: true }),
      y: fc.double({ min: -500, max: 500, noNaN: true }),
    }),
    percent: fc.oneof(
      fc.double({ min: ZOOM_LIMITS.min, max: ZOOM_LIMITS.max, noNaN: true }),
      fc.constantFrom(ZOOM_LIMITS.min, ZOOM_LIMITS.max),
    ),
    widthPx: fc.integer({ min: 200, max: 1800 }),
    heightPx: fc.integer({ min: 200, max: 1200 }),
    dpr: fc.constantFrom(1, 2),
  })
  .map(({ percent, dpr, ...rest }) => ({ ...rest, dpr, scale: scaleAtZoomPercent(percent, dpr) }));

describe('what a taped sheet leaves out of its piece', () => {
  it('is a long strap taped across many sheets, most of it off each', () => {
    expect(tiles.length).toBeGreaterThan(10);
  });

  it('leaves out most of the holes of a strap on each sheet, and none that the sheet shows', () => {
    const all = part.paths.length + part.texts.length;
    for (const { page, tile } of tiles) {
      const at = page.pieces[0]!.at;
      expect(tile.list.items.length).toBeLessThan(all * 0.4);
      // Every hole whose slit lies inside the clip is there.
      for (const { path } of part.paths) {
        const box = moved(PathOps.bbox(path)!, at);
        if (RectOps.containsRect(tile.clipMm!, box))
          expect(drawnKeys(tile).has(keyOf(box))).toBe(true);
      }
    }
  });

  it('leaves out only what the clip hides at any zoom, whatever its stroke or halo', () => {
    // Un-emphasised and emphasised: the halo is a wide stroke round each path too.
    for (const given of [{}, emphasis]) {
      const layers = sheetsLayers(pages, undefined, given);
      const drawn = layers.filter((layer) => layer.clipMm !== null);
      fc.assert(
        fc.property(arbView, (view) => {
          const toScreen = worldToScreen(view);
          return tiles.every(({ page }, i) => {
            const layer = drawn[i]!;
            const at = page.pieces[0]!.at;
            const clipPx = RectOps.fromPoints(
              RectOps.corners(layer.clipMm!).map((corner) => MatOps.apply(toScreen, corner)),
            )!;
            const outside = (point: Vec2): number => {
              const p = MatOps.apply(toScreen, point);
              return Math.max(
                clipPx.minX - p.x,
                p.x - clipPx.maxX,
                clipPx.minY - p.y,
                p.y - clipPx.maxY,
              );
            };
            const along = (path: Path): Vec2[] =>
              path.segments
                .flatMap((segment) =>
                  Array.from({ length: 5 }, (_, k) => SegmentOps.pointAt(segment, k / 4)),
                )
                .map((point) => ({ x: point.x + at.x, y: point.y + at.y }));
            const kept = drawnKeys(layer);
            // What each path puts past its line: half its stroke, or a halo's half
            // when it is emphasised; a word's contours are filled and reach no further.
            const halo = given === emphasis ? CANVAS.halo.widthPx / 2 : 0;
            const everything = [
              ...part.paths.map(({ path, role }) => ({
                path,
                reachPx: Math.max(ROLE_STYLES[role].widthPx / 2, halo),
              })),
              ...part.texts.flatMap((text) => text.glyphs.map((path) => ({ path, reachPx: 0 }))),
            ];
            return everything.every(({ path, reachPx }) => {
              const box = moved(PathOps.bbox(path)!, at);
              return (
                kept.has(keyOf(box)) ||
                along(path).every((point) => outside(point) > reachPx * view.dpr)
              );
            });
          });
        }),
        { numRuns: 100 },
      );
    }
  });
});
