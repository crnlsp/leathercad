import {
  addPart,
  DocumentStore,
  emptyDocument,
  rectanglePart,
  rectShape,
} from '@leathercad/document';
import { PathOps, vec, type Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { ToolManager, type PointerInput } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createLineTool } from './polylineTool.js';

let counter = 0;
const nextId = (): string => `id-${(counter += 1)}`;

function click(at: Vec2): PointerInput {
  return { at, atPx: vec(0, 0), button: 0, shiftKey: false, altKey: false, ctrlKey: false };
}

describe('a fold line drawn across a panel', () => {
  it('lands exactly on the midpoints of the edges it was aimed at', () => {
    // The whole reason 3.3b came first. A bifold's fold must sit dead centre
    // and run edge to edge; drawn by eye it misses both, and a drawn path has
    // no numeric editor to correct it with until slice 3.9.
    const store = new DocumentStore(emptyDocument('doc'));
    store.dispatch(
      addPart(rectanglePart('part-1', 'cut-1', 'Panel', rectShape(vec(0, 0), 100, 60))),
    );
    store.select(['cut-1']);

    const viewport = new Viewport();
    viewport.resize(800, 600, 1);
    viewport.scale = 4;

    const tool = createLineTool(nextId);
    const manager = new ToolManager(
      {
        viewport,
        store,
        dispatch: (command) => store.dispatch(command),
        invalidate: () => {},
        drawAs: () => 'fold',
      },
      tool,
      [tool],
    );

    // Half a millimetre off each edge's midpoint — close enough to mean it,
    // far enough to be wrong by hand.
    manager.pointerDown(click(vec(49.6, 60.4)));
    manager.pointerDown(click(vec(50.3, -0.5)));

    const features = store.getState().document.project.parts[0]!.features;
    expect(features.map((f) => f.kind)).toEqual(['cut-contour', 'fold-line']);

    const fold = features[1]!;
    expect(fold.source.kind).toBe('path');
    const bounds = fold.source.kind === 'path' ? PathOps.bbox(fold.source.path) : null;

    // Exact, not close: these are the snapped edge midpoints, not the clicks.
    expect(bounds).toEqual({ minX: 50, maxX: 50, minY: 0, maxY: 60 });
  });
});
