import { useEffect, useRef } from 'react';

import { SHORTCUT_GROUPS, keysFor } from './shortcuts.js';

/**
 * The keyboard shortcut map (slice 8.2), from *Help › Keyboard Shortcuts*,
 * Ctrl+/ or `?`.
 *
 * A reference, not a question: nothing in it changes anything, so Escape, the
 * button and a click outside all close it. Key events stop here, as in the
 * other dialogs, so a letter typed while it is open cannot switch tools
 * behind it.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const isMac = navigator.userAgent.includes('Mac');
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-dialog-title"
        data-testid="shortcuts-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <h3 id="shortcuts-dialog-title">Keyboard shortcuts</h3>
        <div className="shortcuts-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h4>{group.title}</h4>
              <dl>
                {group.shortcuts.map((shortcut) => (
                  <div className="shortcut-row" key={`${group.title}-${shortcut.does}`}>
                    <dt>
                      {shortcut.keys.map((keys, index) => (
                        <span key={keys}>
                          {index > 0 && <span className="shortcut-or"> or </span>}
                          <kbd>{keysFor(keys, isMac)}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{shortcut.does}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="dialog-actions">
          <button
            ref={closeRef}
            type="button"
            className="tool"
            data-testid="shortcuts-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
