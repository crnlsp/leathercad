import {
  DocumentStore,
  addCutOut,
  addHardwareHole,
  addMarkingLine,
  addPart,
  addStitchLine,
  addTextLabel,
  emptyDocument,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  setFeatureVisible,
  type Command,
} from '@leathercad/document';
import { evaluate, type Project } from '@leathercad/domain';
import { PathOps, type Rect, type Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createRotateTool } from './rotateTool.js';
import { createScaleTool } from './scaleTool.js';
import { createSelectTool } from './selectTool.js';

/**
 * Q30: a piece's outline stands for the piece, for Move and Rotate as for
 * Flip. A 100 × 60 panel at the origin, centre (50, 30), with a slot near its
 * left edge, a rivet near its right, a label, and a marking that is hidden.
 */
function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const commands: Command[] = [
    addPart(rectanglePart('p', 'outline', 'Gusset', rectShape({ x: 0, y: 0 }, 100, 60, 4))),
    addStitchLine('p', 'stitch', 'outline', 3),
    addCutOut('p', 'slot', { kind: 'shape', shape: rectShape({ x: 10, y: 20 }, 20, 6) }),
    addHardwareHole('p', 'rivet', { x: 85, y: 45 }, 2),
    addTextLabel('p', 'label', { x: 40, y: 50 }, 'Left'),
    addMarkingLine('p', 'mark', {
      kind: 'path',
      path: PathOps.polyline([
        { x: 60, y: 10 },
        { x: 90, y: 10 },
      ]),
    }),
    setFeatureVisible(['mark'], false),
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

function pointer(at: Vec2): PointerInput {
  return { at, atPx: { x: 0, y: 0 }, button: 0, shiftKey: false, altKey: false, ctrlKey: false };
}

function drag(tool: Tool, ctx: ToolContext, from: Vec2, to: Vec2): void {
  tool.onPointerDown?.(ctx, pointer(from));
  tool.onPointerMove?.(ctx, pointer(to));
  tool.onPointerUp?.(ctx, pointer(to));
}

function boxOf(project: Project, id: string): Rect {
  const entry = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((candidate) => candidate.feature.id === id);
  if (entry?.ok !== true) throw new Error(`${id} did not build`);
  return PathOps.bbox(entry.path)!;
}

function expectBox(actual: Rect, expected: Rect, what: string): void {
  for (const side of ['minX', 'maxX', 'minY', 'maxY'] as const) {
    expect(actual[side], `${what} ${side}`).toBeCloseTo(expected[side], 6);
  }
}

const shifted = (box: Rect, dx: number, dy: number): Rect => ({
  minX: box.minX + dx,
  maxX: box.maxX + dx,
  minY: box.minY + dy,
  maxY: box.maxY + dy,
});

const CARRIED = ['slot', 'rivet', 'label', 'mark'];
const ON_THE_OUTLINE = { x: 0, y: 30 };

describe('moving a piece by its outline (Q30)', () => {
  it('takes the slot, the rivet, the label and the hidden marking along', () => {
    const { ctx, store } = harness();
    const before = store.getState().document.project;

    drag(createSelectTool(), ctx, ON_THE_OUTLINE, { x: 40, y: 30 });

    const after = store.getState().document.project;
    expectBox(boxOf(after, 'outline'), shifted(boxOf(before, 'outline'), 40, 0), 'outline');
    for (const id of CARRIED) expectBox(boxOf(after, id), shifted(boxOf(before, id), 40, 0), id);
  });

  it('is one step of undo', () => {
    const { ctx, store } = harness();
    const before = store.getState().document;

    drag(createSelectTool(), ctx, ON_THE_OUTLINE, { x: 40, y: 30 });
    store.undo();

    expect(store.getState().document).toBe(before);
  });

  it('does not snap the piece to its own slot or rivet while it moves', () => {
    const { ctx } = harness();
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer(ON_THE_OUTLINE));
    tool.onPointerMove?.(ctx, pointer({ x: 40, y: 30 }));

    expect(tool.snapExclusions?.(ctx)).toEqual(expect.arrayContaining(['outline', ...CARRIED]));
  });

  it('keeps still, and says why, when anything in the piece is locked', () => {
    const { ctx, store } = harness();
    store.dispatch(setFeatureLocked(['rivet'], true));
    const before = store.getState().document;
    const tool = createSelectTool();

    tool.onPointerDown?.(ctx, pointer(ON_THE_OUTLINE));
    tool.onPointerMove?.(ctx, pointer({ x: 40, y: 30 }));

    expect(tool.notice?.(ctx)).toMatchObject({
      code: 'FEATURE_LOCKED',
      facts: { featureId: 'rivet' },
    });
    tool.onPointerUp?.(ctx, pointer({ x: 40, y: 30 }));
    expect(store.getState().document.project).toBe(before.project);
  });

  it('still moves a cut-out dragged on its own, and nothing else', () => {
    const { ctx, store } = harness();
    const before = store.getState().document.project;

    drag(createSelectTool(), ctx, { x: 10, y: 23 }, { x: 10, y: 33 });

    const after = store.getState().document.project;
    expectBox(boxOf(after, 'slot'), shifted(boxOf(before, 'slot'), 0, 10), 'slot');
    expectBox(boxOf(after, 'rivet'), boxOf(before, 'rivet'), 'rivet');
    expectBox(boxOf(after, 'outline'), boxOf(before, 'outline'), 'outline');
  });
});

