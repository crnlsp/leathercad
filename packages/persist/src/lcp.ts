import { ResourceLimitError } from '@leathercad/core';
import type { Project } from '@leathercad/domain';
import { zipSync, strToU8, strFromU8 } from 'fflate';

import {
  checkProjectSize,
  graphProblems,
  partStructureProblems,
  seamStructureProblems,
  type Problem,
} from '@leathercad/domain';

import { checkJsonSize, readArchive } from './archive.js';
import { CURRENT_FORMAT_VERSION, NewerFormatError, migrate } from './migrations/index.js';
import { ManifestSchema, ProjectSchema, type Manifest } from './schema.js';

export const LCP_MIME = 'application/vnd.leathercad.project';
export const LCP_EXTENSION = 'lcp';

/** The earliest date the ZIP format can encode. */
const ZIP_EPOCH = new Date('1980-01-01T00:00:00.000Z');

const MIMETYPE_ENTRY = 'mimetype';
const MANIFEST_ENTRY = 'manifest.json';
const DOCUMENT_ENTRY = 'document.json';

export interface SaveOptions {
  readonly applicationVersion: string;
  /** Injected rather than read from the clock, so saves are reproducible. */
  readonly now: () => Date;
  readonly createdUtc?: string;
}

/**
 * Why a file was refused, as a fact the app puts into the maker's words
 * (ADR 0018). The error's message says the same in English, for a log and a
 * test, and never reaches the screen.
 */
export type FileRefusal =
  /** The bytes are not a ZIP archive: another kind of file, or one cut short. */
  | { readonly kind: 'not-an-archive' }
  /** An archive, but its `mimetype` names something other than a project. */
  | { readonly kind: 'not-a-project' }
  /** An archive without one of the entries a project has. */
  | { readonly kind: 'entry-missing'; readonly entry: string }
  /** An entry that is not JSON. */
  | { readonly kind: 'not-json'; readonly entry: string }
  /** JSON that breaks the format's schema; `where` holds the first paths, as `parts[2].name`. */
  | { readonly kind: 'schema'; readonly entry: string; readonly where: readonly string[] }
  /** A design whose reference graph is broken: the error's `problems` say how. */
  | { readonly kind: 'design' }
  /** A copy on the clipboard that is not what was copied (`readPieces`, `readFeatures`). */
  | { readonly kind: 'not-the-copy' };

export class InvalidProjectFileError extends Error {
  /**
   * `problems` are the design's, when its reference graph is what is broken
   * (`refusal.kind` is `design`); empty for a file broken below that.
   */
  constructor(
    message: string,
    readonly refusal: FileRefusal,
    readonly problems: readonly Problem[] = [],
  ) {
    super(message);
    this.name = 'InvalidProjectFileError';
  }
}

/**
 * Writes a `.lcp` archive.
 *
 * Stores **parameters only** — no paths, no hole positions, no bounding boxes.
 * Evaluation recomputes all of it on load, which keeps files small, keeps them
 * free of stale data, and means an improved algorithm improves every existing
 * file. See CLAUDE.md invariant 4.
 */
export function saveProject(project: Project, options: SaveOptions): Uint8Array {
  const timestamp = options.now().toISOString();
  const manifest: Manifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    application: 'LeatherCAD',
    applicationVersion: options.applicationVersion,
    createdUtc: options.createdUtc ?? timestamp,
    modifiedUtc: timestamp,
  };

  return zipSync(
    {
      // Stored uncompressed and first, the ODF convention: it lets `file(1)`
      // and desktop environments identify the format from the opening bytes
      // without unzipping.
      [MIMETYPE_ENTRY]: [strToU8(LCP_MIME), { level: 0 }],
      [MANIFEST_ENTRY]: strToU8(stableJson(manifest)),
      [DOCUMENT_ENTRY]: strToU8(stableJson(project)),
    },
    // A fixed entry timestamp keeps the archive byte-identical across saves
    // of an unchanged document, so .lcp files diff cleanly in git. The real
    // save time lives in the manifest, where it is readable. ZIP only encodes
    // dates from 1980, so that is the epoch used here.
    { mtime: ZIP_EPOCH },
  );
}

export interface LoadedProject {
  readonly project: Project;
  readonly manifest: Manifest;
}

/**
 * Reads a `.lcp` archive.
 *
 * Recovers where recovery is unambiguous and refuses where it is not. A user's
 * project is hours of their work, so every failure names what is wrong rather
 * than saying "invalid file".
 */
export function loadProject(bytes: Uint8Array): LoadedProject {
  let entries: Record<string, Uint8Array>;
  try {
    entries = readArchive(bytes, [MIMETYPE_ENTRY, MANIFEST_ENTRY, DOCUMENT_ENTRY]);
  } catch (error) {
    if (error instanceof ResourceLimitError) throw error;
    throw new InvalidProjectFileError(
      `Not a readable .lcp archive: ${error instanceof Error ? error.message : String(error)}`,
      { kind: 'not-an-archive' },
    );
  }

  const mimetype = entries[MIMETYPE_ENTRY];
  if (mimetype !== undefined && strFromU8(mimetype).trim() !== LCP_MIME) {
    throw new InvalidProjectFileError(
      `Not a LeatherCAD project: mimetype reads "${strFromU8(mimetype).trim()}".`,
      { kind: 'not-a-project' },
    );
  }

  const manifest = parseEntry(entries, MANIFEST_ENTRY, ManifestSchema);
  const rawDocument = parseJson(entries, DOCUMENT_ENTRY);
  checkJsonSize(rawDocument);

  // Refused here rather than in `migrate`, which sees only the document: the
  // manifest says which version saved the file, and that is the version the
  // maker needs to update to.
  if (manifest.formatVersion > CURRENT_FORMAT_VERSION) {
    throw new NewerFormatError(manifest.formatVersion, manifest.applicationVersion);
  }

  // Migrate before validating: an old file is invalid against the current
  // schema by definition, so checking first would reject exactly the files
  // migrations exist to rescue.
  const migrated = migrate(rawDocument, manifest.formatVersion);

  return { project: checkedProject(migrated), manifest };
}

