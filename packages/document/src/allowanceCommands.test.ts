import { evaluate, type FeatureId, type PartId, type Project } from '@leathercad/domain';
import { PathOps, polyline } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addAllowance,
  addAllowancePart,
  addStitchHoles,
  allowanceRefusal,
  deleteFeatures,
  emptyDocument,
  setDerivation,
  setShape,
  rectShape,
  translateFeatures,
} from './commands.js';
import type { Document } from './document.js';

const PART = 'part-1' as PartId;
const STITCH = 'stitch-1' as FeatureId;
const EDGE = 'edge-1' as FeatureId;

/** A pocket opening drawn as a stitch line, with its edge derived outward. */
function pocket(width = 95, height = 60, allowanceMm?: number): Document {
  return addAllowancePart(
    PART,
    STITCH,
    EDGE,
    { kind: 'shape', shape: rectShape({ x: 0, y: 0 }, width, height) },
    allowanceMm,
  ).apply(emptyDocument('proj'));
}

const entryOf = (project: Project, id: string) => {
  const found = evaluate(project)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id);
  if (found === undefined) throw new Error(`${id} is not there`);
  return found;
};

const boxOf = (project: Project, id: string) => {
  const entry = entryOf(project, id);
  if (!entry.ok) throw new Error(`${id}: ${entry.problem.code}`);
  return PathOps.bbox(entry.path)!;
};

const featureIn = (project: Project, id: string) =>
  project.parts.flatMap((p) => p.features).find((f) => f.id === id);

describe('Stitch + allowance makes a part from the opening out', () => {
  it('is one part: the stitch line drawn, the edge derived from it', () => {
    const { project } = pocket();

    expect(project.parts).toHaveLength(1);
    expect(project.parts[0]!.features.map((f) => f.kind)).toEqual(['stitch-line', 'cut-contour']);
    // The stitch line is the root — it is what the maker dimensioned.
    expect(featureIn(project, STITCH)?.source.kind).toBe('shape');
  });

  it('puts the edge outside the stitching by the allowance', () => {
    const { project } = pocket(95, 60, 4);

    expect(boxOf(project, STITCH)).toMatchObject({ minX: 0, maxX: 95 });
    expect(boxOf(project, EDGE).minX).toBeCloseTo(-4, 6);
    expect(boxOf(project, EDGE).maxX).toBeCloseTo(99, 6);
  });

  it('takes the allowance from project settings when none is given (X8)', () => {
    const { project } = pocket(95, 60);

    // DEFAULT_SETTINGS.defaultStitchInsetMm is 3.5: one number, both directions.
    expect(boxOf(project, EDGE).minX).toBeCloseTo(-3.5, 6);
  });

  it('is an outer contour, so the part is a piece of leather (S5, DR1)', () => {
    const edge = featureIn(pocket().project, EDGE)!;

    expect(edge.kind).toBe('cut-contour');
    expect(edge.kind === 'cut-contour' && edge.role).toBe('outer');
  });

  it('rounds the corners at the allowance’s radius, which is what a divider traces', () => {
    // Stated as a test because §3 says it is intended rather than incidental:
    // a rectangular opening gives a rounded-rectangle edge.
    const entry = entryOf(pocket(95, 60, 4).project, EDGE);
    if (!entry.ok) throw new Error('edge did not resolve');

    const arcs = entry.path.segments.filter((segment) => segment.kind === 'arc');
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      expect(arc.kind === 'arc' && arc.radius).toBeCloseTo(4, 6);
    }
  });

  it('reports nothing wrong', () => {
    const { project } = pocket();
    const codes = evaluate(project)
      .parts.flatMap((part) => part.features)
      .flatMap((entry) => (entry.ok ? [] : [entry.problem.code]));

    expect(codes).toEqual([]);
  });
});

