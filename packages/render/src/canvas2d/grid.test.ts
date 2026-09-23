import { describe, expect, it } from 'vitest';

import type { Canvas2DLike } from './backend.js';
import { renderRulers } from './grid.js';

/** Keeps the labels and the fonts they were set in; ignores the rest. */
function recorder(): Canvas2DLike & { labels: string[]; fonts: string[] } {
  const labels: string[] = [];
  const fonts: string[] = [];
  const noop = (): void => {};
  let font = '';
  return {
    labels,
    fonts,
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
    stroke: noop,
    fill: noop,
    fillRect: noop,
    fillText: (text) => labels.push(text),
    setLineDash: noop,
    lineWidth: 1,
    strokeStyle: '',
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
