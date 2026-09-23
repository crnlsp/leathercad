import { describe, expect, it } from 'vitest';

import type { Canvas2DLike } from './backend.js';
import { CANVAS, GROUND } from '../theme/index.js';
import { renderGrid, renderRulers } from './grid.js';

/** Keeps the labels and the fonts they were set in; ignores the rest. */
function recorder(): Canvas2DLike & {
  labels: string[];
  fonts: string[];
  strokes: string[];
  placed: { text: string; x: number; y: number }[];
} {
  const labels: string[] = [];
  const placed: { text: string; x: number; y: number }[] = [];
  const fonts: string[] = [];
  const strokes: string[] = [];
  const noop = (): void => {};
  let font = '';
  let strokeStyle = '';
  return {
    labels,
    fonts,
    strokes,
    placed,
    save: noop,
    restore: noop,
    setTransform: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    stroke: () => strokes.push(strokeStyle),
    fill: noop,
    clip: noop,
    fillRect: noop,
    fillText: (text, x, y) => {
      labels.push(text);
      placed.push({ text, x, y });
    },
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
}

describe('renderRulers', () => {
  // The origin at the centre of an 800 × 600 canvas, 2 px to the millimetre:
  // both rulers run from about −200 to +200 mm.
  const view = { centreMm: { x: 0, y: 0 }, scale: 2, widthPx: 800, heightPx: 600 };

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
});

describe('renderGrid — three tiers (F.5)', () => {
  const at = (scale: number) => ({ centreMm: { x: 0, y: 0 }, scale, widthPx: 800, heightPx: 600 });

  it('draws the 1 mm tier only from 4 px/mm, where it stops being texture', () => {
    const below = recorder();
    renderGrid(below, at(3.9));
    expect(below.strokes).not.toContain(GROUND.fine);

    const above = recorder();
    renderGrid(above, at(4));
    expect(above.strokes).toContain(GROUND.fine);
  });

  it('keeps the 100 mm tier and the axes at any zoom', () => {
    const far = recorder();
    renderGrid(far, at(0.05));
    expect(far.strokes).toEqual([GROUND.hundred, CANVAS.axis]);
  });
});

describe('renderRulers — the cursor tick (F.5)', () => {
  const view = { centreMm: { x: 0, y: 0 }, scale: 2, widthPx: 800, heightPx: 600 };

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
    renderRulers(ctx, { centreMm: { x: 0, y: 0 }, scale: 0.2, widthPx: 800, heightPx: 600 });

    const top = ctx.placed.filter((label) => label.y < 22).sort((a, b) => a.x - b.x);
    expect(top.length).toBeGreaterThan(2);
    for (let i = 1; i < top.length; i++) {
      const previous = top[i - 1]!;
      const width = previous.text.length * 0.6 * 11;
      expect(top[i]!.x - previous.x).toBeGreaterThanOrEqual(width);
    }
  });
});
