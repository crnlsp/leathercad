import { describe, expect, it } from 'vitest';

import type { Project, Tooth } from '@leathercad/domain';

import { loadProject, saveProject } from './lcp.js';
import { fixtureProjectV14 } from './makeFixture.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';
import { ProjectSchema } from './schema.js';

const options = { applicationVersion: '1.7.0', now: () => new Date('2026-11-17T00:00:00.000Z') };

/** The v14 fixture with the panel's hole set given this tooth. */
function withTooth(tooth: Tooth): Project {
  const project = fixtureProjectV14();
  return {
    ...project,
    parts: project.parts.map((part) => ({
      ...part,
      features: part.features.map((feature) => {
        if (feature.id !== 'holes-1' || feature.kind !== 'stitch-hole-set') return feature;
        const { source } = feature;
        if (source.kind !== 'derived' || source.op.type !== 'stitch-holes') return feature;
        return { ...feature, source: { ...source, op: { ...source.op, tooth } } };
      }),
    })),
  };
}

describe('a hole set’s tooth, format 14 (9.26)', () => {
  it('round-trips a slit, a round tooth and unknown fields on them, byte-identically', () => {
    const future = { kind: 'slit', lengthMm: 2, widthMm: 0.5, slantDeg: -40, future: 'kept' };
    const teeth: Tooth[] = [
      { kind: 'slit', lengthMm: 1.925, widthMm: 0.4, slantDeg: 45 },
      { kind: 'round', diameterMm: 1.2 },
      future as Tooth,
    ];
    for (const tooth of teeth) {
      const bytes = saveProject(withTooth(tooth), options);
      const loaded = loadProject(bytes);
      expect(loaded.manifest.formatVersion).toBe(CURRENT_FORMAT_VERSION);
      expect(loaded.project).toEqual(withTooth(tooth));
      expect(saveProject(loaded.project, options)).toEqual(bytes);
    }
  });

  it('refuses a size that cuts nothing, a slant that is not a number, or a shape it does not know', () => {
    const refused: unknown[] = [
      { kind: 'slit', lengthMm: 0, widthMm: 0.4, slantDeg: 45 },
      { kind: 'slit', lengthMm: 2, widthMm: -0.4, slantDeg: 45 },
      { kind: 'slit', lengthMm: 2, widthMm: 0.4, slantDeg: Number.NaN },
      { kind: 'slit', lengthMm: 2, widthMm: 0.4 },
      { kind: 'round', diameterMm: 0 },
      { kind: 'diamond', lengthMm: 2 },
    ];
    for (const tooth of refused) {
      // Deliberately not a tooth: what a damaged or hand-edited file could hold.
      expect(ProjectSchema.safeParse(withTooth(tooth as Tooth)).success).toBe(false);
    }
    const kept: Tooth = { kind: 'round', diameterMm: 1.2 };
    expect(ProjectSchema.safeParse(withTooth(kept)).success).toBe(true);
  });
});
