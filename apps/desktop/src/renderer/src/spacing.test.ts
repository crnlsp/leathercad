import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SPACING_DEVIATION_FRACTION } from '@leathercad/domain';

import { createI18n } from '../../shared/i18n.js';
import { describeSpacing, spacingAgainstPitch, spacingGlyph } from './spacing.js';

/**
 * Spacing against pitch, as Properties says it under a hole set (R-05) and the
 * selection bar will (R-14): "Spacing matches the pitch", or by how much it is
 * stretched or squeezed, to the tenth of a percent the line shows.
 */

const { t } = createI18n('en');

const pitches = fc.double({ min: 0.5, max: 20, noNaN: true });
const spacings = fc.double({ min: 0.01, max: 40, noNaN: true });

describe('spacingAgainstPitch', () => {
  it('matches when the spacing is the pitch', () => {
    expect(spacingAgainstPitch(3.85, 3.85)).toEqual({ kind: 'matches' });
  });

  it('says a wider spacing is stretched, and by how much', () => {
    // 3.92 on a 3.85 iron: 1.818… %, shown as 1.8 %.
    expect(spacingAgainstPitch(3.92, 3.85)).toEqual({ kind: 'stretched', percent: 1.8 });
  });

  it('says a narrower spacing is squeezed, and by how much', () => {
    expect(spacingAgainstPitch(3.78, 3.85)).toEqual({ kind: 'squeezed', percent: 1.8 });
  });

  it('decides "matches" at the tenth of a percent the line shows', () => {
    // On a 4 mm pitch a tenth of a percent is 0.004 mm: the line rounds half
    // of that, 0.05 %, up to 0.1 % and anything short of it down to 0.0 %.
    expect(spacingAgainstPitch(4 * (1 + 0.000499), 4)).toEqual({ kind: 'matches' });
    expect(spacingAgainstPitch(4 * (1 - 0.000499), 4)).toEqual({ kind: 'matches' });
    expect(spacingAgainstPitch(4 * (1 + 0.000501), 4)).toEqual({ kind: 'stretched', percent: 0.1 });
    expect(spacingAgainstPitch(4 * (1 - 0.000501), 4)).toEqual({ kind: 'squeezed', percent: 0.1 });
  });

  it('reads a set whose runs differ by the spacing over the whole set', () => {
    // The sample's outer: runs at 3.8628 and 3.8323 mm, 562.57 mm over 146
    // gaps — 3.8532 mm, which is 0.08 % over the iron's 3.85.
    expect(spacingAgainstPitch(562.5664 / 146, 3.85)).toEqual({ kind: 'stretched', percent: 0.1 });
  });

  it('never calls a difference that shows as 0.0 % anything but a match', () => {
    fc.assert(
      fc.property(pitches, spacings, (pitch, spacing) => {
        const check = spacingAgainstPitch(spacing, pitch);
        const shown = (Math.abs(spacing - pitch) / pitch) * 100;
        if (check.kind === 'matches') expect(shown).toBeLessThanOrEqual(0.05 + 1e-9);
        else {
          expect(shown).toBeGreaterThanOrEqual(0.05 - 1e-9);
          // The tenth shown is the difference rounded, never more than half a tenth off.
          expect(Math.abs(check.percent - shown)).toBeLessThanOrEqual(0.05 + 1e-9);
          expect(check.percent).toBeGreaterThanOrEqual(0.1);
          expect(Math.round(check.percent * 10)).toBeCloseTo(check.percent * 10, 9);
        }
      }),
    );
  });

  it('says stretched exactly when the spacing is the wider, and squeezed when narrower', () => {
    fc.assert(
      fc.property(pitches, spacings, (pitch, spacing) => {
        const check = spacingAgainstPitch(spacing, pitch);
        if (check.kind === 'stretched') expect(spacing).toBeGreaterThan(pitch);
        if (check.kind === 'squeezed') expect(spacing).toBeLessThan(pitch);
      }),
    );
  });

  it('is the same for the same proportion at any pitch', () => {
    fc.assert(
      fc.property(pitches, fc.integer({ min: -500, max: 500 }), (pitch, tenths) => {
        // A whole number of tenths of a percent, nudged off the rounding edge.
        const ratio = 1 + (tenths + 0.25) / 1000;
        const check = spacingAgainstPitch(pitch * ratio, pitch);
        const expected = tenths === 0 ? 0 : Math.abs(tenths) / 10;
        expect(check.kind === 'matches' ? 0 : check.percent).toBeCloseTo(expected, 9);
      }),
    );
  });
});

describe('spacingGlyph', () => {
  // The line and Problems never disagree: the warning glyph is Problems'
  // verdict on this set, never the line's own, and a check only when nothing
  // is reported. The sample's outer, 0.08 % over, is a fact, not a warning.
  it('draws a check when the spacing matches and nothing is reported', () => {
    expect(spacingGlyph({ kind: 'matches' }, undefined)).toBe('check');
  });

  it('draws which way it went, without a warning, when Problems is silent', () => {
    expect(spacingGlyph({ kind: 'stretched', percent: 0.1 }, undefined)).toBe('stretched');
    expect(spacingGlyph({ kind: 'squeezed', percent: 1.8 }, undefined)).toBe('squeezed');
  });

  it("draws Problems' own severity when it reports the spacing", () => {
    expect(spacingGlyph({ kind: 'stretched', percent: 30 }, 'warning')).toBe('warning');
    expect(spacingGlyph({ kind: 'squeezed', percent: 26 }, 'error')).toBe('error');
  });

  it('never says "matches" where the domain finds the spacing worth a problem', () => {
    // The domain's rule (validate.ts) against the line's: a set Problems warns
    // about is always wide of the pitch at the tenth the line shows.
    fc.assert(
      fc.property(
        pitches,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        (pitch, over, wide) => {
          const off = pitch * SPACING_DEVIATION_FRACTION * (1 + over) + pitch * 1e-6;
          const spacing = wide ? pitch + off : pitch - off;
          fc.pre(spacing > 0);
          expect(spacingAgainstPitch(spacing, pitch).kind).not.toBe('matches');
        },
      ),
    );
  });
});

describe('describeSpacing', () => {
  it('words the three cases', () => {
    expect(describeSpacing({ kind: 'matches' }, t)).toBe('Spacing matches the pitch');
    expect(describeSpacing({ kind: 'stretched', percent: 1.8 }, t)).toBe(
      'Spacing is stretched 1.8 %',
    );
    expect(describeSpacing({ kind: 'squeezed', percent: 2 }, t)).toBe('Spacing is squeezed 2 %');
  });
});
