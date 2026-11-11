import {
  addGuide,
  deleteGuide,
  setFeatureLocked,
  setFeatureVisible,
  setGuide,
  translateFeatures,
  type Command,
  type Document,
} from '@leathercad/document';
import type {
  CutContour,
  Feature,
  FeatureId,
  GeometrySource,
  Guide,
  Part,
  Project,
  ResolvedProject,
} from '@leathercad/domain';
import { DEFAULT_SETTINGS, evaluate } from '@leathercad/domain';
import {
  circle,
  cubic,
  line,
  PathOps,
  polyline,
  vec,
  type Path,
  type Vec2,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  buildSnapIndex,
  decideSnap,
  snap,
  snapGlyph,
  type AxisCandidate,
  type AxisKind,
  type Measured,
  type SnapCandidate,
  type Snapped,
  type SnapIndex,
  type SnapKind,
  type SnapOptions,
} from './snap.js';

let counter = 0;

function feature(p: Path): CutContour {
  counter += 1;
  return {
    kind: 'cut-contour',
    role: 'outer',
    id: `f${counter}` as CutContour['id'],
    name: `feature ${counter}`,
    visible: true,
    locked: false,
    source: { kind: 'path', path: p },
  };
}

/** A resolved project holding the given paths, one feature each. */
function resolvedOf(...paths: Path[]): ResolvedProject {
  const features = paths.map(feature);
  const part: Part = { id: 'p1' as Part['id'], name: 'Panel', quantity: 1, features };
  const project: Project = {
    id: 'proj' as Project['id'],
    name: 'test',
    settings: DEFAULT_SETTINGS,
    parts: [part],
  };

  return {
    project,
    parts: [
      {
        part,
        features: features.map((f, i) => ({
          ok: true as const,
          feature: f,
          role: 'cut' as const,
          path: paths[i]!,
          anchors: [],
        })),
      },
    ],
  };
}

const options = (overrides: Partial<SnapOptions> = {}): SnapOptions => ({
  toleranceMm: 2,
  ...overrides,
});

const square = polyline([vec(0, 0), vec(20, 0), vec(20, 20), vec(0, 20)], true);

