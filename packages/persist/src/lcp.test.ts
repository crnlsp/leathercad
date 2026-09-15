import { DEFAULT_SETTINGS, evaluate, type Project } from '@leathercad/domain';
import { PathOps, uniformRadii } from '@leathercad/geometry';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject, readManifest, saveProject } from './lcp.js';
import { CURRENT_FORMAT_VERSION, NewerFormatError } from './migrations/index.js';

const FIXED_CLOCK = (): Date => new Date('2026-09-04T10:00:00.000Z');
const options = { applicationVersion: '0.0.0', now: FIXED_CLOCK };

function sampleProject(): Project {
  return {
    id: 'proj-1',
    name: 'Card holder',
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part-1',
        name: 'Outer panel',
        quantity: 2,
        features: [
          {
            id: 'feat-1',
            kind: 'cut-contour',
            role: 'outer',
            name: 'Outline',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: {
                type: 'rect',
                origin: { x: 0, y: 0 },
                width: 105,
                height: 75,
                radii: uniformRadii(8),
                rotation: 0,
              },
            },
          },
          {
            id: 'feat-2',
            kind: 'fold-line',
            direction: 'valley',
            name: 'Spine',
            visible: true,
            locked: false,
            source: {
              kind: 'path',
              path: PathOps.polyline(
                [
                  { x: 52.5, y: 0 },
                  { x: 52.5, y: 75 },
                ],
                false,
              ),
            },
          },
        ],
      },
    ],
  };
}

describe('round trip', () => {
  it('restores the project exactly', () => {
    const project = sampleProject();
    expect(loadProject(saveProject(project, options)).project).toEqual(project);
  });

  it('reproduces identical geometry after a save and load', () => {
    // This is what proves it is safe not to store derived geometry: the
    // parameters alone must regenerate the same paths.
    const project = sampleProject();
    const before = evaluate(project);
    const after = evaluate(loadProject(saveProject(project, options)).project);

    const lengths = (r: ReturnType<typeof evaluate>): number[] =>
      r.parts.flatMap((p) => p.features).flatMap((f) => (f.ok ? [PathOps.length(f.path)] : []));

    expect(lengths(after)).toEqual(lengths(before));
  });

  it('survives an empty project', () => {
    const empty: Project = { id: 'p', name: '', settings: DEFAULT_SETTINGS, parts: [] };
    expect(loadProject(saveProject(empty, options)).project).toEqual(empty);
  });
});

