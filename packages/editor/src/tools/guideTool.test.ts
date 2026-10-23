import { DocumentStore, emptyDocument } from '@leathercad/document';
import { describe, expect, it } from 'vitest';

import type { PointerInput, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createGuideTool } from './guideTool.js';
import { keyInput } from './keys.fixture.js';

function harness() {
  const store = new DocumentStore(emptyDocument('p'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;
  const ctx: ToolContext = {
    viewport,
    store,
    dispatch: (command) => store.dispatch(command),
    invalidate: () => {},
    drawAs: () => 'outline',
  };
  let counter = 0;
  return { store, ctx, tool: createGuideTool(() => `g${String(counter++)}`) };
}

const at = (x: number, y: number, shiftKey = false): PointerInput => ({
  at: { x, y },
  atPx: { x: 0, y: 0 },
  button: 0,
  shiftKey,
  altKey: false,
  ctrlKey: false,
});

describe('the Guides tool', () => {
  it('places a horizontal guide on a click, and a vertical one with Shift', () => {
    const { store, ctx, tool } = harness();
    tool.onPointerDown?.(ctx, at(10, 20));
    tool.onPointerUp?.(ctx, at(10, 20));
    tool.onPointerDown?.(ctx, at(30, 5, true));
    tool.onPointerUp?.(ctx, at(30, 5, true));
    const guides = store.getState().document.project.guides ?? [];
    expect(guides.map((guide) => [guide.origin, guide.angleRad])).toEqual([
      [{ x: 10, y: 20 }, 0],
      [{ x: 30, y: 5 }, Math.PI / 2],
    ]);
    expect(store.getState().selection.guide).toBe('g1');
  });

  it('places a guide through the two points of a drag, as one undo step', () => {
    const { store, ctx, tool } = harness();
    tool.onPointerDown?.(ctx, at(0, 0));
    tool.onPointerMove?.(ctx, at(5, 1));
    expect(tool.snapExclusions?.(ctx)).toEqual(['g0']);
    tool.onPointerMove?.(ctx, at(10, 10));
    tool.onPointerUp?.(ctx, at(10, 10));
    const [guide] = store.getState().document.project.guides ?? [];
    expect(guide?.origin).toEqual({ x: 0, y: 0 });
    expect(guide?.angleRad).toBeCloseTo(Math.PI / 4);
    expect(store.getState().selection.guide).toBe('g0');
    store.undo();
    expect(store.getState().document.project.guides ?? []).toEqual([]);
    expect(store.getState().canUndo).toBe(false);
  });

  it('cancels a drag on Escape, claiming the key only then', () => {
    const { store, ctx, tool } = harness();
    const before = store.getState().document;
    expect(tool.onKey?.(ctx, keyInput('Escape'))).toBe(false);
    tool.onPointerDown?.(ctx, at(0, 0));
    tool.onPointerMove?.(ctx, at(10, 10));
    expect(tool.underway?.()).toBe(true);
    expect(tool.onKey?.(ctx, keyInput('Escape'))).toBe(true);
    tool.onPointerUp?.(ctx, at(10, 10));
    expect(store.getState().document).toBe(before);
    expect(tool.underway?.()).toBe(false);
  });

  it('deletes the selected guide', () => {
    const { store, ctx, tool } = harness();
    tool.onPointerDown?.(ctx, at(10, 20));
    tool.onPointerUp?.(ctx, at(10, 20));
    expect(tool.onKey?.(ctx, keyInput('Delete'))).toBe(true);
    expect(store.getState().document.project.guides).toEqual([]);
  });
});
