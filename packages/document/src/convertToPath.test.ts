import { EPS_LENGTH, EPS_POINT } from '@leathercad/core';
import {
  evaluate,
  type Feature,
  type ParametricShape,
  type Project,
  type ResolvedFeature,
} from '@leathercad/domain';
import { EXPORT_TOLERANCE_MM, MatOps, PathOps, SegmentOps, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addHardwareHole,
  addHoleRow,
  addMeasurement,
  addPart,
  addStitchHoles,
  addStitchLine,
  arcShape,
  circleShape,
  convertToPath,
  convertToPathRefusal,
  emptyDocument,
  pathPart,
  rectShape,
  refusedTransforms,
  setFeatureLocked,
  shapePart,
  transformFeatures,
} from './commands.js';
import { editPathPoint, pointEditingRefusal } from './pathPoints.js';
import { DocumentStore } from './store.js';

/**
 * 3.12: the escape hatch from a shape's parameters. Converting is meant to
 * change *what the record is* and nothing about *what it draws*, so most of
 * these compare the evaluated project before and after.
 */

function storeWith(shape: ParametricShape): DocumentStore {
  const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
  store.dispatch(addPart(shapePart('part-1', 'shape-1', 'Panel', shape)));
  return store;
}

/** A piece with its stitching: the outline, a stitch line 3.5 mm in, and its holes. */
function stitchedPiece(shape: ParametricShape): DocumentStore {
  const store = storeWith(shape);
  store.dispatch(addStitchLine('part-1', 'stitch-1', 'shape-1', 3.5));
  store.dispatch(addStitchHoles('part-1', 'holes-1', 'stitch-1'));
  return store;
}

const project = (store: DocumentStore): Project => store.getState().document.project;

const featureOf = (store: DocumentStore, id: string): Feature =>
  project(store)
    .parts.flatMap((part) => part.features)
    .find((feature) => feature.id === id)!;

/** What a feature resolved to, without the record it was resolved from. */
function outcomes(store: DocumentStore): Map<string, unknown> {
  const entries = evaluate(project(store)).parts.flatMap((part) => part.features);
  return new Map(entries.map((entry) => [entry.feature.id, withoutRecord(entry)] as const));
}

function withoutRecord(entry: ResolvedFeature): unknown {
  const { feature: _feature, ...rest } = entry;
  return rest;
}

const arbCentre: fc.Arbitrary<Vec2> = fc.record({
  x: fc.double({ min: -500, max: 500, noNaN: true }),
  y: fc.double({ min: -500, max: 500, noNaN: true }),
});
const arbRadius = fc.oneof(
  fc.double({ min: 0.5, max: 300, noNaN: true }),
  fc.constantFrom(1, 3.85, 8, 50),
);
const arbTurn = fc.oneof(
  fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  fc.constantFrom(0, Math.PI / 6, Math.PI / 2, -Math.PI / 2, Math.PI),
);
const arbSweep = fc.oneof(
  fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true }).filter((s) => Math.abs(s) > 0.01),
  fc.constantFrom(Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI, Math.PI * 1.5),
);
const arbCorner = fc.oneof(fc.constant(0), fc.double({ min: 0, max: 40, noNaN: true }));

const arbRect = fc
  .record({
    origin: arbCentre,
    width: fc.double({ min: 10, max: 400, noNaN: true }),
    height: fc.double({ min: 10, max: 400, noNaN: true }),
    radii: fc.record({
      bottomLeft: arbCorner,
      bottomRight: arbCorner,
      topRight: arbCorner,
      topLeft: arbCorner,
    }),
    rotation: arbTurn,
  })
  .map((r): ParametricShape => ({ type: 'rect', ...r }));
const arbCircle = fc
  .tuple(arbCentre, arbRadius)
  .map(([centre, radius]): ParametricShape => circleShape(centre, radius));
const arbArc = fc
  .tuple(arbCentre, arbRadius, arbTurn, arbSweep)
  .map(([centre, radius, start, sweep]): ParametricShape => arcShape(centre, radius, start, sweep));

const arbShape = fc.oneof(arbRect, arbCircle, arbArc);
const arbClosedShape = fc.oneof(arbRect, arbCircle);

