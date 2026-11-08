import { badgesOf, type Diagnostic, type Project, type SeverityCounts } from '@leathercad/domain';

import { CountBadge } from './CountBadge.js';
import { useI18n } from './i18n.js';
import { ProblemRows } from './ProblemList.js';
import { describeCounts } from './problemsIndicator.js';
import { Tooltip } from './Tooltip.js';
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
 * of each severity — so closing it never hides that something is wrong
 * (UI Foundations §7.1). The counts are `countBySeverity`'s, which Print's
 * indicator reads too, so the two say one thing (U.7).
 */
export function ProblemsPanel({
  project,
  diagnostics,
  counts,
  onGoTo,
  open,
  onToggle,
  current,
  onNavigate,
}: {
  project: Project;
  diagnostics: readonly Diagnostic[];
  /** `countBySeverity(diagnostics)`. */
  counts: SeverityCounts;
  onGoTo: (diagnostic: Diagnostic) => void;
  open: boolean;
  onToggle: () => void;
  current: string | null;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const badge = badgesOf(diagnostics).project;
  const count = diagnostics.length;
  const verdict = describeCounts(counts, i18n);

  return (
    <section
      className={open ? 'problems-drawer open' : 'problems-drawer'}
      data-testid="problems-panel"
      aria-label={t('problems.panel.title')}
    >
      <button
        type="button"
        className="drawer-handle"
        data-testid="problems-toggle"
        aria-expanded={open}
        aria-controls={open && count > 0 ? 'problems-body' : undefined}
        onClick={onToggle}
      >
        <span className="drawer-title">{t('problems.panel.title')}</span>
        <CountBadge badge={badge} />
        <span className="drawer-verdict" data-testid="problems-verdict">
          {verdict ?? t('problems.panel.none')}
        </span>
        <span className="drawer-chevron" aria-hidden="true">
          <Icon of={open ? 'chevron-down' : 'chevron-up'} />
        </span>
      </button>

      {open && count > 0 && (
        <>
          <div className="problem-navigation">
            <Tooltip text={t('problems.panel.previous')} keys="previousProblem">
              <button
                type="button"
                className="tool"
                data-testid="problem-previous"
                onClick={() => onNavigate(-1)}
              >
                {t('problems.panel.previous')}
              </button>
            </Tooltip>
            <Tooltip text={t('problems.panel.next')} keys="nextProblem">
              <button
                type="button"
                className="tool"
                data-testid="problem-next"
                onClick={() => onNavigate(1)}
              >
                {t('problems.panel.next')}
              </button>
            </Tooltip>
          </div>
          <div className="drawer-body" id="problems-body">
            <ProblemRows
              diagnostics={diagnostics}
              project={project}
              onGoTo={onGoTo}
              current={current}
            />
          </div>
        </>
      )}
    </section>
  );
}
