import { useEffect, useRef } from 'react';

import { useI18n } from './i18n.js';

/** What the maker was doing when they were asked; its consequence is `unsaved.consequence.<action>`. */
export type DiscardingAction = 'close' | 'open' | 'new';

/**
 * Asks before unsaved work is thrown away (slice 5.3a).
 *
 * One question for the three ordinary actions that used to destroy work
 * without a word: closing the window, opening another project, and starting a
 * new one. **Save** is where focus starts — the choice that loses nothing — and
 * Escape cancels. As in the delete dialog, key events stop here, so a shortcut
 * typed at the question cannot also switch tools behind it.
 */
export function UnsavedChangesDialog({
  projectName,
  action,
  onSave,
  onDiscard,
  onCancel,
}: {
  projectName: string;
  action: DiscardingAction;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    saveRef.current?.focus();
  }, []);

  const name = projectName.trim() === '' ? t('app.untitled') : projectName.trim();
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        aria-describedby="unsaved-dialog-consequence"
        data-testid="unsaved-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h3 id="unsaved-dialog-title">{t('unsaved.title', { name })}</h3>
        <p id="unsaved-dialog-consequence">{t(`unsaved.consequence.${action}`)}</p>

        <div className="dialog-actions">
          <button type="button" className="tool" data-testid="unsaved-cancel" onClick={onCancel}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="tool danger"
            data-testid="unsaved-discard"
            onClick={onDiscard}
          >
            {t('unsaved.discard')}
          </button>
          <button
            ref={saveRef}
            type="button"
            className="tool"
            data-testid="unsaved-save"
            onClick={onSave}
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
