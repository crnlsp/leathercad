import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Canvas2DLike } from './backend.js';
import { CANVAS, GROUND } from '../theme/index.js';
import type { ViewportView } from '../view.js';
import { renderGrid, renderRulers } from './grid.js';

type Recorded = Canvas2DLike & {
  labels: string[];
  fonts: string[];
  strokes: string[];
  widths: number[];
  transforms: number[][];
  placed: { text: string; x: number; y: number }[];
};

/** Keeps the labels, the fonts they were set in, the strokes and the transforms; ignores the rest. */
function recorder(): Recorded {
  const labels: string[] = [];
  const placed: { text: string; x: number; y: number }[] = [];
  const fonts: string[] = [];
  const strokes: string[] = [];
  const widths: number[] = [];
  const transforms: number[][] = [];
  const noop = (): void => {};
  let font = '';
  let strokeStyle = '';
  const ctx: Recorded = {
    labels,
    fonts,
    strokes,
    widths,
    transforms,
    placed,
    save: noop,
    restore: noop,
    setTransform: (...m: number[]) => {
      transforms.push(m);
    },
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    stroke: () => {
      strokes.push(strokeStyle);
      widths.push(ctx.lineWidth);
    },
    fill: noop,
    clip: noop,
    fillRect: noop,
    fillText: (text, x, y) => {
      labels.push(text);
      placed.push({ text, x, y });
    },
    strokeText: noop,
    setLineDash: noop,
    lineWidth: 1,
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
    fillStyle: '',
    get font() {
      return font;
    },
    set font(value: string) {
      font = value;
      fonts.push(value);
    },
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
  };
  return ctx;
}

/** The same CSS canvas, 800 × 600, at a CSS zoom on a display of this ratio. */
const on = (cssPxPerMm: number, dpr = 1): ViewportView => ({
  centreMm: { x: 0, y: 0 },
  scale: cssPxPerMm * dpr,
  widthPx: 800 * dpr,
  heightPx: 600 * dpr,
  dpr,
});

/** The displays a maker has: 100 %, the fractional scales Windows and Linux offer, Retina. */
const ratios = fc.constantFrom(1, 1.25, 1.5, 2, 3);

describe('renderRulers', () => {
  // The origin at the centre of an 800 × 600 canvas, 2 px to the millimetre:
  // both rulers run from about −200 to +200 mm.
  const view = on(2);

  it('writes a negative position with a true minus, as wide as a digit', () => {
    const ctx = recorder();

    renderRulers(ctx, view);

    const negatives = ctx.labels.filter((label) => label.startsWith('−'));
    expect(negatives.length).toBeGreaterThan(0);
    expect(ctx.labels.some((label) => label.includes('-'))).toBe(false);
    // Zero is zero, never "−0".
    expect(ctx.labels).toContain('0');
  });

  it('sets its figures as a measurement: Plex Sans 500 at 11 px, nothing smaller', () => {
    const ctx = recorder();

    renderRulers(ctx, view);

    expect(ctx.fonts).toEqual(['500 11px "IBM Plex Sans", sans-serif']);
  });

  it('is drawn in CSS pixels, so a 2× display gets the same rulers, twice as sharp', () => {
    // Before U.1 the canvas host multiplied the rulers' style by the ratio
    // itself; the ticks, their spacing and the cursor tick stayed device
    // pixels, so on a 2× display they were half the size and twice as dense.
    fc.assert(
      fc.property(ratios, fc.double({ min: 0.05, max: 40, noNaN: true }), (dpr, css) => {
        const one = recorder();
        const other = recorder();
        renderRulers(one, on(css), undefined, { x: 10, y: 10 });
        renderRulers(other, on(css, dpr), undefined, { x: 10, y: 10 });
        expect(other.fonts).toEqual(one.fonts);
        expect(other.widths).toEqual(one.widths);
        expect(other.transforms).toEqual(one.transforms.map(() => [dpr, 0, 0, dpr, 0, 0]));
      }),
    );
  });

  it('spaces and labels its ticks by the CSS zoom, so a 2× display reads the same', () => {
    // Ratios that scale a float exactly, so a tick on the canvas's very edge
    // cannot come and go in the last bit and the comparison is about the rule.
    fc.assert(
      fc.property(
        fc.constantFrom(2, 4),
        fc.double({ min: 0.05, max: 40, noNaN: true }),
        (dpr, css) => {
          const one = recorder();
          const other = recorder();
          renderRulers(one, on(css));
          renderRulers(other, on(css, dpr));
          expect(other.placed).toEqual(one.placed);
        },
      ),
    );
  });
});

