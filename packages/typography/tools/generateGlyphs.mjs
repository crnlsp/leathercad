/**
 * Extracts glyph outlines from the vendored typeface, once, at development
 * time.
 *
 * ADR 0011: nothing parses a font at run time. This script reads
 * `assets/fonts/IBMPlexSans-Regular.woff` — the file committed in this
 * repository, not the one in node_modules — and writes a generated module the
 * typography package imports. `@ibm/plex-sans` is a devDependency only to
 * record where that file came from and to update it.
 *
 * Run with `pnpm fonts:generate`.
 *
 * Outlines come out in **font units with Y up**, which is the convention every
 * other coordinate in this codebase follows; opentype.js hands them over Y
 * down, so every y is negated here rather than in the loader.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import opentype from 'opentype.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT = resolve(HERE, '../../../assets/fonts/IBMPlexSans-Regular.woff');
const OUT = resolve(HERE, '../src/generated/plexSans.ts');

/**
 * The declared character set.
 *
 * ASCII, the Latin-1 letters, and Latin Extended-A — which is what makes
 * Polish (ą ć ę ł ń ó ś ź ż), Czech, Hungarian and the rest of Central Europe
 * work, the gap that made `exportPdf` throw on a part named "Przegroda
 * główna". Plus the punctuation a dimension needs: degrees, multiplication,
 * primes, the diameter sign.
 *
 * Anything outside it renders as a visible replacement box and raises
 * `TEXT_GLYPH_MISSING`. Widening the set is a deliberate change: it is
 * regenerated here, and the data is committed.
 */
function declaredCharacters() {
  const chars = [];
  for (let code = 0x20; code <= 0x7e; code++) chars.push(String.fromCodePoint(code));
  for (let code = 0xa0; code <= 0xff; code++) chars.push(String.fromCodePoint(code));
  for (let code = 0x100; code <= 0x17f; code++) chars.push(String.fromCodePoint(code));
  // No ⌀ (U+2300): IBM Plex Sans does not have it, so a diameter is written
  // with Ø, which it does.
  for (const extra of ['–', '—', '‘', '’', '“', '”', '…', '′', '″', '≈', '≤', '≥']) {
    chars.push(extra);
  }
  return chars;
}

/** One glyph's contours as a compact command string, in Y-up font units. */
function outlineOf(glyph, unitsPerEm) {
  const path = glyph.getPath(0, 0, unitsPerEm);
  const out = [];

  for (const command of path.commands) {
    switch (command.type) {
      case 'M':
        out.push(`M${round(command.x)} ${round(-command.y)}`);
        break;
      case 'L':
        out.push(`L${round(command.x)} ${round(-command.y)}`);
        break;
      case 'Q':
        out.push(
          `Q${round(command.x1)} ${round(-command.y1)} ${round(command.x)} ${round(-command.y)}`,
        );
        break;
      case 'C':
        out.push(
          `C${round(command.x1)} ${round(-command.y1)} ${round(command.x2)} ${round(-command.y2)} ` +
            `${round(command.x)} ${round(-command.y)}`,
        );
        break;
      case 'Z':
        out.push('Z');
        break;
      default:
        throw new Error(`unexpected path command ${command.type}`);
    }
  }

  return out.join('');
}

/** Font units are integers; six decimals is already far beyond the grid. */
function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

const buffer = readFileSync(FONT);
const font = opentype.parse(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
);

const characters = declaredCharacters();
const glyphs = [];
const absent = [];

for (const character of characters) {
  const glyph = font.charToGlyph(character);
  // charToGlyph falls back to .notdef, which means the font does not have it.
  if (glyph.index === 0) {
    absent.push(character);
    continue;
  }
  glyphs.push([character, glyph, Math.round(glyph.advanceWidth)]);
}

// Only pairs that actually kern: querying every pair of ~290 glyphs is cheap
// here and would be 84 000 zeroes in the committed data.
const kerning = [];
for (const [leftChar, leftGlyph] of glyphs) {
  const row = [];
  for (const [rightChar, rightGlyph] of glyphs) {
    const value = font.getKerningValue(leftGlyph, rightGlyph);
    if (value !== 0) row.push([rightChar, Math.round(value)]);
  }
  if (row.length > 0) kerning.push([leftChar, row]);
}

const notdef = font.glyphs.get(0);
const lines = [];
lines.push('/* eslint-disable */');
lines.push('// GENERATED FILE — do not edit by hand.');
lines.push(
  '// Regenerate with `pnpm fonts:generate` (packages/typography/tools/generateGlyphs.mjs).',
);
lines.push(`// Source: assets/fonts/IBMPlexSans-Regular.woff, IBM Plex Sans, OFL-1.1.`);
lines.push('');
lines.push("import type { FontData } from '../fontData.js';");
lines.push('');
lines.push('export const PLEX_SANS: FontData = {');
lines.push(`  family: ${JSON.stringify(font.names.fontFamily?.en ?? 'IBM Plex Sans')},`);
lines.push(`  source: ${JSON.stringify('IBMPlexSans-Regular.woff (@ibm/plex-sans 1.1.0)')},`);
lines.push(`  unitsPerEm: ${font.unitsPerEm},`);
lines.push(`  ascender: ${font.ascender},`);
lines.push(`  descender: ${font.descender},`);
lines.push(`  capHeight: ${font.tables.os2.sCapHeight},`);
lines.push(`  xHeight: ${font.tables.os2.sxHeight},`);
lines.push(
  `  notdef: { advance: ${Math.round(notdef.advanceWidth)}, d: ${JSON.stringify(outlineOf(notdef, font.unitsPerEm))} },`,
);
lines.push('  glyphs: {');
for (const [character, glyph, advance] of glyphs) {
  lines.push(
    `    ${JSON.stringify(character)}: { advance: ${advance}, d: ${JSON.stringify(outlineOf(glyph, font.unitsPerEm))} },`,
  );
}
lines.push('  },');
// Nested, one line per left-hand character: the same 12 000-odd pairs in a
// twentieth of the bytes, and a diff that stays readable.
lines.push('  kerning: {');
for (const [leftChar, row] of kerning) {
  const pairs = row.map(([rightChar, value]) => `${JSON.stringify(rightChar)}:${value}`).join(',');
  lines.push(`    ${JSON.stringify(leftChar)}: {${pairs}},`);
}
lines.push('  },');
lines.push('};');
lines.push('');

writeFileSync(OUT, lines.join('\n'));

console.log(
  `wrote ${OUT}\n  ${glyphs.length} glyphs, ${kerning.reduce((n, [, row]) => n + row.length, 0)} kerning pairs` +
    (absent.length > 0 ? `\n  not in the font, skipped: ${absent.join(' ')}` : ''),
);
