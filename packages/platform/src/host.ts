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
 * Implemented by `apps/desktop` over Electron IPC. Application code depends on
 * this interface only.
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
   * The printers the app can print to itself (7.6): through the system's CUPS
   * client, which is told not to scale. Unavailable where there is none to
   * drive — Windows, the Flatpak, a system without CUPS — and the app saves a
   * PDF instead. See docs/printing.md §13.
   */
  listPrinters(): Promise<PrinterList>;

  /**
   * Sends a PDF to a printer from `listPrinters`, exactly as given, with
   * scaling turned off. Resolves with the print system's name for the job;
   * rejects with what it said when it refused.
   */
  printPdf(data: Uint8Array, job: PrintJob): Promise<string>;

  /**
   * Directory for application preferences — theme, recent files, printer
   * calibration. Never for project data. See docs/file-format.md §6.
   */
  getUserConfigDir(): Promise<string>;

  /** The running application version, for the about box and file manifests. */
  getAppVersion(): Promise<string>;

  /**
   * Whether the window holds unsaved work (U.7): macOS draws the dot in the
   * close button and asks before closing the window from the Dock. Elsewhere
   * the window title's leading dot says it, and this does nothing.
   */
  setDocumentEdited(edited: boolean): Promise<void>;

  /**
   * Whether Settings is listening for a new key (U.12). While it is, the main
   * process leaves the keys it hears before any field — Full screen, Quit,
   * the developer tools — to the renderer, so they can be given to a command.
   */
  setKeyCapture(capturing: boolean): Promise<void>;

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
   * Listens for a choice from macOS's native menu (8.5a, 8.7) — Linux and
   * Windows have none. The menu belongs to the operating system; what each
   * item does belongs to the renderer, which runs the same handler its key and
   * its button run. Returns the way to stop listening.
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
   * The operating system's languages, most preferred first, as BCP 47 tags
   * (`pl-PL`, `en-GB`). What *Follow system* follows (ADR 0018).
   */
  getSystemLanguages(): Promise<readonly string[]>;

  /**
   * Adds a project to the recent projects, most recent first. Only a project
   * the maker opened or saved through the app's own dialogs is taken.
   */
  noteRecentFile(path: string): Promise<void>;

  /** The recent projects (8.2), most recent first, as the Project menu lists them (8.7). */
  getRecentFiles(): Promise<readonly RecentFile[]>;

  /**
   * Opens a project from the recent list (8.7). The main process opens only a
   * path on its own list: it grants it and hands it back through
   * `onOpenFile`, so unsaved work is asked about as for *Open* — `opening`.
   * One that is `gone` is taken off the list, for the app to tell the maker
   * why in its own dialog (U.20). A path not on the list is `unlisted`, and
   * nothing happens.
   */
  openRecent(path: string): Promise<RecentOutcome>;

  /** Empties the recent list, and the operating system's (8.7). */
  clearRecent(): Promise<void>;

  /** Opens the folder the log is in, to attach to a report (ADR 0015). */
  showLogFolder(): Promise<void>;

  /**
   * The licences of what the app ships (8.6b), as the text the build wrote,
   * for About to show (U.20); null in a development build, which writes none.
   */
  readNotices(): Promise<string | null>;

  /**
   * Listens for a project the operating system side asks the app to open —
   * one of the recent projects (8.2, 8.7), or a file macOS hands over. The path is already one the app may read and
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

  /**
   * What the update check found (8.9): the last one the maker asked for,
   * waited for while it runs. `idle` when nothing has asked this session.
   */
  getUpdateStatus(): Promise<UpdateStatus>;

  /**
   * Asks GitHub for the latest release now (8.9) — only ever because the
   * maker pressed something — and resolves with what it found. Installs nothing.
   */
  checkForUpdates(): Promise<UpdateStatus>;

  /**
   * The projects open in tabs when the app last closed (8.12), in their
   * order, and the one that was showing — those still on disk, already paths
   * the app may read and write. Once, as the window starts; empty after.
   */
  takeSession(): Promise<OpenSession>;

  /**
   * Keeps the projects open in tabs, for the next start (8.12). Only paths
   * chosen in the app's dialogs this session, or opened again from the last,
   * are kept; any other is dropped.
   */
  keepSession(projects: readonly string[], active: string | null): Promise<void>;

  /**
   * Renames a project's file to its new name, in the same folder (8.12) —
   * never over another file, which comes back as `exists` with nothing
   * touched. Only a file the app may write; the new path may be too.
   */
  renameProjectFile(path: string, name: string): Promise<FileRename>;

  /** Shows a project's file in the system's file manager, selected (8.12). */
  showInFolder(path: string): Promise<void>;

  /**
   * Moves a project's file to the system's Trash (8.12), where it can be
   * restored — never deleted outright. Only a file the app may write.
   */
  trashProjectFile(path: string): Promise<void>;
}

