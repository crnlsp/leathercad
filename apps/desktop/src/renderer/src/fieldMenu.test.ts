import { describe, expect, it, vi } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { fieldMenu, isTextField, type FieldActions } from './fieldMenu.js';
import { KEYMAP, commandFor, keysOf, matches } from './keymap.js';
import type { MenuEntry, MenuItem } from './menus.js';

const { t } = createI18n('en');

const actions = (): FieldActions => ({
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  selectAll: vi.fn(),
});

const items = (entries: readonly MenuEntry[]): MenuItem[] =>
  entries.flatMap((entry) => (entry.kind === 'item' ? [entry] : []));

describe("a field's right-click menu (U.20)", () => {
  it('offers Cut, Copy, Paste and Select all, in the catalogue’s words, with their keys', () => {
    const menu = items(fieldMenu(t, { selected: true }, actions()));
    expect(menu.map((item) => item.id)).toEqual([
      'field-cut',
      'field-copy',
      'field-paste',
      'field-select-all',
    ]);
    expect(menu.map((item) => item.label)).toEqual([
      t('fieldMenu.cut'),
      t('fieldMenu.copy'),
      t('fieldMenu.paste'),
      t('fieldMenu.selectAll'),
    ]);
    expect(menu.map((item) => item.label)).toEqual(['Cut', 'Copy', 'Paste', 'Select all']);
    expect(menu.map((item) => item.keys)).toEqual(['cut', 'copy', 'paste', 'selectAll']);
  });

  it('greys Cut and Copy, and says why, while nothing in the field is selected', () => {
    const menu = items(fieldMenu(t, { selected: false }, actions()));
    const refusals = menu.map((item) => item.refusal);
    expect(refusals).toEqual([
      t('fieldMenu.nothingSelected'),
      t('fieldMenu.nothingSelected'),
      undefined,
      undefined,
    ]);
  });

  it('runs each action it names', () => {
    const run = actions();
    for (const item of items(fieldMenu(t, { selected: true }, run))) item.onChoose();
    for (const action of Object.values(run)) expect(action).toHaveBeenCalledOnce();
  });
});

describe('the field’s keys in the keymap (U.20)', () => {
  const press = (code: string, key: string) => ({
    code,
    key,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
  });

  it('lists them, a field’s own: the window answers none of them', () => {
    const field = KEYMAP.filter((command) => command.scope === 'field').map((c) => c.id);
    expect(field).toEqual(['cut', 'copy', 'paste', 'selectAll']);
    for (const [code, key] of [
      ['KeyX', 'x'],
      ['KeyC', 'c'],
      ['KeyV', 'v'],
      ['KeyA', 'a'],
    ] as const) {
      expect(commandFor(press(code, key), false)).toBeNull();
    }
    expect(keysOf('selectAll').some((binding) => matches(press('KeyA', 'a'), binding, false))).toBe(
      true,
    );
  });
});

describe('what is a field (U.20)', () => {
  const element = (tagName: string, extra: Record<string, unknown> = {}) =>
    ({ tagName, ...extra }) as unknown as EventTarget;

  it('is a text input, a text area or anything editable', () => {
    expect(isTextField(element('INPUT', { type: 'text' }))).toBe(true);
    expect(isTextField(element('INPUT', { type: 'search' }))).toBe(true);
    expect(isTextField(element('TEXTAREA'))).toBe(true);
    expect(isTextField(element('DIV', { isContentEditable: true }))).toBe(true);
  });

  it('is not a box, a dot, a list or a button', () => {
    expect(isTextField(element('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTextField(element('INPUT', { type: 'radio' }))).toBe(false);
    expect(isTextField(element('SELECT'))).toBe(false);
    expect(isTextField(element('BUTTON'))).toBe(false);
    expect(isTextField(element('DIV'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
