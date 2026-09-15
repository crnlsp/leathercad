import {
  addPart,
  DocumentStore,
  emptyDocument,
  rectanglePart,
  rectShape,
} from '@leathercad/document';
import { vec } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import type { ToolContext } from '../tool.js';
import { Viewport } from '../viewport.js';
import { commitDrawn, drawTargetNotice, type DrawAs } from './commitDrawn.js';

let counter = 0;
const nextId = (): string => `id-${(counter += 1)}`;

function harness(drawAs: DrawAs = 'cut'): { ctx: ToolContext; store: DocumentStore } {
  const store = new DocumentStore(emptyDocument('proj'));
  const viewport = new Viewport();
  viewport.resize(800, 600, 1);

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

describe('commitDrawn', () => {
  it('makes a new part when drawing a cut contour, exactly as before', () => {
    const { ctx, store } = harness('cut');

    commitDrawn(ctx, nextId, 'Panel', line);

    const project = store.getState().document.project;
    expect(project.parts).toHaveLength(1);
    expect(project.parts[0]!.features[0]!.kind).toBe('cut-contour');
  });

  it('adds a fold line to the selected part rather than a part of its own', () => {
    const { ctx, store } = harness('fold');
    const cutId = addPanel(store, 'p1');
    store.select([cutId as never]);

    commitDrawn(ctx, nextId, 'Fold', line);

    const project = store.getState().document.project;
    // One part, two features. A fold line on a part of its own would be a
    // "part" that can never be cut.
    expect(project.parts).toHaveLength(1);
    expect(project.parts[0]!.features.map((f) => f.kind)).toEqual(['cut-contour', 'fold-line']);
  });

  it('names a fold line for its direction, because the canvas cannot show it', () => {
    const { ctx, store } = harness('fold');
    store.select([addPanel(store, 'p1') as never]);

    commitDrawn(ctx, nextId, 'Fold', line);

    expect(store.getState().document.project.parts[0]!.features[1]!.name).toBe('Fold (valley)');
  });

  it('names a marking line for its purpose', () => {
    const { ctx, store } = harness('mark');
    store.select([addPanel(store, 'p1') as never]);

    commitDrawn(ctx, nextId, 'Mark', line);

    const feature = store.getState().document.project.parts[0]!.features[1]!;
    expect(feature.kind).toBe('marking-line');
    expect(feature.name).toBe('Alignment');
  });

  it('refuses, changing nothing, when no part is selected', () => {
    const { ctx, store } = harness('fold');
    addPanel(store, 'p1');
    const before = store.getState().document.project;

    expect(commitDrawn(ctx, nextId, 'Fold', line)).toBeNull();

    // Identity, not deep equality: immutable updates with structural sharing
    // mean an untouched project is literally the same object, so this proves
    // no command was dispatched rather than that one happened to be a no-op.
    expect(store.getState().document.project).toBe(before);
    expect(drawTargetNotice(ctx)).toMatch(/select a part/i);
  });

  it('refuses when the selection spans two parts, because neither is meant', () => {
    const { ctx, store } = harness('fold');
    const first = addPanel(store, 'p1');
    const second = addPanel(store, 'p2');
    store.select([first as never, second as never]);
    const before = store.getState().document.project;

    expect(commitDrawn(ctx, nextId, 'Fold', line)).toBeNull();
    expect(store.getState().document.project).toBe(before);
    expect(drawTargetNotice(ctx)).toMatch(/one part/i);
  });

  it('says nothing while drawing cut contours, which need no target', () => {
    const { ctx } = harness('cut');
    expect(drawTargetNotice(ctx)).toBeNull();
  });
});
