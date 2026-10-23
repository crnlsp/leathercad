import type { Project } from '@leathercad/domain';
import type { TemplateEntry } from '@leathercad/platform';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, piecesOf, templatePreview } from './templatePreview.js';
import { BUILT_IN_TEMPLATES } from './templates.js';
import { Tooltip } from './Tooltip.js';

/** A template, as the picker shows it: what the main process listed, and the project it holds. */
export interface TemplateChoice {
  readonly entry: TemplateEntry;
  /** Null when its file did not load: it is still listed, with no picture. */
  readonly project: Project | null;
}

/**
 * *New project from template…* (8.14): the templates that ship with the app,
 * then the maker's own. Each is shown as what it is — its pieces drawn small,
 * as the board draws them, its name, what it is for and how many pieces it
 * cuts — and chosen, then used: *Use template*, a double click, or Enter.
 * The project opens in a tab of its own, untitled, and the template itself is
 * never written.
 *
 * A listbox: the arrows choose, Enter uses, Delete removes one of the
 * maker's, and Escape closes.
 */
export function TemplateDialog({
  templates,
  onChoose,
  onRemove,
  onClose,
}: {
  templates: readonly TemplateChoice[];
  onChoose: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const builtIn = BUILT_IN_TEMPLATES.flatMap((each) => {
      const found = templates.find((choice) => choice.entry.id === `builtin:${each.id}`);
      return found === undefined
        ? []
        : [{ ...found, name: t(each.name), note: t(each.description) }];
    });
    const mine = templates
      .filter((choice) => choice.entry.kind === 'mine')
      .map((choice) => ({ ...choice, name: choice.entry.name, note: '' }));
    return { builtIn, mine, all: [...builtIn, ...mine] };
  }, [templates, t]);
  const previews = useMemo(
    () =>
      new Map(
        rows.all.map((row) => [
          row.entry.id,
          row.project === null ? null : templatePreview(row.project),
        ]),
      ),
    [rows],
  );

  // The one chosen; once removed, the first.
  const [picked, setChosen] = useState(rows.all[0]?.entry.id ?? null);
  const chosen = rows.all.some((row) => row.entry.id === picked)
    ? picked
    : (rows.all[0]?.entry.id ?? null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, []);
  const at = rows.all.findIndex((row) => row.entry.id === chosen);
  const choose = (index: number): void => {
    const row = rows.all[(index + rows.all.length) % rows.all.length];
    if (row === undefined) return;
    setChosen(row.entry.id);
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLElement>(`[data-template="${CSS.escape(row.entry.id)}"]`)
        ?.focus(),
    );
  };

  const option = (row: (typeof rows.all)[number]) => {
    const selected = row.entry.id === chosen;
    const preview = previews.get(row.entry.id) ?? null;
    return (
      <div key={row.entry.id} role="presentation" className="template-row">
        <div
          role="option"
          aria-selected={selected}
          tabIndex={selected ? 0 : -1}
          className="template-choice"
          data-template={row.entry.id}
          data-testid={`template-${row.entry.id}`}
          onClick={() => setChosen(row.entry.id)}
          onDoubleClick={() => onChoose(row.entry.id)}
        >
          <span className="template-preview" aria-hidden="true">
            {preview !== null && (
              <img src={preview} alt="" width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} />
            )}
          </span>
          <span className="template-text">
            <span className="template-name">{row.name}</span>
            {row.note !== '' && <span className="template-note">{row.note}</span>}
            {row.project !== null && (
              <span className="template-pieces">
                {t('templates.pieces', { count: piecesOf(row.project) })}
              </span>
            )}
          </span>
        </div>
        {row.entry.kind === 'mine' && (
          <Tooltip text={t('templates.removeTooltip')}>
            <button
              type="button"
              className="tool quiet icon-only template-remove"
              data-testid={`template-remove-${row.entry.id}`}
              tabIndex={-1}
              aria-label={t('templates.remove', { name: row.name })}
              onClick={() => onRemove(row.entry.id)}
            >
              <Icon of={X} size={14} />
            </button>
          </Tooltip>
        )}
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
          if (event.key === 'Escape') onClose();
          else if (event.key === 'ArrowDown') choose(at + 1);
          else if (event.key === 'ArrowUp') choose(at - 1);
          else if (event.key === 'Home') choose(0);
          else if (event.key === 'End') choose(rows.all.length - 1);
          else if (
            event.key === 'Enter' &&
            chosen !== null &&
            !(event.target instanceof HTMLButtonElement)
          ) {
            onChoose(chosen);
          } else if (event.key === 'Delete' && chosen?.startsWith('mine:') === true) {
            onRemove(chosen);
          } else return;
          event.preventDefault();
        }}
      >
        <h3 id="template-dialog-title">{t('templates.title')}</h3>
        <div
          ref={list}
          className="template-lists"
          role="listbox"
          aria-labelledby="template-dialog-title"
        >
          <div role="group" aria-labelledby="templates-built-in" className="template-group">
            <h4 id="templates-built-in" className="template-heading">
              {t('templates.builtIn')}
            </h4>
            {rows.builtIn.map(option)}
          </div>
          <div role="group" aria-labelledby="templates-mine" className="template-group">
            <h4 id="templates-mine" className="template-heading">
              {t('templates.mine')}
            </h4>
            {rows.mine.length === 0 ? (
              <p className="template-empty" role="presentation">
                {t('templates.mineEmpty')}
              </p>
            ) : (
              rows.mine.map(option)
            )}
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="tool" data-testid="template-close" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="tool primary"
            data-testid="template-use"
            disabled={chosen === null}
            onClick={() => (chosen === null ? undefined : onChoose(chosen))}
          >
            {t('templates.use')}
          </button>
        </div>
      </div>
    </div>
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
