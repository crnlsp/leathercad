import { QUANTUM_MM } from '@leathercad/core';
import {
  DocumentStore,
  addPart,
  addStitchLine,
  emptyDocument,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  setFeatureVisible,
  type Command,
  type Document,
} from '@leathercad/document';
import { evaluate, type Project } from '@leathercad/domain';
import { PathOps, type Rect } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ToolManager, type KeyInput, type PointerInput, type ToolKey } from './tool.js';
import { createEditPointsTool } from './tools/editPointsTool.js';
import { createRectangleTool } from './tools/rectangleTool.js';
import { createSelectTool } from './tools/selectTool.js';
import { Viewport } from './viewport.js';

/**
 * 3.14: the arrow keys move what is picked, and one key picks every piece
 * (smart-guides spec §4). A 100 × 60 outer at the origin with a stitch line
 * that follows it, and a 40 × 30 pocket beside it.
 */
function harness(): { manager: ToolManager; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const commands: Command[] = [
    addPart(rectanglePart('p', 'outline', 'Outer', rectShape({ x: 0, y: 0 }, 100, 60))),
    addStitchLine('p', 'stitch', 'outline', 3),
    addPart(rectanglePart('q', 'pocket', 'Pocket', rectShape({ x: 200, y: 0 }, 40, 30))),
  ];
  for (const command of commands) store.dispatch(command);

  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;
  const select = createSelectTool();
  const manager = new ToolManager(
    { viewport, store, dispatch: (c) => store.dispatch(c), invalidate: () => {} },
    select,
    [select, createRectangleTool(() => 'drawn'), createEditPointsTool()],
  );
  return { manager, store };
}

/** A press of the key at `code`, meaning what the keymap would make it mean. */
function press(code: string, ...means: ToolKey[]): KeyInput {
  return { key: code, code, means: new Set(means), shiftKey: false, ctrlKey: false };
}

/** A key pressed and let go: one tap. */
function tap(manager: ToolManager, code: string, ...means: ToolKey[]): boolean {
  const claimed = manager.key(press(code, ...means));
  manager.keyUp(code);
  return claimed;
}

function pointer(x: number, y: number): PointerInput {
  return {
    at: { x, y },
    atPx: { x: 0, y: 0 },
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  };
}

function boxOf(project: Project, id: string): Rect {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((candidate) => candidate.feature.id === id);
  if (entry?.ok !== true) throw new Error(`${id} did not resolve`);
  const box = PathOps.bbox(entry.path);
  if (box === null) throw new Error(`${id} has no bounds`);
  return box;
}

const project = (store: DocumentStore): Project => store.getState().document.project;

/** How many undos take the document back to the one it was: the steps of history since. */
function stepsSince(store: DocumentStore, base: Document): number {
  let steps = 0;
  while (store.getState().document !== base && store.getState().canUndo) {
    store.undo();
    steps++;
  }
  return steps;
}

