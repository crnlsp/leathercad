import { useMemo } from 'react';
import { pocketSize } from '@leathercad/domain';
import type { Path } from '@leathercad/geometry';

import { useI18n } from './i18n.js';

/** The same domain reading in Properties and beside the selected stitching. */
export function PocketReading({ path, compact = false }: { path: Path; compact?: boolean }) {
  const { t, locale } = useI18n();
  const size = useMemo(() => pocketSize(path), [path]);
  if (path.closed || (compact && size === null)) return null;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const reading =
    size === null ? null : (
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
      <p className="panel-note">{t(size === null ? 'pocket.unavailable' : 'pocket.note')}</p>
    </section>
  );
}
