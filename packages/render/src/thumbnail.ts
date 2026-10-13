import { EPS_LENGTH } from '@leathercad/core';
import { PathOps, type Path, type Rect } from '@leathercad/geometry';

import { format, pathData } from './svg/backend.js';
import { worldToScreen, type ViewportView } from './view.js';

/** A box of CSS pixels a thumbnail is drawn in. */
export interface PixelBox {
  readonly width: number;
  readonly height: number;
}

/**
 * The camera that shows a millimetre rectangle in a box of pixels: centred,
 * `insetPx` in from the nearer edges, at one scale for both axes, so a piece's
 * thumbnail is its own shape and never stretched. Null for a point, which has
 * no size to fit.
 */
export function thumbnailView(bounds: Rect, box: PixelBox, insetPx = 1): ViewportView | null {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scales = [
    ...(width > EPS_LENGTH ? [(box.width - 2 * insetPx) / width] : []),
    ...(height > EPS_LENGTH ? [(box.height - 2 * insetPx) / height] : []),
  ];
  if (scales.length === 0) return null;
  return {
    centreMm: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    scale: Math.min(...scales),
    widthPx: box.width,
    heightPx: box.height,
    dpr: 1,
  };
}

/**
 * A piece's outline as an SVG path in a box of pixels (U.5): what the folded
 * Parts strip shows for each piece, and U.8's tree beside its name. The fit is
 * the screen's own `worldToScreen`, so Y is up as on the board.
 */
export function thumbnailPath(outline: Path, box: PixelBox, insetPx = 1): string {
  const bounds = PathOps.bbox(outline);
  const view = bounds === null ? null : thumbnailView(bounds, box, insetPx);
  if (view === null) return '';
  // Two decimals: a hundredth of a pixel, past what any display shows.
  return pathData(PathOps.transform(outline, worldToScreen(view)), (value) => format(value, 2));
}
