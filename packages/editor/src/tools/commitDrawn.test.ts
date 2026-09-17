import {
  addPart,
  DocumentStore,
  emptyDocument,
  rectanglePart,
  rectShape,
} from '@leathercad/document';
import { PathOps, vec } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import {
  createDrawCommit,
  drawRefusal,
  drawTargetNotice,
  type DrawCommit,
  type DrawMode,
} from './commitDrawn.js';

let counter = 0;
const nextId = (): string => `id-${(counter += 1)}`;

function harness(drawAs: DrawMode = 'outline'): {
  ctx: ToolContext;
  store: DocumentStore;
  draw: DrawCommit;
} {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);

  return {
    store,
    draw: createDrawCommit(),
    ctx: {
      viewport,
      store,
      dispatch: (command) => store.dispatch(command),
      invalidate: () => {},
      drawAs: () => drawAs,
    },
  };
}

/** A part with one rectangular outline, and the id of that outline. */
function addPanel(store: DocumentStore, partId: string): string {
  const featureId = `${partId}-cut`;
  store.dispatch(
    addPart(
      rectanglePart(partId as never, featureId as never, 'Panel', rectShape(vec(0, 0), 100, 60)),
    ),
  );
  return featureId;
}

const line = { kind: 'shape', shape: rectShape(vec(10, 10), 20, 20) } as const;

describe('the drawing commit boundary', () => {
  it('makes a new part when drawing a cut contour, exactly as before', () => {
    const { ctx, store, draw } = harness('outline');

    draw.commit(ctx, nextId, 'Panel', line);

    const project = store.getState().document.project;
    expect(project.parts).toHaveLength(1);
    expect(project.parts[0]!.features[0]!.kind).toBe('cut-contour');
  });

  it('adds a fold line to the selected part rather than a part of its own', () => {
    const { ctx, store, draw } = harness('fold');
    const cutId = addPanel(store, 'p1');
    store.select([cutId as never]);

    draw.commit(ctx, nextId, 'Fold', line);

    const project = store.getState().document.project;
    // One part, two features. A fold line on a part of its own would be a
    // "part" that can never be cut.
    expect(project.parts).toHaveLength(1);
    expect(project.parts[0]!.features.map((f) => f.kind)).toEqual(['cut-contour', 'fold-line']);
  });

  it('names a fold line for its direction, because the canvas cannot show it', () => {
    const { ctx, store, draw } = harness('fold');
    store.select([addPanel(store, 'p1') as never]);

    draw.commit(ctx, nextId, 'Fold', line);

    expect(store.getState().document.project.parts[0]!.features[1]!.name).toBe('Fold (valley)');
  });

  it('names a marking line for its purpose', () => {
    const { ctx, store, draw } = harness('marking');
    store.select([addPanel(store, 'p1') as never]);

    draw.commit(ctx, nextId, 'Mark', line);

    const feature = store.getState().document.project.parts[0]!.features[1]!;
    expect(feature.kind).toBe('marking-line');
    expect(feature.name).toBe('Alignment');
  });

  it('refuses, changing nothing, when no part is selected', () => {
    const { ctx, store, draw } = harness('fold');
    addPanel(store, 'p1');
    const before = store.getState().document.project;

    expect(draw.commit(ctx, nextId, 'Fold', line)).toBeNull();

    // Identity, not deep equality: immutable updates with structural sharing
    // mean an untouched project is literally the same object, so this proves
    // no command was dispatched rather than that one happened to be a no-op.
    expect(store.getState().document.project).toBe(before);
    expect(drawTargetNotice(ctx)).toEqual({ code: 'NO_TARGET_PART', facts: { what: 'line' } });
  });

  it('refuses when the selection spans two parts, because neither is meant', () => {
    const { ctx, store, draw } = harness('fold');
    const first = addPanel(store, 'p1');
    const second = addPanel(store, 'p2');
    store.select([first as never, second as never]);
    const before = store.getState().document.project;

    expect(draw.commit(ctx, nextId, 'Fold', line)).toBeNull();
    expect(store.getState().document.project).toBe(before);
    expect(drawTargetNotice(ctx)).toEqual({ code: 'TARGET_SPANS_PARTS', facts: { what: 'line' } });
  });

  it('says nothing while drawing cut contours, which need no target', () => {
    const { ctx } = harness('outline');
    expect(drawTargetNotice(ctx)).toBeNull();
  });
});

