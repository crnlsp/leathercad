import type { HistoryLabel } from '@leathercad/document';

import type { Translate } from '../../shared/i18n.js';

/**
 * An undo step in the interface's words (ADR 0018): `Delete Outline and 2
 * dependents`, `Lock 3 features`. The document says what was done; this says
 * it, for *Undo …*.
 */
export function historyText(label: HistoryLabel, t: Translate): string {
  if (label.action !== 'delete') {
    return t(`history.${label.action}`, { name: label.name ?? '', count: label.count ?? 1 });
  }
  const what = label.name ?? t('history.features', { count: label.count ?? 0 });
  const dependents = label.dependents ?? 0;
  const frozen = label.frozen ?? 0;
  if (dependents > 0 && frozen > 0) {
    return t('history.deleteWithDependentsKeepFrozen', { what, count: dependents, frozen });
  }
  if (frozen > 0) return t('history.deleteKeepFrozen', { what, frozen });
  if (dependents > 0) return t('history.deleteWithDependents', { what, count: dependents });
  return t('history.delete', { what });
}
