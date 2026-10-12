import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MatOps, RectOps } from '@leathercad/geometry';

import {
  TRUE_SIZE_CSS_PX_PER_MM,
  ZOOM_LIMITS,
  ZOOM_STOPS,
  cssPxPerMm,
  mmToPixels,
  pixelsToMm,
  nextZoomStop,
  scaleAtZoomPercent,
  screenToWorld,
  shownZoomPercent,
  visibleBoundsMm,
  worldToCss,
  worldToScreen,
  zoomPercent,
} from './view.js';
import type { ViewportView } from './view.js';

const view: ViewportView = {
  centreMm: { x: 0, y: 0 },
  scale: 4,
  widthPx: 800,
  heightPx: 600,
  dpr: 1,
};

/** The displays a maker has: 100 %, the fractional scales Windows and Linux offer, Retina. */
const ratios = fc.constantFrom(1, 1.25, 1.5, 2, 3);

const closeTo = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('worldToScreen', () => {
  it('puts the camera centre in the middle of the canvas', () => {
    const p = MatOps.apply(worldToScreen(view), view.centreMm);
    expect(closeTo(p.x, 400)).toBe(true);
    expect(closeTo(p.y, 300)).toBe(true);
  });

  it('flips Y: a point higher in the model draws higher on screen', () => {
    // CLAUDE.md invariant 2. The model is Y-up, canvas is Y-down, and this is
    // one of only two places that reconcile them. If this ever inverts, every
    // pattern in the application comes out mirrored.
    const m = worldToScreen(view);
    const low = MatOps.apply(m, { x: 0, y: 0 });
    const high = MatOps.apply(m, { x: 0, y: 10 });

    expect(high.y).toBeLessThan(low.y);
  });

  it('does not flip X', () => {
    const m = worldToScreen(view);
    expect(MatOps.apply(m, { x: 10, y: 0 }).x).toBeGreaterThan(MatOps.apply(m, { x: 0, y: 0 }).x);
  });

  it('scales millimetres to pixels exactly', () => {
    const m = worldToScreen(view);
    const a = MatOps.apply(m, { x: 0, y: 0 });
    const b = MatOps.apply(m, { x: 100, y: 0 });
    // 100 mm at 4 px/mm is 400 px. This is the whole product promise, in
    // miniature: a stated millimetre distance maps to a predictable size.
    expect(closeTo(b.x - a.x, 400)).toBe(true);
  });

  it('round-trips through screenToWorld', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (x, y) => {
          const there = MatOps.apply(worldToScreen(view), { x, y });
          const back = MatOps.apply(screenToWorld(view), there);
          return closeTo(back.x, x, 1e-9) && closeTo(back.y, y, 1e-9);
        },
      ),
    );
  });

  it('respects the camera position', () => {
    const moved: ViewportView = { ...view, centreMm: { x: 50, y: 20 } };
    const p = MatOps.apply(worldToScreen(moved), { x: 50, y: 20 });
    expect(closeTo(p.x, 400)).toBe(true);
    expect(closeTo(p.y, 300)).toBe(true);
  });
});

describe('visibleBoundsMm', () => {
  it('covers exactly the canvas', () => {
    const bounds = visibleBoundsMm(view);
    // 800 px at 4 px/mm is 200 mm across, centred on 0.
    expect(closeTo(RectOps.width(bounds), 200)).toBe(true);
    expect(closeTo(RectOps.height(bounds), 150)).toBe(true);
    expect(closeTo(bounds.minX, -100)).toBe(true);
    expect(closeTo(bounds.maxY, 75)).toBe(true);
  });

  it('grows as the scale shrinks', () => {
    const zoomedOut = visibleBoundsMm({ ...view, scale: 1 });
    expect(RectOps.width(zoomedOut)).toBeGreaterThan(RectOps.width(visibleBoundsMm(view)));
  });
});

describe('pixel and millimetre conversion', () => {
  it('are inverses', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 1000, noNaN: true }), (px) =>
        closeTo(mmToPixels(view, pixelsToMm(view, px)), px, 1e-9),
      ),
    );
  });

  it('turn a 10 px pick radius into a millimetre tolerance', () => {
    expect(closeTo(pixelsToMm(view, 10), 2.5)).toBe(true);
  });

  it('count CSS pixels, so a pick radius covers the same millimetres on any display', () => {
    fc.assert(
      fc.property(ratios, fc.double({ min: 0.05, max: 100, noNaN: true }), (dpr, css) => {
        const on = { ...view, scale: css * dpr, dpr };
        return closeTo(pixelsToMm(on, 10), 10 / css, 1e-9);
      }),
    );
  });
});

