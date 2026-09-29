import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { Icon } from './icons/Icon.js';
import { focusAfter, type MenuEntry, type MenuItem } from './menus.js';
import { keysFor } from './shortcuts.js';
import { Tooltip } from './Tooltip.js';

/**
 * A button and the menu it opens (8.7): the Project and Help menus, and a
 * part's actions in Parts.
 *
 * The menu takes focus when it opens and gives it back when Escape closes
 * it — heard wherever focus is, since a click does not always leave it here.
 * A press anywhere else, or Tab, closes it too, so a menu never outlives the
 * thought that opened it (UI Foundations §7.1).
 */
export function MenuButton({
  label,
  tooltip,
  testId,
  className,
  align = 'start',
  entries,
  onOpen,
  children,
}: {
  /** The button's accessible name, and the menu's. */
  label: string;
  /** What the tooltip says while the menu is closed; the label if not given. */
  tooltip?: string;
  testId: string;
  className: string;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  entries: readonly MenuEntry[];
  /** Called as the menu opens, for a menu that shows something that changes. */
  onOpen?: () => void;
  /** The button's face. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Keys in a menu are the menu's: a letter must not change the tool behind it.
    event.stopPropagation();
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const next = focusAfter(
      event.key,
      items.indexOf(document.activeElement as HTMLElement),
      items.length,
    );
    if (next === -1) return;
    event.preventDefault();
    items[next]?.focus();
  };

  const choose = (item: MenuItem) => () => {
    setOpen(false);
    item.onChoose();
  };

  const isMac = navigator.userAgent.includes('Mac');
  const renderItem = (item: MenuItem) => (
    <button
      key={item.id}
      type="button"
      role="menuitem"
      className={item.danger === true ? 'menu-item danger' : 'menu-item'}
      data-testid={item.id}
      onClick={choose(item)}
    >
      <span className="menu-label">
        {item.icon !== undefined && <Icon of={item.icon} />}
        {item.label}
        {item.keys !== undefined && <kbd>{keysFor(item.keys, isMac)}</kbd>}
      </span>
      {item.note !== undefined && <span className="menu-note">{item.note}</span>}
    </button>
  );

  return (
    <div className="menu-anchor" ref={root}>
      <Tooltip text={open ? null : (tooltip ?? label)}>
        <button
          ref={trigger}
          type="button"
          className={className}
          data-testid={testId}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            if (!open) onOpen?.();
            setOpen((was) => !was);
          }}
        >
          {children}
        </button>
      </Tooltip>
      {open && (
        <div
          className={`menu ${align}`}
          role="menu"
          aria-label={label}
          data-testid={`${testId}-items`}
          onKeyDown={onMenuKey}
        >
          {entries.map((entry, index) => {
            if (entry.kind === 'item') return renderItem(entry);
            if (entry.kind === 'separator') {
              return (
                <div
                  key={`separator-${String(index)}`}
                  className="menu-separator"
                  role="separator"
                />
              );
            }
            // The heading is seen; the group's name is what is heard.
            return (
              <div key={entry.label} role="group" aria-label={entry.label}>
                <div className="menu-heading" aria-hidden="true">
                  {entry.label}
                </div>
                {entry.items.length === 0 ? (
                  <div
                    role="menuitem"
                    aria-disabled="true"
                    tabIndex={-1}
                    className="menu-item menu-empty"
                  >
                    {entry.empty}
                  </div>
                ) : (
                  entry.items.map(renderItem)
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
