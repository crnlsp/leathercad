import { formatNumber } from '@leathercad/core';
import { MatOps } from '@leathercad/geometry';

import { labelPrecisionFor, majorStepFor, niceTickStepMm, ticksInRange } from '../ticks.js';
import { visibleBoundsMm, worldToScreen, type ViewportView } from '../view.js';
import { vendoredFamily, type Canvas2DLike } from './backend.js';

export interface GridStyle {
  readonly minor: string;
  readonly major: string;
  readonly axis: string;
  /** Minimum on-screen spacing before the grid coarsens, in device pixels. */
  readonly minSpacingPx?: number;
}

export const DEFAULT_GRID_STYLE: GridStyle = {
  minor: '#23262b',
  major: '#2f343b',
  axis: '#454c56',
  minSpacingPx: 7,
};

/**
 * Draws an adaptive millimetre grid.
 *
 * Lines are emitted in **screen space**, not through the world transform.
 * A gridline is one device pixel wide by definition, and pushing a hairline
 * through a scale transform makes its width depend on zoom — which is exactly
 * the blurring the grid exists to avoid. Snapping to a half-pixel keeps it
 * crisp rather than smeared across two rows.
 */
export function renderGrid(
  ctx: Canvas2DLike,
  view: ViewportView,
  style: GridStyle = DEFAULT_GRID_STYLE,
): void {
  const bounds = visibleBoundsMm(view);
  const minorStep = niceTickStepMm(style.minSpacingPx ?? 7, view.scale);
  const majorStep = majorStepFor(minorStep);
  const transform = worldToScreen(view);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  const drawLines = (steps: number, colour: string, skipMultipleOf: number | null): void => {
    ctx.strokeStyle = colour;
    ctx.beginPath();

    for (const x of ticksInRange(bounds.minX, bounds.maxX, steps)) {
      if (skipMultipleOf !== null && isMultiple(x, skipMultipleOf)) continue;
      const px = crisp(MatOps.apply(transform, { x, y: 0 }).x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, view.heightPx);
    }

    for (const y of ticksInRange(bounds.minY, bounds.maxY, steps)) {
      if (skipMultipleOf !== null && isMultiple(y, skipMultipleOf)) continue;
      const py = crisp(MatOps.apply(transform, { x: 0, y }).y);
      ctx.moveTo(0, py);
      ctx.lineTo(view.widthPx, py);
    }

    ctx.stroke();
  };

  // Minor lines skip positions a major line will cover, so the two never
  // overlap and the major stays its own colour.
  drawLines(minorStep, style.minor, majorStep);
  drawLines(majorStep, style.major, null);

  // The origin, drawn last so it sits on top.
  ctx.strokeStyle = style.axis;
  ctx.beginPath();
  const origin = MatOps.apply(transform, { x: 0, y: 0 });
  ctx.moveTo(crisp(origin.x), 0);
  ctx.lineTo(crisp(origin.x), view.heightPx);
  ctx.moveTo(0, crisp(origin.y));
  ctx.lineTo(view.widthPx, crisp(origin.y));
  ctx.stroke();

  ctx.restore();
}

export interface RulerStyle {
  readonly thicknessPx: number;
  /**
   * The left ruler needs more room than the top one: its labels run across
   * the strip rather than along it, and "−160" does not fit in 22 px.
   */
  readonly leftThicknessPx: number;
  readonly background: string;
  readonly tick: string;
  readonly text: string;
  readonly fontPx: number;
  readonly fontWeight: number;
  readonly fontFamily: string;
}

export const DEFAULT_RULER_STYLE: RulerStyle = {
  thicknessPx: 22,
  leftThicknessPx: 34,
  background: '#1b1d21',
  tick: '#5a626d',
  text: '#8b929b',
  // `--t-num-micro` (UI Foundations §4.2): nothing below 11 px, and a
  // measurement one weight above body.
  fontPx: 11,
  fontWeight: 500,
  // The vendored face, not a platform monospace. Plex's digits are already
  // tabular — every one has the same advance — so the ruler's figures line up
  // without asking the host for a typewriter font that differs on every
  // machine and makes a rendered reference unreproducible.
  fontFamily: vendoredFamily(),
};

/**
 * Draws millimetre rulers along the top and left edges.
 *
 * The whole point of the application is that a stated millimetre is a real
 * millimetre, so the ruler is not decoration — it is the thing that lets
 * someone check the claim on screen before they ever reach a printer.
 */
export function renderRulers(
  ctx: Canvas2DLike,
  view: ViewportView,
  style: RulerStyle = DEFAULT_RULER_STYLE,
): void {
  const bounds = visibleBoundsMm(view);
  const minorStep = niceTickStepMm(7, view.scale);
  const majorStep = majorStepFor(minorStep);
  const precision = labelPrecisionFor(majorStep);
  const transform = worldToScreen(view);
  const top = style.thicknessPx;
  const left = style.leftThicknessPx;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setLineDash([]);
  ctx.lineWidth = 1;

  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, view.widthPx, top);
  ctx.fillRect(0, 0, left, view.heightPx);

  ctx.font = `${style.fontWeight} ${style.fontPx}px ${style.fontFamily}`;
  ctx.fillStyle = style.text;
  ctx.strokeStyle = style.tick;

  // Top ruler.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.beginPath();
  for (const x of ticksInRange(bounds.minX, bounds.maxX, minorStep)) {
    const px = crisp(MatOps.apply(transform, { x, y: 0 }).x);
    if (px < left) continue;
    const major = isMultiple(x, majorStep);
    ctx.moveTo(px, major ? top - 9 : top - 4);
    ctx.lineTo(px, top);
    if (major) ctx.fillText(formatNumber(x, precision), px + 3, top - 11);
  }
  ctx.stroke();

  // Left ruler. Labels stay upright rather than rotated — a rotated number is
  // harder to read — and are left-aligned from the edge so a long one like
  // "−160" has the whole strip to run into instead of overflowing off-canvas.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  for (const y of ticksInRange(bounds.minY, bounds.maxY, minorStep)) {
    const py = crisp(MatOps.apply(transform, { x: 0, y }).y);
    if (py < top) continue;
    const major = isMultiple(y, majorStep);
    ctx.moveTo(major ? left - 9 : left - 4, py);
    ctx.lineTo(left, py);
    if (major) ctx.fillText(formatNumber(y, precision), 3, py);
  }
  ctx.stroke();

  // Corner patch, so the two rulers meet cleanly.
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, left, top);

  ctx.restore();
}

/**
 * Snaps to a half-pixel.
 *
 * A one-pixel line centred on an integer coordinate straddles two pixel rows
 * and renders as two grey ones; centred on a half it lands on exactly one.
 */
function crisp(value: number): number {
  return Math.round(value) + 0.5;
}

function isMultiple(value: number, step: number): boolean {
  const multiple = value / step;
  return Math.abs(multiple - Math.round(multiple)) < 1e-9;
}
