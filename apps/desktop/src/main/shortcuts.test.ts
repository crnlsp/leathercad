import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { SHORTCUT_GROUPS, keysFor } from '../renderer/src/shortcuts.js';
import { TOOL_GROUPS } from '../renderer/src/tools.js';
import { menuTemplate } from './menu.js';

/**
 * The shortcut map (8.2) is only useful while it is true, so it is held to
 * the two places keys are defined: the application menu and the tool list.
 */

const listed = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);
const listedKeys = new Set(listed.flatMap((shortcut) => shortcut.keys));

function accelerators(items: readonly MenuItemConstructorOptions[]): string[] {
  return items.flatMap((item) => [
    ...(typeof item.accelerator === 'string' ? [item.accelerator] : []),
    ...(Array.isArray(item.submenu)
      ? accelerators(item.submenu as MenuItemConstructorOptions[])
      : []),
  ]);
}

describe('the keyboard shortcut map', () => {
  it.each([false, true])('lists every shortcut the menu shows (mac: %s)', (isMac) => {
    const template = menuTemplate({
      isMac,
      packaged: true,
      send: () => undefined,
      openLogFolder: () => undefined,
      openNotices: () => undefined,
    });
    for (const accelerator of accelerators(template)) expect(listedKeys).toContain(accelerator);
  });

  it('lists every tool by its key', () => {
    for (const tool of TOOL_GROUPS.flatMap((group) => group.tools)) {
      expect(listed).toContainEqual({ keys: [tool.key], does: tool.label });
    }
  });

  it('gives no two tools the same key', () => {
    const keys = TOOL_GROUPS.flatMap((group) => group.tools).map((tool) => tool.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('writes keys as each platform does', () => {
    expect(keysFor('CmdOrCtrl+Shift+S', false)).toBe('Ctrl+Shift+S');
    expect(keysFor('CmdOrCtrl+Shift+S', true)).toBe('⌘⇧S');
    expect(keysFor('Delete', true)).toBe('Delete');
  });
});