describe('turning a piece by its outline (Q30)', () => {
  // A quarter turn about the outline's centre (50, 30): press due east of
  // it, release due north.
  const turn = (tool: Tool, ctx: ToolContext) =>
    drag(tool, ctx, { x: 150, y: 30 }, { x: 50, y: 130 });
  // The slot, 10–30 × 20–26, turned a quarter about (50, 30).
  const SLOT_TURNED = { minX: 54, maxX: 60, minY: -10, maxY: 10 };

  it('turns the slot and the rivet with it, about the outline', () => {
    const { ctx, store } = harness();
    store.select(['outline']);

    turn(createRotateTool(), ctx);

    const after = store.getState().document.project;
    expectBox(boxOf(after, 'slot'), SLOT_TURNED, 'slot');
    expectBox(boxOf(after, 'rivet'), { minX: 33, maxX: 37, minY: 63, maxY: 67 }, 'rivet');
  });

  it('turns a part picked by its heading the same way', () => {
    const { ctx, store } = harness();
    store.selectParts(['p']);

    turn(createRotateTool(), ctx);

    expectBox(boxOf(store.getState().document.project, 'slot'), SLOT_TURNED, 'slot');
  });

  it('keeps still, and says why, when anything in the piece is locked', () => {
    const { ctx, store } = harness();
    store.dispatch(setFeatureLocked(['slot'], true));
    store.select(['outline']);
    const before = store.getState().document.project;
    const tool = createRotateTool();

    tool.onPointerDown?.(ctx, pointer({ x: 150, y: 30 }));
    tool.onPointerMove?.(ctx, pointer({ x: 50, y: 130 }));

    expect(tool.notice?.(ctx)).toMatchObject({ code: 'FEATURE_LOCKED' });
    tool.onPointerUp?.(ctx, pointer({ x: 50, y: 130 }));
    expect(store.getState().document.project).toBe(before);
  });
});

describe('stretching a piece that part of it refuses (Q30)', () => {
  it('changes nothing, rather than leaving the rivet and the label behind, and says why', () => {
    const { ctx, store } = harness();
    store.select(['outline', 'stitch', 'slot', 'rivet', 'label', 'mark']);
    const before = store.getState().document.project;
    const tool = createScaleTool();

    // Pressed 50 right of the centre, dragged to 100 right: twice as wide only.
    tool.onPointerDown?.(ctx, pointer({ x: 100, y: 30 }));
    tool.onPointerMove?.(ctx, pointer({ x: 150, y: 30 }));

    expect(tool.notice?.(ctx)).not.toBeNull();
    tool.onPointerUp?.(ctx, pointer({ x: 150, y: 30 }));
    expect(store.getState().document.project).toBe(before);
  });
});
