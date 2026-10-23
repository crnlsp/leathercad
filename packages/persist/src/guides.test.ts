import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectSchema } from './schema.js';
import { loadProject, saveProject } from './lcp.js';
import { fixtureProjectV10 } from './makeFixture.js';

describe('persisted guides', () => {
  it('keeps exact angles, unknown guide fields and byte-stable saves', () => {
    const guide = {
      id: 'diagonal',
      origin: { x: 20, y: 30, future: true },
      angleRad: Math.PI / 4,
      future: 'kept',
    };
    const project = { ...fixtureProjectV10(), guides: [guide] };
    const options = {
      applicationVersion: '1.6.0',
      now: () => new Date('2026-10-23T00:00:00.000Z'),
    };
    const bytes = saveProject(project, options);
    const loaded = loadProject(bytes).project;
    expect(loaded.guides).toEqual([guide]);
    expect(saveProject(loaded, options)).toEqual(bytes);
  });
  it('opens the old corpus without inventing guides', () => {
    for (let version = 1; version <= 9; version++) {
      const file = resolve(import.meta.dirname, `../../../fixtures/format/v${String(version)}.lcp`);
      expect(loadProject(readFileSync(file)).project.guides).toBeUndefined();
    }
  });
  it('rejects malformed positions, angles, duplicate ids and feature-id collisions', () => {
    const project = fixtureProjectV10();
    for (const guide of [
      { id: 'g', origin: { x: 100001, y: 0 }, angleRad: 0 },
      { id: 'g', origin: { x: 0, y: 0 }, angleRad: Infinity },
      { id: '', origin: { x: 0, y: 0 }, angleRad: 0 },
    ])
      expect(ProjectSchema.safeParse({ ...project, guides: [guide] }).success).toBe(false);
    const guide = { id: 'g', origin: { x: 0, y: 0 }, angleRad: 0 };
    expect(ProjectSchema.safeParse({ ...project, guides: [guide, guide] }).success).toBe(false);
    const featureId = project.parts[0]?.features[0]?.id;
    expect(
      ProjectSchema.safeParse({ ...project, guides: [{ ...guide, id: featureId }] }).success,
    ).toBe(false);
  });
});
