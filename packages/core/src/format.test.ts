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

describe('formatEditable rounds the number it is, not its binary approximation', () => {
  it('shows a typed fraction of an inch rounded as written: 1/8in is 3.175 mm, which reads 3.18', () => {
    // 3.175 is stored as 3.17499999999999982…, which `toFixed(2)` rounds down
    // to 3.17 — 0.005 mm short of what the maker typed (U.15).
    expect(formatEditable(3.175, 2)).toBe('3.18');
    expect(formatEditable(-3.175, 2)).toBe('−3.18');
    expect(formatEditable(1.005, 2)).toBe('1.01');
    expect(formatEditable(2.675, 2)).toBe('2.68');
    expect(formatEditable(1.5875, 2)).toBe('1.59');
    expect(formatEditable(1.5875, 3)).toBe('1.588');
    expect(formatEditable(0.125, 2)).toBe('0.13');
    expect(formatEditable(2.5, 0)).toBe('3');
    // Not a tie: still down.
    expect(formatEditable(3.17496, 2)).toBe('3.17');
  });

  it('shows every stored size rounded half away from zero, to its precision', () => {
    // A stored size is a whole number of 0.1 µm quanta (quantise): checked
    // here against integer arithmetic on that number, with no float at all.
    const quanta = fc.integer({ min: -100_000_000, max: 100_000_000 });
    fc.assert(
      fc.property(quanta, precision, (n, p) => {
        const step = 10 ** (4 - p);
        const magnitude = Math.abs(n);
        const rounded = p === 4 ? magnitude : Math.floor((magnitude + step / 2) / step);
        const digits = String(rounded).padStart(p + 1, '0');
        const fixed = p === 0 ? digits : `${digits.slice(0, -p)}.${digits.slice(-p)}`;
        const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
        const expected = n < 0 && rounded > 0 ? `${MINUS}${trimmed}` : trimmed;
        return formatEditable(Number(`${String(n)}e-4`), p) === expected;
      }),
    );
  });

  it('leaves formatNumber as it was: what a ruler and a printed dimension show does not move', () => {
    expect(formatNumber(3.175, 2)).toBe('3.17');
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

  it('refuses a long run of digits in linear time, not quadratic', () => {
    expect(parseNumber(`${'9'.repeat(200_000)}x`)).toBeNaN();
  }, 1_000);
});
