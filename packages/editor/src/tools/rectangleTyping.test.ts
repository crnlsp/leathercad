import { DocumentStore, emptyDocument } from '@leathercad/document';
import fc from 'fast-check';
import type { Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createRectangleTool } from './rectangleTool.js';
import { keyInput } from './keys.fixture.js';

/** U.16, R-13: sizes typed while the rectangle is being drawn. */

function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;
  return {
    store,
    ctx: { viewport, store, dispatch: (command) => store.dispatch(command), invalidate: () => {} },
  };
}

function pointer(at: Vec2, shiftKey = false): PointerInput {
  return { at, atPx: { x: 0, y: 0 }, button: 0, shiftKey, altKey: false, ctrlKey: false };
}

function click(tool: Tool, ctx: ToolContext, at: Vec2): void {
  tool.onPointerDown?.(ctx, pointer(at));
  tool.onPointerUp?.(ctx, pointer(at));
}

function firstRect(store: DocumentStore) {
  const source = store.getState().document.project.parts[0]?.features[0]?.source;
  return source?.kind === 'shape' && source.shape.type === 'rect' ? source.shape : null;
}

let counter = 0;
const nextId = (): string => `typed-${counter++}`;
const key = (name: string) => keyInput(name);

describe('rectangle tool, typed sizes', () => {
  it('has nothing to size until a corner is placed, or typing starts at the pointer', () => {
    const { ctx } = harness();
    const tool = createRectangleTool(nextId);
    expect(tool.sizing?.()).toBeNull();

    click(tool, ctx, { x: 10, y: 20 });
    tool.onPointerMove?.(ctx, pointer({ x: 60, y: 50 }));
    expect(tool.sizing?.()).toEqual({
      origin: { x: 10, y: 20 },
      width: 50,
      height: 30,
      corner: 0,
      refusals: 0,
    });
  });

  it('starts in the middle of the board when no pointer has been on it, so the keys alone can draw (U.19)', () => {
    // Tab to the board, R, 105 Tab 75 Enter: a maker without a mouse on the
    // board still gets the rectangle, where they can see it.
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 20, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (scale, panX, panY) => {
          const { ctx } = harness();
          ctx.viewport.scale = scale;
          ctx.viewport.panByPx(panX, panY);
          const tool = createRectangleTool(nextId);
          expect(tool.beginSizing?.(ctx)).toBe(true);
          const bounds = ctx.viewport.visibleBounds();
          const origin = tool.sizing?.()?.origin;
          expect(origin?.x).toBeCloseTo((bounds.minX + bounds.maxX) / 2, 6);
          expect(origin?.y).toBeCloseTo((bounds.minY + bounds.maxY) / 2, 6);
        },
      ),
    );
  });

  it('105 × 75 with 8 mm corners, typed after the first click, is one outline and one undo step', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 10, y: 20 });
    tool.onPointerMove?.(ctx, pointer({ x: 60, y: 50 }));

    tool.setSize?.(ctx, 'width', 105);
    tool.setSize?.(ctx, 'height', 75);
    tool.setSize?.(ctx, 'corner', 8);
    expect(tool.sizing?.()).toEqual({
      origin: { x: 10, y: 20 },
      width: 105,
      height: 75,
      corner: 8,
      refusals: 0,
    });
    expect(store.getState().document.project.parts).toHaveLength(0);
    tool.finishSizing?.(ctx);

    const shape = firstRect(store)!;
    expect(shape.origin).toEqual({ x: 10, y: 20 });
    expect([shape.width, shape.height]).toEqual([105, 75]);
    expect(shape.radii).toEqual({ topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 });
    store.undo();
    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(tool.sizing?.()).toBeNull();
  });

  it('grows towards the pointer, on either side of the corner', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 100, y: 80 });
    tool.onPointerMove?.(ctx, pointer({ x: 90, y: 90 }));
    tool.setSize?.(ctx, 'width', 40);
    tool.setSize?.(ctx, 'height', 30);
    // x runs left of the corner, y runs up.
    expect(tool.sizing?.()).toMatchObject({ origin: { x: 60, y: 80 }, width: 40, height: 30 });
    tool.onPointerMove?.(ctx, pointer({ x: 120, y: 50 }));
    expect(tool.sizing?.()).toMatchObject({ origin: { x: 100, y: 50 }, width: 40, height: 30 });
    tool.finishSizing?.(ctx);
    expect(firstRect(store)!.origin).toEqual({ x: 100, y: 50 });
  });

  it('keeps a size that was typed while the pointer wanders, and a click makes what is typed', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    tool.setSize?.(ctx, 'width', 50);
    tool.onPointerMove?.(ctx, pointer({ x: 300, y: 200 }));
    expect(tool.sizing?.()).toMatchObject({ width: 50 });
    click(tool, ctx, { x: 300, y: 200 });
    expect(firstRect(store)).toMatchObject({ width: 50 });
  });

  it('typing before any click starts the rectangle at the pointer', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    tool.onPointerMove?.(ctx, pointer({ x: 33, y: 44 }));
    expect(tool.beginSizing?.(ctx)).toBe(true);
    tool.setSize?.(ctx, 'width', 20);
    tool.setSize?.(ctx, 'height', 10);
    tool.finishSizing?.(ctx);
    expect(firstRect(store)).toMatchObject({ origin: { x: 33, y: 44 }, width: 20, height: 10 });
  });

  it('Enter makes the rectangle as shown, and is claimed so it opens no other outline', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    expect(tool.onKey?.(ctx, key('Enter'))).toBeFalsy();
    click(tool, ctx, { x: 10, y: 20 });
    tool.onPointerMove?.(ctx, pointer({ x: 60, y: 50 }));
    expect(tool.onKey?.(ctx, key('Enter'))).toBe(true);
    expect(firstRect(store)).toMatchObject({ width: 50, height: 30 });
  });

  it('Escape drops what was typed and writes nothing', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 10, y: 20 });
    tool.setSize?.(ctx, 'width', 99);
    expect(tool.onKey?.(ctx, key('Escape'))).toBe(true);
    expect(tool.sizing?.()).toBeNull();
    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('makes nothing while a side is still nothing, and stays open for it to be typed', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 10, y: 20 });
    tool.setSize?.(ctx, 'width', 40);
    tool.finishSizing?.(ctx);
    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(tool.sizing?.()).toMatchObject({ width: 40, height: 0 });
    tool.setSize?.(ctx, 'height', 20);
    tool.finishSizing?.(ctx);
    expect(firstRect(store)).toMatchObject({ width: 40, height: 20 });
  });

  it('refuses to make a typed corner the pointer has since left no room for, and stays open', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    tool.onPointerMove?.(ctx, pointer({ x: 60, y: 40 }));
    tool.setSize?.(ctx, 'corner', 15);
    tool.onPointerMove?.(ctx, pointer({ x: 60, y: 20 }));

    // Enter: nothing is made, the typed corner is kept, and the app is told.
    expect(tool.onKey?.(ctx, key('Enter'))).toBe(true);
    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(tool.sizing?.()).toMatchObject({ width: 60, height: 20, corner: 15, refusals: 1 });

    // `finishSizing`, the chips' Enter, is refused the same way.
    tool.finishSizing?.(ctx);
    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(tool.sizing?.()).toMatchObject({ corner: 15, refusals: 2 });

    // A click on the board is too: it never takes a smaller corner either.
    click(tool, ctx, { x: 60, y: 20 });
    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(tool.sizing?.()).toMatchObject({ width: 60, height: 20, corner: 15, refusals: 3 });

    // The smaller corner, typed — as the chip's second Enter does — is made, one undo step.
    tool.setSize?.(ctx, 'corner', 10);
    tool.finishSizing?.(ctx);
    expect(firstRect(store)!.radii).toEqual({
      topLeft: 10,
      topRight: 10,
      bottomRight: 10,
      bottomLeft: 10,
    });
    expect(tool.sizing?.()).toBeNull();
    store.undo();
    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('makes the typed corner once the pointer gives it room again', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    tool.setSize?.(ctx, 'corner', 15);
    tool.onPointerMove?.(ctx, pointer({ x: 60, y: 20 }));
    tool.finishSizing?.(ctx);
    expect(store.getState().document.project.parts).toHaveLength(0);
    tool.onPointerMove?.(ctx, pointer({ x: 60, y: 30 }));
    tool.finishSizing?.(ctx);
    expect(firstRect(store)!.radii.topLeft).toBe(15);
  });

  it('Shift still squares a drag, and a drag still ends in a rectangle', () => {
    const { ctx, store } = harness();
    const tool = createRectangleTool(nextId);
    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }, true));
    tool.onPointerMove?.(ctx, pointer({ x: 100, y: 30 }, true));
    tool.onPointerUp?.(ctx, pointer({ x: 100, y: 30 }, true));
    expect(firstRect(store)).toMatchObject({ width: 100, height: 100 });
  });

  it('draws the typed corner in the preview', () => {
    const { ctx } = harness();
    const tool = createRectangleTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    tool.onPointerMove?.(ctx, pointer({ x: 40, y: 30 }));
    const before = JSON.stringify(tool.buildOverlay?.(ctx));
    tool.setSize?.(ctx, 'corner', 5);
    expect(JSON.stringify(tool.buildOverlay?.(ctx))).not.toBe(before);
  });
});