describe('converting a shape to a drawn path (3.12)', () => {
  it('draws exactly what the shape drew: the same path, the same anchors', () => {
    fc.assert(
      fc.property(arbShape, (shape) => {
        const store = storeWith(shape);
        const before = outcomes(store);

        store.dispatch(convertToPath('shape-1'));

        expect(featureOf(store, 'shape-1').source.kind).toBe('path');
        expect(outcomes(store)).toEqual(before);
      }),
    );
  });

  it('keeps its length, its closedness and which way round it runs', () => {
    fc.assert(
      fc.property(arbShape, (shape) => {
        const store = storeWith(shape);
        const path = (): ReturnType<typeof PathOps.closed> => {
          const entry = evaluate(project(store)).parts[0]!.features[0]!;
          if (!entry.ok) throw new Error('the shape did not resolve');
          return entry.path;
        };
        const before = path();

        store.dispatch(convertToPath('shape-1'));
        const after = path();

        expect(Math.abs(PathOps.length(after) - PathOps.length(before))).toBeLessThanOrEqual(
          EPS_LENGTH * Math.max(1, PathOps.length(before)),
        );
        expect(after.closed).toBe(before.closed);
        if (before.closed) expect(PathOps.orientation(after)).toBe(PathOps.orientation(before));
      }),
    );
  });

  it('puts every point of a converted circle or arc on the circle it was', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbCircle, arbArc),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (shape, along) => {
          if (shape.type === 'rect') return;
          const store = storeWith(shape);
          store.dispatch(convertToPath('shape-1'));

          const source = featureOf(store, 'shape-1').source;
          if (source.kind !== 'path') throw new Error('not converted');
          const measure = PathOps.measure(source.path);
          const point = measure.pointAtDistance(measure.totalLength() * along);

          const off = Math.hypot(point.x - shape.centre.x, point.y - shape.centre.y);
          expect(Math.abs(off - shape.radius)).toBeLessThanOrEqual(
            EPS_POINT * Math.max(1, shape.radius),
          );
        },
      ),
    );
  });

  it('leaves the stitch line and its holes resolving exactly as they did', () => {
    fc.assert(
      fc.property(arbClosedShape, (shape) => {
        const store = stitchedPiece(shape);
        const before = outcomes(store);

        store.dispatch(convertToPath('shape-1'));

        expect(outcomes(store)).toEqual(before);
      }),
    );
  });

  it('leaves a row of holes along a converted arc where it was', () => {
    fc.assert(
      fc.property(arbArc, (shape) => {
        const store = storeWith(shape);
        store.dispatch(addHoleRow('part-1', 'row-1', 'shape-1'));
        const before = outcomes(store);

        store.dispatch(convertToPath('shape-1'));

        expect(outcomes(store)).toEqual(before);
      }),
    );
  });

  it('keeps the id, the name, the kind and the role, and what follows it still follows it', () => {
    const store = stitchedPiece(circleShape({ x: 0, y: 0 }, 40));
    const before = featureOf(store, 'shape-1');

    store.dispatch(convertToPath('shape-1'));
    const after = featureOf(store, 'shape-1');

    expect({ ...after, source: undefined }).toEqual({ ...before, source: undefined });
    expect(featureOf(store, 'stitch-1').source).toMatchObject({
      kind: 'derived',
      sourceId: 'shape-1',
    });
  });

  it('keeps a dimension to a rectangle’s corners reading the same number', () => {
    const store = storeWith(rectShape({ x: 0, y: 0 }, 105, 75, 8, 0.3));
    store.dispatch(
      addMeasurement(
        'dim-1',
        'aligned',
        { kind: 'anchor', featureId: 'shape-1', anchor: 0 },
        { kind: 'anchor', featureId: 'shape-1', anchor: 2 },
      ),
    );
    const before = outcomes(store).get('dim-1');

    store.dispatch(convertToPath('shape-1'));

    expect(outcomes(store).get('dim-1')).toEqual(before);
  });

  it('is one step of undo, named for what it did', () => {
    const store = storeWith(circleShape({ x: 0, y: 0 }, 40));
    const before = store.getState().document;

    store.dispatch(convertToPath('shape-1'));
    expect(store.getState().undoLabel).toEqual({ action: 'convert-to-path' });

    store.undo();
    expect(store.getState().document).toBe(before);
  });
});

