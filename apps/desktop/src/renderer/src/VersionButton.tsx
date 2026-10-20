import type { UpdateStatus } from '@leathercad/platform';
import { useState } from 'react';

import { useI18n } from './i18n.js';
import { Tooltip } from './Tooltip.js';

/**
 * The version, at the status bar's left (8.9): pressed, it checks for a new
 * one, as Settings › Updates' *Check now* does. Its tooltip says so, then
 * what the check found; a new version also marks Settings.
 */
export function VersionButton({
  version,
  updates,
  onCheck,
}: {
  version: string | null;
  updates: UpdateStatus;
  onCheck: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  // What this button's own check found is said; the start's is Settings' news.
  const [asked, setAsked] = useState(false);
  const found =
    !asked || checking
      ? null
      : updates.state === 'current'
        ? t('updates.current')
        : updates.state === 'failed'
          ? t('updates.failed')
          : updates.state === 'available'
            ? t('updates.available', { version: updates.version })
            : null;
  // The Flatpak's copy is Flathub's to update: the version is only the version.
  if (updates.state === 'managed') {
    return (
      <>
        v<span data-testid="app-version">{version ?? '…'}</span>
      </>
    );
  }
  return (
    <>
      <Tooltip
        text={checking ? t('settings.updates.checking') : (found ?? t('status.checkForUpdates'))}
      >
        <button
          type="button"
          className="status-version"
          data-testid="version-button"
          // Not disabled while it checks: that would drop focus and the tooltip.
          onClick={() => {
            if (checking) return;
            setChecking(true);
            setAsked(true);
            void onCheck().finally(() => setChecking(false));
          }}
        >
          v<span data-testid="app-version">{version ?? '…'}</span>
        </button>
      </Tooltip>
      <span className="visually-hidden" aria-live="polite" data-testid="version-check-result">
        {found}
      </span>
    </>
  );
}
