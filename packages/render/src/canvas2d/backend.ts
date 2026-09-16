import { MatOps, type Path, type Segment } from '@leathercad/geometry';
import { FONT_FAMILY } from '@leathercad/typography';

import type { DisplayList, DisplayItem } from '../displayList.js';
import { worldToScreen, type ViewportView } from '../view.js';

/**
 * The slice of CanvasRenderingContext2D this backend actually uses.
 *
 * Declared rather than importing the DOM type wholesale so the backend can be
 * driven by a recorder in tests — there is no canvas in Node, and a renderer
 * that can only be checked by screenshotting is a renderer that mostly is not
 * checked. See docs/testing.md §5.
 */
export interface Canvas2DLike {
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  lineWidth: number;
  // Widened to the DOM's own union so CanvasRenderingContext2D satisfies this
  // structurally. The renderer only ever assigns strings.
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
}

export interface RenderOptions {
  /** For overlay text — readouts and hints. Defaults to the system UI font. */
  readonly fontFamily?: string;
  /** For document text. Defaults to the vendored typeface. */
  readonly documentFontFamily?: string;
}

/**
 * Wipes the canvas, optionally to a background colour.
 *
 * Separate from `renderDisplayList` on purpose: the canvas is composed from
 * several layers, and any one of them owning the wipe would erase its
 * predecessors.
 */
export function clearCanvas(ctx: Canvas2DLike, view: ViewportView, background?: string): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.widthPx, view.heightPx);
  if (background !== undefined) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, view.widthPx, view.heightPx);
  }
  ctx.restore();
}

/**
 * Draws a display list.
 *
 * Geometry is drawn in **millimetre space** with the world transform applied to
 * the context, so the canvas rasterises arcs and Béziers natively rather than
 * receiving a polyline we flattened ourselves. Stroke widths and dashes are
 * therefore divided by the scale, which keeps them constant on screen while
 * the geometry stays true.
 *
 * Text is drawn in a second, screen-space pass: the world transform flips Y,
 * and text drawn through it would come out mirrored.
 *
 * Does **not** clear the canvas. A display list is one layer among several —
 * grid beneath, rulers above — and a layer that wipes the surface erases
 * whatever was drawn before it. Call `clearCanvas` once, first.
 */
export function renderDisplayList(
  ctx: Canvas2DLike,
  list: DisplayList,
  view: ViewportView,
  options: RenderOptions = {},
): void {
  const transform = worldToScreen(view);
  const perMm = view.scale;

  // Pass one: geometry, in millimetres.
  ctx.save();
  ctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const item of list.items) {
    if (item.kind === 'path') {
      ctx.beginPath();
      tracePath(ctx, item.path);
      ctx.strokeStyle = item.stroke.colour;
      ctx.lineWidth = item.stroke.widthPx / perMm;
      ctx.setLineDash((item.stroke.dashPx ?? []).map((d) => d / perMm));
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (item.kind === 'dots') {
      const radius = item.radiusPx / perMm;
      ctx.fillStyle = item.fill;
      ctx.beginPath();
      for (const point of item.points) {
        ctx.moveTo(point.x + radius, point.y);
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  ctx.restore();

  // Pass two: text, drawn in screen pixels so the Y flip does not mirror it.
  //
  // Both kinds are drawn here, and the difference is where the size comes
  // from. Document text is millimetres scaled by the viewport — it grows as
  // you zoom in, because it is part of the drawing — and each glyph is placed
  // at the position `typography` laid out, so the screen and the paper agree.
  // Overlay text is a fixed pixel size, because it is chrome.
  const textItems = list.items.filter(
    (i): i is Extract<DisplayItem, { kind: 'document-text' | 'overlay-text' }> =>
      i.kind === 'document-text' || i.kind === 'overlay-text',
  );
  if (textItems.length > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    for (const item of textItems) {
      ctx.fillStyle = item.colour;

      if (item.kind === 'overlay-text') {
        const at = MatOps.apply(transform, item.at);
        ctx.font = `${item.sizePx}px ${options.fontFamily ?? 'system-ui, sans-serif'}`;
        ctx.textAlign = item.align ?? 'left';
        ctx.textBaseline = item.baseline ?? 'alphabetic';
        ctx.fillText(item.text, at.x, at.y);
        continue;
      }

      ctx.font = `${item.sizeMm * perMm}px ${documentFamily(options)}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (const glyph of item.placed.glyphs) {
        const at = MatOps.apply(transform, glyph.at);
        ctx.fillText(glyph.character, at.x, at.y);
      }
    }

    ctx.restore();
  }
}

/**
 * The vendored typeface, with a fallback that should never be reached.
 *
 * The app loads the file as a `FontFace` before the first paint. If it somehow
 * has not, the text is still legible and still in the right places — the
 * positions come from the layout, not from the browser's measurement.
 */
function documentFamily(options: RenderOptions): string {
  return options.documentFontFamily ?? `"${FONT_FAMILY}", sans-serif`;
}

/** Emits one path into the context's current path, in millimetres. */
export function tracePath(ctx: Canvas2DLike, path: Path): void {
  let previousEnd: { x: number; y: number } | null = null;

  for (const segment of path.segments) {
    const start = startOf(segment);
    if (previousEnd === null || !samePoint(previousEnd, start)) {
      ctx.moveTo(start.x, start.y);
    }
    traceSegment(ctx, segment);
    previousEnd = endOf(segment);
  }

  if (path.closed && path.segments.length > 0) ctx.closePath();
}

function traceSegment(ctx: Canvas2DLike, s: Segment): void {
  switch (s.kind) {
    case 'line':
      ctx.lineTo(s.b.x, s.b.y);
      return;

    case 'cubic':
      ctx.bezierCurveTo(s.p1.x, s.p1.y, s.p2.x, s.p2.y, s.p3.x, s.p3.y);
      return;

    case 'arc':
      // The context is in Y-up millimetre space, so these are ordinary
      // mathematical angles. A negative sweep runs in decreasing angle, which
      // is what canvas calls counter-clockwise.
      ctx.arc(
        s.centre.x,
        s.centre.y,
        s.radius,
        s.startAngle,
        s.startAngle + s.sweepAngle,
        s.sweepAngle < 0,
      );
      return;
  }
}

function startOf(s: Segment): { x: number; y: number } {
  switch (s.kind) {
    case 'line':
      return s.a;
    case 'cubic':
      return s.p0;
    case 'arc':
      return {
        x: s.centre.x + Math.cos(s.startAngle) * s.radius,
        y: s.centre.y + Math.sin(s.startAngle) * s.radius,
      };
  }
}

function endOf(s: Segment): { x: number; y: number } {
  switch (s.kind) {
    case 'line':
      return s.b;
    case 'cubic':
      return s.p3;
    case 'arc': {
      const angle = s.startAngle + s.sweepAngle;
      return {
        x: s.centre.x + Math.cos(angle) * s.radius,
        y: s.centre.y + Math.sin(angle) * s.radius,
      };
    }
  }
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}
