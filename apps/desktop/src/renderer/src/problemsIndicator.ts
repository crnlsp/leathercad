import type { Severity, SeverityCounts } from '@leathercad/domain';

import type { I18n } from '../../shared/i18n.js';

/** What Print's second half shows (R-06): a check, or the worst severity there is. */
export type IndicatorState = 'clear' | Severity;

/**
 * The problems indicator, from the counts the Problems drawer reads too
 * (`countBySeverity`): an error outranks warnings, which outrank what is only
 * to note, and its count is of that severity alone — the tooltip says the
 * rest. Clear only for an empty list, so it never says *nothing to fix* while
 * the drawer lists something.
 */
export function indicatorOf(counts: SeverityCounts): {
  readonly state: IndicatorState;
  readonly count: number;
} {
  for (const severity of ['error', 'warning', 'info'] as const) {
    if (counts[severity] > 0) return { state: severity, count: counts[severity] };
  }
  return { state: 'clear', count: 0 };
}

/** `1 error, 2 warnings`, worst first; null when there is nothing. */
export function describeCounts(counts: SeverityCounts, i18n: I18n): string | null {
  const said = [
    counts.error === 0 ? null : i18n.t('problems.counts.error', { count: counts.error }),
    counts.warning === 0 ? null : i18n.t('problems.counts.warning', { count: counts.warning }),
    counts.info === 0 ? null : i18n.t('problems.counts.info', { count: counts.info }),
  ].filter((part): part is string => part !== null);
  return said.length === 0 ? null : i18n.list(said, 'unit');
}
