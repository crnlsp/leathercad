import {
  deleteRefusal,
  flipFeatures,
  flipRefusal,
  partSelectionOf,
  selectionOf,
  setFeatureLocked,
  setFeatureVisible,
  type Command,
  type FlipAxis,
  type Selection,
} from '@leathercad/document';
import type { FeatureId, PartId, Problem, Project } from '@leathercad/domain';

import type { I18n, Translate } from '../../shared/i18n.js';
import { sewableIds } from './seams.js';
import { FLIP_ICON } from './icons/arrange.js';
import type { MenuEntry } from './menus.js';
import { describeProblem } from './problemText.js';

/** What was right-clicked: a feature, on the board or its Parts row, or a part's heading. */
export type RightClicked =
  | { readonly kind: 'feature'; readonly id: FeatureId }
  | { readonly kind: 'part'; readonly id: PartId };

/**
 * What a right-click leaves selected (8.8): the selection as it is when it
 * already holds what was clicked, so the menu acts on all of it; otherwise
 * what was clicked, alone — as a left click would pick it.
 */
export function selectionForRightClick(selection: Selection, clicked: RightClicked): Selection {
  if (clicked.kind === 'part') {
    return selection.parts.has(clicked.id) ? selection : partSelectionOf([clicked.id]);
  }
  return selection.features.has(clicked.id) ? selection : selectionOf([clicked.id]);
}

/** The handlers the menu's items run: the ones every other way to do them runs. */
export interface SelectionActions {
  sewTogether?: () => void;
  dispatch(command: Command): void;
  duplicatePart(partId: PartId): void;
  /** Copies the pieces the selection is in, for any open project (8.8b). */
  copyPieces(): void;
  /** What was copied, when anything was: *Paste* puts it where the menu was opened. */
  paste?: PasteChoice | undefined;
  /** Asks first when something depends on them (ADR 0009). */
  deleteFeatures(ids: readonly FeatureId[]): void;
  deletePart(partId: PartId): void;
}

/** The pieces waiting to be pasted, and the paste (8.8b). */
export interface PasteChoice {
  readonly count: number;
  readonly onChoose: () => void;
}

function pasteItem({ t }: I18n, paste: PasteChoice): MenuEntry {
  return {
    kind: 'item',
    id: 'context-paste-pieces',
    label: t('contextMenu.paste', { count: paste.count }),
    keys: 'pastePieces',
    onChoose: paste.onChoose,
  };
}

/**
 * The menu of a right-click on empty board (8.8b): only what needs no
 * selection, which is *Paste* — so there is none until something is copied.
 */
export function boardMenu(i18n: I18n, paste: PasteChoice | undefined): MenuEntry[] {
  return paste === undefined ? [] : [pasteItem(i18n, paste)];
}

/**
 * The right-click menu (8.8): what the selection can take, through commands
 * that already exist, each one step of undo.
 *
 * Always the same items in the same order, so they stay under the hand; one
 * the selection refuses is greyed and says why, asked with the same question
 * the command asks (X1, ADR 0013). A part picked by its heading stands for
 * every feature in it.
 */
export function selectionMenu(
  i18n: I18n,
  project: Project,
  selection: Selection,
  actions: SelectionActions,
): MenuEntry[] {
  const { t } = i18n;
  const wholeParts = selection.parts.size > 0;
  const parts = project.parts.filter((part) =>
    wholeParts
      ? selection.parts.has(part.id)
      : part.features.some((feature) => selection.features.has(feature.id)),
  );
  const features = parts
    .flatMap((part) => part.features)
    .filter((feature) => wholeParts || selection.features.has(feature.id));
  const ids = features.map((feature) => feature.id);

  const empty = features.length === 0 ? t('contextMenu.emptyPart') : undefined;
  // Mixed is not all: a half-locked selection is offered Lock, as other
  // editors do, and Unlock only once every piece of it is locked.
  const allLocked = features.length > 0 && features.every((feature) => feature.locked);
  const allHidden = features.length > 0 && features.every((feature) => !feature.visible);

  const flip = (axis: FlipAxis): MenuEntry => ({
    kind: 'item',
    id: `context-flip-${axis}`,
    label: t(`contextMenu.flip.${axis}`),
    icon: FLIP_ICON[axis],
    refusal: empty ?? reason(flipRefusal(project, ids, axis), t),
    onChoose: () => actions.dispatch(flipFeatures(ids, axis)),
  });

  const sewing: MenuEntry[] =
    !wholeParts &&
    sewableIds(project, selection.features).length > 0 &&
    actions.sewTogether !== undefined
      ? [
          {
            kind: 'item',
            id: 'context-sew',
            label: t('seams.make'),
            onChoose: actions.sewTogether,
          },
          { kind: 'separator' },
        ]
      : [];
  return [
    ...sewing,
    {
      kind: 'item',
      id: 'context-duplicate-part',
      label: t('actions.duplicatePart'),
      icon: 'duplicate',
      keys: 'duplicatePiece',
      refusal:
        parts.length === 1 ? undefined : t('contextMenu.spansParts', { count: parts.length }),
      onChoose: () => actions.duplicatePart(parts[0]!.id),
    },
    // Under the hand where Duplicate is, for this project or another (8.8b).
    {
      kind: 'item',
      id: 'context-copy-pieces',
      label: t('contextMenu.copy', { count: parts.length }),
      keys: 'copyPieces',
      onChoose: actions.copyPieces,
    },
    ...(actions.paste === undefined ? [] : [pasteItem(i18n, actions.paste)]),
    { kind: 'separator' },
    flip('horizontal'),
    flip('vertical'),
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'context-lock',
      label: allLocked ? t('actions.unlock') : t('actions.lock'),
      icon: allLocked ? 'unlocked' : 'locked',
      refusal: empty,
      onChoose: () => actions.dispatch(setFeatureLocked(ids, !allLocked)),
    },
    {
      kind: 'item',
      id: 'context-visible',
      label: allHidden ? t('actions.show') : t('actions.hide'),
      icon: allHidden ? 'visible' : 'hidden',
      // The print leaves out what the board hides: said before, not found
      // on the paper.
      ...(allHidden ? {} : { note: t('contextMenu.hideNote') }),
      refusal: empty,
      onChoose: () => actions.dispatch(setFeatureVisible(ids, allHidden)),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'context-delete',
      label: wholeParts ? t('actions.deletePart') : t('actions.delete'),
      icon: 'delete',
      danger: true,
      refusal: reason(deleteRefusal(project, ids), t),
      onChoose: () => (wholeParts ? actions.deletePart(parts[0]!.id) : actions.deleteFeatures(ids)),
    },
  ];
}

function reason(problem: Problem | null, t: Translate): string | undefined {
  return problem === null ? undefined : describeProblem(problem, t);
}
