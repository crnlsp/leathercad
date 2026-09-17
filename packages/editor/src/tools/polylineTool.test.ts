import {
  DocumentStore,
  emptyDocument,
  addPart,
  rectShape,
  rectanglePart,
} from '@leathercad/document';
import type { Path, Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, Tool, ToolContext } from '../tool.js';
import type { DrawMode } from './commitDrawn.js';
import { Viewport } from '../viewport.js';
import { createLineTool, createPolylineTool } from './polylineTool.js';

/**
 * `outline` unless a test says otherwise, because that is the mode a closed
 * run belongs to. An **open** run is refused there since §3.8 — it encloses
 * nothing — so tests that draw one say which mode they mean.
 */
function harness(drawAs: DrawMode = 'outline'): { ctx: ToolContext; store: DocumentStore } {
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
      drawAs: () => drawAs,
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

/**
 * The drawn path of the feature the tool just made.
 *
 * The **last** one, not the first: every mode but *Outline* adds to a part
 * that already has an outline of its own for the drawing to join.
 */
function firstPath(store: DocumentStore): Path | null {
  const source = drawnFeature(store)?.source;
  return source?.kind === 'path' ? source.path : null;
}

function drawnFeature(store: DocumentStore) {
  const features = store.getState().document.project.parts.flatMap((part) => part.features);
  return features[features.length - 1];
}

const firstFeature = drawnFeature;

let counter = 0;
const nextId = (): string => `poly-${counter++}`;

/**
 * A part for a drawn feature to join.
 *
 * Every mode but *Outline* puts what it draws on the selected part, so these
 * tests need one to exist and be selected. *Outline* makes its own and never
 * reads the selection.
 */
function withPart(drawAs: DrawMode): { ctx: ToolContext; store: DocumentStore } {
  const made = harness(drawAs);
  if (drawAs !== 'outline') {
    const featureId = 'panel-cut';
    made.store.dispatch(
      addPart(
        rectanglePart(
          'panel' as never,
          featureId as never,
          'Panel',
          rectShape({ x: -50, y: -50 }, 200, 200),
        ),
      ),
    );
    made.store.select([featureId as never]);
  }
  return made;
}

describe('polyline tool', () => {
  it('commits an open run on Enter', () => {
    const { ctx, store } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
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
    // Drawn as a marking line, because the run this produces is open — and an
    // open run in Outline mode is now refused rather than filed as one (§3.8).
    const { ctx, store } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
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
    const { ctx, store } = withPart('marking');
    const tool = createLineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 30, y: 40 });

    const p = firstPath(store);
    expect(p?.segments).toHaveLength(1);
    expect(p?.closed).toBe(false);
  });

  it('takes no third point', () => {
    const { ctx, store } = withPart('marking');
    const tool = createLineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 30, y: 0 });
    click(tool, ctx, { x: 60, y: 0 });
    key(tool, ctx, 'Enter');

    // The third click starts a second line rather than extending the first.
    expect(store.getState().document.project.parts).toHaveLength(1);
  });
});

describe('a refused run is not thrown away', () => {
  /**
   * The UX principle, in the one place it currently bites: when a refusal has
   * a plausible correction, the work stays where the user can correct it.
   * Pressing Enter on an open run in Outline mode used to discard every point
   * and leave a sentence in the status bar — eleven clicks round a gusset for
   * a message.
   */
  /**
   * How many segments the rubber band is showing — one per point held, since
   * the preview runs from the first point through to the cursor.
   */
  const previewSegments = (tool: Tool, ctx: ToolContext): number => {
    const item = tool.buildOverlay?.(ctx).items.find((i) => i.kind === 'path');
    return item === undefined || item.kind !== 'path' ? 0 : item.path.segments.length;
  };

  it('keeps the points, and says why, when an open run is refused', () => {
    const { ctx, store } = harness('outline');
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 20, y: 20 });
    key(tool, ctx, 'Enter');

    expect(store.getState().document.project.parts).toHaveLength(0);
    expect(tool.notice?.(ctx)).toMatchObject({
      code: 'CONTOUR_NOT_CLOSED',
      facts: { role: 'outer' },
    });
    // The rubber band is still showing all three points, plus the cursor.
    expect(previewSegments(tool, ctx)).toBe(3);
  });

  it('lets the user close what was refused, which is the correction', () => {
    const { ctx, store } = harness('outline');
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 20, y: 20 });
    key(tool, ctx, 'Enter');

    // Clicking back on the first point closes it — the same gesture as always,
    // on the run that was refused rather than on a fresh one.
    click(tool, ctx, { x: 0, y: 0 });

    const path = firstPath(store);
    expect(path?.closed).toBe(true);
    expect(path?.segments).toHaveLength(3);
    expect(tool.notice?.(ctx)).toBeNull();
  });

  it('lets the user back a point off a refused run', () => {
    const { ctx } = harness('outline');
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 20, y: 20 });
    key(tool, ctx, 'Enter');
    key(tool, ctx, 'Backspace');

    // Two points left of the three that were refused.
    expect(previewSegments(tool, ctx)).toBe(2);
  });

  it('still lets Escape mean "throw it away"', () => {
    const { ctx } = harness('outline');
    const tool = createPolylineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    key(tool, ctx, 'Enter');
    key(tool, ctx, 'Escape');

    expect(tool.buildOverlay?.(ctx).items).toHaveLength(0);
  });

  it('does not strand the line tool, which can never close', () => {
    // Two points and it finishes itself, so there is no correction to make
    // here — the reason is kept, the points are not, and the user is free to
    // switch modes or tools rather than clicking into a refusal that repeats.
    const { ctx } = harness('outline');
    const tool = createLineTool(nextId);

    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });

    expect(tool.notice?.(ctx)).toMatchObject({ code: 'CONTOUR_NOT_CLOSED' });
    expect(tool.buildOverlay?.(ctx).items).toHaveLength(0);
  });
});