describe('nudging the selection with the arrow keys (3.14)', () => {
  it.each([
    ['nudgeLeft', -1, 0],
    ['nudgeRight', 1, 0],
    ['nudgeUp', 0, 1],
    ['nudgeDown', 0, -1],
    ['nudgeLeftBig', -10, 0],
    ['nudgeRightBig', 10, 0],
    ['nudgeUpBig', 0, 10],
    ['nudgeDownBig', 0, -10],
    ['nudgeLeftFine', -0.1, 0],
    ['nudgeRightFine', 0.1, 0],
    ['nudgeUpFine', 0, 0.1],
    ['nudgeDownFine', 0, -0.1],
  ] as const)('%s moves the selection by (%f, %f) mm, Y up', (means, dx, dy) => {
    const { manager, store } = harness();
    store.select(['pocket']);

    expect(tap(manager, 'ArrowLeft', means)).toBe(true);

    const box = boxOf(project(store), 'pocket');
    expect(box.minX).toBeCloseTo(200 + dx, 9);
    expect(box.minY).toBeCloseTo(dy, 9);
  });

  it('is one history step for one press', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    const before = store.getState().document;

    tap(manager, 'ArrowRight', 'nudgeRight');

    expect(stepsSince(store, before)).toBe(1);
    expect(store.inTransaction).toBe(false);
  });

  it('is one history step for a held key, however often it repeats', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    const before = store.getState().document;

    for (let repeat = 0; repeat < 7; repeat++) manager.key(press('ArrowRight', 'nudgeRight'));
    manager.keyUp('ArrowRight');

    expect(boxOf(project(store), 'pocket').minX).toBeCloseTo(207, 9);
    expect(stepsSince(store, before)).toBe(1);
  });

  it('is a step each for separate presses', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    const before = store.getState().document;

    tap(manager, 'ArrowRight', 'nudgeRight');
    tap(manager, 'ArrowRight', 'nudgeRight');

    expect(stepsSince(store, before)).toBe(2);
  });

  it('commits when the last of two held arrows is let go, as one step', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    const before = store.getState().document;

    manager.key(press('ArrowRight', 'nudgeRight'));
    manager.key(press('ArrowUp', 'nudgeUp'));
    manager.keyUp('ArrowRight');
    expect(store.inTransaction).toBe(true);
    manager.keyUp('ArrowUp');

    const box = boxOf(project(store), 'pocket');
    expect([box.minX, box.minY]).toEqual([201, 1]);
    expect(stepsSince(store, before)).toBe(1);
  });

  it('moves a piece whole when its outline is picked, as a drag does', () => {
    const { manager, store } = harness();
    store.select(['outline']);

    tap(manager, 'ArrowRight', 'nudgeRightBig');

    expect(boxOf(project(store), 'outline').minX).toBe(10);
    expect(boxOf(project(store), 'stitch').minX).toBe(13);
  });

  it('moves a piece picked by its body or its heading', () => {
    const { manager, store } = harness();
    store.selectParts(['q']);

    tap(manager, 'ArrowUp', 'nudgeUp');

    expect(boxOf(project(store), 'pocket').minY).toBe(1);
  });

  it('refuses a locked piece, says why, and leaves history alone', () => {
    const { manager, store } = harness();
    store.dispatch(setFeatureLocked(['pocket'], true));
    store.select(['pocket']);
    const before = store.getState().document;

    manager.key(press('ArrowRight', 'nudgeRight'));
    expect(manager.notice()?.code).toBe('FEATURE_LOCKED');
    manager.keyUp('ArrowRight');

    expect(boxOf(project(store), 'pocket').minX).toBe(200);
    expect(stepsSince(store, before)).toBe(0);
    // A tap is over before it can be read: the reason stays until the next press.
    expect(manager.notice()?.code).toBe('FEATURE_LOCKED');
    manager.pointerDown(pointer(500, 500));
    expect(manager.notice()).toBeNull();
  });

  it('refuses a derived line moved alone, with the reason a drag gives', () => {
    const { manager, store } = harness();
    store.select(['stitch']);

    manager.key(press('ArrowRight', 'nudgeRight'));

    expect(manager.notice()).not.toBeNull();
    manager.keyUp('ArrowRight');
    expect(boxOf(project(store), 'stitch').minX).toBe(3);
  });

  it('leaves the key to the window when nothing is picked', () => {
    const { manager, store } = harness();

    expect(tap(manager, 'ArrowRight', 'nudgeRight')).toBe(false);
    expect(store.inTransaction).toBe(false);
  });

  it('is cancelled by Escape, and the held key then moves nothing more', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    const before = store.getState().document;

    manager.key(press('ArrowRight', 'nudgeRight'));
    expect(manager.key(press('Escape'))).toBe(true);
    manager.key(press('ArrowRight', 'nudgeRight'));
    manager.keyUp('ArrowRight');

    expect(boxOf(project(store), 'pocket').minX).toBe(200);
    expect(stepsSince(store, before)).toBe(0);
    expect(store.inTransaction).toBe(false);
  });

  it('cancelled by undo mid-hold, moves nothing more until the key is pressed again', () => {
    const { manager, store } = harness();
    store.select(['pocket']);

    manager.key(press('ArrowRight', 'nudgeRight'));
    store.undo();
    manager.key(press('ArrowRight', 'nudgeRight'));
    manager.keyUp('ArrowRight');
    expect(boxOf(project(store), 'pocket').minX).toBe(200);

    tap(manager, 'ArrowRight', 'nudgeRight');
    expect(boxOf(project(store), 'pocket').minX).toBe(201);
  });

  it('is kept when the keys are lost with the window, not left open', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    const before = store.getState().document;

    manager.key(press('ArrowRight', 'nudgeRight'));
    manager.keysLost();

    expect(store.inTransaction).toBe(false);
    expect(boxOf(project(store), 'pocket').minX).toBe(201);
    expect(stepsSince(store, before)).toBe(1);
  });

  it('is kept when a press of the pointer follows with the key still down', () => {
    const { manager, store } = harness();
    store.select(['pocket']);

    manager.key(press('ArrowRight', 'nudgeRight'));
    manager.pointerDown(pointer(220, 15));
    manager.pointerUp(pointer(220, 15));
    manager.keyUp('ArrowRight');

    expect(boxOf(project(store), 'pocket').minX).toBe(201);
  });

  it('is kept when another key follows with the arrow still down', () => {
    const { manager, store } = harness();
    store.select(['outline']);
    const before = store.getState().document;

    manager.key(press('ArrowRight', 'nudgeRight'));
    manager.key(press('KeyX'));

    expect(store.inTransaction).toBe(false);
    expect(boxOf(project(store), 'outline').minX).toBe(1);
    expect(stepsSince(store, before)).toBe(1);
  });

  it('goes on as one step when Shift joins a held arrow, in the bigger steps', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    const before = store.getState().document;

    manager.key(press('ArrowRight', 'nudgeRight'));
    manager.key({ ...press('ShiftLeft'), key: 'Shift' });
    manager.key(press('ArrowRight', 'nudgeRightBig'));
    manager.keyUp('ArrowRight');
    manager.keyUp('ShiftLeft');

    expect(boxOf(project(store), 'pocket').minX).toBe(211);
    expect(stepsSince(store, before)).toBe(1);
  });

  it('does not move the selection while a shape is being drawn', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    manager.activate('rectangle');
    manager.pointerDown(pointer(400, 400));
    manager.pointerUp(pointer(400, 400));
    expect(manager.underway()).toBe(true);

    expect(tap(manager, 'ArrowRight', 'nudgeRight')).toBe(false);
    expect(boxOf(project(store), 'pocket').minX).toBe(200);
  });

  it('moves the selection with a drawing tool chosen and nothing under way', () => {
    const { manager, store } = harness();
    manager.activate('rectangle');
    store.select(['pocket']);

    expect(tap(manager, 'ArrowRight', 'nudgeRight')).toBe(true);
    expect(boxOf(project(store), 'pocket').minX).toBe(201);
  });

  it('moves nothing with Edit Points chosen, where an arrow is kept for the picked point', () => {
    const { manager, store } = harness();
    store.select(['pocket']);
    manager.activate('points');
    const before = store.getState().document;

    // Claimed, so no other command the maker gave an arrow runs instead.
    expect(tap(manager, 'ArrowRight', 'nudgeRight')).toBe(true);

    expect(store.getState().document).toBe(before);
    expect(store.inTransaction).toBe(false);
  });

  it('lands any run of steps on the storage quantum, exactly where their sum is', () => {
    const step = fc.constantFrom<readonly [ToolKey, number, number]>(
      ['nudgeLeft', -10, 0],
      ['nudgeRight', 10, 0],
      ['nudgeUp', 0, 10],
      ['nudgeDown', 0, -10],
      ['nudgeLeftBig', -100, 0],
      ['nudgeRightBig', 100, 0],
      ['nudgeUpBig', 0, 100],
      ['nudgeDownBig', 0, -100],
      ['nudgeLeftFine', -1, 0],
      ['nudgeRightFine', 1, 0],
      ['nudgeUpFine', 0, 1],
      ['nudgeDownFine', 0, -1],
    );
    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 40 }), fc.boolean(), (run, held) => {
        const { manager, store } = harness();
        store.select(['pocket']);

        // The same run as one held gesture or as separate taps ends in the same place.
        for (const [means] of run) {
          manager.key(press('ArrowRight', means));
          if (!held) manager.keyUp('ArrowRight');
        }
        manager.keyUp('ArrowRight');

        // Counted in tenths of a millimetre, so the sum is exact.
        const tenthsX = run.reduce((sum, [, dx]) => sum + dx, 0);
        const tenthsY = run.reduce((sum, [, , dy]) => sum + dy, 0);
        const box = boxOf(project(store), 'pocket');
        expect(Math.abs(box.minX - (200 + tenthsX / 10))).toBeLessThan(QUANTUM_MM / 2);
        expect(Math.abs(box.minY - tenthsY / 10)).toBeLessThan(QUANTUM_MM / 2);
        expect(Math.abs(box.maxX - box.minX - 40)).toBeLessThan(QUANTUM_MM / 2);
      }),
      { numRuns: 60 },
    );
  });
});

