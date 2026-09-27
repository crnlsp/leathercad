import {
  cornerDistances,
  cornersThroughEdit,
  evaluate,
  findFeature,
  type Feature,
  type FeatureId,
  type Project,
} from '@leathercad/domain';
import {
  PathOps,
  insertPathVertex,
  movePathVertex,
  polyline,
  removePathVertex,
  vec,
  type Path,
  type Vec2,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addFeature,
  addMeasurement,
  addPart,
  addStitchLine,
  emptyDocument,
  pathPart,
  rectanglePart,
  rectShape,
  setFeatureLocked,
} from './commands.js';
import type { Document } from './document.js';
import {
  editPathPoint,
  pathPointRefusal,
  pointEditingRefusal,
  type PathPointEdit,
} from './pathPoints.js';
import { DocumentStore } from './store.js';

const OUTLINE = 'outline' as FeatureId;
const STITCH = 'stitch' as FeatureId;
const DIMENSION = 'dimension' as FeatureId;
const ON_STITCH = 'on-stitch' as FeatureId;

/**
 * A drawn 100 × 50 outline, anticlockwise from the origin. Its corners, as
 * anchors: 0 bottom-right, 1 top-right, 2 top-left, 3 bottom-left (the start,
 * met last).
 *
 * On it: a stitch line along the top and the left side (corner 1 round to
 * corner 3), a dimension across the diagonal from corner 0 to corner 2, and a
 * second dimension measuring the stitch line's own corners 2 to 3 — which it
 * carries from the outline, under the outline's numbers.
 */
function wallet(outline: Path = box()): Document {
  const commands = [
    addPart(pathPart('part' as FeatureId, OUTLINE, 'Panel', outline)),
    addStitchLine('part' as FeatureId, STITCH, OUTLINE, 3, {
      kind: 'between',
      fromAnchor: 1,
      toAnchor: 3,
    }),
    addMeasurement(
      DIMENSION,
      'aligned',
      { kind: 'anchor', featureId: OUTLINE, anchor: 0 },
      { kind: 'anchor', featureId: OUTLINE, anchor: 2 },
    ),
    addMeasurement(
      ON_STITCH,
      'aligned',
      { kind: 'anchor', featureId: STITCH, anchor: 2 },
      { kind: 'anchor', featureId: STITCH, anchor: 3 },
    ),
  ];
  return commands.reduce((document, c) => c.apply(document), emptyDocument('p'));
}

function box(): Path {
  return polyline([vec(0, 0), vec(100, 0), vec(100, 50), vec(0, 50)], true);
}

/** Where anchor `k` of a feature lands, from the evaluated project. */
function anchorAt(project: Project, id: FeatureId, k: number): Vec2 | null {
  const resolved = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((r) => r.feature.id === id);
  if (resolved === undefined || !resolved.ok) return null;
  const at = resolved.anchors[k];
  return at === null || at === undefined
    ? null
    : PathOps.measure(resolved.path).pointAtDistance(at);
}

function refs(project: Project, id: FeatureId): readonly [number, number] {
  const feature = findFeature(project, id)!.feature;
  if (feature.source.kind === 'measurement') {
    return [feature.source.a.anchor, feature.source.b.anchor];
  }
  if (feature.source.kind === 'derived' && feature.source.op.type === 'offset') {
    const run = feature.source.op.run;
    if (run.kind === 'between') return [run.fromAnchor, run.toAnchor];
  }
  throw new Error(`${id} names no anchors`);
}

function outlinePath(project: Project): Path {
  const feature = findFeature(project, OUTLINE)!.feature;
  if (feature.source.kind !== 'path') throw new Error('not drawn');
  return feature.source.path;
}

const close = (a: Vec2 | null, b: Vec2 | null): boolean =>
  a !== null && b !== null && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

/** A new corner ahead of every other one: a point added along the bottom, pulled down. */
function withNewFirstCorner(document: Document): Document {
  const added = editPathPoint({ kind: 'insert', featureId: OUTLINE, segment: 0, t: 0.5 }).apply(
    document,
  );
  return editPathPoint({ kind: 'move', featureId: OUTLINE, vertex: 1, to: vec(50, -10) }).apply(
    added,
  );
}

