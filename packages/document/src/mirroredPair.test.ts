import type { FeatureId, Part, PartId } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import {
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
  setPartMirroredPair,
  setPartQuantity,
} from './commands.js';
import type { Document } from './document.js';

const SIDE = 'side' as PartId;

function withSide(quantity = 1): Document {
  const part = rectanglePart(
    SIDE,
    'outline' as FeatureId,
    'Side',
    rectShape({ x: 0, y: 0 }, 60, 30),
  );
  const added = addPart(part).apply(emptyDocument('proj'));
  return quantity === 1 ? added : setPartQuantity(SIDE, quantity).apply(added);
}

const side = (document: Document): Part | undefined =>
  document.project.parts.find((part) => part.id === SIDE);

describe('cutting a piece as a mirrored pair (Q21)', () => {
  it('marks an even count as a mirrored pair, and unmarks it, keeping the count', () => {
    const pair = setPartMirroredPair(SIDE, true).apply(withSide(4));
    expect(side(pair)).toMatchObject({ quantity: 4, mirroredPair: true });
    const alike = setPartMirroredPair(SIDE, false).apply(pair);
    expect(side(alike)?.quantity).toBe(4);
    expect(side(alike)).not.toHaveProperty('mirroredPair');
  });

  it('rounds an odd count up to the pair it asks for: one cut becomes a left and a right', () => {
    expect(side(setPartMirroredPair(SIDE, true).apply(withSide(1)))).toMatchObject({
      quantity: 2,
      mirroredPair: true,
    });
    expect(side(setPartMirroredPair(SIDE, true).apply(withSide(3)))?.quantity).toBe(4);
  });

  it('stops being a pair when the count is made odd, and stays one at another even count', () => {
    const pair = setPartMirroredPair(SIDE, true).apply(withSide(2));
    expect(side(setPartQuantity(SIDE, 3).apply(pair))).not.toHaveProperty('mirroredPair');
    expect(side(setPartQuantity(SIDE, 6).apply(pair))).toMatchObject({ mirroredPair: true });
  });

  it('keeps what it does not change, unknown fields included (§4.3)', () => {
    const before = withSide(2);
    const future = {
      ...before,
      project: {
        ...before.project,
        parts: before.project.parts.map((part) => ({ ...part, future: 'kept' })),
      },
    };
    const after = setPartMirroredPair(SIDE, true).apply(future);
    expect(side(after)).toMatchObject({ future: 'kept', name: 'Side' });
    expect(side(after)?.features).toBe(side(future)?.features);
  });

  it('is one step of history, named for what it did', () => {
    expect(setPartMirroredPair(SIDE, true).label).toEqual({ action: 'cut-mirrored-pair' });
    expect(setPartMirroredPair(SIDE, false).label).toEqual({ action: 'cut-alike' });
  });
});
