import { ACCENT, GROUND } from './palette.js';

/** `#rrggbb` at an opacity, as `#rrggbbaa` — both screen backends read it. */
export function alpha(hex: string, opacity: number): string {
  return `${hex}${Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/**
 * How the drafting ground is drawn (UI Foundations §8.4, §8.5, §9).
 */
export const CANVAS = {
  /**
   * Three tiers with real contrast steps, each dropping out at the zoom where
   * it would become texture (§9.1). A uniform mesh produced moiré zoomed in and
   * vanished zoomed out.
   */
  grid: [
    { stepMm: 1, colour: GROUND.fine, minPxPerMm: 4 },
    { stepMm: 10, colour: GROUND.major, minPxPerMm: 0.6 },
    { stepMm: 100, colour: GROUND.hundred, minPxPerMm: 0 },
  ],
  axis: GROUND.axis,

  /**
   * Rulers sit on the ground they measure: ink-dim figures, and a tick in the
   * accent that follows the pointer on both (§9.2).
   */
  ruler: {
    background: GROUND.ground,
    edge: GROUND.major,
    tick: GROUND.hundred,
    text: GROUND.inkDim,
  },
  cursorTick: ACCENT.tanInk,

  /** Part captions: the drawing's own quiet voice, not a role's colour. */
  caption: GROUND.inkDim,

  /**
   * Selection adds, it never replaces (§8.4): a band of the accent beneath the
   * line, so a selected stitch line still looks like a stitch line.
   */
  halo: {
    widthPx: 5,
    hover: alpha(ACCENT.tanInk, 0.18),
    selected: alpha(ACCENT.tanInk, 0.45),
  },

  /**
   * The zoom bands (§9.3). Below `overviewBelowPxPerMm` individual holes stop
   * being drawn and a set renders as its stitch line; below
   * `solidDashBelowPxPerMm` every rhythm is drawn solid.
   */
  bands: {
    detailFromPxPerMm: 8,
    overviewBelowPxPerMm: 2,
    solidDashBelowPxPerMm: 0.6,
    /** The zoom assumed when none is given — the audit's working zoom. */
    workingPxPerMm: 4,
  },

  /**
   * A stitch hole is a slit (F.7). In the working band its length may be
   * floored so it stays a slit rather than a speck; its slant never is. A size
   * is a measurement and a slant is the code (decisions §2.4).
   */
  slit: { minLengthPx: 3 },

  /**
   * The seam allowance: the material between the stitching and the edge grown
   * from it, filled faintly beneath both lines (F.7).
   */
  allowance: alpha(GROUND.ink, 0.12),

  /** A cut-out's inward hatch, §8.1: removal, not boundary. */
  hatch: { colour: alpha(GROUND.ink, 0.18), spacingPx: 6, widthPx: 1 },

  /**
   * A fold's direction: a V for a valley, a Λ for a mountain, upright on
   * screen and centred on the line (F.7).
   */
  foldTick: { widthPx: 8, heightPx: 5, strokePx: 1.25, spacingPx: 96, minLinePx: 24 },

  /**
   * Derived is a state, not a colour (§8.3): two interlocked rings at the
   * path's midpoint, in the role's colour at 60 %, filled with the ground.
   */
  linkTick: { radiusPx: 2.5, apartPx: 3.5, strokePx: 1.25, opacity: 0.6 },

  /** A failure is a glyph with a short leader to its evidence (§8.5). */
  marker: { sizePx: 11, leaderPx: 14 },

  /**
   * The tools' own feedback — rubber bands, previews, live numbers — in the
   * accent's ground value: it is the user's current focus. The selection box
   * is quieter, and the snap glyph must never be mistaken for either.
   */
  overlay: { preview: ACCENT.tanInk, box: GROUND.inkDim, snap: '#b0369c' },

  /**
   * The paper reference's visual language only (F.5; the feature is later):
   * corner ticks around the printable area, in the 100 mm grid's value, hidden
   * below 2 px/mm, beneath the geometry and never clipping it.
   */
  paperReference: { colour: GROUND.hundred, minPxPerMm: 2 },
} as const;
