import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { KEYMAP, keyLabel, keysOf, type Binding } from '../renderer/src/keymap.js';
import { helpMenu, projectMenu } from '../renderer/src/menus.js';
import { createI18n } from '../shared/i18n.js';
import { SHORTCUT_GROUPS, isTyping } from '../renderer/src/shortcuts.js';
import { TOOL_GROUPS } from '../renderer/src/tools.js';
import { macMenuTemplate } from './menu.js';

/**
 * The shortcut map (8.2) is only useful while it is true, so it is held to
 * the places keys are shown outside the keymap (U.3): the top bar's menus,
 * macOS's menu (8.7) and the tool list. The main process hears its own keys
 * through the keymap (`windowKeyFor`).
 */

const { t } = createI18n('en');
const listed = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);

/** A binding as Electron writes an accelerator: `CmdOrCtrl+Shift+Z`. */
function accelerator(binding: Binding): string {
  return keyLabel(binding, false, null, t).replace(/^Ctrl(?=\+)/, 'CmdOrCtrl');
}

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
      ...projectMenu({ newProject: noop, open: noop, saveAs: noop, openRecent: noop }, [], t),
      ...helpMenu({ openSample: noop, about: noop }, t),
    ].flatMap((entry) => (entry.kind === 'item' && entry.keys !== undefined ? [entry.keys] : []));
    expect(shown.length).toBeGreaterThan(0);
    for (const command of shown) {
      expect(listed).toContainEqual(expect.objectContaining({ keys: keysOf(command) }));
    }

    const bound = new Set(KEYMAP.flatMap((command) => command.keys.map(accelerator)));
    const mac = accelerators(macMenuTemplate({ send: noop, t }));
    expect(mac.length).toBeGreaterThan(0);
    for (const keys of mac) expect(bound, keys).toContain(keys);
  });

  it('lists every tool by its key', () => {
    for (const tool of TOOL_GROUPS.flatMap((group) => group.tools)) {
      expect(listed).toContainEqual({
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