/** What renaming a project's file came to (8.12). */
export type FileRename =
  | { readonly kind: 'renamed' | 'unchanged'; readonly path: string }
  /** Another file in the folder has the name: nothing was touched. */
  | { readonly kind: 'exists'; readonly file: string }
  /** No file can have the name. */
  | { readonly kind: 'invalid' };

/** The tabs a start opens again (8.12). */
export interface OpenSession {
  readonly projects: readonly string[];
  readonly active: string | null;
}

/**
 * Whether a newer LeatherCAD has been released (8.9) — a fact, which the app
 * words. `managed`: something else keeps this copy up to date (the Flatpak,
 * Flathub), so the app never asks. `failed` covers no network, GitHub
 * refusing and an answer that could not be read: none of them is news.
 */
export type UpdateStatus =
  | { readonly state: 'idle' }
  | ({ readonly state: 'current' } & UpdateAnswer)
  | ({
      readonly state: 'available';
      /** As `X.Y.Z`. */
      readonly version: string;
      /** The release's page, where its notes and downloads are. */
      readonly url: string;
    } & UpdateAnswer)
  | { readonly state: 'failed' }
  | { readonly state: 'managed' };

/**
 * When an answer came, and when the app will ask again (8.9). Until `againAt`
 * a press reads this answer back rather than asking: GitHub is not asked twice
 * in five minutes. A failed check has neither, so it can be tried again at once.
 * Both are milliseconds since the epoch, by the main process's clock.
 */
export interface UpdateAnswer {
  readonly checkedAt: number;
  readonly againAt: number;
}

/** What `listPrinters` found (7.6). */
export type PrinterList =
  | {
      readonly available: true;
      readonly printers: readonly Printer[];
      /** The system's default, when it has one and it is in `printers`. */
      readonly defaultPrinter: string | null;
    }
  | {
      readonly available: false;
      /** `platform`: not done here yet (Windows). `no-cups`: no CUPS client to drive. */
      readonly reason: 'platform' | 'no-cups';
    };

/** A print queue, as the system names it. */
export interface Printer {
  readonly name: string;
  /**
   * The paper sizes it offers, as the system names them (`A4`, `Letter`), or
   * null when it does not say — a printer found on the network that has not
   * printed yet.
   */
  readonly papers: readonly string[] | null;
}

/** One print job. Scaling is not an option: it is always off. */
export interface PrintJob {
  readonly printer: string;
  /** The paper the PDF was laid out on, by the name the app gives it. */
  readonly paper: string;
  /** Which of the PDF's pages, counted from 1. */
  readonly pages: readonly number[];
  readonly copies: number;
  /** What the job is called in the print queue: the project's name. */
  readonly title: string;
}

/** What became of a recent project asked for (8.7, U.20). */
export type RecentOutcome = 'opening' | 'gone' | 'unlisted';

/** A project on the recent list (8.7). */
export interface RecentFile {
  /** Absolute: what `openRecent` is given back. */
  readonly path: string;
  /** As the maker reads it, with the home directory as `~`. */
  readonly shown: string;
}

