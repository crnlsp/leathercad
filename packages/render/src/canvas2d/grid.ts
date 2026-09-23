import { formatNumber } from '@leathercad/core';
import { MatOps, type Vec2 } from '@leathercad/geometry';

import {
  labelPrecisionFor,
  labelStepFor,
  majorStepFor,
  niceTickStepMm,
  ticksInRange,
} from '../ticks.js';
import { visibleBoundsMm, worldToScreen, type ViewportView } from '../view.js';
import { vendoredFamily, type Canvas2DLike } from './backend.js';
import { CANVAS } from '../theme/index.js';

/**
 * Draws the drafting ground's grid: three tiers at 1, 10 and 100 mm, each with
 * its own contrast step, each dropping out at the zoom where it would become
 * texture (UI Foundations §9.1). The axes go last, on top.
 *
 * Fixed millimetre tiers rather than an adaptive mesh: the one mesh this
 * replaced produced moiré zoomed in and vanished zoomed out, and a grid square
 * that changes size with the zoom is not a unit anyone can count in.
 */
export function renderGrid(ctx: Canvas2DLike, view: ViewportView): void {
  const bounds = visibleBoundsMm(view);
  const transform = worldToScreen(view);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  const tiers = CANVAS.grid;
  tiers.forEach((tier, index) => {
    if (view.scale < tier.minPxPerMm) return;
    // A line the next tier up will draw is left to it, so every line is drawn
    // once, in the strongest colour it has a right to.
    const coarser = tiers[index + 1]?.stepMm ?? null;

    ctx.strokeStyle = tier.colour;
    ctx.beginPath();
    for (const x of ticksInRange(bounds.minX, bounds.maxX, tier.stepMm)) {
      if (coarser !== null && isMultiple(x, coarser)) continue;
      const px = crisp(MatOps.apply(transform, { x, y: 0 }).x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, view.heightPx);
    }
    for (const y of ticksInRange(bounds.minY, bounds.maxY, tier.stepMm)) {
      if (coarser !== null && isMultiple(y, coarser)) continue;
      const py = crisp(MatOps.apply(transform, { x: 0, y }).y);
      ctx.moveTo(0, py);
      ctx.lineTo(view.widthPx, py);
    }
    ctx.stroke();
  });

  ctx.strokeStyle = CANVAS.axis;
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
  /** The hairline where a ruler meets the ground. */
  readonly edge: string;
  readonly tick: string;
  readonly text: string;
  /** The tick that follows the pointer (§9.2). */
  readonly cursor: string;
  readonly fontPx: number;
  readonly fontWeight: number;
  readonly fontFamily: string;
}

export const DEFAULT_RULER_STYLE: RulerStyle = {
  thicknessPx: 22,
  leftThicknessPx: 34,
  // On the ground they measure (UI Foundations §5.2, §9.2).
  background: CANVAS.ruler.background,
  edge: CANVAS.ruler.edge,
  tick: CANVAS.ruler.tick,
  text: CANVAS.ruler.text,
  cursor: CANVAS.cursorTick,
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
  /** Where the pointer is, for the tick that follows it on both rulers. */
  cursorMm: Vec2 | null = null,
): void {
  const bounds = visibleBoundsMm(view);
  const minorStep = niceTickStepMm(7, view.scale);
  const majorStep = majorStepFor(minorStep);
  const precision = labelPrecisionFor(majorStep);
  const transform = worldToScreen(view);
  const top = style.thicknessPx;
  const left = style.leftThicknessPx;

  // Labels thin, never overlap. Plex Sans digits and the minus are all 0.6 em
  // wide, so a label's width is known without measuring it: the widest one
  // across the top, and one line's height down the side, plus a gap.
  const widestLabel = Math.max(
    formatNumber(bounds.minX, precision).length,
    formatNumber(bounds.maxX, precision).length,
  );
  const topLabelStep = labelStepFor(
    majorStep,
    view.scale,
    widestLabel * 0.6 * style.fontPx + style.fontPx,
  );
  const leftLabelStep = labelStepFor(majorStep, view.scale, style.fontPx * 2);

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
    if (major && isMultiple(x, topLabelStep)) {
      ctx.fillText(formatNumber(x, precision), px + 3, top - 11);
    }
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
    if (major && isMultiple(y, leftLabelStep)) ctx.fillText(formatNumber(y, precision), 3, py);
  }
  ctx.stroke();

  // The hairlines where the rulers meet the ground.
  ctx.strokeStyle = style.edge;
  ctx.beginPath();
  ctx.moveTo(left, crisp(top - 1));
  ctx.lineTo(view.widthPx, crisp(top - 1));
  ctx.moveTo(crisp(left - 1), top);
  ctx.lineTo(crisp(left - 1), view.heightPx);
  ctx.stroke();

  // The cursor tick on both rulers: a drafting affordance that reads the
  // pointer's position off the scale it is being measured against (§9.2).
  if (cursorMm !== null) {
    const at = MatOps.apply(transform, cursorMm);
    ctx.strokeStyle = style.cursor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (at.x >= left && at.x <= view.widthPx) {
      ctx.moveTo(at.x, 0);
      ctx.lineTo(at.x, top);
    }
    if (at.y >= top && at.y <= view.heightPx) {
      ctx.moveTo(0, at.y);
      ctx.lineTo(left, at.y);
    }
    ctx.stroke();
  }

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
