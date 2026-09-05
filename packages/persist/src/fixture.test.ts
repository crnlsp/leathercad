import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { loadProject, readManifest, saveProject } from './lcp.js';
import { fixtureProject, fixtureProjectV2 } from './makeFixture.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/format/v1.lcp');
const FIXTURE_V2 = resolve(import.meta.dirname, '../../../fixtures/format/v2.lcp');

// Fixed, so regenerating an unchanged fixture produces no diff and a real
// change to the format is visible in review.
const OPTIONS = {
  applicationVersion: '0.0.0',
  now: () => new Date('2026-09-04T00:00:00.000Z'),
};

/**
 * The format corpus (docs/file-format.md §4.2 rule 4).
 *
 * `fixtures/format/v1.lcp` is a real file from the current writer holding one
 * of every parametric shape. Whatever the migration chain grows to, it must
 * still open this file and produce this project — that is the only thing that
 * proves the chain works, and it costs one file per version.
 *
 * Regenerate with `UPDATE_FIXTURES=1 pnpm test packages/persist`, which is
 * appropriate only while version 1 is genuinely still changing. Once something
 * has shipped, a change here means a new version instead.
 */
describe('the format baseline fixture', () => {
  if (process.env.UPDATE_FIXTURES === '1') {
    it('regenerates the current version from the current writer', () => {
      // v1 is deliberately not regenerated: it is a real old file, and
      // rewriting it would delete the only proof that one still opens.
      mkdirSync(dirname(FIXTURE_V2), { recursive: true });
      writeFileSync(FIXTURE_V2, saveProject(fixtureProjectV2(), OPTIONS));
      expect(existsSync(FIXTURE_V2)).toBe(true);
    });
  }

  it('exists — the corpus is not optional', () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });

  it('is still a version 1 file, and the current format has moved past it', () => {
    // The point of the corpus. This file was written by the version 1 writer
    // and must not be regenerated: it is the only thing proving that a real
    // old file still opens once the chain has grown a link.
    expect(readManifest(readFileSync(FIXTURE)).formatVersion).toBe(1);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(1);
  });

  it('runs through the migration chain on the way to the current version', () => {
    // v1 -> v2 added derived features, which no v1 document contains, so the
    // migration is an identity and the project comes back unchanged. When the
    // second bump lands and this stops being an identity, this test is what
    // notices.
    expect(loadProject(readFileSync(FIXTURE)).project).toEqual(fixtureProject());
  });

  it('produces exactly the project it was written from', () => {
    const loaded = loadProject(readFileSync(FIXTURE));

    expect(loaded.project).toEqual(fixtureProject());
  });

  it('opens a rectangle written before `rotation` existed, as unrotated', () => {
    // This file predates slice 3.7. The schema defaults `rotation` to 0, and
    // that is the only thing keeping older projects readable — which is why
    // this fixture must NOT be regenerated: rewriting it with the current
    // writer would add the field and quietly delete this test's subject.
    const raw = JSON.parse(
      strFromU8(unzipSync(new Uint8Array(readFileSync(FIXTURE)))['document.json']!),
    ) as { parts: { features: { source: { shape?: Record<string, unknown> } }[] }[] };

    const storedRect = raw.parts
      .flatMap((part) => part.features)
      .map((feature) => feature.source.shape)
      .find((shape) => shape?.['type'] === 'rect');

    expect(storedRect).toBeDefined();
    expect(storedRect).not.toHaveProperty('rotation');

    const loaded = loadProject(readFileSync(FIXTURE));
    const source = loaded.project.parts[0]?.features[0]?.source;
    expect(source?.kind === 'shape' && source.shape.type === 'rect' && source.shape.rotation).toBe(
      0,
    );
  });

  it('holds a derivation chain at the current version', () => {
    const loaded = loadProject(readFileSync(FIXTURE_V2));

    expect(readManifest(readFileSync(FIXTURE_V2)).formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(loaded.project).toEqual(fixtureProjectV2());
  });

  it('keeps a partial run through a save and reopen', () => {
    const loaded = loadProject(readFileSync(FIXTURE_V2));
    const source = loaded.project.parts[1]?.features[1]?.source;

    expect(source?.kind).toBe('derived');
    if (source?.kind !== 'derived' || source.op.type !== 'offset') return;
    expect(source.op.run).toEqual({ kind: 'between', fromAnchor: 0, toAnchor: 3 });
  });

  it('still holds an arc, a circle and a rectangle after a load', () => {
    const loaded = loadProject(readFileSync(FIXTURE));
    const shapes = loaded.project.parts
      .flatMap((part) => part.features)
      .map((feature) => (feature.source.kind === 'shape' ? feature.source.shape.type : 'path'));

    expect(new Set(shapes)).toEqual(new Set(['rect', 'circle', 'arc']));
  });
});
