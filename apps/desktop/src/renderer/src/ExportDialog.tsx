import { formatMm } from '@leathercad/core';
import type { Project } from '@leathercad/domain';
import {
  EXPORT_INTENTS,
  EXPORT_PRESETS,
  EXPORT_ROLES,
  drawingBoundsOf,
  intentOf,
  type ExportRole,
} from '@leathercad/export';
import { useEffect, useId, useMemo, useRef } from 'react';

import { withRole } from './exportChoice.js';
import { useI18n } from './i18n.js';
import { drawingSceneFor } from './sheets.js';
import type { DrawingFormat } from './useProjectFile.js';

/**
 * What goes into an SVG or a DXF before it is written (6.4): an intent, which
 * chooses the layers, and the layers, which the maker may then adjust.
 *
 * It reports and does not compute: the roles are a preset's or the maker's, the
 * scene is the one the file is written from, and the page it shows is that
 * scene's own box. The choice lives in the app's preferences — the caller owns
 * it — and never in the project.
 */
export function ExportDialog({
  project,
  format,
  roles,
  onRoles,
  onExport,
  onCancel,
}: {
  project: Project;
  format: DrawingFormat;
  roles: readonly ExportRole[];
  onRoles: (roles: readonly ExportRole[]) => void;
  onExport: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ids = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>('input:checked, input')?.focus();
  }, []);

  const page = useMemo(() => drawingBoundsOf(drawingSceneFor(project, roles)), [project, roles]);
  const intent = intentOf(roles);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}title`}
        data-testid="export-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h3 id={`${ids}title`}>{t('exportDialog.title', { format: t(`file.${format}`) })}</h3>
        <p>{t('exportDialog.intro')}</p>

        <div ref={bodyRef} className="export-groups">
          <fieldset>
            <legend>{t('exportDialog.intent')}</legend>
            {EXPORT_INTENTS.map((each) => (
              <label key={each} className="export-choice">
                <input
                  type="radio"
                  name={`${ids}intent`}
                  data-testid={`export-intent-${each}`}
                  checked={intent === each}
                  aria-describedby={`${ids}${each}`}
                  onChange={() => onRoles(EXPORT_PRESETS[each])}
                />
                <span>
                  {t(`exportDialog.intents.${each}.name`)}
                  <span id={`${ids}${each}`} className="dialog-note export-note">
                    {t(`exportDialog.intents.${each}.note`)}
                  </span>
                </span>
              </label>
            ))}
            {intent === null && (
              <p className="export-custom" data-testid="export-custom">
                {t('exportDialog.custom')}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend>{t('exportDialog.layers')}</legend>
            {EXPORT_ROLES.map((role) => (
              <label key={role} className="export-choice">
                <input
                  type="checkbox"
                  data-testid={`export-layer-${role}`}
                  checked={roles.includes(role)}
                  onChange={(event) => onRoles(withRole(roles, role, event.target.checked))}
                />
                {t(`exportDialog.roles.${role}`)}
              </label>
            ))}
          </fieldset>
        </div>

        <p className="export-page" data-testid="export-page" aria-live="polite">
          {page === null
            ? t('exportDialog.nothing')
            : t('exportDialog.page', {
                width: formatMm(page.maxX - page.minX),
                height: formatMm(page.maxY - page.minY),
              })}
        </p>

        <div className="dialog-actions">
          <button type="button" className="tool" data-testid="export-cancel" onClick={onCancel}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="tool primary"
            data-testid="export-go"
            disabled={page === null}
            onClick={onExport}
          >
            {t('exportDialog.export')}
          </button>
        </div>
      </div>
    </div>
  );
}
