import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addSeam,
  addStitchHoles,
  addStitchLine,
  deleteFeatures,
  type Document,
} from '@leathercad/document';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { offsetRunAnchors, offsetRunRefusal } from './offsetRun.js';

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
