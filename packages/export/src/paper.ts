import { approxLte, type Mm } from '@leathercad/core';
import {
  PAPER_SIZES,
  type Orientation,
  type PaperName,
  type PaperSize,
  type ProjectSettings,
} from '@leathercad/domain';
import { textWidthMm } from '@leathercad/typography';

import { BRAND_MARK_ASPECT } from './brandMark.js';

/**
 * Paper sizes and the millimetre-to-point conversion.
 *
 * PDF's default user space is 1/72 inch. Placing geometry at `mm * MM_TO_PT`
 * and emitting **no scaling transform** makes 1:1 the definition of what was
 * written rather than something the code has to achieve.
 */

/** Exact: 72 points per inch, 25.4 mm per inch. */
export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: Mm): number {
  return mm * MM_TO_PT;
}

export function ptToMm(pt: number): Mm {
  return pt / MM_TO_PT;
}

export interface Margins {
  readonly top: Mm;
  readonly right: Mm;
  readonly bottom: Mm;
  readonly left: Mm;
}

/**
 * Ten millimetres all round.
 *
 * Almost no consumer printer reaches closer than 4–6 mm to the paper edge, and
 * content placed there is silently clipped. Ten is comfortably outside any
 * consumer dead zone.
 */
export const DEFAULT_MARGINS: Margins = { top: 10, right: 10, bottom: 10, left: 10 };

export interface PageSetup {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
  readonly marginsMm: Margins;
  /**
   * Height reserved at the foot of the page for the verification strip, when
   * its words fit beside the gauge. A sheet too narrow for that stacks them
   * above it and reserves more; `verificationLayout` decides.
   *
   * Must clear the gauge plus the gap above it, or a pattern gets printed over
   * the very thing that proves the scale is right. A raster test caught
   * exactly that once, when the block was a 50 mm square.
   */
  readonly footerHeightMm: Mm;
}

/** The gauge: a box exactly this wide and tall, measured to its lines' centres. */
const GAUGE_WIDTH_MM = 100;
const GAUGE_HEIGHT_MM = 5;
/** The gauge's bottom edge above the margin, so its line's ink is inside it too. */
const GAUGE_LIFT_MM = 0.5;
/** Between the strip's ink and the pattern above it. */
const CLEARANCE_MM = 3;

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: PAPER_SIZES.A4,
  orientation: 'portrait',
  marginsMm: DEFAULT_MARGINS,
  footerHeightMm: GAUGE_LIFT_MM + GAUGE_HEIGHT_MM + CLEARANCE_MM,
};

/**
 * The paper vocabulary a project stores lives in `@leathercad/domain`, because
 * `ProjectSettings` has to name it and `domain` cannot import this package.
 * Re-exported here so callers of the export API keep one import.
 */
export { PAPER_SIZES, type Orientation, type PaperName, type PaperSize };

/** Sheet dimensions with orientation applied. */
export function sheetSizeMm(setup: PageSetup): { widthMm: Mm; heightMm: Mm } {
  const { widthMm, heightMm } = setup.paper;
  return setup.orientation === 'portrait'
    ? { widthMm, heightMm }
    : { widthMm: heightMm, heightMm: widthMm };
}

/**
 * The project's stored choice, turned into the full page setup everything else
 * takes. **The one conversion point**, so there is nowhere for a second paper
 * setting to appear: a caller either passes this or gets the default.
 *
 * Margins and the footer come from here rather than from the project because
 * they are not the maker's decision yet (§ the 5.5 slice).
 */
export function pageSetupFor(settings: ProjectSettings): PageSetup {
  return pageSetupOf(settings.paper, settings.orientation);
}

/** The page setup for a paper and orientation, with margins and footer as exported. */
export function pageSetupOf(paper: PaperName, orientation: Orientation): PageSetup {
  return { ...DEFAULT_PAGE_SETUP, paper: PAPER_SIZES[paper], orientation };
}

