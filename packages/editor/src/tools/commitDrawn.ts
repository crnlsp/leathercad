import {
  addCutOut,
  addDrawnStitchLine,
  addFoldLine,
  addMarkingLine,
  addPart,
  pathPart,
  shapePart,
} from '@leathercad/document';
import {
  findFeature,
  problem,
  type FeatureId,
  type GeometrySource,
  type PartId,
  type Problem,
} from '@leathercad/domain';

import type { ToolContext } from '../tool.js';

/**
 * What the next drawn thing becomes.
 *
 * **One mode, one result** (X4). A mode never reads the selection to decide
 * *what* to make, only which part to make it on — because a new feature is
 * selected the moment it is drawn, so a mode that decided by selection would
 * quietly change meaning on the next draw. See the reconciliation §3.8.
 *
 * `stitch-allowance` is the sixth mode in that table and arrives with seam
 * allowance, slice 4.9: it needs an outline derived outward from a stitch
 * line, which is a derivation this does not have yet.
 */
export type DrawMode = 'outline' | 'cut-out' | 'stitch' | 'fold' | 'marking';

/** Geometry a tool can actually produce. A derived source is never drawn. */
export type DrawnSource = Extract<GeometrySource, { kind: 'shape' } | { kind: 'path' }>;

/** The modes whose result has to enclose an area (S6). */
const ENCLOSING: ReadonlySet<DrawMode> = new Set<DrawMode>(['outline', 'cut-out']);

/**
 * One tool's commit boundary: the only way drawn geometry reaches the document.
 *
 * It exists to hold an invariant no tool should have to remember — **a refused
 * draw always leaves a reason behind** (X1). A tool that called the commit and
 * dropped the `null` would make its drawing vanish in silence, which is what
 * the arc tool did in Outline mode: three clicks, nothing drawn, nothing said.
 *
 * So the refusal is caught here and held until the next drawing begins, and
 * `notice` is what the status bar reads. Every draw tool owns one of these and
 * there is no other entry point.
 */
export interface DrawCommit {
  /**
   * Files this drawing, or holds the reason it could not be filed.
   *
   * Returns the new feature's id, or **null** when refused — the tool still
   * decides what to do with its own state, which is the difference between
   * "not valid yet" and "your work is gone".
   */
  commit(
    ctx: ToolContext,
    nextId: () => string,
    name: string,
    source: DrawnSource,
  ): FeatureId | null;
  /** A new drawing is starting: the user is answering the last refusal. */
  begin(): void;
  /** The held refusal, else whatever the mode has to say for itself. */
  notice(ctx: ToolContext): Problem | null;
}

export function createDrawCommit(): DrawCommit {
  /** Why the last finished drawing was not kept, until another one starts. */
  let held: Problem | null = null;

  return {
    begin() {
      held = null;
    },

    commit(ctx, nextId, name, source) {
      held = drawRefusal(ctx, source);
      if (held !== null) return null;
      return fileDrawn(ctx, nextId, name, source);
    },

    notice(ctx) {
      return held ?? drawTargetNotice(ctx);
    },
  };
}

/**
 * Files freshly drawn geometry where the current mode says it belongs.
 *
 * Private on purpose: reaching the document through `DrawCommit` is what makes
 * "no draw tool discards a refusal in silence" a property of the code rather
 * than a habit.
 */
function fileDrawn(
  ctx: ToolContext,
  nextId: () => string,
  name: string,
  source: DrawnSource,
): FeatureId | null {
  const mode = modeOf(ctx);
  const featureId = nextId() as FeatureId;

  if (mode === 'outline') {
    // A new part, always, and the selection is never consulted: an outline is
    // a new piece of leather.
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

  ctx.dispatch(commandFor(mode, partId, featureId, source));
  ctx.store.select([featureId]);
  return featureId;
}

function commandFor(
  mode: Exclude<DrawMode, 'outline'>,
  partId: PartId,
  featureId: FeatureId,
  source: DrawnSource,
) {
  switch (mode) {
    case 'cut-out':
      return addCutOut(partId, featureId, source);
    case 'stitch':
      return addDrawnStitchLine(partId, featureId, source);
    case 'fold':
      return addFoldLine(partId, featureId, source);
    case 'marking':
      return addMarkingLine(partId, featureId, source);
  }
}

/**
 * The part a drawn feature would join: the one the selection is in.
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

/**
 * Why this drawing would be refused, or null.
 *
 * The check the commit makes, asked first, so a tool can say why instead of
 * appearing to do nothing (X1).
 */
export function drawRefusal(ctx: ToolContext, source: DrawnSource): Problem | null {
  const mode = modeOf(ctx);

  // S6: an outline and a cut-out are both cut, so both have to enclose
  // something. An open path used to be filed silently as a marking line.
  if (ENCLOSING.has(mode) && !enclosesArea(source)) {
    return problem('CONTOUR_NOT_CLOSED', {
      featureName: mode === 'outline' ? 'An outline' : 'A cut-out',
      role: mode === 'outline' ? 'outer' : 'inner',
      // A run of points can be closed with another click; an arc cannot, ever,
      // so it must not be told to try.
      closable: source.kind === 'path',
    });
  }

  return drawTargetNotice(ctx);
}

/** Why nothing would happen for want of a part, for the status bar. */
export function drawTargetNotice(ctx: ToolContext): Problem | null {
  const mode = modeOf(ctx);
  // An outline makes its own part and never reads the selection.
  if (mode === 'outline') return null;
  if (targetPart(ctx) !== null) return null;

  const what = mode === 'cut-out' ? 'cut-out' : 'line';
  const spansParts = ctx.store.getState().selection.features.size > 0;
  return spansParts ? problem('TARGET_SPANS_PARTS', { what }) : problem('NO_TARGET_PART', { what });
}

/** Whether drawn geometry encloses an area, by what it is rather than by area. */
function enclosesArea(source: DrawnSource): boolean {
  return source.kind === 'path' ? source.path.closed : source.shape.type !== 'arc';
}

function modeOf(ctx: ToolContext): DrawMode {
  return ctx.drawAs?.() ?? 'outline';
}
