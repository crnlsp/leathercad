import { describe, expect, it } from 'vitest';

import { describeFactor } from './calibration.js';

describe('a printer’s correction, as the maker reads it (7.5)', () => {
  it('is the change it makes, to the hundredth of a percent, with its sign', () => {
    expect(describeFactor(1.0026, 'en')).toBe('+0.26%');
    expect(describeFactor(0.995, 'en')).toBe('-0.50%');
    expect(describeFactor(1, 'en')).toBe('0.00%');
  });

  it('is written as the language writes it', () => {
    // German keeps the sign and puts a no-break space before the percent.
    expect(describeFactor(1.0125, 'de')).toBe('+1,25\u00a0%');
  });
});
