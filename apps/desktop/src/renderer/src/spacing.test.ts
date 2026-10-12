import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SPACING_DEVIATION_FRACTION } from '@leathercad/domain';

import { createI18n } from '../../shared/i18n.js';
import { describeSpacing, formatSpacing, spacingAgainstPitch, spacingGlyph } from './spacing.js';

/**
 * Spacing against pitch, as Properties says it under a hole set (R-05) and the
 * selection bar will (R-14): "Spacing matches the pitch", or by how much it is
 * stretched or squeezed. "Matches" means the Spacing readout shows the Pitch
 * field's number, so the line never contradicts the two numbers above it.
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
    expect(spacingAgainstPitch(3.92, 3.85)).toEqual({
      kind: 'stretched',
      percent: 1.8,
      underATenth: false,
    });
  });

  it('says a narrower spacing is squeezed, and by how much', () => {
    expect(spacingAgainstPitch(3.78, 3.85)).toEqual({
      kind: 'squeezed',
      percent: 1.8,
      underATenth: false,
    });
  });

  it("matches when the Spacing readout shows the Pitch field's number, and not otherwise", () => {
    // Both are shown to the hundredth: 4.0049 reads 4.00, 4.0051 reads 4.01.
    expect(formatSpacing(4.0049)).toBe('4.00');
    expect(spacingAgainstPitch(4.0049, 4)).toEqual({ kind: 'matches' });
    expect(spacingAgainstPitch(3.9951, 4)).toEqual({ kind: 'matches' });
    expect(spacingAgainstPitch(4.0051, 4)).toEqual({
      kind: 'stretched',
      percent: 0.1,
      underATenth: false,
    });
    expect(spacingAgainstPitch(3.9949, 4)).toEqual({
      kind: 'squeezed',
      percent: 0.1,
      underATenth: false,
    });
  });

  it("reads the sample's outer as matching: 3.8532 mm shows as its iron's 3.85", () => {
    // Runs at 3.8628 and 3.8323 mm; 562.57 mm over 146 gaps is 3.8532 mm,
    // 0.08 % over — and the readout above the line says 3.85.
    expect(formatSpacing(562.5664 / 146)).toBe('3.85');
    expect(spacingAgainstPitch(562.5664 / 146, 3.85)).toEqual({ kind: 'matches' });
  });

  it('says "less than 0.1 %" where the readouts differ by less than a tenth of a percent', () => {
    // On a 20 mm pitch a hundredth is 0.05 %: 20.006 reads 20.01, 0.03 % over.
    expect(spacingAgainstPitch(20.006, 20)).toEqual({
      kind: 'stretched',
      percent: 0.1,
      underATenth: true,
    });
    expect(describeSpacing(spacingAgainstPitch(20.006, 20), t)).toBe(
      'Spacing is stretched less than 0.1 %',
    );
    expect(describeSpacing(spacingAgainstPitch(19.994, 20), t)).toBe(
      'Spacing is squeezed less than 0.1 %',
    );
  });

  it('matches exactly when the two shown numbers are the same, for any pitch and spacing', () => {
    fc.assert(
      fc.property(pitches, spacings, (pitch, spacing) => {
        const same = formatSpacing(spacing) === formatSpacing(pitch);
        expect(spacingAgainstPitch(spacing, pitch).kind === 'matches').toBe(same);
      }),
    );
  });

  it('never words a difference as 0.0 %, and otherwise shows it rounded to the tenth', () => {
    fc.assert(
      fc.property(pitches, spacings, (pitch, spacing) => {
        const check = spacingAgainstPitch(spacing, pitch);
        if (check.kind === 'matches') return;
        const actual = (Math.abs(spacing - pitch) / pitch) * 100;
        expect(check.percent).toBeGreaterThanOrEqual(0.1);
        expect(describeSpacing(check, t)).not.toMatch(/\b0(\.0)? %/);
        if (check.underATenth) {
          expect(check.percent).toBe(0.1);
          expect(actual).toBeLessThan(0.05 + 1e-9);
        } else {
          // The tenth shown is the difference rounded, never more than half a tenth off.
          expect(Math.abs(check.percent - actual)).toBeLessThanOrEqual(0.05 + 1e-9);
          expect(Number.isInteger(Math.round(check.percent * 10))).toBe(true);
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
});

describe('spacingGlyph', () => {
  // The line and Problems never disagree: the warning glyph is Problems'
  // verdict on this set, never the line's own, and a check only when nothing
  // is reported. The sample's outer, 0.08 % over, is a fact, not a warning.
  it('draws a check when the spacing matches and nothing is reported', () => {
    expect(spacingGlyph({ kind: 'matches' }, undefined)).toBe('check');
  });

  it('draws which way it went, without a warning, when Problems is silent', () => {
    expect(spacingGlyph({ kind: 'stretched', percent: 0.1, underATenth: false }, undefined)).toBe(
      'stretched',
    );
    expect(spacingGlyph({ kind: 'squeezed', percent: 1.8, underATenth: false }, undefined)).toBe(
      'squeezed',
    );
  });

  it("draws Problems' own severity when it reports the spacing", () => {
    expect(spacingGlyph({ kind: 'stretched', percent: 30, underATenth: false }, 'warning')).toBe(
      'warning',
    );
    expect(spacingGlyph({ kind: 'squeezed', percent: 26, underATenth: false }, 'error')).toBe(
      'error',
    );
  });

  it('never says "matches" where the domain finds the spacing worth a problem', () => {
    // The domain's rule (validate.ts) against the line's: a set Problems warns
    // about is always wide of the pitch by more than the readouts' hundredth.
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
    expect(describeSpacing({ kind: 'stretched', percent: 1.8, underATenth: false }, t)).toBe(
      'Spacing is stretched 1.8 %',
    );
    expect(describeSpacing({ kind: 'squeezed', percent: 2, underATenth: false }, t)).toBe(
      'Spacing is squeezed 2 %',
    );
  });
});
