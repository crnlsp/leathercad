import {
  DocumentStore,
  emptyDocument,
  addPart,
  rectShape,
  rectanglePart,
} from '@leathercad/document';
import { PathOps, SegmentOps, type Path, type Vec2 } from '@leathercad/geometry';
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

const key = (tool: Tool, ctx: ToolContext, k: string): void => {
  tool.onKey?.(ctx, { key: k, shiftKey: false, ctrlKey: false });
};

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

  it('draws with a drag too, like every other two-point tool (F.1)', () => {
    // Rectangle and Circle were drag-only and Line click-only, so a maker
    // dragging a fold — as the header said to — got a rubber band and nothing.
    const { ctx, store } = withPart('marking');
    const tool = createLineTool(nextId);

    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerMove?.(ctx, pointer({ x: 15, y: 20 }));
    tool.onPointerUp?.(ctx, pointer({ x: 30, y: 40 }));

    const p = firstPath(store);
    expect(p?.segments).toHaveLength(1);
    expect(PathOps.length(p!)).toBeCloseTo(50, 9);
  });

  it('treats a press that barely moves as a click, not a line', () => {
    // A hand is not still: under a few pixels of travel the press is the
    // first click of two, and the line is not finished.
    const { ctx, store } = withPart('marking');
    const tool = createLineTool(nextId);

    tool.onPointerDown?.(ctx, pointer({ x: 0, y: 0 }));
    tool.onPointerUp?.(ctx, pointer({ x: 0.2, y: 0.1 }));

    expect(firstPath(store)).toBeNull();
    click(tool, ctx, { x: 30, y: 40 });
    expect(firstPath(store)?.segments).toHaveLength(1);
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

/**
 * Slice 3.9a: arc segments in the polyline tool.
 *
 * The smallest thing that draws the product spec's own example — a card
 * pocket with a curved thumb scoop in its top edge. Before it, no closed
 * outline could have a curve in it: the arc tool makes an open marking line,
 * and the polyline made only straights. Mid-run, A makes the next segment an
 * arc and L a straight again; an arc takes two clicks, as the arc tool does:
 * its end, then a point it passes through.
 */
describe('arc segments (3.9a)', () => {
  /** Draws the 95 × 60 mm pocket, its scoop 30 mm wide and 12 mm deep. */
  function drawPocket(tool: Tool, ctx: ToolContext): void {
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 95, y: 0 });
    click(tool, ctx, { x: 95, y: 60 });
    click(tool, ctx, { x: 62.5, y: 60 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 32.5, y: 60 }); // where the scoop ends
    click(tool, ctx, { x: 47.5, y: 48 }); // a point it passes through
    key(tool, ctx, 'l');
    click(tool, ctx, { x: 0, y: 60 });
    click(tool, ctx, { x: 0.5, y: 0.5 }); // back on the first point: closed
  }

  it('draws a pocket with a thumb scoop as one closed outline', () => {
    const { ctx, store } = harness('outline');
    const tool = createPolylineTool(nextId);
    drawPocket(tool, ctx);

    expect(firstFeature(store)?.kind).toBe('cut-contour');
    const p = firstPath(store)!;
    expect(p.closed).toBe(true);
    expect(p.segments.map((s) => s.kind)).toEqual(['line', 'line', 'line', 'arc', 'line', 'line']);
    expect(PathOps.validate(p)).toEqual([]);

    // The scoop runs from where it was started to where it was ended, through
    // the point that was clicked — dipping into the pocket, not out of it.
    const scoop = p.segments[3]!;
    if (scoop.kind !== 'arc') throw new Error('unreachable');
    const on = (at: Vec2) => Math.hypot(at.x - scoop.centre.x, at.y - scoop.centre.y);
    expect(on({ x: 47.5, y: 48 })).toBeCloseTo(scoop.radius, 9);
    expect(SegmentOps.start(scoop).x).toBeCloseTo(62.5, 9);
    expect(SegmentOps.end(scoop).x).toBeCloseTo(32.5, 9);
    expect(SegmentOps.pointAt(scoop, 0.5).y).toBeCloseTo(48, 9);
  });

  it('claims A and L only mid-run, so they still switch tools otherwise', () => {
    const { ctx } = harness('outline');
    const tool = createPolylineTool(nextId);
    const press = (k: string) => tool.onKey?.(ctx, { key: k, shiftKey: false, ctrlKey: false });

    // Idle: A is the Arc tool and L the Line tool, as ever.
    expect(press('a')).not.toBe(true);
    expect(press('l')).not.toBe(true);

    // Mid-run they are the next segment, and switching tools would throw the
    // run away — so the tool keeps them, capital or not.
    click(tool, ctx, { x: 0, y: 0 });
    expect(press('a')).toBe(true);
    expect(press('L')).toBe(true);
    expect(press('r')).not.toBe(true);

    // The line tool finishes itself at two points: nothing to choose.
    const line = createLineTool(nextId);
    click(line, ctx, { x: 0, y: 0 });
    expect(line.onKey?.(ctx, { key: 'a', shiftKey: false, ctrlKey: false })).not.toBe(true);
  });

  it('says so while an arc’s end is being placed', () => {
    const { ctx } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    key(tool, ctx, 'a');
    tool.onPointerMove?.(ctx, pointer({ x: 30, y: 0 }));
    const text = tool.buildOverlay?.(ctx).items.find((i) => i.kind === 'overlay-text');
    expect(text?.kind === 'overlay-text' ? text.text : '').toMatch(/^Arc to · 30\.0 mm/);
  });

  it('starts every run straight', () => {
    // A is for this run. The next one starts as every polyline always has.
    const { ctx, store } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    key(tool, ctx, 'a');
    key(tool, ctx, 'Escape');
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 20, y: 20 });
    click(tool, ctx, { x: 0.5, y: 0.5 });
    expect(firstPath(store)!.segments.every((s) => s.kind === 'line')).toBe(true);
  });

  it('stays straight when nothing asks for an arc', () => {
    const { ctx, store } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    click(tool, ctx, { x: 20, y: 20 });
    click(tool, ctx, { x: 0.5, y: 0.5 });
    expect(firstPath(store)!.segments.every((s) => s.kind === 'line')).toBe(true);
  });

  it('closes with an arc, when the arc ends on the first point', () => {
    // A D: one straight, and a curve back to where it began.
    const { ctx, store } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 40, y: 0 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 0.5, y: 0.5 });
    click(tool, ctx, { x: 20, y: 20 });

    const p = firstPath(store)!;
    expect(p.closed).toBe(true);
    expect(p.segments.map((s) => s.kind)).toEqual(['line', 'arc']);
    expect(PathOps.validate(p)).toEqual([]);
  });

  it('previews the arc through the pointer once its end is placed', () => {
    const { ctx } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 30, y: 0 });
    tool.onPointerMove?.(ctx, pointer({ x: 15, y: 10 }));

    const items = tool.buildOverlay?.(ctx).items ?? [];
    const preview = items.find((i) => i.kind === 'path');
    expect(preview?.kind === 'path' && preview.path.segments.map((s) => s.kind)).toEqual(['arc']);
    // The number a maker reads for a curve is its radius.
    const text = items.find((i) => i.kind === 'overlay-text');
    expect(text?.kind === 'overlay-text' ? text.text : '').toMatch(/^R /);
  });

  it('takes back only the arc’s end on Backspace, then the point before it', () => {
    const { ctx, store } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 40, y: 0 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 40, y: 30 }); // an end, waiting for its bulge
    key(tool, ctx, 'Backspace');

    // The end is gone and the run is intact: the next click is an end again.
    click(tool, ctx, { x: 40, y: 40 });
    click(tool, ctx, { x: 50, y: 20 });
    key(tool, ctx, 'l');
    click(tool, ctx, { x: 0, y: 40 });
    click(tool, ctx, { x: 0.5, y: 0.5 });

    const p = firstPath(store)!;
    expect(p.segments.map((s) => s.kind)).toEqual(['line', 'arc', 'line', 'line']);
    expect(SegmentOps.end(p.segments[1]!).y).toBeCloseTo(40, 9);
  });

  it('ignores a bulge click on either end of the arc, which describes no circle', () => {
    const { ctx } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 30, y: 0 });
    expect(() => click(tool, ctx, { x: 30, y: 0 })).not.toThrow();
    expect(() => click(tool, ctx, { x: 0, y: 0 })).not.toThrow();
    // Still waiting for a real bulge.
    tool.onPointerMove?.(ctx, pointer({ x: 15, y: 10 }));
    const preview = tool.buildOverlay?.(ctx).items.find((i) => i.kind === 'path');
    expect(preview?.kind === 'path' && preview.path.segments.map((s) => s.kind)).toEqual(['arc']);
  });

  it('draws the chord when the bulge is on it, as the arc tool does', () => {
    const { ctx, store } = withPart('marking');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 30, y: 0 });
    click(tool, ctx, { x: 15, y: 0 });
    key(tool, ctx, 'Enter');
    expect(firstPath(store)!.segments.map((s) => s.kind)).toEqual(['line']);
  });

  it('never throws while previewing, wherever the pointer is', () => {
    // buildOverlay runs inside the paint: a throw there stops the canvas.
    const { ctx } = harness('outline');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 30, y: 0 });
    for (const at of [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 15, y: 0 },
    ]) {
      tool.onPointerMove?.(ctx, pointer(at));
      expect(() => tool.buildOverlay?.(ctx)).not.toThrow();
    }
  });

  it('finishes an open run on Enter without an arc that has no bulge yet', () => {
    const { ctx, store } = withPart('marking');
    const tool = createPolylineTool(nextId);
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 20, y: 0 });
    key(tool, ctx, 'a');
    click(tool, ctx, { x: 40, y: 0 });
    key(tool, ctx, 'Enter');
    expect(firstPath(store)!.segments.map((s) => s.kind)).toEqual(['line']);
  });
});
