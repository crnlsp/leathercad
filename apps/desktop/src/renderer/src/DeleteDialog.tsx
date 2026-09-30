import type { DeletePlan, DeleteResolution, PlannedDependent } from '@leathercad/document';
import { useEffect, useRef } from 'react';

import type { Translate } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { Tooltip } from './Tooltip.js';

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
  const { t } = useI18n();
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
        <h3 id="delete-dialog-title">{t('deleteDialog.title', { what })}</h3>
        <p>{t('deleteDialog.follow')}</p>

        {groupByPart(plan.dependents).map((group) => (
          <section className="dialog-group" key={group.partId}>
            <div className="dialog-part">{group.partName}</div>
            <ul>
              {group.dependents.map((dependent) => (
                <li key={dependent.featureId}>
                  <b>{dependent.name}</b>{' '}
                  <span className="dialog-note">{noteFor(dependent, t)}</span>
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
            {t('actions.cancel')}
          </button>
          <Tooltip text={t('deleteDialog.freezeTooltip')}>
            <button
              type="button"
              className="tool"
              data-testid="delete-freeze"
              disabled={freezable === 0}
              onClick={() => onResolve('freeze-dependents')}
            >
              {t('deleteDialog.freeze', { count: freezable })}
            </button>
          </Tooltip>
          <button
            type="button"
            className="tool danger"
            data-testid="delete-all"
            onClick={() => onResolve('delete-dependents')}
          >
            {t('deleteDialog.deleteAll')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What happens to one dependent under each choice, in a few words. */
function noteFor(dependent: PlannedDependent, t: Translate): string {
  if (dependent.freezable) return t('deleteDialog.note.freezable');
  if (dependent.direct && dependent.kind === 'stitch-hole-set') return t('deleteDialog.note.holes');
  if (dependent.direct) return t('deleteDialog.note.direct');
  return t('deleteDialog.note.indirect');
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
