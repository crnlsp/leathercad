import type { Feature, Part, PartId, Project } from './feature.js';
import { crossPartRefusal, enclosesArea } from './graph.js';
import { problem, type Problem } from './problems/index.js';

/**
 * What a part may be made of — the structural invariants about its own
 * composition, as opposed to the reference graph's (`graph.ts`).
 *
 * S5: a part is one piece of leather, so it has one edge.
 * S6: an outer contour and a cut-out both have to enclose an area.
 *
 * Both are **refused**, never reported: commands refuse to create them and the
 * loader refuses files holding them, so a document is never in violation
 * (ADR 0013). `domain-model.md` §8.6 lists them as retired diagnostics for
 * exactly this reason.
 *
 * Everything here reads parameters, never evaluated geometry: a structural
 * rule that depended on whether evaluation happened to succeed would stop
 * being structural.
 */

/**
 * Whether this part declares an edge of its own (DR1).
 *
 * Asked of the parameters, never of the evaluated material: an outline with a
 * negative radius is still the part's outline, it just cannot be built yet.
 * Reading this from evaluation told the user "no outline — draw one" about a
 * part that has one, and the command would then refuse the second (S5).
 *
 * The same reasoning as the rest of this module: a structural fact about what
 * a part is made of cannot depend on whether evaluation happened to succeed.
 */
export function hasOuterContour(part: Part): boolean {
  return part.features.some(
    (feature) => feature.kind === 'cut-contour' && feature.role === 'outer',
  );
}

/**
 * Why this feature may not join this part, or `null`.
 *
 * Takes the feature rather than an id, so a command can ask about one it is
 * about to add — the same shape as `derivationRefusal`, which handles the
 * graph's half of the question.
 */
export function additionRefusal(
  project: Project,
  partId: PartId,
  feature: Feature,
): Problem | null {
  const reach = crossPartRefusal(project, partId, feature);
  if (reach !== null) return reach;

  if (feature.kind !== 'cut-contour') return null;

  const about = { featureId: feature.id, featureName: feature.name };

  if (!enclosesArea(project, feature)) {
    // A stored contour is a path or a shape the user can still edit closed.
    return problem('CONTOUR_NOT_CLOSED', { ...about, role: feature.role, closable: true });
  }

  if (feature.role !== 'outer') return null;

  const part = project.parts.find((candidate) => candidate.id === partId);
  const outer = part?.features.find(
    (existing) =>
      existing.kind === 'cut-contour' && existing.role === 'outer' && existing.id !== feature.id,
  );
  if (outer === undefined) return null;

  return problem('PART_ALREADY_HAS_OUTER', {
    ...about,
    partName: part?.name ?? 'This part',
    outerName: outer.name,
  });
}

/** Every S5 or S6 violation in a project. What the loader refuses. */
export function partStructureProblems(project: Project): Problem[] {
  const problems: Problem[] = [];

  for (const part of project.parts) {
    let outer: Feature | null = null;

    for (const feature of part.features) {
      if (feature.kind !== 'cut-contour') continue;
      const about = { featureId: feature.id, featureName: feature.name };

      if (!enclosesArea(project, feature)) {
        problems.push(
          problem('CONTOUR_NOT_CLOSED', { ...about, role: feature.role, closable: true }),
        );
        continue;
      }

      if (feature.role !== 'outer') continue;
      if (outer === null) {
        outer = feature;
        continue;
      }

      problems.push(
        problem('PART_ALREADY_HAS_OUTER', {
          ...about,
          partName: part.name,
          outerName: outer.name,
        }),
      );
    }
  }

  return problems;
}
