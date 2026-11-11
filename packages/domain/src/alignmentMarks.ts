import { Vec2Ops, type Vec2 } from '@leathercad/geometry';

import type { ResolvedProject } from './evaluate.js';
import type { FeatureId, PartId, Seam, SeamId, SeamMarks } from './feature.js';
import { distanceToEdge, isOnMaterial, materialOf } from './material.js';
import { resolveSeam } from './seams.js';

/**
 * One alignment mark (9.13): where a paired hole is, and which way the leather
 * lies from it. Derived from the seam on every evaluation, never stored; how
 * long the tick is drawn is the theme's (`render`), in true millimetres.
 */
export interface AlignmentMark {
  readonly seamId: SeamId;
  readonly partId: PartId;
  readonly holeSetId: FeatureId;
  /** One-based, counted from the first pair of the seam, as the board numbers pairs. */
  readonly pair: number;
  /** The hole's centre. */
  readonly point: Vec2;
  /** A unit vector square to the stitch line at the hole, into the leather. */
  readonly inward: Vec2;
}

/** The one-based pairs a seam's marks fall on, of `paired` pairs. */
export function markedPairs(marks: SeamMarks, paired: number): number[] {
  if (marks.kind === 'ends') return paired < 1 ? [] : paired < 2 ? [1] : [1, paired];
  const { n } = marks;
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`marks every n pairs needs a whole n of at least 1, received ${n}`);
  }
  const pairs: number[] = [];
  for (let pair = n; pair <= paired; pair += n) pairs.push(pair);
  return pairs;
}

/**
 * How far from a hole the two sides of its line are compared. Well inside the
 * 1.5 mm a hole keeps from an edge, so the side nearer the edge is always the
 * one whose distance falls.
 */
const PROBE_MM = 0.5;

const cache = new WeakMap<ResolvedProject, readonly AlignmentMark[]>();

/**
 * One seam's marks, and what they were made from: its walk, and each side's
 * part, hole set and outlines. Evaluation hands back the same objects for what
 * did not change, so an edit elsewhere reuses every seam's marks (PERF, 9.13).
 */
const bySeam = new WeakMap<
  Seam,
  { readonly inputs: readonly unknown[]; readonly marks: readonly AlignmentMark[] }
>();

/**
 * Every seam's marks, at its chosen paired holes on both pieces, in seam order
 * then side a before side b. A seam that does not resolve marks nothing — its
 * problem is listed — and a hidden hole set's marks are hidden with it. A
 * count mismatch still marks the pairs it has: that is where the maker eases.
 */
export function alignmentMarks(resolved: ResolvedProject): readonly AlignmentMark[] {
  const known = cache.get(resolved);
  if (known !== undefined) return known;
  const marks = (resolved.project.seams ?? []).flatMap((seam) => marksOf(resolved, seam));
  cache.set(resolved, marks);
  return marks;
}

function marksOf(resolved: ResolvedProject, seam: Seam): readonly AlignmentMark[] {
  if (seam.marks === undefined) return [];
  const walked = resolveSeam(resolved.project, seam);
  if (!walked.ok) return [];
  const sides = (
    [
      [seam.a, walked.a],
      [seam.b, walked.b],
    ] as const
  ).map(([side, stretch]) => {
    const part = resolved.parts.find((p) =>
      p.features.some((entry) => entry.feature.id === side.holeSetId),
    );
    const read = (part?.features ?? []).filter(
      (entry) => entry.feature.id === side.holeSetId || entry.feature.kind === 'cut-contour',
    );
    return { side, stretch, part, read };
  });
  // An entry is made afresh by each evaluation; what it holds is shared.
  const inputs = [
    walked,
    ...sides.flatMap(({ part, read }) => [
      part?.part.id,
      ...read.flatMap((entry) => [entry.feature, entry.ok ? entry.path : undefined]),
    ]),
  ];
  const known = bySeam.get(seam);
  if (known !== undefined && sameObjects(known.inputs, inputs)) return known.marks;

  const pairs = markedPairs(seam.marks, Math.min(walked.a.holes.length, walked.b.holes.length));
  const marks: AlignmentMark[] = [];
  for (const { side, stretch, part } of sides) {
    const holeSet = part?.features.find((entry) => entry.feature.id === side.holeSetId);
    if (part === undefined || holeSet?.feature.visible !== true) continue;
    const material = materialOf(part);
    for (const pair of pairs) {
      const hole = stretch.holes[pair - 1]?.hole;
      if (hole === undefined) continue;
      marks.push({
        seamId: seam.id,
        partId: part.part.id,
        holeSetId: side.holeSetId,
        pair,
        point: hole.point,
        inward: inwardAt(material, hole.point, hole.tangent),
      });
    }
  }
  bySeam.set(seam, { inputs, marks });
  return marks;
}

function sameObjects(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * The normal on the leather's side: the one onto the material, then the one
 * away from the nearer edge, and the left-hand normal when nothing tells them
 * apart — a part without an outline, or a line down a strap's middle.
 */
function inwardAt(material: ReturnType<typeof materialOf>, point: Vec2, tangent: Vec2): Vec2 {
  const left = Vec2Ops.perp(Vec2Ops.normalise(tangent));
  const right = Vec2Ops.negate(left);
  const score = (normal: Vec2): [boolean, number] => {
    const probe = Vec2Ops.add(point, Vec2Ops.scale(normal, PROBE_MM));
    return [isOnMaterial(material, probe), distanceToEdge(material, probe)];
  };
  const [leftOn, leftDistance] = score(left);
  const [rightOn, rightDistance] = score(right);
  if (leftOn !== rightOn) return leftOn ? left : right;
  return rightDistance > leftDistance ? right : left;
}
