import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EPS_LENGTH } from '@leathercad/core';
import {
  diagnose,
  resolveSeam,
  seamVerdict,
  type Project,
  type Seam,
  type SeamAnchor,
} from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import { fixtureProjectV12 } from './makeFixture.js';
import { InvalidProjectFileError, loadProject, saveProject } from './lcp.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';
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

describe('seams, kept at format 12 and marked from 13 (9.6a, 9.13)', () => {
  it.each([
    { id: 'left', pocketCorner: 0, pocketEnd: 'start', outerCorner: 3, toward: 'previous' },
    { id: 'right', pocketCorner: 1, pocketEnd: 'end', outerCorner: 0, toward: 'next' },
  ] as const)(
    'walks the released 1.6 card holder $id seam from its bottom corner to its endpoint',
    ({ id, pocketCorner, pocketEnd, outerCorner, toward }) => {
      const p = loadProject(
        readFileSync(
          resolve(import.meta.dirname, '../../../fixtures/regressions/card-holder-1.6.lcp'),
        ),
      ).project;
      const value: Seam = {
        id,
        a: {
          holeSetId: 'pocket-holes',
          stretch: { kind: 'between', fromAnchor: pocketCorner, toAnchor: pocketEnd },
        },
        b: { holeSetId: 'outer-holes', stretch: { kind: 'from', anchor: outerCorner, toward } },
      };
      const result = resolveSeam(p, value);
      if (!result.ok) throw new Error('the complete side seam must resolve');
      expect(result.a.holes).toHaveLength(11);
      expect(result.b.holes).toHaveLength(11);
      expect(seamVerdict(p, value)).toMatchObject({
        ok: true,
        countA: 11,
        countB: 11,
        worstPair: 11,
        severity: 'warning',
        driftMm: expect.closeTo(0.605414, 4),
      });
      expect(result.a.lengthMm).toBeCloseTo(38, 9);
      const drift =
        (result.a.holes.at(-1)?.distanceMm ?? 0) - (result.b.holes.at(-1)?.distanceMm ?? 0);
      expect(Math.abs(drift - (38 - (10 * (62 + Math.PI / 2)) / 17))).toBeLessThanOrEqual(
        EPS_LENGTH,
      );
    },
  );

  it('preserves endpoint references and unknown fields through the released 1.6 schema', () => {
    const p = loadProject(
      readFileSync(
        resolve(import.meta.dirname, '../../../fixtures/regressions/card-holder-1.6.lcp'),
      ),
    ).project;
    const value = {
      id: 'endpoint',
      future: 'kept',
      a: {
        holeSetId: 'pocket-holes',
        stretch: {
          kind: 'between' as const,
          fromAnchor: 'start' as const,
          toAnchor: 'end' as const,
          future: true,
        },
      },
      b: {
        holeSetId: 'pocket-holes',
        stretch: { kind: 'from' as const, anchor: 'end' as const, toward: 'previous' as const },
      },
    };
    const bytes = saveProject({ ...p, seams: [value] }, options);
    const loaded = loadProject(bytes).project;
    expect(loaded.seams).toEqual([value]);
    expect(saveProject(loaded, options)).toEqual(bytes);
    const old = ReleasedSchema.parse(JSON.parse(strFromU8(unzipSync(bytes)['document.json']!)));
    const edited = { ...old, name: 'Edited in 1.6' } as Project;
    const reopened = loadProject(saveProject(edited, options)).project;
    expect(reopened.seams).toEqual([value]);
    expect(resolveSeam(reopened, reopened.seams?.[0] ?? value)).toEqual(resolveSeam(p, value));
  });

  it('keeps every mix of endpoints and corners byte-identical through save and reopen', () => {
    const p = loadProject(
      readFileSync(
        resolve(import.meta.dirname, '../../../fixtures/regressions/card-holder-1.6.lcp'),
      ),
    ).project;
    fc.assert(
      fc.property(
        fc.constantFrom<SeamAnchor>(0, 1, 'start', 'end'),
        fc.constantFrom<SeamAnchor>(0, 1, 'start', 'end'),
        (fromAnchor, toAnchor) => {
          const side = {
            holeSetId: 'pocket-holes',
            stretch: { kind: 'between' as const, fromAnchor, toAnchor },
          };
          const value: Seam = { ...seam, a: side, b: side };
          const bytes = saveProject({ ...p, seams: [value] }, options);
          const loaded = loadProject(bytes).project;
          expect(resolveSeam(loaded, loaded.seams?.[0] ?? value)).toEqual(resolveSeam(p, value));
          expect(saveProject(loaded, options)).toEqual(bytes);
        },
      ),
    );
  });

  it('refuses endpoint references on a closed line at the loading boundary', () => {
    const value: Seam = {
      ...seam,
      a: { ...seam.a, stretch: { kind: 'between', fromAnchor: 'start', toAnchor: 1 } },
    };
    expect(() =>
      loadProject(saveProject({ ...fixtureProjectV12(), seams: [value] }, options)),
    ).toThrow(InvalidProjectFileError);
  });
  it('walks the released 1.6 card holder bottom seam with 27 holes and its exact drift', () => {
    const p = loadProject(
      readFileSync(
        resolve(import.meta.dirname, '../../../fixtures/regressions/card-holder-1.6.lcp'),
      ),
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
    // 1.7 writes format 13 (9.13), which 1.6 refuses by its number; what its
    // schema proves is that a 1.6 build kept the seams of a format-12 file.
    expect(manifest.formatVersion).toBe(CURRENT_FORMAT_VERSION);
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
    expect(loaded.manifest.formatVersion).toBe(CURRENT_FORMAT_VERSION);
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
      { ...seam.a, stretch: { kind: 'between', fromAnchor: 'middle', toAnchor: 'end' } },
    ])
      expect(ProjectSchema.safeParse({ ...p, seams: [{ ...seam, a }] }).success).toBe(false);
  });
});

