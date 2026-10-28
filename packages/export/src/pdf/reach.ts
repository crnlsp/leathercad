import type { Mm } from '@leathercad/core';
import {
  EXPORT_TOLERANCE_MM,
  PathOps,
  RectOps,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';

/**
 * PDF's default miter limit, which the writer never changes: a stroke's
 * corner reaches at most this many half widths past the corner (PDF 1.7,
 * §8.4.3.5). A round cap reaches one half width; the miter is the furthest.
 */
const MITER_LIMIT = 10;

/**
 * Room past the stroke that a sheet keeps anyway.
 *
 * A rasteriser may multiply a pixel's coverage by the clip's rather than
 * intersect the two shapes, so ink just outside the clip can darken a pixel
 * on its edge. The coarsest a sheet is drawn is the Print Preview's 96 px
 * thumbnail of A3 landscape, 4.4 mm a pixel; ten millimetres is two of them.
 * It costs a few holes a sheet.
 */
const RASTER_ALLOWANCE_MM = 10;

/**
 * Whether a path, moved by `offsetMm`, can put ink inside `area` — stroked at
 * `strokeWidthMm`, or filled when that is 0. False only when it cannot: the
 * one test a tiled sheet uses to leave out what its clip would hide (PERF-002).
 *
 * Conservative by construction: the path's box, grown by everything that
 * paints past its line — the widest a stroke reaches, the error of the cubics
 * the PDF writes an arc as, and the allowance above. A filled contour paints
 * only inside its own box, so a contour clear of the area adds nothing to the
 * fill there, whatever the winding rule.
 */
export function inkReaches(path: Path, offsetMm: Vec2, area: Rect, strokeWidthMm: Mm): boolean {
  const box = boxOf(path);
  if (box === null) return false;
  const reach = (strokeWidthMm * MITER_LIMIT) / 2 + EXPORT_TOLERANCE_MM + RASTER_ALLOWANCE_MM;
  return RectOps.intersects(RectOps.expand(RectOps.translate(box, offsetMm), reach), area);
}

/**
 * Each path's box, measured once: a taped piece asks it of every path on each
 * of its sheets, thirty-three times over for a 5.8 m strap. A path never
 * changes, so its box cannot go stale.
 */
const boxes = new WeakMap<Path, Rect | null>();

function boxOf(path: Path): Rect | null {
  let box = boxes.get(path);
  if (box === undefined) {
    box = PathOps.bbox(path);
    boxes.set(path, box);
  }
  return box;
}
