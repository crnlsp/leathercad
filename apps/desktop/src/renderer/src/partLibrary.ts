import { copyPieces, emptyProject, type Command } from '@leathercad/document';
import type { PartId, Project } from '@leathercad/domain';
import { writePieces } from '@leathercad/persist';

import { pasteCommand, type Copied } from './piecesClipboard.js';
import type { Copies } from './stepAndRepeat.js';

/** The tag a template saved from pieces carries, so the picker's search finds it (9.7). */
export const PIECE_TAG = 'piece';

/** Pieces of a project as 8.8b copies them, and what the copy could not take as it was. */
function lifted(project: Project, partIds: readonly PartId[]) {
  const { pieces, frozen, dropped } = copyPieces(project, partIds);
  const copied: Copied = {
    clipboard: { kind: 'pieces', text: writePieces(pieces), count: pieces.parts.length },
    frozen,
    dropped,
  };
  return { pieces, copied };
}

/**
 * *Save as template…* for pieces (9.7, D5): a project holding only them, as
 * *Copy* lifts them — every reference out of them resolved — in the settings
 * they were drawn in. Their ids are kept: inserting gives fresh ones.
 */
export function pieceTemplate(
  project: Project,
  partIds: readonly PartId[],
  id: string,
  name: string,
): { project: Project; copied: Copied } {
  const { pieces, copied } = lifted(project, partIds);
  return {
    project: {
      ...emptyProject(id, name),
      settings: project.settings,
      parts: pieces.parts,
      ...(pieces.seams.length === 0 ? {} : { seams: pieces.seams }),
    },
    copied,
  };
}

/**
 * *Insert pieces from template…* (9.7): a template's chosen pieces, copied and
 * pasted as 8.8b pastes — fresh ids, references re-pointed, seams between them
 * kept, clear of the drawing — one undo step named for what the maker did.
 */
export function insertPieces(
  template: Project,
  partIds: readonly PartId[],
  nextId: () => string,
): { command: Command; copies: Copies & { kind: 'pieces' }; copied: Copied } {
  const { copied: copy } = lifted(template, partIds);
  const { command, partIds: made } = pasteCommand(copy.clipboard, nextId, null);
  return {
    command: { ...command, label: { action: 'insert-pieces', count: copy.clipboard.count } },
    copies: { kind: 'pieces', ids: new Set(made) },
    copied: copy,
  };
}
