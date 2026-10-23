import type { RecentFile } from '@leathercad/platform';
import { FilePlus, FolderOpen, Pin, PinOff, Sparkles, X } from 'lucide-react';
import { useEffect } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { KeyCap } from './keyCaps.js';
import { recentParts } from './menus.js';
import { Tooltip } from './Tooltip.js';

/**
 * What the window shows with every project closed (8.12): the app stays open,
 * as Notepad's does not but a maker's bench does, and offers the ways in —
 * a new project, one from disk, the sample, and the recent projects, the
 * Project menu's own list. The tab strip stays above it, with the menu and *+*.
 */
export function StartScreen({
  recent,
  onRefreshRecent,
  error,
  onNew,
  onOpen,
  onOpenSample,
  onOpenRecent,
  onPin,
  onRemove,
}: {
  /** The recent projects (8.7), most recent first. */
  recent: readonly RecentFile[];
  /** Asked for as the screen shows: saving and opening change them. */
  onRefreshRecent: () => void;
  /** What went wrong opening a project from here, in words, or null. */
  error: string | null;
  onNew: () => void;
  onOpen: () => void;
  onOpenSample: () => void;
  onOpenRecent: (path: string) => void;
  /** Pins a project to the top of the list, or lets it go back among the rest (8.12). */
  onPin: (path: string, pinned: boolean) => void;
  /** Takes one project off the list: the file itself is left alone. */
  onRemove: (path: string) => void;
}) {
  const { t } = useI18n();
  useEffect(onRefreshRecent, [onRefreshRecent]);

  return (
    <main className="start-screen" data-testid="start-screen" aria-labelledby="start-title">
      {/* The project bar's, which this screen stands in for: the outline still starts with it. */}
      <h1 className="visually-hidden">LeatherCAD</h1>
      <div className="start-column">
        <h2 id="start-title" className="start-title">
          {t('start.title')}
        </h2>
        <p className="start-lede">{t('start.lede')}</p>
        {error !== null && (
          <p className="start-error" role="alert" data-testid="file-error">
            {error}
          </p>
        )}

        <div className="start-actions">
          <button
            type="button"
            className="tool start-action"
            data-testid="start-new"
            onClick={onNew}
          >
            <Icon of={FilePlus} />
            {t('menu.new')}
            <KeyCap command="newProject" />
          </button>
          <button
            type="button"
            className="tool start-action"
            data-testid="start-open"
            onClick={onOpen}
          >
            <Icon of={FolderOpen} />
            {t('menu.open')}
            <KeyCap command="openProject" />
          </button>
          <button
            type="button"
            className="tool start-action"
            data-testid="start-sample"
            onClick={onOpenSample}
          >
            <Icon of={Sparkles} />
            {t('menu.openSample')}
          </button>
        </div>

        <section className="start-recent" aria-labelledby="start-recent-title">
          <h3 id="start-recent-title" className="start-heading">
            {t('menu.recent')}
          </h3>
          {recent.length === 0 ? (
            <p className="start-empty">{t('menu.recentEmpty')}</p>
          ) : (
            <ul className="start-recent-list">
              {recent.map((file, index) => {
                const { name, folder } = recentParts(file.shown);
                return (
                  <li
                    key={file.path}
                    className={file.pinned ? 'start-recent-row pinned' : 'start-recent-row'}
                  >
                    <button
                      type="button"
                      className="start-recent-item"
                      data-testid={`start-recent-${String(index)}`}
                      onClick={() => onOpenRecent(file.path)}
                    >
                      <span className="start-recent-name">
                        {file.pinned && <Icon of={Pin} size={12} />}
                        {name}
                      </span>
                      <span className="start-recent-folder">{folder}</span>
                    </button>
                    <Tooltip text={t(file.pinned ? 'start.unpinTooltip' : 'start.pinTooltip')}>
                      <button
                        type="button"
                        className="tool quiet icon-only start-recent-action"
                        data-testid={`start-pin-${String(index)}`}
                        aria-label={t(file.pinned ? 'start.unpin' : 'start.pin', { name })}
                        aria-pressed={file.pinned}
                        onClick={() => onPin(file.path, !file.pinned)}
                      >
                        <Icon of={file.pinned ? PinOff : Pin} size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip text={t('start.removeTooltip')}>
                      <button
                        type="button"
                        className="tool quiet icon-only start-recent-action"
                        data-testid={`start-remove-${String(index)}`}
                        aria-label={t('start.remove', { name })}
                        onClick={() => onRemove(file.path)}
                      >
                        <Icon of={X} size={14} />
                      </button>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
