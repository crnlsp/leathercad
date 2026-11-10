import { EPS_LENGTH, approxEq, approxGte, approxLte, type Mm } from '@leathercad/core';
import { PathOps } from '@leathercad/geometry';

import { evaluate, type ResolvedFeature } from './evaluate.js';
import type { FeatureId, Project, Seam, SeamAnchor, SeamSide } from './feature.js';
import { problem, problemKey, type Diagnostic, type Problem } from './problems/index.js';
import type { StitchHole } from './stitch.js';

type HoleLine = Extract<ResolvedFeature, { ok: true }>;
interface WalkedHole {
  /** Index into the set, including holes shared with another stretch. */
  readonly ordinal: number;
  /** Distance from the first hole in this stretch, as at the sewing bench. */
  readonly distanceMm: Mm;
  readonly hole: StitchHole;
}
interface Stretch {
  readonly lengthMm: Mm;
  readonly holes: readonly WalkedHole[];
}
type Resolution =
  | { readonly ok: true; readonly a: Stretch; readonly b: Stretch }
  | { readonly ok: false; readonly problem: Problem };

// The forty-seam benchmark spent 11.14 ms walking unchanged inputs. Like
// evaluation, reuse is keyed only on immutable inputs, with no invalidation.
const indices = new WeakMap<Project, ReadonlyMap<FeatureId, ResolvedFeature>>();
const results = new WeakMap<
  Seam,
  {
    readonly a: ResolvedFeature | undefined;
    readonly b: ResolvedFeature | undefined;
    readonly result: Resolution;
  }
>();

function index(project: Project): ReadonlyMap<FeatureId, ResolvedFeature> {
  const cached = indices.get(project);
  if (cached !== undefined) return cached;
  const entries = new Map(
    evaluate(project).parts.flatMap((part) =>
      part.features.map((entry) => [entry.feature.id, entry] as const),
    ),
  );
  indices.set(project, entries);
  return entries;
}

function sameInput(a: ResolvedFeature | undefined, b: ResolvedFeature | undefined): boolean {
  return (
    a === b ||
    (a?.ok === true &&
      b?.ok === true &&
      a.feature === b.feature &&
      a.path === b.path &&
      a.holes === b.holes &&
      a.anchors === b.anchors)
  );
}

/**
 * Structural seam checks, shared by commands and the loader. Missing/failed
 * sides are deliberately outcomes: a 1.6 edit may have removed their holes.
 * Out-of-range indices refuse; an anchor swallowed by evaluation stays missing.
 */
export function seamRefusal(project: Project, seam: Seam): Problem | null {
  if (seam.a.stretch.kind === 'from' && seam.b.stretch.kind === 'from') {
    return problem('SEAM_HAS_NO_LENGTH', { seamId: seam.id });
  }
  const features = index(project);
  for (const side of [seam.a, seam.b]) {
    const feature = features.get(side.holeSetId)?.feature;
    if (feature !== undefined && feature.kind !== 'stitch-hole-set') {
      return problem('SEAM_NOT_A_HOLE_SET', { seamId: seam.id, holeSetId: side.holeSetId });
    }
    const entry = holeLine(project, side);
    if (entry === null) continue;
    const indices =
      side.stretch.kind === 'from'
        ? [side.stretch.anchor]
        : [side.stretch.fromAnchor, side.stretch.toAnchor];
    for (const anchor of indices) {
      const missing =
        typeof anchor === 'number'
          ? !Number.isSafeInteger(anchor) || anchor < 0 || anchor >= entry.anchors.length
          : entry.path.closed;
      if (missing) {
        return problem('ANCHOR_MISSING', {
          seamId: seam.id,
          featureId: feature?.id ?? side.holeSetId,
          featureName: feature?.name ?? '',
          anchor,
          available: entry.anchors.length,
        });
      }
    }
  }
  return null;
}

/** Duplicate seam ids share the feature/guide namespace; missing sides load. */
export function seamStructureProblems(project: Project): Problem[] {
  const ids = new Set([
    ...project.parts.flatMap((part) => part.features.map((f) => f.id)),
    ...(project.guides ?? []).map((guide) => guide.id),
  ]);
  const problems: Problem[] = [];
  for (const seam of project.seams ?? []) {
    if (ids.has(seam.id)) problems.push(problem('DUPLICATE_ID', { featureId: seam.id }));
    ids.add(seam.id);
    const refusal = seamRefusal(project, seam);
    if (refusal !== null) problems.push(refusal);
  }
  return problems;
}

/** A source edit must not create seam metadata that the loader would refuse. */
export function seamChangeRefusal(before: Project, after: Project): Problem | null {
  if ((before.seams?.length ?? 0) === 0) return null;
  const existing = new Set(seamStructureProblems(before).map(problemKey));
  return seamStructureProblems(after).find((entry) => !existing.has(problemKey(entry))) ?? null;
}

function holeLine(project: Project, side: SeamSide): HoleLine | null {
  const entry = index(project).get(side.holeSetId);
  return entry?.ok === true && entry.feature.kind === 'stitch-hole-set' && entry.holes !== undefined
    ? entry
    : null;
}

/**
 * Walk declared stretches only; never infer seams from nearby geometry. The
 * same anchor twice walks a closed loop once. Open lines cannot wrap, and a
 * length-following side that overruns its line reports rather than clamps.
 */
