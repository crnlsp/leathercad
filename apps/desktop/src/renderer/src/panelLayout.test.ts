import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  PANELS,
  layoutFor,
  roomAt,
  toggleOf,
  type PanelChoices,
  type PanelLayout,
} from './panelLayout.js';

const choices = fc.record({
  railCollapsed: fc.boolean(),
  railExpandedWhileNarrow: fc.boolean(),
  partsFolded: fc.boolean(),
  propertiesFolded: fc.boolean(),
});

/** Every width a window can have, from the 860 px minimum past a wide screen. */
const widths = fc.integer({ min: 860, max: 3840 });

const NONE: PanelChoices = {
  railCollapsed: false,
  railExpandedWhileNarrow: false,
  partsFolded: false,
  propertiesFolded: false,
};

const FOLD = { parts: 'partsFolded', properties: 'propertiesFolded' } as const;

describe('roomAt', () => {
  it('gives up room in §5’s order: below 1280, then below 900', () => {
    expect([1920, 1440, 1280, 1279, 1024, 900, 899, 860].map(roomAt)).toEqual([
      'wide',
      'wide',
      'wide',
      'narrow',
      'narrow',
      'narrow',
      'cramped',
      'cramped',
    ]);
  });
});

describe('layoutFor — the requirements’ §5, as a maker first sees it', () => {
  it.each<[number, PanelLayout]>([
    [1920, { railNames: true, parts: 'docked', properties: 'docked' }],
    [1440, { railNames: true, parts: 'docked', properties: 'docked' }],
    [1280, { railNames: true, parts: 'docked', properties: 'docked' }],
    // Properties folds to a strip below 1280 (it was an overlay below 1024).
    [1024, { railNames: false, parts: 'docked', properties: 'strip' }],
    [860, { railNames: false, parts: 'hidden', properties: 'hidden' }],
  ])('at %i px', (width, layout) => {
    expect(layoutFor(roomAt(width), NONE, false)).toEqual(layout);
  });

  it('in focus mode hides both panels and shows the rail’s keys, at every width', () => {
    fc.assert(
      fc.property(widths, choices, (width, chosen) => {
        expect(layoutFor(roomAt(width), chosen, true)).toEqual({
          railNames: false,
          parts: 'hidden',
          properties: 'hidden',
        });
      }),
    );
  });

  it('folds a panel the maker folded to its strip, wherever it could dock', () => {
    expect(layoutFor('wide', { ...NONE, partsFolded: true }, false).parts).toBe('strip');
    expect(layoutFor('wide', { ...NONE, propertiesFolded: true }, false).properties).toBe('strip');
    expect(layoutFor('narrow', { ...NONE, partsFolded: true }, false).parts).toBe('strip');
  });

  it('follows the rail’s remembered choice only on a wide window', () => {
    expect(layoutFor('wide', { ...NONE, railCollapsed: true }, false).railNames).toBe(false);
    expect(layoutFor('narrow', { ...NONE, railCollapsed: false }, false).railNames).toBe(false);
    expect(layoutFor('narrow', { ...NONE, railExpandedWhileNarrow: true }, false).railNames).toBe(
      true,
    );
  });
});

describe('nothing becomes unreachable (R-04)', () => {
  it('shows every panel that is not docked from its toggle, at every size', () => {
    fc.assert(
      fc.property(widths, choices, fc.boolean(), (width, chosen, focus) => {
        const room = roomAt(width);
        const layout = layoutFor(room, chosen, focus);
        for (const panel of PANELS) {
          if (layout[panel] === 'docked') continue;
          const toggled = { ...chosen, [FOLD[panel]]: !chosen[FOLD[panel]] };
          const shows =
            toggleOf(panel, room, focus) === 'overlay' ||
            layoutFor(room, toggled, focus)[panel] === 'docked';
          expect(shows, `${panel} at ${String(width)} px`).toBe(true);
        }
      }),
    );
  });

  it('never writes a choice where the window, not the maker, folded the panel', () => {
    // The toggle opens it over the board instead, so widening the window again
    // brings back exactly what the maker had.
    fc.assert(
      fc.property(widths, choices, (width, chosen) => {
        const room = roomAt(width);
        for (const panel of PANELS) {
          const folded = layoutFor(room, { ...chosen, [FOLD[panel]]: false }, false)[panel];
          if (folded !== 'docked') expect(toggleOf(panel, room, false)).toBe('overlay');
        }
      }),
    );
  });

  it('opens a panel over the board in focus mode, rather than leaving it', () => {
    for (const panel of PANELS) expect(toggleOf(panel, 'wide', true)).toBe('overlay');
  });
});
