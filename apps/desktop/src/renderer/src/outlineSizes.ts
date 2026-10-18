import {
  approxEq,
  approxLte,
  formatEditable,
  formatNumber,
  quantiseAtLeast,
  quantiseAtMost,
} from '@leathercad/core';
import {
  rectShape,
  setDerivation,
  setShape,
  type Command,
  type Selection,
} from '@leathercad/document';
import type { SizeDraft } from '@leathercad/editor';
import type { Derivation, FeatureId, ParametricShape, Project } from '@leathercad/domain';
import {
  cornerNeeds,
  cornerRoom,
  uniformRadii,
  type CornerRadii,
  type CornerRoom,
} from '@leathercad/geometry';
import { VALUE_CHIPS, type ValueChip } from '@leathercad/render';

import type { Translate } from '../../shared/i18n.js';

export type RectShape = Extract<ParametricShape, { type: 'rect' }>;
type Offset = Extract<Derivation, { type: 'offset' }>;

/** What the chips beside a selected outline edit (R-12, U.14). */
export interface ChipSubject {
  readonly outlineId: FeatureId;
  readonly shape: RectShape;
  /** The one stitch line following the outline inward, whose distance is the margin. */
  readonly margin: { readonly id: FeatureId; readonly op: Offset } | null;
}

/**
 * The outline whose sizes the chips show: one feature selected, a piece's
 * outline drawn as a rectangle, shown and not locked — a locked one's sizes
 * are not the maker's to type, as its Properties say. The margin only where
 * exactly one stitch line follows that outline in from its edge: with two,
 * which one a chip edits would be a guess.
 */
export function chipSubject(project: Project, selection: Selection): ChipSubject | null {
  if (selection.parts.size > 0 || selection.features.size !== 1) return null;
  const [id] = selection.features;
  for (const part of project.parts) {
    const outline = part.features.find((feature) => feature.id === id);
    if (outline === undefined) continue;
    if (
      outline.kind !== 'cut-contour' ||
      outline.role !== 'outer' ||
      outline.locked ||
      !outline.visible ||
      outline.source.kind !== 'shape' ||
      outline.source.shape.type !== 'rect'
    ) {
      return null;
    }
    const margins = part.features.flatMap((feature) =>
      feature.kind === 'stitch-line' &&
      feature.visible &&
      !feature.locked &&
      feature.source.kind === 'derived' &&
      feature.source.sourceId === outline.id &&
      feature.source.op.type === 'offset' &&
      feature.source.op.side === 'inward'
        ? [{ id: feature.id, op: feature.source.op }]
        : [],
    );
    return {
      outlineId: outline.id,
      shape: outline.source.shape,
      margin: margins.length === 1 ? margins[0]! : null,
    };
  }
  return null;
}

/**
 * The rectangle being drawn, as chips see an outline (U.16): its three sizes
 * and no margin, for there is no stitch line yet. It has no feature to
 * command — typed numbers go to the tool — so its id names nothing.
 */
export function drawnSubject(draft: SizeDraft): ChipSubject {
  return {
    outlineId: '' as FeatureId,
    shape: rectShape(draft.origin, draft.width, draft.height, draft.corner),
    margin: null,
  };
}

/** The chips a subject has, in `Tab`'s order. */
export function chipsOf(subject: ChipSubject): readonly ValueChip[] {
  return subject.margin === null ? VALUE_CHIPS.filter((chip) => chip !== 'margin') : VALUE_CHIPS;
}

const CORNERS: readonly (keyof CornerRadii)[] = [
  'bottomLeft',
  'bottomRight',
  'topRight',
  'topLeft',
];

/** A chip's number; null for a corner radius when the four corners differ. */
export function chipValue(subject: ChipSubject, chip: ValueChip): number | null {
  const { shape } = subject;
  switch (chip) {
    case 'width':
      return shape.width;
    case 'height':
      return shape.height;
    case 'corner': {
      const first = shape.radii.bottomLeft;
      return CORNERS.every((corner) => approxEq(shape.radii[corner], first)) ? first : null;
    }
    case 'margin':
      return subject.margin?.op.distanceMm ?? null;
  }
}

/**
 * The smallest a chip takes, as Properties' field for the same number does:
 * a size is never zero, a corner never negative, a margin at least 0.1 mm.
 */
