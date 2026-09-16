import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { loadProject, readManifest, saveProject } from './lcp.js';
import {
  fixtureProject,
  fixtureProjectV2,
  fixtureProjectV3,
  fixtureProjectV4,
  fixtureProjectV5,
} from './makeFixture.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/format/v1.lcp');
const FIXTURE_V2 = resolve(import.meta.dirname, '../../../fixtures/format/v2.lcp');
const FIXTURE_V3 = resolve(import.meta.dirname, '../../../fixtures/format/v3.lcp');
const FIXTURE_V4 = resolve(import.meta.dirname, '../../../fixtures/format/v4.lcp');
const FIXTURE_V5 = resolve(import.meta.dirname, '../../../fixtures/format/v5.lcp');

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
      // Only the *current* version's fixture is ever regenerated. v1 to v4 are
      // real old files, and rewriting any of them would delete the only proof
      // that a file from that version still opens.
      mkdirSync(dirname(FIXTURE_V5), { recursive: true });
      writeFileSync(FIXTURE_V5, saveProject(fixtureProjectV5(), OPTIONS));
      expect(existsSync(FIXTURE_V5)).toBe(true);
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

  it('still opens a version 2 file, now that the chain has grown a second link', () => {
    // v2 stopped being the current version when hardware holes arrived. It is
    // an old file now, and like v1 it must never be regenerated — it is the
    // only proof that a file written before `hardware-hole` existed still
    // loads, through a migration that has to be a no-op and had better be one.
    expect(readManifest(readFileSync(FIXTURE_V2)).formatVersion).toBe(2);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(2);
    expect(loadProject(readFileSync(FIXTURE_V2)).project).toEqual(fixtureProjectV2());
  });

  it('still opens a version 3 file, now that features can be frozen', () => {
    // v3 stopped being current when `frozenFrom` arrived (slice 4.2b). Like v1
    // and v2 it is an old file now, never regenerated, proving a file written
    // before frozen features existed still loads through an identity migration.
    expect(readManifest(readFileSync(FIXTURE_V3)).formatVersion).toBe(3);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(3);
    expect(loadProject(readFileSync(FIXTURE_V3)).project).toEqual(fixtureProjectV3());
  });

  it('still opens a version 4 file, now that labels exist', () => {
    // v4 stopped being current when text labels arrived (slice 4.11b). Like the
    // three before it, it is an old file now and is never regenerated: it is
    // the only proof that a file written before labels existed still loads, and
    // that its frozen feature survives the trip.
    expect(readManifest(readFileSync(FIXTURE_V4)).formatVersion).toBe(4);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(4);

    const loaded = loadProject(readFileSync(FIXTURE_V4));
    expect(loaded.project).toEqual(fixtureProjectV4());
    expect(loaded.project.parts[0]!.features.find((f) => f.id === 'frozen-1')?.frozenFrom).toBe(
      'Outline',
    );
  });

  it('holds a text label at the current version', () => {
    const loaded = loadProject(readFileSync(FIXTURE_V5));

    expect(readManifest(readFileSync(FIXTURE_V5)).formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(loaded.project).toEqual(fixtureProjectV5());
  });

  it('brings a label back as words, a place and a size — never as outlines', () => {
    // Derived geometry is never persisted (file-format.md §3.3). What is stored
    // is what the user typed; the glyphs are regenerated by the typeface, so an
    // improvement to the typesetting improves this file too.
    const label = loadProject(readFileSync(FIXTURE_V5))
      .project.parts.flatMap((part) => part.features)
      .find((feature) => feature.kind === 'text-label');

    expect(label?.source).toEqual({
      kind: 'text',
      text: 'Fold przed szyciem',
      at: { x: 12, y: 30 },
      sizeMm: 3,
      rotationRad: 0,
    });
  });

  it('brings a 4 mm hole back as a 4 mm hole', () => {
    const loaded = loadProject(readFileSync(FIXTURE_V3));
    const hole = loaded.project.parts
      .flatMap((part) => part.features)
      .find((feature) => feature.kind === 'hardware-hole');

    // `stableJson` rounds every number to six decimals on the way out, which
    // is sub-quantum for millimetres — but a punch size is the number the user
    // is going to reach for a tool by, so it is worth pinning exactly.
    expect(hole?.source.kind === 'shape' && hole.source.shape.type === 'circle').toBe(true);
    expect(
      hole?.source.kind === 'shape' && hole.source.shape.type === 'circle'
        ? hole.source.shape.radius * 2
        : null,
    ).toBe(4);
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
