import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { helpMenu, projectMenu } from '../renderer/src/menus.js';
import { SHORTCUT_GROUPS, isTyping, keysFor } from '../renderer/src/shortcuts.js';
import { TOOL_GROUPS } from '../renderer/src/tools.js';
import { macMenuTemplate } from './menu.js';

/**
 * The shortcut map (8.2) is only useful while it is true, so it is held to
 * the places keys are shown: the top bar's menus, macOS's menu (8.7) and the
 * tool list.
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
  it('lists every shortcut a menu shows', () => {
    const noop = (): void => undefined;
    const shown = [
      ...projectMenu({ newProject: noop, open: noop, saveAs: noop, openRecent: noop }, []),
      ...helpMenu({ openSample: noop, about: noop }),
    ].flatMap((entry) => (entry.kind === 'item' && entry.keys !== undefined ? [entry.keys] : []));
    shown.push(...accelerators(macMenuTemplate({ send: noop })));
    expect(shown.length).toBeGreaterThan(0);
    for (const keys of shown) expect(listedKeys).toContain(keys);
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

describe('what counts as typing (8.7)', () => {
  const at = (tagName: string, isContentEditable = false): EventTarget =>
    ({ tagName, isContentEditable }) as unknown as EventTarget;

  it('is a field, a text area, a list or anything editable', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isTyping(at(tag)), tag).toBe(true);
    expect(isTyping(at('DIV', true))).toBe(true);
  });

  it('is not the canvas, a button, the page, or nothing', () => {
    for (const tag of ['CANVAS', 'BUTTON', 'BODY']) expect(isTyping(at(tag)), tag).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
