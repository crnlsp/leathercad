import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { TOOLTIP_EDGE_PX, TOOLTIP_GAP_PX, placeTooltip } from './tooltipPlacement.js';

/**
 * Where a tooltip goes (R-10): under its control, turned above when there is
 * no room below, and shifted to stay 8 px inside the window — placed by its
 * whole measured size, so the window's edge never squeezes it into the thin
 * column of mockup 16.
 */

const EDGE = TOOLTIP_EDGE_PX;
const GAP = TOOLTIP_GAP_PX;
const WINDOW = { width: 860, height: 600 };

const size = fc.record({
  width: fc.double({ min: 0, max: 2000, noNaN: true }),
  height: fc.double({ min: 0, max: 400, noNaN: true }),
});
const windowSize = fc.record({
  width: fc.double({ min: 860, max: 3840, noNaN: true }),
  height: fc.double({ min: 600, max: 2160, noNaN: true }),
});
/** A control somewhere in the window: its box, which may run past an edge. */
const anchorIn = (view: { width: number; height: number }) =>
  fc
    .record({
      left: fc.double({ min: -50, max: view.width, noNaN: true }),
      top: fc.double({ min: -50, max: view.height, noNaN: true }),
      height: fc.double({ min: 0, max: 60, noNaN: true }),
    })
    .map(({ left, top, height }) => ({ left, top, bottom: top + height }));

describe('placing a tooltip (R-10)', () => {
  it('reproduces mockup 16 the right way: Sheets at the right edge of an 860 px window', () => {
    // The button as the app had it at 860 × 600, and its tooltip on one line.
    const sheets = { left: 804.6, top: 44.5, bottom: 68.5 };
    const placed = placeTooltip(sheets, { width: 340, height: 26 }, WINDOW);
    expect(placed.left + 340).toBeCloseTo(WINDOW.width - EDGE, 9);
    expect(placed.top).toBeCloseTo(68.5 + GAP, 9);
    expect(placed.above).toBe(false);
  });

  it('opens under its control, at the control’s left, when it fits there', () => {
    const placed = placeTooltip(
      { left: 200, top: 100, bottom: 124 },
      { width: 160, height: 26 },
      WINDOW,
    );
    expect(placed).toEqual({ left: 200, top: 124 + GAP, above: false });
  });

  it('opens above a control near the window’s foot', () => {
    const chip = { left: 20, top: 566, bottom: 590 };
    const placed = placeTooltip(chip, { width: 160, height: 26 }, WINDOW);
    expect(placed.above).toBe(true);
    expect(placed.top + 26).toBeCloseTo(chip.top - GAP, 9);
  });

  it('stays inside when its control is in the window’s last pixels (fast-check’s shrunk case)', () => {
    const view = { width: 860.0000000000013, height: 2159.999999999997 };
    const anchor = { left: 0, top: 2156.0000000009973, bottom: 2156.0000000009973 };
    const placed = placeTooltip(anchor, { width: 0, height: 0 }, view);
    expect(placed.above).toBe(true);
    expect(placed.top).toBeLessThanOrEqual(view.height - EDGE);
  });

  it('stays 8 px inside the window across, whenever it fits across', () => {
    fc.assert(
      fc.property(
        windowSize.chain((view) => fc.tuple(fc.constant(view), anchorIn(view), size)),
        ([view, anchor, bubble]) => {
          fc.pre(bubble.width <= view.width - 2 * EDGE);
          const { left } = placeTooltip(anchor, bubble, view);
          expect(left).toBeGreaterThanOrEqual(EDGE);
          // The whole width is free to its right: the edge cannot squeeze it.
          expect(view.width - EDGE - left).toBeGreaterThanOrEqual(bubble.width - 1e-9);
        },
      ),
    );
  });

  it('stays 8 px inside the window up and down, whenever it fits', () => {
    fc.assert(
      fc.property(
        windowSize.chain((view) => fc.tuple(fc.constant(view), anchorIn(view), size)),
        ([view, anchor, bubble]) => {
          fc.pre(bubble.height <= view.height - 2 * EDGE);
          const { top } = placeTooltip(anchor, bubble, view);
          expect(top).toBeGreaterThanOrEqual(EDGE);
          expect(top + bubble.height).toBeLessThanOrEqual(view.height - EDGE + 1e-9);
        },
      ),
    );
  });

  it('turns above only when there is no room below and there is above, and never covers its control then', () => {
    fc.assert(
      fc.property(
        windowSize.chain((view) => fc.tuple(fc.constant(view), anchorIn(view), size)),
        ([view, anchor, bubble]) => {
          const placed = placeTooltip(anchor, bubble, view);
          const roomBelow = anchor.bottom + GAP + bubble.height <= view.height - EDGE;
          const roomAbove = anchor.top - GAP - bubble.height >= EDGE;
          expect(placed.above).toBe(!roomBelow && roomAbove);
          if (placed.above) expect(placed.top + bubble.height).toBeLessThanOrEqual(anchor.top);
          else if (roomBelow) expect(placed.top).toBeGreaterThanOrEqual(anchor.bottom);
        },
      ),
    );
  });

  it('starts at its control’s left edge whenever that keeps it inside', () => {
    fc.assert(
      fc.property(
        windowSize.chain((view) =>
          fc.tuple(
            fc.constant(view),
            fc.double({ min: 0, max: view.width - 2 * EDGE, noNaN: true }),
            fc.double({ min: 0, max: 1, noNaN: true }),
            fc.double({ min: 0, max: 400, noNaN: true }),
          ),
        ),
        ([view, width, at, height]) => {
          // Anywhere the whole width fits between the edges.
          const left = EDGE + at * (view.width - 2 * EDGE - width);
          const anchor = { left, top: 100, bottom: 124 };
          expect(placeTooltip(anchor, { width, height }, view).left).toBe(left);
        },
      ),
    );
  });
});
