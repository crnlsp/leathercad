import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { DEFAULT_PREFERENCES, STARTER_IRONS } from '@leathercad/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PreferencesStore,
  RECENT_LIMIT,
  SESSION_LIMIT,
  parsePreferences,
  readSession,
  shownPath,
  validChanges,
  withRecent,
} from './preferences.js';

/**
 * `preferences.json` (slice 8.2): how the maker likes the app, and the
 * projects they opened last. Nothing here may ever stop the app starting.
 */

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leathercad-prefs-'));
  file = join(dir, 'preferences.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('reading preferences.json', () => {
  it('starts from the defaults on a first launch', () => {
    const store = new PreferencesStore(file);

    expect(store.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(store.recentFiles).toEqual([]);
  });

  it('falls back to the defaults for a file that is not JSON', () => {
    expect(parsePreferences('{ not json')).toMatchObject({
      ...DEFAULT_PREFERENCES,
      recentFiles: [],
    });
    expect(parsePreferences('null')).toMatchObject({ recentFiles: [] });
  });

  it('keeps each usable field and drops only the damaged ones', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        version: 2,
        legendOpen: true,
        toolRailCollapsed: 'yes',
        language: 'xx',
        recentFiles: ['/p/a.lcp', 'relative.lcp', '/p/notes.txt', 7, '/p/a.lcp', '/p/b.LCP'],
        fromANewerVersion: { anything: 1 },
      }),
    );

    expect(parsed.legendOpen).toBe(true);
    expect(parsed.toolRailCollapsed).toBe(DEFAULT_PREFERENCES.toolRailCollapsed);
    // A language this version does not ship follows the system.
    expect(parsed.language).toBe('system');
    // Only absolute project paths, once each.
    expect(parsed.recentFiles).toEqual(['/p/a.lcp', '/p/b.LCP']);
  });

  it('takes only preferences, of the right type, from the renderer', () => {
    expect(validChanges({ legendOpen: true, toolRailCollapsed: 1, path: '/etc' })).toEqual({
      legendOpen: true,
    });
    expect(validChanges('legendOpen')).toEqual({});
  });

  it('keeps the panels the maker folded, each falling back on its own (U.5)', () => {
    // A file from before U.5 has neither: both panels open, as they always did.
    expect(parsePreferences(JSON.stringify({ legendOpen: true }))).toMatchObject({
      partsFolded: false,
      propertiesFolded: false,
    });
    expect(
      parsePreferences(JSON.stringify({ partsFolded: true, propertiesFolded: 'yes' })),
    ).toMatchObject({ partsFolded: true, propertiesFolded: false });
    expect(validChanges({ partsFolded: true, propertiesFolded: 0 })).toEqual({ partsFolded: true });
    expect(validChanges({ propertiesFolded: false })).toEqual({ propertiesFolded: false });
  });

  it('keeps the selection bar on unless the maker turned it off (U.17)', () => {
    // On a first launch, and in a file from before U.17, which has no field.
    expect(DEFAULT_PREFERENCES.selectionBar).toBe(true);
    expect(parsePreferences(null).selectionBar).toBe(true);
    expect(parsePreferences(JSON.stringify({ version: 2, legendOpen: false })).selectionBar).toBe(
      true,
    );
    expect(parsePreferences(JSON.stringify({ selectionBar: false })).selectionBar).toBe(false);
    expect(parsePreferences(JSON.stringify({ selectionBar: 'off' })).selectionBar).toBe(true);
    expect(validChanges({ selectionBar: false })).toEqual({ selectionBar: false });
    expect(validChanges({ selectionBar: 0 })).toEqual({});
  });

  it('keeps no switch for checking for a new version: only the maker asks (8.9)', () => {
    expect(DEFAULT_PREFERENCES).not.toHaveProperty('updateCheck');
    expect(parsePreferences(JSON.stringify({ updateCheck: true }))).not.toHaveProperty(
      'updateCheck',
    );
    expect(validChanges({ updateCheck: true })).toEqual({});
  });

  it('keeps the interface language: following the system, or one the app ships', () => {
    expect(parsePreferences(JSON.stringify({ language: 'en' })).language).toBe('en');
    expect(parsePreferences(JSON.stringify({ language: 'system' })).language).toBe('system');
    expect(validChanges({ language: 'en' })).toEqual({ language: 'en' });
    expect(validChanges({ language: 'system' })).toEqual({ language: 'system' });
    expect(validChanges({ language: 'xx' })).toEqual({});
    expect(validChanges({ language: 7 })).toEqual({});
  });
});

