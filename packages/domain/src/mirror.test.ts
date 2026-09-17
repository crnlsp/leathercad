import {
  PathOps,
  SegmentOps,
  Shapes,
  decomposeGlide,
  glideMatrix,
  uniformRadii,
} from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate, type ResolvedFeature } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';
import { graphProblems } from './graph.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const panel = (width = 100, height = 60): Feature => ({
  ...base('cut-1', 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width,
      height,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
});

const stitchLine = (from = 'cut-1', id = 'stitch-1'): Feature => ({
  ...base(id, 'Stitch line'),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
  },
});

const holes = (from = 'stitch-1', id = 'holes-1'): Feature => ({
  ...base(id, 'Stitch holes'),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
  },
});

/** A counterpart of `from`, same kind, reflected across a vertical line at x. */
function mirrored(
  from: string,
  id: string,
  kind: Feature['kind'],
  atX = 100,
  glideMm = 0,
): Feature {
  const common = {
    ...base(id, 'Mirrored'),
    source: {
      kind: 'derived' as const,
      sourceId: from,
      op: {
        type: 'mirror' as const,
        axis: { kind: 'line' as const, origin: { x: atX, y: 0 }, angleRad: Math.PI / 2 },
        glideMm,
      },
    },
  };
  return kind === 'cut-contour'
    ? ({ ...common, kind, role: 'outer' } as Feature)
    : ({ ...common, kind } as Feature);
}

function project(...features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

const entryOf = (p: Project, id: string): ResolvedFeature =>
  evaluate(p)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id)!;

const okEntry = (p: Project, id: string) => {
  const entry = entryOf(p, id);
  if (!entry.ok) throw new Error(`${id} did not resolve: ${entry.problem.code}`);
  return entry;
};

describe('a mirrored feature', () => {
  it('is the original reflected, point for point', () => {
    // The axis is the vertical line x = 100, so the panel at 0..100 comes back
    // at 100..200, the same size and the same way up.
    const p = project(panel(), mirrored('cut-1', 'm-1', 'cut-contour', 100));
    const box = PathOps.bbox(okEntry(p, 'm-1').path)!;

    expect(box.minX).toBeCloseTo(100, 9);
    expect(box.maxX).toBeCloseTo(200, 9);
    expect(box.minY).toBeCloseTo(0, 9);
    expect(box.maxY).toBeCloseTo(60, 9);
  });

  it('slides along the axis by its glide', () => {
    const p = project(panel(), mirrored('cut-1', 'm-1', 'cut-contour', 100, 25));
    const box = PathOps.bbox(okEntry(p, 'm-1').path)!;

    // The axis is vertical, so the glide moves it in y and leaves x alone.
    expect(box.minX).toBeCloseTo(100, 9);
    expect(box.minY).toBeCloseTo(25, 9);
  });

  it('keeps the kind and a cut contour’s role', () => {
    const p = project(panel(), mirrored('cut-1', 'm-1', 'cut-contour'));
    const entry = okEntry(p, 'm-1');

    expect(entry.feature.kind).toBe('cut-contour');
    expect(entry.role).toBe('cut');
  });

  it('follows the original when the original changes', () => {
    const wide = project(panel(100), mirrored('cut-1', 'm-1', 'cut-contour', 100));
    const wider = project(panel(140), mirrored('cut-1', 'm-1', 'cut-contour', 100));

    expect(PathOps.bbox(okEntry(wide, 'm-1').path)!.maxX).toBeCloseTo(200, 9);
    // The original grew to the right, so its reflection grows to the left.
    expect(PathOps.bbox(okEntry(wider, 'm-1').path)!.minX).toBeCloseTo(60, 9);
  });

  it('reverses winding, which is what a reflection does', () => {
    const p = project(panel(), mirrored('cut-1', 'm-1', 'cut-contour'));

    const original = PathOps.signedArea(okEntry(p, 'cut-1').path);
    const image = PathOps.signedArea(okEntry(p, 'm-1').path);

    expect(Math.sign(image)).toBe(-Math.sign(original));
    expect(Math.abs(image)).toBeCloseTo(Math.abs(original), 6);
  });

  it('still takes a stitch line inside it, despite the reversed winding', () => {
    // The trap this guards: `applyDerivation` decides "inward" from the actual
    // signed area, so a mirrored outline is handled correctly. It would break
    // the day someone normalised the winding away.
    const p = project(
      panel(),
      mirrored('cut-1', 'm-1', 'cut-contour'),
      stitchLine('m-1', 'stitch-m'),
    );

    const outline = PathOps.bbox(okEntry(p, 'm-1').path)!;
    const stitch = PathOps.bbox(okEntry(p, 'stitch-m').path)!;

    expect(stitch.minX).toBeGreaterThan(outline.minX);
    expect(stitch.maxX).toBeLessThan(outline.maxX);
  });
});

