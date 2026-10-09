import type { Badge } from '@leathercad/domain';
import { useI18n } from './i18n.js';
import { Tooltip } from './Tooltip.js';
import { SeverityGlyph } from './SeverityGlyph.js';

/**
 * How many problems, coloured by the worst of them.
 *
 * Both numbers come from the domain: the count is the length of a list nobody
 * here filtered, and the colour is a fold over severities the domain assigned.
 * Nothing about a badge is a judgement this file makes — that is the rule the
 * whole slice runs on.
 *
 * **Nothing at zero.** An empty badge is chrome that teaches nothing, and a row
 * of grey noughts is how a panel stops being read.
 */
export function CountBadge({ badge, title }: { badge: Badge | null; title?: string }) {
  const { t } = useI18n();
  if (badge === null) return null;

  const severity = t(`problems.severity.${badge.worst}`);
  return (
    <Tooltip text={title ?? t('problems.badge', { count: badge.count, severity })}>
      <span
        className={`badge severity-${badge.worst}`}
        data-testid="count-badge"
        data-severity={badge.worst}
      >
        <SeverityGlyph severity={badge.worst} />
        {badge.count}
      </span>
    </Tooltip>
  );
}
