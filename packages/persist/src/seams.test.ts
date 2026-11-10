import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EPS_LENGTH } from '@leathercad/core';
import { diagnose, resolveSeam, type Project, type Seam } from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import { fixtureProjectV12 } from './makeFixture.js';
import { InvalidProjectFileError, loadProject, saveProject } from './lcp.js';
import { ProjectSchema } from './schema.js';
// Frozen verbatim from leathercad-v1.6.0:packages/persist/src/schema.ts.
import {
  ProjectSchema as ReleasedSchema,
  ManifestSchema as ReleasedManifestSchema,
  type Manifest,
} from './test/schema-v1.6.0.js';

const options = { applicationVersion: '1.7.0', now: () => new Date('2026-11-10T00:00:00.000Z') };
const seam: Seam = {
  id: 'seam',
  a: { holeSetId: 'holes-1', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
  b: { holeSetId: 'holes-1', stretch: { kind: 'from', anchor: 3, toward: 'previous' } },
};

describe('seams in format 12 (9.6a)', () => {
  it('walks the shipped card holder bottom seam with 27 holes and its exact drift', () => {
    const p = loadProject(
      readFileSync(resolve(import.meta.dirname, '../../../fixtures/projects/card-holder.lcp')),
    ).project;
    const result = resolveSeam(p, {
      id: 'bottom',
      a: { holeSetId: 'pocket-holes', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
      b: { holeSetId: 'outer-holes', stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 } },
    });
    if (!result.ok) throw new Error('the shipped bottom seam must resolve');
    expect(result.a.holes).toHaveLength(27);
    expect(result.b.holes).toHaveLength(27);
    const drift =
      (result.a.holes.at(-1)?.distanceMm ?? 0) - (result.b.holes.at(-1)?.distanceMm ?? 0);
    expect(Math.abs(drift - (99 - (97 + Math.PI / 2)))).toBeLessThanOrEqual(EPS_LENGTH);
  });

  it('keeps resolved stretches and bytes through save and reopen for every anchor pair', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        (fromAnchor, toAnchor) => {
          const side = {
            holeSetId: 'holes-1',
            stretch: { kind: 'between' as const, fromAnchor, toAnchor },
          };
          const value: Seam = { ...seam, a: side, b: side };
          const p = { ...fixtureProjectV12(), seams: [value] };
          const bytes = saveProject(p, options);
          const loaded = loadProject(bytes).project;
          expect(resolveSeam(loaded, loaded.seams?.[0] ?? value)).toEqual(resolveSeam(p, value));
          expect(saveProject(loaded, options)).toEqual(bytes);
        },
      ),
    );
  });
  it('survives open, edit and save through the exact released 1.6 schema', () => {
    const extended = { ...seam, future: { kept: true } };
    const bytes = saveProject({ ...fixtureProjectV12(), seams: [extended] }, options);
    const entries = unzipSync(bytes);
    const manifest: Manifest = ReleasedManifestSchema.parse(
      JSON.parse(strFromU8(entries['manifest.json']!)),
    );
    expect(manifest.formatVersion).toBe(12);
    const old = ReleasedSchema.parse(JSON.parse(strFromU8(entries['document.json']!)));
    const edited = { ...old, name: 'Edited in 1.6' };
    const reopened = loadProject(saveProject(edited as Project, options)).project;
    expect(reopened.name).toBe('Edited in 1.6');
    expect(reopened.seams).toEqual([extended]);
  });
  it('round-trips seam metadata and unknown nested fields byte-identically', () => {
    const extended = {
      ...seam,
      future: [1, 2],
      a: { ...seam.a, future: true, stretch: { ...seam.a.stretch, future: 'kept' } },
    };
    const bytes = saveProject({ ...fixtureProjectV12(), seams: [extended] }, options);
    const loaded = loadProject(bytes);
    expect(loaded.manifest.formatVersion).toBe(12);
    expect(loaded.project.seams).toEqual([extended]);
    expect(saveProject(loaded.project, options)).toEqual(bytes);
  });

  it('opens every shipped format without inventing seams', () => {
    for (let version = 1; version <= 12; version++) {
      expect(
        loadProject(
          readFileSync(
            resolve(import.meta.dirname, `../../../fixtures/format/v${String(version)}.lcp`),
          ),
        ).project.seams,
      ).toBeUndefined();
    }
  });

  it('keeps a seam whose hole set was deleted by 1.6, and reports SEAM_SIDE_MISSING', () => {
    const dangling = { ...seam, a: { ...seam.a, holeSetId: 'removed-in-1.6' } };
    const loaded = loadProject(
      saveProject({ ...fixtureProjectV12(), seams: [dangling] }, options),
    ).project;
    expect(loaded.seams).toEqual([dangling]);
    expect(diagnose(loaded).some((d) => d.problem.code === 'SEAM_SIDE_MISSING')).toBe(true);
  });

  it('refuses structurally impossible seams at the loading boundary', () => {
    const p = fixtureProjectV12();
    for (const bad of [
      { ...seam, a: seam.b },
      { ...seam, a: { ...seam.a, holeSetId: 'cut-1' } },
      {
        ...seam,
        a: { ...seam.a, stretch: { kind: 'between' as const, fromAnchor: 0, toAnchor: 99 } },
      },
    ])
      expect(() => loadProject(saveProject({ ...p, seams: [bad] }, options))).toThrow(
        InvalidProjectFileError,
      );
  });

  it('rejects duplicate ids, including collisions with features and guides', () => {
    const p = fixtureProjectV12();
    const guide = { id: 'guide', origin: { x: 0, y: 0 }, angleRad: 0 };
    for (const seams of [[seam, seam], [{ ...seam, id: 'holes-1' }], [{ ...seam, id: 'guide' }]]) {
      expect(() => loadProject(saveProject({ ...p, guides: [guide], seams }, options))).toThrow(
        InvalidProjectFileError,
      );
    }
  });

  it('rejects malformed seam references and fractional or negative anchors', () => {
    const p = fixtureProjectV12();
    for (const a of [
      { ...seam.a, holeSetId: '' },
      { ...seam.a, stretch: { kind: 'from', anchor: -1, toward: 'next' } },
      { ...seam.a, stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1.5 } },
      { ...seam.a, stretch: { kind: 'from', anchor: 0, toward: 'sideways' } },
    ])
      expect(ProjectSchema.safeParse({ ...p, seams: [{ ...seam, a }] }).success).toBe(false);
  });
});