describe('the archive itself', () => {
  it('stores no geometry, only parameters', () => {
    // CLAUDE.md invariant 4. A saved rectangle is width and height, not a
    // list of segments.
    const entries = unzipSync(saveProject(sampleProject(), options));
    const document = strFromU8(entries['document.json']!);

    expect(document).toContain('"width": 105');
    // The freehand fold line legitimately stores its path; the rectangle
    // must not have gained one.
    const rectSection = document.slice(0, document.indexOf('fold-line'));
    expect(rectSection).not.toContain('segments');
  });

  it('puts an uncompressed mimetype first, so file(1) can identify it', () => {
    const bytes = saveProject(sampleProject(), options);
    const header = strFromU8(bytes.slice(0, 200));
    expect(header).toContain('mimetype');
    expect(header).toContain('application/vnd.leathercad.project');
  });

  it('is byte-identical when saving the same document twice', () => {
    // Stable key order and a fixed archive timestamp are what make .lcp files
    // diff usefully in git.
    const project = sampleProject();
    const a = saveProject(project, options);
    const b = saveProject(project, options);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('records the format version in a manifest readable on its own', () => {
    const manifest = readManifest(saveProject(sampleProject(), options));
    expect(manifest.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(manifest.application).toBe('LeatherCAD');
    expect(manifest.modifiedUtc).toBe('2026-09-04T10:00:00.000Z');
  });

  it('takes its timestamp from an injected clock', () => {
    // Nothing in a serialisation path may call Date.now directly, or saves
    // stop being reproducible. See docs/testing.md §8.
    const later = saveProject(sampleProject(), {
      ...options,
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });
    expect(readManifest(later).modifiedUtc).toBe('2030-01-01T00:00:00.000Z');
  });
});

/** Builds an archive by hand, for the cases a correct save cannot produce. */
function archive(document: unknown, formatVersion = 1): Uint8Array {
  return zipSync({
    mimetype: [strToU8('application/vnd.leathercad.project'), { level: 0 }],
    'manifest.json': strToU8(
      JSON.stringify({
        formatVersion,
        application: 'LeatherCAD',
        applicationVersion: '0',
        createdUtc: '2026-01-01T00:00:00.000Z',
        modifiedUtc: '2026-01-01T00:00:00.000Z',
      }),
    ),
    'document.json': strToU8(JSON.stringify(document)),
  });
}

/** The sample project with one feature's source replaced. */
function withBrokenSource(source: unknown): unknown {
  const project = structuredClone(sampleProject()) as unknown as Record<string, unknown>;
  const parts = project['parts'] as Array<Record<string, unknown>>;
  (parts[0]!['features'] as Array<Record<string, unknown>>)[0]!['source'] = source;
  return project;
}

describe('rejecting bad input', () => {
  it('refuses a file from a newer version instead of guessing', () => {
    // Silently dropping fields we do not recognise would hand the user back a
    // quietly damaged project.
    const bytes = archive(sampleProject(), CURRENT_FORMAT_VERSION + 5);
    expect(() => loadProject(bytes)).toThrow(NewerFormatError);
    expect(() => loadProject(bytes)).toThrow(/newer version/i);
  });

  it('rejects something that is not a ZIP at all', () => {
    expect(() => loadProject(new Uint8Array([1, 2, 3, 4]))).toThrow(InvalidProjectFileError);
  });

  it('rejects an archive with no document', () => {
    const bytes = zipSync({ 'manifest.json': strToU8('{}') });
    expect(() => loadProject(bytes)).toThrow(InvalidProjectFileError);
  });

  it('names the field when the document is malformed', () => {
    // "invalid file" tells someone to give up; a path tells them what to fix.
    const bytes = archive(
      withBrokenSource({
        kind: 'shape',
        shape: {
          type: 'rect',
          origin: { x: 0, y: 0 },
          width: 'wide',
          height: 75,
          radii: uniformRadii(8),
        },
      }),
    );
    expect(() => loadProject(bytes)).toThrow(/parts\[0\]\.features\[0\]/);
  });

  it('rejects a null coordinate rather than reading it as zero', () => {
    // JSON cannot hold NaN, so null is how a corrupted number arrives.
    const bytes = archive(
      withBrokenSource({
        kind: 'shape',
        shape: {
          type: 'rect',
          origin: { x: null, y: 0 },
          width: 105,
          height: 75,
          radii: uniformRadii(8),
        },
      }),
    );
    expect(() => loadProject(bytes)).toThrow(InvalidProjectFileError);
  });

  it('rejects a coordinate beyond the documented working range', () => {
    const bytes = archive(
      withBrokenSource({
        kind: 'shape',
        shape: {
          type: 'rect',
          origin: { x: 1e9, y: 0 },
          width: 105,
          height: 75,
          radii: uniformRadii(8),
        },
      }),
    );
    expect(() => loadProject(bytes)).toThrow(/limit/);
  });

  it('rejects a quantity below one', () => {
    const project = structuredClone(sampleProject()) as unknown as Record<string, unknown>;
    (project['parts'] as Array<Record<string, unknown>>)[0]!['quantity'] = 0;
    expect(() => loadProject(archive(project))).toThrow(/quantity/);
  });
});

describe('arcs', () => {
  it('round-trips an arbitrary angle to within the serialiser’s six decimals', () => {
    // Real arcs come from three clicked points, so their angles are arbitrary
    // floats rather than round numbers. `stableJson` rounds every number to
    // six decimals; on an angle that is 1e-6 rad, which is 3e-4 mm at a 300 mm
    // radius — larger than the 1e-4 mm storage quantum, and far below anything
    // that can be cut, marked or measured in leather. Recorded here so the
    // limit is a known property of the format rather than a surprise.
    const project: Project = {
      id: 'p',
      name: 'Arc',
      settings: DEFAULT_SETTINGS,
      parts: [
        {
          id: 'part-1',
          name: 'Curve',
          quantity: 1,
          features: [
            {
              id: 'feat-1',
              kind: 'marking-line',
              purpose: 'alignment',
              name: 'Line',
              visible: true,
              locked: false,
              source: {
                kind: 'shape',
                shape: {
                  type: 'arc',
                  centre: { x: 3, y: 4 },
                  radius: 18,
                  startAngle: Math.PI / 7,
                  sweepAngle: Math.PI / 3,
                },
              },
            },
          ],
        },
      ],
    };

    const loaded = loadProject(saveProject(project, options));
    const source = loaded.project.parts[0]?.features[0]?.source;
    const shape = source?.kind === 'shape' ? source.shape : null;

    expect(shape?.type).toBe('arc');
    if (shape?.type !== 'arc') return;
    expect(shape.startAngle).toBeCloseTo(Math.PI / 7, 6);
    expect(shape.sweepAngle).toBeCloseTo(Math.PI / 3, 6);
    expect(shape.radius).toBe(18);
  });
});

describe('a fold line', () => {
  it('keeps a changed direction and a set thickness across a save and load', () => {
    // Valley is the default, so a round trip of a valley fold proves nothing
    // about whether a *change* is kept. Mountain, with a thickness, does.
    const project = sampleProject();
    const [part] = project.parts;
    const changed = {
      ...project,
      parts: [
        {
          ...part!,
          features: part!.features.map((f) =>
            f.kind === 'fold-line'
              ? { ...f, direction: 'mountain' as const, materialThicknessMm: 1.2 }
              : f,
          ),
        },
      ],
    };

    expect(loadProject(saveProject(changed, options)).project).toEqual(changed);
  });

  it('comes back with no thickness at all when none was set, rather than a zero', () => {
    const loaded = loadProject(saveProject(sampleProject(), options)).project;
    const fold = loaded.parts[0]!.features.find((f) => f.kind === 'fold-line')!;

    // `toEqual` treats a missing key and an `undefined` one as the same, so the
    // absence is asserted directly: the panel shows blank only if the key is gone.
    expect(Object.keys(fold)).not.toContain('materialThicknessMm');
  });
});

describe('loading a project whose reference graph is broken', () => {
  type AnyFeature = Project['parts'][number]['features'][number];

  function withFeatures(extra: AnyFeature[]): Uint8Array {
    const project = sampleProject();
    const [part] = project.parts;
    return saveProject(
      { ...project, parts: [{ ...part!, features: [...part!.features, ...extra] }] },
      options,
    );
  }

  const stitchFrom = (id: string, name: string, sourceId: string): AnyFeature => ({
    id,
    kind: 'stitch-line',
    name,
    visible: true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId,
      op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
    },
  });

  // Every case below satisfies the schema. What breaks is the graph, and the
  // loader is the only thing between a hand-edited or corrupted file and a
  // document the rest of the code assumes is sound (S2–S4).

  it('refuses a feature that follows something that does not exist, naming it', () => {
    const bytes = withFeatures([stitchFrom('s1', 'Orphan stitch', 'nowhere')]);
    expect(() => loadProject(bytes)).toThrow(InvalidProjectFileError);
    expect(() => loadProject(bytes)).toThrow(/Orphan stitch.*does not exist/);
  });

  it('refuses a loop', () => {
    const bytes = withFeatures([stitchFrom('a', 'Loop A', 'b'), stitchFrom('b', 'Loop B', 'a')]);
    expect(() => loadProject(bytes)).toThrow(/leads back to itself/);
  });

  it('refuses a derivation the compatibility table does not allow', () => {
    const bytes = withFeatures([
      {
        id: 'h',
        kind: 'stitch-hole-set',
        name: 'Holes on an outline',
        visible: true,
        locked: false,
        source: {
          kind: 'derived',
          sourceId: 'feat-1',
          op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' },
        },
      },
    ]);
    expect(() => loadProject(bytes)).toThrow(/Holes on an outline.*stitch line/);
  });

  it('refuses two features sharing an id', () => {
    const outline = sampleProject().parts[0]!.features[0]!;
    const bytes = withFeatures([{ ...outline, name: 'Copy' }]);
    expect(() => loadProject(bytes)).toThrow(/share the id feat-1/);
  });
});

describe('a frozen feature', () => {
  it('keeps what it was frozen from across a save and load', () => {
    const project = sampleProject();
    const [part] = project.parts;
    const frozen = {
      ...project,
      parts: [
        {
          ...part!,
          features: part!.features.map((f) =>
            f.kind === 'fold-line' ? { ...f, frozenFrom: 'Outline' } : f,
          ),
        },
      ],
    };

    expect(loadProject(saveProject(frozen, options)).project).toEqual(frozen);
  });
});
