import {
  addPart,
  addStitchLine,
  emptyDocument,
  partSelectionOf,
  rectShape,
  rectanglePart,
  selectionOf,
  setFeatureLocked,
  setFeatureVisible,
  type Command,
  type Document,
  type Selection,
} from '@leathercad/document';
import { describe, expect, it, vi } from 'vitest';

import { selectionForRightClick, selectionMenu, type SelectionActions } from './contextMenu.js';
import type { MenuEntry, MenuItem } from './menus.js';

/** Two panels, the first with a stitch line following its outline, and an empty part. */
function project(): Document {
  let document = emptyDocument('proj');
  const apply = (c: Command): void => {
    document = c.apply(document);
  };
  apply(addPart(rectanglePart('a', 'cut-a', 'Front', rectShape({ x: 0, y: 0 }, 100, 60))));
  apply(addStitchLine('a', 'stitch-a', 'cut-a'));
  apply(addPart(rectanglePart('b', 'cut-b', 'Back', rectShape({ x: 150, y: 0 }, 100, 60))));
  apply(addPart({ id: 'e', name: 'Spare', quantity: 1, features: [] }));
  return document;
}

function actions(): SelectionActions & { dispatched: Command[] } {
  const dispatched: Command[] = [];
  return {
    dispatched,
    dispatch: (command) => dispatched.push(command),
    duplicatePart: vi.fn(),
    deleteFeatures: vi.fn(),
    deletePart: vi.fn(),
  };
}

const item = (entries: readonly MenuEntry[], id: string): MenuItem => {
  const found = entries.find((entry) => entry.kind === 'item' && entry.id === id);
  if (found?.kind !== 'item') throw new Error(`no ${id}`);
  return found;
};

const featureIn = (document: Document, id: string) =>
  document.project.parts.flatMap((p) => p.features).find((f) => f.id === id)!;

describe('what a right-click selects (8.8)', () => {
  const both = selectionOf(['cut-a', 'cut-b']);

  it('keeps the whole selection when what was clicked is already in it', () => {
    expect(selectionForRightClick(both, { kind: 'feature', id: 'cut-b' })).toBe(both);
  });

  it('selects what was clicked, alone, when it was not', () => {
    const next = selectionForRightClick(both, { kind: 'feature', id: 'stitch-a' });
    expect([...next.features]).toEqual(['stitch-a']);
  });

  it('selects the part for a right-click on its heading, as a click there does', () => {
    const next = selectionForRightClick(both, { kind: 'part', id: 'a' });
    expect([...next.parts]).toEqual(['a']);
    expect(next.features.size).toBe(0);

    const part = partSelectionOf(['a']);
    expect(selectionForRightClick(part, { kind: 'part', id: 'a' })).toBe(part);
  });
});

