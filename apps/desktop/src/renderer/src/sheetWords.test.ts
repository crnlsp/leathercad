import { emptyProject, rectShape, rectanglePart } from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import type { PartPrintStatus, TiledPart } from '@leathercad/export';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import {
  describeChoice,
  describePrintStatus,
  describeSheetNumbers,
  describeSheets,
  describeTaped,
  describeTapedAcross,
  describeTiled,
} from './sheetWords.js';
import { sheetPlanFor } from './sheets.js';

/**
 * The sheet plan in English (ADR 0018): the words the export used to put it
 * in, unchanged now that the app says them.
 */

const i18n = createI18n('en');
const { t } = i18n;

/** A project of rectangles, each `[name, width, height]`, on the paper named. */
function project(
  parts: readonly [string, number, number][],
  settings: Partial<Project['settings']> = {},
): Project {
  const base = emptyProject('p', 'Test');
  return {
    ...base,
    settings: { ...base.settings, ...settings },
    parts: parts.map(([name, width, height], index) =>
      rectanglePart(`part-${String(index)}`, `cut-${String(index)}`, name, {
        ...rectShape({ x: 0, y: 0 }, width, height),
      }),
    ),
  };
}

/** The print test's three pieces: one of them longer than an A4 sheet either way. */
const PRINT_TEST: [string, number, number][] = [
  ['Outer panel', 100, 78],
  ['Pocket', 96, 60],
  ['Strap', 275, 25],
];

describe('the sheet plan, in English', () => {
  it('counts sheets of a paper, as a maker says it', () => {
    expect(describeSheets(sheetPlanFor(project(PRINT_TEST)), t)).toBe('3 sheets of A4, portrait');
    expect(describeSheets(sheetPlanFor(project(PRINT_TEST, { orientation: 'landscape' })), t)).toBe(
      '1 sheet of A4, landscape',
    );
    expect(describeSheets(sheetPlanFor(project([])), t)).toBe(
      '1 sheet of A4, portrait, scale check only',
    );
  });

  it('names what is taped, and counts it past two', () => {
    expect(describeTaped(sheetPlanFor(project(PRINT_TEST)), i18n)).toBe('Strap taped');
    expect(describeChoice(sheetPlanFor(project(PRINT_TEST)), i18n)).toBe(
      '3 sheets of A4, portrait (Strap taped)',
    );
    const long = project([
      ['a', 400, 20],
      ['b', 400, 20],
    ]);
    expect(describeTaped(sheetPlanFor(long), i18n)).toBe('a and b taped');
    const longer = project([
      ['a', 400, 20],
      ['b', 400, 20],
      ['c', 400, 20],
    ]);
    expect(describeTaped(sheetPlanFor(longer), i18n)).toBe('3 pieces taped');
    expect(describeTaped(sheetPlanFor(project([['a', 50, 50]])), i18n)).toBeNull();
  });

  it('numbers sheets, a run as a range, alone and in a sentence', () => {
    expect(describeSheetNumbers([1], i18n)).toBe('Sheet 1');
    expect(describeSheetNumbers([2, 3], i18n)).toBe('Sheets 2–3');
    expect(describeSheetNumbers([2, 4], i18n)).toBe('Sheets 2, 4');
    expect(describeTapedAcross('Strap', [2, 3], i18n)).toBe('Strap is taped across sheets 2–3.');
    expect(describeTapedAcross('Strap', [2, 4], i18n)).toBe('Strap is taped across sheets 2, 4.');
  });

  it('says where a part prints, and what of it does not', () => {
    const status = (over: Partial<PartPrintStatus>): PartPrintStatus => ({
      partId: 'p',
      sheets: { partId: 'p', sheets: [1], taped: false, turned: false, rows: 1, columns: 1 },
      notPrinted: null,
      hiddenFeatures: 0,
      failedFeatures: 0,
      ...over,
    });
    expect(describePrintStatus(status({}), i18n)).toEqual({ label: 'Sheet 1', note: null });
    expect(
      describePrintStatus(
        status({
          sheets: { partId: 'p', sheets: [2, 3], taped: true, turned: false, rows: 1, columns: 2 },
        }),
        i18n,
      ),
    ).toEqual({ label: 'Sheets 2–3, taped', note: null });
    // Turned on the paper to save a sheet (7.8): said, since the board shows it as drawn.
    expect(
      describePrintStatus(
        status({
          sheets: { partId: 'p', sheets: [1], taped: false, turned: true, rows: 1, columns: 1 },
        }),
        i18n,
      ),
    ).toEqual({ label: 'Sheet 1, turned', note: null });
    expect(describePrintStatus(status({ sheets: null, notPrinted: 'hidden' }), i18n)).toEqual({
      label: 'Not printed',
      note: 'It is hidden.',
    });
    expect(describePrintStatus(status({ hiddenFeatures: 1, failedFeatures: 1 }), i18n)).toEqual({
      label: 'Sheet 1',
      note: "1 hidden feature and 1 feature with a problem aren't printed.",
    });
    expect(describePrintStatus(status({ hiddenFeatures: 2 }), i18n).note).toBe(
      "2 hidden features aren't printed.",
    );
  });

  it('says what was tiled, and which paper would hold it whole', () => {
    const tiled = (fitsOn: TiledPart['fitsOn']): TiledPart =>
      ({
        part: { name: 'Panel' },
        widthMm: 250,
        heightMm: 180,
        rows: 1,
        columns: 2,
        on: { paper: { name: 'A4' }, orientation: 'portrait' },
        fitsOn,
      }) as unknown as TiledPart;
    expect(describeTiled(tiled([{ paper: { name: 'A3' }, orientation: 'portrait' }]), t)).toBe(
      '"Panel" is 250.0 × 180.0 mm, larger than A4 portrait: printed on 2 sheets, 1 × 2. It fits whole on A3 portrait.',
    );
    expect(describeTiled(tiled([]), t)).toBe(
      '"Panel" is 250.0 × 180.0 mm, larger than A4 portrait: printed on 2 sheets, 1 × 2. No supported paper holds it whole.',
    );
  });
});
