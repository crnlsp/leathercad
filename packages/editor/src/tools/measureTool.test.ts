import {
  addPart,
  DocumentStore,
  emptyDocument,
  rectanglePart,
  rectShape,
} from '@leathercad/document';
import { vec } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { PointerInput, ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { createMeasureTool } from './measureTool.js';

let counter = 0;
const nextId = (): string => `m-${(counter += 1)}`;

/**
 * A panel whose corners are (100,0) (100,60) (0,60) (0,0) — the same rectangle
 * `anchorPick.test.ts` uses, so an anchor index means the same thing in both.
 *
 * The viewport is left at its default 4 px/mm with a device pixel ratio of 1,
 * which turns the tool's 12 px pick radius into **3 mm**.
 */
function harness(): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  store.dispatch(
    addPart(rectanglePart('p1' as never, 'cut-1' as never, 'Panel', rectShape(vec(0, 0), 100, 60))),
  );

  const viewport = new Viewport();
  viewport.resize(800, 600, 1);

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

const click = (x: number, y: number): PointerInput => ({
  at: vec(x, y),
  atPx: vec(0, 0),
  button: 0,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
});

const features = (store: DocumentStore) => store.getState().document.project.parts[0]!.features;

describe('the measure tool', () => {
  it('refuses a second end on another piece, saying so, and adds nothing (Q11)', () => {
    const { ctx, store } = harness();
    store.dispatch(
      addPart(
        rectanglePart('p2' as never, 'cut-2' as never, 'Back', rectShape(vec(400, 0), 90, 60)),
      ),
    );
    const tool = createMeasureTool(nextId, () => 'aligned');

    tool.onPointerDown!(ctx, click(0, 0));
    tool.onPointerDown!(ctx, click(400, 0));

    expect(tool.notice!(ctx)).toMatchObject({
      code: 'MEASURE_ACROSS_PARTS',
      facts: { otherPartName: 'Back' },
    });
    expect(features(store).some((f) => f.kind === 'measurement')).toBe(false);
  });

  it("takes the corner on the first end's piece where two pieces touch", () => {
    const { ctx, store } = harness();
    // A second piece whose corner (100,0) sits exactly on the panel's.
    store.dispatch(
      addPart(
        rectanglePart('p2' as never, 'cut-2' as never, 'Right', rectShape(vec(100, 0), 90, 60)),
      ),
    );
    const tool = createMeasureTool(nextId, () => 'aligned');

    tool.onPointerDown!(ctx, click(0, 0));
    tool.onPointerDown!(ctx, click(100, 0));

    const measurement = features(store).find((f) => f.kind === 'measurement');
    expect(measurement?.source).toMatchObject({ b: { featureId: 'cut-1' } });
  });

  it('dimensions between two corners', () => {
    const { ctx, store } = harness();
    const tool = createMeasureTool(nextId, () => 'aligned');

    tool.onPointerDown!(ctx, click(0, 0));
    tool.onPointerDown!(ctx, click(100, 0));

    const measurement = features(store).find((f) => f.kind === 'measurement');
    expect(measurement).toBeDefined();
    expect(measurement!.source).toMatchObject({
      kind: 'measurement',
      measure: 'aligned',
      a: { kind: 'anchor', featureId: 'cut-1', anchor: 3 },
      b: { kind: 'anchor', featureId: 'cut-1', anchor: 0 },
    });
  });

  it('takes a corner a little way off, within the pick radius', () => {
    const { ctx, store } = harness();
    const tool = createMeasureTool(nextId, () => 'horizontal');

    tool.onPointerDown!(ctx, click(1, 1));
    tool.onPointerDown!(ctx, click(99, 1));

    expect(features(store).some((f) => f.kind === 'measurement')).toBe(true);
    // Not the point clicked: the anchor, so the number follows the corner.
    expect(tool.notice!(ctx)).toBeNull();
  });

  it('refuses a click out in the open, with a reason and no measurement', () => {
    const { ctx, store } = harness();
    const tool = createMeasureTool(nextId, () => 'aligned');

    tool.onPointerDown!(ctx, click(50, 30));

    // X1: nothing happens, and the reason is readable. Making a dimension to a
    // bare point is the failure this refusal exists to prevent — it would go
    // stale the moment the drawing moved, without saying so.
    expect(tool.notice!(ctx)?.code).toBe('MEASURE_NEEDS_ANCHOR');
    expect(features(store).some((f) => f.kind === 'measurement')).toBe(false);
  });

  it('refuses a corner to itself', () => {
    const { ctx, store } = harness();
    const tool = createMeasureTool(nextId, () => 'aligned');

    tool.onPointerDown!(ctx, click(0, 0));
    tool.onPointerDown!(ctx, click(0, 0));

    expect(tool.notice!(ctx)?.code).toBe('MEASURE_NEEDS_ANCHOR');
    expect(features(store).some((f) => f.kind === 'measurement')).toBe(false);
  });

  it('clears the refusal on the next click', () => {
    const { ctx } = harness();
    const tool = createMeasureTool(nextId, () => 'aligned');

    tool.onPointerDown!(ctx, click(50, 30));
    expect(tool.notice!(ctx)?.code).toBe('MEASURE_NEEDS_ANCHOR');

    tool.onPointerDown!(ctx, click(0, 0));
    expect(tool.notice!(ctx)).toBeNull();
  });

  it('abandons a half-placed dimension on Escape', () => {
    const { ctx, store } = harness();
    const tool = createMeasureTool(nextId, () => 'aligned');

    tool.onPointerDown!(ctx, click(0, 0));
    tool.onKey!(ctx, { key: 'Escape', shiftKey: false, ctrlKey: false });
    // The second corner of the abandoned dimension starts a new one instead.
    tool.onPointerDown!(ctx, click(100, 0));

    expect(features(store).some((f) => f.kind === 'measurement')).toBe(false);
  });
});
