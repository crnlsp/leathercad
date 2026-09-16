import { evaluate, type Feature } from '@leathercad/domain';
import { MatOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addFeature,
  addPart,
  addStitchHoles,
  addStitchLine,
  deleteFeatures,
  deletePart,
  emptyDocument,
  planDelete,
  rectShape,
  refusedTransforms,
  setSource,
  shapePart,
  translateFeatures,
} from './commands.js';
import { DocumentStore } from './store.js';

const HOLES = {
  type: 'stitch-holes',
  pitchMm: 3.85,
  mode: 'fit-whole',
  corners: 'hole-at-corner',
} as const;

/** Part 1: Outline → Stitch line → Stitch holes. */
function storeWithChain(): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  store.dispatch(
    addPart(shapePart('part-1', 'cut-1', 'Panel', rectShape({ x: 0, y: 0 }, 105, 75, 8))),
  );
  store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', 3.5));
  store.dispatch(addStitchHoles('part-1', 'holes-1', 'stitch-1', HOLES));
  return store;
}

const features = (store: DocumentStore): Feature[] =>
  store.getState().document.project.parts.flatMap((p) => p.features);

const feature = (store: DocumentStore, id: string): Feature | undefined =>
  features(store).find((f) => f.id === id);

describe('planDelete', () => {
  it('lists every dependent, and which the user could keep', () => {
    const plan = planDelete(storeWithChain().getState().document.project, ['cut-1']);

    expect(plan.dependents).toEqual([
      expect.objectContaining({ featureId: 'stitch-1', direct: true, freezable: true }),
      // A hole set has no drawn form to freeze into; and it is not direct.
      expect.objectContaining({ featureId: 'holes-1', direct: false, freezable: false }),
    ]);
  });

  it('names the part each dependent is in, so the dialog can group them', () => {
    const plan = planDelete(storeWithChain().getState().document.project, ['cut-1']);
    expect(plan.dependents[0]).toMatchObject({ partId: 'part-1', partName: 'Panel' });
  });

  it('cannot freeze a direct dependent that has no geometry to keep', () => {
    const store = new DocumentStore(emptyDocument('doc'));
    store.dispatch(
      addPart(shapePart('part-1', 'cut-1', 'Panel', rectShape({ x: 0, y: 0 }, 105, 75, 8))),
    );
    // Deeper than the outline can hold: it does not resolve.
    store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', 100));

    const plan = planDelete(store.getState().document.project, ['cut-1']);
    expect(plan.dependents).toEqual([
      expect.objectContaining({ featureId: 'stitch-1', direct: true, freezable: false }),
    ]);
  });
});

describe('deleteFeatures', () => {
  it('deletes at once when nothing depends on what was named', () => {
    const store = storeWithChain();
    store.dispatch(deleteFeatures(['holes-1']));
    expect(features(store).map((f) => f.id)).toEqual(['cut-1', 'stitch-1']);
    expect(store.getState().undoLabel).toBe('Delete Stitch holes');
  });

  it('refuses, changing nothing and recording nothing, when dependents need a decision', () => {
    const store = storeWithChain();
    const before = store.getState().document;
    const label = store.getState().undoLabel;

    store.dispatch(deleteFeatures(['cut-1']));

    // Identity: the store only records history when the document changes.
    expect(store.getState().document).toBe(before);
    expect(store.getState().undoLabel).toBe(label);
  });

  it('deletes the whole chain when told to, as one undo step', () => {
    const store = storeWithChain();
    store.dispatch(deleteFeatures(['cut-1'], 'delete-dependents'));

    expect(features(store)).toEqual([]);
    expect(store.getState().undoLabel).toBe('Delete Outline and 2 dependents');

    store.undo();
    expect(features(store).map((f) => f.id)).toEqual(['cut-1', 'stitch-1', 'holes-1']);
  });

  it('freezes a direct dependent exactly where it was, and keeps its own dependents linked', () => {
    const store = storeWithChain();
    const resolvedBefore = evaluate(store.getState().document.project).parts[0]!.features.find(
      (f) => f.feature.id === 'stitch-1',
    )!;

    store.dispatch(deleteFeatures(['cut-1'], 'freeze-dependents'));

    const stitch = feature(store, 'stitch-1')!;
    expect(stitch.source.kind).toBe('path');
    expect(stitch.frozenFrom).toBe('Outline');
    expect(resolvedBefore.ok).toBe(true);
    if (stitch.source.kind === 'path' && resolvedBefore.ok) {
      expect(stitch.source.path).toEqual(resolvedBefore.path);
    }

    // The holes followed the stitch line, which is still here: they still do.
    expect(feature(store, 'holes-1')!.source).toMatchObject({
      kind: 'derived',
      sourceId: 'stitch-1',
    });
    expect(store.getState().undoLabel).toBe('Delete Outline, keep 1 frozen');

    store.undo();
    expect(feature(store, 'stitch-1')!.source.kind).toBe('derived');
  });

  it('deletes what cannot be frozen, even when freezing', () => {
    // Freezing a stitch line's holes without the line would invent a
    // hand-placed hole set, which the model deliberately does not have.
    const store = storeWithChain();
    store.dispatch(deleteFeatures(['stitch-1'], 'freeze-dependents'));
    expect(features(store).map((f) => f.id)).toEqual(['cut-1']);
  });

  it('never removes a part, however empty it becomes', () => {
    const store = storeWithChain();
    store.dispatch(deleteFeatures(['cut-1'], 'delete-dependents'));

    const parts = store.getState().document.project.parts;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ id: 'part-1', name: 'Panel', features: [] });
  });
});

