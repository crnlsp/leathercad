import { describe, expect, it } from 'vitest';

import { addPart, circleShape, emptyDocument, shapePart, translateFeatures } from './commands.js';
import { DocumentStore } from './store.js';

describe('shapePart', () => {
  it('files a closed shape as a cut contour', () => {
    const part = shapePart('part-1', 'feat-1', 'Panel', circleShape({ x: 10, y: 10 }, 20));
    const [feature] = part.features;

    expect(feature?.kind).toBe('cut-contour');
    expect(feature?.name).toBe('Outline');
  });

  it('gives the part the name it was asked for, not the feature name', () => {
    const part = shapePart('part-1', 'feat-1', 'Pocket', circleShape({ x: 0, y: 0 }, 5));

    expect(part.name).toBe('Pocket');
    expect(part.quantity).toBe(1);
  });
});

describe('circleShape', () => {
  it('stores a radius, since the diameter is a panel concern', () => {
    expect(circleShape({ x: 1, y: 2 }, 7)).toEqual({
      type: 'circle',
      centre: { x: 1, y: 2 },
      radius: 7,
    });
  });
});

describe('translateFeatures', () => {
  it('moves a circle by its centre', () => {
    const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
    store.dispatch(
      addPart(shapePart('part-1', 'feat-1', 'Panel', circleShape({ x: 10, y: 10 }, 5))),
    );
    store.dispatch(translateFeatures(['feat-1'], { x: 3, y: -4 }));

    const source = store.getState().document.project.parts[0]?.features[0]?.source;
    expect(source?.kind === 'shape' && source.shape).toEqual({
      type: 'circle',
      centre: { x: 13, y: 6 },
      radius: 5,
    });
  });
});
