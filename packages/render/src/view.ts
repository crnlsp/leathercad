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

/** The millimetre rectangle currently on screen. Used for culling. */
export function visibleBoundsMm(view: ViewportView): Rect {
  const inverse = screenToWorld(view);
  return RectOps.fromCorners(
    MatOps.apply(inverse, { x: 0, y: 0 }),
    MatOps.apply(inverse, { x: view.widthPx, y: view.heightPx }),
  );
}

/** Screen distance in millimetres — for turning a pick radius into a tolerance. */
export function pixelsToMm(view: ViewportView, pixels: number): Mm {
  return pixels / view.scale;
}

export function mmToPixels(view: ViewportView, mm: Mm): number {
  return mm * view.scale;
}
