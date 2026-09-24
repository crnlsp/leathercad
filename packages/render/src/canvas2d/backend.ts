import { MatOps, PathOps, type Path, type Rect, type Segment } from '@leathercad/geometry';
import { FONT_FAMILY } from '@leathercad/typography';

import type { DisplayList, DisplayItem } from '../displayList.js';
import { foldTickShape, hatchLines, linkTickShape } from '../leather.js';
import { markerShape } from '../marker.js';
import { CANVAS, GROUND, screenDash } from '../theme/index.js';
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
  fill(fillRule?: CanvasFillRule): void;
  clip(fillRule?: CanvasFillRule): void;
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
  /**
   * For overlay text — readouts and hints. Defaults to the **vendored**
   * typeface, like everything else this package draws.
   *
   * It used to default to `system-ui`, which meant a millimetre value read one
   * way on screen and another on paper: the live dimension and the part caption
   * went through here in whatever face the machine happened to have, while the
   * same strings are filled from Plex outlines by the exporters. A renderer
   * whose output depends on the host's installed fonts cannot be snapshotted
   * either.
   */
  readonly fontFamily?: string;
  /**
   * Draw only inside this millimetre rectangle (7.4c): a taped sheet on the
   * Sheets view shows its piece cropped to the printable area, as the PDF
   * crops it. Applied here, in the world transform, so no caller converts it
   * to pixels.
   */
  readonly clipMm?: Rect;
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

  if (options.clipMm !== undefined) {
    const { clipMm, ...rest } = options;
    ctx.save();
    ctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
    ctx.beginPath();
    ctx.moveTo(clipMm.minX, clipMm.minY);
    ctx.lineTo(clipMm.maxX, clipMm.minY);
    ctx.lineTo(clipMm.maxX, clipMm.maxY);
    ctx.lineTo(clipMm.minX, clipMm.maxY);
    ctx.closePath();
    ctx.clip();
    try {
      renderDisplayList(ctx, list, view, rest);
    } finally {
      ctx.restore();
    }
    return;
  }

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
      // The world transform is in millimetres: a tool's pixel dash is divided
      // back into them, a role's millimetre dash is used as it is — or not at
      // all, when it is too fine to read (F.4).
      ctx.setLineDash(
        item.stroke.dashPx !== undefined
          ? item.stroke.dashPx.map((d) => d / perMm)
          : [...screenDash(item.stroke.dashMm ?? [], perMm)],
      );
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
    } else if (item.kind === 'slits') {
      // Butt caps: a round cap would add half the width to each end, and a
      // slit drawn true would no longer be as long as it says (F.7).
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const [a, b] of item.slits) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = item.stroke.colour;
      ctx.lineWidth = item.stroke.widthPx / perMm;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.lineCap = 'round';
    } else if (item.kind === 'fill') {
      // Even-odd, so a band between two edges leaves the inside of the inner
      // one clear.
      ctx.fillStyle = item.colour;
      ctx.beginPath();
      for (const path of item.paths) tracePath(ctx, path);
      ctx.fill('evenodd');
    } else if (item.kind === 'hatch') {
      const bounds = PathOps.bbox(item.path);
      if (bounds === null) continue;
      ctx.save();
      ctx.beginPath();
      tracePath(ctx, item.path);
      ctx.clip();
      ctx.beginPath();
      for (const [a, b] of hatchLines(bounds, item.spacingPx / perMm)) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = item.colour;
      ctx.lineWidth = item.widthPx / perMm;
      ctx.lineCap = 'butt';
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.restore();
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
        // Overlay text is the tool's readout — a length, an angle — so it is set
        // as a measurement: one weight above body (UI Foundations §4.3).
        ctx.font = `500 ${item.sizePx}px ${options.fontFamily ?? vendoredFamily()}`;
        ctx.textAlign = item.align ?? 'left';
        ctx.textBaseline = item.baseline ?? 'alphabetic';
        ctx.fillText(item.text, at.x, at.y);
        continue;
      }

      ctx.font = `${item.placed.layout.sizeMm * perMm}px ${documentFamily(options)}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const angle = item.placed.rotationRad;
      for (const glyph of item.placed.glyphs) {
        const at = MatOps.apply(transform, glyph.at);
        if (angle === 0) {
          ctx.fillText(glyph.character, at.x, at.y);
          continue;
        }

        // Screen Y points down, so a counter-clockwise turn in the world is a
        // clockwise one here. Written as a transform rather than rotate() so
        // the backend keeps to the small canvas surface it declares.
        ctx.setTransform(
          Math.cos(angle),
          -Math.sin(angle),
          Math.sin(angle),
          Math.cos(angle),
          at.x,
          at.y,
        );
        ctx.fillText(glyph.character, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }

    ctx.restore();
  }

  // Pass three: the leather glyphs — a fold's direction, a derived line's link
  // — in screen pixels, over the lines they belong to (F.7).
  drawGlyphs(ctx, list, transform);

  // Pass four: severity markers, on top of everything, in screen pixels so
  // they stay findable at any zoom (UI Foundations §8.5).
  const markers = list.items.filter(
    (i): i is Extract<DisplayItem, { kind: 'marker' }> => i.kind === 'marker',
  );
  if (markers.length === 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setLineDash([]);
  for (const item of markers) {
    const shape = markerShape(
      MatOps.apply(transform, item.at),
      item.glyph,
      CANVAS.marker.sizePx,
      CANVAS.marker.leaderPx,
    );
    if (item.selected) {
      ctx.fillStyle = CANVAS.halo.selected;
      ctx.beginPath();
      ctx.arc(shape.halo.centre.x, shape.halo.centre.y, shape.halo.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = item.colour;
    ctx.fillStyle = item.colour;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(shape.leader[0].x, shape.leader[0].y);
    ctx.lineTo(shape.leader[1].x, shape.leader[1].y);
    ctx.stroke();

    ctx.beginPath();
    if (shape.glyph.kind === 'dot') {
      ctx.arc(shape.glyph.centre.x, shape.glyph.centre.y, shape.glyph.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const [a, b, c] = shape.glyph.points;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    if (shape.glyph.filled) {
      ctx.fill();
    } else {
      // Hollow: the ground shows through, so it cannot be mistaken for error.
      ctx.fillStyle = GROUND.ground;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Fold ticks and link ticks, from the shapes the SVG backend draws too. The
 * link's direction goes through the world transform like everything else, so
 * the flip stays in `view.ts`.
 */
function drawGlyphs(
  ctx: Canvas2DLike,
  list: DisplayList,
  transform: ReturnType<typeof worldToScreen>,
): void {
  const glyphs = list.items.filter(
    (i): i is Extract<DisplayItem, { kind: 'fold-tick' | 'link-tick' }> =>
      i.kind === 'fold-tick' || i.kind === 'link-tick',
  );
  if (glyphs.length === 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const item of glyphs) {
    const at = MatOps.apply(transform, item.at);
    if (item.kind === 'fold-tick') {
      const [a, b, c] = foldTickShape(at, item.fold);
      ctx.strokeStyle = item.colour;
      ctx.lineWidth = CANVAS.foldTick.strokePx;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      continue;
    }

    // The ground first, under both rings, then both rings: interlocked, and
    // the line does not run through them.
    const rings = linkTickShape(at, MatOps.applyDirection(transform, item.tangent));
    ctx.fillStyle = GROUND.ground;
    ctx.beginPath();
    for (const { centre, radius } of rings) {
      ctx.moveTo(centre.x + radius, centre.y);
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = item.colour;
    ctx.lineWidth = CANVAS.linkTick.strokePx;
    for (const { centre, radius } of rings) {
      ctx.beginPath();
      ctx.moveTo(centre.x + radius, centre.y);
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * The vendored typeface, with a fallback that should never be reached.
 *
 * The app loads the file as a `FontFace` before the first paint. If it somehow
 * has not, the text is still legible and still in the right places — the
 * positions come from the layout, not from the browser's measurement.
 */
function documentFamily(options: RenderOptions): string {
  return options.documentFontFamily ?? vendoredFamily();
}

/**
 * The one family this package names. There is no platform font anywhere in
 * `packages/render` — `fonts.test.ts` holds it to that.
 */
export function vendoredFamily(): string {
  return `"${FONT_FAMILY}", sans-serif`;
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
