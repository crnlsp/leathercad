import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluate, resolvedFeatures } from '@leathercad/domain';
import fc from 'fast-check';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject, saveProject, stableJson } from './lcp.js';
import { CURRENT_FORMAT_VERSION } from './migrations/index.js';

/**
 * Unknown-field preservation (file-format.md §4.3, the rest of slice 5.2).
 *
 * A newer build may write an optional field this one has never heard of — a
 * grain direction on a part, a note on the project. Opening the file here and
 * saving it must not delete it: before this slice the schema stripped every
 * key it did not know, so a save alone damaged the file.
 */

const CURRENT = resolve(
  import.meta.dirname,
  `../../../fixtures/format/v${String(CURRENT_FORMAT_VERSION)}.lcp`,
);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

/** The current fixture's document, as plain JSON to be edited. */
function fixtureDocument(): JsonObject {
  const entries = unzipSync(new Uint8Array(readFileSync(CURRENT)));
  return JSON.parse(strFromU8(entries['document.json']!)) as JsonObject;
}

/** An archive at the current version around a document written as the app writes it. */
function archiveOf(documentText: string): Uint8Array {
  return zipSync({
    mimetype: [strToU8('application/vnd.leathercad.project'), { level: 0 }],
    'manifest.json': strToU8(
      stableJson({
        formatVersion: CURRENT_FORMAT_VERSION,
        application: 'LeatherCAD',
        applicationVersion: '99.0.0',
        createdUtc: '2026-01-01T00:00:00.000Z',
        modifiedUtc: '2026-01-01T00:00:00.000Z',
      }),
    ),
    'document.json': strToU8(documentText),
  });
}

/** Open, then save with no edits — all a maker needs to do to damage a file. */
function openAndSave(bytes: Uint8Array): string {
  const { project, manifest } = loadProject(bytes);
  const saved = saveProject(project, {
    applicationVersion: '0.0.0',
    createdUtc: manifest.createdUtc,
    now: () => new Date('2026-09-23T00:00:00.000Z'),
  });
  return strFromU8(unzipSync(saved)['document.json']!);
}

const features = (document: JsonObject) =>
  ((document['parts'] as JsonObject[])[0]!['features'] as JsonObject[]) ?? [];

/** The document with an unknown key on each level a newer build might extend. */
function withUnknownFieldsEverywhere(): JsonObject {
  const document = fixtureDocument();
  document['zNote'] = 'written by a newer build';
  (document['settings'] as JsonObject)['zUnits'] = 'mm';
  (document['parts'] as JsonObject[])[0]!['zGrain'] = { angleDeg: 90, locked: true };

  const all = features(document);
  all[0]!['zLayer'] = 3;
  const shaped = all.find((f) => (f['source'] as JsonObject)['kind'] === 'shape')!;
  (shaped['source'] as JsonObject)['zSource'] = true;
  ((shaped['source'] as JsonObject)['shape'] as JsonObject)['zSkew'] = 0.5;
  const derived = all.find((f) => (f['source'] as JsonObject)['kind'] === 'derived')!;
  ((derived['source'] as JsonObject)['op'] as JsonObject)['zBevel'] = [1, 2, 3];
  return document;
}

describe('unknown fields', () => {
  it('survive opening and saving, on every level, byte for byte', () => {
    const text = stableJson(withUnknownFieldsEverywhere());
    const saved = openAndSave(archiveOf(text));

    expect(saved).toBe(text);
    for (const key of ['zNote', 'zUnits', 'zGrain', 'zLayer', 'zSource', 'zSkew', 'zBevel']) {
      expect(saved, key).toContain(`"${key}"`);
    }
  });

  it('survive wherever a newer build put them — any object in the document', () => {
    const document = fixtureDocument();
    const objects = objectPaths(document);

    fc.assert(
      fc.property(
        fc.constantFrom(...objects),
        fc.stringMatching(/^z[A-Za-z0-9]{1,12}$/),
        fc.jsonValue({ maxDepth: 2 }),
        (path, key, value) => {
          const edited = structuredClone(document);
          const target = at(edited, path);
          fc.pre(!(key in target));
          target[key] = value as Json;

          const text = stableJson(edited);
          return openAndSave(archiveOf(text)) === text;
        },
      ),
      { numRuns: 60 },
    );
  });

  it('change nothing that is drawn', () => {
    const plain = loadProject(archiveOf(stableJson(fixtureDocument()))).project;
    const extended = loadProject(archiveOf(stableJson(withUnknownFieldsEverywhere()))).project;

    const geometry = (project: typeof plain) =>
      [...resolvedFeatures(evaluate(project))].map((f) => [f.feature.id, f.path, f.holes]);
    expect(geometry(extended)).toEqual(geometry(plain));
  });

  it('never honour a __proto__ key a file tries to plant', () => {
    // JSON.parse keeps "__proto__" as an ordinary key; a schema that copied it
    // with assignment would give the feature a prototype with a frozenFrom it
    // never had. The loose schema drops it instead.
    const text = stableJson(fixtureDocument()).replace(
      '"id": "cut-1",',
      '"__proto__": { "frozenFrom": "Planted", "polluted": true }, "id": "cut-1",',
    );
    expect(text).toContain('"__proto__"');

    const feature = loadProject(archiveOf(text)).project.parts[0]!.features[0]! as unknown as {
      frozenFrom?: string;
      polluted?: boolean;
    };
    expect(Object.getPrototypeOf(feature)).toBe(Object.prototype);
    expect(feature.frozenFrom).toBeUndefined();
    expect(feature.polluted).toBeUndefined();
    expect(openAndSave(archiveOf(text))).not.toContain('__proto__');
  });

  it('never excuse a known field that is wrong', () => {
    const document = withUnknownFieldsEverywhere();
    features(document)[0]!['visible'] = 'yes';
    expect(() => loadProject(archiveOf(stableJson(document)))).toThrow(InvalidProjectFileError);
    expect(() => loadProject(archiveOf(stableJson(document)))).toThrow(/visible/);
  });
});

/** Every object in a JSON tree, by path. Arrays are walked, not collected. */
function objectPaths(value: Json, prefix: (string | number)[] = []): (string | number)[][] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => objectPaths(child, [...prefix, index]));
  }
  if (value === null || typeof value !== 'object') return [];
  return [
    prefix,
    ...Object.entries(value).flatMap(([key, child]) => objectPaths(child, [...prefix, key])),
  ];
}

function at(root: JsonObject, path: (string | number)[]): JsonObject {
  let node: Json = root;
  for (const step of path) node = (node as Record<string | number, Json>)[step]!;
  return node as JsonObject;
}
