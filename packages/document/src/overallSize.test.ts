import { evaluate } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { addOverallSize, addPart, emptyDocument, rectShape, shapePart } from './commands.js';
import { DocumentStore } from './store.js';

/** A 97 × 67 panel with 5 mm corners, on its own. */
function panelStore(): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  store.dispatch(
    addPart(shapePart('part-1', 'cut-1', 'Panel', rectShape({ x: 0, y: 0 }, 97, 67, 5))),
  );
  return store;
}

const reads = (store: DocumentStore, id: string): string | undefined => {
  const entry = evaluate(store.getState().document.project)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id);
  return entry?.ok ? entry.text?.layout.text : undefined;
};

describe('a piece’s overall size (Q15)', () => {
  it('adds its width and height, reading the piece and not its corners', () => {
    const store = panelStore();

    store.dispatch(addOverallSize('cut-1', 'width', 'height'));

    expect(reads(store, 'width')).toBe('97.0');
    expect(reads(store, 'height')).toBe('67.0');
  });

  it('is one step of undo, named for what it did', () => {
    const store = panelStore();
    const before = store.getState().document;

    store.dispatch(addOverallSize('cut-1', 'width', 'height'));
    expect(store.getState().undoLabel).toEqual({ action: 'add-overall-size' });

    store.undo();
    expect(store.getState().document).toBe(before);
  });

  it('does nothing for a feature that is not there', () => {
    const store = panelStore();
    const before = store.getState().document;

    store.dispatch(addOverallSize('nobody', 'width', 'height'));

    expect(store.getState().document.project).toEqual(before.project);
  });
});
