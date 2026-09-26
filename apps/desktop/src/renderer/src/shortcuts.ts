import { TOOL_GROUPS } from './tools.js';

/** One key, or a key with a modifier, and what it does. */
export interface Shortcut {
  /**
   * The keys, as the menu writes them: `CmdOrCtrl+S`, `Shift+Z`, `Delete`.
   * `CmdOrCtrl` is shown as Ctrl, or ⌘ on macOS, by `keysFor`.
   */
  readonly keys: readonly string[];
  readonly does: string;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly shortcuts: readonly Shortcut[];
}

/**
 * Every key the app answers to, in one place (slice 8.2).
 *
 * Written down rather than discovered, because a shortcut nobody can find is
 * one nobody uses. The menu's shortcuts and the tool keys are read from where
 * they are defined — the tool list here, the menu by a test — so this map
 * cannot come to describe a key the app no longer has.
 */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'File',
    shortcuts: [
      { keys: ['CmdOrCtrl+N'], does: 'New project' },
      { keys: ['CmdOrCtrl+O'], does: 'Open a project' },
      { keys: ['CmdOrCtrl+S'], does: 'Save' },
      { keys: ['CmdOrCtrl+Shift+S'], does: 'Save as' },
      { keys: ['CmdOrCtrl+E'], does: 'Export PDF' },
    ],
  },
  {
    title: 'Edit',
    shortcuts: [
      { keys: ['CmdOrCtrl+Z'], does: 'Undo' },
      { keys: ['CmdOrCtrl+Shift+Z'], does: 'Redo' },
      { keys: ['Delete', 'Backspace'], does: 'Delete what is selected (Select tool)' },
      { keys: ['Escape'], does: 'Cancel what the tool is doing, or clear the selection' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: ['CmdOrCtrl+1'], does: 'Design: the board you draw on' },
      { keys: ['CmdOrCtrl+2'], does: 'Sheets: the paper it prints on' },
      { keys: ['CmdOrCtrl+='], does: 'Zoom in' },
      { keys: ['CmdOrCtrl+-'], does: 'Zoom out' },
      { keys: ['CmdOrCtrl+0'], does: 'Fit the pattern in the window' },
      { keys: ['Scroll'], does: 'Zoom about the pointer' },
      { keys: ['Middle-drag', 'Alt+drag'], does: 'Pan' },
      { keys: ['CmdOrCtrl+/', '?'], does: 'This list' },
    ],
  },
  {
    title: 'Tools',
    shortcuts: TOOL_GROUPS.flatMap((group) => group.tools).map((tool) => ({
      keys: [tool.key],
      does: tool.label,
    })),
  },
  {
    title: 'While drawing',
    shortcuts: [
      { keys: ['Shift'], does: 'Keep a rectangle square; hold a line to 15° steps' },
      { keys: ['Enter'], does: 'Finish a polyline' },
      { keys: ['Backspace'], does: 'Take back a polyline’s or an arc’s last point' },
      { keys: ['A', 'L'], does: 'Polyline: the next segment is an arc, or straight' },
    ],
  },
];

/** A key combination as this platform writes it. */
export function keysFor(keys: string, isMac: boolean): string {
  return keys
    .split('+')
    .map((part) => {
      if (part === 'CmdOrCtrl') return isMac ? '⌘' : 'Ctrl';
      if (part === 'Alt' && isMac) return '⌥';
      if (part === 'Shift' && isMac) return '⇧';
      return part;
    })
    .join(isMac ? '' : '+');
}
