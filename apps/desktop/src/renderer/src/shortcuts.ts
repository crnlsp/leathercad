import type { MessageKey, Translate } from '../../shared/i18n.js';
import { TOOL_GROUPS } from './tools.js';

/** One key, or a key with a modifier, and what it does. */
export interface Shortcut {
  /**
   * The keys, as Electron writes them: `CmdOrCtrl+S`, `Shift+Z`, `Delete`.
   * `CmdOrCtrl` is shown as Ctrl, or ⌘ on macOS, by `keysFor`.
   */
  readonly keys: readonly string[];
  /** What it does, in the catalogue (ADR 0018). */
  readonly does: MessageKey;
}

export interface ShortcutGroup {
  /** Its heading is `shortcuts.group.<id>`. */
  readonly id: 'file' | 'edit' | 'view' | 'window' | 'tools' | 'drawing' | 'editingPoints';
  readonly shortcuts: readonly Shortcut[];
}

/**
 * Every key the app answers to, in one place (slice 8.2).
 *
 * Written down rather than discovered, because a shortcut nobody can find is
 * one nobody uses. The tool keys are read from where they are defined, and a
 * test holds the map to the top bar's menus and macOS's menu (8.7), so it
 * cannot come to describe a key the app no longer has.
 */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: 'file',
    shortcuts: [
      { keys: ['CmdOrCtrl+N'], does: 'shortcuts.newProject' },
      { keys: ['CmdOrCtrl+O'], does: 'shortcuts.openProject' },
      { keys: ['CmdOrCtrl+S'], does: 'shortcuts.save' },
      { keys: ['CmdOrCtrl+Shift+S'], does: 'shortcuts.saveAs' },
      { keys: ['CmdOrCtrl+E'], does: 'shortcuts.exportPdf' },
    ],
  },
  {
    id: 'edit',
    shortcuts: [
      { keys: ['CmdOrCtrl+Z'], does: 'shortcuts.undo' },
      { keys: ['CmdOrCtrl+Shift+Z'], does: 'shortcuts.redo' },
      { keys: ['Delete', 'Backspace'], does: 'shortcuts.delete' },
      { keys: ['Shift+F10', 'Menu'], does: 'shortcuts.contextMenu' },
      { keys: ['Escape'], does: 'shortcuts.cancel' },
    ],
  },
  {
    id: 'view',
    shortcuts: [
      { keys: ['CmdOrCtrl+1'], does: 'shortcuts.design' },
      { keys: ['CmdOrCtrl+2'], does: 'shortcuts.sheets' },
      { keys: ['CmdOrCtrl+='], does: 'shortcuts.zoomIn' },
      { keys: ['CmdOrCtrl+-'], does: 'shortcuts.zoomOut' },
      { keys: ['CmdOrCtrl+0'], does: 'shortcuts.fit' },
      { keys: ['Scroll'], does: 'shortcuts.zoom' },
      { keys: ['Middle-drag', 'Alt+drag'], does: 'shortcuts.pan' },
    ],
  },
  {
    id: 'window',
    shortcuts: [
      { keys: ['CmdOrCtrl+,'], does: 'shortcuts.settings' },
      { keys: ['CmdOrCtrl+/', '?'], does: 'shortcuts.keyboardShortcuts' },
      { keys: ['F11'], does: 'shortcuts.fullScreen' },
      { keys: ['CmdOrCtrl+Q'], does: 'shortcuts.quit' },
    ],
  },
  {
    id: 'tools',
    shortcuts: TOOL_GROUPS.flatMap((group) => group.tools).map((tool) => ({
      keys: [tool.key],
      does: `tools.${tool.id}.name` as const,
    })),
  },
  {
    id: 'drawing',
    shortcuts: [
      { keys: ['Shift'], does: 'shortcuts.square' },
      { keys: ['Enter'], does: 'shortcuts.finishPolyline' },
      { keys: ['Backspace'], does: 'shortcuts.takeBack' },
      { keys: ['A', 'L'], does: 'shortcuts.arcOrStraight' },
    ],
  },
  {
    id: 'editingPoints',
    shortcuts: [
      { keys: ['Delete', 'Backspace'], does: 'shortcuts.removePoint' },
      { keys: ['R'], does: 'shortcuts.roundCorner' },
    ],
  },
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

/** The keys named in words, which the interface's language names its own way (Strg, Entf). */
const NAMED_KEYS = [
  'Alt',
  'Backspace',
  'Ctrl',
  'Delete',
  'Enter',
  'Escape',
  'Menu',
  'Middle-drag',
  'Scroll',
  'Shift',
  'drag',
] as const;

function isNamedKey(part: string): part is (typeof NAMED_KEYS)[number] {
  return (NAMED_KEYS as readonly string[]).includes(part);
}

/** A key combination as this platform writes it, its keys named in the interface's language. */
export function keysFor(keys: string, isMac: boolean, t: Translate): string {
  const name = (part: string): string => (isNamedKey(part) ? t(`keys.${part}`) : part);
  return keys
    .split('+')
    .map((part) => {
      if (part === 'CmdOrCtrl') return isMac ? '⌘' : name('Ctrl');
      if (part === 'Alt' && isMac) return '⌥';
      if (part === 'Shift' && isMac) return '⇧';
      return name(part);
    })
    .join(isMac ? '' : '+');
}
