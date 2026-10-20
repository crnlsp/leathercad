import type { UpdateStatus } from '@leathercad/platform';

import { useI18n } from './i18n.js';

/**
 * What the update check found (8.9), in a line: About's and Settings › Updates'.
 * Nothing when nothing was asked, or when Flathub keeps the copy up to date —
 * Settings says that in its own words.
 */
export function UpdateLine({ status }: { status: UpdateStatus }) {
  const { t } = useI18n();
  if (status.state === 'idle' || status.state === 'managed') return null;
  return (
    <p className="dialog-note" data-testid="update-status" data-state={status.state}>
      {status.state === 'current' && t('updates.current')}
      {status.state === 'failed' && t('updates.failed')}
      {status.state === 'available' && (
        <>
          {t('updates.available', { version: status.version })}{' '}
          {/* An https link: the window-open handler sends it to the browser. */}
          <a href={status.url} target="_blank" rel="noreferrer" data-testid="update-link">
            {t('updates.availableLink')}
          </a>
        </>
      )}
    </p>
  );
}