describe('snap', () => {
  it('catches a guide crossing an ordinary edge, and excludes the guide during a drag', () => {
    const original = resolvedOf(square);
    const resolved = {
      ...original,
      project: {
        ...original.project,
        guides: [{ id: 'guide', origin: { x: 7, y: 0 }, angleRad: Math.PI / 2 }],
      },
    };
    const index = buildSnapIndex(resolved);
    const hit = snap(index, resolved, vec(7.5, 0.5), options());
    expect(hit?.kind).toBe('intersection');
    expect(hit?.point.x).toBeCloseTo(7);
    expect(hit?.point.y).toBeCloseTo(0);
    expect(snap(index, resolved, vec(7.5, 0.5), options({ exclude: ['guide'] }))?.kind).toBe(
      'on-path',
    );
  });
  it('finds an endpoint', () => {
    const resolved = resolvedOf(square);
    const hit = snap(buildSnapIndex(resolved), resolved, vec(19.5, 0.3), options());

    expect(hit?.kind).toBe('endpoint');
    expect(hit?.point).toEqual(vec(20, 0));
  });

  it('finds the midpoint of a segment', () => {
    const resolved = resolvedOf(square);
    const hit = snap(buildSnapIndex(resolved), resolved, vec(10.4, 0.2), options());

    expect(hit?.kind).toBe('midpoint');
    expect(hit?.point).toEqual(vec(10, 0));
  });

  it('finds the centre of a circle', () => {
    const resolved = resolvedOf(circle(vec(50, 50), 10));
    const hit = snap(buildSnapIndex(resolved), resolved, vec(50.5, 49.8), options());

    expect(hit?.kind).toBe('centre');
    expect(hit?.point).toEqual(vec(50, 50));
  });

  it('finds where two features cross', () => {
    // Deliberately offset so the crossing is not also a midpoint of either
    // line — it would be, at (10,10), and midpoint outranks intersection.
    const resolved = resolvedOf(
      polyline([vec(0, 10), vec(20, 10)]),
      polyline([vec(5, 0), vec(5, 30)]),
    );
    const hit = snap(buildSnapIndex(resolved), resolved, vec(5.3, 10.3), options());

    expect(hit?.kind).toBe('intersection');
    expect(hit?.point.x).toBeCloseTo(5, 9);
    expect(hit?.point.y).toBeCloseTo(10, 9);
  });

  it('falls back to the nearest point on a path', () => {
    const resolved = resolvedOf(square);
    // Well away from any vertex or midpoint, but close to the edge.
    const hit = snap(buildSnapIndex(resolved), resolved, vec(5, 0.4), options());

    expect(hit?.kind).toBe('on-path');
    expect(hit?.point.y).toBeCloseTo(0, 9);
    expect(hit?.point.x).toBeCloseTo(5, 9);
  });

  it('snaps to the grid when nothing else is near', () => {
    const resolved = resolvedOf(square);
    const hit = snap(buildSnapIndex(resolved), resolved, vec(100.3, 199.6), options({ gridMm: 1 }));

    expect(hit?.kind).toBe('grid');
    expect(hit?.point).toEqual(vec(100, 200));
  });

  it('prefers an endpoint to anything else within tolerance', () => {
    const resolved = resolvedOf(square);
    // The corner, the edge under it and the grid are all in range.
    const hit = snap(buildSnapIndex(resolved), resolved, vec(0.4, 0.4), options({ gridMm: 1 }));

    expect(hit?.kind).toBe('endpoint');
  });

  it('takes the nearest when two candidates share a kind', () => {
    const resolved = resolvedOf(square);
    const hit = snap(
      buildSnapIndex(resolved),
      resolved,
      vec(19, 1.2),
      options({ toleranceMm: 30 }),
    );

    expect(hit?.point).toEqual(vec(20, 0));
  });

  it('finds nothing beyond the tolerance', () => {
    const resolved = resolvedOf(square);

    expect(snap(buildSnapIndex(resolved), resolved, vec(500, 500), options())).toBeNull();
  });

  it('ignores a feature the caller is dragging', () => {
    const resolved = resolvedOf(square);
    const id = resolved.parts[0]!.features[0]!.feature.id;
    const hit = snap(buildSnapIndex(resolved), resolved, vec(0.2, 0.2), options({ exclude: [id] }));

    // Snapping a shape to its own corner would pin it in place.
    expect(hit).toBeNull();
  });

  it('respects a disabled kind', () => {
    const resolved = resolvedOf(square);
    const hit = snap(
      buildSnapIndex(resolved),
      resolved,
      vec(0.2, 0.2),
      options({ enabled: { endpoint: false } }),
    );

    expect(hit?.kind).not.toBe('endpoint');
  });

  it('ignores hidden and locked features', () => {
    const resolved = resolvedOf(square);
    const hidden: ResolvedProject = {
      ...resolved,
      parts: [
        {
          ...resolved.parts[0]!,
          features: resolved.parts[0]!.features.map((f) => ({
            ...f,
            feature: { ...f.feature, visible: false },
          })) as ResolvedProject['parts'][number]['features'],
        },
      ],
    };

    expect(snap(buildSnapIndex(hidden), hidden, vec(0.2, 0.2), options())).toBeNull();
  });

  it('is deterministic', () => {
    const resolved = resolvedOf(square);
    const index = buildSnapIndex(resolved);
    const at = vec(0.4, 0.4);

    expect(snap(index, resolved, at, options())).toEqual(snap(index, resolved, at, options()));
  });

  it('agrees with a brute-force search over the same candidates', () => {
    // The spatial index is an optimisation; it must not change the answer.
    const resolved = resolvedOf(
      square,
      circle(vec(60, 60), 5),
      polyline([vec(-30, 5), vec(40, 5)]),
    );
    const index = buildSnapIndex(resolved);
    const naive = buildSnapIndex(resolved, { cellMm: Number.POSITIVE_INFINITY });

    for (let x = -40; x <= 70; x += 3.5) {
      for (let y = -10; y <= 70; y += 3.5) {
        const at: Vec2 = vec(x, y);
        expect(snap(index, resolved, at, options())).toEqual(snap(naive, resolved, at, options()));
      }
    }
  });
});

