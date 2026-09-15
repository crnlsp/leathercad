import {
  addPart,
  addStitchLine,
  DocumentStore,
  emptyDocument,
  rectShape,
  shapePart,
} from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import type { Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createRectangleTool } from './rectangleTool.js';
import { createSelectTool } from './selectTool.js';

/**
 * A tool harness with no canvas in it.
 *
 * Tools take millimetres and emit commands, so their whole behaviour is
 * testable without rendering anything. Reaching for Playwright to check that a
 * drag makes a rectangle would mean the logic had got tangled with the canvas.
 */
function harness(): { ctx: ToolContext; store: DocumentStore; repaints: () => number } {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;

  let repaints = 0;
  return {
    store,
    repaints: () => repaints,
    ctx: {
      viewport,
      store,
      dispatch: (command) => store.dispatch(command),
      invalidate: () => {
        repaints++;
      },
    },
  };
}

function pointer(at: Vec2, overrides: Partial<PointerInput> = {}): PointerInput {
  return {
    at,
    atPx: { x: 0, y: 0 },
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    ...overrides,
  };
}

function drag(tool: Tool, ctx: ToolContext, from: Vec2, to: Vec2, shiftKey = false): void {
  tool.onPointerDown?.(ctx, pointer(from, { shiftKey }));
  tool.onPointerMove?.(
    ctx,
    pointer({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, { shiftKey }),
  );
  tool.onPointerMove?.(ctx, pointer(to, { shiftKey }));
  tool.onPointerUp?.(ctx, pointer(to, { shiftKey }));
}

function firstRect(store: DocumentStore) {
  const source = store.getState().document.project.parts[0]?.features[0]?.source;
  if (source?.kind !== 'shape' || source.shape.type !== 'rect') return null;
  return source.shape;
}

let counter = 0;
const nextId = (): string => `id-${counter++}`;

describe('rectangle tool', () => {
  it('creates a part with a cut contour of the dragged size', () => {
    const { ctx, store } = harness();
    drag(createRectangleTool(nextId), ctx, { x: 10, y: 20 }, { x: 115, y: 95 });

    const shape = firstRect(store);
    expect(shape).not.toBeNull();
    expect(shape!.width).toBeCloseTo(105, 9);
    expect(shape!.height).toBeCloseTo(75, 9);
    expect(shape!.origin).toEqual({ x: 10, y: 20 });

    // Not a generic path: it is semantically a cut contour, which is what
    // makes this a leathercraft tool rather than a vector editor.
    expect(store.getState().document.project.parts[0]!.features[0]!.kind).toBe('cut-contour');
  });

  it('normalises a drag made right-to-left and upwards', () => {
    const { ctx, store } = harness();
    drag(createRectangleTool(nextId), ctx, { x: 100, y: 80 }, { x: 20, y: 10 });

    const shape = firstRect(store)!;
    expect(shape.origin).toEqual({ x: 20, y: 10 });
    expect(shape.width).toBeCloseTo(80, 9);
    expect(shape.height).toBeCloseTo(70, 9);
  });

  it('constrains to a square while shift is held', () => {
    const { ctx, store } = harness();
    drag(createRectangleTool(nextId), ctx, { x: 0, y: 0 }, { x: 100, y: 30 }, true);

    const shape = firstRect(store)!;
    expect(shape.width).toBeCloseTo(100, 9);
    expect(shape.height).toBeCloseTo(100, 9);
  });

  it('ignores a click that never became a drag', () => {
    // A zero-size part would be invisible in the canvas and impossible to
    // select, but would still sit in the parts list.
    const { ctx, store } = harness();
    drag(createRectangleTool(nextId), ctx, { x: 5, y: 5 }, { x: 5.001, y: 5.001 });

    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(store.getState().canUndo).toBe(false);
  });

  it('selects what it just drew', () => {
    const { ctx, store } = harness();
    drag(createRectangleTool(nextId), ctx, { x: 0, y: 0 }, { x: 50, y: 50 });
    expect(store.getState().selection.features.size).toBe(1);
  });

  it('is one undo step', () => {
    const { ctx, store } = harness();
    drag(createRectangleTool(nextId), ctx, { x: 0, y: 0 }, { x: 50, y: 50 });

    store.undo();
    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(store.getState().canUndo).toBe(false);
  });

  it('shows a live preview while dragging and nothing when idle', () => {
    const { ctx } = harness();
    const tool = createRectangleTool(nextId);

    expect(tool.buildOverlay?.(ctx).items ?? []).toHaveLength(0);

    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 40, y: 25 }));

    const overlay = tool.buildOverlay?.(ctx).items ?? [];
    expect(overlay.length).toBeGreaterThan(0);
    // Live dimensions matter more than the rubber band in a millimetre tool.
    const label = overlay.find((item) => item.kind === 'text');
    expect(label).toBeDefined();
    if (label?.kind === 'text') expect(label.text).toBe('40.0 × 25.0 mm');
  });

  it('Escape abandons the drag and writes nothing', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);

    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 50, y: 50 }));
    tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 50 }));

    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(tool.buildOverlay?.(ctx).items ?? []).toHaveLength(0);
  });

  it('leaves no half-drawn shape behind when swapped out', () => {
    const { ctx } = harness();
    const tool = createRectangleTool(nextId);
    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 50, y: 50 }));
    tool.onDeactivate?.(ctx);
    expect(tool.buildOverlay?.(ctx).items ?? []).toHaveLength(0);
  });

  it('ignores the right button', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }, { button: 2 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 50 }, { button: 2 }));
    expect(store.getState().document.project.parts).toHaveLength(0);
  });
});

