import type { Ulid } from '@leathercad/core';
import {
  DEFAULT_SETTINGS,
  MIN_PITCH_MM,
  additionRefusal,
  evaluate,
  type Project,
} from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import {
  addCutOut,
  addFeature,
  addStitchHoles,
  addStitchLine,
  circleShape,
  emptyDocument,
  rectShape,
  rectanglePart,
} from './commands.js';
import { DocumentStore } from './store.js';

const PANEL = 'part-1' as Ulid;

function storeWithPanel(settings = DEFAULT_SETTINGS) {
  const store = new DocumentStore(emptyDocument('doc' as Ulid));
  store.dispatch({
    label: 'Set up',
    apply: (document) => ({
      project: {
        ...document.project,
        settings,
        parts: [rectanglePart(PANEL, 'cut-1' as Ulid, 'Panel', rectShape({ x: 0, y: 0 }, 120, 80))],
      },
    }),
  });
  return store;
}

const features = (project: Project) => project.parts.flatMap((part) => part.features);

describe('addCutOut', () => {
  it('adds an inner contour to the part', () => {
    const store = storeWithPanel();
    store.dispatch(
      addCutOut(PANEL, 'hole-1' as Ulid, {
        kind: 'shape',
        shape: circleShape({ x: 60, y: 40 }, 15),
      }),
    );

    expect(
      features(store.getState().document.project).map((f) => f.kind === 'cut-contour' && f.role),
    ).toEqual(['outer', 'inner']);
  });

  it('refuses one that encloses nothing (S6), changing nothing', () => {
    const store = storeWithPanel();
    const before = store.getState().document;

    store.dispatch(
      addCutOut(PANEL, 'hole-1' as Ulid, {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x: 10, y: 10 },
            { x: 40, y: 10 },
          ],
          false,
        ),
      }),
    );

    expect(store.getState().document).toBe(before);
  });
});

describe('a part has one outline (S5)', () => {
  const secondOutline = {
    id: 'cut-2' as Ulid,
    kind: 'cut-contour' as const,
    role: 'outer' as const,
    name: 'Another outline',
    visible: true,
    locked: false,
    source: { kind: 'shape' as const, shape: rectShape({ x: 5, y: 5 }, 40, 30) },
  };

  it('refuses a second outer contour, changing nothing', () => {
    const store = storeWithPanel();
    const before = store.getState().document;

    store.dispatch(addFeature(PANEL, secondOutline));

    // Identity: a part is one piece of leather, so it has one edge.
    expect(store.getState().document).toBe(before);
  });

  it('explains it through the query the command shares', () => {
    const store = storeWithPanel();

    expect(additionRefusal(store.getState().document.project, PANEL, secondOutline)).toMatchObject({
      code: 'PART_ALREADY_HAS_OUTER',
      facts: { featureId: 'cut-2', partName: 'Panel', outerName: 'Outline' },
    });
  });

  it('allows a cut-out beside it, which is not a second edge', () => {
    const store = storeWithPanel();
    store.dispatch(
      addCutOut(PANEL, 'hole-1' as Ulid, {
        kind: 'shape',
        shape: circleShape({ x: 60, y: 40 }, 15),
      }),
    );

    expect(features(store.getState().document.project)).toHaveLength(2);
  });
});

describe('defaults come from the project (D7, X8)', () => {
  it('insets a stitch line by the project’s stitch margin, not a hard-coded 3.5', () => {
    const store = storeWithPanel({ ...DEFAULT_SETTINGS, defaultStitchInsetMm: 5 });
    store.dispatch(addStitchLine(PANEL, 'stitch-1' as Ulid, 'cut-1' as Ulid));

    const line = features(store.getState().document.project).find((f) => f.id === 'stitch-1');
    expect(
      line?.source.kind === 'derived' &&
        line.source.op.type === 'offset' &&
        line.source.op.distanceMm,
    ).toBe(5);
  });

  it('still takes an inset from the caller when one is given', () => {
    const store = storeWithPanel({ ...DEFAULT_SETTINGS, defaultStitchInsetMm: 5 });
    store.dispatch(addStitchLine(PANEL, 'stitch-1' as Ulid, 'cut-1' as Ulid, 2));

    const line = features(store.getState().document.project).find((f) => f.id === 'stitch-1');
    expect(
      line?.source.kind === 'derived' &&
        line.source.op.type === 'offset' &&
        line.source.op.distanceMm,
    ).toBe(2);
  });

  it('punches at the project’s iron pitch', () => {
    const store = storeWithPanel({ ...DEFAULT_SETTINGS, defaultIronPitchMm: 3 });
    store.dispatch(addStitchLine(PANEL, 'stitch-1' as Ulid, 'cut-1' as Ulid));
    store.dispatch(addStitchHoles(PANEL, 'holes-1' as Ulid, 'stitch-1' as Ulid));

    const holes = features(store.getState().document.project).find((f) => f.id === 'holes-1');
    expect(
      holes?.source.kind === 'derived' &&
        holes.source.op.type === 'stitch-holes' &&
        holes.source.op.pitchMm,
    ).toBe(3);

    // And the holes really are placed at it.
    const resolved = evaluate(store.getState().document.project)
      .parts.flatMap((part) => part.features)
      .find((entry) => entry.feature.id === 'holes-1');
    expect(resolved?.ok === true && resolved.holes?.achievedPitchMm).toBeCloseTo(3, 1);
  });

  it('takes a default pitch below the floor from a file, and the hole set is refused (5.6)', () => {
    // A project's default pitch comes from its file, like any other number. The
    // command copies it; evaluation refuses it on the hole set, by name, and
    // never generates holes from it.
    const store = storeWithPanel({ ...DEFAULT_SETTINGS, defaultIronPitchMm: 1e-300 });
    store.dispatch(addStitchLine(PANEL, 'stitch-1' as Ulid, 'cut-1' as Ulid));
    store.dispatch(addStitchHoles(PANEL, 'holes-1' as Ulid, 'stitch-1' as Ulid));

    const resolved = evaluate(store.getState().document.project)
      .parts.flatMap((part) => part.features)
      .find((entry) => entry.feature.id === 'holes-1');
    expect(resolved?.ok).toBe(false);
    expect(resolved?.ok === false && resolved.problem).toMatchObject({
      code: 'PARAMETER_INVALID',
      facts: { parameter: 'pitch', requirement: 'at-least', minimum: MIN_PITCH_MM },
    });
  });
});
