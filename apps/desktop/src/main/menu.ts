import type { MenuAction } from '@leathercad/platform';
import type { Input, MenuItemConstructorOptions } from 'electron';

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
 * a registered accelerator would run the action a second time. In the
 * interface's language (ADR 0018); macOS names the roles' items itself.
 */
export function macMenuTemplate(options: {
  readonly send: (action: MenuAction) => void;
  readonly t: Translate;
}): MenuItemConstructorOptions[] {
  const { send, t } = options;
  const action = (
    label: string,
    accelerator: string,
    sent: MenuAction,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(sent),
  });

  return [
    {
      // The first menu is the app menu, whatever its label says.
      label: 'LeatherCAD',
      submenu: [
        { label: t('menu.about'), click: () => send('about') },
        { type: 'separator' },
        action(t('menu.settings'), 'CmdOrCtrl+,', 'settings'),
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
        action(t('macMenu.undo'), 'CmdOrCtrl+Z', 'undo'),
        action(t('macMenu.redo'), 'CmdOrCtrl+Shift+Z', 'redo'),
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

/** What a key the native menu's roles used to give does, now there is no menu (8.7). */
export type WindowKey = 'full-screen' | 'quit' | 'developer-tools';

/**
 * The window's own keys (8.7): full screen everywhere, Quit off macOS — where
 * the app menu has it — and the developer tools only in a development build,
 * as the menu offered them only there (8.5a).
 */
export function windowKeyFor(
  input: Pick<Input, 'type' | 'key' | 'control' | 'shift' | 'alt'>,
  platform: { readonly isMac: boolean; readonly packaged: boolean },
): WindowKey | null {
  if (input.type !== 'keyDown') return null;
  const key = input.key.toLowerCase();
  if (key === 'f11') return 'full-screen';
  if (!platform.isMac && input.control && !input.shift && !input.alt && key === 'q') return 'quit';
  if (!platform.packaged && (key === 'f12' || (input.control && input.shift && key === 'i'))) {
    return 'developer-tools';
  }
  return null;
}
