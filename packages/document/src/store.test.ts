import { uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addPart,
  deleteFeatures,
  emptyDocument,
  rectShape,
  rectanglePart,
  renameFeature,
  setPartName,
  setPartQuantity,
  setProjectName,
  setShape,
  translateFeatures,
} from './commands.js';
import type { Command, Document } from './document.js';
import { DocumentStore } from './store.js';

function docWithRect(): Document {
  const document = emptyDocument('proj');
  return addPart(
    rectanglePart('part-1', 'feat-1', 'Panel', rectShape({ x: 0, y: 0 }, 100, 50)),
  ).apply(document);
}

/** Every command the store can be given, for the universal round-trip test. */
const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.constant(deleteFeatures(['feat-1'])),
  fc.constant(renameFeature('feat-1', 'Renamed')),
  fc.constant(setShape('feat-1', rectShape({ x: 5, y: 5 }, 40, 30, 4))),
  fc
    .tuple(
      fc.double({ min: -100, max: 100, noNaN: true }),
      fc.double({ min: -100, max: 100, noNaN: true }),
    )
    .map(([x, y]) => translateFeatures(['feat-1'], { x, y })),
  fc.constant(
    addPart(rectanglePart('part-2', 'feat-2', 'Second', rectShape({ x: 0, y: 0 }, 10, 10))),
  ),
);

describe('undo', () => {
  it('restores the previous document exactly, for every command', () => {
    // One property covering every command that will ever be written. This is
    // the reason history is snapshots rather than hand-written inverses: each
    // inverse would be a fresh chance to corrupt state hours later.
    fc.assert(
      fc.property(commandArb, (cmd) => {
        const store = new DocumentStore(docWithRect());
        const before = store.getState().document;

        store.dispatch(cmd);
        store.undo();

        return store.getState().document === before;
      }),
    );
  });

  it('redo returns to the state after the command', () => {
    fc.assert(
      fc.property(commandArb, (cmd) => {
        const store = new DocumentStore(docWithRect());
        store.dispatch(cmd);
        const after = store.getState().document;

        store.undo();
        store.redo();

        return store.getState().document === after;
      }),
    );
  });

  it('never mutates the document it was given', () => {
    fc.assert(
      fc.property(commandArb, (cmd) => {
        const original = docWithRect();
        const snapshot = JSON.stringify(original);
        cmd.apply(original);
        return JSON.stringify(original) === snapshot;
      }),
    );
  });

  it('does nothing when there is no history', () => {
    const store = new DocumentStore(docWithRect());
    const before = store.getState().document;
    store.undo();
    expect(store.getState().document).toBe(before);
    expect(store.getState().canUndo).toBe(false);
  });

  it('a new command clears the redo stack', () => {
    const store = new DocumentStore(docWithRect());
    store.dispatch(renameFeature('feat-1', 'A'));
    store.undo();
    expect(store.getState().canRedo).toBe(true);

    store.dispatch(renameFeature('feat-1', 'B'));
    expect(store.getState().canRedo).toBe(false);
  });

  it('reports what will be undone', () => {
    const store = new DocumentStore(docWithRect());
    store.dispatch(deleteFeatures(['feat-1']));
    // Names what went, so the undo menu says what it will bring back.
    expect(store.getState().undoLabel).toBe('Delete Outline');
  });

  it('a no-op command earns no history entry', () => {
    // Deleting nothing should not consume a press of undo.
    const store = new DocumentStore(docWithRect());
    store.dispatch(deleteFeatures([]));
    expect(store.getState().canUndo).toBe(false);
  });

  it('caps history rather than growing without bound', () => {
    const store = new DocumentStore(docWithRect());
    for (let i = 0; i < DocumentStore.HISTORY_LIMIT + 50; i++) {
      store.dispatch(renameFeature('feat-1', `name-${i}`));
    }
    let depth = 0;
    while (store.getState().canUndo) {
      store.undo();
      depth++;
      if (depth > DocumentStore.HISTORY_LIMIT + 10) break;
    }
    expect(depth).toBeLessThanOrEqual(DocumentStore.HISTORY_LIMIT);
  });
});

