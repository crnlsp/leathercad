import type { DeletePlan, DeleteResolution, PlannedDependent } from '@leathercad/document';
import { useEffect, useRef } from 'react';

/**
 * Asks what to do with the features that follow what is being deleted.
 *
 * ADR 0009: a delete never changes a feature the user did not name without
 * showing them first. Everything here is read from `planDelete` — the same plan
 * the command enforces — so the dialog cannot describe a different delete from
 * the one that happens.
 *
 * **No destructive default.** Focus starts on Cancel, and Escape cancels. The
 * key events stop here, so a shortcut typed at the dialog cannot also switch
 * tools or clear the selection behind it.
 */
export function DeleteDialog({
  what,
  plan,
  onResolve,
  onCancel,
}: {
  what: string;
  plan: DeletePlan;
  onResolve: (resolution: DeleteResolution) => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const freezable = plan.dependents.filter((dependent) => dependent.freezable).length;

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        data-testid="delete-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h3 id="delete-dialog-title">Delete {what}?</h3>
        <p>These follow what you are deleting:</p>

        {groupByPart(plan.dependents).map((group) => (
          <section className="dialog-group" key={group.partId}>
            <div className="dialog-part">{group.partName}</div>
            <ul>
              {group.dependents.map((dependent) => (
                <li key={dependent.featureId}>
                  <b>{dependent.name}</b> <span className="dialog-note">{noteFor(dependent)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="tool"
            data-testid="delete-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tool"
            data-testid="delete-freeze"
            disabled={freezable === 0}
            title="Keep them as drawn geometry, where they are now, no longer following anything"
            onClick={() => onResolve('freeze-dependents')}
          >
            Keep {freezable} frozen
          </button>
          <button
            type="button"
            className="tool danger"
            data-testid="delete-all"
            onClick={() => onResolve('delete-dependents')}
          >
            Delete all
          </button>
        </div>
      </div>
    </div>
  );
}

/** What happens to one dependent under each choice, in a few words. */
function noteFor(dependent: PlannedDependent): string {
  if (dependent.freezable) return 'can be kept as drawn geometry';
  if (dependent.direct && dependent.kind === 'stitch-hole-set') {
    return 'holes cannot exist without their line, so these go either way';
  }
  if (dependent.direct) return 'has no geometry to keep, so it goes either way';
  return 'goes with what it follows, unless that is kept';
}

function groupByPart(
  dependents: readonly PlannedDependent[],
): { partId: string; partName: string; dependents: PlannedDependent[] }[] {
  const groups: { partId: string; partName: string; dependents: PlannedDependent[] }[] = [];
  for (const dependent of dependents) {
    let group = groups.find((g) => g.partId === dependent.partId);
    if (group === undefined) {
      group = { partId: dependent.partId, partName: dependent.partName, dependents: [] };
      groups.push(group);
    }
    group.dependents.push(dependent);
  }
  return groups;
}