describe('the legend opens with names by default (U.10, R-09)', () => {
  it('starts open on a first launch, and over a damaged file', () => {
    expect(DEFAULT_PREFERENCES.legendOpen).toBe(true);
    expect(parsePreferences(null).legendOpen).toBe(true);
    expect(parsePreferences('not json').legendOpen).toBe(true);
  });

  it('resets a version 1 file once: it never recorded a real choice', () => {
    // Version 1 wrote `legendOpen: false` out whenever any preference changed,
    // so a stored false cannot be told from the old default. Version 2 records
    // a choice; a version 1 file is reset to the new default.
    const parsed = parsePreferences(JSON.stringify({ version: 1, legendOpen: false }));
    expect(parsed.legendOpen).toBe(true);
    expect(parsed.version).toBe(2);
  });

  it('honours the maker’s choice in a version 2 file', () => {
    const parsed = parsePreferences(JSON.stringify({ version: 2, legendOpen: false }));
    expect(parsed.legendOpen).toBe(false);
    expect(parsed.version).toBe(2);
  });

  it('keeps a folded legend across a restart, once version 2 has recorded it', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, legendOpen: false, toolRailCollapsed: true }));
    const first = new PreferencesStore(file);
    // The reset opens it, and the old choice did not survive.
    expect(first.preferences.legendOpen).toBe(true);
    // Everything else the file held is kept.
    expect(first.preferences.toolRailCollapsed).toBe(true);

    // The maker folds it: the choice is written as version 2 and survives.
    await first.update({ legendOpen: false });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 2, legendOpen: false });
    expect(new PreferencesStore(file).preferences.legendOpen).toBe(false);
  });

  it('does not reset again on the next restart', async () => {
    writeFileSync(file, JSON.stringify({ version: 2, legendOpen: false }));
    const first = new PreferencesStore(file);
    expect(first.preferences.legendOpen).toBe(false);

    // A later change must not re-open it: version 2 is not the version that is
    // reset once, and it stays version 2 as the file is written again.
    await first.update({ toolRailCollapsed: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      version: 2,
      legendOpen: false,
      toolRailCollapsed: true,
    });
    expect(new PreferencesStore(file).preferences.legendOpen).toBe(false);
  });
});

