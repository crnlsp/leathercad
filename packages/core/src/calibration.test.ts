import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CORRECTION_LIMIT,
  NO_CORRECTION,
  correctionFrom,
  isAllowedCorrection,
  isNoCorrection,
} from './calibration.js';
import { EPS_RATIO } from './epsilon.js';

/** A line the calibration page could draw, in mm. */
const drawn = fc.double({ min: 50, max: 300, noNaN: true });
/** A printer's ratio of printed to drawn, either side of the guard. */
const ratio = fc.double({ min: 0.9, max: 1.1, noNaN: true });

describe('correctionFrom', () => {
  it('is exactly the drawn length over the measured one, on each axis', () => {
    fc.assert(
      fc.property(drawn, drawn, ratio, ratio, (dx, dy, rx, ry) => {
        const measured = { x: dx * rx, y: dy * ry };
        const result = correctionFrom({ x: dx, y: dy }, measured);
        const expected = { x: dx / measured.x, y: dy / measured.y };
        if (!isAllowedCorrection(expected)) return !result.ok;
        return result.ok && result.value.x === expected.x && result.value.y === expected.y;
      }),
    );
  });

  it('cancels the printer: drawn × correction × the printer’s ratio is the drawn length', () => {
    fc.assert(
      fc.property(drawn, ratio, (length, r) => {
        const result = correctionFrom({ x: length, y: length }, { x: length * r, y: length * r });
        if (!result.ok) return true;
        return Math.abs(length * result.value.x * r - length) <= EPS_RATIO * length;
      }),
    );
  });

  it('measures equal to drawn: no correction', () => {
    const result = correctionFrom({ x: 190, y: 200 }, { x: 190, y: 200 });
    expect(result).toEqual({ ok: true, value: NO_CORRECTION });
  });

  it('accepts 1.005 and refuses 1.03 (printing.md §14)', () => {
    expect(correctionFrom({ x: 201, y: 200 }, { x: 200, y: 200 })).toEqual({
      ok: true,
      value: { x: 1.005, y: 1 },
    });
    expect(correctionFrom({ x: 206, y: 200 }, { x: 200, y: 200 })).toEqual({
      ok: false,
      error: 'beyond-limit',
    });
  });

  it('refuses one axis beyond the guard even when the other is true', () => {
    expect(correctionFrom({ x: 200, y: 200 }, { x: 200, y: 190 }).ok).toBe(false);
  });

  it('refuses a measurement that is no length, rather than dividing by it', () => {
    for (const measured of [0, -200, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(correctionFrom({ x: 200, y: 200 }, { x: measured, y: 200 })).toEqual({
        ok: false,
        error: 'beyond-limit',
      });
    }
  });

  it('throws on a drawn length that is no length: a bug, not a measurement', () => {
    expect(() => correctionFrom({ x: 0, y: 200 }, { x: 200, y: 200 })).toThrow(RangeError);
    expect(() => correctionFrom({ x: 200, y: Number.NaN }, { x: 200, y: 200 })).toThrow(/NaN/);
  });
});

describe('isAllowedCorrection: the ±2 % guard', () => {
  it('is ±2 %', () => {
    expect(CORRECTION_LIMIT).toBe(0.02);
  });

  it('holds at its boundary, on both sides and both axes', () => {
    for (const edge of [1 - CORRECTION_LIMIT, 1 + CORRECTION_LIMIT]) {
      expect(isAllowedCorrection({ x: edge, y: 1 })).toBe(true);
      expect(isAllowedCorrection({ x: 1, y: edge })).toBe(true);
    }
    // Just past it, by more than the tolerance that keeps the edge itself in.
    for (const past of [1 - CORRECTION_LIMIT - 1e-6, 1 + CORRECTION_LIMIT + 1e-6]) {
      expect(isAllowedCorrection({ x: past, y: 1 })).toBe(false);
      expect(isAllowedCorrection({ x: 1, y: past })).toBe(false);
    }
  });

  it('allows exactly the corrections within 2 % on both axes', () => {
    const factor = fc.double({ min: 0.9, max: 1.1, noNaN: true });
    fc.assert(
      fc.property(factor, factor, (x, y) => {
        const within = (c: number) => Math.abs(c - 1) <= CORRECTION_LIMIT + EPS_RATIO;
        return isAllowedCorrection({ x, y }) === (within(x) && within(y));
      }),
    );
  });

  it('allows no correction, and refuses what is not a number', () => {
    expect(isAllowedCorrection(NO_CORRECTION)).toBe(true);
    expect(isAllowedCorrection({ x: Number.NaN, y: 1 })).toBe(false);
    expect(isAllowedCorrection({ x: 1, y: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('isNoCorrection', () => {
  it('is true only for one on both axes', () => {
    expect(isNoCorrection(NO_CORRECTION)).toBe(true);
    expect(isNoCorrection({ x: 1, y: 1.0001 })).toBe(false);
    expect(isNoCorrection({ x: 0.999, y: 1 })).toBe(false);
  });
});
