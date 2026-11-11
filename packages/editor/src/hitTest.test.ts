import {
  addCutOut,
  addGuide,
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  setFeatureVisible,
} from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { hitTest, pickAt } from './hitTest.js';

const panel = () =>
  addPart(rectanglePart('p', 'cut', 'Panel', rectShape({ x: 0, y: 0 }, 100, 60))).apply(
    emptyDocument('doc'),
  );

const ON_EDGE = { x: 0, y: 30 };

describe('hitTest and the lock', () => {
  it('passes over a locked feature, so a click or a drag cannot take it', () => {
    const locked = setFeatureLocked(['cut'], true).apply(panel());
    expect(hitTest(evaluate(locked.project), ON_EDGE, 1)).toBeNull();
  });

  it('finds it when asked to, so a right-click can reach it to unlock it (8.8)', () => {
    const locked = setFeatureLocked(['cut'], true).apply(panel());
    expect(hitTest(evaluate(locked.project), ON_EDGE, 1, { locked: true })).toBe('cut');
  });

  it('never finds a hidden feature, locked or not: there is nothing on the board to click', () => {
    const hidden = setFeatureVisible(['cut'], false).apply(panel());
    expect(hitTest(evaluate(hidden.project), ON_EDGE, 1, { locked: true })).toBeNull();
  });
});

/**
 * 3.13: a press on a piece's body takes the piece (smart-guides spec §3,
 * §13 *Body pick*). Axis-aligned rectangles, so where the leather is can be
 * said without the code under test: inside the outline and outside the slot.
 */