describe('zoom as the maker reads it', () => {
  it('is 100 % at true size, whatever the display', () => {
    fc.assert(
      fc.property(ratios, (dpr) => {
        const at = { ...view, scale: dpr * TRUE_SIZE_CSS_PX_PER_MM, dpr };
        expect(zoomPercent(at)).toBeCloseTo(100, 9);
        expect(cssPxPerMm(at)).toBeCloseTo(96 / 25.4, 9);
      }),
    );
  });

  it('is the same percentage on a 1× and a 2× display showing the same CSS size', () => {
    fc.assert(
      fc.property(ratios, fc.double({ min: 0.05, max: 100, noNaN: true }), (dpr, css) => {
        const one = zoomPercent({ ...view, scale: css, dpr: 1 });
        const other = zoomPercent({ ...view, scale: css * dpr, dpr });
        return closeTo(one, other, 1e-9 * one);
      }),
    );
  });

  it('turns a percentage into the scale that shows it, and back, on any display (U.4)', () => {
    fc.assert(
      fc.property(ratios, fc.double({ min: 1, max: 10_000, noNaN: true }), (dpr, percent) => {
        const scale = scaleAtZoomPercent(percent, dpr);
        return closeTo(zoomPercent({ ...view, scale, dpr }), percent, 1e-9 * percent);
      }),
    );
    fc.assert(
      fc.property(ratios, fc.double({ min: 0.05, max: 400, noNaN: true }), (dpr, scale) => {
        const back = scaleAtZoomPercent(zoomPercent({ ...view, scale, dpr }), dpr);
        return closeTo(back, scale, 1e-9 * scale);
      }),
    );
  });

  it('puts 100 % at true size: device pixels are the ratio times 96 to the inch', () => {
    expect(scaleAtZoomPercent(100, 1)).toBeCloseTo(96 / 25.4, 12);
    expect(scaleAtZoomPercent(100, 2)).toBeCloseTo((2 * 96) / 25.4, 12);
    expect(scaleAtZoomPercent(50, 2)).toBeCloseTo(96 / 25.4, 12);
  });
});

describe('worldToCss', () => {
  it('is worldToScreen in CSS pixels: the same point, divided by the ratio', () => {
    fc.assert(
      fc.property(
        ratios,
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (dpr, x, y) => {
          const on = { ...view, scale: 4 * dpr, widthPx: 800 * dpr, heightPx: 600 * dpr, dpr };
          const device = MatOps.apply(worldToScreen(on), { x, y });
          const css = MatOps.apply(worldToCss(on), { x, y });
          return closeTo(css.x * dpr, device.x, 1e-6) && closeTo(css.y * dpr, device.y, 1e-6);
        },
      ),
    );
  });

  it('flips Y as worldToScreen does, and puts a point where a 1× display would', () => {
    const on: ViewportView = { ...view, scale: 8, widthPx: 1600, heightPx: 1200, dpr: 2 };
    const m = worldToCss(on);
    // The camera centre is the middle of the 800 × 600 CSS canvas, and 10 mm
    // up the model is 40 CSS px up the screen, as at 1×.
    expect(MatOps.apply(m, { x: 0, y: 0 })).toEqual({ x: 400, y: 300 });
    expect(MatOps.apply(m, { x: 0, y: 10 })).toEqual({ x: 400, y: 260 });
  });

  it('is worldToScreen exactly on a 1× display', () => {
    expect(worldToCss(view)).toEqual(worldToScreen(view));
  });
});

describe('the zoom ladder − and + step along (U.4)', () => {
  /** Any zoom the camera can be at, and a little either side of its limits. */
  const anyPercent = fc.double({ min: ZOOM_LIMITS.min / 2, max: ZOOM_LIMITS.max * 2, noNaN: true });

  it('runs from the lower limit to the upper, in whole percentages, rising', () => {
    expect(ZOOM_STOPS[0]).toBe(ZOOM_LIMITS.min);
    expect(ZOOM_STOPS.at(-1)).toBe(ZOOM_LIMITS.max);
    expect(ZOOM_STOPS).toContain(100);
    for (const [i, stop] of ZOOM_STOPS.entries()) {
      expect(Number.isInteger(stop)).toBe(true);
      if (i > 0) expect(stop).toBeGreaterThan(ZOOM_STOPS[i - 1]!);
    }
  });

  it('goes to a stop whose whole percentage is past the one shown, until a limit', () => {
    fc.assert(
      fc.property(anyPercent, (percent) => {
        const shown = shownZoomPercent(percent);
        const up = nextZoomStop(percent, 1);
        const down = nextZoomStop(percent, -1);
        expect(ZOOM_STOPS).toContain(up);
        expect(ZOOM_STOPS).toContain(down);
        if (shown < ZOOM_LIMITS.max) expect(up).toBeGreaterThan(shown);
        else expect(up).toBe(ZOOM_LIMITS.max);
        if (shown > ZOOM_LIMITS.min) expect(down).toBeLessThan(shown);
        else expect(down).toBe(ZOOM_LIMITS.min);
      }),
    );
  });

  it('skips no stop: nothing on the ladder lies between the zoom shown and the next', () => {
    fc.assert(
      fc.property(anyPercent, (percent) => {
        const shown = shownZoomPercent(percent);
        const up = nextZoomStop(percent, 1);
        const down = nextZoomStop(percent, -1);
        return ZOOM_STOPS.every(
          (stop) => !(stop > shown && stop < up) && !(stop < shown && stop > down),
        );
      }),
    );
  });

  it('comes back to the same stop after + then −, or − then +', () => {
    for (const stop of ZOOM_STOPS) {
      if (stop < ZOOM_LIMITS.max) expect(nextZoomStop(nextZoomStop(stop, 1), -1)).toBe(stop);
      if (stop > ZOOM_LIMITS.min) expect(nextZoomStop(nextZoomStop(stop, -1), 1)).toBe(stop);
    }
  });

  it('judges the zoom by what the control shows: 99.6 % is on the 100 stop', () => {
    expect(nextZoomStop(99.6, 1)).toBe(125);
    expect(nextZoomStop(99.6, -1)).toBe(75);
    expect(nextZoomStop(100.4, -1)).toBe(75);
    // After a fit at 57 %: + gives 67, 75, then true size.
    expect(nextZoomStop(57, 1)).toBe(67);
    expect(nextZoomStop(67, 1)).toBe(75);
    expect(nextZoomStop(75, 1)).toBe(100);
    expect(nextZoomStop(57, -1)).toBe(50);
  });
});
