import {
  DocumentStore,
  addMeasurement,
  addPart,
  emptyDocument,
  pathPart,
  rectShape,
  shapePart,
} from '@leathercad/document';
import { findFeature, type FeatureId } from '@leathercad/domain';
import { PathOps, polyline, vec, type Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createEditPointsTool } from './editPointsTool.js';

const OUTLINE = 'outline' as FeatureId;

/**
 * A drawn 100 × 50 outline, selected, at 4 px/mm — a pick radius of 2.5 mm.
 * Its points: 0 (0, 0), 1 (100, 0), 2 (100, 50), 3 (0, 50).
 */
function harness(select = true): { ctx: ToolContext; store: DocumentStore; tool: Tool } {
  const store = new DocumentStore(emptyDocument('proj'));
  store.dispatch(
    addPart(
      pathPart(
        'part' as FeatureId,
        OUTLINE,
        'Panel',
        polyline([vec(0, 0), vec(100, 0), vec(100, 50), vec(0, 50)], true),
      ),
    ),
  );
  if (select) store.select([OUTLINE]);

  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;

  return {
    store,
    tool: createEditPointsTool(),
    ctx: { viewport, store, dispatch: (c) => store.dispatch(c), invalidate: () => {} },
  };
}

function pointer(at: Vec2): PointerInput {
  return { at, atPx: { x: 0, y: 0 }, button: 0, shiftKey: false, altKey: false, ctrlKey: false };
}

function drag(tool: Tool, ctx: ToolContext, from: Vec2, to: Vec2): void {
  tool.onPointerDown?.(ctx, pointer(from));
  tool.onPointerMove?.(ctx, pointer(to));
  tool.onPointerUp?.(ctx, pointer(to));
}

function click(tool: Tool, ctx: ToolContext, at: Vec2): void {
  tool.onPointerDown?.(ctx, pointer(at));
  tool.onPointerUp?.(ctx, pointer(at));
}

function points(store: DocumentStore, id: FeatureId = OUTLINE): Vec2[] {
  const source = findFeature(store.getState().document.project, id)!.feature.source;
  if (source.kind !== 'path') throw new Error('not drawn');
  return PathOps.vertices(source.path);
}

const key = (k: string) => ({ key: k, shiftKey: false, ctrlKey: false });

function kinds(store: DocumentStore): string[] {
  const source = findFeature(store.getState().document.project, OUTLINE)!.feature.source;
  if (source.kind !== 'path') throw new Error('not drawn');
  return source.path.segments.map((s) => s.kind);
}

describe('rounding and sharpening with R (3.9d)', () => {
  it('rounds the picked corner to the radius in the work bar, and sharpens it again', () => {
    const { ctx, store } = harness();
    const tool = createEditPointsTool(() => ({ cornerRadiusMm: 10 }));

    click(tool, ctx, vec(100, 50));
    expect(tool.onKey?.(ctx, key('r'))).toBe(true);
    expect(kinds(store)).toEqual(['line', 'line', 'arc', 'line', 'line']);
    expect(points(store)[2]).toEqual(vec(100, 40));

    // The rounding stays picked: R again puts the corner back.
    expect(tool.onKey?.(ctx, key('R'))).toBe(true);
    expect(kinds(store)).toEqual(['line', 'line', 'line', 'line']);
    expect(points(store)[2]!.x).toBeCloseTo(100, 9);
    expect(points(store)[2]!.y).toBeCloseTo(50, 9);

    // Each is one step to undo.
    store.undo();
    expect(kinds(store)).toContain('arc');
  });

  it('sharpens a rounding picked by either of its ends', () => {
    const { ctx, store } = harness();
    const tool = createEditPointsTool(() => ({ cornerRadiusMm: 10 }));
    click(tool, ctx, vec(100, 50));
    tool.onKey?.(ctx, key('r'));

    // The rounding runs from (100, 40) to (90, 50); pick its far end.
    click(tool, ctx, vec(90, 50));
    expect(tool.onKey?.(ctx, key('r'))).toBe(true);
    expect(kinds(store)).not.toContain('arc');
  });

  it('says why a rounding does not fit, and changes nothing', () => {
    const { ctx, store } = harness();
    const tool = createEditPointsTool(() => ({ cornerRadiusMm: 80 }));
    const before = store.getState().document;

    click(tool, ctx, vec(100, 50));
    expect(tool.onKey?.(ctx, key('r'))).toBe(true);

    expect(store.getState().document).toBe(before);
    expect(tool.notice?.(ctx)?.code).toBe('ROUNDING_DOES_NOT_FIT');
  });

  it('leaves R to pick the Rectangle tool when no corner is picked', () => {
    const { ctx } = harness();
    const tool = createEditPointsTool(() => ({ cornerRadiusMm: 10 }));

    expect(tool.onKey?.(ctx, key('r'))).not.toBe(true);

    // A point along a straight side is no corner either.
    click(tool, ctx, vec(50, 0));
    click(tool, ctx, vec(50, 0));
    expect(tool.onKey?.(ctx, key('r'))).not.toBe(true);
  });
});