describe('the edge is linked, not baked (§5a)', () => {
  it('follows the opening when the opening is resized', () => {
    const before = pocket(95, 60, 4);

    const next = setShape(STITCH, rectShape({ x: 0, y: 0 }, 120, 60)).apply(before);

    expect(boxOf(next.project, EDGE).maxX).toBeCloseTo(124, 6);
  });

  it('follows the opening when the opening moves', () => {
    const next = translateFeatures([STITCH], { x: 10, y: 5 }).apply(pocket(95, 60, 4));

    expect(boxOf(next.project, EDGE).minX).toBeCloseTo(6, 6);
    expect(boxOf(next.project, EDGE).minY).toBeCloseTo(1, 6);
  });

  it('follows the allowance when the allowance is retyped', () => {
    const before = pocket(95, 60, 4);

    const next = setDerivation(EDGE, {
      type: 'offset',
      distanceMm: 8,
      side: 'outward',
      run: { kind: 'whole' },
    }).apply(before);

    expect(boxOf(next.project, EDGE).minX).toBeCloseTo(-8, 6);
  });

  it('stores the relationship, never the resulting contour', () => {
    // CLAUDE.md invariant 4: derived geometry is never persisted.
    expect(featureIn(pocket().project, EDGE)?.source).toMatchObject({
      kind: 'derived',
      sourceId: STITCH,
      op: { type: 'offset', side: 'outward', run: { kind: 'whole' } },
    });
  });
});

describe('Add seam allowance, on a stitch line already drawn', () => {
  /** The same opening, but the maker drew the stitching first. */
  function drawnOpening(): Document {
    const document = emptyDocument('proj');
    return {
      project: {
        ...document.project,
        parts: [
          {
            id: PART,
            name: 'Pocket',
            quantity: 1,
            features: [
              {
                id: STITCH,
                kind: 'stitch-line',
                name: 'Stitch line',
                visible: true,
                locked: false,
                source: { kind: 'shape', shape: rectShape({ x: 0, y: 0 }, 95, 60) },
              },
            ],
          },
        ],
      },
    };
  }

  it('builds the identical derivation the drawing mode does (§5a)', () => {
    const viaAction = addAllowance(PART, EDGE, STITCH, 4).apply(drawnOpening());

    expect(featureIn(viaAction.project, EDGE)?.source).toEqual(
      featureIn(pocket(95, 60, 4).project, EDGE)?.source,
    );
    expect(boxOf(viaAction.project, EDGE).minX).toBeCloseTo(-4, 6);
  });

  it('takes the allowance from settings too', () => {
    const next = addAllowance(PART, EDGE, STITCH).apply(drawnOpening());

    expect(boxOf(next.project, EDGE).minX).toBeCloseTo(-3.5, 6);
  });

  it('refuses a second one, because a part has one edge (S5)', () => {
    const once = addAllowance(PART, EDGE, STITCH, 4).apply(drawnOpening());

    expect(addAllowance(PART, 'edge-2' as FeatureId, STITCH, 4).apply(once).project).toBe(
      once.project,
    );
    expect(allowanceRefusal(once.project, STITCH)).toMatchObject({
      code: 'PART_ALREADY_HAS_OUTER',
    });
  });

  it('refuses an open stitch line: an outline has to enclose the part', () => {
    const open: Document = {
      project: {
        ...drawnOpening().project,
        parts: [
          {
            ...drawnOpening().project.parts[0]!,
            features: [
              {
                id: STITCH,
                kind: 'stitch-line',
                name: 'Stitch line',
                visible: true,
                locked: false,
                source: {
                  kind: 'path',
                  path: polyline(
                    [
                      { x: 0, y: 0 },
                      { x: 95, y: 0 },
                    ],
                    false,
                  ),
                },
              },
            ],
          },
        ],
      },
    };

    expect(allowanceRefusal(open.project, STITCH)).not.toBeNull();
    expect(addAllowance(PART, EDGE, STITCH, 4).apply(open).project).toBe(open.project);
  });

  it('refuses anything that is not a stitch line', () => {
    const document = pocket();

    expect(allowanceRefusal(document.project, EDGE)).not.toBeNull();
  });

  it('says nothing about a closed stitch line with no edge yet', () => {
    expect(allowanceRefusal(drawnOpening().project, STITCH)).toBeNull();
  });
});