describe('the right-click menu (8.8)', () => {
  const menu = (selection: Selection, document = project(), on = actions()) => ({
    entries: selectionMenu(document.project, selection, on),
    on,
    document,
  });

  it('offers the same actions in the same order, whatever is selected', () => {
    const ids = (entries: readonly MenuEntry[]) =>
      entries.map((entry) => (entry.kind === 'item' ? entry.id : entry.kind));
    const expected = [
      'context-duplicate-part',
      'separator',
      'context-flip-horizontal',
      'context-flip-vertical',
      'separator',
      'context-lock',
      'context-visible',
      'separator',
      'context-delete',
    ];

    expect(ids(menu(selectionOf(['cut-a'])).entries)).toEqual(expected);
    expect(ids(menu(partSelectionOf(['e'])).entries)).toEqual(expected);
  });

  it('locks a whole multi-selection with one command, so it is one step of undo', () => {
    const { entries, on, document } = menu(selectionOf(['cut-a', 'cut-b']));

    item(entries, 'context-lock').onChoose();

    expect(on.dispatched).toHaveLength(1);
    const next = on.dispatched[0]!.apply(document);
    expect(featureIn(next, 'cut-a').locked).toBe(true);
    expect(featureIn(next, 'cut-b').locked).toBe(true);
  });

  it('locks a mixed selection, and offers to unlock only when all of it is locked', () => {
    const one = setFeatureLocked(['cut-a'], true).apply(project());
    expect(item(menu(selectionOf(['cut-a', 'cut-b']), one).entries, 'context-lock').label).toBe(
      'Lock',
    );

    const all = setFeatureLocked(['cut-a', 'cut-b'], true).apply(project());
    const { entries, on } = menu(selectionOf(['cut-a', 'cut-b']), all);
    expect(item(entries, 'context-lock').label).toBe('Unlock');
    item(entries, 'context-lock').onChoose();
    expect(featureIn(on.dispatched[0]!.apply(all), 'cut-b').locked).toBe(false);
  });

  it('hides a mixed selection, and offers to show only when all of it is hidden', () => {
    const one = setFeatureVisible(['cut-a'], false).apply(project());
    expect(item(menu(selectionOf(['cut-a', 'cut-b']), one).entries, 'context-visible').label).toBe(
      'Hide',
    );

    // Hidden is unprinted too, which is worth saying before it happens.
    expect(item(menu(selectionOf(['cut-a'])).entries, 'context-visible').note).toMatch(/PDF/);

    const all = setFeatureVisible(['cut-a', 'cut-b'], false).apply(project());
    const { entries, on } = menu(selectionOf(['cut-a', 'cut-b']), all);
    expect(item(entries, 'context-visible').label).toBe('Show');
    item(entries, 'context-visible').onChoose();
    expect(featureIn(on.dispatched[0]!.apply(all), 'cut-a').visible).toBe(true);
  });

  it('greys out a flip and a delete that a lock refuses, saying why', () => {
    const locked = setFeatureLocked(['cut-b'], true).apply(project());
    const { entries } = menu(selectionOf(['cut-a', 'cut-b']), locked);

    expect(item(entries, 'context-flip-horizontal').refusal).toMatch(/locked/i);
    expect(item(entries, 'context-delete').refusal).toMatch(/locked/i);
    // The lock protects the piece, not the view.
    expect(item(entries, 'context-visible').refusal).toBeUndefined();
  });

  it('greys out a flip of a stitch line alone, which follows its outline', () => {
    expect(
      item(menu(selectionOf(['stitch-a'])).entries, 'context-flip-vertical').refusal,
    ).toBeDefined();
  });

  it('flips the whole selection about one centre, with one command', () => {
    const { entries, on, document } = menu(selectionOf(['cut-a', 'cut-b']));

    item(entries, 'context-flip-horizontal').onChoose();

    expect(on.dispatched).toHaveLength(1);
    expect(on.dispatched[0]!.apply(document)).not.toBe(document);
  });

  it('duplicates the part a selection is in, and refuses a selection across parts', () => {
    const { entries, on } = menu(selectionOf(['cut-a', 'stitch-a']));
    item(entries, 'context-duplicate-part').onChoose();
    expect(on.duplicatePart).toHaveBeenCalledWith('a');

    expect(
      item(menu(selectionOf(['cut-a', 'cut-b'])).entries, 'context-duplicate-part').refusal,
    ).toBeDefined();
  });

  it('deletes selected features through the one delete path, and a part as a part', () => {
    const features = menu(selectionOf(['cut-b']));
    item(features.entries, 'context-delete').onChoose();
    expect(features.on.deleteFeatures).toHaveBeenCalledWith(['cut-b']);

    const part = menu(partSelectionOf(['a']));
    expect(item(part.entries, 'context-delete').label).toBe('Delete part');
    item(part.entries, 'context-delete').onChoose();
    expect(part.on.deletePart).toHaveBeenCalledWith('a');
  });

  it('acts on every feature of a part picked by its heading', () => {
    const { entries, on, document } = menu(partSelectionOf(['a']));

    item(entries, 'context-visible').onChoose();

    const next = on.dispatched[0]!.apply(document);
    expect(featureIn(next, 'cut-a').visible).toBe(false);
    expect(featureIn(next, 'stitch-a').visible).toBe(false);
    expect(featureIn(next, 'cut-b').visible).toBe(true);
  });

  it('offers an empty part only what an empty part can take', () => {
    const { entries } = menu(partSelectionOf(['e']));

    expect(item(entries, 'context-duplicate-part').refusal).toBeUndefined();
    expect(item(entries, 'context-delete').refusal).toBeUndefined();
    for (const id of ['context-flip-horizontal', 'context-lock', 'context-visible']) {
      expect(item(entries, id).refusal).toBe('The part is empty');
    }
  });
});