it('preserves whole closed stretches through 1.6 and save/load without changing verdicts (D18)', () => {
  const p = fixtureProjectV12();
  const whole: Seam = {
    ...seam,
    a: { ...seam.a, stretch: { kind: 'whole' } },
    b: { ...seam.b, stretch: { kind: 'whole' } },
  };
  const original = { ...p, seams: [whole] };
  const saved = saveProject(original, options);
  const loaded = loadProject(saved).project;
  const legacy = ReleasedSchema.parse(JSON.parse(strFromU8(unzipSync(saved)['document.json']!)));
  expect(legacy).toMatchObject({ seams: [whole] });
  expect(seamVerdict(loaded, loaded.seams![0]!)).toEqual(seamVerdict(original, whole));
});

it('checks the released 1.6 card holder bottom as 27 pairs within the drift limit', () => {
  const p = loadProject(
    readFileSync(resolve(import.meta.dirname, '../../../fixtures/regressions/card-holder-1.6.lcp')),
  ).project;
  const value: Seam = {
    id: 'bottom',
    a: { holeSetId: 'pocket-holes', stretch: { kind: 'between', fromAnchor: 0, toAnchor: 1 } },
    b: { holeSetId: 'outer-holes', stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 } },
  };
  expect(seamVerdict(p, value)).toMatchObject({
    ok: true,
    countA: 27,
    countB: 27,
    severity: 'info',
    worstPair: 27,
    driftMm: expect.closeTo(99 - (97 + Math.PI / 2), 9),
  });
});

describe('a seam’s alignment marks, format 13 (9.13)', () => {
  it('round-trip which pairs are marked, and unknown fields on them, byte-identically', () => {
    for (const marks of [
      { kind: 'ends' as const },
      { kind: 'every' as const, n: 6 },
      { kind: 'every' as const, n: 3, future: 'kept' },
    ]) {
      const bytes = saveProject({ ...fixtureProjectV12(), seams: [{ ...seam, marks }] }, options);
      const loaded = loadProject(bytes);
      expect(loaded.manifest.formatVersion).toBe(13);
      expect(loaded.project.seams).toEqual([{ ...seam, marks }]);
      expect(saveProject(loaded.project, options)).toEqual(bytes);
    }
  });

  it('refuses marks that count no pairs, or of a kind this build does not know', () => {
    const p = fixtureProjectV12();
    for (const marks of [
      { kind: 'every', n: 0 },
      { kind: 'every', n: -2 },
      { kind: 'every', n: 1.5 },
      { kind: 'every' },
      { kind: 'nearest' },
    ])
      expect(ProjectSchema.safeParse({ ...p, seams: [{ ...seam, marks }] }).success).toBe(false);
  });
});
