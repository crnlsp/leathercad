import type { FeatureId, Project } from './feature.js';
import { evaluate, type ResolvedProject } from './evaluate.js';
import { validate } from './validate.js';
import { PROBLEM_CODES, type Diagnostic } from './problems/index.js';

/**
 * The one diagnostic list (X7).
 *
 * Evaluation outcomes and design rules together, in part order and then
 * feature order, with a feature's outcome ahead of any rule about it. The
 * problems panel, the status count, the property panel and the canvas markers
 * all read this and none computes its own — so they can never disagree about
 * what is wrong.
 *
 * Memoised on the project object, the same identity trick as `evaluate`: every
 * surface asking during one render gets the same array.
 */
const memo = new WeakMap<Project, readonly Diagnostic[]>();

export function diagnose(project: Project): readonly Diagnostic[] {
  const cached = memo.get(project);
  if (cached !== undefined) return cached;

  const resolved = evaluate(project);
  const unordered = [...outcomesOf(resolved), ...validate(resolved)];

  const position = new Map<string, number>();
  let next = 0;
  for (const part of project.parts) {
    position.set(`part:${part.id}`, next++);
    for (const feature of part.features) position.set(`feature:${feature.id}`, next++);
  }
  const rank = (d: Diagnostic): number =>
    position.get(d.featureId === undefined ? `part:${d.partId}` : `feature:${d.featureId}`) ?? 0;

  // A stable sort: outcomes were listed first, so they stay ahead of rules
  // about the same feature.
  const diagnostics = unordered
    .map((diagnostic, index) => ({ diagnostic, index }))
    .sort((a, b) => rank(a.diagnostic) - rank(b.diagnostic) || a.index - b.index)
    .map(({ diagnostic }) => diagnostic);

  memo.set(project, diagnostics);
  return diagnostics;
}

/**
 * Every evaluation outcome as a diagnostic: each failed feature, and whatever a
 * resolved one had to give up (an offset that split).
 */
function outcomesOf(resolved: ResolvedProject): Diagnostic[] {
  const found: Diagnostic[] = [];

  for (const { part, features } of resolved.parts) {
    for (const entry of features) {
      if (!entry.ok) {
        const related: FeatureId[] =
          entry.problem.code === 'SOURCE_FAILED' ? [entry.problem.facts.sourceId] : [];
        found.push({
          problem: entry.problem,
          severity: PROBLEM_CODES[entry.problem.code].severity,
          partId: part.id,
          featureId: entry.feature.id,
          related,
          ...(entry.location === undefined ? {} : { location: entry.location }),
        });
        continue;
      }

      for (const note of entry.notes ?? []) {
        found.push({
          problem: note,
          severity: PROBLEM_CODES[note.code].severity,
          partId: part.id,
          featureId: entry.feature.id,
          related: [],
          location: { kind: 'path', path: entry.path },
        });
      }
    }
  }

  return found;
}
