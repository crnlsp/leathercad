import { describe, expect, it } from 'vitest';
import { addGuide, deleteGuide, setGuide } from './guides.js';
import { emptyDocument } from './commands.js';
import { DocumentStore } from './store.js';

describe('guide commands', () => {
  const guide = { id: 'g', origin: { x: 1.234567, y: -2.345678 }, angleRad: Math.PI / 2 };
  it('quantises position without tilting vertical guides', () => {
    const document = addGuide(guide).apply(emptyDocument('p'));
    expect(document.project.guides?.[0]).toEqual({ ...guide, origin: { x: 1.2346, y: -2.3457 } });
    expect(addGuide(guide).apply(document)).toBe(document);
  });
  it('keeps a dragged guide as one undo step, and restores selection after delete', () => {
    const store = new DocumentStore(emptyDocument('p'));
    store.dispatch(addGuide(guide));
    store.selectGuide('g');
    const before = store.getState().document;
    store.begin({ action: 'edit-guide' });
    store.preview(setGuide({ ...guide, origin: { x: 20, y: 30 } }));
    store.preview(setGuide({ ...guide, origin: { x: 40, y: 50 } }));
    store.commit();
    store.undo();
    expect(store.getState().document).toBe(before);
    store.redo();
    expect(store.getState().document.project.guides?.[0]?.origin).toEqual({ x: 40, y: 50 });
    store.dispatch(deleteGuide('g'));
    expect(store.getState().selection.guide).toBeUndefined();
    store.undo();
    expect(store.getState().selection.guide).toBe('g');
  });
  it('makes a cancelled creation disappear and rejects non-finite input', () => {
    const store = new DocumentStore(emptyDocument('p'));
    const before = store.getState().document;
    store.begin({ action: 'add-guide' });
    store.preview(addGuide(guide));
    store.rollback();
    expect(store.getState().document).toBe(before);
    expect(store.getState().canUndo).toBe(false);
    expect(() => addGuide({ ...guide, angleRad: NaN })).toThrow(RangeError);
    expect(() => addGuide({ ...guide, origin: { x: Infinity, y: 0 } })).toThrow(RangeError);
  });
});
