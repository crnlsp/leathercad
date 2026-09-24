import { approxLte, type Mm } from '@leathercad/core';
import {
  PAPER_SIZES,
  type Orientation,
  type PaperName,
  type PaperSize,
  type ProjectSettings,
} from '@leathercad/domain';

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
   * Height reserved at the foot of the page for the verification block, when
   * its square sits beside the ruler. A sheet too narrow for that stacks the
   * square above the ruler and reserves more; `verificationLayout` decides.
   *
   * Must clear the 50 mm square plus the warning text above it, or a pattern
   * gets printed over the very thing that proves the scale is right. A raster
   * test caught exactly that: the square ran from 18 mm to 68 mm while the
   * content area began at 36 mm.
   */
  readonly footerHeightMm: Mm;
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: PAPER_SIZES.A4,
  orientation: 'portrait',
  marginsMm: DEFAULT_MARGINS,
  footerHeightMm: 62,
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
  return {
    ...DEFAULT_PAGE_SETUP,
    paper: PAPER_SIZES[settings.paper],
    orientation: settings.orientation,
  };
}

/**
 * The area a pattern may occupy: the sheet less margins and the footer block.
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

/** What the verification block says, and how large, so its layout can be checked. */
export const VERIFICATION_TEXT = {
  instruction: 'Print at 100% / Actual size — do not scale or fit to page.',
  instructionSizeMm: 2.8,
  note: 'Measure the 100 mm ruler or the 50 mm square to confirm.',
  noteSizeMm: 2.5,
} as const;

/** Where the verification block's pieces go on one sheet, in mm from its bottom-left. */
export interface VerificationLayout {
  /** The left end of the ruler's baseline. */
  readonly ruler: { readonly x: Mm; readonly y: Mm };
  readonly rulerLengthMm: Mm;
  /** Its tallest tick. */
  readonly rulerHeightMm: Mm;
  /** The square's bottom-left corner. */
  readonly square: { readonly x: Mm; readonly y: Mm };
  readonly squareSizeMm: Mm;
  /** Where each line of text starts, on its baseline. */
  readonly instruction: { readonly x: Mm; readonly y: Mm };
  readonly note: { readonly x: Mm; readonly y: Mm };
  /** How much of the sheet above the bottom margin the block reserves. */
  readonly heightMm: Mm;
}

const RULER_LENGTH_MM = 100;
const RULER_HEIGHT_MM = 3.5;
const SQUARE_SIZE_MM = 50;
/** From the ruler's left end to the square, when they sit side by side. */
const SQUARE_OFFSET_MM = 112;
/** Between the ruler's ticks and a square stacked above it. */
const STACK_GAP_MM = 4.5;

/**
 * The verification block's layout on this sheet — **the one answer**, read by
 * the PDF writer to draw it and by `contentAreaMm` to keep the pattern off it.
 *
 * The block is whole on every sheet: a 100 mm ruler, a 50 mm square, and the
 * instruction to print at actual size. Where the square fits beside the ruler
 * (every sheet 182 mm wide or more) it goes there, as it always has. On a
 * narrower one — A5 portrait — it stacks above the ruler at the right margin,
 * clear of the text on the left, and the block reserves that much more. The
 * square used to be skipped there instead, on a page that still told the
 * maker to measure it.
 */
export function verificationLayout(setup: PageSetup): VerificationLayout {
  const sheet = sheetSizeMm(setup);
  const m = setup.marginsMm;
  const ruler = { x: m.left, y: m.bottom + 8 };
  const text = {
    instruction: { x: m.left, y: ruler.y + 16 },
    note: { x: m.left, y: ruler.y + 11.5 },
  };
  const common = {
    ruler,
    rulerLengthMm: RULER_LENGTH_MM,
    rulerHeightMm: RULER_HEIGHT_MM,
    squareSizeMm: SQUARE_SIZE_MM,
    ...text,
  };

  const beside = { x: ruler.x + SQUARE_OFFSET_MM, y: ruler.y };
  if (approxLte(beside.x + SQUARE_SIZE_MM, sheet.widthMm - m.right)) {
    return { ...common, square: beside, heightMm: setup.footerHeightMm };
  }

  const stacked = {
    x: sheet.widthMm - m.right - SQUARE_SIZE_MM,
    y: ruler.y + RULER_HEIGHT_MM + STACK_GAP_MM,
  };
  // The same clearance above the square as beside the ruler.
  const rise = stacked.y - beside.y;
  return { ...common, square: stacked, heightMm: setup.footerHeightMm + rise };
}

/**
 * Every paper size and orientation that would fit the given extent, in the
 * order of `PAPER_SIZES`, for telling a user what would work when their
 * pattern does not fit.
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
      if (widthMm <= area.widthMm && heightMm <= area.heightMm) {
        options.push({ paper, orientation });
      }
    }
  }
  return options;
}
