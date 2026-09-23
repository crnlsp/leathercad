/**
 * How a number is written for a person to read.
 *
 * One place, so the ruler, the cursor readout, the tool previews and the
 * property panel cannot disagree about what a negative looks like. A proper
 * minus (U+2212) is as wide as a digit in the vendored face, so a column of
 * signed values lines up; the ASCII hyphen is narrower and does not
 * (UI Foundations §4.3, rule 4). The glyph is in the extracted set, so text
 * that prints can carry it too.
 *
 * Display only. Nothing here is ever stored: the file keeps numbers, not
 * their spelling.
 */

/** U+2212 MINUS SIGN. */
export const MINUS = '−';

/**
 * `value` to `precision` decimals, with a true minus, and without a minus on
 * anything that rounds to zero — "−0.00" reads as a real, if small, negative.
 * Decimals are fixed rather than trimmed, so figures stay in columns.
 */
export function formatNumber(value: number, precision: number): string {
  const fixed = Math.abs(value).toFixed(precision);
  const isZero = /^[0.]*$/.test(fixed);
  return value < 0 && !isZero ? `${MINUS}${fixed}` : fixed;
}

/**
 * A number as an entry field shows it: trailing zeros trimmed, so 105 reads
 * "105" and not "105.00" — a field shows the number that was typed, not a
 * column of them. A whole number keeps its own zeros: 10 is not "1", and 0 is
 * not blank.
 */
export function formatEditable(value: number, precision: number): string {
  const fixed = formatNumber(value, precision);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** A length, with its unit: `−3.85 mm`. */
export function formatMm(value: number, precision = 2): string {
  return `${formatNumber(value, precision)} mm`;
}

/** An angle in degrees, with its unit: `−90.0°`. */
export function formatAngle(degrees: number, precision = 1): string {
  return `${formatNumber(degrees, precision)}°`;
}

/**
 * A typed number back to a value: either minus, and a decimal comma as well as
 * a point. `NaN` when it is not a number, so the caller decides what a typo
 * means.
 */
export function parseNumber(text: string): number {
  const normal = text.trim().replace(MINUS, '-').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normal)) return Number.NaN;
  return Number.parseFloat(normal);
}
