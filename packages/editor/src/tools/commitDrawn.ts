import { addFoldLine, addMarkingLine, addPart, pathPart, shapePart } from '@leathercad/document';
import { findFeature, type FeatureId, type GeometrySource, type PartId } from '@leathercad/domain';

import type { ToolContext } from '../tool.js';

/**
 * What the next drawn thing becomes.
 *
 * A fold line can be drawn as a line, an arc or a polyline: the *kind* is
 * orthogonal to the drawing *primitive*, which is why this is one setting
 * shared by every draw tool rather than a tool per combination. See
 * docs/superpowers/specs/2026-09-05-fold-mark-hardware-design.md §4.
 */
export type DrawAs = 'cut' | 'fold' | 'mark';

/** Geometry a tool can actually produce. A derived source is never drawn. */
export type DrawnSource = Extract<GeometrySource, { kind: 'shape' } | { kind: 'path' }>;

/**
 * Files freshly drawn geometry where the current mode says it belongs.
 *
 * Returns the new feature's id, or **null** if the draw was refused — which is
 * why it returns anything at all: a refused commit must leave the tool free to
 * decide what to do with its own state, and must leave the document untouched.
 */
export function commitDrawn(
  ctx: ToolContext,
  nextId: () => string,
  name: string,
  source: DrawnSource,
): FeatureId | null {
  const featureId = nextId() as FeatureId;

  if (drawAsOf(ctx) === 'cut') {
    // Unchanged from before this setting existed: a new part, with the
    // closed/open rule deciding whether it is an outline or a line. Inner
    // contours on the selected part are slice 4.3, deliberately not here.
    const part =
      source.kind === 'shape'
        ? shapePart(nextId() as PartId, featureId, name, source.shape)
        : pathPart(nextId() as PartId, featureId, name, source.path);

    ctx.dispatch(addPart(part));
    ctx.store.select([featureId]);
    return featureId;
  }

  const partId = targetPart(ctx);
  if (partId === null) return null;

  ctx.dispatch(
    drawAsOf(ctx) === 'fold'
      ? addFoldLine(partId, featureId, source)
      : addMarkingLine(partId, featureId, source),
  );
  ctx.store.select([featureId]);
  return featureId;
}

/**
 * The part a fold or marking line would join: the one the selection is in.
 *
 * Null when nothing is selected, or when the selection spans two parts. Both
 * are refusals rather than guesses — a fold line silently attached to the wrong
 * panel is invisible until the leather is cut.
 */
export function targetPart(ctx: ToolContext): PartId | null {
  const { document, selection } = ctx.store.getState();
  const parts = new Set<PartId>();

  for (const id of selection.features) {
    const found = findFeature(document.project, id);
    if (found !== null) parts.add(found.part.id);
  }

  return parts.size === 1 ? [...parts][0]! : null;
}

/** Why nothing happened, for the status bar. Null when nothing is wrong. */
export function drawTargetNotice(ctx: ToolContext): string | null {
  if (drawAsOf(ctx) === 'cut') return null;
  if (targetPart(ctx) !== null) return null;

  const spansParts = ctx.store.getState().selection.features.size > 0;
  return spansParts
    ? 'Select one part: this belongs to a single panel, and the selection spans more than one.'
    : 'Select a part first — a fold or marking line belongs to the panel it is drawn on.';
}

function drawAsOf(ctx: ToolContext): DrawAs {
  return ctx.drawAs?.() ?? 'cut';
}
