import type { RecentFile } from '@leathercad/platform';
import { useEffect, useMemo } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { KeyCap } from './keyCaps.js';
import { recentParts } from './menus.js';
import { startTemplates, templateName } from './startTemplates.js';
import type { TemplateChoice } from './TemplateDialog.js';
import { templatePreview } from './templatePreview.js';
import { Tooltip } from './Tooltip.js';

/** A card's picture, in CSS pixels: the picker's thumbnail, larger. */
const CARD_W = 152;
const CARD_H = 96;

/**
 * What the window shows with every project closed (8.12): the app stays open,
 * as Notepad's does not but a maker's bench does, and offers the ways in. A
 * new project first (U.23): blank, the primary card, then templates as cards
 * drawn as the picker draws them, with the whole library and *Open…* beside
 * them; then the recent projects, the Project menu's own list, each with when
 * it was saved. The tab strip stays above it, with the menu and *+*.
 */
export function StartScreen({
  recent,
  templates,
  onRefresh,
  error,
  onNew,
  onUseTemplate,
  onNewFromTemplate,
  onOpen,
  onOpenRecent,
  onPin,
  onRemove,
}: {
  /** The recent projects (8.7), most recent first. */
  recent: readonly RecentFile[];
  /** The template library, read and loaded (8.14); empty until it has been. */
  templates: readonly TemplateChoice[];
  /** Asked for as the screen shows: saving, opening and templates change what it lists. */
  onRefresh: () => void;
  /** What went wrong opening a project from here, in words, or null. */
  error: string | null;
  onNew: () => void;
  /** A new project from the template on a card. */
  onUseTemplate: (id: string) => void;
  /** *New project from template* (8.12): the picker, for the whole library. */
  onNewFromTemplate: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  /** Pins a project to the top of the list, or lets it go back among the rest (8.12). */
  onPin: (path: string, pinned: boolean) => void;
  /** Takes one project off the list: the file itself is left alone. */
  onRemove: (path: string) => void;
}) {
  const { t, locale } = useI18n();
  useEffect(onRefresh, [onRefresh]);
  // Drawn once per reading of the library, not on every render: each is an evaluation.
  const cards = useMemo(
    () =>
      startTemplates(templates).map((choice) => ({
        id: choice.entry.id,
        name: templateName(choice.entry, t),
        preview: templatePreview(choice.project, CARD_W, CARD_H, 'shape'),
      })),
    [templates, t],
  );
  const dates = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    [locale],
  );

  return (
    <main className="start-screen" data-testid="start-screen" aria-labelledby="start-title">
      {/* The project bar's, which this screen stands in for: the outline still starts with it. */}
      <h1 className="visually-hidden">LeatherCAD</h1>
      <div className="start-column">
        <div className="start-new-head">
          <h2 id="start-title" className="start-title">
            {t('start.title')}
          </h2>
          <button
            type="button"
            className="tool quiet"
            data-testid="start-template"
            onClick={onNewFromTemplate}
          >
            <Icon of="from-template" />
            {t('start.fromTemplate')}
          </button>
          <button
            type="button"
            className="tool start-action"
            data-testid="start-open"
            onClick={onOpen}
          >
            <Icon of="open" />
            {t('start.open')}
            <KeyCap command="openProject" />
          </button>
        </div>
        <p className="start-lede">{t('start.lede')}</p>
        {error !== null && (
          <p className="start-error" role="alert" data-testid="file-error">
            {error}
          </p>
        )}

        <ul className="start-cards">
          <li>
            <button
              type="button"
              className="start-card primary"
              data-testid="start-new"
              onClick={onNew}
            >
              <span className="start-card-picture" aria-hidden="true">
                <Icon of="new-project" size={32} />
              </span>
              <span className="start-card-name">
                {t('start.blank')}
                <KeyCap command="newProject" />
              </span>
            </button>
          </li>
          {cards.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                className="start-card"
                data-testid={`start-card-${card.id}`}
                onClick={() => onUseTemplate(card.id)}
              >
                <span className="start-card-picture" aria-hidden="true">
                  {card.preview !== null && (
                    <img src={card.preview} alt="" width={CARD_W} height={CARD_H} />
                  )}
                </span>
                <span className="start-card-name">{card.name}</span>
              </button>
            </li>
          ))}
        </ul>

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
                        {file.pinned && <Icon of="pin" size={12} />}
                        {name}
                      </span>
                      <span className="start-recent-folder">{folder}</span>
                    </button>
                    {file.modified !== null && (
                      <time
                        className="start-recent-date"
                        dateTime={new Date(file.modified).toISOString()}
                      >
                        {dates.format(file.modified)}
                      </time>
                    )}
                    <Tooltip text={t(file.pinned ? 'start.unpinTooltip' : 'start.pinTooltip')}>
                      <button
                        type="button"
                        className="tool quiet icon-only start-recent-action"
                        data-testid={`start-pin-${String(index)}`}
                        aria-label={t(file.pinned ? 'start.unpin' : 'start.pin', { name })}
                        aria-pressed={file.pinned}
                        onClick={() => onPin(file.path, !file.pinned)}
                      >
                        <Icon of={file.pinned ? 'unpin' : 'pin'} size={14} />
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
                        <Icon of="close" size={14} />
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
