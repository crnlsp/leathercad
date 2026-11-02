import { ResourceLimitError } from '@leathercad/core';
import { describe, expect, it } from 'vitest';

import { emptyDocument, setProjectName } from './commands.js';
import { DocumentStore } from './store.js';

// A boundary validator, rather than mocked geometry. The real app supplies its sheet preflight.
function check(document: ReturnType<typeof emptyDocument>): void {
  if (document.project.name === 'too large') throw new ResourceLimitError('pages', 1001);
}

describe('a refused work request (PERF-012)', () => {
  it('keeps the document, selection, undo and redo when a command is refused', () => {
    const store = new DocumentStore(emptyDocument('project', 'Original'), check);
    store.dispatch(setProjectName('First edit'));
    store.dispatch(setProjectName('Second edit'));
    store.undo();
    const before = store.getState();
    store.dispatch(setProjectName('too large'));
    expect(store.getState()).toEqual({ ...before, resourceLimit: expect.any(ResourceLimitError) });
    store.redo();
    expect(store.getState().document.project.name).toBe('Second edit');
  });

  it('keeps the last accepted preview and allows the gesture to be cancelled', () => {
    const original = emptyDocument('project', 'Original');
    const store = new DocumentStore(original, check);
    store.begin({ action: 'rename' });
    store.preview(setProjectName('Preview'));
    store.preview(setProjectName('too large'));
    expect(store.getState().document.project.name).toBe('Preview');
    store.rollback();
    expect(store.getState().document).toBe(original);
    expect(store.getState().canUndo).toBe(false);
  });

  it('refuses an initial document or reload before replacing existing work', () => {
    const large = emptyDocument('new', 'too large');
    expect(() => new DocumentStore(large, check)).toThrow(ResourceLimitError);
    const store = new DocumentStore(emptyDocument('old'), check);
    store.dispatch(setProjectName('Unsaved'));
    const before = store.getState();
    expect(() => store.reset(large)).toThrow(ResourceLimitError);
    expect(store.getState()).toEqual(before);
  });
});
