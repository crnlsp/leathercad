import { useEffect, useRef } from 'react';

import { useI18n } from './i18n.js';

/**
 * Offers back the work a crash interrupted (slice 5.3b).
 *
 * Both answers are safe. *Recover* opens the copy untitled and unsaved, so it
 * can never be saved over the file it came from; *Not now* keeps the copy on
 * disk until LeatherCAD next closes cleanly. Focus starts on *Recover*, and
 * Escape is *Not now*.
 */
export function RecoveryDialog({
  projectName,
  savedAt,
  onRecover,
  onDecline,
}: {
  projectName: string;
  savedAt: string;
  onRecover: () => void;
  onDecline: () => void;
}) {
  const { t, locale } = useI18n();
  const recoverRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    recoverRef.current?.focus();
  }, []);

  const name = projectName.trim() === '' ? t('app.untitled') : projectName.trim();
  // In the interface's language, and the system's regional form of it.
  const when = new Date(savedAt).toLocaleString(locale);
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recovery-dialog-title"
        aria-describedby="recovery-dialog-detail"
        data-testid="recovery-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onDecline();
        }}
      >
        <h3 id="recovery-dialog-title">{t('recovery.title')}</h3>
        <p id="recovery-dialog-detail">{t('recovery.detail', { name, when })}</p>
        <div className="dialog-actions">
          <button type="button" className="tool" data-testid="recovery-decline" onClick={onDecline}>
            {t('recovery.decline')}
          </button>
          <button
            ref={recoverRef}
            type="button"
            className="tool"
            data-testid="recovery-recover"
            onClick={onRecover}
          >
            {t('recovery.recover')}
          </button>
        </div>
      </div>
    </div>
  );
}