/**
 * The area a pattern may occupy: the sheet less margins and the verification strip.
 *
 * Returned in millimetres with its origin at the bottom-left of the sheet,
 * matching the Y-up model and PDF's own coordinate system.
 */
export function contentAreaMm(setup: PageSetup): {
  x: Mm;
  y: Mm;
  widthMm: Mm;
  heightMm: Mm;
} {
  const sheet = sheetSizeMm(setup);
  const { marginsMm: m } = setup;
  const footer = verificationLayout(setup).heightMm;
  return {
    x: m.left,
    y: m.bottom + footer,
    widthMm: Math.max(0, sheet.widthMm - m.left - m.right),
    heightMm: Math.max(0, sheet.heightMm - m.top - m.bottom - footer),
  };
}

/**
 * What the verification strip says, and how large. English, like everything
 * printed (ADR 0018): the paper's glyphs are Latin.
 */
export const VERIFICATION_TEXT = {
  /** Inside the gauge, above its ticks. */
  instruction: 'Print at 100 % / Actual size — this box is 100 × 5 mm',
  instructionSizeMm: 2.2,
  /** The sheet's words beside the gauge. */
  sizeMm: 2,
} as const;

/** A taped sheet's neighbours, by the side of it they join. */
export interface Neighbours {
  readonly above?: number | undefined;
  readonly left?: number | undefined;
  readonly right?: number | undefined;
  readonly below?: number | undefined;
}

/**
 * Which sheets a taped sheet joins, said where the maker looks for it — beside
 * the sheet's number: `joins sheet 3 to the right`, or for a sheet in a grid,
 * `joins sheets 1 above, 2 left, 4 right`. The dashed line and the crosses on
 * it already show how; what a maker with sheets spread on a table needs is
 * which one goes there.
 */
export function describeJoins(neighbours: Neighbours): string {
  const sides = (['above', 'left', 'right', 'below'] as const).flatMap((side) => {
    const sheet = neighbours[side];
    return sheet === undefined ? [] : [{ side, sheet }];
  });
  if (sides.length === 1) {
    const [{ side, sheet }] = sides as [{ side: keyof Neighbours; sheet: number }];
    const where = side === 'left' || side === 'right' ? `to the ${side}` : side;
    return `joins sheet ${String(sheet)} ${where}`;
  }
  return `joins sheets ${sides.map(({ side, sheet }) => `${String(sheet)} ${side}`).join(', ')}`;
}

/** Where the verification strip's pieces go on one sheet, in mm from its bottom-left. */
export interface VerificationLayout {
  /** The gauge's bottom-left corner: a box `gaugeWidthMm` × `gaugeHeightMm`. */
  readonly gauge: { readonly x: Mm; readonly y: Mm };
  readonly gaugeWidthMm: Mm;
  readonly gaugeHeightMm: Mm;
  /** The instruction, inside the gauge, from the start of its baseline. */
  readonly instruction: { readonly x: Mm; readonly y: Mm };
  /** LeatherCAD's mark — the pocket of its icon — by its bottom-left corner, at the right margin. */
  readonly mark: { readonly x: Mm; readonly y: Mm; readonly heightMm: Mm };
  /**
   * The sheet's words, right-aligned at `x` beside the mark, by baseline: what
   * the sheet is on top, where it came from below. Neither is ever wider than
   * `textMaxWidthMm`.
   */
  readonly lines: { readonly x: Mm; readonly top: Mm; readonly bottom: Mm };
  readonly textMaxWidthMm: Mm;
  /** How much of the sheet above the bottom margin the strip reserves. */
  readonly heightMm: Mm;
}

/** Between the gauge and the words beside it, and between the words and the mark. */
const TEXT_GAP_MM = 6;
const MARK_GAP_MM = 1.5;
/** The two lines' baselines above the bottom of their block: room for descenders, and the pitch. */
const DESCENT_MM = 0.55;
const LINE_PITCH_MM = 2.4;
/** Between the gauge and words stacked above it. */
const STACK_GAP_MM = 2;