describe('what the allowance refuses to be', () => {
  it('reports rather than guesses when it cannot be built', () => {
    // An L-shaped opening with an allowance far larger than its own notch.
    // Tier 1 gives up; §4 says reporting that is the right answer.
    const ell: Document = {
      project: {
        ...emptyDocument('proj').project,
        parts: [
          {
            id: PART,
            name: 'Pocket',
            quantity: 1,
            features: [
              {
                id: STITCH,
                kind: 'stitch-line',
                name: 'Stitch line',
                visible: true,
                locked: false,
                source: {
                  kind: 'path',
                  path: polyline(
                    [
                      { x: 0, y: 0 },
                      { x: 100, y: 0 },
                      { x: 100, y: 40 },
                      { x: 40, y: 40 },
                      { x: 40, y: 80 },
                      { x: 0, y: 80 },
                    ],
                    true,
                  ),
                },
              },
            ],
          },
        ],
      },
    };

    const next = addAllowance(PART, EDGE, STITCH, 60).apply(ell);
    const entry = entryOf(next.project, EDGE);

    expect(entry.ok).toBe(false);
    expect(entry.ok === false && entry.problem.code).toBe('OFFSET_COLLAPSED');
  });

  it('holds the edge outside the opening, whatever the size and the allowance', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 1, max: 10, noNaN: true }),
        (width, height, allowanceMm) => {
          const { project } = pocket(width, height, allowanceMm);
          const opening = boxOf(project, STITCH);
          const edge = boxOf(project, EDGE);

          // The edge clears the opening by the allowance on every side.
          return (
            Math.abs(edge.minX - (opening.minX - allowanceMm)) < 1e-6 &&
            Math.abs(edge.maxX - (opening.maxX + allowanceMm)) < 1e-6 &&
            Math.abs(edge.minY - (opening.minY - allowanceMm)) < 1e-6 &&
            Math.abs(edge.maxY - (opening.maxY + allowanceMm)) < 1e-6
          );
        },
      ),
    );
  });

  it('does not care which way the opening was drawn round', () => {
    const wind = (points: { x: number; y: number }[]): Document => {
      const document = emptyDocument('proj');
      return addAllowance(PART, EDGE, STITCH, 4).apply({
        project: {
          ...document.project,
          parts: [
            {
              id: PART,
              name: 'Pocket',
              quantity: 1,
              features: [
                {
                  id: STITCH,
                  kind: 'stitch-line',
                  name: 'Stitch line',
                  visible: true,
                  locked: false,
                  source: { kind: 'path', path: polyline(points, true) },
                },
              ],
            },
          ],
        },
      });
    };

    const corners = [
      { x: 0, y: 0 },
      { x: 95, y: 0 },
      { x: 95, y: 60 },
      { x: 0, y: 60 },
    ];

    expect(boxOf(wind(corners).project, EDGE).minX).toBeCloseTo(-4, 6);
    expect(boxOf(wind([...corners].reverse()).project, EDGE).minX).toBeCloseTo(-4, 6);
  });
});

describe('deleting the opening is ADR 0009’s case', () => {
  it('refuses without a resolution, so the dialog gets its turn', () => {
    const before = pocket();

    expect(deleteFeatures([STITCH]).apply(before).project).toBe(before.project);
  });

  it('keeps the edge as drawn geometry when frozen', () => {
    const before = pocket(95, 60, 4);
    const was = boxOf(before.project, EDGE);

    const next = deleteFeatures([STITCH], 'freeze-dependents').apply(before);

    expect(featureIn(next.project, STITCH)).toBeUndefined();
    expect(featureIn(next.project, EDGE)?.source.kind).toBe('path');
    expect(boxOf(next.project, EDGE).minX).toBeCloseTo(was.minX, 6);
  });

  it('takes the edge with it when asked', () => {
    const next = deleteFeatures([STITCH], 'delete-dependents').apply(pocket());

    expect(featureIn(next.project, EDGE)).toBeUndefined();
    // The part stays, named and empty, until someone removes it (ADR 0009).
    expect(next.project.parts).toHaveLength(1);
  });

  it('carries holes on the opening through a freeze as well', () => {
    let document = pocket(95, 60, 4);
    document = addStitchHoles(PART, 'holes-1' as FeatureId, STITCH).apply(document);

    const next = deleteFeatures([STITCH], 'freeze-dependents').apply(document);

    // A hole set has no drawn form, so it goes; the edge stays.
    expect(featureIn(next.project, 'holes-1')).toBeUndefined();
    expect(featureIn(next.project, EDGE)).toBeDefined();
  });
});
