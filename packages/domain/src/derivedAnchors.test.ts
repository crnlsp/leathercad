import { PathOps, SegmentOps, offsetPathTraced, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { mapAnchorsThroughOffset } from './derivedAnchors.js';
import { evaluate, evaluationErrors, type ResolvedFeature } from './evaluate.js';
import {
  DEFAULT_SETTINGS,
  type CutContour,
  type Feature,
  type Part,
  type Project,
  type Run,
} from './feature.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

function panel(width = 100, height = 60, radius = 10): CutContour {
  return {
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
        radii: uniformRadii(radius),
        rotation: 0,
      },
    },
  };
}

const inset = (
  id: string,
  from: string,
  distanceMm = 3.5,
  run: Run = { kind: 'whole' },
): Feature => ({
  ...base(id, `Stitch ${id}`),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'offset', distanceMm, side: 'inward', run },
  },
});

const holes = (id: string, from: string): Feature => ({
  ...base(id, `Holes ${id}`),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' },
  },
});

/** A drawn, closed stitch line, and the outline a seam allowance derives from it. */
const drawnSeam = (id: string): Feature => ({
  ...base(id, `Seam ${id}`),
  kind: 'stitch-line',
  source: {
    kind: 'path',
    path: PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 50 },
        { x: 0, y: 50 },
      ],
      true,
    ),
  },
});

const allowance = (id: string, from: string, distanceMm = 4): Feature => ({
  ...base(id, `Outline ${id}`),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'offset', distanceMm, side: 'outward', run: { kind: 'whole' } },
  },
});