describe('pickAt, a piece by its body (3.13)', () => {
  const TOLERANCE = 1;

  /** A W × H panel at the origin with a slot, and the slot's box. */
  const arbPanel = fc
    .record({
      width: fc.integer({ min: 20, max: 200 }),
      height: fc.integer({ min: 20, max: 200 }),
    })
    .chain(({ width, height }) =>
      fc
        .record({
          x: fc.integer({ min: 4, max: width - 12 }),
          y: fc.integer({ min: 4, max: height - 12 }),
        })
        .chain((slot) =>
          fc.record({
            width: fc.constant(width),
            height: fc.constant(height),
            slot: fc.record({
              x: fc.constant(slot.x),
              y: fc.constant(slot.y),
              w: fc.integer({ min: 4, max: width - slot.x - 4 }),
              h: fc.integer({ min: 4, max: height - slot.y - 4 }),
            }),
          }),
        ),
    );

  const build = (panel: {
    width: number;
    height: number;
    slot: { x: number; y: number; w: number; h: number };
  }) =>
    evaluate(
      addCutOut('p', 'slot', {
        kind: 'shape',
        shape: rectShape({ x: panel.slot.x, y: panel.slot.y }, panel.slot.w, panel.slot.h),
      }).apply(
        addPart(
          rectanglePart('p', 'cut', 'Panel', rectShape({ x: 0, y: 0 }, panel.width, panel.height)),
        ).apply(emptyDocument('doc')),
      ).project,
    );

  /** Clear of a line by more than the tolerance, so no line can take the press. */
  const CLEAR = TOLERANCE * 1.01;
  const arbUnit = fc.double({ min: 0, max: 1, noNaN: true });
  /** A coordinate strictly between lo and hi, clear of both. */
  const between = (lo: number, hi: number, u: number) => lo + CLEAR + u * (hi - lo - 2 * CLEAR);

  it('takes the piece for a point on its leather and farther than tolerance from every line', () => {
    fc.assert(
      fc.property(
        arbPanel,
        fc.integer({ min: 0, max: 3 }),
        arbUnit,
        arbUnit,
        ({ width, height, slot }, side, u, v) => {
          // The leather left, right, below or above the slot, each at least
          // 4 mm across by construction.
          const at = [
            { x: between(0, slot.x, u), y: between(0, height, v) },
            { x: between(slot.x + slot.w, width, u), y: between(0, height, v) },
            { x: between(0, width, u), y: between(0, slot.y, v) },
            { x: between(0, width, u), y: between(slot.y + slot.h, height, v) },
          ][side]!;

          expect(pickAt(build({ width, height, slot }), at, TOLERANCE)).toEqual({
            kind: 'part',
            id: 'p',
            outline: 'cut',
          });
        },
      ),
    );
  });

  it('takes nothing for a point inside a cut-out, farther than tolerance from its edge', () => {
    fc.assert(
      fc.property(arbPanel, arbUnit, arbUnit, (panel, u, v) => {
        const { slot } = panel;
        const at = {
          x: between(slot.x, slot.x + slot.w, u),
          y: between(slot.y, slot.y + slot.h, v),
        };

        expect(pickAt(build(panel), at, TOLERANCE)).toBeNull();
      }),
    );
  });

  it('takes the line, not the piece, for a point on a line — as hitTest finds it', () => {
    fc.assert(
      fc.property(arbPanel, arbUnit, (panel, u) => {
        const resolved = build(panel);
        for (const at of [
          { x: u * panel.width, y: 0 },
          { x: panel.slot.x, y: panel.slot.y + u * panel.slot.h },
        ]) {
          const line = hitTest(resolved, at, TOLERANCE);
          expect(line).not.toBeNull();
          expect(pickAt(resolved, at, TOLERANCE)).toEqual({ kind: 'feature', id: line });
        }
      }),
    );
  });

  it('takes nothing off every piece', () => {
    fc.assert(
      fc.property(arbPanel, fc.integer({ min: 2, max: 50 }), (panel, gap) => {
        expect(pickAt(build(panel), { x: panel.width + gap, y: panel.height / 2 }, 1)).toBeNull();
      }),
    );
  });

  it('takes the topmost of two overlapping pieces: the later in the document', () => {
    const document = addPart(
      rectanglePart('q', 'top', 'Pocket', rectShape({ x: 20, y: 10 }, 40, 30)),
    ).apply(panel());

    expect(pickAt(evaluate(document.project), { x: 40, y: 25 }, 1)).toEqual({
      kind: 'part',
      id: 'q',
      outline: 'top',
    });
    expect(pickAt(evaluate(document.project), { x: 80, y: 25 }, 1)).toEqual({
      kind: 'part',
      id: 'p',
      outline: 'cut',
    });
  });

  it('takes a lower piece through a hole in the one above it', () => {
    const document = addCutOut('q', 'window', {
      kind: 'shape',
      shape: rectShape({ x: 30, y: 15 }, 20, 20),
    }).apply(
      addPart(rectanglePart('q', 'top', 'Pocket', rectShape({ x: 20, y: 10 }, 40, 30))).apply(
        panel(),
      ),
    );

    expect(pickAt(evaluate(document.project), { x: 40, y: 25 }, 1)).toMatchObject({ id: 'p' });
  });

  it('passes over a piece whose outline is locked, and finds it for the right-click menu', () => {
    const locked = setFeatureLocked(['cut'], true).apply(panel());
    expect(pickAt(evaluate(locked.project), { x: 50, y: 30 }, 1)).toBeNull();
    expect(pickAt(evaluate(locked.project), { x: 50, y: 30 }, 1, { locked: true })).toMatchObject({
      kind: 'part',
      id: 'p',
    });
  });

  it('passes over a piece whose outline is hidden: no leather is drawn to click', () => {
    const hidden = setFeatureVisible(['cut'], false).apply(panel());
    expect(pickAt(evaluate(hidden.project), { x: 50, y: 30 }, 1, { locked: true })).toBeNull();
  });

  it('takes a guide laid across a piece before the piece, so the guide can still be dragged', () => {
    const document = addGuide({ id: 'g', origin: { x: 0, y: 30 }, angleRad: 0 }).apply(panel());

    expect(pickAt(evaluate(document.project), { x: 75, y: 30.5 }, 1)).toMatchObject({
      kind: 'guide',
      guide: { id: 'g' },
    });
  });
});
