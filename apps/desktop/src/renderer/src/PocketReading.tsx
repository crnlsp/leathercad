import { useMemo, type ReactNode } from 'react';
import { pocketSize } from '@leathercad/domain';
import type { Path } from '@leathercad/geometry';

import { useI18n } from './i18n.js';

/**
 * The same domain reading in Properties and beside the selected stitching.
 * Nothing at all for stitching that makes no pocket — a strap's straight run
 * is the commonest open line, and a note there would only be noise — unless
 * the maker said what it holds (`stated`): then Properties keeps the section,
 * with no reading, so the requirement can be seen and taken away (9.14b).
 */
export function PocketReading({
  path,
  compact = false,
  stated = false,
  children,
}: {
  path: Path;
  compact?: boolean;
  stated?: boolean;
  /** What the pocket holds, under the reading in Properties. */
  children?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const size = useMemo(() => pocketSize(path), [path]);
  if (size === null && (compact || !stated)) return null;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const reading = size !== null && (
    <dl className="pocket-dimensions">
      <div>
        <dt>{t('pocket.width')}</dt>
        <dd data-testid="pocket-width">
          {t('pocket.value', { value: number.format(size.widthMm) })}
        </dd>
      </div>
      <div>
        <dt>{t('pocket.depth')}</dt>
        <dd data-testid="pocket-depth">
          {t('pocket.value', { value: number.format(size.depthMm) })}
        </dd>
      </div>
    </dl>
  );
  if (compact)
    return (
      <div className="pocket-summary" data-testid="pocket-summary">
        {reading}
      </div>
    );
  return (
    <section
      className="panel-section pocket-reading"
      data-testid="pocket-reading"
      aria-label={t('pocket.title')}
    >
      <div className="panel-heading">{t('pocket.title')}</div>
      {reading}
      {size !== null && <p className="panel-note">{t('pocket.note')}</p>}
      {children}
    </section>
  );
}