describe('what converting makes possible (3.7’s refusals)', () => {
  it('lets a converted circle be squashed into an ellipse, every point on it', () => {
    fc.assert(
      fc.property(
        arbCircle,
        fc.double({ min: 0.2, max: 5, noNaN: true }),
        fc.double({ min: 0.2, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (shape, sx, sy, t) => {
          if (shape.type !== 'circle') return;
          const squash = MatOps.fromScale(sx, sy);
          const store = storeWith(shape);
          store.dispatch(convertToPath('shape-1'));

          expect(refusedTransforms(project(store), ['shape-1'], squash)).toEqual([]);
          store.dispatch(transformFeatures(['shape-1'], squash, { action: 'scale' }));

          const source = featureOf(store, 'shape-1').source;
          if (source.kind !== 'path') throw new Error('not a path');
          expect(source.path.closed).toBe(true);
          for (const segment of source.path.segments) {
            // Read back through the squash, a point on the ellipse is a point
            // on the circle — off it by no more than the arc-to-cubic budget
            // geometry.md §4.2 rule 2 converts with.
            const p = SegmentOps.pointAt(segment, t);
            const u = p.x / sx - shape.centre.x;
            const v = p.y / sy - shape.centre.y;
            const offMm = Math.abs(Math.hypot(u, v) - shape.radius);
            expect(offMm).toBeLessThanOrEqual(EXPORT_TOLERANCE_MM);
          }
        },
      ),
    );
  });

  it('says, rather than guesses, that a stitch line cannot follow the squashed curve yet (9.19)', () => {
    const store = stitchedPiece(circleShape({ x: 0, y: 0 }, 40));
    store.dispatch(convertToPath('shape-1'));

    store.dispatch(transformFeatures(['shape-1'], MatOps.fromScale(2, 1), { action: 'scale' }));

    const stitch = evaluate(project(store))
      .parts.flatMap((part) => part.features)
      .find((entry) => entry.feature.id === 'stitch-1');
    expect(stitch?.ok).toBe(false);
    expect(stitch?.ok === false && stitch.problem.code).toBe('OFFSET_UNSUPPORTED');
  });

  it('lets a converted circle be reshaped by its points, once it has a second one', () => {
    const store = storeWith(circleShape({ x: 0, y: 0 }, 40));
    expect(pointEditingRefusal(project(store), 'shape-1')?.code).toBe('NOT_A_DRAWN_PATH');

    store.dispatch(convertToPath('shape-1'));
    expect(pointEditingRefusal(project(store), 'shape-1')).toBeNull();
    // A whole circle is one arc with one point, which has no second end to
    // hang it from (geometry.md §4.7); a point added on it gives it one.
    store.dispatch(editPathPoint({ kind: 'insert', featureId: 'shape-1', segment: 0, t: 0.5 }));
    store.dispatch(
      editPathPoint({ kind: 'move', featureId: 'shape-1', vertex: 1, to: { x: -60, y: 0 } }),
    );

    const source = featureOf(store, 'shape-1').source;
    if (source.kind !== 'path') throw new Error('not a path');
    const moved = PathOps.vertices(source.path)[1]!;
    expect(Math.hypot(moved.x + 60, moved.y)).toBeLessThanOrEqual(EPS_POINT);
  });

  it('lets a converted arc be stretched', () => {
    const store = storeWith(arcShape({ x: 0, y: 0 }, 20, 0, Math.PI / 2));
    expect(refusedTransforms(project(store), ['shape-1'], MatOps.fromScale(2, 1))).toHaveLength(1);

    store.dispatch(convertToPath('shape-1'));

    expect(refusedTransforms(project(store), ['shape-1'], MatOps.fromScale(2, 1))).toEqual([]);
  });

  it('lets a converted turned rectangle be sheared', () => {
    const store = storeWith(rectShape({ x: 0, y: 0 }, 100, 40, 5, Math.PI / 6));
    expect(refusedTransforms(project(store), ['shape-1'], MatOps.fromScale(2, 1))).toHaveLength(1);

    store.dispatch(convertToPath('shape-1'));

    expect(refusedTransforms(project(store), ['shape-1'], MatOps.fromScale(2, 1))).toEqual([]);
  });
});

describe('what is not converted', () => {
  it('refuses a locked shape, and changes nothing', () => {
    const store = storeWith(circleShape({ x: 0, y: 0 }, 40));
    store.dispatch(setFeatureLocked(['shape-1'], true));
    const before = store.getState().document;

    expect(convertToPathRefusal(project(store), 'shape-1')?.code).toBe('FEATURE_LOCKED');
    store.dispatch(convertToPath('shape-1'));
    expect(store.getState().document).toBe(before);
  });

  it('refuses a hardware hole: it is punched, so it stays round', () => {
    const store = storeWith(rectShape({ x: 0, y: 0 }, 100, 60));
    store.dispatch(addHardwareHole('part-1', 'rivet-1', { x: 50, y: 30 }, 2));
    const before = store.getState().document;

    expect(convertToPathRefusal(project(store), 'rivet-1')).toEqual({
      code: 'HOLE_STAYS_ROUND',
      facts: { featureId: 'rivet-1', featureName: featureOf(store, 'rivet-1').name },
    });
    store.dispatch(convertToPath('rivet-1'));
    expect(store.getState().document).toBe(before);
  });

  it('refuses what is not a shape: a drawn path, or a derived feature', () => {
    const store = new DocumentStore(emptyDocument('doc', 'Untitled'));
    store.dispatch(
      addPart(
        pathPart(
          'part-1',
          'drawn-1',
          'Panel',
          PathOps.polyline(
            [
              { x: 0, y: 0 },
              { x: 50, y: 0 },
              { x: 0, y: 50 },
            ],
            true,
          ),
        ),
      ),
    );
    store.dispatch(addStitchLine('part-1', 'stitch-1', 'drawn-1', 3));
    const before = store.getState().document;

    expect(convertToPathRefusal(project(store), 'drawn-1')?.code).toBe('NOT_A_SHAPE');
    expect(convertToPathRefusal(project(store), 'stitch-1')?.code).toBe('NOT_A_SHAPE');
    store.dispatch(convertToPath('drawn-1'));
    store.dispatch(convertToPath('stitch-1'));
    expect(store.getState().document).toBe(before);
  });

  it('refuses a feature that is not there', () => {
    const store = storeWith(circleShape({ x: 0, y: 0 }, 40));

    expect(convertToPathRefusal(project(store), 'gone')?.code).toBe('FEATURE_MISSING');
  });
});
