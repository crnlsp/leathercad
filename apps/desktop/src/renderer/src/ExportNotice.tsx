import { TILE_OVERLAP_MM } from '@leathercad/export';
import { useEffect, useRef } from 'react';

import { useI18n } from './i18n.js';
import { describeTiled } from './sheetWords.js';
import type { ExportReport } from './useProjectFile.js';

/**
 * What the maker should know about the template they just exported.
 *
 * **Nothing blocked it.** A pattern with a warning on it is still a pattern
 * someone may want on paper, and a tool that refuses to print because a hole is
 * 1.4 mm from an edge gets worked around within a day — by exporting from a
 * copy with the hole moved, which is worse than printing the warning. The PDF
 * is written and open by the time this appears.
 *
 * Two facts, kept apart because they are not the same fact:
 *
 * - **rules broken**, which are on the paper and can be looked at; and
 * - **features missing**, which are not on the paper at all. A maker cutting
 *   from a template has no way to know a piece was ever meant to be there, so
 *   this is the half that is named feature by feature rather than counted.
 *
 * And, since tiling (7.2a), a third: **parts printed across sheets**, each
 * named with its grid and the paper that would hold it whole, and how the
 * sheets go together. Not a problem — the file is complete — but a maker
 * holding six sheets needs to know which belong together and how.
 *
 * Everything here comes from `exportReadiness` and the pagination. This file
 * decides no severity, counts nothing, and cannot disagree with what the
 * exporter drew.
 */
export function ExportNotice({ report, onClose }: { report: ExportReport; onClose: () => void }) {
  const { t } = useI18n();
  const { readiness } = report;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-notice-title"
        data-testid="export-notice"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <h3 id="export-notice-title">
          {readiness.omitted.length === 0 &&
          readiness.errors + readiness.warnings + readiness.infos === 0
            ? t('exportNotice.titleTiled')
            : report.format === 'pdf'
              ? t('exportNotice.titleCheck')
              : t('exportNotice.titleCheckFile', { format: report.format.toUpperCase() })}
        </h3>

        <ExportFindings report={report} />

        <div className="dialog-actions">
          <button ref={closeRef} type="button" className="tool" onClick={onClose}>
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The findings themselves, without the dialog: the export notice shows them
 * once the file is written, and the Print Preview before anything is printed
 * (7.6).
 */
export function ExportFindings({ report }: { report: ExportReport }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { readiness, tiled } = report;
  // What the paper or the file holds: an SVG or a DXF is a file, not a sheet.
  const file = report.format !== 'pdf';
  const counts = [
    readiness.errors === 0 ? null : t('exportNotice.errors', { count: readiness.errors }),
    readiness.warnings === 0 ? null : t('exportNotice.warnings', { count: readiness.warnings }),
    readiness.infos === 0 ? null : t('exportNotice.infos', { count: readiness.infos }),
  ].filter((part): part is string => part !== null);

  return (
    <>
      {tiled.length > 0 && (
        <section className="dialog-group" data-testid="export-tiled">
          <p>
            <b>{t('exportNotice.tiledLead', { count: tiled.length })}</b>{' '}
            {t('exportNotice.tiledAcross', { overlap: TILE_OVERLAP_MM })}
          </p>
          <ul>
            {tiled.map((entry) => (
              <li key={entry.part.id}>{describeTiled(entry, t)}</li>
            ))}
          </ul>
        </section>
      )}

      {readiness.omitted.length > 0 && (
        <section className="dialog-group" data-testid="export-omitted">
          <p>
            <b>
              {t(file ? 'exportNotice.omittedLeadFile' : 'exportNotice.omittedLead', {
                count: readiness.omitted.length,
              })}
            </b>{' '}
            {t(file ? 'exportNotice.omittedFile' : 'exportNotice.omitted')}
          </p>
          <ul>
            {readiness.omitted.map((feature) => (
              <li key={feature.featureId}>
                <b>{feature.featureName}</b>{' '}
                <span className="dialog-note">
                  {t('exportNotice.inPart', { part: feature.partName })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {counts.length > 0 && (
        <p data-testid="export-counts">
          {t(file ? 'exportNotice.countsFile' : 'exportNotice.counts', {
            counts: i18n.list(counts, 'unit'),
          })}
        </p>
      )}
    </>
  );
}
