import type { Ulid } from '@leathercad/core';
import { evaluate, type Project } from '@leathercad/domain';
import { MatOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LABEL_SIZE_MM,
  addTextLabel,
  emptyDocument,
  rectShape,
  rectanglePart,
  refusedTransforms,
  setLabelSize,
  setLabelText,
  transformFeatures,
  translateFeatures,
} from './commands.js';
import { DocumentStore } from './store.js';

/** A panel with one label on it. */
function storeWithLabel(text = 'Fold before stitching') {
  const store = new DocumentStore(emptyDocument('doc' as Ulid));
  const partId = 'part-1' as Ulid;
  store.dispatch({
    label: 'Add part',
    apply: (document) => ({
      project: {
        ...document.project,
        parts: [
          rectanglePart(partId, 'feat-0' as Ulid, 'Panel', rectShape({ x: 0, y: 0 }, 100, 60)),
        ],
      },
    }),
  });
  store.dispatch(addTextLabel(partId, 'label-1' as Ulid, { x: 10, y: 20 }, text));
  return store;
}

const labelOf = (project: Project) =>
  project.parts.flatMap((part) => part.features).find((f) => f.kind === 'text-label');

describe('addTextLabel', () => {
  it('puts the words, the place and the size in the source', () => {
    const label = labelOf(storeWithLabel().getState().document.project);

    expect(label).toMatchObject({
      kind: 'text-label',
      name: 'Fold before stitching',
      source: {
        kind: 'text',
        text: 'Fold before stitching',
        at: { x: 10, y: 20 },
        sizeMm: DEFAULT_LABEL_SIZE_MM,
        rotationRad: 0,
      },
    });
  });

  it('refuses blank words, which would be invisible and unselectable', () => {
    const store = storeWithLabel();
    const before = store.getState().document;

    store.dispatch(addTextLabel('part-1' as Ulid, 'label-2' as Ulid, { x: 0, y: 0 }, '   '));

    // Identity: no command was recorded, so there is nothing to undo either.
    expect(store.getState().document).toBe(before);
  });

  it('refuses a size of nothing', () => {
    const store = storeWithLabel();
    const before = store.getState().document;

    store.dispatch(addTextLabel('part-1' as Ulid, 'label-3' as Ulid, { x: 0, y: 0 }, 'Hi', 0));

    expect(store.getState().document).toBe(before);
  });

  it('resolves to laid-out text and a box around it', () => {
    const resolved = evaluate(storeWithLabel().getState().document.project)
      .parts.flatMap((part) => part.features)
      .find((entry) => entry.feature.kind === 'text-label');

    expect(resolved?.ok).toBe(true);
    if (resolved?.ok !== true) return;
    expect(resolved.text?.layout.text).toBe('Fold before stitching');
    // The box is a closed rectangle, so selection and bounds work on a label
    // without knowing what text is.
    expect(resolved.path.closed).toBe(true);
    expect(resolved.path.segments).toHaveLength(4);
  });
});

describe('editing a label', () => {
  it('retypes the words, and the name follows them', () => {
    const store = storeWithLabel();
    store.dispatch(setLabelText('label-1' as Ulid, '  Glue here  '));

    expect(labelOf(store.getState().document.project)).toMatchObject({
      name: 'Glue here',
      source: { text: 'Glue here' },
    });
  });

  it('refuses to blank a label rather than leaving one nobody can find', () => {
    const store = storeWithLabel();
    const before = store.getState().document;

    store.dispatch(setLabelText('label-1' as Ulid, '   '));
    expect(store.getState().document).toBe(before);
  });

  it('resizes in millimetres', () => {
    const store = storeWithLabel();
    store.dispatch(setLabelSize('label-1' as Ulid, 5));

    expect(labelOf(store.getState().document.project)).toMatchObject({ source: { sizeMm: 5 } });
  });

  it('refuses a size of nothing', () => {
    const store = storeWithLabel();
    const before = store.getState().document;

    store.dispatch(setLabelSize('label-1' as Ulid, -1));
    expect(store.getState().document).toBe(before);
  });
});

describe('transforming a label', () => {
  it('moves through its position', () => {
    const store = storeWithLabel();
    store.dispatch(translateFeatures(['label-1' as Ulid], { x: 5, y: -3 }));

    expect(labelOf(store.getState().document.project)).toMatchObject({
      source: { at: { x: 15, y: 17 } },
    });
  });

  it('turns through its rotation, staying a label you can retype', () => {
    const store = storeWithLabel();
    store.dispatch(transformFeatures(['label-1' as Ulid], MatOps.fromRotation(Math.PI / 2)));

    const label = labelOf(store.getState().document.project);
    expect(label?.source.kind === 'text' && label.source.rotationRad).toBeCloseTo(Math.PI / 2, 9);
    expect(label?.source.kind === 'text' && label.source.text).toBe('Fold before stitching');
  });

  it('grows evenly through its size', () => {
    const store = storeWithLabel();
    store.dispatch(transformFeatures(['label-1' as Ulid], MatOps.fromScale(2, 2)));

    const label = labelOf(store.getState().document.project);
    expect(label?.source.kind === 'text' && label.source.sizeMm).toBeCloseTo(
      DEFAULT_LABEL_SIZE_MM * 2,
      9,
    );
  });

  it('refuses an uneven scale, and says why — letters do not stretch', () => {
    const store = storeWithLabel();
    const project = store.getState().document.project;
    const squash = MatOps.fromScale(2, 1);

    expect(refusedTransforms(project, ['label-1' as Ulid], squash)).toEqual([
      { featureId: 'label-1', problem: { code: 'TEXT_WOULD_DISTORT', facts: {} } },
    ]);

    store.dispatch(transformFeatures(['label-1' as Ulid], squash));
    // Left exactly as it was, rather than stretched behind the user's back.
    expect(labelOf(store.getState().document.project)).toMatchObject({
      source: { sizeMm: DEFAULT_LABEL_SIZE_MM, at: { x: 10, y: 20 } },
    });
  });

  it('refuses a transform that would flatten it to nothing', () => {
    const project = storeWithLabel().getState().document.project;

    expect(refusedTransforms(project, ['label-1' as Ulid], MatOps.fromScale(1, 0))).toEqual([
      { featureId: 'label-1', problem: { code: 'TRANSFORM_FLATTENS', facts: {} } },
    ]);
  });
});
