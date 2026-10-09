import type { MessageKey } from '../../shared/i18n.js';
import { KEYMAP, type Binding, type ShortcutGroupId } from './keymap.js';

/** Keys, or a gesture of the pointer, and what they do. */
export interface Shortcut {
  /** Shown one by one, joined by "or". */
  readonly keys: readonly Binding[];
  /** What it does, in the catalogue (ADR 0018). */
  readonly does: MessageKey;
}

export interface ShortcutGroup {
  /** Its heading is `shortcuts.group.<id>`. */
  readonly id: ShortcutGroupId;
  readonly shortcuts: readonly Shortcut[];
}

/** A group's keys, from the keymap, in its order. */
function listed(group: ShortcutGroupId): Shortcut[] {
  return KEYMAP.filter((command) => command.group === group).map(({ keys, does }) => ({
    keys,
    does,
  }));
}

/**
 * Every key the app answers to, as Settings › Keyboard shortcuts lists it
 * (8.2) — **drawn from the keymap** (U.3), so it cannot describe a key the app
 * does not have, and a test holds the top bar's menus and macOS's to it. The
 * pointer's gestures are the only rows of its own: they are not keys.
 */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  { id: 'file', shortcuts: listed('file') },
  { id: 'edit', shortcuts: listed('edit') },
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
];

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
