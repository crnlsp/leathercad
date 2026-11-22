import type { Feature, Orientation, Part, Project } from '@leathercad/domain';
import { isScaleCheckOnly } from '@leathercad/export';

import { sheetPlanFor } from './sheets.js';

/**
 * The job, as Properties says it with nothing selected (R-05, the spec's §7
 * question 4): the sheets to print. Facts only; the panel words them. What to
 * cut and punch is `productionSummary`'s, shown under it.
 *
 * Read from `sheetPlanFor`'s plan, the one the PDF writes, so the count and the
 * paper cannot disagree.
 */
export interface JobTotals {
  readonly sheets: number;
  /** The paper's name, as the plan has it: `A4`. */
  readonly paper: string;
  readonly orientation: Orientation;
  /** Nothing prints but the scale check. */
  readonly scaleCheckOnly: boolean;
}

export function jobTotals(project: Project): JobTotals {
  const plan = sheetPlanFor(project);
  return {
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

/**
 * What several selected things are, counted as Properties says it (U.24c,
 * X9): pieces when every one is a piece's outline — Arrange moves a piece
 * whole — or the pieces were picked by their headings; features otherwise.
 */
export function selectedCount(
  project: Project,
  features: ReadonlySet<string>,
  parts: ReadonlySet<string>,
): { readonly of: 'pieces' | 'features'; readonly count: number } {
  if (features.size === 0) return { of: 'pieces', count: parts.size };
  const picked = project.parts.flatMap((part) =>
    part.features.filter((f) => features.has(f.id)).map((feature) => ({ part, feature })),
  );
  return picked.every(({ feature }) => feature.kind === 'cut-contour' && feature.role === 'outer')
    ? { of: 'pieces', count: new Set(picked.map(({ part }) => part.id)).size }
    : { of: 'features', count: features.size };
}
