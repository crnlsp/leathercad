import type { TemplateEntry } from '@leathercad/platform';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { BUILT_IN_TEMPLATES } from './templates.js';
import { Tooltip } from './Tooltip.js';

/**
 * *New project from template…* (8.12): the templates that ship with the app,
 * each with a line on what it is, then the maker's own, which can be removed
 * here. Choosing one opens it as a new project in a tab of its own — untitled,
 * so Save asks where, and the template itself is never written.
 *
 * A list of choices, as a dialog's: the arrows go up and down it, Enter takes
 * the one with focus, and Escape closes.
 */
export function TemplateDialog({
  templates,
  onChoose,
  onRemove,
  onClose,
}: {
  /** What the main process lists: the built-in ones, then the maker's. */
  templates: readonly TemplateEntry[];
  onChoose: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-template]')?.focus();
  }, []);

  const builtIn = BUILT_IN_TEMPLATES.filter((each) =>
    templates.some((entry) => entry.id === `builtin:${each.id}`),
  ).map((each) => ({
    id: `builtin:${each.id}`,
    name: t(each.name),
    note: t(each.description),
    mine: false,
  }));
  const mine = templates
    .filter((entry) => entry.kind === 'mine')
    .map((entry) => ({ id: entry.id, name: entry.name, note: '', mine: true }));
  const all = [...builtIn, ...mine];

  const move = (to: number): void => {
    const next = (to + all.length) % all.length;
    setFocused(next);
    list.current?.querySelectorAll<HTMLElement>('[data-template]')[next]?.focus();
  };

  const row = (entry: (typeof all)[number], index: number) => (
    <li key={entry.id} className="template-row">
      <button
        type="button"
        className="template-choice"
        data-template={entry.id}
        data-testid={`template-${entry.id}`}
        tabIndex={index === focused ? 0 : -1}
        onFocus={() => setFocused(index)}
        onClick={() => onChoose(entry.id)}
      >
        <span className="template-name">{entry.name}</span>
        {entry.note !== '' && <span className="template-note">{entry.note}</span>}
      </button>
      {entry.mine && (
        <Tooltip text={t('templates.removeTooltip')}>
          <button
            type="button"
            className="tool quiet icon-only"
            data-testid={`template-remove-${entry.id}`}
            aria-label={t('templates.remove', { name: entry.name })}
            onClick={() => onRemove(entry.id)}
          >
            <Icon of={X} size={14} />
          </button>
        </Tooltip>
      )}
    </li>
  );

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
          else if (event.key === 'ArrowDown') move(focused + 1);
          else if (event.key === 'ArrowUp') move(focused - 1);
          else return;
          event.preventDefault();
        }}
      >
        <h3 id="template-dialog-title">{t('templates.title')}</h3>
        <div ref={list} className="template-lists">
          <section aria-labelledby="templates-built-in">
            <h4 id="templates-built-in" className="template-heading">
              {t('templates.builtIn')}
            </h4>
            <ul className="template-list">{builtIn.map((entry, index) => row(entry, index))}</ul>
          </section>
          <section aria-labelledby="templates-mine">
            <h4 id="templates-mine" className="template-heading">
              {t('templates.mine')}
            </h4>
            {mine.length === 0 ? (
              <p className="template-empty">{t('templates.mineEmpty')}</p>
            ) : (
              <ul className="template-list">
                {mine.map((entry, index) => row(entry, builtIn.length + index))}
              </ul>
            )}
          </section>
        </div>
        <div className="dialog-actions">
          <button type="button" className="tool" data-testid="template-close" onClick={onClose}>
            {t('actions.cancel')}
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