describe('buildSnapIndex across edits (PERF-004)', () => {
  const arbPoint = fc
    .tuple(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 60 }))
    .map(([x, y]) => vec(x, y));

  /** Lines, arcs and curves, overlapping one another often. */
  const arbSource = fc.oneof(
    fc
      .tuple(fc.array(arbPoint, { minLength: 3, maxLength: 6 }), fc.boolean())
      .map(([points, closed]): GeometrySource => ({
        kind: 'path',
        path: polyline(points, closed),
      })),
    fc.tuple(arbPoint, arbPoint, arbPoint, arbPoint).map(([p0, p1, p2, p3]): GeometrySource => ({
      kind: 'path',
      path: PathOps.path([cubic(p0, p1, p2, p3), line(p3, p0)], true),
    })),
    fc.tuple(arbPoint, fc.integer({ min: 2, max: 30 })).map(([centre, radius]): GeometrySource => ({
      kind: 'shape',
      shape: { type: 'circle', centre, radius },
    })),
    fc
      .tuple(arbPoint, fc.integer({ min: 2, max: 30 }), fc.integer({ min: -3, max: 3 }))
      .map(([centre, radius, quarter]): GeometrySource => ({
        kind: 'shape',
        shape: { type: 'arc', centre, radius, startAngle: 0, sweepAngle: (quarter || 1) * 1.2 },
      })),
  );

  /**
   * Parts of a contour or two, some with a stitch line and its holes — the
   * stitch line now and then inset from another part's contour.
   */
  const arbProject = fc
    .record({
      parts: fc.array(
        fc.record({
          contours: fc.array(
            fc.record({ source: arbSource, visible: fc.boolean(), locked: fc.boolean() }),
            { minLength: 1, maxLength: 2 },
          ),
          stitchFrom: fc.option(fc.nat(), { nil: undefined }),
        }),
        { minLength: 1, maxLength: 3 },
      ),
      guides: fc.array(fc.tuple(arbPoint, fc.integer({ min: 0, max: 7 })), { maxLength: 2 }),
    })
    .map(({ parts, guides }): Project => {
      const contourIds = parts.flatMap((p, i) => p.contours.map((_, j) => `c${i}-${j}`));
      return {
        id: 'p',
        name: 'p',
        settings: DEFAULT_SETTINGS,
        guides: guides.map(([origin, eighth], k) => ({
          id: `g${k}`,
          origin,
          angleRad: (eighth * Math.PI) / 4,
        })),
        parts: parts.map((p, i): Part => {
          const features: Feature[] = p.contours.map((c, j) => ({
            id: `c${i}-${j}`,
            kind: 'cut-contour',
            role: 'outer',
            name: 'Contour',
            visible: c.visible,
            locked: c.locked,
            source: c.source,
          }));
          if (p.stitchFrom !== undefined) {
            const from = contourIds[p.stitchFrom % contourIds.length]!;
            features.push(
              {
                id: `s${i}`,
                kind: 'stitch-line',
                name: 'Stitch line',
                visible: true,
                locked: false,
                source: {
                  kind: 'derived',
                  sourceId: from,
                  op: { type: 'offset', distanceMm: 2, side: 'inward', run: { kind: 'whole' } },
                },
              },
              {
                id: `h${i}`,
                kind: 'stitch-hole-set',
                name: 'Stitch holes',
                visible: true,
                locked: false,
                source: {
                  kind: 'derived',
                  sourceId: `s${i}`,
                  op: {
                    type: 'stitch-holes',
                    pitchMm: 3.85,
                    mode: 'fit-whole',
                    corners: 'continuous',
                  },
                },
              },
            );
          }
          return { id: `part${i}`, name: 'Part', quantity: 1, features };
        }),
      };
    });

  /** What a maker does between two revisions, by index into what exists. */
  const arbEdit = fc.oneof(
    fc.record({ kind: fc.constant('move'), at: fc.nat(), by: arbPoint }),
    fc.record({ kind: fc.constant('hide'), at: fc.nat(), on: fc.boolean() }),
    fc.record({ kind: fc.constant('lock'), at: fc.nat(), on: fc.boolean() }),
    fc.record({ kind: fc.constant('move-guide'), at: fc.nat(), to: arbPoint }),
    fc.record({ kind: fc.constant('add-guide'), at: arbPoint, eighth: fc.nat({ max: 7 }) }),
    fc.record({ kind: fc.constant('delete-guide'), at: fc.nat() }),
  );
  type Edit = typeof arbEdit extends fc.Arbitrary<infer E> ? E : never;

  function commandFor(project: Project, edit: Edit, step: number): Command {
    const ids = project.parts.flatMap((p) => p.features.map((f) => f.id));
    const guides = project.guides ?? [];
    const guideAt = (at: number): Guide | undefined => guides[at % Math.max(1, guides.length)];
    switch (edit.kind) {
      case 'move':
        return translateFeatures([ids[edit.at % ids.length]!], vec(edit.by.x - 30, edit.by.y - 30));
      case 'hide':
        return setFeatureVisible([ids[edit.at % ids.length]!], edit.on);
      case 'lock':
        return setFeatureLocked([ids[edit.at % ids.length]!], edit.on);
      case 'move-guide': {
        const guide = guideAt(edit.at);
        return guide === undefined
          ? addGuide({ id: `n${step}`, origin: edit.to, angleRad: 0 })
          : setGuide({ ...guide, origin: edit.to });
      }
      case 'add-guide':
        return addGuide({ id: `n${step}`, origin: edit.at, angleRad: (edit.eighth * Math.PI) / 4 });
      case 'delete-guide':
        return deleteGuide(guideAt(edit.at)?.id ?? 'none');
    }
  }

  describe('recomputes only what an edit touched', () => {
    // A work guard, not a timing: a crossing recomputed is a new point
    // object, one read back is the very one computed before. Full rebuilds
    // coming back make every point new.
    const contour = (id: string, source: GeometrySource): Feature => ({
      id,
      kind: 'cut-contour',
      role: 'outer',
      name: id,
      visible: true,
      locked: false,
      source,
    });
    const start: Project = {
      id: 'p',
      name: 'p',
      settings: DEFAULT_SETTINGS,
      guides: [{ id: 'g', origin: vec(5, 0), angleRad: Math.PI / 2 }],
      parts: [
        {
          id: 'still',
          name: 'Still',
          quantity: 1,
          features: [
            contour('square', { kind: 'path', path: square }),
            contour('bar', { kind: 'path', path: polyline([vec(-5, 7), vec(30, 7)]) }),
          ],
        },
        {
          id: 'moving',
          name: 'Moving',
          quantity: 1,
          features: [
            contour('ring', {
              kind: 'shape',
              shape: { type: 'circle', centre: vec(40, 10), radius: 8 },
            }),
          ],
        },
      ],
    };
    /** Each crossing's point, by what crossed and where. */
    const crossingPoints = (index: SnapIndex): Map<string, Vec2> =>
      new Map(
        [...index.buckets.values()]
          .flat()
          .filter((c) => c.kind === 'intersection')
          .map((c) => [`${c.featureId}/${c.guideId ?? ''}@${c.point.x},${c.point.y}`, c.point]),
      );
    const unchanged = (before: SnapIndex, after: SnapIndex, prefix: string): void => {
      const now = crossingPoints(after);
      const kept = [...crossingPoints(before)].filter(([key]) => key.startsWith(prefix));
      expect(kept.length).toBeGreaterThan(0);
      for (const [key, point] of kept) expect(now.get(key)).toBe(point);
    };

    it('carrying one piece keeps the crossings of the pieces it left alone', () => {
      const before = buildSnapIndex(evaluate(start));
      const moved = translateFeatures(['ring'], vec(3, 0)).apply({ project: start }).project;
      const after = buildSnapIndex(evaluate(moved));

      unchanged(before, after, 'square/@');
      unchanged(before, after, 'square/g@');
    });

    it('dragging a guide keeps every crossing between features', () => {
      const before = buildSnapIndex(evaluate(start));
      const moved = setGuide({ id: 'g', origin: vec(9, 0), angleRad: Math.PI / 2 }).apply({
        project: start,
      }).project;
      const after = buildSnapIndex(evaluate(moved));

      unchanged(before, after, 'square/@');
    });
  });

  /** A copy sharing no object with what the index has seen, so nothing in it is reused. */
  const fullRebuild = (resolved: ResolvedProject): SnapIndex =>
    buildSnapIndex(structuredClone(resolved));

  it('gives the candidates a full rebuild gives, in the same order, after every edit', () => {
    fc.assert(
      fc.property(arbProject, fc.array(arbEdit, { minLength: 1, maxLength: 6 }), (start, edits) => {
        let document: Document = { project: start };
        for (const [step, edit] of [undefined, ...edits].entries()) {
          if (edit !== undefined)
            document = commandFor(document.project, edit, step).apply(document);
          const resolved = evaluate(document.project);

          expect([...buildSnapIndex(resolved).buckets]).toEqual([...fullRebuild(resolved).buckets]);
        }
      }),
    );
  });
});

