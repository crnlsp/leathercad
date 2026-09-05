import { DocumentStore, emptyDocument } from '@leathercad/document';
import type { ParametricShape } from '@leathercad/domain';
import type { Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createArcTool } from './arcTool.js';

function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
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

/** Start, end, then the bulge — the order the user clicks. */
function place(
  tool: ReturnType<typeof createArcTool>,
  ctx: ToolContext,
  points: Vec2[],
  shiftKey = false,
): void {
  for (const point of points) {
    tool.onPointerMove?.(ctx, pointer(point, shiftKey));
    tool.onPointerDown?.(ctx, pointer(point, shiftKey));
  }
}

function shapeIn(store: DocumentStore): ParametricShape | null {
  const source = store.getState().document.project.parts[0]?.features[0]?.source;
  return source?.kind === 'shape' ? source.shape : null;
}

describe('arc tool', () => {
  it('bends through the third point, not towards it', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => `id-${Math.random()}`);

    // (0,0) and (10,0) with the bulge at (5,5): the circle through those three
    // has its centre at (5,0) and a radius of 5.
    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    ]);

    const shape = shapeIn(store);
    expect(shape?.type).toBe('arc');
    if (shape?.type !== 'arc') return;
    expect(shape.centre.x).toBeCloseTo(5, 9);
    expect(shape.centre.y).toBeCloseTo(0, 9);
    expect(shape.radius).toBeCloseTo(5, 9);
    expect(Math.abs(shape.sweepAngle)).toBeCloseTo(Math.PI, 9);
  });

  it('files the arc as a marking line, because it has two ends', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => `id-${Math.random()}`);

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    ]);

    const part = store.getState().document.project.parts[0];
    expect(part?.name).toBe('Line');
    expect(part?.features[0]?.kind).toBe('marking-line');
  });

  it('creates nothing from three points in a line', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => 'id');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
    ]);

    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('creates nothing when the bulge lands on an end', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => 'id');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
    ]);

    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('abandons on Escape', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => 'id');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });
    place(tool, ctx, [{ x: 5, y: 5 }]);

    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('drops the last point on Backspace, so the next click replaces it', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => 'id');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 99, y: 99 },
    ]);
    tool.onKey?.(ctx, { key: 'Backspace', shiftKey: false, ctrlKey: false });

    // Two clicks after the undo: the discarded (99,99) would otherwise have
    // been the end point, and the arc would be a different one.
    place(tool, ctx, [
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    ]);

    const shape = shapeIn(store);
    expect(shape?.type).toBe('arc');
    if (shape?.type !== 'arc') return;
    expect(shape.centre.x).toBeCloseTo(5, 9);
    expect(shape.radius).toBeCloseTo(5, 9);
  });

  it('constrains a point to 15° with Shift, as the polyline does', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => 'id');

    // (10, 1) is 5.7° off the axis, so Shift pulls it onto 0° — the end of the
    // arc lands on y = 0 rather than y = 1.
    tool.onPointerMove?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 10, y: 1 }, true));
    tool.onPointerDown?.(ctx, pointer({ x: 10, y: 1 }, true));
    tool.onPointerMove?.(ctx, pointer({ x: 5, y: 5 }));
    tool.onPointerDown?.(ctx, pointer({ x: 5, y: 5 }));

    const shape = shapeIn(store);
    expect(shape?.type).toBe('arc');
    if (shape?.type !== 'arc') return;

    const endAngle = shape.startAngle + shape.sweepAngle;
    const endY = shape.centre.y + shape.radius * Math.sin(endAngle);
    expect(endY).toBeCloseTo(0, 9);
  });

  describe('the preview', () => {
    // buildOverlay runs inside the draw loop, so anything it throws stops the
    // canvas painting entirely — grid, rulers and all. It has to survive every
    // intermediate state, including the moment a point is placed and the
    // cursor is still exactly on it.
    it('survives the cursor resting on the point just placed', () => {
      const { ctx } = harness();
      const tool = createArcTool(() => 'id');

      tool.onPointerMove?.(ctx, pointer({ x: 4, y: 4 }));
      tool.onPointerDown?.(ctx, pointer({ x: 4, y: 4 }));

      expect(() => tool.buildOverlay?.(ctx)).not.toThrow();
      expect(tool.buildOverlay?.(ctx).items).toHaveLength(0);
    });

    it('survives a second point placed on top of the first', () => {
      const { ctx } = harness();
      const tool = createArcTool(() => 'id');

      place(tool, ctx, [
        { x: 4, y: 4 },
        { x: 4, y: 4 },
      ]);

      expect(() => tool.buildOverlay?.(ctx)).not.toThrow();
    });

    it('survives three collinear points, which describe no arc', () => {
      const { ctx } = harness();
      const tool = createArcTool(() => 'id');

      place(tool, ctx, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]);
      tool.onPointerMove?.(ctx, pointer({ x: 5, y: 0 }));

      expect(() => tool.buildOverlay?.(ctx)).not.toThrow();
    });

    it('rubber-bands to the cursor once a start point exists', () => {
      const { ctx } = harness();
      const tool = createArcTool(() => 'id');

      place(tool, ctx, [{ x: 0, y: 0 }]);
      tool.onPointerMove?.(ctx, pointer({ x: 10, y: 0 }));

      expect(tool.buildOverlay?.(ctx).items.length).toBeGreaterThan(0);
    });

    it('shows the arc and its radius once both ends are down', () => {
      const { ctx } = harness();
      const tool = createArcTool(() => 'id');

      place(tool, ctx, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]);
      tool.onPointerMove?.(ctx, pointer({ x: 5, y: 5 }));

      // The dashed arc, plus the radius and included angle.
      expect(tool.buildOverlay?.(ctx).items).toHaveLength(2);
    });
  });

  it('selects what it just drew', () => {
    const { ctx, store } = harness();
    const tool = createArcTool(() => 'the-arc');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    ]);

    expect([...store.getState().selection.features]).toEqual(['the-arc']);
  });
});
