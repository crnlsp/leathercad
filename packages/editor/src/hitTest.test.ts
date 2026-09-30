import {
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  setFeatureVisible,
} from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { hitTest } from './hitTest.js';

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
