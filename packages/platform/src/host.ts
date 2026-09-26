/** A file-type filter shown in a native open/save dialog. */
export interface FileFilter {
  /** Human-readable label, e.g. "LeatherCAD project". */
  name: string;
  /** Extensions without the leading dot, e.g. ["lcp"]. */
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

/**
 * Everything the application is allowed to ask of the operating system.
 *
 * Implementations: `apps/desktop` over Electron IPC, and `InMemoryPlatformHost`
 * for tests. Application code depends on this interface only.
 */
export interface PlatformHost {
  /** Reads a file. Rejects if it does not exist. */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Writes a file, creating parent directories as needed.
   *
   * Implementations must write to a temporary file and rename over the target,
   * so a crash mid-write cannot truncate a user's project. See
   * docs/file-format.md §7.
   */
  writeFile(path: string, data: Uint8Array): Promise<void>;

  /** Returns the chosen path, or null if the user cancelled. */
  showOpenDialog(options: OpenDialogOptions): Promise<string | null>;

  /** Returns the chosen path, or null if the user cancelled. */
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;

  /** Opens a file in the system's default application. */
  openInExternalViewer(path: string): Promise<void>;

  /**
   * Directory for application preferences — theme, recent files, printer
   * calibration. Never for project data. See docs/file-format.md §6.
   */
  getUserConfigDir(): Promise<string>;

  /** The running application version, for the about box and file manifests. */
  getAppVersion(): Promise<string>;

  /**
   * Crash recovery (slice 5.3b). Replaces this session's recovery copy with
   * `data`, atomically, in the app's state directory — never beside a project,
   * never under a project's name.
   */
  writeRecovery(data: Uint8Array): Promise<void>;

  /** Removes this session's recovery copy: the project is saved, or empty. */
  clearRecovery(): Promise<void>;

  /** The newest copy a session that did not end cleanly left behind, or null. */
  findRecovery(): Promise<RecoveredCopy | null>;

  /**
   * Answers for a found copy. `adopt` keeps it on disk until this session
   * exits cleanly — *Not now*, or recovered and re-copied. `corrupt` sets it
   * aside because it did not load.
   */
  resolveRecovery(id: string, how: 'adopt' | 'corrupt'): Promise<void>;

  /** How often to write a recovery copy while there is unsaved work, in ms. */
  getRecoveryIntervalMs(): Promise<number>;

  /**
   * Listens for a choice from the application menu (slice 8.5a). The menu
   * belongs to the operating system; what each item does belongs to the
   * renderer, which runs the same handler its keyboard shortcut does. Returns
   * the way to stop listening.
   */
  onMenuAction(listener: (action: MenuAction) => void): () => void;

  /**
   * The maker's preferences (slice 8.2), from `preferences.json` in the config
   * directory. Never project data, and never in the project file: a
   * preference is how this person likes the app, not part of a pattern.
   */
  getPreferences(): Promise<Preferences>;

  /** Changes some preferences and keeps them for the next launch. */
  setPreferences(changes: Partial<Preferences>): Promise<void>;

  /**
   * Adds a project to *File › Open Recent*, most recent first. Only a project
   * the maker opened or saved through the app's own dialogs is taken.
   */
  noteRecentFile(path: string): Promise<void>;

  /**
   * Listens for a project the operating system side asks the app to open —
   * *File › Open Recent* (8.2). The path is already one the app may read and
   * write; the renderer asks about unsaved work first, as for *Open*. Returns
   * the way to stop listening.
   */
  onOpenFile(listener: (path: string) => void): () => void;

  /**
   * The worked sample project that ships with the app (slice 8.3), as the
   * bytes of an ordinary `.lcp`. Read-only: it opens untitled, so saving it
   * asks where, and the copy inside the app is never written.
   */
  readSampleProject(): Promise<Uint8Array>;

  /**
   * The project this launch was asked to open — a `.lcp` double-clicked in
   * the file manager (slice 8.5) — once, or null. Already a path the app may
   * read and write. Asked for by the renderer when it is ready, so the answer
   * cannot arrive before anything is listening for it; a project the system
   * hands over later (macOS's *open-file*) comes through `onOpenFile`.
   */
  takeLaunchFile(): Promise<string | null>;
}

/** How the maker likes the app (slice 8.2). None of it is the document's. */
export interface Preferences {
  /** Whether the canvas legend is open, rather than a strip of marks. */
  readonly legendOpen: boolean;
  /** Whether the tool rail is collapsed to icons on a wide window. */
  readonly toolRailCollapsed: boolean;
}

/** What a first launch starts with, and what a damaged file falls back to. */
export const DEFAULT_PREFERENCES: Preferences = {
  legendOpen: false,
  toolRailCollapsed: false,
};

/** What the application menu can ask the renderer to do. */
export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export-pdf'
  | 'undo'
  | 'redo'
  | 'view-design'
  | 'view-sheets'
  | 'shortcuts'
  | 'open-sample';

/** A recovery copy found at startup. */
export interface RecoveredCopy {
  /** Which session wrote it; the handle for `resolveRecovery`. */
  readonly id: string;
  /** When it was last written, ISO 8601. */
  readonly savedAt: string;
  /** An ordinary `.lcp`, validated by `loadProject` like any other. */
  readonly data: Uint8Array;
}
