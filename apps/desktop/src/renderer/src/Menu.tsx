import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { Icon } from './icons/Icon.js';
import { focusAfter, sharedReasons, type MenuEntry, type MenuItem } from './menus.js';
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
  // Escape gives focus back to the button — once the menu has closed. The
  // tooltip is off while the menu is open, which changes the button's
  // wrapping, so the button focused before the render is not the one after.
  const giveBack = useRef(false);

  useEffect(() => {
    if (open) return;
    if (giveBack.current) trigger.current?.focus();
    giveBack.current = false;
  }, [open]);

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
        <MenuPopup
          label={label}
          testId={`${testId}-items`}
          className={`menu ${align}`}
          entries={entries}
          // The button is inside too: a press on it closes the menu through
          // its own click, not twice.
          inside={root}
          onClose={(escaped) => {
            giveBack.current = escaped;
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * The right-click menu (8.8): the same menu, opened at the pointer rather
 * than under a button, and turned back from the window's edges so it is never
 * cut off.
 *
 * Mounted to open and unmounted to close. Keyed by where it opens, so a second
 * right-click while one is open is a new menu with its first item focused.
 */
export function ContextMenu({
  at,
  label,
  testId,
  entries,
  onClose,
}: {
  /** Where it opens, in CSS pixels from the window's top left. */
  at: { readonly x: number; readonly y: number };
  label: string;
  testId: string;
  entries: readonly MenuEntry[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(at);
  // Escape gives focus back to what had it: the Parts row, when that is
  // where the menu came from.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (box === undefined) return;
    setPlace({
      x: Math.max(0, Math.min(at.x, window.innerWidth - box.width)),
      y: Math.max(0, Math.min(at.y, window.innerHeight - box.height)),
    });
  }, [at]);

  return (
    <MenuPopup
      ref={menu}
      label={label}
      testId={testId}
      className="menu context"
      style={{ left: place.x, top: place.y }}
      entries={entries}
      inside={menu}
      onClose={(escaped) => {
        if (escaped) opener?.focus();
        onClose();
      }}
    />
  );
}

/**
 * The menu itself: its items, the keys that move through them, and what
 * closes it.
 */
function MenuPopup({
  ref,
  label,
  testId,
  className,
  style,
  entries,
  inside,
  onClose,
}: {
  ref?: RefObject<HTMLDivElement | null>;
  label: string;
  testId: string;
  className: string;
  style?: CSSProperties;
  entries: readonly MenuEntry[];
  /** Where a press may land without closing the menu. */
  inside: RefObject<HTMLElement | null>;
  /** `escaped` when Escape closed it, so focus can go back where it came from. */
  onClose: (escaped: boolean) => void;
}) {
  const own = useRef<HTMLDivElement>(null);
  const list = ref ?? own;
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: PointerEvent): void => {
      if (!inside.current?.contains(event.target as Node)) onCloseRef.current(false);
    };
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current(true);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape, true);
    };
  }, [inside, list]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Keys in a menu are the menu's: a letter must not change the tool behind it.
    event.stopPropagation();
    if (event.key === 'Tab') {
      onClose(false);
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

  const isMac = navigator.userAgent.includes('Mac');
  const said = sharedReasons(entries);
  const renderItem = (item: MenuItem) => {
    const refused = item.refusal !== undefined;
    // A reason the next item gives too is said once, under the last of them,
    // and still heard on each.
    const saidBy = said.get(item.id);
    const note = refused ? (saidBy === undefined ? item.refusal : undefined) : item.note;
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        className={item.danger === true ? 'menu-item danger' : 'menu-item'}
        data-testid={item.id}
        // Not `disabled`: a disabled button cannot take focus, and the arrow
        // keys still have to reach it to read why.
        aria-disabled={refused || undefined}
        aria-describedby={refused ? `${saidBy ?? item.id}-why` : undefined}
        onClick={() => {
          if (refused) return;
          onClose(false);
          item.onChoose();
        }}
      >
        <span className="menu-label">
          {item.icon !== undefined && <Icon of={item.icon} />}
          {item.label}
          {item.keys !== undefined && <kbd>{keysFor(item.keys, isMac)}</kbd>}
        </span>
        {note !== undefined && (
          <span className="menu-note" id={`${item.id}-why`}>
            {note}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      ref={list}
      className={className}
      style={style}
      role="menu"
      aria-label={label}
      data-testid={testId}
      onKeyDown={onMenuKey}
      // A right-click on the menu is not a right-click on what is under it.
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry, index) => {
        if (entry.kind === 'item') return renderItem(entry);
        if (entry.kind === 'separator') {
          return (
            <div key={`separator-${String(index)}`} className="menu-separator" role="separator" />
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
              entry.items.map((item) => renderItem(item))
            )}
          </div>
        );
      })}
    </div>
  );
}
