import type { LayerRole } from '@leathercad/domain';

import { CANVAS } from './canvas.js';

/** How one role is drawn — on screen and on paper, from one row. */
export interface RoleStyle {
  /** On screen. Screen-constant, so a cut line stays a hairline at any zoom. */
  readonly colour: string;
  readonly widthPx: number;
  /** On paper, in true millimetres: a 0.25 mm line prints 0.25 mm wide. */
  readonly widthMm: number;
  /** Paper ink, 0 black to 1 white — a template exists to be photocopied. */
  readonly grey: number;
  /**
   * The dash rhythm, in millimetres, **for both media**. Empty is solid.
   *
   * Before F.4 the screen had its own rhythms in pixels, and a marking line
   * was solid on screen and dotted on the pattern (UI Foundations §2). A rhythm
   * is a code: one array, read by the canvas and the exporter alike, drawn at
   * its real size or not at all (`screenDash`).
   */
  readonly dashMm: readonly number[];
}

/**
 * Every line the pattern can contain, defined once (UI Foundations §8).
 *
 * The paper values are the ones that shipped in 6.1 and are verified on paper;
 * the screen took its rhythms from them rather than the other way round. The
 * screen colours are for the light drafting ground (F.5), §8.1's table.
 */
export const ROLE_STYLES: Readonly<Record<LayerRole, RoleStyle>> = {
  // The heaviest line in the drawing, in ink.
  cut: { colour: '#1d2126', widthPx: 1.75, widthMm: 0.25, grey: 0, dashMm: [] },
  stitch: { colour: '#2f6690', widthPx: 1.25, widthMm: 0.15, grey: 0, dashMm: [2, 2] },
  'stitch-holes': { colour: '#2f6690', widthPx: 1.25, widthMm: 0.15, grey: 0, dashMm: [] },
  fold: { colour: '#2e7d53', widthPx: 1.25, widthMm: 0.15, grey: 0, dashMm: [7, 2, 1.5, 2] },
  mark: { colour: '#7a7468', widthPx: 1, widthMm: 0.1, grey: 0.45, dashMm: [1, 1.5] },
  // Violet: out of the amber family, so a rivet can never read as selected.
  hardware: { colour: '#5b4ca8', widthPx: 1.5, widthMm: 0.2, grey: 0, dashMm: [] },
  // Measurements and labels.
  annotation: { colour: '#8a5a2b', widthPx: 1, widthMm: 0.1, grey: 0.35, dashMm: [] },
  construction: { colour: '#b6ad9b', widthPx: 1, widthMm: 0.1, grey: 0.6, dashMm: [1, 1] },
};
/**
 * The smallest dash or gap, in device pixels, that still reads as one.
 * Below it a rhythm is noise, and the line is drawn solid instead.
 */
export const DASH_LEGIBLE_PX = 1.5;

/**
 * The dash to draw at this zoom: **the true pattern, or none** (§2).
 *
 * Never a clamped or stretched pattern. A 2 mm dash drawn as 3 mm to stay
 * visible would make the line claim a spacing it does not have, so when the
 * rhythm is too fine to see, the line goes solid and is told apart by colour
 * and width instead. Sizes may be floored; rhythms never are.
 */
export function screenDash(dashMm: readonly number[], pxPerMm: number): readonly number[] {
  if (dashMm.length === 0) return dashMm;
  // Zoomed far out every rhythm goes solid, however long its segments (§9.3).
  if (pxPerMm < CANVAS.bands.solidDashBelowPxPerMm) return [];
  return Math.min(...dashMm) * pxPerMm >= DASH_LEGIBLE_PX ? dashMm : [];
}
