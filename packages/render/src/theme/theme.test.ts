import { LAYER_ROLES } from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DASH_LEGIBLE_PX, ROLE_STYLES, cssVariables, screenDash } from './index.js';

describe('the role table', () => {
  it('styles every role once, for screen and paper both', () => {
    for (const role of LAYER_ROLES) {
      const style = ROLE_STYLES[role];
      expect(style.colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(style.widthPx).toBeGreaterThan(0);
      expect(style.widthMm).toBeGreaterThan(0);
      // An odd-length dash array repeats itself swapped, which is a different
      // rhythm on the second pass. Every rhythm is dash, gap pairs.
      expect(style.dashMm.length % 2).toBe(0);
      for (const length of style.dashMm) expect(length).toBeGreaterThan(0);
    }
  });
});

describe('screenDash — true, or none', () => {
  // UI Foundations §2: a dash rhythm is a code. Drawn at its real size or not
  // at all — never stretched to stay visible, which would make a line claim a
  // spacing it does not have.
  const dash = fc.array(fc.double({ min: 0.1, max: 20, noNaN: true }), {
    minLength: 1,
    maxLength: 4,
  });
  const pxPerMm = fc.double({ min: 0.05, max: 400, noNaN: true });

  it('is the true pattern or solid, and never anything in between', () => {
    fc.assert(
      fc.property(dash, pxPerMm, (pattern, scale) => {
        const drawn = screenDash(pattern, scale);
        return drawn.length === 0 || drawn === pattern;
      }),
    );
  });

  it('draws the rhythm exactly when its smallest segment is legible', () => {
    fc.assert(
      fc.property(dash, pxPerMm, (pattern, scale) => {
        const legible = Math.min(...pattern) * scale >= DASH_LEGIBLE_PX;
        return screenDash(pattern, scale).length > 0 === legible;
      }),
    );
  });

  it('leaves a solid line solid', () => {
    expect(screenDash([], 4)).toEqual([]);
  });
});

describe('cssVariables', () => {
  it('names every token as a custom property, with a value', () => {
    const variables = cssVariables('comfortable');
    for (const [name, value] of Object.entries(variables)) {
      expect(name).toMatch(/^--[a-z0-9-]+$/);
      expect(value.trim()).not.toBe('');
    }
  });

  it('changes row heights for compact density and nothing about the type', () => {
    const comfortable = cssVariables('comfortable');
    const compact = cssVariables('compact');
    expect(Object.keys(compact).sort()).toEqual(Object.keys(comfortable).sort());
    expect(compact['--h-control']).not.toBe(comfortable['--h-control']);
    for (const name of Object.keys(comfortable).filter((key) => key.startsWith('--t-'))) {
      expect(compact[name]).toBe(comfortable[name]);
    }
  });
});
