import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acceptance, diagnose, type Feature, type Project } from '@leathercad/domain';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject, saveProject } from './lcp.js';
// Frozen verbatim from leathercad-v1.6.0:packages/persist/src/schema.ts.
import { ProjectSchema as ReleasedSchema } from './test/schema-v1.6.0.js';

const options = { applicationVersion: '1.7.0', now: () => new Date('2026-11-19T00:00:00.000Z') };

/** The card holder, its pocket asked to hold a passport: a DR8 warning, accepted. */
function accepted(): Project {
  const p = loadProject(
    readFileSync(resolve(import.meta.dirname, '../../../fixtures/projects/card-holder.lcp')),
  ).project;
  const holds = { content: { kind: 'size', widthMm: 125, heightMm: 88 }, easeMm: 2, fully: false };
  const asking: Project = {
    ...p,
    parts: p.parts.map((part) => ({
      ...part,
      features: part.features.map((f) =>
        f.id === 'pocket-stitch' ? ({ ...f, holds } as Feature) : f,
      ),
    })),
  };
  const narrow = diagnose(asking).find((d) => d.problem.code === 'POCKET_TOO_NARROW');
  if (narrow === undefined) throw new Error('the passport does not fit the card holder');
  return { ...asking, acceptedWarnings: [acceptance(asking, narrow)] };
}

const isAccepted = (p: Project) =>
  diagnose(p).find((d) => d.problem.code === 'POCKET_TOO_NARROW')?.accepted === true;

describe('accepted warnings in the file (9.16)', () => {
  it('round-trip, and the warning stays accepted after reopening', () => {
    const project = accepted();
    const reopened = loadProject(saveProject(project, options)).project;
    expect(reopened.acceptedWarnings).toEqual(project.acceptedWarnings);
    expect(isAccepted(reopened)).toBe(true);
  });

  it('change no format version: the released 1.6 schema carries them through open, edit and save', () => {
    const bytes = saveProject(accepted(), options);
    const old = ReleasedSchema.parse(JSON.parse(strFromU8(unzipSync(bytes)['document.json']!)));
    const reopened = loadProject(
      saveProject({ ...old, name: 'Edited in 1.6' } as Project, options),
    ).project;
    expect(reopened.acceptedWarnings).toEqual(accepted().acceptedWarnings);
  });

  it('refuse an entry without a key', () => {
    const project = { ...accepted(), acceptedWarnings: [{ cause: null }] } as unknown as Project;
    expect(() => loadProject(saveProject(project, options))).toThrow(InvalidProjectFileError);
  });
});
