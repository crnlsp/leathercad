import { useEffect, useRef } from 'react';

/** What the maker was doing when they were asked. */
export type DiscardingAction = 'close' | 'open' | 'new';

const CONSEQUENCE: Readonly<Record<DiscardingAction, string>> = {
  close: 'If you close without saving, your changes are lost.',
  open: 'Opening another project replaces this one, and your changes are lost.',
  new: 'Starting a new project replaces this one, and your changes are lost.',
};

/**
 * Asks before unsaved work is thrown away (slice 5.3a).
 *
 * One question for the three ordinary actions that used to destroy work
 * without a word: closing the window, opening another project, and starting a
 * new one. **Save** is where focus starts — the choice that loses nothing — and
 * Escape cancels. As in the delete dialog, key events stop here, so a shortcut
 * typed at the question cannot also switch tools behind it.
 */
export function UnsavedChangesDialog({
  projectName,
  action,
  onSave,
  onDiscard,
  onCancel,
}: {
  projectName: string;
  action: DiscardingAction;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    saveRef.current?.focus();
  }, []);

  const name = projectName.trim() === '' ? 'Untitled' : projectName.trim();
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        aria-describedby="unsaved-dialog-consequence"
        data-testid="unsaved-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h3 id="unsaved-dialog-title">Save changes to “{name}”?</h3>
        <p id="unsaved-dialog-consequence">{CONSEQUENCE[action]}</p>

        <div className="dialog-actions">
          <button type="button" className="tool" data-testid="unsaved-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="tool danger"
            data-testid="unsaved-discard"
            onClick={onDiscard}
          >
            Don’t save
          </button>
          <button
            ref={saveRef}
            type="button"
            className="tool"
            data-testid="unsaved-save"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
