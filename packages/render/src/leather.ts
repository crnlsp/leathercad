import { EPS_LENGTH, approxZero, type Mm } from '@leathercad/core';
import {
  PathOps,
  SegmentOps,
  Vec2Ops,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';

import { CANVAS, NOMINAL_IRON, ROLE_STYLES } from './theme/index.js';

/**
 * How the canvas draws what only a leather pattern has (UI Foundations §8,
 * §9.3; F.7): stitch holes as slits, a fold's direction, the link on derived
 * geometry, a cut-out's hatch.
 *
 * Shared by the display-list builder and both screen backends, so the canvas
 * and its SVG snapshot place the same marks. Millimetres in, millimetres out,
 * except the two glyph shapes, which are screen chrome and work in pixels.
 */

/** A slit's two ends, in millimetres. */
export type SlitEnds = readonly [Vec2, Vec2];

export interface Slits {
  readonly slits: readonly SlitEnds[];
  /** Stroke width in device pixels: the blade's own, in the detail band. */
  readonly widthPx: number;
}

/**
 * Each hole as a pricking iron makes it: a slit centred on the hole, leaning at
 * the iron's slant to the line (§9.3).
 *
 * Measured from the hole's tangent, so the slant turns with the line round a
 * corner, as a maker turns the iron. A slit is a line through its centre, so a
 * line drawn the other way gives the same slit.
 *
 * - **Detail band:** true length and the blade's true thickness.
 * - **Working band:** the length floored at a few pixels, never the slant.
 *
 * The overview band draws no slits; the caller draws the set as its line.
 */
export function slitsFor(
  holes: readonly { readonly point: Vec2; readonly tangent: Vec2 }[],
  pitchMm: Mm,
  pxPerMm: number,
): Slits {
  const detail = pxPerMm >= CANVAS.bands.detailFromPxPerMm;
  const trueLength = NOMINAL_IRON.toothPerPitch * pitchMm;
  const lengthMm = detail ? trueLength : Math.max(trueLength, CANVAS.slit.minLengthPx / pxPerMm);
  const roleWidth = ROLE_STYLES['stitch-holes'].widthPx;
  const widthPx = detail ? Math.max(roleWidth, NOMINAL_IRON.bladeMm * pxPerMm) : roleWidth;

  // Hundreds of holes, on every frame: the rotation is worked out once.
  const half = lengthMm / 2;
  const cos = Math.cos(NOMINAL_IRON.slantRad) * half;
  const sin = Math.sin(NOMINAL_IRON.slantRad) * half;
  const slits = holes.map(({ point, tangent }): SlitEnds => {
    // Unit already, from the distribution; divided through in case. A hole
    // with no direction — a degenerate run — still gets a slit, along X.
    const length = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    const none = approxZero(length, EPS_LENGTH);
    const tx = none ? 1 : tangent.x / length;
    const ty = none ? 0 : tangent.y / length;
    const dx = tx * cos - ty * sin;
    const dy = tx * sin + ty * cos;
    return [
      { x: point.x - dx, y: point.y - dy },
      { x: point.x + dx, y: point.y + dy },
    ];
  });
  return { slits, widthPx };
}

/**
 * Where a fold's direction ticks go: one at the centre of each equal stretch,
 * about a tick-spacing apart on screen, so a short fold gets one at its middle.
 *
 * Symmetric, so the ticks do not move when the fold is drawn the other way. A
 * fold too short on screen to carry a tick gets none.
 */
export function foldTicksAlong(path: Path, pxPerMm: number): readonly Vec2[] {
  const measure = PathOps.measure(path);
  const lengthMm = measure.totalLength();
  const lengthPx = lengthMm * pxPerMm;
  if (lengthPx < CANVAS.foldTick.minLinePx) return [];

  const count = Math.max(1, Math.round(lengthPx / CANVAS.foldTick.spacingPx));
  return Array.from({ length: count }, (_, i) =>
    measure.pointAtDistance(((i + 0.5) / count) * lengthMm),
  );
}

/**
 * Where a derived line wears its link (§8.3): the middle of its longest run,
 * turned to it.
 *
 * Not halfway along the whole path. Halfway round a closed rectangle is its
 * opposite corner, where the line turns and the tick has no direction to
 * follow; the longest side is where the line is easiest to find.
 */
export function linkTickOn(path: Path): { at: Vec2; tangent: Vec2 } | null {
  let longest: Path['segments'][number] | null = null;
  let longestLength = -1;
  for (const segment of path.segments) {
    const length = SegmentOps.length(segment);
    if (length > longestLength) {
      longest = segment;
      longestLength = length;
    }
  }
  if (longest === null) return null;

  // The segment's own middle: exact by length for a line or an arc, and near
  // enough on a cubic for a mark that only has to sit on the run. This runs on
  // every frame, so it does not measure the whole path to find it.
  return {
    at: SegmentOps.pointAt(longest, 0.5),
    tangent: Vec2Ops.tryNormalise(SegmentOps.tangentAt(longest, 0.5)) ?? Vec2Ops.UNIT_X,
  };
}

/**
 * A fold tick in screen pixels: a V for a valley, a Λ for a mountain, centred
 * where it is put.
 *
 * **Upright on screen**, never turned to the line. Turned, it would point one
 * way along the fold, and which way would depend on the direction the fold was
 * drawn — a valley drawn backwards would read as a mountain. Upright, it reads
 * the same on any fold, and on a vertical one it is the mark itself.
 */
export function foldTickShape(
  atPx: Vec2,
  fold: 'valley' | 'mountain',
): readonly [Vec2, Vec2, Vec2] {
  const w = CANVAS.foldTick.widthPx / 2;
  // Screen Y points down: a valley's apex is below its arms.
  const h = (CANVAS.foldTick.heightPx / 2) * (fold === 'valley' ? 1 : -1);
  return [
    { x: atPx.x - w, y: atPx.y - h },
    { x: atPx.x, y: atPx.y + h },
    { x: atPx.x + w, y: atPx.y - h },
  ];
}

export interface Ring {
  readonly centre: Vec2;
  readonly radius: number;
}

/**
 * A link tick in screen pixels: two interlocked rings along the line. Also the
 * legend's artwork, so the key and the canvas draw one shape.
 */
export function linkTickShape(atPx: Vec2, tangentPx: Vec2): readonly [Ring, Ring] {
  const along = Vec2Ops.tryNormalise(tangentPx) ?? Vec2Ops.UNIT_X;
  const offset = Vec2Ops.scale(along, CANVAS.linkTick.apartPx / 2);
  const radius = CANVAS.linkTick.radiusPx;
  return [
    { centre: Vec2Ops.sub(atPx, offset), radius },
    { centre: Vec2Ops.add(atPx, offset), radius },
  ];
}

/**
 * A cut-out's hatch: lines at 45° across a box, `spacingMm` apart, for the
 * caller to clip to the cut-out.
 *
 * Anchored to the world — each line is `x − y = k · spacing · √2` — so the
 * hatch stays put as the drawing is panned rather than crawling across it.
 */
export function hatchLines(bounds: Rect, spacingMm: number): readonly SlitEnds[] {
  // Unit vectors along the hatch and across it.
  const along = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const across = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const reach = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2;

  const mid = Vec2Ops.dot(centre, across);
  const first = Math.floor((mid - reach) / spacingMm);
  const last = Math.ceil((mid + reach) / spacingMm);
  const alongCentre = Vec2Ops.dot(centre, along);

  const lines: SlitEnds[] = [];
  for (let k = first; k <= last; k++) {
    const foot = Vec2Ops.add(
      Vec2Ops.scale(across, k * spacingMm),
      Vec2Ops.scale(along, alongCentre),
    );
    lines.push([
      Vec2Ops.sub(foot, Vec2Ops.scale(along, reach)),
      Vec2Ops.add(foot, Vec2Ops.scale(along, reach)),
    ]);
  }
  return lines;
}
