import type { Mm } from '@leathercad/core';
import { MatOps, RectOps, type Rect, type Vec2 } from '@leathercad/geometry';
import { screenToWorld, worldToScreen, type ViewportView } from '@leathercad/render';

/**
 * The camera: the one object that knows how millimetres relate to pixels.
 *
 * Nothing outside this file and `packages/render` converts between the two.
 * Hit testing, for instance, converts its *tolerance* from pixels to
 * millimetres here and then does every comparison in millimetres — never the
 * other way round, or results would depend on zoom in ways no unit test could
 * pin down. See CLAUDE.md invariant 1.
 *
 * **All pixel values are device pixels**, matching the canvas backing store.
 * Pointer events arrive in CSS pixels, so multiply by `dpr` first — or use
 * `fromCssPoint`.
 */
export class Viewport {
  centreMm: Vec2 = { x: 0, y: 0 };
  /** Device pixels per millimetre. */
  scale = 4;
  widthPx = 0;
  heightPx = 0;
  dpr = 1;

  /**
   * Zoom limits.
   *
   * The lower bound keeps a 2 m project on screen; the upper is well past the
   * point where a 0.1 µm storage quantum is a whole pixel, so there is nothing
   * further to see.
   */
  static readonly MIN_SCALE = 0.05;
  static readonly MAX_SCALE = 400;

  /** The plain-data view the renderer consumes. */
  toView(): ViewportView {
    return {
      centreMm: this.centreMm,
      scale: this.scale,
      widthPx: this.widthPx,
      heightPx: this.heightPx,
    };
  }

  resize(widthPx: number, heightPx: number, dpr = this.dpr): void {
    this.widthPx = widthPx;
    this.heightPx = heightPx;
    this.dpr = dpr;
  }

  toScreen(pointMm: Vec2): Vec2 {
    return MatOps.apply(worldToScreen(this.toView()), pointMm);
  }

  toWorld(pointPx: Vec2): Vec2 {
    return MatOps.apply(screenToWorld(this.toView()), pointPx);
  }

  /** Converts a CSS-pixel pointer position to millimetres. */
  fromCssPoint(cssX: number, cssY: number): Vec2 {
    return this.toWorld({ x: cssX * this.dpr, y: cssY * this.dpr });
  }

  mmToPx(mm: Mm): number {
    return mm * this.scale;
  }

  pxToMm(px: number): Mm {
    return px / this.scale;
  }

  /**
   * Zooms about a fixed screen point.
   *
   * The millimetre point under the cursor stays under the cursor, which is what
   * makes wheel zoom feel like the drawing is being moved rather than the
   * camera. Zooming about the canvas centre instead is the classic mistake and
   * feels wrong immediately.
   */
  zoomAt(anchorPx: Vec2, factor: number): void {
    const before = this.toWorld(anchorPx);
    this.scale = clamp(this.scale * factor, Viewport.MIN_SCALE, Viewport.MAX_SCALE);
    const after = this.toWorld(anchorPx);

    this.centreMm = {
      x: this.centreMm.x + (before.x - after.x),
      y: this.centreMm.y + (before.y - after.y),
    };
  }

  /** Drags the drawing by a screen delta. */
  panByPx(deltaXPx: number, deltaYPx: number): void {
    this.centreMm = {
      x: this.centreMm.x - deltaXPx / this.scale,
      // Y is flipped on screen, so a downward drag moves the camera up.
      y: this.centreMm.y + deltaYPx / this.scale,
    };
  }

  /** Frames a millimetre rectangle, leaving a margin in device pixels. */
  fitTo(bounds: Rect, paddingPx = 40): void {
    const width = RectOps.width(bounds);
    const height = RectOps.height(bounds);
    this.centreMm = RectOps.centre(bounds);

    const usableWidth = Math.max(1, this.widthPx - paddingPx * 2);
    const usableHeight = Math.max(1, this.heightPx - paddingPx * 2);

    // A degenerate bound has no scale that frames it; keep the current zoom.
    if (width <= 0 && height <= 0) return;

    const scaleX = width > 0 ? usableWidth / width : Number.POSITIVE_INFINITY;
    const scaleY = height > 0 ? usableHeight / height : Number.POSITIVE_INFINITY;

    this.scale = clamp(Math.min(scaleX, scaleY), Viewport.MIN_SCALE, Viewport.MAX_SCALE);
  }

  /** The millimetre rectangle currently on screen. */
  visibleBounds(): Rect {
    const inverse = screenToWorld(this.toView());
    return RectOps.fromCorners(
      MatOps.apply(inverse, { x: 0, y: 0 }),
      MatOps.apply(inverse, { x: this.widthPx, y: this.heightPx }),
    );
  }

  /** A pick radius in pixels, expressed as a millimetre tolerance. */
  pickToleranceMm(radiusPx = 10): Mm {
    return (radiusPx * this.dpr) / this.scale;
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
