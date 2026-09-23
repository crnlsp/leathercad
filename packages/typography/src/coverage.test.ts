import { describe, expect, it } from 'vitest';

import { PLEX_SANS } from './generated/plexSans.js';

/**
 * The characters the application can put on a drawing, and therefore on paper.
 *
 * A character outside the declared set is drawn as a visible replacement box
 * and raises `TEXT_GLYPH_MISSING` — which is the right behaviour, and is also
 * why this list matters: it is the difference between a pattern that prints
 * and one that prints a row of boxes where a name should be.
 *
 * The set is widened deliberately, in `tools/generateGlyphs.mjs`, and the data
 * is committed. This test is what makes a regeneration that silently dropped
 * something fail instead of reaching a printer.
 */

const has = (character: string): boolean => PLEX_SANS.glyphs[character] !== undefined;

const codepoint = (character: string): string =>
  `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

/** Everything a dimension, a coordinate or a caption is built from. */
const TECHNICAL = [
  ...'0123456789',
  '.',
  ',',
  '-', // hyphen-minus, as `toFixed` produces it
  '−', // the true minus, 600 units wide like every digit
  '×', // × between two dimensions
  '°', // ° on an angle
  '·', // · between the parts of a caption
  '′', // ′ feet
  '″', // ″ inches
  '≈', // ≈
  '≤', // ≤
  '≥', // ≥
  'Ø', // Ø — a diameter. Plex has no ⌀ (U+2300), so this is the substitute
  '²', // ² on an area
  '³',
  '/',
  '%',
  '+',
  '=',
  ' ',
  ' ',
];

/** Part names are the user's words, and makers do not all write in English. */
const EUROPEAN = [
  ...'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', // Polish — the gap that once made exportPdf throw
  ...'čďěňřšťůžČŠŽ', // Czech, Slovak
  ...'őűŐŰ', // Hungarian
  ...'åäöøæÅÄÖØÆ', // Nordic
  ...'șțȘȚăîâĂÎÂ', // Romanian — comma-below lives past Latin Extended-A
  ...'ğışİĞŞ', // Turkish
  ...'àáâçèéêëìíîïñòóôùúûüÿ', // Latin-1
];

describe('the vendored typeface covers what can reach paper', () => {
  it.each(TECHNICAL.map((c) => [`${codepoint(c)} ${c.trim() === '' ? '(space)' : c}`, c] as const))(
    'has %s',
    (_label, character) => {
      expect(has(character)).toBe(true);
    },
  );

  it.each(EUROPEAN.map((c) => [`${codepoint(c)} ${c}`, c] as const))(
    'has %s',
    (_label, character) => {
      expect(has(character)).toBe(true);
    },
  );

  it('gives the true minus a digit-width advance, so a signed column stays tabular', () => {
    // The reason U+2212 is worth having rather than settling for a hyphen: a
    // hyphen is narrower than a figure, so −12.50 and 112.50 stop lining up.
    const digitWidths = new Set([...'0123456789'].map((d) => PLEX_SANS.glyphs[d]!.advance));

    expect(digitWidths.size).toBe(1);
    expect(PLEX_SANS.glyphs['−']!.advance).toBe([...digitWidths][0]);
  });

  it('has no ⌀ — and that is recorded, not overlooked', () => {
    // IBM Plex Sans does not draw U+2300. A diameter is written with Ø, which
    // it does. Pinned so nobody "fixes" the generator by adding a character the
    // font cannot supply, which would ship a notdef box.
    expect(has('⌀')).toBe(false);
    expect(has('Ø')).toBe(true);
  });

  it('still carries the whole declared set', () => {
    // 336 after Ș ș Ț ț and − were added to the 331 that were there before.
    expect(Object.keys(PLEX_SANS.glyphs).length).toBe(336);
  });
});
