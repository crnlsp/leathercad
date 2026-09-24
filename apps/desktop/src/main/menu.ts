import type { MenuAction } from '@leathercad/platform';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu (slice 8.5a).
 *
 * Electron's default menu offered View › Reload and Toggle Developer Tools in
 * the shipped app. A packaged build has neither; a development build keeps
 * them, where they are the point.
 *
 * What an item *does* belongs to the renderer: it is sent the action and runs
 * the same handler as the keyboard shortcut, so a menu choice and a key press
 * cannot drift apart. The shortcut is **shown but not registered** — the
 * renderer already handles the key, and a registered accelerator would run
 * the action a second time.
 *
 * Pure, so it is tested without Electron running: the caller supplies where
 * actions go, and how to show the log folder and the third-party notices.
 */
export function menuTemplate(options: {
  readonly isMac: boolean;
  readonly packaged: boolean;
  readonly send: (action: MenuAction) => void;
  readonly openLogFolder: () => void;
  readonly openNotices: () => void;
}): MenuItemConstructorOptions[] {
  const { isMac, packaged, send } = options;

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

  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      action('New', 'CmdOrCtrl+N', 'new'),
      action('Open…', 'CmdOrCtrl+O', 'open'),
      { type: 'separator' },
      action('Save', 'CmdOrCtrl+S', 'save'),
      action('Save As…', 'CmdOrCtrl+Shift+S', 'save-as'),
      { type: 'separator' },
      action('Export PDF…', 'CmdOrCtrl+E', 'export-pdf'),
      // Closing goes through the window, so unsaved work is asked about
      // (5.3a). On macOS Quit lives in the app menu.
      ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const]),
    ],
  };

  const edit: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      // The document's history, not a text field's.
      action('Undo', 'CmdOrCtrl+Z', 'undo'),
      action('Redo', 'CmdOrCtrl+Shift+Z', 'redo'),
      { type: 'separator' },
      // Text fields — the project name, every number — need these: on macOS a
      // field has no copy and paste without them.
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };

  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'togglefullscreen' },
      ...(packaged
        ? []
        : [
            { type: 'separator' } as const,
            { role: 'reload' } as const,
            { role: 'forceReload' } as const,
            { role: 'toggleDevTools' } as const,
          ]),
    ],
  };

  const help: MenuItemConstructorOptions = {
    label: 'Help',
    submenu: [
      { label: 'Show Log Folder', click: () => options.openLogFolder() },
      // The licences of what the app ships (8.6b), written by the build.
      { label: 'Third-Party Notices', click: () => options.openNotices() },
      ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'about' } as const]),
    ],
  };

  return isMac
    ? [{ role: 'appMenu' }, file, edit, view, { role: 'windowMenu' }, help]
    : [file, edit, view, help];
}
