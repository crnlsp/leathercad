import {
  addPart,
  DocumentStore,
  emptyDocument,
  rectanglePart,
  rectShape,
} from '@leathercad/document';
import type { FeatureId } from '@leathercad/domain';
import { vec, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ToolManager, type PointerInput, type Tool, type ToolContext } from './tool.js';
import { Viewport } from './viewport.js';

/**
 * A tool that records the millimetre positions it was handed.
 *
 * The point of these tests is what the *tool* receives: snapping happens in the
 * router, so a tool never asks for it and cannot forget to apply it.
 */
function recorder(overrides: Partial<Tool> = {}): Tool & { points: Vec2[] } {
  const points: Vec2[] = [];
  return {
    id: 'recorder',
    label: 'Recorder',
    cursor: 'crosshair',
    points,
    onPointerDown: (_ctx, event) => points.push(event.at),
    onPointerMove: (_ctx, event) => points.push(event.at),
    onPointerUp: (_ctx, event) => points.push(event.at),
    ...overrides,
  };
}

function harness(scale = 4): {
  manager: ToolManager;
  tool: Tool & { points: Vec2[] };
  store: DocumentStore;
  viewport: Viewport;
} {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = scale;

  const tool = recorder();
  const context: ToolContext = {
    viewport,
    store,
    dispatch: (command) => store.dispatch(command),
    invalidate: () => {},
  };

  return { manager: new ToolManager(context, tool, [tool]), tool, store, viewport };
}

/** A 20 mm square with a corner at the origin. */
function addSquare(store: DocumentStore, id = 'p1'): void {
  store.dispatch(
    addPart(rectanglePart(id as never, `${id}-f` as never, 'Panel', rectShape(vec(0, 0), 20, 20))),
  );
}

function pointer(at: Vec2, overrides: Partial<PointerInput> = {}): PointerInput {
  return {
    at,
    atPx: vec(0, 0),
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    ...overrides,
  };
}

describe('ToolManager snapping', () => {
  it('hands the tool the snapped point, not the raw cursor', () => {
    const { manager, tool, store } = harness();
    addSquare(store);

    manager.pointerDown(pointer(vec(19.5, 0.3)));

    // The corner, exactly — not "close to" it. A fold line that lands at
    // 19.5 mm on a 20 mm panel is a pattern that will be cut wrong.
    expect(tool.points[0]).toEqual(vec(20, 0));
  });

  it('leaves the point alone when nothing is in range', () => {
    const { manager, tool, store } = harness();
    addSquare(store);

    manager.pointerDown(pointer(vec(100, 100)));

    expect(tool.points[0]).toEqual(vec(100, 100));
  });

  it('suspends snapping while Ctrl is held', () => {
    const { manager, tool, store } = harness();
    addSquare(store);

    manager.pointerDown(pointer(vec(19.5, 0.3), { ctrlKey: true }));

    expect(tool.points[0]).toEqual(vec(19.5, 0.3));
  });

  it('snaps on move and on up, not only on down', () => {
    const { manager, tool, store } = harness();
    addSquare(store);

    manager.pointerMove(pointer(vec(0.2, 0.2)));
    manager.pointerUp(pointer(vec(19.8, 19.8)));

    expect(tool.points).toEqual([vec(0, 0), vec(20, 20)]);
  });

  it('excludes what the active tool says it is moving', () => {
    const { store, viewport } = harness();
    addSquare(store);
    const moving = store.getState().document.project.parts[0]!.features[0]!.id;

    const tool = recorder({ snapExclusions: (): readonly FeatureId[] => [moving] });
    const manager = new ToolManager(
      { viewport, store, dispatch: (c) => store.dispatch(c), invalidate: () => {} },
      tool,
      [tool],
    );

    manager.pointerDown(pointer(vec(19.5, 0.3)));

    // Snapping a shape to its own corner would pin it in place.
    expect(tool.points[0]).toEqual(vec(19.5, 0.3));
  });

  it('shows a glyph for the snap it caught, and none when it caught nothing', () => {
    const { manager, store } = harness();
    addSquare(store);

    manager.pointerMove(pointer(vec(19.5, 0.3)));
    expect(manager.overlay().items.length).toBeGreaterThan(0);

    manager.pointerMove(pointer(vec(100, 100)));
    expect(manager.overlay().items).toEqual([]);
  });

  it('asks for a repaint when the caught snap changes, and not otherwise', () => {
    const store = new DocumentStore(emptyDocument('proj'));
    const viewport = new Viewport();
    viewport.resize(800, 600, 1);
    viewport.scale = 4;

    let repaints = 0;
    const tool = recorder();
    const manager = new ToolManager(
      {
        viewport,
        store,
        dispatch: (c) => store.dispatch(c),
        invalidate: () => {
          repaints += 1;
        },
      },
      tool,
      [tool],
    );
    addSquare(store);

    // A hovering pointer changes no document and an idle tool asks for no
    // repaint, so the glyph only appears if the router asks for one itself.
    manager.pointerMove(pointer(vec(19.5, 0.3)));
    expect(repaints).toBe(1);

    // Still the same corner: nothing new to draw.
    manager.pointerMove(pointer(vec(19.6, 0.2)));
    expect(repaints).toBe(1);

    // Left it, so the glyph has to come off.
    manager.pointerMove(pointer(vec(100, 100)));
    expect(repaints).toBe(2);
  });

  it('notices geometry that arrived after the first snap', () => {
    const { manager, tool, store } = harness();

    manager.pointerDown(pointer(vec(19.5, 0.3)));
    expect(tool.points[0]).toEqual(vec(19.5, 0.3));

    addSquare(store);
    manager.pointerDown(pointer(vec(19.5, 0.3)));

    // A stale index is worse than none: it snaps to geometry that has moved.
    expect(tool.points[1]).toEqual(vec(20, 0));
  });

  it('engages at the same pixel distance whatever the zoom', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 40, noNaN: true }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 12, max: 30 }),
        (scale, insidePx, outsidePx) => {
          const near = snappedAt(scale, insidePx);
          const far = snappedAt(scale, outsidePx);

          // The pick radius is 10 device pixels, converted through the
          // viewport — so what snaps is a matter of how close the cursor
          // *looks*, identically at every zoom.
          return near !== null && far === null;
        },
      ),
    );
  });
});

/**
 * Whether a cursor `offsetPx` diagonally outside the origin corner snapped to
 * it, at the given zoom. Returns the snapped point, or null if it did not.
 */
function snappedAt(scale: number, offsetPx: number): Vec2 | null {
  const { manager, tool, store } = harness(scale);
  addSquare(store);

  const offsetMm = offsetPx / scale / Math.SQRT2;
  manager.pointerDown(pointer(vec(-offsetMm, -offsetMm)));

  const got = tool.points[0]!;
  return got.x === 0 && got.y === 0 ? got : null;
}
