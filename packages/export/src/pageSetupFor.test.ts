import { DEFAULT_SETTINGS, PAPER_SIZES, type ProjectSettings } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { contentAreaMm, DEFAULT_PAGE_SETUP, pageSetupFor, sheetSizeMm } from './paper.js';

/**
 * One conversion point, so there is nowhere for a second paper setting to
 * appear.
 *
 * The project stores a name and an orientation; everything downstream —
 * `paginate`, the verification block, `printableAreaMm`, and eventually the
 * print preview and the on-canvas paper reference — takes a `PageSetup`. This
 * is the only function that turns one into the other.
 */

const settings = (over: Partial<ProjectSettings> = {}): ProjectSettings => ({
  ...DEFAULT_SETTINGS,
  ...over,
});

describe('pageSetupFor', () => {
  it('gives a default project exactly what the exporter used to assume', () => {
    // The compatibility claim, asserted rather than trusted: a project that has
    // expressed no preference prints what every project printed before the
    // preference existed.
    expect(pageSetupFor(settings())).toEqual(DEFAULT_PAGE_SETUP);
  });

  it('carries the chosen paper through', () => {
    const setup = pageSetupFor(settings({ paper: 'A3' }));

    expect(setup.paper).toEqual(PAPER_SIZES.A3);
    expect(sheetSizeMm(setup)).toEqual({ widthMm: 297, heightMm: 420 });
  });

  it('carries the orientation through, and turns the sheet', () => {
    const setup = pageSetupFor(settings({ paper: 'A4', orientation: 'landscape' }));

    expect(sheetSizeMm(setup)).toEqual({ widthMm: 297, heightMm: 210 });
  });

  it('keeps margins and the verification footer as constants', () => {
    // Deliberately not the maker's decision yet: they are already correct, and
    // changing them has print-accuracy consequences.
    const setup = pageSetupFor(settings({ paper: 'Legal', orientation: 'landscape' }));

    expect(setup.marginsMm).toEqual(DEFAULT_PAGE_SETUP.marginsMm);
    expect(setup.footerHeightMm).toBe(DEFAULT_PAGE_SETUP.footerHeightMm);
  });

  it('changes the printable area, which is what a maker actually gets', () => {
    // A4 portrait is 190 x 215 once the margins and the 62 mm verification
    // block are taken out — not 210 x 297. Choosing A3 has to move this number
    // or the setting is decorative.
    const a4 = contentAreaMm(pageSetupFor(settings()));
    const a3 = contentAreaMm(pageSetupFor(settings({ paper: 'A3' })));

    expect(a4.widthMm).toBeCloseTo(190, 6);
    expect(a4.heightMm).toBeCloseTo(215, 6);
    expect(a3.widthMm).toBeCloseTo(277, 6);
    expect(a3.heightMm).toBeCloseTo(338, 6);
  });

  it('reaches every paper the project can name', () => {
    for (const paper of ['A5', 'A4', 'A3', 'Letter', 'Legal'] as const) {
      expect(pageSetupFor(settings({ paper })).paper).toEqual(PAPER_SIZES[paper]);
    }
  });
});
