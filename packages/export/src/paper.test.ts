import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SETUP,
  MM_TO_PT,
  PAPER_SIZES,
  contentAreaMm,
  mmToPt,
  paperOptionsFitting,
  ptToMm,
  sheetSizeMm,
} from './paper.js';

describe('millimetres to points', () => {
  it('uses the exact rational factor', () => {
    // 72 points per inch, 25.4 mm per inch. Any rounding here becomes a
    // rounding on paper.
    expect(MM_TO_PT).toBe(72 / 25.4);
    expect(mmToPt(25.4)).toBe(72);
    expect(mmToPt(100)).toBeCloseTo(283.4645669291339, 10);
  });

  it('round-trips', () => {
    for (const mm of [0, 0.1, 1, 105, 297, 2000]) {
      expect(ptToMm(mmToPt(mm))).toBeCloseTo(mm, 10);
    }
  });

  it('gives the standard A4 size in points', () => {
    expect(mmToPt(PAPER_SIZES.A4.widthMm)).toBeCloseTo(595.2756, 4);
    expect(mmToPt(PAPER_SIZES.A4.heightMm)).toBeCloseTo(841.8898, 4);
  });
});

describe('sheetSizeMm', () => {
  it('swaps the axes in landscape', () => {
    expect(sheetSizeMm({ ...DEFAULT_PAGE_SETUP, orientation: 'landscape' })).toEqual({
      widthMm: 297,
      heightMm: 210,
    });
  });
});

describe('contentAreaMm', () => {
  it('subtracts margins and the footer block', () => {
    const area = contentAreaMm(DEFAULT_PAGE_SETUP);
    expect(area.widthMm).toBe(190);
    expect(area.heightMm).toBe(297 - 10 - 10 - 62);
    // Origin at bottom-left, above the footer — PDF is Y-up.
    expect(area.x).toBe(10);
    expect(area.y).toBe(72);
  });

  it('never returns a negative area for absurd margins', () => {
    const area = contentAreaMm({
      ...DEFAULT_PAGE_SETUP,
      marginsMm: { top: 200, right: 200, bottom: 200, left: 200 },
    });
    expect(area.widthMm).toBe(0);
    expect(area.heightMm).toBe(0);
  });
});

describe('paperOptionsFitting', () => {
  it('offers A4 portrait for something that fits it', () => {
    const options = paperOptionsFitting(150, 200);
    expect(options.some((o) => o.paper.name === 'A4' && o.orientation === 'portrait')).toBe(true);
  });

  it('excludes paper too small', () => {
    // A4 portrait offers 190 x 215 mm once margins and the footer block are
    // taken off; A3 portrait offers 277 x 374.
    const options = paperOptionsFitting(250, 300);
    expect(options.some((o) => o.paper.name === 'A4')).toBe(false);
    expect(options.some((o) => o.paper.name === 'A3' && o.orientation === 'portrait')).toBe(true);
  });

  it('accounts for the footer block, not just the margins', () => {
    // A4 leaves 190 x 215 mm once the margins and the 62 mm verification
    // block are taken off. Printing over that block would defeat the very
    // scale check it exists to provide.
    expect(paperOptionsFitting(190, 240).some((o) => o.paper.name === 'A4')).toBe(false);
    expect(paperOptionsFitting(190, 210).some((o) => o.paper.name === 'A4')).toBe(true);
  });

  it('returns nothing when nothing fits', () => {
    expect(paperOptionsFitting(5000, 5000)).toEqual([]);
  });
});
