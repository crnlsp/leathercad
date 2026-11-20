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
  const listed = open && diagnostics.length > 0;
  const counted = describeCounts(counts, i18n);
  // Accepted warnings are listed, not counted (9.16): the handle still says
  // they are there, so it never reads *nothing to fix* over a list.
  const accepted = diagnostics.filter((d) => d.accepted === true).length;
  const verdict =
    accepted === 0
      ? counted
      : i18n.list(
          [
            ...(counted === null ? [] : [counted]),
            t('problems.counts.accepted', { count: accepted }),
          ],
          'unit',
        );

  return (
    <section
      className={open ? 'problems-drawer open' : 'problems-drawer'}
      data-testid="problems-panel"
      aria-label={t('problems.panel.title')}
    >
      {/*
        One line: the handle, and while it lists something the walk through
        it. A line of its own for Previous and Next cost the board 44 px, at
        the minimum window the difference between a problem and the piece it
        names both being in view, or not (U.24e, X23).
      */}
      <div className="drawer-header">
        <button
          type="button"
          className="drawer-handle"
          data-testid="problems-toggle"
          aria-expanded={open}
          aria-controls={listed ? 'problems-body' : undefined}
          onClick={onToggle}
        >
          <span className="drawer-title">{t('problems.panel.title')}</span>
          {/*
            Seen, not read: the verdict beside it says the same in words, so
            the handle is named "Problems 1 error". Read, the badge's glyph and
            count came first, "Problems error 1 1 error" (U.24e, X22). Named
            from what it shows rather than by an aria-label, which would have
            to leave out the badge's digit that is seen (WCAG 2.5.3).
          */}
          <span className="drawer-badge" aria-hidden="true">
            <CountBadge badge={badge} />
          </span>
          <span className="drawer-verdict" data-testid="problems-verdict">
            {verdict ?? t('problems.panel.none')}
          </span>
          <span className="drawer-chevron" aria-hidden="true">
            <Icon of={open ? 'chevron-down' : 'chevron-up'} />
          </span>
        </button>
        {listed && (
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
        )}
      </div>

      {listed && (
        <div className="drawer-body" id="problems-body">
          <ProblemRows
            diagnostics={diagnostics}
            project={project}
            onGoTo={onGoTo}
            current={current}
          />
        </div>
      )}
    </section>
  );
}
