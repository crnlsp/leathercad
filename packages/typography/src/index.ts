/**
 * @leathercad/typography — one typeface, laid out once, in millimetres.
 *
 * Pure: no DOM, no file reading, no font parsing at run time. The glyph
 * outlines are generated at development time from the vendored typeface and
 * committed (ADR 0011), so the same string produces the same shapes on every
 * machine, in the app and in tests.
 *
 * Imports only core and geometry.
 */

export type { FontData, GlyphData } from './fontData.js';
export { contoursOf, scaleContours } from './fontData.js';

export type {
  PlacedGlyph,
  PlacedText,
  PositionedGlyph,
  TextAlign,
  TextBaseline,
  TextLayout,
  TextPlacement,
} from './layout.js';
export {
  FONT,
  FONT_FAMILY,
  hasGlyph,
  layoutText,
  missingGlyphs,
  outlinesOf,
  placeText,
  placedText,
  textWidthMm,
} from './layout.js';
