import type { Badge } from '@leathercad/domain';
import { Tooltip } from './Tooltip.js';

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
  if (badge === null) return null;

  const what = badge.count === 1 ? 'problem' : 'problems';
  return (
    <Tooltip text={title ?? `${badge.count} ${what}, worst: ${badge.worst}`}>
      <span
        className={`badge severity-${badge.worst}`}
        data-testid="count-badge"
        data-severity={badge.worst}
      >
        {badge.count}
      </span>
    </Tooltip>
  );
}