/**
 * The widest words a sheet carries that are never shortened — its number and
 * the most joins a taped sheet can have. The names around them are.
 */
const WIDEST_FIXED_MM = textWidthMm(
  `… · Sheet 88 of 88 · …, ${describeJoins({ above: 88, left: 88, right: 88, below: 88 })}`,
  VERIFICATION_TEXT.sizeMm,
);

/**
 * The verification strip's layout on this sheet — **the one answer**, read by
 * the PDF writer to draw it and by `contentAreaMm` to keep the pattern off it.
 *
 * One strip at the foot of the printable area, inside the margins, 5 mm of
 * ink: a 100 × 5 mm gauge with the instruction to print at actual size
 * written in it; beside it, right-aligned, what the sheet is and where it came
 * from, in two lines; and LeatherCAD's mark in the corner. Nothing prints in
 * the margins, which no printer is trusted to reach (Q17).
 *
 * The gauge is long rather than square because length is what shows an error:
 * a print at 97 % is 3 mm short across its 100 mm, where a 25 mm square would
 * be under a millimetre out. Its height is the two lines of words beside it:
 * a thinner gauge would not make the strip thinner. Where the words do not fit
 * beside it — A5 portrait — they stack above it, and the strip reserves that
 * much more.
 */
export function verificationLayout(setup: PageSetup): VerificationLayout {
  const sheet = sheetSizeMm(setup);
  const m = setup.marginsMm;
  const gauge = { x: m.left, y: m.bottom + GAUGE_LIFT_MM };
  const markWidth = GAUGE_HEIGHT_MM * BRAND_MARK_ASPECT;
  const right = sheet.widthMm - m.right;
  const wordsRight = right - markWidth - MARK_GAP_MM;
  const block = (bottom: Mm) => ({
    mark: { x: right - markWidth, y: bottom, heightMm: GAUGE_HEIGHT_MM },
    lines: {
      x: wordsRight,
      bottom: bottom + DESCENT_MM,
      top: bottom + DESCENT_MM + LINE_PITCH_MM,
    },
  });
  const common = {
    gauge,
    gaugeWidthMm: GAUGE_WIDTH_MM,
    gaugeHeightMm: GAUGE_HEIGHT_MM,
    // Above the tallest tick, with room for the descenders between.
    instruction: { x: gauge.x + 2, y: gauge.y + 2.15 },
  };

  const beside = wordsRight - (gauge.x + GAUGE_WIDTH_MM + TEXT_GAP_MM);
  if (approxLte(WIDEST_FIXED_MM, beside)) {
    return {
      ...common,
      ...block(gauge.y),
      textMaxWidthMm: beside,
      heightMm: setup.footerHeightMm,
    };
  }

  // The words and the mark take the gauge's height again, above it.
  const rise = STACK_GAP_MM + GAUGE_HEIGHT_MM;
  return {
    ...common,
    ...block(gauge.y + GAUGE_HEIGHT_MM + STACK_GAP_MM),
    textMaxWidthMm: wordsRight - m.left,
    heightMm: setup.footerHeightMm + rise,
  };
}

/**
 * Every paper size and orientation that would fit the given extent, as it is
 * or turned a quarter as pagination may turn it, in the order of
 * `PAPER_SIZES`, for telling a user what would work when their pattern does
 * not fit.
 */
export function paperOptionsFitting(
  widthMm: Mm,
  heightMm: Mm,
  template: PageSetup = DEFAULT_PAGE_SETUP,
): Array<{ paper: PaperSize; orientation: Orientation }> {
  const options: Array<{ paper: PaperSize; orientation: Orientation }> = [];

  for (const paper of Object.values(PAPER_SIZES)) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const area = contentAreaMm({ ...template, paper, orientation });
      const fits = (w: Mm, h: Mm): boolean =>
        approxLte(w, area.widthMm) && approxLte(h, area.heightMm);
      if (fits(widthMm, heightMm) || fits(heightMm, widthMm)) {
        options.push({ paper, orientation });
      }
    }
  }
  return options;
}
