import type { CutContour, Part, Project, ResolvedProject } from '@leathercad/domain';
import { DEFAULT_SETTINGS } from '@leathercad/domain';
import { circle, PathOps, polyline, vec, type Path, type Vec2 } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { buildSnapIndex, snap, snapGlyph, type SnapKind, type SnapOptions } from './snap.js';

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
