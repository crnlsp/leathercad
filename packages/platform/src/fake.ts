import {
  DEFAULT_PREFERENCES,
  type MenuAction,
  type OpenDialogOptions,
  type PaperMenuChoice,
  type PlatformHost,
  type Preferences,
  type RecoveredCopy,
  type SaveDialogOptions,
} from './host.js';

/**
 * A PlatformHost backed by a Map. Used by every test that would otherwise need
 * a filesystem or a window.
 *
 * Dialog results are scripted rather than prompted: push paths onto
 * `nextOpenPaths` / `nextSavePaths` and the corresponding call shifts one off.
 * An empty queue means the user cancelled, which is the case tests most often
 * forget to cover.
 */
export class InMemoryPlatformHost implements PlatformHost {
  readonly files = new Map<string, Uint8Array>();

  readonly nextOpenPaths: string[] = [];
  readonly nextSavePaths: string[] = [];

  /** Every dialog request, in order, so tests can assert on filters. */
  readonly dialogCalls: Array<
    { kind: 'open'; options: OpenDialogOptions } | { kind: 'save'; options: SaveDialogOptions }
  > = [];

  /** Paths passed to openInExternalViewer, in order. */
  readonly openedExternally: string[] = [];

  constructor(
    private readonly configDir = '/fake/config/leathercad',
    private readonly appVersion = '0.0.0-test',
  ) {}

  readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (data === undefined) {
      return Promise.reject(new Error(`ENOENT: no such file: ${path}`));
    }
    // Hand back a copy: a caller mutating the result must not corrupt the store.
    return Promise.resolve(Uint8Array.from(data));
  }

  writeFile(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, Uint8Array.from(data));
    return Promise.resolve();
  }

  showOpenDialog(options: OpenDialogOptions): Promise<string | null> {
    this.dialogCalls.push({ kind: 'open', options });
    return Promise.resolve(this.nextOpenPaths.shift() ?? null);
  }

  showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
    this.dialogCalls.push({ kind: 'save', options });
    return Promise.resolve(this.nextSavePaths.shift() ?? null);
  }

  openInExternalViewer(path: string): Promise<void> {
    this.openedExternally.push(path);
    return Promise.resolve();
  }

  getUserConfigDir(): Promise<string> {
    return Promise.resolve(this.configDir);
  }

  getAppVersion(): Promise<string> {
    return Promise.resolve(this.appVersion);
  }

  /** This session's recovery copy, if any. */
  recovery: Uint8Array | null = null;
  /** What `findRecovery` returns: a copy a crashed session left. */
  abandoned: RecoveredCopy | null = null;
  readonly resolved: Array<{ id: string; how: 'adopt' | 'corrupt' }> = [];

  writeRecovery(data: Uint8Array): Promise<void> {
    this.recovery = Uint8Array.from(data);
    return Promise.resolve();
  }

  clearRecovery(): Promise<void> {
    this.recovery = null;
    return Promise.resolve();
  }

  findRecovery(): Promise<RecoveredCopy | null> {
    return Promise.resolve(this.abandoned);
  }

  resolveRecovery(id: string, how: 'adopt' | 'corrupt'): Promise<void> {
    this.resolved.push({ id, how });
    if (this.abandoned?.id === id) this.abandoned = null;
    return Promise.resolve();
  }

  getRecoveryIntervalMs(): Promise<number> {
    return Promise.resolve(60_000);
  }

  private readonly menuListeners = new Set<(action: MenuAction) => void>();

  onMenuAction(listener: (action: MenuAction) => void): () => void {
    this.menuListeners.add(listener);
    return () => this.menuListeners.delete(listener);
  }

  /** A test choosing an item from the application menu. */
  chooseMenu(action: MenuAction): void {
    for (const listener of this.menuListeners) listener(action);
  }

  /** The preferences as the app last kept them. */
  preferences: Preferences = DEFAULT_PREFERENCES;

  getPreferences(): Promise<Preferences> {
    return Promise.resolve(this.preferences);
  }

  setPreferences(changes: Partial<Preferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...changes };
    return Promise.resolve();
  }

  /** *File › Open Recent*, most recent first. */
  readonly recentFiles: string[] = [];

  noteRecentFile(path: string): Promise<void> {
    const at = this.recentFiles.indexOf(path);
    if (at !== -1) this.recentFiles.splice(at, 1);
    this.recentFiles.unshift(path);
    return Promise.resolve();
  }

  private readonly openFileListeners = new Set<(path: string) => void>();

  onOpenFile(listener: (path: string) => void): () => void {
    this.openFileListeners.add(listener);
    return () => this.openFileListeners.delete(listener);
  }

  /** A test choosing a project from *Open Recent*. */
  openFile(path: string): void {
    for (const listener of this.openFileListeners) listener(path);
  }

  /** What `readSampleProject` returns; empty until a test sets it. */
  sampleProject: Uint8Array = new Uint8Array();

  readSampleProject(): Promise<Uint8Array> {
    return Promise.resolve(Uint8Array.from(this.sampleProject));
  }

  /** The project the launch names, taken once. */
  launchFile: string | null = null;

  takeLaunchFile(): Promise<string | null> {
    const file = this.launchFile;
    this.launchFile = null;
    return Promise.resolve(file);
  }

  /** The Paper menu as the app last described it. */
  paperMenu: readonly PaperMenuChoice[] = [];

  setPaperMenu(choices: readonly PaperMenuChoice[]): Promise<void> {
    this.paperMenu = choices;
    return Promise.resolve();
  }
}
