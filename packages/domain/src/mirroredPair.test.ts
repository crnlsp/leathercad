import { Shapes, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate } from './evaluate.js';
import { DEFAULT_SETTINGS, type Part, type Project } from './feature.js';
import { turnedOver } from './mirroredPair.js';
import { productionSummary } from './productionSummary.js';

const panel = (quantity: number, mirroredPair: boolean): Part => ({
  id: 'side',
  name: 'Side',
  quantity,
  ...(mirroredPair ? { mirroredPair: true as const } : {}),
  features: [
    {
      id: 'outline',
      name: 'Outline',
      visible: true,
      locked: false,
      kind: 'cut-contour',
      role: 'outer',
      source: {
        kind: 'path',
        path: Shapes.roundedRect({ x: 0, y: 0 }, 60, 30, uniformRadii(4)),
      },
    },
  ],
});

const projectOf = (part: Part): Project => ({
  id: 'project',
  name: 'Pair',
  settings: DEFAULT_SETTINGS,
  parts: [part],
});

const evenQuantity = fc.integer({ min: 1, max: 50 }).map((half) => half * 2);

describe('a piece cut as a mirrored pair (Q21)', () => {
  it('turns the template over for half of an even count, and for none otherwise', () => {
    fc.assert(
      fc.property(evenQuantity, (quantity) => {
        const turned = turnedOver({ quantity, mirroredPair: true });
        // As many cut as drawn as turned over: never two lefts.
        expect(turned).toBe(quantity - turned);
        expect(turnedOver({ quantity })).toBe(0);
      }),
    );
    expect(turnedOver({ quantity: 2, mirroredPair: true })).toBe(1);
    expect(turnedOver({ quantity: 1 })).toBe(0);
  });

  it('refuses an odd count, which no mirrored pair can be', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (half) => {
        expect(() => turnedOver({ quantity: half * 2 + 1, mirroredPair: true })).toThrow(
          RangeError,
        );
      }),
    );
  });

  it('cuts the same pieces, holes and leather as the same count cut alike', () => {
    // Turning the template over makes the other hand, not another piece: the
    // summary's figures are the count's, and only the words differ.
    fc.assert(
      fc.property(evenQuantity, (quantity) => {
        const alike = productionSummary(evaluate(projectOf(panel(quantity, false))));
        const pair = productionSummary(evaluate(projectOf(panel(quantity, true))));
        expect(pair.toCut).toBe(alike.toCut);
        expect(pair.holes).toBe(alike.holes);
        expect(pair.leatherMm2).toBe(alike.leatherMm2);
        expect(pair.pieces.map((piece) => piece.turnedOver)).toEqual([quantity / 2]);
        expect(alike.pieces.map((piece) => piece.turnedOver)).toEqual([0]);
      }),
      { numRuns: 20 },
    );
  });
});
