import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diagnose, type Feature, type PocketRequirement, type Project } from '@leathercad/domain';
import fc from 'fast-check';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject, saveProject } from './lcp.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';
// Frozen verbatim from leathercad-v1.6.0:packages/persist/src/schema.ts.
import { ProjectSchema as ReleasedSchema } from './test/schema-v1.6.0.js';

const options = { applicationVersion: '1.7.0', now: () => new Date('2026-11-12T00:00:00.000Z') };
const cardHolder = (): Project =>
  loadProject(
    readFileSync(resolve(import.meta.dirname, '../../../fixtures/projects/card-holder.lcp')),
  ).project;

/** The card holder, its pocket's stitching saying what it holds. */
function holding(holds: unknown): Project {
  const p = cardHolder();
  return {
    ...p,
    parts: p.parts.map((part) => ({
      ...part,
      features: part.features.map((f) =>
        f.id === 'pocket-stitch' ? ({ ...f, holds } as Feature) : f,
      ),
    })),
  };
}
const stitchOf = (p: Project) =>
  p.parts.flatMap((part) => part.features).find((f) => f.id === 'pocket-stitch');

const requirement = fc.record({
  content: fc.oneof(
    fc.constant({ kind: 'id-1' as const }),
    fc.record({
      kind: fc.constant('size' as const),
      widthMm: fc.integer({ min: 1, max: 5_000_000 }).map((t) => t / 10_000),
      heightMm: fc.integer({ min: 1, max: 5_000_000 }).map((t) => t / 10_000),
    }),
  ),
  easeMm: fc.integer({ min: 0, max: 200_000 }).map((t) => t / 10_000),
  fully: fc.boolean(),
}) satisfies fc.Arbitrary<PocketRequirement>;

describe('what a pocket holds, kept as metadata (9.14b)', () => {
  it('round-trips any requirement byte for byte, at the current format version', () => {
    fc.assert(
      fc.property(requirement, (holds) => {
        const bytes = saveProject(holding(holds), options);
        const loaded = loadProject(bytes).project;
        expect(stitchOf(loaded)).toMatchObject({ holds });
        expect(saveProject(loaded, options)).toEqual(bytes);
      }),
      { numRuns: 50 },
    );
  });

  it('does not change the format version, because nothing it says is drawn, cut or printed', () => {
    const bytes = saveProject(
      holding({ content: { kind: 'id-1' }, easeMm: 4, fully: true }),
      options,
    );
    const manifest = JSON.parse(strFromU8(unzipSync(bytes)['manifest.json']!)) as {
      formatVersion: number;
    };
    expect(manifest.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(CURRENT_FORMAT_VERSION).toBe(13);
  });

  it('survives open, edit and save through the exact released 1.6 schema, with unknown fields', () => {
    const holds = {
      content: { kind: 'size', widthMm: 160, heightMm: 80, note: 'x' },
      easeMm: 2,
      fully: false,
      later: 1,
    };
    const bytes = saveProject(holding(holds), options);
    const old = ReleasedSchema.parse(JSON.parse(strFromU8(unzipSync(bytes)['document.json']!)));
    const reopened = loadProject(
      saveProject({ ...old, name: 'Edited in 1.6' } as Project, options),
    ).project;
    expect(stitchOf(reopened)).toMatchObject({ holds });
  });

  it('is checked again on load, never read back from the file', () => {
    const loaded = loadProject(
      saveProject(
        holding({
          content: { kind: 'size', widthMm: 99.5, heightMm: 20 },
          easeMm: 0,
          fully: false,
        }),
        options,
      ),
    ).project;
    expect(diagnose(loaded).map((d) => d.problem.code)).toContain('POCKET_TOO_NARROW');
  });

  it.each([
    ['a negative ease', { content: { kind: 'id-1' }, easeMm: -1, fully: false }, 'holds.easeMm'],
    [
      'a typed size of zero',
      { content: { kind: 'size', widthMm: 0, heightMm: 50 }, easeMm: 0, fully: false },
      'holds.content.widthMm',
    ],
    [
      'content of no known kind',
      { content: { kind: 'banknote' }, easeMm: 0, fully: false },
      'holds.content',
    ],
    ['no answer to fully', { content: { kind: 'id-1' }, easeMm: 0 }, 'holds.fully'],
  ])('refuses %s, naming the field', (_name, holds, field) => {
    const bytes = saveProject(holding(holds), options);
    expect(() => loadProject(bytes)).toThrow(InvalidProjectFileError);
    expect(() => loadProject(bytes)).toThrow(field);
  });
});
