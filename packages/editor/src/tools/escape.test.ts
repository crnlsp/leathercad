import { DocumentStore, addPart, emptyDocument, rectShape, shapePart } from '@leathercad/document';
import { describe, expect, it } from 'vitest';

import {
  ToolManager,
  type KeyInput,
  type PointerInput,
  type Tool,
  type ToolContext,
} from '../tool.js';
import { Viewport } from '../viewport.js';
import { createArcTool } from './arcTool.js';
import { createCircleTool } from './circleTool.js';
import { createEditPointsTool } from './editPointsTool.js';
import { createGuideTool } from './guideTool.js';
import { createHardwareTool } from './hardwareTool.js';
import { createMeasureTool } from './measureTool.js';
import { createLineTool, createPolylineTool } from './polylineTool.js';
import { createRectangleTool } from './rectangleTool.js';
import { createRotateTool } from './rotateTool.js';
import { createScaleTool } from './scaleTool.js';
import { createSelectTool } from './selectTool.js';
import { createTextTool } from './textTool.js';
import { keyInput } from './keys.fixture.js';

/**
 * Escape is claimed only when it gives something up (U.5).
 *
 * A tool that cancels a gesture, or clears a selection, claims the key; one
 * with nothing to give up leaves it to the window, where it closes an overlay
 * or leaves focus mode. Without the claim one press did both.
 */
const ESCAPE: KeyInput = keyInput('Escape');

function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;
  return {
    store,
    ctx: {
      viewport,
      store,
      dispatch: (command) => store.dispatch(command),
      invalidate: () => {},
      drawAs: () => 'outline',
    },
  };
}

const pointer = (x: number, y: number): PointerInput => ({
  at: { x, y },
  atPx: { x: 0, y: 0 },
  button: 0,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
});

let counter = 0;
const nextId = (): string => `id-${String(counter++)}`;

const TOOLS: readonly [string, () => Tool][] = [
  ['select', () => createSelectTool()],
  ['rectangle', () => createRectangleTool(nextId)],
  ['circle', () => createCircleTool(nextId)],
  ['arc', () => createArcTool(nextId)],
  ['line', () => createLineTool(nextId)],
  ['polyline', () => createPolylineTool(nextId)],
  ['measure', () => createMeasureTool(nextId, () => 'aligned')],
  ['rotate', () => createRotateTool()],
  ['scale', () => createScaleTool()],
  ['text', () => createTextTool(nextId)],
  ['hardware', () => createHardwareTool(nextId)],
  ['points', () => createEditPointsTool()],
  ['guide', () => createGuideTool(nextId)],
];

describe('Escape with nothing to give up', () => {
  it.each(TOOLS)('is left to the window by the %s tool', (_, make) => {
    const { ctx } = harness();
    expect(make().onKey?.(ctx, ESCAPE) === true).toBe(false);
  });
});

describe('Escape that gives something up', () => {
  it('is claimed by a drawing in progress, once', () => {
    for (const make of [
      () => createRectangleTool(nextId),
      () => createCircleTool(nextId),
      () => createArcTool(nextId),
      () => createPolylineTool(nextId),
    ]) {
      const { ctx } = harness();
      const tool = make();
      tool.onPointerMove?.(ctx, pointer(0, 0));
      tool.onPointerDown?.(ctx, pointer(0, 0));
      tool.onPointerUp?.(ctx, pointer(0, 0));
      expect(tool.onKey?.(ctx, ESCAPE)).toBe(true);
      expect(tool.onKey?.(ctx, ESCAPE) === true).toBe(false);
    }
  });

  it('is claimed by Select while something is selected, once', () => {
    const { ctx, store } = harness();
    store.dispatch(
      addPart(shapePart('part', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 100, 50))),
    );
    store.select(['outline']);
    const tool = createSelectTool();
    expect(tool.onKey?.(ctx, ESCAPE)).toBe(true);
    expect(store.getState().selection.features.size).toBe(0);
    expect(tool.onKey?.(ctx, ESCAPE) === true).toBe(false);
  });
});

/**
 * Escape on an idle tool returns to Select (QA U11): a drawing tool otherwise
 * stayed on after its shape, and the next click on empty board began another.
 * Asked of the manager, the one place a key reaches a tool, so every tool is
 * held to it alike.
 */
describe('Escape with nothing under way, in the manager', () => {
  function managed(): { manager: ToolManager; store: DocumentStore } {
    const { ctx, store } = harness();
    const tools = TOOLS.map(([, make]) => make());
    return { manager: new ToolManager(ctx, tools[0]!, tools), store };
  }

  it.each(TOOLS.filter(([id]) => id !== 'select'))('returns the idle %s tool to Select', (id) => {
    const { manager } = managed();
    manager.activate(id);
    expect(manager.key(ESCAPE)).toBe(true);
    expect(manager.activeTool.id).toBe('select');
  });

  it('leaves Select as it is, and the key to the window', () => {
    const { manager } = managed();
    expect(manager.key(ESCAPE)).toBe(false);
    expect(manager.activeTool.id).toBe('select');
  });

  it.each(['rectangle', 'circle', 'arc', 'polyline'])(
    'cancels a %s under way first, and leaves the tool on the second press',
    (id) => {
      const { manager } = managed();
      manager.activate(id);
      manager.pointerMove(pointer(0, 0));
      manager.pointerDown(pointer(0, 0));
      manager.pointerUp(pointer(0, 0));
      expect(manager.key(ESCAPE)).toBe(true);
      expect(manager.activeTool.id).toBe(id);
      expect(manager.key(ESCAPE)).toBe(true);
      expect(manager.activeTool.id).toBe('select');
    },
  );

  it('keeps the tool on between shapes drawn one after another', () => {
    const { manager, store } = managed();
    manager.activate('rectangle');
    for (const x of [0, 100]) {
      manager.pointerMove(pointer(x, 0));
      manager.pointerDown(pointer(x, 0));
      manager.pointerMove(pointer(x + 40, 30));
      manager.pointerUp(pointer(x + 40, 30));
    }
    expect(store.getState().document.project.parts).toHaveLength(2);
    expect(manager.activeTool.id).toBe('rectangle');
  });
});