describe('renderGrid — three tiers (F.5, R-02)', () => {
  it('draws the 1 mm tier only from 6 CSS px/mm (160 %), on any display', () => {
    for (const dpr of [1, 2]) {
      const below = recorder();
      renderGrid(below, on(5.9, dpr));
      expect(below.strokes, `${String(dpr)}×`).not.toContain(GROUND.fine);

      const above = recorder();
      renderGrid(above, on(6, dpr));
      expect(above.strokes, `${String(dpr)}×`).toContain(GROUND.fine);
    }
  });

  it('draws the 10 mm tier only from 1.5 CSS px/mm (40 %), on any display', () => {
    for (const dpr of [1, 2]) {
      const below = recorder();
      renderGrid(below, on(1.49, dpr));
      expect(below.strokes, `${String(dpr)}×`).not.toContain(GROUND.major);

      const above = recorder();
      renderGrid(above, on(1.5, dpr));
      expect(above.strokes, `${String(dpr)}×`).toContain(GROUND.major);
    }
  });

  it('picks its tiers by the CSS zoom alone, whatever the display', () => {
    fc.assert(
      fc.property(ratios, fc.double({ min: 0.05, max: 40, noNaN: true }), (dpr, css) => {
        const one = recorder();
        const other = recorder();
        renderGrid(one, on(css));
        renderGrid(other, on(css, dpr));
        expect(other.strokes).toEqual(one.strokes);
      }),
    );
  });

  it('draws every line one CSS pixel wide: two device pixels on a 2× display', () => {
    const ctx = recorder();
    renderGrid(ctx, on(8, 2));
    expect(ctx.transforms).toEqual([[2, 0, 0, 2, 0, 0]]);
    expect(new Set(ctx.widths)).toEqual(new Set([1]));
  });

  it('keeps the 100 mm tier and the axes at any zoom', () => {
    const far = recorder();
    renderGrid(far, on(0.05));
    expect(far.strokes).toEqual([GROUND.hundred, CANVAS.axis]);
  });
});

describe('renderRulers — the cursor tick (F.5)', () => {
  const view = on(2);

  it('marks the pointer on both rulers, in the accent', () => {
    const ctx = recorder();
    renderRulers(ctx, view, undefined, { x: 10, y: 10 });
    expect(ctx.strokes).toContain(CANVAS.cursorTick);
  });

  it('marks nothing when the pointer is off the canvas', () => {
    const ctx = recorder();
    renderRulers(ctx, view);
    expect(ctx.strokes).not.toContain(CANVAS.cursorTick);
  });
});

describe('renderRulers — labels that never run together (F.5)', () => {
  it('thins the top labels when zoomed out, so neighbours keep a label apart', () => {
    // 0.2 px/mm: major ticks every 100 mm are 20 px apart, and "−1200" needs
    // about 33 px at 11 px. Every major tick used to be labelled.
    const ctx = recorder();
    renderRulers(ctx, on(0.2));

    const top = ctx.placed.filter((label) => label.y < 22).sort((a, b) => a.x - b.x);
    expect(top.length).toBeGreaterThan(2);
    for (let i = 1; i < top.length; i++) {
      const previous = top[i - 1]!;
      const width = previous.text.length * 0.6 * 11;
      expect(top[i]!.x - previous.x).toBeGreaterThanOrEqual(width);
    }
  });
});
