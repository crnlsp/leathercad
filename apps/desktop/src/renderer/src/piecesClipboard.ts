import {
  copyFeatures,
  copyPieces,
  pasteFeatures,
  pastePieces,
  type Command,
  type CopyLoss,
  type DocumentStore,
  type Selection,
} from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import type { Vec2 } from '@leathercad/geometry';
import { readFeatures, readPieces, writeFeatures, writePieces } from '@leathercad/persist';

import type { I18n } from '../../shared/i18n.js';
import { selectedParts } from './sheetContents.js';
import type { Copies } from './stepAndRepeat.js';

/**
 * What *Copy* left for *Paste* (8.8b): whole pieces, or features for a piece
 * (8.8b-4), as text, held by the window rather than a tab, so what was copied
 * in one project pastes into any other. Not the system clipboard: nothing
 * outside the app needs a piece.
 */
export interface PiecesClipboard {
  readonly kind: 'pieces' | 'features';
  readonly text: string;
  readonly count: number;
}

export interface Copied {
  readonly clipboard: PiecesClipboard;
  /** What the paste will not bring as it was — said when copying, before pasting. */
  readonly frozen: readonly CopyLoss[];
  readonly dropped: readonly CopyLoss[];
}

/**
 * What *Copy* and *Duplicate* take of a selection (8.8b-4): its features alone
 * when they are all in one piece and none stands for the piece — no heading
 * picked, no outline — and otherwise the pieces it is in. `null` for none.
 */
export function copyScope(project: Project, selection: Selection): Copies | null {
  const parts = selectedParts(project, selection);
  if (parts.size === 0) return null;
  const outline = project.parts.some((part) =>
    part.features.some(
      (f) => selection.features.has(f.id) && f.kind === 'cut-contour' && f.role === 'outer',
    ),
  );
  return selection.parts.size === 0 && !outline && parts.size === 1
    ? { kind: 'features', ids: selection.features }
    : { kind: 'pieces', ids: parts };
}

/** What the selection copies, as `copyScope` says; `null` when it is in no piece. */
export function copySelection(project: Project, selection: Selection): Copied | null {
  const scope = copyScope(project, selection);
  if (scope === null) return null;
  if (scope.kind === 'features') {
    const { copied, frozen, dropped } = copyFeatures(project, scope.ids);
    const text = writeFeatures(copied);
    return {
      clipboard: { kind: 'features', text, count: copied.features.length },
      frozen,
      dropped,
    };
  }
  const { pieces, frozen, dropped } = copyPieces(project, scope.ids);
  return {
    clipboard: { kind: 'pieces', text: writePieces(pieces), count: pieces.parts.length },
    frozen,
    dropped,
  };
}

/**
 * *Duplicate* for any selection (8.8b): a copy and a paste in one step, so one
 * machinery makes new ids, re-points every reference and keeps the seams.
 * Pieces land clear of the drawing, as a single duplicate does; features in
 * one piece land in it, on their originals (8.8b-4). `null` when the selection
 * is in no piece. A `stepMm` (step and repeat, 8.8b) puts the copies that far
 * from what they copy instead.
 */
export function duplicateSelection(
  project: Project,
  selection: Selection,
  nextId: () => string,
  stepMm: Vec2 | null = null,
): { command: Command; copies: Copies; copied: Copied } | null {
  const copied = copySelection(project, selection);
  if (copied === null) return null;
  const { clipboard } = copied;
  // The same edit as a paste, but it undoes as what the maker did.
  if (clipboard.kind === 'features') {
    const [into] = selectedParts(project, selection);
    if (into === undefined) return null;
    const { command, featureIds } = pasteFeaturesCommand(clipboard, nextId, into, null, stepMm);
    const label = { action: 'duplicate-features', count: clipboard.count } as const;
    return {
      command: { ...command, label },
      copies: { kind: 'features', ids: new Set(featureIds) },
      copied,
    };
  }
  const { command, partIds } = pasteCommand(clipboard, nextId, null, stepMm);
  const label = { action: 'duplicate-pieces', count: clipboard.count } as const;
  return {
    command: { ...command, label },
    copies: { kind: 'pieces', ids: new Set(partIds) },
    copied,
  };
}

