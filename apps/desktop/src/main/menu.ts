import type { MenuAction } from '@leathercad/platform';
import type { Input, MenuItemConstructorOptions } from 'electron';

import { keysOf, matches, type Binding, type CommandId } from '../renderer/src/keymap.js';
import type { Translate } from '../shared/i18n.js';

/**
 * The application menu — on macOS only (8.7).
 *
 * Linux and Windows have none: the project bar holds the project's actions,
 * Settings and Help, each once. macOS keeps what the platform itself expects:
 * the app menu, Edit — whose roles are what give a text field copy and paste
 * there — and Window. Its About and Settings open the renderer's own dialogs,
 * the ones the project bar opens.
 *
 * Shortcuts are shown but not registered: the renderer handles the keys, and
 * a registered accelerator would run the action a second time. They are the
 * keymap's, the maker's keys in it (U.12), so the menu is rebuilt when one
 * changes. In the interface's language (ADR 0018); macOS names the roles'
 * items itself.
 */
export function macMenuTemplate(options: {
  readonly send: (action: MenuAction) => void;
  readonly t: Translate;
}): MenuItemConstructorOptions[] {
  const { send, t } = options;
  const action = (
    label: string,
    command: CommandId,
    sent: MenuAction,
  ): MenuItemConstructorOptions => {
    const key = keysOf(command)[0];
    const shown = key === undefined ? undefined : accelerator(key);
    return {
      label,
      ...(shown === undefined ? {} : { accelerator: shown, registerAccelerator: false }),
      click: () => send(sent),
    };
  };

  return [
    {
      // The first menu is the app menu, whatever its label says.
      label: 'LeatherCAD',
      submenu: [
        { label: t('menu.about'), click: () => send('about') },
        { type: 'separator' },
        action(t('menu.settings'), 'settings', 'settings'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        // Closing goes through the window, so unsaved work is asked about (5.3a).
        { role: 'quit' },
      ],
    },
    {
      label: t('macMenu.edit'),
      submenu: [
        // The document's history, not a text field's.
        action(t('macMenu.undo'), 'undo', 'undo'),
        action(t('macMenu.redo'), 'redo', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { role: 'windowMenu' },
  ];
}

/** Electron's names for the keys that are not a letter, a digit or a function key. */
const ELECTRON_KEYS: Readonly<Record<string, string>> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
};

/**
 * A binding as Electron writes an accelerator — `CmdOrCtrl+Shift+Z` — which
 * macOS's menu shows in its own way; undefined for a key it has no name for,
 * which the menu then shows without one.
 */
export function accelerator(binding: Binding): string | undefined {
  const key =
    'char' in binding ? (binding.char === '+' ? 'Plus' : binding.char) : electronKey(binding.code);
  if (key === undefined) return undefined;
  const code = 'code' in binding;
  return [
    ...(binding.mod === true ? ['CmdOrCtrl'] : []),
    ...(code && binding.alt === true ? ['Alt'] : []),
    ...(code && binding.shift === true ? ['Shift'] : []),
    key,
  ].join('+');
}

function electronKey(code: string): string | undefined {
  const letterOrDigit = /^(?:Key|Digit)(.)$/.exec(code)?.[1];
  if (letterOrDigit !== undefined) return letterOrDigit;
  if (/^F\d+$/.test(code)) return code;
  const numpad = /^Numpad(\d)$/.exec(code)?.[1];
  return numpad === undefined ? ELECTRON_KEYS[code] : `num${numpad}`;
}

/** What a key the native menu's roles used to give does, now there is no menu (8.7). */
export type WindowKey = 'full-screen' | 'quit' | 'developer-tools';

/**
 * The window's own keys (8.7): full screen everywhere, Quit off macOS — where
 * the app menu has it — and the developer tools only in a development build,
 * as the menu offered them only there (8.5a). Full screen and Quit are the
 * keymap's, matched as the window matches its keys (U.3): Q is the key that
 * types Q, wherever the layout puts it.
 */
export function windowKeyFor(
  input: Pick<Input, 'type' | 'key' | 'code' | 'control' | 'meta' | 'shift' | 'alt'>,
  platform: {
    readonly isMac: boolean;
    readonly packaged: boolean;
    /** Settings is listening for a new key (U.12): every key is the renderer's. */
    readonly capturing?: boolean;
  },
): WindowKey | null {
  if (input.type !== 'keyDown' || platform.capturing === true) return null;
  const press = {
    code: input.code,
    key: input.key,
    ctrlKey: input.control,
    metaKey: input.meta,
    shiftKey: input.shift,
    altKey: input.alt,
  };
  const is = (command: CommandId): boolean =>
    keysOf(command).some((binding) => matches(press, binding, platform.isMac));
  if (is('fullScreen')) return 'full-screen';
  if (!platform.isMac && is('quit')) return 'quit';
  const key = input.key.toLowerCase();
  if (!platform.packaged && (key === 'f12' || (input.control && input.shift && key === 'i'))) {
    return 'developer-tools';
  }
  return null;
}