describe('My tools (U.13)', () => {
  const iron = (id: string, name: string, pitchMm: number) => ({ id, name, pitchMm });

  it('lists the starter irons for a file written before My tools, and keeps a list emptied on purpose', () => {
    const before = parsePreferences(JSON.stringify({ legendOpen: true }));
    expect(before.irons).toEqual(STARTER_IRONS);
    expect(before.defaultIronId).toBe('ks-3.85');
    expect(before.stitchMarginMm).toBe(3.5);
    expect(before.leatherThicknessMm).toBeNull();

    const emptied = parsePreferences(JSON.stringify({ irons: [], defaultIronId: 'ks-3.85' }));
    expect(emptied.irons).toEqual([]);
    expect(emptied.defaultIronId).toBeNull();
  });

  it('keeps each usable iron, tidied, and drops only the damaged ones', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        irons: [
          iron('a', '  Diamond 3.85  ', 3.85),
          iron('a', 'Same id again', 3),
          iron('b', '', 3),
          iron('c', 'No pitch at all', 0),
          { id: 'd', name: 'No pitch' },
          iron('e', 'French 3.38', 3.380_04),
          'not an iron',
        ],
        defaultIronId: 'e',
      }),
    );
    expect(parsed.irons).toEqual([iron('a', 'Diamond 3.85', 3.85), iron('e', 'French 3.38', 3.38)]);
    expect(parsed.defaultIronId).toBe('e');
  });

  it('makes the first iron the default when the default names none of them', () => {
    const irons = [iron('a', 'Diamond 3.85', 3.85), iron('b', 'Diamond 2.7', 2.7)];
    expect(parsePreferences(JSON.stringify({ irons, defaultIronId: 'gone' })).defaultIronId).toBe(
      'a',
    );
    expect(parsePreferences(JSON.stringify({ irons, defaultIronId: null })).defaultIronId).toBe(
      'a',
    );
  });

  it('keeps a margin and a thickness that are real lengths, quantised, and falls back otherwise', () => {
    const kept = parsePreferences(
      JSON.stringify({ stitchMarginMm: 4.000_04, leatherThicknessMm: 1.2 }),
    );
    expect(kept.stitchMarginMm).toBe(4);
    expect(kept.leatherThicknessMm).toBe(1.2);

    for (const bad of [0, -3, '4', null, Number.MAX_VALUE * 10])
      expect(parsePreferences(JSON.stringify({ stitchMarginMm: bad })).stitchMarginMm).toBe(3.5);
    for (const bad of [0, -1, 'thick'])
      expect(
        parsePreferences(JSON.stringify({ leatherThicknessMm: bad })).leatherThicknessMm,
      ).toBeNull();
  });

  it('takes the same changes from the renderer, by the same rules', () => {
    expect(
      validChanges({
        irons: [iron('x', 'Mine', 3.2), iron('y', '', 3)],
        defaultIronId: 'x',
        stitchMarginMm: 4,
        leatherThicknessMm: null,
      }),
    ).toEqual({
      irons: [iron('x', 'Mine', 3.2)],
      defaultIronId: 'x',
      stitchMarginMm: 4,
      leatherThicknessMm: null,
    });
    expect(validChanges({ stitchMarginMm: -1, leatherThicknessMm: 'x', irons: 'all' })).toEqual({});
  });

  it('keeps the default on an iron the maker still has, whatever the renderer sends', async () => {
    const store = new PreferencesStore(file);
    await store.update({ irons: [iron('a', 'Diamond 3.85', 3.85)], defaultIronId: 'a' });
    await store.update({ irons: [iron('b', 'Diamond 2.7', 2.7)] });
    expect(store.preferences.defaultIronId).toBe('b');
    expect(new PreferencesStore(file).preferences.irons).toEqual([iron('b', 'Diamond 2.7', 2.7)]);
  });
});

describe('the maker’s keys (U.12)', () => {
  const stored = (keyBindings: unknown) =>
    parsePreferences(JSON.stringify({ version: 2, keyBindings })).keyBindings;

  it('has none changed in a file written before keys could be', () => {
    expect(parsePreferences(JSON.stringify({ version: 2 })).keyBindings).toEqual({});
    expect(DEFAULT_PREFERENCES.keyBindings).toEqual({});
  });

  it('keeps a usable change, and drops an unknown command, a malformed key, Enter and a clash', () => {
    expect(
      stored({
        save: [{ code: 'F5' }],
        nonsense: [{ code: 'F6' }],
        print: [{ code: 'f7' }],
        exportPdf: [{ code: 'Enter' }],
        help: [{ code: 'F5' }],
        sheets: 'F8',
      }),
    ).toEqual({ save: [{ code: 'F5' }] });
  });

  it('drops a map that is not one, and keeps the rest of the file', () => {
    for (const keyBindings of [null, 'F5', 3, [{ code: 'F5' }]]) {
      const parsed = parsePreferences(
        JSON.stringify({ version: 2, keyBindings, partsFolded: true }),
      );
      expect(parsed.keyBindings).toEqual({});
      expect(parsed.partsFolded).toBe(true);
    }
  });

  it('takes the same changes from the renderer, by the same rules, and keeps them over a restart', async () => {
    expect(
      validChanges({ keyBindings: { save: [{ code: 'F5' }], quit: [{ code: 'KeyB' }] } }),
    ).toEqual({ keyBindings: { save: [{ code: 'F5' }] } });
    expect(validChanges({ legendOpen: true })).toEqual({ legendOpen: true });
    const store = new PreferencesStore(file);
    await store.update({ keyBindings: { 'tool.rectangle': [{ code: 'KeyQ' }] } });
    expect(new PreferencesStore(file).preferences.keyBindings).toEqual({
      'tool.rectangle': [{ code: 'KeyQ' }],
    });
    // Reset all is an empty map, written as one.
    await store.update({ keyBindings: {} });
    expect(new PreferencesStore(file).preferences.keyBindings).toEqual({});
  });
});

