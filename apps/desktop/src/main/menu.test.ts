import type { MenuAction } from '@leathercad/platform';
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { TOOL_GROUPS } from '../renderer/src/tools.js';
import { menuTemplate, recentLabel, validPaperChoices } from './menu.js';

/**
 * The production menu (slice 8.5a).
 *
 * Electron's default menu offered View › Reload and Toggle Developer Tools in
 * the shipped app: a reload throws unsaved work at the 5.3a question, and the
 * developer tools are a general-purpose console into the renderer. The menu
 * is now the app's own, and its items run the renderer's own handlers.
 */

function build(
  options: { isMac?: boolean; packaged?: boolean; recentFiles?: readonly string[] } = {},
) {
  const send = vi.fn<(action: MenuAction) => void>();
  const openLogFolder = vi.fn();
  const openNotices = vi.fn();
  const openRecent = vi.fn<(path: string) => void>();
  const clearRecent = vi.fn();
  const template = menuTemplate({
    isMac: options.isMac ?? false,
    packaged: options.packaged ?? true,
    send,
    openLogFolder,
    openNotices,
    recentFiles: options.recentFiles ?? [],
    home: '/home/maker',
    openRecent,
    clearRecent,
  });
  return { template, send, openLogFolder, openNotices, openRecent, clearRecent };
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
    ['Keyboard Shortcuts', 'shortcuts', 'CmdOrCtrl+/'],
    ['Zoom In', 'zoom-in', 'CmdOrCtrl+='],
    ['Zoom Out', 'zoom-out', 'CmdOrCtrl+-'],
    ['Fit to Pattern', 'zoom-fit', 'CmdOrCtrl+0'],
    ['Rectangle', 'tool:rectangle', 'R'],
    ['Measure', 'tool:measure', 'M'],
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
    expect(other.map((entry) => entry.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Tools',
      'Paper',
      'Help',
    ]);
    const file = other[0]!.submenu as MenuItemConstructorOptions[];
    expect(file.at(-1)!.role).toBe('quit');
    expect(all(other).map((entry) => entry.role)).toContain('about');
  });

  it('opens the sample project from Help (8.3)', () => {
    const { template, send } = build();
    item(template, 'Open Sample Project').click?.({} as never, undefined, {} as never);
    expect(send).toHaveBeenCalledWith('open-sample');
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

describe('File › Open Recent (8.2)', () => {
  it('says so when there is nothing to reopen', () => {
    const { template } = build();
    expect(item(template, 'No Recent Projects').enabled).toBe(false);
    expect(item(template, 'Clear Recent').enabled).toBe(false);
  });

  it('lists the projects by their whole path, and opens the one chosen', () => {
    const { template, openRecent, clearRecent } = build({
      recentFiles: ['/home/maker/Patterns/Wallet.lcp', '/mnt/shared/Belt & strap.lcp'],
    });

    const recent = item(template, 'Open Recent').submenu as MenuItemConstructorOptions[];
    expect(recent.map((entry) => entry.label).filter(Boolean)).toEqual([
      '~/Patterns/Wallet.lcp',
      '/mnt/shared/Belt && strap.lcp',
      'Clear Recent',
    ]);

    recent[1]!.click?.({} as never, undefined, {} as never);
    expect(openRecent).toHaveBeenCalledWith('/mnt/shared/Belt & strap.lcp');
    item(template, 'Clear Recent').click?.({} as never, undefined, {} as never);
    expect(clearRecent).toHaveBeenCalledOnce();
  });

  it('shortens only the home directory itself, not a sibling that starts the same', () => {
    expect(recentLabel('/home/maker2/a.lcp', '/home/maker')).toBe('/home/maker2/a.lcp');
  });
});

describe('Tools and Paper (8.4b)', () => {
  it('lists every tool, grouped as the rail groups them', () => {
    const tools = item(build().template, 'Tools').submenu as MenuItemConstructorOptions[];
    const labels = tools.filter((entry) => entry.type !== 'separator').map((e) => e.label);
    expect(labels).toEqual(TOOL_GROUPS.flatMap((group) => group.tools).map((tool) => tool.label));
    expect(tools.filter((entry) => entry.type === 'separator')).toHaveLength(
      TOOL_GROUPS.filter((group) => group.tools.length > 0).length - 1,
    );
  });

  it("lists the papers in the paper list's own words, the current one checked", () => {
    const send = vi.fn<(action: MenuAction) => void>();
    const template = menuTemplate({
      isMac: false,
      packaged: true,
      send,
      openLogFolder: () => undefined,
      openNotices: () => undefined,
      paperChoices: [
        { value: 'A4 portrait', label: '3 sheets of A4, portrait (Strap taped)', checked: true },
        { value: 'A4 landscape', label: '1 sheet of A4, landscape', checked: false },
      ],
    });
    const paper = item(template, 'Paper').submenu as MenuItemConstructorOptions[];

    expect(paper.map((entry) => [entry.label, entry.type, entry.checked])).toEqual([
      ['3 sheets of A4, portrait (Strap taped)', 'radio', true],
      ['1 sheet of A4, landscape', 'radio', false],
    ]);
    paper[1]!.click?.({} as never, undefined, {} as never);
    expect(send).toHaveBeenCalledWith('paper:A4 landscape');
  });

  it('says so before the renderer has described the paper', () => {
    expect(item(build().template, 'No paper to choose yet').enabled).toBe(false);
  });

  it('takes only well-formed choices from the renderer', () => {
    expect(
      validPaperChoices([
        { value: 'A4 portrait', label: 'One', checked: true },
        { value: 'A4 sideways', label: 'Two', checked: false },
        { value: 'A4 landscape', label: '', checked: false },
        { value: 'A3 landscape', label: 'x'.repeat(201), checked: false },
        'A5 portrait',
        { value: 'Letter landscape', label: 'Three', checked: 'yes' },
      ]),
    ).toEqual([
      { value: 'A4 portrait', label: 'One', checked: true },
      { value: 'Letter landscape', label: 'Three', checked: false },
    ]);
    expect(validPaperChoices('A4')).toEqual([]);
  });
});
