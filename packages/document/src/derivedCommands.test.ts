import { describe, expect, it } from 'vitest';

import {
  addPart,
  addStitchHoles,
  addStitchLine,
  deleteFeatures,
  emptyDocument,
  rectShape,
  setDerivation,
  shapePart,
} from './commands.js';
import { DocumentStore } from './store.js';

/** cut contour -> stitch line -> hole set, all three linked. */
function storeWithChain(): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  store.dispatch(
    addPart(shapePart('part-1', 'cut-1', 'Panel', rectShape({ x: 0, y: 0 }, 105, 75, 8))),
  );
  store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', 3.5));
  store.dispatch(
    addStitchHoles('part-1', 'holes-1', 'stitch-1', {
      type: 'stitch-holes',
      pitchMm: 3.85,
      mode: 'fit-whole',
      corners: 'hole-at-corner',
    }),
  );
  return store;
}

const featureIds = (store: DocumentStore): string[] =>
  store.getState().document.project.parts.flatMap((p) => p.features.map((f) => f.id));

function insetOf(store: DocumentStore, id: string): number | undefined {
  const feature = store
    .getState()
    .document.project.parts.flatMap((p) => p.features)
    .find((f) => f.id === id);
  const source = feature?.source;
  return source?.kind === 'derived' && source.op.type === 'offset'
    ? source.op.distanceMm
    : undefined;
}

describe('building a chain', () => {
  it('adds a stitch line that follows a cut contour', () => {
    const store = storeWithChain();
    expect(featureIds(store)).toEqual(['cut-1', 'stitch-1', 'holes-1']);
    expect(insetOf(store, 'stitch-1')).toBe(3.5);
  });

  it('edits an inset without touching anything else', () => {
    const store = storeWithChain();

    store.dispatch(
      setDerivation('stitch-1', {
        type: 'offset',
        distanceMm: 5,
        side: 'inward',
        run: { kind: 'whole' },
      }),
    );

    expect(insetOf(store, 'stitch-1')).toBe(5);
    expect(featureIds(store)).toHaveLength(3);
  });

  it('undoes an edit as one step', () => {
    const store = storeWithChain();

    store.dispatch(
      setDerivation('stitch-1', {
        type: 'offset',
        distanceMm: 5,
        side: 'inward',
        run: { kind: 'whole' },
      }),
    );
    store.undo();

    expect(insetOf(store, 'stitch-1')).toBe(3.5);
  });
});

describe('cycles', () => {
  it('refuses a derivation that would close a loop, before it enters the document', () => {
    const store = storeWithChain();
    const before = store.getState().document;

    // The cut contour cannot follow the holes that follow it.
    store.dispatch(addStitchLine('part-1', 'cut-1', 'holes-1', 3.5));

    expect(store.getState().document).toBe(before);
  });

  it('refuses a feature derived from itself', () => {
    const store = storeWithChain();
    const before = store.getState().document;

    store.dispatch(
      setDerivation('stitch-1', {
        type: 'offset',
        distanceMm: 3.5,
        side: 'inward',
        run: { kind: 'whole' },
      }),
    );

    // That one is legal; pointing it at itself is not.
    expect(store.getState().document).not.toBe(before);
  });
});

describe('deleting a source', () => {
  it('takes its dependents with it, as one undoable step', () => {
    const store = storeWithChain();

    store.dispatch(deleteFeatures(['cut-1']));
    expect(featureIds(store)).toHaveLength(0);

    store.undo();
    expect(featureIds(store)).toEqual(['cut-1', 'stitch-1', 'holes-1']);
  });

  it('takes only what actually depends on it', () => {
    const store = storeWithChain();

    // Deleting the stitch line takes the holes but leaves the outline.
    store.dispatch(deleteFeatures(['stitch-1']));

    expect(featureIds(store)).toEqual(['cut-1']);
  });

  it('leaves an unrelated part alone', () => {
    const store = storeWithChain();
    store.dispatch(
      addPart(shapePart('part-2', 'cut-2', 'Other', rectShape({ x: 0, y: 0 }, 50, 50))),
    );

    store.dispatch(deleteFeatures(['cut-1']));

    expect(featureIds(store)).toEqual(['cut-2']);
  });
});
