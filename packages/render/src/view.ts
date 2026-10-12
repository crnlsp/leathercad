import type { Mm } from '@leathercad/core';
import { MatOps, RectOps, type Mat2x3, type Rect, type Vec2 } from '@leathercad/geometry';

/**
 * What the renderer needs to know about the camera.
 *
 * Deliberately plain data rather than the editor's Viewport class, so
 * `packages/render` does not depend on `packages/editor` and can be exercised
 * headlessly in tests.
 */
export interface ViewportView {
  /** The millimetre point sitting at the centre of the canvas. */
  readonly centreMm: Vec2;
  /** Device pixels per millimetre. */
  readonly scale: number;
  /** Backing-store size, in device pixels. */
  readonly widthPx: number;
  readonly heightPx: number;
  /**
   * Device pixels per CSS pixel: 1 on an ordinary display, 2 on a Retina one.
   *
   * Every screen-constant size — a stroke, a halo, a glyph, a label, a grid
   * tier's threshold — is in **CSS pixels**, and the backends multiply by this
   * once (U.1). Before, they were device pixels, so on a 2× display every line
   * drew half as thick and the grid switched at half the zoom.
   */
  readonly dpr: number;
}

/**
 * CSS pixels per millimetre at true size: 96 to the inch. A 100 mm line at
 * 100 % is 377.95 CSS pixels long.
 */
export const TRUE_SIZE_CSS_PX_PER_MM = 96 / 25.4;

/**
 * **The zoom**, as everything that depends on it reads it: CSS pixels per
 * millimetre. The same number on a 1× and a 2× display showing the drawing at
 * the same size, so a grid tier or a zoom band switches at the same zoom on
 * both.
 */
export function cssPxPerMm(view: ViewportView): number {
  return view.scale / view.dpr;
}

/** The zoom as the maker reads it: 100 % is true size. */
export function zoomPercent(view: ViewportView): number {
  return (cssPxPerMm(view) / TRUE_SIZE_CSS_PX_PER_MM) * 100;
}

/**
 * The scale — device pixels per millimetre — that shows `percent` on a
 * display of this ratio: `zoomPercent`'s inverse, for the zoom control's
 * *True size* and its sizes (U.4).
 */
export function scaleAtZoomPercent(percent: number, dpr: number): number {
  return (percent / 100) * TRUE_SIZE_CSS_PX_PER_MM * dpr;
}

/**
 * How far the zoom goes, as percentages — so the same on every display (U.4).
 * At 1 % a 2 m hide is 75 CSS px across; at 10 000 % a 0.1 mm detail is 38 px,
 * past anything a pattern holds.
 */
export const ZOOM_LIMITS = { min: 1, max: 10_000 } as const;

/**
 * The stops − and + (and Ctrl+= and Ctrl+−) step along (U.4): round numbers
 * a maker reads at a glance, and true size reached with + alone. Finest from
 * 25 % to 200 %, where a whole pattern fits a laptop and a piece is checked
 * against a real thing; doubling beyond, for stitch holes and points; coarse
 * below, where there is nothing to read. Ends at the limits, so stepping
 * clamps there.
 */
export const ZOOM_STOPS: readonly number[] = [
  1, 2, 5, 10, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 600, 800, 1200, 1600, 3200, 6400,
  10_000,
];

/** The zoom as the control shows it: a whole percentage. */
export function shownZoomPercent(percent: number): number {
  return Math.round(percent);
}

/**
 * The stop one step up (`1`) or down (`-1`) from `percent`, judged on the
 * whole percentage shown — 99.6 % reads 100, so it is on the 100 stop and +
 * goes to 125. At a limit, the limit.
 */
export function nextZoomStop(percent: number, direction: 1 | -1): number {
  const shown = shownZoomPercent(percent);
  return direction > 0
    ? (ZOOM_STOPS.find((stop) => stop > shown) ?? ZOOM_LIMITS.max)
    : (ZOOM_STOPS.findLast((stop) => stop < shown) ?? ZOOM_LIMITS.min);
}

/**
 * Millimetres to device pixels.
 *
 * **One of only two places in the codebase where Y is flipped** — the other is
 * the SVG writer. The model is Y-up (CLAUDE.md invariant 2); canvas is Y-down.
 * Every other layer stays Y-up, so if something renders upside down the bug is
 * here or in the SVG writer and nowhere else.
 */
export function worldToScreen(view: ViewportView): Mat2x3 {
  return MatOps.composeAll(
    // Camera centre to the origin.
    MatOps.fromTranslation({ x: -view.centreMm.x, y: -view.centreMm.y }),
    // Scale to pixels, flipping Y on the way.
    MatOps.fromScale(view.scale, -view.scale),
    // Origin to the middle of the canvas.
    MatOps.fromTranslation({ x: view.widthPx / 2, y: view.heightPx / 2 }),
  );
}

/** Device pixels back to millimetres. */
export function screenToWorld(view: ViewportView): Mat2x3 {
  return MatOps.invert(worldToScreen(view));
}

/**
 * Millimetres to **CSS** pixels, for what the backends draw at a constant
 * size on screen: `worldToScreen`, with the display's ratio divided out. The
 * flip is still `worldToScreen`'s; this only scales its result.
 */
export function worldToCss(view: ViewportView): Mat2x3 {
  return MatOps.compose(worldToScreen(view), MatOps.fromScale(1 / view.dpr));
}

/** The millimetre rectangle currently on screen. Used for culling. */
export function visibleBoundsMm(view: ViewportView): Rect {
  const inverse = screenToWorld(view);
  return RectOps.fromCorners(
    MatOps.apply(inverse, { x: 0, y: 0 }),
    MatOps.apply(inverse, { x: view.widthPx, y: view.heightPx }),
  );
}

/**
 * A distance on screen, in CSS pixels, in millimetres — a pick radius as a
 * tolerance. CSS pixels, so it covers the same millimetres on any display.
 */
export function pixelsToMm(view: ViewportView, pixels: number): Mm {
  return pixels / cssPxPerMm(view);
}

/** A millimetre distance in CSS pixels on screen. */
export function mmToPixels(view: ViewportView, mm: Mm): number {
  return mm * cssPxPerMm(view);
}
