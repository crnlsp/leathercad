import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EPS_LENGTH, approxEq } from './epsilon.js';
import { formatEditable, formatNumber, parseNumber } from './format.js';
import { MM_PER_INCH, parseLength, type LengthError } from './length.js';
import { COORDINATE_LIMIT_MM } from './quantise.js';
import type { Result } from './result.js';

const mm = (text: string): number => {
  const result = parseLength(text);
  if (!result.ok) throw new Error(`"${text}" did not parse: ${result.error.kind}`);
  return result.value;
};
const failure = (result: Result<number, LengthError>): LengthError | null =>
  result.ok ? null : result.error;

const inRange = fc.double({ min: -COORDINATE_LIMIT_MM, max: COORDINATE_LIMIT_MM, noNaN: true });
/** Small enough that any sum of them below, in inches, stays a length a project holds. */
const size = fc.double({ min: 0, max: 300, noNaN: true });
const precision = fc.integer({ min: 0, max: 4 });
const named = fc.constantFrom('mm', 'cm', 'in', '"', ' mm', ' in', 'IN', 'Cm');
const unit = fc.oneof(fc.constant(''), named);
/** Terms of one sum: every one with a unit, or none. */
const terms = (count: { minLength: number; maxLength: number }, decimals: number) =>
  fc.boolean().chain((withUnit) =>
    fc.array(
      fc
        .tuple(size, withUnit ? named : fc.constant(''))
        .map(([v, u]) => `${formatEditable(v, decimals)}${u}`),
      count,
    ),
  );
const unitMm = (u: string): number =>
  ({ mm: 1, cm: 10, in: MM_PER_INCH, '"': MM_PER_INCH })[u.trim().toLowerCase()] ?? 1;

describe('parseLength — what a maker types', () => {
  it('reads a plain number as millimetres', () => {
    expect(mm('105')).toBe(105);
    expect(mm('3.85')).toBe(3.85);
    expect(mm(' 12 ')).toBe(12);
  });

  it('works out a sum, with the usual order of operations', () => {
    // "95, less two margins" (R-12).
    expect(mm('95-2*3.5')).toBe(88);
    expect(mm('(95 - 2*3.5) / 2')).toBe(44);
    expect(mm('2*(3+4)')).toBe(14);
    expect(mm('10/4')).toBe(2.5);
  });

  it('takes a unit on a number, and gives millimetres', () => {
    expect(mm('3.75in')).toBe(3.75 * 25.4);
    expect(mm('3.75 in')).toBe(3.75 * 25.4);
    expect(mm('3.75"')).toBe(3.75 * 25.4);
    expect(mm('9.5cm')).toBe(95);
    expect(mm('95mm')).toBe(95);
    expect(mm('2IN')).toBe(50.8);
  });

  it('puts a unit on everything multiplied before it, so a fraction of an inch reads as one', () => {
    expect(mm('1/2in')).toBe(12.7);
    // Floating point: 0.75 × 25.4 is 19.049999999999997, which the field
    // quantises to 19.05 before storing it.
    expect(mm('3/4"')).toBeCloseTo(19.05, 9);
    expect(mm('2*3.5mm')).toBe(7);
    expect(mm('(1 + 1/2)in')).toBeCloseTo(38.1, 9);
    // …and what follows it scales the length.
    expect(mm('10cm/2')).toBe(50);
    expect(mm('2in*3')).toBeCloseTo(152.4, 9);
  });

  it('adds lengths in any units', () => {
    expect(mm('10cm + 5mm')).toBe(105);
    expect(mm('1in - 0.4mm')).toBeCloseTo(25, 9);
    expect(mm('1in + 1/2in')).toBeCloseTo(38.1, 9);
  });

  it('reads what the app writes and what a keyboard types: either minus, a decimal comma', () => {
    expect(mm('−12.5')).toBe(-12.5);
    expect(mm('-12.5')).toBe(-12.5);
    expect(mm('3,85')).toBe(3.85);
    expect(mm('9,5 cm')).toBe(95);
    expect(mm('95−2*3,5')).toBe(88);
    expect(mm('+5')).toBe(5);
    expect(mm('10.')).toBe(10);
    expect(mm('.5')).toBe(0.5);
    expect(mm('--5')).toBe(5);
  });

  it('reads scientific notation, with or without a unit (QA F8)', () => {
    expect(mm('1e3')).toBe(1000);
    expect(mm('1e-9')).toBe(1e-9);
    expect(mm('2.5E2')).toBe(250);
    expect(mm('1,5e2')).toBe(150);
    expect(mm('1e+2')).toBe(100);
    expect(mm('1e−2')).toBe(0.01);
    expect(mm('1e3cm')).toBe(10_000);
    expect(mm('2e1 in')).toBe(20 * 25.4);
    expect(mm('1e2 - 5e1')).toBe(50);
    expect(mm('-1e3')).toBe(-1000);
  });

  it('knows an inch as 25.4 mm exactly', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(mm('1in')).toBe(25.4);
    expect(mm('10in')).toBe(254);
    expect(mm('1"')).toBe(mm('1in'));
  });
});

