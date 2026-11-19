import {
  DocumentStore,
  addFoldLine,
  addHardwareHole,
  addPart,
  emptyDocument,
  mirrorAcrossFold,
  rectShape,
  rectanglePart,
  type Command,
} from '@leathercad/document';
import { evaluate, validate } from '@leathercad/domain';
import { polyline, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Clearance, MoveReadout } from '../distances.js';
import { ToolManager, type KeyInput, type PointerInput, type ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createSelectTool } from './selectTool.js';

/**
 * 3.17: a move says how far it went and how near the edges it is
 * (smart-guides spec §7, §11). The key fob's strap, 140 × 26 with round ends
 * and its fold at x = 70, a 4 mm rivet on it and its counterpart mirrored
 * across the fold. At 4 px/mm.
 */
function keyFob(at: Vec2 = { x: 30, y: 13 }, extra: Command[] = []) {
  const store = new DocumentStore(emptyDocument('proj'));
  for (const command of [
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
  ]) {
    store.dispatch(command);
  }
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;
  const moved: MoveReadout[] = [];
  const ctx: ToolContext = {
    viewport,
    store,
    dispatch: (c) => store.dispatch(c),
    invalidate: () => {},
    distanceWords: (mm) => `${mm.toFixed(1)} mm`,
    moved: (readout) => moved.push(readout),
  };
  const tool = createSelectTool();
  return { store, manager: new ToolManager(ctx, tool, [tool]), moved };
}

function pointer(at: Vec2, ctrlKey = false): PointerInput {
  return { at, atPx: { x: 0, y: 0 }, button: 0, shiftKey: false, altKey: false, ctrlKey };
}

/** Pressed on the rivet's rim at 0°, then carried by `by` with Ctrl held: exactly that far. */
function carry(manager: ToolManager, rivet: Vec2, by: Vec2, release = true): void {
  const from = { x: rivet.x + 2, y: rivet.y };
  manager.pointerDown(pointer(from));
  for (let step = 1; step <= 4; step++) {
    const t = step / 4;
    manager.pointerMove(pointer({ x: from.x + by.x * t, y: from.y + by.y * t }, true));
  }
  if (release) manager.pointerUp(pointer({ x: from.x + by.x, y: from.y + by.y }, true));
}

/** What Problems lists of the rivet and its counterpart, in a clearance's words. */
function listed(store: DocumentStore): Clearance['verdict'] {
  const codes = validate(evaluate(store.getState().document.project))
    .filter((d) => d.featureId === 'rivet' || d.featureId === 'rivet-b')
    .map((d) => d.problem.code);
  return codes.includes('OUTSIDE_PART')
    ? 'off'
    : codes.includes('HOLE_TOO_CLOSE_TO_EDGE')
      ? 'too-close'
      : 'clear';
}

describe('live distances and clearance (3.17)', () => {
  it('warns while moving exactly when Problems lists the rivet after the drop', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -45, max: 40, noNaN: true }),
        fc.double({ min: -16, max: 16, noNaN: true }),
        (dx, dy) => {
          // Far enough for a press to become a drag.
          fc.pre(Math.hypot(dx, dy) > 1);
          const { store, manager, moved } = keyFob();
          carry(manager, { x: 30, y: 13 }, { x: dx, y: dy }, false);
          const live = manager.readout();
          manager.pointerUp(pointer({ x: 32 + dx, y: 13 + dy }, true));

          expect(live?.clearance?.verdict).toBe(listed(store));
          expect(moved).toEqual([live]);
        },
      ),
    );
  });

  it('turns the clearance to a warning where the rim comes within 1.5 mm of the edge', () => {
    // The strap's top edge is at y = 26; the rivet's rim is 2 mm above its centre.
    const near = keyFob();
    carry(near.manager, { x: 30, y: 13 }, { x: 0, y: 9.6 });
    expect(near.moved[0]?.clearance?.verdict).toBe('too-close');
    expect(near.moved[0]?.clearance?.clearanceMm).toBeCloseTo(1.4, 9);

    const clear = keyFob();
    carry(clear.manager, { x: 30, y: 13 }, { x: 0, y: 9.4 });
    expect(clear.moved[0]?.clearance?.verdict).toBe('clear');
    expect(clear.moved[0]?.clearance?.clearanceMm).toBeCloseTo(1.6, 9);
  });

  it('reads how far it went, and the four gaps from the rim to the outline', () => {
    const { manager } = keyFob();
    carry(manager, { x: 30, y: 13 }, { x: 10, y: 3 }, false);
    const readout = manager.readout();
    const gaps = Object.fromEntries(
      readout?.rays.map((ray) => [ray.direction, ray.distanceMm]) ?? [],
    );

    expect(readout?.deltaMm).toEqual({ x: 10, y: 3 });
    expect(gaps.up).toBeCloseTo(26 - 16 - 2, 9);
    expect(gaps.down).toBeCloseTo(16 - 2, 9);
    // Into the round end, centred at (127, 13), three millimetres off its axis.
    expect(gaps.right).toBeCloseTo(127 + Math.sqrt(13 ** 2 - 3 ** 2) - 40 - 2, 9);
  });

  it('draws each gap with its length, and none the screen has no room to label', () => {
    const { manager } = keyFob();
    // Up to y = 21: 3 mm above the rim, 12 px at 4 px/mm, under the 24 px a label needs.
    carry(manager, { x: 30, y: 13 }, { x: 10, y: 8 }, false);
    const words = manager
      .overlay()
      .items.flatMap((item) => (item.kind === 'overlay-text' ? [item.text] : []));

    expect(words).toContain('19.0 mm');
    expect(words).not.toContain('3.0 mm');
  });

  it('reads a whole piece moved by how far it went alone', () => {
    const { manager } = keyFob();
    manager.pointerDown(pointer({ x: 100, y: 5 }));
    manager.pointerMove(pointer({ x: 110, y: 5 }, true));

    expect(manager.readout()).toEqual({ deltaMm: { x: 10, y: 0 }, rays: [], clearance: null });
  });

  it('says nothing of a move that was refused', () => {
    // The counterpart across the fold is placed by it, and moves only with the rivet.
    const { manager, moved } = keyFob();
    carry(manager, { x: 110, y: 13 }, { x: 5, y: 0 }, false);
    expect(manager.readout()).toBeNull();
    manager.pointerUp(pointer({ x: 117, y: 13 }, true));
    expect(moved).toEqual([]);
  });
  it('says a nudge kept, with the clearance it left', () => {
    const { store, manager, moved } = keyFob({ x: 30, y: 22.5 });
    store.select(['rivet']);
    const key: KeyInput = {
      key: 'ArrowUp',
      code: 'ArrowUp',
      means: new Set(['nudgeUp']),
      shiftKey: false,
      ctrlKey: false,
    };
    manager.key(key);
    manager.keyUp('ArrowUp');

    // The rim at 25.5, half a millimetre under the edge.
    expect(moved).toHaveLength(1);
    expect(moved[0]?.deltaMm).toEqual({ x: 0, y: 1 });
    expect(moved[0]?.clearance?.verdict).toBe('too-close');
    expect(moved[0]?.clearance?.clearanceMm).toBeCloseTo(0.5, 9);
  });
});
