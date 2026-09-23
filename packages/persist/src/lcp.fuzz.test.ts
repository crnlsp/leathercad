import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluate } from '@leathercad/domain';
import fc from 'fast-check';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { InvalidProjectFileError, loadProject } from './lcp.js';
import { NewerFormatError } from './migrations/index.js';

/**
 * The loader under hostile input.
 *
 * A `.lcp` file is a user's hours of work, and it can reach the loader damaged:
 * truncated by a full disk, edited by hand, written by a future version or by
 * a buggy one. `lcp.test.ts` names the damage it knows about. This file
 * generates damage nobody thought of, starting from every committed format
 * fixture, so the migration chain is exercised as well as the current schema.
 *
 * The contract being fuzzed is `loadProject`'s own: it **refuses with a
 * reason** — `InvalidProjectFileError` or `NewerFormatError` — or it returns a
 * project. A `TypeError` from deep inside a migration is neither. It reaches
 * the user as a crash instead of a sentence.
 *
 * And a project that loads must evaluate. The loader is the gate that lets
 * `evaluate` assume a sound document. Anything it lets through is a document
 * the rest of the app will be asked to draw.
 *
 * Known failure, roadmap slice 5.6: a stitch-hole `pitchMm` of `1e-300` passes
 * the schema and exhausts memory in `evaluate`. The CI seed does not reach it.
 * `LEATHERCAD_FC_RUNS=20000` does, and the nightly run reports it. When 5.6
 * lands, its named regression test goes in `lcp.test.ts`.
 */

const FORMAT_DIR = resolve(import.meta.dirname, '../../../fixtures/format');
const FIXTURES = readdirSync(FORMAT_DIR)
  .filter((name) => name.endsWith('.lcp'))
  .sort()
  .map((name) => ({ name, bytes: new Uint8Array(readFileSync(resolve(FORMAT_DIR, name))) }));

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonPath = readonly (string | number)[];

/** Every location in a JSON tree, root included. */
function pathsOf(value: Json, prefix: JsonPath = []): JsonPath[] {
  const here: JsonPath[] = [prefix];
  if (Array.isArray(value)) {
    value.forEach((child, index) => here.push(...pathsOf(child, [...prefix, index])));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value))
      here.push(...pathsOf(child, [...prefix, key]));
  }
  return here;
}

type Edit = { kind: 'replace'; value: Json } | { kind: 'delete' };

/** A copy of `root` with one edit applied at `path`. */
function edited(root: Json, path: JsonPath, edit: Edit): Json {
  if (path.length === 0) return edit.kind === 'replace' ? edit.value : null;
  const copy = structuredClone(root) as Record<string | number, Json>;
  let parent: Record<string | number, Json> = copy;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, Json>;
  const last = path[path.length - 1] as string | number;
  if (edit.kind === 'replace') {
    parent[last] = edit.value;
  } else if (Array.isArray(parent)) {
    parent.splice(last as number, 1);
  } else {
    delete parent[last];
  }
  return copy;
}

function entriesOf(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

function rezip(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries, { mtime: new Date('1980-01-01T00:00:00.000Z') });
}

/** Loads, and reports which of the three permitted outcomes happened. */
function outcome(bytes: Uint8Array): 'loaded' | 'refused' {
  try {
    const { project } = loadProject(bytes);
    evaluate(project);
    return 'loaded';
  } catch (error) {
    if (error instanceof InvalidProjectFileError || error instanceof NewerFormatError) {
      return 'refused';
    }
    throw error;
  }
}

const arbFixture = fc.constantFrom(...FIXTURES);

/** Values that stress a schema: wrong types, edge numbers, empty containers. */
const arbHostileJson: fc.Arbitrary<Json> = fc.oneof(
  fc.constantFrom<Json>(null, true, false, 0, -1, 1e308, -1e-308, '', [], {}, 'NaN'),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.string({ maxLength: 8 }),
  fc.jsonValue({ maxDepth: 2 }) as fc.Arbitrary<Json>,
);

const arbEdit: fc.Arbitrary<Edit> = fc.oneof(
  { weight: 3, arbitrary: arbHostileJson.map((value): Edit => ({ kind: 'replace', value })) },
  { weight: 1, arbitrary: fc.constant<Edit>({ kind: 'delete' }) },
);

describe('the loader under generated damage', () => {
  it('refuses arbitrary bytes with a reason', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        expect(outcome(bytes)).toBe('refused');
      }),
    );
  });

  it('never crashes on a committed file with bytes flipped', () => {
    fc.assert(
      fc.property(
        arbFixture,
        fc.array(fc.tuple(fc.nat(), fc.integer({ min: 1, max: 255 })), {
          minLength: 1,
          maxLength: 8,
        }),
        ({ bytes }, flips) => {
          const damaged = bytes.slice();
          for (const [offset, mask] of flips) {
            const at = offset % damaged.length;
            damaged[at] = (damaged[at] ?? 0) ^ mask;
          }
          outcome(damaged);
        },
      ),
    );
  });

  it('never crashes on a committed file cut short', () => {
    fc.assert(
      fc.property(arbFixture, fc.nat(), ({ bytes }, cut) => {
        expect(outcome(bytes.slice(0, cut % bytes.length))).toBe('refused');
      }),
    );
  });

  it('never crashes when one value in document.json is replaced or removed', () => {
    fc.assert(
      fc.property(
        arbFixture.chain((fixture) => {
          const entries = entriesOf(fixture.bytes);
          const document = JSON.parse(strFromU8(entries['document.json']!)) as Json;
          return fc.tuple(
            fc.constant(entries),
            fc.constant(document),
            fc.constantFrom(...pathsOf(document)),
            arbEdit,
          );
        }),
        ([entries, document, path, edit]) => {
          const damaged = rezip({
            ...entries,
            'document.json': strToU8(JSON.stringify(edited(document, path, edit))),
          });
          outcome(damaged);
        },
      ),
    );
  });

  it('never crashes when one value in manifest.json is replaced or removed', () => {
    fc.assert(
      fc.property(
        arbFixture.chain((fixture) => {
          const entries = entriesOf(fixture.bytes);
          const manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as Json;
          return fc.tuple(
            fc.constant(entries),
            fc.constant(manifest),
            fc.constantFrom(...pathsOf(manifest)),
            arbEdit,
          );
        }),
        ([entries, manifest, path, edit]) => {
          const damaged = rezip({
            ...entries,
            'manifest.json': strToU8(JSON.stringify(edited(manifest, path, edit))),
          });
          outcome(damaged);
        },
      ),
    );
  });

  it('never crashes when a file claims a different format version', () => {
    // An old document labelled new skips its migrations; a new one labelled
    // old runs migrations over data they were never written for.
    fc.assert(
      fc.property(arbFixture, fc.integer({ min: -2, max: 12 }), ({ bytes }, version) => {
        const entries = entriesOf(bytes);
        const manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as Record<string, Json>;
        const damaged = rezip({
          ...entries,
          'manifest.json': strToU8(JSON.stringify({ ...manifest, formatVersion: version })),
        });
        outcome(damaged);
      }),
    );
  });
});
