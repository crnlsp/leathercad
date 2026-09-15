import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addFoldLine,
  addHardwareHole,
  addMarkingLine,
  addPart,
  deleteFeatures,
  emptyDocument,
  rectShape,
  setFoldDirection,
  setFoldThickness,
  setHardwareType,
  setMarkingPurpose,
  shapePart,
} from './commands.js';
import type { Command } from './document.js';
import { DocumentStore } from './store.js';

/** A 100 × 60 panel with nothing on it yet. */
function storeWithPanel(): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  store.dispatch(
    addPart(shapePart('part-1', 'cut-1', 'Panel', rectShape({ x: 0, y: 0 }, 100, 60))),
  );
  return store;
}

/** Straight down the middle — a bifold's spine. */
const spine = {
  kind: 'path',
  path: PathOps.polyline(
    [
      { x: 50, y: 0 },
      { x: 50, y: 60 },
    ],
    false,
  ),
} as const;

const where = (store: DocumentStore): { part: string; id: string }[] =>
  store
    .getState()
    .document.project.parts.flatMap((p) => p.features.map((f) => ({ part: p.id, id: f.id })));

const feature = (store: DocumentStore, id: string) =>
  store
    .getState()
    .document.project.parts.flatMap((p) => p.features)
    .find((f) => f.id === id);

describe('adding a fold line, a marking line or a hardware hole', () => {
  const additions: readonly [string, Command][] = [
    ['a fold line', addFoldLine('part-1', 'new-1', spine)],
    ['a marking line', addMarkingLine('part-1', 'new-1', spine, 'glue-area')],
    ['a hardware hole', addHardwareHole('part-1', 'new-1', { x: 10, y: 10 }, 2, 'rivet')],
  ];

  it.each(additions)('undoes %s in one step, and redo puts it back on the same part', (_, add) => {
    const store = storeWithPanel();
    store.dispatch(add);
    expect(where(store)).toContainEqual({ part: 'part-1', id: 'new-1' });

    store.undo();
    expect(where(store)).toEqual([{ part: 'part-1', id: 'cut-1' }]);

    store.redo();
    expect(where(store)).toEqual([
      { part: 'part-1', id: 'cut-1' },
      { part: 'part-1', id: 'new-1' },
    ]);
  });

  it('names a hole for what it is for and the punch that makes it', () => {
    const store = storeWithPanel();
    store.dispatch(addHardwareHole('part-1', 'h-4', { x: 10, y: 10 }, 2, 'rivet'));
    store.dispatch(addHardwareHole('part-1', 'h-25', { x: 30, y: 10 }, 1.25, 'snap'));

    // The record holds a radius; the name is in the diameter stamped on the punch.
    expect(feature(store, 'h-4')?.name).toBe('Rivet 4 mm');
    expect(feature(store, 'h-25')?.name).toBe('Snap 2.5 mm');
  });
});

describe('deleting the outline', () => {
  it('leaves a fold line on the panel, because a drawn line has no source to lose', () => {
    const store = storeWithPanel();
    store.dispatch(addFoldLine('part-1', 'fold-1', spine));

    store.dispatch(deleteFeatures(['cut-1']));

    // Only *derived* features follow their source out. A fold line was drawn,
    // so it stays — and so does the part, which still has something in it.
    expect(where(store)).toEqual([{ part: 'part-1', id: 'fold-1' }]);
  });
});

describe("a feature's own parameters", () => {
  it('changes a fold direction as one undoable step', () => {
    const store = storeWithPanel();
    store.dispatch(addFoldLine('part-1', 'fold-1', spine));

    store.dispatch(setFoldDirection('fold-1', 'mountain'));
    expect(feature(store, 'fold-1')).toMatchObject({ direction: 'mountain' });

    store.undo();
    expect(feature(store, 'fold-1')).toMatchObject({ direction: 'valley' });
  });

  it('drops a cleared thickness from the record rather than storing a zero or undefined', () => {
    const store = storeWithPanel();
    store.dispatch(addFoldLine('part-1', 'fold-1', spine));

    store.dispatch(setFoldThickness('fold-1', 1.2));
    expect(feature(store, 'fold-1')).toMatchObject({ materialThicknessMm: 1.2 });

    store.dispatch(setFoldThickness('fold-1', undefined));
    // The key itself is gone. `undefined` would survive into the file as a
    // property that means nothing, and 0 would claim leather with no thickness.
    expect(Object.keys(feature(store, 'fold-1')!)).not.toContain('materialThicknessMm');
  });

  it('changes a marking purpose and a hardware type', () => {
    const store = storeWithPanel();
    store.dispatch(addMarkingLine('part-1', 'mark-1', spine));
    store.dispatch(addHardwareHole('part-1', 'hole-1', { x: 10, y: 10 }, 2));

    store.dispatch(setMarkingPurpose('mark-1', 'skive'));
    store.dispatch(setHardwareType('hole-1', 'eyelet'));

    expect(feature(store, 'mark-1')).toMatchObject({ purpose: 'skive' });
    expect(feature(store, 'hole-1')).toMatchObject({ hardwareType: 'eyelet' });
  });

  it('does nothing to a feature of a different kind', () => {
    const store = storeWithPanel();
    store.dispatch(addFoldLine('part-1', 'fold-1', spine));
    const before = feature(store, 'fold-1');

    // A hardware type on a fold line would be a field no reader expects.
    store.dispatch(setHardwareType('fold-1', 'snap'));

    expect(feature(store, 'fold-1')).toEqual(before);
    expect(Object.keys(feature(store, 'fold-1')!)).not.toContain('hardwareType');
  });
});
