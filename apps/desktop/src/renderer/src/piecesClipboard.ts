import {
  copyPieces,
  pastePieces,
  type Command,
  type CopyLoss,
  type Selection,
} from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import type { Vec2 } from '@leathercad/geometry';
import { readPieces, writePieces } from '@leathercad/persist';

import type { I18n } from '../../shared/i18n.js';
import { selectedParts } from './sheetContents.js';

/**
 * What *Copy* left for *Paste* (8.8b): whole pieces as text, held by the
 * window rather than a tab, so a piece copied in one project pastes into any
 * other. Not the system clipboard: nothing outside the app needs a piece.
 */
export interface PiecesClipboard {
  readonly text: string;
  readonly count: number;
}

export interface Copied {
  readonly clipboard: PiecesClipboard;
  /** What the paste will not bring as it was — said when copying, before pasting. */
  readonly frozen: readonly CopyLoss[];
  readonly dropped: readonly CopyLoss[];
}

/** The pieces the selection is in, copied whole; `null` when it is in none. */
export function copySelection(project: Project, selection: Selection): Copied | null {
  const parts = selectedParts(project, selection);
  if (parts.size === 0) return null;
  const { pieces, frozen, dropped } = copyPieces(project, parts);
  return {
    clipboard: { text: writePieces(pieces), count: pieces.parts.length },
    frozen,
    dropped,
  };
}

/**
 * *Duplicate* for any number of pieces (8.8b): a copy and a paste in one step,
 * clear of the drawing as a single duplicate is — so one machinery makes new
 * ids, re-points every reference and keeps the seams between the pieces.
 * `null` when the selection is in no piece.
 */
export function duplicateSelection(
  project: Project,
  selection: Selection,
  nextId: () => string,
): { command: Command; partIds: readonly string[]; copied: Copied } | null {
  const copied = copySelection(project, selection);
  if (copied === null) return null;
  const { command, partIds } = pasteCommand(copied.clipboard, nextId, null);
  // The same edit as a paste, but it undoes as what the maker did.
  const label = { action: 'duplicate-pieces', count: copied.clipboard.count } as const;
  return { command: { ...command, label }, partIds, copied };
}

/**
 * The paste, with fresh ids for everything in it. Read through `persist` as a
 * file is (the trust boundary), so it throws `InvalidProjectFileError` for a
 * copy that is not one.
 */
export function pasteCommand(
  clipboard: PiecesClipboard,
  nextId: () => string,
  at: Vec2 | null,
): { command: Command; partIds: readonly string[] } {
  const pieces = readPieces(clipboard.text);
  const ids = {
    parts: pieces.parts.map(() => nextId()),
    features: pieces.parts.flatMap((part) => part.features).map(() => nextId()),
    seams: pieces.seams.map(() => nextId()),
  };
  return { command: pastePieces(pieces, ids, at), partIds: ids.parts };
}

/**
 * What a copy will not bring as it was, in the maker's words; `null` when nothing.
 * Said before a paste after *Copy*, and of the copies already made after *Duplicate*.
 */
export function copyNotice(
  { frozen, dropped }: Copied,
  { t, list: join }: I18n,
  after: 'copy' | 'duplicate',
): string | null {
  const name = (loss: CopyLoss): string =>
    t('pieces.lossName', { feature: loss.featureName, part: loss.partName });
  const list = (losses: readonly CopyLoss[]): string => join(losses.map(name));
  const lines = [
    ...(frozen.length === 0
      ? []
      : [
          t(after === 'copy' ? 'pieces.frozen' : 'pieces.duplicateFrozen', {
            count: frozen.length,
            names: list(frozen),
          }),
        ]),
    ...(dropped.length === 0
      ? []
      : [
          t(after === 'copy' ? 'pieces.dropped' : 'pieces.duplicateDropped', {
            count: dropped.length,
            names: list(dropped),
          }),
        ]),
  ];
  return lines.length === 0 ? null : lines.join(' ');
}
