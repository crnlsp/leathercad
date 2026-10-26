import { useEffect, useRef } from 'react';

import { useI18n } from './i18n.js';

/**
 * Closing the window with more than one project unsaved (8.12): one question
 * about all of them, where there used to be one per tab. *Save all* saves each
 * in turn — an untitled one asks where — and stops at the first the maker backs
 * out of; *Don't save* lets them all go; *Cancel* keeps the window. Focus
 * starts on *Save all*, the choice that loses nothing, and Escape cancels.
 */
export function UnsavedProjectsDialog({
  names,
  onSaveAll,
  onDiscard,
  onCancel,
}: {
  /** The unsaved projects, as their tabs name them. */
  names: readonly string[];
  onSaveAll: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    saveRef.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-projects-title"
        aria-describedby="unsaved-projects-consequence"
        data-testid="unsaved-projects-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h3 id="unsaved-projects-title">{t('unsavedProjects.title', { count: names.length })}</h3>
        <ul className="unsaved-projects" data-testid="unsaved-projects">
          {names.map((name, index) => (
            <li key={`${String(index)}:${name}`}>{name}</li>
          ))}
        </ul>
        <p id="unsaved-projects-consequence">{t('unsavedProjects.consequence')}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="tool"
            data-testid="unsaved-projects-cancel"
            onClick={onCancel}
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="tool danger"
            data-testid="unsaved-projects-discard"
            onClick={onDiscard}
          >
            {t('unsaved.discard')}
          </button>
          <button
            ref={saveRef}
            type="button"
            className="tool primary"
            data-testid="unsaved-projects-save"
            onClick={onSaveAll}
          >
            {t('unsavedProjects.saveAll')}
          </button>
        </div>
      </div>
    </div>
  );
}
