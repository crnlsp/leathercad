import { badgesOf, type Diagnostic, type Project } from '@leathercad/domain';

import { CountBadge } from './CountBadge.js';
import { ProblemRows } from './ProblemList.js';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Icon } from './icons/Icon.js';

/**
 * Everything wrong with the design, in one place — a drawer under the canvas.
 *
 * Reads `diagnose` and computes nothing of its own — the status count, the
 * property panel and the canvas markers are the same list seen from different
 * angles (X7). Clicking a row **selects what the problem is about and frames
 * what it is about it**, which is how a problem becomes something you can fix.
 *
 * It used to share the left column with the tool rail and the parts tree, so
 * every problem shrank the only route to a locked feature (audit §3.3). Under
 * the canvas it has the full width a list of sentences wants, and collapsed it
 * is a 28 px handle that still says the verdict — *Nothing to fix*, or how many
 * and how bad — so closing it never hides that something is wrong
 * (UI Foundations §7.1).
 */
export function ProblemsPanel({
  project,
  diagnostics,
  onGoTo,
  open,
  onToggle,
}: {
  project: Project;
  diagnostics: readonly Diagnostic[];
  onGoTo: (diagnostic: Diagnostic) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const badge = badgesOf(diagnostics).project;
  const count = diagnostics.length;

  return (
    <section
      className={open ? 'problems-drawer open' : 'problems-drawer'}
      data-testid="problems-panel"
      aria-label="Problems"
    >
      <button
        type="button"
        className="drawer-handle"
        data-testid="problems-toggle"
        aria-expanded={open}
        aria-controls={open && count > 0 ? 'problems-body' : undefined}
        onClick={onToggle}
      >
        <span className="drawer-title">Problems</span>
        <CountBadge badge={badge} />
        <span className="drawer-verdict">
          {count === 0 ? 'Nothing to fix.' : `${count} ${count === 1 ? 'problem' : 'problems'}`}
        </span>
        <span className="drawer-chevron" aria-hidden="true">
          <Icon of={open ? ChevronDown : ChevronUp} />
        </span>
      </button>

      {open && count > 0 && (
        <div className="drawer-body" id="problems-body">
          <ProblemRows diagnostics={diagnostics} project={project} onGoTo={onGoTo} />
        </div>
      )}
    </section>
  );
}
