import { EPS_LENGTH, QUANTUM_MM, approxEq, quantiseAtLeast, type Mm } from '@leathercad/core';
import {
  diagnose,
  findFeature,
  problem,
  problemKey,
  resolveSeam,
  type Diagnostic,
  type FeatureId,
  type Problem,
  type Project,
  type SeamSide,
} from '@leathercad/domain';
import { Vec2Ops, type Vec2 } from '@leathercad/geometry';

import { setDerivation } from './commands.js';
import type { Command, Document } from './document.js';
import { editPathPoint } from './pathPoints.js';

/**
 * One plainly safe change that clears one listed problem (9.17, product-roadmap
 * decision 7): an ordinary command, offered from a diagnostic. Facts, never
 * words; the app says what it does.
 *
 * Offered only when there is exactly one such change and the real evaluator
 * shows it clears its problem and lists nothing that was not already listed.
 * Where the choice is the maker's — which side of a seam, which hole to drop,
 * which iron — none is offered.
 */
export type Fix =
  /** A drawn stitch line's open end moved along its last straight side. */
  | (FixBase & {
      readonly kind: 'seam-length';
      /** Positive lengthens the line, negative shortens it. */
      readonly changeMm: Mm;
      readonly vertex: number;
      readonly to: Vec2;
    })
  /** A derived stitch line's inset raised to the clearance the edge rule asks. */
  | (FixBase & { readonly kind: 'edge-margin'; readonly marginMm: Mm });

interface FixBase {
  /** The problem it clears, by `problemKey`. */
  readonly problemKey: string;
  /** The stitch line it edits. */
  readonly featureId: FeatureId;
  readonly featureName: string;
  readonly edit: Command;
}

// Keyed on the immutable project, as `diagnose` is: a panel asking on every
// render of an unchanged document pays once.
const proposals = new WeakMap<Project, Map<string, Fix | null>>();

/** The one plainly safe fix for this listed problem, or null. */
export function proposeFix(project: Project, diagnostic: Diagnostic): Fix | null {
  const key = problemKey(diagnostic.problem);
  let known = proposals.get(project);
  if (known === undefined) proposals.set(project, (known = new Map()));
  if (known.has(key)) return known.get(key) ?? null;
  const fix = propose(project, diagnostic, key);
  known.set(key, fix);
  return fix;
}

/**
 * Why this fix cannot be applied to this project now, or null (X1): its
 * problem has gone, or the pattern changed so the fix would be another one.
 */
export function fixRefusal(project: Project, fix: Fix): Problem | null {
  const diagnostic = diagnose(project).find((d) => problemKey(d.problem) === fix.problemKey);
  if (diagnostic === undefined) return problem('FIX_NO_LONGER_APPLIES', { why: 'resolved' });
  const now = proposeFix(project, diagnostic);
  return now !== null && sameFix(now, fix)
    ? null
    : problem('FIX_NO_LONGER_APPLIES', { why: 'changed' });
}

/** The fix as one undoable step; a stale one changes nothing. */
export function fixCommand(fix: Fix): Command {
  return {
    label: { action: 'fix', name: fix.featureName },
    apply: (document: Document) =>
      fixRefusal(document.project, fix) === null ? fix.edit.apply(document) : document,
  };
}

function propose(project: Project, diagnostic: Diagnostic, key: string): Fix | null {
  const { problem: p } = diagnostic;
  switch (p.code) {
    case 'SEAM_HOLES_DRIFT':
      return seamFix(project, p.facts.seamId, key);
    case 'HOLE_TOO_CLOSE_TO_EDGE':
      return edgeFix(project, p.facts.featureId, p.facts.minimumMm - p.facts.clearanceMm, key);
    default:
      return null;
  }
}

function sameFix(a: Fix, b: Fix): boolean {
  if (a.kind !== b.kind || a.featureId !== b.featureId) return false;
  if (a.kind === 'edge-margin' && b.kind === 'edge-margin') {
    return approxEq(a.marginMm, b.marginMm, EPS_LENGTH);
  }
  return (
    a.kind === 'seam-length' &&
    b.kind === 'seam-length' &&
    a.vertex === b.vertex &&
    Vec2Ops.equals(a.to, b.to)
  );
}

/**
 * Holes that drift with equal counts pair when one side's stitching is as
 * long as the other's walk: its last hole lands on its partner's. Only a
 * drawn line's open end can move without changing what is cut — a line
 * derived from an outline moves with the outline, and changing the cut
 * (8.14b, D19) is a design decision.
 */
