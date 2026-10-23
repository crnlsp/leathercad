import { describe, expect, it } from 'vitest';
import { evaluate } from '@leathercad/domain';
import { addGuide, emptyDocument, DocumentStore } from '@leathercad/document';
import { snap, buildSnapIndex } from './snap.js';
import { createSelectTool } from './tools/selectTool.js';
import { Viewport } from './viewport.js';
import type { PointerInput, ToolContext } from './tool.js';

function setup() {
  const store = new DocumentStore(emptyDocument('p'));
  store.dispatch(addGuide({ id: 'h', origin: { x: 0, y: 10 }, angleRad: 0 }));
  store.dispatch(addGuide({ id: 'v', origin: { x: 20, y: 0 }, angleRad: Math.PI / 2 }));
  const resolved = evaluate(store.getState().document.project);
  return { store, resolved, index: buildSnapIndex(resolved) };
}

describe('guide snapping and selection', () => {
  it('snaps to an infinite line and favours its crossing with another guide', () => {
    const { resolved, index } = setup();
    expect(snap(index, resolved, { x: 1000, y: 11 }, { toleranceMm: 2 })).toEqual({
      kind: 'guide',
      point: { x: 1000, y: 10 },
    });
    const crossing = snap(index, resolved, { x: 20.5, y: 10.5 }, { toleranceMm: 2 });
    expect(crossing?.kind).toBe('intersection');
    expect(crossing?.point.x).toBeCloseTo(20);
    expect(crossing?.point.y).toBeCloseTo(10);
    expect(
      snap(index, resolved, { x: 1000, y: 11 }, { toleranceMm: 2, exclude: ['h'] }),
    ).toBeNull();
    expect(
      snap(index, resolved, { x: 1000, y: 11 }, { toleranceMm: 2, enabled: { guide: false } }),
    ).toBeNull();
  });
  it('selects and drags a guide in one transaction, and Escape cancels it', () => {
    const { store } = setup();
    const viewport = new Viewport();
    const context: ToolContext = {
      store,
      viewport,
      dispatch: (command) => store.dispatch(command),
      invalidate() {},
    };
    const tool = createSelectTool();
    const event = (x: number, y: number): PointerInput => ({
      at: { x, y },
      atPx: { x, y },
      button: 0,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });
    const before = store.getState().document;
    tool.onPointerDown?.(context, event(100, 10));
    expect(store.getState().selection.guide).toBe('h');
    expect(tool.snapExclusions?.(context)).toEqual(['h']);
    tool.onPointerMove?.(context, event(100, 30));
    expect(store.getState().document.project.guides?.[0]?.origin.y).toBe(30);
    tool.onKey?.(context, { key: 'Escape', means: new Set(), ctrlKey: false, shiftKey: false });
    expect(store.getState().document).toBe(before);
  });
});