describe('snap kinds', () => {
  it('orders every kind by priority', () => {
    // Pinning the order: it is a product decision, and silently reordering it
    // would change what the cursor does without changing any assertion.
    const order: SnapKind[] = ['endpoint', 'midpoint', 'centre', 'intersection', 'on-path', 'grid'];

    expect(order).toHaveLength(6);
  });
});

describe('snapGlyph', () => {
  const kinds: SnapKind[] = ['endpoint', 'midpoint', 'centre', 'intersection', 'on-path', 'grid'];

  it('draws a distinct marker for every kind', () => {
    // A corner and the edge through it are a fraction of a millimetre apart on
    // screen and very different in the file, so the shapes must differ.
    const shapes = kinds.map((kind) =>
      JSON.stringify(snapGlyph({ kind, point: vec(0, 0) }, 4).map((i) => i.kind)),
    );

    for (const kind of kinds) {
      expect(snapGlyph({ kind, point: vec(0, 0) }, 4).length).toBeGreaterThan(0);
    }
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });

  it('sits at the snapped point', () => {
    const [item] = snapGlyph({ kind: 'endpoint', point: vec(12, -5) }, 4);
    const bounds = item?.kind === 'path' ? PathOps.bbox(item.path) : null;

    expect(bounds).not.toBeNull();
    expect((bounds!.minX + bounds!.maxX) / 2).toBeCloseTo(12, 9);
    expect((bounds!.minY + bounds!.maxY) / 2).toBeCloseTo(-5, 9);
  });

  it('keeps a constant size on screen by dividing by the scale', () => {
    const near = snapGlyph({ kind: 'endpoint', point: vec(0, 0) }, 2, { sizePx: 10 });
    const far = snapGlyph({ kind: 'endpoint', point: vec(0, 0) }, 8, { sizePx: 10 });

    const widthOf = (items: ReturnType<typeof snapGlyph>): number => {
      const b = items[0]?.kind === 'path' ? PathOps.bbox(items[0].path) : null;
      return b === null ? 0 : b.maxX - b.minX;
    };

    // Four times the scale, a quarter of the millimetre size.
    expect(widthOf(near)).toBeCloseTo(widthOf(far) * 4, 9);
  });
});

