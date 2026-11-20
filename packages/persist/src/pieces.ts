import { DEFAULT_SETTINGS, type Feature, type Part, type Seam } from '@leathercad/domain';

import { checkJsonSize } from './archive.js';
import { InvalidProjectFileError, checkedProject } from './lcp.js';

/** Copied pieces (8.8b): whole parts as stored, and the seams sewn between them. */
export interface Pieces {
  readonly parts: readonly Part[];
  readonly seams: readonly Seam[];
}

/** Copied pieces as text, for the clipboard to hold. */
export function writePieces(pieces: Pieces): string {
  return JSON.stringify({ parts: pieces.parts, seams: pieces.seams });
}

/**
 * Copied pieces, read back from the clipboard.
 *
 * A trust boundary like a file (engineering practices, strict): the pieces are
 * checked exactly as a file's are — the schema, the size limits, the reference
 * graph, the seams — as a project holding only them, so a piece that follows
 * something it did not bring is refused here, not found later. Not migrated:
 * the clipboard lives as long as the app that wrote it.
 */
export function readPieces(text: string): Pieces {
  const { parts, seams } = parsed(text, 'pieces');
  return checkedPieces(parts, seams);
}

/** Copied features (8.8b-4): features as stored, and the seams between their hole sets. */
export interface Features {
  readonly features: readonly Feature[];
  readonly seams: readonly Seam[];
}

/** Copied features as text, for the clipboard to hold. */
export function writeFeatures(copied: Features): string {
  return JSON.stringify({ features: copied.features, seams: copied.seams });
}

/**
 * Copied features, read back from the clipboard: checked as `readPieces`
 * checks pieces, as one part holding them all — the piece they will be pasted
 * into. A copy of features never holds an outline, which stands for its piece,
 * so one that does is not what was copied.
 */
export function readFeatures(text: string): Features {
  const { features, seams } = parsed(text, 'features');
  const pieces = checkedPieces([{ id: 'features', name: '', quantity: 1, features }], seams);
  const read = pieces.parts[0]?.features ?? [];
  if (read.some((f) => f.kind === 'cut-contour' && f.role === 'outer')) {
    throw new InvalidProjectFileError('The copied features hold an outline.', {
      kind: 'not-the-copy',
    });
  }
  return { features: read, seams: pieces.seams };
}

function parsed(text: string, what: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new InvalidProjectFileError(
      `The copied ${what} are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { kind: 'not-the-copy' },
    );
  }
  checkJsonSize(raw);
  return (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
}

function checkedPieces(parts: unknown, seams: unknown): Pieces {
  const project = checkedProject({
    id: 'pieces',
    name: '',
    settings: DEFAULT_SETTINGS,
    parts,
    seams,
  });
  return {
    parts: project.parts,
    seams: checkedSeams(
      project.parts.flatMap((part) => part.features),
      project.seams ?? [],
    ),
  };
}

/**
 * A file keeps a seam whose holes are gone, and reports it (D2); a copy has no
 * reason to hold one, so one that does is not what was copied.
 */
function checkedSeams(features: readonly Feature[], seams: readonly Seam[]): readonly Seam[] {
  const holeSets = new Set(features.map((f) => f.id));
  if (seams.some((seam) => !holeSets.has(seam.a.holeSetId) || !holeSets.has(seam.b.holeSetId))) {
    throw new InvalidProjectFileError('The copied pieces hold a seam to holes they do not hold.', {
      kind: 'not-the-copy',
    });
  }
  return seams;
}
