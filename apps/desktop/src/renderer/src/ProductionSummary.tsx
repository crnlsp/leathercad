import { productionSummary, type Project } from '@leathercad/domain';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from './i18n.js';
import { productionRows, productionText } from './productionText.js';
import { resolvedFor } from './sheets.js';

/**
 * What to cut, punch and buy, with nothing selected (9.12): computed from the
 * pattern on every render, never stored, and the same words *Copy* puts on the
 * clipboard.
 */
export function ProductionSummary({ project }: { project: Project }) {
  const i18n = useI18n();
  const { t } = i18n;
  const rows = useMemo(
    () => productionRows(productionSummary(resolvedFor(project)), i18n),
    [project, i18n],
  );
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (outcome === null) return;
    const timer = setTimeout(() => setOutcome(null), 2000);
    return () => clearTimeout(timer);
  }, [outcome]);

  const copy = () => {
    const name = project.name.trim() === '' ? t('app.untitled') : project.name;
    navigator.clipboard.writeText(productionText(name, rows, i18n)).then(
      () => setOutcome('copied'),
      () => setOutcome('failed'),
    );
  };

  return (
    <section className="panel-group production" data-testid="production-summary">
      <div className="panel-heading">{t('production.heading')}</div>
      {rows.map((row) => (
        <div key={row.id} data-testid={`production-${row.id}`}>
          <div className="job-row">
            <span className="field-label">{row.label}</span>
            <span className="job-value">{row.value !== '' && <b>{row.value}</b>}</span>
          </div>
          {row.details.map((detail) => (
            <div key={detail} className="production-detail">
              {detail}
            </div>
          ))}
        </div>
      ))}
      <div className="toolbar">
        <button className="tool" data-testid="production-copy" onClick={copy}>
          {t('production.copy')}
        </button>
        <span role="status" data-testid="production-copy-status">
          {outcome === null
            ? ''
            : t(outcome === 'copied' ? 'production.copied' : 'production.copyFailed')}
        </span>
      </div>
    </section>
  );
}
