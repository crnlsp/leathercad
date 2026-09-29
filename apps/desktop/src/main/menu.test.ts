import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { macMenuTemplate, windowKeyFor } from './menu.js';

/**
 * The application menu (8.7): none on Linux and Windows — the project bar
 * holds its actions — and on macOS only what the platform expects. With no
 * menu, the window answers the keys the menu's roles used to give.
 */

const labels = (items: readonly MenuItemConstructorOptions[]): string[] =>
  items.map((item) => item.label ?? String(item.role));

describe('the macOS menu (8.7)', () => {
  const sent: string[] = [];
  const template = macMenuTemplate({ send: (action) => sent.push(action) });

  it('is only what the platform expects: the app menu, Edit and Window', () => {
    expect(labels(template)).toEqual(['LeatherCAD', 'Edit', 'windowMenu']);
  });

  it('opens the same About and Settings as the project bar', () => {
    const app = template[0]!.submenu as MenuItemConstructorOptions[];
    for (const [label, action] of [
      ['About LeatherCAD', 'about'],
      ['Settings…', 'settings'],
    ] as const) {
      const item = app.find((entry) => entry.label === label)!;
      (item.click as () => void)();
      expect(sent.at(-1)).toBe(action);
    }
    expect(app.some((entry) => entry.role === 'quit')).toBe(true);
  });

  it('keeps cut, copy and paste, which text fields need on macOS', () => {
    const edit = (template[1]!.submenu as MenuItemConstructorOptions[]).map((entry) => entry.role);
    for (const role of ['cut', 'copy', 'paste', 'selectAll']) expect(edit).toContain(role);
  });

  it('shows shortcuts without registering them: the renderer handles the keys', () => {
    // Window is a role with no submenu of ours.
    const shown = template.flatMap(
      (top) => (top.submenu as MenuItemConstructorOptions[] | undefined) ?? [],
    );
    const keyed = shown.filter((entry) => entry.accelerator !== undefined);
    expect(keyed.length).toBeGreaterThan(0);
    for (const item of keyed) expect(item.registerAccelerator, item.label).toBe(false);
  });

  it('has no Reload and no developer tools: those are keys of a development build', () => {
    const roles = template
      .flatMap((top) => (top.submenu as MenuItemConstructorOptions[] | undefined) ?? [])
      .map((entry) => String(entry.role ?? '').toLowerCase());
    for (const role of ['reload', 'forcereload', 'toggledevtools']) {
      expect(roles).not.toContain(role);
    }
  });
});

describe('the keys the native menu used to give (8.7)', () => {
  const linux = { isMac: false, packaged: true };
  const key = (
    key: string,
    mods: Partial<{ control: boolean; shift: boolean; alt: boolean }> = {},
  ) => ({ type: 'keyDown', key, control: false, shift: false, alt: false, ...mods });

  it('toggles full screen with F11, everywhere', () => {
    expect(windowKeyFor(key('F11'), linux)).toBe('full-screen');
    expect(windowKeyFor(key('F11'), { isMac: true, packaged: true })).toBe('full-screen');
  });

  it('quits with Ctrl+Q off macOS, where the app menu does it', () => {
    expect(windowKeyFor(key('q', { control: true }), linux)).toBe('quit');
    expect(windowKeyFor(key('Q', { control: true }), linux)).toBe('quit');
    expect(windowKeyFor(key('q', { control: true }), { isMac: true, packaged: true })).toBeNull();
    expect(windowKeyFor(key('q', { control: true, shift: true }), linux)).toBeNull();
    expect(windowKeyFor(key('q'), linux)).toBeNull();
  });

  it('opens the developer tools only in a development build', () => {
    expect(windowKeyFor(key('F12'), linux)).toBeNull();
    expect(windowKeyFor(key('I', { control: true, shift: true }), linux)).toBeNull();
    const dev = { isMac: false, packaged: false };
    expect(windowKeyFor(key('F12'), dev)).toBe('developer-tools');
    expect(windowKeyFor(key('I', { control: true, shift: true }), dev)).toBe('developer-tools');
  });

  it('answers a key once, as it goes down', () => {
    expect(windowKeyFor({ ...key('F11'), type: 'keyUp' }, linux)).toBeNull();
  });

  it('leaves every other key to the page', () => {
    expect(windowKeyFor(key('s', { control: true }), linux)).toBeNull();
    expect(windowKeyFor(key('F5'), linux)).toBeNull();
  });
});
