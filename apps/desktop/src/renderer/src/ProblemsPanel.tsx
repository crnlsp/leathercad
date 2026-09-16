import type { DocumentStore } from '@leathercad/document';
import type { Diagnostic, Project } from '@leathercad/domain';

import { ProblemRows } from './ProblemList.js';

/**
 * Everything wrong with the design, in one place.
 *
 * Reads `diagnose` and computes nothing of its own — the status count, the
 * property panel and the canvas markers are the same list seen from different
 * angles (X7). Clicking a row selects what it is about, which is how a problem
 * becomes something you can fix.
 */
export function ProblemsPanel({
  store,
  project,
  diagnostics,
}: {
  store: DocumentStore;
  project: Project;
  diagnostics: readonly Diagnostic[];
}) {
  return (
    <aside className="panel problems" data-testid="problems-panel">
      <h2>
        Problems
        {diagnostics.length > 0 && <span className="badge">{diagnostics.length}</span>}
      </h2>

      {diagnostics.length === 0 ? (
        <p className="panel-empty">Nothing to fix.</p>
      ) : (
        <ProblemRows
          diagnostics={diagnostics}
          project={project}
          onSelect={(featureId) => store.select([featureId])}
        />
      )}
    </aside>
  );
}
