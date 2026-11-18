import {
  DocumentStore,
  addPart,
  duplicatePart,
  emptyDocument,
  moveFeaturesBy,
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
  tab.steps.remember(['copy']);
  return { store, tab };
}

const copy = new Set(['copy']);

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
    expect(tab.steps.stepFor(new Set(['slot']))).toBeNull();
    expect(tab.steps.stepFor(new Set(['slot', 'copy']))).toBeNull();
    expect(tab.steps.stepFor(new Set())).toBeNull();
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
    tab.steps.remember(['third'], step);
    expect(tab.steps.stepFor(new Set(['third']))).toEqual({ x: 0, y: -15 });
  });
});
