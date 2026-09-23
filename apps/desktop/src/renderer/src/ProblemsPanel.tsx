import { badgesOf, type Diagnostic, type Project } from '@leathercad/domain';

import { CountBadge } from './CountBadge.js';
import { ProblemRows } from './ProblemList.js';

/**
 * Everything wrong with the design, in one place.
 *
 * Reads `diagnose` and computes nothing of its own — the status count, the
 * property panel and the canvas markers are the same list seen from different
 * angles (X7). Clicking a row **selects what the problem is about and frames
 * what it is about it**, which is how a problem becomes something you can fix.
 */
export function ProblemsPanel({
  project,
  diagnostics,
  onGoTo,
}: {
  project: Project;
  diagnostics: readonly Diagnostic[];
  onGoTo: (diagnostic: Diagnostic) => void;
}) {
  const badge = badgesOf(diagnostics).project;

  return (
    <aside className="panel problems" data-testid="problems-panel">
      <h2>
        Problems
        <CountBadge badge={badge} />
      </h2>

      {diagnostics.length === 0 ? (
        <p className="panel-empty">Nothing to fix.</p>
      ) : (
        <ProblemRows diagnostics={diagnostics} project={project} onGoTo={onGoTo} />
      )}
    </aside>
  );
}
