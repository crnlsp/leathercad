import type { Project } from '@leathercad/domain';
import type { TemplateEntry, TemplateShow, TemplateSort } from '@leathercad/platform';
import { Pin, PinOff, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { overallOf, piecesOf, templatePreview } from './templatePreview.js';
import { BUILT_IN_TEMPLATES, TEMPLATE_CATEGORIES, type TemplateCategory } from './templates.js';
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
  /** Null once renamed, or the words of why not. */
  readonly rename: (id: string, name: string) => Promise<string | null>;
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

/** How long a removed template can be brought back, before its file goes. */
const UNDO_MS = 6000;
/** How many templates *Recently used* lists. */
const RECENT = 4;

/** One row of the list, with what the picker reads about it. */
interface Row extends TemplateChoice {
  readonly name: string;
  readonly note: string;
  readonly category: TemplateCategory | null;
  readonly words: string;
}

/**
 * *New project from template…* (8.14), a browser for a library that grows:
 * a list to search, filter and sort on the left, and the chosen template on
 * the right — drawn large, with what it is, what it cuts and when it was
 * saved, and what can be done to it.
 *
 * Typing goes to the search at once, which reads names, descriptions and
 * tags; *Show* and *Kind* narrow the list, *Sort* orders it, and the picker
 * opens again as it was left. With nothing searched and the list by name,
 * the pinned and the recently used come first. A removed template is gone at
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
  actions,
  onClose,
}: {
  templates: readonly TemplateChoice[];
  sort: TemplateSort;
  show: TemplateShow;
  /** The order and filter changed: kept for the next time the picker opens. */
  onOrder: (sort: TemplateSort, show: TemplateShow) => void;
  actions: TemplateActions;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string>('');
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
        const category = built?.category ?? null;
        const words = [
          name,
          note,
          ...choice.entry.tags,
          category === null ? '' : t(`templates.category.${category}`),
        ]
          .join(' ')
          .toLowerCase();
        return { ...choice, name, note, category, words };
      });
  }, [templates, removed, t]);

  const tags = useMemo(
    () => [...new Set(rows.flatMap((row) => row.entry.tags))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter(
      (row) =>
        (show === 'all' || row.entry.kind === show) &&
        (kind === '' ||
          (kind.startsWith('category:')
            ? row.category === kind.slice('category:'.length)
            : row.entry.tags.includes(kind.slice('tag:'.length)))) &&
        (q === '' || row.words.includes(q)),
    );
    const by: Record<TemplateSort, (a: Row, b: Row) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      'name-desc': (a, b) => b.name.localeCompare(a.name),
      // Built-in templates have no date: after the maker's when newest come first.
      newest: (a, b) =>
        (b.entry.created ?? 0) - (a.entry.created ?? 0) || a.name.localeCompare(b.name),
      oldest: (a, b) =>
        (a.entry.created ?? Infinity) - (b.entry.created ?? Infinity) ||
        a.name.localeCompare(b.name),
    };
    return kept.sort(by[sort]);
  }, [rows, show, kind, query, sort]);

  // With nothing searched and the list by name: the pinned, then the recently
  // used, then the rest by kind. Otherwise one list, the pinned still first.
  const groups = useMemo((): { id: string; label: string; rows: Row[] }[] => {
    const pinned = shown.filter((row) => row.entry.pinned);
    const rest = shown.filter((row) => !row.entry.pinned);
    const browsing = query.trim() === '' && sort.startsWith('name');
    if (!browsing) {
      return [
        ...(pinned.length > 0
          ? [{ id: 'pinned', label: t('templates.group.pinned'), rows: pinned }]
          : []),
        { id: 'all', label: '', rows: rest },
      ];
    }
    const recent = rest
      .filter((row) => row.entry.usedAt !== null)
      .sort((a, b) => (b.entry.usedAt ?? 0) - (a.entry.usedAt ?? 0))
      .slice(0, RECENT);
    const others = rest.filter((row) => !recent.includes(row));
    return [
      { id: 'pinned', label: t('templates.group.pinned'), rows: pinned },
      { id: 'recent', label: t('templates.group.recent'), rows: recent },
      {
        id: 'builtin',
        label: t('templates.builtIn'),
        rows: others.filter((row) => row.entry.kind === 'builtin'),
      },
      {
        id: 'mine',
        label: t('templates.mine'),
        rows: others.filter((row) => row.entry.kind === 'mine'),
      },
    ].filter((group) => group.rows.length > 0);
  }, [shown, query, sort, t]);
  const ordered = groups.flatMap((group) => group.rows);

  const [picked, setPicked] = useState<string | null>(null);
  const chosen = ordered.find((row) => row.entry.id === picked) ?? ordered[0] ?? null;
  const at = chosen === null ? -1 : ordered.indexOf(chosen);
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
    const preview = row.project === null ? null : templatePreview(row.project, 64, 42);
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
            {row.entry.pinned && <Icon of={Pin} size={11} />}
            <Marked text={row.name} query={query} />
          </span>
          <span className="template-meta">
            {row.entry.kind === 'builtin'
              ? t('templates.builtInBadge')
              : t('templates.savedOn', {
                  date: dates.format(row.entry.created ?? 0),
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
          <label className="template-search">
            <Icon of={Search} size={14} />
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
          <select
            id="template-kind"
            data-testid="template-kind"
            aria-label={t('templates.kindLabel')}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">{t('templates.allKinds')}</option>
            {TEMPLATE_CATEGORIES.map((category) => (
              <option key={category} value={`category:${category}`}>
                {t(`templates.category.${category}`)}
              </option>
            ))}
            {tags.map((tag) => (
              <option key={tag} value={`tag:${tag}`}>
                {tag}
              </option>
            ))}
          </select>
          <select
            id="template-sort"
            data-testid="template-sort"
            aria-label={t('templates.sortLabel')}
            value={sort}
            onChange={(event) => order(event.target.value as TemplateSort, show)}
          >
            <option value="name">{t('templates.sort.name')}</option>
            <option value="name-desc">{t('templates.sort.nameDesc')}</option>
            <option value="newest">{t('templates.sort.newest')}</option>
            <option value="oldest">{t('templates.sort.oldest')}</option>
          </select>
        </div>

        <div className="template-body">
          <div
            ref={list}
            className="template-lists"
            role="listbox"
            tabIndex={0}
            aria-labelledby="template-dialog-title"
            aria-activedescendant={chosen === null ? undefined : `template-option-${String(at)}`}
            data-testid="template-list"
          >
            {ordered.length === 0 ? (
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
              groups.map((group) => (
                <div
                  key={group.id}
                  role="group"
                  aria-label={group.label || undefined}
                  className="template-group"
                >
                  {group.label !== '' && <h4 className="template-heading">{group.label}</h4>}
                  {group.rows.map(option)}
                </div>
              ))
            )}
          </div>

          <div className="template-detail" data-testid="template-detail">
            {chosen === null ? (
              <p className="template-note">{t('templates.nothingChosen')}</p>
            ) : (
              <Detail
                key={chosen.entry.id}
                row={chosen}
                dates={dates}
                actions={actions}
                onRemove={remove}
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
              {t('templates.count', {
                shown: ordered.length,
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
}: {
  row: Row;
  dates: Intl.DateTimeFormat;
  actions: TemplateActions;
  onRemove: (row: Row) => void;
}) {
  const { t } = useI18n();
  const mine = row.entry.kind === 'mine';
  const id = row.entry.id;
  const preview = useMemo(
    () => (row.project === null ? null : templatePreview(row.project, 360, 200)),
    [row.project],
  );
  const overall = row.project === null ? null : overallOf(row.project);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(row.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [description, setDescription] = useState(row.entry.description);
  const [tags, setTags] = useState(row.entry.tags.join(', '));

  const keepWords = (): void => {
    const nextTags = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
    if (description === row.entry.description && nextTags.join(',') === row.entry.tags.join(',')) {
      return;
    }
    void actions.describe(id, description, nextTags);
  };

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
            void actions.rename(id, name).then((said) => {
              setProblem(said);
              if (said === null) setRenaming(false);
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
      {mine ? (
        <>
          <label className="field">
            <span>{t('templates.description')}</span>
            <textarea
              id="template-description"
              data-testid="template-description"
              rows={2}
              placeholder={t('templates.descriptionPlaceholder')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={keepWords}
            />
          </label>
          <label className="field">
            <span>{t('templates.tags')}</span>
            <input
              id="template-tags"
              data-testid="template-tags"
              placeholder={t('templates.tagsPlaceholder')}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              onBlur={keepWords}
            />
          </label>
        </>
      ) : (
        row.note !== '' && <p className="template-note">{row.note}</p>
      )}
      <dl className="template-facts">
        {row.project !== null && (
          <>
            <dt>{t('templates.fact.pieces')}</dt>
            <dd>{piecesOf(row.project)}</dd>
          </>
        )}
        {overall !== null && (
          <>
            <dt>{t('templates.fact.overall')}</dt>
            <dd>
              {t('templates.overallSize', {
                width: Math.round(overall.width),
                height: Math.round(overall.height),
              })}
            </dd>
          </>
        )}
        {mine && row.entry.created !== null && (
          <>
            <dt>{t('templates.fact.saved')}</dt>
            <dd>{dates.format(row.entry.created)}</dd>
          </>
        )}
        {mine && row.entry.changed !== null && (
          <>
            <dt>{t('templates.fact.changed')}</dt>
            <dd>{dates.format(row.entry.changed)}</dd>
          </>
        )}
      </dl>
      <div className="template-manage">
        <button
          type="button"
          className="tool"
          data-testid="template-pin"
          aria-pressed={row.entry.pinned}
          onClick={() => void actions.pin(id, !row.entry.pinned)}
        >
          <Icon of={row.entry.pinned ? PinOff : Pin} size={14} />
          {t(row.entry.pinned ? 'templates.unpin' : 'templates.pin')}
        </button>
        {mine && (
          <button
            type="button"
            className="tool"
            data-testid="template-rename"
            onClick={() => setRenaming(true)}
          >
            {t('templates.rename')}
          </button>
        )}
        <button
          type="button"
          className="tool"
          data-testid="template-duplicate"
          onClick={() => void actions.duplicate(id, t('templates.copyName', { name: row.name }))}
        >
          {t(mine ? 'templates.duplicate' : 'templates.duplicateMine')}
        </button>
        {mine && (
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
        )}
        <button
          type="button"
          className="tool"
          data-testid="template-export"
          onClick={() => void actions.exportTo(id)}
        >
          {t('templates.export')}
        </button>
        {mine && (
          <button
            type="button"
            className="tool"
            data-testid="template-show"
            onClick={() => actions.show(id)}
          >
            {t('templates.showInFolder')}
          </button>
        )}
        {mine && (
          <button
            type="button"
            className="tool danger"
            data-testid="template-delete"
            onClick={() => onRemove(row)}
          >
            <Icon of={X} size={14} />
            {t('templates.delete')}
          </button>
        )}
      </div>
      {!mine && <p className="template-note">{t('templates.builtInLocked')}</p>}
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
