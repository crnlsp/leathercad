import { describe, expect, it } from 'vitest';
import { arc, cubic, line, PathOps } from '@leathercad/geometry';

import {
  documentTextItem,
  dotsItem,
  fillItem,
  foldTickItem,
  hatchItem,
  linkTickItem,
  pathItem,
  slitsItem,
  textItem,
} from '../displayList.js';
import { CANVAS, GROUND } from '../theme/index.js';
import type { ViewportView } from '../view.js';
import { clearCanvas, renderDisplayList, tracePath, type Canvas2DLike } from './backend.js';

/**
 * Records what the renderer asks a canvas to do.
 *
 * There is no canvas in Node, and a renderer that can only be checked by
 * screenshotting is a renderer that mostly is not checked.
 */
class Recorder implements Canvas2DLike {
  readonly calls: string[] = [];
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  font = '';
  textAlign: CanvasTextAlign = 'left';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';

  private record(name: string, ...args: unknown[]): void {
    this.calls.push(
      `${name}(${args.map((a) => (typeof a === 'number' ? a.toFixed(4) : String(a))).join(',')})`,
    );
  }

  save(): void {
    this.record('save');
  }
  restore(): void {
    this.record('restore');
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record('setTransform', a, b, c, d, e, f);
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.record('clearRect', x, y, w, h);
  }
  beginPath(): void {
    this.record('beginPath');
  }
  closePath(): void {
    this.record('closePath');
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.record('lineTo', x, y);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record('bezierCurveTo', a, b, c, d, e, f);
  }
  arc(x: number, y: number, r: number, s: number, e: number, ccw?: boolean): void {
    this.record('arc', x, y, r, s, e, ccw ?? false);
  }
  stroke(): void {
    this.record('stroke', String(this.strokeStyle), this.lineWidth.toFixed(4), this.lineCap);
  }
  fill(rule?: CanvasFillRule): void {
    this.record('fill', String(this.fillStyle), ...(rule === undefined ? [] : [rule]));
  }
  clip(rule?: CanvasFillRule): void {
    this.record('clip', ...(rule === undefined ? [] : [rule]));
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.record('fillRect', x, y, w, h);
  }
  fillText(t: string, x: number, y: number): void {
    this.record('fillText', t, x, y);
  }
  setLineDash(s: number[]): void {
    this.record('setLineDash', s.join('|'));
  }
}

const view: ViewportView = { centreMm: { x: 0, y: 0 }, scale: 4, widthPx: 800, heightPx: 600 };

describe('tracePath', () => {
  it('emits a single moveTo for a connected path', () => {
    const ctx = new Recorder();
    tracePath(
      ctx,
      PathOps.polyline(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        false,
      ),
    );

    expect(ctx.calls.filter((c) => c.startsWith('moveTo'))).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(2);
  });

  it('closes a closed path', () => {
    const ctx = new Recorder();
    tracePath(
      ctx,
      PathOps.polyline(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        true,
      ),
    );
    expect(ctx.calls).toContain('closePath()');
  });

  it('emits arcs natively rather than flattening them', () => {
    // Letting the canvas rasterise the curve keeps it exact at any zoom; a
    // polyline we flattened ourselves would show facets when magnified.
    const ctx = new Recorder();
    tracePath(ctx, PathOps.closed([arc({ x: 0, y: 0 }, 5, 0, Math.PI * 2)]));

    const arcs = ctx.calls.filter((c) => c.startsWith('arc('));
    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toContain('false');
  });

  it('marks a negative sweep as counter-clockwise', () => {
    const ctx = new Recorder();
    tracePath(ctx, PathOps.open([arc({ x: 0, y: 0 }, 5, 0, -Math.PI / 2)]));
    expect(ctx.calls.find((c) => c.startsWith('arc('))).toContain('true');
  });

  it('emits cubics as bezierCurveTo', () => {
    const ctx = new Recorder();
    tracePath(
      ctx,
      PathOps.open([cubic({ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 0 })]),
    );
    expect(ctx.calls.some((c) => c.startsWith('bezierCurveTo'))).toBe(true);
  });

  it('re-moves when a path has a gap', () => {
    const ctx = new Recorder();
    const gapped = {
      segments: [line({ x: 0, y: 0 }, { x: 1, y: 0 }), line({ x: 5, y: 0 }, { x: 6, y: 0 })],
      closed: false,
    };
    tracePath(ctx, gapped);
    expect(ctx.calls.filter((c) => c.startsWith('moveTo'))).toHaveLength(2);
  });
});