describe('editing a drawn path keeps what is attached to its corners', () => {
  it('adds a point along a side without moving anything', () => {
    const before = wallet();
    const after = editPathPoint({ kind: 'insert', featureId: OUTLINE, segment: 0, t: 0.5 }).apply(
      before,
    );

    expect(PathOps.vertices(outlinePath(after.project))).toHaveLength(5);
    expect(refs(after.project, DIMENSION)).toEqual([0, 2]);
    expect(refs(after.project, STITCH)).toEqual([1, 3]);
  });

  it('renumbers every run and dimension when a new corner comes before them', () => {
    const before = wallet();
    const after = withNewFirstCorner(before);

    // The new corner is anchor 0; everything that was attached moved up one…
    expect(refs(after.project, DIMENSION)).toEqual([1, 3]);
    expect(refs(after.project, STITCH)).toEqual([2, 4]);
    // …including a dimension on the stitch line, which carries the outline's numbers.
    expect(refs(after.project, ON_STITCH)).toEqual([3, 4]);

    // And every end is still on the same place of the drawing.
    for (const [id, k, j] of [
      // The dimension's ends are the outline's corners 0 and 2.
      [OUTLINE, 0, 1],
      [OUTLINE, 2, 3],
      [STITCH, 2, 3],
      [STITCH, 3, 4],
    ] as const) {
      expect(close(anchorAt(before.project, id, k), anchorAt(after.project, id, j))).toBe(true);
    }
  });

  it('puts the numbers back when that corner is removed again', () => {
    const before = wallet();
    const grown = withNewFirstCorner(before);
    const after = editPathPoint({ kind: 'remove', featureId: OUTLINE, vertex: 1 }).apply(grown);

    expect(refs(after.project, DIMENSION)).toEqual([0, 2]);
    expect(refs(after.project, STITCH)).toEqual([1, 3]);
    expect(refs(after.project, ON_STITCH)).toEqual([2, 3]);
  });

  it('moves a corner, and what is attached to it goes with it', () => {
    const after = editPathPoint({
      kind: 'move',
      featureId: OUTLINE,
      vertex: 3,
      to: vec(-10, 60),
    }).apply(wallet());

    // Corner 2 is the top-left, the dimension's far end.
    expect(close(anchorAt(after.project, OUTLINE, 2), vec(-10, 60))).toBe(true);
    expect(refs(after.project, DIMENSION)).toEqual([0, 2]);
  });

  it('is one step to undo', () => {
    const store = new DocumentStore(wallet());
    const before = store.getState().document;
    store.dispatch(editPathPoint({ kind: 'move', featureId: OUTLINE, vertex: 1, to: vec(120, 0) }));

    expect(store.getState().document).not.toBe(before);
    store.undo();
    expect(store.getState().document).toBe(before);
  });

  it('stores a moved point quantised to a tenth of a micrometre', () => {
    const after = editPathPoint({
      kind: 'move',
      featureId: OUTLINE,
      vertex: 1,
      to: vec(120.123456789, 0.000049),
    }).apply(wallet());

    expect(PathOps.vertices(outlinePath(after.project))[1]).toEqual(vec(120.1235, 0));
  });
});

describe('refusing a point edit', () => {
  const refusal = (document: Document, edit: PathPointEdit) =>
    pathPointRefusal(document.project, edit)?.code;

  it('refuses to remove a corner a dimension is attached to, and changes nothing', () => {
    const document = wallet();
    // The top-left point is corner 2: the dimension's far end.
    const edit: PathPointEdit = { kind: 'remove', featureId: OUTLINE, vertex: 3 };
    const problem = pathPointRefusal(document.project, edit);

    expect(problem?.code).toBe('CORNER_IN_USE');
    expect(problem?.code === 'CORNER_IN_USE' && problem.facts.usedByName).toBe('Dimension');
    expect(editPathPoint(edit).apply(document)).toBe(document);
  });

  it('refuses to straighten a corner a stitch run starts at', () => {
    // A step in the right side: its corners, as anchors, are 0 (100, 0),
    // 1 (100, 60), 2 (0, 60) and 3 the start. The run starts at corner 1;
    // pulling that point onto the line between its neighbours straightens it.
    const document = wallet(
      polyline([vec(0, 0), vec(100, 0), vec(100, 50), vec(100, 60), vec(0, 60)], true),
    );

    expect(
      refusal(document, { kind: 'move', featureId: OUTLINE, vertex: 3, to: vec(50, 55) }),
    ).toBe('CORNER_IN_USE');
  });

  it('allows removing a corner nothing is attached to', () => {
    const document = withNewFirstCorner(wallet());

    expect(refusal(document, { kind: 'remove', featureId: OUTLINE, vertex: 1 })).toBeUndefined();
  });

  it('says what is wrong with an edit it cannot make at all', () => {
    const document = [
      addPart(
        rectanglePart(
          'rect-part' as FeatureId,
          'rect' as FeatureId,
          'Card',
          rectShape(vec(0, 0), 20, 20),
        ),
      ),
      addPart(
        pathPart(
          'tri-part' as FeatureId,
          'tri' as FeatureId,
          'Tab',
          polyline([vec(0, 0), vec(10, 0), vec(0, 10)], true),
        ),
      ),
    ].reduce((d, c) => c.apply(d), wallet());

    expect(refusal(document, { kind: 'remove', featureId: 'nope' as FeatureId, vertex: 0 })).toBe(
      'FEATURE_MISSING',
    );
    expect(refusal(document, { kind: 'remove', featureId: 'rect' as FeatureId, vertex: 0 })).toBe(
      'NOT_A_DRAWN_PATH',
    );
    expect(refusal(document, { kind: 'remove', featureId: STITCH, vertex: 0 })).toBe(
      'NOT_A_DRAWN_PATH',
    );
    expect(refusal(document, { kind: 'remove', featureId: 'tri' as FeatureId, vertex: 0 })).toBe(
      'POINT_EDIT_DEGENERATE',
    );
    expect(refusal(document, { kind: 'move', featureId: OUTLINE, vertex: 1, to: vec(0, 0) })).toBe(
      'POINT_EDIT_DEGENERATE',
    );

    // Asked before any particular edit, the same answers.
    expect(pointEditingRefusal(document.project, OUTLINE)).toBeNull();
    expect(pointEditingRefusal(document.project, 'rect' as FeatureId)?.code).toBe(
      'NOT_A_DRAWN_PATH',
    );

    const locked = setFeatureLocked(OUTLINE, true).apply(document);
    expect(pointEditingRefusal(locked.project, OUTLINE)?.code).toBe('FEATURE_LOCKED');
    expect(refusal(locked, { kind: 'insert', featureId: OUTLINE, segment: 0, t: 0.5 })).toBe(
      'FEATURE_LOCKED',
    );
  });

  it('edits the points of a drawn line that is not an outline', () => {
    const line: Feature = {
      id: 'mark' as FeatureId,
      kind: 'marking-line',
      purpose: 'alignment',
      name: 'Line',
      visible: true,
      locked: false,
      source: { kind: 'path', path: polyline([vec(10, 10), vec(20, 10)]) },
    };
    const document = addFeature('part' as FeatureId, line).apply(wallet());
    const after = editPathPoint({
      kind: 'insert',
      featureId: 'mark' as FeatureId,
      segment: 0,
      t: 0.5,
    }).apply(document);

    expect(after).not.toBe(document);
  });
});

