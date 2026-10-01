import { approxLte, type Mm } from '@leathercad/core';
import { DEFAULT_SETTINGS, ORIENTATIONS, PAPER_NAMES } from '@leathercad/domain';
import { PathOps, RectOps } from '@leathercad/geometry';
import { FONT, textWidthMm } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import { BRAND_MARK_ASPECT, brandMark } from './brandMark.js';
import {
  VERIFICATION_TEXT,
  contentAreaMm,
  describeJoins,
  pageSetupFor,
  sheetSizeMm,
  verificationLayout,
  type PageSetup,
} from './paper.js';

/**
 * The verification strip — a 100 × 5 mm gauge, the instruction to print at
 * actual size, what the sheet is and LeatherCAD's mark — is the maker's only proof that a print
 * came out 1:1. So it has to be **whole, on every sheet a maker can choose**,
 * inside the margins, and never under the pattern.
 *
 * Regression (from the 50 mm square it replaced, 7.8): the square sat at a
 * fixed 112 mm from the left margin and was skipped wherever it would run off
 * the page. That is A5 portrait, and the page still said "measure the 50 mm
 * square" — a sheet that asked the maker to check something it did not print.
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

/** Everything the strip draws, as boxes on the sheet: each line as wide as it may be. */
function boxesOf(setup: PageSetup): Record<'gauge' | 'instruction' | 'words' | 'mark', Box> {
  const layout = verificationLayout(setup);
  const size = VERIFICATION_TEXT.sizeMm;
  const perUnit = (sizeMm: Mm) => sizeMm / FONT.unitsPerEm;
  const { lines, mark } = layout;
  const instruction = VERIFICATION_TEXT.instructionSizeMm;
  return {
    gauge: {
      minX: layout.gauge.x,
      minY: layout.gauge.y,
      maxX: layout.gauge.x + layout.gaugeWidthMm,
      maxY: layout.gauge.y + layout.gaugeHeightMm,
    },
    instruction: {
      minX: layout.instruction.x,
      minY: layout.instruction.y + FONT.descender * perUnit(instruction),
      maxX: layout.instruction.x + textWidthMm(VERIFICATION_TEXT.instruction, instruction),
      maxY: layout.instruction.y + FONT.ascender * perUnit(instruction),
    },
    // Right-aligned, and never wider than the room the layout gives them.
    words: {
      minX: lines.x - layout.textMaxWidthMm,
      minY: lines.bottom + FONT.descender * perUnit(size),
      maxX: lines.x,
      maxY: lines.top + FONT.ascender * perUnit(size),
    },
    mark: RectOps.unionAll(brandMark(mark, mark.heightMm).map((path) => PathOps.bbox(path)!))!,
  };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

describe('the verification strip (7.8)', () => {
  it.each(everySheet)('is whole on $label, and inside the margins', ({ setup }) => {
    const layout = verificationLayout(setup);
    expect(layout.gaugeWidthMm).toBe(100);
    expect(layout.gaugeHeightMm).toBe(5);

    // Nothing in the margins, where a consumer printer may clip (Q17).
    const sheet = sheetSizeMm(setup);
    const m = setup.marginsMm;
    for (const [name, box] of Object.entries(boxesOf(setup))) {
      expect(approxLte(m.left, box.minX), `${name} left`).toBe(true);
      expect(approxLte(box.maxX, sheet.widthMm - m.right), `${name} right`).toBe(true);
      expect(approxLte(m.bottom, box.minY), `${name} bottom`).toBe(true);
    }
  });

  it.each(everySheet)(
    'has room for the sheet number and every join beside it on $label',
    ({ setup }) => {
      // What is never shortened: the names around it are.
      const fixed = `… · Sheet 88 of 88 · …, ${describeJoins({ above: 88, left: 88, right: 88, below: 88 })}`;
      expect(textWidthMm(fixed, VERIFICATION_TEXT.sizeMm)).toBeLessThanOrEqual(
        verificationLayout(setup).textMaxWidthMm,
      );
    },
  );

  it.each(everySheet)('writes the instruction inside the gauge on $label', ({ setup }) => {
    const { gauge, instruction } = boxesOf(setup);
    expect(approxLte(gauge.minX, instruction.minX)).toBe(true);
    expect(approxLte(instruction.maxX, gauge.maxX)).toBe(true);
    // Above the ticks, which rise 1.5 mm from the gauge's bottom edge.
    expect(instruction.minY).toBeGreaterThan(gauge.minY + 1.5);
    expect(instruction.maxY).toBeLessThan(gauge.maxY);
  });

  it.each(everySheet)(
    'draws its words and mark clear of the gauge and each other on $label',
    ({ setup }) => {
      const { gauge, words, mark } = boxesOf(setup);
      expect(overlaps(gauge, words)).toBe(false);
      expect(overlaps(gauge, mark)).toBe(false);
      expect(overlaps(words, mark)).toBe(false);
      // The mark is in the corner, at the right margin, the gauge's height.
      expect(mark.maxX).toBeCloseTo(sheetSizeMm(setup).widthMm - setup.marginsMm.right, 9);
      expect(mark.maxY - mark.minY).toBeCloseTo(5, 9);
    },
  );

  it.each(everySheet)('is never printed over by the pattern on $label', ({ setup }) => {
    // The content area starts above everything the strip draws, with room to
    // spare, so a part packed to the bottom of the sheet cannot cover the
    // thing that proves the scale.
    const area = contentAreaMm(setup);
    const top = Math.max(...Object.values(boxesOf(setup)).map((box) => box.maxY));
    expect(area.y - top).toBeGreaterThanOrEqual(2.9);
  });

  it('takes 8.5 mm of an A4 sheet, where the old block took 62', () => {
    // The point of 7.8: the pattern gets the paper. 190 × 268.5 mm on A4
    // portrait, where it was 190 × 215.
    const setup = pageSetupFor(DEFAULT_SETTINGS);
    expect(verificationLayout(setup).heightMm).toBe(8.5);
    expect(contentAreaMm(setup)).toEqual({ x: 10, y: 18.5, widthMm: 190, heightMm: 268.5 });
    const landscape = pageSetupFor({ ...DEFAULT_SETTINGS, orientation: 'landscape' });
    expect(contentAreaMm(landscape)).toEqual({ x: 10, y: 18.5, widthMm: 277, heightMm: 181.5 });
  });

  it('says which sheets a taped sheet joins, and where', () => {
    expect(describeJoins({ right: 3 })).toBe('joins sheet 3 to the right');
    expect(describeJoins({ left: 2 })).toBe('joins sheet 2 to the left');
    expect(describeJoins({ below: 7 })).toBe('joins sheet 7 below');
    expect(describeJoins({ left: 2, right: 4, below: 7 })).toBe(
      'joins sheets 2 left, 4 right, 7 below',
    );
  });

  it('stacks the words above the gauge on a sheet too narrow for both side by side', () => {
    const setup = pageSetupFor({ ...DEFAULT_SETTINGS, paper: 'A5', orientation: 'portrait' });
    const layout = verificationLayout(setup);

    // The mark flush with the right margin, the words beside it, above the gauge.
    expect(layout.mark.x + layout.mark.heightMm * BRAND_MARK_ASPECT).toBeCloseTo(148 - 10, 9);
    expect(layout.lines.bottom).toBeGreaterThan(layout.gauge.y + layout.gaugeHeightMm);
    // A5 portrait keeps a usable area: 128 mm across, less the taller strip.
    expect(contentAreaMm(setup)).toEqual({ x: 10, y: 25.5, widthMm: 128, heightMm: 174.5 });
  });
});
