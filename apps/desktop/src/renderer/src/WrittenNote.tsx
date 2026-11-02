import { useEffect, useState } from 'react';

import { Icon } from './icons/Icon.js';
import { useI18n } from './i18n.js';
import { fileName, type Written } from './useProjectFile.js';

// Long enough to be read after a glance down from the board; short enough to
// be gone before it reads as news about something later.
const SHOWN_MS = 4000;

/**
 * A file was just written — saved or exported — said once in the status bar,
 * then gone.
 *
 * A clean export used to leave no trace: nothing to check, so no notice, and an
 * SVG or a DXF is not opened afterwards. Saving a saved project was the same,
 * "Saved" before and after. A press that seems to do nothing feels broken. The
 * words light up and settle to the bar's colour (styles.css): colour, never
 * movement, and reduced motion keeps the words without the light.
 *
 * The live region stays mounted so a screen reader hears each write.
 */
export function WrittenNote({ written }: { written: Written | null }) {
  const { t } = useI18n();
  const [expired, setExpired] = useState<Written | null>(null);

  useEffect(() => {
    if (written === null) return;
    const timer = setTimeout(() => setExpired(written), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [written]);

  const shown = written === expired ? null : written;
  return (
    <span className="written-note" role="status">
      {shown !== null && (
        // Keyed by the write, so a second save of the same file lights again.
        <span key={shown.serial} data-testid="written-note">
          <Icon of="check" size={12} />
          {t(shown.kind === 'save' ? 'status.saved' : 'status.exported', {
            name: fileName(shown.path),
          })}
        </span>
      )}
    </span>
  );
}
