import type { MenuAction } from '@leathercad/platform';
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { menuTemplate } from './menu.js';

/**
 * The production menu (slice 8.5a).
 *
 * Electron's default menu offered View › Reload and Toggle Developer Tools in
 * the shipped app: a reload throws unsaved work at the 5.3a question, and the
 * developer tools are a general-purpose console into the renderer. The menu
 * is now the app's own, and its items run the renderer's own handlers.
 */

function build(options: { isMac?: boolean; packaged?: boolean } = {}) {
  const send = vi.fn<(action: MenuAction) => void>();
  const openLogFolder = vi.fn();
  const openNotices = vi.fn();
  const template = menuTemplate({
    isMac: options.isMac ?? false,
    packaged: options.packaged ?? true,
    send,
    openLogFolder,
    openNotices,
  });
  return { template, send, openLogFolder, openNotices };
}

/** Every item, at any depth. */
function all(items: readonly MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? all(item.submenu as MenuItemConstructorOptions[]) : []),
  ]);
}

function item(template: readonly MenuItemConstructorOptions[], label: string) {
  const found = all(template).find((entry) => entry.label === label);
  if (found === undefined) throw new Error(`no menu item "${label}"`);
  return found;
}

const DEVELOPER_ROLES = ['reload', 'forceReload', 'toggleDevTools'];

describe('the application menu', () => {
  it.each([false, true])(
    'offers no reload and no developer tools when packaged (mac: %s)',
    (isMac) => {
      const roles = all(build({ isMac, packaged: true }).template).map((entry) => entry.role);
      for (const role of DEVELOPER_ROLES) expect(roles).not.toContain(role);
    },
  );

  it('keeps them while developing, where they are the point', () => {
    const roles = all(build({ packaged: false }).template).map((entry) => entry.role);
    for (const role of DEVELOPER_ROLES) expect(roles).toContain(role);
  });

  it.each([
    ['New', 'new', 'CmdOrCtrl+N'],
    ['Open…', 'open', 'CmdOrCtrl+O'],
    ['Save', 'save', 'CmdOrCtrl+S'],
    ['Save As…', 'save-as', 'CmdOrCtrl+Shift+S'],
    ['Export PDF…', 'export-pdf', 'CmdOrCtrl+E'],
    ['Undo', 'undo', 'CmdOrCtrl+Z'],
    ['Redo', 'redo', 'CmdOrCtrl+Shift+Z'],
    ['Design', 'view-design', 'CmdOrCtrl+1'],
    ['Sheets', 'view-sheets', 'CmdOrCtrl+2'],
  ] as const)('%s asks the renderer for %s, and shows %s', (label, action, accelerator) => {
    const { template, send } = build();
    const entry = item(template, label);
    entry.click?.({} as never, undefined, {} as never);
    expect(send).toHaveBeenCalledWith(action);
    // Shown, not registered: the renderer already handles the key, and a
    // registered accelerator would run the action a second time.
    expect(entry.accelerator).toBe(accelerator);
    expect(entry.registerAccelerator).toBe(false);
  });

  it('keeps cut, copy and paste, which text fields need on macOS', () => {
    const roles = all(build({ isMac: true }).template).map((entry) => entry.role);
    for (const role of ['cut', 'copy', 'paste', 'selectAll']) expect(roles).toContain(role);
  });

  it('puts About and Quit where each platform expects them', () => {
    const mac = build({ isMac: true }).template;
    expect(mac[0]!.role).toBe('appMenu');

    const other = build({ isMac: false }).template;
    expect(other.map((entry) => entry.label)).toEqual(['File', 'Edit', 'View', 'Help']);
    const file = other[0]!.submenu as MenuItemConstructorOptions[];
    expect(file.at(-1)!.role).toBe('quit');
    expect(all(other).map((entry) => entry.role)).toContain('about');
  });

  it('opens the log folder from Help, for reporting a problem', () => {
    const { template, openLogFolder } = build();
    item(template, 'Show Log Folder').click?.({} as never, undefined, {} as never);
    expect(openLogFolder).toHaveBeenCalledOnce();
  });

  it('shows the third-party notices from Help, on every platform (8.6b)', () => {
    for (const isMac of [false, true]) {
      const { template, openNotices } = build({ isMac });
      item(template, 'Third-Party Notices').click?.({} as never, undefined, {} as never);
      expect(openNotices).toHaveBeenCalledOnce();
    }
  });
});