describe('select tool', () => {
  function withRect(): ReturnType<typeof harness> {
    const h = harness();
    drag(createRectangleTool(nextId), h.ctx, { x: 0, y: 0 }, { x: 100, y: 50 });
    h.store.clearSelection();
    return h;
  }

  it('selects a feature by clicking its outline', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 0 }));

    expect(store.getState().selection.features.size).toBe(1);
  });

  it('does not select by clicking inside an unfilled outline', () => {
    // Hit testing is against the path, not its interior — an open shape has
    // no inside to click.
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 25 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 25 }));

    expect(store.getState().selection.features.size).toBe(0);
  });

  it('clears the selection when clicking empty space', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 0 }));
    expect(store.getState().selection.features.size).toBe(1);

    tool.onPointerDown?.(ctx, pointer({ x: 500, y: 500 }));
    tool.onPointerUp?.(ctx, pointer({ x: 500, y: 500 }));
    expect(store.getState().selection.features.size).toBe(0);
  });

  it('rubber-bands everything fully inside the band', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    drag(tool, ctx, { x: -10, y: -10 }, { x: 200, y: 200 });
    expect(store.getState().selection.features.size).toBe(1);
  });

  it('does not rubber-band a feature only partly inside', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    drag(tool, ctx, { x: -10, y: -10 }, { x: 50, y: 200 });
    expect(store.getState().selection.features.size).toBe(0);
  });

  it('moves the selection and records one undo step', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    drag(tool, ctx, { x: 50, y: 0 }, { x: 70, y: 30 });

    const shape = firstRect(store)!;
    expect(shape.origin.x).toBeCloseTo(20, 6);
    expect(shape.origin.y).toBeCloseTo(30, 6);

    store.undo();
    expect(firstRect(store)!.origin).toEqual({ x: 0, y: 0 });
  });

  it('treats a click that wobbles as a click, not a move', () => {
    // Without a drag threshold, a one-pixel wobble puts a spurious entry in
    // the undo history on every click.
    const { ctx, store } = withRect();
    const tool = createSelectTool();
    const undoBefore = store.getState().canUndo;

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 50.1, y: 0.1 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50.1, y: 0.1 }));

    expect(store.getState().canUndo).toBe(undoBefore);
    expect(firstRect(store)!.origin).toEqual({ x: 0, y: 0 });
  });

  it('shift-click toggles membership', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 0 }));
    expect(store.getState().selection.features.size).toBe(1);

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }, { shiftKey: true }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 0 }, { shiftKey: true }));
    expect(store.getState().selection.features.size).toBe(0);
  });

  it('Delete removes the selection', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onKey?.(ctx, { key: 'Delete', shiftKey: false, ctrlKey: false });

    // The feature goes; its part stays until it is removed on purpose (ADR 0009).
    expect(store.getState().document.project.parts[0]!.features).toHaveLength(0);
    store.undo();
    expect(store.getState().document.project.parts[0]!.features).toHaveLength(1);
  });

  it('Delete with nothing selected does nothing', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();
    tool.onKey?.(ctx, { key: 'Delete', shiftKey: false, ctrlKey: false });
    expect(store.getState().document.project.parts).toHaveLength(1);
  });

  it('Escape mid-move rolls the move back', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 0 }));

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 90, y: 40 }));
    tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });

    expect(firstRect(store)!.origin).toEqual({ x: 0, y: 0 });
    expect(store.inTransaction).toBe(false);
  });

  it('leaves no open transaction when swapped out mid-drag', () => {
    const { ctx, store } = withRect();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 90, y: 40 }));
    tool.onDeactivate?.(ctx);

    expect(store.inTransaction).toBe(false);
    expect(firstRect(store)!.origin).toEqual({ x: 0, y: 0 });
  });

  it('picks the topmost feature when two overlap', () => {
    const h = harness();
    drag(createRectangleTool(nextId), h.ctx, { x: 0, y: 0 }, { x: 100, y: 50 });
    drag(createRectangleTool(nextId), h.ctx, { x: 0, y: 0 }, { x: 100, y: 50 });
    h.store.clearSelection();

    const tool = createSelectTool();
    tool.onPointerDown?.(h.ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerUp?.(h.ctx, pointer({ x: 50, y: 0 }));

    const selected = [...h.store.getState().selection.features][0];
    const lastPart = h.store.getState().document.project.parts.at(-1)!;
    expect(selected).toBe(lastPart.features[0]!.id);
  });
});

