import type { UpdateStatus } from '@leathercad/platform';
import { ArrowUp, Check, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { Spinner, useChecking } from './Spinner.js';
import { Tooltip } from './Tooltip.js';
import { useMinutesUntilAgain } from './updateWait.js';

/**
 * The version, at the status bar's left (8.9): pressed, it checks for a new
 * one, as Settings › Updates' *Check now* does. Once either has an answer the
 * version becomes a chip that says it — a sage tick for the latest, a tan
 * arrow and the new number for a newer one, an orange triangle for a check
 * that failed — and its tooltip says when it may be pressed again: not for
 * five minutes after an answer. While it asks, a spinner turns beside it.
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
  const [checking, check] = useChecking(onCheck);
  const wait = useMinutesUntilAgain(updates);
  // Only this button's own press is announced: Check now's is Settings' news.
  const [asked, setAsked] = useState(false);
  const found =
    updates.state === 'current'
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
  const tooltip = checking
    ? t('settings.updates.checking')
    : found === null
      ? t('status.checkForUpdates')
      : wait === null
        ? found
        : `${found} ${t('updates.again', { count: wait })}`;
  return (
    <>
      <Tooltip text={tooltip}>
        <button
          type="button"
          className="status-version"
          data-testid="version-button"
          data-state={updates.state}
          // Not disabled while it waits: that would drop focus and the tooltip.
          aria-disabled={wait !== null}
          onClick={() => {
            if (wait !== null) return;
            setAsked(true);
            check();
          }}
        >
          {updates.state === 'available' ? <Icon of={ArrowUp} size={12} /> : null}
          <span>
            v<span data-testid="app-version">{version ?? '…'}</span>
          </span>
          {updates.state === 'available' ? (
            <span className="status-version-next">
              {t('status.versionNext', { version: updates.version })}
            </span>
          ) : null}
          {checking ? (
            <Spinner size={12} />
          ) : updates.state === 'current' ? (
            <Icon of={Check} size={12} />
          ) : updates.state === 'failed' ? (
            <Icon of={TriangleAlert} size={12} />
          ) : null}
        </button>
      </Tooltip>
      <span className="visually-hidden" aria-live="polite" data-testid="version-check-result">
        {asked && !checking ? found : null}
      </span>
    </>
  );
}
