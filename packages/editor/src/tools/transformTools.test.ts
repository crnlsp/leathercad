import { DocumentStore, addPart, emptyDocument, rectShape, shapePart } from '@leathercad/document';
import type { Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createRotateTool } from './rotateTool.js';
import { createScaleTool } from './scaleTool.js';

/** A 100 x 50 panel with its centre at (50, 25). */
function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  store.dispatch(
    addPart(shapePart('part-1', 'feat-1', 'Panel', rectShape({ x: 0, y: 0 }, 100, 50))),
  );
  store.select(['feat-1']);

  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;

  return {
    store,
    ctx: { viewport, store, dispatch: (c) => store.dispatch(c), invalidate: () => {} },
  };
}

function pointer(at: Vec2, shiftKey = false): PointerInput {
  return { at, atPx: { x: 0, y: 0 }, button: 0, shiftKey, altKey: false, ctrlKey: false };
}

function drag(tool: Tool, ctx: ToolContext, from: Vec2, to: Vec2, shiftKey = false): void {
  tool.onPointerDown?.(ctx, pointer(from, shiftKey));
  tool.onPointerMove?.(ctx, pointer(to, shiftKey));
  tool.onPointerUp?.(ctx, pointer(to, shiftKey));
}

function rectIn(store: DocumentStore): {
  rotation: number;
  width: number;
  height: number;
  origin: Vec2;
} {
  const source = store.getState().document.project.parts[0]?.features[0]?.source;
  if (source?.kind !== 'shape' || source.shape.type !== 'rect') throw new Error('no rect');
  return source.shape;
}

describe('rotate tool', () => {
  it('turns the selection about its centre by the angle dragged', () => {
    const { ctx, store } = harness();
    const tool = createRotateTool();

    // Centre is (50, 25). Press due east of it, release due north: a quarter
    // turn counter-clockwise, because Y is up.
    drag(tool, ctx, { x: 150, y: 25 }, { x: 50, y: 125 });

    expect(rectIn(store).rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  it('resizes nothing', () => {
    const { ctx, store } = harness();
    const tool = createRotateTool();

    drag(tool, ctx, { x: 150, y: 25 }, { x: 50, y: 125 });

    const rect = rectIn(store);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(50);
  });

  it('snaps to 15° with Shift, as every other tool does', () => {
    const { ctx, store } = harness();
    const tool = createRotateTool();

    // 20° of drag lands on 15°, not 20°.
    const start = { x: 150, y: 25 };
    const angle = (20 * Math.PI) / 180;
    const end = {
      x: 50 + Math.cos(angle) * 100,
      y: 25 + Math.sin(angle) * 100,
    };
    drag(tool, ctx, start, end, true);

    expect(rectIn(store).rotation).toBeCloseTo(Math.PI / 12, 6);
  });

  it('leaves the document alone when nothing is selected', () => {
    const { ctx, store } = harness();
    store.clearSelection();
    const tool = createRotateTool();

    drag(tool, ctx, { x: 150, y: 25 }, { x: 50, y: 125 });

    expect(rectIn(store).rotation).toBe(0);
  });

  it('rolls back on Escape mid-drag', () => {
    const { ctx, store } = harness();
    const tool = createRotateTool();

    tool.onPointerDown?.(ctx, pointer({ x: 150, y: 25 }));
    tool.onPointerMove?.(ctx, pointer({ x: 50, y: 125 }));
    tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });

    expect(rectIn(store).rotation).toBe(0);
  });

  it('undoes as one step', () => {
    const { ctx, store } = harness();
    const tool = createRotateTool();

    drag(tool, ctx, { x: 150, y: 25 }, { x: 50, y: 125 });
    store.undo();

    expect(rectIn(store).rotation).toBe(0);
  });
});

describe('scale tool', () => {
  it('stretches one axis when dragged along it', () => {
    const { ctx, store } = harness();
    const tool = createScaleTool();

    // Centre (50, 25); press 50 to its right, drag to 100 to its right.
    drag(tool, ctx, { x: 100, y: 25 }, { x: 150, y: 25 });

    const rect = rectIn(store);
    expect(rect.width).toBeCloseTo(200, 6);
    expect(rect.height).toBeCloseTo(50, 6);
    // About the centre, not the origin: doubling a 100-wide panel centred on
    // x = 50 pushes its left edge to -50. A wrong compose order would leave the
    // origin at 0 and still produce the right width.
    expect(rect.origin.x).toBeCloseTo(-50, 6);
    expect(rect.origin.y).toBeCloseTo(0, 6);
  });

  it('holds the aspect ratio with Shift', () => {
    const { ctx, store } = harness();
    const tool = createScaleTool();

    drag(tool, ctx, { x: 100, y: 25 }, { x: 150, y: 25 }, true);

    const rect = rectIn(store);
    expect(rect.width).toBeCloseTo(200, 6);
    expect(rect.height).toBeCloseTo(100, 6);
  });

  it('refuses to squash a circle, and says why', () => {
    const { ctx, store } = harness();
    store.dispatch(
      addPart(
        shapePart('part-2', 'feat-2', 'Hole', {
          type: 'circle',
          centre: { x: 0, y: 0 },
          radius: 10,
        }),
      ),
    );
    store.select(['feat-2']);
    const tool = createScaleTool();

    drag(tool, ctx, { x: 10, y: 0 }, { x: 30, y: 0 });

    const source = store.getState().document.project.parts[1]?.features[0]?.source;
    expect(source?.kind === 'shape' && source.shape).toEqual({
      type: 'circle',
      centre: { x: 0, y: 0 },
      radius: 10,
    });
  });

  it('scales a circle evenly when Shift holds the aspect', () => {
    const { ctx, store } = harness();
    store.dispatch(
      addPart(
        shapePart('part-2', 'feat-2', 'Hole', {
          type: 'circle',
          centre: { x: 0, y: 0 },
          radius: 10,
        }),
      ),
    );
    store.select(['feat-2']);
    const tool = createScaleTool();

    drag(tool, ctx, { x: 10, y: 0 }, { x: 20, y: 0 }, true);

    const source = store.getState().document.project.parts[1]?.features[0]?.source;
    expect(
      source?.kind === 'shape' && source.shape.type === 'circle' && source.shape.radius,
    ).toBeCloseTo(20, 6);
  });

  it('rolls back on Escape mid-drag', () => {
    const { ctx, store } = harness();
    const tool = createScaleTool();

    tool.onPointerDown?.(ctx, pointer({ x: 100, y: 25 }));
    tool.onPointerMove?.(ctx, pointer({ x: 150, y: 25 }));
    tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });

    expect(rectIn(store).width).toBe(100);
  });

  it('ignores a drag that would collapse the shape', () => {
    const { ctx, store } = harness();
    const tool = createScaleTool();

    // Releasing exactly on the centre is a zero scale.
    drag(tool, ctx, { x: 100, y: 25 }, { x: 50, y: 25 });

    expect(rectIn(store).width).toBe(100);
  });
});
