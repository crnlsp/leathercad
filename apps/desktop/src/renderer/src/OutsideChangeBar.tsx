import type { OutsideChange } from '@leathercad/platform';
import { FileWarning } from 'lucide-react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';

/**
 * Another program changed, moved or deleted the project's file (8.12): said
 * over the board, where the work is, until the maker answers. Nothing is
 * done for them — reading the file again would lose the history, and the
 * work here may be the one to keep.
 *
 * Changed: *Reload*, which asks about unsaved work first, or *Keep mine*,
 * which leaves both as they are until the next save writes this one over it.
 * Gone: *Save*, which writes it back where it was, or *Dismiss*.
 */
export function OutsideChangeBar({
  change,
  file,
  onReload,
  onSave,
  onKeep,
}: {
  change: OutsideChange;
  /** The file's name, as the status bar shows it. */
  file: string;
  onReload: () => void;
  onSave: () => void;
  onKeep: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="outside-bar" role="alert" data-testid="outside-bar" data-change={change}>
      <Icon of={FileWarning} />
      <span className="outside-words">
        {t(change === 'changed' ? 'outside.changed' : 'outside.gone', { file })}
      </span>
      {change === 'changed' ? (
        <button type="button" className="tool" data-testid="outside-reload" onClick={onReload}>
          {t('outside.reload')}
        </button>
      ) : (
        <button type="button" className="tool" data-testid="outside-save" onClick={onSave}>
          {t('outside.save')}
        </button>
      )}
      <button type="button" className="tool quiet" data-testid="outside-keep" onClick={onKeep}>
        {t(change === 'changed' ? 'outside.keep' : 'outside.dismiss')}
      </button>
    </div>
  );
}