/**
 * The checks every project the app holds has passed: the schema, then its
 * reference graph. What a file is refused for, and a pasted piece too.
 */
export function checkedProject(raw: unknown): Project {
  const result = ProjectSchema.safeParse(raw);
  if (!result.success) throw schemaRefusal(DOCUMENT_ENTRY, result.error);

  // The schema checks the shape of the file; this checks its reference graph
  // (S1–S4). A file can satisfy one and break the other, and everything past
  // this point assumes a sound graph — so a broken one is refused here, naming
  // the feature, rather than found later as a stitch line following nothing.
  checkProjectSize(result.data as Project);
  const problems = [
    ...graphProblems(result.data as Project),
    // S5 and S6: one outline per part, and outlines that enclose something.
    ...partStructureProblems(result.data as Project),
    ...seamStructureProblems(result.data as Project),
  ];
  if (problems.length > 0) {
    throw new InvalidProjectFileError(
      `document.json is not valid: ${problems.map(named).join('; ')}`,
      { kind: 'design' },
      problems,
    );
  }
  return result.data as Project;
}

/** A problem for the log: its code, and the feature or part it is about. */
function named(p: Problem): string {
  const facts = p.facts as Partial<Record<'featureName' | 'partName', string>>;
  const name = facts.featureName ?? facts.partName;
  return name === undefined ? p.code : `${p.code} (${name})`;
}

/** Reads only the manifest — cheap, and enough for a version check. */
export function readManifest(bytes: Uint8Array): Manifest {
  const entries = readArchive(bytes, [MANIFEST_ENTRY]);
  return parseEntry(entries, MANIFEST_ENTRY, ManifestSchema);
}

function parseJson(entries: Record<string, Uint8Array>, name: string): unknown {
  const raw = entries[name];
  if (raw === undefined) {
    throw new InvalidProjectFileError(`The archive has no ${name}.`, {
      kind: 'entry-missing',
      entry: name,
    });
  }
  try {
    return JSON.parse(strFromU8(raw));
  } catch (error) {
    throw new InvalidProjectFileError(
      `${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { kind: 'not-json', entry: name },
    );
  }
}

function parseEntry<T>(
  entries: Record<string, Uint8Array>,
  name: string,
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
  },
): T {
  const result = schema.safeParse(parseJson(entries, name));
  if (!result.success) throw schemaRefusal(name, result.error);
  return result.data;
}

interface Issue {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
}

/**
 * A refusal naming where the schema broke.
 *
 * "parts[2].features[0].source.width" tells someone what to fix; "invalid
 * file" tells them to give up. The path is a fact; zod's own words about it
 * stay in the message, for the log.
 */
function schemaRefusal(entry: string, error: unknown): InvalidProjectFileError {
  const issues = ((error as { issues?: readonly Issue[] }).issues ?? []).slice(0, 5);
  const where = issues.map((issue) =>
    issue.path
      .map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`))
      .join('')
      .replace(/^\./, ''),
  );
  const said =
    issues.length === 0
      ? String(error)
      : issues
          .map((issue, i) => (where[i] === '' ? issue.message : `${where[i]}: ${issue.message}`))
          .join('; ');
  return new InvalidProjectFileError(`${entry} is not valid: ${said}`, {
    kind: 'schema',
    entry,
    where: where.filter((path) => path !== ''),
  });
}

/**
 * JSON with sorted keys and bounded precision.
 *
 * Stable ordering plus the 1e-4 mm input quantisation makes saving an
 * unmodified document byte-identical, which is what lets `.lcp` files diff
 * usefully in git. See docs/file-format.md §3.2.
 *
 * **Except stored paths and guides, which are written exactly.** Guide angles
 * must not tilt on a save. Other parameters are typed and
 * quantised, so six decimals loses nothing from them. A path — drawn with arcs
 * in it, or frozen from a rounded shape — is geometry, and its arcs are stored
 * as a centre, a radius and angles: rounded, they came back micrometres off
 * the neighbouring line and a millionth of a radian off its tangent, which the
 * stitch-line offset reads as a concave corner and refuses. Written exactly —
 * JavaScript's shortest round-trip form — a path comes back as the same doubles,
 * and an unchanged document still saves byte-identically.
 */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, replacer, 2)}\n`;
}

/** A number the replacer passes through as it is, rather than rounding it. */
class Exact {
  constructor(readonly value: number) {}
}

/** Every number in a stored path's segments, marked to be written exactly. */
function exactly(value: unknown): unknown {
  if (typeof value === 'number') return new Exact(value);
  if (Array.isArray(value)) return value.map(exactly);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, exactly(inner)]));
  }
  return value;
}

function replacer(key: string, value: unknown): unknown {
  if (value instanceof Exact) return value.value;
  if ((key === 'segments' || key === 'guides') && Array.isArray(value)) return exactly(value);
  if (typeof value === 'number') {
    // Six decimals is well below the storage quantum and removes the trailing
    // noise that floating point leaves behind.
    return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = (value as Record<string, unknown>)[key];
    }
    return sorted;
  }
  return value;
}
