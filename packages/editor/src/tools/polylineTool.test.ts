import { DocumentStore, emptyDocument } from '@leathercad/document';
import type { Path, Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createLineTool, createPolylineTool } from './polylineTool.js';

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
    },
  };
}

const pointer = (at: Vec2, overrides: Partial<PointerInput> = {}): PointerInput => ({
  at,
  atPx: { x: 0, y: 0 },
  button: 0,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  ...overrides,
});

const click = (tool: Tool, ctx: ToolContext, at: Vec2, shiftKey = false): void => {
  tool.onPointerMove?.(ctx, pointer(at, { shiftKey }));
  tool.onPointerDown?.(ctx, pointer(at, { shiftKey }));
};

const key = (tool: Tool, ctx: ToolContext, k: string): void =>
  tool.onKey?.(ctx, { key: k, shiftKey: false, ctrlKey: false });

/** The drawn path of the first feature, if it has one. */
function firstPath(store: DocumentStore): Path | null {
  const source = store.getState().document.project.parts[0]?.features[0]?.source;
  return source?.kind === 'path' ? source.path : null;
}

const firstFeature = (store: DocumentStore) =>
  store.getState().document.project.parts[0]?.features[0];

let counter = 0;
const nextId = (): string => `poly-${counter++}`;

describe('polyline tool', () => {
  it('commits an open run on Enter', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 10, y: 0 });
    click(tool, ctx, { x: 10, y: 10 });
    key(tool, ctx, 'Enter');

    const p = firstPath(store);
    expect(p?.segments).toHaveLength(2);
    expect(p?.closed).toBe(false);
  });

  it('makes an open run a marking line, not something to cut', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 10, y: 0 });
    key(tool, ctx, 'Enter');

    // A line with two ends is not an outline; calling it one would put a part
    // in the list that can never be cut.
    expect(firstFeature(store)?.kind).toBe('marking-line');
  });

  it('closes when the last click lands on the first point', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 20, y: 20 });
    click(tool, ctx, { x: 0.5, y: 0.5 });

    const p = firstPath(store);
    expect(p?.closed).toBe(true);
    // Three points, three segments once closed — no duplicate vertex.
    expect(p?.segments).toHaveLength(3);
  });

  it('makes a closed run a cut contour', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 20, y: 20 });
    click(tool, ctx, { x: 0, y: 0 });

    expect(firstFeature(store)?.kind).toBe('cut-contour');
  });

  it('will not close on two points, which encloses nothing', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 0, y: 0 });
    key(tool, ctx, 'Enter');

    // The third click is a third point, not a closure: two points enclose no
    // area, so landing back on the start cannot mean "close this".
    const p = firstPath(store);
    expect(p?.closed).toBe(false);
    expect(p?.segments).toHaveLength(2);
  });

  it('abandons everything on Escape', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 10, y: 0 });
    key(tool, ctx, 'Escape');
    key(tool, ctx, 'Enter');

    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('drops the last point on Backspace', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 10, y: 0 });
    click(tool, ctx, { x: 10, y: 99 });
    key(tool, ctx, 'Backspace');
    click(tool, ctx, { x: 10, y: 10 });
    key(tool, ctx, 'Enter');

    const p = firstPath(store);
    expect(p?.segments).toHaveLength(2);
    // The 99 was removed, so the run ends at 10.
    expect(p?.segments[1]?.kind === 'line' ? p.segments[1].b.y : null).toBeCloseTo(10, 9);
  });

  it('commits nothing for a single click', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 5, y: 5 });
    key(tool, ctx, 'Enter');

    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('constrains the segment angle with Shift', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    // 40° from horizontal snaps to 45°, keeping the length.
    click(tool, ctx, { x: 10, y: 8.39 }, true);
    key(tool, ctx, 'Enter');

    const segment = firstPath(store)?.segments[0];
    const end = segment?.kind === 'line' ? segment.b : null;
    expect(end).not.toBeNull();
    expect(Math.atan2(end!.y, end!.x)).toBeCloseTo(Math.PI / 4, 6);
    expect(Math.hypot(end!.x, end!.y)).toBeCloseTo(Math.hypot(10, 8.39), 6);
  });

  it('selects what it made', () => {
    const { ctx, store } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 10, y: 0 });
    key(tool, ctx, 'Enter');

    expect(store.getState().selection.features.size).toBe(1);
  });

  it('shows the run and angle while drawing', () => {
    const { ctx } = harness();
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    tool.onPointerMove?.(ctx, pointer({ x: 10, y: 0 }));

    const text = tool.buildOverlay?.(ctx).items.find((i) => i.kind === 'overlay-text');
    expect(text?.kind === 'overlay-text' ? text.text : '').toContain('10.0 mm');
  });
});

describe('line tool', () => {
  it('finishes itself on the second click', () => {
    const { ctx, store } = harness();
    const tool = createLineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 30, y: 40 });

    const p = firstPath(store);
    expect(p?.segments).toHaveLength(1);
    expect(p?.closed).toBe(false);
  });

  it('takes no third point', () => {
    const { ctx, store } = harness();
    const tool = createLineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 30, y: 0 });
    click(tool, ctx, { x: 60, y: 0 });
    key(tool, ctx, 'Enter');

    // The third click starts a second line rather than extending the first.
    expect(store.getState().document.project.parts).toHaveLength(1);
  });
});