describe('a mirrored hole set', () => {
  it('has exactly as many holes as its original', () => {
    // The property the whole design choice exists for: two pieces that are
    // sewn together must have the same hole count, and reflecting the holes
    // cannot produce a different one.
    const p = project(
      panel(),
      stitchLine(),
      holes(),
      mirrored('holes-1', 'holes-m', 'stitch-hole-set'),
    );

    const source = okEntry(p, 'holes-1');
    const image = okEntry(p, 'holes-m');

    expect(image.holes?.count).toBe(source.holes?.count);
    expect(image.holes!.count).toBeGreaterThan(20);
  });

  it('puts every hole where the reflection puts it', () => {
    const p = project(
      panel(),
      stitchLine(),
      holes(),
      mirrored('holes-1', 'holes-m', 'stitch-hole-set', 100),
    );

    const source = okEntry(p, 'holes-1').holes!.holes;
    const image = okEntry(p, 'holes-m').holes!.holes;

    for (const [i, hole] of source.entries()) {
      expect(image[i]!.point.x).toBeCloseTo(200 - hole.point.x, 6);
      expect(image[i]!.point.y).toBeCloseTo(hole.point.y, 6);
    }
  });

  it('keeps the count equal whatever the panel and the iron', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 40, max: 300, noNaN: true }),
        fc.double({ min: 2, max: 6, noNaN: true }),
        (width, pitchMm) => {
          const p = project(
            panel(width),
            stitchLine(),
            {
              ...holes(),
              source: {
                kind: 'derived',
                sourceId: 'stitch-1',
                op: { type: 'stitch-holes', pitchMm, mode: 'fit-whole', corners: 'continuous' },
              },
            } as Feature,
            mirrored('holes-1', 'holes-m', 'stitch-hole-set'),
          );

          const source = entryOf(p, 'holes-1');
          const image = entryOf(p, 'holes-m');
          if (!source.ok || !image.ok) return true;
          return image.holes?.count === source.holes?.count;
        },
      ),
    );
  });
});

describe('anchors through a mirror', () => {
  it('gives every anchor an image, at the reflection of its point', () => {
    const p = project(panel(), mirrored('cut-1', 'm-1', 'cut-contour', 100));

    const source = okEntry(p, 'cut-1');
    const image = okEntry(p, 'm-1');

    expect(image.anchors).toHaveLength(source.anchors.length);
    expect(source.anchors.length).toBeGreaterThan(0);

    const pointAt = (path: typeof source.path, at: number) => {
      const found = PathOps.measure(path).locate(at);
      return SegmentOps.pointAt(path.segments[found.segmentIndex]!, found.t);
    };

    for (const [i, anchor] of source.anchors.entries()) {
      const imageAnchor = image.anchors[i];
      // Nothing goes missing under a reflection: it loses nothing.
      expect(imageAnchor).not.toBeNull();

      const was = pointAt(source.path, anchor!);
      const now = pointAt(image.path, imageAnchor!);
      expect(now.x).toBeCloseTo(200 - was.x, 6);
      expect(now.y).toBeCloseTo(was.y, 6);
    }
  });
});

