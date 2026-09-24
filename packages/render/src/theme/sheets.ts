import { alpha } from './canvas.js';

/**
 * The paper, and what the screen says about it (7.4b, 7.4c).
 *
 * **Ink and not-ink.** Anything that will print is drawn in the print greys
 * of the role table and of `PAPER_FURNITURE` — on the Sheets view's white
 * paper exactly as it will come out. Anything that will *not* print — a sheet's
 * number above it, the printable area's outline, a tape join shown on the
 * design board — is drawn in `SHEET.furniture`, a magenta no role uses and no
 * grey can be, the colour page-layout tools have long used for non-printing
 * guides. Nothing screen-only can then be mistaken for something on the paper.
 */
const FURNITURE = '#c22a8c';

export const SHEET = {
  /** A sheet of paper in the Sheets view: the lightest thing on screen. */
  paper: '#ffffff',
  /** Its edge. */
  paperEdge: '#9d968a',
  /** The ground behind the sheets: the drafting ground, dimmed, so it is not paper. */
  ground: '#d8d3c9',
  /** Screen-only furniture: never printed. */
  furniture: FURNITURE,
  /** The verification block's reserved band, tinted so the lost space is visible. */
  reservedBand: alpha(FURNITURE, 0.06),
  /**
   * Screen sizes, in CSS pixels before device scaling — kept here, with every
   * other pixel quantity, so the builders in `packages/export` name tokens
   * rather than hold pixel numbers of their own.
   */
  /** A sheet's number and a taped piece's name. */
  labelPx: 13,
  /** "Tape join" on the design board. */
  joinLabelPx: 11,
  /** A tape join on the design board. */
  joinStrokePx: 1.25,
  /** The paper's edge, the printable area's outline, and page-furniture ink. */
  hairlinePx: 1,
  /** The printable area's outline: a screen rhythm, since it is never printed. */
  outlineDashPx: [4, 3] as readonly number[],
  /** Between sheets, in millimetres of the view: clearly not paper. */
  gapMm: 24,
} as const;

/**
 * Page furniture as it is **printed** — tile joins and registration crosses
 * (7.2a). The PDF writer prints from these values, and the screen draws the
 * same dash rhythm, so a join looks the same on the board, on a sheet and on
 * paper.
 */
export const PAPER_FURNITURE = {
  /**
   * A join line: light grey, in long dashes no pattern role uses — a cut is
   * solid, a stitch line 2-2, a fold dash-dot — so nobody cuts or stitches
   * along one.
   */
  join: { grey: 0.6, widthMm: 0.2, dashMm: [6, 3] as readonly number[] },
  /** Half a registration cross's arm. */
  crossArmMm: 3,
} as const;
