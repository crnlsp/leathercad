import { polyline, uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';

/**
 * A diagnostic is never left over from geometry that has since changed.
 *
 * Almost all of this is already true by construction — `diagnose` evaluates the
 * project it is given and memoises on the **project object**, so every command,
 * which produces a new one, is a cache miss, and there is no stored diagnostic
 * anywhere to go stale. What was missing is the proof, and in particular the
 * proof for the two features whose validity depends on geometry they are **not
 * built from**: a measurement, and a counterpart folded about a fold line. Both
 * reach their second input through the `references` edge, and both would look
 * exactly like this if that edge were being ignored by the cache — right the
 * first time, and never updated again.
 */

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const panel = (width = 105, height = 75): Feature => ({
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

const stitchLine = (insetMm: number): Feature => ({
  ...base('stitch-1', 'Stitch line'),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: 'cut-1',
    op: { type: 'offset', distanceMm: insetMm, side: 'inward', run: { kind: 'whole' } },
  },
});

const holeSet = (): Feature => ({
  ...base('holes-1', 'Stitch holes'),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: 'stitch-1',
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
  },
});

/** A rivet, placed where the caller says. */
const rivet = (x: number, y: number): Feature => ({
  ...base('hw-1', 'Rivet'),
  kind: 'hardware-hole',
  hardwareType: 'rivet',
  source: { kind: 'shape', shape: { type: 'circle', centre: { x, y }, radius: 2 } },
});

/**
 * A vertical fold at x, stopping just short of the panel's edges.
 *
 * Short on purpose: a fold that runs edge to edge has its endpoints *on* the
 * outline, which DR2's sampling reports as leaving the material. That is a
 * known gap in the containment rule and a follow-up of its own; pinning it here
 * by accident would make this test fail for a reason that has nothing to do
 * with staleness.
 */
const fold = (x: number): Feature => ({
  ...base('fold-1', 'Fold'),
  kind: 'fold-line',
  direction: 'valley',
  source: {
    kind: 'path',
    path: polyline(
      [
        { x, y: 2 },
        { x, y: 73 },
      ],
      false,
    ),
  },
});

/** A slot inside the panel, at x. */
const slot = (x: number): Feature => ({
  ...base('slot-1', 'Card slot'),
  kind: 'cut-contour',
  role: 'inner',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x, y: 20 },
      width: 20,
      height: 6,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
});

/** The slot's counterpart, folded about the fold line. */
const counterpart = (): Feature => ({
  ...base('slot-2', 'Card slot mirrored'),
  kind: 'cut-contour',
  role: 'inner',
  source: {
    kind: 'derived',
    sourceId: 'slot-1',
    op: { type: 'mirror', axis: { kind: 'fold', foldId: 'fold-1' }, glideMm: 0 },
  },
});

const dimension = (a: number, b: number): Feature => ({
  ...base('dim-1', 'Opening'),
  kind: 'measurement',
  source: {
    kind: 'measurement',
    measure: 'aligned',
    a: { kind: 'anchor', featureId: 'cut-1', anchor: a },
    b: { kind: 'anchor', featureId: 'cut-1', anchor: b },
    offsetMm: 8,
    precision: 1,
  },
});

function project(...features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

const codes = (p: Project): string[] => diagnose(p).map((d) => d.problem.code);

describe('a diagnostic goes when its cause does', () => {
  it('stops reporting an inset that now fits', () => {
    expect(codes(project(panel(), stitchLine(60), holeSet()))).toEqual([
      'OFFSET_COLLAPSED',
      'SOURCE_FAILED',
    ]);

    expect(codes(project(panel(), stitchLine(3.5), holeSet()))).toEqual([]);
  });

  it('stops reporting a rivet once it is back on the leather', () => {
    expect(codes(project(panel(), rivet(400, 300)))).toEqual(['OUTSIDE_PART']);
    expect(codes(project(panel(), rivet(50, 40)))).toEqual([]);
  });

  it('reports a rivet that the outline shrank away from under it', () => {
    // Nothing about the rivet changed. The panel did, and the diagnostic is
    // about the pair — which is the case a cached answer keyed on the rivet
    // alone would get wrong.
    expect(codes(project(panel(105, 75), rivet(90, 40)))).toEqual([]);
    expect(codes(project(panel(60, 75), rivet(90, 40)))).toEqual(['OUTSIDE_PART']);
  });
});

describe('a feature judged against geometry it is not built from', () => {
  it('re-judges a counterpart when the fold it is folded about moves', () => {
    // The counterpart follows `slot-1` and is *placed* by `fold-1` — the
    // references edge. Moving the fold moves the counterpart, and far enough
    // takes it off the leather, which only the fold's geometry can decide.
    const inside = project(panel(), fold(60), slot(20), counterpart());
    expect(codes(inside)).toEqual([]);

    const pushedOff = project(panel(), fold(95), slot(20), counterpart());
    expect(codes(pushedOff)).toEqual(['CUT_OUT_OUTSIDE_PART']);
  });

  it('re-judges the counterpart when the source slot moves instead', () => {
    const inside = project(panel(), fold(60), slot(20), counterpart());
    expect(codes(inside)).toEqual([]);

    // The same counterpart, moved by its source rather than by its fold. Both
    // ends of the pair leave the leather — the slot to the left of it, the
    // counterpart to the right — and both are reported.
    const pulledOff = project(panel(), fold(60), slot(-30), counterpart());
    expect(codes(pulledOff)).toEqual(['CUT_OUT_OUTSIDE_PART', 'CUT_OUT_OUTSIDE_PART']);
  });

  it('fails a measurement when the anchor it names stops existing', () => {
    // A rectangle has four corners. Asking for a fifth is E4: it fails, and it
    // never quietly measures to the nearest corner instead.
    expect(codes(project(panel(), dimension(0, 1)))).toEqual([]);
    expect(codes(project(panel(), dimension(0, 9)))).toEqual(['ANCHOR_MISSING']);
  });

  it('carries a failed reference down to what follows it', () => {
    const broken = project(panel(), stitchLine(60), holeSet(), dimension(0, 1));

    // The dimension still measures the outline, which is fine. The holes do
    // not, and say so once, at the root (E3).
    expect(codes(broken)).toEqual(['OFFSET_COLLAPSED', 'SOURCE_FAILED']);
  });
});
