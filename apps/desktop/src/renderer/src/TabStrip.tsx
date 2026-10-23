import { ChevronDown, X } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { intoMenu } from './fieldMenu.js';
import { ContextMenu, MenuButton } from './Menu.js';
import { tabMenu } from './menus.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { isDirty, tabName, type ProjectTab } from './projectTabs.js';
import { Tooltip } from './Tooltip.js';

/**
 * The open projects, one tab each (8.12), on a strip of their own above the
 * project bar, under the system's title bar: the Project menu at its left,
 * the tabs, and *+*, a menu of a new project or one the maker has.
 *
 * The tabs are drawing sheets: square, a hairline between them, and the open
 * one laid on top — outlined on three sides, open into the project bar below,
 * which is its. A tab says its project's name, and a dot where its close
 * button is while it has unsaved work — the button comes back under the
 * pointer, as in Notepad. A middle click closes it too, and a right-click
 * opens its own menu: rename, save, reload from disk, duplicate, show in
 * folder, copy path, move to the Trash, close. *Rename…* in the
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
  add,
  trailing,
  nudged,
  renaming,
  onRenamed,
  onActivate,
  onClose,
  onTabMenu,
}: {
  tabs: readonly ProjectTab[];
  /** None on the start screen. */
  active: ProjectTab | null;
  /** The Project menu's button, at the strip's left. */
  menu: ReactNode;
  /** *+*, after the tabs: a new project, or one the maker has. */
  add: ReactNode;
  /** At the strip's far end: the application's own controls, on the start screen. */
  trailing?: ReactNode;
  /** A tab to bounce: its project was opened again, and was open already. */
  nudged: { readonly id: string | null; readonly count: number };
  /** The active tab's name is a field. */
  renaming: boolean;
  /** The name typed, or null when it was put back. */
  onRenamed: (next: string | null) => void;
  onActivate: (id: string) => void;
  /** Asks first when the tab has unsaved work. */
  onClose: (id: string) => void;
  /** A tab's own menu, at a point in the window: a right-click, or the menu key. */
  onTabMenu: (id: string, at: { x: number; y: number }) => void;
}) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);
  const bounced = tabs.find((tab) => tab.id === nudged.id);
  const alreadyOpen =
    bounced === undefined ? '' : t('tabs.alreadyOpen', { name: tabName(bounced, t) });

  // More tabs than the strip can show (8.12): the wheel scrolls them, and a
  // list of them all is one press away.
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const element = list.current;
    if (element === null) return;
    const measure = (): void => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tabs]);

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
    // A landmark of its own (axe's `region`): the open projects, and the ways
    // to more of them.
    <nav className="tab-strip" aria-label={t('tabs.strip')} data-testid="tab-strip">
      {menu}
      <div
        ref={list}
        className="tab-list"
        role="tablist"
        aria-label={t('tabs.region')}
        onKeyDown={onKeyDown}
        // An upright wheel scrolls the strip sideways, the only way it goes.
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.currentTarget.scrollLeft += event.deltaY;
          }
        }}
      >
        {tabs.map((tab) => {
          const name = tabName(tab, t);
          const unsaved = isDirty(tab);
          const selected = tab === active;
          return (
            <div
              key={tab.id}
              role="presentation"
              className={[
                'tab',
                selected ? 'active' : '',
                unsaved ? 'unsaved' : '',
                tab.id === nudged.id ? `nudged nudged-${String(nudged.count % 2)}` : '',
              ]
                .filter((each) => each !== '')
                .join(' ')}
              data-testid="project-tab"
              // A middle click closes, as in a browser; its press would start
              // Chromium's autoscroll.
              onMouseDown={(event) => {
                if (event.button === 1) event.preventDefault();
              }}
              // Its menu (8.12): where the pointer is, or from the menu key or
              // Shift+F10, under the tab.
              onContextMenu={(event) => {
                event.preventDefault();
                const box = event.currentTarget.getBoundingClientRect();
                onTabMenu(
                  tab.id,
                  event.button === -1
                    ? { x: box.left, y: box.bottom }
                    : { x: event.clientX, y: event.clientY },
                );
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
      {overflowing && (
        <MenuButton
          label={t('tabs.all')}
          tooltip={t('tabs.allTooltip')}
          testId="all-tabs"
          className="tool quiet icon-only tab-all"
          entries={tabs.map((tab, index) => ({
            kind: 'item' as const,
            id: `all-tabs-${String(index)}`,
            label: tabName(tab, t),
            ...(isDirty(tab) ? { note: t('tabs.unsavedNote') } : {}),
            onChoose: () => onActivate(tab.id),
          }))}
        >
          <Icon of={ChevronDown} size={14} />
        </MenuButton>
      )}
      {add}
      {/* Said politely, as the tab bounces: what was asked for was open already. */}
      <span className="visually-hidden" aria-live="polite" data-testid="already-open">
        {alreadyOpen}
      </span>
      {trailing !== undefined && trailing !== null && (
        <div className="tab-strip-end" role="group" aria-label={t('projectBar.application')}>
          {trailing}
        </div>
      )}
    </nav>
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

/** A tab's own menu (8.12), open at a point: `tabMenu`'s entries for that tab. */
export function TabContextMenu({
  tab,
  at,
  othersOpen,
  actions,
  onClose,
}: {
  tab: ProjectTab;
  at: { readonly x: number; readonly y: number };
  othersOpen: boolean;
  actions: Parameters<typeof tabMenu>[0];
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <ContextMenu
      at={at}
      label={t('tabMenu.label', { name: tabName(tab, t) })}
      testId="tab-menu"
      entries={tabMenu(actions, { hasFile: tab.file.path !== null, othersOpen }, t)}
      onClose={onClose}
    />
  );
}