describe('deletePart', () => {
  it('removes an empty part', () => {
    const store = storeWithChain();
    store.dispatch(deleteFeatures(['cut-1'], 'delete-dependents'));

    store.dispatch(deletePart('part-1'));

    expect(store.getState().document.project.parts).toEqual([]);
  });

  it('asks when something outside the part depends on it', () => {
    const store = storeWithChain();
    store.dispatch(
      addPart(shapePart('part-2', 'cut-2', 'Pocket', rectShape({ x: 200, y: 0 }, 60, 40))),
    );
    // A stitch line in the pocket that follows the panel's outline.
    store.dispatch(addStitchLine('part-2', 'stitch-2', 'cut-1', 3.5));
    const before = store.getState().document;

    store.dispatch(deletePart('part-1'));
    expect(store.getState().document).toBe(before);

    store.dispatch(deletePart('part-1', 'delete-dependents'));
    const project = store.getState().document.project;
    expect(project.parts.map((p) => p.id)).toEqual(['part-2']);
    expect(project.parts[0]!.features.map((f) => f.id)).toEqual(['cut-2']);
  });
});

describe('setSource', () => {
  function storeWithTwoOutlines(): DocumentStore {
    const store = storeWithChain();
    store.dispatch(
      addPart(shapePart('part-2', 'cut-2', 'Pocket', rectShape({ x: 200, y: 0 }, 60, 40))),
    );
    return store;
  }

  it('points a stitch line at another outline, keeping its inset', () => {
    const store = storeWithTwoOutlines();
    store.dispatch(setSource('stitch-1', 'cut-2'));

    expect(feature(store, 'stitch-1')!.source).toMatchObject({
      kind: 'derived',
      sourceId: 'cut-2',
      op: { type: 'offset', distanceMm: 3.5 },
    });
  });

  it('refuses anything the graph would not allow, changing nothing', () => {
    const store = storeWithTwoOutlines();
    const before = store.getState().document;

    store.dispatch(setSource('stitch-1', 'holes-1')); // would loop, and holes are not an outline
    store.dispatch(setSource('stitch-1', 'stitch-1')); // itself
    store.dispatch(setSource('cut-1', 'cut-2')); // not derived

    expect(store.getState().document).toBe(before);
  });
});

describe('adding a derived feature', () => {
  it('refuses one the compatibility table does not allow', () => {
    const store = storeWithChain();
    const before = store.getState().document;

    store.dispatch(addStitchHoles('part-1', 'holes-on-outline', 'cut-1', HOLES));
    store.dispatch(
      addFeature('part-1', {
        id: 'bad-fold',
        kind: 'fold-line',
        direction: 'valley',
        name: 'Fold',
        visible: true,
        locked: false,
        source: {
          kind: 'derived',
          sourceId: 'cut-1',
          op: { type: 'offset', distanceMm: 3, side: 'inward', run: { kind: 'whole' } },
        },
      }),
    );

    expect(store.getState().document).toBe(before);
  });
});

describe('refusedTransforms, for derived features', () => {
  const project = () => storeWithChain().getState().document.project;
  const shift = MatOps.fromTranslation({ x: 10, y: 0 });

  it('refuses moving a stitch line on its own, and says what to move instead', () => {
    const refused = refusedTransforms(project(), ['stitch-1'], shift);
    expect(refused).toEqual([
      {
        featureId: 'stitch-1',
        problem: {
          code: 'DERIVED_MOVED_ALONE',
          facts: expect.objectContaining({
            featureId: 'stitch-1',
            rootId: 'cut-1',
            rootName: 'Outline',
          }),
        },
      },
    ]);
  });

  it('refuses moving the holes on their own', () => {
    expect(refusedTransforms(project(), ['holes-1'], shift)).toHaveLength(1);
  });

  it('has nothing to say when a derived feature moves with its source', () => {
    expect(refusedTransforms(project(), ['cut-1', 'stitch-1', 'holes-1'], shift)).toEqual([]);
    // Moving only the outline moves everything that follows it, too.
    expect(refusedTransforms(project(), ['cut-1'], shift)).toEqual([]);
  });

  it('still moves the outline and leaves the followers following', () => {
    const store = storeWithChain();
    store.dispatch(translateFeatures(['cut-1', 'stitch-1'], { x: 10, y: 0 }));
    expect(feature(store, 'stitch-1')!.source.kind).toBe('derived');
  });
});
