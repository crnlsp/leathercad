import { quantise } from '@leathercad/core';
import {
  cornersThroughEdit,
  findFeature,
  lockRefusal,
  problem,
  type Feature,
  type FeatureId,
  type MeasureRef,
  type Problem,
  type Project,
} from '@leathercad/domain';
import {
  insertPathVertex,
  movePathVertex,
  removePathVertex,
  roundPathVertex,
  sharpenPathArc,
  type Path,
  type PathEdit,
  type Vec2,
} from '@leathercad/geometry';

import type { Command, HistoryLabel } from './document.js';

/**
 * One change to one point of a drawn path (3.9b).
 *
 * Points are numbered as `PathOps.vertices` numbers them: point `i` is where
 * segment `i` starts. A new point goes `t` of the way along a segment, where
 * the outline already runs, so adding one changes nothing a maker can see
 * until it is moved.
 */
export type PathPointEdit =
  | {
      readonly kind: 'move';
      readonly featureId: FeatureId;
      readonly vertex: number;
      readonly to: Vec2;
    }
  | {
      readonly kind: 'insert';
      readonly featureId: FeatureId;
      readonly segment: number;
      readonly t: number;
    }
  | { readonly kind: 'remove'; readonly featureId: FeatureId; readonly vertex: number }
  /** The corner at a point, rounded to a radius (3.9d). */
  | {
      readonly kind: 'round';
      readonly featureId: FeatureId;
      readonly vertex: number;
      readonly radiusMm: number;
    }
  /** A rounded corner — its arc, by segment — sharpened back to a point (3.9d). */
  | { readonly kind: 'sharpen'; readonly featureId: FeatureId; readonly segment: number };

/**
 * Why this point edit cannot be made, or `null`.
 *
 * Pure, and shared with the interface, so a refused drag and the reason shown
 * beside it come from one check (ADR 0013).
 */
export function pathPointRefusal(project: Project, edit: PathPointEdit): Problem | null {
  const planned = plan(project, edit);
  return 'problem' in planned ? planned.problem : null;
}

/**
 * Why this feature's points cannot be edited at all, or `null` when they can.
 *
 * Asked before any particular edit — it is what the Edit Points tool says
 * while a shape or a locked outline is selected (3.9c) — and it is the first
 * question every edit asks, so the two cannot disagree.
 */
export function pointEditingRefusal(project: Project, featureId: FeatureId): Problem | null {
  const found = findFeature(project, featureId);
  if (found === null) return problem('FEATURE_MISSING', { featureId });

  const locked = lockRefusal(project, [featureId]);
  if (locked !== null) return locked;

  const { feature } = found;
  if (feature.kind === 'text-label' || feature.source.kind !== 'path') {
    return problem('NOT_A_DRAWN_PATH', { featureId: feature.id, featureName: feature.name });
  }
  return null;
}

/**
 * Moves, adds or removes a point of a drawn path, in one undoable step.
 *
 * Everything attached to the path's corners — a stitch run between two of
 * them, a dimension to one, and the same on anything derived from the path,
 * which carries its corners under the path's own numbers — is renumbered in
 * the same step, so it stays on the corner it was on (ADR 0010, amended). An
 * edit that would take such a corner away is refused rather than letting the
 * attachment slide to a neighbour.
 */
export function editPathPoint(edit: PathPointEdit): Command {
  const label = LABELS[edit.kind];
  return {
    label,
    apply: (document) => {
      const planned = plan(document.project, edit);
      return 'problem' in planned ? document : { ...document, project: planned.project };
    },
  };
}

const LABELS: { readonly [K in PathPointEdit['kind']]: HistoryLabel } = {
  move: { action: 'move-point' },
  insert: { action: 'add-point' },
  remove: { action: 'remove-point' },
  round: { action: 'round-corner' },
  sharpen: { action: 'sharpen-corner' },
};

type Plan = { readonly project: Project } | { readonly problem: Problem };

