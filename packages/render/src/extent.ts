import { PathOps, RectOps, type Path, type Rect, type Vec2 } from '@leathercad/geometry';

import type { DisplayItem, DisplayList } from './displayList.js';
import { CANVAS } from './theme/index.js';
import { pixelsToMm, visibleBoundsMm, type ViewportView } from './view.js';

/** What the Sheets view is made of: a stroked path, a fill and a screen word. */
export type BoundedItem = Extract<DisplayItem, { kind: 'path' | 'fill' | 'overlay-text' }>;

/**
 * Where drawn things can put ink: the millimetre box of what they are placed
 * at, and how far past that, in CSS pixels, a screen-constant size — a line's
 * width, a word — can reach.
 *
 * Kept in two parts because one is the document's and the other is the
 * screen's: only the camera turns the pixels into millimetres.
 */
export interface Extent {
  readonly boundsMm: Rect;
  readonly marginPx: number;
}

/**
 * Past every edge, in CSS pixels: a backend antialiases the pixel beside a
 * line or a clip, and a cap or join can sit a little outside its box.
 */
export const EDGE_PX = 1;

/**
 * How far a word can reach from where it is placed, in ems: so much a
 * character, and so much more for the line it is on.
 *
 * A character: the widest the canvas sets is 1.36 em, SemiBold's widest
 * glyph, and a fallback face's, for a character Plex lacks — a maker's part
 * can be named in any script — is rarely past an em and a quarter. The line:
 * its height above or below where it hangs from, whichever baseline, and a
 * glyph's ink past its advance. `extent.test.ts` holds both to the vendored
 * outlines.
 */
const CHARACTER_EM = 1.5;
const LINE_EM = 3;

/**
 * The widest of a severity marker's strokes, 1.5 px for a hollow triangle,
 * rounded up: the backend strokes it over the glyph's edge.
 */
const MARKER_STROKE_PX = 2;

/** Where one item can put ink, or null when it draws nothing. */
function extentOfItem(item: DisplayItem): Extent | null {
  switch (item.kind) {
    case 'path':
      // Round caps and joins, as the backend sets them: half the width.
      return boxed(PathOps.bbox(item.path), item.stroke.widthPx / 2 + EDGE_PX);
    case 'fill':
      return boxed(boundsOfPaths(item.paths), EDGE_PX);
    case 'hatch':
      // Clipped to its own inside, however far its lines run.
      return boxed(PathOps.bbox(item.path), EDGE_PX);
    case 'slits':
      // Butt caps: no further than half the width from a slit's line.
      return boxed(RectOps.fromPoints(item.slits.flat()), item.stroke.widthPx / 2 + EDGE_PX);
    case 'dots':
      return boxed(RectOps.fromPoints(item.points), item.radiusPx + EDGE_PX);
    case 'overlay-text': {
      // Whichever way it is aligned or turned.
      const reach = (item.text.length * CHARACTER_EM + LINE_EM) * item.sizePx;
      return at(item.at, reach + (item.halo?.widthPx ?? 0) + EDGE_PX);
    }
    case 'document-text': {
      // Each glyph is set on its own, at its place, the text's size in
      // millimetres: one character, and the rest of its line around it.
      const box = RectOps.fromPoints(item.placed.glyphs.map((glyph) => glyph.at));
      const reachMm = (CHARACTER_EM + LINE_EM) * item.placed.layout.sizeMm;
      return boxed(box === null ? null : RectOps.expand(box, reachMm), EDGE_PX);
    }
    case 'fold-tick': {
      const { widthPx, heightPx, strokePx } = CANVAS.foldTick;
      return at(item.at, Math.hypot(widthPx / 2, heightPx / 2) + strokePx / 2 + EDGE_PX);
    }
    case 'link-tick': {
      const { radiusPx, apartPx, strokePx } = CANVAS.linkTick;
      return at(item.at, apartPx / 2 + radiusPx + strokePx / 2 + EDGE_PX);
    }
    case 'marker': {
      // The glyph sits a leader away, diagonally; its halo is its size around it.
      const { sizePx, leaderPx } = CANVAS.marker;
      return at(item.at, Math.SQRT2 * leaderPx + sizePx + MARKER_STROKE_PX + EDGE_PX);
    }
  }
}

function boxed(boundsMm: Rect | null, marginPx: number): Extent | null {
  return boundsMm === null ? null : { boundsMm, marginPx };
}

function at({ x, y }: Vec2, marginPx: number): Extent {
  return { boundsMm: { minX: x, minY: y, maxX: x, maxY: y }, marginPx };
}

function boundsOfPaths(paths: readonly Path[]): Rect | null {
  return RectOps.unionAll(
    paths.flatMap((path) => {
      const bounds = PathOps.bbox(path);
      return bounds === null ? [] : [bounds];
    }),
  );
}

/**
 * Where a set of items can put ink — the union of each one's extent — or null
 * for items that draw nothing.
 *
 * A union box grown by the widest margin contains every item's own, so it is
 * never smaller than what is drawn, only sometimes larger.
 */
export function extentOf(items: readonly DisplayItem[]): Extent | null {
  let result: Extent | null = null;
  for (const item of items) {
    const next = extentOfItem(item);
    if (next === null) continue;
    result =
      result === null
        ? next
        : {
            boundsMm: RectOps.union(result.boundsMm, next.boundsMm),
            marginPx: Math.max(result.marginPx, next.marginPx),
          };
  }
  return result;
}

/** The extent holding both. */
export function unionExtent(a: Extent, b: Extent): Extent {
  return {
    boundsMm: RectOps.union(a.boundsMm, b.boundsMm),
    marginPx: Math.max(a.marginPx, b.marginPx),
  };
}

/**
 * Whether anything within `extent` can reach the canvas. False only when it
 * cannot: the one test the Sheets view uses to leave out a page the maker has
 * panned away from (PERF-003), and the Design board an item (PERF-008).
 * Touching counts as reaching.
 */
export function reachesView(view: ViewportView, extent: Extent): boolean {
  return RectOps.intersects(
    RectOps.expand(extent.boundsMm, pixelsToMm(view, extent.marginPx)),
    visibleBoundsMm(view),
  );
}

/**
 * The items of a list that can put ink on the canvas, in their order
 * (PERF-008). The rest are left out: drawn, they would change no pixel. An
 * item is kept whole, however little of it the canvas shows.
 */
export function itemsReachingView(list: DisplayList, view: ViewportView): DisplayList {
  return {
    items: list.items.filter((item) => {
      const extent = extentOfItem(item);
      return extent !== null && reachesView(view, extent);
    }),
  };
}