describe('renderDisplayList', () => {
  it('applies the world transform before drawing geometry', () => {
    const ctx = new Recorder();
    renderDisplayList(
      ctx,
      {
        items: [
          pathItem(
            'cut',
            PathOps.polyline(
              [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
              ],
              false,
            ),
          ),
        ],
      },
      view,
    );

    // 4 px/mm, centred at 400/300, and d = -4 is the Y flip.
    expect(ctx.calls).toContain('setTransform(4.0000,0.0000,0.0000,-4.0000,400.0000,300.0000)');
  });

  it('keeps stroke width constant on screen by dividing by the scale', () => {
    // Screen strokes are screen-constant so a cut line stays legible at any
    // zoom; export is the opposite and uses true millimetres.
    const ctx = new Recorder();
    renderDisplayList(
      ctx,
      {
        items: [
          pathItem(
            'cut',
            PathOps.polyline(
              [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
              ],
              false,
            ),
          ),
        ],
      },
      view,
    );

    const stroke = ctx.calls.find((c) => c.startsWith('stroke('));
    // 1.75 px (the cut edge, UI Foundations §8.1) / 4 px per mm.
    expect(stroke).toContain('0.4375');
  });

  const line = PathOps.polyline(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    false,
  );

  it("draws a role's dash at its true millimetres, the array the paper prints (F.4)", () => {
    const ctx = new Recorder();
    renderDisplayList(ctx, { items: [pathItem('stitch', line)] }, view);
    // The world transform is in millimetres, so a 2 mm dash is set as 2.
    expect(ctx.calls).toContain('setLineDash(2|2)');
  });

  it("converts a tool's pixel dash into millimetres, as it always did", () => {
    const ctx = new Recorder();
    renderDisplayList(ctx, { items: [pathItem('construction', line, { dashPx: [4, 3] })] }, view);
    expect(ctx.calls).toContain('setLineDash(1|0.75)');
  });

  it('draws a rhythm too fine to read as solid, never stretched', () => {
    const ctx = new Recorder();
    // 0.2 px to the millimetre: a 1 mm dot is a fifth of a pixel.
    renderDisplayList(ctx, { items: [pathItem('mark', line)] }, { ...view, scale: 0.2 });
    expect(ctx.calls).toContain('setLineDash()');
    expect(
      ctx.calls.some((call) => call.startsWith('setLineDash(') && call !== 'setLineDash()'),
    ).toBe(false);
  });

  it('draws text in screen space so the Y flip does not mirror it', () => {
    const ctx = new Recorder();
    renderDisplayList(ctx, { items: [textItem('annotation', { x: 0, y: 0 }, 'hello')] }, view);

    const textIndex = ctx.calls.findIndex((c) => c.startsWith('fillText'));
    const identityBefore = ctx.calls
      .slice(0, textIndex)
      .lastIndexOf('setTransform(1.0000,0.0000,0.0000,1.0000,0.0000,0.0000)');
    expect(identityBefore).toBeGreaterThan(-1);
    expect(ctx.calls[textIndex]).toBe('fillText(hello,400.0000,300.0000)');
  });

  it('draws document text glyph by glyph, where the layout put them', () => {
    // ADR 0011: the layout happens once, in millimetres, and the canvas places
    // the font at those positions. Drawing the whole string in one call would
    // let the browser's own measurement disagree with the paper's.
    const ctx = new Recorder();
    renderDisplayList(
      ctx,
      { items: [documentTextItem('annotation', { x: 0, y: 0 }, 'ab', 4)] },
      view,
    );

    const drawn = ctx.calls.filter((c) => c.startsWith('fillText'));
    expect(drawn).toHaveLength(2);
    expect(drawn[0]).toContain('fillText(a,');
    expect(drawn[1]).toContain('fillText(b,');
    // The second glyph sits to the right of the first, by its advance.
    const xOf = (call: string): number => Number(call.split(',')[1]);
    expect(xOf(drawn[1]!)).toBeGreaterThan(xOf(drawn[0]!));
  });

  it('sizes document text in millimetres, so it scales with the zoom', () => {
    const near = new Recorder();
    const far = new Recorder();
    const item = documentTextItem('annotation', { x: 0, y: 0 }, 'A', 4);

    renderDisplayList(near, { items: [item] }, { ...view, scale: 4 });
    renderDisplayList(far, { items: [item] }, { ...view, scale: 2 });

    // 4 mm at 4 px/mm is 16 px; at 2 px/mm it is 8. Overlay text would have
    // been the same size in both.
    expect(near.calls.some((c) => c.includes('font'))).toBe(false);
    expect(near.font).toBe('16px "IBM Plex Sans", sans-serif');
    expect(far.font).toBe('8px "IBM Plex Sans", sans-serif');
  });

  it('does not clear the canvas, so it can be layered over a grid', () => {
    // Regression: it used to clear, which silently erased the grid drawn
    // beneath it — the grid simply never appeared in the app.
    const ctx = new Recorder();
    renderDisplayList(ctx, { items: [] }, view);
    expect(ctx.calls.some((c) => c.startsWith('clearRect'))).toBe(false);
  });

  it('clearCanvas wipes and optionally paints a background', () => {
    const ctx = new Recorder();
    clearCanvas(ctx, view, '#101215');
    expect(ctx.calls).toContain('clearRect(0.0000,0.0000,800.0000,600.0000)');
    expect(ctx.calls).toContain('fillRect(0.0000,0.0000,800.0000,600.0000)');
  });

  it('draws stitch holes as dots sized in pixels', () => {
    const ctx = new Recorder();
    renderDisplayList(
      ctx,
      {
        items: [
          dotsItem(
            'stitch-holes',
            [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
            ],
            2,
          ),
        ],
      },
      view,
    );
    // 2 px at 4 px/mm is 0.5 mm in world space.
    expect(ctx.calls.filter((c) => c.startsWith('arc('))).toHaveLength(2);
    expect(ctx.calls.find((c) => c.startsWith('arc('))).toContain('0.5000');
  });
});

