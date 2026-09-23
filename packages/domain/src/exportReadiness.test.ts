import { PathOps, uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { exportReadiness } from './exportReadiness.js';
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

/** Inset deeper than the panel can carry: the offset collapses (an error). */
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

/** A rivet off the material: a warning, and it still prints. */
const strayHole = (): Feature => ({
  ...base('hw-1', 'Rivet'),
  kind: 'hardware-hole',
  hardwareType: 'rivet',
  source: { kind: 'shape', shape: { type: 'circle', centre: { x: 400, y: 300 }, radius: 2 } },
});

/** A marking line that leaves the panel: a warning on a line, not a hole. */
const overshoot = (): Feature => ({
  ...base('mark-1', 'Glue line'),
  kind: 'marking-line',
  purpose: 'glue-area',
  source: {
    kind: 'path',
    path: PathOps.polyline(
      [
        { x: 10, y: 10 },
        { x: 200, y: 10 },
      ],
      false,
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

describe('exportReadiness', () => {
  it('has nothing to say about a pattern with nothing wrong', () => {
    expect(exportReadiness(project([panel()]))).toEqual({
      errors: 0,
      warnings: 0,
      infos: 0,
      omitted: [],
    });
  });

  it('counts problems by severity, and does not rank them', () => {
    // Export never decides that one of these is serious enough to stop for.
    // It counts what the one diagnostic list says and prints anyway.
    // Both features are off the material, and the severities differ because
    // the states differ: a rivet punched through nothing is an error, a glue
    // line that overshoots the edge is a warning (4.3a). Export takes both as
    // the domain graded them.
    const readiness = exportReadiness(project([panel(), strayHole(), overshoot()]));

    expect(readiness).toMatchObject({ errors: 1, warnings: 1, infos: 0 });
  });

  it('names the features that will not be on the paper', () => {
    // The serious half, and not a count of problems: a feature that failed is
    // absent from the printed template, and a maker cutting from that template
    // has no way to know it was ever there.
    const readiness = exportReadiness(project([panel(), collapsedStitch(), holeSet()]));

    expect(readiness.omitted).toEqual([
      { featureId: 'stitch-1', featureName: 'Stitch line', partName: 'Part 0' },
      { featureId: 'holes-1', featureName: 'Stitch holes', partName: 'Part 0' },
    ]);
  });

  it('counts the problems and the omissions separately', () => {
    // Two facts about one project, and conflating them is how "2 problems"
    // comes to mean "2 things missing" — which it does not.
    const readiness = exportReadiness(
      project([panel(), collapsedStitch(), holeSet(), overshoot()]),
    );

    // Three problems — the collapse, the holes that followed it down, the
    // overshooting line — but only two features missing from the paper.
    expect(readiness).toMatchObject({ errors: 2, warnings: 1, infos: 0 });
    expect(readiness.omitted.map((o) => o.featureId)).toEqual(['stitch-1', 'holes-1']);
  });

  it('says which part a missing feature belonged to', () => {
    const readiness = exportReadiness(project([panel()], [panel(), collapsedStitch()]));

    expect(readiness.omitted).toEqual([
      { featureId: 'stitch-1', featureName: 'Stitch line', partName: 'Part 1' },
    ]);
  });

  it('does not report a feature the maker hid on purpose', () => {
    // Hidden features are left off the paper too, but that is a choice the
    // maker made and can see in the parts panel. Warning about it would teach
    // people to dismiss the warning that matters.
    const hidden = { ...panel(), visible: false };

    expect(exportReadiness(project([hidden])).omitted).toEqual([]);
  });
});