describe('parseLength — what it refuses, and why', () => {
  it('says the text is not a size when it cannot be read', () => {
    for (const text of [
      '',
      '   ',
      'abc',
      '−',
      '95-',
      '95-*2',
      '()',
      '(95',
      '95)',
      '9 5',
      '1..5',
      '3 1/2in',
      '.',
    ])
      expect(failure(parseLength(text)), text).toEqual({ kind: 'syntax' });
  });

  it('names a unit it does not know', () => {
    expect(failure(parseLength('3.75 inch'))).toEqual({ kind: 'unit', unit: 'inch' });
    expect(failure(parseLength('2ft'))).toEqual({ kind: 'unit', unit: 'ft' });
    expect(failure(parseLength('1m'))).toEqual({ kind: 'unit', unit: 'm' });
  });

  it('refuses what does not come to a length: an area, a ratio, a unit twice', () => {
    for (const text of ['2in*3in', '10cm/2cm', '1/(2in)', '(10cm)/(2cm)', '2in cm', '(3in)mm'])
      expect(failure(parseLength(text)), text).toEqual({ kind: 'notALength' });
  });

  it('refuses a sum where some numbers have a unit and some do not, rather than guess', () => {
    // "3-1/2\"" is 3½ inches in American notation, and 3 mm less half an inch
    // as a sum: a guess either way would store a wrong size without a word.
    for (const text of ['3-1/2"', '10cm + 5', '5 + 10cm', '95in - 2*3.5', '(1in + 2)'])
      expect(failure(parseLength(text)), text).toEqual({ kind: 'mixed' });
    expect(mm('(1 + 1/2)in')).toBeCloseTo(38.1, 9);
  });

  it('refuses what does not come to a number', () => {
    expect(failure(parseLength('1/0'))).toEqual({ kind: 'notFinite' });
    expect(failure(parseLength('0/0'))).toEqual({ kind: 'notFinite' });
    expect(failure(parseLength('9'.repeat(400)))).toEqual({ kind: 'notFinite' });
  });

  it('refuses a length past what a project holds, either way (QA F1, F2)', () => {
    for (const text of [
      '100000.1',
      '-100000.1',
      '1e6',
      '1e10',
      '1' + '0'.repeat(305),
      '1e305',
      '4000in',
      '10001cm',
    ])
      expect(failure(parseLength(text)), text).toEqual({ kind: 'beyondLimit' });
    expect(mm(String(COORDINATE_LIMIT_MM))).toBe(COORDINATE_LIMIT_MM);
    expect(mm(`-${String(COORDINATE_LIMIT_MM)}`)).toBe(-COORDINATE_LIMIT_MM);
    expect(mm('1e5')).toBe(COORDINATE_LIMIT_MM);
  });

  it('names an exponent with no digits as a unit it does not know', () => {
    expect(failure(parseLength('1e'))).toEqual({ kind: 'unit', unit: 'e' });
    expect(failure(parseLength('1e-'))).toEqual({ kind: 'unit', unit: 'e' });
  });

  it('refuses parentheses nested past any sum a person types, rather than overflowing the stack', () => {
    expect(failure(parseLength(`${'('.repeat(100_000)}1${')'.repeat(100_000)}`))).toEqual({
      kind: 'syntax',
    });
    expect(mm(`${'('.repeat(20)}1${')'.repeat(20)}`)).toBe(1);
  });

  it('reads a long run of digits in linear time, not quadratic', () => {
    expect(failure(parseLength(`${'9'.repeat(200_000)}x`))).toEqual({ kind: 'unit', unit: 'x' });
  }, 1_000);
});

