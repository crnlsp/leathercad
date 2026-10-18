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
import { createPortal } from 'react-dom';

import { Icon } from './icons/Icon.js';
import { KeyCap } from './keyCaps.js';
import type { CommandId } from './keymap.js';
import { focusAfter, sharedReasons, type MenuEntry, type MenuItem } from './menus.js';
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
  above = false,
  entries,
  onOpen,
  keys,
  triggerRef,
  tabIndex,
  children,
}: {
  /** The button's accessible name, and the menu's. */
  label: string;
  /** What the tooltip says while the menu is closed; the label if not given. */
  tooltip?: string;
  /** The command that opens it, shown as a cap in the tooltip: Help's F1 (U.7). */
  keys?: CommandId;
  /** The button, for whoever opens the menu by its key, or gives focus back to it. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** -1 inside a widget that keeps one stop for Tab: a Parts row (U.8). */
  tabIndex?: number;
  testId: string;
  className: string;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  /** Opens upwards, for a button at the foot of the canvas, which clips what runs past it (U.4). */
  above?: boolean;
  entries: readonly MenuEntry[];
  /** Called as the menu opens, for a menu that shows something that changes. */
  onOpen?: () => void;
  /** The button's face. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const own = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? own;
  // Escape, or choosing an item by keyboard, gives focus back to the button —
  // once the menu has closed. The tooltip is off while the menu is open, which
  // changes the button's wrapping, so the button focused before the render is
  // not the one after. Only if nothing else took it: a dialog the item opened
  // keeps it. Choosing gave it to the page until U.4, so the keyboard lost its
  // place; an item chosen by the pointer still leaves focus with the page.
  const giveBack = useRef(false);

  useEffect(() => {
    if (open) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (giveBack.current && lost) trigger.current?.focus();
    giveBack.current = false;
  }, [open, trigger]);

  return (
    <div className="menu-anchor" ref={root}>
      <Tooltip text={open ? null : (tooltip ?? label)} {...(keys === undefined ? {} : { keys })}>
        <button
          ref={trigger}
          type="button"
          className={className}
          data-testid={testId}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          tabIndex={tabIndex}
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
          className={`menu ${align}${above ? ' above' : ''}`}
          entries={entries}
          // The button is inside too: a press on it closes the menu through
          // its own click, not twice.
          inside={root}
          onClose={(how) => {
            giveBack.current = how !== 'away';
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
 * cut off. It goes into the landmark it was opened from — the board, Parts, a
 * dialog — so its words are in a region like everything else (U.20, U.19).
 *
 * Mounted to open and unmounted to close. Keyed by where it opens, so a second
 * right-click while one is open is a new menu with its first item focused.
 */
export function ContextMenu({
  at,
  from,
  label,
  testId,
  entries,
  onClose,
}: {
  /** Where it opens, in CSS pixels from the window's top left. */
  at: { readonly x: number; readonly y: number };
  /** What it is about, whose landmark it goes into; what had focus, if not given. */
  from?: Element;
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

  const [home] = useState(
    () =>
      (from ?? opener)?.closest(
        '[role="dialog"], header, main, aside, footer, nav, [role="region"]',
      ) ?? document.body,
  );

  return createPortal(
    <MenuPopup
      ref={menu}
      label={label}
      testId={testId}
      className="menu context"
      style={{ left: place.x, top: place.y }}
      entries={entries}
      inside={menu}
      onClose={(how) => {
        if (how === 'escape') opener?.focus();
        onClose();
      }}
    />,
    home,
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
  /**
   * How it closed — Escape, an item chosen from the keyboard, or a press
   * (elsewhere or on an item) or Tab — so focus can go back where it came from.
   */
  onClose: (how: 'escape' | 'chosen' | 'away') => void;
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
      if (!inside.current?.contains(event.target as Node)) onCloseRef.current('away');
    };
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current('escape');
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
      onClose('away');
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
        onClick={(event) => {
          if (refused) return;
          // Chosen by the pointer, focus is left where a press leaves it, as
          // before U.4: on the button it would take the board's next Enter.
          onClose(event.detail === 0 ? 'chosen' : 'away');
          item.onChoose(event.detail === 0 ? 'keyboard' : 'pointer');
        }}
      >
        <span className="menu-label">
          {item.icon !== undefined && <Icon of={item.icon} />}
          {item.label}
          {item.keys !== undefined && <KeyCap command={item.keys} />}
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