function seamFix(project: Project, seamId: string, key: string): Fix | null {
  const seam = project.seams?.find((s) => s.id === seamId);
  if (seam === undefined) return null;
  const resolved = resolveSeam(project, seam);
  if (!resolved.ok || resolved.a.holes.length !== resolved.b.holes.length) return null;
  const candidates = [
    lengthFix(project, seam.a, resolved.a, resolved.b, key),
    lengthFix(project, seam.b, resolved.b, resolved.a, key),
  ].filter((fix): fix is Fix => fix !== null && clears(project, fix.edit, key));
  // Both sides could move: which one is the maker's choice.
  return candidates.length === 1 ? candidates[0]! : null;
}

type Walk = Extract<ReturnType<typeof resolveSeam>, { ok: true }>['a'];

function lengthFix(
  project: Project,
  side: SeamSide,
  own: Walk,
  partner: Walk,
  key: string,
): Fix | null {
  const { stretch } = side;
  // The walk must end at the line's open end, so moving it moves only the
  // last holes of this stretch, never its first.
  if (stretch.kind !== 'between' || typeof stretch.toAnchor === 'number') return null;
  if (stretch.fromAnchor === stretch.toAnchor) return null;
  const holes = findFeature(project, side.holeSetId)?.feature;
  if (
    holes?.kind !== 'stitch-hole-set' ||
    holes.source.kind !== 'derived' ||
    holes.source.op.type !== 'stitch-holes' ||
    holes.source.op.mode !== 'fit-whole'
  )
    return null;
  const line = findFeature(project, holes.source.sourceId)?.feature;
  if (line?.kind !== 'stitch-line' || line.source.kind !== 'path' || line.source.path.closed) {
    return null;
  }
  const { segments } = line.source.path;
  const atEnd = stretch.toAnchor === 'end';
  const segment = atEnd ? segments.at(-1) : segments[0];
  const last = own.holes.at(-1);
  const paired = partner.holes.at(-1);
  if (segment?.kind !== 'line' || last === undefined || paired === undefined) return null;

  // A quantum beyond the pair, so a partner that takes this side's length
  // keeps its last hole inside the stretch however the point rounds (8.14b
  // found nearest rounding drops it).
  const changeMm = paired.distanceMm - last.distanceMm + QUANTUM_MM;
  // Less than a pitch: a fix moves holes, it never adds or removes one.
  if (!(Math.abs(changeMm) < holes.source.op.pitchMm)) return null;
  const [inner, end] = atEnd ? [segment.a, segment.b] : [segment.b, segment.a];
  const direction = Vec2Ops.tryNormalise(Vec2Ops.sub(end, inner));
  if (direction === null) return null;
  const to = Vec2Ops.quantiseVec(Vec2Ops.add(end, Vec2Ops.scale(direction, changeMm)));
  const vertex = atEnd ? segments.length : 0;
  return {
    kind: 'seam-length',
    problemKey: key,
    featureId: line.id,
    featureName: line.name,
    changeMm,
    vertex,
    to,
    edit: editPathPoint({ kind: 'move', featureId: line.id, vertex, to }),
  };
}

/**
 * A derived stitch line moved in by what its holes lack. The minimum the rule
 * asks, rounded up to the storage grid, never a margin of its own choosing.
 */
function edgeFix(project: Project, holeSetId: FeatureId, shortMm: Mm, key: string): Fix | null {
  const holes = findFeature(project, holeSetId)?.feature;
  if (holes?.kind !== 'stitch-hole-set' || holes.source.kind !== 'derived') return null;
  const line = findFeature(project, holes.source.sourceId)?.feature;
  if (
    line?.kind !== 'stitch-line' ||
    line.source.kind !== 'derived' ||
    line.source.op.type !== 'offset'
  )
    return null;
  const marginMm = quantiseAtLeast(line.source.op.distanceMm + shortMm);
  const edit = setDerivation(line.id, { ...line.source.op, distanceMm: marginMm });
  if (!clears(project, edit, key)) return null;
  return {
    kind: 'edge-margin',
    problemKey: key,
    featureId: line.id,
    featureName: line.name,
    marginMm,
    edit,
  };
}

/**
 * The edit takes its problem away and warns of nothing new, by the real
 * evaluator. A new note is allowed: moving stitching by a millimetre can
 * change how the rounding falls at a corner (`HOLE_SPACING_UNEVEN`), which is
 * information, not something wrong.
 */
function clears(project: Project, edit: Command, key: string): boolean {
  const after = edit.apply({ project }).project;
  if (after === project) return false;
  const before = new Set(warned(project));
  return (
    !diagnose(after).some((d) => problemKey(d.problem) === key) &&
    warned(after).every((entry) => before.has(entry))
  );
}

/** Every warning and error listed, by identity and severity. */
function warned(project: Project): string[] {
  return diagnose(project)
    .filter((d) => d.severity !== 'info')
    .map((d) => `${problemKey(d.problem)}|${d.severity}`);
}