describe('the leather marks (F.7)', () => {
  const square = PathOps.polyline(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    true,
  );

  it('draws slits with butt caps, so a slit is exactly as long as its millimetres', () => {
    const ctx = new Recorder();
    const item = slitsItem(
      [
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        [
          { x: 4, y: 0 },
          { x: 5, y: 1 },
        ],
      ],
      1.25,
    );
    renderDisplayList(ctx, { items: [item] }, view);

    expect(ctx.calls.filter((c) => c.startsWith('moveTo'))).toHaveLength(2);
    expect(ctx.calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(2);
    const stroke = ctx.calls.find((c) => c.startsWith('stroke('));
    // Screen-constant width, divided back into millimetres; butt caps.
    expect(stroke).toBe('stroke(#2f6690,0.3125,butt)');
  });

  it('fills a band even-odd, so the inside of the inner edge stays clear', () => {
    const ctx = new Recorder();
    const inner = PathOps.polyline(
      [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
        { x: 8, y: 8 },
      ],
      true,
    );
    renderDisplayList(ctx, { items: [fillItem('cut', [square, inner], CANVAS.allowance)] }, view);
    expect(ctx.calls).toContain(`fill(${CANVAS.allowance},evenodd)`);
    expect(ctx.calls.filter((c) => c === 'closePath()')).toHaveLength(2);
  });

  it('clips a hatch to its cut-out, and draws nothing outside it', () => {
    const ctx = new Recorder();
    renderDisplayList(ctx, { items: [hatchItem(square)] }, view);
    const clip = ctx.calls.indexOf('clip()');
    const stroke = ctx.calls.findIndex((c) => c.startsWith('stroke('));
    expect(clip).toBeGreaterThan(-1);
    expect(stroke).toBeGreaterThan(clip);
    expect(ctx.calls[stroke]).toContain(CANVAS.hatch.colour);
    // The clip is undone before anything else is drawn.
    expect(ctx.calls.slice(stroke)).toContain('restore()');
  });

  it('draws fold ticks upright in screen pixels', () => {
    const ctx = new Recorder();
    renderDisplayList(ctx, { items: [foldTickItem({ x: 0, y: 0 }, 'valley')] }, view);
    // The world origin is the canvas centre, (400, 300): a V whose apex is below
    // its arms on screen.
    const w = CANVAS.foldTick.widthPx / 2;
    const h = CANVAS.foldTick.heightPx / 2;
    expect(ctx.calls).toContain(`moveTo(${(400 - w).toFixed(4)},${(300 - h).toFixed(4)})`);
    expect(ctx.calls).toContain(`lineTo(${(400).toFixed(4)},${(300 + h).toFixed(4)})`);
  });

  it('draws a link tick as two rings on the ground, turned to the line', () => {
    const ctx = new Recorder();
    renderDisplayList(
      ctx,
      { items: [linkTickItem('stitch', { x: 0, y: 0 }, { x: 0, y: 1 })] },
      view,
    );
    const rings = ctx.calls.filter((c) => c.startsWith('arc('));
    // Filled with the ground, then stroked: two discs and two rings.
    expect(rings).toHaveLength(4);
    expect(ctx.calls).toContain(`fill(${GROUND.ground})`);
    // A vertical line in the world is vertical on screen too: both centres
    // share an x.
    const xs = new Set(rings.map((c) => c.split(',')[0]));
    expect(xs.size).toBe(1);
  });

  it('draws the glyphs after the geometry, so a line never covers its tick', () => {
    const ctx = new Recorder();
    renderDisplayList(
      ctx,
      { items: [foldTickItem({ x: 0, y: 0 }, 'mountain'), pathItem('fold', square)] },
      view,
    );
    const lastGeometryStroke = ctx.calls.findIndex((c) => c.startsWith('stroke(#2e7d53,0.3125'));
    const tick = ctx.calls.findIndex((c) => c.startsWith('stroke(#2e7d53,1.2500'));
    expect(lastGeometryStroke).toBeGreaterThan(-1);
    expect(tick).toBeGreaterThan(lastGeometryStroke);
  });
});

describe('a clipped layer (7.4c)', () => {
  it('clips to the millimetre rectangle, draws inside it, and restores', () => {
    const ctx = new Recorder();
    const list = {
      items: [
        pathItem(
          'cut',
          PathOps.polyline([
            { x: -50, y: 0 },
            { x: 50, y: 0 },
          ]),
        ),
      ],
    };
    renderDisplayList(ctx, list, view, { clipMm: { minX: -10, minY: -5, maxX: 10, maxY: 5 } });

    const clipAt = ctx.calls.indexOf('clip()');
    const strokeAt = ctx.calls.findIndex((c) => c.startsWith('stroke('));
    expect(clipAt).toBeGreaterThan(-1);
    // The clip is traced in millimetres, under the world transform…
    expect(ctx.calls.slice(0, clipAt)).toEqual(
      expect.arrayContaining(['moveTo(-10.0000,-5.0000)', 'lineTo(10.0000,5.0000)']),
    );
    // …before anything is drawn, and taken away after.
    expect(strokeAt).toBeGreaterThan(clipAt);
    expect(ctx.calls.at(-1)).toBe('restore()');
    expect(ctx.calls.filter((c) => c === 'save()').length).toBe(
      ctx.calls.filter((c) => c === 'restore()').length,
    );
  });

  it('draws exactly as before without one', () => {
    const list = {
      items: [
        pathItem(
          'cut',
          PathOps.polyline([
            { x: 0, y: 0 },
            { x: 5, y: 0 },
          ]),
        ),
      ],
    };
    const plain = new Recorder();
    renderDisplayList(plain, list, view);
    expect(plain.calls).not.toContain('clip()');
  });
});
