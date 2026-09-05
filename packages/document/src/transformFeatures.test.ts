import { MatOps, uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addPart,
  arcShape,
  circleShape,
  emptyDocument,
  rectShape,
  refusedTransforms,
  shapePart,
  transformFeatures,
} from './commands.js';
import { DocumentStore } from './store.js';

function storeWith(shapes: Parameters<typeof shapePart>[3][]): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  shapes.forEach((shape, index) => {
    store.dispatch(addPart(shapePart(`part-${index}`, `feat-${index}`, 'Panel', shape)));
  });
  return store;
}

function shapeOf(store: DocumentStore, index: number): unknown {
  const source = store.getState().document.project.parts[index]?.features[0]?.source;
  return source?.kind === 'shape' ? source.shape : null;
}

describe('transformFeatures', () => {
  it('rotates a rectangle through its rotation parameter', () => {
    const store = storeWith([rectShape({ x: 0, y: 0 }, 100, 50)]);

    store.dispatch(transformFeatures(['feat-0'], MatOps.fromRotation(Math.PI / 2)));

    const shape = shapeOf(store, 0) as { rotation: number; width: number };
    expect(shape.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(shape.width).toBe(100);
  });

  it('leaves an arc untouched under a non-uniform scale', () => {
    const before = arcShape({ x: 10, y: 10 }, 20, 0, Math.PI / 2);
    const store = storeWith([before]);

    store.dispatch(transformFeatures(['feat-0'], MatOps.fromScale(2, 1)));

    expect(shapeOf(store, 0)).toEqual(before);
  });

  it('moves what it can and leaves what it cannot, in a mixed selection', () => {
    const store = storeWith([rectShape({ x: 0, y: 0 }, 100, 50), circleShape({ x: 10, y: 10 }, 5)]);

    store.dispatch(transformFeatures(['feat-0', 'feat-1'], MatOps.fromScale(2, 1)));

    // The rectangle stretches — that is rule 1's worked example.
    expect((shapeOf(store, 0) as { width: number }).width).toBeCloseTo(200, 9);
    // The circle is left exactly as it was rather than becoming an ellipse.
    expect(shapeOf(store, 1)).toEqual(circleShape({ x: 10, y: 10 }, 5));
  });

  it('reports which features refused, and why', () => {
    const store = storeWith([rectShape({ x: 0, y: 0 }, 100, 50), circleShape({ x: 0, y: 0 }, 5)]);
    const project = store.getState().document.project;

    const refused = refusedTransforms(project, ['feat-0', 'feat-1'], MatOps.fromScale(2, 1));

    expect(refused).toHaveLength(1);
    expect(refused[0]?.featureId).toBe('feat-1');
    expect(refused[0]?.reason).toMatch(/ellipse/i);
  });

  it('reports nothing when every feature can take the transform', () => {
    const store = storeWith([rectShape({ x: 0, y: 0 }, 100, 50)]);
    const project = store.getState().document.project;

    expect(refusedTransforms(project, ['feat-0'], MatOps.fromRotation(1))).toHaveLength(0);
  });

  it('undoes as one step', () => {
    const store = storeWith([rectShape({ x: 0, y: 0 }, 100, 50)]);

    store.dispatch(transformFeatures(['feat-0'], MatOps.fromRotation(1)));
    store.undo();

    expect((shapeOf(store, 0) as { rotation: number }).rotation).toBe(0);
  });

  it('still transforms drawn paths, which have no parameters to protect', () => {
    // Rule 2: a non-uniform scale flattens a drawn path's arcs to cubics
    // rather than refusing. Only parametric shapes are defended.
    const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
    store.dispatch(
      addPart({
        id: 'part-p',
        name: 'Drawn',
        quantity: 1,
        features: [
          {
            id: 'feat-p',
            kind: 'marking-line',
            purpose: 'alignment',
            name: 'Line',
            visible: true,
            locked: false,
            source: {
              kind: 'path',
              path: {
                closed: false,
                segments: [{ kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }],
              },
            },
          },
        ],
      }),
    );

    store.dispatch(transformFeatures(['feat-p'], MatOps.fromScale(2, 1)));

    const source = store.getState().document.project.parts[0]?.features[0]?.source;
    expect(source?.kind).toBe('path');
    if (source?.kind !== 'path') return;
    const [segment] = source.path.segments;
    expect(segment?.kind === 'line' && segment.b.x).toBeCloseTo(20, 9);
  });

  it('keeps translateFeatures working, as the move case of the same thing', () => {
    const store = storeWith([rectShape({ x: 1, y: 1 }, 10, 10, 0)]);

    store.dispatch(transformFeatures(['feat-0'], MatOps.fromTranslation({ x: 3, y: 4 })));

    expect((shapeOf(store, 0) as { origin: { x: number; y: number } }).origin).toEqual({
      x: 4,
      y: 5,
    });
  });

  it('does not scale corner radii unevenly when a panel is stretched', () => {
    const store = storeWith([rectShape({ x: 0, y: 0 }, 100, 50, 8)]);

    store.dispatch(transformFeatures(['feat-0'], MatOps.fromScale(2, 1)));

    // Nobody wants their 8 mm corners to become ellipses because they widened
    // the panel (geometry.md 4.2 rule 1).
    expect((shapeOf(store, 0) as { radii: { topLeft: number } }).radii).toEqual(uniformRadii(8));
  });
});
