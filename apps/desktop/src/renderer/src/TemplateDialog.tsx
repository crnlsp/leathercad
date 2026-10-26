import type { Project } from '@leathercad/domain';
import type { TemplateEntry, TemplateShow, TemplateSort } from '@leathercad/platform';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { MessageKey } from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { MenuButton } from './Menu.js';
import type { MenuEntry } from './menus.js';
import { overallOf, piecesOf, templatePreview } from './templatePreview.js';
import { BUILT_IN_TEMPLATES } from './templates.js';
import { Tooltip } from './Tooltip.js';

/** A template, as the picker shows it: what the main process listed, and the project it holds. */
export interface TemplateChoice {
  readonly entry: TemplateEntry;
  /** Null when its file did not load: it is still listed, with no picture. */
  readonly project: Project | null;
}

/** What managing a template asks of the app; each resolves once it is done. */
export interface TemplateActions {
  readonly use: (id: string) => void;
  /** The renamed template's id — a name is its id — or the words of why not. */
  readonly rename: (
    id: string,
    name: string,
  ) => Promise<{ readonly renamed: string } | { readonly problem: string }>;
  readonly duplicate: (id: string, name: string) => Promise<void>;
  readonly describe: (id: string, description: string, tags: readonly string[]) => Promise<void>;
  readonly pin: (id: string, pinned: boolean) => Promise<void>;
  readonly edit: (id: string) => void;
  readonly exportTo: (id: string) => Promise<void>;
  readonly show: (id: string) => void;
  /** Removes it for good: only once the moment to undo it has passed. */
  readonly remove: (id: string) => void;
  readonly importFile: () => Promise<void>;
}

/** Each order's words, in the order the Sort menu lists them. */
const SORT_WORDS = {
  name: 'templates.sort.name',
  'name-desc': 'templates.sort.nameDesc',
  recent: 'templates.sort.recent',
  newest: 'templates.sort.newest',
  oldest: 'templates.sort.oldest',
} as const satisfies Record<TemplateSort, MessageKey>;

/** How long a removed template can be brought back, before its file goes. */
const UNDO_MS = 6000;

/** One row of the list, with what the picker reads about it. */
interface Row extends TemplateChoice {
  readonly name: string;
  readonly note: string;
  readonly words: string;
}

/** When the maker last changed one of theirs; a built-in template has no date. */
const modified = (row: Row): number | null => row.entry.changed ?? row.entry.created;

