import { useEffect, useRef } from 'react';

import iconUrl from '../../../build/icon.svg';
import { getPlatformHost } from './platformBridge.js';

/**
 * About LeatherCAD (8.7), from Help and from macOS's app menu: the one place
 * the application says what it is. The full-colour icon is the product's
 * picture, not chrome, so this is the one place in the window it appears.
 */
export function AboutDialog({ version, onClose }: { version: string | null; onClose: () => void }) {
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
            <p data-testid="about-version">Version {version ?? '…'}</p>
          </div>
        </div>
        <p>
          Leathercraft patterns that print at exact 1:1 scale. Free and open source under the Apache
          License 2.0.
        </p>
        {/* An https link: the window-open handler sends it to the browser. */}
        <p>
          <a href="https://github.com/crnlsp/leathercad" target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
        </p>
        <p className="dialog-note">Reporting a problem? Attach the log.</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="tool"
            data-testid="about-log-folder"
            onClick={() => void host.showLogFolder().catch(() => undefined)}
          >
            Show log folder
          </button>
          <button
            type="button"
            className="tool"
            data-testid="about-notices"
            onClick={() => void host.openNotices().catch(() => undefined)}
          >
            Third-party notices
          </button>
          <button
            ref={closeRef}
            type="button"
            className="tool"
            data-testid="about-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
