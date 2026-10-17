import { DocumentStore, emptyDocument } from '@leathercad/document';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createArcTool } from './arcTool.js';
import { createCircleTool } from './circleTool.js';
import { createLineTool, createPolylineTool } from './polylineTool.js';
import { createRectangleTool } from './rectangleTool.js';

/**
 * U.11 (R-11): the work bar's hints depend on whether a shape is under way,
 * between its clicks. A tool says so; the hints read it, and the window's Esc
 * ends it — so what the bar offers (Esc cancels) is true.
 */

function harness(): ToolContext {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);
  viewport.scale = 4;
  return {
    store,
    viewport,
    dispatch: (command) => store.dispatch(command),
    invalidate: () => {},
    drawAs: () => 'outline',
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

const click = (tool: Tool, ctx: ToolContext, x: number, y: number): void => {
  tool.onPointerDown?.(ctx, pointer(x, y));
  tool.onPointerUp?.(ctx, pointer(x, y));
};

let counter = 0;
const nextId = (): string => `u-${String(counter++)}`;

/** Each tool that has a between-clicks state, and a first click that starts it. */
const TOOLS: readonly [string, () => Tool][] = [
  ['rectangle', () => createRectangleTool(nextId)],
  ['circle', () => createCircleTool(nextId)],
  ['arc', () => createArcTool(nextId)],
  ['line', () => createLineTool(nextId)],
  ['polyline', () => createPolylineTool(nextId)],
];

describe('a tool under way', () => {
  it.each(TOOLS)(
    '%s: idle, then under way after its first click, then idle after Esc',
    (_, make) => {
      const ctx = harness();
      const tool = make();
      expect(tool.underway?.()).toBe(false);
      tool.onPointerMove?.(ctx, pointer(10, 10));
      click(tool, ctx, 10, 10);
      expect(tool.underway?.()).toBe(true);
      expect(tool.onKey?.(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false })).toBe(true);
      expect(tool.underway?.()).toBe(false);
    },
  );
});