/** Later first, and anything with no date after everything with one. */
const latest = (a: number | null, b: number | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a;

/** Earlier first, and anything with no date still last. */
const earliest = (a: number | null, b: number | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;

/**
 * *New project from template…* (8.14), a browser for a library that grows:
 * a list to search, filter and sort on the left, and the chosen template on
 * the right — drawn large, with what it is, what it cuts and when it was
 * saved, and what can be done to it.
 *
 * Typing goes to the search at once, which reads names, descriptions and
 * tags; *Show* narrows the list, *Sort* orders it, and the picker
 * opens again as it was left. The pinned come first, in a fold of their
 * own that can be closed, in the same order as the rest. A removed template is gone at
 * once and can be brought back for a few seconds, rather than asked about.
 *
 * A listbox: the arrows choose, Enter uses, Delete removes one of the
 * maker's, Escape closes.
 */
export function TemplateDialog({
  templates,
  sort,
  show,
  onOrder,
  pinnedFolded,
  onFoldPinned,
  actions,
  onClose,
}: {
  templates: readonly TemplateChoice[];
  sort: TemplateSort;
  show: TemplateShow;
  /** The order and filter changed: kept for the next time the picker opens. */
  onOrder: (sort: TemplateSort, show: TemplateShow) => void;
  /** Whether the pinned are folded away: kept for the next time too. */
  pinnedFolded: boolean;
  onFoldPinned: (folded: boolean) => void;
  actions: TemplateActions;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [removed, setRemoved] = useState<{ id: string; name: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // A removal still waiting goes through when the picker closes.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    search.current?.focus();
    return () => {
      window.clearTimeout(timer.current);
      if (pending.current !== null) actions.remove(pending.current);
    };
    // Once, on open and close: the removal waiting then is the one to carry out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dates = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [i18n.locale],
  );

  const rows = useMemo((): Row[] => {
    return templates
      .filter((choice) => choice.entry.id !== removed?.id)
      .map((choice) => {
        const built = BUILT_IN_TEMPLATES.find((each) => `builtin:${each.id}` === choice.entry.id);
        const name = built === undefined ? choice.entry.name : t(built.name);
        const note = built === undefined ? choice.entry.description : t(built.description);
        const words = [name, note, ...choice.entry.tags].join(' ').toLowerCase();
        return { ...choice, name, note, words };
      });
  }, [templates, removed, t]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter(
      (row) => (show === 'all' || row.entry.kind === show) && (q === '' || row.words.includes(q)),
    );
    const by: Record<TemplateSort, (a: Row, b: Row) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      'name-desc': (a, b) => b.name.localeCompare(a.name),
      // Never used, or built in with no date: after the rest, either way, by name.
      recent: (a, b) => latest(a.entry.usedAt, b.entry.usedAt) || a.name.localeCompare(b.name),
      newest: (a, b) => latest(modified(a), modified(b)) || a.name.localeCompare(b.name),
      oldest: (a, b) => earliest(modified(a), modified(b)) || a.name.localeCompare(b.name),
    };
    return kept.sort(by[sort]);
  }, [rows, show, query, sort]);

  // The pinned first, in their fold, then the rest: the one order chosen runs
  // through both, searched or not. Folded, the arrows pass the pinned by.
  const pinned = useMemo(() => shown.filter((row) => row.entry.pinned), [shown]);
  const others = useMemo(() => shown.filter((row) => !row.entry.pinned), [shown]);
  const ordered = pinnedFolded ? others : [...pinned, ...others];

  const [picked, setPicked] = useState<string | null>(null);
  const chosen = ordered.find((row) => row.entry.id === picked) ?? ordered[0] ?? null;
  const at = chosen === null ? -1 : ordered.indexOf(chosen);
  const chosenId = chosen?.entry.id ?? null;
  // Another template chosen: its preview, not the foot of the last one's details.
  useEffect(() => {
    detail.current?.scrollTo({ top: 0 });
  }, [chosenId]);
  const choose = (index: number): void => {
    const row = ordered[(index + ordered.length) % ordered.length];
    if (row === undefined) return;
    setPicked(row.entry.id);
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLElement>(`[data-template="${CSS.escape(row.entry.id)}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  };

  const order = (nextSort: TemplateSort, nextShow: TemplateShow): void =>
    onOrder(nextSort, nextShow);

  const remove = (row: Row): void => {
    // The one before, if any, goes now: one undo at a time.
    window.clearTimeout(timer.current);
    if (pending.current !== null) actions.remove(pending.current);
    pending.current = row.entry.id;
    setRemoved({ id: row.entry.id, name: row.name });
    timer.current = window.setTimeout(() => {
      if (pending.current !== null) actions.remove(pending.current);
      pending.current = null;
      setRemoved(null);
    }, UNDO_MS);
  };
  const undo = (): void => {
    window.clearTimeout(timer.current);
    pending.current = null;
    setRemoved(null);
  };

  const option = (row: Row) => {
    const selected = row === chosen;
    const preview = row.project === null ? null : templatePreview(row.project, 64, 42, 'shape');
    return (
      <div
        key={row.entry.id}
        role="option"
        id={`template-option-${String(ordered.indexOf(row))}`}
        aria-selected={selected}
        tabIndex={-1}
        className="template-choice"
        data-template={row.entry.id}
        data-testid={`template-${row.entry.id}`}
        onClick={() => setPicked(row.entry.id)}
        onDoubleClick={() => actions.use(row.entry.id)}
      >
        <span className="template-preview small" aria-hidden="true">
          {preview !== null && <img src={preview} alt="" width={64} height={42} />}
        </span>
        <span className="template-text">
          <span className="template-name">
            {row.entry.pinned && <Icon of="pin" size={11} />}
            <Marked text={row.name} query={query} />
          </span>
          <span className="template-meta">
            {row.entry.kind === 'builtin'
              ? t('templates.builtInBadge')
              : t('templates.changedOn', {
                  date: dates.format(row.entry.changed ?? row.entry.created ?? 0),
                })}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        data-testid="template-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          // A menu open over the picker — Sort — has its own keys.
          if (event.defaultPrevented) return;
          const typing =
            event.target instanceof HTMLInputElement && event.target !== search.current
              ? true
              : event.target instanceof HTMLTextAreaElement;
          if (event.key === 'Escape') onClose();
          else if (typing) return;
          else if (event.key === 'ArrowDown') choose(at + 1);
          else if (event.key === 'ArrowUp') choose(at - 1);
          else if (
            event.key === 'Enter' &&
            chosen !== null &&
            !(event.target instanceof HTMLButtonElement)
          ) {
            actions.use(chosen.entry.id);
          } else if (
            event.key === 'Delete' &&
            event.target !== search.current &&
            chosen?.entry.kind === 'mine'
          ) {
            remove(chosen);
          } else return;
          event.preventDefault();
        }}
      >
        <div className="template-head">
          <h3 id="template-dialog-title">{t('templates.title')}</h3>
          <Tooltip text={t('templates.importTooltip')}>
            <button
              type="button"
              className="tool"
              data-testid="template-import"
              onClick={() => void actions.importFile()}
            >
              {t('templates.import')}
            </button>
          </Tooltip>
        </div>

        <div className="template-bar">
          <div
            className="segmented template-show"
            role="group"
            aria-label={t('templates.showLabel')}
          >
            {(['all', 'builtin', 'mine'] as const).map((each) => (
              <button
                key={each}
                type="button"
                className={show === each ? 'segment active' : 'segment'}
                data-testid={`template-show-${each}`}
                aria-pressed={show === each}
                onClick={() => order(sort, each)}
              >
                {t(`templates.show.${each}`)}
              </button>
            ))}
          </div>
          <MenuButton
            label={t('templates.sortChosen', { sort: t(SORT_WORDS[sort]) })}
            tooltip={t('templates.sortLabel')}
            testId="template-sort"
            className="tool template-filter"
            align="end"
            entries={(Object.keys(SORT_WORDS) as TemplateSort[]).map((each): MenuEntry => ({
              kind: 'item',
              id: `template-sort-${each}`,
              label: t(SORT_WORDS[each]),
              ...(each === sort ? { icon: 'check' as const } : {}),
              onChoose: () => order(each, show),
            }))}
          >
            <span className="template-filter-label">{t('templates.sortLabel')}</span>
            <span className="template-filter-value">{t(SORT_WORDS[sort])}</span>
            <Icon of="chevron-down" size={12} />
          </MenuButton>
        </div>

        <div className="template-body">
          {/* The search heads the list it narrows, as wide as it is. */}
          <div className="template-browse">
            <label className="template-search">
              <Icon of="search" size={14} />
              <input
                ref={search}
                id="template-search"
                type="search"
                data-testid="template-search"
                placeholder={t('templates.search')}
                aria-label={t('templates.searchLabel')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {/* The fold's toggle heads the scroll, outside the listbox, which holds only options. */}
            <div ref={list} className="template-lists">
              {pinned.length > 0 && (
                <button
                  type="button"
                  className="template-fold"
                  data-testid="template-fold-pinned"
                  aria-expanded={!pinnedFolded}
                  aria-controls="template-pinned"
                  aria-label={t(
                    pinnedFolded ? 'templates.group.unfoldPinned' : 'templates.group.foldPinned',
                  )}
                  onClick={() => onFoldPinned(!pinnedFolded)}
                >
                  <Icon of={pinnedFolded ? 'chevron-right' : 'chevron-down'} size={12} />
                  <Icon of="pin" size={12} />
                  {t('templates.group.pinned')}
                  <span className="template-fold-count">{pinned.length}</span>
                </button>
              )}
              <div
                className="template-listbox"
                role="listbox"
                tabIndex={0}
                aria-labelledby="template-dialog-title"
                aria-activedescendant={
                  chosen === null ? undefined : `template-option-${String(at)}`
                }
                data-testid="template-list"
              >
                {shown.length === 0 ? (
                  <div className="template-empty" role="presentation">
                    {query.trim() !== '' ? (
                      <>
                        {t('templates.noMatch', { query: query.trim() })}
                        <button type="button" className="tool" onClick={() => setQuery('')}>
                          {t('templates.clearSearch')}
                        </button>
                      </>
                    ) : (
                      t('templates.mineEmpty')
                    )}
                  </div>
                ) : (
                  <>
                    {pinned.length > 0 && !pinnedFolded && (
                      <div
                        id="template-pinned"
                        role="group"
                        aria-label={t('templates.group.pinned')}
                        className="template-group pinned"
                      >
                        {pinned.map(option)}
                      </div>
                    )}
                    {others.length > 0 && (
                      <div
                        role="group"
                        aria-label={pinned.length > 0 ? t('templates.group.others') : undefined}
                        className="template-group"
                      >
                        {pinned.length > 0 && (
                          <h4 className="template-heading" aria-hidden="true">
                            {t('templates.group.others')}
                          </h4>
                        )}
                        {others.map(option)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div ref={detail} className="template-detail" data-testid="template-detail">
            {chosen === null ? (
              <p className="template-note">{t('templates.nothingChosen')}</p>
            ) : (
              <Detail
                key={chosen.entry.id}
                row={chosen}
                dates={dates}
                actions={actions}
                onRemove={remove}
                // Renamed, it has a new id: still the one chosen, not the first row.
                onRenamed={setPicked}
              />
            )}
          </div>
        </div>

        <div className="dialog-actions template-foot">
          {removed !== null ? (
            <span className="template-removed" role="status" data-testid="template-removed">
              {t('templates.removed', { name: removed.name })}
              <button type="button" className="tool" data-testid="template-undo" onClick={undo}>
                {t('templates.undo')}
              </button>
            </span>
          ) : (
            <span className="template-count" aria-live="polite">
              {show === 'all' && query.trim() === ''
                ? t('templates.countAll', { count: rows.length })
                : t('templates.count', {
                    shown: shown.length,
                    total: rows.length,
                  })}
            </span>
          )}
          <button type="button" className="tool" data-testid="template-close" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="tool primary"
            data-testid="template-use"
            disabled={chosen === null}
            onClick={() => (chosen === null ? undefined : actions.use(chosen.entry.id))}
          >
            {t('templates.use')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A name with what was searched for marked, so the eye finds why it matched. */
function Marked({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  const at = q === '' ? -1 : text.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/**
 * The chosen template, large: its drawing, its facts, and what can be done to
 * it. The maker's own can be renamed, described, tagged, duplicated, edited,
 * exported, shown in the file manager and removed; a built-in one only pinned,
 * exported, and duplicated to become the maker's.
 */
function Detail({
  row,
  dates,
  actions,
  onRemove,
  onRenamed,
}: {
  row: Row;
  dates: Intl.DateTimeFormat;
  actions: TemplateActions;
  onRemove: (row: Row) => void;
  onRenamed: (id: string) => void;
}) {
  const { t } = useI18n();
  const mine = row.entry.kind === 'mine';
  const id = row.entry.id;
  const preview = useMemo(
    () => (row.project === null ? null : templatePreview(row.project, 360, 200, 'full')),
    [row.project],
  );
  const overall = row.project === null ? null : overallOf(row.project);
  // One date for the maker's own: when it last changed, or was saved if it never has.
  const modified = mine ? (row.entry.changed ?? row.entry.created) : null;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(row.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [description, setDescription] = useState(row.entry.description);
  const [tags, setTags] = useState(row.entry.tags.join(', '));

  // The maker's words about it, read until *Edit details…* opens them as a
  // form: kept only when they say so, put back as kept on *Cancel*.
  const [editing, setEditing] = useState(false);
  const tagList = (text: string): string[] =>
    text
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
  const edited =
    description.trim() !== row.entry.description ||
    tagList(tags).join(',') !== row.entry.tags.join(',');
  const [saving, setSaving] = useState(false);
  const keepWords = (): void => {
    setSaving(true);
    void actions
      .describe(id, description, tagList(tags))
      .then(() => setEditing(false))
      .finally(() => setSaving(false));
  };
  const discardWords = (): void => {
    setDescription(row.entry.description);
    setTags(row.entry.tags.join(', '));
    setEditing(false);
  };

  // One action to hand, the rest under ⋯: the maker's own are edited, a
  // built-in one is made theirs first.
  const more: MenuEntry[] = [
    {
      kind: 'item',
      id: 'template-pin',
      label: t(row.entry.pinned ? 'templates.unpin' : 'templates.pin'),
      icon: row.entry.pinned ? 'unpin' : 'pin',
      onChoose: () => void actions.pin(id, !row.entry.pinned),
    },
    ...(mine
      ? [
          {
            kind: 'item' as const,
            id: 'template-rename',
            label: t('templates.rename'),
            icon: 'rename' as const,
            // After the menu has closed and settled focus, so the field keeps it.
            onChoose: () => requestAnimationFrame(() => setRenaming(true)),
          },
          {
            kind: 'item' as const,
            id: 'template-duplicate',
            label: t('templates.duplicate'),
            icon: 'duplicate' as const,
            onChoose: () => void actions.duplicate(id, t('templates.copyName', { name: row.name })),
          },
        ]
      : []),
    {
      kind: 'item',
      id: 'template-export',
      label: t('templates.export'),
      onChoose: () => void actions.exportTo(id),
    },
    ...(mine
      ? [
          {
            kind: 'item' as const,
            id: 'template-show',
            label: t('templates.showInFolder'),
            icon: 'open' as const,
            onChoose: () => actions.show(id),
          },
          { kind: 'separator' as const },
          {
            kind: 'item' as const,
            id: 'template-delete',
            label: t('templates.delete'),
            icon: 'delete' as const,
            danger: true,
            onChoose: () => onRemove(row),
          },
        ]
      : []),
  ];

  return (
    <>
      <span className="template-preview large" aria-hidden="true">
        {preview !== null && <img src={preview} alt="" width={360} height={200} />}
      </span>
      {renaming ? (
        <form
          className="template-rename"
          onSubmit={(event) => {
            event.preventDefault();
            void actions.rename(id, name).then((outcome) => {
              if ('problem' in outcome) setProblem(outcome.problem);
              else {
                setRenaming(false);
                onRenamed(outcome.renamed);
              }
            });
          }}
        >
          <input
            id="template-rename"
            data-testid="template-rename-field"
            aria-label={t('templates.renameLabel')}
            value={name}
            autoFocus
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setRenaming(false);
                setName(row.name);
              }
            }}
          />
          {problem !== null && (
            <p className="status-error" role="alert" data-testid="template-problem">
              {problem}
            </p>
          )}
        </form>
      ) : (
        <div className="template-title">
          <span className="template-name large">{row.name}</span>
          {!mine && <span className="template-badge">{t('templates.builtInBadge')}</span>}
        </div>
      )}
      {mine
        ? !editing && (
            <>
              {row.entry.description !== '' && (
                <p className="template-note">{row.entry.description}</p>
              )}
              {row.entry.tags.length > 0 && (
                <ul className="template-tags" aria-label={t('templates.tags')}>
                  {row.entry.tags.map((tag) => (
                    <li key={tag} className="template-tag">
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="tool quiet template-edit-details"
                data-testid="template-edit-details"
                onClick={() => setEditing(true)}
              >
                <Icon of="rename" size={14} />
                {t('templates.editDetails')}
              </button>
            </>
          )
        : row.note !== '' && <p className="template-note">{row.note}</p>}
      <dl className="template-facts">
        {row.project !== null && (
          <>
            <dt>{t('templates.fact.pieces')}</dt>
            <dd>{piecesOf(row.project)}</dd>
          </>
        )}
        {overall !== null && (
          <>
            <dt>{t('templates.fact.layout')}</dt>
            <dd>
              {t('templates.overallSize', {
                width: Math.round(overall.width),
                height: Math.round(overall.height),
              })}
            </dd>
          </>
        )}
        {modified !== null && (
          <>
            <dt>{t('templates.fact.changed')}</dt>
            <dd>{dates.format(modified)}</dd>
          </>
        )}
      </dl>
      <div className="template-manage">
        {mine ? (
          <Tooltip text={t('templates.editTooltip')}>
            <button
              type="button"
              className="tool"
              data-testid="template-edit"
              onClick={() => actions.edit(id)}
            >
              {t('templates.edit')}
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            className="tool"
            data-testid="template-duplicate"
            onClick={() => void actions.duplicate(id, t('templates.copyName', { name: row.name }))}
          >
            <Icon of="duplicate" size={14} />
            {t('templates.duplicateMine')}
          </button>
        )}
        <MenuButton
          label={t('templates.moreActions', { name: row.name })}
          testId="template-more"
          className="tool icon-only"
          entries={more}
        >
          <Icon of="more" />
        </MenuButton>
      </div>
      {!mine && <p className="template-note">{t('templates.builtInLocked')}</p>}
      {mine && editing && (
        <form
          className="template-words"
          aria-labelledby="template-words-title"
          onSubmit={(event) => {
            event.preventDefault();
            if (edited && !saving) keepWords();
          }}
          onKeyDown={(event) => {
            // Escape leaves the form, not the picker.
            if (event.key === 'Escape') {
              event.stopPropagation();
              discardWords();
            }
          }}
        >
          <h4 id="template-words-title" className="template-heading">
            {t('templates.wordsTitle')}
          </h4>
          <label className="template-field">
            <span className="template-field-label">{t('templates.description')}</span>
            <textarea
              id="template-description"
              autoFocus
              data-testid="template-description"
              rows={2}
              placeholder={t('templates.descriptionPlaceholder')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="template-field">
            <span className="template-field-label">{t('templates.tags')}</span>
            <input
              id="template-tags"
              data-testid="template-tags"
              placeholder={t('templates.tagsPlaceholder')}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <div className="template-words-actions">
            <button
              type="button"
              className="tool"
              data-testid="template-words-discard"
              onClick={discardWords}
            >
              {t('actions.cancel')}
            </button>
            <button
              type="submit"
              className="tool primary"
              data-testid="template-words-save"
              disabled={!edited || saving}
            >
              {t('templates.saveWords')}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
/**
 * *Save as template…* (8.12): the name to save it under, the project's own to
 * begin with. A name a template already has is said, with *Replace* to write
 * over it; nothing is replaced without that.
 */
export function SaveTemplateDialog({
  initialName,
  onSave,
  onClose,
}: {
  initialName: string;
  /** Resolves with what was said back: null once saved, or the words of why not. */
  onSave: (name: string, replace: boolean) => Promise<{ said: string; taken: boolean } | null>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [problem, setProblem] = useState<{ said: string; taken: boolean } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const save = (replace: boolean): void => {
    void onSave(name, replace).then(setProblem);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
        data-testid="save-template-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
      >
        <h3 id="save-template-title">{t('templates.saveTitle')}</h3>
        <label className="field">
          <span>{t('templates.saveName')}</span>
          <input
            ref={field}
            id="template-name"
            data-testid="template-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
          />
        </label>
        {problem !== null && (
          <p className="status-error" role="alert" data-testid="template-problem">
            {problem.said}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="tool" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          {problem?.taken === true ? (
            <button
              type="button"
              className="tool danger"
              data-testid="template-replace"
              onClick={() => save(true)}
            >
              {t('templates.replace')}
            </button>
          ) : (
            <button type="submit" className="tool primary" data-testid="template-save">
              {t('templates.save')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
