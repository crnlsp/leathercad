import { productionSummary, type Project } from '@leathercad/domain';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import type { IconName } from './icons/names.js';
import {
  productionRows,
  productionSheet,
  productionText,
  type ProductionFigure,
} from './productionText.js';
import { resolvedFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

/** Each figure's icon, on a ground tile in the colour its lines have on the board. */
const FIGURE_ICON: Readonly<Record<ProductionFigure['id'], IconName>> = {
  pieces: 'scissors',
  holes: 'holes',
  thread: 'spool',
  leather: 'hide',
};

/**
 * What to cut, punch and buy, with nothing selected (9.12): four figures at a
 * glance, then the cut list. Computed from the pattern on every render, never
 * stored; *Copy* writes the same facts with every word spelled out.
 */
export function ProductionSummary({ project }: { project: Project }) {
  const i18n = useI18n();
  const { t } = i18n;
  const summary = useMemo(() => productionSummary(resolvedFor(project)), [project]);
  const sheet = useMemo(() => productionSheet(summary, i18n), [summary, i18n]);
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (outcome === null) return;
    const timer = setTimeout(() => setOutcome(null), 2000);
    return () => clearTimeout(timer);
  }, [outcome]);

  const copy = () => {
    const name = project.name.trim() === '' ? t('app.untitled') : project.name;
    navigator.clipboard.writeText(productionText(name, productionRows(summary, i18n), i18n)).then(
      () => setOutcome('copied'),
      () => setOutcome('failed'),
    );
  };

  return (
    <section className="panel-group production" data-testid="production-summary">
      <div className="production-head">
        <div className="panel-heading">{t('production.heading')}</div>
        <Tooltip text={t('production.copySummary')}>
          <button
            className="production-copy"
            data-testid="production-copy"
            aria-label={t('production.copySummary')}
            onClick={copy}
          >
            <Icon of={outcome === 'copied' ? 'check' : 'duplicate'} />
          </button>
        </Tooltip>
        <span role="status" className="visually-hidden" data-testid="production-copy-status">
          {outcome === null
            ? ''
            : t(outcome === 'copied' ? 'production.copied' : 'production.copyFailed')}
        </span>
      </div>

      <div className="production-figures">
        {sheet.figures.map((figure) => (
          <Tooltip key={figure.id} text={figure.tip}>
            <div className="production-figure" tabIndex={0} data-testid={`production-${figure.id}`}>
              <span className="production-tile" data-figure={figure.id}>
                <Icon of={FIGURE_ICON[figure.id]} />
              </span>
              <span className="production-value">{figure.value}</span>
              <span className="production-caption">{figure.caption}</span>
            </div>
          </Tooltip>
        ))}
      </div>

      <div className="production-list" data-testid="production-cut-list">
        <div className="production-list-head">
          <h3>{t('production.cutList')}</h3>
          <span>{t('production.cutListCount', { count: sheet.cutList.length })}</span>
        </div>
        <ul>
          {sheet.cutList.map((line, index) => (
            <li key={index} className="production-line">
              <span className="production-line-name">{line.name}</span>
              {line.mirrored !== null && (
                <Tooltip text={line.mirrored}>
                  <span className="production-mirrored" role="img" aria-label={line.mirrored}>
                    <Icon of="mirror-lr" size={14} />
                  </span>
                </Tooltip>
              )}
              <span className="production-line-quantity">{line.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      {sheet.hardware.length > 0 && (
        <div className="production-list" data-testid="production-hardware">
          <div className="production-list-head">
            <h3>{t('production.hardware')}</h3>
          </div>
          <ul>
            {sheet.hardware.map((line) => (
              <li key={line} className="production-line">
                <span className="production-line-name">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
