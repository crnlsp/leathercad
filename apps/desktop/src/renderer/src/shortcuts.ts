import type { MessageKey } from '../../shared/i18n.js';
import {
  currentKeymap,
  type Binding,
  type Command,
  type CommandId,
  type ShortcutGroupId,
} from './keymap.js';

/** Keys, or a gesture of the pointer, and what they do. */
export interface Shortcut {
  /** The keymap's command; absent for a gesture of the pointer. */
  readonly id?: CommandId;
  /** Shown one by one, joined by "or". */
  readonly keys: readonly Binding[];
  /** What it does, in the catalogue (ADR 0018). */
  readonly does: MessageKey;
  /** Its keys cannot be changed (U.12). */
  readonly fixed?: true;
}

export interface ShortcutGroup {
  /** Its heading is `shortcuts.group.<id>`. */
  readonly id: ShortcutGroupId;
  readonly shortcuts: readonly Shortcut[];
}

/**
 * Every key the app answers to, as Settings › Keyboard shortcuts lists it
 * (8.2) — **drawn from the keymap** (U.3), the maker's keys in it (U.12), so
 * it cannot describe a key the app does not have, and a test holds the top
 * bar's menus and macOS's to it. The pointer's gestures are the only rows of
 * its own: they are not keys.
 */
export function shortcutGroups(keymap: readonly Command[] = currentKeymap()): ShortcutGroup[] {
  const listed = (group: ShortcutGroupId): Shortcut[] =>
    keymap
      .filter((command) => command.group === group)
      .map(({ id, keys, does, fixed }) => ({ id, keys, does, ...(fixed ? { fixed } : {}) }));
  return [
    { id: 'file', shortcuts: listed('file') },
    { id: 'edit', shortcuts: listed('edit') },
    { id: 'field', shortcuts: listed('field') },
    {
      id: 'view',
      shortcuts: [
        ...listed('view'),
        { keys: [{ code: 'Scroll' }], does: 'shortcuts.zoom' },
        { keys: [{ code: 'MiddleDrag' }, { code: 'Drag', alt: true }], does: 'shortcuts.pan' },
      ],
    },
    { id: 'window', shortcuts: listed('window') },
    { id: 'tools', shortcuts: listed('tools') },
    {
      id: 'drawing',
      shortcuts: [{ keys: [{ code: 'Shift' }], does: 'shortcuts.square' }, ...listed('drawing')],
    },
    { id: 'editingPoints', shortcuts: listed('editingPoints') },
    { id: 'parts', shortcuts: listed('parts') },
  ];
}

/**
 * Whether a key is going into something the maker is typing in (8.7): a
 * field, a text area, a list — whose letters are its type-ahead — or anything
 * editable. The window's shortcuts leave those keys alone, so a `?` typed in
 * a name is a question mark.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (target === null || !('tagName' in target)) return false;
  const element = target as { readonly tagName: string; readonly isContentEditable?: boolean };
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable === true
  );
}

/** The roles a focused control is pressed by Space in, as a button is. */
const PRESSED_BY_SPACE = new Set([
  'button',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'checkbox',
  'switch',
  'radio',
  'option',
]);

/**
 * Whether a key press is a focused control's own (U.12): Space alone presses
 * a button, a tab or a menu item, as Enter does. No shortcut can take Enter;
 * one moved to Space leaves it to the control that has the focus.
 */
export function pressesControl(event: {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly target: EventTarget | null;
}): boolean {
  if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }
  const target = event.target as {
    tagName?: string;
    getAttribute?: (name: string) => string | null;
  } | null;
  if (target?.tagName === undefined) return false;
  return (
    ['BUTTON', 'SUMMARY'].includes(target.tagName) ||
    PRESSED_BY_SPACE.has(target.getAttribute?.('role') ?? '')
  );
}
