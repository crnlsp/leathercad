import { readFileSync } from 'node:fs';
import { extname, isAbsolute, sep } from 'node:path';

import { quantise } from '@leathercad/core';
import { DEFAULT_PREFERENCES, type Iron, type Preferences } from '@leathercad/platform';

import { readBindings } from '../renderer/src/rebind.js';
import { isLanguagePreference } from '../shared/i18n.js';
import { writeFileAtomic } from './atomicWrite.js';

/** Quit is macOS's own ⌘Q there, and not a key the maker changes (U.12). */
const IS_MAC = process.platform === 'darwin';

/** How many recent projects the Project menu lists (8.2, 8.7). */
export const RECENT_LIMIT = 10;

/** `preferences.json` as it is on disk (docs/file-format.md §6). */
interface StoredPreferences extends Preferences {
  /**
   * The file's version (U.10). Always 2 as this code reads and writes it:
   * version 1 never recorded a legend choice, so a version 1 file is reset to
   * the new default once and read back as version 2.
   */
  readonly version: 2;
  /** Absolute paths, most recent first. */
  readonly recentFiles: readonly string[];
}

const EMPTY: StoredPreferences = { version: 2, ...DEFAULT_PREFERENCES, recentFiles: [] };

/** The preferences that are on or off. */
const FLAGS = [
  'legendOpen',
  'selectionBar',
  'toolRailCollapsed',
  'partsFolded',
  'propertiesFolded',
  'updateCheck',
] as const;

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
  return fromRecord(raw as Record<string, unknown>);
}

function fromRecord(record: Record<string, unknown>): StoredPreferences {
  const flag = (key: (typeof FLAGS)[number]): boolean =>
    typeof record[key] === 'boolean' ? record[key] : DEFAULT_PREFERENCES[key];

  // Version 1 wrote `legendOpen: false` out whenever any preference changed,
  // so a stored false cannot be told from the old default (U.10, R-09). A
  // version 1 file — the version absent, or 1 — takes the new default; version
  // 2 records a real choice, and a newer version's is honoured too.
  const storedVersion = typeof record['version'] === 'number' ? record['version'] : 1;
  const legendOpen = storedVersion >= 2 ? flag('legendOpen') : DEFAULT_PREFERENCES.legendOpen;

  const recent = Array.isArray(record['recentFiles'])
    ? record['recentFiles'].filter(isProjectPath)
    : [];
  // A file from before My tools has no list, and starts from the starter
  // irons; a list the maker emptied stays empty.
  const irons = readIrons(record['irons']) ?? DEFAULT_PREFERENCES.irons;
  const thickness = record['leatherThicknessMm'];

  return {
    version: 2,
    legendOpen,
    // Absent before U.17: on, the default.
    selectionBar: flag('selectionBar'),
    toolRailCollapsed: flag('toolRailCollapsed'),
    partsFolded: flag('partsFolded'),
    propertiesFolded: flag('propertiesFolded'),
    // Absent before 8.9: on, the default.
    updateCheck: flag('updateCheck'),
    // A language this version does not support — one chosen in a newer
    // version, or a preview tried in `pnpm dev` — follows the system rather
    // than stopping the app starting.
    language: isLanguagePreference(record['language'])
      ? record['language']
      : DEFAULT_PREFERENCES.language,
    irons,
    defaultIronId: defaultAmong(irons, record['defaultIronId']),
    stitchMarginMm: readLength(record['stitchMarginMm']) ?? DEFAULT_PREFERENCES.stitchMarginMm,
    leatherThicknessMm: thickness === null ? null : (readLength(thickness) ?? null),
    // Each key the maker changed, kept only if this version can use it (U.12).
    keyBindings: readBindings(record['keyBindings'], IS_MAC),
    recentFiles: [...new Set(recent)].slice(0, RECENT_LIMIT),
  };
}

/** A length a maker could have typed: finite, above zero, on the storage grid. */
function readLength(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? quantise(value)
    : undefined;
}

/**
 * The usable irons of a list, tidied, or `undefined` when it is not a list.
 * Each needs an id not seen before, a name, and a pitch that is a length; the
 * domain's own floor is the field's and the hole set's to enforce.
 */
function readIrons(value: unknown): Iron[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const irons: Iron[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, name, pitchMm } = entry as Record<string, unknown>;
    const pitch = readLength(pitchMm);
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    if (typeof name !== 'string' || name.trim() === '' || pitch === undefined) continue;
    seen.add(id);
    irons.push({ id, name: name.trim(), pitchMm: pitch });
  }
  return irons;
}

/** The default iron: the one named, if the maker still has it, else the first. */
function defaultAmong(irons: readonly Iron[], id: unknown): string | null {
  return irons.find((iron) => iron.id === id)?.id ?? irons[0]?.id ?? null;
}

/** Only the changes that are preferences, and of the right type. */
export function validChanges(changes: unknown): Partial<Preferences> {
  if (typeof changes !== 'object' || changes === null) return {};
  const record = changes as Record<string, unknown>;
  const out: { -readonly [K in keyof Preferences]?: Preferences[K] } = {};
  for (const key of FLAGS) {
    const value = record[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  if (isLanguagePreference(record['language'])) out.language = record['language'];
  const irons = readIrons(record['irons']);
  if (irons !== undefined) out.irons = irons;
  if (typeof record['defaultIronId'] === 'string' || record['defaultIronId'] === null)
    out.defaultIronId = record['defaultIronId'];
  const margin = readLength(record['stitchMarginMm']);
  if (margin !== undefined) out.stitchMarginMm = margin;
  const thickness = record['leatherThicknessMm'];
  const thicknessMm = readLength(thickness);
  if (thickness === null) out.leatherThicknessMm = null;
  else if (thicknessMm !== undefined) out.leatherThicknessMm = thicknessMm;
  if (record['keyBindings'] !== undefined) {
    out.keyBindings = readBindings(record['keyBindings'], IS_MAC);
  }
  return out;
}

/** A path the recent list may hold: an absolute path to a project file. */
export function isProjectPath(path: unknown): path is string {
  return typeof path === 'string' && isAbsolute(path) && extname(path).toLowerCase() === '.lcp';
}

/**
 * A path as the maker reads it (8.7): the home directory as `~`, and only the
 * home directory itself — not a sibling whose name starts the same.
 */
export function shownPath(path: string, home: string): string {
  return home !== '' && path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
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
    const { version: _version, recentFiles: _recent, ...preferences } = this.stored;
    return preferences;
  }

  get recentFiles(): readonly string[] {
    return this.stored.recentFiles;
  }

  update(changes: unknown): Promise<void> {
    // Read back as the file would be, so the default stays on an iron the
    // maker still has whichever fields the change carried.
    return this.replace(fromRecord({ ...this.stored, ...validChanges(changes) }));
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
