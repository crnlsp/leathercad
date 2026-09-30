import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { DEFAULT_PREFERENCES } from '@leathercad/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PreferencesStore,
  RECENT_LIMIT,
  parsePreferences,
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

  it('keeps the interface language: following the system, or one the app ships', () => {
    expect(parsePreferences(JSON.stringify({ language: 'en' })).language).toBe('en');
    expect(parsePreferences(JSON.stringify({ language: 'system' })).language).toBe('system');
    expect(validChanges({ language: 'en' })).toEqual({ language: 'en' });
    expect(validChanges({ language: 'system' })).toEqual({ language: 'system' });
    expect(validChanges({ language: 'xx' })).toEqual({});
    expect(validChanges({ language: 7 })).toEqual({});
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