describe('every point edit, on any drawn outline', () => {
  it('leaves each dimension on the place it was on, or refuses', () => {
    const arbPolygon = fc
      .array(
        fc.record({ x: fc.integer({ min: 0, max: 40 }), y: fc.integer({ min: 0, max: 40 }) }),
        { minLength: 4, maxLength: 7 },
      )
      .map((points) => polyline(points, true))
      .filter(
        (p) =>
          p.segments.every((s) => PathOps.length({ segments: [s], closed: false }) > 1) &&
          cornerDistances(p).length >= 2,
      );

    const arbCase = arbPolygon.chain((outline) => {
      const corners = cornerDistances(outline).length;
      const count = PathOps.vertices(outline).length;
      return fc.record({
        outline: fc.constant(outline),
        a: fc.integer({ min: 0, max: corners - 1 }),
        b: fc.integer({ min: 0, max: corners - 1 }),
        edit: fc.oneof(
          fc
            .tuple(
              fc.integer({ min: 0, max: count - 1 }),
              fc.record({
                x: fc.integer({ min: -10, max: 50 }),
                y: fc.integer({ min: -10, max: 50 }),
              }),
            )
            .map(([vertex, to]): PathPointEdit => ({
              kind: 'move',
              featureId: OUTLINE,
              vertex,
              to,
            })),
          fc
            .tuple(fc.integer({ min: 0, max: count - 1 }), fc.constantFrom(0.25, 0.5, 0.75))
            .map(([segment, t]): PathPointEdit => ({
              kind: 'insert',
              featureId: OUTLINE,
              segment,
              t,
            })),
          fc
            .integer({ min: 0, max: count - 1 })
            .map((vertex): PathPointEdit => ({ kind: 'remove', featureId: OUTLINE, vertex })),
        ),
      });
    });

    fc.assert(
      fc.property(arbCase, ({ outline, a, b, edit }) => {
        const before = [
          addPart(pathPart('part' as FeatureId, OUTLINE, 'Panel', outline)),
          addMeasurement(
            DIMENSION,
            'aligned',
            { kind: 'anchor', featureId: OUTLINE, anchor: a },
            { kind: 'anchor', featureId: OUTLINE, anchor: b },
          ),
        ].reduce((d, c) => c.apply(d), emptyDocument('p'));

        const problem = pathPointRefusal(before.project, edit);
        const after = editPathPoint(edit).apply(before);

        if (problem !== null) {
          // A refusal changes nothing, and is only ever for a real reason.
          expect(after).toBe(before);
          if (problem.code === 'CORNER_IN_USE') {
            const map = cornersThroughEdit(outline, geometryOf(outline, edit)!);
            expect(map[a] === null || map[b] === null).toBe(true);
          }
          return;
        }

        const [a2, b2] = refs(after.project, DIMENSION);
        const moved = edit.kind === 'move' ? edit.to : null;
        for (const [k, j] of [
          [a, a2],
          [b, b2],
        ] as const) {
          const was = anchorAt(before.project, OUTLINE, k);
          const is = anchorAt(after.project, OUTLINE, j);
          // The same place — or, for the point that was moved, where it went.
          expect(close(was, is) || close(is, moved)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

function geometryOf(outline: Path, edit: PathPointEdit) {
  switch (edit.kind) {
    case 'move':
      return movePathVertex(outline, edit.vertex, edit.to);
    case 'insert':
      return insertPathVertex(outline, edit.segment, edit.t);
    case 'remove':
      return removePathVertex(outline, edit.vertex);
  }
}
