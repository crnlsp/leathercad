import {
  DocumentStore,
  addCutOut,
  addPart,
  copyFeatures,
  duplicatePart,
  emptyDocument,
  moveFeaturesBy,
  pasteFeatures,
  rectShape,
  rectanglePart,
  renameFeature,
} from '@leathercad/document';
import { describe, expect, it } from 'vitest';

import { newTab } from './projectTabs.js';

/** One piece, `slot`, and a duplicate of it made as Ctrl+D makes one: `copy`, remembered. */
function afterDuplicate() {
  const store = new DocumentStore(
    addPart(rectanglePart('slot', 'slot-cut', 'Slot', rectShape({ x: 0, y: 0 }, 40, 6))).apply(
      emptyDocument('proj'),
    ),
  );
  const tab = newTab('tab', store);
  store.dispatch(duplicatePart('slot', 'copy', ['copy-cut']));
  tab.steps.remember(pieces(['copy']));
  return { store, tab };
}

const pieces = (ids: string[]) => ({ kind: 'pieces', ids: new Set(ids) }) as const;
const copy = pieces(['copy']);

describe('step and repeat memory (8.8b)', () => {
  it('is nothing to repeat right after a duplicate', () => {
    const { tab } = afterDuplicate();
    expect(tab.steps.stepFor(copy)).toBeNull();
  });

  it('remembers how far the copy was moved after it was made', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    expect(tab.steps.stepFor(copy)).toEqual({ x: 0, y: -15 });
  });

  it('adds up several moves, a drag then a nudge, as one step', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -10 }));
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 2, y: -5 }));
    expect(tab.steps.stepFor(copy)).toEqual({ x: 2, y: -15 });
  });

  it('keeps the step through a drag in progress and a change of selection', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    store.begin({ action: 'move' });
    store.preview(moveFeaturesBy(['copy-cut'], { x: 9, y: 9 }));
    store.rollback();
    store.selectParts(['slot']);
    store.selectParts(['copy']);
    expect(tab.steps.stepFor(copy)).toEqual({ x: 0, y: -15 });
  });

  it('applies only to the pieces it is of, selected exactly', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    expect(tab.steps.stepFor(pieces(['slot']))).toBeNull();
    expect(tab.steps.stepFor(pieces(['slot', 'copy']))).toBeNull();
    expect(tab.steps.stepFor(pieces([]))).toBeNull();
  });

  it('is forgotten by any other command in between', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    store.dispatch(renameFeature('copy-cut', 'Edge'));
    expect(tab.steps.stepFor(copy)).toBeNull();
  });

  it('is forgotten by moving something other than the copy', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    store.dispatch(moveFeaturesBy(['slot-cut'], { x: 0, y: 30 }));
    expect(tab.steps.stepFor(copy)).toBeNull();
  });

  it('is forgotten by undo and by redo, even back to the same document', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    store.undo();
    store.redo();
    expect(tab.steps.stepFor(copy)).toBeNull();
  });

  it('is forgotten when the project is replaced', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    store.reset(emptyDocument('other'));
    expect(tab.steps.stepFor(copy)).toBeNull();
  });

  it("is a tab's own: another tab's duplicates and moves do not touch it", () => {
    const first = afterDuplicate();
    const second = afterDuplicate();
    first.store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    expect(second.tab.steps.stepFor(copy)).toBeNull();
    second.store.dispatch(renameFeature('copy-cut', 'Edge'));
    expect(first.tab.steps.stepFor(copy)).toEqual({ x: 0, y: -15 });
  });

  it('carries on after a repeat, which stands where the step put it', () => {
    const { store, tab } = afterDuplicate();
    store.dispatch(moveFeaturesBy(['copy-cut'], { x: 0, y: -15 }));
    const step = tab.steps.stepFor(copy)!;
    store.dispatch(duplicatePart('copy', 'third', ['third-cut'], step));
    tab.steps.remember(pieces(['third']), step);
    expect(tab.steps.stepFor(pieces(['third']))).toEqual({ x: 0, y: -15 });
  });

  it('steps features in a piece as it steps pieces (8.8b-4)', () => {
    const store = new DocumentStore(
      addPart(
        rectanglePart('lining', 'outline', 'Lining', rectShape({ x: 0, y: 0 }, 200, 95)),
      ).apply(emptyDocument('proj')),
    );
    store.dispatch(
      addCutOut('lining', 'slot', { kind: 'shape', shape: rectShape({ x: 18, y: 65 }, 64, 3) }),
    );
    const tab = newTab('tab', store);
    const { copied } = copyFeatures(store.getState().document.project, ['slot']);
    store.dispatch(pasteFeatures(copied, { features: ['slot-2'], seams: [] }, 'lining', null));
    const slot2 = { kind: 'features', ids: new Set(['slot-2']) } as const;
    tab.steps.remember(slot2);

    store.dispatch(moveFeaturesBy(['slot-2'], { x: 0, y: -15 }));

    expect(tab.steps.stepFor(slot2)).toEqual({ x: 0, y: -15 });
    // Not for the piece it is in, nor the slot it copied.
    expect(tab.steps.stepFor(pieces(['lining']))).toBeNull();
    expect(tab.steps.stepFor({ kind: 'features', ids: new Set(['slot']) })).toBeNull();
  });
});