/**
 * The paste of pieces, with fresh ids for everything in it. Read through
 * `persist` as a file is (the trust boundary), so it throws
 * `InvalidProjectFileError` for a copy that is not one.
 */
export function pasteCommand(
  clipboard: PiecesClipboard,
  nextId: () => string,
  at: Vec2 | null,
  stepMm: Vec2 | null = null,
): { command: Command; partIds: readonly string[] } {
  const pieces = readPieces(clipboard.text);
  const ids = {
    parts: pieces.parts.map(() => nextId()),
    features: pieces.parts.flatMap((part) => part.features).map(() => nextId()),
    seams: pieces.seams.map(() => nextId()),
  };
  return { command: pastePieces(pieces, ids, at, stepMm), partIds: ids.parts };
}

/** The paste of features into the piece `partId` (8.8b-4), read as `pasteCommand` reads pieces. */
function pasteFeaturesCommand(
  clipboard: PiecesClipboard,
  nextId: () => string,
  partId: string,
  at: Vec2 | null,
  stepMm: Vec2 | null = null,
): { command: Command; featureIds: readonly string[] } {
  const copied = readFeatures(clipboard.text);
  const ids = {
    features: copied.features.map(() => nextId()),
    seams: copied.seams.map(() => nextId()),
  };
  return { command: pasteFeatures(copied, ids, partId, at, stepMm), featureIds: ids.features };
}

/**
 * The paste of whatever was copied (8.8b): pieces, or features into the piece
 * `into` (8.8b-4) — `null` for features with no piece to go into.
 */
export function pasteClipboard(
  clipboard: PiecesClipboard,
  nextId: () => string,
  at: Vec2 | null,
  into: string | undefined,
): { command: Command; copies: Copies } | null {
  if (clipboard.kind === 'pieces') {
    const { command, partIds } = pasteCommand(clipboard, nextId, at);
    return { command, copies: { kind: 'pieces', ids: new Set(partIds) } };
  }
  if (into === undefined) return null;
  const { command, featureIds } = pasteFeaturesCommand(clipboard, nextId, into, at);
  return { command, copies: { kind: 'features', ids: new Set(featureIds) } };
}

/** What was just pasted or duplicated is what the maker works on next. */
export function selectCopies(store: DocumentStore, copies: Copies): void {
  if (copies.kind === 'pieces') store.selectParts(copies.ids);
  else store.select(copies.ids);
}

/** The words for what a copy left behind, by what was copied and what was done with it. */
const LOSS_KEYS = {
  pieces: {
    copy: { frozen: 'pieces.frozen', dropped: 'pieces.dropped' },
    duplicate: { frozen: 'pieces.duplicateFrozen', dropped: 'pieces.duplicateDropped' },
  },
  features: {
    copy: { frozen: 'pieces.featuresFrozen', dropped: 'pieces.featuresDropped' },
    duplicate: {
      frozen: 'pieces.featuresDuplicateFrozen',
      dropped: 'pieces.featuresDuplicateDropped',
    },
  },
} as const;

/**
 * What a copy will not bring as it was, in the maker's words; `null` when nothing.
 * Said before a paste after *Copy*, and of the copies already made after *Duplicate*.
 */
export function copyNotice(
  { clipboard, frozen, dropped }: Copied,
  { t, list: join }: I18n,
  after: 'copy' | 'duplicate',
): string | null {
  const keys = LOSS_KEYS[clipboard.kind][after];
  const name = (loss: CopyLoss): string =>
    t('pieces.lossName', { feature: loss.featureName, part: loss.partName });
  const list = (losses: readonly CopyLoss[]): string => join(losses.map(name));
  const lines = [
    ...(frozen.length === 0 ? [] : [t(keys.frozen, { count: frozen.length, names: list(frozen) })]),
    ...(dropped.length === 0
      ? []
      : [t(keys.dropped, { count: dropped.length, names: list(dropped) })]),
  ];
  return lines.length === 0 ? null : lines.join(' ');
}
