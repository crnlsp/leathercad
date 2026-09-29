import {
  DocumentStore,
  addCutOut,
  addPart,
  emptyDocument,
  pathPart,
  rectShape,
  rectanglePart,
  type Command,
} from '@leathercad/document';
import { PathOps, type Vec2 } from '@leathercad/geometry';
import { describe, expect, it, vi } from 'vitest';

import type { PointerInput, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createEditPointsTool } from './editPointsTool.js';
import { createScaleTool } from './scaleTool.js';
import { createSelectTool } from './selectTool.js';

/**
 * Q29: a part picked by its heading is a real selection for every tool, not
 * nothing. A rectangle panel with a slot, and a drawn panel beside it.
 */
function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const commands: Command[] = [
    addPart(rectanglePart('p', 'outline', 'Front', rectShape({ x: 0, y: 0 }, 100, 60))),
    addCutOut('p', 'slot', { kind: 'shape', shape: rectShape({ x: 10, y: 20 }, 20, 6) }),
    addPart(
      pathPart(
        'q',
        'drawn',
        'Tab',
        PathOps.polyline(
          [
            { x: 200, y: 0 },
            { x: 260, y: 0 },
            { x: 260, y: 40 },
          ],
          true,
        ),
      ),
    ),
  ];
  for (const command of commands) store.dispatch(command);

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

const key = (name: string) => ({ key: name, shiftKey: false, ctrlKey: false });

describe('a part picked by its heading, with the Select tool (Q29)', () => {
  it('is deleted by the Delete key, through the app, which asks about dependents', () => {
    const { ctx, store } = harness();
    const requestDeletePart = vi.fn();
    store.selectParts(['p']);

    createSelectTool().onKey?.({ ...ctx, requestDeletePart }, key('Delete'));

    expect(requestDeletePart).toHaveBeenCalledWith('p');
  });

  it('is deleted directly when there is no app to ask', () => {
    const { ctx, store } = harness();
    store.selectParts(['p']);

    createSelectTool().onKey?.(ctx, key('Delete'));

    expect(store.getState().document.project.parts.map((part) => part.id)).toEqual(['q']);
    expect(store.getState().selection.parts.size).toBe(0);
  });

  it('keeps what it stands for when Shift adds a feature, rather than dropping it', () => {
    const { ctx, store } = harness();
    store.selectParts(['p']);
    const tool = createSelectTool();

    // Shift-click the drawn panel's bottom edge.
    tool.onPointerDown?.(ctx, pointer({ x: 230, y: 0 }, true));
    tool.onPointerUp?.(ctx, pointer({ x: 230, y: 0 }, true));

    const { selection } = store.getState();
    expect(new Set(selection.features)).toEqual(new Set(['outline', 'slot', 'drawn']));
    expect(selection.parts.size).toBe(0);
  });

  it('keeps what it stands for when Shift adds a box of features', () => {
    const { ctx, store } = harness();
    store.selectParts(['p']);
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 190, y: -10 }, true));
    tool.onPointerMove?.(ctx, pointer({ x: 270, y: 50 }, true));
    tool.onPointerUp?.(ctx, pointer({ x: 270, y: 50 }, true));

    expect(new Set(store.getState().selection.features)).toEqual(
      new Set(['outline', 'slot', 'drawn']),
    );
  });
});

describe('a part picked by its heading, with Scale (Q29)', () => {
  it('says why it is not scaled, rather than doing nothing without a word', () => {
    const { ctx, store } = harness();
    store.selectParts(['p']);
    const before = store.getState().document;
    const tool = createScaleTool();

    expect(tool.notice?.(ctx)).toEqual({ code: 'WHOLE_PART_NOT_SCALED', facts: {} });
    tool.onPointerDown?.(ctx, pointer({ x: 100, y: 30 }));
    tool.onPointerMove?.(ctx, pointer({ x: 150, y: 30 }));
    tool.onPointerUp?.(ctx, pointer({ x: 150, y: 30 }));
    expect(store.getState().document).toBe(before);
  });

  it('says nothing about an outline picked on the board, which it resizes', () => {
    const { ctx, store } = harness();
    store.select(['outline']);

    expect(createScaleTool().notice?.(ctx)).toBeNull();
  });
});

describe('a part picked by its heading, with Edit Points (Q29)', () => {
  it('offers the points of its drawn outline', () => {
    const { ctx, store } = harness();
    store.selectParts(['q']);

    const overlay = createEditPointsTool(() => ({ cornerRadiusMm: 3 })).buildOverlay?.(ctx);

    expect(overlay?.items.length).toBeGreaterThan(0);
  });

  it('says why a rectangle outline has no points to move', () => {
    const { ctx, store } = harness();
    store.selectParts(['p']);

    expect(createEditPointsTool(() => ({ cornerRadiusMm: 3 })).notice?.(ctx)?.code).toBe(
      'NOT_A_DRAWN_PATH',
    );
  });
});
