import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MINUS,
  formatAngle,
  formatEditable,
  formatMm,
  formatNumber,
  parseNumber,
} from './format.js';

const inRange = fc.double({ min: -100_000, max: 100_000, noNaN: true });
const precision = fc.integer({ min: 0, max: 4 });

describe('formatNumber', () => {
  it('writes a negative with a true minus, never a hyphen', () => {
    expect(MINUS).toBe('−');
    expect(formatNumber(-60, 0)).toBe('−60');
    expect(formatNumber(-12.5, 2)).toBe('−12.50');
    expect(formatNumber(12.5, 1)).toBe('12.5');
  });

  it('never shows a minus on a number that rounds to zero', () => {
    // "−0.00" on a ruler or a readout reads as a real, if tiny, negative.
    expect(formatNumber(-0.001, 2)).toBe('0.00');
    expect(formatNumber(-0, 0)).toBe('0');
  });

  it('contains no hyphen-minus for any number', () => {
    fc.assert(fc.property(inRange, precision, (v, p) => !formatNumber(v, p).includes('-')));
  });

  it('carries a minus exactly when the rounded value is below zero', () => {
    fc.assert(
      fc.property(inRange, precision, (v, p) => {
        const rounded = Number(v.toFixed(p));
        return formatNumber(v, p).startsWith(MINUS) === rounded < 0;
      }),
    );
  });

  it('reads back as the value it wrote, to its precision', () => {
    fc.assert(
      fc.property(inRange, precision, (v, p) => {
        const back = parseNumber(formatNumber(v, p));
        return Math.abs(back - v) <= 0.5 * 10 ** -p + 1e-9;
      }),
    );
  });

  it('gives every digit the same place, so a column of them lines up', () => {
    // Fixed decimals, not trimmed: 1.50 and 12.00 keep their decimal points
    // aligned under tabular figures.
    expect(formatNumber(1.5, 2)).toBe('1.50');
    expect(formatNumber(12, 2)).toBe('12.00');
  });
});

describe('formatEditable', () => {
  it('trims the decimals a field does not need, and keeps a whole number whole', () => {
    expect(formatEditable(105, 2)).toBe('105');
    expect(formatEditable(12.5, 2)).toBe('12.5');
    expect(formatEditable(-12.5, 2)).toBe('−12.5');
    // With no decimals there is nothing to trim. Trimming anyway turned 10
    // into "1" and 0 into a blank field — the dimension's Decimals field.
    expect(formatEditable(10, 0)).toBe('10');
    expect(formatEditable(0, 0)).toBe('0');
    expect(formatEditable(-0.001, 2)).toBe('0');
  });

  it('reads back as the value it wrote, to its precision', () => {
    fc.assert(
      fc.property(inRange, precision, (v, p) => {
        const back = parseNumber(formatEditable(v, p));
        return Math.abs(back - v) <= 0.5 * 10 ** -p + 1e-9;
      }),
    );
  });
});

describe('formatMm and formatAngle', () => {
  it('name their unit', () => {
    expect(formatMm(-3.85)).toBe('−3.85 mm');
    expect(formatMm(105, 1)).toBe('105.0 mm');
    expect(formatAngle(-90)).toBe('−90.0°');
    expect(formatAngle(45, 0)).toBe('45°');
  });
});

describe('parseNumber', () => {
  it('accepts what people type and what the app writes', () => {
    expect(parseNumber('−12.5')).toBe(-12.5);
    expect(parseNumber('-12.5')).toBe(-12.5);
    // A decimal comma, as typed on a Polish keyboard layout.
    expect(parseNumber('3,85')).toBe(3.85);
    expect(parseNumber(' 105 ')).toBe(105);
  });

  it('refuses what is not a number', () => {
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('−')).toBeNaN();
  });
});
