import {
  DocumentStore,
  addGuide,
  addHardwareHole,
  addPart,
  addStitchLine,
  emptyDocument,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  type Command,
} from '@leathercad/document';
import { evaluate, type Project } from '@leathercad/domain';
import { PathOps, type Rect, type Vec2 } from '@leathercad/geometry';
import { CANVAS } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

import { ToolManager, type PointerInput, type ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createSelectTool } from './selectTool.js';

/**
 * 3.16: a piece moved whole lines up with other pieces and guides (smart-guides
 * spec §6). A 100 × 60 outer at the origin with its stitch line, and a 40 × 30
 * pocket on it at (30, 20). At 4 px/mm the 10 px pick radius is 2.5 mm.
 */
function harness(extra: Command[] = [], smartGuides = true) {
  const store = new DocumentStore(emptyDocument('proj'));
  const commands: Command[] = [
    addPart(rectanglePart('outer', 'outer-cut', 'Outer', rectShape({ x: 0, y: 0 }, 100, 60, 4))),
    addStitchLine('outer', 'outer-stitch', 'outer-cut', 3),
    addPart(rectanglePart('pocket', 'pocket-cut', 'Pocket', rectShape({ x: 30, y: 20 }, 40, 30))),
    ...extra,
  ];
  for (const command of commands) store.dispatch(command);
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;
  const ctx: ToolContext = {
    viewport,
    store,
    dispatch: (c) => store.dispatch(c),
    invalidate: () => {},
    smartGuides: () => smartGuides,
  };
  const tool = createSelectTool();
  const manager = new ToolManager(ctx, tool, [tool]);
  return { store, tool, ctx, manager };
}

function pointer(at: Vec2, ctrlKey = false): PointerInput {
  return { at, atPx: { x: 0, y: 0 }, button: 0, shiftKey: false, altKey: false, ctrlKey };
}

/** A drag through the router, as the board sends it: press, several moves, release. */
function drag(manager: ToolManager, from: Vec2, to: Vec2, ctrlKey = false): void {
  manager.pointerDown(pointer(from));
  for (let step = 1; step <= 4; step++) {
    const t = step / 4;
    manager.pointerMove(
      pointer({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, ctrlKey),
    );
  }
  manager.pointerUp(pointer(to, ctrlKey));
}

function boxOf(project: Project, id: string): Rect {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((candidate) => candidate.feature.id === id);
  if (entry?.ok !== true) throw new Error(`${id} did not build`);
  return PathOps.bbox(entry.path)!;
}

const pocket = (store: DocumentStore) => boxOf(store.getState().document.project, 'pocket-cut');

/** The body of the pocket, clear of every line by more than the pick radius. */
const BODY: Vec2 = { x: 50, y: 30 };

describe('smart guides while moving a piece (3.16)', () => {
  it("lines the pocket's left edge up with the outer's exactly, in one undo step", () => {
    const { store, manager } = harness();
    const before = store.getState().document;
    // Raw, the left edge would land at 1.2: within 2.5 mm of the outer's 0.
    drag(manager, BODY, { x: BODY.x - 28.8, y: BODY.y + 7.3 });

    expect(pocket(store).minX).toBe(0);
    // The other axis is the pointer's, quantised as it is stored.
    expect(pocket(store).minY).toBeCloseTo(27.3, 9);
    store.undo();
    expect(store.getState().document).toBe(before);
  });

  it('lines a centre up with a centre', () => {
    const { store, manager } = harness();
    // The pocket's centre x is 50, the outer's too: moved 1 mm right, the
    // centres are 1 mm apart and no edge is near an edge, so it stays.
    drag(manager, BODY, { x: BODY.x + 1, y: BODY.y });
    expect(pocket(store).minX).toBe(30);
  });

  it('lines up with an upright guide before a piece', () => {
    const { store, manager } = harness([
      addGuide({ id: 'guide', origin: { x: -1.5, y: 0 }, angleRad: Math.PI / 2 }),
    ]);
    drag(manager, BODY, { x: BODY.x - 29.5, y: BODY.y });
    expect(pocket(store).minX).toBe(-1.5);
  });

  it('Ctrl suspends the guides: the piece goes where the pointer took it', () => {
    const { store, manager } = harness();
    drag(manager, BODY, { x: BODY.x - 28.8, y: BODY.y }, true);
    expect(pocket(store).minX).toBeCloseTo(1.2, 9);
  });

  it('with Smart guides off, the piece goes where the pointer took it', () => {
    const { store, manager } = harness([], false);
    drag(manager, BODY, { x: BODY.x - 28.8, y: BODY.y });
    expect(pocket(store).minX).toBeCloseTo(1.2, 9);
  });

  it('Escape puts the piece back and leaves no history', () => {
    const { store, manager } = harness();
    const before = store.getState().document;
    const { canUndo } = store.getState();
    manager.pointerDown(pointer(BODY));
    manager.pointerMove(pointer({ x: BODY.x - 28.8, y: BODY.y }));
    expect(pocket(store).minX).toBe(0);
    manager.key({
      key: 'Escape',
      code: 'Escape',
      means: new Set(),
      shiftKey: false,
      ctrlKey: false,
    });
    expect(store.getState().document).toBe(before);
    expect(store.getState().canUndo).toBe(canUndo);
  });

  it('draws a line in the snap colour while an axis is lined up, and nothing once released', () => {
    const { manager } = harness();
    manager.pointerDown(pointer(BODY));
    manager.pointerMove(pointer({ x: BODY.x - 28.8, y: BODY.y }));
    const lines = manager
      .overlay()
      .items.filter((item) => item.kind === 'path' && item.stroke.colour === CANVAS.overlay.snap);
    expect(lines.length).toBeGreaterThan(0);
    manager.pointerUp(pointer({ x: BODY.x - 28.8, y: BODY.y }));
    expect(manager.overlay().items).toEqual([]);
  });

  it('a piece grabbed by its body is not snapped to a point under the pointer', () => {
    const { store, manager } = harness();
    manager.pointerDown(pointer(BODY));
    // Over the outer's stitch line at x = 3: a point the pointer would catch,
    // which a body grab does not offer, so the guide decides.
    manager.pointerMove(pointer({ x: 3.4, y: BODY.y }));
    expect(manager.snapPoint()).toBeNull();
    manager.pointerUp(pointer({ x: 3.4, y: BODY.y }));
    expect(pocket(store).minX).toBeCloseTo(3.4 - 20, 9);
  });

  it('a piece grabbed by its corner puts the corner on a point the pointer catches, both axes', () => {
    const { store, manager } = harness();
    // The pocket's lower-left corner, onto the midpoint of the stitch line's
    // left side, (3, 30): a corner grab is the exact, point-to-point move.
    drag(manager, { x: 30, y: 20 }, { x: 3.6, y: 30.4 });
    const caught = { x: pocket(store).minX, y: pocket(store).minY };
    expect(caught).toEqual({ x: 3, y: 30 });
  });

  it('a refused move shows its notice and no guides', () => {
    const { manager } = harness([
      addHardwareHole('pocket', 'rivet', { x: 60, y: 40 }, 2),
      setFeatureLocked(['rivet'], true),
    ]);
    manager.pointerDown(pointer(BODY));
    manager.pointerMove(pointer({ x: BODY.x - 28.8, y: BODY.y }));
    expect(manager.notice()).not.toBeNull();
    expect(manager.overlay().items).toEqual([]);
  });
});
