import type { Project } from '@leathercad/domain';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

import { CURRENT_FORMAT_VERSION, migrate } from './migrations/index.js';
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

export class InvalidProjectFileError extends Error {
  constructor(message: string) {
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
    entries = unzipSync(bytes);
  } catch (error) {
    throw new InvalidProjectFileError(
      `Not a readable .lcp archive: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const mimetype = entries[MIMETYPE_ENTRY];
  if (mimetype !== undefined && strFromU8(mimetype).trim() !== LCP_MIME) {
    throw new InvalidProjectFileError(
      `Not a LeatherCAD project: mimetype reads "${strFromU8(mimetype).trim()}".`,
    );
  }

  const manifest = parseEntry(entries, MANIFEST_ENTRY, ManifestSchema, 'manifest');
  const rawDocument = parseJson(entries, DOCUMENT_ENTRY);

  // Migrate before validating: an old file is invalid against the current
  // schema by definition, so checking first would reject exactly the files
  // migrations exist to rescue.
  const migrated = migrate(rawDocument, manifest.formatVersion);

  const result = ProjectSchema.safeParse(migrated);
  if (!result.success) {
    throw new InvalidProjectFileError(`document.json is not valid: ${describe(result.error)}`);
  }

  return { project: result.data as Project, manifest };
}

/** Reads only the manifest — cheap, and enough for a version check. */
export function readManifest(bytes: Uint8Array): Manifest {
  const entries = unzipSync(bytes);
  return parseEntry(entries, MANIFEST_ENTRY, ManifestSchema, 'manifest');
}

function parseJson(entries: Record<string, Uint8Array>, name: string): unknown {
  const raw = entries[name];
  if (raw === undefined) {
    throw new InvalidProjectFileError(`The archive has no ${name}.`);
  }
  try {
    return JSON.parse(strFromU8(raw));
  } catch (error) {
    throw new InvalidProjectFileError(
      `${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseEntry<T>(
  entries: Record<string, Uint8Array>,
  name: string,
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
  },
  label: string,
): T {
  const result = schema.safeParse(parseJson(entries, name));
  if (!result.success) {
    throw new InvalidProjectFileError(`The ${label} is not valid: ${describe(result.error)}`);
  }
  return result.data;
}

/**
 * A path-qualified message.
 *
 * "parts[2].features[0].source.width: expected number, received string" tells
 * someone what to fix; "invalid file" tells them to give up.
 */
function describe(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> })
    .issues;
  if (issues === undefined || issues.length === 0) return String(error);

  return issues
    .slice(0, 5)
    .map((issue) => {
      const where = issue.path
        .map((part) => (typeof part === 'number' ? `[${part}]` : `.${part}`))
        .join('')
        .replace(/^\./, '');
      return where === '' ? issue.message : `${where}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * JSON with sorted keys and bounded precision.
 *
 * Stable ordering plus the 1e-4 mm input quantisation makes saving an
 * unmodified document byte-identical, which is what lets `.lcp` files diff
 * usefully in git. See docs/file-format.md §3.2.
 */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, replacer, 2)}\n`;
}

function replacer(_key: string, value: unknown): unknown {
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
