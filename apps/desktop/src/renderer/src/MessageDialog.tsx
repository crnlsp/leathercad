import { useEffect, useId, useRef, type ReactNode } from 'react';

import { useI18n } from './i18n.js';

/**
 * Something to read, and Close (U.20): the app's own dialog where the main
 * process used to open a native message box — *a recent project is gone* —
 * or a bare window, for the third-party notices. Closed by Escape too.
 *
 * With `confirm`, a question: its action beside *Cancel*, which is where
 * focus starts — the choice that loses nothing — as a tab's *Move file to
 * Trash…* asks (8.12).
 */
export function MessageDialog({
  title,
  testId,
  className,
  onClose,
  confirm,
  children,
}: {
  title: string;
  testId: string;
  /** Beside `dialog`, for a dialog of its own size. */
  className?: string;
  onClose: () => void;
  /** An action to confirm: its words, and what it does once chosen. */
  confirm?: { readonly label: string; readonly danger?: boolean; readonly onConfirm: () => void };
  children: ReactNode;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className={className === undefined ? 'dialog' : `dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <h3 id={titleId}>{title}</h3>
        {children}
        <div className="dialog-actions">
          <button
            ref={closeRef}
            type="button"
            className="tool"
            data-testid={`${testId}-close`}
            onClick={onClose}
          >
            {confirm === undefined ? t('actions.close') : t('actions.cancel')}
          </button>
          {confirm !== undefined && (
            <button
              type="button"
              className={confirm.danger === true ? 'tool danger' : 'tool primary'}
              data-testid={`${testId}-confirm`}
              onClick={confirm.onConfirm}
            >
              {confirm.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
