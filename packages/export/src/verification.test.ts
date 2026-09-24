import { approxLte, type Mm } from '@leathercad/core';
import { DEFAULT_SETTINGS, ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { FONT, textWidthMm } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import {
  VERIFICATION_TEXT,
  contentAreaMm,
  pageSetupFor,
  sheetSizeMm,
  verificationLayout,
  type PageSetup,
} from './paper.js';

/**
 * The verification block — a 100 mm ruler, a 50 mm square and the instruction
 * to print at actual size — is the maker's only proof that a print came out
 * 1:1. So it has to be **whole, on every sheet a maker can choose**.
 *
 * Regression: the square sat at a fixed 112 mm from the left margin and was
 * skipped wherever it would run off the page. That is A5 portrait, and the
 * page still said "measure the 50 mm square" — a sheet that asked the maker
 * to check something it did not print. It went unnoticed while every export
 * was A4; choosing the paper (6.4a) made it one click away.
 */

interface Box {
  readonly minX: Mm;
  readonly minY: Mm;
  readonly maxX: Mm;
  readonly maxY: Mm;
}

const everySheet = PAPER_NAMES.flatMap((paper) =>
  ORIENTATIONS.map((orientation) => ({
    label: `${paper} ${orientation}`,
    setup: pageSetupFor({ ...DEFAULT_SETTINGS, paper, orientation }),
  })),
);

/** Everything the block draws, as boxes on the sheet. */
function boxesOf(setup: PageSetup): Record<'ruler' | 'square' | 'instruction' | 'note', Box> {
  const layout = verificationLayout(setup);
  const text = (content: string, sizeMm: Mm, at: { x: Mm; y: Mm }): Box => {
    const perUnit = sizeMm / FONT.unitsPerEm;
    return {
      minX: at.x,
      minY: at.y + FONT.descender * perUnit,
      maxX: at.x + textWidthMm(content, sizeMm),
      maxY: at.y + FONT.ascender * perUnit,
    };
  };
  return {
    ruler: {
      minX: layout.ruler.x,
      minY: layout.ruler.y,
      maxX: layout.ruler.x + layout.rulerLengthMm,
      maxY: layout.ruler.y + layout.rulerHeightMm,
    },
    square: {
      minX: layout.square.x,
      minY: layout.square.y,
      maxX: layout.square.x + layout.squareSizeMm,
      maxY: layout.square.y + layout.squareSizeMm,
    },
    instruction: text(
      VERIFICATION_TEXT.instruction,
      VERIFICATION_TEXT.instructionSizeMm,
      layout.instruction,
    ),
    note: text(VERIFICATION_TEXT.note, VERIFICATION_TEXT.noteSizeMm, layout.note),
  };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

describe('the verification block', () => {
  it.each(everySheet)('is whole on $label', ({ setup }) => {
    const layout = verificationLayout(setup);
    expect(layout.rulerLengthMm).toBe(100);
    expect(layout.squareSizeMm).toBe(50);

    // Inside the printable margins, where a consumer printer does not clip.
    const sheet = sheetSizeMm(setup);
    const m = setup.marginsMm;
    for (const [name, box] of Object.entries(boxesOf(setup))) {
      expect(approxLte(m.left, box.minX), `${name} left`).toBe(true);
      expect(approxLte(box.maxX, sheet.widthMm - m.right), `${name} right`).toBe(true);
      expect(approxLte(m.bottom, box.minY), `${name} bottom`).toBe(true);
    }
  });

  it.each(everySheet)('draws nothing over itself on $label', ({ setup }) => {
    const boxes = Object.entries(boxesOf(setup));
    for (const [i, [a, boxA]] of boxes.entries()) {
      for (const [b, boxB] of boxes.slice(i + 1)) {
        expect(overlaps(boxA, boxB), `${a} and ${b}`).toBe(false);
      }
    }
  });

  it.each(everySheet)('is never printed over by the pattern on $label', ({ setup }) => {
    // The content area starts above everything the block draws, with room to
    // spare, so a part packed to the bottom of the sheet cannot cover the
    // thing that proves the scale.
    const area = contentAreaMm(setup);
    const top = Math.max(...Object.values(boxesOf(setup)).map((box) => box.maxY));
    expect(area.y - top).toBeGreaterThanOrEqual(4);
  });

  it('keeps the A4 layout exactly where it was', () => {
    // Every sheet the block already fitted is unchanged, so no print a maker
    // has already checked moves.
    const layout = verificationLayout(pageSetupFor(DEFAULT_SETTINGS));
    expect(layout.ruler).toEqual({ x: 10, y: 18 });
    expect(layout.square).toEqual({ x: 122, y: 18 });
    expect(contentAreaMm(pageSetupFor(DEFAULT_SETTINGS)).y).toBe(72);
  });

  it('stacks the square above the ruler on a sheet too narrow for both side by side', () => {
    const setup = pageSetupFor({ ...DEFAULT_SETTINGS, paper: 'A5', orientation: 'portrait' });
    const layout = verificationLayout(setup);

    // Flush with the right margin, and clear of the ruler below it.
    expect(layout.square.x + layout.squareSizeMm).toBeCloseTo(148 - 10, 9);
    expect(layout.square.y).toBeGreaterThan(layout.ruler.y + layout.rulerHeightMm);
    // A5 portrait keeps a usable area: 128 mm square, less the taller block.
    expect(contentAreaMm(setup)).toEqual({ x: 10, y: 80, widthMm: 128, heightMm: 120 });
  });
});
