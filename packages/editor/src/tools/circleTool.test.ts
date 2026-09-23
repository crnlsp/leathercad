import { DocumentStore, emptyDocument } from '@leathercad/document';
import type { Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createCircleTool } from './circleTool.js';

function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;

  return {
    store,
    ctx: {
      viewport,
      store,
      dispatch: (command) => store.dispatch(command),
      invalidate: () => {},
    },
  };
}

function pointer(at: Vec2): PointerInput {
  return { at, atPx: { x: 0, y: 0 }, button: 0, shiftKey: false, altKey: false, ctrlKey: false };
}

function shapeIn(store: DocumentStore): unknown {
  const source = store.getState().document.project.parts[0]?.features[0]?.source;
  return source?.kind === 'shape' ? source.shape : null;
}

describe('circle tool', () => {
  it('drags from the centre outwards, not corner to corner', () => {
    const { ctx, store } = harness();
    const tool = createCircleTool(() => `id-${Math.random()}`);

    tool.onPointerDown?.(ctx, pointer({ x: 20, y: 20 }));
    tool.onPointerMove?.(ctx, pointer({ x: 23, y: 24 }));
    tool.onPointerUp?.(ctx, pointer({ x: 23, y: 24 }));

    // 3-4-5 triangle: the radius is the distance dragged, and the centre is
    // where the drag began.
    expect(shapeIn(store)).toEqual({ type: 'circle', centre: { x: 20, y: 20 }, radius: 5 });
  });

  it('takes two clicks as well as a drag: the centre, then the rim (F.1)', () => {
    const { ctx, store } = harness();
    const tool = createCircleTool(() => `id-${Math.random()}`);

    tool.onPointerDown?.(ctx, pointer({ x: 20, y: 20 }));
    tool.onPointerUp?.(ctx, pointer({ x: 20, y: 20 }));
    expect(shapeIn(store)).toBeNull();
    tool.onPointerMove?.(ctx, pointer({ x: 22, y: 22 }));
    tool.onPointerDown?.(ctx, pointer({ x: 23, y: 24 }));
    tool.onPointerUp?.(ctx, pointer({ x: 23, y: 24 }));

    expect(shapeIn(store)).toEqual({ type: 'circle', centre: { x: 20, y: 20 }, radius: 5 });
  });

  it('files the circle as a cut contour on a new part', () => {
    const { ctx, store } = harness();
    const tool = createCircleTool(() => `id-${Math.random()}`);

    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 10, y: 0 }));

    const part = store.getState().document.project.parts[0];
    expect(part?.name).toBe('Panel');
    expect(part?.features[0]?.kind).toBe('cut-contour');
  });

  it('creates nothing from a click without a drag', () => {
    const { ctx, store } = harness();
    const tool = createCircleTool(() => 'id');

    tool.onPointerDown?.(ctx, pointer({ x: 5, y: 5 }));
    tool.onPointerUp?.(ctx, pointer({ x: 5, y: 5 }));

    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('abandons on Escape, leaving the document alone', () => {
    const { ctx, store } = harness();
    const tool = createCircleTool(() => 'id');

    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 10, y: 0 }));
    tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });
    tool.onPointerUp?.(ctx, pointer({ x: 10, y: 0 }));

    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('selects what it just drew, so the panel can edit it', () => {
    const { ctx, store } = harness();
    const tool = createCircleTool(() => 'the-circle');

    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 8, y: 0 }));

    expect([...store.getState().selection.features]).toEqual(['the-circle']);
  });
});
