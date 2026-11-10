import {
  derivationRefusal,
  evaluate,
  followRefusal,
  resolveSeam,
  type Feature,
  type Seam,
} from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  addPart,
  addFeature,
  convertToPath,
  addStitchLine,
  addStitchHoles,
  deleteFeatures,
  deletePart,
  duplicatePart,
  emptyDocument,
  planDelete,
  rectShape,
  shapePart,
  setDerivation,
  setSource,
} from './commands.js';
import { addSeam, setSeam, removeSeam } from './seams.js';
import { addGuide } from './guides.js';
import { DocumentStore } from './store.js';
import { editPathPoint } from './pathPoints.js';

const seam: Seam = {
  id: 'seam',
  a: { holeSetId: 'holes', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
  b: { holeSetId: 'holes', stretch: { kind: 'from', anchor: 3, toward: 'previous' } },
};
function storeWithSeam(): DocumentStore {
  const store = new DocumentStore(emptyDocument('project'));
  store.dispatch(addPart(shapePart('part', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 40, 20))));
  store.dispatch(addStitchLine('part', 'line', 'outline', 2));
  store.dispatch(addStitchHoles('part', 'holes', 'line'));
  store.dispatch(addSeam(seam));
  return store;
}

describe('seam commands and deletion (9.6a)', () => {
  it.each(['close source run', 'follow closed line'] as const)(
    'refuses to invalidate open endpoint references: %s',
    (edit) => {
      const store = new DocumentStore(emptyDocument('endpoint-project'));
      store.dispatch(
        addPart(shapePart('part', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 100, 60))),
      );
      store.dispatch(
        addStitchLine('part', 'line', 'outline', 3, {
          kind: 'between',
          fromAnchor: 2,
          toAnchor: 1,
        }),
      );
      store.dispatch(addStitchHoles('part', 'holes', 'line'));
      const value: Seam = {
        ...seam,
        a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 'start', toAnchor: 'end' } },
        b: { ...seam.b, stretch: { kind: 'from', anchor: 'end', toward: 'previous' } },
      };
      store.dispatch(addSeam(value));
      store.dispatch(
        addFeature('part', {
          id: 'closed-line',
          name: 'Closed stitching',
          kind: 'stitch-line',
          visible: true,
          locked: false,
          source: {
            kind: 'path',
            path: PathOps.polyline(
              [
                { x: 10, y: 10 },
                { x: 20, y: 10 },
                { x: 20, y: 20 },
              ],
              true,
            ),
          },
        }),
      );
      const before = store.getState().document;
      if (edit === 'close source run') {
        const op = {
          type: 'offset',
          side: 'inward',
          distanceMm: 3,
          run: { kind: 'whole' },
        } as const;
        const line = before.project.parts[0]?.features.find((feature) => feature.id === 'line');
        if (line?.kind !== 'stitch-line' || line.source.kind !== 'derived')
          throw new Error('fixture must have a derived line');
        expect(
          derivationRefusal(before.project, { ...line, source: { ...line.source, op } })?.code,
        ).toBe('ANCHOR_MISSING');
        store.dispatch(setDerivation('line', op));
      } else {
        expect(followRefusal(before.project, 'holes', 'closed-line')?.code).toBe('ANCHOR_MISSING');
        store.dispatch(setSource('holes', 'closed-line'));
      }
      expect(store.getState().document).toBe(before);
    },
  );
  it('keeps endpoints attached to the current line boundaries through edits and undo', () => {
    const path = PathOps.polyline(
      [
        { x: 0, y: 20 },
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
      ],
      false,
    );
    const line: Feature = {
      id: 'line',
      name: 'Stitch line',
      kind: 'stitch-line',
      visible: true,
      locked: false,
      source: { kind: 'path', path },
    };
    const store = new DocumentStore(emptyDocument('open-project'));
    store.dispatch(addPart({ id: 'part', name: 'Pocket', quantity: 1, features: [line] }));
    store.dispatch(addStitchHoles('part', 'holes', 'line'));
    const value: Seam = {
      ...seam,
      a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 'start', toAnchor: 'end' } },
      b: { ...seam.b, stretch: { kind: 'between', fromAnchor: 'end', toAnchor: 'start' } },
    };
    store.dispatch(addSeam(value));
    const before = store.getState().document;
    expect(before.project.seams).toEqual([value]);
    store.dispatch(
      editPathPoint({ kind: 'move', featureId: 'line', vertex: 0, to: { x: 0, y: 30 } }),
    );
    const moved = store.getState().document.project;
    expect(moved.seams?.[0]).toBe(value);
    const result = resolveSeam(moved, value);
    if (!result.ok) throw new Error('moved endpoints must resolve');
    expect(result.a.lengthMm).toBeCloseTo(90, 9);
    expect(result.a.holes[0]?.hole.point).toEqual({ x: 0, y: 30 });
    store.undo();
    expect(store.getState().document).toBe(before);
    store.dispatch(editPathPoint({ kind: 'remove', featureId: 'line', vertex: 0 }));
    const shortened = resolveSeam(store.getState().document.project, value);
    if (!shortened.ok) throw new Error('end references follow the remaining line');
    expect(shortened.a.lengthMm).toBeCloseTo(60, 9);
    expect(shortened.a.holes[0]?.hole.point).toEqual({ x: 0, y: 0 });
    expect(store.getState().document.project.seams?.[0]).toBe(value);
    store.undo();
    expect(store.getState().document).toBe(before);
  });
  it('adds a valid relationship in one undo step without storing evaluated geometry', () => {
    const store = storeWithSeam();
    expect(store.getState().document.project.seams).toEqual([seam]);
    store.undo();
    expect(store.getState().document.project.seams).toBeUndefined();
    store.redo();
    expect(store.getState().document.project.seams).toEqual([seam]);
  });

  it('refuses invalid and duplicate relationships without recording history', () => {
    const store = storeWithSeam();
    const before = store.getState().document;
    for (const value of [
      seam,
      { ...seam, id: 'outline' },
      { ...seam, id: 'no-length', a: seam.b },
      { ...seam, id: 'not-holes', a: { ...seam.a, holeSetId: 'outline' } },
    ]) {
      store.dispatch(addSeam(value));
      expect(store.getState().document).toBe(before);
    }
    store.dispatch(addGuide({ id: 'seam', origin: { x: 0, y: 0 }, angleRad: 0 }));
    expect(store.getState().document).toBe(before);
  });

  it('lists the seam before deleting its holes, and refuses an unresolved delete', () => {
    const store = storeWithSeam();
    const before = store.getState().document;
    expect(planDelete(before.project, ['holes']).seams.map((entry) => entry.seamId)).toEqual([
      'seam',
    ]);
    store.dispatch(deleteFeatures(['holes']));
    expect(store.getState().document).toBe(before);
  });

  it.each(['delete-dependents', 'freeze-dependents'] as const)(
    'deletes a seam with its holes, undo restores both (%s)',
    (resolution) => {
      const store = storeWithSeam();
      const before = store.getState().document;
      store.dispatch(deleteFeatures(['holes'], resolution));
      expect(store.getState().document.project.seams).toEqual([]);
      expect(
        store.getState().document.project.parts[0]?.features.some((f) => f.id === 'holes'),
      ).toBe(false);
      store.undo();
      expect(store.getState().document).toBe(before);
      store.redo();
      expect(store.getState().document.project.seams).toEqual([]);
    },
  );

  it('keeps a seam when its stitch line is frozen and its hole sets survive', () => {
    const store = storeWithSeam();
    store.dispatch(deleteFeatures(['outline'], 'freeze-dependents'));
    expect(store.getState().document.project.seams).toEqual([seam]);
    expect(
      evaluate(store.getState().document.project).parts[0]?.features.every((entry) => entry.ok),
    ).toBe(true);
  });

  it('removes the relationship with its part, with one undo step', () => {
    const store = storeWithSeam();
    const before = store.getState().document;
    store.dispatch(deletePart('part'));
    expect(store.getState().document).toBe(before);
    store.dispatch(deletePart('part', 'delete-dependents'));
    expect(store.getState().document.project.parts).toEqual([]);
    expect(store.getState().document.project.seams).toEqual([]);
    store.undo();
    expect(store.getState().document).toBe(before);
  });

  it('does not copy a relationship when a part is duplicated', () => {
    const store = storeWithSeam();
    store.dispatch(duplicatePart('part', 'copy', ['copy-outline', 'copy-line', 'copy-holes']));
    expect(store.getState().document.project.parts).toHaveLength(2);
    expect(store.getState().document.project.seams).toEqual([seam]);
  });

  it('refuses removing a corner that a seam names through its hole set', () => {
    const store = storeWithSeam();
    store.dispatch(convertToPath('outline'));
    const before = store.getState().document;
    store.dispatch(editPathPoint({ kind: 'remove', featureId: 'outline', vertex: 1 }));
    expect(store.getState().document).toBe(before);
  });

  it('renumbers both seam sides through a point edit and preserves unknown metadata', () => {
    const store = storeWithSeam();
    const extra = { ...seam, id: 'extra', future: true, a: { ...seam.a, future: 'side' } };
    store.dispatch(addSeam(extra));
    store.dispatch(convertToPath('outline'));
    store.dispatch(editPathPoint({ kind: 'insert', featureId: 'outline', segment: 0, t: 0.5 }));
    const before = store.getState().document;
    store.dispatch(
      editPathPoint({ kind: 'move', featureId: 'outline', vertex: 1, to: { x: 20, y: -5 } }),
    );
    expect(
      store.getState().document.project.seams?.find((entry) => entry.id === 'extra'),
    ).toMatchObject({
      future: true,
      a: { future: 'side', stretch: { kind: 'between', fromAnchor: 1, toAnchor: 2 } },
      b: { stretch: { kind: 'from', anchor: 4 } },
    });
    store.undo();
    expect(store.getState().document).toBe(before);
  });

  it('preserves unknown seam metadata through delete and undo for every seam id', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^seam-[a-z]{1,8}$/), (id) => {
        const store = storeWithSeam();
        const extra = { ...seam, id, future: { keep: true } };
        store.dispatch(addSeam(extra));
        const before = store.getState().document;
        store.dispatch(deleteFeatures(['holes'], 'delete-dependents'));
        store.undo();
        expect(store.getState().document).toBe(before);
        expect(store.getState().document.project.seams?.find((entry) => entry.id === id)).toEqual(
          extra,
        );
      }),
    );
  });
});

