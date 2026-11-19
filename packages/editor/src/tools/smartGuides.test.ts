import {
  DocumentStore,
  addGuide,
  addHardwareHole,
  addPart,
  addFoldLine,
  addStitchLine,
  emptyDocument,
  mirrorAcrossFold,
  pathPart,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  translateFeatures,
  type Command,
} from '@leathercad/document';
import { evaluate, type Project } from '@leathercad/domain';
import { PathOps, polyline, type Rect, type Vec2 } from '@leathercad/geometry';
import { CANVAS } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

import type { AlignLabel } from '../align.js';
import { ToolManager, type PointerInput, type ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createSelectTool } from './selectTool.js';

/**
 * 3.16: a piece moved whole lines up with other pieces and guides (smart-guides
 * spec §6). A 100 × 60 outer at the origin with its stitch line, and a 40 × 30
 * pocket on it at (30, 20). At 4 px/mm the 10 px pick radius is 2.5 mm.
 */
function harness(
  extra: Command[] = [],
  smartGuides = true,
  scene: Command[] = [
    addPart(rectanglePart('outer', 'outer-cut', 'Outer', rectShape({ x: 0, y: 0 }, 100, 60, 4))),
    addStitchLine('outer', 'outer-stitch', 'outer-cut', 3),
    addPart(rectanglePart('pocket', 'pocket-cut', 'Pocket', rectShape({ x: 30, y: 20 }, 40, 30))),
  ],
  alignmentWords?: (label: AlignLabel) => string,
  distanceWords?: (mm: number) => string,
) {
  const store = new DocumentStore(emptyDocument('proj'));
  const commands: Command[] = [...scene, ...extra];
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
    ...(alignmentWords === undefined ? {} : { alignmentWords }),
    ...(distanceWords === undefined ? {} : { distanceWords }),
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

/**
 * 3.18: a feature moved inside its piece lines up with that piece (smart-guides
 * spec §6). The key fob's strap, 140 × 26 with round ends and its fold at
 * x = 70, a 4 mm rivet on it and the rivet's counterpart mirrored across the
 * fold. At 4 px/mm the pick radius is 2.5 mm.
 */
function keyFob(at: Vec2 = { x: 30, y: 16 }, extra: Command[] = []) {
  const words = (label: AlignLabel): string =>
    label === 'centre' ? 'Centre' : 'Centre of its extent';
  const { store, manager } = harness(
    [],
    true,
    [
      addPart(rectanglePart('strap', 'strap-cut', 'Strap', rectShape({ x: 0, y: 0 }, 140, 26, 13))),
      addFoldLine('strap', 'fold', {
        kind: 'path',
        path: polyline([
          { x: 70, y: 0 },
          { x: 70, y: 26 },
        ]),
      }),
      addHardwareHole('strap', 'rivet', at, 2),
      mirrorAcrossFold(['rivet'], ['rivet-b'], 'fold'),
      ...extra,
    ],
    words,
  );
  return { store, manager };
}

const centreOf = (store: DocumentStore, id: string): Vec2 => {
  const box = boxOf(store.getState().document.project, id);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
};

/**
 * Pressed on the rivet's rim where it starts, at 0°: a point of the rivet, so
 * the press catches it exactly and the rivet moves as far as the pointer.
 */
describe('placing inside a piece (3.18)', () => {
  it("puts a rivet dragged near the strap's centre line on it exactly, in one undo step", () => {
    const { store, manager } = keyFob();
    const before = store.getState().document;
    const from = { x: 32, y: 16 };
    // Raw, the centre would land at y = 14.2: within 2.5 mm of 13.
    drag(manager, from, { x: from.x + 10.3, y: from.y - 1.8 });

    expect(centreOf(store, 'rivet').y).toBe(13);
    expect(centreOf(store, 'rivet').x).toBeCloseTo(40.3, 9);
    store.undo();
    expect(store.getState().document).toBe(before);
  });

  it('lines the rivet up with the strap, not with another piece', () => {
    const { store, manager } = keyFob({ x: 30, y: 16 }, [
      addPart(rectanglePart('other', 'other-cut', 'Other', rectShape({ x: 0, y: 40 }, 81, 30))),
    ]);
    const from = { x: 32, y: 16 };
    // The other piece's right edge is at x = 81; the rivet's centre would land at 80.
    drag(manager, from, { x: from.x + 50, y: from.y + 5 });
    expect(centreOf(store, 'rivet').x).toBeCloseTo(80, 9);
  });

  it('does not line the rivet up with where its own mirrored counterpart was', () => {
    // The counterpart is at x = 110; it moves as the rivet does.
    const { store, manager } = keyFob();
    const from = { x: 32, y: 16 };
    drag(manager, from, { x: from.x + 79, y: from.y + 5 });
    expect(centreOf(store, 'rivet').x).toBeCloseTo(109, 9);
  });

  it('puts a fold dragged near the middle of the strap at its middle', () => {
    const { store, manager } = keyFob();
    // The fold typed to x = 60 first, then carried by its midpoint to 69.
    store.dispatch(translateFeatures(['fold'], { x: -10, y: 0 }));
    drag(manager, { x: 60, y: 13 }, { x: 69, y: 13.5 });
    expect(boxOf(store.getState().document.project, 'fold').minX).toBe(70);
  });

  it('Ctrl suspends it: the rivet goes where the pointer took it', () => {
    const { store, manager } = keyFob();
    const from = { x: 32, y: 16 };
    drag(manager, from, { x: from.x + 10.3, y: from.y - 1.8 }, true);
    expect(centreOf(store, 'rivet').y).toBeCloseTo(14.2, 9);
  });

  it("labels the strap's centre line its centre", () => {
    const { manager } = keyFob();
    const from = { x: 32, y: 16 };
    manager.pointerDown(pointer(from));
    manager.pointerMove(pointer({ x: from.x + 10.3, y: from.y - 1.8 }));
    const words = manager
      .overlay()
      .items.flatMap((item) => (item.kind === 'overlay-text' ? [item.text] : []));
    expect(words).toEqual(['Centre']);
  });

  it('labels an irregular piece’s centre line the centre of its extent', () => {
    const { manager } = harness(
      [],
      true,
      [
        addPart(
          pathPart(
            'tri',
            'tri-cut',
            'Triangle',
            polyline(
              [
                { x: 0, y: 0 },
                { x: 80, y: 0 },
                { x: 0, y: 60 },
              ],
              true,
            ),
          ),
        ),
        addHardwareHole('tri', 'hole', { x: 20, y: 20 }, 2),
      ],
      (label) => (label === 'centre' ? 'Centre' : 'Centre of its extent'),
    );
    const from = { x: 22, y: 20 };
    manager.pointerDown(pointer(from));
    // The centre of its extent is (40, 30): the hole's centre to (40.8, 21).
    manager.pointerMove(pointer({ x: from.x + 20.8, y: from.y + 1 }));
    const words = manager
      .overlay()
      .items.flatMap((item) => (item.kind === 'overlay-text' ? [item.text] : []));
    expect(words).toEqual(['Centre of its extent']);
  });
});

/**
 * 3.19: a piece moved beside others snaps to equal gaps (smart-guides spec
 * §8). Three 40 × 30 card pockets in a row, level: the first two 15 mm apart,
 * the third away to the right. At 4 px/mm the pick radius is 2.5 mm.
 */
function cardPockets(smartGuides = true) {
  const words: string[] = [];
  const { store, manager } = harness(
    [],
    smartGuides,
    [
      addPart(rectanglePart('one', 'one-cut', 'One', rectShape({ x: 0, y: 0 }, 40, 30))),
      addPart(rectanglePart('two', 'two-cut', 'Two', rectShape({ x: 55, y: 0 }, 40, 30))),
      addPart(rectanglePart('three', 'three-cut', 'Three', rectShape({ x: 200, y: 0 }, 40, 30))),
    ],
    undefined,
    (mm) => {
      words.push(`${mm}`);
      return `${mm} mm`;
    },
  );
  return { store, manager, words };
}

const third = (store: DocumentStore) => boxOf(store.getState().document.project, 'three-cut');
const THIRD: Vec2 = { x: 220, y: 15 };

describe('equal spacing while moving a piece (3.19)', () => {
  it('places a third pocket the gap of the first two along, exactly, in one undo step', () => {
    const { store, manager } = cardPockets();
    const before = store.getState().document;
    // Raw, its left side would land at 111.2: 1.2 mm past repeating the 15 mm.
    drag(manager, THIRD, { x: THIRD.x - 88.8, y: THIRD.y });
    expect(third(store).minX).toBe(110);
    store.undo();
    expect(store.getState().document).toBe(before);
  });

  it('centres a pocket between two neighbours, with equal gaps', () => {
    const { store, manager } = harness([], true, [
      addPart(rectanglePart('one', 'one-cut', 'One', rectShape({ x: 0, y: 0 }, 40, 30))),
      addPart(rectanglePart('three', 'three-cut', 'Three', rectShape({ x: 200, y: 0 }, 40, 30))),
      addPart(rectanglePart('two', 'two-cut', 'Two', rectShape({ x: 300, y: 0 }, 40, 30))),
    ]);
    // Between 40 and 200 a 40-wide pocket is centred at 100–140, 60 mm each
    // side; carried to 101.7–141.7.
    drag(manager, { x: 320, y: 15 }, { x: 121.7, y: 15 });
    const two = boxOf(store.getState().document.project, 'two-cut');
    expect(two.minX).toBe(100);
    expect(two.minX - 40).toBe(200 - two.maxX);
  });

  it('Ctrl suspends it: the pocket goes where the pointer took it', () => {
    const { store, manager } = cardPockets();
    drag(manager, THIRD, { x: THIRD.x - 88.8, y: THIRD.y }, true);
    expect(third(store).minX).toBeCloseTo(111.2, 9);
  });

  it('with Smart guides off, the pocket goes where the pointer took it', () => {
    const { store, manager } = cardPockets(false);
    drag(manager, THIRD, { x: THIRD.x - 88.8, y: THIRD.y });
    expect(third(store).minX).toBeCloseTo(111.2, 9);
  });

  it('labels both gaps with the same number while it is caught', () => {
    const { manager, words } = cardPockets();
    manager.pointerDown(pointer(THIRD));
    manager.pointerMove(pointer({ x: THIRD.x - 88.8, y: THIRD.y }));
    words.length = 0;
    const lines = manager
      .overlay()
      .items.filter((item) => item.kind === 'path' && item.stroke.colour === CANVAS.overlay.snap);
    expect(lines.length).toBeGreaterThan(0);
    expect(words).toEqual(['15', '15']);
  });
});
