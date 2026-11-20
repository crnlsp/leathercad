import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { guideFromRuler, guideLandsOnBoard } from './rulerDrag.js';

/**
 * Where a guide dragged from a ruler begins and whether it is kept (3.10,
 * U.24c): only a drag from one ruler into the board makes one; the corner
 * square, where the two rulers meet, makes none (X7).
 */

const RULERS = { thicknessPx: 22, leftThicknessPx: 30 };
const CANVAS = { width: 900, height: 600 };
const coordinate = (min: number, max: number) => fc.double({ min, max, noNaN: true });

describe('which guide a press on the board starts', () => {
  it('the top ruler, past the corner, starts a level guide', () => {
    fc.assert(
      fc.property(coordinate(30, 900), coordinate(0, 21.99), (x, y) => {
        expect(guideFromRuler({ x, y }, RULERS)).toBe(0);
      }),
    );
  });

  it('the left ruler, below the corner, starts an upright guide', () => {
    fc.assert(
      fc.property(coordinate(0, 29.99), coordinate(22, 600), (x, y) => {
        expect(guideFromRuler({ x, y }, RULERS)).toBe(Math.PI / 2);
      }),
    );
  });

  it('the corner square where the rulers meet starts none', () => {
    fc.assert(
      fc.property(coordinate(0, 29.99), coordinate(0, 21.99), (x, y) => {
        expect(guideFromRuler({ x, y }, RULERS)).toBeNull();
      }),
    );
    expect(guideFromRuler({ x: 0, y: 0 }, RULERS)).toBeNull();
  });

  it('the board itself starts none', () => {
    fc.assert(
      fc.property(coordinate(30, 900), coordinate(22, 600), (x, y) => {
        expect(guideFromRuler({ x, y }, RULERS)).toBeNull();
      }),
    );
  });

  it('a ruler’s inner edge is the board’s', () => {
    expect(guideFromRuler({ x: 30, y: 10 }, RULERS)).toBe(0);
    expect(guideFromRuler({ x: 10, y: 22 }, RULERS)).toBe(Math.PI / 2);
    expect(guideFromRuler({ x: 30, y: 22 }, RULERS)).toBeNull();
  });
});

describe('whether a guide is kept where it is let go', () => {
  it('on the board, it is', () => {
    fc.assert(
      fc.property(coordinate(30, 900), coordinate(22, 600), (x, y) => {
        expect(guideLandsOnBoard({ x, y }, CANVAS, RULERS)).toBe(true);
      }),
    );
  });

  it('over either ruler or the corner, it is not', () => {
    expect(guideLandsOnBoard({ x: 200, y: 10 }, CANVAS, RULERS)).toBe(false);
    expect(guideLandsOnBoard({ x: 10, y: 200 }, CANVAS, RULERS)).toBe(false);
    expect(guideLandsOnBoard({ x: 10, y: 10 }, CANVAS, RULERS)).toBe(false);
  });

  it('outside the canvas, it is not', () => {
    expect(guideLandsOnBoard({ x: 901, y: 200 }, CANVAS, RULERS)).toBe(false);
    expect(guideLandsOnBoard({ x: 200, y: 601 }, CANVAS, RULERS)).toBe(false);
  });
});
