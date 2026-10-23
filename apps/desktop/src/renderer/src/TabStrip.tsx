import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { intoMenu } from './fieldMenu.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { isDirty, tabName, type ProjectTab } from './projectTabs.js';
import { Tooltip } from './Tooltip.js';

/**
 * The open projects, one tab each (8.12), on a strip of their own above the
 * project bar, under the system's title bar: the Project menu at its left,
 * the tabs, and *+*.
 *
 * The active tab is the project bar's colour and runs into it: the bar below
 * is that tab's. A tab says its project's name, and a dot where its close
 * button is while it has unsaved work — the button comes back under the
 * pointer, as in Notepad. A middle click closes it too. *Rename…* in the
 * Project menu turns the active tab's name into a field (U.7's rename, moved
 * here with the name).
 *
 * A `tablist`, chosen as the arrows move: Left and Right, Home and End, and
 * Delete closes the focused one. The close buttons are the pointer's — out of
 * the tab order and hidden from a screen reader, which closes with the keys —
 * so nothing interactive sits inside a tab.
 */
export function TabStrip({
  tabs,
  active,
  menu,
  renaming,
  onRenamed,
  onActivate,
  onClose,
  onNew,
}: {
  tabs: readonly ProjectTab[];
  /** None on the start screen. */
  active: ProjectTab | null;
  /** The Project menu's button, at the strip's left. */
  menu: ReactNode;
  /** The active tab's name is a field. */
  renaming: boolean;
  /** The name typed, or null when it was put back. */
  onRenamed: (next: string | null) => void;
  onActivate: (id: string) => void;
  /** Asks first when the tab has unsaved work. */
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);

  // The active tab in view, when there are more than the strip can show.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const moveTo = (index: number): void => {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (target === undefined) return;
    onActivate(target.id);
    requestAnimationFrame(() =>
      list.current?.querySelector<HTMLElement>(`[data-tab-id="${target.id}"]`)?.focus(),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || active === null) return;
    // The rename field's keys are its own.
    if (event.target instanceof HTMLInputElement) return;
    const at = tabs.indexOf(active);
    if (event.key === 'ArrowRight') moveTo(at + 1);
    else if (event.key === 'ArrowLeft') moveTo(at - 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(tabs.length - 1);
    else if (event.key === 'Delete') onClose(active.id);
    else return;
    event.preventDefault();
  };

  return (
    <div className="tab-strip" data-testid="tab-strip">
      {menu}
      <div
        ref={list}
        className="tab-list"
        role="tablist"
        aria-label={t('tabs.region')}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const name = tabName(tab, t);
          const unsaved = isDirty(tab);
          const selected = tab === active;
          return (
            <div
              key={tab.id}
              role="presentation"
              className={['tab', selected ? 'active' : '', unsaved ? 'unsaved' : '']
                .filter((each) => each !== '')
                .join(' ')}
              data-testid="project-tab"
              // A middle click closes, as in a browser; its press would start
              // Chromium's autoscroll.
              onMouseDown={(event) => {
                if (event.button === 1) event.preventDefault();
              }}
              onAuxClick={(event) => {
                if (event.button === 1) onClose(tab.id);
              }}
            >
              {selected && renaming ? (
                <NameField name={tab.store.getState().document.project.name} onDone={onRenamed} />
              ) : (
                <button
                  type="button"
                  role="tab"
                  className="tab-name"
                  data-tab-id={tab.id}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  aria-label={unsaved ? t('tabs.unsaved', { name }) : name}
                  // Its file, where the name alone may be one of two.
                  title={tab.file.path ?? name}
                  onClick={() => onActivate(tab.id)}
                >
                  <span {...(selected ? { 'data-testid': 'project-name' } : {})}>{name}</span>
                </button>
              )}
              <Tooltip
                text={t('tabs.closeTooltip')}
                {...(selected ? { keys: 'closeTab' as const } : {})}
              >
                <button
                  type="button"
                  className="tab-close"
                  data-testid="close-tab"
                  tabIndex={-1}
                  aria-hidden="true"
                  aria-label={t('tabs.close', { name })}
                  onClick={() => onClose(tab.id)}
                >
                  <span className="tab-dot" />
                  <Icon of={X} size={12} />
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <Tooltip text={t('tabs.newTooltip')} keys="newProject">
        <button
          type="button"
          className="tool quiet icon-only tab-new"
          data-testid="new-tab"
          aria-label={t('tabs.new')}
          onClick={onNew}
        >
          <Icon of={Plus} size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * The name, being renamed: Enter or leaving keeps it, Escape puts it back.
 * One edit, so one undo step — typed into the bar before U.7, every letter
 * was a step of its own.
 */
function NameField({ name, onDone }: { name: string; onDone: (next: string | null) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (next: string | null): void => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };
  return (
    <input
      ref={input}
      className="project-name-input"
      data-testid="project-name-input"
      aria-label={t('projectBar.name')}
      value={draft}
      placeholder={t('app.untitled')}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(draft);
        else if (event.key === 'Escape') {
          event.stopPropagation();
          finish(null);
        }
      }}
      onBlur={(event) => {
        // The field's own menu is not leaving it (U.20).
        if (!intoMenu(event.relatedTarget)) finish(draft);
      }}
    />
  );
}
