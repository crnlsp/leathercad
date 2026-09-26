import { readFileSync } from 'node:fs';
import { extname, isAbsolute } from 'node:path';

import { DEFAULT_PREFERENCES, type Preferences } from '@leathercad/platform';

import { writeFileAtomic } from './atomicWrite.js';

/** How many projects *File › Open Recent* lists. */
export const RECENT_LIMIT = 10;

/** `preferences.json` as it is on disk (docs/file-format.md §6). */
interface StoredPreferences extends Preferences {
  readonly version: 1;
  /** Absolute paths, most recent first. */
  readonly recentFiles: readonly string[];
}

const EMPTY: StoredPreferences = { version: 1, ...DEFAULT_PREFERENCES, recentFiles: [] };

/**
 * Reads `preferences.json`, keeping whatever of it is still usable.
 *
 * A preferences file is the one file the app writes that no one would miss,
 * so a damaged one never stops the app starting and never raises a question:
 * each field that is not what it should be falls back on its own, and the
 * rest is kept. A newer version's extra fields are ignored rather than
 * refused — this is not a project, and nothing is lost by not reading them.
 */
export function parsePreferences(text: string | null): StoredPreferences {
  if (text === null) return EMPTY;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return EMPTY;
  }
  if (typeof raw !== 'object' || raw === null) return EMPTY;
  const record = raw as Record<string, unknown>;

  const flag = (key: keyof Preferences): boolean =>
    typeof record[key] === 'boolean' ? record[key] : DEFAULT_PREFERENCES[key];

  const recent = Array.isArray(record['recentFiles'])
    ? record['recentFiles'].filter(isProjectPath)
    : [];

  return {
    version: 1,
    legendOpen: flag('legendOpen'),
    toolRailCollapsed: flag('toolRailCollapsed'),
    recentFiles: [...new Set(recent)].slice(0, RECENT_LIMIT),
  };
}

/** Only the changes that are preferences, and of the right type. */
export function validChanges(changes: unknown): Partial<Preferences> {
  if (typeof changes !== 'object' || changes === null) return {};
  const record = changes as Record<string, unknown>;
  const out: { -readonly [K in keyof Preferences]?: boolean } = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    const value = record[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** A path *Open Recent* may hold: an absolute path to a project file. */
export function isProjectPath(path: unknown): path is string {
  return typeof path === 'string' && isAbsolute(path) && extname(path).toLowerCase() === '.lcp';
}

/** The recent list with `path` put first, once, and the oldest let go. */
export function withRecent(list: readonly string[], path: string): string[] {
  return [path, ...list.filter((entry) => entry !== path)].slice(0, RECENT_LIMIT);
}

/**
 * The maker's preferences and recent projects, kept in `preferences.json`
 * (slice 8.2).
 *
 * Owned by the main process: the renderer asks for a change and never names
 * the file. Writes are atomic and one at a time, in the order asked, so two
 * quick toggles cannot land the older one last.
 */
export class PreferencesStore {
  private stored: StoredPreferences;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {
    let text: string | null = null;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      // No file yet: a first launch.
    }
    this.stored = parsePreferences(text);
  }

  get preferences(): Preferences {
    return { legendOpen: this.stored.legendOpen, toolRailCollapsed: this.stored.toolRailCollapsed };
  }

  get recentFiles(): readonly string[] {
    return this.stored.recentFiles;
  }

  update(changes: unknown): Promise<void> {
    return this.replace({ ...this.stored, ...validChanges(changes) });
  }

  noteRecent(path: string): Promise<void> {
    if (!isProjectPath(path)) return Promise.resolve();
    return this.replace({ ...this.stored, recentFiles: withRecent(this.stored.recentFiles, path) });
  }

  forgetRecent(path: string): Promise<void> {
    const recentFiles = this.stored.recentFiles.filter((entry) => entry !== path);
    if (recentFiles.length === this.stored.recentFiles.length) return Promise.resolve();
    return this.replace({ ...this.stored, recentFiles });
  }

  clearRecent(): Promise<void> {
    return this.replace({ ...this.stored, recentFiles: [] });
  }

  private replace(next: StoredPreferences): Promise<void> {
    this.stored = next;
    const bytes = new TextEncoder().encode(`${JSON.stringify(next, null, 2)}\n`);
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => writeFileAtomic(this.file, bytes));
    return this.writing;
  }
}