describe('the compatibility table’s mirror row (S4)', () => {
  const refusalIn = (p: Project) =>
    graphProblems(p).find((problem) => problem.code === 'DERIVATION_INCOMPATIBLE');

  it('allows the same kind', () => {
    expect(refusalIn(project(panel(), mirrored('cut-1', 'm-1', 'cut-contour')))).toBeUndefined();
  });

  it('refuses a different kind', () => {
    // A mirror preserves what a thing is. A stitch line mirrored from an
    // outline is not a mirror, it is a different feature wearing the name.
    expect(refusalIn(project(panel(), mirrored('cut-1', 'm-1', 'stitch-line')))).toMatchObject({
      facts: { rule: 'mirror-keeps-kind' },
    });
  });

  it('refuses a cut contour that changes role', () => {
    const inner: Feature = {
      ...base('m-1', 'Mirrored'),
      kind: 'cut-contour',
      role: 'inner',
      source: {
        kind: 'derived',
        sourceId: 'cut-1',
        op: {
          type: 'mirror',
          axis: { kind: 'line', origin: { x: 100, y: 0 }, angleRad: Math.PI / 2 },
          glideMm: 0,
        },
      },
    };

    expect(refusalIn(project(panel(), inner))).toMatchObject({
      facts: { rule: 'mirror-keeps-role' },
    });
  });

  it('lets a mirror follow a mirror, which is how a pair is mirrored back', () => {
    expect(
      refusalIn(
        project(
          panel(),
          mirrored('cut-1', 'm-1', 'cut-contour'),
          mirrored('m-1', 'm-2', 'cut-contour', 250),
        ),
      ),
    ).toBeUndefined();
  });
});

describe('the axis round-trips through evaluation', () => {
  it('a mirror built from a decomposed transform lands where the transform does', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -200, max: 200, noNaN: true }),
        fc.double({ min: -200, max: 200, noNaN: true }),
        fc.double({ min: 0, max: Math.PI, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        (x, y, angleRad, glideMm) => {
          const m = glideMatrix({ x, y }, angleRad, glideMm);
          const parts = decomposeGlide(m);
          if (parts === null) return false;

          const p = project(panel(), {
            ...base('m-1', 'Mirrored'),
            kind: 'cut-contour',
            role: 'outer',
            source: {
              kind: 'derived',
              sourceId: 'cut-1',
              op: {
                type: 'mirror',
                axis: { kind: 'line', origin: parts.origin, angleRad: parts.angleRad },
                glideMm: parts.glideMm,
              },
            },
          } as Feature);

          const image = entryOf(p, 'm-1');
          const source = entryOf(p, 'cut-1');
          if (!image.ok || !source.ok) return false;

          // Every point of the image is the transform of the source's.
          const expected = PathOps.transform(source.path, m);
          const a = PathOps.bbox(image.path)!;
          const b = PathOps.bbox(expected)!;
          return (
            Math.abs(a.minX - b.minX) < 1e-6 &&
            Math.abs(a.maxX - b.maxX) < 1e-6 &&
            Math.abs(a.minY - b.minY) < 1e-6 &&
            Math.abs(a.maxY - b.maxY) < 1e-6
          );
        },
      ),
    );
  });

  it('mirroring twice about the same axis is the original, in place', () => {
    const p = project(
      panel(),
      mirrored('cut-1', 'm-1', 'cut-contour', 100),
      mirrored('m-1', 'm-2', 'cut-contour', 100),
    );

    const original = PathOps.bbox(okEntry(p, 'cut-1').path)!;
    const twice = PathOps.bbox(okEntry(p, 'm-2').path)!;

    expect(twice.minX).toBeCloseTo(original.minX, 6);
    expect(twice.maxX).toBeCloseTo(original.maxX, 6);
    expect(Shapes).toBeDefined();
  });
});
