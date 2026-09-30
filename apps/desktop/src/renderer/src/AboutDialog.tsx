import { useEffect, useRef } from 'react';

import iconUrl from '../../../build/icon.svg';
import { useI18n } from './i18n.js';
import { getPlatformHost } from './platformBridge.js';

/**
 * About LeatherCAD (8.7), from Help and from macOS's app menu: the one place
 * the application says what it is. The full-colour icon is the product's
 * picture, not chrome, so this is the one place in the window it appears.
 */
export function AboutDialog({ version, onClose }: { version: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const host = getPlatformHost();
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        data-testid="about-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <div className="about-identity">
          <img src={iconUrl} width={64} height={64} alt="" />
          <div>
            <h3 id="about-dialog-title">LeatherCAD</h3>
            <p data-testid="about-version">{t('about.version', { version: version ?? '…' })}</p>
          </div>
        </div>
        <p>{t('about.blurb')}</p>
        {/* An https link: the window-open handler sends it to the browser. */}
        <p>
          <a href="https://github.com/crnlsp/leathercad" target="_blank" rel="noreferrer">
            {t('about.source')}
          </a>
        </p>
        <p className="dialog-note">{t('about.reporting')}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="tool"
            data-testid="about-log-folder"
            onClick={() => void host.showLogFolder().catch(() => undefined)}
          >
            {t('about.logFolder')}
          </button>
          <button
            type="button"
            className="tool"
            data-testid="about-notices"
            onClick={() => void host.openNotices().catch(() => undefined)}
          >
            {t('about.notices')}
          </button>
          <button
            ref={closeRef}
            type="button"
            className="tool"
            data-testid="about-close"
            onClick={onClose}
          >
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
