import { PathOps, RectOps, uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { diagnose } from './diagnose.js';
import { diagnosticTarget, MIN_FRAME_MM } from './diagnosticTarget.js';
import { evaluate } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Project } from './feature.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const panel = (): Feature => ({
  ...base('cut-1', 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width: 105,
      height: 75,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
});

/** An inset far deeper than the panel can carry: the offset collapses. */
const collapsedStitch = (): Feature => ({
  ...base('stitch-1', 'Stitch line'),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: 'cut-1',
    op: { type: 'offset', distanceMm: 60, side: 'inward', run: { kind: 'whole' } },
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

/** A rivet punched well outside the panel, in a corner of its own. */
const strayHole = (): Feature => ({
  ...base('hw-1', 'Rivet'),
  kind: 'hardware-hole',
  hardwareType: 'rivet',
  source: { kind: 'shape', shape: { type: 'circle', centre: { x: 400, y: 300 }, radius: 2 } },
});

const crossed = (): Feature => ({
  ...base('cut-2', 'Crossed'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'path',
    path: PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 50, y: 0 },
        { x: 0, y: 50 },
      ],
      true,
    ),
  },
});

function project(...parts: Feature[][]): Project {
  return {
    id: 'proj',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: parts.map((features, i) => ({
      id: `part-${i}`,
      name: `Part ${i}`,
      quantity: 1,
      features,
    })),
  };
}

/** The target of the first diagnostic with this code. */
function targetOf(p: Project, code: string) {
  const resolved = evaluate(p);
  const diagnostic = diagnose(p).find((d) => d.problem.code === code);
  expect(diagnostic, `no ${code} in this project`).toBeDefined();
  return diagnosticTarget(resolved, diagnostic!);
}

describe('what a diagnostic frames', () => {
  it('frames the crossings, not the whole outline', () => {
    // CONTOUR_SELF_INTERSECTS carries points, and the point of zooming is to
    // see where it crosses — which on a large outline is a small part of it.
    const { bounds } = targetOf(project([crossed()]), 'CONTOUR_SELF_INTERSECTS');

    expect(bounds).not.toBeNull();
    expect(RectOps.centre(bounds!)).toMatchObject({ x: 25, y: 25 });
    expect(RectOps.width(bounds!)).toBeLessThan(50);
  });

  it('frames a single offending hole at a legible size, not a point', () => {
    // A zero-area rectangle has no scale that frames it: the viewport would
    // keep whatever zoom it had, which looks like the click did nothing.
    const { bounds } = targetOf(project([panel(), strayHole()]), 'OUTSIDE_PART');

    expect(RectOps.centre(bounds!)).toMatchObject({ x: 400, y: 300 });
    expect(RectOps.width(bounds!)).toBeGreaterThanOrEqual(MIN_FRAME_MM);
    expect(RectOps.height(bounds!)).toBeGreaterThanOrEqual(MIN_FRAME_MM);
  });

  it('frames what a failed feature was built from, because that is where the fix is', () => {
    // The stitch line has no geometry — it collapsed. Its diagnostic points at
    // the outline it was inset from, which is the thing to edit.
    const { bounds } = targetOf(project([panel(), collapsedStitch()]), 'OFFSET_COLLAPSED');

    // The panel's own 105 x 75, with the margin every frame leaves.
    expect(bounds).toMatchObject({ minX: -5, minY: -5, maxX: 110, maxY: 80 });
  });

  it('falls back to the feature when the problem carries no geometry', () => {
    // SOURCE_FAILED has no location: the holes failed because the line did.
    const { bounds } = targetOf(project([panel(), collapsedStitch(), holeSet()]), 'SOURCE_FAILED');

    // Nothing resolved for the holes either, so the frame widens to the part
    // rather than giving up — the maker still gets taken somewhere true.
    expect(bounds).toMatchObject({ minX: -5, minY: -5, maxX: 110, maxY: 80 });
  });

  it('frames the part when the problem is about the part', () => {
    const { bounds } = targetOf(project([panel()], []), 'EMPTY_PART');

    // An empty part has no geometry at all. There is nothing true to frame, and
    // inventing a rectangle at the origin would move the view somewhere
    // arbitrary.
    expect(bounds).toBeNull();
  });

  it('frames the part that has no outline from what it does contain', () => {
    const { bounds } = targetOf(project([strayHole()]), 'PART_HAS_NO_OUTER_CONTOUR');

    expect(RectOps.centre(bounds!)).toMatchObject({ x: 400, y: 300 });
  });
});

describe('what a diagnostic selects', () => {
  it('selects the feature the problem is about, not the geometry being framed', () => {
    // The frame shows the outline; the subject is the stitch line that failed.
    // Clicking the row twice must select the same thing both times, so the
    // subject is read from the diagnostic and never from what is on screen.
    const { subject } = targetOf(project([panel(), collapsedStitch()]), 'OFFSET_COLLAPSED');

    expect(subject).toEqual({ kind: 'feature', featureId: 'stitch-1' });
  });

  it('selects the derived feature, not its source', () => {
    const { subject } = targetOf(project([panel(), collapsedStitch(), holeSet()]), 'SOURCE_FAILED');

    expect(subject).toEqual({ kind: 'feature', featureId: 'holes-1' });
  });

  it('selects the part for a problem with the part itself', () => {
    const { subject } = targetOf(project([panel()], []), 'EMPTY_PART');

    expect(subject).toEqual({ kind: 'part', partId: 'part-1' });
  });
});
