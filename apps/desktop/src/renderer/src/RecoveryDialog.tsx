import { useEffect, useRef } from 'react';

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
  const recoverRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    recoverRef.current?.focus();
  }, []);

  const name = projectName.trim() === '' ? 'Untitled' : projectName.trim();
  const when = new Date(savedAt).toLocaleString();
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
        <h3 id="recovery-dialog-title">LeatherCAD did not close properly</h3>
        <p id="recovery-dialog-detail">
          Unsaved work on “{name}” was kept at {when}. Recovering opens it as a new, unsaved
          project; the file it came from is not changed.
        </p>
        <div className="dialog-actions">
          <button type="button" className="tool" data-testid="recovery-decline" onClick={onDecline}>
            Not now
          </button>
          <button
            ref={recoverRef}
            type="button"
            className="tool"
            data-testid="recovery-recover"
            onClick={onRecover}
          >
            Recover
          </button>
        </div>
      </div>
    </div>
  );
}
