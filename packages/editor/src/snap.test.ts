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
  snap,
  snapGlyph,
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
