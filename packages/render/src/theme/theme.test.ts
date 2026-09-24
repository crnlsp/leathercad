import { LAYER_ROLES } from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ACCENT,
  CANVAS,
  DASH_LEGIBLE_PX,
  GROUND,
  PAPER_FURNITURE,
  ROLE_STYLES,
  SHEET,
  SHELL,
  STATE,
  cssVariables,
  screenDash,
} from './index.js';

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
        const legible =
          scale >= CANVAS.bands.solidDashBelowPxPerMm &&
          Math.min(...pattern) * scale >= DASH_LEGIBLE_PX;
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

/** WCAG relative luminance and contrast — how the spec states its colour claims. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('the four planes (F.5)', () => {
  it('sets ink on the ground at the contrast the spec claims', () => {
    // UI Foundations §5.2: ink about 14 : 1 (13.97 measured — the spec said
    // "above 14", corrected when built), well past AAA's 7; ink-dim 4.6 : 1.
    expect(contrast(GROUND.ink, GROUND.ground)).toBeGreaterThan(7);
    expect(contrast(GROUND.inkDim, GROUND.ground)).toBeGreaterThan(4.5);
  });

  it('draws every role legibly on the ground — except construction, faint on purpose', () => {
    for (const role of LAYER_ROLES) {
      if (role === 'construction') continue;
      expect(contrast(ROLE_STYLES[role].colour, GROUND.ground), role).toBeGreaterThan(3);
    }
  });

  it('keeps severity readable on the plane it is drawn on', () => {
    for (const severity of ['error', 'warning', 'info'] as const) {
      expect(contrast(STATE.ground[severity], GROUND.ground), severity).toBeGreaterThan(3);
      expect(contrast(STATE.shell[severity], SHELL[800]), severity).toBeGreaterThan(3);
    }
  });

  it('gives the accent an on-dark and an on-light value', () => {
    expect(contrast(ACCENT.tan, SHELL[800])).toBeGreaterThan(3);
    expect(contrast(ACCENT.tanInk, GROUND.ground)).toBeGreaterThan(3);
  });
});

describe('the grid tiers (F.5)', () => {
  it('drops each tier out where it would become texture', () => {
    // UI Foundations §9.1: 1 mm from 4 px/mm, 10 mm from 0.6, 100 mm always.
    expect(CANVAS.grid.map((tier) => [tier.stepMm, tier.minPxPerMm])).toEqual([
      [1, 4],
      [10, 0.6],
      [100, 0],
    ]);
  });

  it('draws every dash solid below 0.6 px/mm, however long its segments', () => {
    expect(screenDash([7, 2, 1.5, 2], 0.59)).toEqual([]);
    expect(screenDash([40, 40], 0.5)).toEqual([]);
  });
});

describe('role colours on the shell (F.6)', () => {
  // A mark in the tree or the rail sits on the dark shell, where the canvas's
  // ink is invisible. Decisions §3: hue identity is the invariant, not the
  // exact value — so each role has a shell value of the same hue.
  const hue = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r!, g!, b!);
    const min = Math.min(r!, g!, b!);
    if (max === min) return 0;
    const d = max - min;
    const h = max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
    return (h * 60 + 360) % 360;
  };

  it('keeps each role in its own hue', () => {
    for (const role of LAYER_ROLES) {
      const { colour, shell } = ROLE_STYLES[role];
      const apart = Math.abs(hue(colour) - hue(shell));
      expect(Math.min(apart, 360 - apart), role).toBeLessThan(6);
    }
  });

  it('reads on every shell surface a mark sits on', () => {
    for (const role of LAYER_ROLES) {
      for (const surface of [SHELL[700], SHELL[800]]) {
        expect(contrast(ROLE_STYLES[role].shell, surface), role).toBeGreaterThan(3);
      }
    }
  });
});

describe('ink and not-ink (7.4b, 7.4c)', () => {
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const distance = (a: string, b: string): number => {
    const [x, y] = [rgb(a), rgb(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };

  it('draws screen-only furniture in a colour no print grey can be', () => {
    // Everything on paper is black or grey, so a coloured line on the Sheets
    // view is, by construction, something that will not print.
    const [r, g, b] = rgb(SHEET.furniture);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(80);
  });

  it('keeps it apart from every role, and from error, warning and the accent', () => {
    for (const role of LAYER_ROLES) {
      expect(distance(SHEET.furniture, ROLE_STYLES[role].colour), role).toBeGreaterThan(90);
    }
    for (const other of [
      STATE.ground.error,
      STATE.ground.warning,
      STATE.ground.info,
      ACCENT.tanInk,
    ]) {
      expect(distance(SHEET.furniture, other), other).toBeGreaterThan(90);
    }
  });

  it('reads on the paper and on both grounds it is drawn on', () => {
    for (const ground of [SHEET.paper, SHEET.ground, GROUND.ground]) {
      expect(contrast(SHEET.furniture, ground), ground).toBeGreaterThan(3);
    }
  });

  it('makes the paper the lightest thing on the Sheets view', () => {
    expect(contrast(SHEET.paper, SHEET.ground)).toBeGreaterThan(1.3);
    expect(contrast(SHEET.paperEdge, SHEET.paper)).toBeGreaterThan(2);
  });

  it('prints a join in a rhythm no pattern role uses', () => {
    for (const role of LAYER_ROLES) {
      expect(ROLE_STYLES[role].dashMm, role).not.toEqual(PAPER_FURNITURE.join.dashMm);
    }
  });
});
