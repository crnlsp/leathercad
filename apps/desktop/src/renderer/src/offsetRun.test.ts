import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addPart,
  addSeam,
  addStitchHoles,
  addStitchLine,
  deleteFeatures,
  rectanglePart,
  rectShape,
  setDerivation,
  type Document,
} from '@leathercad/document';
import {
  DEFAULT_SETTINGS,
  evaluate,
  type Feature,
  type FeatureId,
  type PartId,
} from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { offsetRunAnchors, offsetRunRefusal, openSides, type OpenSide } from './offsetRun.js';

const original = (): Document => ({
  project: loadProject(
    readFileSync(
      resolve(import.meta.dirname, '../../../../../fixtures/regressions/card-holder-1.6.lcp'),
    ),
  ).project,
});
const feature = (document: Document) => {
  const f = document.project.parts.flatMap((p) => p.features).find((f) => f.id === 'pocket-stitch');
  if (f?.source.kind !== 'derived' || f.source.op.type !== 'offset')
    throw new Error('derived pocket required');
  return f;
};
function pocket(): Document {
  const removed = deleteFeatures(['pocket-stitch'], 'delete-dependents').apply(original());
  const derived = addStitchLine('pocket', 'pocket-stitch', 'pocket-outline', 3, {
    kind: 'between',
    fromAnchor: 2,
    toAnchor: 1,
  }).apply(removed);
  return addStitchHoles('pocket', 'pocket-holes', 'pocket-stitch').apply(derived);
}
describe('partial stitching controls', () => {
  it('offers durable corner indices from the followed outline', () => {
    const document = pocket();
    expect(offsetRunAnchors(document.project, feature(document))).toEqual([0, 1, 2, 3]);
  });
  it('explains why closing the stitch run would break an attached endpoint seam', () => {
    const document = pocket();
    const sewn = addSeam({
      id: 'endpoint',
      a: {
        holeSetId: 'pocket-holes',
        stretch: { kind: 'between', fromAnchor: 'start', toAnchor: 'end' },
      },
      b: { holeSetId: 'outer-holes', stretch: { kind: 'from', anchor: 3, toward: 'previous' } },
    }).apply(document);
    const f = feature(sewn);
    if (f.source.kind !== 'derived' || f.source.op.type !== 'offset')
      throw new Error('offset required');
    expect(
      offsetRunRefusal(document.project, f, { ...f.source.op, run: { kind: 'whole' } }),
    ).toBeNull();
    expect(
      offsetRunRefusal(sewn.project, f, { ...f.source.op, run: { kind: 'whole' } })?.code,
    ).toBe('ANCHOR_MISSING');
  });
});

/** A 100 × 60 rectangle turned `rotation` about its centre, stitched all round 3 mm in. */
function stitched(rotation: number): { document: Document; line: Feature } {
  const empty: Document = {
    project: { id: 'p', name: 'Pocket', settings: DEFAULT_SETTINGS, parts: [] },
  };
  const part = 'part' as PartId;
  const withPart = addPart(
    rectanglePart(
      part,
      'outline' as FeatureId,
      'Pocket',
      rectShape({ x: 0, y: 0 }, 100, 60, 0, rotation),
    ),
  ).apply(empty);
  const document = addStitchLine(part, 'line' as FeatureId, 'outline' as FeatureId, 3).apply(
    withPart,
  );
  const line = document.project.parts[0]?.features.find((f) => f.id === 'line');
  if (line === undefined) throw new Error('stitch line required');
  return { document, line };
}

/** Where the run's two ends are, and which way the gap between them faces on the board. */
function gapFacing(document: Document, line: Feature, side: OpenSide) {
  const run = openSides(document.project, line)?.find(([s]) => s === side)?.[1];
  if (run === undefined || line.source.kind !== 'derived' || line.source.op.type !== 'offset')
    throw new Error(`no run for ${side}`);
  const { project } = setDerivation(line.id, { ...line.source.op, run }).apply(document);
  const entry = evaluate(project)
    .parts.flatMap((p) => p.features)
    .find((f) => f.feature.id === line.id);
  if (entry?.ok !== true) throw new Error('run must resolve');
  const start = PathOps.start(entry.path);
  const end = PathOps.end(entry.path);
  if (start === null || end === null) throw new Error('empty run');
  // The gap's middle, from the rectangle's centre: its biggest component says which side.
  const centre = { x: 50, y: 30 };
  const gap = { x: (start.x + end.x) / 2 - centre.x, y: (start.y + end.y) / 2 - centre.y };
  return Math.abs(gap.x) > Math.abs(gap.y)
    ? gap.x > 0
      ? 'right'
      : 'left'
    : gap.y > 0
      ? 'top'
      : 'bottom';
}

describe('named sides on a rectangle (Q48)', () => {
  it('leaves the top open between corner 3 and corner 2, as the card holder does', () => {
    const { document, line } = stitched(0);
    expect(openSides(document.project, line)).toEqual([
      ['top', { kind: 'between', fromAnchor: 2, toAnchor: 1 }],
      ['bottom', { kind: 'between', fromAnchor: 0, toAnchor: 3 }],
      ['left', { kind: 'between', fromAnchor: 3, toAnchor: 2 }],
      ['right', { kind: 'between', fromAnchor: 1, toAnchor: 0 }],
    ]);
  });

  it('names the side the board shows, at any whole quarter turn', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        fc.constantFrom<OpenSide>('top', 'bottom', 'left', 'right'),
        (quarters, side) => {
          const { document, line } = stitched((quarters * Math.PI) / 2);
          expect(gapFacing(document, line, side)).toBe(side);
        },
      ),
    );
  });

  it('names no side when the rectangle is not square to the board', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: Math.PI / 2 - 0.001, noNaN: true }), (rotation) => {
        const { document, line } = stitched(rotation);
        expect(openSides(document.project, line)).toBeNull();
      }),
    );
  });

  it('names no side when the outline is not a rectangle', () => {
    expect(openSides(pocket().project, feature(pocket()))).not.toBeNull();
    const { project } = original();
    const outer = project.parts.flatMap((p) => p.features).find((f) => f.id === 'outer-holes');
    if (outer === undefined) throw new Error('hole set required');
    expect(openSides(project, outer)).toBeNull();
  });
});