describe('transactions', () => {
  it('collapses a drag into a single undo step', () => {
    // Without this, one drag of a rectangle would need three hundred presses
    // of undo to reverse.
    const store = new DocumentStore(docWithRect());
    const start = store.getState().document;

    store.begin('Move');
    for (let i = 1; i <= 50; i++) {
      store.preview(translateFeatures(['feat-1'], { x: i, y: 0 }));
    }
    store.commit();

    expect(store.getState().canUndo).toBe(true);
    store.undo();
    expect(store.getState().document).toBe(start);
    expect(store.getState().canUndo).toBe(false);
  });

  it('each preview replaces the last rather than accumulating', () => {
    const store = new DocumentStore(docWithRect());
    store.begin('Move');
    store.preview(translateFeatures(['feat-1'], { x: 10, y: 0 }));
    store.preview(translateFeatures(['feat-1'], { x: 30, y: 0 }));
    store.commit();

    const shape = store.getState().document.project.parts[0]!.features[0]!.source;
    expect(shape.kind).toBe('shape');
    if (shape.kind === 'shape' && shape.shape.type === 'rect') {
      // 30, not 40: previews apply to the state at the start of the drag.
      expect(shape.shape.origin.x).toBe(30);
    }
  });

  it('rollback restores the state before the drag', () => {
    const store = new DocumentStore(docWithRect());
    const start = store.getState().document;

    store.begin('Move');
    store.preview(translateFeatures(['feat-1'], { x: 25, y: 25 }));
    store.rollback();

    expect(store.getState().document).toBe(start);
    expect(store.getState().canUndo).toBe(false);
  });

  it('undo during a transaction cancels it, matching Escape', () => {
    const store = new DocumentStore(docWithRect());
    const start = store.getState().document;
    store.begin('Move');
    store.preview(translateFeatures(['feat-1'], { x: 25, y: 0 }));
    store.undo();
    expect(store.getState().document).toBe(start);
  });

  it('a transaction that changed nothing leaves no history', () => {
    const store = new DocumentStore(docWithRect());
    store.begin('Move');
    store.commit();
    expect(store.getState().canUndo).toBe(false);
  });

  it('dispatch outside a transaction still works', () => {
    const store = new DocumentStore(docWithRect());
    store.preview(renameFeature('feat-1', 'Direct'));
    expect(store.getState().canUndo).toBe(true);
  });
});

describe('structural sharing', () => {
  it('leaves untouched parts identical by reference', () => {
    // This is what makes evaluation memoisation work: an unchanged feature is
    // literally the same object, so its cached path stays valid.
    let document = docWithRect();
    document = addPart(
      rectanglePart('part-2', 'feat-2', 'Other', rectShape({ x: 0, y: 0 }, 10, 10)),
    ).apply(document);

    const store = new DocumentStore(document);
    const firstPartBefore = store.getState().document.project.parts[0];

    store.dispatch(renameFeature('feat-2', 'Changed'));

    expect(store.getState().document.project.parts[0]).toBe(firstPartBefore);
  });
});

describe('selection', () => {
  it('is remembered per history step', () => {
    const store = new DocumentStore(docWithRect());
    store.select(['feat-1']);
    store.dispatch(deleteFeatures(['feat-1']));
    store.undo();
    // Undoing a delete brings the feature back, still selected.
    expect([...store.getState().selection.features]).toEqual(['feat-1']);
  });

  it('does not consume a step of undo on its own', () => {
    // An accidental click must not cost the user their undo history.
    const store = new DocumentStore(docWithRect());
    store.select(['feat-1']);
    store.clearSelection();
    expect(store.getState().canUndo).toBe(false);
  });
});