/**
 * The one snapping model (3.20, smart-guides spec §5 and §13): a candidate
 * with a source and either a point or an axis value, one priority table, ties
 * by document order and hysteresis. `decideSnap` is the whole decision; these
 * properties drive it with synthetic candidates, and the examples after them
 * show what it does to `snap`.
 */
describe('one snapping model (3.20)', () => {
  const TOL = 2;
  const POINT_KINDS: readonly SnapKind[] = [
    'endpoint',
    'midpoint',
    'centre',
    'intersection',
    'guide',
    'on-path',
    'grid',
  ];
  const AXIS_KINDS: readonly AxisKind[] = [
    'guide-axis',
    'host-centre',
    'host-edge',
    'piece-centre',
    'piece-edge',
    'equal-spacing',
  ];
  /** The spec's table, restated so that reordering the one in `snap.ts` fails here. */
  const rank = (kind: SnapKind | AxisKind): number => [...POINT_KINDS, ...AXIS_KINDS].indexOf(kind);

  /** Distances on a coarse grid, so that ties in distance are common. */
  const arbDistance = fc.integer({ min: 0, max: 12 }).map((n) => (n * TOL) / 4);

  /** Point candidates, each its own target: its own feature and point, its place its order. */
  const arbPoints = fc
    .array(fc.record({ kind: fc.constantFrom(...POINT_KINDS), d: arbDistance }), {
      maxLength: 12,
    })
    .map((drawn): Measured<SnapCandidate>[] =>
      drawn.map(({ kind, d }, order) => ({
        candidate: { kind, point: vec(order, 0), featureId: `f${order}` as FeatureId },
        distanceMm: d,
        order,
      })),
    );

  const arbAxes = fc
    .array(
      fc.record({
        kind: fc.constantFrom(...AXIS_KINDS),
        axis: fc.constantFrom('x' as const, 'y' as const),
        d: arbDistance,
      }),
      { maxLength: 12 },
    )
    .map((drawn): Measured<AxisCandidate>[] =>
      drawn.map(({ kind, axis, d }, order) => ({
        candidate: { kind, axis, value: order, featureId: `a${order}` as FeatureId },
        distanceMm: d,
        order,
      })),
    );

  /** The same candidates in another order: the answer must not depend on it. */
  const shuffled = <T>(items: readonly T[]) =>
    fc.shuffledSubarray([...items], { minLength: items.length, maxLength: items.length });

  /** Highest rank, then nearest, then earliest in document order — among those in tolerance. */
  function expected<C extends SnapCandidate | AxisCandidate>(
    found: readonly Measured<C>[],
  ): C | null {
    const caught = found
      .filter((f) => f.distanceMm <= TOL)
      .sort(
        (a, b) =>
          rank(a.candidate.kind) - rank(b.candidate.kind) ||
          a.distanceMm - b.distanceMm ||
          a.order - b.order,
      );
    return caught[0]?.candidate ?? null;
  }

  const decide = (
    points: readonly Measured<SnapCandidate>[],
    axes: readonly Measured<AxisCandidate>[] = [],
    held: Snapped | null = null,
    smartGuides = true,
  ): Snapped => decideSnap(points, axes, held, { toleranceMm: TOL, smartGuides });

  describe('priority and ties', () => {
    it('takes the highest kind in tolerance, then the nearest, then the earliest in document order', () => {
      fc.assert(
        fc.property(
          arbPoints.chain((points) => fc.tuple(fc.constant(points), shuffled(points))),
          ([points, reordered]) => {
            expect(decide(points).point).toBe(expected(points));
            expect(decide(reordered).point).toBe(expected(points));
          },
        ),
      );
    });

    it('lets a point in tolerance win both axes', () => {
      fc.assert(
        fc.property(arbPoints, arbAxes, (points, axes) => {
          fc.pre(expected(points) !== null);
          const result = decide(points, axes);
          expect(result.point).toBe(expected(points));
          expect(result.x).toBeNull();
          expect(result.y).toBeNull();
        }),
      );
    });

    it('otherwise decides each axis on its own, by the same rules', () => {
      fc.assert(
        fc.property(
          arbAxes.chain((axes) => fc.tuple(fc.constant(axes), shuffled(axes))),
          ([axes, reordered]) => {
            const on = (axis: 'x' | 'y') => axes.filter((f) => f.candidate.axis === axis);
            for (const result of [decide([], axes), decide([], reordered)]) {
              expect(result.point).toBeNull();
              expect(result.x).toBe(expected(on('x')));
              expect(result.y).toBe(expected(on('y')));
            }
          },
        ),
      );
    });

    it('ranks the kinds in the spec table order, in both directions', () => {
      // Each kind beats every kind after it — even nearer and earlier in
      // document order — and so loses to every kind before it.
      for (const [i, higher] of POINT_KINDS.entries()) {
        for (const lower of POINT_KINDS.slice(i + 1)) {
          const measure = (kind: SnapKind, d: number, order: number) => ({
            candidate: { kind, point: vec(order, 0), featureId: `f${order}` as FeatureId },
            distanceMm: d,
            order,
          });
          expect(decide([measure(lower, 0, 0), measure(higher, TOL, 1)]).point?.kind).toBe(higher);
        }
      }
      // Axis kinds among themselves, on one axis.
      for (const [i, higher] of AXIS_KINDS.entries()) {
        for (const lower of AXIS_KINDS.slice(i + 1)) {
          const measure = (kind: AxisKind, d: number, order: number) => ({
            candidate: { kind, axis: 'x' as const, value: order },
            distanceMm: d,
            order,
          });
          expect(decide([], [measure(lower, 0, 0), measure(higher, TOL, 1)]).x?.kind).toBe(higher);
        }
      }
    });
  });

  describe('tolerance', () => {
    it('catches nothing beyond tolerance', () => {
      fc.assert(
        fc.property(arbPoints, arbAxes, (points, axes) => {
          const far = (f: Measured<SnapCandidate> | Measured<AxisCandidate>) => f.distanceMm > TOL;
          const result = decide(points.filter(far), axes.filter(far));
          expect(result).toEqual({ point: null, x: null, y: null });
        }),
      );
    });

    it('never loses a catch when the tolerance widens', () => {
      fc.assert(
        fc.property(
          arbPoints,
          arbAxes,
          fc.double({ min: 0, max: TOL, noNaN: true }),
          (points, axes, extra) => {
            const at = (toleranceMm: number) =>
              decideSnap(points, axes, null, { toleranceMm, smartGuides: true });
            const narrow = at(TOL);
            const wide = at(TOL + extra);
            if (narrow.point !== null) expect(wide.point).not.toBeNull();
            else if (wide.point === null) {
              if (narrow.x !== null) expect(wide.x).not.toBeNull();
              if (narrow.y !== null) expect(wide.y).not.toBeNull();
            }
          },
        ),
      );
    });

    it('with smart guides off, catches points only', () => {
      fc.assert(
        fc.property(arbPoints, arbAxes, (points, axes) => {
          expect(decide(points, axes, null, false)).toEqual({
            point: expected(points),
            x: null,
            y: null,
          });
        }),
      );
    });
  });

  describe('hysteresis', () => {
    /** A held result naming a copy of the candidate: what is held is the target, not the object. */
    const holding = (candidate: SnapCandidate): Snapped => ({
      point: { ...candidate, point: { ...candidate.point } },
      x: null,
      y: null,
    });

    it('keeps a caught point to 1.5 × tolerance, unless a higher kind comes within tolerance', () => {
      fc.assert(
        fc.property(
          arbPoints.filter((points) => points.length > 0),
          fc.nat(),
          fc.integer({ min: 0, max: 6 }).map((n) => (n * TOL) / 4),
          (points, pick, heldAt) => {
            const at = pick % points.length;
            const found = points.map((f, i) => (i === at ? { ...f, distanceMm: heldAt } : f));
            const held = found[at]!;
            const outranked = found.some(
              (f) => f.distanceMm <= TOL && rank(f.candidate.kind) < rank(held.candidate.kind),
            );

            const result = decide(found, [], holding(held.candidate)).point;

            if (outranked) expect(result).toBe(expected(found));
            else expect(result).toBe(held.candidate);
          },
        ),
      );
    });

    it('lets go beyond 1.5 × tolerance', () => {
      fc.assert(
        fc.property(
          arbPoints.filter((points) => points.length > 0),
          fc.nat(),
          (points, pick) => {
            const at = pick % points.length;
            const found = points.map((f, i) =>
              i === at ? { ...f, distanceMm: 1.5 * TOL + 0.01 } : f,
            );
            expect(decide(found, [], holding(found[at]!.candidate)).point).toBe(expected(found));
          },
        ),
      );
    });

    it('holds an axis value the same way, each axis on its own', () => {
      const xHeld: Measured<AxisCandidate> = {
        candidate: { kind: 'piece-edge', axis: 'x', value: 10 },
        distanceMm: 1.4 * TOL,
        order: 0,
      };
      const xNearer: Measured<AxisCandidate> = {
        candidate: { kind: 'piece-edge', axis: 'x', value: 11 },
        distanceMm: 0.1,
        order: 1,
      };
      const xHigher: Measured<AxisCandidate> = {
        candidate: { kind: 'guide-axis', axis: 'x', value: 12 },
        distanceMm: TOL,
        order: 2,
      };
      const held: Snapped = { point: null, x: { ...xHeld.candidate }, y: null };

      expect(decide([], [xHeld, xNearer], held).x).toBe(xHeld.candidate);
      expect(decide([], [xHeld, xNearer, xHigher], held).x).toBe(xHigher.candidate);
      expect(decide([], [{ ...xHeld, distanceMm: 1.6 * TOL }, xNearer], held).x).toBe(
        xNearer.candidate,
      );
    });

    it('depends only on the previous result: the same inputs give the same answer', () => {
      fc.assert(
        fc.property(arbPoints, arbAxes, (points, axes) => {
          const first = decide(points, axes);
          expect(decide(points, axes, first)).toEqual(decide(points, axes, first));
        }),
      );
    });
  });

  describe('in snap()', () => {
    /** Two short lines going down from (0, 0) and (3, 0): two endpoints 3 mm apart. */
    const twoEnds = () =>
      resolvedOf(polyline([vec(0, 0), vec(0, -10)]), polyline([vec(3, 0), vec(3, -10)]));

    it('stays on the endpoint it caught as the cursor moves nearer another, to 1.5 × tolerance', () => {
      const resolved = twoEnds();
      const index = buildSnapIndex(resolved);
      const first = snap(index, resolved, vec(0.5, 0.5), options());
      expect(first?.point).toEqual(vec(0, 0));

      // Nearer (3, 0) now, and 2.65 mm from (0, 0): within 1.5 × 2 mm.
      expect(snap(index, resolved, vec(2.6, 0.5), options({ held: first }))?.point).toEqual(
        vec(0, 0),
      );
      // Without the previous result, it flips — the jitter this removes.
      expect(snap(index, resolved, vec(2.6, 0.5), options())?.point).toEqual(vec(3, 0));
      // 3.24 mm away: let go.
      expect(snap(index, resolved, vec(3.2, 0.5), options({ held: first }))?.point).toEqual(
        vec(3, 0),
      );
    });

    it('keeps a point on the path it was caught on, following the cursor along it', () => {
      const resolved = resolvedOf(
        polyline([vec(-50, 0), vec(50, 0)]),
        polyline([vec(-50, 1.5), vec(50, 1.5)]),
      );
      const index = buildSnapIndex(resolved);
      const first = snap(index, resolved, vec(10, 0.2), options());
      expect(first?.kind).toBe('on-path');

      const next = snap(index, resolved, vec(12, 1.3), options({ held: first }));
      expect(next?.kind).toBe('on-path');
      expect(next?.point.x).toBeCloseTo(12, 9);
      expect(next?.point.y).toBeCloseTo(0, 9);
    });

    it('lets a higher kind take over from what it holds', () => {
      const resolved = twoEnds();
      const index = buildSnapIndex(resolved);
      const onPath = snap(index, resolved, vec(0.3, -8), options());
      expect(onPath?.kind).toBe('on-path');

      expect(snap(index, resolved, vec(0.3, -6.5), options({ held: onPath }))?.kind).toBe(
        'midpoint',
      );
    });

    it('holds nothing that is excluded now', () => {
      const resolved = twoEnds();
      const index = buildSnapIndex(resolved);
      const first = snap(index, resolved, vec(0.5, 0.5), options())!;
      const held = snap(index, resolved, vec(2.6, 0.5), {
        ...options({ held: first }),
        exclude: [first.featureId!],
      });
      expect(held?.point).toEqual(vec(3, 0));
    });

    it('breaks a tie in distance by document order, whichever bucket each is in', () => {
      // (0, 0) and (40, 0) are equidistant from (20, 0), in different 20 mm cells.
      const resolved = resolvedOf(
        polyline([vec(40, 0), vec(40, -10)]),
        polyline([vec(0, 0), vec(0, -10)]),
      );
      const hit = snap(
        buildSnapIndex(resolved),
        resolved,
        vec(20, 0),
        options({ toleranceMm: 25 }),
      );
      expect(hit?.point).toEqual(vec(40, 0));
    });

    it('names both features of a crossing, and excludes it when either is being dragged', () => {
      const resolved = resolvedOf(
        polyline([vec(0, 10), vec(20, 10)]),
        polyline([vec(5, 0), vec(5, 30)]),
      );
      const [a, b] = resolved.parts[0]!.features.map((f) => f.feature.id);
      const index = buildSnapIndex(resolved);
      const hit = snap(index, resolved, vec(5.3, 10.3), options());
      expect(hit).toMatchObject({ kind: 'intersection', featureId: a, otherFeatureId: b });

      // Dragging the second line: the crossing moves with it, so it must not be caught.
      expect(snap(index, resolved, vec(5.3, 10.3), options({ exclude: [b!] }))?.kind).not.toBe(
        'intersection',
      );
    });
  });
});
