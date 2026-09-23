import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { Feature } from '@leathercad/domain';

import { loadProject, readManifest, saveProject } from './lcp.js';
import {
  fixtureProject,
  fixtureProjectV2,
  fixtureProjectV3,
  fixtureProjectV4,
  fixtureProjectV5,
  fixtureProjectV6,
  fixtureProjectV7,
  fixtureProjectV8,
  fixtureProjectV9,
} from './makeFixture.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/format/v1.lcp');
const FIXTURE_V2 = resolve(import.meta.dirname, '../../../fixtures/format/v2.lcp');
const FIXTURE_V3 = resolve(import.meta.dirname, '../../../fixtures/format/v3.lcp');
const FIXTURE_V4 = resolve(import.meta.dirname, '../../../fixtures/format/v4.lcp');
const FIXTURE_V5 = resolve(import.meta.dirname, '../../../fixtures/format/v5.lcp');
const FIXTURE_V6 = resolve(import.meta.dirname, '../../../fixtures/format/v6.lcp');
const FIXTURE_V7 = resolve(import.meta.dirname, '../../../fixtures/format/v7.lcp');
const FIXTURE_V8 = resolve(import.meta.dirname, '../../../fixtures/format/v8.lcp');
const FIXTURE_V9 = resolve(import.meta.dirname, '../../../fixtures/format/v9.lcp');

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
      mkdirSync(dirname(FIXTURE_V9), { recursive: true });
      writeFileSync(FIXTURE_V9, saveProject(fixtureProjectV9(), OPTIONS));
      expect(existsSync(FIXTURE_V9)).toBe(true);
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

  it('still opens a version 5 file, now that mirrors exist', () => {
    // v5 stopped being current when the mirror derivation arrived (slice 4.8a).
    // Never regenerated: it is the only proof that a file written before
    // counterparts existed still loads.
    expect(readManifest(readFileSync(FIXTURE_V5)).formatVersion).toBe(5);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(5);
    expect(loadProject(readFileSync(FIXTURE_V5)).project).toEqual(fixtureProjectV5());
  });

  it('still opens a version 6 file, and migrates its mirror axis', () => {
    // **The first migration that is not an identity.** v6 stored a mirror axis
    // as a bare line; v7 discriminates it, because a fold axis carries a
    // reference instead of numbers. This file is never regenerated: it is the
    // only proof the chain can carry a real change rather than only new shapes
    // old files happen not to contain.
    expect(readManifest(readFileSync(FIXTURE_V6)).formatVersion).toBe(6);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(6);
    expect(loadProject(readFileSync(FIXTURE_V6)).project).toEqual(fixtureProjectV6());
  });

  it('adds the discriminant to a real version 6 axis, rather than to a hand-made one', () => {
    // Read the bytes: the stored axis has no `kind`, and the loaded one does.
    const raw = JSON.parse(
      strFromU8(unzipSync(new Uint8Array(readFileSync(FIXTURE_V6)))['document.json']!),
    ) as { parts: { features: { source: { op?: Record<string, unknown> } }[] }[] };

    const storedAxis = raw.parts
      .flatMap((part) => part.features)
      .map((feature) => feature.source.op)
      .find((op) => op?.['type'] === 'mirror')?.['axis'] as Record<string, unknown> | undefined;

    expect(storedAxis).toBeDefined();
    expect(storedAxis).not.toHaveProperty('kind');

    const migrated = loadProject(readFileSync(FIXTURE_V6))
      .project.parts.flatMap((part) => part.features)
      .find((feature) => feature.id === 'mirror-1');

    expect(
      migrated?.source.kind === 'derived' &&
        migrated.source.op.type === 'mirror' &&
        migrated.source.op.axis.kind,
    ).toBe('line');
  });

  it('still opens a version 7 file, now that dimensions exist', () => {
    expect(readManifest(readFileSync(FIXTURE_V7)).formatVersion).toBe(7);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(7);
    expect(loadProject(readFileSync(FIXTURE_V7)).project).toEqual(fixtureProjectV7());
  });

  it('holds a dimension, one version back now', () => {
    expect(readManifest(readFileSync(FIXTURE_V8)).formatVersion).toBe(8);
    expect(CURRENT_FORMAT_VERSION).toBeGreaterThan(8);
    expect(loadProject(readFileSync(FIXTURE_V8)).project).toEqual(fixtureProjectV8());
  });

  it('names its paper at the current version', () => {
    const loaded = loadProject(readFileSync(FIXTURE_V9));

    expect(readManifest(readFileSync(FIXTURE_V9)).formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(loaded.project).toEqual(fixtureProjectV9());
  });

  it('opens every file written before paper could be chosen as A4 portrait', () => {
    // **The regression this version exists for.** Until version 9 nobody could
    // choose: `exportPdf` fell back to `DEFAULT_PAGE_SETUP`, so every project
    // ever saved printed A4 portrait. A migration that filled in anything else
    // would change what comes out of the printer for a pattern someone may
    // already have cut from — so every fixture in the corpus is checked, not
    // just the most recent one.
    for (const fixture of [
      FIXTURE,
      FIXTURE_V2,
      FIXTURE_V3,
      FIXTURE_V4,
      FIXTURE_V5,
      FIXTURE_V6,
      FIXTURE_V7,
      FIXTURE_V8,
    ]) {
      const { settings } = loadProject(readFileSync(fixture)).project;

      expect(settings.paper, fixture).toBe('A4');
      expect(settings.orientation, fixture).toBe('portrait');
    }
  });

  it('stores the paper by name, so a sheet size has one definition', () => {
    // A stored 210 x 297 would be a second definition of A4, free to drift
    // from the one in the domain.
    const raw = strFromU8(unzipSync(new Uint8Array(readFileSync(FIXTURE_V9)))['document.json']!);
    const stored = (JSON.parse(raw) as { settings: Record<string, unknown> }).settings;

    expect(stored['paper']).toBe('A4');
    expect(stored['orientation']).toBe('portrait');
    expect(JSON.stringify(stored)).not.toContain('297');
  });

  it('stores a dimension as two references and no value at all (X6)', () => {
    // The point of a dimension over a typed label: the number is read from the
    // model every time, so the file cannot hold a stale one.
    const raw = strFromU8(unzipSync(new Uint8Array(readFileSync(FIXTURE_V8)))['document.json']!);
    const stored = (JSON.parse(raw) as { parts: { features: { id: string }[] }[] }).parts
      .flatMap((part) => part.features)
      .find((feature) => feature.id === 'shell-width');

    expect(stored).toMatchObject({
      source: {
        kind: 'measurement',
        measure: 'horizontal',
        a: { kind: 'anchor', featureId: 'shell-cut', anchor: 1 },
        b: { kind: 'anchor', featureId: 'shell-cut', anchor: 2 },
      },
    });
    // The shell is 190 wide; nothing in the stored dimension says so.
    expect(JSON.stringify(stored)).not.toContain('190');
  });

  it('stores a fold-tracked mirror as a reference, not as a line', () => {
    // The first `references` edge in the format: what is written is *which
    // fold*, never where that fold happens to be. Move the fold in a later
    // session and the counterpart moves with it.
    const mirror = loadProject(readFileSync(FIXTURE_V7))
      .project.parts.flatMap((part) => part.features)
      .find((feature) => feature.id === 'shell-slot-mirrored');

    expect(mirror?.source).toEqual({
      kind: 'derived',
      sourceId: 'shell-slot',
      op: { type: 'mirror', axis: { kind: 'fold', foldId: 'shell-fold' }, glideMm: 0 },
    });
  });

  it('stores a counterpart as a relationship, never as its reflected shape', () => {
    // Derived geometry is never persisted (file-format.md §3.3). A mirror is an
    // axis and a glide; the counterpart's outline is recomputed on load, which
    // is what makes editing the original in a later session still move it.
    const mirror = loadProject(readFileSync(FIXTURE_V6))
      .project.parts.flatMap((part) => part.features)
      .find((feature) => feature.id === 'mirror-1');

    expect(mirror?.source).toEqual({
      kind: 'derived',
      sourceId: 'cut-1',
      op: {
        type: 'mirror',
        axis: { kind: 'line', origin: { x: 0, y: -10 }, angleRad: 0 },
        glideMm: 5,
      },
    });
  });

  it('stores a mirror axis angle to six decimals, as it does every other angle', () => {
    // `stableJson` rounds every number on the way out, angles included — a
    // rectangle's `rotation` has always been stored this way. For a mirror
    // axis 1e-6 rad is 0.0002 mm over a 200 mm span, which is two orders below
    // anything printable, so it is accepted rather than special-cased. Pinned
    // here because it is the kind of thing that is only noticed when a test
    // compares an axis for exact equality and quietly fails.
    const base = fixtureProjectV6();
    const mirrorPart = base.parts.find((part) => part.id === 'part-mirror')!;
    const counterpart = mirrorPart.features[0]!;

    const saved = saveProject(
      {
        ...base,
        parts: base.parts.map((part) =>
          part.id !== 'part-mirror'
            ? part
            : {
                ...part,
                features: [
                  {
                    ...counterpart,
                    source: {
                      kind: 'derived',
                      sourceId: 'cut-1',
                      op: {
                        type: 'mirror',
                        axis: {
                          kind: 'line' as const,
                          origin: { x: 0, y: -10 },
                          angleRad: Math.PI / 2,
                        },
                        glideMm: 5,
                      },
                    },
                  } as Feature,
                ],
              },
        ),
      },
      OPTIONS,
    );

    const mirror = loadProject(saved)
      .project.parts.flatMap((part) => part.features)
      .find((feature) => feature.id === 'mirror-1');

    const angle =
      mirror?.source.kind === 'derived' &&
      mirror.source.op.type === 'mirror' &&
      mirror.source.op.axis.kind === 'line'
        ? mirror.source.op.axis.angleRad
        : null;

    expect(angle).toBe(1.570796);
    expect(Math.abs(angle! - Math.PI / 2)).toBeLessThan(1e-6);
  });

  it('brings a label back as words, a place and a size — never as outlines', () => {
    // Derived geometry is never persisted (file-format.md §3.3). What is stored
    // is what the user typed; the glyphs are regenerated by the typeface, so an
    // improvement to the typesetting improves this file too.
    const label = loadProject(readFileSync(FIXTURE_V7))
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