describe('the drawing modes (§3.8)', () => {
  const closedSquare = {
    kind: 'path',
    path: PathOps.polyline(
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ],
      true,
    ),
  } as const;

  const openRun = {
    kind: 'path',
    path: PathOps.polyline(
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
      ],
      false,
    ),
  } as const;

  const features = (store: DocumentStore) =>
    store.getState().document.project.parts.flatMap((part) => part.features);

  it('makes a cut-out on the selected part', () => {
    const { ctx, store, draw } = harness('cut-out');
    const panel = addPanel(store, 'p1');
    store.select([panel as never]);

    draw.commit(ctx, nextId, 'Slot', closedSquare);

    expect(features(store).map((f) => [f.kind, f.kind === 'cut-contour' ? f.role : null])).toEqual([
      ['cut-contour', 'outer'],
      ['cut-contour', 'inner'],
    ]);
    // On the part, not in a new one: a hole belongs to the piece it is cut in.
    expect(store.getState().document.project.parts).toHaveLength(1);
  });

  it('refuses a cut-out that encloses nothing, and says why (S6)', () => {
    const { ctx, store, draw } = harness('cut-out');
    const panel = addPanel(store, 'p1');
    store.select([panel as never]);
    const before = store.getState().document;

    expect(draw.commit(ctx, nextId, 'Slot', openRun)).toBeNull();
    expect(store.getState().document).toBe(before);
    expect(drawRefusal(ctx, openRun)).toMatchObject({
      code: 'CONTOUR_NOT_CLOSED',
      facts: { role: 'inner' },
    });
  });

  it('refuses an open outline rather than filing it as a marking line', () => {
    // The old behaviour, and the "mode means something else" problem in
    // miniature: an open path drawn as a cut quietly became a marking line.
    const { ctx, store, draw } = harness('outline');
    const before = store.getState().document;

    expect(draw.commit(ctx, nextId, 'Panel', openRun)).toBeNull();
    expect(store.getState().document).toBe(before);
    expect(drawRefusal(ctx, openRun)).toMatchObject({
      code: 'CONTOUR_NOT_CLOSED',
      facts: { role: 'outer' },
    });
  });

  it('never reads the selection in Outline mode', () => {
    // X4: a mode has one fixed result. An outline is a new piece of leather
    // whatever happens to be selected — otherwise the next draw would change
    // meaning, because what you just drew is what is selected.
    const { ctx, store, draw } = harness('outline');
    const panel = addPanel(store, 'p1');
    store.select([panel as never]);

    draw.commit(ctx, nextId, 'Panel', closedSquare);

    expect(store.getState().document.project.parts).toHaveLength(2);
  });

  it('puts a drawn stitch line on the selected part', () => {
    const { ctx, store, draw } = harness('stitch');
    const panel = addPanel(store, 'p1');
    store.select([panel as never]);

    draw.commit(ctx, nextId, 'Seam', openRun);

    expect(features(store).map((f) => f.kind)).toEqual(['cut-contour', 'stitch-line']);
  });

  it('says a cut-out needs a part, naming what it is placing', () => {
    const { ctx } = harness('cut-out');
    expect(drawRefusal(ctx, closedSquare)).toEqual({
      code: 'NO_TARGET_PART',
      facts: { what: 'cut-out' },
    });
  });
});

describe('a refused drawing always leaves a reason (X1)', () => {
  // The invariant the boundary exists for. It used to live in the polyline
  // tool, which meant the arc tool did not have it: an arc drawn in Outline
  // mode vanished with the status bar saying nothing at all.
  const openRun = {
    kind: 'path',
    path: PathOps.polyline(
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
      ],
      false,
    ),
  } as const;

  const openArc = {
    kind: 'shape',
    shape: { type: 'arc', centre: vec(20, 20), radius: 10, startAngle: 0, sweepAngle: Math.PI / 2 },
  } as const;

  for (const [mode, role] of [
    ['outline', 'outer'],
    ['cut-out', 'inner'],
  ] as const) {
    it(`holds the reason an open path was refused in ${mode} mode`, () => {
      const { ctx, store, draw } = harness(mode);
      store.select([addPanel(store, 'p1') as never]);

      expect(draw.commit(ctx, nextId, 'Panel', openRun)).toBeNull();
      expect(draw.notice(ctx)).toMatchObject({
        code: 'CONTOUR_NOT_CLOSED',
        facts: { role, closable: true },
      });
    });

    it(`holds the reason an arc was refused in ${mode} mode`, () => {
      const { ctx, store, draw } = harness(mode);
      store.select([addPanel(store, 'p1') as never]);

      expect(draw.commit(ctx, nextId, 'Line', openArc)).toBeNull();
      // Closing an arc is not a correction anyone can make, so it is not
      // offered as one.
      expect(draw.notice(ctx)).toMatchObject({
        code: 'CONTOUR_NOT_CLOSED',
        facts: { role, closable: false },
      });
    });
  }

  it('lets the reason go when the next drawing begins', () => {
    const { ctx, store, draw } = harness('outline');
    expect(draw.commit(ctx, nextId, 'Panel', openRun)).toBeNull();
    expect(draw.notice(ctx)).not.toBeNull();

    draw.begin();

    expect(draw.notice(ctx)).toBeNull();
    expect(store.getState().document.project.parts).toHaveLength(0);
  });

  it('says nothing after a drawing that was kept', () => {
    const { ctx, store, draw } = harness('marking');
    store.select([addPanel(store, 'p1') as never]);

    expect(draw.commit(ctx, nextId, 'Mark', openRun)).not.toBeNull();
    expect(draw.notice(ctx)).toBeNull();
  });
});
