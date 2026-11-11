import {
  DocumentStore,
  addCutOut,
  addFoldLine,
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  type Command,
} from '@leathercad/document';
import { evaluate, type Project } from '@leathercad/domain';
import { PathOps, type Rect, type Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createSelectTool } from './selectTool.js';

/**
 * 3.13: a click on a piece's body takes the piece (smart-guides spec §3). A
 * 100 × 60 outer at the origin, folded at x = 50, with a slot near its left
 * edge, and a 40 × 30 pocket beside it.
 */
function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const commands: Command[] = [
    addPart(rectanglePart('p', 'outline', 'Outer', rectShape({ x: 0, y: 0 }, 100, 60))),
    addCutOut('p', 'slot', { kind: 'shape', shape: rectShape({ x: 10, y: 20 }, 20, 6) }),
    addFoldLine('p', 'fold', {
      kind: 'path',
      path: PathOps.polyline([
        { x: 50, y: 0 },
        { x: 50, y: 60 },
      ]),
    }),
    addPart(rectanglePart('q', 'pocket', 'Pocket', rectShape({ x: 200, y: 0 }, 40, 30))),
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

function click(ctx: ToolContext, at: Vec2, shiftKey = false): void {
  const tool = createSelectTool();
  tool.onPointerDown?.(ctx, pointer(at, shiftKey));
  tool.onPointerUp?.(ctx, pointer(at, shiftKey));
}

function drag(ctx: ToolContext, from: Vec2, to: Vec2): void {
  const tool = createSelectTool();
  tool.onPointerDown?.(ctx, pointer(from));
  tool.onPointerMove?.(ctx, pointer(to));
  tool.onPointerUp?.(ctx, pointer(to));
}

function boxOf(project: Project, id: string): Rect {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((candidate) => candidate.feature.id === id);
  if (entry?.ok !== true) throw new Error(`${id} did not build`);
  const box = PathOps.bbox(entry.path);
  if (box === null) throw new Error(`${id} has no extent`);
  return box;
}

/** Mid-panel, away from the fold and the slot. */
const BODY = { x: 75, y: 30 };

describe('a click on a piece’s body, with Select (3.13)', () => {
  it('selects the piece, as its heading in Parts does', () => {
    const { ctx, store } = harness();

    click(ctx, BODY);

    const { selection } = store.getState();
    expect([...selection.parts]).toEqual(['p']);
    expect(selection.features.size).toBe(0);
  });

  it('on the fold selects the fold, not the piece', () => {
    const { ctx, store } = harness();

    click(ctx, { x: 50, y: 30 });

    expect([...store.getState().selection.features]).toEqual(['fold']);
  });

  it('in a cut-out selects nothing, and starts a box there', () => {
    const { ctx, store } = harness();
    store.selectParts(['q']);
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer({ x: 20, y: 23 }));
    expect(tool.buildOverlay?.(ctx).items.length).toBe(1);
    tool.onPointerUp?.(ctx, pointer({ x: 20, y: 23 }));

    const { selection } = store.getState();
    expect(selection.parts.size + selection.features.size).toBe(0);
  });

  it('passes over a piece whose outline is locked: the press starts a box', () => {
    const { ctx, store } = harness();
    store.dispatch(setFeatureLocked(['outline'], true));

    click(ctx, BODY);

    expect(store.getState().selection.parts.size).toBe(0);
  });

  it('with Shift adds the piece to what is picked, and a second Shift-click takes it away', () => {
    const { ctx, store } = harness();
    store.select(['pocket']);

    click(ctx, BODY, true);
    expect(new Set(store.getState().selection.features)).toEqual(
      new Set(['pocket', 'outline', 'slot', 'fold']),
    );

    click(ctx, BODY, true);
    expect([...store.getState().selection.features]).toEqual(['pocket']);
  });

  it('keeps a selection that already holds the piece, so the press can drag all of it', () => {
    const { ctx, store } = harness();
    store.select(['outline', 'pocket']);

    click(ctx, BODY);

    expect(new Set(store.getState().selection.features)).toEqual(new Set(['outline', 'pocket']));
  });
});

describe('a drag from a piece’s body, with Select (3.13)', () => {
  it('moves the piece whole, its slot and fold with it, in one undo step', () => {
    const { ctx, store } = harness();
    const before = store.getState().document.project;

    drag(ctx, BODY, { x: BODY.x + 12, y: BODY.y - 5 });

    const after = store.getState().document.project;
    for (const id of ['outline', 'slot', 'fold']) {
      const was = boxOf(before, id);
      const now = boxOf(after, id);
      expect(now.minX - was.minX, `${id} x`).toBeCloseTo(12, 9);
      expect(now.minY - was.minY, `${id} y`).toBeCloseTo(-5, 9);
    }
    expect(boxOf(after, 'pocket')).toEqual(boxOf(before, 'pocket'));

    store.undo();
    expect(store.getState().document.project).toBe(before);
  });

  it('moves every piece in a selection that holds it', () => {
    const { ctx, store } = harness();
    store.select(['outline', 'pocket']);
    const before = store.getState().document.project;

    drag(ctx, BODY, { x: BODY.x + 10, y: BODY.y });

    const after = store.getState().document.project;
    expect(boxOf(after, 'pocket').minX - boxOf(before, 'pocket').minX).toBeCloseTo(10, 9);
    expect(boxOf(after, 'slot').minX - boxOf(before, 'slot').minX).toBeCloseTo(10, 9);
  });
});