function plan(project: Project, edit: PathPointEdit): Plan {
  const refused = pointEditingRefusal(project, edit.featureId);
  if (refused !== null) return { problem: refused };

  const { feature } = findFeature(project, edit.featureId)!;
  const about = { featureId: feature.id, featureName: feature.name };
  // Narrowed again for the compiler; `pointEditingRefusal` has already said so.
  if (feature.kind === 'text-label' || feature.source.kind !== 'path') {
    return { problem: problem('NOT_A_DRAWN_PATH', about) };
  }

  const before = feature.source.path;
  const edited = applyEdit(before, edit);
  if (edited === null) {
    // Said as what was asked: a rounding that does not fit is not a path with
    // too few points, and sharpening a sharp corner is neither.
    if (edit.kind === 'round') {
      return {
        problem: problem('ROUNDING_DOES_NOT_FIT', { ...about, radiusMm: quantise(edit.radiusMm) }),
      };
    }
    if (edit.kind === 'sharpen') return { problem: problem('NOT_A_ROUNDED_CORNER', about) };
    return { problem: problem('POINT_EDIT_DEGENERATE', about) };
  }

  const corners = cornersThroughEdit(before, edited);
  const family = carriesCornersOf(project, feature.id);

  // Every attachment, renumbered — or the first one that would lose its
  // corner, which refuses the whole edit.
  // A holder rather than a `let`: it is set inside the callbacks below, which
  // the compiler's narrowing does not follow.
  const lost: { owner: Feature | null } = { owner: null };
  const renumber = (k: number, owner: Feature): number => {
    // An index already past the corners is already missing (E4), and stays
    // exactly as missing: giving it a number would attach it to whatever
    // corner the edit happened to create there.
    if (k < 0 || k >= corners.length) return k;
    const next = corners[k] ?? null;
    if (next === null) {
      lost.owner ??= owner;
      return k;
    }
    return next;
  };
  const renumberRef = (ref: MeasureRef, owner: Feature): MeasureRef =>
    family.has(ref.featureId) ? { ...ref, anchor: renumber(ref.anchor, owner) } : ref;

  const parts = project.parts.map((part) => {
    const features = part.features.map((f): Feature => {
      // A drawn path stays one, with its new points; its kind and everything
      // else about it are unchanged.
      if (f.id === feature.id) {
        return { ...feature, source: { kind: 'path', path: edited.path } } as Feature;
      }
      if (f.kind === 'text-label') return f;

      const source = f.source;
      if (source.kind === 'measurement') {
        const a = renumberRef(source.a, f);
        const b = renumberRef(source.b, f);
        // Unchanged stays the same object: evaluation caches by identity.
        if (a.anchor === source.a.anchor && b.anchor === source.b.anchor) return f;
        return { ...f, source: { ...source, a, b } } as Feature;
      }
      if (
        source.kind === 'derived' &&
        source.op.type === 'offset' &&
        source.op.run.kind === 'between' &&
        family.has(source.sourceId)
      ) {
        const run = source.op.run;
        const fromAnchor = renumber(run.fromAnchor, f);
        const toAnchor = renumber(run.toAnchor, f);
        if (fromAnchor === run.fromAnchor && toAnchor === run.toAnchor) return f;
        return {
          ...f,
          source: {
            ...source,
            op: {
              ...source.op,
              run: { ...run, fromAnchor, toAnchor },
            },
          },
        } as Feature;
      }
      return f;
    });
    return features.every((f, i) => f === part.features[i]) ? part : { ...part, features };
  });

  if (lost.owner !== null) {
    return { problem: problem('CORNER_IN_USE', { ...about, usedByName: lost.owner.name }) };
  }
  return { project: { ...project, parts } };
}

function applyEdit(path: Path, edit: PathPointEdit): PathEdit | null {
  switch (edit.kind) {
    case 'move':
      // Typed or dragged, a point is user input, stored to the storage quantum
      // (invariant 8) so the file keeps what the maker set.
      return movePathVertex(path, edit.vertex, {
        x: quantise(edit.to.x),
        y: quantise(edit.to.y),
      });
    case 'insert':
      return insertPathVertex(path, edit.segment, edit.t);
    case 'remove':
      return removePathVertex(path, edit.vertex);
    case 'round':
      // Typed, so stored to the quantum like every other typed length.
      return roundPathVertex(path, edit.vertex, quantise(edit.radiusMm));
    case 'sharpen':
      return sharpenPathArc(path, edit.segment);
  }
}

/**
 * The drawn path and everything derived from it, however indirectly.
 *
 * Each of these carries the path's corners under the path's own numbers — an
 * offset maps them, a mirror reflects them, a hole set exposes its line's — so
 * an attachment to any of them names a corner of the path (ADR 0010, 3).
 */
function carriesCornersOf(project: Project, rootId: FeatureId): ReadonlySet<FeatureId> {
  const family = new Set<FeatureId>([rootId]);
  const features = project.parts.flatMap((part) => part.features);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of features) {
      if (
        !family.has(f.id) &&
        f.kind !== 'text-label' &&
        f.source.kind === 'derived' &&
        family.has(f.source.sourceId)
      ) {
        family.add(f.id);
        grew = true;
      }
    }
  }
  return family;
}
