import type { Mm } from '@leathercad/core';
import { MatOps, type Path, type Vec2 } from '@leathercad/geometry';

import { contoursOf, scaleContours, type FontData, type GlyphData } from './fontData.js';
import { PLEX_SANS } from './generated/plexSans.js';

/**
 * Laying text out, once, in millimetres.
 *
 * ADR 0011: **document text** — anything that can reach paper — is sized in
 * millimetres and laid out here. The canvas draws the vendored font at these
 * positions; SVG and PDF fill the outlines at the same positions. One layout,
 * so screen and paper cannot drift apart.
 *
 * Overlay text — a rubber-band readout, a snap hint — never comes here. It is
 * sized in pixels and stays on the screen.
 */

export const FONT: FontData = PLEX_SANS;

/** The family name to ask the browser for, once the file is loaded. */
export const FONT_FAMILY = PLEX_SANS.family;

export type TextAlign = 'left' | 'centre' | 'right';
export type TextBaseline = 'alphabetic' | 'top' | 'middle' | 'bottom';

export interface TextPlacement {
  readonly align?: TextAlign;
  readonly baseline?: TextBaseline;
  /**
   * Turned about the anchor, counter-clockwise, in radians.
   *
   * Here rather than in whatever places the text, because 4.10's aligned
   * dimensions need exactly this and a second implementation of it would be
   * the beginning of two answers.
   */
  readonly rotationRad?: number;
}

export interface PositionedGlyph {
  readonly character: string;
  /** Left edge of the glyph, from the start of the run. */
  readonly xMm: Mm;
  readonly advanceMm: Mm;
  /** True when the set does not cover this character, and a box is drawn. */
  readonly missing: boolean;
}

export interface TextLayout {
  readonly text: string;
  readonly sizeMm: Mm;
  readonly glyphs: readonly PositionedGlyph[];
  readonly widthMm: Mm;
  /** Above the baseline, at this size. */
  readonly ascentMm: Mm;
  /** Below the baseline, positive. */
  readonly descentMm: Mm;
  /** The distinct characters the typeface does not cover, in the order met. */
  readonly missing: readonly string[];
}

/** One glyph, placed in the world. */
export interface PlacedGlyph {
  readonly character: string;
  readonly at: Vec2;
  readonly missing: boolean;
}

export interface PlacedText {
  readonly layout: TextLayout;
  /** Where the baseline starts, after alignment and rotation. */
  readonly origin: Vec2;
  readonly glyphs: readonly PlacedGlyph[];
  /** What every glyph is turned by, about the anchor. */
  readonly rotationRad: number;
}

/** Whether the vendored typeface covers this character. */
export function hasGlyph(character: string): boolean {
  return Object.hasOwn(FONT.glyphs, character);
}

/** Every character of `text` the typeface does not cover, without repeats. */
export function missingGlyphs(text: string): string[] {
  const missing: string[] = [];
  for (const character of text) {
    if (!hasGlyph(character) && !missing.includes(character)) missing.push(character);
  }
  return missing;
}

/**
 * Measures and positions a string, in millimetres.
 *
 * Advances and kerning come from the typeface itself, so "Ł" followed by "ó"
 * sits where the type designer intended rather than where a monospaced guess
 * would put it.
 */
export function layoutText(text: string, sizeMm: Mm): TextLayout {
  const perUnit = sizeMm / FONT.unitsPerEm;
  const glyphs: PositionedGlyph[] = [];
  const missing: string[] = [];

  let x = 0;
  let previous: string | null = null;

  for (const character of text) {
    const data = FONT.glyphs[character];
    const isMissing = data === undefined;
    if (isMissing && !missing.includes(character)) missing.push(character);

    if (previous !== null) x += kerningBetween(previous, character) * perUnit;

    const glyph: GlyphData = data ?? FONT.notdef;
    const advanceMm = glyph.advance * perUnit;
    glyphs.push({ character, xMm: x, advanceMm, missing: isMissing });

    x += advanceMm;
    previous = character;
  }

  return {
    text,
    sizeMm,
    glyphs,
    widthMm: x,
    ascentMm: FONT.ascender * perUnit,
    descentMm: -FONT.descender * perUnit,
    missing,
  };
}

/** The width a string would take, without keeping the layout. */
export function textWidthMm(text: string, sizeMm: Mm): Mm {
  return layoutText(text, sizeMm).widthMm;
}

/**
 * Puts a laid-out string somewhere, honouring alignment.
 *
 * `at` is the anchor the caller cares about — the centre of a dimension line,
 * the corner of a part's bounding box — and alignment decides what the anchor
 * means. Everything downstream reads glyph positions from here.
 */
export function placeText(layout: TextLayout, at: Vec2, placement: TextPlacement = {}): PlacedText {
  const rotationRad = placement.rotationRad ?? 0;
  const origin = {
    x: at.x - alignmentShift(layout, placement.align ?? 'left'),
    y: at.y - baselineShift(layout, placement.baseline ?? 'alphabetic'),
  };

  // The anchor is the point the caller gave, so that is what the run turns
  // about — not its own left end, which would swing centred text sideways.
  const turn = MatOps.fromRotationAround(at, rotationRad);
  const place = (point: Vec2): Vec2 => MatOps.apply(turn, point);

  return {
    layout,
    origin: place(origin),
    rotationRad,
    glyphs: layout.glyphs.map((glyph) => ({
      character: glyph.character,
      at: place({ x: origin.x + glyph.xMm, y: origin.y }),
      missing: glyph.missing,
    })),
  };
}

/** Laying out and placing in one step, which is what most callers want. */
export function placedText(
  text: string,
  sizeMm: Mm,
  at: Vec2,
  placement: TextPlacement = {},
): PlacedText {
  return placeText(layoutText(text, sizeMm), at, placement);
}

/**
 * The filled outlines of placed text, in millimetres.
 *
 * What SVG and PDF draw. Contours use the non-zero winding rule, as TrueType
 * does, so the counter of an "o" is a hole rather than a filled blob.
 */
export function outlinesOf(placed: PlacedText): Path[] {
  const paths: Path[] = [];

  for (const glyph of placed.glyphs) {
    const data = FONT.glyphs[glyph.character] ?? FONT.notdef;
    // A space has no contours, and neither does anything else the typeface
    // draws as blank.
    paths.push(
      ...scaleContours(contoursOf(data), FONT, placed.layout.sizeMm, glyph.at, placed.rotationRad),
    );
  }

  return paths;
}

function kerningBetween(left: string, right: string): number {
  return FONT.kerning[left]?.[right] ?? 0;
}

function alignmentShift(layout: TextLayout, align: TextAlign): Mm {
  switch (align) {
    case 'left':
      return 0;
    case 'centre':
      return layout.widthMm / 2;
    case 'right':
      return layout.widthMm;
  }
}

function baselineShift(layout: TextLayout, baseline: TextBaseline): Mm {
  switch (baseline) {
    case 'alphabetic':
      return 0;
    case 'top':
      return layout.ascentMm;
    case 'middle':
      // The middle of the x-height, which is what reads as centred; halfway up
      // the full ascent sits visibly high.
      return (FONT.xHeight / FONT.unitsPerEm) * layout.sizeMm * 0.5;
    case 'bottom':
      return -layout.descentMm;
  }
}