describe('the recent list', () => {
  it('puts the latest first, once, and lets the oldest go', () => {
    let list: string[] = [];
    for (let i = 0; i < RECENT_LIMIT + 3; i++) list = withRecent(list, `/p/${String(i)}.lcp`);
    list = withRecent(list, '/p/5.lcp');

    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]).toBe('/p/5.lcp');
    expect(list.filter((path) => path === '/p/5.lcp')).toHaveLength(1);
    expect(list).not.toContain('/p/0.lcp');
  });
});

describe('keeping preferences', () => {
  it('survives a restart', async () => {
    const first = new PreferencesStore(file);
    await first.update({ legendOpen: true });
    await first.noteRecent('/p/wallet.lcp');
    await first.noteRecent('/p/belt.lcp');

    const second = new PreferencesStore(file);

    expect(second.preferences.legendOpen).toBe(true);
    expect(second.recentFiles).toEqual(['/p/belt.lcp', '/p/wallet.lcp']);
  });

  it('writes the last of several quick changes last', async () => {
    const store = new PreferencesStore(file);
    void store.update({ legendOpen: true });
    void store.update({ legendOpen: false });
    await store.update({ toolRailCollapsed: true });

    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      legendOpen: false,
      toolRailCollapsed: true,
    });
  });

  it('refuses a path that is not a project, and forgets and clears on request', async () => {
    const store = new PreferencesStore(file);
    await store.noteRecent('/etc/passwd');
    await store.noteRecent('/p/a.lcp');
    await store.noteRecent('/p/b.lcp');

    expect(store.recentFiles).toEqual(['/p/b.lcp', '/p/a.lcp']);
    await store.forgetRecent('/p/b.lcp');
    expect(store.recentFiles).toEqual(['/p/a.lcp']);
    await store.clearRecent();
    expect(new PreferencesStore(file).recentFiles).toEqual([]);
  });

  it('starts, with the defaults, over a damaged file', () => {
    writeFileSync(file, '\u0000\u0001garbage');
    expect(new PreferencesStore(file).preferences).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('a recent project as the maker reads it (8.7)', () => {
  const home = ['', 'home', 'maker'].join(sep);

  it('writes the home directory as ~', () => {
    expect(shownPath([home, 'Leather', 'Wallet.lcp'].join(sep), home)).toBe(
      ['~', 'Leather', 'Wallet.lcp'].join(sep),
    );
  });

  it('leaves a path outside it, and a sibling that only starts the same, whole', () => {
    const elsewhere = ['', 'srv', 'Wallet.lcp'].join(sep);
    expect(shownPath(elsewhere, home)).toBe(elsewhere);
    const sibling = `${home}2${sep}Wallet.lcp`;
    expect(shownPath(sibling, home)).toBe(sibling);
  });

  it('leaves every path whole when there is no home directory', () => {
    const path = ['', 'home', 'maker', 'Wallet.lcp'].join(sep);
    expect(shownPath(path, '')).toBe(path);
  });
});

describe('the open tabs, for the next start (8.12)', () => {
  const WALLET = '01JB5M00000000000000WALLET';
  const tab = (path: string | null, kept: string | null = null) => ({
    path,
    kept,
    view: 'design' as const,
    camera: null,
  });

  it('has none in a file written before tabs', () => {
    expect(new PreferencesStore(file).session).toEqual({ tabs: [], active: null });
  });

  it('keeps project paths and kept copies only, each path once, and an active one among them', () => {
    expect(
      readSession({
        tabs: [
          tab('/p/wallet.lcp'),
          tab('relative.lcp'),
          tab('/p/notes.txt'),
          tab('/p/wallet.lcp'),
          tab(null, WALLET),
          tab(null, '../escape'),
          7,
        ],
        active: 9,
      }),
    ).toEqual({ tabs: [tab('/p/wallet.lcp'), tab(null, WALLET)], active: null });
    expect(readSession({ tabs: 'nope' })).toEqual({ tabs: [], active: null });
    expect(readSession(null)).toEqual({ tabs: [], active: null });
    expect(
      readSession({ tabs: Array.from({ length: 50 }, (_, i) => tab(`/p/${String(i)}.lcp`)) }).tabs,
    ).toHaveLength(SESSION_LIMIT);
  });

  it('keeps a view and a camera only when they are ones a maker could have left', () => {
    const read = readSession({
      tabs: [
        { path: '/p/a.lcp', kept: null, view: 'sheets', camera: { x: 12.5, y: -3, percent: 150 } },
        {
          path: '/p/b.lcp',
          kept: null,
          view: 'upside',
          camera: { x: Infinity, y: 0, percent: 100 },
        },
      ],
      active: 1,
    });
    expect(read.tabs.map((each) => [each.view, each.camera])).toEqual([
      ['sheets', { x: 12.5, y: -3, percent: 150 }],
      ['design', null],
    ]);
    expect(read.active).toBe(1);
  });

  it('reads a session written before views and kept work as its tabs', () => {
    expect(readSession({ projects: ['/p/a.lcp', '/p/b.lcp'], active: '/p/b.lcp' })).toEqual({
      tabs: [tab('/p/a.lcp'), tab('/p/b.lcp')],
      active: 1,
    });
  });

  it('survives a restart, beside the recent list, and is not a preference', async () => {
    const first = new PreferencesStore(file);
    await first.noteRecent('/p/wallet.lcp');
    await first.keepSession({ tabs: [tab('/p/wallet.lcp'), tab('/p/belt.lcp')], active: 1 });

    const second = new PreferencesStore(file);
    expect(second.session).toEqual({ tabs: [tab('/p/wallet.lcp'), tab('/p/belt.lcp')], active: 1 });
    expect(second.recentFiles).toEqual(['/p/wallet.lcp']);
    expect(second.preferences).not.toHaveProperty('session');
    await second.update({ legendOpen: false });
    expect(new PreferencesStore(file).session.tabs).toHaveLength(2);
  });

  it('writes nothing when the tabs are as they were', async () => {
    const store = new PreferencesStore(file);
    await store.keepSession({ tabs: [tab('/p/wallet.lcp')], active: 0 });
    writeFileSync(file, 'left alone');
    await store.keepSession({ tabs: [tab('/p/wallet.lcp')], active: 0 });
    expect(readFileSync(file, 'utf8')).toBe('left alone');
  });
});

describe('pinned projects (8.12)', () => {
  it('stay at the top, kept by Clear list, never pushed off by newer ones', async () => {
    const store = new PreferencesStore(file);
    await store.noteRecent('/p/wallet.lcp');
    await store.pin('/p/wallet.lcp', true);
    for (let i = 0; i < RECENT_LIMIT + 3; i++) await store.noteRecent(`/p/${String(i)}.lcp`);
    expect(store.pinnedFiles).toEqual(['/p/wallet.lcp']);
    expect(store.recentFiles).toHaveLength(RECENT_LIMIT);
    expect(store.recentFiles).not.toContain('/p/wallet.lcp');

    await store.clearRecent();
    expect(store.recentFiles).toEqual([]);
    expect(new PreferencesStore(file).pinnedFiles).toEqual(['/p/wallet.lcp']);
  });

  it('pins only a project on the list, and an unpinned one goes back first', async () => {
    const store = new PreferencesStore(file);
    await store.pin('/p/never-opened.lcp', true);
    expect(store.pinnedFiles).toEqual([]);

    await store.noteRecent('/p/belt.lcp');
    await store.noteRecent('/p/wallet.lcp');
    await store.pin('/p/belt.lcp', true);
    await store.pin('/p/belt.lcp', false);
    expect(store.pinnedFiles).toEqual([]);
    expect(store.recentFiles).toEqual(['/p/belt.lcp', '/p/wallet.lcp']);
  });

  it('takes one project off the list, pinned or not, and leaves the rest', async () => {
    const store = new PreferencesStore(file);
    await store.noteRecent('/p/belt.lcp');
    await store.noteRecent('/p/wallet.lcp');
    await store.pin('/p/belt.lcp', true);
    await store.forgetRecent('/p/belt.lcp');
    await store.forgetRecent('/p/wallet.lcp');
    expect(store.pinnedFiles).toEqual([]);
    expect(store.recentFiles).toEqual([]);
  });
});
