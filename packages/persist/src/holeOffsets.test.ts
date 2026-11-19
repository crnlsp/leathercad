import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluate, type Feature, type Project } from '@leathercad/domain';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { loadProject, saveProject } from './lcp.js';
// Frozen verbatim from leathercad-v1.6.0:packages/persist/src/schema.ts.
import { ProjectSchema as ReleasedSchema } from './test/schema-v1.6.0.js';

const options = { applicationVersion: '1.7.0', now: () => new Date('2026-11-19T00:00:00.000Z') };
const offsets = { startOffsetMm: 3, endOffsetMm: 2.5 };

/** The card holder, its pocket's holes moved in from both ends. */
function withOffsets(): Project {
  const p = loadProject(
    readFileSync(resolve(import.meta.dirname, '../../../fixtures/projects/card-holder.lcp')),
  ).project;
  const moveIn = (f: Feature): Feature =>
    f.id === 'pocket-holes' &&
    f.kind === 'stitch-hole-set' &&
    f.source.kind === 'derived' &&
    f.source.op.type === 'stitch-holes'
      ? { ...f, source: { ...f.source, op: { ...f.source.op, ...offsets } } }
      : f;
  return {
    ...p,
    parts: p.parts.map((part) => ({ ...part, features: part.features.map(moveIn) })),
  };
}

const holesOp = (p: Project) =>
  p.parts.flatMap((part) => part.features).find((f) => f.id === 'pocket-holes')?.source;

function holePoints(p: Project) {
  const set = evaluate(p)
    .parts.flatMap((part) => part.features)
    .find((f) => f.feature.id === 'pocket-holes');
  return set?.ok === true ? set.holes?.holes.map((h) => h.point) : undefined;
}

describe("a hole set's start and end offsets (Q47)", () => {
  it('are read by the released 1.6 schema and come back from a 1.6 save unchanged', () => {
    const bytes = saveProject(withOffsets(), options);
    const old = ReleasedSchema.parse(JSON.parse(strFromU8(unzipSync(bytes)['document.json']!)));
    const reopened = loadProject(saveProject(old as Project, options)).project;
    expect(holesOp(reopened)).toMatchObject({ op: offsets });
    // Nothing derived was stored, so the holes are placed again the same way.
    expect(holePoints(reopened)).toEqual(holePoints(withOffsets()));
  });
});
