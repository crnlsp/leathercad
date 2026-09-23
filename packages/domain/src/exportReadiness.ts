import { diagnose } from './diagnose.js';
import { evaluate } from './evaluate.js';
import type { FeatureId, Project } from './feature.js';

/** A feature that will not be on the paper. */
export interface OmittedFeature {
  readonly featureId: FeatureId;
  readonly featureName: string;
  readonly partName: string;
}

/**
 * What the maker should know before printing — and nothing about whether they
 * may.
 */
export interface ExportReadiness {
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  /** Features that will not be on the paper, because they did not resolve. */
  readonly omitted: readonly OmittedFeature[];
}

/**
 * The export warning, decided in the domain.
 *
 * **Nothing blocks.** A pattern with a warning on it is still a pattern someone
 * may want on paper, and a tool that refuses to print because a hole is 1.4 mm
 * from an edge gets worked around within a day — by exporting from a copy with
 * the hole moved, which is worse than printing the warning.
 *
 * It says two things that must not be conflated:
 *
 * - **how many rules are broken**, which is the diagnostic list summarised; and
 * - **what is missing from the paper**, which is not a count of problems at all.
 *   A feature that failed to build is silently absent from the template, and a
 *   maker cutting from that template has no way to know it was ever there. That
 *   is the more serious half.
 *
 * Hidden features are left off too, and are deliberately **not** reported: the
 * maker turned them off and the parts panel shows it. Warning about a choice
 * someone just made teaches them to dismiss the warning that matters.
 *
 * The dialog renders this. It does not compute it, does not decide what counts
 * as serious, and cannot drift from what the exporter actually draws, because
 * `omitted` comes from the same `ok` flag the scene builder filters on.
 */
export function exportReadiness(project: Project): ExportReadiness {
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const diagnostic of diagnose(project)) {
    if (diagnostic.severity === 'error') errors += 1;
    else if (diagnostic.severity === 'warning') warnings += 1;
    else infos += 1;
  }

  const omitted: OmittedFeature[] = [];
  for (const { part, features } of evaluate(project).parts) {
    for (const entry of features) {
      if (entry.ok) continue;
      omitted.push({
        featureId: entry.feature.id,
        featureName: entry.feature.name,
        partName: part.name,
      });
    }
  }

  return { errors, warnings, infos, omitted };
}