/** How the maker likes the app (slice 8.2). None of it is the document's. */
export interface Preferences {
  /**
   * Whether the canvas legend is open, showing names, rather than its chip
   * (U.10, R-09). Open by default; a window too small for it folds it to the
   * chip for the session, and that fold never reaches this file.
   */
  readonly legendOpen: boolean;
  /**
   * Whether the selection bar shows under the selected piece (U.17, R-14):
   * its stitching, and the next step. On by default; off, it is not drawn and
   * its key does nothing.
   */
  readonly selectionBar: boolean;
  /** Whether the tool rail is collapsed to icons on a wide window. */
  readonly toolRailCollapsed: boolean;
  /**
   * Whether the maker folded Parts, or Properties, to its strip (U.5). Where
   * the window has the room to dock it: a narrow window folds a panel by
   * itself, and never writes this.
   */
  readonly partsFolded: boolean;
  readonly propertiesFolded: boolean;
  /**
   * The interface's language (ADR 0018): `system` to follow the operating
   * system, or the tag of a language the app supports, such as `en`. The app's
   * words only — a project reads the same in every language.
   */
  readonly language: string;
  /**
   * The pricking irons the maker owns, in their order (U.13): what a hole
   * set's Iron menu offers. A hole set stores the pitch and the iron's name it
   * was made with, never a reference to this list, so a project opens the same
   * on a machine with other irons.
   */
  readonly irons: readonly Iron[];
  /** The iron a new hole set takes: one of `irons`, or `null` when there are none. */
  readonly defaultIronId: string | null;
  /**
   * How far in from the edge the app starts a new stitch line, and how far out
   * it grows a new seam allowance — one margin, as the project's own setting
   * is (`settings.defaultStitchInsetMm`), which it is passed in place of.
   */
  readonly stitchMarginMm: number;
  /**
   * Written into each new fold (U.13). `null` until the maker sets one: a
   * thickness is a measurement of their leather, and none is invented.
   */
  readonly leatherThicknessMm: number | null;
  /**
   * The keys the maker changed in Settings › Keyboard shortcuts (U.12), by
   * the app's command id: each one's keys in place of its defaults. Only what
   * differs is kept, so a new default reaches a command the maker never moved.
   */
  readonly keyBindings: Readonly<Record<string, readonly KeyBinding[]>>;
}

/**
 * A key, as the app's keymap binds it: by its place on the keyboard
 * (`KeyboardEvent.code`) and the modifiers held — `mod` is Ctrl, or ⌘ on
 * macOS — or by the character it types.
 */
export type KeyBinding =
  | {
      readonly code: string;
      readonly mod?: boolean;
      readonly shift?: boolean;
      readonly alt?: boolean;
    }
  | { readonly char: string; readonly mod?: boolean };

/** A pricking iron, by the name the maker gives it and the pitch stamped on it. */
export interface Iron {
  readonly id: string;
  readonly name: string;
  readonly pitchMm: number;
}

/**
 * The irons a first launch lists, so nothing a maker picked before My tools
 * existed disappears; they delete what they do not own. The names are the ones
 * hole sets already carry.
 */
export const STARTER_IRONS: readonly Iron[] = [
  { id: 'ks-3.85', name: 'KS Blade 3.85 mm', pitchMm: 3.85 },
  { id: 'ks-3.38', name: 'KS Blade 3.38 mm', pitchMm: 3.38 },
  { id: 'ks-3.0', name: 'KS Blade 3.0 mm', pitchMm: 3.0 },
  { id: 'crimson-3.85', name: 'Crimson Hides 3.85 mm', pitchMm: 3.85 },
  { id: 'crimson-3.0', name: 'Crimson Hides 3.0 mm', pitchMm: 3.0 },
  { id: 'amy-roke-3.0', name: 'Amy Roke 3.0 mm', pitchMm: 3.0 },
  { id: 'amy-roke-2.7', name: 'Amy Roke 2.7 mm', pitchMm: 2.7 },
];

/** What a first launch starts with, and what a damaged file falls back to. */
export const DEFAULT_PREFERENCES: Preferences = {
  legendOpen: true,
  selectionBar: true,
  toolRailCollapsed: false,
  partsFolded: false,
  propertiesFolded: false,
  language: 'system',
  irons: STARTER_IRONS,
  defaultIronId: 'ks-3.85',
  stitchMarginMm: 3.5,
  leatherThicknessMm: null,
  keyBindings: {},
};

/** What macOS's native menu can ask the renderer to do (8.7). */
export type MenuAction = 'undo' | 'redo' | 'about' | 'settings';

/** A recovery copy found at startup. */
export interface RecoveredCopy {
  /** Which session wrote it; the handle for `resolveRecovery`. */
  readonly id: string;
  /** When it was last written, ISO 8601. */
  readonly savedAt: string;
  /** An ordinary `.lcp`, validated by `loadProject` like any other. */
  readonly data: Uint8Array;
}
