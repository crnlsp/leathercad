import type { Feature, Orientation, Part, Project } from '@leathercad/domain';
import { isScaleCheckOnly } from '@leathercad/export';

import { resolvedFor, sheetPlanFor } from './sheets.js';

/**
 * The job, as Properties says it with nothing selected (R-05, the spec's §7
 * question 4): pieces to cut, holes to punch, sheets to print — what a maker
 * plans a session at the bench from. Facts only; the panel words them.
 *
 * **What prints is what is counted** (Q20): a hidden piece is not on the
 * sheets, so it is not cut from them and its holes are not punched. Every
 * piece still counts towards `pieces`, as the parts list counts it. Read from
 * `sheetPlanFor`'s plan, the one the PDF writes, and the evaluation it was
 * built from, so these numbers and the paper cannot disagree.
 */
export interface JobTotals {
  /** Every piece in the project, printed or not. */
  readonly pieces: number;
  /** Each printed piece, times its Cut. */
  readonly toCut: number;
  /** Every hole on the printed pieces, each set times its piece's Cut. */
  readonly holes: number;
  /** Each hole set that prints, in the parts list's order, with its piece's Cut. */
  readonly holeSets: readonly { readonly holes: number; readonly cut: number }[];
  readonly sheets: number;
  /** The paper's name, as the plan has it: `A4`. */
  readonly paper: string;
  readonly orientation: Orientation;
  /** Nothing prints but the scale check. */
  readonly scaleCheckOnly: boolean;
}

export function jobTotals(project: Project): JobTotals {
  const plan = sheetPlanFor(project);
  const printed = resolvedFor(project).parts.filter(({ part }) => plan.parts.has(part.id));

  const holeSets = printed.flatMap(({ part, features }) =>
    features.flatMap((entry) =>
      // As the export scene draws them: a hidden or failed set is not on paper.
      entry.ok && entry.feature.visible && entry.holes !== undefined && entry.holes.count > 0
        ? [{ holes: entry.holes.count, cut: part.quantity }]
        : [],
    ),
  );

  return {
    pieces: project.parts.length,
    toCut: printed.reduce((sum, { part }) => sum + part.quantity, 0),
    holes: holeSets.reduce((sum, set) => sum + set.holes * set.cut, 0),
    holeSets,
    sheets: plan.sheets.length,
    paper: plan.setup.paper.name,
    orientation: plan.setup.orientation,
    scaleCheckOnly: isScaleCheckOnly(plan),
  };
}

/**
 * What a feature follows, by name, from the first link to the last: the
 * middle of its trail under its name in Properties, "Outer · Cut ×1 › Stitch
 * line › Stitch holes" (R-05).
 *
 * An outline is its piece, so it is named by the piece — and left out when it
 * is this feature's own piece, whose name the trail starts with.
 */
export function trailOf(project: Project, feature: Feature): readonly string[] {
  const partOf = new Map<string, Part>();
  const byId = new Map<string, Feature>();
  for (const part of project.parts) {
    for (const each of part.features) {
      partOf.set(each.id, part);
      byId.set(each.id, each);
    }
  }

  const followed: Feature[] = [];
  let at = feature;
  // The graph is acyclic (S3), but a trail is no place to find out otherwise.
  while (at.kind !== 'text-label' && at.source.kind === 'derived') {
    const next = byId.get(at.source.sourceId);
    if (next === undefined || next === feature || followed.includes(next)) break;
    followed.unshift(next);
    at = next;
  }

  const home = partOf.get(feature.id);
  const isOutline = (f: Feature) => f.kind === 'cut-contour' && f.role === 'outer';
  const root = followed[0];
  if (root !== undefined && isOutline(root) && partOf.get(root.id) === home) followed.shift();

  return followed.map((f) =>
    isOutline(f) && partOf.get(f.id) !== home ? (partOf.get(f.id)?.name ?? f.name) : f.name,
  );
}