describe('reset', () => {
  it('replaces the document and discards history', () => {
    // Opening a file is not an edit. Letting Ctrl+Z walk from the newly
    // opened project back into the previous one would be worse than useless.
    const store = new DocumentStore(docWithRect());
    store.dispatch(renameFeature('feat-1', 'Changed'));
    expect(store.getState().canUndo).toBe(true);

    store.reset(emptyDocument('other'));

    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(false);
    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(store.getState().selection.features.size).toBe(0);
  });

  it('abandons an open transaction', () => {
    const store = new DocumentStore(docWithRect());
    store.begin('Move');
    store.preview(translateFeatures(['feat-1'], { x: 10, y: 0 }));
    store.reset(emptyDocument('other'));
    expect(store.inTransaction).toBe(false);
  });
});

describe('subscribe', () => {
  it('notifies on change and stops after unsubscribe', () => {
    const store = new DocumentStore(docWithRect());
    let calls = 0;
    const stop = store.subscribe(() => calls++);

    store.dispatch(renameFeature('feat-1', 'A'));
    expect(calls).toBe(1);

    stop();
    store.dispatch(renameFeature('feat-1', 'B'));
    expect(calls).toBe(1);
  });
});

describe('deleteFeatures', () => {
  it('keeps a part left with no features', () => {
    // ADR 0009: a part carries a name and a quantity the user gave it, so it
    // goes only when the part itself is deleted, never as a side effect.
    const store = new DocumentStore(docWithRect());
    store.dispatch(deleteFeatures(['feat-1']));
    expect(store.getState().document.project.parts).toHaveLength(1);
    expect(store.getState().document.project.parts[0]!.features).toEqual([]);
  });
});

describe('setProjectName', () => {
  it('renames the project, which the file name and PDF footer both use', () => {
    const store = new DocumentStore(docWithRect());
    store.dispatch(setProjectName('Bifold wallet'));
    expect(store.getState().document.project.name).toBe('Bifold wallet');
  });
});

describe('part commands', () => {
  it('renames a part', () => {
    const store = new DocumentStore(docWithRect());
    store.dispatch(setPartName('part-1', 'Card holder'));
    expect(store.getState().document.project.parts[0]!.name).toBe('Card holder');
  });

  it('refuses a quantity below one', () => {
    // A part you cut zero of is a part you should delete instead.
    const store = new DocumentStore(docWithRect());
    store.dispatch(setPartQuantity('part-1', 0));
    expect(store.getState().document.project.parts[0]!.quantity).toBe(1);
    store.dispatch(setPartQuantity('part-1', -5));
    expect(store.getState().document.project.parts[0]!.quantity).toBe(1);
  });

  it('rounds a fractional quantity', () => {
    const store = new DocumentStore(docWithRect());
    store.dispatch(setPartQuantity('part-1', 2.6));
    expect(store.getState().document.project.parts[0]!.quantity).toBe(3);
  });
});

describe('setShape', () => {
  it('replaces the parameters, leaving the feature identity intact', () => {
    const store = new DocumentStore(docWithRect());
    const before = store.getState().document.project.parts[0]!.features[0]!;

    store.dispatch(setShape('feat-1', rectShape({ x: 0, y: 0 }, 105, 75, 8)));

    const after = store.getState().document.project.parts[0]!.features[0]!;
    expect(after.id).toBe(before.id);
    expect(after.kind).toBe('cut-contour');
    if (after.source.kind === 'shape' && after.source.shape.type === 'rect') {
      expect(after.source.shape.width).toBe(105);
      expect(after.source.shape.radii).toEqual(uniformRadii(8));
    }
  });
});

describe('translateFeatures', () => {
  it('moves a parametric shape by its parameters, keeping it editable', () => {
    // Transforming the generated path instead would quietly demote the
    // rectangle to a polyline and lose numeric width editing.
    const store = new DocumentStore(docWithRect());
    store.dispatch(translateFeatures(['feat-1'], { x: 10, y: -5 }));

    const source = store.getState().document.project.parts[0]!.features[0]!.source;
    expect(source.kind).toBe('shape');
    if (source.kind === 'shape' && source.shape.type === 'rect') {
      expect(source.shape.origin).toEqual({ x: 10, y: -5 });
      expect(source.shape.width).toBe(100);
      expect(source.shape.radii).toEqual(uniformRadii(0));
    }
  });
});