export const CHIP_MIN: Readonly<Record<ValueChip, number>> = {
  width: 0.01,
  height: 0.01,
  corner: 0,
  margin: 0.1,
};

/**
 * The one command a typed value is — one undo step. A corner typed here sets
 * all four (decided for U.14): a corner each is Properties' to type.
 */
export function chipCommand(subject: ChipSubject, chip: ValueChip, value: number): Command {
  const { shape, outlineId, margin } = subject;
  switch (chip) {
    case 'width':
      return setShape(outlineId, { ...shape, width: value });
    case 'height':
      return setShape(outlineId, { ...shape, height: value });
    case 'corner':
      return setShape(outlineId, { ...shape, radii: uniformRadii(value) });
    case 'margin':
      // Only offered with a margin: chipsOf leaves the chip out without one.
      return setDerivation(margin!.id, { ...margin!.op, distanceMm: value });
  }
}

/** Why a value cannot be applied as typed, and what `Enter` applies instead. */
export interface Refusal {
  readonly reason: string;
  readonly use: number;
}

/** The words a refusal is said in: the catalogue, and how this keyboard names Enter. */
export interface RefusalWords {
  readonly t: Translate;
  readonly enter: string;
}

/**
 * A corner the rectangle would draw smaller than typed (R-12): "Corner is
 * larger than half the height (30.0). Enter uses 30.0." Null when it fits.
 * The room is `cornerRoom`'s, the very sum `roundedRect` shrinks by, so what
 * is refused is exactly what would never be drawn; the radius offered is the
 * largest stored value within it.
 */
export function cornerRefusal(
  room: CornerRoom,
  radius: number,
  { t, enter }: RefusalWords,
): Refusal | null {
  if (approxLte(radius, room.radiusMm)) return null;
  const use = quantiseAtMost(room.radiusMm);
  const size = chipNumber(use);
  const reason = room.shared
    ? room.side === 'height'
      ? t('chips.tooLarge.halfHeight', { size, enter })
      : t('chips.tooLarge.halfWidth', { size, enter })
    : room.side === 'height'
      ? t('chips.tooLarge.height', { size, enter })
      : t('chips.tooLarge.width', { size, enter });
  return { reason, use };
}

/**
 * A width or height the corners would be drawn smaller in (U.14): "Width is
 * less than its corners need (23.0). Enter uses 23.0." Null when they fit.
 * The need is `cornerNeeds`'s — the sums `fittedRadii` shrinks by — so what is
 * refused is exactly a size in which a stored radius would not be the one
 * drawn; the size offered is the least stored value the corners fit in. Only
 * the side typed is read: corners a file already holds too large for the
 * other side are that side's to fix, not this size's.
 */
export function sizeRefusal(
  radii: CornerRadii,
  side: 'width' | 'height',
  size: number,
  { t, enter }: RefusalWords,
): Refusal | null {
  const needs = cornerNeeds(radii);
  const need = side === 'width' ? needs.widthMm : needs.heightMm;
  if (approxLte(need, size)) return null;
  const use = quantiseAtLeast(need);
  const shown = chipNumber(use);
  const reason =
    side === 'width'
      ? t('chips.tooSmall.width', { size: shown, enter })
      : t('chips.tooSmall.height', { size: shown, enter });
  return { reason, use };
}

/**
 * Why a chip's value cannot apply as typed: a corner too large for the shape,
 * or a width or height too small for its corners. The margin is the stitch
 * line's, and is refused, as before, only by its own field's minimum.
 */
export function chipRefusal(
  subject: ChipSubject,
  chip: ValueChip,
  value: number,
  words: RefusalWords,
): Refusal | null {
  const { width, height, radii } = subject.shape;
  switch (chip) {
    case 'corner':
      return cornerRefusal(cornerRoom(width, height, radii, CORNERS), value, words);
    case 'width':
    case 'height':
      return sizeRefusal(radii, chip, value, words);
    case 'margin':
      return null;
  }
}

/**
 * A size as a chip shows it at rest, and as a refusal names it: to the tenth,
 * as the board's dimensions read — `95.0`, `r 4.0` — or to the hundredth when
 * that is what was typed, so 95.25 never reads as 95.3.
 */
export function chipNumber(value: number): string {
  const typed = formatEditable(value, 2);
  return typed.includes('.') ? typed : formatNumber(value, 1);
}