describe('selecting every piece with one key (3.14)', () => {
  const picked = (store: DocumentStore): string[] => [...store.getState().selection.parts];

  it('picks every piece, as their headings in Parts do', () => {
    const { manager, store } = harness();
    store.select(['stitch']);

    expect(tap(manager, 'KeyA', 'selectAllPieces')).toBe(true);

    expect(picked(store)).toEqual(['p', 'q']);
    expect(store.getState().selection.features.size).toBe(0);
  });

  it('leaves out a piece whose outline is locked', () => {
    const { manager, store } = harness();
    store.dispatch(setFeatureLocked(['outline'], true));

    tap(manager, 'KeyA', 'selectAllPieces');

    expect(picked(store)).toEqual(['q']);
  });

  it('leaves out a piece whose outline is hidden', () => {
    const { manager, store } = harness();
    store.dispatch(setFeatureVisible(['pocket'], false));

    tap(manager, 'KeyA', 'selectAllPieces');

    expect(picked(store)).toEqual(['p']);
  });

  it('is no step of history', () => {
    const { manager, store } = harness();
    const before = store.getState().document;

    tap(manager, 'KeyA', 'selectAllPieces');

    expect(stepsSince(store, before)).toBe(0);
  });

  it('then moves them all with one arrow', () => {
    const { manager, store } = harness();

    tap(manager, 'KeyA', 'selectAllPieces');
    tap(manager, 'ArrowUp', 'nudgeUpBig');

    expect(boxOf(project(store), 'outline').minY).toBe(10);
    expect(boxOf(project(store), 'pocket').minY).toBe(10);
  });

  it('is left alone while a shape is being drawn', () => {
    const { manager, store } = harness();
    manager.activate('rectangle');
    manager.pointerDown(pointer(400, 400));
    manager.pointerUp(pointer(400, 400));

    expect(tap(manager, 'KeyA', 'selectAllPieces')).toBe(false);
    expect(picked(store)).toEqual([]);
  });
});
