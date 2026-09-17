import {
  DocumentStore,
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
} from '@leathercad/document';
import type { ParametricShape } from '@leathercad/domain';
import type { Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createArcTool } from './arcTool.js';
import type { DrawMode } from './commitDrawn.js';

/**
 * An arc has two ends, so **Marking** is the mode it can actually be drawn in:
 * since §3.8 an open shape in Outline mode is refused rather than quietly
 * filed as a marking line. The mechanics below are the tool's, not the mode's.
 */
function harness(drawAs: DrawMode = 'marking'): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;

  return {
    store,
    ctx: {
      viewport,
      store,
      dispatch: (c) => store.dispatch(c),
      invalidate: () => {},
      drawAs: () => drawAs,
    },
  };
}

/** The feature the tool just made: the last one, not the first. */
function drawnFeature(store: DocumentStore) {
  const features = store.getState().document.project.parts.flatMap((part) => part.features);
  return features[features.length - 1];
}

/**
 * A part for a drawn feature to join.
 *
 * Every mode but *Outline* puts what it draws on the selected part, so these
 * tests need one to exist and be selected. *Outline* makes its own and never
 * reads the selection.
 */
function withPart(drawAs: DrawMode): { ctx: ToolContext; store: DocumentStore } {
  const made = harness(drawAs);
  if (drawAs !== 'outline') {
    const featureId = 'panel-cut';
    made.store.dispatch(
      addPart(
        rectanglePart(
          'panel' as never,
          featureId as never,
          'Panel',
          rectShape({ x: -50, y: -50 }, 200, 200),
        ),
      ),
    );
    made.store.select([featureId as never]);
  }
  return made;
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
  const source = drawnFeature(store)?.source;
  return source?.kind === 'shape' ? source.shape : null;
}

describe('arc tool', () => {
  it('bends through the third point, not towards it', () => {
    const { ctx, store } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
    const tool = createArcTool(() => `id-${Math.random()}`);

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    ]);

    const features = store.getState().document.project.parts.flatMap((part) => part.features);
    expect(features[features.length - 1]?.kind).toBe('marking-line');
  });

  it('creates nothing from three points in a line', () => {
    const { ctx, store } = withPart('marking');
    const tool = createArcTool(() => 'id');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
    ]);

    // Nothing added to the part the arc would have joined: it still holds only
    // its own outline.
    expect(store.getState().document.project.parts.flatMap((part) => part.features)).toHaveLength(
      1,
    );
  });

  it('creates nothing when the bulge lands on an end', () => {
    const { ctx, store } = withPart('marking');
    const tool = createArcTool(() => 'id');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
    ]);

    // Nothing added to the part the arc would have joined: it still holds only
    // its own outline.
    expect(store.getState().document.project.parts.flatMap((part) => part.features)).toHaveLength(
      1,
    );
  });

  it('abandons on Escape', () => {
    const { ctx, store } = withPart('marking');
    const tool = createArcTool(() => 'id');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });
    place(tool, ctx, [{ x: 5, y: 5 }]);

    // Nothing added to the part the arc would have joined: it still holds only
    // its own outline.
    expect(store.getState().document.project.parts.flatMap((part) => part.features)).toHaveLength(
      1,
    );
  });

  it('drops the last point on Backspace, so the next click replaces it', () => {
    const { ctx, store } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
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
      const { ctx } = withPart('marking');
      const tool = createArcTool(() => 'id');

      tool.onPointerMove?.(ctx, pointer({ x: 4, y: 4 }));
      tool.onPointerDown?.(ctx, pointer({ x: 4, y: 4 }));

      expect(() => tool.buildOverlay?.(ctx)).not.toThrow();
      expect(tool.buildOverlay?.(ctx).items).toHaveLength(0);
    });

    it('survives a second point placed on top of the first', () => {
      const { ctx } = withPart('marking');
      const tool = createArcTool(() => 'id');

      place(tool, ctx, [
        { x: 4, y: 4 },
        { x: 4, y: 4 },
      ]);

      expect(() => tool.buildOverlay?.(ctx)).not.toThrow();
    });

    it('survives three collinear points, which describe no arc', () => {
      const { ctx } = withPart('marking');
      const tool = createArcTool(() => 'id');

      place(tool, ctx, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]);
      tool.onPointerMove?.(ctx, pointer({ x: 5, y: 0 }));

      expect(() => tool.buildOverlay?.(ctx)).not.toThrow();
    });

    it('rubber-bands to the cursor once a start point exists', () => {
      const { ctx } = withPart('marking');
      const tool = createArcTool(() => 'id');

      place(tool, ctx, [{ x: 0, y: 0 }]);
      tool.onPointerMove?.(ctx, pointer({ x: 10, y: 0 }));

      expect(tool.buildOverlay?.(ctx).items.length).toBeGreaterThan(0);
    });

    it('shows the arc and its radius once both ends are down', () => {
      const { ctx } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
    const tool = createArcTool(() => 'the-arc');

    place(tool, ctx, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    ]);

    expect([...store.getState().selection.features]).toEqual(['the-arc']);
  });
});

describe('an arc in a mode that has to enclose something', () => {
  // An arc has two ends. In Outline or Cut-out mode it is refused (S6) — and
  // the refusal has to be audible: before the commit boundary held it, three
  // clicks in Outline mode drew nothing and said nothing.
  const arc: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 5 },
  ];

  for (const [mode, role] of [
    ['outline', 'outer'],
    ['cut-out', 'inner'],
  ] as const) {
    it(`refuses it in ${mode} mode, with a reason the status bar can read`, () => {
      const { ctx, store } = withPart(mode);
      const tool = createArcTool(() => 'id');
      const before = store.getState().document;

      place(tool, ctx, arc);

      expect(store.getState().document).toBe(before);
      expect(tool.notice?.(ctx)).toMatchObject({
        code: 'CONTOUR_NOT_CLOSED',
        // Not closable: an arc has two ends and always will, so the message
        // must not tell its author to close it.
        facts: { role, closable: false },
      });
    });

    it(`lets the reason go in ${mode} mode once the next arc is started`, () => {
      const { ctx } = withPart(mode);
      const tool = createArcTool(() => 'id');

      place(tool, ctx, arc);
      expect(tool.notice?.(ctx)).not.toBeNull();

      // The first click of a new arc is the user answering it.
      place(tool, ctx, [{ x: 40, y: 40 }]);

      expect(tool.notice?.(ctx)).toBeNull();
    });
  }

  it('still files an arc in Marking mode, unchanged', () => {
    const { ctx, store } = withPart('marking');
    const tool = createArcTool(() => 'id');

    place(tool, ctx, arc);

    expect(drawnFeature(store)?.kind).toBe('marking-line');
    expect(tool.notice?.(ctx)).toBeNull();
  });
});