describe('seam editing (9.6b)', () => {
  it('previews against the base, cancels cleanly, then commits one edit and unsews with undo', () => {
    const store = storeWithSeam();
    const before = store.getState().document;
    const edited: Seam = { ...seam, a: { ...seam.a, stretch: { kind: 'whole' } } };
    store.begin({ action: 'edit-seam' });
    store.preview(setSeam(edited));
    expect(store.getState().document.project.seams).toEqual([edited]);
    store.rollback();
    expect(store.getState().document).toBe(before);
    store.begin({ action: 'edit-seam' });
    store.preview(setSeam(edited));
    store.commit();
    store.undo();
    expect(store.getState().document).toBe(before);
    store.redo();
    const after = store.getState().document;
    store.dispatch(removeSeam(seam.id));
    expect(store.getState().document.project.seams).toEqual([]);
    store.undo();
    expect(store.getState().document).toBe(after);
  });
  it('preserves unknown metadata when editing and refuses invalid edits without history', () => {
    const store = storeWithSeam();
    const future = {
      ...seam,
      id: 'future',
      extra: true,
      a: { ...seam.a, extra: 1, stretch: { ...seam.a.stretch, extra: 2 } },
    };
    store.dispatch(addSeam(future));
    const extra = store.getState().document.project.seams?.find((s) => s.id === 'future');
    if (extra === undefined) throw new Error('future seam exists');
    store.dispatch(
      setSeam({
        ...seam,
        id: 'future',
        a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 1, toAnchor: 2 } },
      }),
    );
    expect(store.getState().document.project.seams?.find((s) => s.id === 'future')).toMatchObject({
      extra: true,
      a: { extra: 1, stretch: { extra: 2, fromAnchor: 1, toAnchor: 2 } },
    });
    store.dispatch(
      setSeam({ ...seam, id: 'future', a: { ...seam.a, stretch: { kind: 'whole' } } }),
    );
    expect(store.getState().document.project.seams?.find((s) => s.id === 'future')).toMatchObject({
      a: { stretch: { kind: 'whole', extra: 2 } },
    });
    const before = store.getState().document;
    store.dispatch(setSeam({ ...seam, a: seam.b }));
    store.dispatch(setSeam({ ...seam, id: 'gone' }));
    store.dispatch(removeSeam('gone'));
    expect(store.getState().document).toBe(before);
  });
});
