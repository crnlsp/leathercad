import { PathOps, RectOps, type Rect } from '@leathercad/geometry';

import type { DisplayItem } from './displayList.js';
import { pixelsToMm, visibleBoundsMm, type ViewportView } from './view.js';

/**
 * The display items whose reach is known: a stroked path, a fill and a screen
 * word are what the Sheets view is made of. The others — a slit, a marker, a
 * tick — are sized by shapes this file does not model, so it cannot be asked
 * about them.
 */
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
 * The widest a character is, in ems. Every typeface the app sets text in sets
 * a character at no more than its size, so a word reaches at most this many
 * ems from where it is placed — whichever way it is aligned or turned.
 */
const MAX_ADVANCE_EM = 1;

/** The extent of one item, or null when it draws nothing. */
function extentOfItem(item: BoundedItem): Extent | null {
  switch (item.kind) {
    case 'path': {
      const box = PathOps.bbox(item.path);
      // Round caps and joins, as the backend sets them: half the width.
      return box === null ? null : { boundsMm: box, marginPx: item.stroke.widthPx / 2 + EDGE_PX };
    }
    case 'fill': {
      const box = RectOps.unionAll(
        item.paths.flatMap((path) => {
          const bounds = PathOps.bbox(path);
          return bounds === null ? [] : [bounds];
        }),
      );
      return box === null ? null : { boundsMm: box, marginPx: EDGE_PX };
    }
    case 'overlay-text': {
      const { x, y } = item.at;
      const reach = Math.max(1, item.text.length) * MAX_ADVANCE_EM * item.sizePx;
      return {
        boundsMm: { minX: x, minY: y, maxX: x, maxY: y },
        marginPx: reach + (item.halo?.widthPx ?? 0) + EDGE_PX,
      };
    }
  }
}

/**
 * Where a set of items can put ink — the union of each one's extent — or null
 * for items that draw nothing.
 *
 * A union box grown by the widest margin contains every item's own, so it is
 * never smaller than what is drawn, only sometimes larger.
 */
export function extentOf(items: readonly BoundedItem[]): Extent | null {
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
 * panned away from (PERF-003). Touching counts as reaching.
 */
export function reachesView(view: ViewportView, extent: Extent): boolean {
  return RectOps.intersects(
    RectOps.expand(extent.boundsMm, pixelsToMm(view, extent.marginPx)),
    visibleBoundsMm(view),
  );
}