describe('parseLength — properties', () => {
  it('reads back what a field writes, to within half its last decimal', () => {
    fc.assert(
      fc.property(inRange, precision, (v, p) => {
        const back = mm(formatEditable(v, p));
        return Math.abs(back - v) <= 0.5 * 10 ** -p + 1e-9;
      }),
    );
  });

  it('agrees with parseNumber on every number parseNumber reads', () => {
    const spelt = fc
      .tuple(inRange, precision, fc.boolean(), fc.boolean(), fc.boolean())
      .map(([v, p, comma, hyphen, padded]) => {
        let text = formatNumber(v, p);
        if (comma) text = text.replace('.', ',');
        if (hyphen) text = text.replace('−', '-');
        return padded ? ` ${text} ` : text;
      });
    fc.assert(
      fc.property(fc.oneof(spelt, fc.string()), (text) => {
        const plain = parseNumber(text);
        return (
          !Number.isFinite(plain) || Math.abs(plain) > COORDINATE_LIMIT_MM || mm(text) === plain
        );
      }),
    );
  });

  it('gives a sum the same total in any order', () => {
    fc.assert(
      fc.property(terms({ minLength: 2, maxLength: 5 }, 3), fc.nat(), (sum, turn) => {
        const k = turn % sum.length;
        const turned = [...sum.slice(k), ...sum.slice(0, k)].reverse();
        return approxEq(mm(sum.join(' + ')), mm(turned.join('+')), EPS_LENGTH);
      }),
    );
  });

  it('scales a number by its unit and nothing else', () => {
    fc.assert(
      fc.property(size, unit, (v, u) => {
        const text = formatEditable(v, 3);
        return mm(`${text}${u}`) === mm(text) * unitMm(u);
      }),
    );
  });

  it('negates the whole of anything it reads, under a leading minus in parentheses', () => {
    const expression = fc
      .tuple(
        terms({ minLength: 2, maxLength: 2 }, 2),
        fc.constantFrom('+', '-', '−'),
        fc.integer({ min: 1, max: 9 }),
      )
      .map(([[a, b], op, n]) => `${a ?? ''} ${op} ${b ?? ''}*${String(n)}`);
    fc.assert(
      fc.property(expression, (text) => {
        const value = mm(text);
        return mm(`−(${text})`) === -value;
      }),
    );
  });

  it('reads scientific notation as the number it spells', () => {
    const spelt = fc
      .tuple(
        fc.double({ min: -9.99, max: 9.99, noNaN: true }),
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: -30, max: 4 }),
        fc.constantFrom('e', 'E'),
      )
      .map(([m, p, k, e]) => `${m.toFixed(p)}${e}${String(k)}`);
    fc.assert(fc.property(spelt, (text) => mm(text) === Number.parseFloat(text)));
  });

  it('agrees with toExponential on every length it holds', () => {
    fc.assert(
      fc.property(inRange, fc.integer({ min: 0, max: 16 }), (v, p) =>
        approxEq(mm(v.toExponential(p)), Number.parseFloat(v.toExponential(p)), EPS_LENGTH),
      ),
    );
  });

  it('never throws, whatever is typed, and holds every length it reads to the limit', () => {
    const typed = fc.string({ unit: fc.constantFrom(...'0123456789.,+-−*/() incmeE"x'.split('')) });
    fc.assert(
      fc.property(fc.oneof(typed, fc.string()), (text) => {
        const result = parseLength(text);
        return result.ok
          ? Number.isFinite(result.value) && Math.abs(result.value) <= COORDINATE_LIMIT_MM
          : typeof result.error.kind === 'string';
      }),
    );
  });
});