export function resolveSeam(project: Project, seam: Seam): Resolution {
  const a = index(project).get(seam.a.holeSetId);
  const b = index(project).get(seam.b.holeSetId);
  const cached = results.get(seam);
  if (cached !== undefined && sameInput(a, cached.a) && sameInput(b, cached.b))
    return cached.result;
  const result = resolve(project, seam);
  results.set(seam, { a, b, result });
  return result;
}

function resolve(project: Project, seam: Seam): Resolution {
  const refusal = seamRefusal(project, seam);
  if (refusal !== null) return { ok: false, problem: refusal };
  const a = holeLine(project, seam.a);
  const b = holeLine(project, seam.b);
  if (a === null || b === null)
    return {
      ok: false,
      problem: problem('SEAM_SIDE_MISSING', {
        seamId: seam.id,
        holeSetId: a === null ? seam.a.holeSetId : seam.b.holeSetId,
      }),
    };
  const fixed = seam.a.stretch.kind === 'between' ? walk(seam, seam.a, a) : walk(seam, seam.b, b);
  if ('code' in fixed) return { ok: false, problem: fixed };
  const other =
    seam.a.stretch.kind === 'from'
      ? walk(seam, seam.a, a, fixed.lengthMm)
      : walk(seam, seam.b, b, fixed.lengthMm);
  if ('code' in other) return { ok: false, problem: other };
  return seam.a.stretch.kind === 'between'
    ? { ok: true, a: fixed, b: other }
    : { ok: true, a: other, b: fixed };
}

function walk(seam: Seam, side: SeamSide, entry: HoleLine, otherLength?: Mm): Stretch | Problem {
  const stretch = side.stretch;
  const total = PathOps.length(entry.path);
  const anchor = stretch.kind === 'between' ? stretch.fromAnchor : stretch.anchor;
  const start = anchorDistance(entry, anchor, total);
  const endAnchor = stretch.kind === 'between' ? stretch.toAnchor : anchor;
  const end = anchorDistance(entry, endAnchor, total);
  if (start === null || end === null) {
    return problem('ANCHOR_MISSING', {
      seamId: seam.id,
      featureId: entry.feature.id,
      featureName: entry.feature.name,
      anchor: start === null ? anchor : endAnchor,
      available: entry.anchors.length,
    });
  }
  const backward =
    stretch.kind === 'from'
      ? stretch.toward === 'previous'
      : !entry.path.closed && !approxGte(end, start, EPS_LENGTH);
  const direction = backward ? -1 : 1;
  const lengthMm =
    stretch.kind === 'from'
      ? (otherLength ?? 0)
      : entry.path.closed
        ? approxEq(start, end, EPS_LENGTH)
          ? total
          : wrap(end - start, total)
        : Math.abs(end - start);
  const availableMm = entry.path.closed ? total : backward ? start : total - start;
  if (!approxGte(lengthMm, 0, EPS_LENGTH) || !approxLte(lengthMm, availableMm, EPS_LENGTH))
    return problem('SEAM_RUNS_OFF_THE_LINE', {
      seamId: seam.id,
      holeSetId: side.holeSetId,
      lengthMm,
      availableMm,
    });
  const holes = (entry.holes?.holes ?? [])
    .map((hole, ordinal) => {
      const raw = direction * (hole.alongMm - start);
      const along = entry.path.closed ? wrap(raw, total) : raw;
      return {
        ordinal,
        distanceMm: approxEq(along, total, EPS_LENGTH) && entry.path.closed ? 0 : along,
        hole,
      };
    })
    .filter(
      (hole) =>
        approxGte(hole.distanceMm, 0, EPS_LENGTH) &&
        approxLte(hole.distanceMm, lengthMm, EPS_LENGTH),
    )
    .sort((a, b) => a.distanceMm - b.distanceMm);
  const first = holes[0]?.distanceMm ?? 0;
  return {
    lengthMm,
    holes: holes.map((hole) => ({ ...hole, distanceMm: hole.distanceMm - first })),
  };
}

/** Endpoints follow the current line boundaries; they never add or renumber corners. */
function anchorDistance(entry: HoleLine, anchor: SeamAnchor, total: Mm): Mm | null {
  if (typeof anchor === 'number') return entry.anchors[anchor] ?? null;
  if (entry.path.closed) return null;
  return anchor === 'start' ? 0 : total;
}

function wrap(distance: Mm, total: Mm): Mm {
  if (approxEq(total, 0, EPS_LENGTH)) return 0;
  return ((distance % total) + total) % total;
}

/** Seam outcomes join the single Problems list, including orphaned seams. */
export function seamDiagnostics(project: Project): Diagnostic[] {
  return (project.seams ?? []).flatMap((seam) => {
    const result = resolveSeam(project, seam);
    if (result.ok) return [];
    const part =
      project.parts.find((piece) => piece.features.some((f) => f.id === seam.a.holeSetId)) ??
      project.parts.find((piece) => piece.features.some((f) => f.id === seam.b.holeSetId));
    const firstSideSurvives = part?.features.some((f) => f.id === seam.a.holeSetId) === true;
    return [
      {
        problem: result.problem,
        severity: 'error',
        partId: part?.id ?? project.id,
        ...(part === undefined
          ? {}
          : {
              featureId: firstSideSurvives ? seam.a.holeSetId : seam.b.holeSetId,
            }),
        related: [firstSideSurvives ? seam.b.holeSetId : seam.a.holeSetId],
      },
    ];
  });
}
