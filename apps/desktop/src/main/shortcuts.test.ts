import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { KEYMAP, applyBindings, keysOf } from '../renderer/src/keymap.js';
import { helpMenu, projectMenu } from '../renderer/src/menus.js';
import { createI18n } from '../shared/i18n.js';
import { isTyping, pressesControl, shortcutGroups } from '../renderer/src/shortcuts.js';
import { TOOL_GROUPS } from '../renderer/src/tools.js';
import { accelerator, macMenuTemplate } from './menu.js';

/**
 * The shortcut map (8.2) is only useful while it is true, so it is held to
 * the places keys are shown outside the keymap (U.3): the top bar's menus,
 * macOS's menu (8.7) and the tool list. The main process hears its own keys
 * through the keymap (`windowKeyFor`).
 */

const { t } = createI18n('en');
const listed = shortcutGroups().flatMap((group) => group.shortcuts);

function accelerators(items: readonly MenuItemConstructorOptions[]): string[] {
  return items.flatMap((item) => [
    ...(typeof item.accelerator === 'string' ? [item.accelerator] : []),
    ...(Array.isArray(item.submenu)
      ? accelerators(item.submenu as MenuItemConstructorOptions[])
      : []),
  ]);
}

describe('the keyboard shortcut map', () => {
  it('lists every key a menu shows, as the keymap binds it', () => {
    const noop = (): void => undefined;
    const shown = [
      ...projectMenu(
        {
          newProject: noop,
          newFromTemplate: noop,
          open: noop,
          saveAs: noop,
          saveAsTemplate: noop,
          rename: noop,
          openRecent: noop,
        },
        [],
        t,
      ),
      ...helpMenu({ openSample: noop, about: noop }, t),
    ].flatMap((entry) => (entry.kind === 'item' && entry.keys !== undefined ? [entry.keys] : []));
    expect(shown.length).toBeGreaterThan(0);
    for (const command of shown) {
      expect(listed).toContainEqual(
        expect.objectContaining({ id: command, keys: keysOf(command) }),
      );
    }

    const bound = new Set(KEYMAP.flatMap((command) => command.keys.map(accelerator)));
    const mac = accelerators(macMenuTemplate({ send: noop, t }));
    expect(mac).toEqual(['CmdOrCtrl+,', 'CmdOrCtrl+Z', 'CmdOrCtrl+Shift+Z']);
    for (const keys of mac) expect(bound, keys).toContain(keys);
  });

  it('shows the maker’s keys in macOS’s menu once they change one (U.12)', () => {
    const noop = (): void => undefined;
    try {
      applyBindings({ undo: [{ code: 'KeyU', mod: true, alt: true }], settings: [{ code: 'F9' }] });
      expect(accelerators(macMenuTemplate({ send: noop, t }))).toEqual([
        'F9',
        'CmdOrCtrl+Alt+U',
        'CmdOrCtrl+Shift+Z',
      ]);
    } finally {
      applyBindings({});
    }
  });

  it('writes a key as Electron names it, or leaves out one it has no name for', () => {
    expect(accelerator({ char: '+', mod: true })).toBe('CmdOrCtrl+Plus');
    expect(accelerator({ code: 'Numpad1', mod: true })).toBe('CmdOrCtrl+num1');
    expect(accelerator({ code: 'ArrowUp', shift: true, mod: true })).toBe('CmdOrCtrl+Shift+Up');
    expect(accelerator({ code: 'Backslash' })).toBe('\\');
    expect(accelerator({ code: 'IntlRo' })).toBeUndefined();
  });

  it('lists every tool by its key', () => {
    for (const tool of TOOL_GROUPS.flatMap((group) => group.tools)) {
      expect(listed).toContainEqual({
        id: `tool.${tool.id}`,
        keys: [{ code: `Key${tool.key}` }],
        does: `tools.${tool.id}.name`,
      });
    }
  });

  it('gives no two tools the same key', () => {
    const keys = TOOL_GROUPS.flatMap((group) => group.tools).map((tool) => tool.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has words for every shortcut, in English', () => {
    for (const shortcut of listed) expect(t(shortcut.does)).not.toBe(shortcut.does);
  });
});

describe('a focused control’s own key (U.12)', () => {
  const space = { code: 'Space', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  const on = (tagName: string, role: string | null = null): EventTarget =>
    ({ tagName, getAttribute: () => role }) as unknown as EventTarget;

  it('is Space alone on a button, a tab, a menu item or a check box', () => {
    expect(pressesControl({ ...space, target: on('BUTTON') })).toBe(true);
    for (const role of ['tab', 'menuitem', 'checkbox', 'switch']) {
      expect(pressesControl({ ...space, target: on('DIV', role) }), role).toBe(true);
    }
  });

  it('is not Space on the board or the page, nor another key, nor Space held with Ctrl', () => {
    expect(pressesControl({ ...space, target: on('CANVAS') })).toBe(false);
    expect(pressesControl({ ...space, target: on('BODY') })).toBe(false);
    expect(pressesControl({ ...space, code: 'KeyB', target: on('BUTTON') })).toBe(false);
    expect(pressesControl({ ...space, ctrlKey: true, target: on('BUTTON') })).toBe(false);
    expect(pressesControl({ ...space, target: null })).toBe(false);
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
