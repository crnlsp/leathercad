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
import {
  describeProblem,
  type FeatureId,
  type PartId,
  type Problem,
  type Project,
} from '@leathercad/domain';
import {
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Lock,
  LockOpen,
  Trash2,
} from 'lucide-react';

import type { MenuEntry } from './menus.js';

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
  dispatch(command: Command): void;
  duplicatePart(partId: PartId): void;
  /** Asks first when something depends on them (ADR 0009). */
  deleteFeatures(ids: readonly FeatureId[]): void;
  deletePart(partId: PartId): void;
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
  project: Project,
  selection: Selection,
  actions: SelectionActions,
): MenuEntry[] {
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

  const empty = features.length === 0 ? 'The part is empty' : undefined;
  // Mixed is not all: a half-locked selection is offered Lock, as other
  // editors do, and Unlock only once every piece of it is locked.
  const allLocked = features.length > 0 && features.every((feature) => feature.locked);
  const allHidden = features.length > 0 && features.every((feature) => !feature.visible);

  const flip = (axis: FlipAxis): MenuEntry => ({
    kind: 'item',
    id: `context-flip-${axis}`,
    label: axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical',
    icon: axis === 'horizontal' ? FlipHorizontal2 : FlipVertical2,
    refusal: empty ?? reason(flipRefusal(project, ids, axis)),
    onChoose: () => actions.dispatch(flipFeatures(ids, axis)),
  });

  return [
    {
      kind: 'item',
      id: 'context-duplicate-part',
      label: 'Duplicate part',
      icon: Copy,
      refusal:
        parts.length === 1
          ? undefined
          : `The selection is in ${String(parts.length)} parts; duplicate one at a time`,
      onChoose: () => actions.duplicatePart(parts[0]!.id),
    },
    { kind: 'separator' },
    flip('horizontal'),
    flip('vertical'),
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'context-lock',
      label: allLocked ? 'Unlock' : 'Lock',
      icon: allLocked ? LockOpen : Lock,
      refusal: empty,
      onChoose: () => actions.dispatch(setFeatureLocked(ids, !allLocked)),
    },
    {
      kind: 'item',
      id: 'context-visible',
      label: allHidden ? 'Show' : 'Hide',
      icon: allHidden ? Eye : EyeOff,
      // The print leaves out what the board hides: said before, not found
      // on the paper.
      ...(allHidden ? {} : { note: 'Also left off the PDF until shown again' }),
      refusal: empty,
      onChoose: () => actions.dispatch(setFeatureVisible(ids, allHidden)),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'context-delete',
      label: wholeParts ? 'Delete part' : 'Delete',
      icon: Trash2,
      danger: true,
      refusal: reason(deleteRefusal(project, ids)),
      onChoose: () => (wholeParts ? actions.deletePart(parts[0]!.id) : actions.deleteFeatures(ids)),
    },
  ];
}

function reason(problem: Problem | null): string | undefined {
  return problem === null ? undefined : describeProblem(problem);
}