describe('the Edit Points tool', () => {
  it('shows a handle on every point of the selected drawn path', () => {
    const { tool, ctx } = harness();

    // One handle per point; nothing else is drawn while idle.
    expect(tool.buildOverlay?.(ctx).items).toHaveLength(4);
  });

  it('draws its handles the same size on a 2× display, at the same zoom', () => {
    // 8 CSS pixels across, which is 2 mm at 4 CSS px/mm. They were 8 device
    // pixels: half the size on a Retina display, under a stroke that U.1 made
    // twice as thick (U.1).
    const one = harness();
    const two = harness();
    two.ctx.viewport.resize(1600, 1200, 2);
    two.ctx.viewport.scale = 8;
    const box = (h: ReturnType<typeof harness>) => {
      const [first] = h.tool.buildOverlay?.(h.ctx).items ?? [];
      return first?.kind === 'path' ? PathOps.bbox(first.path) : null;
    };
    expect(box(two)).toEqual(box(one));
    expect(box(one)!.maxX - box(one)!.minX).toBeCloseTo(2, 9);
  });

  it('moves a point by dragging its handle, as one step to undo', () => {
    const { tool, ctx, store } = harness();

    // Pressed 1 mm off the corner: within the pick radius.
    drag(tool, ctx, vec(101, 1), vec(120, 10));

    expect(points(store)[1]).toEqual(vec(120, 10));
    store.undo();
    expect(points(store)[1]).toEqual(vec(100, 0));
  });

  it('adds a point where an edge is pressed, and drags it in the same gesture', () => {
    const { tool, ctx, store } = harness();

    drag(tool, ctx, vec(40, 0.5), vec(40, -10));

    expect(points(store)).toEqual([vec(0, 0), vec(40, -10), vec(100, 0), vec(100, 50), vec(0, 50)]);
    store.undo();
    expect(points(store)).toHaveLength(4);
  });

  it('adds a point without moving it on a click', () => {
    const { tool, ctx, store } = harness();

    click(tool, ctx, vec(100, 20));

    expect(points(store)).toHaveLength(5);
    expect(points(store)[2]!.x).toBeCloseTo(100, 9);
    expect(points(store)[2]!.y).toBeCloseTo(20, 9);
  });

  it('removes the point last picked when Delete is pressed, and claims the key', () => {
    const { tool, ctx, store } = harness();

    click(tool, ctx, vec(100, 50));
    expect(tool.onKey?.(ctx, key('Delete'))).toBe(true);

    expect(points(store)).toEqual([vec(0, 0), vec(100, 0), vec(0, 50)]);
  });

  it('leaves Delete to the app when no point is picked', () => {
    const { tool, ctx } = harness();

    expect(tool.onKey?.(ctx, key('Delete'))).not.toBe(true);
  });

  it('says why a point cannot go, and changes nothing', () => {
    const { tool, ctx, store } = harness();
    store.dispatch(
      addMeasurement(
        'dim' as FeatureId,
        'aligned',
        { kind: 'anchor', featureId: OUTLINE, anchor: 0 },
        { kind: 'anchor', featureId: OUTLINE, anchor: 2 },
      ),
    );
    store.select([OUTLINE]);
    const before = store.getState().document;

    // The top-left point is corner 2, the dimension's far end.
    click(tool, ctx, vec(0, 50));
    tool.onKey?.(ctx, key('Delete'));

    expect(store.getState().document).toBe(before);
    expect(tool.notice?.(ctx)?.code).toBe('CORNER_IN_USE');
  });

  it('cancels a drag with Escape', () => {
    const { tool, ctx, store } = harness();
    const before = store.getState().document;

    tool.onPointerDown?.(ctx, pointer(vec(100, 0)));
    tool.onPointerMove?.(ctx, pointer(vec(130, 0)));
    tool.onKey?.(ctx, key('Escape'));

    expect(store.getState().document).toBe(before);
  });

  it('does not let the dragged path snap to itself', () => {
    const { tool, ctx } = harness();

    tool.onPointerDown?.(ctx, pointer(vec(100, 0)));
    expect(tool.snapExclusions?.(ctx)).toEqual([OUTLINE]);
    tool.onPointerUp?.(ctx, pointer(vec(100, 0)));
    expect(tool.snapExclusions?.(ctx) ?? []).toEqual([]);
  });

  it('picks a drawn path to edit when nothing is selected', () => {
    const { tool, ctx, store } = harness(false);

    click(tool, ctx, vec(50, 0));

    expect([...store.getState().selection.features]).toEqual([OUTLINE]);
    // Picking is not editing: no point was added by that click.
    expect(points(store)).toHaveLength(4);
  });

  it('explains that a rectangle has no points to edit, and draws no handles', () => {
    const { tool, ctx, store } = harness(false);
    store.dispatch(
      addPart(
        shapePart('card' as FeatureId, 'rect' as FeatureId, 'Card', rectShape(vec(200, 0), 20, 20)),
      ),
    );
    store.select(['rect' as FeatureId]);

    expect(tool.notice?.(ctx)?.code).toBe('NOT_A_DRAWN_PATH');
    expect(tool.buildOverlay?.(ctx).items ?? []).toEqual([]);
  });

  it('edits nothing it was not asked to: a press far from the path changes nothing', () => {
    const { tool, ctx, store } = harness();
    const before = store.getState().document;

    drag(tool, ctx, vec(50, 25), vec(60, 30));

    expect(store.getState().document).toBe(before);
  });
});