function project(...features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

const resolvedOf = (p: Project, id: string): ResolvedFeature =>
  evaluate(p)
    .parts.flatMap((part) => part.features)
    .find((entry) => entry.feature.id === id)!;

const anchorsOfFeature = (p: Project, id: string): readonly (number | null)[] => {
  const entry = resolvedOf(p, id);
  if (!entry.ok) throw new Error(`${id} did not resolve`);
  return entry.anchors;
};

/** The point at a distance along a resolved feature's own path. */
const pointOn = (p: Project, id: string, distanceMm: number) => {
  const entry = resolvedOf(p, id);
  if (!entry.ok) throw new Error(`${id} did not resolve`);
  const at = PathOps.measure(entry.path).locate(distanceMm);
  return SegmentOps.pointAt(entry.path.segments[at.segmentIndex]!, at.t);
};

describe('anchors through a derivation', () => {
  it('gives an inset stitch line the four corners of the outline it follows', () => {
    // Before 4.4b a derived feature reported no anchors at all, so nothing
    // downstream could name a corner of one.
    const p = project(panel(), inset('stitch-1', 'cut-1'));

    expect(anchorsOfFeature(p, 'stitch-1')).toHaveLength(4);
    expect(anchorsOfFeature(p, 'stitch-1').every((a) => a !== null)).toBe(true);
  });

  it('puts each of them on the corner that produced it, one inset away', () => {
    const p = project(panel(100, 60, 10), inset('stitch-1', 'cut-1', 3.5));
    const outlineAnchors = anchorsOfFeature(p, 'cut-1');
    const stitchAnchors = anchorsOfFeature(p, 'stitch-1');

    for (const [index, anchor] of outlineAnchors.entries()) {
      const onOutline = pointOn(p, 'cut-1', anchor!);
      const onStitch = pointOn(p, 'stitch-1', stitchAnchors[index]!);

      // The corner arc is concentric, so its midpoint moves exactly the inset
      // distance — and crucially it is *the same corner*, by index.
      expect(Math.hypot(onStitch.x - onOutline.x, onStitch.y - onOutline.y)).toBeCloseTo(3.5, 6);
    }
  });

  it('keeps a corner the inset swallowed, as the sharp corner it became', () => {
    // A 3 mm radius inset by 3.5 mm: the arc is gone, the corner is not.
    const p = project(panel(100, 60, 3), inset('stitch-1', 'cut-1', 3.5));

    expect(anchorsOfFeature(p, 'stitch-1')).toHaveLength(4);
    expect(anchorsOfFeature(p, 'stitch-1').every((a) => a !== null)).toBe(true);
  });

  it('lets a hole set expose the anchors of the line its holes sit on', () => {
    const p = project(panel(), inset('stitch-1', 'cut-1'), holes('holes-1', 'stitch-1'));

    expect(anchorsOfFeature(p, 'holes-1')).toEqual(anchorsOfFeature(p, 'stitch-1'));
  });

  it('carries them through two derivations, which is what seam allowance needs', () => {
    // A drawn seam, its allowance outline, and a stitch line inset back from
    // that outline: the anchors survive the whole chain, under one numbering.
    const p = project(
      drawnSeam('seam-1'),
      allowance('cut-1', 'seam-1'),
      inset('stitch-2', 'cut-1'),
    );

    expect(anchorsOfFeature(p, 'seam-1')).toHaveLength(4);
    expect(anchorsOfFeature(p, 'cut-1')).toHaveLength(4);
    expect(anchorsOfFeature(p, 'stitch-2')).toHaveLength(4);
  });

  it('lets a run name the corners of derived geometry', () => {
    // The capability this slice exists for: before it, a run on anything
    // derived failed with ANCHOR_MISSING because there were no anchors to name.
    const p = project(
      drawnSeam('seam-1'),
      allowance('cut-1', 'seam-1'),
      inset('stitch-2', 'cut-1', 3.5, { kind: 'between', fromAnchor: 0, toAnchor: 2 }),
    );

    expect(evaluationErrors(evaluate(p))).toEqual([]);
    const whole = project(
      drawnSeam('seam-1'),
      allowance('cut-1', 'seam-1'),
      inset('stitch-2', 'cut-1'),
    );
    // Two sides of four, so shorter than the whole way round.
    expect(PathOps.length((resolvedOf(p, 'stitch-2') as { path: PathOps.Path }).path)).toBeLessThan(
      PathOps.length((resolvedOf(whole, 'stitch-2') as { path: PathOps.Path }).path),
    );
  });

  it('reports an anchor outside a partial run as missing, not as a neighbour', () => {
    // E4. The run covers corners 0 to 2; corner 3 is not on it, so it has no
    // image — and it keeps its index rather than the list closing up, which is
    // how a run silently moves to a different edge.
    const p = project(
      panel(),
      inset('stitch-1', 'cut-1', 3.5, { kind: 'between', fromAnchor: 0, toAnchor: 2 }),
    );
    const anchors = anchorsOfFeature(p, 'stitch-1');

    expect(anchors).toHaveLength(4);
    expect(anchors[0]).not.toBeNull();
    expect(anchors[1]).not.toBeNull();
    expect(anchors[2]).not.toBeNull();
    // The run ends on corner 2, so that is where its anchor lands.
    expect(anchors[2]).toBeCloseTo(
      PathOps.length((resolvedOf(p, 'stitch-1') as { path: PathOps.Path }).path),
      6,
    );
    expect(anchors[3]).toBeNull();
  });

  it('a label has no corners to name', () => {
    const label: Feature = {
      ...base('label-1', 'Label'),
      kind: 'text-label',
      source: { kind: 'text', text: 'Glue here', at: { x: 0, y: 0 }, sizeMm: 3, rotationRad: 0 },
    };

    expect(anchorsOfFeature(project(label), 'label-1')).toEqual([]);
  });

  it('keeps the count and the order whatever the dimensions are', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 40, max: 300, noNaN: true }),
        fc.double({ min: 40, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 15, noNaN: true }),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        (width, height, radius, distance) => {
          const p = project(panel(width, height, radius), inset('stitch-1', 'cut-1', distance));
          const entry = resolvedOf(p, 'stitch-1');
          if (!entry.ok) return true;

          const anchors = entry.anchors;
          const present = anchors.filter((a): a is number => a !== null);
          return (
            anchors.length === 4 &&
            present.length === 4 &&
            present.every((a, i) => i === 0 || a >= present[i - 1]!)
          );
        },
      ),
    );
  });
});

describe('an anchor with no image', () => {
  it('stays missing rather than acquiring a number', () => {
    // Directly, because nothing in the compatibility table can currently feed
    // an offset a source whose anchors have holes — an inward offset needs a
    // cut contour, and an outward one needs a closed whole run. When 4.8's
    // mirror or 4.10's measurements can, this is the behaviour they get.
    const square = PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ],
      true,
    );
    const [piece] = offsetPathTraced(square, 5, { join: 'round' });

    const mapped = mapAnchorsThroughOffset([null, 100, null], square, piece!);

    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toBeNull();
    expect(mapped[2]).toBeNull();
    // Not NaN, not the nearest corner, not dropped: null, in its own place.
    expect(mapped.filter((image) => image !== null && Number.isNaN(image))).toEqual([]);
    expect(mapped[1]).not.toBeNull();
  });
});