describe('hit tolerance', () => {
  it('scales with zoom, so picking feels the same at any magnification', () => {
    const { ctx, store } = harness();
    drag(createRectangleTool(nextId), ctx, { x: 0, y: 0 }, { x: 100, y: 50 });
    store.clearSelection();

    const resolved = evaluate(store.getState().document.project);
    expect(resolved.parts).toHaveLength(1);

    // At 4 px/mm a 10 px radius is 2.5 mm, so a click 2 mm off still hits.
    ctx.viewport.scale = 4;
    const tool = createSelectTool();
    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 2 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 2 }));
    expect(store.getState().selection.features.size).toBe(1);

    // Zoomed to 40 px/mm the same radius is 0.25 mm, so it does not.
    store.clearSelection();
    ctx.viewport.scale = 40;
    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 2 }));
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 2 }));
    expect(store.getState().selection.features.size).toBe(0);
  });
});

describe('select tool and derived features', () => {
  /** A 100 × 60 panel with a stitch line 5 mm inside it. */
  function withChain(): { ctx: ToolContext; store: DocumentStore } {
    const { ctx, store } = harness();
    store.dispatch(
      addPart(shapePart('part-1', 'cut-1', 'Panel', rectShape({ x: 0, y: 0 }, 100, 60))),
    );
    store.dispatch(addStitchLine('part-1', 'stitch-1', 'cut-1', 5));
    return { ctx, store };
  }

  it('hands a delete to the app, so the app can ask about dependents', () => {
    const { ctx, store } = withChain();
    const asked: (readonly string[])[] = [];
    const withHandler: ToolContext = { ...ctx, requestDelete: (ids) => asked.push(ids) };
    store.select(['cut-1']);
    const before = store.getState().document;

    createSelectTool().onKey?.(withHandler, { key: 'Delete', shiftKey: false, ctrlKey: false });

    expect(asked).toEqual([['cut-1']]);
    expect(store.getState().document).toBe(before);
  });

  it('keeps the selection when a delete is refused for want of a decision', () => {
    const { ctx, store } = withChain();
    store.select(['cut-1']);

    createSelectTool().onKey?.(ctx, { key: 'Delete', shiftKey: false, ctrlKey: false });

    expect([...store.getState().selection.features]).toEqual(['cut-1']);
    expect(store.getState().document.project.parts[0]!.features).toHaveLength(2);
  });

  it('explains why a stitch line dragged on its own stays put', () => {
    const { ctx, store } = withChain();
    const tool = createSelectTool();

    // On the stitch line's bottom edge, 5 mm from the outline's.
    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 5 }));
    tool.onPointerMove?.(ctx, pointer({ x: 70, y: 5 }));

    expect(tool.notice?.(ctx)).toMatch(/follows Outline/);

    tool.onPointerUp?.(ctx, pointer({ x: 70, y: 5 }));
    expect(store.getState().document.project.parts[0]!.features[1]!.source.kind).toBe('derived');
    expect(tool.notice?.(ctx)).toBeNull();
  });

  it('says nothing when the stitch line moves with its outline', () => {
    const { ctx, store } = withChain();
    const tool = createSelectTool();
    store.select(['cut-1', 'stitch-1']);

    tool.onPointerDown?.(ctx, pointer({ x: 50, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 70, y: 0 }));

    expect(tool.notice?.(ctx)).toBeNull();
  });
});
