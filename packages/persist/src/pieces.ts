import { DEFAULT_SETTINGS, type Part, type Seam } from '@leathercad/domain';

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
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new InvalidProjectFileError(
      `The copied pieces are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  checkJsonSize(raw);
  const { parts, seams } = (typeof raw === 'object' && raw !== null ? raw : {}) as {
    readonly parts?: unknown;
    readonly seams?: unknown;
  };

  const project = checkedProject({
    id: 'pieces',
    name: '',
    settings: DEFAULT_SETTINGS,
    parts,
    seams,
  });
  // A file keeps a seam whose holes are gone, and reports it (D2); a copy has
  // no reason to hold one, so one that does is not what was copied.
  const holeSets = new Set(project.parts.flatMap((part) => part.features.map((f) => f.id)));
  const pieceSeams = project.seams ?? [];
  if (
    pieceSeams.some((seam) => !holeSets.has(seam.a.holeSetId) || !holeSets.has(seam.b.holeSetId))
  ) {
    throw new InvalidProjectFileError('The copied pieces hold a seam to holes they do not hold.');
  }
  return { parts: project.parts, seams: pieceSeams };
}
