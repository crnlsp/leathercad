import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project } from '@leathercad/domain';
import { strFromU8, unzipSync } from 'fflate';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject, readManifest, saveProject } from './lcp.js';
import { fixtureProjectV14, fixtureProjectV15 } from './makeFixture.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';
// Frozen verbatim from leathercad-v1.6.0:packages/persist/src/schema.ts.
import { ProjectSchema as ReleasedSchema } from './test/schema-v1.6.0.js';

const options = { applicationVersion: '1.7.0', now: () => new Date('2026-11-19T00:00:00.000Z') };

/** The v15 fixture with its pocket cut this many times, as a mirrored pair. */
function pocketPair(quantity: number): Project {
  const project = fixtureProjectV15();
  return {
    ...project,
    parts: project.parts.map((part) => (part.id === 'part-pocket' ? { ...part, quantity } : part)),
  };
}

describe('a piece cut as a mirrored pair, format 15 (Q21)', () => {
  it('round-trips at any even count, byte-identically', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (half) => {
        const project = pocketPair(half * 2);
        const bytes = saveProject(project, options);
        const loaded = loadProject(bytes);
        expect(loaded.manifest.formatVersion).toBe(CURRENT_FORMAT_VERSION);
        expect(loaded.project).toEqual(project);
        expect(saveProject(loaded.project, options)).toEqual(bytes);
      }),
      { numRuns: 25 },
    );
  });

  it('refuses an odd count, or a pair said any way but `true`', () => {
    for (const odd of [1, 3, 7]) {
      expect(() => loadProject(saveProject(pocketPair(odd), options))).toThrow(
        InvalidProjectFileError,
      );
    }
    const said = (value: unknown) =>
      ({
        ...fixtureProjectV15(),
        parts: fixtureProjectV15().parts.map((part) =>
          part.id === 'part-pocket' ? { ...part, mirroredPair: value } : part,
        ),
      }) as unknown as Project;
    for (const value of [false, 'yes', 1]) {
      expect(() => loadProject(saveProject(said(value), options))).toThrow(InvalidProjectFileError);
    }
  });

  it('is a format of its own: a format-14 build refuses it, and 1.6 would print two lefts', () => {
    const bytes = saveProject(fixtureProjectV15(), options);
    // Newer than the format 14 that 9.26's builds read, so they refuse it with
    // their *update LeatherCAD* sentence (lcp.test.ts holds that sentence).
    expect(readManifest(bytes).formatVersion).toBeGreaterThan(14);
    // Why it is a version (§4.5 rule 2): the released schema carries the flag
    // as unknown data, so a build that did not refuse would print "cut 2".
    const json: unknown = JSON.parse(strFromU8(unzipSync(bytes)['document.json']!));
    expect(ReleasedSchema.safeParse(json).success).toBe(true);
  });

  it('opens every older file as pieces cut alike', () => {
    const v14 = readFileSync(resolve(import.meta.dirname, '../../../fixtures/format/v14.lcp'));
    const loaded = loadProject(v14).project;
    expect(loaded).toEqual(fixtureProjectV14());
    expect(loaded.parts.some((part) => part.mirroredPair !== undefined)).toBe(false);
  });
});
