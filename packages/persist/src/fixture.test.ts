import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadProject, readManifest, saveProject } from './lcp.js';
import { fixtureProject } from './makeFixture.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/format/v1.lcp');

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
    it('is regenerated from the current writer', () => {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, saveProject(fixtureProject(), OPTIONS));
      expect(existsSync(FIXTURE)).toBe(true);
    });
  }

  it('exists — the corpus is not optional', () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });

  it('opens, and still says version 1', () => {
    const bytes = readFileSync(FIXTURE);

    expect(readManifest(bytes).formatVersion).toBe(1);
    expect(CURRENT_FORMAT_VERSION).toBe(1);
  });

  it('produces exactly the project it was written from', () => {
    const loaded = loadProject(readFileSync(FIXTURE));

    expect(loaded.project).toEqual(fixtureProject());
  });

  it('still holds an arc, a circle and a rectangle after a load', () => {
    const loaded = loadProject(readFileSync(FIXTURE));
    const shapes = loaded.project.parts
      .flatMap((part) => part.features)
      .map((feature) => (feature.source.kind === 'shape' ? feature.source.shape.type : 'path'));

    expect(new Set(shapes)).toEqual(new Set(['rect', 'circle', 'arc']));
  });
});
