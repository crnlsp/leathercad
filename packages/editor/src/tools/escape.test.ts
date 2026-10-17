import { DocumentStore, addPart, emptyDocument, rectShape, shapePart } from '@leathercad/document';
import { describe, expect, it } from 'vitest';

import type { KeyInput, PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createArcTool } from './arcTool.js';
import { createCircleTool } from './circleTool.js';
import { createEditPointsTool } from './editPointsTool.js';
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
